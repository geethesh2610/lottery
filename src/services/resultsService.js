import { getSupabase, unwrap } from './supabaseClient.js';

export async function listLotteries() {
  return unwrap(await getSupabase().rpc('list_lotteries'));
}

export async function listPrizeCategories(lottery = null) {
  return unwrap(await getSupabase().rpc('list_prize_categories', { p_lottery: lottery }));
}

function applyFilters(q, f = {}) {
  if (f.lottery) q = q.eq('lottery_name', f.lottery);
  if (f.prize) q = q.eq('prize_category', f.prize);
  if (f.from) q = q.gte('draw_date', f.from);
  if (f.to) q = q.lte('draw_date', f.to);
  if (f.search) {
    const s = f.search.trim().replace(/[%,()]/g, '');
    if (s) q = q.or(`winning_number.ilike.%${s}%,draw_code.ilike.%${s}%,lottery_name.ilike.%${s}%`);
  }
  return q;
}

const SORTABLE = new Set(['draw_date', 'lottery_name', 'draw_code', 'prize_rank', 'winning_number']);

/** Server-side paginated query of the results view. */
export async function queryResults({ filters, page = 0, pageSize = 25, sortBy = 'draw_date', sortDir = 'desc' }) {
  const col = SORTABLE.has(sortBy) ? sortBy : 'draw_date';
  let q = getSupabase().from('v_results').select('*', { count: 'exact' });
  q = applyFilters(q, filters)
    .order(col, { ascending: sortDir === 'asc' })
    .order('prize_rank', { ascending: true })
    .order('winning_number', { ascending: true })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, count } = unwrap(await q);
  return { rows: data, total: count ?? 0 };
}

/** All rows matching filters (paged in 1000-row chunks). */
export async function fetchAllResults(filters, { columns = '*', onProgress } = {}) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const q = applyFilters(getSupabase().from('v_results').select(columns), filters)
      .order('draw_date', { ascending: true })
      .order('prize_rank', { ascending: true })
      .order('winning_number', { ascending: true })
      .range(from, from + size - 1);
    const data = unwrap(await q);
    out.push(...data);
    onProgress?.(out.length);
    if (data.length < size) break;
  }
  return out;
}

/** { draw_date, number } entries for analytics / models. */
export async function loadEntries(lottery, prize) {
  const rows = await fetchAllResults({ lottery, prize }, { columns: 'draw_date, normalized_number, winning_number' });
  return rows.map((r) => ({ draw_date: r.draw_date, number: r.normalized_number }));
}

/** Imports validated CSV draws through the idempotent ingest_draw RPC. */
export async function importDraws(draws, { onProgress } = {}) {
  const totals = { draws: 0, inserted: 0, duplicates: 0, errors: [] };
  for (const [i, draw] of draws.entries()) {
    const { data, error } = await getSupabase().rpc('ingest_draw', { p_source_id: null, p_draw: draw, p_import_method: 'csv' });
    if (error) totals.errors.push(`${draw.lottery_name} ${draw.draw_date}: ${error.message}`);
    else {
      totals.draws += 1;
      totals.inserted += data.inserted;
      totals.duplicates += data.duplicates;
    }
    onProgress?.({ done: i + 1, total: draws.length, ...totals });
  }
  return totals;
}

export async function recentDraws(limit = 10) {
  return unwrap(
    await getSupabase()
      .from('v_results')
      .select('draw_date, lottery_name, draw_code, winning_number')
      .eq('prize_category', '1st Prize')
      .order('draw_date', { ascending: false })
      .limit(limit),
  );
}
