-- Row Level Security.
-- Lottery results are public information, so anyone with the anon key may READ.
-- Only signed-in users may WRITE. Edge Functions use the service role (bypasses RLS).

alter table public.lottery_sources enable row level security;
alter table public.lottery_draws enable row level security;
alter table public.lottery_results enable row level security;
alter table public.fetch_logs enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_runs enable row level security;
alter table public.analytics_snapshots enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'lottery_sources', 'lottery_draws', 'lottery_results', 'fetch_logs',
    'predictions', 'prediction_runs', 'analytics_snapshots'
  ]
  loop
    execute format('drop policy if exists "%1$s_read" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I', t);

    execute format('create policy "%1$s_read" on public.%1$I for select to anon, authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (true)', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (true)', t);
  end loop;
end;
$$;

-- Explicit grants (new Supabase projects may not auto-expose new tables).
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

revoke execute on function public.ingest_draw(uuid, jsonb, text) from public, anon;
grant execute on function public.ingest_draw(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.list_lotteries() to anon, authenticated, service_role;
grant execute on function public.list_prize_categories(text) to anon, authenticated, service_role;
