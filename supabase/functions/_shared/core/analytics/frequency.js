import { chiSquareTest, mean, median, mode, sum } from './stats.js';
import { theoreticalDistributions } from './theory.js';
import {
  digitSum,
  oddCount,
  repeatPatternLabel,
  consecutiveLabel,
  findSequences,
  CONSECUTIVE_LABELS,
} from './patterns.js';
import { dominantLength } from '../utils/numbers.js';
import { MIN_SAMPLE_SIZE, SIGNIFICANCE_LEVEL, INSUFFICIENT_DATA_MESSAGE } from '../constants/app.js';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Keeps only digit strings of the given (or dominant) length. */
export function prepareNumbers(numbers, length = null) {
  const clean = numbers.filter((n) => typeof n === 'string' && /^\d+$/.test(n));
  const len = length ?? dominantLength(clean);
  return { numbers: clean.filter((n) => n.length === len), length: len };
}

function verdictFor(test, minSample = MIN_SAMPLE_SIZE) {
  if (test.insufficient || test.sampleSize < minSample) {
    return { level: 'insufficient', message: INSUFFICIENT_DATA_MESSAGE };
  }
  if (test.pValue < SIGNIFICANCE_LEVEL) {
    return {
      level: 'deviation',
      message: `Observed distribution differs from uniform randomness (p = ${test.pValue.toPrecision(3)}). With many tests run, some "significant" results are expected by chance.`,
    };
  }
  return {
    level: 'consistent',
    message: `Consistent with uniform randomness (p = ${test.pValue.toPrecision(3)}). Differences are within normal chance variation.`,
  };
}

/** Builds rows of observed vs expected plus a chi-square test. */
export function buildDistribution(labels, observed, expectedProbs, options = {}) {
  const n = sum(observed);
  const rows = labels.map((label, i) => {
    const expected = expectedProbs[i] * n;
    return {
      label,
      observed: observed[i],
      expected,
      observedShare: n ? observed[i] / n : 0,
      expectedShare: expectedProbs[i],
      deviation: observed[i] - expected,
      stdResidual: expected > 0 ? (observed[i] - expected) / Math.sqrt(expected) : 0,
    };
  });
  const test = chiSquareTest(observed, expectedProbs, options);
  if (n < (options.minSample ?? MIN_SAMPLE_SIZE)) test.insufficient = true;
  return { sampleSize: n, rows, test, verdict: verdictFor(test, options.minSample) };
}

/** Frequency of digits 0-9 across all positions. sampleSize counts digits. */
export function calculateDigitFrequency(numbers) {
  const counts = new Array(10).fill(0);
  for (const n of numbers) for (const ch of n) counts[ch.charCodeAt(0) - 48] += 1;
  return { ...buildDistribution(DIGITS, counts, new Array(10).fill(0.1)), numbersUsed: numbers.length };
}

/** Frequency of each digit at each position (one distribution per position). */
export function calculatePositionFrequency(numbers, length = null) {
  const { numbers: nums, length: len } = prepareNumbers(numbers, length);
  if (!len) return { length: 0, positions: [] };
  const positions = [];
  for (let p = 0; p < len; p++) {
    const counts = new Array(10).fill(0);
    for (const n of nums) counts[n.charCodeAt(p) - 48] += 1;
    positions.push({ position: p + 1, ...buildDistribution(DIGITS, counts, new Array(10).fill(0.1)) });
  }
  return { length: len, sampleSize: nums.length, positions };
}

export function calculateLastDigitFrequency(numbers) {
  const counts = new Array(10).fill(0);
  for (const n of numbers) counts[n.charCodeAt(n.length - 1) - 48] += 1;
  return buildDistribution(DIGITS, counts, new Array(10).fill(0.1));
}

export function calculateLastTwoDigitFrequency(numbers) {
  const labels = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
  const counts = new Array(100).fill(0);
  for (const n of numbers) if (n.length >= 2) counts[Number(n.slice(-2))] += 1;
  return buildDistribution(labels, counts, new Array(100).fill(0.01), { minSample: 100 });
}

export function calculateDigitSum(numbers, length = null) {
  const { numbers: nums, length: len } = prepareNumbers(numbers, length);
  if (!len) return { sampleSize: 0, summary: null, rows: [], test: { insufficient: true }, verdict: verdictFor({ insufficient: true }) };
  const sums = nums.map(digitSum);
  const theory = theoreticalDistributions(len).digitSum;
  const counts = new Array(theory.length).fill(0);
  for (const s of sums) counts[s] += 1;
  const labels = theory.map((_, i) => String(i));
  const dist = buildDistribution(labels, counts, theory, { ordered: true });
  const expectedMean = (9 * len) / 2;
  return {
    ...dist,
    summary: sums.length
      ? { min: Math.min(...sums), max: Math.max(...sums), mean: mean(sums), median: median(sums), mode: mode(sums), expectedMean }
      : null,
  };
}

export function calculateOddEvenDistribution(numbers, length = null) {
  const { numbers: nums, length: len } = prepareNumbers(numbers, length);
  if (!len) return buildDistribution([], [], []);
  const theory = theoreticalDistributions(len).oddCount;
  const counts = new Array(len + 1).fill(0);
  for (const n of nums) counts[oddCount(n)] += 1;
  // Present as "odd/even" from all-odd to all-even.
  const order = Array.from({ length: len + 1 }, (_, i) => len - i);
  return buildDistribution(
    order.map((o) => `${o}/${len - o}`),
    order.map((o) => counts[o]),
    order.map((o) => theory[o]),
  );
}

export function calculateRepeatedDigitPatterns(numbers, length = null) {
  const { numbers: nums, length: len } = prepareNumbers(numbers, length);
  if (!len) return buildDistribution([], [], []);
  const theory = theoreticalDistributions(len).repeat;
  const labels = Object.keys(theory).sort((a, b) => theory[b] - theory[a]);
  const counts = Object.fromEntries(labels.map((l) => [l, 0]));
  for (const n of nums) counts[repeatPatternLabel(n)] += 1;
  return buildDistribution(labels, labels.map((l) => counts[l]), labels.map((l) => theory[l]), { ordered: false });
}

export function calculateConsecutiveDigitPatterns(numbers, length = null) {
  const { numbers: nums, length: len } = prepareNumbers(numbers, length);
  if (!len) return { ...buildDistribution([], [], []), topSequences: [] };
  const theory = theoreticalDistributions(len).consecutive;
  const labels = CONSECUTIVE_LABELS.filter((l) => theory[l] > 0);
  const counts = Object.fromEntries(labels.map((l) => [l, 0]));
  const seqCounts = new Map();
  for (const n of nums) {
    counts[consecutiveLabel(n)] += 1;
    for (const s of findSequences(n)) seqCounts.set(s, (seqCounts.get(s) || 0) + 1);
  }
  const dist = buildDistribution(labels, labels.map((l) => counts[l]), labels.map((l) => theory[l]), { ordered: true });
  const topSequences = [...seqCounts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 10)
    .map(([sequence, count]) => ({ sequence, count }));
  return { ...dist, topSequences };
}

/** Distribution of numbers across equal-width ranges (e.g. 000000-099999). */
export function calculateNumberDistribution(numbers, buckets = 10, length = null) {
  const { numbers: nums, length: len } = prepareNumbers(numbers, length);
  if (!len) return buildDistribution([], [], []);
  const max = 10 ** len;
  const width = max / buckets;
  const counts = new Array(buckets).fill(0);
  for (const n of nums) counts[Math.min(buckets - 1, Math.floor(Number(n) / width))] += 1;
  const labels = counts.map((_, i) => {
    const lo = String(Math.round(i * width)).padStart(len, '0');
    const hi = String(Math.round((i + 1) * width) - 1).padStart(len, '0');
    return `${lo}–${hi}`;
  });
  return buildDistribution(labels, counts, new Array(buckets).fill(1 / buckets));
}

/**
 * Rolling-window analysis over chronologically ordered numbers: per window, the
 * chi-square p-value of the digit distribution and the "hottest" digit. Shows
 * whether apparent hot digits persist or drift (as expected under randomness).
 */
export function rollingWindowAnalysis(entries, { windowSize = 50, step = 10 } = {}) {
  const sorted = [...entries].sort((a, b) => (a.draw_date < b.draw_date ? -1 : a.draw_date > b.draw_date ? 1 : 0));
  const windows = [];
  for (let start = 0; start + windowSize <= sorted.length; start += step) {
    const slice = sorted.slice(start, start + windowSize);
    const freq = calculateDigitFrequency(slice.map((e) => e.number));
    const top = [...freq.rows].sort((a, b) => b.observed - a.observed)[0];
    windows.push({
      start: slice[0].draw_date,
      end: slice[slice.length - 1].draw_date,
      pValue: freq.test.pValue,
      topDigit: top?.label ?? null,
      topDigitShare: top?.observedShare ?? null,
      meanDigitSum: mean(slice.map((e) => digitSum(e.number))),
    });
  }
  const topDigits = new Set(windows.map((w) => w.topDigit));
  const significantWindows = windows.filter((w) => w.pValue != null && w.pValue < SIGNIFICANCE_LEVEL).length;
  return {
    windowSize,
    step,
    windows,
    insufficient: windows.length < 2,
    distinctTopDigits: topDigits.size,
    significantWindows,
    expectedSignificantByChance: windows.length * SIGNIFICANCE_LEVEL,
  };
}
