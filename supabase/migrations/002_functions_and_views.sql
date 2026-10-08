-- Ingestion RPC, views and statistics helpers.

-- ---------------------------------------------------------------------------
-- ingest_draw: atomic, idempotent insert of one draw and its results.
-- Application code de-duplicates too; this is the database-level guarantee.
-- SECURITY INVOKER: RLS applies to the caller (service role bypasses it).
-- ---------------------------------------------------------------------------
create or replace function public.ingest_draw(p_source_id uuid, p_draw jsonb, p_import_method text default 'scrape')
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lottery text := nullif(trim(p_draw->>'lottery_name'), '');
  v_date date := (p_draw->>'draw_date')::date;
  v_code text := nullif(trim(p_draw->>'draw_code'), '');
  v_draw_id uuid;
  v_created boolean := false;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_rows integer;
  r jsonb;
begin
  if v_lottery is null or v_date is null then
    raise exception 'lottery_name and draw_date are required';
  end if;

  select id into v_draw_id
  from lottery_draws
  where lottery_name = v_lottery
    and (draw_date = v_date or (v_code is not null and draw_code = v_code))
  order by (draw_date = v_date) desc
  limit 1;

  if v_draw_id is null then
    insert into lottery_draws (source_id, lottery_name, lottery_code, draw_code, draw_date, source_url, import_method)
    values (p_source_id, v_lottery, nullif(p_draw->>'lottery_code', ''), v_code, v_date, p_draw->>'source_url', coalesce(p_import_method, 'scrape'))
    on conflict do nothing
    returning id into v_draw_id;

    if v_draw_id is null then
      -- lost a race with a concurrent insert
      select id into v_draw_id from lottery_draws where lottery_name = v_lottery and draw_date = v_date;
    else
      v_created := true;
    end if;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_draw->'results', '[]'::jsonb))
  loop
    insert into lottery_results (draw_id, source_id, prize_category, prize_rank, winning_number, normalized_number)
    values (
      v_draw_id,
      p_source_id,
      r->>'prize_category',
      coalesce((r->>'prize_rank')::smallint, 99),
      r->>'winning_number',
      r->>'normalized_number'
    )
    on conflict on constraint lottery_results_unique do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then v_inserted := v_inserted + 1; else v_duplicates := v_duplicates + 1; end if;
  end loop;

  return jsonb_build_object(
    'draw_id', v_draw_id,
    'draw_created', v_created,
    'inserted', v_inserted,
    'duplicates', v_duplicates
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Views (security_invoker so RLS of the underlying tables applies)
-- ---------------------------------------------------------------------------
create or replace view public.v_results
with (security_invoker = true) as
select
  r.id,
  r.draw_id,
  d.lottery_name,
  d.lottery_code,
  d.draw_code,
  d.draw_date,
  r.prize_category,
  r.prize_rank,
  r.winning_number,
  r.normalized_number,
  coalesce(r.source_id, d.source_id) as source_id,
  d.import_method,
  r.created_at
from public.lottery_results r
join public.lottery_draws d on d.id = r.draw_id;

create or replace view public.v_lottery_stats
with (security_invoker = true) as
select
  d.lottery_name,
  count(distinct d.id) as draws,
  count(r.id) as results,
  min(d.draw_date) as first_draw,
  max(d.draw_date) as last_draw,
  count(distinct d.id) filter (where d.draw_date >= date_trunc('month', now())::date) as draws_this_month,
  count(r.id) filter (where d.draw_date >= date_trunc('month', now())::date) as results_this_month
from public.lottery_draws d
left join public.lottery_results r on r.draw_id = d.id
group by d.lottery_name;

create or replace view public.v_source_health
with (security_invoker = true) as
select
  s.id,
  s.name,
  s.url,
  s.lottery_name,
  s.active,
  s.last_fetched_at,
  s.last_successful_fetch_at,
  (select count(*) from public.fetch_logs l where l.source_id = s.id) as fetch_count,
  (select count(*) from public.fetch_logs l where l.source_id = s.id and not l.success) as failure_count,
  (select coalesce(sum(l.duplicates_skipped), 0) from public.fetch_logs l where l.source_id = s.id) as duplicates_skipped,
  (select coalesce(sum(l.invalid_numbers), 0) from public.fetch_logs l where l.source_id = s.id) as invalid_numbers,
  (select l.success from public.fetch_logs l where l.source_id = s.id order by l.fetched_at desc limit 1) as last_fetch_success,
  (select l.error_message from public.fetch_logs l where l.source_id = s.id order by l.fetched_at desc limit 1) as last_error,
  (select count(*) from public.lottery_draws d where d.source_id = s.id) as draws
from public.lottery_sources s;

-- Distinct lotteries/prizes for filters (cheap compared with scanning results client-side).
create or replace function public.list_lotteries()
returns table (lottery_name text, draws bigint, last_draw date)
language sql
stable
security invoker
set search_path = public
as $$
  select lottery_name, count(*) as draws, max(draw_date) as last_draw
  from lottery_draws
  group by lottery_name
  order by lottery_name;
$$;

create or replace function public.list_prize_categories(p_lottery text default null)
returns table (prize_category text, prize_rank smallint, results bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select r.prize_category, min(r.prize_rank)::smallint, count(*)
  from lottery_results r
  join lottery_draws d on d.id = r.draw_id
  where p_lottery is null or d.lottery_name = p_lottery
  group by r.prize_category
  order by 2;
$$;
