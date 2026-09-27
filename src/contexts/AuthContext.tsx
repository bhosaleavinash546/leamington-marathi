import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { writeJSON, remove } from '../lib/storage';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'brainspark_auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { token: t, user: u } = JSON.parse(stored);
        if (t && u) { setToken(t); setUser(u); }
      }
    } catch {}
    setLoading(false);
  }, []);

  function signIn(newToken: string, newUser: User) {
    setToken(newToken);
    setUser(newUser);
    // On a locked-down laptop (site data blocked) this write used to THROW
    // out of signIn — the session was lost on the next navigation with no
    // message. The session now lives for the tab regardless; persistence is
    // the convenience that degrades.
    if (!writeJSON(STORAGE_KEY, { token: newToken, user: newUser })) {
      console.warn('[auth] Browser storage is unavailable — you will need to sign in again after a reload.');
    }
  }

  function signOut() {
    const currentToken = token;
    setToken(null);
    setUser(null);
    remove(STORAGE_KEY);
    if (currentToken) {
      fetch('/api/auth/signout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
      }).catch(() => {});
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signOut, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Convenience: returns Authorization header
export function useAuthHeader() {
  const { token } = useAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
