-- Kerala Lottery Pattern Analyzer — core schema.
-- Winning numbers are TEXT everywhere: "012345" must never become 12345.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- lottery_sources
-- ---------------------------------------------------------------------------
create table if not exists public.lottery_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  url text not null check (url ~* '^https?://'),
  lottery_name text,                       -- null = accept any lottery found on the page
  lottery_code text,
  active boolean not null default true,
  fetch_frequency text not null default 'daily' check (fetch_frequency in ('daily', 'weekly', 'manual')),
  parser text not null default 'generic-html',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  last_successful_fetch_at timestamptz,
  constraint lottery_sources_url_unique unique (url)
);

create trigger lottery_sources_updated_at
before update on public.lottery_sources
for each row execute function public.set_updated_at();

create index if not exists lottery_sources_active_idx on public.lottery_sources (active);

-- ---------------------------------------------------------------------------
-- lottery_draws
-- ---------------------------------------------------------------------------
create table if not exists public.lottery_draws (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.lottery_sources (id) on delete set null,
  lottery_name text not null check (length(trim(lottery_name)) > 0),
  lottery_code text,
  draw_code text check (draw_code is null or draw_code ~ '^[A-Z]{1,3}-[0-9]{1,4}$'),
  draw_date date not null,
  source_url text,
  import_method text not null default 'scrape' check (import_method in ('scrape', 'import', 'csv', 'seed')),
  created_at timestamptz not null default now()
);

-- Duplicate protection: one draw per lottery per date, and draw codes are unique per lottery.
create unique index if not exists lottery_draws_lottery_date_uidx
  on public.lottery_draws (lottery_name, draw_date);
create unique index if not exists lottery_draws_lottery_code_uidx
  on public.lottery_draws (lottery_name, draw_code) where draw_code is not null;
create index if not exists lottery_draws_date_idx on public.lottery_draws (draw_date desc);
create index if not exists lottery_draws_source_idx on public.lottery_draws (source_id);

-- ---------------------------------------------------------------------------
-- lottery_results
-- ---------------------------------------------------------------------------
create table if not exists public.lottery_results (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.lottery_draws (id) on delete cascade,
  source_id uuid references public.lottery_sources (id) on delete set null,
  prize_category text not null,
  prize_rank smallint not null default 99,
  winning_number text not null check (winning_number ~ '^([A-Z]{1,3} )?[0-9]{4,6}$'),
  normalized_number text not null check (normalized_number ~ '^[0-9]{4,6}$'),
  created_at timestamptz not null default now(),
  constraint lottery_results_number_consistent check (right(winning_number, length(normalized_number)) = normalized_number),
  -- Duplicate protection: the same ticket can only win a prize category once per draw.
  constraint lottery_results_unique unique (draw_id, prize_category, winning_number)
);

create index if not exists lottery_results_draw_idx on public.lottery_results (draw_id);
create index if not exists lottery_results_prize_idx on public.lottery_results (prize_category);
create index if not exists lottery_results_normalized_idx on public.lottery_results (normalized_number);
create index if not exists lottery_results_winning_number_idx on public.lottery_results (winning_number text_pattern_ops);

-- ---------------------------------------------------------------------------
-- fetch_logs
-- ---------------------------------------------------------------------------
create table if not exists public.fetch_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.lottery_sources (id) on delete cascade,
  fetched_at timestamptz not null default now(),
  success boolean not null,
  records_found integer not null default 0,
  records_inserted integer not null default 0,
  duplicates_skipped integer not null default 0,
  invalid_numbers integer not null default 0,
  parse_errors text[] not null default '{}',
  error_message text,
  response_status integer,
  url text,
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule', 'import', 'test'))
);

create index if not exists fetch_logs_source_time_idx on public.fetch_logs (source_id, fetched_at desc);
create index if not exists fetch_logs_success_idx on public.fetch_logs (success);

-- ---------------------------------------------------------------------------
-- predictions
-- ---------------------------------------------------------------------------
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  lottery_name text not null,
  prize_category text not null default '1st Prize',
  target_draw_date date not null,
  model_name text not null,
  predicted_numbers jsonb not null check (jsonb_typeof(predicted_numbers) = 'array'),
  generated_at timestamptz not null default now(),
  generated_by text not null default 'manual' check (generated_by in ('manual', 'schedule')),
  evaluated boolean not null default false,
  actual_number text check (actual_number is null or actual_number ~ '^[0-9]{4,6}$'),
  exact_match boolean,
  matching_digits smallint,
  position_matches smallint,
  last_digit_match boolean,
  last_two_match boolean,
  evaluation_date timestamptz,
  constraint predictions_unique unique (lottery_name, prize_category, target_draw_date, model_name)
);

create index if not exists predictions_pending_idx on public.predictions (evaluated, target_draw_date);
create index if not exists predictions_lottery_idx on public.predictions (lottery_name, target_draw_date desc);

-- ---------------------------------------------------------------------------
-- prediction_runs (backtests)
-- ---------------------------------------------------------------------------
create table if not exists public.prediction_runs (
  id uuid primary key default gen_random_uuid(),
  lottery_name text not null,
  prize_category text not null default '1st Prize',
  run_date timestamptz not null default now(),
  training_start_date date,
  training_end_date date,
  model_name text not null,
  sample_size integer not null default 0 check (sample_size >= 0),
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists prediction_runs_lottery_idx on public.prediction_runs (lottery_name, created_at desc);

-- ---------------------------------------------------------------------------
-- analytics_snapshots (written by the daily job)
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  lottery_name text not null,
  prize_category text not null,
  computed_at timestamptz not null default now(),
  sample_size integer not null,
  summary jsonb not null
);

create index if not exists analytics_snapshots_lottery_idx on public.analytics_snapshots (lottery_name, prize_category, computed_at desc);
