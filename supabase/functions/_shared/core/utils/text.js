import { KNOWN_LOTTERIES, LOTTERY_ALIASES } from '../constants/lotteries.js';

export function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** "KARUNYA PLUS LOTTERY" / "karunya-plus" -> "Karunya Plus". */
export function normalizeLotteryName(raw) {
  if (raw == null) return null;
  const s = String(raw)
    .replace(/ /g, ' ')
    .replace(/\blottery\b|\bresults?\b|\bkerala\b|\bstate\b/gi, ' ')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  const key = s.toLowerCase();
  const compact = key.replace(/\s+/g, '');
  if (LOTTERY_ALIASES[key]) return LOTTERY_ALIASES[key];
  if (LOTTERY_ALIASES[compact]) return LOTTERY_ALIASES[compact];
  const known = KNOWN_LOTTERIES.find((l) => l.name.toLowerCase() === key.replace(/-/g, ' '));
  if (known) return known.name;
  return titleCase(s.replace(/-/g, ' '));
}

/** "kn 512", "KN-512th" -> "KN-512". */
export function normalizeDrawCode(raw) {
  if (raw == null) return null;
  const m = String(raw).toUpperCase().match(/([A-Z]{1,3})\s*[-\s.]?\s*(\d{1,4})/);
  return m ? `${m[1]}-${Number(m[2])}` : null;
}
