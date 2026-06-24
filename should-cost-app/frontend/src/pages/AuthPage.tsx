import { useState, useRef, KeyboardEvent, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { AuthUser } from '../types';
import { useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';

type View = 'login' | 'signup-details' | 'signup-otp' | 'forgot-email' | 'forgot-otp' | 'forgot-reset';

interface Props {
  initialView?: View;
  onLogin?: (user: AuthUser) => void;
}

const LEFT_COPY: Record<string, { title: string; desc: string }> = {
  login:         { title: 'Welcome back to CostLens',      desc: 'Access your should-cost models, supplier quotes, and AI-driven comparison reports.' },
  signup:        { title: 'Start engineering smarter costs', desc: 'Join teams who use data to negotiate better prices across 22 automotive systems.' },
  forgot:        { title: 'Secure password recovery',    desc: 'We verify your identity with a one-time code before allowing a password reset.' },
};

export default function AuthPage({ initialView = 'login', onLogin }: Props) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [view, setView] = useState<View>(initialView);

  // Login
  const [loginEmail, setLoginEmail]     = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup
  const [signupEmail, setSignupEmail]   = useState('');
  const [signupPass, setSignupPass]     = useState('');
  const [signupName, setSignupName]     = useState('');
  const [signupRole, setSignupRole]     = useState<number>(2); // default: internal

  // Forgot
  const [forgotEmail, setForgotEmail]   = useState('');
  const [resetToken, setResetToken]     = useState('');
  const [newPassword, setNewPassword]   = useState('');

  // OTP
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [devOtp, setDevOtp]   = useState<string | null>(null);

  const clearFeedback = () => { setError(''); setSuccess(''); };

  const otpValue = otp.join('');

  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[idx] = val.slice(-1);
    setOtp(next);
    if (val && idx < 5) otpRefs[idx + 1].current?.focus();
  };

  const handleOtpKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs[idx - 1].current?.focus();
    }
  };

  // ── Handlers ─────────────────────────────────────────────
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault(); clearFeedback(); setLoading(true);
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/auth/login', {
        email: loginEmail, password: loginPassword,
      });
      localStorage.setItem('sc_token', res.data.token);
      localStorage.setItem('sc_user', JSON.stringify(res.data.user));
      onLogin?.(res.data.user);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password');
    } finally { setLoading(false); }
  };

  const handleSignupRequest = async (e: FormEvent) => {
    e.preventDefault(); clearFeedback(); setLoading(true);
    try {
      const res = await api.post<{ message: string; devOtp?: string }>('/auth/signup/request', {
        email: signupEmail, password: signupPass,
        fullName: signupName, roleId: signupRole,
      });
      const hint = res.data.devOtp ?? null;
      setDevOtp(hint);
      // Auto-fill OTP boxes when server returns it (dev mode / no SMTP)
      if (hint && hint.length === 6) {
        setOtp(hint.split(''));
      } else {
        setOtp(['', '', '', '', '', '']);
      }
      setView('signup-otp');
      setSuccess('OTP sent to ' + signupEmail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? msg);
    } finally { setLoading(false); }
  };

  const handleSignupVerify = async (e: FormEvent) => {
    e.preventDefault(); clearFeedback(); setLoading(true);
    try {
      await api.post('/auth/signup/verify', { email: signupEmail, otp: otpValue });
      setSuccess('Account created! Signing you in…');
      // Auto-login
      const res = await api.post<{ token: string; user: AuthUser }>('/auth/login', {
        email: signupEmail, password: signupPass,
      });
      localStorage.setItem('sc_token', res.data.token);
      localStorage.setItem('sc_user', JSON.stringify(res.data.user));
      onLogin?.(res.data.user);
      navigate('/dashboard');
    } catch {
      setError('Invalid or expired OTP');
    } finally { setLoading(false); }
  };

  const handleForgotRequest = async (e: FormEvent) => {
    e.preventDefault(); clearFeedback(); setLoading(true);
    try {
      const res = await api.post<{ message: string; devOtp?: string }>('/auth/forgot-password/request', { email: forgotEmail });
      const hint = res.data.devOtp ?? null;
      setDevOtp(hint);
      if (hint && hint.length === 6) {
        setOtp(hint.split(''));
      } else {
        setOtp(['', '', '', '', '', '']);
      }
      setView('forgot-otp');
      setSuccess('OTP sent if that email is registered');
    } finally { setLoading(false); }
  };

  const handleForgotVerify = async (e: FormEvent) => {
    e.preventDefault(); clearFeedback(); setLoading(true);
    try {
      const res = await api.post<{ resetToken: string }>('/auth/forgot-password/verify', {
        email: forgotEmail, otp: otpValue,
      });
      setResetToken(res.data.resetToken);
      setView('forgot-reset');
    } catch {
      setError('Invalid or expired OTP');
    } finally { setLoading(false); }
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault(); clearFeedback(); setLoading(true);
    try {
      await api.post('/auth/forgot-password/reset', {
        email: forgotEmail, resetToken, newPassword,
      });
      setSuccess('Password updated. Redirecting to sign in…');
      setTimeout(() => setView('login'), 1800);
    } catch {
      setError('Password reset failed. Please restart the process.');
    } finally { setLoading(false); }
  };

  const viewGroup = view.startsWith('signup') ? 'signup' : view.startsWith('forgot') ? 'forgot' : 'login';
  const leftCopy = LEFT_COPY[viewGroup];

  const OtpInput = ({ onSubmit }: { onSubmit: (e: FormEvent) => void }) => (
    <form onSubmit={onSubmit}>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>
        Enter the 6-digit code sent to <strong>{signupEmail || forgotEmail}</strong>
      </p>
      <div className="otp-inputs">
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={otpRefs[i]}
            className="otp-digit"
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleOtpChange(i, e.target.value)}
            onKeyDown={(e) => handleOtpKeyDown(i, e)}
            autoFocus={i === 0}
          />
        ))}
      </div>
      {error   && <p className="form-error" style={{ textAlign: 'center', marginBottom: 12 }}>{error}</p>}
      {success && <p style={{ color: 'var(--success)', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{success}</p>}
      <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading || otpValue.length < 6}>
        {loading ? <><span className="spinner" />Verifying…</> : 'Verify Code'}
      </button>
      <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }}
        onClick={() => { clearFeedback(); setView(view.startsWith('signup') ? 'signup-details' : 'forgot-email'); }}>
        ← Back
      </button>
    </form>
  );

  return (
    <div className="auth-page">
      {/* ── Left panel ── */}
      <div className="auth-left">
        <div className="auth-left-content">
          <Link to="/" style={{ display: 'inline-flex', marginBottom: 48 }}>
            <Logo height={68} />
          </Link>
          <h2>{leftCopy.title}</h2>
          <p>{leftCopy.desc}</p>
          <ul className="auth-features">
            <li>22 Automotive systems with 3-level hierarchy</li>
            <li>Three-way analysis: Should-Cost · Live Price · New Quotes</li>
            <li>Compare up to 5 supplier quotes simultaneously</li>
            <li>AI-powered cost driver analysis and recommendations</li>
            <li>Full negotiation thread with audit trail</li>
          </ul>
          <div style={{ marginTop: 'auto', paddingTop: 32, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
            Designed &amp; developed by<br />
            <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Avinash Bhosale</strong><br />
            Senior Cost Improvement Engineer
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="auth-right">
        <div className="auth-form-wrap">
          {/* Theme toggle */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
            <button className="theme-toggle" data-on={theme === 'dark'} onClick={toggle} title="Toggle theme" />
          </div>

          {/* ── Login ── */}
          {view === 'login' && (
            <>
              <h1>Sign in</h1>
              <p className="auth-sub">Access your CostLens workspace</p>
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <input className="form-control" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required autoFocus placeholder="you@company.com" />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    Password
                    <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 4px', fontSize: 12 }}
                      onClick={() => { clearFeedback(); setForgotEmail(loginEmail); setView('forgot-email'); }}>
                      Forgot password?
                    </button>
                  </label>
                  <input className="form-control" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required placeholder="••••••••" />
                </div>
                {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                  {loading ? <><span className="spinner" />Signing in…</> : 'Sign in'}
                </button>
              </form>
              <div className="auth-divider">or</div>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { clearFeedback(); setView('signup-details'); }}>
                Create new account
              </button>
            </>
          )}

          {/* ── Signup Step 1 ── */}
          {view === 'signup-details' && (
            <>
              <h1>Create account</h1>
              <p className="auth-sub">Set up your CostLens workspace</p>
              <form onSubmit={handleSignupRequest}>
                <div className="form-group">
                  <label className="form-label">Full name</label>
                  <input className="form-control" type="text" value={signupName} onChange={(e) => setSignupName(e.target.value)} required placeholder="Jane Smith" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Work email</label>
                  <input className="form-control" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required placeholder="jane@company.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Password <span style={{ color: 'var(--text-3)' }}>(min. 8 characters)</span></label>
                  <input className="form-control" type="password" value={signupPass} onChange={(e) => setSignupPass(e.target.value)} required minLength={8} placeholder="••••••••" />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-control" value={signupRole} onChange={(e) => setSignupRole(Number(e.target.value))}>
                    <option value={2}>Internal (Cost Engineer / Procurement)</option>
                    <option value={3}>Supplier</option>
                    <option value={1}>Admin</option>
                  </select>
                </div>
                {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                  {loading ? <><span className="spinner" />Sending OTP…</> : 'Continue →'}
                </button>
              </form>
              <div className="auth-divider">have an account?</div>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { clearFeedback(); setView('login'); }}>
                Sign in instead
              </button>
            </>
          )}

          {/* ── Signup OTP ── */}
          {view === 'signup-otp' && (
            <>
              <h1>Verify your email</h1>
              <p className="auth-sub">Check your inbox for the 6-digit code</p>

              {/* Dev-mode hint — only shown when SMTP is not configured */}
              {devOtp && (
                <div style={{
                  background: 'rgba(251,191,36,0.15)', border: '1.5px solid #f59e0b',
                  borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                  fontSize: 13, color: 'var(--text-1)',
                }}>
                  <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 4 }}>
                    🛠 Dev mode — SMTP not configured
                  </div>
                  <div>Your OTP code is: <strong style={{ fontSize: 18, letterSpacing: 4, color: 'var(--accent)' }}>{devOtp}</strong></div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    It has been auto-filled below. Click "Verify Code" to continue.
                  </div>
                </div>
              )}

              <OtpInput onSubmit={handleSignupVerify} />
            </>
          )}

          {/* ── Forgot — enter email ── */}
          {view === 'forgot-email' && (
            <>
              <h1>Reset password</h1>
              <p className="auth-sub">Enter your email to receive a verification code</p>
              <form onSubmit={handleForgotRequest}>
                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <input className="form-control" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required autoFocus placeholder="you@company.com" />
                </div>
                {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                  {loading ? <><span className="spinner" />Sending…</> : 'Send OTP'}
                </button>
                <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }}
                  onClick={() => { clearFeedback(); setView('login'); }}>
                  ← Back to sign in
                </button>
              </form>
            </>
          )}

          {/* ── Forgot — OTP ── */}
          {view === 'forgot-otp' && (
            <>
              <h1>Enter verification code</h1>
              <p className="auth-sub">6-digit code sent to {forgotEmail}</p>

              {devOtp && (
                <div style={{
                  background: 'rgba(251,191,36,0.15)', border: '1.5px solid #f59e0b',
                  borderRadius: 10, padding: '12px 16px', marginBottom: 16,
                  fontSize: 13, color: 'var(--text-1)',
                }}>
                  <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 4 }}>
                    🛠 Dev mode — SMTP not configured
                  </div>
                  <div>Your OTP code is: <strong style={{ fontSize: 18, letterSpacing: 4, color: 'var(--accent)' }}>{devOtp}</strong></div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    It has been auto-filled below. Click "Verify Code" to continue.
                  </div>
                </div>
              )}

              <OtpInput onSubmit={handleForgotVerify} />
            </>
          )}

          {/* ── Forgot — new password ── */}
          {view === 'forgot-reset' && (
            <>
              <h1>Set new password</h1>
              <p className="auth-sub">Choose a secure password for your account</p>
              <form onSubmit={handlePasswordReset}>
                <div className="form-group">
                  <label className="form-label">New password <span style={{ color: 'var(--text-3)' }}>(min. 8 characters)</span></label>
                  <input className="form-control" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoFocus placeholder="••••••••" />
                </div>
                {error   && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}
                {success && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 12 }}>{success}</p>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                  {loading ? <><span className="spinner" />Updating…</> : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
