// The Edge Functions run a copy of the core in supabase/functions/_shared/core.
// This fails if someone edits src/ without running `npm run sync:shared`.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARED_DIRS, SRC, DEST } from '../scripts/sync-shared.js';

function listFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

describe('shared core sync', () => {
  it('Edge Function core is identical to src/', () => {
    for (const dir of SHARED_DIRS) {
      for (const file of listFiles(path.join(SRC, dir))) {
        const copy = path.join(DEST, path.relative(SRC, file));
        expect(existsSync(copy), `${copy} missing — run npm run sync:shared`).toBe(true);
        expect(readFileSync(copy, 'utf8'), `${copy} is stale — run npm run sync:shared`).toBe(readFileSync(file, 'utf8'));
      }
    }
  });

  it('shared core has no browser-only or npm imports', () => {
    for (const dir of SHARED_DIRS) {
      for (const file of listFiles(path.join(SRC, dir))) {
        const src = readFileSync(file, 'utf8');
        const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
        for (const i of imports) expect(i.startsWith('.'), `${file} imports ${i}`).toBe(true);
        expect(src).not.toMatch(/\b(window\.|document\.|localStorage|import\.meta\.env)/);
      }
    }
  });
});

describe('security', () => {
  it('never exposes the service role key to the browser bundle', () => {
    for (const file of listFiles(SRC)) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/SERVICE_ROLE|VITE_SUPABASE_SERVICE/);
    }
  });
});
