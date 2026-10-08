import {
  prepareNumbers,
  calculateDigitFrequency,
  calculatePositionFrequency,
  calculateLastDigitFrequency,
  calculateLastTwoDigitFrequency,
  calculateDigitSum,
  calculateOddEvenDistribution,
  calculateRepeatedDigitPatterns,
  calculateConsecutiveDigitPatterns,
  calculateNumberDistribution,
  rollingWindowAnalysis,
} from './frequency.js';
import { MIN_SAMPLE_SIZE, INSUFFICIENT_DATA_MESSAGE, SIGNIFICANCE_LEVEL } from '../constants/app.js';

export * from './stats.js';
export * from './patterns.js';
export * from './theory.js';
export * from './frequency.js';

/**
 * Full analysis for one lottery + prize. `entries` are { draw_date, number }
 * where number is the normalized digit string.
 */
export function analyzeEntries(entries, { windowSize = 50, step = 10 } = {}) {
  const { numbers, length } = prepareNumbers(entries.map((e) => e.number));
  const kept = entries.filter((e) => e.number?.length === length);
  const dates = kept.map((e) => e.draw_date).sort();
  const report = {
    sampleSize: numbers.length,
    length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    insufficient: numbers.length < MIN_SAMPLE_SIZE,
    insufficientMessage: numbers.length < MIN_SAMPLE_SIZE ? INSUFFICIENT_DATA_MESSAGE : null,
    digitFrequency: calculateDigitFrequency(numbers),
    positionFrequency: calculatePositionFrequency(numbers, length),
    lastDigit: calculateLastDigitFrequency(numbers),
    lastTwoDigits: calculateLastTwoDigitFrequency(numbers),
    digitSum: calculateDigitSum(numbers, length),
    oddEven: calculateOddEvenDistribution(numbers, length),
    repeated: calculateRepeatedDigitPatterns(numbers, length),
    consecutive: calculateConsecutiveDigitPatterns(numbers, length),
    numberDistribution: calculateNumberDistribution(numbers, 10, length),
    rolling: rollingWindowAnalysis(kept, { windowSize, step }),
  };
  report.multipleTesting = summarizeTests(report);
  return report;
}

/** Counts significant tests and applies a Bonferroni correction across them. */
export function summarizeTests(report) {
  const tests = [
    ['Digit frequency', report.digitFrequency.test],
    ...report.positionFrequency.positions.map((p) => [`Position ${p.position}`, p.test]),
    ['Last digit', report.lastDigit.test],
    ['Last two digits', report.lastTwoDigits.test],
    ['Digit sum', report.digitSum.test],
    ['Odd/even', report.oddEven.test],
    ['Repeated digits', report.repeated.test],
    ['Consecutive digits', report.consecutive.test],
    ['Number ranges', report.numberDistribution.test],
  ].filter(([, t]) => t && !t.insufficient && t.pValue != null);
  const alpha = tests.length ? SIGNIFICANCE_LEVEL / tests.length : SIGNIFICANCE_LEVEL;
  return {
    testsRun: tests.length,
    bonferroniAlpha: alpha,
    nominallySignificant: tests.filter(([, t]) => t.pValue < SIGNIFICANCE_LEVEL).map(([n]) => n),
    significantAfterCorrection: tests.filter(([, t]) => t.pValue < alpha).map(([n]) => n),
    expectedFalsePositives: tests.length * SIGNIFICANCE_LEVEL,
  };
}
