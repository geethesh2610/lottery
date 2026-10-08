import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(ROOT, file);
    if (existsSync(p)) dotenv.config({ path: p, quiet: true });
  }
  // Accept URLs pasted with a path, e.g. https://x.supabase.co/rest/v1/
  const m = (process.env.VITE_SUPABASE_URL || '').trim().match(/^(https?:\/\/[^/\s]+)/);
  if (m) process.env.VITE_SUPABASE_URL = m[1];
  return process.env;
}

const PLACEHOLDER = /^(your-|change-me|https:\/\/your-project-ref)/i;

export function isSet(name) {
  const v = process.env[name];
  return !!v && !PLACEHOLDER.test(v.trim());
}

/** Exits with a clear message if any required variable is missing. */
export function requireEnv(names) {
  const missing = names.filter((n) => !isSet(n));
  if (missing.length) {
    console.error(`\n✖ Missing environment variables: ${missing.join(', ')}`);
    console.error('  Copy .env.example to .env and fill them in (see README → Environment variables).\n');
    process.exit(1);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n].trim()]));
}

export function projectRef() {
  if (isSet('SUPABASE_PROJECT_REF')) return process.env.SUPABASE_PROJECT_REF.trim();
  const url = process.env.VITE_SUPABASE_URL || '';
  const m = url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co/i);
  return m ? m[1] : null;
}

export function assertServiceKeyNotExposed() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITE_') && /SERVICE|SECRET|PASSWORD|ACCESS_TOKEN/i.test(key)) {
      console.error(`✖ ${key} looks like a secret but has the VITE_ prefix, which would expose it to the browser. Rename it.`);
      process.exit(1);
    }
  }
}
