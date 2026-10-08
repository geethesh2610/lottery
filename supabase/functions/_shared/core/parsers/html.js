// Dependency-free HTML helpers. They run unchanged in the browser, Node (tests)
// and Deno (Edge Functions), so no DOM APIs are used.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", rupee: '₹' };

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

const BLOCK_TAGS = 'p|div|br|tr|li|ul|ol|h[1-6]|table|thead|tbody|section|article|header|footer|main|aside|nav|blockquote|pre|hr|dt|dd|form';

/** Converts HTML to plain text, keeping one line per block element. */
export function htmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n');
  s = s.replace(/<\/t[dh]>/gi, '  ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s).replace(/ /g, ' ');
  return s
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function extractTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

export function extractHeadings(html) {
  const out = [];
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return out;
}

/** All <a href> links resolved against baseUrl (fragments removed). */
export function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const href = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!href || /^(javascript|mailto|tel|data):/i.test(href) || href.startsWith('#')) continue;
    try {
      const url = new URL(href, baseUrl);
      if (!/^https?:$/.test(url.protocol)) continue;
      url.hash = '';
      const text = decodeEntities(m[4].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      links.push({ url: url.href, text });
    } catch {
      // ignore malformed URLs
    }
  }
  return links;
}
