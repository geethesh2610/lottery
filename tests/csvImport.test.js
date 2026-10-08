import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { validateCsvRows } from '../src/parsers/csvImport.js';

const parse = (text) => Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false }).data;
const TODAY = '2025-01-01';

describe('CSV import validation', () => {
  it('accepts valid rows, preserves leading zeros and groups by draw', () => {
    const rows = parse(`date,lottery,draw,prize,winning_number
12/03/2024,KARUNYA PLUS,KN-512,1st Prize,PN 012345
2024-03-12,Karunya Plus,kn 512,Consolation Prize,PO 012345
2024-03-12,Karunya Plus,KN-512,4th Prize,0007
2024-03-19,Karunya Plus,KN-513,First,PA 000001`);
    const { draws, validRows, errors } = validateCsvRows(rows, { today: TODAY });
    expect(errors).toEqual([]);
    expect(validRows).toBe(4);
    expect(draws).toHaveLength(2);
    expect(draws[0]).toMatchObject({ lottery_name: 'Karunya Plus', draw_date: '2024-03-12', draw_code: 'KN-512' });
    expect(draws[0].results.map((r) => r.normalized_number)).toEqual(['012345', '012345', '0007']);
    expect(draws[1].results[0]).toMatchObject({ prize_category: '1st Prize', winning_number: 'PA 000001', normalized_number: '000001' });
  });

  it('reports every invalid field with its line number', () => {
    const rows = parse(`date,lottery,draw,prize,winning_number
31/02/2024,Karunya,KR-1,1st Prize,PA 123456
2024-01-01,,KR-1,1st Prize,PA 123456
2024-01-01,Karunya,KR-1,Jackpot,PA 123456
2024-01-01,Karunya,KR-1,1st Prize,PA 12A456
2030-01-01,Karunya,KR-1,1st Prize,PA 123456`);
    const { errors, validRows } = validateCsvRows(rows, { today: TODAY });
    expect(validRows).toBe(0);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(errors[0].message).toMatch(/invalid date/);
    expect(errors[1].message).toMatch(/missing lottery/);
    expect(errors[2].message).toMatch(/unknown prize/);
    expect(errors[3].message).toMatch(/invalid winning number/);
    expect(errors[4].message).toMatch(/future/);
  });

  it('detects numbers that lost their leading zero (e.g. Excel) and pads only on request', () => {
    const rows = parse(`date,lottery,draw,prize,winning_number
2024-01-01,Karunya,KR-1,1st Prize,12345
2024-01-01,Karunya,KR-1,4th Prize,7`);
    const strict = validateCsvRows(rows, { today: TODAY });
    expect(strict.validRows).toBe(0);
    expect(strict.errors[0].message).toMatch(/leading zeros lost/);
    const padded = validateCsvRows(rows, { padMissingZeros: true, today: TODAY });
    expect(padded.errors).toEqual([]);
    expect(padded.draws[0].results.map((r) => r.winning_number)).toEqual(['012345', '0007']);
  });

  it('rejects values that were parsed as numbers', () => {
    const { errors } = validateCsvRows([{ date: '2024-01-01', lottery: 'Karunya', draw: '', prize: '1st', winning_number: 12345 }], { today: TODAY });
    expect(errors[0].message).toMatch(/parsed as a number/);
  });

  it('de-duplicates repeated rows within a file', () => {
    const rows = parse(`date,lottery,draw,prize,winning_number
2024-01-01,Karunya,KR-1,1st Prize,PA 123456
2024-01-01,Karunya,KR-1,1st Prize,pa-123456`);
    const { draws } = validateCsvRows(rows, { today: TODAY });
    expect(draws[0].results).toHaveLength(1);
  });

  it('accepts alternative header names', () => {
    const { validRows } = validateCsvRows(parse('Draw Date,Lottery Name,Draw No,Prize Category,Number\n2024-01-01,Akshaya,AK-600,1st Prize,AB 000123'), { today: TODAY });
    expect(validRows).toBe(1);
  });
});
