import { describe, expect, it } from 'vitest';
import { runBacktest, assertNoLeakage, DataLeakageError, summarizeBacktest, theoreticalBaseline, buildTargets, rollingPerformance, MODELS } from '../src/prediction/index.js';
import { mockEntries } from './fixtures/mockData.js';
import { NO_ADVANTAGE_MESSAGE, INSUFFICIENT_DATA_MESSAGE } from '../src/constants/app.js';

const entries = mockEntries({ count: 140, seed: 5, startDate: '2022-01-03' });

describe('data leakage prevention', () => {
  it('assertNoLeakage throws on rows at or after the cutoff', () => {
    expect(() => assertNoLeakage([{ draw_date: '2024-01-01' }], '2024-01-02')).not.toThrow();
    expect(() => assertNoLeakage([{ draw_date: '2024-01-02' }], '2024-01-02')).toThrow(DataLeakageError);
  });

  it.each(['draw', 'month'])('never trains on the target draw or later (%s mode)', async (mode) => {
    // Spy model: records the newest training date it was given for each target.
    const spy = MODELS.find((m) => m.id === 'recent');
    const originalTrain = spy.train;
    const seen = [];
    spy.train = (history, opts) => {
      seen.push(history.reduce((max, h) => (h.draw_date > max ? h.draw_date : max), ''));
      return originalTrain(history, opts);
    };
    try {
      const res = await runBacktest(entries, { modelIds: ['recent'], mode, samples: 50, yieldEvery: 0 });
      expect(res.steps.length).toBeGreaterThan(50);
      for (const step of res.steps) {
        expect(step.cutoff <= step.draw_date).toBe(true);
        if (mode === 'month') expect(step.cutoff).toBe(`${step.draw_date.slice(0, 7)}-01`);
      }
      const maxCutoff = res.steps[res.steps.length - 1].cutoff;
      expect(seen.every((d) => d < maxCutoff)).toBe(true);
    } finally {
      spy.train = originalTrain;
    }
  });

  it('an oracle that copies the newest training number cannot see the answer', async () => {
    // If future rows leaked, a model returning the latest training number would hit exact matches.
    const oracle = MODELS.find((m) => m.id === 'random');
    const { train, propose, score } = oracle;
    oracle.train = (history, opts) => ({ ...opts, last: history[history.length - 1]?.number });
    oracle.propose = (state) => state.last;
    oracle.score = () => ({ score: 1, features: { reason: 'oracle' } });
    try {
      const res = await runBacktest(entries, { modelIds: ['random'], mode: 'draw', count: 1, samples: 5, yieldEvery: 0 });
      const exact = res.steps.filter((s) => s.models.random.exact_match).length;
      expect(exact).toBe(0);
    } finally {
      Object.assign(oracle, { train, propose, score });
    }
  });
});

describe('walk-forward backtest', () => {
  it('trains on Jan→Jun to predict July, then Jan→Jul for August, …', async () => {
    const res = await runBacktest(entries, { modelIds: ['recent', 'random'], mode: 'month', minTrainSize: 26, samples: 100, yieldEvery: 0 });
    const july = res.steps.find((s) => s.draw_date.startsWith('2022-07'));
    const aug = res.steps.find((s) => s.draw_date.startsWith('2022-08'));
    expect(july.trainingSize).toBe(entries.filter((e) => e.draw_date < '2022-07-01').length);
    expect(aug.trainingSize).toBeGreaterThan(july.trainingSize);
    // All draws within a month share the same training set.
    const julySteps = res.steps.filter((s) => s.draw_date.startsWith('2022-07'));
    expect(new Set(julySteps.map((s) => s.trainingSize)).size).toBe(1);
  });

  it('computes metrics and finds no advantage on random data', async () => {
    const res = await runBacktest(entries, { mode: 'draw', samples: 150, yieldEvery: 0 });
    const s = res.summary;
    expect(s.models).toHaveLength(MODELS.length);
    for (const m of s.models) {
      expect(m.steps).toBe(res.steps.length);
      expect(m.lastDigitRate).toBeGreaterThanOrEqual(0);
      expect(m.meanPositionMatches).toBeGreaterThanOrEqual(0);
      expect(Object.keys(m.pValues)).toEqual(['exact', 'lastDigit', 'lastTwo', 'positionMatches', 'digitMatches']);
    }
    expect(s.advantageDetected).toBe(false);
    expect(s.verdict).toBe(NO_ADVANTAGE_MESSAGE);
    expect(rollingPerformance(res.steps, ['recent'], 'position_matches', 20)).toHaveLength(res.steps.length - 19);
  });

  it('reports insufficient data for short histories', async () => {
    const res = await runBacktest(entries.slice(0, 40), { mode: 'draw', modelIds: ['recent'], samples: 50, yieldEvery: 0 });
    expect(res.summary.insufficient).toBe(true);
    expect(res.summary.verdict).toBe(INSUFFICIENT_DATA_MESSAGE);
  });

  it('flags a model that genuinely beats the baseline', () => {
    const steps = Array.from({ length: 100 }, (_, i) => ({
      draw_date: `2024-${String(1 + (i % 12)).padStart(2, '0')}-01`,
      models: {
        good: { exact_match: false, position_matches: 4, matching_digits: 6, last_digit_match: true, last_two_match: true },
        random: { exact_match: false, position_matches: 2, matching_digits: 4, last_digit_match: i % 3 !== 0, last_two_match: false },
      },
    }));
    // 'good' is not a registered model id, so register a temporary alias.
    MODELS.push({ id: 'good', letter: 'G', name: 'Good test model' });
    try {
      const s = summarizeBacktest(steps, { modelIds: ['good', 'random'], length: 6, count: 10 });
      expect(s.models[0].significant).toBe(true);
      expect(s.advantageDetected).toBe(true);
    } finally {
      MODELS.pop();
    }
  });

  it('computes the theoretical random baseline', () => {
    const b = theoreticalBaseline(6, 10);
    expect(b.lastDigitRate).toBeCloseTo(1 - 0.9 ** 10, 10);
    expect(b.meanDigitMatches).toBeGreaterThan(3);
    expect(b.meanDigitMatches).toBeLessThan(5);
  });

  it('uses one target per draw', () => {
    const dup = [...entries.slice(0, 3), { ...entries[0], number: '999999' }];
    expect(buildTargets(dup, 6)).toHaveLength(3);
  });
});
