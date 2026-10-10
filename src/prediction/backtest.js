import { MODELS, findModel } from './models.js';
import { generateCandidates } from './generate.js';
import { evaluateCandidates, digitOverlap } from './evaluation.js';
import { binomialUpperTail, zTestGreater, mean } from '../analytics/stats.js';
import { maxPositionMatchDistribution } from '../analytics/theory.js';
import { startOfMonth } from '../utils/dates.js';
import { dominantLength } from '../utils/numbers.js';
import { mulberry32, randomNumberString } from '../utils/random.js';
import { SIGNIFICANCE_LEVEL, MIN_SAMPLE_SIZE, NO_ADVANTAGE_MESSAGE, INSUFFICIENT_DATA_MESSAGE } from '../constants/app.js';

export class DataLeakageError extends Error {}

/** Throws if any training row is on/after the cutoff date. */
export function assertNoLeakage(training, cutoff) {
  for (const t of training) {
    if (t.draw_date >= cutoff) {
      throw new DataLeakageError(`Data leakage: training row dated ${t.draw_date} is not before cutoff ${cutoff}`);
    }
  }
}

/** One target per draw (first listed number), chronological. */
export function buildTargets(entries, length) {
  const byDate = new Map();
  for (const e of [...entries].sort((a, b) => (a.draw_date < b.draw_date ? -1 : a.draw_date > b.draw_date ? 1 : 0))) {
    if (e.number?.length !== length) continue;
    if (!byDate.has(e.draw_date)) byDate.set(e.draw_date, e);
  }
  return [...byDate.values()];
}

const digitOverlapCache = new Map();
/** Monte Carlo baseline for best digit overlap among k random candidates. */
export function randomDigitOverlapBaseline(length, k, trials = 20000) {
  const key = `${length}|${k}`;
  if (digitOverlapCache.has(key)) return digitOverlapCache.get(key);
  const rng = mulberry32(12345 + length * 100 + k);
  const values = [];
  for (let t = 0; t < trials; t++) {
    const actual = randomNumberString(length, rng);
    let best = 0;
    for (let c = 0; c < k; c++) best = Math.max(best, digitOverlap(randomNumberString(length, rng), actual));
    values.push(best);
  }
  const m = mean(values);
  const v = values.reduce((a, x) => a + (x - m) ** 2, 0) / (values.length - 1);
  const result = { mean: m, variance: v };
  digitOverlapCache.set(key, result);
  return result;
}

/** Theoretical performance of k uniformly random candidates. */
export function theoreticalBaseline(length, k) {
  const pos = maxPositionMatchDistribution(length, k);
  const dig = randomDigitOverlapBaseline(length, k);
  return {
    exactRate: 1 - (1 - 10 ** -length) ** k,
    lastDigitRate: 1 - 0.9 ** k,
    lastTwoRate: 1 - 0.99 ** k,
    meanPositionMatches: pos.mean,
    positionVariance: pos.variance,
    meanDigitMatches: dig.mean,
    digitVariance: dig.variance,
  };
}

/**
 * Walk-forward backtest. For every target draw, models are trained ONLY on
 * draws strictly before the cutoff:
 *   mode 'draw'  -> cutoff = target draw date (retrain before every draw)
 *   mode 'month' -> cutoff = first day of the target's month (train Jan–Jun, predict July, ...)
 */
export async function runBacktest(entries, options = {}) {
  const {
    modelIds = MODELS.map((m) => m.id),
    mode = 'month',
    minTrainSize = MIN_SAMPLE_SIZE,
    count = 10,
    samples = 800,
    seed = 'backtest',
    maxSteps = null,
    onProgress = null,
    yieldEvery = 5,
  } = options;

  const length = options.length ?? dominantLength(entries.map((e) => e.number).filter(Boolean));
  const all = entries.filter((e) => e.number?.length === length);
  const targets = buildTargets(all, length);
  const sorted = [...all].sort((a, b) => (a.draw_date < b.draw_date ? -1 : 1));

  let eligible = targets.filter((t) => {
    const cutoff = mode === 'month' ? startOfMonth(t.draw_date) : t.draw_date;
    return sorted.filter((e) => e.draw_date < cutoff).length >= minTrainSize;
  });
  if (maxSteps && eligible.length > maxSteps) eligible = eligible.slice(-maxSteps);

  const steps = [];
  const candidateCache = new Map();
  for (const [i, target] of eligible.entries()) {
    const cutoff = mode === 'month' ? startOfMonth(target.draw_date) : target.draw_date;
    const training = sorted.filter((e) => e.draw_date < cutoff);
    assertNoLeakage(training, cutoff);
    if (target.draw_date < cutoff) throw new DataLeakageError('Target precedes cutoff');

    const step = { draw_date: target.draw_date, cutoff, trainingSize: training.length, actual: target.number, models: {} };
    for (const modelId of modelIds) {
      const cacheKey = `${modelId}|${cutoff}`;
      if (!candidateCache.has(cacheKey)) {
        candidateCache.set(
          cacheKey,
          generateCandidates(modelId, training, { length, count, samples, seed: `${seed}|${cutoff}` }).map((c) => c.number),
        );
      }
      const candidates = candidateCache.get(cacheKey);
      step.models[modelId] = { ...evaluateCandidates(candidates, target.number), top: candidates[0], candidates };
    }
    steps.push(step);
    if (onProgress) onProgress({ done: i + 1, total: eligible.length });
    if (yieldEvery && (i + 1) % yieldEvery === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return {
    config: { modelIds, mode, minTrainSize, count, samples, seed, length },
    trainingStart: sorted[0]?.draw_date ?? null,
    trainingEnd: eligible.length ? eligible[eligible.length - 1].draw_date : null,
    steps,
    summary: summarizeBacktest(steps, { modelIds, length, count }),
  };
}

/** Aggregates step metrics and tests each model against the random baseline. */
export function summarizeBacktest(steps, { modelIds, length, count }) {
  const n = steps.length;
  const baseline = length ? theoreticalBaseline(length, count) : null;
  const testedModels = modelIds.filter((id) => id !== 'random');
  const comparisons = Math.max(1, testedModels.length * 5);
  const alpha = SIGNIFICANCE_LEVEL / comparisons;

  const models = modelIds.map((id) => {
    const rows = steps.map((s) => s.models[id]).filter(Boolean);
    const hits = (k) => rows.filter((r) => r[k]).length;
    const exact = hits('exact_match');
    const last1 = hits('last_digit_match');
    const last2 = hits('last_two_match');
    const meanPos = mean(rows.map((r) => r.position_matches)) ?? 0;
    const meanDig = mean(rows.map((r) => r.matching_digits)) ?? 0;
    const tests = baseline && n
      ? {
          exact: binomialUpperTail(exact, n, baseline.exactRate),
          lastDigit: binomialUpperTail(last1, n, baseline.lastDigitRate),
          lastTwo: binomialUpperTail(last2, n, baseline.lastTwoRate),
          positionMatches: zTestGreater(meanPos, n, baseline.meanPositionMatches, baseline.positionVariance).pValue,
          digitMatches: zTestGreater(meanDig, n, baseline.meanDigitMatches, baseline.digitVariance).pValue,
        }
      : {};
    const minP = Math.min(...Object.values(tests).filter((p) => p != null), 1);
    const isBaseline = id === 'random';
    const significant = !isBaseline && n >= MIN_SAMPLE_SIZE && minP < alpha;
    return {
      modelId: id,
      name: findModel(id)?.name ?? id,
      steps: n,
      exactMatches: exact,
      exactRate: n ? exact / n : 0,
      lastDigitHits: last1,
      lastDigitRate: n ? last1 / n : 0,
      lastTwoHits: last2,
      lastTwoRate: n ? last2 / n : 0,
      meanPositionMatches: meanPos,
      meanDigitMatches: meanDig,
      pValues: tests,
      minPValue: minP,
      significant,
    };
  });

  const insufficient = n < MIN_SAMPLE_SIZE;
  const winners = models.filter((m) => m.significant);
  return {
    steps: n,
    baseline,
    alpha,
    comparisons,
    models,
    insufficient,
    verdict: insufficient
      ? INSUFFICIENT_DATA_MESSAGE
      : winners.length
        ? `Possible advantage for ${winners.map((w) => w.name).join(', ')} (p < ${alpha.toPrecision(2)} after Bonferroni correction). Re-test on new data before trusting it.`
        : NO_ADVANTAGE_MESSAGE,
    advantageDetected: !insufficient && winners.length > 0,
  };
}

/** Rolling mean of a metric per model, for charts. */
export function rollingPerformance(steps, modelIds, metric = 'position_matches', window = 20) {
  const out = [];
  for (let i = window - 1; i < steps.length; i++) {
    const slice = steps.slice(i - window + 1, i + 1);
    const point = { draw_date: steps[i].draw_date };
    for (const id of modelIds) {
      const vals = slice.map((s) => Number(s.models[id]?.[metric] ?? 0));
      point[id] = Number(mean(vals).toFixed(3));
    }
    out.push(point);
  }
  return out;
}
