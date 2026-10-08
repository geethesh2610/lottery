import { useTheme } from '@mui/material/styles';
import { Alert, Box, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export const SERIES_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#64748b', '#dc2626'];

function useAxisStyle() {
  const theme = useTheme();
  return { tick: { fill: theme.palette.text.secondary, fontSize: 12 }, stroke: theme.palette.divider };
}

function useTooltipProps() {
  const theme = useTheme();
  return {
    contentStyle: { background: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 },
    labelStyle: { color: theme.palette.text.primary },
  };
}

/** Observed bars with the expected (uniform/theoretical) count as a reference. */
export function DistributionChart({ rows, height = 260, showExpected = true }) {
  const axis = useAxisStyle();
  const tooltip = useTooltipProps();
  const theme = useTheme();
  if (!rows?.length) return null;
  const data = rows.map((r) => ({ label: r.label, Observed: r.observed, Expected: Number(r.expected.toFixed(2)) }));
  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip {...tooltip} />
          <Bar dataKey="Observed" fill={SERIES_COLORS[0]} radius={[3, 3, 0, 0]} />
          {showExpected && <Bar dataKey="Expected" fill={theme.palette.action.disabled} radius={[3, 3, 0, 0]} />}
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

export function MultiLineChart({ data, xKey, series, height = 280, yLabel, referenceY }) {
  const axis = useAxisStyle();
  const tooltip = useTooltipProps();
  const theme = useTheme();
  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
          <XAxis dataKey={xKey} {...axis} minTickGap={24} />
          <YAxis {...axis} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: theme.palette.text.secondary, fontSize: 12 } : undefined} />
          <Tooltip {...tooltip} />
          <Legend />
          {referenceY != null && <ReferenceLine y={referenceY} stroke={theme.palette.error.main} strokeDasharray="4 4" />}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color || SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={s.key === 'random' || s.key === 'baseline' ? 2.5 : 1.8} strokeDasharray={s.dashed ? '5 4' : undefined} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

export function GroupedBarChart({ data, xKey, series, height = 280, referenceY }) {
  const axis = useAxisStyle();
  const tooltip = useTooltipProps();
  const theme = useTheme();
  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey={xKey} {...axis} />
          <YAxis {...axis} />
          <Tooltip {...tooltip} />
          <Legend />
          {referenceY != null && <ReferenceLine y={referenceY} stroke={theme.palette.error.main} strokeDasharray="4 4" label={{ value: 'random baseline', fill: theme.palette.error.main, fontSize: 11, position: 'insideTopRight' }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || SERIES_COLORS[i % SERIES_COLORS.length]} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

const fmtP = (p) => (p == null ? '—' : p < 0.0001 ? '< 0.0001' : p.toFixed(4));

/** Chi-square result + verdict chip for a distribution. */
export function TestSummary({ dist }) {
  if (!dist) return null;
  const { test, verdict, sampleSize } = dist;
  const color = verdict.level === 'deviation' ? 'warning' : verdict.level === 'consistent' ? 'success' : 'default';
  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Chip size="small" label={`n = ${sampleSize}`} />
        {!test.insufficient && <Chip size="small" label={`χ² = ${test.statistic?.toFixed(2)}, df = ${test.df}`} />}
        {!test.insufficient && <Chip size="small" label={`p = ${fmtP(test.pValue)}`} color={color} />}
      </Stack>
      {verdict.level === 'insufficient' ? (
        <Alert severity="info" sx={{ py: 0 }}>{verdict.message}</Alert>
      ) : (
        <Typography variant="body2" color="text.secondary">{verdict.message}</Typography>
      )}
    </Stack>
  );
}

/** Observed vs expected table with standardized residuals. */
export function DistributionTable({ rows, maxRows = 20 }) {
  if (!rows?.length) return null;
  return (
    <Box sx={{ overflowX: 'auto', mt: 1 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Value</TableCell>
            <TableCell align="right">Observed</TableCell>
            <TableCell align="right">Expected</TableCell>
            <TableCell align="right">Deviation</TableCell>
            <TableCell align="right">Std. residual</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.slice(0, maxRows).map((r) => (
            <TableRow key={r.label}>
              <TableCell>{r.label}</TableCell>
              <TableCell align="right">{r.observed} ({(r.observedShare * 100).toFixed(1)}%)</TableCell>
              <TableCell align="right">{r.expected.toFixed(1)} ({(r.expectedShare * 100).toFixed(1)}%)</TableCell>
              <TableCell align="right">{r.deviation > 0 ? '+' : ''}{r.deviation.toFixed(1)}</TableCell>
              <TableCell align="right" sx={{ color: Math.abs(r.stdResidual) > 2 ? 'warning.main' : undefined }}>
                {r.stdResidual.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
