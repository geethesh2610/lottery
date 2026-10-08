#!/usr/bin/env node
// npm run test:edge — boots the real `fetch-lottery` Edge Function under Deno
// (via npx, no install needed) and calls it against a local fixture website.
// Verifies Deno module resolution, the shared core and the preview pipeline
// end-to-end without needing a Supabase project.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { ROOT } from './lib/env.js';
import { syncShared } from './sync-shared.js';
import { OFFICIAL_STYLE, CLOUDFLARE_CHALLENGE } from '../tests/fixtures/html.js';

const SITE_PORT = 18787;
const FN_PORT = 18000;
const SECRET = 'local-smoke-test-secret-0123456789';

const site = http.createServer((req, res) => {
  const routes = {
    '/robots.txt': [200, 'User-agent: *\nDisallow: /private\n'],
    '/result': [200, OFFICIAL_STYLE],
    '/private/result': [200, OFFICIAL_STYLE],
    '/challenge': [503, CLOUDFLARE_CHALLENGE],
  };
  const [status, body] = routes[req.url] || [404, 'not found'];
  res.writeHead(status, { 'content-type': req.url.endsWith('.txt') ? 'text/plain' : 'text/html' });
  res.end(body);
});

async function call(body) {
  const res = await fetch(`http://127.0.0.1:${FN_PORT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': SECRET },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

function check(cond, msg) {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`✔ ${msg}`);
}

async function main() {
  syncShared({ quiet: true });
  await new Promise((r) => site.listen(SITE_PORT, '127.0.0.1', r));
  const isWin = process.platform === 'win32';
  const deno = spawn(isWin ? 'npx.cmd' : 'npx', ['--yes', 'deno@latest', 'run', '--allow-net', '--allow-env', '--allow-read', 'supabase/functions/fetch-lottery/index.js'], {
    cwd: ROOT,
    shell: isWin,
    env: { ...process.env, PORT: String(FN_PORT), DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FN_PORT}`, CRON_SECRET: SECRET, SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'local-test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  deno.stdout.on('data', (d) => (output += d));
  deno.stderr.on('data', (d) => (output += d));

  try {
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      await sleep(1000);
      ready = await fetch(`http://127.0.0.1:${FN_PORT}`, { method: 'OPTIONS' }).then(() => true, () => false);
    }
    if (!ready) throw new Error(`Edge Function did not start:\n${output}`);

    const unauth = await fetch(`http://127.0.0.1:${FN_PORT}`, { method: 'POST', body: '{}' });
    check(unauth.status === 401, 'rejects unauthenticated requests');

    const ok = await call({ action: 'preview', url: `http://127.0.0.1:${SITE_PORT}/result` });
    const p = ok.json.parsed;
    check(ok.json.ok && p?.valid, 'previews a result page');
    check(p.lottery_name === 'Karunya Plus' && p.draw_code === 'KN-512' && p.draw_date === '2024-03-12', 'detects lottery, draw number and date');
    check(p.results.find((r) => r.prize_category === '1st Prize')?.winning_number === 'PN 012345', 'keeps leading zeros (PN 012345)');

    const robots = await call({ action: 'preview', url: `http://127.0.0.1:${SITE_PORT}/private/result` });
    check(!robots.json.ok && /robots/.test(robots.json.error), 'respects robots.txt');

    const cf = await call({ action: 'preview', url: `http://127.0.0.1:${SITE_PORT}/challenge` });
    check(!cf.json.ok && cf.json.blocked && /not bypassed/.test(cf.json.error), 'reports bot challenges without bypassing them');

    console.log('\nEdge Function smoke test passed.');
  } finally {
    deno.kill();
    if (isWin && deno.pid) spawn('taskkill', ['/pid', String(deno.pid), '/T', '/F'], { stdio: 'ignore' });
    site.close();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
