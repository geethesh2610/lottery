import { describe, expect, it } from 'vitest';
import { parseDate, findDates, inferNextDrawDate, findMissingDrawDates, addDays, todayIso } from '../src/utils/dates.js';

describe('date parsing', () => {
  it.each([
    ['12/03/2024', '2024-03-12'],
    ['12-03-2024', '2024-03-12'],
    ['12.03.2024', '2024-03-12'],
    ['2024-03-12', '2024-03-12'],
    ['12 March 2024', '2024-03-12'],
    ['12th Mar, 2024', '2024-03-12'],
    ['March 12, 2024', '2024-03-12'],
    ['01/04/24', '2024-04-01'],
  ])('parses %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it('uses the Indian day-first convention', () => {
    expect(parseDate('05/06/2024')).toBe('2024-06-05');
  });

  it('rejects impossible dates', () => {
    expect(parseDate('31/02/2024')).toBeNull();
    expect(parseDate('45/13/2024')).toBeNull();
    expect(parseDate('hello')).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('does not double-count overlapping formats', () => {
    const found = findDates('Draw held on 2024-03-12 and 13/03/2024');
    expect(found.map((d) => d.value)).toEqual(['2024-03-12', '2024-03-13']);
  });

  it('computes today in IST', () => {
    expect(todayIso(new Date('2024-03-12T20:00:00Z'))).toBe('2024-03-13');
    expect(todayIso(new Date('2024-03-12T10:00:00Z'))).toBe('2024-03-12');
  });
});

describe('draw schedule inference', () => {
  const thursdays = Array.from({ length: 10 }, (_, i) => addDays('2024-01-04', i * 7));

  it('infers the next draw from the usual weekday', () => {
    expect(inferNextDrawDate(thursdays, '2024-03-12')).toBe('2024-03-14');
    expect(inferNextDrawDate(thursdays, '2024-03-14')).toBe('2024-03-21');
  });

  it('finds missing weekly draws', () => {
    const withGap = thursdays.filter((d) => d !== '2024-01-25' && d !== '2024-02-08');
    expect(findMissingDrawDates(withGap)).toEqual(['2024-01-25', '2024-02-08']);
    expect(findMissingDrawDates(thursdays)).toEqual([]);
  });
});
