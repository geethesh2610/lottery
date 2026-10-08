import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Container, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../hooks/useAuth.jsx';

export default function LoginPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="xs" sx={{ py: 8 }}>
      <Card variant="outlined">
        <CardContent component="form" onSubmit={submit}>
          <Stack spacing={2}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Sign in</Typography>
            <Typography variant="body2" color="text.secondary">
              Reading data works without signing in. Adding sources, importing and saving predictions require the admin
              account created by <code>npm run db:setup</code> (ADMIN_EMAIL / ADMIN_PASSWORD in .env).
            </Typography>
            {user && <Alert severity="success">Signed in as {user.email}</Alert>}
            <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
            <Button component={RouterLink} to="/">Back to dashboard</Button>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
