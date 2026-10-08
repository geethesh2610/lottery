import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isConfigured } from '../services/supabaseClient.js';
import { getSession, onAuthChange, signIn, signOut } from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const configured = isConfigured();
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!configured) return undefined;
    let active = true;
    getSession()
      .then((s) => active && setSession(s))
      .catch(() => {})
      .finally(() => active && setReady(true));
    const unsubscribe = onAuthChange((s) => setSession(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [configured]);

  const value = useMemo(
    () => ({ configured, ready, session, user: session?.user ?? null, signIn, signOut }),
    [configured, ready, session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
