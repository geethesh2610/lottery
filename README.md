# Kerala Lottery Pattern Analyzer

A complete pipeline for collecting **public** Kerala State lottery results, analysing digit patterns with proper
statistics, and honestly testing experimental prediction models against a random baseline.

```
Website → Fetcher (Edge Function, robots.txt-aware) → Parser → Validation → Supabase (Postgres)
       → Historical dataset → Analytics → Prediction models → Walk-forward backtesting
       → Performance evaluation → Dashboard (React + MUI + Recharts)
```

> **Important.** Lottery draws are designed to be random. This project measures whether *any* pattern exists and
> whether any model beats random guessing — it does not claim to predict winners. Candidate numbers are
> *experimental statistical candidates* and model scores are ranking scores, **not** probabilities of winning.

---

## 1. Installation

Requirements: **Node.js 20+** and npm. Nothing else needs to be installed globally — the Supabase CLI is a
project devDependency, and Deno (only used by `npm run test:edge`) is fetched on demand via `npx`.

```bash
npm install
```

## 2. Environment variables

```bash
cp .env.example .env    # Windows PowerShell: Copy-Item .env.example .env
```

| Variable | Where to find it | Used by |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL | browser + scripts |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → `anon` / publishable key | browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` / secret key | **scripts only** |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens | CLI (link, deploy) |
| `SUPABASE_DB_PASSWORD` | The database password chosen when the project was created | CLI (migrations) |
| `SUPABASE_PROJECT_REF` | Optional — derived from the URL | CLI |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Choose any — the setup script creates this user | sign-in for write actions |
| `DISABLE_SIGNUP` | `true` disables public sign-ups via the Management API | setup |
| `DAILY_RUN_CRON` | Optional cron (UTC). Default `30 11 * * *` = 17:00 IST | schedule |

Security rules enforced by the code:

* Only `VITE_*` values reach the browser; the setup scripts refuse to run if a secret-looking variable has the `VITE_` prefix.
* The service role key is never imported in `src/` (a test checks this). Edge Functions receive it automatically from Supabase.
* `.env` is git-ignored. Never commit real credentials.

## 3. Supabase setup

Create a free project at https://supabase.com (this is the only dashboard step — creating a project requires your
account). Copy its credentials into `.env`. **Everything else is automated.**

## 4. Automated database migration

```bash
npm run db:setup              # full setup
npm run db:setup -- --seed    # full setup + synthetic demo data
```

`db:setup` performs, in order:

1. Verifies the Supabase CLI (`node_modules/.bin/supabase`).
2. Verifies environment variables (and that no secret is exposed with `VITE_`).
3. Links the project (`supabase link`).
4. Applies all migrations (`supabase db push`) — tables, foreign keys, unique constraints, check constraints,
   indexes, triggers, views, RPC functions, RLS policies, grants, and the pg_cron / pg_net / Vault scheduling function.
5. Verifies every table is reachable.
6. Syncs the shared core, sets the `CRON_SECRET` function secret and deploys both Edge Functions (`--use-api`, no Docker).
7. Calls `configure_daily_schedule()` which stores the project URL + secret in **Vault** and creates the **pg_cron** job.
8. Creates the admin user (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) and optionally disables public sign-ups.
9. Seeds synthetic data if `--seed` was given.

Individual commands:

```bash
npm run db:migrate            # link + apply migrations only
npm run db:seed               # insert synthetic "Demo …" lotteries (random numbers)
npm run db:seed -- --clear    # remove the synthetic data again
npm run functions:deploy      # redeploy Edge Functions + refresh schedule
npm run db:schedule           # (re)configure the daily cron job only
```

Migrations live in `supabase/migrations/`:

| File | Contents |
|---|---|
| `001_initial_schema.sql` | `lottery_sources`, `lottery_draws`, `lottery_results`, `fetch_logs`, `predictions`, `prediction_runs`, `analytics_snapshots`; FKs, uniques, checks, indexes, `updated_at` trigger |
| `002_functions_and_views.sql` | `ingest_draw()` (atomic, idempotent), `v_results`, `v_lottery_stats`, `v_source_health`, `list_lotteries()`, `list_prize_categories()` |
| `003_rls_policies.sql` | RLS on every table: public read, authenticated write; grants |
| `004_daily_schedule.sql` | pg_cron, pg_net, Vault; `configure_daily_schedule()`, `daily_schedule_status()` |

**Winning numbers are `TEXT`** everywhere (`012345` stays `012345`); check constraints reject anything that is not
4–6 digits (optionally with a series prefix such as `PN 012345`).

**Duplicate protection** is layered: unique `(lottery_name, draw_date)`, unique `(lottery_name, draw_code)`,
unique `(draw_id, prize_category, winning_number)`, `ingest_draw()` matching existing draws by date *or* draw code,
and de-duplication in the parser/CSV importer. Re-fetching a page only increments the "duplicates skipped" counter.

## 5. Running locally

```bash
npm run dev          # http://localhost:5173
npm test             # 110+ unit/integration tests (incl. migrations in PGlite)
npm run test:edge    # boots the real fetch-lottery Edge Function under Deno against a local fixture site
npm run build        # production build in dist/
```

On first start the app shows **Welcome to Kerala Lottery Pattern Analyzer** with a six-step guide:
configure Supabase → add result source → test source → import historical results → analyse data → generate
experimental prediction. Each step is ticked automatically from the database state.

Reading works without signing in. Adding sources, importing and saving predictions require signing in with the
admin account.

## 6. Adding a source

**Lottery Sources → Add source**

1. Enter the lottery name (e.g. *Karunya Plus*, or leave blank to accept any lottery on the page) and a public result URL.
2. Click **Test Source**. The browser calls the `fetch-lottery` Edge Function, which fetches the page server-side and
   shows the detected lottery, draw number, date and every prize number.
3. Click **Confirm & Save**. The source is stored and its current result is saved immediately.

Sources can be activated/deactivated, fetched on demand, and inspected via their fetch log. Every draw and result
records the `source_id` that produced it.

**Access rules.** The fetcher identifies itself, respects `robots.txt` (including `Crawl-delay`), waits ≥1.5 s
between requests and times out after 20 s. Cloudflare challenges, CAPTCHAs, logins, paywalls, 403/429 responses and
PDF-only results are **reported, never bypassed**.

**Custom parsers.** `GenericHtmlParser` handles common layouts. For a site it can't read, extend it:

```js
// src/parsers/MySiteParser.js
import { GenericHtmlParser } from './GenericHtmlParser.js';
export class MySiteParser extends GenericHtmlParser {
  static id = 'my-site';
  static canParse(url) { return new URL(url).host === 'results.my-site.example'; }
  parsePrizeResults(ctx) { /* site-specific extraction */ }
}
// src/parsers/registry.js →  registerParser(MySiteParser)
```

Then run `npm run functions:deploy` (it syncs `src/` into the functions automatically).

## 7. Historical import

**Lottery Sources → Import history** (cloud-download icon). Starting from the source URL, the importer follows
result, archive and pagination links on the **same host**, prioritising links that mention the lottery. It runs in
small steps (5 pages per Edge Function call) so long imports never hit function time limits, and shows live
progress: fetched pages, results found, new results, duplicates, errors. You can stop at any time; re-running is safe.

**CSV fallback.** **Historical Results → Import CSV** accepts:

```csv
date,lottery,draw,prize,winning_number
2024-03-12,Karunya Plus,KN-512,1st Prize,PN 012345
2024-03-12,Karunya Plus,KN-512,4th Prize,0123
```

Every row is validated (date, lottery, draw, prize, number length per prize). Values are parsed as text, so
leading zeros survive. Numbers that look like they lost a leading zero (e.g. after opening the file in Excel) are
rejected with an explanation unless you tick *Restore missing leading zeros*.

## 8. Analytics

`src/analytics/` contains pure, reusable functions, computed per lottery and per prize from database data:

`calculateDigitFrequency`, `calculatePositionFrequency`, `calculateLastDigitFrequency`,
`calculateLastTwoDigitFrequency`, `calculateDigitSum` (min/max/mean/median/mode/distribution),
`calculateOddEvenDistribution` (6/0 … 0/6), `calculateRepeatedDigitPatterns` (no repetition, pairs, three/four-of-a-kind …),
`calculateConsecutiveDigitPatterns`, `calculateNumberDistribution`, `rollingWindowAnalysis`, `analyzeEntries`.

Every distribution reports **sample size, observed vs expected counts, deviation, standardized residuals and a
chi-square goodness-of-fit test**. Expected distributions are exact (combinatorics / dynamic programming), not
assumed uniform where they aren't (e.g. digit sums, repetition patterns). Cells with expected count < 5 are merged;
samples below 30 show **"Insufficient historical data."** Because many tests are run, the page reports a
Bonferroni-corrected verdict and the number of false positives expected by chance. Rolling-window analysis shows
whether "hot" digits persist (they shouldn't, if draws are random).

## 9. Prediction models

`src/prediction/` — every model outputs `{ number, score, model, reason/features }`:

| Model | Idea |
|---|---|
| Pattern model (`recent`) | Favours digits that came up often in each position recently (20-draw half-life) |
| Random guess (`random`) | Uniform random — the yardstick the pattern model must beat |

Generation is deterministic (seeded) and uses only data before the target draw. The daily job also generates and
stores predictions for each lottery's next draw (inferred from its usual weekday) and evaluates them once the results
appear.

## 10. Performance (walk-forward test)

The **Performance** page replays history: for each past draw (latest 200), the models are trained only on results
from before that month, make 10 guesses, and are checked against the actual number.

`assertNoLeakage()` throws if any training row is on/after the cutoff; tests verify this with a spy model and an
"oracle" model that would score exact hits if future data leaked.

The pattern model is tested against the **theoretical random baseline** (binomial / z-tests, Bonferroni-corrected).
If nothing survives correction the app says **"No statistically meaningful predictive advantage detected."** The page
shows one chart (last-digit hit rate vs. pure luck) and a plain table, for the history test and for real saved
predictions. Data Quality is reached from **Settings**.

## 11. Deployment

Backend (database, functions, schedule) is deployed by `npm run db:setup`. For the frontend:

```bash
npm run build      # outputs dist/
```

Host `dist/` on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages …) with an SPA fallback to
`index.html`, and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build-time environment variables. Example
with the Netlify CLI (after `netlify login`):

```bash
npx netlify-cli deploy --build --prod --dir=dist
```

Add your site URL to Supabase **Auth → URL configuration** if you use password reset e-mails.

## 12. Limitations

* **Lotteries are random.** Expect every model to perform like the baseline; the tooling is built to show that honestly.
* Small samples produce noisy statistics; the app refuses to test below 30 observations, and even larger samples can show chance deviations.
* The generic parser is heuristic. Unusual layouts may need a source-specific parser or the CSV import.
* PDF-only result publications (such as the official gazette PDFs) are not parsed — use an HTML results page or CSV.
* Sites protected by bot challenges, CAPTCHAs, logins or `robots.txt` are skipped by design.
* Missing-date detection assumes weekly draws on a fixed weekday; bumper draws are irregular.
* Edge Functions have execution limits; historical imports therefore run in small, resumable steps driven by the browser tab — keep it open during an import.
* pg_cron requires a Supabase project with the `pg_cron` and `pg_net` extensions (available on all hosted plans).

## Project structure

```
src/
  analytics/   statistics + pattern analysis (shared with Edge Functions)
  prediction/  models, candidate generation, evaluation, backtesting (shared)
  parsers/     LotteryParser, GenericHtmlParser, fetcher, crawler, CSV validation (shared)
  utils/ constants/   shared helpers
  services/    Supabase data access (browser)
  hooks/ components/ layouts/ pages/   React UI
supabase/
  migrations/  SQL schema, RLS, functions, schedule
  functions/   fetch-lottery, daily-run, _shared (core is a generated copy of src/)
scripts/       setup, migrate, seed, deploy, sync-shared, Edge Function smoke test
tests/         Vitest suites + fixtures (HTML pages, synthetic datasets)
```
