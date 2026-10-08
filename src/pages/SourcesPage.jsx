import { useState } from 'react';
import {
  Alert, Box, Button, Chip, IconButton, Snackbar, Switch, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import ArticleIcon from '@mui/icons-material/ArticleOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import CloudDownloadIcon from '@mui/icons-material/CloudDownloadOutlined';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { deleteSource, fetchSourceNow, listSources, updateSource } from '../services/sourcesService.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState, formatDateTime } from '../components/common.jsx';
import { SourceDialog } from '../components/SourceDialog.jsx';
import { ImportDialog } from '../components/ImportDialog.jsx';
import { FetchLogsDialog } from '../components/FetchLogsDialog.jsx';
import { SignInNotice } from '../components/SignInNotice.jsx';

function HealthChip({ source }) {
  if (!source.active) return <Chip size="small" label="Inactive" />;
  if (source.last_fetch_success == null) return <Chip size="small" label="Not fetched" />;
  return source.last_fetch_success ? (
    <Chip size="small" color="success" label="Healthy" />
  ) : (
    <Tooltip title={source.last_error || ''}>
      <Chip size="small" color="error" label="Failing" />
    </Tooltip>
  );
}

export default function SourcesPage() {
  const { user } = useAuth();
  const sources = useAsync(() => listSources(), []);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(null);
  const [logsFor, setLogsFor] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const act = async (id, fn, success) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fn();
      if (res && res.ok === false) setError(new Error(res.error || 'Fetch failed'));
      else setToast(typeof success === 'function' ? success(res) : success);
      sources.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const remove = (s) => {
    if (!window.confirm(`Delete source "${s.name}"? Results already collected are kept.`)) return;
    act(s.id, () => deleteSource(s.id), 'Source deleted');
  };

  return (
    <>
      <PageHeader
        title="Lottery Sources"
        subtitle="Public result pages fetched by the server. Each result keeps a link to the source that produced it."
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)} disabled={!user}>Add source</Button>}
      />
      <SignInNotice action="add, test, fetch or import sources" />
      <ErrorAlert error={sources.error} onRetry={sources.reload} />
      <ErrorAlert error={error} title="Action failed" />
      <SectionCard>
        {sources.loading ? (
          <LoadingState />
        ) : !sources.data?.length ? (
          <EmptyState
            title="No sources yet"
            description="Add a public Kerala lottery result page. You'll be able to test it and preview what is detected before saving."
            action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)} disabled={!user}>Add source</Button>}
          />
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Active</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Lottery</TableCell>
                  <TableCell>Health</TableCell>
                  <TableCell align="right">Draws</TableCell>
                  <TableCell>Last fetched</TableCell>
                  <TableCell>Last success</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sources.data.map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>
                      <Switch size="small" checked={s.active} disabled={!user || busy === s.id} onChange={(e) => act(s.id, () => updateSource(s.id, { active: e.target.checked }), e.target.checked ? 'Source activated' : 'Source deactivated')} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{s.url}</Typography>
                    </TableCell>
                    <TableCell>{s.lottery_name || <em>Any</em>}</TableCell>
                    <TableCell><HealthChip source={s} /></TableCell>
                    <TableCell align="right">{s.draws}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(s.last_fetched_at)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(s.last_successful_fetch_at)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Fetch now">
                        <span>
                          <IconButton size="small" disabled={!user || busy === s.id} onClick={() => act(s.id, () => fetchSourceNow(s.id), (r) => `Fetched: ${r.saved.inserted} new, ${r.saved.duplicates} duplicate(s)`)}>
                            <RefreshIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Import history">
                        <span>
                          <IconButton size="small" disabled={!user} onClick={() => setImporting(s)}>
                            <CloudDownloadIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Fetch log">
                        <IconButton size="small" onClick={() => setLogsFor(s)}>
                          <ArticleIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <span>
                          <IconButton size="small" disabled={!user || busy === s.id} onClick={() => remove(s)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </SectionCard>
      <Alert severity="info" icon={<HistoryIcon />} sx={{ mt: 2 }}>
        Active sources with frequency “daily” or “weekly” are fetched automatically by the scheduled <code>daily-run</code> function.
      </Alert>

      <SourceDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(src, res) => {
          setToast(res?.ok ? `Saved "${src.name}" — ${res.saved.inserted} result(s) stored` : `Saved "${src.name}"${res?.error ? ` (first fetch: ${res.error})` : ''}`);
          sources.reload();
        }}
      />
      {importing && <ImportDialog source={importing} onClose={() => setImporting(null)} onFinished={sources.reload} />}
      <FetchLogsDialog source={logsFor} onClose={() => setLogsFor(null)} />
      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
