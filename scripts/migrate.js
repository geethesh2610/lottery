#!/usr/bin/env node
// npm run db:migrate — links the project and applies supabase/migrations/*.sql.
import { loadEnv, requireEnv, projectRef, assertServiceKeyNotExposed } from './lib/env.js';
import { verifyCli, fail, ok } from './lib/cli.js';
import { linkProject, pushMigrations } from './lib/steps.js';

loadEnv();
assertServiceKeyNotExposed();
verifyCli();
requireEnv(['VITE_SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD']);
const ref = projectRef();
if (!ref) fail('Could not determine project ref. Set SUPABASE_PROJECT_REF or a standard VITE_SUPABASE_URL.');
linkProject(ref);
pushMigrations();
ok('Migrations complete');
