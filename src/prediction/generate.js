import { getModel } from './models.js';
import { seededRng } from '../utils/random.js';
import { dominantLength } from '../utils/numbers.js';

/**
 * Generates the top `count` distinct candidates for a model.
 * history: [{ draw_date, number }] — must contain ONLY data known before the target draw.
 */
export function generateCandidates(modelId, history, { length = null, count = 10, samples = 1500, seed = 'default', trainedState = null } = {}) {
  const model = getModel(modelId);
  const len = length ?? dominantLength(history.map((h) => h.number)) ?? 6;
  const usable = history.filter((h) => h.number?.length === len);
  const state = trainedState ?? model.train(usable, { length: len });
  const rng = seededRng(seed, modelId, len, usable.length);
  const seen = new Map();
  for (let i = 0; i < samples && seen.size < samples; i++) {
    const num = model.propose(state, rng);
    if (seen.has(num)) continue;
    const { score, features } = model.score(state, num);
    seen.set(num, { score, features, order: i });
  }
  return [...seen.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].order - b[1].order)
    .slice(0, count)
    .map(([number, { score, features }], i) => ({
      rank: i + 1,
      number,
      score: Number(score.toFixed(4)),
      model: model.name,
      modelId: model.id,
      reason: features.reason,
      features,
    }));
}
