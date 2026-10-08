#!/usr/bin/env node
// npm run db:seed — inserts a deterministic SYNTHETIC dataset for development.
// Seeded draws are marked import_method = 'seed' and can be removed with --clear.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnv, requireEnv } from './lib/env.js';
import { ok, fail, warn } from './lib/cli.js';
import { adminClient } from './lib/steps.js';
import { generateMockDraws } from '../tests/fixtures/mockData.js';

export async function seedDatabase({ draws = 120 } = {}) {
  requireEnv(['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const admin = adminClient();
  const data = [
    ...generateMockDraws({ lottery: 'Demo Karunya Plus', code: 'DK', startDate: '2023-01-05', count: draws, seed: 1 }),
    ...generateMockDraws({ lottery: 'Demo Akshaya', code: 'DA', startDate: '2023-01-01', count: draws, seed: 2 }),
  ];
  let inserted = 0;
  let duplicates = 0;
  for (const draw of data) {
    const { data: res, error } = await admin.rpc('ingest_draw', { p_source_id: null, p_draw: draw, p_import_method: 'seed' });
    if (error) fail(`Seeding failed: ${error.message}`);
    inserted += res.inserted;
    duplicates += res.duplicates;
  }
  ok(`Seeded ${data.length} synthetic draws (${inserted} results inserted, ${duplicates} already present)`);
  warn('Seed data is RANDOM and synthetic ("Demo ..." lotteries). Remove it with `npm run db:seed -- --clear`.');
}

export async function clearSeed() {
  requireEnv(['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const { error, count } = await adminClient().from('lottery_draws').delete({ count: 'exact' }).eq('import_method', 'seed');
  if (error) fail(error.message);
  ok(`Removed ${count ?? 0} seeded draws`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadEnv();
  const run = process.argv.includes('--clear') ? clearSeed() : seedDatabase();
  run.catch((e) => fail(e.message));
}
