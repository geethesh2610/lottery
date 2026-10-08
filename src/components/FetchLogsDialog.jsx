import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { useAsync } from '../hooks/useAsync.js';
import { listFetchLogs } from '../services/sourcesService.js';
import { EmptyState, ErrorAlert, LoadingState, formatDateTime } from './common.jsx';

export function FetchLogsDialog({ source, onClose }) {
  const logs = useAsync(() => listFetchLogs(source?.id), [source?.id], { enabled: !!source });
  return (
    <Dialog open={!!source} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Fetch log — {source?.name}</DialogTitle>
      <DialogContent dividers>
        <ErrorAlert error={logs.error} onRetry={logs.reload} />
        {logs.loading ? (
          <LoadingState />
        ) : !logs.data?.length ? (
          <EmptyState title="No fetches yet" />
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Trigger</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Found</TableCell>
                  <TableCell align="right">New</TableCell>
                  <TableCell align="right">Duplicates</TableCell>
                  <TableCell>HTTP</TableCell>
                  <TableCell>Message</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.data.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(l.fetched_at)}</TableCell>
                    <TableCell>{l.trigger}</TableCell>
                    <TableCell>
                      <Chip size="small" color={l.success ? 'success' : 'error'} label={l.success ? 'OK' : 'Failed'} />
                    </TableCell>
                    <TableCell align="right">{l.records_found}</TableCell>
                    <TableCell align="right">{l.records_inserted}</TableCell>
                    <TableCell align="right">{l.duplicates_skipped}</TableCell>
                    <TableCell>{l.response_status ?? '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 380, whiteSpace: 'pre-wrap' }}>{l.error_message || l.parse_errors?.join(' ') || ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
