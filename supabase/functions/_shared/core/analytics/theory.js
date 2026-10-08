// Exact distributions under the null hypothesis that every digit position is an
// independent uniform draw from 0-9. Computed combinatorially / by dynamic
// programming (fast enough for Edge Function CPU limits) and cached.
import { labelForSignature } from './patterns.js';

const cache = new Map();

function factorial(n) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** Integer partitions of n with parts in non-increasing order. */
function partitions(n, max = n) {
  if (n === 0) return [[]];
  const out = [];
  for (let p = Math.min(n, max); p >= 1; p--) {
    for (const rest of partitions(n - p, p)) out.push([p, ...rest]);
  }
  return out;
}

function digitSumDistribution(length) {
  let dist = [1];
  for (let i = 0; i < length; i++) {
    const next = new Array(dist.length + 9).fill(0);
    dist.forEach((p, s) => {
      for (let d = 0; d <= 9; d++) next[s + d] += p / 10;
    });
    dist = next;
  }
  return dist;
}

function oddCountDistribution(length) {
  return Array.from({ length: length + 1 }, (_, k) => (factorial(length) / (factorial(k) * factorial(length - k))) / 2 ** length);
}

function repeatDistribution(length) {
  const total = 10 ** length;
  const out = {};
  for (const parts of partitions(length)) {
    const k = parts.length; // distinct digits used
    if (k > 10) continue;
    const multiplicity = {};
    for (const p of parts) multiplicity[p] = (multiplicity[p] || 0) + 1;
    const digitChoices = factorial(10) / factorial(10 - k) / Object.values(multiplicity).reduce((a, m) => a * factorial(m), 1);
    const arrangements = factorial(length) / parts.reduce((a, p) => a * factorial(p), 1);
    const label = labelForSignature(parts.filter((p) => p > 1));
    out[label] = (out[label] || 0) + (digitChoices * arrangements) / total;
  }
  return out;
}

function consecutiveLabelForRun(run) {
  if (run <= 1) return 'No sequence';
  if (run >= 4) return '4+ in sequence';
  return `${run} in sequence`;
}

/** DP over (last digit, current run, direction, best run). */
function consecutiveDistribution(length) {
  let states = new Map();
  for (let d = 0; d <= 9; d++) states.set(`${d}|1|0|1`, 0.1);
  for (let i = 1; i < length; i++) {
    const next = new Map();
    for (const [key, p] of states) {
      const [d, run, dir, best] = key.split('|').map(Number);
      for (let x = 0; x <= 9; x++) {
        const diff = x - d;
        let r;
        let nd;
        if (diff === 1 || diff === -1) {
          r = run === 1 || diff === dir ? run + 1 : 2;
          nd = diff;
        } else {
          r = 1;
          nd = 0;
        }
        const k = `${x}|${r}|${nd}|${Math.max(best, r)}`;
        next.set(k, (next.get(k) || 0) + p / 10);
      }
    }
    states = next;
  }
  const out = {};
  for (const [key, p] of states) {
    const label = consecutiveLabelForRun(Number(key.split('|')[3]));
    out[label] = (out[label] || 0) + p;
  }
  return out;
}

export function theoreticalDistributions(length) {
  if (cache.has(length)) return cache.get(length);
  if (length < 1 || length > 6) throw new Error('length must be between 1 and 6');
  const result = {
    digitSum: digitSumDistribution(length),
    oddCount: oddCountDistribution(length),
    repeat: repeatDistribution(length),
    consecutive: consecutiveDistribution(length),
  };
  cache.set(length, result);
  return result;
}

/** Distribution of the best position-match count among k random candidates. */
export function maxPositionMatchDistribution(length, k) {
  const pmf = [];
  for (let m = 0; m <= length; m++) {
    pmf.push((factorial(length) / (factorial(m) * factorial(length - m))) * 0.1 ** m * 0.9 ** (length - m));
  }
  const cdf = pmf.map((_, m) => pmf.slice(0, m + 1).reduce((a, b) => a + b, 0));
  const maxPmf = cdf.map((F, m) => F ** k - (m ? cdf[m - 1] ** k : 0));
  const meanV = maxPmf.reduce((a, p, m) => a + p * m, 0);
  const varV = maxPmf.reduce((a, p, m) => a + p * (m - meanV) ** 2, 0);
  return { pmf: maxPmf, mean: meanV, variance: varV };
}
