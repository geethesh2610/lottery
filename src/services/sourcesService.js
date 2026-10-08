import { getSupabase, unwrap } from './supabaseClient.js';
import { invokeFunction } from './functionsService.js';
import { normalizeLotteryName } from '../utils/text.js';

export async function listSources() {
  return unwrap(await getSupabase().from('v_source_health').select('*').order('name'));
}

export async function getSource(id) {
  return unwrap(await getSupabase().from('lottery_sources').select('*').eq('id', id).single());
}

function cleanSource(input) {
  return {
    name: input.name.trim(),
    url: input.url.trim(),
    lottery_name: input.lottery_name?.trim() ? normalizeLotteryName(input.lottery_name) : null,
    lottery_code: input.lottery_code?.trim() || null,
    fetch_frequency: input.fetch_frequency || 'daily',
    active: input.active ?? true,
  };
}

export async function createSource(input) {
  return unwrap(await getSupabase().from('lottery_sources').insert(cleanSource(input)).select().single());
}

export async function updateSource(id, patch) {
  return unwrap(await getSupabase().from('lottery_sources').update(patch).eq('id', id).select().single());
}

export async function deleteSource(id) {
  return unwrap(await getSupabase().from('lottery_sources').delete().eq('id', id));
}

/** Server-side fetch + parse of a URL without saving (Test Source). */
export function previewSource(url, lotteryName) {
  return invokeFunction('fetch-lottery', { action: 'preview', url, lottery_name: lotteryName || null });
}

export function fetchSourceNow(sourceId) {
  return invokeFunction('fetch-lottery', { action: 'fetch', source_id: sourceId });
}

export function importStep(sourceId, state, { maxPages = 100, pagesPerStep = 5 } = {}) {
  return invokeFunction('fetch-lottery', {
    action: 'import',
    source_id: sourceId,
    state,
    max_pages: maxPages,
    pages_per_step: pagesPerStep,
  });
}

export async function listFetchLogs(sourceId, limit = 50) {
  let q = getSupabase().from('fetch_logs').select('*').order('fetched_at', { ascending: false }).limit(limit);
  if (sourceId) q = q.eq('source_id', sourceId);
  return unwrap(await q);
}
