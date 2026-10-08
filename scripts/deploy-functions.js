#!/usr/bin/env node
// npm run functions:deploy — syncs shared core, deploys functions, refreshes cron secret + schedule.
import { loadEnv, requireEnv, projectRef } from './lib/env.js';
import { verifyCli, fail } from './lib/cli.js';
import { deployFunctions, configureSchedule } from './lib/steps.js';

loadEnv();
verifyCli();
requireEnv(['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN']);
const ref = projectRef();
if (!ref) fail('Could not determine project ref.');
const secret = deployFunctions(ref);
await configureSchedule(secret);
