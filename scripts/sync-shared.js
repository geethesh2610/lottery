#!/usr/bin/env node
// Copies the dependency-free core (parsers, analytics, prediction, utils,
// constants) from src/ into supabase/functions/_shared/core so the browser and
// the Edge Functions run exactly the same code. Run automatically by
// `npm run functions:deploy` and `npm run db:setup`; a test fails if stale.
import { cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SHARED_DIRS = ['constants', 'utils', 'parsers', 'analytics', 'prediction'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = path.join(root, 'src');
export const DEST = path.join(root, 'supabase', 'functions', '_shared', 'core');

export function syncShared({ quiet = false } = {}) {
  rmSync(DEST, { recursive: true, force: true });
  mkdirSync(DEST, { recursive: true });
  for (const dir of SHARED_DIRS) {
    cpSync(path.join(SRC, dir), path.join(DEST, dir), { recursive: true });
  }
  writeFileSync(
    path.join(DEST, 'GENERATED.md'),
    '# Generated — do not edit\n\nCopied from `src/` by `npm run sync:shared`. Edit the files in `src/` instead.\n',
  );
  if (!quiet) console.log(`✔ Synced ${SHARED_DIRS.join(', ')} -> supabase/functions/_shared/core`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncShared();
}
