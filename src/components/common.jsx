import { Alert, AlertTitle, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { DISCLAIMER } from '../constants/app.js';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: { sm: 'flex-end' } }}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>{actions}</Stack>}
    </Stack>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'center', py: 6 }}>
      <CircularProgress size={24} />
      <Typography color="text.secondary">{label}</Typography>
    </Stack>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 6, px: 2 }}>
      <InboxOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
      <Typography variant="h6">{title}</Typography>
      {description && (
        <Typography color="text.secondary" sx={{ maxWidth: 520 }}>
          {description}
        </Typography>
      )}
      {action}
    </Stack>
  );
}

export function ErrorAlert({ error, onRetry, title = 'Something went wrong' }) {
  if (!error) return null;
  return (
    <Alert
      severity="error"
      sx={{ mb: 2 }}
      action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>Retry</Button>}
    >
      <AlertTitle>{title}</AlertTitle>
      {error.message || String(error)}
    </Alert>
  );
}

export function Disclaimer({ sx }) {
  return (
    <Alert severity="warning" icon={<ScienceOutlinedIcon />} sx={{ mb: 2, ...sx }}>
      {DISCLAIMER}
    </Alert>
  );
}

export function SectionCard({ title, subtitle, action, children, sx }) {
  return (
    <Card variant="outlined" sx={{ height: '100%', ...sx }}>
      <CardContent>
        {(title || action) && (
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 1 }}>
            <Box>
              {title && <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>{title}</Typography>}
              {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
            </Box>
            {action}
          </Stack>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

export function StatCard({ label, value, hint, icon }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          {icon && <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>}
        </Stack>
        <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, fontVariantNumeric: 'tabular-nums' }}>
          {value ?? '—'}
        </Typography>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </CardContent>
    </Card>
  );
}

/** Responsive CSS grid (avoids Grid API differences between MUI versions). */
export function ResponsiveGrid({ min = 260, gap = 2, children, sx }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap, ...sx }}>
      {children}
    </Box>
  );
}

export function NumberText({ children, sx }) {
  return (
    <Box component="span" sx={{ fontFamily: '"JetBrains Mono", "Roboto Mono", monospace', fontWeight: 600, letterSpacing: 1, ...sx }}>
      {children}
    </Box>
  );
}

export function formatDateTime(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}
