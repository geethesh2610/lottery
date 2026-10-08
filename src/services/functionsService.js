import { getSupabase } from './supabaseClient.js';

/** Invokes an Edge Function and returns its JSON, with readable errors. */
export async function invokeFunction(name, body) {
  const { data, error } = await getSupabase().functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const payload = await error.context?.json?.();
      if (payload?.error) message = payload.error;
    } catch {
      // keep default message
    }
    if (/Failed to send a request|FunctionsFetchError/i.test(message)) {
      message = `Could not reach the "${name}" Edge Function. Has it been deployed (npm run db:setup)?`;
    }
    throw new Error(message);
  }
  return data;
}

export function runDailyNow() {
  return invokeFunction('daily-run', { trigger: 'manual' });
}

export async function getScheduleStatus() {
  const { data, error } = await getSupabase().rpc('daily_schedule_status');
  if (error) throw new Error(error.message);
  return data;
}
