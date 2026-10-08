import { describe, expect, it } from 'vitest';
import {
  calculateDigitFrequency, calculatePositionFrequency, calculateLastDigitFrequency, calculateLastTwoDigitFrequency,
  calculateDigitSum, calculateOddEvenDistribution, calculateRepeatedDigitPatterns, calculateConsecutiveDigitPatterns,
  calculateNumberDistribution, rollingWindowAnalysis, analyzeEntries,
  chiSquarePValue, chiSquareTest, binomialUpperTail, normalCdf, mean, median, mode,
  theoreticalDistributions, repeatPatternLabel, consecutiveLabel, findSequences, digitSum, oddCount, maxPositionMatchDistribution,
} from '../src/analytics/index.js';
import { mockEntries } from './fixtures/mockData.js';

describe('statistics primitives', () => {
  it('computes chi-square p-values matching reference tables', () => {
    expect(chiSquarePValue(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(16.919, 9)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(21.666, 9)).toBeCloseTo(0.01, 3);
    expect(chiSquarePValue(0, 9)).toBe(1);
  });

  it('computes binomial tails and the normal CDF', () => {
    expect(binomialUpperTail(0, 10, 0.5)).toBe(1);
    expect(binomialUpperTail(10, 10, 0.5)).toBeCloseTo(1 / 1024, 8);
    expect(binomialUpperTail(6, 10, 0.5)).toBeCloseTo(0.376953, 5);
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });

  it('computes descriptive statistics', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(mode([1, 2, 2, 3, 3])).toBe(2);
  });

  it('flags insufficient samples instead of testing', () => {
    const t = chiSquareTest([1, 0, 2], [1 / 3, 1 / 3, 1 / 3]);
    expect(t.insufficient).toBe(true);
    expect(t.pValue).toBeNull();
  });

  it('merges small expected cells', () => {
    const t = chiSquareTest([10, 10, 1, 1], [0.45, 0.45, 0.05, 0.05]);
    expect(t.insufficient).toBe(false);
    expect(t.cells).toBe(2);
  });
});

describe('pattern classifiers', () => {
  it('classifies repeated digits', () => {
    expect(repeatPatternLabel('012345')).toBe('No repetition');
    expect(repeatPatternLabel('112345')).toBe('One pair');
    expect(repeatPatternLabel('112235')).toBe('Two pairs');
    expect(repeatPatternLabel('112233')).toBe('Three pairs');
    expect(repeatPatternLabel('111234')).toBe('Three-of-a-kind');
    expect(repeatPatternLabel('111224')).toBe('Three-of-a-kind + pair');
    expect(repeatPatternLabel('111222')).toBe('Two triples');
    expect(repeatPatternLabel('111123')).toBe('Four-of-a-kind');
    expect(repeatPatternLabel('000000')).toBe('Six-of-a-kind');
  });

  it('classifies consecutive sequences', () => {
    expect(consecutiveLabel('135792')).toBe('No sequence');
    expect(consecutiveLabel('120579')).toBe('2 in sequence');
    expect(consecutiveLabel('912340')).toBe('4+ in sequence');
    expect(consecutiveLabel('987105')).toBe('3 in sequence');
    expect(consecutiveLabel('121212')).toBe('2 in sequence');
    expect(findSequences('123790')).toEqual(['123']);
    expect(findSequences('1210')).toEqual(['12', '210']);
  });

  it('computes digit sums and odd counts', () => {
    expect(digitSum('012345')).toBe(15);
    expect(oddCount('013579')).toBe(5);
  });
});

describe('theoretical distributions', () => {
  it('match brute-force enumeration for 4-digit numbers', () => {
    const t = theoreticalDistributions(4);
    const counts = { repeat: {}, consecutive: {}, sum: new Array(37).fill(0), odd: new Array(5).fill(0) };
    for (let i = 0; i < 10000; i++) {
      const n = String(i).padStart(4, '0');
      counts.repeat[repeatPatternLabel(n)] = (counts.repeat[repeatPatternLabel(n)] || 0) + 1;
      counts.consecutive[consecutiveLabel(n)] = (counts.consecutive[consecutiveLabel(n)] || 0) + 1;
      counts.sum[digitSum(n)] += 1;
      counts.odd[oddCount(n)] += 1;
    }
    for (const [k, v] of Object.entries(counts.repeat)) expect(t.repeat[k]).toBeCloseTo(v / 10000, 10);
    for (const [k, v] of Object.entries(counts.consecutive)) expect(t.consecutive[k]).toBeCloseTo(v / 10000, 10);
    counts.sum.forEach((v, i) => expect(t.digitSum[i]).toBeCloseTo(v / 10000, 10));
    counts.odd.forEach((v, i) => expect(t.oddCount[i]).toBeCloseTo(v / 10000, 10));
  });

  it('sums to one for 6-digit numbers', () => {
    const t = theoreticalDistributions(6);
    const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(total(t.repeat)).toBeCloseTo(1, 10);
    expect(total(t.consecutive)).toBeCloseTo(1, 10);
    expect(t.repeat['No repetition']).toBeCloseTo(151200 / 1e6, 10);
  });

  it('computes the best-of-k position match distribution', () => {
    const d = maxPositionMatchDistribution(6, 1);
    expect(d.mean).toBeCloseTo(0.6, 10);
    expect(maxPositionMatchDistribution(6, 10).mean).toBeGreaterThan(d.mean);
  });
});

describe('frequency analytics', () => {
  const numbers = ['012345', '012345', '999999', '000001'];

  it('counts digits, positions, last digits and last two digits', () => {
    const digit = calculateDigitFrequency(numbers);
    expect(digit.sampleSize).toBe(24);
    expect(digit.rows[0].observed).toBe(7);
    expect(digit.rows[9].observed).toBe(6);
    expect(digit.rows[0].expected).toBeCloseTo(2.4);

    const pos = calculatePositionFrequency(numbers);
    expect(pos.positions).toHaveLength(6);
    expect(pos.positions[0].rows[0].observed).toBe(3);

    expect(calculateLastDigitFrequency(numbers).rows[5].observed).toBe(2);
    expect(calculateLastTwoDigitFrequency(numbers).rows[45].observed).toBe(2);
  });

  it('summarizes digit sums', () => {
    const s = calculateDigitSum(numbers);
    expect(s.summary).toMatchObject({ min: 1, max: 54, median: 15, mode: 15, expectedMean: 27 });
  });

  it('computes odd/even, repeat, consecutive and range distributions', () => {
    expect(calculateOddEvenDistribution(numbers).rows.map((r) => r.label)).toEqual(['6/0', '5/1', '4/2', '3/3', '2/4', '1/5', '0/6']);
    expect(calculateOddEvenDistribution(numbers).rows.find((r) => r.label === '6/0').observed).toBe(1);
    expect(calculateRepeatedDigitPatterns(numbers).rows.find((r) => r.label === 'Six-of-a-kind').observed).toBe(1);
    const consec = calculateConsecutiveDigitPatterns(numbers);
    expect(consec.rows.find((r) => r.label === '4+ in sequence').observed).toBe(2);
    expect(consec.topSequences[0].sequence).toBe('012345');
    expect(calculateNumberDistribution(numbers).rows[0].observed).toBe(3);
  });

  it('reports insufficient data for small samples', () => {
    expect(calculateDigitFrequency(numbers).verdict.message).toBe('Insufficient historical data.');
  });

  it('does not flag uniformly random data after correction', () => {
    const report = analyzeEntries(mockEntries({ count: 400, seed: 7 }));
    expect(report.sampleSize).toBe(400);
    expect(report.insufficient).toBe(false);
    expect(report.digitFrequency.test.pValue).toBeGreaterThan(0.001);
    expect(report.multipleTesting.significantAfterCorrection).toEqual([]);
  });

  it('detects a strongly biased digit', () => {
    const biased = mockEntries({ count: 200, seed: 3 }).map((e) => ({ ...e, number: `7${e.number.slice(1)}` }));
    const report = analyzeEntries(biased);
    expect(report.positionFrequency.positions[0].test.pValue).toBeLessThan(1e-10);
    expect(report.multipleTesting.significantAfterCorrection).toContain('Position 1');
  });

  it('runs rolling-window analysis chronologically', () => {
    const r = rollingWindowAnalysis(mockEntries({ count: 120 }), { windowSize: 50, step: 10 });
    expect(r.windows).toHaveLength(8);
    expect(r.windows[0].start < r.windows[1].start).toBe(true);
    expect(rollingWindowAnalysis(mockEntries({ count: 20 }), { windowSize: 50 }).insufficient).toBe(true);
  });
});
