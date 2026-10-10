import { Fragment, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, IconButton, LinearProgress, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useAsync } from '../hooks/useAsync.js';
import { useEntries, useLotterySelection } from '../hooks/useLotteryData.js';
import { listPredictions } from '../services/predictionsService.js';
import { MODELS, findModel, positionMatches, runBacktest, summarizeBacktest } from '../prediction/index.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState, NumberText, ResponsiveGrid } from '../components/common.jsx';
import { GroupedBarChart } from '../components/charts.jsx';
import { LotteryPrizeSelect } from '../components/LotteryPrizeSelect.jsx';

const GUESSES = 10;
const TEST_DRAWS = 200;
const PAGE_SIZE = 25;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

/** The guess closest to the actual number (most digits in the right place). */
function closestGuess(guesses, actual) {
  let best = null;
  let bestScore = -1;
  for (const g of guesses) {
    if (g.length !== actual.length) continue;
    const score = positionMatches(g, actual) * 10 + (g.slice(-1) === actual.slice(-1) ? 1 : 0);
    if (score > bestScore) {
      best = g;
      bestScore = score;
    }
  }
  return best;
}

/** A guess with each digit that sits in the right place highlighted green. */
function DigitCompare({ guess, actual, size = '1rem' }) {
  if (!guess) return <Typography variant="body2" color="text.secondary">—</Typography>;
  return (
    <NumberText sx={{ fontSize: size, letterSpacing: 0 }}>
      {[...guess].map((d, i) => {
        const hit = actual && d === actual[i];
        return (
          <Box
            key={i}
            component="span"
            sx={{
              display: 'inline-block',
              minWidth: '1.15em',
              textAlign: 'center',
              borderRadius: 0.5,
              mx: '1px',
              bgcolor: hit ? 'success.main' : 'transparent',
              color: hit ? 'success.contrastText' : 'text.primary',
            }}
          >
            {d}
          </Box>
        );
      })}
    </NumberText>
  );
}

function YesNo({ value }) {
  return value
    ? <Chip size="small" color="success" label="Yes" />
    : <Chip size="small" variant="outlined" label="No" />;
}

function Legend() {
  return (
    <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
      Green digits = right digit in the right place. &quot;Closest guess&quot; is whichever of our {GUESSES} guesses had the most green digits.
    </Typography>
  );
}

/** One plain-language card per model: what it got right, next to what luck alone gets. */
function PlainSummary({ summary }) {
  const b = summary.baseline;
  return (
    <ResponsiveGrid min={300}>
      {summary.models.map((m) => (
        <Box key={m.modelId} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{m.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Made {GUESSES} guesses for each of {m.steps} draws
          </Typography>
          <Stack spacing={0.75}>
            <Typography variant="body2">
              <strong>Exact number right:</strong> {m.exactMatches} of {m.steps} draws
            </Typography>
            <Typography variant="body2">
              <strong>Last 2 digits right:</strong> {m.lastTwoHits} of {m.steps} draws ({pct(m.lastTwoRate)})
              <Typography component="span" variant="body2" color="text.secondary"> · luck: {pct(b.lastTwoRate)}</Typography>
            </Typography>
            <Typography variant="body2">
              <strong>Last digit right:</strong> {m.lastDigitHits} of {m.steps} draws ({pct(m.lastDigitRate)})
              <Typography component="span" variant="body2" color="text.secondary"> · luck: {pct(b.lastDigitRate)}</Typography>
            </Typography>
            <Typography variant="body2">
              <strong>Digits in the right place:</strong> {m.meanPositionMatches.toFixed(1)} on average (closest guess)
              <Typography component="span" variant="body2" color="text.secondary"> · luck: {b.meanPositionMatches.toFixed(1)}</Typography>
            </Typography>
          </Stack>
        </Box>
      ))}
    </ResponsiveGrid>
  );
}

/** Statistical comparison of each model with what random guessing achieves. */
function SimpleSummaryTable({ summary }) {
  const b = summary.baseline;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Model</TableCell>
            <TableCell align="right">Draws tested</TableCell>
            <TableCell align="right">Last digit right</TableCell>
            <TableCell align="right">Digits in the right place (avg)</TableCell>
            <TableCell align="right">Exact wins</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {summary.models.map((m) => (
            <TableRow key={m.modelId}>
              <TableCell>{m.name}</TableCell>
              <TableCell align="right">{m.steps}</TableCell>
              <TableCell align="right">{m.lastDigitHits} ({pct(m.lastDigitRate)})</TableCell>
              <TableCell align="right">{m.meanPositionMatches.toFixed(2)}</TableCell>
              <TableCell align="right">{m.exactMatches}</TableCell>
            </TableRow>
          ))}
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell><em>Expected from pure luck</em></TableCell>
            <TableCell align="right">—</TableCell>
            <TableCell align="right">{pct(b.lastDigitRate)}</TableCell>
            <TableCell align="right">{b.meanPositionMatches.toFixed(2)}</TableCell>
            <TableCell align="right">≈0</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  );
}

function Verdict({ summary }) {
  const severity = summary.advantageDetected ? 'warning' : summary.insufficient ? 'info' : 'success';
  return <Alert severity={severity}><strong>{summary.verdict}</strong></Alert>;
}

function ModelToggle({ value, onChange, modelIds }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={value} onChange={(_, v) => v && onChange(v)}>
      {modelIds.map((id) => (
        <ToggleButton key={id} value={id}>{findModel(id)?.name ?? id}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/**
 * Draw-by-draw table. rows: [{ key, draw_date, label?, guesses: string[], actual: string|null }]
 * actual === null means the draw hasn't happened / been checked yet.
 */
function DrawTable({ rows, showLabel = false }) {
  const [open, setOpen] = useState(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const cols = showLabel ? 8 : 7;

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Legend />
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>Draw date</TableCell>
            {showLabel && <TableCell>Lottery / prize</TableCell>}
            <TableCell>Actual winning number</TableCell>
            <TableCell>Our closest guess</TableCell>
            <TableCell align="center">Digits in right place</TableCell>
            <TableCell align="center">Last digit right?</TableCell>
            <TableCell align="center">Exact match?</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, visible).map((r) => {
            const best = r.actual ? closestGuess(r.guesses, r.actual) : r.guesses[0];
            const isOpen = open === r.key;
            return (
              <Fragment key={r.key}>
                <TableRow hover>
                  <TableCell padding="checkbox">
                    <IconButton size="small" aria-label="show all guesses" onClick={() => setOpen(isOpen ? null : r.key)}>
                      {isOpen ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                    </IconButton>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.draw_date}</TableCell>
                  {showLabel && <TableCell>{r.label}</TableCell>}
                  <TableCell>
                    {r.actual
                      ? <NumberText sx={{ fontSize: '1rem' }}>{r.actual}</NumberText>
                      : <Chip size="small" label="Waiting for result" />}
                  </TableCell>
                  <TableCell><DigitCompare guess={best} actual={r.actual} /></TableCell>
                  <TableCell align="center">{r.actual ? `${positionMatches(best ?? '', r.actual)} of ${r.actual.length}` : '—'}</TableCell>
                  <TableCell align="center">{r.actual ? <YesNo value={r.guesses.some((g) => g.slice(-1) === r.actual.slice(-1))} /> : '—'}</TableCell>
                  <TableCell align="center">{r.actual ? <YesNo value={r.guesses.includes(r.actual)} /> : '—'}</TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow>
                    <TableCell colSpan={cols} sx={{ bgcolor: 'action.hover' }}>
                      <Typography variant="caption" color="text.secondary">All {r.guesses.length} guesses for this draw:</Typography>
                      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, mt: 0.5 }}>
                        {r.guesses.map((g, i) => <DigitCompare key={`${g}-${i}`} guess={g} actual={r.actual} />)}
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      {visible < rows.length && (
        <Button size="small" sx={{ mt: 1 }} onClick={() => setVisible((v) => v + PAGE_SIZE)}>
          Show more ({rows.length - visible} more draws)
        </Button>
      )}
    </Box>
  );
}

function HistoryTest() {
  const selection = useLotterySelection();
  const entries = useEntries(selection.lottery, selection.prize);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [modelId, setModelId] = useState(MODELS[0].id);

  const run = async () => {
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      setResult(await runBacktest(entries.data, {
        modelIds: MODELS.map((m) => m.id),
        mode: 'month',
        count: GUESSES,
        maxSteps: TEST_DRAWS,
        seed: `${selection.lottery}|${selection.prize}`,
        onProgress: setProgress,
      }));
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
    }
  };

  const summary = result?.summary;
  const drawRows = useMemo(
    () => (result?.steps ?? [])
      .filter((s) => s.models[modelId])
      .map((s) => ({ key: s.draw_date, draw_date: s.draw_date, actual: s.actual, guesses: s.models[modelId].candidates ?? [s.models[modelId].top] }))
      .reverse(),
    [result, modelId],
  );

  return (
    <SectionCard
      title="Test on past draws"
      subtitle={`Replays history: for each past draw, the models only see earlier results, make ${GUESSES} guesses, and we check them against what actually came up.`}
    >
      <ErrorAlert error={selection.error || entries.error || error} />
      {selection.lotteryOptions.length === 0 && !selection.loading ? (
        <EmptyState title="No data yet" description="Collect results first." />
      ) : (
        <LotteryPrizeSelect selection={selection}>
          <Button variant="contained" onClick={run} disabled={!entries.data?.length || !!progress}>Run test</Button>
        </LotteryPrizeSelect>
      )}
      {entries.loading && <LoadingState />}
      {progress && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress variant={progress.total ? 'determinate' : 'indeterminate'} value={progress.total ? (progress.done / progress.total) * 100 : 0} />
          <Typography variant="caption">{progress.done} / {progress.total || '…'} draws</Typography>
        </Box>
      )}
      {summary && (
        <Stack spacing={3}>
          <Verdict summary={summary} />
          <PlainSummary summary={summary} />
          <Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 1 }}>
              <Typography variant="subtitle2">Draw by draw: what we predicted vs what actually came</Typography>
              <ModelToggle value={modelId} onChange={setModelId} modelIds={result.config.modelIds} />
            </Stack>
            {selection.prize && !/^1st/i.test(selection.prize) && (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                This prize has several winning numbers per draw; the test checks against the first one listed.
              </Typography>
            )}
            <DrawTable key={`${modelId}|${result.trainingEnd}`} rows={drawRows} />
          </Box>
          <Accordion disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Statistics: pattern model vs random guessing</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                How often one of the {GUESSES} guesses had the right last digit. The red line is what pure luck gives
                ({pct(summary.baseline.lastDigitRate)}). Bars near the line mean no real advantage.
              </Typography>
              <GroupedBarChart
                data={summary.models.map((m) => ({ model: m.name, rate: Number(m.lastDigitRate.toFixed(3)) }))}
                xKey="model"
                series={[{ key: 'rate', label: 'Last-digit hit rate' }]}
                referenceY={Number(summary.baseline.lastDigitRate.toFixed(3))}
              />
              <SimpleSummaryTable summary={summary} />
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}
    </SectionCard>
  );
}

const guessNumbers = (p) => (p.predicted_numbers || []).map((x) => (typeof x === 'string' ? x : x.number)).filter(Boolean);

function LivePerformance() {
  const preds = useAsync(() => listPredictions({ limit: 1000 }), []);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const known = useMemo(() => (preds.data || []).filter((p) => findModel(p.model_name)), [preds.data]);

  const summary = useMemo(() => {
    const rows = known.filter((p) => p.evaluated);
    if (!rows.length) return null;
    const steps = new Map();
    const modelIds = new Set();
    for (const p of rows) {
      const key = `${p.lottery_name}|${p.prize_category}|${p.target_draw_date}`;
      if (!steps.has(key)) steps.set(key, { draw_date: p.target_draw_date, models: {} });
      steps.get(key).models[p.model_name] = p;
      modelIds.add(p.model_name);
    }
    const list = [...steps.values()].sort((a, b) => (a.draw_date < b.draw_date ? -1 : 1));
    const len = rows[0].actual_number?.length ?? 6;
    const count = rows[0].predicted_numbers?.length ?? GUESSES;
    return summarizeBacktest(list, { modelIds: [...modelIds], length: len, count });
  }, [known]);

  const modelIds = useMemo(() => MODELS.map((m) => m.id).filter((id) => known.some((p) => p.model_name === id)), [known]);
  const shownModel = modelIds.includes(modelId) ? modelId : modelIds[0];
  const drawRows = useMemo(
    () => known
      .filter((p) => p.model_name === shownModel)
      .map((p) => ({
        key: p.id,
        draw_date: p.target_draw_date,
        label: `${p.lottery_name} · ${p.prize_category}`,
        actual: p.evaluated ? p.actual_number : null,
        guesses: guessNumbers(p),
      })),
    [known, shownModel],
  );

  return (
    <SectionCard title="Real predictions so far" subtitle="Guesses saved before a draw, checked after the result came out">
      <ErrorAlert error={preds.error} onRetry={preds.reload} />
      {preds.loading ? <LoadingState /> : !known.length ? (
        <EmptyState title="No predictions yet" description="The daily job saves predictions for upcoming draws and checks them once the results are published." />
      ) : (
        <Stack spacing={3}>
          {summary ? (
            <>
              <Verdict summary={summary} />
              <PlainSummary summary={summary} />
            </>
          ) : (
            <Alert severity="info">None of the saved predictions have been checked yet — results appear here after each draw.</Alert>
          )}
          <Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 1 }}>
              <Typography variant="subtitle2">Every saved prediction</Typography>
              {modelIds.length > 1 && <ModelToggle value={shownModel} onChange={setModelId} modelIds={modelIds} />}
            </Stack>
            <DrawTable key={shownModel} rows={drawRows} showLabel />
          </Box>
        </Stack>
      )}
    </SectionCard>
  );
}

export default function PerformancePage() {
  return (
    <>
      <PageHeader title="Performance" subtitle="What we predicted, what actually came, and whether the pattern model beats random guessing." />
      <Stack spacing={3}>
        <HistoryTest />
        <LivePerformance />
      </Stack>
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          A fair lottery cannot be predicted, so the pattern model is expected to perform about the same as random guessing.
        </Typography>
      </Box>
    </>
  );
}
