import { getSupabase, unwrap } from './supabaseClient.js';
import { fetchAllResults } from './resultsService.js';
import { findMissingDrawDates, monthKey, todayIso } from '../utils/dates.js';
import { prizeInfo } from '../constants/prizes.js';

export async function loadDashboardStats() {
  const sb = getSupabase();
  const [stats, sources, preds, evaluated] = await Promise.all([
    sb.from('v_lottery_stats').select('*'),
    sb.from('lottery_sources').select('last_successful_fetch_at').order('last_successful_fetch_at', { ascending: false, nullsFirst: false }).limit(1),
    sb.from('predictions').select('id', { count: 'exact', head: true }),
    sb.from('predictions').select('id', { count: 'exact', head: true }).eq('evaluated', true),
  ]);
  const lotteries = unwrap(stats);
  return {
    lotteries,
    trackedLotteries: lotteries.length,
    totalDraws: lotteries.reduce((a, l) => a + Number(l.draws), 0),
    totalResults: lotteries.reduce((a, l) => a + Number(l.results), 0),
    resultsThisMonth: lotteries.reduce((a, l) => a + Number(l.results_this_month), 0),
    lastSuccessfulFetch: unwrap(sources)[0]?.last_successful_fetch_at ?? null,
    predictionsGenerated: preds.count ?? 0,
    predictionsEvaluated: evaluated.count ?? 0,
  };
}

export async function loadDataQuality() {
  const sb = getSupabase();
  const [statsRes, healthRes, drawsRes, logsRes] = await Promise.all([
    sb.from('v_lottery_stats').select('*').order('lottery_name'),
    sb.from('v_source_health').select('*').order('name'),
    sb.from('lottery_draws').select('lottery_name, draw_date').order('draw_date').limit(20000),
    sb.from('fetch_logs').select('success, duplicates_skipped, invalid_numbers, parse_errors, error_message, fetched_at').order('fetched_at', { ascending: false }).limit(5000),
  ]);
  const lotteries = unwrap(statsRes);
  const sources = unwrap(healthRes);
  const draws = unwrap(drawsRes);
  const logs = unwrap(logsRes);

  const byLottery = new Map();
  for (const d of draws) {
    if (!byLottery.has(d.lottery_name)) byLottery.set(d.lottery_name, []);
    byLottery.get(d.lottery_name).push(d.draw_date);
  }
  const missing = [...byLottery.entries()].map(([lottery, dates]) => ({ lottery, missing: findMissingDrawDates(dates) }));

  // Stored rows are already constrained by the DB; re-check lengths per prize.
  const rows = await fetchAllResults({}, { columns: 'lottery_name, draw_date, prize_category, normalized_number' });
  const invalidStored = rows.filter((r) => {
    const expected = prizeInfo(r.prize_category)?.digits;
    return expected && r.normalized_number.length !== expected;
  });

  const failingSources = sources.filter((s) => s.active && s.last_fetch_success === false);
  const lastSuccess = sources.map((s) => s.last_successful_fetch_at).filter(Boolean).sort().pop() ?? null;
  const thisMonth = monthKey(todayIso());

  return {
    totalDraws: draws.length,
    lotteries,
    sources,
    failingSources,
    lastSuccess,
    missing,
    totalMissing: missing.reduce((a, m) => a + m.missing.length, 0),
    duplicateAttempts: logs.reduce((a, l) => a + (l.duplicates_skipped || 0), 0),
    parsingFailures: logs.filter((l) => !l.success && /pars/i.test(l.error_message || '')).length,
    fetchFailures: logs.filter((l) => !l.success).length,
    invalidNumbersRejected: logs.reduce((a, l) => a + (l.invalid_numbers || 0), 0),
    invalidStored,
    drawsThisMonth: draws.filter((d) => monthKey(d.draw_date) === thisMonth).length,
  };
}
