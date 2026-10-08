import { createTheme } from '@mui/material/styles';

export function buildTheme(mode) {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#60a5fa' : '#1d4ed8' },
      secondary: { main: dark ? '#34d399' : '#047857' },
      background: dark ? { default: '#0b1120', paper: '#111827' } : { default: '#f6f7fb', paper: '#ffffff' },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Roboto, system-ui, sans-serif',
      h4: { fontSize: '1.75rem' },
    },
    components: {
      MuiCard: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 600 } } },
    },
  });
}
