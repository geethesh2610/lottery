import { useState } from 'react';
import Papa from 'papaparse';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, Stack, Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { validateCsvRows, CSV_COLUMNS } from '../parsers/csvImport.js';
import { importDraws } from '../services/resultsService.js';

const TEMPLATE = 'date,lottery,draw,prize,winning_number\n2024-03-12,Karunya Plus,KN-512,1st Prize,PN 012345\n2024-03-12,Karunya Plus,KN-512,4th Prize,0123\n';

export function CsvImportDialog({ open, onClose, onImported }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [pad, setPad] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const validation = rows ? validateCsvRows(rows, { padMissingZeros: pad }) : null;

  const reset = () => {
    setRows(null);
    setFileName('');
    setProgress(null);
    setResult(null);
    setError(null);
  };

  const onFile = (file) => {
    reset();
    if (!file) return;
    setFileName(file.name);
    // dynamicTyping:false keeps every value as a string so leading zeros survive.
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => {
        if (res.errors.length) setError(`CSV parse errors: ${res.errors.slice(0, 3).map((e) => `row ${e.row}: ${e.message}`).join('; ')}`);
        setRows(res.data);
      },
      error: (e) => setError(e.message),
    });
  };

  const doImport = async () => {
    setError(null);
    try {
      const totals = await importDraws(validation.draws, { onProgress: setProgress });
      setResult(totals);
      onImported?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const running = progress && !result;

  return (
    <Dialog open={open} onClose={running ? undefined : () => { reset(); onClose(); }} fullWidth maxWidth="md">
      <DialogTitle>Import CSV</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Required columns: <code>{CSV_COLUMNS.join(', ')}</code>. Dates may be YYYY-MM-DD or DD/MM/YYYY. Keep winning numbers as
            text — spreadsheet apps often strip leading zeros (012345 → 12345); such rows are rejected unless you enable padding.
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={running}>
              Choose CSV file
              <input hidden type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
            </Button>
            <Button href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="lottery-template.csv">
              Download template
            </Button>
          </Stack>
          {fileName && <Typography variant="body2">File: {fileName}</Typography>}
          <FormControlLabel
            control={<Checkbox checked={pad} onChange={(e) => setPad(e.target.checked)} />}
            label="Restore missing leading zeros (pad short numbers to the prize's digit count)"
          />
          {validation && (
            <Alert severity={validation.errors.length ? 'warning' : 'success'}>
              {validation.validRows} valid row(s) in {validation.draws.length} draw(s); {validation.errors.length} invalid row(s).
            </Alert>
          )}
          {validation?.errors.length > 0 && (
            <Box component="pre" sx={{ fontSize: 12, maxHeight: 180, overflow: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1, whiteSpace: 'pre-wrap' }}>
              {validation.errors.slice(0, 50).map((e) => `Line ${e.line}: ${e.message}`).join('\n')}
              {validation.errors.length > 50 ? `\n… ${validation.errors.length - 50} more` : ''}
            </Box>
          )}
          {progress && <LinearProgress variant="determinate" value={(progress.done / progress.total) * 100} />}
          {result && (
            <Alert severity={result.errors.length ? 'warning' : 'success'}>
              Imported {result.draws} draw(s): {result.inserted} new result(s), {result.duplicates} duplicate(s) skipped
              {result.errors.length ? `, ${result.errors.length} error(s): ${result.errors.slice(0, 3).join('; ')}` : '.'}
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }} disabled={!!running}>Close</Button>
        <Button variant="contained" onClick={doImport} disabled={!validation?.draws.length || !!running || !!result}>
          Import {validation?.validRows ?? 0} row(s)
        </Button>
      </DialogActions>
    </Dialog>
  );
}
