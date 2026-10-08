import { Alert, Box, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { NumberText } from './common.jsx';

function Field({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 600 }}>{value || <em>not detected</em>}</Typography>
    </Box>
  );
}

/** Shows what the parser detected on a page before it is saved. */
export function ParsedPreview({ parsed }) {
  if (!parsed) return null;
  const grouped = parsed.results.reduce((acc, r) => {
    (acc[r.prize_category] ||= []).push(r.winning_number);
    return acc;
  }, {});
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 2 }}>
        <Field label="Detected lottery" value={parsed.lottery_name} />
        <Field label="Detected draw number" value={parsed.draw_code} />
        <Field label="Detected date" value={parsed.draw_date} />
        <Field label="Prize numbers" value={String(parsed.results.length)} />
      </Box>
      {parsed.errors?.map((e) => <Alert key={e} severity="error" sx={{ py: 0 }}>{e}</Alert>)}
      {parsed.warnings?.map((w) => <Alert key={w} severity="warning" sx={{ py: 0 }}>{w}</Alert>)}
      {parsed.results.length > 0 && (
        <Box sx={{ maxHeight: 280, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Prize</TableCell>
                <TableCell>Winning numbers</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(grouped).map(([prize, nums]) => (
                <TableRow key={prize}>
                  <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{prize}</TableCell>
                  <TableCell>
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      {nums.slice(0, 60).map((n) => (
                        <Chip key={n} size="small" variant="outlined" label={<NumberText>{n}</NumberText>} />
                      ))}
                      {nums.length > 60 && <Chip size="small" label={`+${nums.length - 60} more`} />}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}
