import { GenericHtmlParser } from './GenericHtmlParser.js';

// Source-specific parsers go first; GenericHtmlParser is the fallback.
const parsers = [];

export function registerParser(ParserClass) {
  parsers.unshift(ParserClass);
}

export function getParserForUrl(url) {
  const Match = parsers.find((P) => {
    try {
      return P.canParse(url);
    } catch {
      return false;
    }
  });
  return new (Match || GenericHtmlParser)();
}

export function listParsers() {
  return [...parsers.map((P) => P.id), GenericHtmlParser.id];
}
