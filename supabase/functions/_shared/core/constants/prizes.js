// Canonical prize categories, ordered by rank. `digits` is the length of the
// numeric part normally published for that prize (lower prizes publish only
// the last 4 digits).
export const PRIZE_CATEGORIES = [
  { key: '1st Prize', rank: 1, digits: 6 },
  { key: 'Consolation Prize', rank: 2, digits: 6 },
  { key: '2nd Prize', rank: 3, digits: 6 },
  { key: '3rd Prize', rank: 4, digits: 6 },
  { key: '4th Prize', rank: 5, digits: 4 },
  { key: '5th Prize', rank: 6, digits: 4 },
  { key: '6th Prize', rank: 7, digits: 4 },
  { key: '7th Prize', rank: 8, digits: 4 },
  { key: '8th Prize', rank: 9, digits: 4 },
  { key: '9th Prize', rank: 10, digits: 4 },
  { key: '10th Prize', rank: 11, digits: 4 },
];

export const DEFAULT_PRIZE = '1st Prize';

const ORDINAL_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const SUFFIX = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

/** Normalizes labels like "FIRST PRIZE", "1st prize Rs 75 Lakhs", "Cons. Prize". */
export function normalizePrizeCategory(label) {
  if (label == null) return null;
  const s = String(label).toLowerCase().trim();
  if (/consol|cons\.?\s*prize/.test(s)) return 'Consolation Prize';
  const num = s.match(/\b(\d{1,2})\s*(st|nd|rd|th)\b/);
  if (num) {
    const n = Number(num[1]);
    return n >= 1 && n <= 10 ? `${n}${SUFFIX(n)} Prize` : null;
  }
  for (const [word, n] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(s)) return `${n}${SUFFIX(n)} Prize`;
  }
  const bare = s.match(/^(?:prize\s*)?(\d{1,2})$/);
  if (bare) {
    const n = Number(bare[1]);
    return n >= 1 && n <= 10 ? `${n}${SUFFIX(n)} Prize` : null;
  }
  return null;
}

export function prizeInfo(category) {
  return PRIZE_CATEGORIES.find((p) => p.key === category) || null;
}

export function prizeRank(category) {
  return prizeInfo(category)?.rank ?? 99;
}
