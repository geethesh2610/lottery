import { useEffect, useMemo, useState } from 'react';
import { Alert, Tab, Tabs } from '@mui/material';
import { useEntries, useLotterySelection } from '../hooks/useLotteryData.js';
import { analyzeEntries } from '../analytics/index.js';
import { markAnalysisVisited } from '../services/onboardingService.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState, ResponsiveGrid, StatCard } from '../components/common.jsx';
import { DistributionChart, TestSummary } from '../components/charts.jsx';
import { LotteryPrizeSelect } from '../components/LotteryPrizeSelect.jsx';

function PositionSection({ positionFrequency }) {
  const [tab, setTab] = useState(0);
  const pos = positionFrequency.positions[tab];
  if (!pos) return null;
  return (
    <SectionCard title="Digits by position" subtitle="How often each digit came up in each slot. Grey = what pure luck would give. This is what the pattern model learns from.">
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ mb: 1 }}>
        {positionFrequency.positions.map((p, i) => (
          <Tab key={p.position} value={i} label={`Position ${p.position}`} />
        ))}
      </Tabs>
      <DistributionChart rows={pos.rows} />
      <TestSummary dist={pos} />
    </SectionCard>
  );
}

export default function AnalysisPage() {
  const selection = useLotterySelection();
  const entries = useEntries(selection.lottery, selection.prize);

  useEffect(() => markAnalysisVisited(), []);

  const report = useMemo(() => (entries.data?.length ? analyzeEntries(entries.data) : null), [entries.data]);
  const flagged = report?.multipleTesting.significantAfterCorrection ?? [];

  return (
    <>
      <PageHeader title="Pattern Analysis" subtitle="Do some digits come up more than they should? Each bar is compared with what pure randomness would produce." />
      <ErrorAlert error={selection.error || entries.error} onRetry={entries.reload} />
      {selection.lotteryOptions.length === 0 && !selection.loading ? (
        <EmptyState title="No data to analyse" description="Collect results from a source or import a CSV first." />
      ) : (
        <LotteryPrizeSelect selection={selection} />
      )}

      {entries.loading && <LoadingState label="Loading results…" />}
      {report && (
        <>
          {report.insufficient && <Alert severity="warning" sx={{ mb: 2 }}>{report.insufficientMessage} {report.sampleSize} number(s) available; at least 30 are needed for reliable tests.</Alert>}
          <ResponsiveGrid min={200} sx={{ mb: 3 }}>
            <StatCard label="Results analysed" value={report.sampleSize} hint={`${report.length}-digit numbers`} />
            <StatCard label="Date range" value={report.firstDate ? report.firstDate.slice(0, 7) : '—'} hint={report.lastDate ? `to ${report.lastDate}` : null} />
          </ResponsiveGrid>

          <Alert severity={flagged.length ? 'warning' : 'success'} sx={{ mb: 3 }}>
            {flagged.length ? (
              <>Unusual results in: <strong>{flagged.join(', ')}</strong>. This may be a data problem or a real bias; check again on new draws before trusting it.</>
            ) : (
              <>No real pattern found — the digits look random. A digit that came up most often is <strong>not</strong> more likely next time.</>
            )}
          </Alert>

          <ResponsiveGrid min={460}>
            <PositionSection positionFrequency={report.positionFrequency} />
            <SectionCard title="Last digit" subtitle="How often each last digit came up. Grey = what pure luck would give.">
              <DistributionChart rows={report.lastDigit.rows} />
              <TestSummary dist={report.lastDigit} />
            </SectionCard>
          </ResponsiveGrid>
        </>
      )}
    </>
  );
}
