// Runs the real SQL migrations in PGlite (Postgres compiled to WASM) to verify
// the schema, constraints, duplicate protection and RLS without Docker.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { generateMockDraws } from './fixtures/mockData.js';

const MIGRATIONS = path.resolve(import.meta.dirname, '..', 'supabase', 'migrations');
let db;

async function ingest(draw, sourceId = null) {
  const { rows } = await db.query('select public.ingest_draw($1, $2::jsonb, $3) as r', [sourceId, JSON.stringify(draw), 'scrape']);
  return rows[0].r;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  // Objects Supabase provides out of the box.
  await db.exec(`
    create schema if not exists extensions;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  `);
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  expect(files[0]).toBe('001_initial_schema.sql');
  for (const f of files) {
    // 004 needs pg_cron / pg_net / Vault, which only exist on Supabase.
    if (f.startsWith('004')) continue;
    await db.exec(readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  }
}, 60000);

describe('database schema (migrations)', () => {
  it('creates all tables and views', async () => {
    const { rows } = await db.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
    const names = rows.map((r) => r.table_name);
    for (const t of ['lottery_sources', 'lottery_draws', 'lottery_results', 'fetch_logs', 'predictions', 'prediction_runs', 'analytics_snapshots', 'v_results', 'v_lottery_stats', 'v_source_health']) {
      expect(names).toContain(t);
    }
  });

  it('stores winning numbers as TEXT and keeps leading zeros', async () => {
    const { rows } = await db.query(`select data_type from information_schema.columns where table_name = 'lottery_results' and column_name in ('winning_number', 'normalized_number')`);
    expect(rows.every((r) => r.data_type === 'text')).toBe(true);
    await ingest({ lottery_name: 'Zero Test', draw_date: '2024-01-01', results: [{ prize_category: '1st Prize', prize_rank: 1, winning_number: 'PA 000123', normalized_number: '000123' }] });
    const res = await db.query(`select normalized_number from v_results where lottery_name = 'Zero Test'`);
    expect(res.rows[0].normalized_number).toBe('000123');
  });

  it('enables RLS on every table', async () => {
    const { rows } = await db.query(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`);
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    const policies = await db.query(`select count(*)::int as n from pg_policies where schemaname = 'public'`);
    expect(policies.rows[0].n).toBe(28);
  });
});

describe('duplicate protection', () => {
  const [draw] = generateMockDraws({ lottery: 'Dup Lottery', code: 'DL', count: 1 });

  it('inserts once and reports duplicates on re-ingest', async () => {
    const first = await ingest(draw);
    expect(first.draw_created).toBe(true);
    expect(first.inserted).toBe(draw.results.length);
    expect(first.duplicates).toBe(0);

    const second = await ingest(draw);
    expect(second.draw_created).toBe(false);
    expect(second.draw_id).toBe(first.draw_id);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(draw.results.length);

    const { rows } = await db.query(`select count(*)::int as n from v_results where lottery_name = 'Dup Lottery'`);
    expect(rows[0].n).toBe(draw.results.length);
  });

  it('matches an existing draw by draw code even if the date differs', async () => {
    const res = await ingest({ ...draw, draw_date: '2023-01-03' });
    expect(res.draw_created).toBe(false);
    expect(res.inserted).toBe(0);
  });

  it('adds only new results to an existing draw', async () => {
    const res = await ingest({ ...draw, results: [...draw.results, { prize_category: '5th Prize', prize_rank: 6, winning_number: '0001', normalized_number: '0001' }] });
    expect(res.inserted).toBe(1);
    expect(res.duplicates).toBe(draw.results.length);
  });

  it('enforces unique constraints at the table level too', async () => {
    await expect(
      db.query(`insert into lottery_draws (lottery_name, draw_date) values ('Dup Lottery', $1)`, [draw.draw_date]),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('constraints', () => {
  it('rejects malformed numbers', async () => {
    await expect(
      ingest({ lottery_name: 'Bad', draw_date: '2024-02-01', results: [{ prize_category: '1st Prize', winning_number: 'PA 12345X', normalized_number: '12345X' }] }),
    ).rejects.toThrow(/check constraint/);
    await expect(
      ingest({ lottery_name: 'Bad2', draw_date: '2024-02-01', results: [{ prize_category: '1st Prize', winning_number: 'PA 123456', normalized_number: '654321' }] }),
    ).rejects.toThrow(/lottery_results_number_consistent/);
  });

  it('requires lottery name and date', async () => {
    await expect(ingest({ lottery_name: '', draw_date: '2024-01-01', results: [] })).rejects.toThrow(/required/);
  });

  it('enforces one prediction per lottery/prize/date/model', async () => {
    const insert = () => db.query(`insert into predictions (lottery_name, target_draw_date, model_name, predicted_numbers) values ('X', '2024-01-01', 'frequency', '[]')`);
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/);
  });

  it('validates source URLs and fetch frequency', async () => {
    await expect(db.query(`insert into lottery_sources (name, url) values ('x', 'ftp://bad')`)).rejects.toThrow(/check constraint/);
    await expect(db.query(`insert into lottery_sources (name, url, fetch_frequency) values ('x', 'https://ok.example', 'hourly')`)).rejects.toThrow(/check constraint/);
    const { rows } = await db.query(`insert into lottery_sources (name, url) values ('ok', 'https://ok.example') returning updated_at`);
    expect(rows[0].updated_at).toBeTruthy();
  });
});
