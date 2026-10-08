import { createClient } from '@supabase/supabase-js';

// Only PUBLIC values (project URL + anon/publishable key) ever reach the browser.
// The service role key is used exclusively by scripts and Edge Functions.
const STORAGE_KEY = 'klpa.supabaseConfig';

function readStoredConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function getConfig() {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().match(/^https?:\/\/[^/\s]+/)?.[0];
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const valid = (v) => v && !/your-project-ref|your-anon/.test(v);
  if (valid(envUrl) && valid(envKey)) return { url: envUrl, anonKey: envKey, origin: 'env' };
  const stored = readStoredConfig();
  if (stored?.url && stored?.anonKey) return { ...stored, origin: 'browser' };
  return null;
}

export function saveBrowserConfig(url, anonKey) {
  if (/service_role/.test(atobSafe(anonKey))) {
    throw new Error('That is a service role key. Never put it in the browser — use the anon/publishable key.');
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }));
  } catch {
    throw new Error('Browser storage is unavailable. Put the values in .env instead.');
  }
  client = null;
}

export function clearBrowserConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  client = null;
}

function atobSafe(jwt) {
  try {
    return atob(String(jwt).split('.')[1] || '');
  } catch {
    return '';
  }
}

export function isConfigured() {
  return !!getConfig();
}

let client = null;

export function getSupabase() {
  if (client) return client;
  const config = getConfig();
  if (!config) throw new Error('Supabase is not configured.');
  client = createClient(config.url, config.anonKey);
  return client;
}

/** Throws a readable Error for a Supabase response error. */
export function unwrap({ data, error, count }) {
  if (error) throw new Error(error.message || String(error));
  return count !== undefined && count !== null ? { data, count } : data;
}
