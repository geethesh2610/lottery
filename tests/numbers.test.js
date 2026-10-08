import { describe, expect, it } from 'vitest';
import { cleanWinningNumber, normalizeNumber, seriesOf, isValidNormalized, padNumber, dominantLength } from '../src/utils/numbers.js';
import { normalizeLotteryName, normalizeDrawCode } from '../src/utils/text.js';
import { normalizePrizeCategory } from '../src/constants/prizes.js';

describe('number normalization', () => {
  it('cleans ticket numbers to a canonical form', () => {
    expect(cleanWinningNumber(' pj-012345 ')).toBe('PJ 012345');
    expect(cleanWinningNumber('PJ012345')).toBe('PJ 012345');
    expect(cleanWinningNumber('PJ   012345')).toBe('PJ 012345');
    expect(cleanWinningNumber('0123')).toBe('0123');
  });

  it('preserves leading zeros everywhere', () => {
    expect(normalizeNumber('PJ 012345')).toBe('012345');
    expect(normalizeNumber('000001')).toBe('000001');
    expect(normalizeNumber('0007')).toBe('0007');
    expect(typeof normalizeNumber('000000')).toBe('string');
  });

  it('refuses numeric input because zeros may already be lost', () => {
    expect(cleanWinningNumber(12345)).toBeNull();
    expect(normalizeNumber(12345)).toBeNull();
  });

  it('rejects malformed numbers', () => {
    expect(cleanWinningNumber('PJ 12A456')).toBeNull();
    expect(cleanWinningNumber('123')).toBeNull();
    expect(cleanWinningNumber('1234567')).toBeNull();
    expect(cleanWinningNumber('')).toBeNull();
    expect(cleanWinningNumber(null)).toBeNull();
  });

  it('extracts series and validates lengths', () => {
    expect(seriesOf('pj 012345')).toBe('PJ');
    expect(seriesOf('0123')).toBeNull();
    expect(isValidNormalized('012345', 6)).toBe(true);
    expect(isValidNormalized('12345', 6)).toBe(false);
    expect(isValidNormalized('0123', 4)).toBe(true);
    expect(isValidNormalized(123456)).toBe(false);
  });

  it('pads only when explicitly asked', () => {
    expect(padNumber('12345', 6)).toBe('012345');
    expect(padNumber('7', 4)).toBe('0007');
    expect(padNumber('1234567', 6)).toBeNull();
  });

  it('finds the dominant number length', () => {
    expect(dominantLength(['012345', '123456', '0123'])).toBe(6);
    expect(dominantLength([])).toBeNull();
  });
});

describe('text normalization', () => {
  it('normalizes lottery names and aliases', () => {
    expect(normalizeLotteryName('KARUNYA PLUS LOTTERY')).toBe('Karunya Plus');
    expect(normalizeLotteryName('win-win')).toBe('Win Win');
    expect(normalizeLotteryName('Kerala Sthree Sakthi Lottery Result')).toBe('Sthree Sakthi');
    expect(normalizeLotteryName('Some New Lottery')).toBe('Some New');
  });

  it('normalizes draw codes', () => {
    expect(normalizeDrawCode('kn 512')).toBe('KN-512');
    expect(normalizeDrawCode('KN-512th')).toBe('KN-512');
    expect(normalizeDrawCode('W-0765')).toBe('W-765');
    expect(normalizeDrawCode('nothing')).toBeNull();
  });

  it('normalizes prize categories', () => {
    expect(normalizePrizeCategory('FIRST PRIZE')).toBe('1st Prize');
    expect(normalizePrizeCategory('1st prize Rs 75 Lakhs')).toBe('1st Prize');
    expect(normalizePrizeCategory('Cons. Prize')).toBe('Consolation Prize');
    expect(normalizePrizeCategory('10th Prize')).toBe('10th Prize');
    expect(normalizePrizeCategory('3')).toBe('3rd Prize');
    expect(normalizePrizeCategory('jackpot')).toBeNull();
  });
});
