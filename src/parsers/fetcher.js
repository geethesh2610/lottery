import { parseRobots, checkRobots } from '../utils/robots.js';

export const USER_AGENT = 'KeralaLotteryPatternAnalyzer/1.0 (personal research; respects robots.txt)';

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Detects access controls we must NOT try to bypass (Cloudflare challenges,
 * CAPTCHA pages, logins, paywalls). Returns a reason string or null.
 */
export function detectAccessBlock(status, headers, body) {
  const get = (h) => (typeof headers?.get === 'function' ? headers.get(h) : headers?.[h]);
  const text = String(body || '').slice(0, 20000).toLowerCase();
  if (get('cf-mitigated') === 'challenge' || /just a moment\.\.\.|cf-challenge|challenge-platform|cf_chl_/.test(text)) {
    return 'The site presented a Cloudflare/bot challenge. It was not bypassed.';
  }
  if (/g-recaptcha|h-captcha|hcaptcha|captcha-container|are you a robot|verify you are human/.test(text)) {
    return 'The site requires a CAPTCHA. It was not bypassed.';
  }
  if (status === 401 || status === 407) return 'The page requires authentication. It was not bypassed.';
  if (status === 402 || /subscribe to (?:continue|read)|paywall/.test(text)) return 'The page appears to be behind a paywall.';
  if (status === 403) return 'Access forbidden (HTTP 403).';
  if (status === 429) return 'Rate limited by the site (HTTP 429). Try again later.';
  return null;
}

/**
 * Creates a polite fetcher: robots.txt aware, rate limited, with timeouts.
 * `fetchImpl` and `sleep` are injectable for tests.
 */
export function createFetcher({
  fetchImpl = globalThis.fetch,
  userAgent = USER_AGENT,
  minDelayMs = 1500,
  timeoutMs = 20000,
  sleep = sleepMs,
} = {}) {
  const robotsCache = new Map();
  let lastRequestAt = 0;

  async function throttle(extraDelaySec) {
    const delay = Math.max(minDelayMs, (extraDelaySec || 0) * 1000);
    const wait = lastRequestAt + delay - Date.now();
    if (lastRequestAt && wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  }

  async function rawFetch(url) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await fetchImpl(url, {
        headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: controller?.signal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function robotsFor(url) {
    const origin = new URL(url).origin;
    if (!robotsCache.has(origin)) {
      let groups = [];
      try {
        const res = await rawFetch(`${origin}/robots.txt`);
        if (res.ok) groups = parseRobots(await res.text());
      } catch {
        // robots.txt unreachable -> treat as no rules
      }
      robotsCache.set(origin, groups);
    }
    return robotsCache.get(origin);
  }

  async function fetchPage(url) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
      if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error('bad protocol');
    } catch {
      return { ok: false, url, status: null, error: 'Invalid URL. Use a public http(s) address.' };
    }
    const robots = checkRobots(await robotsFor(url), userAgent, parsedUrl.pathname + parsedUrl.search);
    if (!robots.allowed) {
      return { ok: false, url, status: null, blocked: true, error: 'robots.txt disallows fetching this page. Skipped.' };
    }
    await throttle(robots.crawlDelay);
    let res;
    try {
      res = await rawFetch(url);
    } catch (e) {
      const msg = e?.name === 'AbortError' ? `Timed out after ${timeoutMs / 1000}s` : e?.message || String(e);
      return { ok: false, url, status: null, error: `Network error: ${msg}` };
    }
    const contentType = res.headers?.get?.('content-type') || '';
    const body = /pdf|image|octet-stream/i.test(contentType) ? '' : await res.text();
    const blockedReason = detectAccessBlock(res.status, res.headers, body);
    if (blockedReason) return { ok: false, url, status: res.status, blocked: true, error: blockedReason };
    if (!res.ok) return { ok: false, url, status: res.status, error: `HTTP ${res.status}` };
    if (/pdf/i.test(contentType)) {
      return { ok: false, url, status: res.status, error: 'PDF result files are not supported. Use an HTML result page or CSV import.' };
    }
    return { ok: true, url: res.url || url, status: res.status, html: body, contentType };
  }

  return { fetchPage };
}
