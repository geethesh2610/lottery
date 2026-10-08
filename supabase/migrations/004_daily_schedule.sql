-- Daily automation: pg_cron triggers the `daily-run` Edge Function via pg_net.
-- The project URL and cron secret are stored in Supabase Vault (not in code).
-- `npm run db:setup` calls configure_daily_schedule() with the right values,
-- so nothing has to be created by hand.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.configure_daily_schedule(
  p_project_url text,
  p_cron_secret text,
  p_schedule text default '30 11 * * *'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, cron
as $$
declare
  v_job_id bigint;
  v_secret_id uuid;
begin
  if p_project_url !~* '^https?://' then
    raise exception 'p_project_url must be an http(s) URL';
  end if;
  if length(coalesce(p_cron_secret, '')) < 24 then
    raise exception 'p_cron_secret must be at least 24 characters';
  end if;

  select id into v_secret_id from vault.secrets where name = 'klpa_project_url';
  if v_secret_id is null then
    perform vault.create_secret(rtrim(p_project_url, '/'), 'klpa_project_url', 'Kerala Lottery Analyzer project URL');
  else
    perform vault.update_secret(v_secret_id, rtrim(p_project_url, '/'));
  end if;

  v_secret_id := null;
  select id into v_secret_id from vault.secrets where name = 'klpa_cron_secret';
  if v_secret_id is null then
    perform vault.create_secret(p_cron_secret, 'klpa_cron_secret', 'Kerala Lottery Analyzer cron secret');
  else
    perform vault.update_secret(v_secret_id, p_cron_secret);
  end if;

  if exists (select 1 from cron.job where jobname = 'klpa-daily-run') then
    perform cron.unschedule('klpa-daily-run');
  end if;

  select cron.schedule(
    'klpa-daily-run',
    p_schedule,
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'klpa_project_url') || '/functions/v1/daily-run',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'klpa_cron_secret')
        ),
        body := jsonb_build_object('trigger', 'schedule'),
        timeout_milliseconds := 300000
      );
    $job$
  ) into v_job_id;

  return jsonb_build_object('job_id', v_job_id, 'schedule', p_schedule);
end;
$$;

create or replace function public.daily_schedule_status()
returns jsonb
language sql
security definer
set search_path = public, cron
as $$
  select coalesce(
    (select jsonb_build_object(
       'scheduled', true,
       'schedule', j.schedule,
       'active', j.active,
       'last_run', (select jsonb_build_object('status', d.status, 'start_time', d.start_time, 'message', d.return_message)
                    from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1)
     )
     from cron.job j where j.jobname = 'klpa-daily-run'),
    jsonb_build_object('scheduled', false)
  );
$$;

revoke execute on function public.configure_daily_schedule(text, text, text) from public, anon, authenticated;
grant execute on function public.configure_daily_schedule(text, text, text) to service_role;
revoke execute on function public.daily_schedule_status() from public, anon;
grant execute on function public.daily_schedule_status() to authenticated, service_role;
