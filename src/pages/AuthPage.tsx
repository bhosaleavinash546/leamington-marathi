import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, EyeOff, Mail, Lock, User, ArrowRight,
  ArrowLeft, CheckCircle, AlertCircle, RefreshCw,
} from 'lucide-react';
import { APP_VERSION } from '../version';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../hooks/useToast';

type Screen = 'signin' | 'signup' | 'forgot' | 'reset';

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
          className={`w-11 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-ui outline-none
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
          <div key={i} className={`h-1 flex-1 rounded-full transition-ui ${i < score ? colors[score - 1] : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {checks.map(c => (
            <span key={c.label} className={`text-xs flex items-center gap-1 ${c.ok ? 'text-green-400' : 'text-slate-500'}`}>
              {c.ok ? <CheckCircle size={10} /> : <span className="w-2.5 h-2.5 rounded-full bg-white/15 inline-block" />}
              {c.label}
            </span>
          ))}
        </div>
        <span className={`text-xs font-semibold ${colors[score - 1]?.replace('bg-', 'text-') || 'text-slate-500'}`}>{labels[score - 1] || ''}</span>
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
function Field({ label, icon: Icon, type = 'text', value, onChange, placeholder, error, hint, ...rest }: {
  label: string; icon: typeof Mail; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; error?: string; hint?: string;
  autoComplete?: string; disabled?: boolean; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  const id = useId();
  const isPassword = type === 'password';
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-slate-300 mb-1.5">{label}</label>
      <div className="relative">
        <Icon size={15} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          {...rest}
          id={id}
          type={isPassword ? (show ? 'text' : 'password') : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          // The right padding used to be built as `pr-${isPassword ? '12' : '4'}`.
          // Tailwind's compiler only sees COMPLETE class names in the source, so
          // that class was never generated and the password text ran under the
          // reveal button. Both variants are written out.
          className={[
            'w-full min-h-[46px] rounded-xl bg-navy-800/80 border pl-10 text-[15px] text-white',
            'placeholder:text-slate-500 transition-ui duration-micro ease-house',
            isPassword ? 'pr-11' : 'pr-4',
            error
              ? 'border-danger-500/60 focus:border-danger-500'
              : 'border-hairline-strong hover:border-white/25 focus:border-gold-500/70',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          ].join(' ')}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-tint-strong transition-ui duration-micro ease-house"
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {error
        ? <p id={`${id}-err`} className="mt-1.5 text-danger-400 text-xs flex items-center gap-1"><AlertCircle size={11} />{error}</p>
        : hint ? <p id={`${id}-hint`} className="mt-1.5 text-slate-500 text-xs">{hint}</p> : null}
    </div>
  );
}

// ─── Brand panel ─────────────────────────────────────────────────────────────
//
// WHY THIS IS BUILT THE WAY IT IS.
//
// The render carries its OWN wordmark — "BrainSpark · AI IDEA GENERATION TOOL"
// baked into the pixels, in electric purple — so framing it as a poster put a
// second logo and a second colour system on a page that already has one of
// each. It is now a prepared asset (public/auth-hero.jpg): cropped past that
// wordmark and past the callout box that clipped behind the logo, graded
// toward the brand, 150 KB rather than the source PNG's 1.9 MB on the one page
// every user must load first.
//
// Image and type are separated VERTICALLY. Putting the render behind the copy
// could not work at any setting: strong enough to see meant the vehicle ran
// through the text, weak enough to read meant grey noise. The panel is ~780 px
// wide and the copy uses most of it, so there is no empty zone to hide an
// image in. Render on top, type at the bottom on a scrim that is solid navy
// from 52% down.
//
// The feature list is NAMES ONLY, and they are the names from the nav registry
// — what the user will click once they are inside. An earlier version carried
// a sentence of description under each, which turned the panel into a brochure
// and buried the sign-in form's importance.
const FEATURES = [
  'Prism', 'DFM / DFA', 'CAD → Cost', 'PCB → BOM → Cost',
  'Innovation Studio', 'Idea Marketplace', 'Horizon', 'Should-Cost',
];

function BrandPanel() {
  return (
    <div className="relative hidden lg:flex lg:w-[54%] xl:w-[56%] flex-col overflow-hidden">
      {/* THE IMAGE OCCUPIES THE TOP, THE TYPE SITS ON SOLID GROUND BELOW IT.
          Earlier attempts put the render behind the copy and neither setting
          worked: strong enough to see meant the vehicle ran straight through
          the text, weak enough to read meant grey noise. The panel is ~800 px
          wide and the copy uses most of it, so there is no empty zone to hide
          an image in. Separating them vertically is the fix.

          The two numbers below are TIED TO EACH OTHER: the scrim goes solid
          38% from the top, and the type block starts at exactly 38%. That is
          what lets the headline be this large and still sit on flat navy —
          and it is why an earlier version had a dead band between the image
          and the words, with everything crammed against the bottom edge. */}
      <div aria-hidden="true" className="absolute inset-0">
        <img
          src="/auth-hero.jpg"
          alt=""
          className="absolute inset-x-0 top-0 h-[54%] w-full object-cover object-[52%_36%]"
          draggable={false}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgb(var(--navy-950))_62%,rgb(var(--navy-950)/0.85)_73%,rgb(var(--navy-950)/0.22)_100%)]" />
        {/* Dissolve the right edge into the form side: no seam, one surface. */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-navy-950" />
        <div className="absolute -top-20 -left-16 w-[32rem] h-[32rem] rounded-full bg-gold-500/[0.07] blur-[110px]" />
      </div>

      <div className="absolute top-10 left-12 xl:left-16 flex items-center gap-4 z-10">
        <img src="/brainspark-logo.svg" alt="" aria-hidden="true" className="w-24 h-24" />
        <span className="text-white font-bold text-[48px] tracking-tight">Brain<span className="text-gold-400">Spark</span></span>
      </div>

      {/* The image's half of the panel. */}
      <div aria-hidden="true" className="h-[38%] shrink-0" />

      {/* The words centre themselves in what is left, so the block sits in the
          panel rather than being pushed against its bottom edge. */}
      <div className="relative flex-1 flex flex-col justify-center px-12 xl:px-16">
        <h2 className="text-[44px] xl:text-[52px] font-bold text-white leading-[1.04] tracking-[-0.03em]">
          The AI-assisted<br />
          <span className="text-gold-400">idea generation engine.</span>
        </h2>

        {/* A two-column list, not pills and not a flowing sentence. Pills imply
            something you can press and none of these can be; a flowing line
            wrapped so that its separators landed at the start of a line. A
            grid puts every marker in the same place on every row. */}
        <ul className="grid grid-cols-2 gap-x-12 gap-y-4 mt-10 pt-9 border-t border-hairline">
          {FEATURES.map(name => (
            <li key={name} className="flex items-center gap-3">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold-400/80 shrink-0" />
              <span className="text-slate-200 text-[16px] font-medium tracking-tight">{name}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative px-12 xl:px-16 pb-12 text-slate-500 text-2xs">
        Designed &amp; created by <span className="text-slate-400 font-medium">Avinash Bhosale</span>
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
      const { token, user } = await apiCall('/api/auth/signup', { name: name.trim(), email, password });
      signIn(token, user);
      toast.success(`Welcome to BrainSpark, ${user.name}!`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
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
    <div className="relative min-h-screen bg-navy-950 flex">
      <BrandPanel />

      {/* Form side. No card and no second background: with a rich panel on the
          left, the form reads strongest sitting directly on the ground — the
          way Stripe, Linear and Vercel do it. The only edges on this half are
          the input borders, so the eye goes where you type. */}
      <div className="relative flex-1 flex flex-col justify-center items-center px-5 sm:px-10 py-12 min-h-screen">
        {/* Phones get the render as texture only — heavily sunk, top-weighted,
            never competing with the form. */}
        <div aria-hidden="true" className="lg:hidden absolute inset-0 overflow-hidden">
          <img
            src="/auth-hero.jpg"
            alt=""
            className="w-full h-[38%] object-cover object-[50%_30%]"
            draggable={false}
          />
          {/* Solid by 30% of the viewport: a label baked into the render was
              ghosting through behind the subtitle. */}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(var(--navy-950)/0.62)_0%,rgb(var(--navy-950)/0.94)_22%,rgb(var(--navy-950))_32%)]" />
        </div>

        <div className="relative w-full max-w-[23rem]">
          <div className="lg:hidden flex items-center gap-3 mb-9">
            <img src="/brainspark-logo.svg" alt="" aria-hidden="true" className="w-[88px] h-[88px] shrink-0" />
            <span className="text-white font-bold text-[40px] sm:text-[44px] tracking-tight">Brain<span className="text-gold-400">Spark</span></span>
          </div>

          <AnimatePresence mode="wait">
            {/* ── Sign In ─────────────────────────────────────────────────── */}
            {screen === 'signin' && (
              <motion.div key="signin" {...slide}>
                <div className="mb-8">
                  <h1 className="text-[26px] font-bold text-white tracking-[-0.02em] mb-1.5">Welcome back</h1>
                  <p className="text-slate-400 text-sm">Sign in to your BrainSpark account</p>
                </div>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <Field label="Email address" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" disabled={loading} autoFocus />
                  <Field label="Password" icon={Lock} type="password" value={password} onChange={setPassword} placeholder="Your password" autoComplete="current-password" disabled={loading} />
                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setScreen('forgot'); clearError(); setDevOtp(''); setOtp(''); }} className="text-gold-400 hover:text-gold-300 text-sm transition-colors">Forgot password?</button>
                  </div>
                  {error && <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-danger-500/10 border border-danger-500/25 text-danger-300 text-[13px] leading-relaxed"><AlertCircle size={15} />{error}</div>}
                  <button type="submit" disabled={loading} className="w-full min-h-[48px] rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-60 disabled:hover:translate-y-0 text-navy-950 font-semibold text-[15px] flex items-center justify-center gap-2 transition-ui duration-micro ease-house hover:-translate-y-0.5 shadow-lg shadow-gold-500/20 hover:shadow-gold-500/30 active:translate-y-px">
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
                  <h1 className="text-[26px] font-bold text-white tracking-[-0.02em] mb-1.5">Create your account</h1>
                  <p className="text-slate-400 text-sm">Free access to the AI cost reduction engine</p>
                </div>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <Field label="Full name" icon={User} value={name} onChange={setName} placeholder="Avinash Bhosale" autoComplete="name" disabled={loading} />
                  <Field label="Work email" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" disabled={loading} />
                  <div>
                    <Field label="Password" icon={Lock} type="password" value={password} onChange={setPassword} placeholder="Create a strong password" autoComplete="new-password" disabled={loading} />
                    <PasswordStrength password={password} />
                  </div>
                  <Field label="Confirm password" icon={Lock} type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repeat your password" autoComplete="new-password" disabled={loading} />
                  {error && <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-danger-500/10 border border-danger-500/25 text-danger-300 text-[13px] leading-relaxed"><AlertCircle size={15} />{error}</div>}
                  <button type="submit" disabled={loading} className="w-full min-h-[48px] rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-60 disabled:hover:translate-y-0 text-navy-950 font-semibold text-[15px] flex items-center justify-center gap-2 transition-ui duration-micro ease-house hover:-translate-y-0.5 shadow-lg shadow-gold-500/20 hover:shadow-gold-500/30 active:translate-y-px">
                    {loading ? <><ButtonSpinner size={18} /> Creating account…</> : <>Create Account <ArrowRight size={18} /></>}
                  </button>
                </form>
                <p className="text-center text-slate-400 text-sm mt-6">
                  Already have an account?{' '}
                  <button onClick={() => { setScreen('signin'); clearError(); }} className="text-gold-400 hover:text-gold-300 font-semibold transition-colors">Sign in</button>
                </p>
              </motion.div>
            )}

            {/* ── Forgot Password ──────────────────────────────────────────── */}
            {screen === 'forgot' && (
              <motion.div key="forgot" {...slide}>
                <button onClick={() => { setScreen('signin'); clearError(); }} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
                  <ArrowLeft size={15} /> Back to sign in
                </button>
                <div className="mb-8">
                  <h1 className="text-[26px] font-bold text-white tracking-[-0.02em] mb-1.5">Reset password</h1>
                  <p className="text-slate-400 text-sm">Enter your email and we'll send you a reset code</p>
                </div>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <Field label="Email address" icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" disabled={loading} />
                  {error && <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-danger-500/10 border border-danger-500/25 text-danger-300 text-[13px] leading-relaxed"><AlertCircle size={15} />{error}</div>}
                  <button type="submit" disabled={loading} className="w-full min-h-[48px] rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-60 disabled:hover:translate-y-0 text-navy-950 font-semibold text-[15px] flex items-center justify-center gap-2 transition-ui duration-micro ease-house hover:-translate-y-0.5 shadow-lg shadow-gold-500/20 hover:shadow-gold-500/30 active:translate-y-px">
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
                  <h1 className="text-[22px] font-bold text-white tracking-[-0.02em] mb-1.5">Enter reset code</h1>
                  <p className="text-slate-400 text-sm">Code sent to <span className="text-white font-medium">{email}</span></p>
                </div>
                <form onSubmit={handleResetPassword} className="space-y-5">
                  {devOtp && (
                    <div className="p-4 rounded-xl bg-amber-500/15 border-2 border-amber-500/40 text-center">
                      <p className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">📧 No email configured — your reset code is:</p>
                      <p className="text-amber-300 font-bold text-3xl tracking-[0.3em]">{devOtp}</p>
                      <p className="text-amber-600 text-xs mt-2">It has been auto-filled below.</p>
                    </div>
                  )}
                  <OTPInput value={otp} onChange={v => { setOtp(v); clearError(); }} disabled={loading} />
                  <div>
                    <Field label="New password" icon={Lock} type="password" value={newPassword} onChange={setNewPassword} placeholder="Create new password" autoComplete="new-password" disabled={loading} />
                    <PasswordStrength password={newPassword} />
                  </div>
                  <Field label="Confirm new password" icon={Lock} type="password" value={confirmNewPassword} onChange={setConfirmNewPassword} placeholder="Repeat new password" autoComplete="new-password" disabled={loading} />
                  {error && <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-danger-500/10 border border-danger-500/25 text-danger-300 text-[13px] leading-relaxed"><AlertCircle size={15} />{error}</div>}
                  <button type="submit" disabled={loading || otp.length < 6} className="w-full min-h-[48px] rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-60 disabled:hover:translate-y-0 text-navy-950 font-semibold text-[15px] flex items-center justify-center gap-2 transition-ui duration-micro ease-house hover:-translate-y-0.5 shadow-lg shadow-gold-500/20 hover:shadow-gold-500/30 active:translate-y-px">
                    {loading ? <><ButtonSpinner size={18} /> Resetting…</> : <>Reset Password <CheckCircle size={18} /></>}
                  </button>
                  <ResendButton key={otpResendKey} email={email} type="reset" onResent={() => { setOtp(''); setOtpResendKey(k => k + 1); }} />
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="relative mt-10 text-slate-500 text-2xs text-center">
          Confidential internal tool · v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
