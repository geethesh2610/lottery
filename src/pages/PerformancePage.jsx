import { useMemo, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useAsync } from '../hooks/useAsync.js';
import { useEntries, useLotterySelection } from '../hooks/useLotteryData.js';
import { listPredictions } from '../services/predictionsService.js';
import { MODELS, findModel, runBacktest, summarizeBacktest } from '../prediction/index.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState } from '../components/common.jsx';
import { GroupedBarChart } from '../components/charts.jsx';
import { LotteryPrizeSelect } from '../components/LotteryPrizeSelect.jsx';

const GUESSES = 10;
const TEST_DRAWS = 200;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

/** Plain-language comparison of each model with what random guessing achieves. */
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
              <TableCell align="right">{pct(m.lastDigitRate)}</TableCell>
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

function HistoryTest() {
  const selection = useLotterySelection();
  const entries = useEntries(selection.lottery, selection.prize);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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
          <Box>
            <Typography variant="subtitle2">Pattern model vs random guessing</Typography>
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
          </Box>
          <SimpleSummaryTable summary={summary} />
        </Stack>
      )}
    </SectionCard>
  );
}

function LivePerformance() {
  const preds = useAsync(() => listPredictions({ evaluated: true, limit: 1000 }), []);
  const summary = useMemo(() => {
    const rows = (preds.data || []).filter((p) => findModel(p.model_name));
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
  }, [preds.data]);

  return (
    <SectionCard title="Real predictions so far" subtitle="Guesses saved before a draw, checked after the result came out">
      <ErrorAlert error={preds.error} onRetry={preds.reload} />
      {preds.loading ? <LoadingState /> : !summary ? (
        <EmptyState title="No checked predictions yet" description="The daily job saves predictions for upcoming draws and checks them once the results are published." />
      ) : (
        <Stack spacing={2}>
          <Verdict summary={summary} />
          <SimpleSummaryTable summary={summary} />
        </Stack>
      )}
    </SectionCard>
  );
}

export default function PerformancePage() {
  return (
    <>
      <PageHeader title="Performance" subtitle="Does the pattern model guess better than random? This page answers that one question." />
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
