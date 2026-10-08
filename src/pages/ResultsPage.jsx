import { useEffect, useState } from 'react';
import {
  Box, Button, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, TableSortLabel, TextField,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/DownloadOutlined';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import { useAsync } from '../hooks/useAsync.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { fetchAllResults, listLotteries, listPrizeCategories, queryResults } from '../services/resultsService.js';
import { downloadText, toCsv } from '../services/downloadService.js';
import { PageHeader, SectionCard, LoadingState, ErrorAlert, EmptyState, NumberText } from '../components/common.jsx';
import { SimpleSelect } from '../components/LotteryPrizeSelect.jsx';
import { CsvImportDialog } from '../components/CsvImportDialog.jsx';

const COLUMNS = [
  { key: 'draw_date', label: 'Date' },
  { key: 'lottery_name', label: 'Lottery' },
  { key: 'draw_code', label: 'Draw' },
  { key: 'prize_rank', label: 'Prize' },
  { key: 'winning_number', label: 'Winning Number' },
];

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ResultsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [lottery, setLottery] = useState('');
  const [prize, setPrize] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState('draw_date');
  const [sortDir, setSortDir] = useState('desc');
  const [csvOpen, setCsvOpen] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);
  const debouncedSearch = useDebounced(search);

  const filters = { search: debouncedSearch, lottery, prize, from, to };
  const lotteries = useAsync(() => listLotteries(), []);
  const prizes = useAsync(() => listPrizeCategories(lottery || null), [lottery]);
  const results = useAsync(
    () => queryResults({ filters, page, pageSize, sortBy, sortDir }),
    [debouncedSearch, lottery, prize, from, to, page, pageSize, sortBy, sortDir],
  );

  useEffect(() => setPage(0), [debouncedSearch, lottery, prize, from, to]);

  const sort = (key) => {
    if (sortBy === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(key);
      setSortDir(key === 'draw_date' ? 'desc' : 'asc');
    }
  };

  const exportCsv = async () => {
    setExportError(null);
    setExporting(0);
    try {
      const rows = await fetchAllResults(filters, { onProgress: setExporting });
      const csv = toCsv(rows, [
        { key: 'draw_date', label: 'date' },
        { key: 'lottery_name', label: 'lottery' },
        { key: 'draw_code', label: 'draw' },
        { key: 'prize_category', label: 'prize' },
        { key: 'winning_number', label: 'winning_number' },
      ]);
      downloadText(`kerala-lottery-results-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch (e) {
      setExportError(e);
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Historical Results"
        subtitle="Every stored prize result. Numbers are stored as text, so leading zeros are preserved."
        actions={
          <>
            <Button startIcon={<UploadIcon />} variant="outlined" onClick={() => setCsvOpen(true)} disabled={!user}>Import CSV</Button>
            <Button startIcon={<DownloadIcon />} variant="contained" onClick={exportCsv} disabled={exporting !== null}>
              {exporting !== null ? `Exporting… ${exporting}` : 'Export CSV'}
            </Button>
          </>
        }
      />
      <ErrorAlert error={exportError} title="Export failed" />
      <SectionCard>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2, flexWrap: 'wrap', gap: 2 }}>
          <TextField size="small" label="Search number, draw or lottery" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 240 }} />
          <SimpleSelect label="Lottery" value={lottery} onChange={(v) => { setLottery(v); setPrize(''); }} options={(lotteries.data || []).map((l) => l.lottery_name)} allowEmpty emptyLabel="All lotteries" />
          <SimpleSelect label="Prize" value={prize} onChange={setPrize} options={(prizes.data || []).map((p) => p.prize_category)} allowEmpty emptyLabel="All prizes" />
          <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
        <ErrorAlert error={results.error} onRetry={results.reload} />
        {results.loading && !results.data ? (
          <LoadingState />
        ) : !results.data?.rows.length ? (
          <EmptyState title="No results match" description="Change the filters, add a source, or import a CSV file." />
        ) : (
          <>
            <Box sx={{ overflowX: 'auto', opacity: results.loading ? 0.6 : 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {COLUMNS.map((c) => (
                      <TableCell key={c.key}>
                        <TableSortLabel active={sortBy === c.key} direction={sortBy === c.key ? sortDir : 'asc'} onClick={() => sort(c.key)}>
                          {c.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.data.rows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.draw_date}</TableCell>
                      <TableCell>{r.lottery_name}</TableCell>
                      <TableCell>{r.draw_code || '—'}</TableCell>
                      <TableCell>{r.prize_category}</TableCell>
                      <TableCell><NumberText>{r.winning_number}</NumberText></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <TablePagination
              component="div"
              count={results.data.total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={pageSize}
              onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              rowsPerPageOptions={[25, 50, 100]}
            />
          </>
        )}
      </SectionCard>
      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} onImported={() => { results.reload(); lotteries.reload(); }} />
    </>
  );
}
