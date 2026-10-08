import { normalizePrizeCategory, prizeInfo, prizeRank } from '../constants/prizes.js';
import { cleanWinningNumber, normalizeNumber, padNumber } from '../utils/numbers.js';
import { parseDate, todayIso } from '../utils/dates.js';
import { normalizeLotteryName, normalizeDrawCode } from '../utils/text.js';

export const CSV_COLUMNS = ['date', 'lottery', 'draw', 'prize', 'winning_number'];

const HEADER_ALIASES = {
  date: ['date', 'draw_date', 'drawdate'],
  lottery: ['lottery', 'lottery_name', 'name'],
  draw: ['draw', 'draw_code', 'draw_no', 'draw_number'],
  prize: ['prize', 'prize_category', 'category'],
  winning_number: ['winning_number', 'number', 'winningnumber', 'ticket', 'ticket_number'],
};

function pick(row, field) {
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (HEADER_ALIASES[field].includes(k)) return row[key];
  }
  return undefined;
}

/**
 * Validates CSV rows (objects keyed by header; values MUST be strings — parse the
 * CSV without type coercion so leading zeros survive).
 * Returns { draws, validRows, errors } where draws are grouped for ingestion.
 */
export function validateCsvRows(rows, { padMissingZeros = false, today = todayIso() } = {}) {
  const errors = [];
  const draws = new Map();
  let validRows = 0;

  rows.forEach((row, i) => {
    const line = i + 2; // header is line 1
    const rawDate = pick(row, 'date');
    const rawLottery = pick(row, 'lottery');
    const rawPrize = pick(row, 'prize');
    let rawNumber = pick(row, 'winning_number');
    const rawDraw = pick(row, 'draw');
    const rowErrors = [];

    const date = parseDate(rawDate);
    if (!date) rowErrors.push(`invalid date "${rawDate ?? ''}"`);
    else if (date > today) rowErrors.push(`date ${date} is in the future`);
    const lottery = normalizeLotteryName(rawLottery);
    if (!lottery) rowErrors.push('missing lottery');
    const prize = normalizePrizeCategory(rawPrize);
    if (!prize) rowErrors.push(`unknown prize "${rawPrize ?? ''}"`);
    const draw = rawDraw && String(rawDraw).trim() ? normalizeDrawCode(rawDraw) : null;
    if (rawDraw && String(rawDraw).trim() && !draw) rowErrors.push(`invalid draw "${rawDraw}"`);

    if (typeof rawNumber === 'number') {
      rowErrors.push('winning number was parsed as a number (leading zeros may be lost); import as text');
      rawNumber = null;
    }
    const expected = prize ? prizeInfo(prize)?.digits : null;
    // Very short digit-only values ("7") are only recoverable by explicit padding.
    if (padMissingZeros && expected && /^\s*\d{1,3}\s*$/.test(String(rawNumber ?? ''))) {
      rawNumber = padNumber(rawNumber, expected);
    }
    let winning = cleanWinningNumber(rawNumber);
    if (winning && expected) {
      let normalized = normalizeNumber(winning);
      if (normalized.length !== expected && padMissingZeros && normalized.length < expected) {
        const padded = padNumber(normalized, expected);
        winning = winning.replace(normalized, padded);
        normalized = padded;
      }
      if (normalized.length !== expected) {
        const hint = normalized.length < expected ? ' (leading zeros lost? e.g. opened in Excel)' : '';
        rowErrors.push(`"${rawNumber}" should have ${expected} digits for ${prize}${hint}`);
        winning = null;
      }
    } else if (!winning && rawNumber != null) {
      rowErrors.push(`invalid winning number "${rawNumber}"`);
    } else if (!winning) {
      rowErrors.push('missing winning number');
    }

    if (rowErrors.length) {
      errors.push({ line, message: rowErrors.join('; '), row });
      return;
    }
    validRows += 1;
    const key = `${lottery}|${date}`;
    if (!draws.has(key)) {
      draws.set(key, { lottery_name: lottery, draw_date: date, draw_code: draw, results: [], seen: new Set() });
    }
    const d = draws.get(key);
    if (!d.draw_code && draw) d.draw_code = draw;
    const dedupeKey = `${prize}|${winning}`;
    if (d.seen.has(dedupeKey)) return;
    d.seen.add(dedupeKey);
    d.results.push({
      prize_category: prize,
      prize_rank: prizeRank(prize),
      winning_number: winning,
      normalized_number: normalizeNumber(winning),
    });
  });

  return {
    draws: [...draws.values()].map(({ seen, ...d }) => d), // eslint-disable-line no-unused-vars
    validRows,
    errors,
  };
}
