#!/usr/bin/env node
// npm run db:setup [-- --seed] [-- --skip-functions]
// 1. verify CLI  2. verify env  3. link  4. migrate  5. deploy functions + secret
// 6. schedule daily job  7. admin user  8. optional seed  9. verify
import { loadEnv, requireEnv, projectRef, assertServiceKeyNotExposed } from './lib/env.js';
import { verifyCli, fail, ok, step } from './lib/cli.js';
import {
  linkProject,
  pushMigrations,
  deployFunctions,
  configureSchedule,
  ensureAdminUser,
  disableSignups,
  verifyDatabase,
} from './lib/steps.js';
import { seedDatabase } from './seed.js';

const args = new Set(process.argv.slice(2));

async function main() {
  console.log('\nKerala Lottery Pattern Analyzer — automated Supabase setup');
  loadEnv();
  assertServiceKeyNotExposed();

  step('Checking Supabase CLI');
  verifyCli();

  step('Checking environment variables');
  requireEnv(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD']);
  const ref = projectRef();
  if (!ref) fail('Could not determine project ref. Set SUPABASE_PROJECT_REF.');
  ok(`Environment OK (project ${ref})`);

  if (args.has('--only-schedule')) {
    const secret = deployFunctions(ref);
    await configureSchedule(secret);
    return;
  }

  linkProject(ref);
  pushMigrations();
  await verifyDatabase();

  if (!args.has('--skip-functions')) {
    const secret = deployFunctions(ref);
    await configureSchedule(secret);
  }

  await ensureAdminUser();
  await disableSignups(ref);

  if (args.has('--seed')) {
    step('Seeding development data');
    await seedDatabase();
  }

  console.log('\n\x1b[32m✔ Setup complete.\x1b[0m Run `npm run dev` and open http://localhost:5173\n');
}

main().catch((e) => fail(e.stack || e.message));
