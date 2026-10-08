import { getSupabase, unwrap } from './supabaseClient.js';

export async function savePredictions(rows) {
  return unwrap(
    await getSupabase()
      .from('predictions')
      .upsert(rows, { onConflict: 'lottery_name,prize_category,target_draw_date,model_name' })
      .select(),
  );
}

export async function listPredictions({ lottery, evaluated, limit = 200 } = {}) {
  let q = getSupabase().from('predictions').select('*').order('target_draw_date', { ascending: false }).limit(limit);
  if (lottery) q = q.eq('lottery_name', lottery);
  if (evaluated !== undefined) q = q.eq('evaluated', evaluated);
  return unwrap(await q);
}

export async function predictionCounts() {
  const sb = getSupabase();
  const [all, evaluated] = await Promise.all([
    sb.from('predictions').select('id', { count: 'exact', head: true }),
    sb.from('predictions').select('id', { count: 'exact', head: true }).eq('evaluated', true),
  ]);
  if (all.error) throw new Error(all.error.message);
  return { total: all.count ?? 0, evaluated: evaluated.count ?? 0 };
}

export async function saveBacktestRun(run) {
  return unwrap(await getSupabase().from('prediction_runs').insert(run).select().single());
}

export async function listBacktestRuns({ lottery, limit = 50 } = {}) {
  let q = getSupabase().from('prediction_runs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (lottery) q = q.eq('lottery_name', lottery);
  return unwrap(await q);
}

export async function deleteBacktestRun(id) {
  return unwrap(await getSupabase().from('prediction_runs').delete().eq('id', id));
}
