// daily-run: invoked by pg_cron (see migrations/004_daily_schedule.sql) or
// manually by a signed-in user from Settings.
// 1. fetch due active sources  2. parse + save (duplicates ignored)
// 3. evaluate past predictions  4. snapshot analytics  5. predict upcoming draws
import { corsHeaders, json, errorResponse } from '../_shared/http.js';
import { createAdminClient, authorize } from '../_shared/supabase.js';
import { fetchSourceAndIngest, evaluatePendingPredictions, refreshAnalyticsAndPredictions, makeFetcher } from '../_shared/pipeline.js';

function isDue(source, now = Date.now()) {
  if (source.fetch_frequency === 'manual') return false;
  if (!source.last_fetched_at) return true;
  const ageHours = (now - new Date(source.last_fetched_at).getTime()) / 3600000;
  return source.fetch_frequency === 'weekly' ? ageHours >= 6 * 24 : ageHours >= 12;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = createAdminClient();
  const caller = await authorize(req, admin);
  if (!caller) return errorResponse('Unauthorized', 401);

  const trigger = caller.kind === 'cron' ? 'schedule' : 'manual';
  const report = { startedAt: new Date().toISOString(), trigger, sources: [], evaluation: null, lotteries: [], errors: [] };

  try {
    const { data: sources, error } = await admin.from('lottery_sources').select('*').eq('active', true);
    if (error) throw new Error(error.message);
    const fetcher = makeFetcher();
    for (const source of sources) {
      if (trigger === 'schedule' && !isDue(source)) {
        report.sources.push({ id: source.id, name: source.name, skipped: 'not due' });
        continue;
      }
      const r = await fetchSourceAndIngest(admin, source, { trigger: trigger === 'schedule' ? 'schedule' : 'manual', fetcher });
      report.sources.push({ id: source.id, name: source.name, ok: r.ok, error: r.error ?? null, saved: r.saved ?? null });
    }
  } catch (e) {
    report.errors.push(`sources: ${e.message}`);
  }

  try {
    report.evaluation = await evaluatePendingPredictions(admin);
  } catch (e) {
    report.errors.push(`evaluation: ${e.message}`);
  }

  try {
    report.lotteries = await refreshAnalyticsAndPredictions(admin);
  } catch (e) {
    report.errors.push(`predictions: ${e.message}`);
  }

  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report));
  return json({ ok: report.errors.length === 0, report });
});
