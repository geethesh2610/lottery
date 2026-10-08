// Lottery numbers are ALWAYS handled as strings so leading zeros survive
// ("012345" must never become 12345).

const TICKET_RE = /^([A-Z]{1,3})?\s*-?\s*(\d{4,6})$/;

/**
 * Cleans a raw winning number for display/storage, e.g. " pj-012345 " -> "PJ 012345",
 * "0123" -> "0123". Returns null if the value does not look like a ticket number.
 */
export function cleanWinningNumber(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return null; // numeric input may already have lost zeros
  const s = String(raw).toUpperCase().replace(/ /g, ' ').trim().replace(/\s+/g, ' ');
  const m = s.match(TICKET_RE);
  if (!m) return null;
  return m[1] ? `${m[1]} ${m[2]}` : m[2];
}

/** Digits-only form used for analytics: "PJ 012345" -> "012345". */
export function normalizeNumber(raw) {
  const cleaned = cleanWinningNumber(raw);
  if (!cleaned) return null;
  return cleaned.replace(/^[A-Z]+\s*/, '');
}

export function seriesOf(raw) {
  const cleaned = cleanWinningNumber(raw);
  const m = cleaned && cleaned.match(/^([A-Z]+)\s/);
  return m ? m[1] : null;
}

export function isValidNormalized(num, expectedLength) {
  if (typeof num !== 'string' || !/^\d{4,6}$/.test(num)) return false;
  return expectedLength ? num.length === expectedLength : true;
}

/** Pads a digits-only string to a length (opt-in only: used for CSV repair). */
export function padNumber(num, length) {
  const s = String(num ?? '').trim();
  if (!/^\d+$/.test(s) || s.length > length) return null;
  return s.padStart(length, '0');
}

export function digitsOf(num) {
  return String(num).split('').map(Number);
}

/** Most common length among numbers (used to pick 6- vs 4-digit analysis). */
export function dominantLength(numbers) {
  const counts = {};
  for (const n of numbers) counts[n.length] = (counts[n.length] || 0) + 1;
  let best = null;
  for (const [len, c] of Object.entries(counts)) {
    if (best == null || c > counts[best]) best = len;
  }
  return best == null ? null : Number(best);
}
