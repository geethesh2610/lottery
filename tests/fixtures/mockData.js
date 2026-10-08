// Deterministic synthetic datasets (uniformly random numbers) for tests and `npm run db:seed`.
import { mulberry32 } from '../../src/utils/random.js';
import { addDays } from '../../src/utils/dates.js';
import { prizeRank } from '../../src/constants/prizes.js';

const SERIES = ['PA', 'PB', 'PC', 'PD', 'PE', 'PF', 'PG', 'PH', 'PJ', 'PK', 'PL', 'PM'];

function digits(rng, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(rng() * 10);
  return s;
}

function result(category, winning) {
  return {
    prize_category: category,
    prize_rank: prizeRank(category),
    winning_number: winning,
    normalized_number: winning.replace(/^[A-Z]+ /, ''),
  };
}

/** Weekly draws with 1st, consolation, 2nd, 3rd and 4th prizes. */
export function generateMockDraws({ lottery = 'Test Lottery', code = 'TL', startDate = '2023-01-02', count = 100, seed = 42 } = {}) {
  const rng = mulberry32(seed);
  const draws = [];
  for (let i = 0; i < count; i++) {
    const first = digits(rng, 6);
    const firstSeries = SERIES[Math.floor(rng() * SERIES.length)];
    const results = [result('1st Prize', `${firstSeries} ${first}`)];
    for (const s of SERIES.filter((x) => x !== firstSeries).slice(0, 3)) results.push(result('Consolation Prize', `${s} ${first}`));
    results.push(result('2nd Prize', `${SERIES[Math.floor(rng() * SERIES.length)]} ${digits(rng, 6)}`));
    for (let k = 0; k < 3; k++) results.push(result('3rd Prize', `${SERIES[k]} ${digits(rng, 6)}`));
    const fourth = new Set();
    while (fourth.size < 10) fourth.add(digits(rng, 4));
    for (const f of fourth) results.push(result('4th Prize', f));
    draws.push({
      lottery_name: lottery,
      lottery_code: code,
      draw_code: `${code}-${100 + i}`,
      draw_date: addDays(startDate, i * 7),
      results,
    });
  }
  return draws;
}

/** { draw_date, number } entries of 1st prize numbers. */
export function mockEntries(options) {
  return generateMockDraws(options).map((d) => ({ draw_date: d.draw_date, number: d.results[0].normalized_number }));
}
