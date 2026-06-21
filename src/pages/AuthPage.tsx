import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, EyeOff, Mail, Lock, User, ArrowRight,
  ArrowLeft, CheckCircle, AlertCircle, RefreshCw
} from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../hooks/useToast';

type Screen = 'signin' | 'signup' | 'verify-signup' | 'forgot' | 'reset';

// ─── OTP Input Component ──────────────────────────────────────────────────────
function OTPInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const LEN = 6;

  const digits = value.padEnd(LEN, '').slice(0, LEN).split('');

  const handleChange = (i: number, char: string) => {
    const d = char.replace(/\D/g, '').slice(-1);
    const arr = digits.slice();
    arr[i] = d;
    onChange(arr.join('').trimEnd());
    if (d && i < LEN - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (!digits[i] && i > 0) { refs.current[i - 1]?.focus(); }
      else {
        const arr = digits.slice(); arr[i] = '';
        onChange(arr.join('').trimEnd());
      }
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < LEN - 1) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LEN);
    onChange(pasted);
    refs.current[Math.min(pasted.length, LEN - 1)]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: LEN }).map((_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          className={`w-11 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all outline-none
            bg-navy-800 text-white
            ${digits[i] ? 'border-gold-500 shadow-[0_0_12px_rgba(245,158,11,0.25)]' : 'border-white/20'}
            focus:border-gold-400 focus:shadow-[0_0_16px_rgba(245,158,11,0.3)]
            disabled:opacity-40`}
        />
      ))}
    </div>
  );
}

// ─── Password strength ────────────────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) },
    { label: 'Special character', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];

  if (!password) return null;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < score ? colors[score - 1] : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {checks.map(c => (
            <span key={c.label} className={`text-xs flex items-center gap-1 ${c.ok ? 'text-green-400' : 'text-slate-600'}`}>
              {c.ok ? <CheckCircle size={10} /> : <span className="w-2.5 h-2.5 rounded-full bg-white/15 inline-block" />}
              {c.label}
            </span>
          ))}
        </div>
        <span className={`text-xs font-semibold ${colors[score - 1]?.replace('bg-', 'text-') || 'text-slate-600'}`}>{labels[score - 1] || ''}</span>
      </div>
    </div>
  );
}

// ─── Resend countdown ─────────────────────────────────────────────────────────
function ResendButton({ email, type, onResent }: { email: string; type: string; onResent: () => void }) {
  const [secs, setSecs] = useState(30);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (secs <= 0) return;
    const t = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  const resend = async () => {
    setResending(true);
    try {
      const r = await fetch('/api/auth/resend-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, type }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('New OTP sent to your email');
      setSecs(60);
      onResent();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  if (secs > 0) return <p className="text-slate-500 text-sm text-center">Resend code in <span className="text-gold-400 font-semibold">{secs}s</span></p>;

  return (
    <button onClick={resend} disabled={resending} className="flex items-center gap-1.5 text-gold-400 hover:text-gold-300 text-sm font-medium mx-auto transition-colors disabled:opacity-50">
      {resending ? <ButtonSpinner size={13} /> : <RefreshCw size={13} />}
      Resend OTP
    </button>
  );
}

// ─── Input field ──────────────────────────────────────────────────────────────
function Field({ label, icon: Icon, type = 'text', value, onChange, placeholder, error, ...rest }: {
  label: string; icon: typeof Mail; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; error?: string;
  autoComplete?: string; disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';

  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <div className="relative">
        <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          {...rest}
          type={isPassword ? (show ? 'text' : 'password') : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-navy-800 border rounded-xl pl-10 pr-${isPassword ? '12' : '4'} py-3 text-white placeholder-slate-600 focus:outline-none transition-all text-sm
            ${error ? 'border-red-500/60 focus:border-red-500' : 'border-white/15 focus:border-gold-500/60'}`}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-red-400 text-xs flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
    </div>
  );
}

// ─── Left branding panel ──────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col justify-between p-10 bg-hero-gradient relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-gold-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold-400/40 to-transparent" />
      </div>

      <div className="flex items-center gap-3 relative">
        <img src="/brainspark-logo.svg" alt="BrainSpark" className="w-10 h-10" />
        <div>
          <span className="text-white font-black text-xl">Brain</span>
          <span className="text-gold-400 font-black text-xl">Spark</span>
        </div>
      </div>

      <div className="relative">
        {/* Car SVG illustration */}
        <svg viewBox="0 0 380 220" className="w-full opacity-70 mb-8">
          <defs>
            <linearGradient id="cg1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="glow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
            <filter id="blur"><feGaussianBlur stdDeviation="4" /></filter>
          </defs>
          {/* SUV body */}
          <path d="M35 160 L35 130 L80 92 L115 72 L260 68 L310 82 L345 120 L350 160 Z" fill="none" stroke="url(#cg1)" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Roof line */}
          <path d="M80 92 L115 72 L260 68 L300 85" fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.4" />
          {/* Windows */}
          <path d="M120 90 L120 120 L208 120 L208 90 Z" fill="none" stroke="#93c5fd" strokeWidth="1.5" opacity="0.6" />
          <path d="M214 90 L214 120 L288 120 L284 90 Z" fill="none" stroke="#93c5fd" strokeWidth="1.5" opacity="0.6" />
          {/* Wheels */}
          <circle cx="105" cy="162" r="28" fill="none" stroke="url(#cg1)" strokeWidth="2.5" />
          <circle cx="105" cy="162" r="16" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" />
          <circle cx="105" cy="162" r="6" fill="#f59e0b" opacity="0.4" />
          <circle cx="270" cy="162" r="28" fill="none" stroke="url(#cg1)" strokeWidth="2.5" />
          <circle cx="270" cy="162" r="16" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" />
          <circle cx="270" cy="162" r="6" fill="#f59e0b" opacity="0.4" />
          {/* Headlight */}
          <path d="M345 120 L355 118 L360 128 L348 132 Z" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.8" />
          {/* Ground reflection */}
          <ellipse cx="192" cy="192" rx="155" ry="14" fill="url(#glow)" />
          {/* Scan lines */}
          {[0, 1, 2].map(i => (
            <line key={i} x1="0" y1={160 - i * 25} x2="380" y2={160 - i * 25} stroke="#f59e0b" strokeWidth="0.4" strokeDasharray="5,8" opacity={0.15 - i * 0.04} />
          ))}
        </svg>

        <div className="space-y-4">
          <h2 className="text-3xl font-black text-white leading-tight">
            AI-Powered Cost<br />
            <span className="text-gold-400">Reduction Intelligence</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
            Chief Engineer AI with 30+ years of cross-OEM expertise, real-time web intelligence, and deep DFMA knowledge across all vehicle systems.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {['13 Systems', '260+ Parts', 'Live Web Search', 'Excel + PPT Export'].map(tag => (
              <span key={tag} className="px-2.5 py-1 rounded-full bg-white/8 border border-white/15 text-slate-400 text-xs">{tag}</span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-slate-600 text-xs relative">
        Designed &amp; Created by <span className="text-slate-500 font-semibold">Avinash Bhosale</span>
      </p>
    </div>
  );
}

// ─── Main Auth Page ───────────────────────────────────────────────────────────
export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, isAuthenticated } = useAuth();

  const [screen, setScreen] = useState<Screen>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [otpResendKey, setOtpResendKey] = useState(0);
  const [devOtp, setDevOtp] = useState('');   // shown on-screen when no email is configured

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  useEffect(() => { if (isAuthenticated) navigate(from, { replace: true }); }, [isAuthenticated]);

  const clearError = () => setError('');

  const apiCall = useCallback(async (path: string, body: object) => {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
    return d;
  }, []);

  // ── Sign In ──────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const { token, user } = await apiCall('/api/auth/signin', { email, password });
      signIn(token, user);
      toast.success(`Welcome back, ${user.name}!`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally { setLoading(false); }
  };

  // ── Sign Up ──────────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!name.trim() || !email || !password || !confirmPassword) { setError('Please fill in all fields.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const data = await apiCall('/api/auth/signup', { name: name.trim(), email, password });
      if (data.devOtp) {
        setDevOtp(data.devOtp);
        setOtp(data.devOtp);
        toast.info('No email configured — your code is shown on screen.');
      } else {
        toast.info('OTP sent to your email. Check your inbox!');
      }
      setScreen('verify-signup');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally { setLoading(false); }
  };

  // ── Verify OTP (signup) ──────────────────────────────────────────────────
  const handleVerifySignup = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (otp.length < 6) { setError('Please enter the complete 6-digit code.'); return; }
    setLoading(true);
    try {
      const { token, user } = await apiCall('/api/auth/verify-signup', { email, otp });
      signIn(token, user);
      toast.success(`Account verified! Welcome to BrainSpark, ${user.name}!`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally { setLoading(false); }
  };

  // ── Forgot Password ──────────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email) { setError('Please enter your email address.'); return; }
    setLoading(true);
    try {
      const data = await apiCall('/api/auth/forgot-password', { email });
      if (data.devOtp) {
        setDevOtp(data.devOtp);
        setOtp(data.devOtp);
        toast.info('No email configured — your reset code is shown on screen.');
      } else {
        toast.info('OTP sent. Check your email inbox.');
      }
      setScreen('reset');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  // ── Reset Password ───────────────────────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (otp.length < 6) { setError('Please enter the complete 6-digit code.'); return; }
    if (!newPassword || newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmNewPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const { token, user } = await apiCall('/api/auth/reset-password', { email, otp, newPassword });
      signIn(token, user);
      toast.success('Password reset successfully! Welcome back.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally { setLoading(false); }
  };

  const slide = { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 }, transition: { duration: 0.25 } };

  return (
    <div className="min-h-screen bg-navy-950 flex">
      <BrandPanel />

      {/* Right — forms */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 min-h-screen">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-8">
          <img src="/brainspark-logo.svg" alt="BrainSpark" className="w-9 h-9" />
          <span className="text-white font-black text-xl">Brain<span className="text-gold-400">Spark</span></span>
        </div>

        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* ── Sign In ─────────────────────────────────────────────────── */}
            {screen === 'signin' && (
              <motion.div key="signin" {...slide}>
                <div className="mb-8">
                  <h1 className="text-3xl font-black text-white mb-2">Welcome back</h1>
                  <p className="text-slate-400">Sign in to your BrainSpark account</p>
                </div>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <Field label="Email address" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" disabled={loading} />
                  <Field label="Password" icon={Lock} type="password" value={password} onChange={setPassword} placeholder="Your password" autoComplete="current-password" disabled={loading} />
                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setScreen('forgot'); clearError(); setDevOtp(''); setOtp(''); }} className="text-gold-400 hover:text-gold-300 text-sm transition-colors">Forgot password?</button>
                  </div>
                  {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm"><AlertCircle size={15} />{error}</div>}
                  <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                    {loading ? <><ButtonSpinner size={18} /> Signing in…</> : <>Sign In <ArrowRight size={18} /></>}
                  </button>
                </form>
                <p className="text-center text-slate-400 text-sm mt-6">
                  Don't have an account?{' '}
                  <button onClick={() => { setScreen('signup'); clearError(); }} className="text-gold-400 hover:text-gold-300 font-semibold transition-colors">Create one free</button>
                </p>
              </motion.div>
            )}

            {/* ── Sign Up ─────────────────────────────────────────────────── */}
            {screen === 'signup' && (
              <motion.div key="signup" {...slide}>
                <div className="mb-8">
                  <h1 className="text-3xl font-black text-white mb-2">Create your account</h1>
                  <p className="text-slate-400">Free access to the AI cost reduction engine</p>
                </div>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <Field label="Full name" icon={User} value={name} onChange={setName} placeholder="Avinash Bhosale" autoComplete="name" disabled={loading} />
                  <Field label="Work email" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" disabled={loading} />
                  <div>
                    <Field label="Password" icon={Lock} type="password" value={password} onChange={setPassword} placeholder="Create a strong password" autoComplete="new-password" disabled={loading} />
                    <PasswordStrength password={password} />
                  </div>
                  <Field label="Confirm password" icon={Lock} type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repeat your password" autoComplete="new-password" disabled={loading} />
                  {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm"><AlertCircle size={15} />{error}</div>}
                  <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                    {loading ? <><ButtonSpinner size={18} /> Creating account…</> : <>Create Account <ArrowRight size={18} /></>}
                  </button>
                </form>
                <p className="text-center text-slate-400 text-sm mt-6">
                  Already have an account?{' '}
                  <button onClick={() => { setScreen('signin'); clearError(); }} className="text-gold-400 hover:text-gold-300 font-semibold transition-colors">Sign in</button>
                </p>
              </motion.div>
            )}

            {/* ── Verify Signup OTP ────────────────────────────────────────── */}
            {screen === 'verify-signup' && (
              <motion.div key="verify" {...slide}>
                <button onClick={() => { setScreen('signup'); setOtp(''); clearError(); }} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
                  <ArrowLeft size={15} /> Back
                </button>
                <div className="mb-8 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-gold-500/20 border border-gold-500/30 flex items-center justify-center mx-auto mb-4">
                    <Mail size={26} className="text-gold-400" />
                  </div>
                  <h1 className="text-2xl font-black text-white mb-2">Check your inbox</h1>
                  <p className="text-slate-400 text-sm">We sent a 6-digit verification code to</p>
                  <p className="text-white font-semibold mt-1">{email}</p>
                </div>
                <form onSubmit={handleVerifySignup} className="space-y-6">
                  {devOtp && (
                    <div className="p-4 rounded-xl bg-amber-500/15 border-2 border-amber-500/40 text-center">
                      <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">📧 No email configured — your code is:</p>
                      <p className="text-amber-300 font-black text-3xl tracking-[0.3em]">{devOtp}</p>
                      <p className="text-amber-600 text-xs mt-2">It has been auto-filled below. Just click Verify.</p>
                    </div>
                  )}
                  <OTPInput value={otp} onChange={v => { setOtp(v); clearError(); }} disabled={loading} />
                  {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center justify-center"><AlertCircle size={15} />{error}</div>}
                  <button type="submit" disabled={loading || otp.length < 6} className="w-full py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                    {loading ? <><ButtonSpinner size={18} /> Verifying…</> : <>Verify &amp; Activate <CheckCircle size={18} /></>}
                  </button>
                  <ResendButton key={otpResendKey} email={email} type="signup" onResent={() => setOtpResendKey(k => k + 1)} />
                </form>
              </motion.div>
            )}

            {/* ── Forgot Password ──────────────────────────────────────────── */}
            {screen === 'forgot' && (
              <motion.div key="forgot" {...slide}>
                <button onClick={() => { setScreen('signin'); clearError(); }} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
                  <ArrowLeft size={15} /> Back to sign in
                </button>
                <div className="mb-8">
                  <h1 className="text-3xl font-black text-white mb-2">Reset password</h1>
                  <p className="text-slate-400">Enter your email and we'll send you a reset code</p>
                </div>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <Field label="Email address" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" disabled={loading} />
                  {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm"><AlertCircle size={15} />{error}</div>}
                  <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                    {loading ? <><ButtonSpinner size={18} /> Sending code…</> : <>Send Reset Code <ArrowRight size={18} /></>}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ── Reset Password (OTP + new password) ─────────────────────── */}
            {screen === 'reset' && (
              <motion.div key="reset" {...slide}>
                <button onClick={() => { setScreen('forgot'); setOtp(''); clearError(); }} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
                  <ArrowLeft size={15} /> Back
                </button>
                <div className="mb-8 text-center">
                  <h1 className="text-2xl font-black text-white mb-2">Enter reset code</h1>
                  <p className="text-slate-400 text-sm">Code sent to <span className="text-white font-medium">{email}</span></p>
                </div>
                <form onSubmit={handleResetPassword} className="space-y-5">
                  {devOtp && (
                    <div className="p-4 rounded-xl bg-amber-500/15 border-2 border-amber-500/40 text-center">
                      <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">📧 No email configured — your reset code is:</p>
                      <p className="text-amber-300 font-black text-3xl tracking-[0.3em]">{devOtp}</p>
                      <p className="text-amber-600 text-xs mt-2">It has been auto-filled below.</p>
                    </div>
                  )}
                  <OTPInput value={otp} onChange={v => { setOtp(v); clearError(); }} disabled={loading} />
                  <div>
                    <Field label="New password" icon={Lock} type="password" value={newPassword} onChange={setNewPassword} placeholder="Create new password" autoComplete="new-password" disabled={loading} />
                    <PasswordStrength password={newPassword} />
                  </div>
                  <Field label="Confirm new password" icon={Lock} type="password" value={confirmNewPassword} onChange={setConfirmNewPassword} placeholder="Repeat new password" autoComplete="new-password" disabled={loading} />
                  {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm"><AlertCircle size={15} />{error}</div>}
                  <button type="submit" disabled={loading || otp.length < 6} className="w-full py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                    {loading ? <><ButtonSpinner size={18} /> Resetting…</> : <>Reset Password <CheckCircle size={18} /></>}
                  </button>
                  <ResendButton key={otpResendKey} email={email} type="reset" onResent={() => { setOtp(''); setOtpResendKey(k => k + 1); }} />
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-10 text-slate-700 text-xs text-center">
          BrainSpark v2.1 · Designed &amp; Created by <span className="text-slate-600 font-medium">Avinash Bhosale</span>
        </p>
      </div>
    </div>
  );
}
