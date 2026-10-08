// Comparison metrics between predicted candidates and an actual result.

export function positionMatches(a, b) {
  let m = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) m += 1;
  return m;
}

/** Order-insensitive digit overlap (multiset intersection size). */
export function digitOverlap(a, b) {
  const counts = new Array(10).fill(0);
  for (const ch of a) counts[ch.charCodeAt(0) - 48] += 1;
  let m = 0;
  for (const ch of b) {
    const d = ch.charCodeAt(0) - 48;
    if (counts[d] > 0) {
      counts[d] -= 1;
      m += 1;
    }
  }
  return m;
}

/** Best-of-candidates metrics for one actual number. */
export function evaluateCandidates(candidates, actual) {
  let exact = false;
  let bestPos = 0;
  let bestDigits = 0;
  let last1 = false;
  let last2 = false;
  for (const c of candidates) {
    if (c.length !== actual.length) continue;
    if (c === actual) exact = true;
    bestPos = Math.max(bestPos, positionMatches(c, actual));
    bestDigits = Math.max(bestDigits, digitOverlap(c, actual));
    if (c.slice(-1) === actual.slice(-1)) last1 = true;
    if (c.slice(-2) === actual.slice(-2)) last2 = true;
  }
  return {
    exact_match: exact,
    position_matches: bestPos,
    matching_digits: bestDigits,
    last_digit_match: last1,
    last_two_match: last2,
  };
}
