import { useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, TextField, Typography,
} from '@mui/material';
import { importStep } from '../services/sourcesService.js';

function Stat({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );
}

/**
 * Historical import: repeatedly calls the Edge Function, which processes a few
 * pages per call (robots.txt-aware, ~1.5 s between requests) and returns state.
 */
export function ImportDialog({ source, onClose, onFinished }) {
  const [maxPages, setMaxPages] = useState(100);
  const [state, setState] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const cancelled = useRef(false);

  const start = async () => {
    setRunning(true);
    setError(null);
    cancelled.current = false;
    let current = null;
    try {
      do {
        const res = await importStep(source.id, current, { maxPages: Number(maxPages) || 100 });
        current = res.state;
        setState(current);
      } while (!current.done && !cancelled.current);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
      onFinished?.();
    }
  };

  const close = () => {
    cancelled.current = true;
    onClose();
  };

  const progress = state ? Math.min(100, (state.pagesFetched / state.maxPages) * 100) : 0;

  return (
    <Dialog open={!!source} onClose={running ? undefined : close} fullWidth maxWidth="sm">
      <DialogTitle>Import historical results</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Starting from <strong>{source?.url}</strong>, the importer follows result, archive and pagination links on the same
            site. It obeys robots.txt and waits between requests. Already-stored results are skipped as duplicates.
          </Typography>
          <TextField label="Maximum pages" type="number" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} disabled={running} slotProps={{ htmlInput: { min: 1, max: 1000 } }} />
          {state && (
            <>
              <LinearProgress variant={running ? 'determinate' : 'determinate'} value={state.done ? 100 : progress} />
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 2 }}>
                <Stat label="Fetched pages" value={state.pagesFetched} />
                <Stat label="Results found" value={state.resultsFound} />
                <Stat label="New results" value={state.inserted} />
                <Stat label="Duplicates" value={state.duplicates} />
                <Stat label="Errors" value={state.errors} />
                <Stat label="Queued links" value={state.queue.length} />
              </Box>
              {state.skippedOtherLottery > 0 && (
                <Alert severity="info" sx={{ py: 0 }}>{state.skippedOtherLottery} page(s) belonged to other lotteries and were skipped.</Alert>
              )}
              {state.errorMessages.length > 0 && (
                <Box component="pre" sx={{ fontSize: 12, maxHeight: 120, overflow: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1, whiteSpace: 'pre-wrap' }}>
                  {state.errorMessages.slice(-5).join('\n')}
                </Box>
              )}
              {state.done && <Alert severity="success">Import finished.</Alert>}
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {running ? (
          <Button onClick={() => (cancelled.current = true)}>Stop after current step</Button>
        ) : (
          <Button onClick={close}>Close</Button>
        )}
        <Button variant="contained" onClick={start} disabled={running}>
          {running ? 'Importing…' : state ? 'Restart import' : 'Start import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
