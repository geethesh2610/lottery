const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

function iso(y, m, d) {
  const year = y < 100 ? 2000 + y : y;
  if (m < 1 || m > 12 || d < 1 || d > 31 || year < 1990 || year > 2100) return null;
  const dt = new Date(Date.UTC(year, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31/02
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const PATTERNS = [
  // 2024-03-12
  { re: /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, f: (m) => iso(+m[1], +m[2], +m[3]) },
  // 12/03/2024, 12-03-2024, 12.03.2024 (Indian day-first convention)
  { re: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g, f: (m) => iso(+m[3], +m[2], +m[1]) },
  // 12 March 2024, 12th Mar, 2024
  {
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(${MONTH_NAMES})\\.?[\\s,-]+(\\d{4})\\b`, 'gi'),
    f: (m) => iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]),
  },
  // March 12, 2024
  {
    re: new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi'),
    f: (m) => iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]),
  },
];

/** Returns all ISO dates found in text with their index, in order of appearance. */
export function findDates(text) {
  const found = [];
  const taken = [];
  for (const { re, f } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      const value = f(m);
      if (value) {
        found.push({ value, index: start, raw: m[0] });
        taken.push([start, end]);
      }
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Parses a single date string (any supported format) to "YYYY-MM-DD" or null. */
export function parseDate(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  const found = findDates(s);
  return found.length ? found[0].value : null;
}

export function toDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function addDays(isoDate, days) {
  const d = toDate(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekday(isoDate) {
  return toDate(isoDate).getUTCDay();
}

export function monthKey(isoDate) {
  return isoDate.slice(0, 7);
}

export function startOfMonth(isoDate) {
  return `${isoDate.slice(0, 7)}-01`;
}

export function todayIso(now = new Date()) {
  // Draws happen in India; use IST (UTC+5:30) to decide "today".
  const ist = new Date(now.getTime() + 330 * 60000);
  return ist.toISOString().slice(0, 10);
}

function dominantWeekday(dates) {
  const counts = new Array(7).fill(0);
  for (const d of dates) counts[weekday(d)] += 1;
  const best = counts.indexOf(Math.max(...counts));
  return { best, share: counts[best] / dates.length };
}

/**
 * Infers the weekly draw weekday from history (most common weekday) and returns
 * the next draw date strictly after `after`.
 */
export function inferNextDrawDate(drawDates, after = todayIso()) {
  if (!drawDates?.length) return null;
  const { best } = dominantWeekday(drawDates);
  let next = addDays(after, 1);
  while (weekday(next) !== best) next = addDays(next, 1);
  return next;
}

/** Dates on the dominant weekday between first and last draw that have no draw. */
export function findMissingDrawDates(drawDates) {
  if (!drawDates || drawDates.length < 3) return [];
  const sorted = [...new Set(drawDates)].sort();
  const { best, share } = dominantWeekday(sorted);
  // Only meaningful if the lottery is clearly weekly.
  if (share < 0.8) return [];
  const have = new Set(sorted);
  const missing = [];
  let d = sorted[0];
  while (weekday(d) !== best) d = addDays(d, 1);
  for (; d <= sorted[sorted.length - 1]; d = addDays(d, 7)) {
    if (!have.has(d)) missing.push(d);
  }
  return missing;
}
