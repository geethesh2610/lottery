import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.js';

const isWin = process.platform === 'win32';

function supabaseBin() {
  const local = path.join(ROOT, 'node_modules', '.bin', isWin ? 'supabase.cmd' : 'supabase');
  return existsSync(local) ? local : 'supabase';
}

export const ok = (msg) => console.log(`\x1b[32m✔\x1b[0m ${msg}`);
export const step = (msg) => console.log(`\n\x1b[36m▶\x1b[0m ${msg}`);
export const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`);
export const fail = (msg) => {
  console.error(`\x1b[31m✖\x1b[0m ${msg}`);
  process.exit(1);
};

/** Runs the Supabase CLI. Secrets are passed through env vars, never argv. */
export function supabase(args, { capture = false, allowFail = false } = {}) {
  const bin = supabaseBin();
  const res = spawnSync(isWin ? `"${bin}"` : bin, args, {
    cwd: ROOT,
    env: process.env,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: isWin,
  });
  if (res.status !== 0 && !allowFail) {
    if (capture) console.error(res.stderr || res.stdout);
    fail(`supabase ${args[0]} ${args[1] ?? ''} failed (exit ${res.status}).`);
  }
  return res;
}

export function verifyCli() {
  const res = supabase(['--version'], { capture: true, allowFail: true });
  if (res.status !== 0) fail('Supabase CLI not found. Run `npm install` (it is a devDependency).');
  ok(`Supabase CLI ${res.stdout.trim()}`);
}
