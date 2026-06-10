import { useState, FormEvent } from 'react';
import { AuthUser } from '../types';
import api from '../utils/api';

interface Props {
  onLogin: (user: AuthUser) => void;
}

export default function Login({ onLogin }: Props) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
      localStorage.setItem('sc_token', res.data.token);
      localStorage.setItem('sc_user', JSON.stringify(res.data.user));
      onLogin(res.data.user);
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <div className="card" style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#4f46e5', marginBottom: 4 }}>CostLens</div>
          <div style={{ color: '#888', fontSize: 13 }}>Should-Cost Comparison Platform</div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
