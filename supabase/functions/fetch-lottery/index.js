// fetch-lottery: preview a URL, fetch a saved source, or run one step of a
// historical import. All requests require a signed-in user (or the cron secret).
//
// POST { action: 'preview', url, lottery_name? }
// POST { action: 'fetch', source_id }
// POST { action: 'import', source_id, state?, max_pages?, pages_per_step? }
import { corsHeaders, json, errorResponse, readJson } from '../_shared/http.js';
import { createAdminClient, authorize } from '../_shared/supabase.js';
import { previewUrl, fetchSourceAndIngest, ingestParsed, logFetch, touchSource, makeFetcher } from '../_shared/pipeline.js';
import { createImportState, runImportStep } from '../_shared/core/parsers/index.js';

async function loadSource(admin, id) {
  const { data, error } = await admin.from('lottery_sources').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return errorResponse(e.message, 500);
  }
  const caller = await authorize(req, admin);
  if (!caller) return errorResponse('Sign in to use this function.', 401);

  const body = await readJson(req);
  try {
    switch (body.action) {
      case 'preview': {
        if (!body.url) return errorResponse('url is required');
        const result = await previewUrl(body.url, body.lottery_name || null);
        return json(result);
      }

      case 'fetch': {
        const source = await loadSource(admin, body.source_id);
        if (!source) return errorResponse('Source not found', 404);
        const result = await fetchSourceAndIngest(admin, source, { trigger: 'manual' });
        return json(result);
      }

      case 'import': {
        const source = await loadSource(admin, body.source_id);
        if (!source) return errorResponse('Source not found', 404);
        const maxPages = Math.min(Math.max(Number(body.max_pages) || 100, 1), 1000);
        const pagesPerStep = Math.min(Math.max(Number(body.pages_per_step) || 5, 1), 10);
        const prev = body.state && body.state.startUrl === source.url ? body.state : createImportState(source.url, { maxPages });
        const before = { ...prev };
        const fetcher = makeFetcher();
        const state = await runImportStep(prev, {
          fetchPage: fetcher.fetchPage,
          ingest: (parsed) => ingestParsed(admin, source.id, parsed, 'import'),
          lotteryName: source.lottery_name,
          pagesPerStep,
        });
        const stepErrors = state.errors - before.errors;
        await logFetch(admin, {
          source_id: source.id,
          success: stepErrors < state.pagesFetched - before.pagesFetched,
          records_found: state.resultsFound - before.resultsFound,
          records_inserted: state.inserted - before.inserted,
          duplicates_skipped: state.duplicates - before.duplicates,
          error_message: stepErrors ? state.errorMessages.slice(-stepErrors).join('\n') : null,
          url: source.url,
          trigger: 'import',
        });
        if (state.inserted > before.inserted || state.duplicates > before.duplicates) await touchSource(admin, source.id, true);
        return json({ ok: true, state });
      }

      default:
        return errorResponse('Unknown action. Use preview, fetch or import.');
    }
  } catch (e) {
    console.error(e);
    return errorResponse(e.message || String(e), 500);
  }
});
