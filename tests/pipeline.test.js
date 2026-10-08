// Server pipeline (supabase/functions/_shared/pipeline.js) with an in-memory
// stand-in for the Supabase client: fetch -> parse -> validate -> ingest -> log.
import { describe, expect, it } from 'vitest';
import { fetchSourceAndIngest, evaluatePendingPredictions } from '../supabase/functions/_shared/pipeline.js';
import { createFetcher } from '../src/parsers/index.js';
import { OFFICIAL_STYLE, NO_RESULTS, CLOUDFLARE_CHALLENGE } from './fixtures/html.js';

function fakeAdmin({ rows = {} } = {}) {
  const tables = { fetch_logs: [], lottery_sources: [], predictions: [], v_results: [], ...rows };
  const ingested = [];
  const query = (table) => {
    const filters = [];
    let patch = null;
    const builder = {
      select: () => builder,
      eq: (c, v) => (filters.push((r) => r[c] === v), builder),
      lte: (c, v) => (filters.push((r) => r[c] <= v), builder),
      order: () => builder,
      range: () => builder,
      insert: async (row) => (tables[table].push(row), { error: null }),
      update: (p) => ((patch = p), builder),
      then: (resolve) => {
        const data = tables[table].filter((r) => filters.every((f) => f(r)));
        if (patch) data.forEach((r) => Object.assign(r, patch));
        resolve({ data, error: null });
      },
    };
    return builder;
  };
  return {
    tables,
    ingested,
    from: query,
    rpc: async (name, args) => {
      ingested.push(args);
      return { data: { inserted: args.p_draw.results.length, duplicates: 0, draw_created: true }, error: null };
    },
  };
}

const fetcherFor = (body, status = 200) =>
  createFetcher({
    sleep: async () => {},
    fetchImpl: async (url) => ({
      ok: url.endsWith('robots.txt') ? false : status < 300,
      status: url.endsWith('robots.txt') ? 404 : status,
      headers: { get: () => 'text/html' },
      text: async () => body,
    }),
  });

const source = { id: 's1', url: 'https://site.example/result', lottery_name: 'Karunya Plus' };

describe('server pipeline', () => {
  it('fetches, parses, saves and logs a successful fetch', async () => {
    const admin = fakeAdmin();
    const res = await fetchSourceAndIngest(admin, source, { fetcher: fetcherFor(OFFICIAL_STYLE) });
    expect(res.ok).toBe(true);
    expect(admin.ingested[0].p_draw).toMatchObject({ lottery_name: 'Karunya Plus', draw_code: 'KN-512', draw_date: '2024-03-12' });
    expect(admin.tables.fetch_logs[0]).toMatchObject({ source_id: 's1', success: true, records_found: 15, records_inserted: 15 });
  });

  it('logs parse failures without saving', async () => {
    const admin = fakeAdmin();
    const res = await fetchSourceAndIngest(admin, source, { fetcher: fetcherFor(NO_RESULTS) });
    expect(res.ok).toBe(false);
    expect(admin.ingested).toHaveLength(0);
    expect(admin.tables.fetch_logs[0].success).toBe(false);
    expect(admin.tables.fetch_logs[0].error_message).toMatch(/Parsing failed/);
  });

  it('logs blocked pages with the HTTP status', async () => {
    const admin = fakeAdmin();
    const res = await fetchSourceAndIngest(admin, source, { fetcher: fetcherFor(CLOUDFLARE_CHALLENGE, 503) });
    expect(res.blocked).toBe(true);
    expect(admin.tables.fetch_logs[0]).toMatchObject({ success: false, response_status: 503 });
  });

  it('refuses to save results for a different lottery than configured', async () => {
    const admin = fakeAdmin();
    const res = await fetchSourceAndIngest(admin, { ...source, lottery_name: 'Akshaya' }, { fetcher: fetcherFor(OFFICIAL_STYLE) });
    expect(res.ok).toBe(false);
    expect(admin.ingested).toHaveLength(0);
  });

  it('evaluates pending predictions once results exist', async () => {
    const admin = fakeAdmin({
      rows: {
        predictions: [{ id: 'p1', lottery_name: 'L', prize_category: '1st Prize', target_draw_date: '2024-01-04', evaluated: false, predicted_numbers: [{ number: '123450' }] }],
        v_results: [{ lottery_name: 'L', prize_category: '1st Prize', draw_date: '2024-01-04', normalized_number: '123456' }],
      },
    });
    const res = await evaluatePendingPredictions(admin);
    expect(res).toEqual({ pending: 1, evaluated: 1 });
    expect(admin.tables.predictions[0]).toMatchObject({ evaluated: true, actual_number: '123456', position_matches: 5 });
  });
});
