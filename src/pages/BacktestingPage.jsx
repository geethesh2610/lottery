import { useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, FormControlLabel, FormGroup, LinearProgress, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useAuth } from '../hooks/useAuth.jsx';
import { useEntries, useLotterySelection } from '../hooks/useLotteryData.js';
import { MODELS, runBacktest, rollingPerformance } from '../prediction/index.js';
import { saveBacktestRun } from '../services/predictionsService.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState, ResponsiveGrid, Disclaimer } from '../components/common.jsx';
import { LotteryPrizeSelect, SimpleSelect } from '../components/LotteryPrizeSelect.jsx';
import { GroupedBarChart, MultiLineChart } from '../components/charts.jsx';
import { SignInNotice } from '../components/SignInNotice.jsx';

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fmtP = (p) => (p == null ? '—' : p < 0.0001 ? '<0.0001' : p.toFixed(4));

export function BacktestSummaryTable({ summary }) {
  const b = summary.baseline;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Model</TableCell>
            <TableCell align="right">Exact</TableCell>
            <TableCell align="right">Last digit</TableCell>
            <TableCell align="right">Last two</TableCell>
            <TableCell align="right">Avg position matches</TableCell>
            <TableCell align="right">Avg matching digits</TableCell>
            <TableCell align="right">Smallest p</TableCell>
            <TableCell>Verdict</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell><em>Theoretical random</em></TableCell>
            <TableCell align="right">{(b.exactRate * 100).toExponential(1)}%</TableCell>
            <TableCell align="right">{pct(b.lastDigitRate)}</TableCell>
            <TableCell align="right">{pct(b.lastTwoRate)}</TableCell>
            <TableCell align="right">{b.meanPositionMatches.toFixed(3)}</TableCell>
            <TableCell align="right">{b.meanDigitMatches.toFixed(3)}</TableCell>
            <TableCell align="right">—</TableCell>
            <TableCell>baseline</TableCell>
          </TableRow>
          {summary.models.map((m) => (
            <TableRow key={m.modelId}>
              <TableCell>{m.name}</TableCell>
              <TableCell align="right">{m.exactMatches}</TableCell>
              <TableCell align="right">{pct(m.lastDigitRate)}</TableCell>
              <TableCell align="right">{pct(m.lastTwoRate)}</TableCell>
              <TableCell align="right">{m.meanPositionMatches.toFixed(3)}</TableCell>
              <TableCell align="right">{m.meanDigitMatches.toFixed(3)}</TableCell>
              <TableCell align="right">{fmtP(m.minPValue)}</TableCell>
              <TableCell>
                {m.modelId === 'random' ? <Chip size="small" label="empirical baseline" /> : m.significant ? <Chip size="small" color="warning" label="beats baseline?" /> : <Chip size="small" label="no advantage" />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary">
        Metrics use the best of the K candidates for each draw. p-values are one-sided tests against the theoretical random baseline; a model
        “beats” it only if p &lt; {summary.alpha.toPrecision(2)} (0.05 Bonferroni-corrected for {summary.comparisons} comparisons).
      </Typography>
    </Box>
  );
}

export default function BacktestingPage() {
  const { user } = useAuth();
  const selection = useLotterySelection();
  const entries = useEntries(selection.lottery, selection.prize);
  const [mode, setMode] = useState('month');
  const [minTrain, setMinTrain] = useState(30);
  const [count, setCount] = useState(10);
  const [maxSteps, setMaxSteps] = useState(200);
  const [modelIds, setModelIds] = useState(MODELS.map((m) => m.id));
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const run = async () => {
    setError(null);
    setResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const res = await runBacktest(entries.data, {
        modelIds,
        mode,
        minTrainSize: Number(minTrain) || 30,
        count: Number(count) || 10,
        maxSteps: Number(maxSteps) || null,
        samples: 800,
        seed: `${selection.lottery}|${selection.prize}`,
        onProgress: setProgress,
      });
      setResult(res);
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
    }
  };

  const save = async () => {
    try {
      for (const m of result.summary.models) {
        await saveBacktestRun({
          lottery_name: selection.lottery,
          prize_category: selection.prize,
          training_start_date: result.trainingStart,
          training_end_date: result.trainingEnd,
          model_name: m.modelId,
          sample_size: m.steps,
          results: {
            config: result.config,
            summary: m,
            baseline: result.summary.baseline,
            alpha: result.summary.alpha,
            verdict: result.summary.verdict,
            steps: result.steps.map((s) => {
              const r = s.models[m.modelId];
              return { d: s.draw_date, a: s.actual, t: r.top, p: r.position_matches, g: r.matching_digits, l1: r.last_digit_match, l2: r.last_two_match, e: r.exact_match };
            }),
          },
        });
      }
      setToast('Backtest saved — see Performance');
    } catch (e) {
      setError(e);
    }
  };

  const toggleModel = (id) => setModelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const summary = result?.summary;

  return (
    <>
      <PageHeader
        title="Backtesting"
        subtitle="Walk-forward evaluation: each prediction is made using only results published before the target draw. Future results never leak into training."
      />
      <Disclaimer />
      <ErrorAlert error={selection.error || entries.error || error} />
      {selection.lotteryOptions.length === 0 && !selection.loading ? (
        <EmptyState title="No data yet" description="Collect results first." />
      ) : (
        <LotteryPrizeSelect selection={selection} />
      )}
      <SectionCard title="Configuration">
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
            <SimpleSelect label="Walk-forward step" value={mode} onChange={setMode} minWidth={260} options={[
              { value: 'month', label: 'Monthly (train Jan–Jun → predict Jul …)' },
              { value: 'draw', label: 'Every draw (retrain before each draw)' },
            ]} />
            <TextField size="small" type="number" label="Min. training results" value={minTrain} onChange={(e) => setMinTrain(e.target.value)} sx={{ width: 180 }} />
            <TextField size="small" type="number" label="Candidates per draw (K)" value={count} onChange={(e) => setCount(e.target.value)} sx={{ width: 190 }} />
            <TextField size="small" type="number" label="Max. test draws (latest)" value={maxSteps} onChange={(e) => setMaxSteps(e.target.value)} sx={{ width: 190 }} />
          </Stack>
          <FormGroup row>
            {MODELS.map((m) => (
              <FormControlLabel key={m.id} control={<Checkbox checked={modelIds.includes(m.id)} onChange={() => toggleModel(m.id)} />} label={m.name} />
            ))}
          </FormGroup>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={run} disabled={!entries.data?.length || !!progress || !modelIds.length}>Run backtest</Button>
            <Button variant="outlined" onClick={save} disabled={!result || !user}>Save results</Button>
          </Stack>
          {!user && result && <SignInNotice action="save backtest results" />}
          {progress && (
            <Box>
              <LinearProgress variant={progress.total ? 'determinate' : 'indeterminate'} value={progress.total ? (progress.done / progress.total) * 100 : 0} />
              <Typography variant="caption">{progress.done} / {progress.total || '…'} draws</Typography>
            </Box>
          )}
        </Stack>
      </SectionCard>

      {entries.loading && <LoadingState />}
      {result && (
        <Stack spacing={3} sx={{ mt: 3 }}>
          <Alert severity={summary.advantageDetected ? 'warning' : summary.insufficient ? 'info' : 'success'}>
            <strong>{summary.verdict}</strong> ({summary.steps} test draws, training from {result.trainingStart})
          </Alert>
          <SectionCard title="Model performance vs. random baseline">
            <BacktestSummaryTable summary={summary} />
          </SectionCard>
          <ResponsiveGrid min={440}>
            <SectionCard title="Last-digit hit rate" subtitle="Red line = theoretical random baseline">
              <GroupedBarChart data={summary.models.map((m) => ({ model: m.name.split(' — ')[0], rate: Number(m.lastDigitRate.toFixed(3)) }))} xKey="model" series={[{ key: 'rate', label: 'Hit rate' }]} referenceY={Number(summary.baseline.lastDigitRate.toFixed(3))} />
            </SectionCard>
            <SectionCard title="Average position matches" subtitle="Red line = theoretical random baseline">
              <GroupedBarChart data={summary.models.map((m) => ({ model: m.name.split(' — ')[0], matches: Number(m.meanPositionMatches.toFixed(3)) }))} xKey="model" series={[{ key: 'matches', label: 'Position matches' }]} referenceY={Number(summary.baseline.meanPositionMatches.toFixed(3))} />
            </SectionCard>
            <SectionCard title="Rolling performance" subtitle="20-draw rolling mean of position matches">
              {result.steps.length >= 20 ? (
                <MultiLineChart data={rollingPerformance(result.steps, modelIds)} xKey="draw_date" series={modelIds.map((id) => ({ key: id, label: MODELS.find((m) => m.id === id).name.split(' — ')[0], dashed: id === 'random' }))} referenceY={Number(summary.baseline.meanPositionMatches.toFixed(3))} />
              ) : <Alert severity="info">Insufficient historical data for a rolling chart.</Alert>}
            </SectionCard>
          </ResponsiveGrid>
        </Stack>
      )}
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
