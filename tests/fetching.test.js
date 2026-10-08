import { describe, expect, it } from 'vitest';
import { parseRobots, checkRobots } from '../src/utils/robots.js';
import { createFetcher, detectAccessBlock, createImportState, runImportStep } from '../src/parsers/index.js';
import { CLOUDFLARE_CHALLENGE, CAPTCHA_PAGE, OFFICIAL_STYLE, resultPage } from './fixtures/html.js';

function mockResponse(body, { status = 200, headers = {}, url } = {}) {
  const h = new Map(Object.entries({ 'content-type': 'text/html', ...headers }));
  return { ok: status >= 200 && status < 300, status, url, headers: { get: (k) => h.get(k.toLowerCase()) ?? null }, text: async () => body };
}

function mockFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) return mockResponse('not found', { status: 404 });
    if (route instanceof Error) throw route;
    return typeof route === 'string' ? mockResponse(route, { url }) : mockResponse(route.body, { ...route, url });
  };
  return { impl, calls };
}

const noSleep = async () => {};

describe('robots.txt', () => {
  const groups = parseRobots(`
User-agent: *
Disallow: /private
Allow: /private/public
Disallow: /*.pdf$
Crawl-delay: 3

User-agent: BadBot
Disallow: /
`);

  it('applies the longest matching rule', () => {
    expect(checkRobots(groups, 'KeralaLotteryPatternAnalyzer', '/results').allowed).toBe(true);
    expect(checkRobots(groups, 'KeralaLotteryPatternAnalyzer', '/private/x').allowed).toBe(false);
    expect(checkRobots(groups, 'KeralaLotteryPatternAnalyzer', '/private/public/x').allowed).toBe(true);
    expect(checkRobots(groups, 'KeralaLotteryPatternAnalyzer', '/a/result.pdf').allowed).toBe(false);
    expect(checkRobots(groups, 'KeralaLotteryPatternAnalyzer', '/').crawlDelay).toBe(3);
  });

  it('uses agent-specific groups', () => {
    expect(checkRobots(groups, 'BadBot/1.0', '/results').allowed).toBe(false);
  });
});

describe('access-control detection (never bypassed)', () => {
  it('detects Cloudflare challenges, CAPTCHAs, logins and rate limits', () => {
    expect(detectAccessBlock(503, {}, CLOUDFLARE_CHALLENGE)).toMatch(/Cloudflare/);
    expect(detectAccessBlock(200, { 'cf-mitigated': 'challenge' }, '')).toMatch(/Cloudflare/);
    expect(detectAccessBlock(200, {}, CAPTCHA_PAGE)).toMatch(/CAPTCHA/);
    expect(detectAccessBlock(401, {}, '')).toMatch(/authentication/);
    expect(detectAccessBlock(429, {}, '')).toMatch(/Rate limited/);
    expect(detectAccessBlock(200, {}, OFFICIAL_STYLE)).toBeNull();
  });
});

describe('polite fetcher', () => {
  it('refuses URLs disallowed by robots.txt without requesting them', async () => {
    const { impl, calls } = mockFetch({ 'https://s.example/robots.txt': 'User-agent: *\nDisallow: /results', 'https://s.example/results/1': OFFICIAL_STYLE });
    const { fetchPage } = createFetcher({ fetchImpl: impl, sleep: noSleep });
    const res = await fetchPage('https://s.example/results/1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/robots\.txt/);
    expect(calls).toEqual(['https://s.example/robots.txt']);
  });

  it('fetches allowed pages and caches robots.txt', async () => {
    const { impl, calls } = mockFetch({ 'https://s.example/a': OFFICIAL_STYLE, 'https://s.example/b': OFFICIAL_STYLE });
    const { fetchPage } = createFetcher({ fetchImpl: impl, sleep: noSleep });
    expect((await fetchPage('https://s.example/a')).ok).toBe(true);
    expect((await fetchPage('https://s.example/b')).ok).toBe(true);
    expect(calls.filter((c) => c.endsWith('robots.txt'))).toHaveLength(1);
  });

  it('waits between requests', async () => {
    const waits = [];
    const { impl } = mockFetch({ 'https://s.example/a': 'x', 'https://s.example/b': 'y' });
    const { fetchPage } = createFetcher({ fetchImpl: impl, minDelayMs: 1500, sleep: async (ms) => waits.push(ms) });
    await fetchPage('https://s.example/a');
    await fetchPage('https://s.example/b');
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThan(1000);
  });

  it('reports blocked pages and network errors', async () => {
    const { impl } = mockFetch({
      'https://s.example/cf': { body: CLOUDFLARE_CHALLENGE, status: 503 },
      'https://s.example/down': new Error('ECONNRESET'),
      'https://s.example/pdf': { body: '', headers: { 'content-type': 'application/pdf' } },
    });
    const { fetchPage } = createFetcher({ fetchImpl: impl, sleep: noSleep });
    expect((await fetchPage('https://s.example/cf')).blocked).toBe(true);
    expect((await fetchPage('https://s.example/down')).error).toMatch(/Network error/);
    expect((await fetchPage('https://s.example/pdf')).error).toMatch(/PDF/);
    expect((await fetchPage('ftp://s.example/x')).error).toMatch(/Invalid URL/);
  });
});

describe('historical import crawler', () => {
  const pages = {};
  for (let n = 10; n >= 1; n--) {
    pages[`https://s.example/results/kn-${n}`] = resultPage({ name: 'Karunya Plus', code: 'KN', n, date: `${String(n).padStart(2, '0')}/01/2024`, first: `0${String(n).padStart(5, '0')}` });
  }

  it('follows archive links, stops at maxPages and counts duplicates', async () => {
    const { impl } = mockFetch(pages);
    const { fetchPage } = createFetcher({ fetchImpl: impl, sleep: noSleep });
    const stored = new Set();
    const ingest = async (parsed) => {
      let inserted = 0;
      let duplicates = 0;
      for (const r of parsed.results) {
        const key = `${parsed.lottery_name}|${parsed.draw_date}|${r.prize_category}|${r.winning_number}`;
        if (stored.has(key)) duplicates += 1;
        else {
          stored.add(key);
          inserted += 1;
        }
      }
      return { inserted, duplicates };
    };

    let state = createImportState('https://s.example/results/kn-10', { maxPages: 6 });
    let steps = 0;
    while (!state.done) {
      state = await runImportStep(state, { fetchPage, ingest, lotteryName: 'Karunya Plus', pagesPerStep: 2 });
      steps += 1;
      expect(steps).toBeLessThan(10);
    }
    expect(state.pagesFetched).toBe(6);
    expect(state.drawsFound).toBe(6);
    expect(state.inserted).toBe(18); // 6 draws × (1st + two 4th prizes)
    expect(state.errors).toBe(0);
    // JSON round trip (state travels between browser and Edge Function).
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);

    // Re-importing the same pages creates only duplicates.
    let again = createImportState('https://s.example/results/kn-10', { maxPages: 3 });
    while (!again.done) again = await runImportStep(again, { fetchPage, ingest, lotteryName: 'Karunya Plus' });
    expect(again.inserted).toBe(0);
    expect(again.duplicates).toBe(9);
  });

  it('skips pages for other lotteries and records errors', async () => {
    const { impl } = mockFetch({
      'https://s.example/start': resultPage({ name: 'Akshaya', code: 'AK', n: 5, date: '01/02/2024', first: '123456' }),
    });
    const { fetchPage } = createFetcher({ fetchImpl: impl, sleep: noSleep });
    let state = createImportState('https://s.example/start', { maxPages: 5 });
    while (!state.done) state = await runImportStep(state, { fetchPage, ingest: async () => ({ inserted: 1, duplicates: 0 }), lotteryName: 'Karunya Plus' });
    expect(state.skippedOtherLottery).toBe(1);
    expect(state.errors).toBe(1); // the linked AK-4 page is a 404
    expect(state.inserted).toBe(0);
  });
});
