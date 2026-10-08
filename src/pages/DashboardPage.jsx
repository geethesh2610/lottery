import { useEffect, useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import CasinoIcon from '@mui/icons-material/CasinoOutlined';
import EventIcon from '@mui/icons-material/EventOutlined';
import CloudDoneIcon from '@mui/icons-material/CloudDoneOutlined';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAltOutlined';
import ListAltIcon from '@mui/icons-material/ListAltOutlined';
import { useAsync } from '../hooks/useAsync.js';
import { useEntries, useLotterySelection } from '../hooks/useLotteryData.js';
import { loadDashboardStats } from '../services/qualityService.js';
import { recentDraws } from '../services/resultsService.js';
import { listPredictions } from '../services/predictionsService.js';
import { getOnboardingStatus, onboardingSteps } from '../services/onboardingService.js';
import { calculateDigitFrequency, calculatePositionFrequency } from '../analytics/index.js';
import { PageHeader, StatCard, ResponsiveGrid, SectionCard, LoadingState, ErrorAlert, EmptyState, NumberText, formatDateTime } from '../components/common.jsx';
import { DistributionChart, GroupedBarChart } from '../components/charts.jsx';
import { LotteryPrizeSelect } from '../components/LotteryPrizeSelect.jsx';

const WELCOME_SEEN_KEY = 'klpa.welcomeSeen';

function OnboardingBanner() {
  const status = useAsync(() => getOnboardingStatus(), []);
  const navigate = useNavigate();

  // First run (empty project): show the welcome guide once.
  useEffect(() => {
    const d = status.data;
    if (!d || d.sources > 0 || d.draws > 0) return;
    try {
      if (localStorage.getItem(WELCOME_SEEN_KEY)) return;
      localStorage.setItem(WELCOME_SEEN_KEY, '1');
    } catch {
      return;
    }
    navigate('/welcome');
  }, [status.data, navigate]);

  if (!status.data) return null;
  const steps = onboardingSteps(status.data);
  const remaining = steps.filter((s) => !s.done);
  if (!remaining.length) return null;
  return (
    <Alert severity="info" sx={{ mb: 3 }} action={<Button color="inherit" component={RouterLink} to="/welcome">Open setup guide</Button>}>
      Getting started: {steps.length - remaining.length} of {steps.length} steps done. Next: <strong>{remaining[0].label}</strong>.
    </Alert>
  );
}

function PredictionPerformanceCard() {
  const preds = useAsync(() => listPredictions({ evaluated: true, limit: 500 }), []);
  const data = useMemo(() => {
    const by = {};
    for (const p of preds.data || []) {
      by[p.model_name] ||= { model: p.model_name, n: 0, pos: 0, last: 0 };
      by[p.model_name].n += 1;
      by[p.model_name].pos += p.position_matches ?? 0;
      by[p.model_name].last += p.last_digit_match ? 1 : 0;
    }
    return Object.values(by).map((m) => ({ model: m.model, 'Avg position matches': Number((m.pos / m.n).toFixed(2)), 'Last-digit hit rate': Number((m.last / m.n).toFixed(2)) }));
  }, [preds.data]);
  return (
    <SectionCard title="Prediction performance" subtitle="Evaluated live predictions (best of 10 candidates)" action={<Button size="small" component={RouterLink} to="/performance">Details</Button>}>
      <ErrorAlert error={preds.error} />
      {preds.loading ? <LoadingState /> : data.length ? (
        <GroupedBarChart data={data} xKey="model" series={[{ key: 'Avg position matches', label: 'Avg position matches' }, { key: 'Last-digit hit rate', label: 'Last-digit hit rate' }]} />
      ) : (
        <EmptyState title="No evaluated predictions yet" description="Predictions are evaluated automatically once the target draw's results are fetched." />
      )}
    </SectionCard>
  );
}

export default function DashboardPage() {
  const stats = useAsync(() => loadDashboardStats(), []);
  const recent = useAsync(() => recentDraws(8), []);
  const selection = useLotterySelection();
  const entries = useEntries(selection.lottery, selection.prize);

  const digit = useMemo(() => (entries.data?.length ? calculateDigitFrequency(entries.data.map((e) => e.number)) : null), [entries.data]);
  const position = useMemo(() => {
    if (!entries.data?.length) return null;
    const pf = calculatePositionFrequency(entries.data.map((e) => e.number));
    return Array.from({ length: 10 }, (_, d) => {
      const row = { digit: String(d) };
      pf.positions.forEach((p) => (row[`P${p.position}`] = p.rows[d].observed));
      return row;
    });
  }, [entries.data]);
  const s = stats.data;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Overview of collected results, statistics and experimental model performance." />
      <OnboardingBanner />
      <ErrorAlert error={stats.error} onRetry={stats.reload} />
      <ResponsiveGrid min={200} sx={{ mb: 3 }}>
        <StatCard label="Tracked lotteries" value={s?.trackedLotteries} icon={<CasinoIcon />} />
        <StatCard label="Total draws" value={s?.totalDraws} icon={<ListAltIcon />} hint={s ? `${s.totalResults} prize results` : null} />
        <StatCard label="Results this month" value={s?.resultsThisMonth} icon={<EventIcon />} />
        <StatCard label="Last successful fetch" value={s ? (s.lastSuccessfulFetch ? new Date(s.lastSuccessfulFetch).toLocaleDateString() : 'Never') : null} icon={<CloudDoneIcon />} hint={s?.lastSuccessfulFetch ? formatDateTime(s.lastSuccessfulFetch) : null} />
        <StatCard label="Predictions generated" value={s?.predictionsGenerated} icon={<ScienceIcon />} />
        <StatCard label="Predictions evaluated" value={s?.predictionsEvaluated} icon={<TaskAltIcon />} />
      </ResponsiveGrid>

      {selection.lotteryOptions.length > 0 && <LotteryPrizeSelect selection={selection} />}

      <ResponsiveGrid min={420} sx={{ mb: 3 }}>
        <SectionCard title="Digit frequency" subtitle={digit ? `${digit.numbersUsed} numbers · grey = expected if random` : 'Select a lottery'}>
          {entries.loading ? <LoadingState /> : digit ? <DistributionChart rows={digit.rows} /> : <EmptyState title="No results yet" description="Add a source or import a CSV to see statistics." action={<Button component={RouterLink} to="/sources" variant="contained">Add source</Button>} />}
        </SectionCard>
        <SectionCard title="Position frequency" subtitle="Count of each digit at each position">
          {entries.loading ? <LoadingState /> : position ? (
            <GroupedBarChart data={position} xKey="digit" series={Object.keys(position[0]).filter((k) => k !== 'digit').map((k) => ({ key: k, label: k }))} />
          ) : <EmptyState title="No results yet" />}
        </SectionCard>
        <SectionCard title="Recent results" subtitle="Latest 1st prize winners" action={<Button size="small" component={RouterLink} to="/results">All results</Button>}>
          <ErrorAlert error={recent.error} />
          {recent.loading ? <LoadingState /> : recent.data?.length ? (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Date</TableCell><TableCell>Lottery</TableCell><TableCell>Draw</TableCell><TableCell>1st prize</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {recent.data.map((r) => (
                    <TableRow key={`${r.lottery_name}${r.draw_date}${r.winning_number}`}>
                      <TableCell>{r.draw_date}</TableCell>
                      <TableCell>{r.lottery_name}</TableCell>
                      <TableCell>{r.draw_code || '—'}</TableCell>
                      <TableCell><NumberText>{r.winning_number}</NumberText></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ) : <EmptyState title="No results yet" />}
        </SectionCard>
        <PredictionPerformanceCard />
      </ResponsiveGrid>
    </>
  );
}
