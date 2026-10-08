// Experimental models. Each model:
//   train(history, { length }) -> state     history: [{ draw_date, number }] (chronological)
//   propose(state, rng)        -> candidate number string
//   score(state, number)       -> { score in [0,1], features }
// Scores are RANKING scores, not probabilities of winning.
import { sampleIndex, randomNumberString } from '../utils/random.js';
import { digitSum, oddCount, repeatPatternLabel } from '../analytics/patterns.js';
import { theoreticalDistributions } from '../analytics/theory.js';

const pct = (x) => `${(x * 100).toFixed(1)}%`;

function normalize(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((c) => c / total);
}

function geometricMean(values) {
  return Math.exp(values.reduce((a, v) => a + Math.log(Math.max(v, 1e-12)), 0) / values.length);
}

function topDigits(probs, k = 3) {
  return probs
    .map((p, d) => ({ d, p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, k);
}

function positionCounts(history, length, weightFn = () => 1) {
  const counts = Array.from({ length }, () => new Array(10).fill(1)); // Laplace smoothing
  history.forEach((h, i) => {
    if (h.number.length !== length) return;
    const w = weightFn(i, history.length);
    for (let p = 0; p < length; p++) counts[p][h.number.charCodeAt(p) - 48] += w;
  });
  return counts.map(normalize);
}

function positionModel({ id, letter, name, description, weightFn, reasonPrefix }) {
  return {
    id,
    letter,
    name,
    description,
    train(history, { length }) {
      const probs = positionCounts(history, length, weightFn);
      return { length, probs, maxes: probs.map((p) => Math.max(...p)) };
    },
    propose(state, rng) {
      return state.probs.map((p) => sampleIndex(p, rng)).join('');
    },
    score(state, num) {
      const ratios = [...num].map((ch, p) => state.probs[p][ch.charCodeAt(0) - 48] / state.maxes[p]);
      const best = state.probs.map((p) => p.indexOf(Math.max(...p))).join('');
      return {
        score: geometricMean(ratios),
        features: {
          positionShares: [...num].map((ch, p) => Number(state.probs[p][ch.charCodeAt(0) - 48].toFixed(4))),
          reason: `${reasonPrefix}; most frequent digit per position: ${best}`,
        },
      };
    },
  };
}

export const frequencyModel = {
  id: 'frequency',
  letter: 'A',
  name: 'Model A — Frequency',
  description: 'Samples digits in proportion to their overall historical frequency.',
  train(history, { length }) {
    const counts = new Array(10).fill(1);
    for (const h of history) for (const ch of h.number) counts[ch.charCodeAt(0) - 48] += 1;
    const probs = normalize(counts);
    return { length, probs, max: Math.max(...probs) };
  },
  propose(state, rng) {
    let s = '';
    for (let i = 0; i < state.length; i++) s += sampleIndex(state.probs, rng);
    return s;
  },
  score(state, num) {
    const shares = [...num].map((ch) => state.probs[ch.charCodeAt(0) - 48]);
    const top = topDigits(state.probs)
      .map((t) => `${t.d} (${pct(t.p)})`)
      .join(', ');
    return {
      score: geometricMean(shares.map((s) => s / state.max)),
      features: { digitShares: shares.map((s) => Number(s.toFixed(4))), reason: `Historically frequent digits: ${top}` },
    };
  },
};

export const positionModelB = positionModel({
  id: 'position',
  letter: 'B',
  name: 'Model B — Position frequency',
  description: 'Samples each position from that position’s historical digit frequency.',
  reasonPrefix: 'Per-position historical frequency',
});

export const RECENCY_HALF_LIFE = 20;

export const recentWeightedModel = positionModel({
  id: 'recent',
  letter: 'C',
  name: 'Model C — Recent weighted frequency',
  description: `Position frequency where each older draw counts less (half-life ${RECENCY_HALF_LIFE} draws).`,
  weightFn: (i, n) => 0.5 ** ((n - 1 - i) / RECENCY_HALF_LIFE),
  reasonPrefix: `Recency-weighted position frequency (half-life ${RECENCY_HALF_LIFE} draws)`,
});

const PSEUDO = 20; // pseudo-observations pulling feature histograms toward theory

export const distributionModel = {
  id: 'distribution',
  letter: 'D',
  name: 'Model D — Digit distribution',
  description: 'Ranks random candidates by how typical their digit sum, odd/even split and repetition pattern are historically.',
  train(history, { length }) {
    const theory = theoreticalDistributions(length);
    const nums = history.filter((h) => h.number.length === length).map((h) => h.number);
    const n = nums.length;
    const sumCounts = new Array(theory.digitSum.length).fill(0);
    const oddCounts = new Array(length + 1).fill(0);
    const repCounts = {};
    for (const x of nums) {
      sumCounts[digitSum(x)] += 1;
      oddCounts[oddCount(x)] += 1;
      const r = repeatPatternLabel(x);
      repCounts[r] = (repCounts[r] || 0) + 1;
    }
    const smooth = (count, prior) => (count + PSEUDO * prior) / (n + PSEUDO);
    const sumP = sumCounts.map((c, i) => smooth(c, theory.digitSum[i]));
    const oddP = oddCounts.map((c, i) => smooth(c, theory.oddCount[i]));
    const repP = Object.fromEntries(Object.entries(theory.repeat).map(([k, p]) => [k, smooth(repCounts[k] || 0, p)]));
    return {
      length,
      sumP,
      oddP,
      repP,
      maxSum: Math.max(...sumP),
      maxOdd: Math.max(...oddP),
      maxRep: Math.max(...Object.values(repP)),
    };
  },
  propose(state, rng) {
    return randomNumberString(state.length, rng);
  },
  score(state, num) {
    const s = digitSum(num);
    const o = oddCount(num);
    const r = repeatPatternLabel(num);
    const parts = [state.sumP[s] / state.maxSum, state.oddP[o] / state.maxOdd, (state.repP[r] || 0) / state.maxRep];
    return {
      score: geometricMean(parts),
      features: {
        digitSum: s,
        oddEven: `${o}/${num.length - o}`,
        repeatPattern: r,
        reason: `Digit sum ${s} (${pct(state.sumP[s])} of history), odd/even ${o}/${num.length - o}, ${r.toLowerCase()}`,
      },
    };
  },
};

export const randomModel = {
  id: 'random',
  letter: 'E',
  name: 'Model E — Random baseline',
  description: 'Uniformly random candidates. Any useful model must beat this.',
  train(history, { length }) {
    return { length };
  },
  propose(state, rng) {
    return randomNumberString(state.length, rng);
  },
  score() {
    return { score: 0.5, features: { reason: 'Uniform random baseline (no information used)' } };
  },
};

const ENSEMBLE_MEMBERS = [frequencyModel, positionModelB, recentWeightedModel, distributionModel];

export const ensembleModel = {
  id: 'ensemble',
  letter: 'F',
  name: 'Model F — Ensemble',
  description: 'Pools candidates from models A–D and ranks them by the average of their scores.',
  train(history, opts) {
    return { length: opts.length, members: ENSEMBLE_MEMBERS.map((m) => ({ model: m, state: m.train(history, opts) })) };
  },
  propose(state, rng) {
    const m = state.members[Math.floor(rng() * state.members.length)];
    return m.model.propose(m.state, rng);
  },
  score(state, num) {
    const parts = state.members.map((m) => ({ letter: m.model.letter, ...m.model.score(m.state, num) }));
    const score = parts.reduce((a, p) => a + p.score, 0) / parts.length;
    return {
      score,
      features: {
        components: Object.fromEntries(parts.map((p) => [p.letter, Number(p.score.toFixed(3))])),
        reason: `Average of models ${parts.map((p) => `${p.letter}=${p.score.toFixed(2)}`).join(', ')}`,
      },
    };
  },
};

export const MODELS = [frequencyModel, positionModelB, recentWeightedModel, distributionModel, randomModel, ensembleModel];

export function getModel(id) {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model "${id}"`);
  return m;
}
