import { createClient } from 'npm:@supabase/supabase-js@2';

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically into
// every Edge Function by Supabase. The service role key never leaves the server.
export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not available to the function');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Authorizes a request: either the scheduled job (x-cron-secret header) or a
 * signed-in user (Authorization: Bearer <user access token>).
 * Returns { kind: 'cron' | 'user', user? } or null.
 */
export async function authorize(req, admin) {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const header = req.headers.get('x-cron-secret');
  if (cronSecret && header && timingSafeEqual(header, cronSecret)) return { kind: 'cron' };

  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { kind: 'user', user: data.user };
}
