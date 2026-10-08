import { htmlToText, extractTitle, extractHeadings } from './html.js';
import { validateParsedDraw } from './validation.js';

/**
 * Base class for result-page parsers. Subclasses implement the four parse*
 * methods; `parse()` wires them together, normalizes and validates the output.
 *
 * To add a site-specific parser, extend this (or GenericHtmlParser), override
 * what differs, implement `static canParse(url)` and register it in registry.js.
 */
export class LotteryParser {
  static id = 'base';

  // eslint-disable-next-line no-unused-vars
  static canParse(url) {
    return false;
  }

  /** Builds the shared parse context once per page. */
  prepare(html, { url = null, lotteryNameHint = null } = {}) {
    return {
      html,
      url,
      lotteryNameHint,
      text: htmlToText(html),
      title: extractTitle(html),
      headings: extractHeadings(html),
    };
  }

  /* eslint-disable no-unused-vars */
  parseLotteryName(ctx) {
    throw new Error('parseLotteryName() not implemented');
  }

  parseDrawNumber(ctx) {
    throw new Error('parseDrawNumber() not implemented');
  }

  parseDrawDate(ctx) {
    throw new Error('parseDrawDate() not implemented');
  }

  parsePrizeResults(ctx) {
    throw new Error('parsePrizeResults() not implemented');
  }
  /* eslint-enable no-unused-vars */

  /** Returns a normalized draw object plus validation output. */
  parse(html, options = {}) {
    const ctx = this.prepare(html, options);
    const draw = this.parseDrawNumber(ctx);
    const lottery = this.parseLotteryName(ctx, draw);
    const drawDate = this.parseDrawDate(ctx);
    const { results, invalid } = this.parsePrizeResults(ctx);
    const parsed = {
      parser: this.constructor.id,
      source_url: options.url ?? null,
      lottery_name: lottery?.name ?? null,
      lottery_code: lottery?.code ?? draw?.prefix ?? null,
      draw_code: draw?.code ?? null,
      draw_date: drawDate,
      results,
      invalid_numbers: invalid,
    };
    const { valid, errors, warnings } = validateParsedDraw(parsed);
    return { ...parsed, valid, errors, warnings };
  }
}
