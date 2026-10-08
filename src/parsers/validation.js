import { prizeInfo } from '../constants/prizes.js';
import { isValidNormalized } from '../utils/numbers.js';
import { todayIso, addDays } from '../utils/dates.js';

/** Checks a parsed draw before it is written to the database. */
export function validateParsedDraw(parsed, { today = todayIso() } = {}) {
  const errors = [];
  const warnings = [];
  if (!parsed.lottery_name) errors.push('Lottery name could not be detected.');
  if (!parsed.draw_date) errors.push('Draw date could not be detected.');
  else if (parsed.draw_date > addDays(today, 1)) errors.push(`Draw date ${parsed.draw_date} is in the future.`);
  if (!parsed.results?.length) errors.push('No prize results could be detected.');
  if (!parsed.draw_code) warnings.push('Draw number not detected; the draw date will be used to identify the draw.');
  if (parsed.results?.length && !parsed.results.some((r) => r.prize_category === '1st Prize')) {
    warnings.push('1st prize was not detected.');
  }
  for (const r of parsed.results || []) {
    const info = prizeInfo(r.prize_category);
    if (!isValidNormalized(r.normalized_number, info?.digits)) {
      errors.push(`Invalid number "${r.winning_number}" for ${r.prize_category}.`);
    }
  }
  if (parsed.invalid_numbers > 0) {
    warnings.push(`${parsed.invalid_numbers} number(s) were ignored because their length did not match the prize.`);
  }
  return { valid: errors.length === 0, errors, warnings };
}
