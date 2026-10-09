// Experimental models. Each model:
//   train(history, { length }) -> state     history: [{ draw_date, number }] (chronological)
//   propose(state, rng)        -> candidate number string
//   score(state, number)       -> { score in [0,1], features }
// Scores are RANKING scores, not probabilities of winning.
import { sampleIndex, randomNumberString } from '../utils/random.js';

function normalize(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((c) => c / total);
}

function geometricMean(values) {
  return Math.exp(values.reduce((a, v) => a + Math.log(Math.max(v, 1e-12)), 0) / values.length);
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

export const RECENCY_HALF_LIFE = 20;

export const patternModel = {
  id: 'recent',
  letter: 'P',
  name: 'Pattern model',
  description: `Favours digits that have come up often in each position recently (a draw ${RECENCY_HALF_LIFE} draws ago counts half as much).`,
  train(history, { length }) {
    const probs = positionCounts(history, length, (i, n) => 0.5 ** ((n - 1 - i) / RECENCY_HALF_LIFE));
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
        reason: `Recently frequent digit in each position: ${best}`,
      },
    };
  },
};

export const randomModel = {
  id: 'random',
  letter: 'R',
  name: 'Random guess',
  description: 'Uniformly random candidates. The pattern model is only useful if it beats this.',
  train(history, { length }) {
    return { length };
  },
  propose(state, rng) {
    return randomNumberString(state.length, rng);
  },
  score() {
    return { score: 0.5, features: { reason: 'Uniform random guess (no information used)' } };
  },
};

export const MODELS = [patternModel, randomModel];

/** Undefined for retired model ids that older saved rows may still contain. */
export function findModel(id) {
  return MODELS.find((x) => x.id === id);
}

export function getModel(id) {
  const m = findModel(id);
  if (!m) throw new Error(`Unknown model "${id}"`);
  return m;
}
