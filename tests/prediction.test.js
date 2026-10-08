import { describe, expect, it } from 'vitest';
import { MODELS, generateCandidates, evaluateCandidates, digitOverlap, positionMatches, buildPredictionRows, evaluatePredictionRow, findActualForPrediction } from '../src/prediction/index.js';
import { mockEntries } from './fixtures/mockData.js';

const history = mockEntries({ count: 120, seed: 11 });

describe('prediction models', () => {
  it('provides models A–F', () => {
    expect(MODELS.map((m) => m.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it.each(MODELS.map((m) => m.id))('%s outputs ranked candidates with number, score, model and reason', (id) => {
    const out = generateCandidates(id, history, { count: 10, samples: 400, seed: 's' });
    expect(out).toHaveLength(10);
    expect(new Set(out.map((c) => c.number)).size).toBe(10);
    for (const c of out) {
      expect(c.number).toMatch(/^\d{6}$/);
      expect(typeof c.number).toBe('string');
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
      expect(c.model).toMatch(/^Model [A-F]/);
      expect(c.reason).toBeTruthy();
    }
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
  });

  it('is deterministic for the same seed and differs for another', () => {
    const a = generateCandidates('ensemble', history, { samples: 300, seed: 'x' });
    const b = generateCandidates('ensemble', history, { samples: 300, seed: 'x' });
    const c = generateCandidates('ensemble', history, { samples: 300, seed: 'y' });
    expect(a).toEqual(b);
    expect(a.map((x) => x.number)).not.toEqual(c.map((x) => x.number));
  });

  it('frequency models favour historically frequent digits', () => {
    const biased = history.map((e) => ({ ...e, number: `77${e.number.slice(2)}` }));
    const top = generateCandidates('position', biased, { count: 5, samples: 500 });
    expect(top.every((c) => c.number.startsWith('77'))).toBe(true);
  });

  it('supports 4-digit prizes', () => {
    const four = history.map((e) => ({ ...e, number: e.number.slice(2) }));
    const out = generateCandidates('ensemble', four, { count: 3, samples: 200 });
    expect(out.every((c) => /^\d{4}$/.test(c.number))).toBe(true);
  });
});

describe('evaluation metrics', () => {
  it('computes position matches and digit overlap', () => {
    expect(positionMatches('123456', '123000')).toBe(3);
    expect(digitOverlap('112233', '123321')).toBe(6);
    expect(digitOverlap('000000', '012345')).toBe(1);
  });

  it('evaluates best-of-candidates', () => {
    const m = evaluateCandidates(['000000', '123459', '987654'], '123456');
    expect(m).toEqual({ exact_match: false, position_matches: 5, matching_digits: 5, last_digit_match: false, last_two_match: false });
    expect(evaluateCandidates(['123456'], '123456').exact_match).toBe(true);
    expect(evaluateCandidates(['999956'], '123456').last_two_match).toBe(true);
  });
});

describe('live predictions', () => {
  it('builds rows for the next draw using only earlier history', () => {
    const today = history[history.length - 1].draw_date;
    const { targetDate, rows } = buildPredictionRows('Test Lottery', '1st Prize', history, { today, samples: 200, modelIds: ['frequency', 'random'] });
    expect(targetDate > today).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0].predicted_numbers).toHaveLength(10);
    expect(rows[0]).toMatchObject({ lottery_name: 'Test Lottery', prize_category: '1st Prize', model_name: 'frequency', target_draw_date: targetDate });
  });

  it('refuses to predict with insufficient data', () => {
    expect(buildPredictionRows('X', '1st Prize', history.slice(0, 5)).reason).toBe('insufficient-data');
  });

  it('evaluates a saved prediction once the draw exists', () => {
    const pred = { target_draw_date: '2024-05-02', predicted_numbers: [{ number: '123450' }, { number: '000000' }] };
    expect(evaluatePredictionRow(pred, [{ draw_date: '2024-04-25', number: '123456' }])).toBeNull();
    const entries = [{ draw_date: '2024-05-03', number: '123456' }];
    expect(findActualForPrediction(pred, entries).number).toBe('123456');
    const res = evaluatePredictionRow(pred, entries, new Date('2024-05-04T00:00:00Z'));
    expect(res).toMatchObject({ evaluated: true, actual_number: '123456', position_matches: 5, exact_match: false });
  });
});
