import { discoverResultLinks } from './linkDiscovery.js';
import { getParserForUrl } from './registry.js';

const MAX_QUEUE = 2000;

export function createImportState(startUrl, { maxPages = 200 } = {}) {
  return {
    startUrl,
    maxPages,
    queue: [startUrl],
    visited: [],
    pagesFetched: 0,
    resultsFound: 0,
    drawsFound: 0,
    inserted: 0,
    duplicates: 0,
    skippedOtherLottery: 0,
    errors: 0,
    errorMessages: [],
    done: false,
  };
}

function sameLottery(a, b) {
  if (!a || !b) return true;
  return a.toLowerCase().replace(/\s+/g, '') === b.toLowerCase().replace(/\s+/g, '');
}

/**
 * Processes up to `pagesPerStep` pages of a historical import and returns the
 * updated (serializable) state. Called repeatedly until `state.done`.
 *
 * deps.fetchPage(url) -> { ok, html, error }
 * deps.ingest(parsed) -> { inserted, duplicates }
 */
export async function runImportStep(prevState, { fetchPage, ingest, lotteryName = null, pagesPerStep = 5 }) {
  const state = {
    ...prevState,
    queue: [...prevState.queue],
    visited: [...prevState.visited],
    errorMessages: [...prevState.errorMessages],
  };
  const visited = new Set(state.visited);
  let processed = 0;

  while (state.queue.length && processed < pagesPerStep && state.pagesFetched < state.maxPages) {
    const url = state.queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    state.visited.push(url);
    processed += 1;

    const page = await fetchPage(url);
    state.pagesFetched += 1;
    if (!page.ok) {
      state.errors += 1;
      state.errorMessages = [...state.errorMessages, `${url}: ${page.error}`].slice(-20);
      continue;
    }

    const parsed = getParserForUrl(url).parse(page.html, { url, lotteryNameHint: lotteryName });
    if (parsed.valid) {
      state.drawsFound += 1;
      if (sameLottery(parsed.lottery_name, lotteryName)) {
        state.resultsFound += parsed.results.length;
        try {
          const saved = await ingest(parsed);
          state.inserted += saved.inserted;
          state.duplicates += saved.duplicates;
        } catch (e) {
          state.errors += 1;
          state.errorMessages = [...state.errorMessages, `${url}: save failed: ${e.message}`].slice(-20);
        }
      } else {
        state.skippedOtherLottery += 1;
      }
    }

    const queued = new Set(state.queue);
    for (const link of discoverResultLinks(page.html, page.url || url, { lotteryName })) {
      if (state.queue.length >= MAX_QUEUE) break;
      if (!visited.has(link.url) && !queued.has(link.url)) {
        state.queue.push(link.url);
        queued.add(link.url);
      }
    }
  }

  state.done = state.queue.length === 0 || state.pagesFetched >= state.maxPages;
  return state;
}
