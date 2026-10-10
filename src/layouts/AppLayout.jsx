import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  AppBar, Box, Button, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';
import LinkIcon from '@mui/icons-material/LinkOutlined';
import TableIcon from '@mui/icons-material/TableChartOutlined';
import InsightsIcon from '@mui/icons-material/InsightsOutlined';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import SpeedIcon from '@mui/icons-material/SpeedOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { LoadingState } from '../components/common.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { APP_NAME } from '../constants/app.js';
import { ChatAssistant } from '../components/ChatAssistant.jsx';

const DRAWER_WIDTH = 248;

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/sources', label: 'Lottery Sources', icon: <LinkIcon /> },
  { to: '/results', label: 'Historical Results', icon: <TableIcon /> },
  { to: '/analysis', label: 'Pattern Analysis', icon: <InsightsIcon /> },
  { to: '/predictions', label: 'Predictions', icon: <ScienceIcon /> },
  { to: '/performance', label: 'Performance', icon: <SpeedIcon /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
];

function Sidebar({ onNavigate }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ px: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          Kerala Lottery
          <br />
          <Typography component="span" variant="caption" color="text.secondary">Pattern Analyzer</Typography>
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            sx={{ borderRadius: 2, mb: 0.5, '&.active': { bgcolor: 'action.selected', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } } }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

export function AppLayout({ mode, onToggleMode }) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, ml: { md: `${DRAWER_WIDTH}px` } }}>
        <Toolbar sx={{ gap: 1 }}>
          {!desktop && (
            <IconButton edge="start" onClick={() => setOpen(true)} aria-label="Open navigation">
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 600 }} noWrap>
            {desktop ? APP_NAME : 'KL Pattern Analyzer'}
          </Typography>
          <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
            <IconButton onClick={onToggleMode} aria-label="Toggle colour mode">
              {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          {user ? (
            <>
              <Chip size="small" label={user.email} sx={{ display: { xs: 'none', sm: 'flex' } }} />
              <Button size="small" onClick={signOut}>Sign out</Button>
            </>
          ) : (
            <Button size="small" variant="outlined" component={NavLink} to="/login">Sign in</Button>
          )}
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={desktop ? 'permanent' : 'temporary'}
          open={desktop || open}
          onClose={() => setOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
        >
          <Sidebar onNavigate={() => setOpen(false)} />
        </Drawer>
      </Box>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 }, mt: 8 }}>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </Box>
      <ChatAssistant />
    </Box>
  );
}
