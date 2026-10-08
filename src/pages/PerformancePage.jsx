import { useMemo, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { deleteBacktestRun, listBacktestRuns, listPredictions } from '../services/predictionsService.js';
import { MODELS, summarizeBacktest, rollingPerformance } from '../prediction/index.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState, ResponsiveGrid, formatDateTime } from '../components/common.jsx';
import { GroupedBarChart, MultiLineChart } from '../components/charts.jsx';
import { SimpleSelect } from '../components/LotteryPrizeSelect.jsx';
import { BacktestSummaryTable } from './BacktestingPage.jsx';
import { NO_ADVANTAGE_MESSAGE } from '../constants/app.js';

const modelLabel = (id) => (MODELS.find((m) => m.id === id)?.name ?? id).split(' — ')[0];

/** Groups saved per-model backtest rows (same lottery/prize/run time) into runs. */
function groupRuns(rows) {
  const runs = new Map();
  for (const r of rows) {
    const key = `${r.lottery_name}|${r.prize_category}|${r.training_end_date}|${r.results?.config?.mode}|${r.created_at.slice(0, 16)}`;
    if (!runs.has(key)) runs.set(key, { key, lottery: r.lottery_name, prize: r.prize_category, created_at: r.created_at, rows: [] });
    runs.get(key).rows.push(r);
  }
  return [...runs.values()];
}

/** Rebuilds step objects from compact saved rows so summaries/charts can be recomputed. */
function stepsFromRun(run) {
  const byDate = new Map();
  for (const row of run.rows) {
    for (const s of row.results.steps || []) {
      if (!byDate.has(s.d)) byDate.set(s.d, { draw_date: s.d, actual: s.a, models: {} });
      byDate.get(s.d).models[row.model_name] = { position_matches: s.p, matching_digits: s.g, last_digit_match: s.l1, last_two_match: s.l2, exact_match: s.e, top: s.t };
    }
  }
  return [...byDate.values()].sort((a, b) => (a.draw_date < b.draw_date ? -1 : 1));
}

function LivePerformance() {
  const preds = useAsync(() => listPredictions({ evaluated: true, limit: 1000 }), []);
  const summary = useMemo(() => {
    if (!preds.data?.length) return null;
    const steps = new Map();
    const modelIds = new Set();
    for (const p of preds.data) {
      const key = `${p.lottery_name}|${p.prize_category}|${p.target_draw_date}`;
      if (!steps.has(key)) steps.set(key, { draw_date: p.target_draw_date, models: {} });
      steps.get(key).models[p.model_name] = p;
      modelIds.add(p.model_name);
    }
    const list = [...steps.values()].sort((a, b) => (a.draw_date < b.draw_date ? -1 : 1));
    const len = preds.data[0].actual_number?.length ?? 6;
    const count = preds.data[0].predicted_numbers?.length ?? 10;
    return summarizeBacktest(list, { modelIds: [...modelIds], length: len, count });
  }, [preds.data]);

  return (
    <SectionCard title="Live predictions" subtitle="Saved forward-looking predictions evaluated against actual draws">
      <ErrorAlert error={preds.error} onRetry={preds.reload} />
      {preds.loading ? <LoadingState /> : !summary ? (
        <EmptyState title="No evaluated predictions yet" description="The daily job generates predictions for upcoming draws and evaluates them after the results are published." />
      ) : (
        <Stack spacing={2}>
          <Alert severity={summary.advantageDetected ? 'warning' : summary.insufficient ? 'info' : 'success'}>{summary.verdict}</Alert>
          <BacktestSummaryTable summary={summary} />
        </Stack>
      )}
    </SectionCard>
  );
}

export default function PerformancePage() {
  const { user } = useAuth();
  const runs = useAsync(() => listBacktestRuns({ limit: 300 }), []);
  const grouped = useMemo(() => groupRuns(runs.data || []), [runs.data]);
  const [selectedKey, setSelectedKey] = useState('');
  const run = grouped.find((g) => g.key === selectedKey) || grouped[0];

  const analysis = useMemo(() => {
    if (!run) return null;
    const steps = stepsFromRun(run);
    const modelIds = run.rows.map((r) => r.model_name);
    const config = run.rows[0].results.config;
    return { steps, modelIds, summary: summarizeBacktest(steps, { modelIds, length: config.length, count: config.count }) };
  }, [run]);

  const remove = async () => {
    if (!run || !window.confirm('Delete this saved backtest?')) return;
    for (const r of run.rows) await deleteBacktestRun(r.id);
    setSelectedKey('');
    runs.reload();
  };

  return (
    <>
      <PageHeader title="Prediction Performance" subtitle="Does any model actually beat random guessing? Results from saved backtests and from evaluated live predictions." />
      <ErrorAlert error={runs.error} onRetry={runs.reload} />
      {runs.loading ? <LoadingState /> : !grouped.length ? (
        <SectionCard>
          <EmptyState title="No saved backtests" description="Run a backtest on the Backtesting page and click “Save results”." />
        </SectionCard>
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { sm: 'center' } }}>
            <SimpleSelect
              label="Saved backtest"
              value={run.key}
              onChange={setSelectedKey}
              minWidth={360}
              options={grouped.map((g) => ({ value: g.key, label: `${g.lottery} · ${g.prize} · ${g.rows[0].results.config.mode} · ${formatDateTime(g.created_at)}` }))}
            />
            {user && <Button color="error" onClick={remove}>Delete</Button>}
          </Stack>
          <Alert severity={analysis.summary.advantageDetected ? 'warning' : analysis.summary.insufficient ? 'info' : 'success'} sx={{ mb: 3 }}>
            <strong>{analysis.summary.advantageDetected ? analysis.summary.verdict : analysis.summary.insufficient ? analysis.summary.verdict : NO_ADVANTAGE_MESSAGE}</strong>
            <Typography variant="body2">
              {analysis.summary.steps} walk-forward test draws ({run.rows[0].training_start_date} → {run.rows[0].training_end_date}).
            </Typography>
          </Alert>
          <ResponsiveGrid min={440} sx={{ mb: 3 }}>
            <SectionCard title="Model accuracy" subtitle="Average matching digits and position matches (best of K)">
              <GroupedBarChart
                data={analysis.summary.models.map((m) => ({ model: modelLabel(m.modelId), 'Matching digits': Number(m.meanDigitMatches.toFixed(3)), 'Position matches': Number(m.meanPositionMatches.toFixed(3)) }))}
                xKey="model"
                series={[{ key: 'Matching digits', label: 'Matching digits' }, { key: 'Position matches', label: 'Position matches' }]}
              />
            </SectionCard>
            <SectionCard title="Model vs random baseline" subtitle="Difference from theoretical random expectation (position matches)">
              <GroupedBarChart
                data={analysis.summary.models.map((m) => ({ model: modelLabel(m.modelId), diff: Number((m.meanPositionMatches - analysis.summary.baseline.meanPositionMatches).toFixed(3)) }))}
                xKey="model"
                series={[{ key: 'diff', label: 'Δ vs baseline' }]}
                referenceY={0}
              />
            </SectionCard>
            <SectionCard title="Matching digits distribution" subtitle="How many draws had N best position matches">
              <GroupedBarChart
                data={Array.from({ length: (analysis.steps[0]?.actual?.length ?? 6) + 1 }, (_, n) => {
                  const row = { matches: String(n) };
                  for (const id of analysis.modelIds) row[id] = analysis.steps.filter((s) => s.models[id]?.position_matches === n).length;
                  return row;
                })}
                xKey="matches"
                series={analysis.modelIds.map((id) => ({ key: id, label: modelLabel(id) }))}
              />
            </SectionCard>
            <SectionCard title="Last digit performance" subtitle="Hit rate; red line = random baseline">
              <GroupedBarChart
                data={analysis.summary.models.map((m) => ({ model: modelLabel(m.modelId), rate: Number(m.lastDigitRate.toFixed(3)) }))}
                xKey="model"
                series={[{ key: 'rate', label: 'Last-digit hit rate' }]}
                referenceY={Number(analysis.summary.baseline.lastDigitRate.toFixed(3))}
              />
            </SectionCard>
          </ResponsiveGrid>
          <SectionCard title="Rolling performance" subtitle="20-draw rolling mean of position matches; red line = random baseline" sx={{ mb: 3 }}>
            {analysis.steps.length >= 20 ? (
              <MultiLineChart data={rollingPerformance(analysis.steps, analysis.modelIds)} xKey="draw_date" series={analysis.modelIds.map((id) => ({ key: id, label: modelLabel(id), dashed: id === 'random' }))} referenceY={Number(analysis.summary.baseline.meanPositionMatches.toFixed(3))} />
            ) : <Alert severity="info">Insufficient historical data.</Alert>}
          </SectionCard>
          <SectionCard title="Details" sx={{ mb: 3 }}>
            <BacktestSummaryTable summary={analysis.summary} />
          </SectionCard>
        </>
      )}
      <LivePerformance />
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          A lottery that is genuinely random cannot be predicted; models are expected to perform like the baseline. Treat any apparent
          advantage with suspicion until it repeats on new, unseen draws.
        </Typography>
      </Box>
    </>
  );
}
