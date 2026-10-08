import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button } from '@mui/material';
import { useAuth } from '../hooks/useAuth.jsx';

/** Shown on pages with write actions when nobody is signed in. */
export function SignInNotice({ action = 'make changes' }) {
  const { user } = useAuth();
  if (user) return null;
  return (
    <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" component={RouterLink} to="/login">Sign in</Button>}>
      You are viewing read-only. Sign in to {action}.
    </Alert>
  );
}
