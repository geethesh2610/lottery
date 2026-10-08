import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { clearBrowserConfig, getConfig } from '../services/supabaseClient.js';
import { getScheduleStatus, runDailyNow } from '../services/functionsService.js';
import { PageHeader, SectionCard, ResponsiveGrid, ErrorAlert, LoadingState, formatDateTime } from '../components/common.jsx';
import { SignInNotice } from '../components/SignInNotice.jsx';
import { MIN_SAMPLE_SIZE, SIGNIFICANCE_LEVEL } from '../constants/app.js';
import { RECENCY_HALF_LIFE } from '../prediction/models.js';

function Row({ label, children }) {
  return (
    <Stack direction="row" spacing={2} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box sx={{ textAlign: 'right', wordBreak: 'break-all' }}>{children}</Box>
    </Stack>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const config = getConfig();
  const schedule = useAsync(() => (user ? getScheduleStatus() : Promise.resolve(null)), [user?.id]);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState(null);

  const runNow = async () => {
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      setRunResult(await runDailyNow());
    } catch (e) {
      setRunError(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Connection, automation and analysis parameters." actions={<Button component={RouterLink} to="/welcome">Setup guide</Button>} />
      <SignInNotice action="run the daily job or view the schedule" />
      <ResponsiveGrid min={420}>
        <SectionCard title="Supabase connection">
          <Row label="Project URL">{config?.url}</Row>
          <Row label="Configured from"><Chip size="small" label={config?.origin === 'env' ? '.env (VITE_*)' : 'this browser'} /></Row>
          <Row label="Signed in as">{user?.email ?? 'Not signed in (read-only)'}</Row>
          <Alert severity="info" sx={{ mt: 2 }}>
            Only the public anon key is used in the browser. The service role key stays in <code>.env</code> for scripts and is
            available to Edge Functions automatically — it is never bundled into the app.
          </Alert>
          {config?.origin === 'browser' && (
            <Button sx={{ mt: 2 }} color="error" onClick={() => { clearBrowserConfig(); window.location.reload(); }}>Disconnect this browser</Button>
          )}
        </SectionCard>

        <SectionCard title="Daily automation" subtitle="pg_cron → daily-run Edge Function">
          {!user ? (
            <Typography variant="body2" color="text.secondary">Sign in to see the schedule.</Typography>
          ) : schedule.loading ? <LoadingState /> : (
            <>
              <ErrorAlert error={schedule.error} title="Could not read schedule" />
              {schedule.data && (
                <>
                  <Row label="Scheduled">{schedule.data.scheduled ? <Chip size="small" color="success" label="Yes" /> : <Chip size="small" color="warning" label="No — run npm run db:setup" />}</Row>
                  {schedule.data.scheduled && <Row label="Cron (UTC)"><code>{schedule.data.schedule}</code></Row>}
                  {schedule.data.last_run && <Row label="Last run">{schedule.data.last_run.status} · {formatDateTime(schedule.data.last_run.start_time)}</Row>}
                </>
              )}
            </>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Each run fetches due sources, stores new results (duplicates ignored), evaluates past predictions, snapshots analytics
            and generates experimental predictions for each lottery's next draw.
          </Typography>
          <Button variant="contained" sx={{ mt: 2 }} onClick={runNow} disabled={!user || running}>{running ? 'Running…' : 'Run daily job now'}</Button>
          <ErrorAlert error={runError} title="Run failed" />
          {runResult && (
            <Box component="pre" sx={{ mt: 2, fontSize: 12, maxHeight: 260, overflow: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
              {JSON.stringify(runResult.report, null, 2)}
            </Box>
          )}
        </SectionCard>

        <SectionCard title="Analysis parameters">
          <Row label="Minimum sample size">{MIN_SAMPLE_SIZE} results</Row>
          <Row label="Significance level">α = {SIGNIFICANCE_LEVEL} (Bonferroni-corrected across tests)</Row>
          <Row label="Chi-square cell minimum">expected count ≥ 5 (small cells merged)</Row>
          <Row label="Recency half-life (Model C)">{RECENCY_HALF_LIFE} draws</Row>
          <Row label="Fetch politeness">robots.txt respected · ≥1.5 s between requests · 20 s timeout</Row>
        </SectionCard>
      </ResponsiveGrid>
    </>
  );
}
