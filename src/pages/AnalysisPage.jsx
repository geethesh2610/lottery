import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Chip, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useEntries, useLotterySelection } from '../hooks/useLotteryData.js';
import { analyzeEntries } from '../analytics/index.js';
import { markAnalysisVisited } from '../services/onboardingService.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState, ResponsiveGrid, StatCard } from '../components/common.jsx';
import { DistributionChart, DistributionTable, MultiLineChart, TestSummary } from '../components/charts.jsx';
import { LotteryPrizeSelect, SimpleSelect } from '../components/LotteryPrizeSelect.jsx';
import { SIGNIFICANCE_LEVEL } from '../constants/app.js';

function DistSection({ title, subtitle, dist, showTable = true, chartHeight }) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <DistributionChart rows={dist.rows} height={chartHeight} />
      <TestSummary dist={dist} />
      {showTable && <DistributionTable rows={dist.rows} />}
    </SectionCard>
  );
}

function PositionSection({ positionFrequency }) {
  const [tab, setTab] = useState(0);
  const pos = positionFrequency.positions[tab];
  if (!pos) return null;
  return (
    <SectionCard title="Position frequency" subtitle="Digit counts at each position vs. the uniform expectation">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ mb: 1 }}>
        {positionFrequency.positions.map((p, i) => (
          <Tab key={p.position} value={i} label={`Position ${p.position}`} />
        ))}
      </Tabs>
      <DistributionChart rows={pos.rows} />
      <TestSummary dist={pos} />
      <DistributionTable rows={pos.rows} />
    </SectionCard>
  );
}

export default function AnalysisPage() {
  const selection = useLotterySelection();
  const entries = useEntries(selection.lottery, selection.prize);
  const [windowSize, setWindowSize] = useState(50);

  useEffect(() => markAnalysisVisited(), []);

  const report = useMemo(
    () => (entries.data?.length ? analyzeEntries(entries.data, { windowSize, step: Math.max(5, Math.round(windowSize / 5)) }) : null),
    [entries.data, windowSize],
  );

  return (
    <>
      <PageHeader
        title="Pattern Analysis"
        subtitle="Each lottery is analysed separately. Every observed distribution is compared with what pure randomness would produce, using chi-square goodness-of-fit tests."
      />
      <ErrorAlert error={selection.error || entries.error} onRetry={entries.reload} />
      {selection.lotteryOptions.length === 0 && !selection.loading ? (
        <EmptyState title="No data to analyse" description="Collect results from a source or import a CSV first." />
      ) : (
        <LotteryPrizeSelect selection={selection}>
          <SimpleSelect label="Rolling window (draws)" value={windowSize} onChange={setWindowSize} options={[20, 30, 50, 100].map((v) => ({ value: v, label: String(v) }))} />
        </LotteryPrizeSelect>
      )}

      {entries.loading && <LoadingState label="Loading results…" />}
      {report && (
        <>
          {report.insufficient && <Alert severity="warning" sx={{ mb: 2 }}>{report.insufficientMessage} {report.sampleSize} number(s) available; at least 30 are needed for reliable tests.</Alert>}
          <ResponsiveGrid min={200} sx={{ mb: 3 }}>
            <StatCard label="Sample size" value={report.sampleSize} hint={`${report.length}-digit numbers`} />
            <StatCard label="Date range" value={report.firstDate ? report.firstDate.slice(0, 7) : '—'} hint={report.lastDate ? `to ${report.lastDate}` : null} />
            <StatCard label="Tests run" value={report.multipleTesting.testsRun} hint={`≈${report.multipleTesting.expectedFalsePositives.toFixed(1)} false positives expected at p<${SIGNIFICANCE_LEVEL}`} />
            <StatCard label="Significant after correction" value={report.multipleTesting.significantAfterCorrection.length} hint={`Bonferroni α = ${report.multipleTesting.bonferroniAlpha.toPrecision(2)}`} />
          </ResponsiveGrid>

          <Alert severity={report.multipleTesting.significantAfterCorrection.length ? 'warning' : 'success'} sx={{ mb: 3 }}>
            {report.multipleTesting.significantAfterCorrection.length ? (
              <>Deviations that survive multiple-testing correction: <strong>{report.multipleTesting.significantAfterCorrection.join(', ')}</strong>. This may indicate a data-quality issue or a real bias; confirm on new data before drawing conclusions.</>
            ) : (
              <>No deviation from randomness survives multiple-testing correction. A digit appearing most often does <strong>not</strong> make it more likely in the next draw.</>
            )}
            {report.multipleTesting.nominallySignificant.length > 0 && !report.multipleTesting.significantAfterCorrection.length && (
              <> Nominally significant before correction: {report.multipleTesting.nominallySignificant.join(', ')} — expected by chance when running many tests.</>
            )}
          </Alert>

          <ResponsiveGrid min={460}>
            <DistSection title="Digit frequency (0–9)" subtitle="All digits in all positions" dist={report.digitFrequency} />
            <PositionSection positionFrequency={report.positionFrequency} />
            <DistSection title="Last digit" dist={report.lastDigit} />
            <SectionCard title="Last two digits (00–99)" subtitle="Needs a large sample: 100 cells">
              <DistributionChart rows={report.lastTwoDigits.rows} showExpected={false} />
              <TestSummary dist={report.lastTwoDigits} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Most frequent: {[...report.lastTwoDigits.rows].sort((a, b) => b.observed - a.observed).slice(0, 5).map((r) => `${r.label} (${r.observed})`).join(', ')} · expected each ≈ {(report.lastTwoDigits.sampleSize / 100).toFixed(1)}
              </Typography>
            </SectionCard>
            <SectionCard title="Digit sum" subtitle="Sum of all digits vs. the exact theoretical distribution">
              {report.digitSum.summary && (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {['min', 'max', 'mean', 'median', 'mode'].map((k) => (
                    <Chip key={k} size="small" label={`${k}: ${Number(report.digitSum.summary[k]).toFixed(k === 'mean' ? 2 : 0)}`} />
                  ))}
                  <Chip size="small" variant="outlined" label={`expected mean: ${report.digitSum.summary.expectedMean}`} />
                </Stack>
              )}
              <DistributionChart rows={report.digitSum.rows.filter((r) => r.expected >= 0.05 || r.observed)} />
              <TestSummary dist={report.digitSum} />
            </SectionCard>
            <DistSection title="Odd / even split" subtitle="odd digits / even digits" dist={report.oddEven} />
            <DistSection title="Repeated digits" subtitle="No repetition, pairs, three-of-a-kind…" dist={report.repeated} />
            <SectionCard title="Consecutive digits" subtitle="Longest run like 123 or 987">
              <DistributionChart rows={report.consecutive.rows} />
              <TestSummary dist={report.consecutive} />
              {report.consecutive.topSequences.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Most common sequences: {report.consecutive.topSequences.map((s) => `${s.sequence} (${s.count})`).join(', ')}
                </Typography>
              )}
            </SectionCard>
            <DistSection title="Number distribution" subtitle="Numbers grouped into 10 equal ranges" dist={report.numberDistribution} />
            <SectionCard title="Rolling-window analysis" subtitle={`Digit-frequency p-value in windows of ${windowSize} draws`}>
              {report.rolling.insufficient ? (
                <Alert severity="info">Insufficient historical data for rolling windows of {windowSize} draws.</Alert>
              ) : (
                <>
                  <MultiLineChart data={report.rolling.windows.map((w) => ({ end: w.end, 'p-value': Number(w.pValue?.toFixed(4)) }))} xKey="end" series={[{ key: 'p-value', label: 'p-value' }]} referenceY={SIGNIFICANCE_LEVEL} />
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      {report.rolling.windows.length} windows · the “hottest” digit changed between {report.rolling.distinctTopDigits} different digits ·
                      {' '}{report.rolling.significantWindows} window(s) below p=0.05 (≈{report.rolling.expectedSignificantByChance.toFixed(1)} expected by chance).
                    </Typography>
                  </Box>
                </>
              )}
            </SectionCard>
          </ResponsiveGrid>
        </>
      )}
    </>
  );
}
