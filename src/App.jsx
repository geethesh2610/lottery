import { Suspense, lazy, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CssBaseline, useMediaQuery } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { buildTheme } from './theme.js';
import { AppLayout } from './layouts/AppLayout.jsx';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { LoadingState } from './components/common.jsx';
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const SourcesPage = lazy(() => import('./pages/SourcesPage.jsx'));
const ResultsPage = lazy(() => import('./pages/ResultsPage.jsx'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage.jsx'));
const PredictionsPage = lazy(() => import('./pages/PredictionsPage.jsx'));
const BacktestingPage = lazy(() => import('./pages/BacktestingPage.jsx'));
const PerformancePage = lazy(() => import('./pages/PerformancePage.jsx'));
const DataQualityPage = lazy(() => import('./pages/DataQualityPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const WelcomePage = lazy(() => import('./pages/WelcomePage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));

const MODE_KEY = 'klpa.colorMode';

function readMode(fallback) {
  try {
    return localStorage.getItem(MODE_KEY) || fallback;
  } catch {
    return fallback;
  }
}

function AppRoutes({ mode, onToggleMode }) {
  const { configured, ready } = useAuth();
  if (!configured) {
    return (
      <Routes>
        <Route path="*" element={<WelcomePage />} />
      </Routes>
    );
  }
  if (!ready) return <LoadingState label="Connecting to Supabase…" />;
  return (
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout mode={mode} onToggleMode={onToggleMode} />}>
        <Route index element={<DashboardPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="analysis" element={<AnalysisPage />} />
        <Route path="predictions" element={<PredictionsPage />} />
        <Route path="backtesting" element={<BacktestingPage />} />
        <Route path="performance" element={<PerformancePage />} />
        <Route path="data-quality" element={<DataQualityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useState(() => readMode(prefersDark ? 'dark' : 'light'));
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // ignore
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
            <Suspense fallback={<LoadingState />}>
              <AppRoutes mode={mode} onToggleMode={toggle} />
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
