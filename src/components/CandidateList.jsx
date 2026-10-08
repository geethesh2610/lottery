import { Box, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { NumberText } from './common.jsx';
import { SCORE_NOTE } from '../constants/app.js';

export function CandidateList({ candidates }) {
  if (!candidates?.length) return null;
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Candidate</TableCell>
            <TableCell sx={{ minWidth: 160 }}>
              <Tooltip title={SCORE_NOTE}>
                <span>Model score ⓘ</span>
              </Tooltip>
            </TableCell>
            <TableCell>Features / reason</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {candidates.map((c) => (
            <TableRow key={c.number}>
              <TableCell>{c.rank}</TableCell>
              <TableCell>
                <NumberText sx={{ fontSize: '1.1rem' }}>{c.number}</NumberText>
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <LinearProgress variant="determinate" value={c.score * 100} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{c.score.toFixed(2)}</Typography>
                </Stack>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">{c.reason}</Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary">{SCORE_NOTE}</Typography>
    </Box>
  );
}
