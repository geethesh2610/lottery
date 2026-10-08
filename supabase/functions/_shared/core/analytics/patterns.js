// Per-number structural features.

export function digitSum(num) {
  let s = 0;
  for (const ch of num) s += ch.charCodeAt(0) - 48;
  return s;
}

export function oddCount(num) {
  let c = 0;
  for (const ch of num) if ((ch.charCodeAt(0) - 48) % 2 === 1) c += 1;
  return c;
}

export function oddEvenLabel(num) {
  const odd = oddCount(num);
  return `${odd}/${num.length - odd}`;
}

/** Sorted multiplicities of repeated digits, e.g. "112234" -> [2, 2]. */
export function repeatSignature(num) {
  const counts = new Array(10).fill(0);
  for (const ch of num) counts[ch.charCodeAt(0) - 48] += 1;
  return counts.filter((c) => c > 1).sort((a, b) => b - a);
}

const KIND = { 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six' };

export function repeatPatternLabel(num) {
  return labelForSignature(repeatSignature(num));
}

/** Label for sorted multiplicities (>1) of repeated digits. */
export function labelForSignature(sig) {
  if (!sig.length) return 'No repetition';
  const pairs = sig.filter((c) => c === 2).length;
  const big = sig.filter((c) => c > 2);
  if (!big.length) return ['', 'One pair', 'Two pairs', 'Three pairs'][pairs];
  if (big.length === 2 && big[0] === 3 && big[1] === 3) return 'Two triples';
  const head = `${KIND[big[0]] || big[0]}-of-a-kind`;
  return pairs ? `${head} + ${pairs === 1 ? 'pair' : `${pairs} pairs`}` : head;
}

/** Longest run of adjacent digits that step by +1 or by -1 consistently. */
export function longestConsecutiveRun(num) {
  let best = 1;
  let run = 1;
  let dir = 0;
  for (let i = 1; i < num.length; i++) {
    const diff = num.charCodeAt(i) - num.charCodeAt(i - 1);
    if ((diff === 1 || diff === -1) && (run === 1 || diff === dir)) {
      run += 1;
      dir = diff;
    } else if (diff === 1 || diff === -1) {
      run = 2;
      dir = diff;
    } else {
      run = 1;
      dir = 0;
    }
    if (run > best) best = run;
  }
  return best;
}

export function consecutiveLabel(num) {
  const run = longestConsecutiveRun(num);
  if (run <= 1) return 'No sequence';
  if (run >= 4) return '4+ in sequence';
  return `${run} in sequence`;
}

export const CONSECUTIVE_LABELS = ['No sequence', '2 in sequence', '3 in sequence', '4+ in sequence'];

/** All maximal sequences (length >= 2) in a number, e.g. "123790" -> ["123"]. */
export function findSequences(num) {
  const out = [];
  let start = 0;
  let dir = 0;
  for (let i = 1; i <= num.length; i++) {
    const diff = i < num.length ? num.charCodeAt(i) - num.charCodeAt(i - 1) : 0;
    const continues = (diff === 1 || diff === -1) && (i - start === 1 || diff === dir);
    if (continues) {
      dir = diff;
      continue;
    }
    if (i - start >= 2) out.push(num.slice(start, i));
    start = (diff === 1 || diff === -1) ? i - 1 : i;
    dir = diff;
  }
  return out;
}
