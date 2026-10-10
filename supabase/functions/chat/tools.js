// Tools the chat assistant can call. Every tool reads real data / runs the real
// models — the assistant never invents numbers. All tools are read-only.
import { loadEntries, compactAnalytics } from '../_shared/pipeline.js';
import { analyzeEntries } from '../_shared/core/analytics/index.js';
import { buildPredictionRows, findModel, theoreticalBaseline } from '../_shared/core/prediction/index.js';
import { normalizePrizeCategory, DEFAULT_PRIZE } from '../_shared/core/constants/prizes.js';

const clamp = (n, lo, hi, dflt) => Math.min(Math.max(Number.isFinite(Number(n)) ? Number(n) : dflt, lo), hi);

class ToolError extends Error {}

async function rpc(admin, name, args) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

/** "karunya" -> "Karunya" (exact beats "Karunya Plus"); throws with options when unknown. */
async function resolveLottery(admin, input) {
  const lotteries = await rpc(admin, 'list_lotteries');
  const names = lotteries.map((l) => l.lottery_name);
  if (!input) throw new ToolError(`A lottery name is required. Available: ${names.join(', ')}`);
  const q = String(input).toLowerCase().replace(/[^a-z0-9]/g, '');
  const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = names.find((n) => squash(n) === q)
    ?? names.find((n) => squash(n).startsWith(q))
    ?? names.find((n) => squash(n).includes(q));
  if (!match) throw new ToolError(`No lottery called "${input}" in the database. Available: ${names.join(', ')}`);
  return match;
}

/** "5th", "fifth prize", "5" -> "5th Prize"; checks the lottery actually has it. */
async function resolvePrize(admin, lottery, input) {
  const prize = input ? normalizePrizeCategory(input) ?? normalizePrizeCategory(`${input} prize`) : DEFAULT_PRIZE;
  if (!prize) throw new ToolError(`Unknown prize "${input}". Use e.g. "1st Prize", "Consolation Prize", "5th Prize".`);
  if (lottery) {
    const prizes = (await rpc(admin, 'list_prize_categories', { p_lottery: lottery })).map((p) => p.prize_category);
    if (!prizes.includes(prize)) throw new ToolError(`${lottery} has no stored results for ${prize}. Available: ${prizes.join(', ')}`);
  }
  return prize;
}

const guessNumbers = (p) => (p.predicted_numbers || []).map((x) => (typeof x === 'string' ? x : x.number)).filter(Boolean);

const TOOLS = {
  list_lotteries: {
    description: 'Lotteries in the database with number of draws stored and the latest draw date.',
    parameters: { type: 'object', properties: {} },
    run: async (admin) => ({ lotteries: await rpc(admin, 'list_lotteries') }),
  },

  list_prizes: {
    description: 'Prize categories stored for a lottery, with how many winning numbers each has.',
    parameters: { type: 'object', properties: { lottery: { type: 'string' } }, required: ['lottery'] },
    run: async (admin, a) => {
      const lottery = await resolveLottery(admin, a.lottery);
      return { lottery, prizes: await rpc(admin, 'list_prize_categories', { p_lottery: lottery }) };
    },
  },

  predict_next_draw: {
    description:
      "Runs the app's prediction model on all stored history and returns guesses for the lottery's next draw. "
      + 'Use this whenever the user asks to predict / guess numbers. model "recent" = Pattern model (default), "random" = random guesses.',
    parameters: {
      type: 'object',
      properties: {
        lottery: { type: 'string', description: 'Lottery name, e.g. "Karunya"' },
        prize: { type: 'string', description: 'Prize category, e.g. "1st Prize", "5th Prize". Defaults to 1st Prize.' },
        model: { type: 'string', enum: ['recent', 'random'] },
        count: { type: 'integer', description: 'How many guesses (1-20, default 10)' },
      },
      required: ['lottery'],
    },
    run: async (admin, a) => {
      const lottery = await resolveLottery(admin, a.lottery);
      const prize = await resolvePrize(admin, lottery, a.prize);
      const modelId = a.model === 'random' ? 'random' : 'recent';
      const entries = await loadEntries(admin, lottery, prize);
      const { targetDate, rows, reason } = buildPredictionRows(lottery, prize, entries, {
        modelIds: [modelId], count: clamp(a.count, 1, 20, 10), samples: 800,
      });
      if (!rows.length) return { lottery, prize, error: reason === 'insufficient-data' ? `Only ${entries.length} past numbers stored — need at least 30 to predict.` : 'Could not predict.' };
      return {
        lottery,
        prize,
        model: findModel(modelId)?.name,
        target_draw_date: targetDate,
        past_numbers_used: entries.length,
        guesses: rows[0].predicted_numbers.map((c) => ({ rank: c.rank, number: c.number, reason: c.reason })),
        note: 'Ranking by recent digit frequency, not a probability of winning. Not saved — save from the Predictions page to track it.',
      };
    },
  },

  get_results: {
    description: 'Stored winning numbers. Filter by lottery, prize, exact date or date range (YYYY-MM-DD). Newest first.',
    parameters: {
      type: 'object',
      properties: {
        lottery: { type: 'string' },
        prize: { type: 'string' },
        date: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        limit: { type: 'integer', description: 'Max rows (default 40, max 200)' },
      },
    },
    run: async (admin, a) => {
      const lottery = a.lottery ? await resolveLottery(admin, a.lottery) : null;
      const prize = a.prize ? await resolvePrize(admin, null, a.prize) : null;
      let q = admin.from('v_results').select('lottery_name, draw_code, draw_date, prize_category, winning_number');
      if (lottery) q = q.eq('lottery_name', lottery);
      if (prize) q = q.eq('prize_category', prize);
      if (a.date) q = q.eq('draw_date', a.date);
      if (a.from) q = q.gte('draw_date', a.from);
      if (a.to) q = q.lte('draw_date', a.to);
      const { data, error } = await q
        .order('draw_date', { ascending: false })
        .order('prize_rank', { ascending: true })
        .limit(clamp(a.limit, 1, 200, 40));
      if (error) throw new Error(error.message);
      return { count: data.length, results: data };
    },
  },

  find_number: {
    description: 'Searches history for a number (or its last digits) — when and in which lottery/prize it won.',
    parameters: {
      type: 'object',
      properties: { number: { type: 'string', description: '4-6 digits' }, lottery: { type: 'string' } },
      required: ['number'],
    },
    run: async (admin, a) => {
      const num = String(a.number).replace(/\D/g, '');
      if (num.length < 2) throw new ToolError('Give at least 2 digits.');
      let q = admin.from('v_results').select('lottery_name, draw_code, draw_date, prize_category, winning_number').like('normalized_number', `%${num}`);
      if (a.lottery) q = q.eq('lottery_name', await resolveLottery(admin, a.lottery));
      const { data, error } = await q.order('draw_date', { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return { searched: num, matches: data.length, results: data };
    },
  },

  get_saved_predictions: {
    description: 'Predictions saved before draws (by the daily job or the Predictions page) and, once checked, the actual result and how close they were.',
    parameters: {
      type: 'object',
      properties: {
        lottery: { type: 'string' },
        status: { type: 'string', enum: ['all', 'checked', 'pending'] },
        limit: { type: 'integer', description: 'default 15, max 50' },
      },
    },
    run: async (admin, a) => {
      let q = admin.from('predictions').select('*');
      if (a.lottery) q = q.eq('lottery_name', await resolveLottery(admin, a.lottery));
      if (a.status === 'checked') q = q.eq('evaluated', true);
      if (a.status === 'pending') q = q.eq('evaluated', false);
      const { data, error } = await q.order('target_draw_date', { ascending: false }).limit(clamp(a.limit, 1, 50, 15));
      if (error) throw new Error(error.message);
      return {
        predictions: data.map((p) => ({
          lottery: p.lottery_name,
          prize: p.prize_category,
          draw_date: p.target_draw_date,
          model: findModel(p.model_name)?.name ?? p.model_name,
          guesses: guessNumbers(p),
          actual_number: p.evaluated ? p.actual_number : 'not drawn / not checked yet',
          ...(p.evaluated && {
            exact_match: p.exact_match,
            best_digits_in_right_place: p.position_matches,
            last_digit_match: p.last_digit_match,
          }),
        })),
      };
    },
  },

  get_performance: {
    description: 'How well saved predictions did after the draws, per model, compared with pure luck.',
    parameters: { type: 'object', properties: { lottery: { type: 'string' } } },
    run: async (admin, a) => {
      let q = admin.from('predictions').select('*').eq('evaluated', true);
      if (a.lottery) q = q.eq('lottery_name', await resolveLottery(admin, a.lottery));
      const { data, error } = await q.limit(1000);
      if (error) throw new Error(error.message);
      if (!data.length) return { message: 'No predictions have been checked against results yet.' };
      const byModel = {};
      for (const p of data) {
        const m = (byModel[p.model_name] ??= { draws: 0, exact: 0, last_digit: 0, last_two: 0, positionSum: 0 });
        m.draws += 1;
        m.exact += p.exact_match ? 1 : 0;
        m.last_digit += p.last_digit_match ? 1 : 0;
        m.last_two += p.last_two_match ? 1 : 0;
        m.positionSum += p.position_matches ?? 0;
      }
      const len = data[0].actual_number?.length ?? 6;
      const count = guessNumbers(data[0]).length || 10;
      const luck = theoreticalBaseline(len, count);
      return {
        guesses_per_draw: count,
        models: Object.entries(byModel).map(([id, m]) => ({
          model: findModel(id)?.name ?? id,
          draws_checked: m.draws,
          exact_wins: m.exact,
          last_digit_right: m.last_digit,
          last_two_right: m.last_two,
          avg_digits_in_right_place: Number((m.positionSum / m.draws).toFixed(2)),
        })),
        pure_luck: {
          last_digit_rate: Number(luck.lastDigitRate.toFixed(3)),
          last_two_rate: Number(luck.lastTwoRate.toFixed(3)),
          avg_digits_in_right_place: Number(luck.meanPositionMatches.toFixed(2)),
        },
      };
    },
  },

  get_pattern_stats: {
    description: 'Statistical analysis of a lottery/prize: digit frequencies, last digits, odd/even, digit sums, with p-values vs randomness.',
    parameters: { type: 'object', properties: { lottery: { type: 'string' }, prize: { type: 'string' } }, required: ['lottery'] },
    run: async (admin, a) => {
      const lottery = await resolveLottery(admin, a.lottery);
      const prize = await resolvePrize(admin, lottery, a.prize);
      const entries = await loadEntries(admin, lottery, prize);
      if (!entries.length) return { lottery, prize, error: 'No results stored.' };
      const report = analyzeEntries(entries);
      return { lottery, prize, sample_size: report.sampleSize, ...compactAnalytics(report) };
    },
  },

  get_app_status: {
    description: 'Overall app health: data counts, sources and their last fetch, recent fetch errors, daily schedule.',
    parameters: { type: 'object', properties: {} },
    run: async (admin) => {
      const count = async (table) => (await admin.from(table).select('id', { count: 'exact', head: true })).count ?? 0;
      const [draws, results, predictions, sources, logs] = await Promise.all([
        count('lottery_draws'),
        count('lottery_results'),
        count('predictions'),
        admin.from('lottery_sources').select('name, url, active, fetch_frequency, last_fetched_at, last_successful_fetch_at'),
        admin.from('fetch_logs').select('fetched_at, success, records_inserted, error_message, url').order('fetched_at', { ascending: false }).limit(5),
      ]);
      let schedule = null;
      try {
        schedule = await rpc(admin, 'daily_schedule_status');
      } catch {
        // schedule not configured
      }
      return { draws, results, predictions, sources: sources.data ?? [], recent_fetches: logs.data ?? [], schedule };
    },
  },
};

// Gemini rejects an object schema with no properties, so parameterless tools omit it.
export const functionDeclarations = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  ...(Object.keys(t.parameters.properties).length && { parameters: t.parameters }),
}));

/** Runs a tool; errors come back as { error } so the model can explain or retry. */
export async function runTool(admin, name, args = {}) {
  const tool = TOOLS[name];
  if (!tool) return { error: `Unknown tool ${name}` };
  try {
    return await tool.run(admin, args || {});
  } catch (e) {
    if (!(e instanceof ToolError)) console.error(`tool ${name} failed`, e);
    return { error: e.message };
  }
}
