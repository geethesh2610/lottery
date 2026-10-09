import { useEffect, useMemo } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import CasinoIcon from '@mui/icons-material/CasinoOutlined';
import CloudDoneIcon from '@mui/icons-material/CloudDoneOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAltOutlined';
import ListAltIcon from '@mui/icons-material/ListAltOutlined';
import { useAsync } from '../hooks/useAsync.js';
import { useEntries, useLotterySelection } from '../hooks/useLotteryData.js';
import { loadDashboardStats } from '../services/qualityService.js';
import { recentDraws } from '../services/resultsService.js';
import { listPredictions } from '../services/predictionsService.js';
import { getOnboardingStatus, onboardingSteps } from '../services/onboardingService.js';
import { calculateDigitFrequency } from '../analytics/index.js';
import { patternModel } from '../prediction/index.js';
import { PageHeader, StatCard, ResponsiveGrid, SectionCard, LoadingState, ErrorAlert, EmptyState, NumberText, formatDateTime } from '../components/common.jsx';
import { DistributionChart } from '../components/charts.jsx';
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
  const result = useMemo(() => {
    const rows = (preds.data || []).filter((p) => p.model_name === patternModel.id);
    if (!rows.length) return null;
    const guesses = rows[0].predicted_numbers?.length ?? 10;
    return {
      draws: rows.length,
      rate: rows.filter((p) => p.last_digit_match).length / rows.length,
      luck: 1 - 0.9 ** guesses,
      guesses,
    };
  }, [preds.data]);
  const pct = (x) => `${Math.round(x * 100)}%`;
  return (
    <SectionCard title="Does the pattern model work?" action={<Button size="small" component={RouterLink} to="/performance">Details</Button>}>
      <ErrorAlert error={preds.error} />
      {preds.loading ? <LoadingState /> : result ? (
        <Typography variant="body1">
          Over <strong>{result.draws}</strong> checked draws, the pattern model got the last digit right <strong>{pct(result.rate)}</strong> of
          the time ({result.guesses} guesses per draw). Pure luck gives about <strong>{pct(result.luck)}</strong>.
          {' '}{Math.abs(result.rate - result.luck) < 0.1 ? 'That is no real advantage.' : 'See Details to check whether the difference is real or just chance.'}
        </Typography>
      ) : (
        <EmptyState title="Nothing checked yet" description="Predictions are checked automatically once the draw's results are fetched." />
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
  const s = stats.data;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Latest results and a quick check of whether any pattern exists." />
      <OnboardingBanner />
      <ErrorAlert error={stats.error} onRetry={stats.reload} />
      <ResponsiveGrid min={200} sx={{ mb: 3 }}>
        <StatCard label="Tracked lotteries" value={s?.trackedLotteries} icon={<CasinoIcon />} />
        <StatCard label="Total draws" value={s?.totalDraws} icon={<ListAltIcon />} hint={s ? `${s.totalResults} prize results` : null} />
        <StatCard label="Last successful fetch" value={s ? (s.lastSuccessfulFetch ? new Date(s.lastSuccessfulFetch).toLocaleDateString() : 'Never') : null} icon={<CloudDoneIcon />} hint={s?.lastSuccessfulFetch ? formatDateTime(s.lastSuccessfulFetch) : null} />
        <StatCard label="Predictions checked" value={s?.predictionsEvaluated} icon={<TaskAltIcon />} />
      </ResponsiveGrid>

      {selection.lotteryOptions.length > 0 && <LotteryPrizeSelect selection={selection} />}

      <ResponsiveGrid min={420} sx={{ mb: 3 }}>
        <SectionCard title="Digit frequency" subtitle={digit ? `How often each digit 0–9 came up in ${digit.numbersUsed} numbers · grey = what pure luck would give` : 'Select a lottery'}>
          {entries.loading ? <LoadingState /> : digit ? <DistributionChart rows={digit.rows} /> : <EmptyState title="No results yet" description="Add a source or import a CSV to see statistics." action={<Button component={RouterLink} to="/sources" variant="contained">Add source</Button>} />}
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
