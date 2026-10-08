import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Container, Step, StepContent, StepLabel, Stepper, Stack, TextField, Typography,
} from '@mui/material';
import { useAsync } from '../hooks/useAsync.js';
import { getOnboardingStatus, onboardingSteps } from '../services/onboardingService.js';
import { isConfigured, saveBrowserConfig } from '../services/supabaseClient.js';
import { APP_NAME } from '../constants/app.js';
import { ErrorAlert, LoadingState } from '../components/common.jsx';

function Code({ children }) {
  return (
    <Box component="pre" sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1, fontSize: 13, overflowX: 'auto', my: 1 }}>
      {children}
    </Box>
  );
}

function ConfigureStep() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState(null);
  const save = () => {
    try {
      saveBrowserConfig(url, key);
      window.location.reload();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <Stack spacing={2}>
      <Typography variant="body2">
        Recommended: copy <code>.env.example</code> to <code>.env</code>, fill in your Supabase credentials, then run the automated setup.
        It creates every table, index, constraint, RLS policy, function, Edge Function and the daily schedule for you.
      </Typography>
      <Code>{`cp .env.example .env      # then edit .env\nnpm run db:setup          # add -- --seed for demo data\nnpm run dev`}</Code>
      <Typography variant="body2" color="text.secondary">
        Or, if the database is already set up, connect this browser using the public project URL and anon key
        (never the service role key):
      </Typography>
      <TextField size="small" label="Supabase URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
      <TextField size="small" label="Anon / publishable key" value={key} onChange={(e) => setKey(e.target.value)} />
      {error && <Alert severity="error">{error}</Alert>}
      <Box>
        <Button variant="contained" onClick={save} disabled={!/^https?:\/\//.test(url) || key.length < 20}>Connect</Button>
      </Box>
    </Stack>
  );
}

export default function WelcomePage() {
  const configured = isConfigured();
  const status = useAsync(() => getOnboardingStatus(), []);
  const steps = status.data ? onboardingSteps(status.data) : [];
  const active = configured ? Math.max(0, steps.findIndex((s) => !s.done)) : 0;
  const allDone = steps.length > 0 && steps.every((s) => s.done);

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h3" component="h1" sx={{ fontWeight: 800, mb: 1, fontSize: { xs: '1.9rem', md: '2.6rem' } }}>
        Welcome to {APP_NAME}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Collect public Kerala lottery results, analyse digit patterns with proper statistics, and test experimental models
        honestly against a random baseline.
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <ErrorAlert error={status.error} onRetry={status.reload} />
          {status.data?.schemaError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Connected, but the database schema is missing ({status.data.schemaError}). Run <code>npm run db:setup</code>.
            </Alert>
          )}
          {status.loading ? (
            <LoadingState />
          ) : (
            <Stepper activeStep={allDone ? steps.length : active} orientation="vertical">
              {(configured ? steps : onboardingSteps({ configured: false })).map((s, i) => (
                <Step key={s.key} completed={s.done}>
                  <StepLabel>{s.label}</StepLabel>
                  <StepContent>
                    {i === 0 && !configured ? (
                      <ConfigureStep />
                    ) : (
                      <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                        <Typography variant="body2" color="text.secondary">{s.help}</Typography>
                        {configured && (
                          <Button variant="contained" component={RouterLink} to={s.to}>
                            Go to {s.label.toLowerCase()}
                          </Button>
                        )}
                      </Stack>
                    )}
                  </StepContent>
                </Step>
              ))}
            </Stepper>
          )}
          {configured && (
            <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
              <Button component={RouterLink} to="/">{allDone ? 'Open dashboard' : 'Skip to dashboard'}</Button>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
