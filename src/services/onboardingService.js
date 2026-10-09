import { getSupabase, isConfigured } from './supabaseClient.js';
import { MIN_SAMPLE_SIZE } from '../constants/app.js';

const VISITED_KEY = 'klpa.analysisVisited';

export function markAnalysisVisited() {
  try {
    localStorage.setItem(VISITED_KEY, '1');
  } catch {
    // ignore
  }
}

function analysisVisited() {
  try {
    return localStorage.getItem(VISITED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Computes first-run checklist progress from the live database. */
export async function getOnboardingStatus() {
  const status = { configured: isConfigured(), schemaReady: false, sources: 0, testedSources: 0, draws: 0, predictions: 0, analysisVisited: analysisVisited(), schemaError: null };
  if (!status.configured) return status;
  const sb = getSupabase();
  const [sources, tested, draws, preds] = await Promise.all([
    sb.from('lottery_sources').select('id', { count: 'exact', head: true }),
    sb.from('lottery_sources').select('id', { count: 'exact', head: true }).not('last_fetched_at', 'is', null),
    sb.from('lottery_draws').select('id', { count: 'exact', head: true }),
    sb.from('predictions').select('id', { count: 'exact', head: true }),
  ]);
  if (sources.error) {
    status.schemaError = sources.error.message;
    return status;
  }
  status.schemaReady = true;
  status.sources = sources.count ?? 0;
  status.testedSources = tested.count ?? 0;
  status.draws = draws.count ?? 0;
  status.predictions = preds.count ?? 0;
  return status;
}

export function onboardingSteps(s) {
  return [
    { key: 'configure', label: 'Configure Supabase', done: s.configured && s.schemaReady, to: '/settings', help: 'Fill in .env and run `npm run db:setup`.' },
    { key: 'source', label: 'Add result source', done: s.sources > 0, to: '/sources', help: 'Add a public result page URL.' },
    { key: 'test', label: 'Test source', done: s.testedSources > 0, to: '/sources', help: 'Click "Test Source" to preview what is detected, then Confirm & Save.' },
    { key: 'import', label: 'Import historical results', done: s.draws >= MIN_SAMPLE_SIZE, to: '/sources', help: `Use "Import history" or CSV import. At least ${MIN_SAMPLE_SIZE} draws are needed for statistics.` },
    { key: 'analyse', label: 'Analyse data', done: s.analysisVisited && s.draws > 0, to: '/analysis', help: 'Review digit, position and pattern statistics.' },
    { key: 'predict', label: 'Generate experimental prediction', done: s.predictions > 0, to: '/predictions', help: 'Generate and save candidates, then check Performance to see whether it beats random.' },
  ];
}
