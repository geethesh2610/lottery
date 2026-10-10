// chat: AI assistant for the app, powered by the Gemini API free tier.
// The model answers questions about the app and calls tools (./tools.js) that
// read real data and run the real prediction models.
//
// POST { messages: [{ role: 'user' | 'model', text }] }  ->  { reply }
// Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional).
import { corsHeaders, json, errorResponse, readJson } from '../_shared/http.js';
import { createAdminClient, authorize } from '../_shared/supabase.js';
import { todayIso } from '../_shared/core/utils/dates.js';
import { functionDeclarations, runTool } from './tools.js';

const DEFAULT_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite'; // separate free quota, used when the main one is rate limited
const MAX_TOOL_ROUNDS = 6;
const MAX_HISTORY = 20;
const CALL_TIMEOUT_MS = 40000; // Edge Functions have a wall-clock limit; don't let one slow call eat it

const APP_GUIDE = `
You are the assistant inside "Kerala Lottery Pattern Analyzer", a web app that collects Kerala State lottery results,
analyses them for patterns, makes experimental predictions and checks whether those predictions beat random guessing.

PAGES (left sidebar)
- Dashboard: latest results and a quick check of whether any pattern exists.
- Lottery Sources: websites the app scrapes. Add a source URL, preview what it parses, fetch now, or run a historical
  import that crawls older result pages. Each source has a fetch frequency (daily / weekly / manual).
- Historical Results: searchable, sortable table of every stored winning number; filters by lottery, prize, dates;
  CSV import and download.
- Pattern Analysis: digit frequency, digits by position, last digit, odd/even, digit sums, repeated digits —
  each compared with what pure randomness gives, with p-values and Bonferroni correction for multiple tests.
- Predictions: pick lottery + prize, generate guesses from the Pattern model (or Random guesses), and save them.
  Saved predictions are checked automatically once the draw result is fetched.
- Performance: "Test on past draws" replays history (models only see earlier results, 10 guesses per draw, last 200 draws)
  and shows draw by draw what was predicted vs what came, with green digits for correct positions.
  "Real predictions so far" shows every saved prediction and its result. A verdict says whether any model beats luck.
- Data Quality (from Settings): completeness per lottery and missing draw dates.
- Settings: Supabase connection, daily automation (pg_cron runs the daily-run job, default 17:00 IST: fetch sources,
  check pending predictions, refresh analytics, save predictions for the next draws), analysis parameters.

MODELS
- Pattern model ("recent"): favours digits that came up often in each position recently (a draw 20 draws ago counts half).
- Random guess: uniform random numbers, the baseline the Pattern model must beat.
Scores are ranking scores, not probabilities. 1st/2nd/3rd/Consolation prizes are 6 digits; 4th prize and lower publish
4 digits and have many winning numbers per draw. Predictions need at least 30 past numbers.

RULES
- For ANY question about data (results, numbers, predictions, performance, sources, status) call a tool. Never invent
  or guess numbers yourself — predicted numbers must come from predict_next_draw.
- When the user asks to predict, call predict_next_draw and list the guesses clearly with the target draw date,
  then add one short line that lottery draws are random and the model has not been shown to beat luck.
- If a tool returns an error (e.g. unknown lottery), tell the user plainly and suggest the available options.
- Be concise. Use short paragraphs and "-" bullet lists. You may use **bold**. No tables, no headings.
- Reply in the language the user writes in.
`.trim();

async function callGemini(apiKey, model, body) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Gemini API error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function generate(apiKey, model, body) {
  try {
    return await callGemini(apiKey, model, body);
  } catch (e) {
    // Rate limited, overloaded or too slow: retry once on the lite model (its own free quota).
    const retry = e.status === 429 || e.status >= 500 || e.name === 'TimeoutError';
    if (retry && model !== FALLBACK_MODEL) return callGemini(apiKey, FALLBACK_MODEL, body);
    throw e;
  }
}

function toContents(messages) {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, parts: [{ text: m.text.slice(0, 4000) }] }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return errorResponse('The assistant is not set up yet: add a free Gemini API key as the GEMINI_API_KEY function secret (see README).', 503);
  }
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;

  const admin = createAdminClient();
  const caller = await authorize(req, admin);
  if (!caller) return errorResponse('Sign in to use the assistant.', 401);

  const body = await readJson(req);
  const contents = toContents(Array.isArray(body.messages) ? body.messages : []);
  if (!contents.length || contents[contents.length - 1].role !== 'user') return errorResponse('Send a message.');

  const request = {
    systemInstruction: { parts: [{ text: `${APP_GUIDE}\n\nToday's date: ${todayIso()}.` }] },
    tools: [{ functionDeclarations }],
    generationConfig: { thinkingConfig: { thinkingLevel: 'low' } }, // faster replies; tool use doesn't need deep thinking
    contents,
  };

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const data = await generate(apiKey, model, request);
      const content = data.candidates?.[0]?.content;
      const parts = content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length || round === MAX_TOOL_ROUNDS) {
        const reply = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
        return json({ ok: true, reply: reply || "Sorry, I couldn't come up with an answer. Try rephrasing." });
      }
      // Echo the model turn back unchanged (keeps thought signatures), then answer each call.
      request.contents.push({ role: 'model', parts });
      const responses = await Promise.all(calls.map(async ({ functionCall: fc }) => ({
        functionResponse: { ...(fc.id && { id: fc.id }), name: fc.name, response: await runTool(admin, fc.name, fc.args) },
      })));
      request.contents.push({ role: 'user', parts: responses });
    }
  } catch (e) {
    console.error(e);
    const message = e.name === 'TimeoutError'
      ? 'Gemini is responding slowly right now. Please try again in a moment.'
      : e.status === 429
      ? 'The free Gemini quota is used up for now. Wait a minute (or until tomorrow for the daily limit) and try again.'
      : `Assistant error: ${e.message}`;
    return errorResponse(message, e.status === 429 ? 429 : e.name === 'TimeoutError' ? 504 : 500);
  }
});
