import { LotteryParser } from './LotteryParser.js';
import { KNOWN_LOTTERIES, CODE_TO_LOTTERY } from '../constants/lotteries.js';
import { normalizePrizeCategory, prizeInfo, prizeRank } from '../constants/prizes.js';
import { findDates } from '../utils/dates.js';
import { cleanWinningNumber, normalizeNumber } from '../utils/numbers.js';
import { normalizeLotteryName, normalizeDrawCode } from '../utils/text.js';

const PRIZE_HEADING_RE =
  /\b(?:(\d{1,2})\s*(?:st|nd|rd|th)|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)|(consolation|cons\.))\s*prize\b/gi;

const FOOTER_RE =
  /(prize winners are requested|verify the winning numbers|winners? should verify|check with the (?:kerala )?gazette|next draw|next result)/i;

const SERIES_NUMBER_RE = /\b([A-Z]{1,2})\s?-?\s?(\d{6})\b/g;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Removes amounts, dates, codes, agent details etc. so only ticket numbers remain. */
function scrubSection(text) {
  let s = text;
  s = s.replace(/[^\n]*\b(?:agent|agency)\b[^\n]*/gi, ' ');
  s = s.replace(/\([^)]*\)/g, ' ');
  for (const d of findDates(s)) s = s.replace(d.raw, ' ');
  s = s.replace(/(?:Rs\.?|₹|INR)\s*[:.]?\s*[\d,]+(?:\.\d+)?\s*(?:\/-)?(?:\s*(?:lakhs?|crores?))?/gi, ' ');
  s = s.replace(/\d[\d,]*(?:\.\d+)?\s*(?:lakhs?|crores?|rupees)/gi, ' ');
  s = s.replace(/\b[A-Z]{1,3}-\d{1,4}\b/g, ' ');
  s = s.replace(/\b\d{1,3}\s*\)/g, ' ');
  s = s.replace(/\/-/g, ' ');
  return s;
}

/** Keeps a section's lines until prose resumes after the numbers. */
function trimSectionToNumbers(sectionText) {
  const lines = sectionText.split('\n');
  const kept = [];
  let seenNumbers = false;
  for (const [i, line] of lines.entries()) {
    const hasNumber = /\d{4}/.test(line);
    const words = line.replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/).filter((w) => w.length > 2);
    if (i > 0 && seenNumbers && !hasNumber && words.length >= 4) break;
    if (hasNumber) seenNumbers = true;
    kept.push(line);
  }
  return kept.join('\n');
}

export class GenericHtmlParser extends LotteryParser {
  static id = 'generic-html';

  static canParse() {
    return true;
  }

  parseLotteryName(ctx, draw) {
    const scores = new Map();
    const sources = [
      { text: [ctx.title, ...ctx.headings].join('\n'), weight: 5 },
      { text: ctx.text, weight: 1 },
    ];
    const byLength = [...KNOWN_LOTTERIES].sort((a, b) => b.name.length - a.name.length);
    for (const { text, weight } of sources) {
      let remaining = text;
      for (const l of byLength) {
        const pattern = escapeRegex(l.name).replace(/\\? /g, '[\\s-]*');
        const re = new RegExp(`\\b${pattern}\\b`, 'gi');
        const count = (remaining.match(re) || []).length;
        if (count) {
          scores.set(l.name, (scores.get(l.name) || 0) + count * weight);
          remaining = remaining.replace(re, ' ');
        }
      }
    }
    // A draw code prefix (e.g. KN-512) is strong evidence.
    const fromCode = draw?.prefix && CODE_TO_LOTTERY[draw.prefix];
    if (fromCode && fromCode !== 'Christmas New Year Bumper') {
      scores.set(fromCode, (scores.get(fromCode) || 0) + 10);
    }
    let best = null;
    for (const [name, score] of scores) if (!best || score > best.score) best = { name, score };
    if (best) {
      const known = KNOWN_LOTTERIES.find((l) => l.name === best.name);
      return { name: best.name, code: draw?.prefix || known?.code || null };
    }

    const m = ctx.text.match(/\b([A-Za-z][A-Za-z+\- ]{2,30}?)\s+lottery\s*(?:no\b|draw|result)/i);
    if (m) return { name: normalizeLotteryName(m[1]), code: draw?.prefix ?? null };
    if (ctx.lotteryNameHint) return { name: normalizeLotteryName(ctx.lotteryNameHint), code: draw?.prefix ?? null };
    return null;
  }

  parseDrawNumber(ctx) {
    const haystack = [ctx.title, ...ctx.headings, ctx.text].join('\n');
    const labelled = haystack.match(
      /(?:lottery\s*no\.?|draw\s*(?:no\.?|number|code)?|\bno\.)\s*[:\-]?\s*([A-Z]{1,3}\s*[-‐–]\s*\d{1,4})/i,
    );
    let code = labelled ? normalizeDrawCode(labelled[1].replace(/[‐–]/g, '-')) : null;
    if (!code) {
      const known = new Set(KNOWN_LOTTERIES.map((l) => l.code));
      const re = /\b([A-Z]{1,3})-(\d{1,4})\b/g;
      let m;
      while ((m = re.exec(haystack))) {
        if (known.has(m[1])) {
          code = normalizeDrawCode(m[0]);
          break;
        }
      }
    }
    return code ? { code, prefix: code.split('-')[0] } : null;
  }

  parseDrawDate(ctx) {
    const text = [ctx.title, ...ctx.headings, ctx.text].join('\n');
    const dates = findDates(text);
    if (!dates.length) return null;
    const labelRe = /(held\s+on|draw\s+date|drawn\s+on|date\s+of\s+draw|result\s+date|dated?)\s*[:\-]*/gi;
    let m;
    while ((m = labelRe.exec(text))) {
      const near = dates.find((d) => d.index >= m.index && d.index - m.index <= 60);
      if (near) return near.value;
    }
    const firstPrize = text.search(PRIZE_HEADING_RE);
    PRIZE_HEADING_RE.lastIndex = 0;
    const before = dates.filter((d) => firstPrize < 0 || d.index < firstPrize);
    return (before[0] || dates[0]).value;
  }

  parsePrizeResults(ctx) {
    let text = ctx.text;
    const headings = [];
    PRIZE_HEADING_RE.lastIndex = 0;
    let m;
    while ((m = PRIZE_HEADING_RE.exec(text))) {
      const category = normalizePrizeCategory(m[0]);
      if (category) headings.push({ category, index: m.index, end: m.index + m[0].length });
    }
    if (!headings.length) return { results: [], invalid: 0 };

    const footer = text.slice(headings[0].index).search(FOOTER_RE);
    if (footer >= 0) text = text.slice(0, headings[0].index + footer);

    const results = [];
    const seen = new Set();
    let invalid = 0;
    headings.forEach((h, i) => {
      if (h.index >= text.length) return;
      const end = i + 1 < headings.length ? Math.min(headings[i + 1].index, text.length) : text.length;
      const section = scrubSection(trimSectionToNumbers(text.slice(h.end, end)));
      const expected = prizeInfo(h.category)?.digits ?? 6;

      const found = [];
      SERIES_NUMBER_RE.lastIndex = 0;
      let s;
      while ((s = SERIES_NUMBER_RE.exec(section))) found.push(`${s[1]} ${s[2]}`);
      if (!found.length) {
        for (const n of section.match(/\b\d{4,6}\b/g) || []) {
          if (n.length === expected) found.push(n);
          else if (n.length !== 5) invalid += 1; // 5-digit tokens are never ticket numbers
        }
      }
      for (const raw of found) {
        const winning = cleanWinningNumber(raw);
        const normalized = normalizeNumber(raw);
        if (!winning || normalized.length !== expected) {
          invalid += 1;
          continue;
        }
        const key = `${h.category}|${winning}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          prize_category: h.category,
          prize_rank: prizeRank(h.category),
          winning_number: winning,
          normalized_number: normalized,
        });
      }
    });
    return { results, invalid };
  }
}
