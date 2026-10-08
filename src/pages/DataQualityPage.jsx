import { Alert, Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useAsync } from '../hooks/useAsync.js';
import { loadDataQuality } from '../services/qualityService.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState, ResponsiveGrid, StatCard, formatDateTime } from '../components/common.jsx';
import { GroupedBarChart } from '../components/charts.jsx';

export default function DataQualityPage() {
  const q = useAsync(() => loadDataQuality(), []);
  const d = q.data;
  return (
    <>
      <PageHeader title="Data Quality" subtitle="Completeness and health of the collected dataset. Statistics are only as good as the data behind them." />
      <ErrorAlert error={q.error} onRetry={q.reload} />
      {q.loading ? <LoadingState /> : d && (
        <>
          <ResponsiveGrid min={190} sx={{ mb: 3 }}>
            <StatCard label="Total draws" value={d.totalDraws} hint={`${d.drawsThisMonth} this month`} />
            <StatCard label="Missing draw dates" value={d.totalMissing} hint="Expected weekly draws not found" />
            <StatCard label="Duplicate attempts" value={d.duplicateAttempts} hint="Re-fetched results safely skipped" />
            <StatCard label="Parsing failures" value={d.parsingFailures} hint={`${d.fetchFailures} failed fetches in total`} />
            <StatCard label="Invalid numbers" value={d.invalidNumbersRejected + d.invalidStored.length} hint={`${d.invalidNumbersRejected} rejected while parsing · ${d.invalidStored.length} stored`} />
            <StatCard label="Last successful fetch" value={d.lastSuccess ? new Date(d.lastSuccess).toLocaleDateString() : 'Never'} hint={d.lastSuccess ? formatDateTime(d.lastSuccess) : null} />
            <StatCard label="Sources failing" value={d.failingSources.length} hint={`${d.sources.length} source(s) configured`} />
          </ResponsiveGrid>

          {d.failingSources.length > 0 && (
            <Alert severity="error" sx={{ mb: 3 }}>
              Failing sources: {d.failingSources.map((s) => `${s.name} (${s.last_error || 'unknown error'})`).join('; ')}
            </Alert>
          )}

          <ResponsiveGrid min={440} sx={{ mb: 3 }}>
            <SectionCard title="Results per lottery">
              {d.lotteries.length ? (
                <GroupedBarChart data={d.lotteries.map((l) => ({ lottery: l.lottery_name, Draws: Number(l.draws), Results: Number(l.results) }))} xKey="lottery" series={[{ key: 'Draws', label: 'Draws' }, { key: 'Results', label: 'Results' }]} />
              ) : <EmptyState title="No data yet" />}
            </SectionCard>
            <SectionCard title="Missing dates" subtitle="Inferred from each lottery's usual weekday">
              {d.missing.every((m) => !m.missing.length) ? (
                <Alert severity="success">No gaps detected in weekly lotteries.</Alert>
              ) : (
                d.missing.filter((m) => m.missing.length).map((m) => (
                  <Box key={m.lottery} sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2">{m.lottery} — {m.missing.length} missing</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {m.missing.slice(0, 40).map((date) => <Chip key={date} size="small" label={date} />)}
                      {m.missing.length > 40 && <Chip size="small" label={`+${m.missing.length - 40}`} />}
                    </Box>
                  </Box>
                ))
              )}
            </SectionCard>
          </ResponsiveGrid>

          <SectionCard title="Lotteries" sx={{ mb: 3 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Lottery</TableCell>
                    <TableCell align="right">Draws</TableCell>
                    <TableCell align="right">Results</TableCell>
                    <TableCell>First draw</TableCell>
                    <TableCell>Last draw</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.lotteries.map((l) => (
                    <TableRow key={l.lottery_name}>
                      <TableCell>{l.lottery_name}</TableCell>
                      <TableCell align="right">{l.draws}</TableCell>
                      <TableCell align="right">{l.results}</TableCell>
                      <TableCell>{l.first_draw}</TableCell>
                      <TableCell>{l.last_draw}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </SectionCard>

          <SectionCard title="Sources">
            {!d.sources.length ? <EmptyState title="No sources" /> : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Source</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Fetches</TableCell>
                      <TableCell align="right">Failures</TableCell>
                      <TableCell align="right">Duplicates skipped</TableCell>
                      <TableCell align="right">Invalid numbers</TableCell>
                      <TableCell>Last success</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {d.sources.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>
                          {!s.active ? <Chip size="small" label="Inactive" /> : s.last_fetch_success === false ? <Chip size="small" color="error" label="Failing" /> : s.last_fetch_success ? <Chip size="small" color="success" label="OK" /> : <Chip size="small" label="Never fetched" />}
                        </TableCell>
                        <TableCell align="right">{s.fetch_count}</TableCell>
                        <TableCell align="right">{s.failure_count}</TableCell>
                        <TableCell align="right">{s.duplicates_skipped}</TableCell>
                        <TableCell align="right">{s.invalid_numbers}</TableCell>
                        <TableCell>{formatDateTime(s.last_successful_fetch_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </SectionCard>
        </>
      )}
    </>
  );
}
