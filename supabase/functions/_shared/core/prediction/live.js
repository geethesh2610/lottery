// Helpers for generating and evaluating real (forward-looking) predictions.
import { MODELS } from './models.js';
import { generateCandidates } from './generate.js';
import { evaluateCandidates } from './evaluation.js';
import { addDays, inferNextDrawDate, todayIso } from '../utils/dates.js';
import { MIN_SAMPLE_SIZE } from '../constants/app.js';

/**
 * Builds prediction rows for the next draw. Only history strictly before the
 * target date is used.
 */
export function buildPredictionRows(lotteryName, prizeCategory, entries, options = {}) {
  const { today = todayIso(), modelIds = MODELS.map((m) => m.id), count = 10, samples = 1000, generatedBy = 'manual' } = options;
  const dates = [...new Set(entries.map((e) => e.draw_date))].sort();
  if (entries.length < MIN_SAMPLE_SIZE) return { targetDate: null, rows: [], reason: 'insufficient-data' };
  const targetDate = options.targetDate ?? inferNextDrawDate(dates, today);
  const history = entries.filter((e) => e.draw_date < targetDate);
  const rows = modelIds.map((modelId) => {
    const candidates = generateCandidates(modelId, history, { count, samples, seed: `${lotteryName}|${prizeCategory}|${targetDate}` });
    return {
      lottery_name: lotteryName,
      prize_category: prizeCategory,
      target_draw_date: targetDate,
      model_name: modelId,
      generated_by: generatedBy,
      predicted_numbers: candidates.map(({ number, score, reason, rank }) => ({ rank, number, score, reason })),
    };
  });
  return { targetDate, rows };
}

/**
 * Finds the actual result for a prediction: the first draw on/after the target
 * date within 6 days (draws can be rescheduled), first listed number.
 * entries: [{ draw_date, number }] for the same lottery + prize.
 */
export function findActualForPrediction(prediction, entries) {
  const limit = addDays(prediction.target_draw_date, 6);
  const candidates = entries
    .filter((e) => e.draw_date >= prediction.target_draw_date && e.draw_date <= limit)
    .sort((a, b) => (a.draw_date < b.draw_date ? -1 : 1));
  return candidates[0] ?? null;
}

/** Returns the evaluation columns for a prediction row, or null if not drawn yet. */
export function evaluatePredictionRow(prediction, entries, now = new Date()) {
  const actual = findActualForPrediction(prediction, entries);
  if (!actual) return null;
  const numbers = (prediction.predicted_numbers || []).map((p) => (typeof p === 'string' ? p : p.number));
  const m = evaluateCandidates(numbers, actual.number);
  return {
    evaluated: true,
    actual_number: actual.number,
    exact_match: m.exact_match,
    matching_digits: m.matching_digits,
    position_matches: m.position_matches,
    last_digit_match: m.last_digit_match,
    last_two_match: m.last_two_match,
    evaluation_date: now.toISOString(),
  };
}
