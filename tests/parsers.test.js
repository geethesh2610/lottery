import { describe, expect, it } from 'vitest';
import { GenericHtmlParser, LotteryParser, getParserForUrl, registerParser, htmlToText, extractLinks, discoverResultLinks } from '../src/parsers/index.js';
import { OFFICIAL_STYLE, TABLE_STYLE, NO_RESULTS } from './fixtures/html.js';

const parser = new GenericHtmlParser();
const byPrize = (parsed, prize) => parsed.results.filter((r) => r.prize_category === prize).map((r) => r.winning_number);

describe('GenericHtmlParser — official layout', () => {
  const parsed = parser.parse(OFFICIAL_STYLE, { url: 'https://example.com/kn-512' });

  it('detects lottery, draw number and date', () => {
    expect(parsed.lottery_name).toBe('Karunya Plus');
    expect(parsed.lottery_code).toBe('KN');
    expect(parsed.draw_code).toBe('KN-512');
    expect(parsed.draw_date).toBe('2024-03-12');
    expect(parsed.valid).toBe(true);
  });

  it('extracts every prize with leading zeros intact', () => {
    expect(byPrize(parsed, '1st Prize')).toEqual(['PN 012345']);
    expect(byPrize(parsed, 'Consolation Prize')).toEqual(['PO 012345', 'PP 012345', 'PR 012345']);
    expect(byPrize(parsed, '2nd Prize')).toEqual(['PO 654321']);
    expect(byPrize(parsed, '3rd Prize')).toEqual(['PN 100200', 'PO 300400', 'PP 000999']);
    expect(byPrize(parsed, '4th Prize')).toEqual(['0123', '4567', '8901', '0007']);
    expect(byPrize(parsed, '5th Prize')).toEqual(['0012', '5555', '9090']);
    const first = parsed.results.find((r) => r.prize_category === '1st Prize');
    expect(first.normalized_number).toBe('012345');
  });

  it('ignores prize amounts, agency numbers, scripts and footer text', () => {
    const all = parsed.results.map((r) => r.normalized_number);
    expect(all).not.toContain('1234'); // agency number
    expect(all).not.toContain('8000');
    expect(all).not.toContain('5000');
    expect(all).not.toContain('2024'); // footer year
    expect(all).not.toContain('999999'); // inside <script>
  });
});

describe('GenericHtmlParser — table layout', () => {
  const parsed = parser.parse(TABLE_STYLE, { url: 'https://results.example/today' });

  it('handles word ordinals, ₹ amounts and month-name dates', () => {
    expect(parsed.lottery_name).toBe('Win Win');
    expect(parsed.draw_code).toBe('W-765');
    expect(parsed.draw_date).toBe('2024-04-01');
    expect(byPrize(parsed, '1st Prize')).toEqual(['WA 076543']);
    expect(byPrize(parsed, 'Consolation Prize')).toEqual(['WB 076543', 'WC 076543']);
    expect(byPrize(parsed, '4th Prize')).toEqual(['1111', '2222', '0303']);
  });
});

describe('GenericHtmlParser — failures', () => {
  it('reports invalid pages instead of inventing data', () => {
    const parsed = parser.parse(NO_RESULTS);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.join(' ')).toMatch(/No prize results/);
    expect(parsed.results).toEqual([]);
  });

  it('uses the lottery name hint only as a fallback', () => {
    const html = '<p>Draw held on 05/05/2024</p><p>1st Prize: AB 123456</p>';
    const parsed = parser.parse(html, { lotteryNameHint: 'Nirmal' });
    expect(parsed.lottery_name).toBe('Nirmal');
    expect(parsed.valid).toBe(true);
  });
});

describe('parser architecture', () => {
  it('exposes the abstract LotteryParser contract', () => {
    expect(() => new LotteryParser().parse('<p></p>')).toThrow(/not implemented/);
  });

  it('allows source-specific parsers to be registered', () => {
    class ExampleParser extends GenericHtmlParser {
      static id = 'example-site';
      static canParse(url) {
        return url.includes('special.example');
      }
      parseDrawNumber() {
        return { code: 'KN-1', prefix: 'KN' };
      }
    }
    registerParser(ExampleParser);
    expect(getParserForUrl('https://special.example/x')).toBeInstanceOf(ExampleParser);
    expect(getParserForUrl('https://other.example/x').constructor.id).toBe('generic-html');
  });
});

describe('HTML helpers', () => {
  it('converts HTML to text and decodes entities', () => {
    expect(htmlToText('<p>A&amp;B</p><div>C&nbsp;D</div><script>x</script>')).toBe('A&B\nC D');
  });

  it('extracts and resolves links', () => {
    const links = extractLinks('<a href="/a#x">A</a><a href=\'b\'>B</a><a href="mailto:x@y">M</a>', 'https://s.example/dir/page');
    expect(links.map((l) => l.url)).toEqual(['https://s.example/a', 'https://s.example/dir/b']);
  });

  it('discovers result/archive links on the same host only', () => {
    const links = discoverResultLinks(TABLE_STYLE, 'https://results.example/today', { lotteryName: 'Win Win' });
    const urls = links.map((l) => l.url);
    expect(urls).toContain('https://results.example/results/win-win-w-764');
    expect(urls).toContain('https://results.example/results/page/2');
    expect(urls).not.toContain('https://results.example/privacy');
    expect(urls).not.toContain('https://results.example/files/result.pdf');
    expect(urls.some((u) => u.includes('other.example'))).toBe(false);
    // Links mentioning the configured lottery are prioritised.
    expect(urls.indexOf('https://results.example/results/win-win-w-764')).toBeLessThan(urls.indexOf('https://results.example/results/karunya-kr-600'));
  });
});
