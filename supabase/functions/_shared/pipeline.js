// Server-side pipeline: fetch -> parse -> validate -> store -> evaluate -> predict.
// Uses the shared core copied from src/ (see scripts/sync-shared.js).
import { createFetcher, getParserForUrl } from './core/parsers/index.js';
import { analyzeEntries } from './core/analytics/index.js';
import { buildPredictionRows, evaluatePredictionRow } from './core/prediction/index.js';
import { DEFAULT_PRIZE } from './core/constants/prizes.js';
import { todayIso } from './core/utils/dates.js';

export function makeFetcher() {
  return createFetcher({ minDelayMs: 1500, timeoutMs: 20000 });
}

/** Writes one parsed draw through the idempotent ingest_draw RPC. */
export async function ingestParsed(admin, sourceId, parsed, importMethod = 'scrape') {
  const { data, error } = await admin.rpc('ingest_draw', {
    p_source_id: sourceId,
    p_draw: {
      lottery_name: parsed.lottery_name,
      lottery_code: parsed.lottery_code,
      draw_code: parsed.draw_code,
      draw_date: parsed.draw_date,
      source_url: parsed.source_url,
      results: parsed.results,
    },
    p_import_method: importMethod,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function logFetch(admin, entry) {
  const { error } = await admin.from('fetch_logs').insert(entry);
  if (error) console.error('fetch_logs insert failed', error.message);
}

export async function touchSource(admin, sourceId, success) {
  const now = new Date().toISOString();
  const patch = success ? { last_fetched_at: now, last_successful_fetch_at: now } : { last_fetched_at: now };
  await admin.from('lottery_sources').update(patch).eq('id', sourceId);
}

function lotteryMatches(source, parsed) {
  if (!source.lottery_name) return true;
  return source.lottery_name.toLowerCase().replace(/\s+/g, '') === String(parsed.lottery_name || '').toLowerCase().replace(/\s+/g, '');
}

/** Fetches + parses a URL without saving anything (used by "Test Source"). */
export async function previewUrl(url, lotteryNameHint, fetcher = makeFetcher()) {
  const page = await fetcher.fetchPage(url);
  if (!page.ok) return { ok: false, status: page.status, blocked: !!page.blocked, error: page.error };
  const parsed = getParserForUrl(url).parse(page.html, { url: page.url || url, lotteryNameHint });
  return { ok: true, status: page.status, parsed };
}

/** Fetches a source, saves new results, writes a fetch log. */
export async function fetchSourceAndIngest(admin, source, { trigger = 'manual', fetcher = makeFetcher() } = {}) {
  const page = await fetcher.fetchPage(source.url);
  if (!page.ok) {
    await logFetch(admin, {
      source_id: source.id, success: false, error_message: page.error, response_status: page.status, url: source.url, trigger,
    });
    await touchSource(admin, source.id, false);
    return { ok: false, error: page.error, status: page.status, blocked: !!page.blocked };
  }

  const parsed = getParserForUrl(source.url).parse(page.html, { url: page.url || source.url, lotteryNameHint: source.lottery_name });
  if (!parsed.valid) {
    await logFetch(admin, {
      source_id: source.id, success: false, records_found: parsed.results.length, invalid_numbers: parsed.invalid_numbers,
      parse_errors: parsed.errors, error_message: `Parsing failed: ${parsed.errors.join(' ')}`, response_status: page.status,
      url: source.url, trigger,
    });
    await touchSource(admin, source.id, false);
    return { ok: false, error: 'Parsing failed', parsed };
  }
  if (!lotteryMatches(source, parsed)) {
    const msg = `Page shows "${parsed.lottery_name}" but this source is configured for "${source.lottery_name}". Nothing saved.`;
    await logFetch(admin, {
      source_id: source.id, success: false, records_found: parsed.results.length, error_message: msg, response_status: page.status, url: source.url, trigger,
    });
    await touchSource(admin, source.id, false);
    return { ok: false, error: msg, parsed };
  }

  try {
    const saved = await ingestParsed(admin, source.id, parsed, 'scrape');
    await logFetch(admin, {
      source_id: source.id, success: true, records_found: parsed.results.length, records_inserted: saved.inserted,
      duplicates_skipped: saved.duplicates, invalid_numbers: parsed.invalid_numbers, parse_errors: parsed.warnings,
      response_status: page.status, url: source.url, trigger,
    });
    await touchSource(admin, source.id, true);
    return { ok: true, parsed, saved };
  } catch (e) {
    await logFetch(admin, {
      source_id: source.id, success: false, records_found: parsed.results.length, error_message: `Save failed: ${e.message}`,
      response_status: page.status, url: source.url, trigger,
    });
    await touchSource(admin, source.id, false);
    return { ok: false, error: e.message, parsed };
  }
}

/** Loads { draw_date, number } entries for a lottery + prize, paging past the 1000-row limit. */
export async function loadEntries(admin, lotteryName, prizeCategory = DEFAULT_PRIZE) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('v_results')
      .select('draw_date, normalized_number')
      .eq('lottery_name', lotteryName)
      .eq('prize_category', prizeCategory)
      .order('draw_date', { ascending: true })
      .order('winning_number', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...data.map((r) => ({ draw_date: r.draw_date, number: r.normalized_number })));
    if (data.length < pageSize) break;
  }
  return out;
}

export async function evaluatePendingPredictions(admin) {
  const today = todayIso();
  const { data: pending, error } = await admin
    .from('predictions')
    .select('*')
    .eq('evaluated', false)
    .lte('target_draw_date', today);
  if (error) throw new Error(error.message);
  const cache = new Map();
  let evaluated = 0;
  for (const p of pending) {
    const key = `${p.lottery_name}|${p.prize_category}`;
    if (!cache.has(key)) cache.set(key, await loadEntries(admin, p.lottery_name, p.prize_category));
    const patch = evaluatePredictionRow(p, cache.get(key));
    if (!patch) continue;
    const { error: upErr } = await admin.from('predictions').update(patch).eq('id', p.id);
    if (!upErr) evaluated += 1;
  }
  return { pending: pending.length, evaluated };
}

function compactAnalytics(report) {
  const pick = (d) => ({ pValue: d.test?.pValue ?? null, insufficient: !!d.test?.insufficient, rows: d.rows?.map((r) => [r.label, r.observed]) });
  return {
    length: report.length,
    firstDate: report.firstDate,
    lastDate: report.lastDate,
    digitFrequency: pick(report.digitFrequency),
    lastDigit: pick(report.lastDigit),
    digitSum: { ...pick(report.digitSum), summary: report.digitSum.summary, rows: undefined },
    oddEven: pick(report.oddEven),
    repeated: pick(report.repeated),
    positions: report.positionFrequency.positions.map((p) => ({ position: p.position, pValue: p.test.pValue })),
    multipleTesting: report.multipleTesting,
  };
}

/** Snapshots analytics and generates predictions for each lottery's next draw. */
export async function refreshAnalyticsAndPredictions(admin, { prizeCategory = DEFAULT_PRIZE } = {}) {
  const { data: lotteries, error } = await admin.rpc('list_lotteries');
  if (error) throw new Error(error.message);
  const report = [];
  for (const { lottery_name: lottery } of lotteries) {
    const entries = await loadEntries(admin, lottery, prizeCategory);
    if (!entries.length) continue;
    const analysis = analyzeEntries(entries);
    await admin.from('analytics_snapshots').insert({
      lottery_name: lottery, prize_category: prizeCategory, sample_size: analysis.sampleSize, summary: compactAnalytics(analysis),
    });
    const { targetDate, rows } = buildPredictionRows(lottery, prizeCategory, entries, { samples: 600, generatedBy: 'schedule' });
    let inserted = 0;
    if (rows.length) {
      const { data, error: insErr } = await admin
        .from('predictions')
        .upsert(rows, { onConflict: 'lottery_name,prize_category,target_draw_date,model_name', ignoreDuplicates: true })
        .select('id');
      if (insErr) console.error('prediction insert failed', insErr.message);
      inserted = data?.length ?? 0;
    }
    report.push({ lottery, sampleSize: analysis.sampleSize, targetDate, predictionsInserted: inserted });
  }
  return report;
}
