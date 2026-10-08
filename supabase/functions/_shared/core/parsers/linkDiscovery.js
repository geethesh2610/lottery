import { extractLinks } from './html.js';

const ASSET_RE = /\.(?:pdf|jpe?g|png|gif|webp|svg|css|js|ico|zip|mp4|mp3|xml|json)(?:\?|$)/i;
const SKIP_RE = /(login|signin|signup|register|cart|account|privacy|terms|contact|about|facebook|twitter|whatsapp|share|wp-admin|feed|comment|tag\/|author\/)/i;
const RESULT_HINT_RE = /(result|draw|lottery|bumper|archive|old|previous|older|history|\d{1,2}[-_.]\d{1,2}[-_.]\d{2,4}|\d{4}[-_/]\d{1,2})/i;
const PAGINATION_RE = /(page[=/-]?\d+|\/page\/|older|previous|prev|next|more results|archive|«|»|‹|›)/i;

/**
 * Picks links on the same host that look like result pages or archive/pagination
 * links. `lotteryName` is used to prioritise relevant pages.
 */
export function discoverResultLinks(html, pageUrl, { lotteryName = null, sameHostOnly = true } = {}) {
  const base = new URL(pageUrl);
  const name = lotteryName ? lotteryName.toLowerCase().replace(/\s+/g, '[-_ ]?') : null;
  const nameRe = name ? new RegExp(name, 'i') : null;
  const seen = new Set();
  const out = [];
  for (const { url, text } of extractLinks(html, pageUrl)) {
    const u = new URL(url);
    if (sameHostOnly && u.host !== base.host) continue;
    if (url === pageUrl || seen.has(url)) continue;
    if (ASSET_RE.test(u.pathname) || SKIP_RE.test(url)) continue;
    const label = `${u.pathname}${u.search} ${text}`;
    const isPagination = PAGINATION_RE.test(label);
    const isResult = RESULT_HINT_RE.test(label);
    if (!isPagination && !isResult) continue;
    seen.add(url);
    let priority = 0;
    if (nameRe && nameRe.test(label)) priority += 3;
    if (isResult) priority += 1;
    if (isPagination) priority += 2;
    out.push({ url, text, priority, kind: isPagination ? 'pagination' : 'result' });
  }
  return out.sort((a, b) => b.priority - a.priority);
}
