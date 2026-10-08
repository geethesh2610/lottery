import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabase, ok, step, warn, fail } from './cli.js';
import { syncShared } from '../sync-shared.js';
import { isSet } from './env.js';

export function adminClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function linkProject(ref) {
  step(`Linking Supabase project ${ref}`);
  supabase(['link', '--project-ref', ref, '--yes']);
  ok('Project linked');
}

export function pushMigrations() {
  step('Applying database migrations (tables, constraints, indexes, RLS, functions, cron)');
  supabase(['db', 'push', '--linked', '--include-all', '--yes']);
  ok('Database schema is up to date');
}

export function deployFunctions(ref) {
  step('Deploying Edge Functions');
  syncShared();
  const cronSecret = randomBytes(32).toString('hex');
  supabase(['secrets', 'set', `CRON_SECRET=${cronSecret}`, '--project-ref', ref]);
  ok('CRON_SECRET stored as a function secret');
  supabase(['functions', 'deploy', 'fetch-lottery', '--project-ref', ref, '--use-api', '--yes']);
  supabase(['functions', 'deploy', 'daily-run', '--project-ref', ref, '--use-api', '--yes']);
  ok('Edge Functions deployed: fetch-lottery, daily-run');
  return cronSecret;
}

export async function configureSchedule(cronSecret) {
  step('Configuring daily schedule (pg_cron + pg_net + Vault)');
  const schedule = isSet('DAILY_RUN_CRON') ? process.env.DAILY_RUN_CRON : '30 11 * * *';
  const { data, error } = await adminClient().rpc('configure_daily_schedule', {
    p_project_url: process.env.VITE_SUPABASE_URL,
    p_cron_secret: cronSecret,
    p_schedule: schedule,
  });
  if (error) fail(`Could not configure schedule: ${error.message}`);
  ok(`Daily run scheduled (${data.schedule} UTC)`);
}

export async function ensureAdminUser() {
  if (!isSet('ADMIN_EMAIL') || !isSet('ADMIN_PASSWORD')) {
    warn('ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin user creation (writes require a signed-in user).');
    return;
  }
  step('Ensuring admin user exists');
  const admin = adminClient();
  const { error } = await admin.auth.admin.createUser({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (error && !/already|registered|exists/i.test(error.message)) fail(`Could not create admin user: ${error.message}`);
  ok(error ? `Admin user ${process.env.ADMIN_EMAIL} already exists` : `Admin user ${process.env.ADMIN_EMAIL} created`);
}

/** Disables public sign-ups through the Management API (optional). */
export async function disableSignups(ref) {
  if (process.env.DISABLE_SIGNUP !== 'true') return;
  step('Disabling public sign-ups');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ disable_signup: true }),
  });
  if (!res.ok) warn(`Could not disable sign-ups (HTTP ${res.status}). You can leave it; RLS still requires sign-in for writes.`);
  else ok('Public sign-ups disabled');
}

export async function verifyDatabase() {
  step('Verifying database');
  const admin = adminClient();
  for (const table of ['lottery_sources', 'lottery_draws', 'lottery_results', 'fetch_logs', 'predictions', 'prediction_runs']) {
    const { error } = await admin.from(table).select('id', { head: true, count: 'exact' });
    if (error) fail(`Table ${table} is not reachable: ${error.message}`);
  }
  ok('All tables reachable');
}
