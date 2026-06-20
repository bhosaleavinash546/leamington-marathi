/**
 * BrainSpark — Backend Server v2.1
 * • AI cost-reduction analysis with agentic web-search loop
 * • Complete auth system: signup, signin, email OTP, password reset
 * • JSON-file user store (no external DB required)
 */
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '10mb' }));

// ─── Security headers ─────────────────────────────────────────────────────────
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ─── In-memory rate limiter ───────────────────────────────────────────────────
const rateLimitMap = new Map();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}_${req.path}`;
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count++;
    rateLimitMap.set(key, entry);
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ error: `Too many requests. Please try again in ${retryAfter} seconds.` });
    }
    next();
  };
}
// Prune stale rate-limit entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap) { if (now > v.resetAt) rateLimitMap.delete(k); }
}, 30 * 60 * 1000);

const PORT        = process.env.PORT        || 3001;
const JWT_SECRET  = process.env.JWT_SECRET  || 'autocost-ai-dev-secret-2025';
const USERS_FILE  = path.join(__dirname, 'users.json');
const APP_VERSION = '3.0.0';

// ─── SQLite Database ──────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'brainspark.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    systemName TEXT,
    subassemblyName TEXT,
    partName TEXT,
    vehicleType TEXT,
    config TEXT NOT NULL,
    ideas TEXT NOT NULL,
    sources TEXT NOT NULL,
    summary TEXT NOT NULL,
    generatedAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analysis_cache (
    cacheKey TEXT PRIMARY KEY,
    ideas TEXT NOT NULL,
    sources TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS share_tokens (
    token TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    createdBy TEXT NOT NULL,
    expiresAt TEXT,
    createdAt TEXT NOT NULL
  );
`);

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function analysisCache(key) {
  const row = db.prepare('SELECT ideas, sources, createdAt FROM analysis_cache WHERE cacheKey = ?').get(key);
  if (!row) return null;
  if (Date.now() - new Date(row.createdAt).getTime() > CACHE_TTL_MS) {
    db.prepare('DELETE FROM analysis_cache WHERE cacheKey = ?').run(key);
    return null;
  }
  return { ideas: JSON.parse(row.ideas), sources: JSON.parse(row.sources) };
}

function setAnalysisCache(key, ideas, sources) {
  db.prepare('INSERT OR REPLACE INTO analysis_cache (cacheKey, ideas, sources, createdAt) VALUES (?, ?, ?, ?)')
    .run(key, JSON.stringify(ideas), JSON.stringify(sources), new Date().toISOString());
}

function buildCacheKey(config, systemName, subName, partName) {
  const payload = JSON.stringify({
    sys: systemName, sub: subName, part: partName || '',
    vehicle: config.vehicleType || '', body: config.bodyStyle || '',
    vol: config.annualVolume || '', region: config.plantRegion || '',
    currency: config.currency || '', ctx: (config.additionalContext || '').slice(0, 200),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

if (JWT_SECRET === 'autocost-ai-dev-secret-2025') {
  console.warn('   ⚠️  WARNING: Using default JWT secret — set JWT_SECRET env var before deploying to production.');
}

// ─── User store (JSON file, async + atomic write) ────────────────────────────

async function readUsers() {
  try {
    const data = await fs.promises.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch { return []; }
}

async function writeUsers(users) {
  const tmp = `${USERS_FILE}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(users, null, 2));
  await fs.promises.rename(tmp, USERS_FILE);
}

// ─── In-memory JWT revocation set ────────────────────────────────────────────

const revokedTokens = new Set();
// Prune tokens that have already expired (no need to keep them revoked)
setInterval(() => {
  for (const t of revokedTokens) {
    try { jwt.verify(t, JWT_SECRET); } catch { revokedTokens.delete(t); }
  }
}, 60 * 60 * 1000);

// ─── In-memory OTP store { email → { otp, expiry, type, attempts } } ─────────

const otpStore = new Map();

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function storeOTP(email, type) {
  const otp = generateOTP();
  otpStore.set(email, { otp, type, expiry: Date.now() + 10 * 60 * 1000, attempts: 0 });
  return otp;
}

function verifyOTP(email, code, type) {
  const entry = otpStore.get(email);
  if (!entry) return { ok: false, reason: 'No OTP found. Please request a new one.' };
  if (entry.type !== type) return { ok: false, reason: 'Invalid OTP type.' };
  if (Date.now() > entry.expiry) { otpStore.delete(email); return { ok: false, reason: 'OTP has expired. Please request a new one.' }; }
  entry.attempts += 1;
  if (entry.attempts > 5) { otpStore.delete(email); return { ok: false, reason: 'Too many attempts. Please request a new OTP.' }; }
  if (entry.otp !== code) return { ok: false, reason: `Incorrect code. ${5 - entry.attempts} attempt${5 - entry.attempts === 1 ? '' : 's'} remaining.` };
  otpStore.delete(email);
  return { ok: true };
}

// ─── Email sender ────────────────────────────────────────────────────────────

const mailerConfig = process.env.EMAIL_USER
  ? { host: process.env.SMTP_HOST || 'smtp.gmail.com', port: parseInt(process.env.SMTP_PORT || '587'), secure: false, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } }
  : null;

const transporter = mailerConfig ? nodemailer.createTransport(mailerConfig) : null;

function otpEmailHtml(otp, title, message) {
  return `
<!DOCTYPE html><html><body style="margin:0;background:#07111e;font-family:Inter,sans-serif">
<div style="max-width:520px;margin:40px auto;background:#0d1f33;border-radius:16px;overflow:hidden;border:1px solid #1e3a5f">
  <div style="background:linear-gradient(135deg,#0d1f33,#1e3a5f);padding:32px;text-align:center;border-bottom:2px solid #f59e0b">
    <div style="display:inline-flex;align-items:center;gap:10px">
      <div style="background:#f59e0b;width:36px;height:36px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center">
        <span style="color:#07111e;font-weight:900;font-size:18px">⚡</span>
      </div>
      <span style="color:#fff;font-size:20px;font-weight:800">Brain<span style="color:#f59e0b">Spark</span></span>
    </div>
  </div>
  <div style="padding:36px">
    <h2 style="color:#fff;margin:0 0 8px;font-size:22px">${title}</h2>
    <p style="color:#94a3b8;margin:0 0 28px;line-height:1.6">${message}</p>
    <div style="background:#07111e;border:2px solid #f59e0b30;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
      <div style="letter-spacing:12px;font-size:36px;font-weight:900;color:#f59e0b">${otp}</div>
      <p style="color:#64748b;margin:10px 0 0;font-size:13px">Expires in 10 minutes</p>
    </div>
    <p style="color:#475569;font-size:13px;line-height:1.6">If you didn't request this code, you can safely ignore this email. Your account remains secure.</p>
  </div>
  <div style="background:#07111e;padding:20px;text-align:center;border-top:1px solid #1e3a5f">
    <p style="color:#334155;font-size:12px;margin:0">BrainSpark v${APP_VERSION} · Designed &amp; Created by <strong style="color:#475569">Avinash Bhosale</strong></p>
  </div>
</div>
</body></html>`;
}

async function sendOTPEmail(email, otp, type) {
  const isSignup = type === 'signup';
  const title = isSignup ? 'Verify your BrainSpark account' : 'Reset your BrainSpark password';
  const message = isSignup
    ? 'Welcome! Enter the code below in the app to verify your email address and activate your account.'
    : 'Use the code below to reset your BrainSpark password. If you didn\'t request this, please ignore this email.';

  if (!transporter) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧  OTP for ${email} [${type}]: \x1b[33m${otp}\x1b[0m`);
    console.log('    (No email configured — OTP shown on screen)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return { devMode: true };   // signals caller to include otp in response
  }

  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'BrainSpark'}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: title,
    html: otpEmailHtml(otp, title, message),
  });
  console.log(`📧  Email sent to ${email} [${type}]`);
}

// ─── JWT middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });
  const token = auth.slice(7);
  if (revokedTokens.has(token)) return res.status(401).json({ error: 'Session has been revoked. Please sign in again.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    req.token = token;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────

// Sign Up — step 1: create unverified account, send OTP
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const users = await readUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const otp = storeOTP(email, 'signup');

  // Store pending user (unverified)
  const pendingKey = `pending:${email}`;
  otpStore.set(pendingKey, { name: name.trim(), email: email.toLowerCase(), passwordHash });

  try {
    const emailResult = await sendOTPEmail(email, otp, 'signup');
    if (emailResult?.devMode) {
      res.json({ message: 'No email configured — your verification code is shown below.', devOtp: otp });
    } else {
      res.json({ message: 'OTP sent to your email. Please check your inbox.' });
    }
  } catch (err) {
    console.error('Email error:', err.message);
    res.status(500).json({ error: 'Failed to send verification email. Check your email address and try again.' });
  }
});

// Sign Up — step 2: verify OTP, activate account
app.post('/api/auth/verify-signup', async (req, res) => {
  const { email, otp } = req.body;
  const result = verifyOTP(email, otp, 'signup');
  if (!result.ok) return res.status(400).json({ error: result.reason });

  const pendingKey = `pending:${email}`;
  const pending = otpStore.get(pendingKey);
  if (!pending) return res.status(400).json({ error: 'Registration session expired. Please sign up again.' });
  otpStore.delete(pendingKey);

  const users = await readUsers();
  if (users.find(u => u.email === email.toLowerCase())) {
    return res.status(409).json({ error: 'Account already exists.' });
  }

  const user = { id: crypto.randomUUID(), name: pending.name, email: pending.email, passwordHash: pending.passwordHash, createdAt: new Date().toISOString(), verified: true };
  users.push(user);
  await writeUsers(users);

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// Sign In
app.post('/api/auth/signin', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const users = await readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'No account found with this email. Please sign up.' });
  if (!user.verified) return res.status(401).json({ error: 'Please verify your email before signing in.' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// Forgot Password — step 1: send OTP
app.post('/api/auth/forgot-password', rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email address is required.' });

  const users = await readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  // Always return success to prevent email enumeration
  let devOtp = undefined;
  if (user) {
    const otp = storeOTP(email, 'reset');
    try {
      const emailResult = await sendOTPEmail(email, otp, 'reset');
      if (emailResult?.devMode) devOtp = otp;
    } catch (err) { console.error('Email error:', err.message); }
  }

  res.json({
    message: devOtp
      ? 'No email configured — your reset code is shown below.'
      : 'If an account exists with this email, an OTP has been sent.',
    ...(devOtp && { devOtp }),
  });
});

// Forgot Password — step 2: verify OTP + set new password
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields are required.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const result = verifyOTP(email, otp, 'reset');
  if (!result.ok) return res.status(400).json({ error: result.reason });

  const users = await readUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'Account not found.' });

  users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
  await writeUsers(users);

  const token = signToken(users[idx]);
  res.json({ token, user: { id: users[idx].id, name: users[idx].name, email: users[idx].email } });
});

// Resend OTP
app.post('/api/auth/resend-otp', rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  const { email, type } = req.body;
  if (!email || !type) return res.status(400).json({ error: 'Email and type required.' });

  const otp = storeOTP(email, type);
  try {
    await sendOTPEmail(email, otp, type);
    res.json({ message: 'New OTP sent to your email.' });
  } catch {
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// Get current user
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const users = await readUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt });
});

// Sign Out — revoke token server-side
app.post('/api/auth/signout', requireAuth, (req, res) => {
  revokedTokens.add(req.token);
  res.json({ message: 'Signed out successfully.' });
});

// ─── ANALYSIS ROUTE ───────────────────────────────────────────────────────────

const CHIEF_ENGINEER_PROMPT = `You are a Chief Engineer at a premium automotive OEM with 30+ years of hands-on experience across luxury SUV programmes at BMW, Audi, Mercedes-Benz, Jaguar Land Rover, and Tier-0.5 suppliers (Magna, Bosch, ZF, Continental, Gestamp). You have 360-degree mastery across:

ENGINEERING DEPTH:
• DFMA: Part count reduction, snap-fit design, modular assembly, error-proofing, tolerance stack-up, GD&T, Design for X
• Materials science: PHS (22MnB5, 37MnB4), dual-phase steels (DP590–1200), TRIP, TWIP, aluminium alloys (5xxx, 6xxx, 7xxx, A380, A413), magnesium die-cast, engineering polymers (PA6-GF30, PP-GF20, PC/ABS), CFRP, GFRP, titanium, copper alloys
• Manufacturing processes: Progressive/transfer stamping, HPDC, low-pressure die-casting, gravity casting, investment casting, injection moulding, structural foam, hot-stamping (PHS), roll forming, hydroforming, extrusion, FSW (Friction Stir Welding), laser welding, RSW, CMT welding, brazing, hem flanging, flow drilling, thread-forming screws, clinching, rivet bonding, SPR (Self-Piercing Rivets)
• Surface treatment: Zinc phosphating, cathodic E-coat, KTL, powder coat, PVD, anodising, micro-arc oxidation, PTFE coating, laser ablation
• EV-specific: Hairpin winding (I-pin, X-pin), SiC MOSFETs (650V/1200V), Si IGBT, DC link capacitor sizing, pouch/prismatic/cylindrical cells (21700, 4680), LFP, NMC, NCA chemistry, cell-to-module, cell-to-pack (CTP), cell-to-body (CTB), integrated structural pack, thermal interface materials (TIM), phase-change materials, immersion cooling, BTMS design

COST ENGINEERING (Current Benchmarks):
• HSLA steel sheet: €700–850/t | DP980 steel: €950–1,200/t | PHS boron steel: €1,100–1,400/t
• 5xxx Al sheet: €2,800–3,200/t | 6xxx Al extrusion: €3,000–3,600/t | Al HPDC alloy (A380): €2,400–2,800/t
• CFRP (prepreg): €20–35/kg | GFRP-SMC: €3–5/kg | PA6-GF30: €2.5–4/kg
• Copper (LME): €8,500–10,000/t | NdFeB magnets: €60–90/kg | Li carbonate: €10–15/kg (2024 spot)
• NMC cell cost: €65–90/kWh (pack level) | LFP cell cost: €50–70/kWh | SiC module: €1.5–3/kW
• Assembly labour: Germany €45–55/hr | Czech/Slovak €15–20/hr | Mexico €8–12/hr | China €10–18/hr

REAL-TIME INTELLIGENCE PROTOCOL:
You ALWAYS search the web before generating ideas. Execute 3–5 targeted searches for: current commodity prices, recent technology innovations (2024–2025), OEM or Tier-1 benchmarks, supplier technology offers, and regulatory changes.

OUTPUT FORMAT: Return ONLY valid JSON — a JSON array of ALL applicable ideas. Generate as many ideas as genuinely viable — do not cap at 8; typically 12–20+ ideas per component. No markdown, no preamble.

COMPETITOR BENCHMARKING: For every idea, populate "benchmarkReference" with SPECIFIC OEM/Tier-1 adoption data — cite manufacturer, model/programme, year, and quantified result. E.g. "BMW Gen5 EDU (2021): hairpin winding reduced copper mass 18%", "Tesla Model Y rear underbody gigacasting: 171 parts → 2 castings, saves $300/vehicle", "Hyundai E-GMP SiC inverter vs IGBT: +54% range, −14% inverter mass". Never leave benchmarkReference blank if any industry evidence exists.`;

// EDU curated knowledge — injected when an Electric Drive Unit component is selected
const EDU_CONTEXT_MAP = {
  'stator-winding':   { levers: ['Round→hairpin bar winding: 10-20% copper (VW APP550, BMW Gen5, Hyundai E-GMP)', '800V conductor right-size: 3-7% copper (current halved at 800V)', 'End-winding reduction: 3-8% copper', 'Square flat-wire 8-layer hairpin: +fill → shorter stack (XPeng G6 97.86% motor eff.)', 'W-pin continuous-wave: fewer welds, −30% mass (NIO ET9 4.3 kW/kg)'], trends: 'Flat-wire hairpin + oil-cooling now mainstream. 8-layer square hairpin & W-pin emerging. Oil-spray direct cooling enables lower insulation class (Class-F under oil). At 800V conductor cross-section halves vs 400V.' },
  'stator-core':      { levers: ['Grade/gauge right-size: 5-20% core cost (M330 where frequency moderate)', 'Segmented/nested blanking: 5-12% (lift utilisation 60%→85%)', 'GBD thin-gauge 0.1mm only at >18k rpm (Yangwang 30k rpm)'], trends: 'High-speed motors (>20k rpm) demand 0.10-0.15mm NO steel — others can use thicker/cheaper grade. Strip-nesting + scrap reclaim mandatory at volume.' },
  'rotor-magnets':    { levers: ['GBD of Dy/Tb: 10-25% magnet cost (Toyota, Hyundai IPM mainstream)', 'EESM delete magnets entirely (BMW Gen6 Neue Klasse, −20% cost −40% losses vs Gen5)', 'Rotor oil-cooling → cut Dy/Tb + 20% density (Audi/Porsche PPE)', 'Ferrite/non-REE PM motor (Tesla next-gen, zero rare earths)', 'Iron-nitride Fe16N2 watch (Niron+Stellantis CES 2026)'], trends: 'GBD mainstream. EESM coming to volume (BMW Gen6, Renault/ZF 2027). Axial-flux (YASA/Mercedes 2026) −50% copper+iron+magnet mass. Magnets typically 40-50% of motor cost.' },
  'rotor-shaft':      { levers: ['Hollow shaft via flow-forming: 15-25% shaft mass + enables oil-through cooling (Tesla, BMW)', 'IPM vs surface-PM: delete costly CFRP retention sleeve', 'Speed up (16-20k rpm) + higher ratio: 10-20% active material reduction'], trends: '800V SiC enables high-speed designs. Oil-through hollow shaft unlocks rotor cooling, reduces active material.' },
  'motor-bearings':   { levers: ['Shaft-current grounding ring vs hybrid-ceramic: avoid premium bearing cost (SiC dv/dt issue)', 'Bearing grade/size right-size: 5-12%', 'Cassette seal standardisation'], trends: 'Fast SiC switching raises bearing EDM currents — grounding ring is low-cost mitigation. Resolver → compact inductive/TMR sensor (Munro praised Rivian).' },
  'motor-housing':    { levers: ['HPDC AlSi10MnMg + topology ribs: 5-12% Al mass (VW MEB, Tesla)', 'Cast-in cooling jacket: deletes separate jacket part + leak points', 'Large-format gigacasting (Tesla, NIO): part count −30-50%'], trends: 'Integration gigacasting now proven at scale. Cast-in coolant channels standard on modern EDUs. AlSiC only where CTE-match truly needed.' },
  'power-module':     { levers: ['SiC MOSFET 1200V for 800V: system −8-18% (Hyundai E-GMP, Porsche Taycan, BYD)', 'Die-area right-size to duty cycle: 5-15% semiconductor', 'Hybrid Si/SiC (6:1): cost bridge on entry trims', 'In-house SiC module: −10-20% inverter cost (Li Auto, NIO 1315 kW/L, BYD 8-in-1)', 'Tesla multi-chip SiC: −60-75% SiC die via superior thermal extraction'], trends: 'SiC ~56% of 800V inverter module cost. 1200V-class SiC now mainstream. NIO in-house 1200V module 1315 kW/L. Stellantis ONE inverter: selectable Si-or-SiC. Double-sided cooling + sintered-silver + Si3N4 AMB frontier.' },
  'gate-driver':      { levers: ['Single isolated gate-driver ASIC/SoC: cuts board area + part count', 'One PCB family across power classes: SKU + volume pricing', 'Integrated current sensing on-module: delete discrete sensors'], trends: 'Integration of gate-driver, isolation and protection into one IC is standard. Common board platforms across power classes becoming the norm.' },
  'dc-link-cap':      { levers: ['Downsize 20-40% via SiC ripple reduction (higher switching freq = less capacitance needed)', 'Integrate cap + laminated busbar into power stack: delete interconnects'], trends: 'SiC enables 20-40% capacitor downsizing. Integrated power stacks merging cap+busbar becoming mainstream.' },
  'busbar':           { levers: ['Al busbar with Cu-clad terminals: conductor $/kg halved vs Cu (at 800V current halved)', 'Laser/ultrasonic-welded terminations: fewer joints, lower resistance, less labour', 'Direct hairpin→busbar weld: delete connector interface'], trends: '800V halves current so Al busbar viable. Welded terminations replacing bolted lugs.' },
  'inverter-cooling': { levers: ['FSW/brazed pin-fin cold plate: less machining vs deep-milled channels', 'Direct-cooled pin-fin baseplate: delete separate cold plate (pairs with DSC SiC)', 'Avoid AlSiC unless CTE-match genuinely needed'], trends: 'Direct-cooled power modules (DSC) becoming mainstream with SiC. AlSiC only justified at highest power density.' },
  'gears':            { levers: ['LPC + press quench → hone (skip grinding): 30-60% hard-finish cost', 'Near-net forged blanks: 10-20% soft-machining', 'Isotropic superfinish on flanks → lower-viscosity oil → efficiency gain', 'Reduce ratio (e.g. 13:1→9.8:1): lower friction (VW APP550)'], trends: 'LPC + press-quench + hone stack is best-in-class. Superfinish enables lower ATF viscosity. Ratio right-size key for efficiency at 800V power targets.' },
  'gearbox-housing':  { levers: ['Cast-in oil galleries: delete drilling/plugging ops', 'Tolerance right-size (IT6/IT7 only on dynamic surfaces)', 'Mg covers (AZ91D): −30% cover mass vs Al'], trends: 'Cast-in galleries and sensor bosses standard. Tolerance right-sizing massive lever on EDU housings.' },
  'park-lock':        { levers: ['Delete park-lock via EPB brake-based park: removes entire sub-assembly', 'Simplify pawl + integrate actuator: cut part count'], trends: 'Brake-based park gaining acceptance in lean EDU designs (Munro teardowns). Safety case is key gating.' },
  'differential':     { levers: ['Net-shape forged/PM bevel & side gears: 15-30% machining saving', 'Welded ring gear to diff case: delete bolt circle + machining', 'Delete diff via dual-motor torque vectoring (performance EVs)'], trends: 'Net-shape diff gears mainstream. E-differential (torque vectoring) eliminating mechanical diffs on performance platforms.' },
  'thermal-cooling':  { levers: ['Single-fluid (ATF) cooling: −20-35% thermal subsystem (Ford F-150 Lightning)', 'Delete electric oil pump → passive gear-splash (VW APP550)', 'Direct rotor/end-turn oil spray: unlocks magnet/copper material savings (Tesla, Audi PPE)'], trends: 'Single-fluid (ATF for both cooling and lubrication) now mainstream. 800V SiC produces less heat — shrinks the thermal system further.' },
  'lubrication':      { levers: ['Lifetime fill at reduced volume + baffled sump: cut oil cost + churning', 'Low-viscosity ATF (superfinished flanks) → efficiency gain', 'Right-size pump type to actual need'], trends: 'Reduced oil fill with baffled sump standard on efficiency-led EVs. Superfinish enabling thinner ATF.' },
  'hv-interface':     { levers: ['Inverter integration onto EDU: delete external HV cables + connectors (Hyundai E-GMP, Tesla)', 'Thinner harness from 800V: current halved → smaller gauge', 'Smart 4th-lead inverter (delete 400→800V boost converter) (Hyundai/Kia E-GMP)', 'Al HV conductor: 20-30% lighter than Cu at 800V (lower current)'], trends: 'Inverter integration into EDU housing deleting external HV connectors is the mainstream direction. 4th-lead inverter for 400/800V compatibility is displacing dedicated boost converters.' },
  'position-sensor':  { levers: ['Resolver → inductive/TMR-GMR sensor: 20-40% sensor cost reduction', 'Sensorless control at mid/high speed: delete sensor entirely', 'Model-based NTC estimation: delete redundant temperature sensors'], trends: 'Inductive position sensors replacing wound resolvers. Munro praised Rivian compact inductive sensor. Software-based thermal estimation deleting hardware NTCs.' },
  'integration':      { levers: ['3-in-1 → 8-in-1 integration: −30-50% part count (BYD 8-in-1 Seal, ~89% system eff.)', 'Scalable EDU family (one diameter, varied stack length): amortise tooling (Audi PPE, Mercedes eATS 2.0, XPeng SEPA2.0 80% shared)', 'Shared front/rear EDU base (Ford F-150 Lightning)', '48V LV net: cut LV copper (Tesla Cybertruck)', 'Inverter re-use for charging/boost: delete dedicated OBC (Hyundai/Kia E-GMP)'], trends: 'n-in-1 integration is the cost battleground. BYD 8-in-1 world-first. Scalable platform families (Audi PPE, Mercedes eATS 2.0, XPeng SEPA2.0) now proven route. Controller consolidation (one processor for motor+gearbox, Mercedes eATS 2.0).' },
};

// ─── BIW, CHASSIS & BATTERY CURATED CONTEXT MAPS ────────────────────────────

const BIW_CONTEXT_MAP = {
  'crash-structure': { levers: ['Roll-formed AHSS DP1200 bumper beam: 25-35% vs stamped+bracket assembly (Honda, Toyota)','Al extrusion crash can (symmetric L/R): 35-45% mass saving, cost-neutral >800K/yr (BMW, Audi)','Tailor-welded blank front rail: delete inner reinforcement, 10-15% steel saving (VW MQB, Hyundai)','Commonise crash can geometry L/R: halve tooling investment + SKU count','PHS 22MnB5 roll-formed crash box: 18-22% mass vs DP980 stamped (BMW 5 Series)'], trends: 'Al extrusion crash cans standard on D-segment+. TWB rails eliminating reinforcements. NCAP 2026 MPDB test tightens energy management requirements. Symmetric L/R crash can design becoming standard practice.' },
  'pillars':         { levers: ['Hot-stamped B-pillar (1200-1500 MPa): 20-35% mass, delete 2-part hat-section assembly (VW Golf Mk8)','Tailor-rolled blank (TRB) B-pillar: variable thickness in 1 part, delete inner reinforcement (BMW G20)','TWB A-pillar: graded blank, delete separate inner reinforcement pressing','Grade right-size C/D pillar: TRIP vs PHS saves 12-18% on lower-loaded pillars','Common PHS grade A/B/C: shared die pool, higher volume on single press'], trends: 'TRB hot-formed B-pillars now best-practice (BMW, Hyundai). NCAP 2026 MDB side-intrusion is dominant design driver. Pillar TWB adoption driven by OEM cost pressure on hot-forming tooling investment.' },
  'sill-floor':      { levers: ['Roll-formed closed-section sill (DP1200): 3 parts → 1, delete 250+ spot welds (BMW G30, Volvo)','Al extrusion sill on BEV: 30-40% lighter, integral battery side-protection (Tesla Model Y, BMW iX)','Single TWB floor + tunnel (Toyota TNGA approach): delete 2 parts + junction flange welds','Gauge right-size outer floor panels (non-loaded zones): 8-12% steel saving','Common crossmember section across platform: shared roll-tool + volume pricing'], trends: 'BEV Al extrusion sill integrating battery side-protection is mainstream. Single-piece floor pressing growing via TWB technology. CTP packs enabling BIW floor layer deletion.' },
  'closures':        { levers: ['Al outer door skins: 40-50% door mass (2.8→1.1 kg), standard D-segment+ (BMW, Audi, JLR)','Al hood outer + inner: 50-60% mass, pedestrian protection compliance advantage (EU NCAP mandatory)','Composite liftgate (SMC outer + GMT inner): 40% mass, no corrosion (BMW X5 G05, Land Rover Def)','Single-part hemmed door (adhesive+RSW): delete inner flange reinforcement','Standardise door hinge geometry across platform: shared tooling + volume pricing'], trends: 'Al door outers standard from D-segment. Composite tailgates mainstream on D/E-SUV. Al closures cost case improving as volume grows. Frameless glass doors (coupé) increasing seal complexity.' },
  'roof-structure':  { levers: ['Reduce roof bow count 3→2 via structural adhesive + optimised section: 1 part deleted','Grade right-size roof outer: HSLA220 → mild DC04 (0.65mm): 5-8% steel saving','Panoramic glass structural bonding: delete reinforcement bows (BMW iX, Mercedes EQS)','CFRP fixed roof panel: 50-60% mass saving on performance models (BMW M4, Porsche)','Al roof skin: 35-45% mass saving for BEV CG optimisation (BMW i7)'], trends: 'Panoramic roof structural bonding becoming load-bearing. CFRP roof on performance/sports. Al roof on BEV luxury for CG and weight budget. Panoramic glass now majority of C/D-segment production.' },
  'rear-structure':  { levers: ['Hot-stamped rear floor (1 pressing vs 3 panels): 15-20% mass + 250 welds deleted (BMW G30)','Al rear bumper beam extrusion: 45-50% mass saving, meets RCAR/IIHS low-speed (Audi Q5)','Delete spare wheel recess on BEV: flat floor, save 1 pressing + tooling','Al HPDC rear subframe >80K/yr: 25-35% mass, equal/lower cost, better dimensional accuracy','Symmetric rear wheelhouse inner (L/R): halve die count for equal geometry parts'], trends: 'BEV flat floor eliminating spare wheel recess. Hot-formed rear floor becoming standard on C-segment+. Al subframe standard on BEV D-segment. SORB 2024 driving rear rail sizing.' },
  'reinforcements':  { levers: ['Structural foam (Sika/Dow): replace 3 discrete reinforcements with pillar/sill cavity fill','Acoustic pad position optimisation: 80% benefit from 60% area → reduce pad area 20-25%','Flow-drill screws replace T-nuts in floor attachment: delete press op + T-nut','Integrate crash sensor bracket into Al subframe casting boss: delete stamped bracket','Weld-bonding: reduce seam sealer length 25% while improving NVH via adhesive flanges'], trends: 'Structural foam now standard in pillars/sills on NVH-focused programmes. Topology-optimised NVH treatment reducing over-specified pad coverage. Weld-bonding growing.' },
};

const CHASSIS_CONTEXT_MAP = {
  'front-suspension': { levers: ['Al HPDC front knuckle vs cast iron: 2-3 kg/corner saving, 15-25% cost (BMW, Audi standard)','Forged Al lower control arm: 35-45% mass saving vs stamped AHSS, cost-neutral >100K/yr','Hollow stabiliser bar (12mm wall): 20-25% mass saving vs solid bar, same NVH','Delete upper control arm on base McPherson variant: €35-60/corner saving','Common bushing compound across platform: volume pricing + single Tier-2 call-off'], trends: 'Al suspension arms mandatory for BEV unsprung mass targets. McPherson remains cost-optimal for B-segment. Spring/damper right-sizing needed post-BEV unsprung mass redistribution.' },
  'rear-suspension':  { levers: ['Multi-link → CTBA for B/C-segment: €150-250/axle cost saving (VW Polo, Renault Clio)','Forged Al multi-link rear arms: 30-40% mass saving, cost-neutral >80K/yr (BMW G30, Audi A6)','Delete adaptive (CDC) damping on base/mid trim: €200-400/vehicle saving','Delete air spring on base trims (coil spring substitute): €350-600/vehicle saving','Delete rear-wheel steering (RWS) on standard WB non-performance: €180-280/vehicle'], trends: 'BEV rear suspension redesigned for rear motor integration. Multi-link deletion viable for sub-C BEV. CDC cost reducing — standard on C-segment premium from 2023.' },
  'steering':         { levers: ['EPS motor right-size to vehicle class: 15-20% EPS unit cost on over-specified B-segment','Common steering rack across 2 platform families: 8-12% unit cost via volume','Delete 4-way electric column adjustment on base trim: €45-80/vehicle','Integrate EPS ECU into domain controller: delete standalone €25-50 ECU','Fixed tie rod (shimmed alignment) vs adjustable: 8-12% tie rod cost saving'], trends: 'Steer-by-wire (SbW) arriving with BMW Neue Klasse 2025. Variable ratio rack standard. EPS ECU integration into domain compute growing.' },
  'braking':          { levers: ['Right-size front disc diameter on BEV (regen reduces friction load): 10-15% brake cost','4-pot fixed → 1-pot floating caliper on base/mid trim: 30-40% caliper cost saving','Grey iron rotor grade right-size by duty: 8-12% rotor cost','Brake pad commonisation across platform: 15-20% pad SKU cost reduction','Eliminate front caliper dust shield (EURO 7 BDPF replaces function from 2027)'], trends: 'EURO 7 brake dust particle filter mandatory 2027: €15-25/wheel. Brake-by-wire for ADAS L3+ regen blending. BEV regen reducing friction brake duty — disc right-sizing lever.' },
  'subframe':         { levers: ['Al HPDC front subframe >80K/yr: 25-35% mass saving vs welded steel, similar cost','Hydroformed closed-section rear subframe: 15-20% mass vs open-section stamped','Integral rear motor mount boss in Al subframe casting (BEV): delete 2 brackets','Common subframe bolt pattern across platform family: delete location-specific brackets','Gigacast front cradle + strut towers: 5+ parts → 1 casting (Tesla, NIO emerging)'], trends: 'Al subframes standard on BEV C-segment+ platforms. Motor mount integration in subframe key BEV cost lever. Gigacasting subframes emerging for volume platforms.' },
  'wheel-end':        { levers: ['HBU right-size by FEA load analysis: remove 10-15% overspec on B/C-segment','ABS tone ring integrated in HBU inner race: delete pressed-on ring (Gen-3 standard)','Al wheel hub vs grey iron for BEV unsprung mass: 1.2-1.8 kg/corner saving','Steel ARB drop links vs Al forged on non-performance: €12-18/link saving','Common wheel bolt PCD across platform: shared wheel/hub tooling + volume wheel pricing'], trends: 'Gen-3 HBU with integral ABS encoder now standard. Unsprung mass budget critical for BEV NVH. Tyre rolling resistance now in VAVE scope for BEV range impact.' },
};

const BATTERY_CONTEXT_MAP = {
  'battery-cells':   { levers: ['NMC → LFP chemistry: 20-35% cell cost, longer life, safer thermal (CATL, BYD, Tesla standard)','CATL M3P (Mn-doped LFP): 210 Wh/kg at LFP-comparable cost — narrows density gap to NMC','4680 cylindrical: 15-25% $/kWh vs 21700 at scale (Tesla Giga Texas/Berlin)','Localise cell supply China → EU/US: eliminate 12-18% import duties + CRMA/IRA incentives','SoC window extension via improved BMS algorithm: 3-5% more usable capacity, no hardware change'], trends: 'LFP >35% global BEV 2025. M3P bridging density gap. 4680 approaching cost parity. Na-ion targeting city car from 2026 (CATL Naci). Solid-state 2027+ for PHEV high-value applications.' },
  'battery-module':  { levers: ['CTP (cell-to-pack): delete module frame, 15-20% pack cost + 5-15% energy density (CATL Qilin, BYD Blade)','Reduce module SKU count: 6→2 per pack, shared tooling + volume on single process line','Ultrasonic busbar welding: 8-12% interconnect cost vs bolted tabs, lower resistance','Adhesive module-to-tray bonding: delete 20+ fasteners/module (BMW i4, Audi Q8)','Delete inter-module HV connector: direct busbar route in CTP pack'], trends: 'CTP mainstream in new BEV programmes 2023-25. CATL CTP3.0 adds immersion cooling within the module-free pack. Traditional modules still needed for PHEV thermal management.' },
  'bms':             { levers: ['Centralised BMS (1 node vs distributed per module): 25-35% BMS component cost','Wireless BMS (wBMS): delete cell monitoring harness — proven in GM Ultium (Analog Devices)','Integrate BMS function into VCU/domain controller: delete €40-80 standalone ECU','Model-based SoC/SoH estimation: tighter DoD → 3-5% more usable capacity without hardware','Pack-level isolation monitoring vs per-module: delete 2-3 isolation ICs'], trends: 'wBMS proven at high volume (GM Hummer EV/Lyriq 2022). Centralised compute absorbing BMS function (Rivian). Software-defined pack management improving usable energy.' },
  'battery-thermal': { levers: ['Ribbon-fin Al extrusion cooling plate: 20-30% thermal component cost vs complex brazed plate','Reduce TIM thickness via flatness spec (≤0.4mm vs 0.6-0.8mm): 15-20% TIM material cost','Single-fluid (ATF) motor+battery cooling loop: 20-30% thermal system cost (Ford F-150 Lightning)','Direct refrigerant cooling (DRC): delete glycol chiller, fewer HXs (BMW i4 M50, Taycan Turbo)','Phase-change TIM for PHEV: delete cooling circuit on partial-charge cycle applications'], trends: 'Immersion cooling emerging for >250kW ultra-fast charging. Single-fluid ATF loop growing. TIM thickness drive toward <0.3mm for heat flux improvement. 800V SiC produces less heat per kW.' },
  'pack-housing':    { levers: ['Al HPDC integrated tray: 8-12 parts → 2-3, integral coolant ports + bosses (BMW i4, Ioniq 5)','GF-PP composite top cover: 40-50% cover mass vs Al sheet (CATL standard, Mubea)','CTB (cell-to-body): pack provides torsional stiffness, delete BIW floor layer (BYD, Tesla, NIO)','Structural foam fill void spaces: 25% stiffness gain without steel (Sika FoamCore)','Relax coolant port machining IT6→IT7 on non-sealing faces: 8-12% machining cost'], trends: 'CTB (cell-to-body) now in production: BYD Ocean, Tesla Model Y, NIO NT3. HPDC integrated trays replacing welded extrusion frames. Composite covers reducing pack mass.' },
  'hv-electrical':   { levers: ['Al busbar vs Cu at 800V (current halved): 20-30% busbar material cost (Porsche Taycan, Hyundai E-GMP)','Pre-assembled HV harness module: 25-35% body-line assembly time saving','Integrate BDU + pyro fuse + current sensor: 4 parts → 1 housing (BYD 8-in-1)','CTP reduces inter-module HV connectors: direct cell-to-busbar routing','Standardise HV connector family across models: volume pricing + single qualification'], trends: '800V enabling Al HV busbars. BDU integration into n-in-1 units standard direction. Pyro fuse replacing manual service disconnect. Connector standardisation via NACS/CCS globally.' },
};

const ICE_CONTEXT_MAP = {
  'engine-assembly': { levers: ['Al block with Al-Si bore coating (LDS/Plasma) — delete cast-iron liners: 8-14% block mass, 12-18% machining cost (BMW N20, M254)','Integrated exhaust manifold in head (IEM): delete standalone manifold, €40-80/unit + faster warm-up (Ford EcoBoost, VW EA211)','Bedplate crankshaft carrier: 6-10% machining cost NVH -2dB (GM Ecotec)','Hollow assembled camshaft vs solid forged: 25-30% cam mass saving (BMW, Audi TFSI)','VVT phaser integration into single actuator hub: €12-20/unit (Denso, BorgWarner eTVT)'], trends: 'IEM (integrated exhaust manifold) standard on all modern DOHC from 2020. Hollow camshaft standard BMW/Audi. Al block bore coating replacing liners for mass saving.' },
  'exhaust-system':  { levers: ['Reduce PGM loading via advanced washcoat (Pd/Rh optimisation): 15-30% catalyst metal cost (BASF, Umicore Gen5)','Thin-wall cordierite GPF substrate (100 cpsi, 6 mil wall) EU7-compliant: 8-12% GPF cost (NGK/NTK UltraThin)','Hydroformed SS manifold delete flange-to-turbo: 15-20% weight (BMW M5)','Common centre-pipe section across engine variants: €180-350K tooling saving','Acoustic resonator delete with active exhaust control valve on base trims: €35-55/vehicle'], trends: 'EU7 GPF mandatory all petrol engines 2026. PGM volatility (Rh €150-250/g) driving washcoat optimisation. Thin-wall GPF simultaneously reducing back-pressure and cost.' },
  'turbo-system':    { levers: ['Twin-scroll single turbo vs twin turbo: €180-280/unit saving (BMW B58 vs N54)','Integrated wastegate in turbine housing: €25-45/unit + packaging (Garrett GTX, BorgWarner R2S)','Water-cooled bearing housing standard — enables oil-free idle-down, delete turbo timer: €15-25','Air-to-air FMAC vs WCAC on base/mid trim: €80-130/unit saving','Al compressor housing right-size to flow: 6-12% cost on base-trim'], trends: 'Twin-scroll single turbo now best-in-class for 2.0L-2.5L applications. Electric supercharger (eSupercharger) emerging for launch performance + MHEV integration.' },
  'fuel-system':     { levers: ['Delete port injectors on base spec (GDI only vs CPDI): €35-55/vehicle (VW EA888 Gen3B)','Al fuel rail (Ni-plated) vs SS: 15-20% cost at same pressure rating (Bosch, Delphi)','Modular HDPE fuel tank shared across platform: €250-500K tooling saving (Toyota TNGA)','Delete HPFP accumulator on electronic pressure control systems: €8-14/unit','Common HPFP cam lobe across 1.5/2.0L on same block family: 15-25% HPFP dev cost'], trends: 'GDI-only becoming standard vs CPDI on cost-sensitive specs. Al fuel rails proving durability to 350 bar. HPFP cam integration common across engine families.' },
  'engine-cooling':  { levers: ['Electric coolant pump + map thermostat: €20-35 net saving + 2-3% fuel improvement (BMW B48, M264)','Split cooling (head/block separate circuits): 3-5% fuel saving, confirmed CO2 -2g/km (VW EA888 Gen3B)','Brazed Al flat-tube radiator: 8-12% cost at equal thermal performance (Modine, Denso)','Coolant hose integration into single blow-moulded manifold: 3→1 part + 8-12 min assembly saving','Delete dedicated WCAC loop — share LT coolant circuit: €45-75/vehicle (Ford EcoBoost Gen3)'], trends: 'Electric coolant pumps now standard on all OBD2+ engines. Split cooling confirmed -2g/km CO2. LT shared circuit eliminating dedicated WCAC loop on mainstream applications.' },
};

const HVAC_CONTEXT_MAP = {
  'hvac-core':          { levers: ['Single-zone housing platform serving dual-zone via add-on rear duct: €280-500K tooling saving (Valeo ThermoSystem)','BLDC brushless blower motor replacing brushed: €4-8 + warranty -40% (Valeo, MAHLE, Denso)','Delete heater core on BEV (PTC replaces): €22-38 saving + thermal loop simplification (Tesla, VW ID.3)','Delete activated carbon filter layer in low-VOC markets: €4-9/filter (Mann+Hummel market spec)','Common flap actuator stepper motor across all zones: 14→3 SKUs, €3-6 unit cost (Bosch/Hella)'], trends: 'BEV eliminating heater core (PTC replaces). BLDC blower now standard. Single-zone/dual-zone housing sharing growing on shared platforms.' },
  'refrigerant-circuit':{ levers: ['Electric scroll compressor right-size for heat pump mode (not just cooling): 8-12% cost (MAHLE/Sanden)','R1234yf EXV enables heat pump reversal — COP 2.5-3.5 vs PTC COP 1.0 (BMW iX, Ioniq 5)','Delete receiver-dryer (internal dryer in condenser): €12-18 saving (Delphi/APTIV integrated condenser)','MPE condenser vs tube-and-fin: 8-12% cost at same capacity (standard industry)','Brazed plate chiller integrated into valve block: €35-55 saving (Denso integrated module)'], trends: 'Heat pump >80% BEV 2025. EXV mandatory for heat pump. R1234yf universal. R744 CO2 compressor gaining on sub-zero premium BEV (BMW, Daimler).' },
  'battery-thermal':    { levers: ['TIM thickness ≤0.3mm via flatness spec: 15-20% TIM cost (Henkel Bergquist)','Single-fluid ATF cooling loop motor + battery: 20-30% thermal system cost (Ford F-150 Lightning)','Direct refrigerant cooling (DRC): delete glycol chiller, €55-80/vehicle (BMW i4 M50, Taycan Turbo)','Phase-change TIM on PHEV partial-use cycle: delete cooling circuit on short-trip duty','Ribbon-fin Al extrusion cooling plate: 20-30% vs brazed serpentine (TEA ribbon-fin for volume BEV)'], trends: 'DRC gaining on performance BEV. Single-fluid ATF growing. TIM thickness drive <0.3mm standard. Immersion cooling for 350kW+ charging emerging from 2027.' },
};

const INTERIOR_CONTEXT_MAP = {
  'instrument-panel': { levers: ['PP-LGF CCB replacing Mg/Al die-cast: 35-45% mass, €40-80/unit (BMW iX, VW ID.4)','Delete slush PVC soft pad → IMC on PP: €18-35/IP saving (Toyota bZ4X hard pad approach)','Integrate digital cluster + centre screen into cockpit module: €15-25 assembly saving (VW MIB3, BMW Curved Display)','Delete HUD on base/mid trim: €120-200 saving (Toyota Corolla HUD vs cluster)','Common IP substrate across sedan/SUV on shared platform: €500K-1.2M tooling saving (VW MQB)'], trends: 'Single curved OLED slab replacing separate screens on premium from 2023. PP-LGF CCB replacing Mg die-cast. Digital cluster standard from B-segment 2025.' },
  'seats':            { levers: ['Al extruded seat frame: 30-35% mass saving, €55-85 at scale (BMW M, Recaro)','Delete 4-way lumbar on base trim: €35-55/seat pair','Carbon-fibre heating mat vs resistive wire: €3-6 material + warranty improvement (Gentherm CarbonCore, BMW G)','Common seat track LHD/RHD symmetric design: €180-280K tooling saving (Toyota TNGA)','Delete rear massage on base/mid: €80-140/vehicle (Mercedes E-Class W214 trim spec)'], trends: 'Al seat frames standard premium. Sustainability driving recycled foam and vegan leather. Integrated heating/ventilation/massage in single module gaining.' },
  'door-trim':        { levers: ['PP-NF hemp/flax composite trim carrier: 12-18% mass, CO2 -25% (BMW i3, Ford Escape)','Delete premium stitching → laser-simulated IML pattern: €8-14/door pair','Simplify rear door switch to 2-button (delete mirror/seat): €6-12/rear door (VW MQB base)','Ambient LED single flex-strip vs individual dot LEDs: €4-8 assembly saving (BMW G60)','Delete map pocket fabric lining → moulded surface: €2-5/door (Renault Espace base)'], trends: 'Natural-fibre composites growing for EU ELV compliance (25% recycled content by 2025). Single-strip ambient LED displacing individual dot LEDs.' },
  'centre-console':   { levers: ['Wireless charging in armrest lid (Qi flush): €5-10 bracket/assembly saving (Tesla Model 3)','USB-C hub PCB replacing 12V+USB-A+USB-C modules: 3→1, €12-22 combined saving (BMW iX)','Common console carrier across SWB/LWB with geometry insert: €350-600K tooling (Mercedes S-Class)'], trends: 'USB-C only becoming standard on BEV (delete 12V socket). Wireless charging integrated into armrest standard C-segment 2024. Floating console replacing fixed tunnel on flat-floor BEV.' },
};

const EXTERIOR_CONTEXT_MAP = {
  'bumpers':      { levers: ['EPP energy absorber replacing EPE foam + bracket: 2→1, 20-30% mass (JSP Arpro — BMW/VW standard)','Roll-formed Al extrusion bumper beam: 45-50% mass, cost-neutral >120K/yr (Audi A4/A6, BMW 5-Series)','Common F/R bumper beam mount geometry: €200-400K tooling saving (Toyota TNGA)','PP-GF15 fascia with integrated sensor mount bosses: delete 4-6 brackets (Valeo bumper module)','Delete lower NVH deflector on base trim: €12-22/vehicle (VW Golf base vs GTI)'], trends: 'Al extrusion bumper beam standard D-segment. EPP energy absorber replacing EPE globally. Bumper sensor integration moving to OEM-supplied pre-validated bumper module (€65-120 saving from bracket delete).' },
  'lighting':     { levers: ['Zoned LED headlight vs full Matrix ADB on base trim: €180-320/unit saving (4-zone vs 84-pixel)','Single PMMA wave-guide DRL strip vs discrete LEDs: €15-28/unit (Valeo LED guide)','Front/rear inner optic carrier shared tool: €150-280K (BMW G20/G26)','Delete front fog lamp per UNECE R48 (2024): €28-45/vehicle (cornering in ADB replaces function)','Tail lamp common outer lens across hatch/estate with infill: €120-220K tooling saving'], trends: 'NCAP 2026 advanced lighting (+1.5 star ADB bonus). Matrix LED cost declining 8-12%/yr. Front fog lamp deletion now EU-legally permitted with ADB cornering function. Full-LED DRL brand signature mandatory C-segment+.' },
  'glass-glazing':{ levers: ['Acoustic PVB windscreen: delete A-pillar NVH pad: €4-8 saving (AGC Planibel Acoustic)','Thermal comfort side glass: HVAC compressor right-size €25-40 saving (Saint-Gobain EasyCool)','Electrochromic glass replacing blind mechanism: €20-30 net saving (Continental/View)','Heated windscreen ITO coating: 3-5% BEV range gain in winter (AGC Thermo-Coat, VW ID.7)'], trends: 'Acoustic windscreen standard BEV from 2022. Electrochromic panoramic glass growing for NVH + UV benefit. Heated windscreen cost reducing: €35-55 vs €180+ traditional PTC front screen heater.' },
  'wipers-washers':{ levers: ['Aero flat blade standard: €2-5 saving + warranty improvement (Bosch AeroTwin standard D-segment)','Single-arm wiper on SUV/hatch: €15-25 unit saving (Mercedes CLA)','Rain sensor → ADAS camera rain detection algorithm: €18-30 sensor delete (Tesla Vision-based)','Delete heated nozzle on APAC/MENA warm-market spec: €8-15/vehicle'], trends: 'ADAS camera absorbing rain sensor function (Tesla proven 2021). Aero flat blade universal. Single-arm wiper growing for Cd and aesthetics. Heated windscreen reducing heated nozzle justification.' },
};

const TRANSMISSION_CONTEXT_MAP = {
  'automatic-gearbox': { levers: ['ZF 8HP fleet-rate licence rebate at >80K/yr: €180-320/gearbox saving by joining shared-sourcing programme (benchmark: BMW G-series vs JLR Defender tier)','Delete ATF water-cooled HEX on non-PHEV variants: replace air-cooled pan cooler, save €35-55/unit (Toyota LC300 GX vs GR-S spec)','Commonise ZF 8HP valve body / TCM software across 8-speed and 9-speed: €25-40 saving + €80-200K NRE (BMW 3/5-Series shared valve body)','Al composite sump + delete dedicated gearbox undershield: €5-12 net saving + 0.9 kg mass (Ford Ranger Raptor)','Switch to ZF Lifeguard 8 open-spec ATF: €1.50-3.50/fill, fleet service saving (BMW ATF 6 HP open-spec verified)'], trends: 'ZF 8HP-e 48V integrated MHEV eliminating separate BSG. Predictive AWD disconnect using ADAS navigation preview. Lifetime ATF fill targeting 200K km (JLR, Toyota LC300 direction). ZF 8HP universal across luxury segment (BMW, JLR, Maserati, Dodge).' },
  'transfer-case':     { levers: ['BorgWarner 4480 → eDTC electronic disconnect on road-spec variants: €55-85 BOM saving + WLTP fuel economy +0.4-0.8 l/100km (BMW ATC-700, Porsche PTM)','Delete 2-speed TC on road-biased LWB spec; add rear eTorque vectoring diff: net €55-100 saving + 14 kg (Bentayga S, Cullinan — no 2-speed TC)','Al TC housing with integrated oil gallery: delete external pump, save €22-38/unit + 2.8-3.5 kg (GKN ePT Al HPDC housing verified)','Integrate TC ECU into DPTCM: delete standalone module, save €45-70 (Land Rover Terrain Response 2 DPTCM architecture)','Shared ATF cooling circuit with 8HP: delete TC cooler, save €15-28/vehicle (Porsche Cayenne, BMW X5 shared ATF HEM)'], trends: 'eDTC predictive disconnect replacing viscous full-time AWD. Terrain Response AI integration via DPTCM. 2-speed TC deletion on road-biased luxury variants. eAxle replacing rear propshaft + TC output shaft on PHEV.' },
  'half-shafts':       { levers: ['Front CV: tripod plunge + fixed Rzeppa replacing 6-ball Rzeppa at high articulation: warranty -30% (GKN UF CVJ+TJ, G-Class W464, Porsche Cayenne)','Common rear inner tripod housing diesel/petrol: 2 P/Ns → 1, €18-45K tooling saving (VW Touareg, BMW X5 G05 AW tripod)','Hytrel 5556 thermoplastic boot replacing EPDM rubber: €2.50-4/boot; cold-climate warranty -€35-55/vehicle (GKN Arctic Kit, BMW xDrive cold spec)','One-piece induction-hardened stem spline replacing insert: €6-10/shaft saving + 180g mass (GKN AW15 LC300 rear, Defender Heritage verified)','Hollow friction-welded rear shaft: 1.2-1.8 kg mass saving, improved Terrain Response responsiveness (Porsche Macan EV, BMW M hollow shafts)'], trends: 'Hollow propshaft sections standard on BEV eAxle. CF propshaft mainstream luxury segment >30K/yr. Hytrel boot universal adoption cold-climate. Sealed lifetime-lubed CV joints growing on commercial/fleet Defender.' },
  'propshafts':        { levers: ['CF one-piece propshaft (GKN CarboFlex) replacing steel two-piece + centre bearing: €45-75 saving + 4.5-6.5 kg (Cayenne Turbo GT, BMW X5 M, G-Class AMG 63)','PU centre bearing isolator replacing NR rubber: life 150K→250K km; warranty saving €28-50/vehicle (GKN PU bearing Defender 110 2023 update)','Phased yoke front propshaft: common across SWB/LWB, €350-600K NRE saving (Ford Ranger/Everest SWB/LWB common)','GKN SDS sealed lifetime U-joints: delete grease nipples, fleet saving €25-40/event (Defender 130 Commercial, LC300 Commercial 2022)','Friction-welded tube/yoke replacing bolted flange: €4-8/shaft + 45→12 sec cycle time (Dana SPL250, Ford Ranger T6)'], trends: 'CF propshaft approaching cost parity >20K/yr. GKN CarboFlex automated filament winding at 4 min cycle. Sealed SDS lifetime U-joints growing for commercial and Nordic fleet. eAxle eliminating rear propshaft on PHEV luxury SUV.' },
  'differentials':     { levers: ['eLSD replacing Torsen T2R front diff on PHEV: €25-45 BOM saving + front TVC function (BMW xDrive eTVC X5M, Porsche PTV+, Land Rover L460 SV)','Single 3.73 rear ratio across petrol V6/V8/diesel I6: €120-250K tooling saving (BMW X5 single ratio + TCU comp, LC300 3.909 single ratio)','Delete mechanical rear diff lock on road spec: brake-based eLSD via DPTCM, €95-145 saving (Porsche PDCC, BMW X7 electronic TVD, Rolls-Royce Shadow Drive)','Al A380 HPDC diff housing replacing GJS cast iron: €18-32 uplift recovered by downstream savings + 6.2 kg unsprung mass saving (BMW M3/M4 G-body, Defender Sport Al housing 2020)','Common rear diff carrier across D-ratio/eLSD variants: €380-650K tooling NRE saving (JLR D7x Defender/Discovery, Ford 9.75\" Dana Defender/Ranger carrier)'], trends: 'Active TVD replacing eLSD on performance luxury SUV (BMW M TVD, Lexus LX600 e-KDSS). Al HPDC diff housing standard premium segment. Software-defined diff lock via DPTCM replacing mechanical actuator. In-wheel motor next-gen BEV eliminating diff entirely (Rivian R1S quad-motor confirmed).' },
};

const EDU_KEYWORDS = {
  'stator-winding':  ['stator winding','winding','hairpin','bar winding','coil'],
  'stator-core':     ['stator core','lamination','electrical steel','no steel'],
  'rotor-magnets':   ['rotor magnet','magnet','ndfeb','rare earth','eesm','ipm rotor'],
  'rotor-shaft':     ['rotor shaft','rotor','shaft','rotor assembly'],
  'motor-bearings':  ['motor bearing','bearing','seal','edm current'],
  'motor-housing':   ['motor housing','e-motor housing','stator housing'],
  'power-module':    ['power module','sic mosfet','igbt','sic module','inverter module','silicon carbide'],
  'gate-driver':     ['gate driver','gate drive','pcb','inverter control','inverter pcb'],
  'dc-link-cap':     ['dc-link cap','dc link cap','dc link capacitor','film capacitor','dc bus capacitor'],
  'busbar':          ['busbar','bus bar','interconnect','hv busbar'],
  'inverter-cooling':['inverter cooling','cold plate','inverter thermal','heat sink'],
  'gears':           ['gear train','gear','helical gear','planetary gear','reduction gear'],
  'gearbox-housing': ['gearbox housing','gear housing','transmission housing'],
  'park-lock':       ['park lock','park pawl'],
  'differential':    ['differential','diff','output shaft','half shaft'],
  'thermal-cooling': ['thermal management','cooling circuit','oil cooling','thermal system'],
  'lubrication':     ['lubrication','oil system','atf','gear oil'],
  'hv-interface':    ['hv interface','hv harness','hv cable','hv connector','high voltage cable'],
  'position-sensor': ['position sensor','resolver','encoder','rotor position','current sensor'],
  'integration':     ['edu integration','e-axle integration','3-in-1','3in1','integrated drive'],
};

const BIW_KEYWORDS = {
  'crash-structure': ['crash rail','front rail','crash can','deformation box','bumper beam','front end module','front crash','longitudinal member','front side rail'],
  'pillars':         ['a-pillar','b-pillar','c-pillar','d-pillar','pillar','windscreen pillar','hinge pillar','quarter pillar','a pillar','b pillar','c pillar'],
  'sill-floor':      ['sill','rocker','floor pan','floor panel','tunnel','crossmember','floor structure','underbody','inner sill','outer sill','floor cross'],
  'closures':        ['door outer','door inner','door skin','hood','bonnet','tailgate','liftgate','closure','boot lid','door panel','door assembly'],
  'roof-structure':  ['roof','roof bow','roof rail','roof panel','panoramic','headliner rail','roof structure','roof skin'],
  'rear-structure':  ['rear rail','rear end','rear floor','rear bumper','rear longitudinal','rear underbody','spare wheel recess','rear wheelhouse'],
  'reinforcements':  ['reinforcement','nvh','acoustic pad','structural foam','seam sealer','crash sensor bracket','body sealer'],
};

const CHASSIS_KEYWORDS = {
  'front-suspension': ['front suspension','mcpherson','strut tower','double wishbone','front shock','upper control arm','lower control arm','front spring','front knuckle','front coil'],
  'rear-suspension':  ['rear suspension','multi-link','trailing arm','rear shock','rear spring','twist beam','ctba','rear knuckle','rear lateral link','rear damper'],
  'steering':         ['steering','eps','epas','rack and pinion','steering rack','steering column','tie rod','power steering','steer by wire'],
  'braking':          ['brake disc','caliper','brake rotor','epb','parking brake','brake pad','brake booster','brake-by-wire','braking system'],
  'subframe':         ['subframe','cradle','auxiliary frame','front cradle','rear cradle','engine mount subframe','powertrain mount','suspension cradle'],
  'wheel-end':        ['wheel hub','wheel bearing','hub unit','hbu','abs ring','tone ring','arb link','stabiliser link','hub carrier'],
};

const BATTERY_KEYWORDS = {
  'battery-cells':   ['battery cell','cell chemistry','nmc','lfp','nca','lithium cell','pouch cell','prismatic cell','cylindrical cell','4680','21700','cell cost','cell format'],
  'battery-module':  ['battery module','cell module','module frame','cell-to-pack','ctp module','module assembly','module housing'],
  'bms':             ['battery management','bms','cell monitoring','state of charge','soc','soh','bms ecu','wbms','wireless bms'],
  'battery-thermal': ['battery cooling','thermal management battery','cooling plate','btms','thermal interface','battery thermal','battery hvac','tim material'],
  'pack-housing':    ['pack housing','battery enclosure','battery tray','battery cover','battery structure','cell-to-body','ctb','battery case'],
  'hv-electrical':   ['battery busbar','battery hv cable','bdu','battery disconnect','battery harness','pyro fuse','hv connector battery','pack electrical'],
};

const ICE_KEYWORDS = {
  'engine-assembly': ['engine assembly','cylinder block','cylinder head','crankshaft','piston','camshaft','valvetrain','timing chain','vvt','engine mount','head gasket','combustion'],
  'exhaust-system':  ['exhaust manifold','catalyst','gpf','dpf','scr','muffler','tailpipe','silencer','adblue','aftertreatment','emission control','exhaust system'],
  'turbo-system':    ['turbocharger','turbo','intercooler','charge air','wastegate','boost','vgt','blow-off','supercharger','forced induction','compressor housing'],
  'fuel-system':     ['fuel tank','fuel pump','fuel rail','injector','gdi','hpfp','fuel line','fuel system','fuel pressure','injection'],
  'engine-cooling':  ['radiator','coolant pump','thermostat','coolant hose','expansion tank','engine cooling','oil cooler cooling','cooling system'],
};

const HVAC_KEYWORDS = {
  'hvac-core':          ['hvac housing','evaporator','heater core','blower motor','blend flap','cabin filter','hvac core','air distribution','hvac unit'],
  'refrigerant-circuit':['ac compressor','a/c compressor','condenser','refrigerant','txv','exv','expansion valve','receiver dryer','heat pump','refrigerant chiller','ac lines','r1234yf'],
  'battery-thermal':    ['battery cooling','cooling plate','tim','thermal interface','btms','battery thermal','single fluid','atf cooling','direct refrigerant','phase change','battery temperature'],
};

const INTERIOR_KEYWORDS = {
  'instrument-panel': ['instrument panel','dashboard','ip substrate','cross-car beam','ccb','digital cluster','centre display','hud','head-up display','steering wheel','passenger airbag','hvac vent'],
  'seats':            ['seat frame','seat track','seat foam','seat trim','seat heating','seat ventilation','seat massage','rear seat','isofix','lumbar','seat system'],
  'door-trim':        ['door trim','door carrier','door armrest','door switch','speaker grille','ambient light strip','door pull','door map pocket'],
  'centre-console':   ['centre console','console armrest','gear selector','wireless charger','usb hub','usb socket','console structure'],
};

const EXTERIOR_KEYWORDS = {
  'bumpers':       ['bumper','fascia','energy absorber','bumper beam','underbody spoiler','front fascia','rear fascia'],
  'lighting':      ['headlight','tail lamp','drl','daytime running','led headlight','matrix led','fog lamp','ambient exterior','headlight ecu'],
  'glass-glazing': ['windscreen','side glass','rear screen','panoramic glass','pano glass','sunroof','glazing','acoustic glass'],
  'wipers-washers':['wiper','washer','rain sensor','wiper blade','wiper mechanism','washer pump','jet nozzle'],
};

const EDU_SYSTEM_KEYWORDS   = ['edu','electric drive unit','e-drive','e-axle','bev','mhev','powertrain bev','electric machine','inverter','e-motor'];
const BIW_SYSTEM_KEYWORDS   = ['biw','body-in-white','body in white','biy','door','pillar','sill','floor pan','bonnet','liftgate','roof bow'];
const CHASSIS_SYSTEM_KEYWORDS = ['chassis','suspension','steering','braking system','subframe','anti-roll bar','hub bearing'];
const BATTERY_SYSTEM_KEYWORDS = ['battery pack','bev battery','phev battery','battery cell','bms','battery thermal','pack housing','hv electrical battery'];
const ICE_SYSTEM_KEYWORDS   = ['powertrain-ice','engine assembly','exhaust system','turbocharger','fuel system','engine cooling','cylinder block','cylinder head','crankshaft','camshaft','intake manifold','fuel injector','catalytic converter','gpf','dpf','scr'];
const HVAC_SYSTEM_KEYWORDS  = ['hvac','thermal & hvac','air conditioning','heat pump','refrigerant circuit','evaporator','heater core','blower motor','ac compressor','condenser','battery thermal management','cooling plate','tim material'];
const INTERIOR_SYSTEM_KEYWORDS = ['interior systems','instrument panel','dashboard','cross-car beam','seat systems','door trim','centre console','headliner','digital cluster','centre display','airbag module','seat foam','seat frame'];
const EXTERIOR_SYSTEM_KEYWORDS = ['exterior systems','bumper system','front bumper','rear bumper','headlight unit','tail lamp','lighting system','wing mirror','windscreen','panoramic glass','wiper system','sunroof mechanism','daytime running'];
const TRANSMISSION_SYSTEM_KEYWORDS = ['transmission','driveline','transfer case','half shaft','propshaft','prop shaft','differential','gearbox','zf 8hp','automatic transmission','awd','4wd','4x4','torque vectoring','torsen','elsd','ediff','e-diff','cv joint','half-shaft','driveshaft','drive shaft','terrain response','terrain management','transfer box','centre bearing','axle shaft'];

const TRANSMISSION_KEYWORDS = {
  'automatic-gearbox': ['automatic gearbox','automatic transmission','zf 8hp','8hp','hydra-matic','10l90','gearbox','atf','torque converter','valve body','tcm','tcу','8-speed','9-speed','shift map'],
  'transfer-case':     ['transfer case','transfer box','transfer','4wd','4x4','hi-lo','terrain response','borg warner','bw4480','edtc','atc-700','atc-500','ptm'],
  'half-shafts':       ['half shaft','half-shaft','axle shaft','cv joint','rzeppa','tripod joint','outboard joint','inner joint','outer joint','plunge joint','boot','grease','spline'],
  'propshafts':        ['propshaft','prop shaft','propeller shaft','driveshaft','drive shaft','centre bearing','u-joint','universal joint','cardan','cf shaft','carbon fibre shaft','carboFlex','yoke','friction weld'],
  'differentials':     ['differential','diff','torsen','elsd','e-lsd','ediff','e-diff','locking diff','rear diff','front diff','final drive','ring gear','pinion','diff lock','tvd','torque vectoring diff'],
};

function detectTransmissionComponent(systemName, subassemblyName, partName) {
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  for (const [compId, keywords] of Object.entries(TRANSMISSION_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return compId;
  }
  return 'automatic-gearbox';
}

function detectEduComponent(systemName, subassemblyName, partName) {
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  if (!EDU_SYSTEM_KEYWORDS.some(k => haystack.includes(k))) return null;
  for (const [compId, keywords] of Object.entries(EDU_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return compId;
  }
  return 'integration';
}

function detectContextDomain(config, systemName, subassemblyName, partName) {
  const systemId = (config?.systemId || '').toLowerCase();
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  if (systemId === 'battery-pack' || BATTERY_SYSTEM_KEYWORDS.some(k => haystack.includes(k))) return 'battery';
  if (systemId === 'biw'          || BIW_SYSTEM_KEYWORDS.some(k => haystack.includes(k)))     return 'biw';
  if (systemId === 'chassis'      || CHASSIS_SYSTEM_KEYWORDS.some(k => haystack.includes(k))) return 'chassis';
  if (systemId === 'transmission' || TRANSMISSION_SYSTEM_KEYWORDS.some(k => haystack.includes(k))) return 'transmission';
  if (systemId === 'powertrain-ice' || ICE_SYSTEM_KEYWORDS.some(k => haystack.includes(k)))   return 'ice';
  if (systemId === 'hvac'         || HVAC_SYSTEM_KEYWORDS.some(k => haystack.includes(k)))    return 'hvac';
  if (systemId === 'interior'     || INTERIOR_SYSTEM_KEYWORDS.some(k => haystack.includes(k))) return 'interior';
  if (systemId === 'exterior'     || EXTERIOR_SYSTEM_KEYWORDS.some(k => haystack.includes(k))) return 'exterior';
  if (EDU_SYSTEM_KEYWORDS.some(k => haystack.includes(k))) return 'edu';
  return null;
}

function detectIceComponent(systemName, subassemblyName, partName) {
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  for (const [compId, keywords] of Object.entries(ICE_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return compId;
  }
  return 'engine-assembly';
}

function detectHvacComponent(systemName, subassemblyName, partName) {
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  for (const [compId, keywords] of Object.entries(HVAC_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return compId;
  }
  return 'hvac-core';
}

function detectInteriorComponent(systemName, subassemblyName, partName) {
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  for (const [compId, keywords] of Object.entries(INTERIOR_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return compId;
  }
  return 'instrument-panel';
}

function detectExteriorComponent(systemName, subassemblyName, partName) {
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  for (const [compId, keywords] of Object.entries(EXTERIOR_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return compId;
  }
  return 'bumpers';
}

function detectBiwComponent(systemName, subassemblyName, partName) {
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  for (const [compId, keywords] of Object.entries(BIW_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return compId;
  }
  return 'reinforcements';
}

function detectChassisComponent(systemName, subassemblyName, partName) {
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  for (const [compId, keywords] of Object.entries(CHASSIS_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return compId;
  }
  return null;
}

function detectBatteryComponent(systemName, subassemblyName, partName) {
  const haystack = [systemName, subassemblyName, partName].filter(Boolean).join(' ').toLowerCase();
  for (const [compId, keywords] of Object.entries(BATTERY_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return compId;
  }
  return 'battery-cells';
}

// ─── LIVE COMMODITY PRICE CACHE (24hr TTL) ──────────────────────────────────

const PRICE_CACHE_TTL = 24 * 60 * 60 * 1000;
const priceCache = {
  lastRefresh: null,
  data: {
    copper_lme:    { label: 'Copper (LME)',        value: 9200,  unit: '€/t',   context: 'Conductors, busbars, winding wire' },
    aluminium_lme: { label: 'Aluminium (LME)',     value: 2450,  unit: '€/t',   context: 'HPDC casting, extrusions, closures' },
    steel_hrc:     { label: 'Steel HRC (EU)',       value: 580,   unit: '€/t',   context: 'BIW structure, chassis arms' },
    phs_steel:     { label: 'PHS Steel (22MnB5)',   value: 1250,  unit: '€/t',   context: 'Hot-stamped pillars, rails, sills' },
    dp980_steel:   { label: 'DP980 AHSS',           value: 1100,  unit: '€/t',   context: 'Advanced high-strength stampings' },
    ndfeb_magnets: { label: 'NdFeB Magnets',        value: 75,    unit: '€/kg',  context: 'Permanent magnet motors (IPM/SPM)' },
    li_carbonate:  { label: 'Lithium Carbonate',    value: 12,    unit: '€/kg',  context: 'Battery cell cathode active material' },
    nmc_cell:      { label: 'NMC Cell (pack level)',value: 78,    unit: '€/kWh', context: 'BEV battery — NMC811/622 chemistry' },
    lfp_cell:      { label: 'LFP Cell (pack level)',value: 58,    unit: '€/kWh', context: 'BEV battery — LFP/M3P chemistry' },
    sic_module:    { label: 'SiC Power Module',     value: 2.2,   unit: '€/kW',  context: 'Inverter — 1200V class SiC MOSFET' },
    al_hpdc:       { label: 'Al HPDC Alloy (A380)', value: 2600,  unit: '€/t',   context: 'Die-cast housings, knuckles, subframes' },
    pa6_gf30:      { label: 'PA6-GF30',             value: 3.2,   unit: '€/kg',  context: 'Structural nylon brackets, covers' },
  },
};

function extractCommodityPrice(text, commodity) {
  // Remove thousands separators for easier matching
  const t = text.replace(/(\d),(\d{3})/g, '$1$2');
  const patterns = {
    copper_lme:    [/copper[^.]{0,80}([\d.]{4,7})\s*(?:USD|EUR|€|\$)?\s*(?:per\s*)?(?:tonne|ton|\/t\b)/i, /LME copper\D{0,30}([\d.]{4,7})/i],
    aluminium_lme: [/alumini[uo]m[^.]{0,80}([\d.]{3,6})\s*(?:USD|EUR|€|\$)?\s*(?:per\s*)?(?:tonne|ton|\/t\b)/i],
    steel_hrc:     [/hot.?roll[^.]{0,80}([\d.]{3,6})\s*(?:USD|EUR|€|\$)?\s*(?:per\s*)?(?:tonne|ton|\/t\b)/i, /HRC[^.]{0,50}([\d.]{3,6})\s*(?:USD|EUR)?\s*(?:per\s*)?(?:tonne|\/t\b)/i],
    ndfeb_magnets: [/(?:NdFeB|neodymium)[^.]{0,80}([\d.]{2,5})\s*(?:USD|EUR|€|\$)?\s*(?:per\s*)?kg/i],
    li_carbonate:  [/lithium carbonate[^.]{0,80}([\d.]{1,6})\s*(?:USD|EUR|€|\$)?\s*(?:per\s*)?kg/i],
    sic_module:    [/SiC[^.]{0,60}([\d.]{1,4})\s*(?:USD|EUR|€|\$)?\s*(?:per\s*)?(?:W|watt|kW)/i],
  };
  for (const pat of (patterns[commodity] || [])) {
    const m = t.match(pat);
    if (m) {
      const val = parseFloat(m[1]);
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return null;
}

const PRICE_SANITY = {
  copper_lme:    [4000, 18000],
  aluminium_lme: [1200, 6000],
  steel_hrc:     [250,  1500],
  ndfeb_magnets: [30,   200],
  li_carbonate:  [4,    60],
  sic_module:    [0.5,  8],
};

async function refreshPriceCache(braveApiKey) {
  const now = Date.now();
  if (priceCache.lastRefresh && (now - priceCache.lastRefresh) < PRICE_CACHE_TTL) return priceCache.data;

  const searches = [
    'LME copper aluminium price per tonne USD EUR 2025',
    'steel hot rolled coil HRC price per tonne Europe 2025',
    'neodymium NdFeB magnet price per kg 2025',
  ];

  let updatedCount = 0;
  try {
    for (const query of searches) {
      const results = await performSearch(query, braveApiKey).catch(() => []);
      if (!results?.length) continue;
      const text = results.map(r => `${r.title} ${r.snippet}`).join(' ');
      for (const key of Object.keys(priceCache.data)) {
        const extracted = extractCommodityPrice(text, key);
        if (extracted !== null) {
          const [min, max] = PRICE_SANITY[key] || [0, Infinity];
          if (extracted >= min && extracted <= max) {
            priceCache.data[key].value = extracted;
            updatedCount++;
            console.log(`[Prices] Updated ${key}: ${extracted} ${priceCache.data[key].unit}`);
          }
        }
      }
    }
    console.log(`[Prices] Refresh complete — ${updatedCount} prices updated`);
  } catch (e) {
    console.log('[Prices] Web refresh failed, using baseline:', e.message);
  }

  priceCache.lastRefresh = now;
  return priceCache.data;
}

function getPriceString() {
  const p = priceCache.data;
  return `LIVE COMMODITY PRICES (cached ${priceCache.lastRefresh ? new Date(priceCache.lastRefresh).toLocaleDateString() : 'baseline'}): Cu ${p.copper_lme.value} ${p.copper_lme.unit} | Al LME ${p.aluminium_lme.value} ${p.aluminium_lme.unit} | Steel HRC ${p.steel_hrc.value} ${p.steel_hrc.unit} | PHS Steel ${p.phs_steel.value} ${p.phs_steel.unit} | NdFeB ${p.ndfeb_magnets.value} ${p.ndfeb_magnets.unit} | Li Carbonate ${p.li_carbonate.value} ${p.li_carbonate.unit} | NMC cell ${p.nmc_cell.value} ${p.nmc_cell.unit} | LFP cell ${p.lfp_cell.value} ${p.lfp_cell.unit} | SiC module ${p.sic_module.value} ${p.sic_module.unit} | Al HPDC ${p.al_hpdc.value} ${p.al_hpdc.unit}`;
}

const BODY_STYLE_CONTEXT = {
  hatchback:  'B/C-segment hatchback: weight ≤1400 kg target, cost-first brief. CTBA rear suspension viable. Smaller B-pillars, 3/5-door short-roof. Pedestrian head-impact critical for bonnet design. NCAP 5-star at moderate investment.',
  sedan:      'Sedan 3-box body: long-roof formal C-pillar, boot torsion-box critical for torsional rigidity. No D-pillar — roof load carried to C-pillar + rear header. Door seal complexity lower than SUV. Boot aperture sealing and NVH critical.',
  suv:        'SUV/4x4: high CG, tall pillars, large closures, D-pillar present, heavy roof structure for rollover compliance (FMVSS216 5× vehicle weight). Side sill integrates battery protection on BEV. Panoramic roof common — structural bow constraint.',
  coupe:      'Coupé/fastback: lower roofline, raked A-pillar, frameless doors (high seal cost), wide door openings (long intrusion beam), stiff sill for handling. B-pillar slim for NCAP MDB side test — critical design driver. High-load hinges needed.',
  pickup:     'Pickup truck: body-on-frame (traditional) or unibody (Maverick/Ridgeline). High tow/payload → heavy frame rails + reinforced rear longitudinal. Bed design: corrosion-resistant liner. High ground clearance affects suspension packaging.',
  mpv:        'MPV/Minivan: maximum internal volume priority. Sliding rear doors (complex latching mechanism). Flat floor requirement (high pan stiffness). NVH secondary to cost/volume efficiency. High roof height increases aerodynamic drag and NVH.',
  crossover:  'Crossover/CUV: SUV-like appearance on car-based platform. Lower CG than traditional SUV. Shared floor with sedan/hatchback common. Moderate D-pillar. BEV CTP gaining traction on shared platform. Rear visibility compromised by design.',
  universal:  'Multi-body-style analysis — consider performance and packaging constraints for each body style variant in the programme family.',
};

const LABOUR_RATES = {
  germany: '€45-55/hr', uk: '£35-45/hr', czech: '€15-20/hr', spain: '€20-28/hr',
  mexico: '$8-12/hr', usa: '$40-55/hr', china: '¥70-130/hr (~€10-18)', india: '₹800-1200/hr (~€9-14)', korea: '₩35,000-45,000/hr (~€25-32)',
};

function getRegulatorContext(config) {
  const region = config?.plantRegion || '';
  const vehicleType = (config?.vehicleType || '').toLowerCase();
  const systemId = (config?.systemId || '').toLowerCase();
  const lines = [];

  // EU / UK regulations
  if (['germany','uk','czech','spain'].includes(region) || !region) {
    lines.push('EU7 (2026 LD): stricter NOx/PN limits, GPF mandatory all petrol, eCAT cold-start requirement. Brake dust BDPF filter mandatory 2027 (4 mg/km PN limit).');
    lines.push('NCAP 2026: AEB night/VRU, ESS (Emergency Steering Support), driver monitoring DMS mandatory for 5-star. Advanced lighting ADB gives +1.5 star bonus in Assisted Driving score.');
    lines.push('REACH/SVHC: Restrict cadmium, hexavalent chromium in coatings. EU ELV 2025 revision: 25% recycled content target, PCB ban in plastics.');
    lines.push('EU Battery Regulation 2025: Passport requirement for BEV/PHEV batteries. Recycled content targets (16% Co, 6% Li, 6% Ni by 2031). Carbon footprint declaration mandatory 2024.');
    if (['biw','closures','door','pillar','sill','crash'].some(k => systemId.includes(k))) {
      lines.push('ECE R94 / R95 frontal/lateral passive safety: critical for BIW pillar, door, sill sizing. NCAP MPDB (Mobile Progressive Deformable Barrier) 2023 raised energy management requirements.');
    }
  }

  // CAFE / North America
  if (['usa','mexico'].includes(region)) {
    lines.push('CAFE 2032: 58 mpg combined fleet average — drives lightweight content cost-justification ($2-4/lb weight saving rule-of-thumb).');
    lines.push('FMVSS 216 roof crush: 5× vehicle weight (≥22.24 kN) — primary SUV/pickup roof structure design driver.');
    lines.push('IRA (Inflation Reduction Act): BEV/PHEV tax credits require ≥50% North American content for battery, ≥40% critical minerals from FTA partners by 2026.');
    lines.push('NHTSA NCAP 5-star: AEB, LKAS standard from 2026 MY. Rear-seat reminder and camera-monitor standard from 2026.');
  }

  // China
  if (region === 'china') {
    lines.push('China 7 Emission Standard (2025): equivalent to EU6d-temp, targets NOx 35 mg/km. Mandatory OBD diagnostics on all emissions-related components.');
    lines.push('MIIT NEV Mandate: BEV/PHEV targets require OEMs to meet dual-credit scoring — VAVE on BEV content directly supports dual-credit point economics.');
    lines.push('GB/T fast charge standard: CCS/GBT compatibility. 800V architecture upgrade requirements for new BEV platform approvals 2025+.');
  }

  // India
  if (region === 'india') {
    lines.push('Bharat Stage VI Phase 2 (2023+): RDE (Real Driving Emissions) mandatory, OBD-IIA required. GPF optional for petrol RDE compliance.');
    lines.push('AIS-140 mandatory telematics for commercial. CMVR safety: AEB mandatory from 2023 for M1 vehicles >3.5t. Side airbag mandate from Oct 2023.');
    lines.push('PLI Scheme (Production-Linked Incentive): BEV battery manufacturing incentives — localisation of battery cells and pack components receives 18-26% production incentive.');
  }

  // Korea
  if (region === 'korea') {
    lines.push('Korea Emission Standard K-Euro6d: aligned with EU6d. RDE block required from 2024 MY. GPF requirement for petrol from 2025.');
    lines.push('Korea EV subsidy: national + regional incentives driving BEV volume; battery domestic content requirements gaining.');
  }

  return lines.length > 0 ? `\nREGULATORY CONTEXT (${region || 'EU default'} / ${config?.vehicleType || 'passenger car'}):\n${lines.map(l => `  • ${l}`).join('\n')}` : '';
}

function buildAnalysisPrompt(config, systemName, subassemblyName, partName, enableSearch, cadGeometry) {
  const scope = partName ? `Part: **${partName}** (within ${subassemblyName}, System: ${systemName})` : `Subassembly: **${subassemblyName}** (System: ${systemName})`;
  let cadLine = config.cadFileName ? `\nCAD file: ${config.cadFileName} (${config.cadFileType}).` : '';
  if (cadGeometry && !cadGeometry.isImage) {
    const bb = cadGeometry.boundingBox;
    const vol = cadGeometry.estimatedVolume;
    const sa = cadGeometry.estimatedSurfaceArea;
    const fc = cadGeometry.featureCounts || {};
    const parts = [`${cadGeometry.fileName} (${(cadGeometry.fileType || 'CAD').toUpperCase()})`];
    if (bb) parts.push(`bbox: ${bb.x}×${bb.y}×${bb.z} mm`);
    if (vol) parts.push(`vol: ${vol.toFixed(1)} cm³`);
    if (sa) parts.push(`SA: ${sa.toFixed(0)} cm²`);
    const feats = Object.entries(fc).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(' ');
    if (feats) parts.push(`features: ${feats}`);
    if (cadGeometry.extractedMaterial) parts.push(`material callout: ${cadGeometry.extractedMaterial}`);
    if (cadGeometry.productName) parts.push(`part name: ${cadGeometry.productName}`);
    cadLine = `\nCAD GEOMETRY (parsed client-side): ${parts.join(' | ')} — use to contextualise material mass, process type, tooling complexity, and feature reduction opportunities.`;
  }
  const searchInstruction = enableSearch ? `\nIMPORTANT: Use web_search NOW for: (1) current material costs, (2) recent 2024–2025 innovations, (3) OEM/Tier-1 benchmarks. Do 3–5 searches before generating ideas.` : '';

  const volume = config.annualVolume || 80000;
  const currency = config.currency || 'EUR';
  const currencySymbol = { EUR: '€', GBP: '£', USD: '$', CNY: '¥' }[currency] || '€';
  const programmeYears = config.programmeLengthYears || 5;
  const labourRate = config.plantRegion ? LABOUR_RATES[config.plantRegion] || '€45-55/hr' : '€45-55/hr (default Western Europe)';
  const regionLine = `Plant region: ${config.plantRegion || 'unspecified — default Western Europe'} | Labour rate: ${labourRate} | Annual volume: ${volume.toLocaleString()} units/yr | Programme: ${programmeYears} years | Currency: ${currency}`;
  const bodyStyleLine = config.bodyStyle && BODY_STYLE_CONTEXT[config.bodyStyle] ? `\nBody style: ${config.bodyStyle.toUpperCase()} — ${BODY_STYLE_CONTEXT[config.bodyStyle]}` : '';

  // Multi-domain curated context injection (all 8 domains)
  const domain = detectContextDomain(config, systemName, subassemblyName, partName);
  let curatedContext = '';

  if (domain === 'edu') {
    const compId = detectEduComponent(systemName, subassemblyName, partName);
    if (compId && EDU_CONTEXT_MAP[compId]) {
      const ctx = EDU_CONTEXT_MAP[compId];
      curatedContext = `\nCURATED EDU KNOWLEDGE BASE — use these validated levers as grounding:\n${ctx.levers.map((l, i) => `  ${i+1}. ${l}`).join('\n')}\nTrend context: ${ctx.trends}\n800V note: phase current halves → smaller conductors/caps. SiC raises switching freq → smaller magnetics. Heat/kW drops ~30%.`;
    }
  } else if (domain === 'biw') {
    const compId = detectBiwComponent(systemName, subassemblyName, partName);
    const ctx = BIW_CONTEXT_MAP[compId] || BIW_CONTEXT_MAP['reinforcements'];
    if (ctx) {
      curatedContext = `\nCURATED BIW KNOWLEDGE BASE — use these validated levers as grounding:\n${ctx.levers.map((l, i) => `  ${i+1}. ${l}`).join('\n')}\nTrend context: ${ctx.trends}\nBIW benchmarks: HSLA ${currencySymbol}700-850/t | DP980 ${currencySymbol}950-1,200/t | PHS 22MnB5 ${currencySymbol}1,100-1,400/t | Al sheet ${currencySymbol}2,800-3,200/t | Al HPDC ${currencySymbol}2,400-2,800/t | CFRP ${currencySymbol}20-35/kg`;
    }
  } else if (domain === 'chassis') {
    const compId = detectChassisComponent(systemName, subassemblyName, partName);
    if (compId && CHASSIS_CONTEXT_MAP[compId]) {
      const ctx = CHASSIS_CONTEXT_MAP[compId];
      curatedContext = `\nCURATED CHASSIS KNOWLEDGE BASE — use these validated levers as grounding:\n${ctx.levers.map((l, i) => `  ${i+1}. ${l}`).join('\n')}\nTrend context: ${ctx.trends}\nChassis benchmarks: Al HPDC subframe ${currencySymbol}180-280/unit | Forged Al arm ${currencySymbol}35-65 | CDC damper ${currencySymbol}85-140 | Gen-3 HBU ${currencySymbol}55-80`;
    }
  } else if (domain === 'battery') {
    const compId = detectBatteryComponent(systemName, subassemblyName, partName);
    if (compId && BATTERY_CONTEXT_MAP[compId]) {
      const ctx = BATTERY_CONTEXT_MAP[compId];
      curatedContext = `\nCURATED BATTERY KNOWLEDGE BASE — use these validated levers as grounding:\n${ctx.levers.map((l, i) => `  ${i+1}. ${l}`).join('\n')}\nTrend context: ${ctx.trends}\nBattery benchmarks: NMC cell ${currencySymbol}65-90/kWh | LFP cell ${currencySymbol}50-70/kWh | Cu busbar ${currencySymbol}8,500-10,000/t | Al busbar ${currencySymbol}2,400-2,800/t`;
    }
  } else if (domain === 'ice') {
    const compId = detectIceComponent(systemName, subassemblyName, partName);
    if (compId && ICE_CONTEXT_MAP[compId]) {
      const ctx = ICE_CONTEXT_MAP[compId];
      curatedContext = `\nCURATED POWERTRAIN-ICE KNOWLEDGE BASE — use these validated levers as grounding:\n${ctx.levers.map((l, i) => `  ${i+1}. ${l}`).join('\n')}\nTrend context: ${ctx.trends}\nICE benchmarks: Al block (A319) ${currencySymbol}2,400-2,800/t | Forged steel crank ${currencySymbol}120-180/unit | PGM Pd ~${currencySymbol}30/g, Rh ~${currencySymbol}200/g | TWC substrate ${currencySymbol}15-25/unit | VGT turbo ${currencySymbol}280-450/unit`;
    }
  } else if (domain === 'hvac') {
    const compId = detectHvacComponent(systemName, subassemblyName, partName);
    if (compId && HVAC_CONTEXT_MAP[compId]) {
      const ctx = HVAC_CONTEXT_MAP[compId];
      curatedContext = `\nCURATED HVAC KNOWLEDGE BASE — use these validated levers as grounding:\n${ctx.levers.map((l, i) => `  ${i+1}. ${l}`).join('\n')}\nTrend context: ${ctx.trends}\nHVAC benchmarks: Electric scroll compressor ${currencySymbol}180-280/unit | EXV ${currencySymbol}35-55 | MPE condenser ${currencySymbol}65-95 | BLDC blower ${currencySymbol}45-70 | PTC heater ${currencySymbol}35-60`;
    }
  } else if (domain === 'interior') {
    const compId = detectInteriorComponent(systemName, subassemblyName, partName);
    if (compId && INTERIOR_CONTEXT_MAP[compId]) {
      const ctx = INTERIOR_CONTEXT_MAP[compId];
      curatedContext = `\nCURATED INTERIOR KNOWLEDGE BASE — use these validated levers as grounding:\n${ctx.levers.map((l, i) => `  ${i+1}. ${l}`).join('\n')}\nTrend context: ${ctx.trends}\nInterior benchmarks: Mg CCB ${currencySymbol}85-140/unit | PP-LGF CCB ${currencySymbol}45-80/unit | Digital cluster ${currencySymbol}180-280/unit | Al seat frame ${currencySymbol}65-110/seat | Heated glass ${currencySymbol}35-55 premium`;
    }
  } else if (domain === 'exterior') {
    const compId = detectExteriorComponent(systemName, subassemblyName, partName);
    if (compId && EXTERIOR_CONTEXT_MAP[compId]) {
      const ctx = EXTERIOR_CONTEXT_MAP[compId];
      curatedContext = `\nCURATED EXTERIOR KNOWLEDGE BASE — use these validated levers as grounding:\n${ctx.levers.map((l, i) => `  ${i+1}. ${l}`).join('\n')}\nTrend context: ${ctx.trends}\nExterior benchmarks: Matrix ADB headlight ${currencySymbol}220-380/unit | Al bumper beam extrusion ${currencySymbol}35-65/unit | EPP foam absorber ${currencySymbol}12-22 | Acoustic PVB windscreen ${currencySymbol}180-250 | Electrochromic glass ${currencySymbol}95-140 premium`;
    }
  } else if (domain === 'transmission') {
    const compId = detectTransmissionComponent(systemName, subassemblyName, partName);
    if (compId && TRANSMISSION_CONTEXT_MAP[compId]) {
      const ctx = TRANSMISSION_CONTEXT_MAP[compId];
      curatedContext = `\nCURATED TRANSMISSION & DRIVELINE KNOWLEDGE BASE — Luxury Off-Road SUV segment (Defender, Range Rover, Range Rover Sport vs G-Class W464, BMW X5/X7 G-series, Porsche Cayenne 9Y0, Toyota LC300, Lexus LX600, Bentayga W12, Cullinan RR):\n${ctx.levers.map((l, i) => `  ${i+1}. ${l}`).join('\n')}\nTrend context: ${ctx.trends}\nKey benchmarks: ZF 8HP70/95 fleet rate ${currencySymbol}680-980/unit | GKN CarboFlex CF propshaft ${currencySymbol}120-140 | Al A380 HPDC diff housing ${currencySymbol}85-120 | eDTC BorgWarner ${currencySymbol}220-280 | BorgWarner 4480 TC ${currencySymbol}380-450`;
    }
  }

  const livePrices = getPriceString();
  const regulatoryContext = getRegulatorContext(config);

  return `Generate ALL expert-level cost reduction ideas available for:
Vehicle: ${config.vehicleType} | ${scope}${config.additionalContext ? ` | Context: ${config.additionalContext}` : ''}
${regionLine}${bodyStyleLine}${cadLine}${searchInstruction}

${livePrices}
${curatedContext}
${regulatoryContext}

IMPORTANT: Use the actual volume (${volume.toLocaleString()} units/yr) and currency (${currency}) in all annual savings calculations.

Each idea JSON object must have EXACTLY these fields:
{"id":"slug","title":"≤12 words","technicalDescription":"180-220 words, specific grades/processes/benchmarks","manufacturingImpact":"90-130 words","costSavingTypes":["material|process|logistics|complexity|warranty|tooling|weight|commonisation"],"costSavingPotential":{"qualitative":"High/Medium/Low — reason","percentage":"e.g. 10-18%","annualValue":"e.g. ${currencySymbol}350K–${currencySymbol}650K at ${volume.toLocaleString()} units/yr","calculationBasis":"brief calc logic"},"implementationDifficulty":"Low|Medium|High","riskNotes":"70-90 words on NCAP/NVH/durability/regulatory risks + mitigations","dfmaPrinciples":["3-6 principles"],"systemLevel":"Assembly|Subassembly|Part","timeToImplement":"e.g. 6-12 months","benchmarkReference":"specific OEM/supplier example","searchDataUsed":true|false,"confidenceLevel":"verified|benchmarked|estimated|theoretical","regulatoryContext":"1 sentence on relevant regulatory driver or compliance benefit if applicable, else JSON null (not the string null)","evidenceSources":[{"type":"oem_press_release|teardown|patent|industry_report|supplier_data|web_search|regulatory","title":"short source name","year":2024,"confidence":"high|medium|low"}]}

CONFIDENCE GUIDE: verified=OEM confirmed in production | benchmarked=teardown/study data confirms | estimated=cost-model based | theoretical=first-principles analysis.
EVIDENCE SOURCES: List 1-3 real evidence sources per idea (OEM teardowns, patents, press releases, industry reports). Be specific — name the OEM/supplier and year.
Cover EVERY viable lever — material substitution, process optimisation, design changes, commonisation, logistics, warranty, tooling amortisation, and emerging technology. Do not stop at 8 — generate all ideas that a Chief Engineer would seriously consider. Include a spread of Low/Medium/High difficulty, at least 1 commonisation idea, and at least 1 emerging-technology idea. Return ONLY the JSON array — no markdown, no preamble.`;
}

const webSearchTool = {
  name: 'web_search',
  description: 'Search internet for real-time data: material commodity prices, OEM design benchmarks, manufacturing technology innovations, supplier capabilities, regulatory updates.',
  input_schema: { type: 'object', properties: { query: { type: 'string' }, purpose: { type: 'string', enum: ['material_cost', 'technology_benchmark', 'oem_practice', 'supplier_capability', 'regulatory'] } }, required: ['query', 'purpose'] },
};

async function performSearch(query, braveApiKey) {
  if (braveApiKey?.trim()) {
    try {
      const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': braveApiKey.trim() },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return (data.web?.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.description || '', source: new URL(r.url).hostname.replace('www.', '') }));
      }
    } catch {}
  }
  try {
    const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`, { headers: { 'User-Agent': 'BrainSpark/2.1' }, signal: AbortSignal.timeout(8000) });
    const data = await resp.json();
    const results = [];
    if (data.Abstract) results.push({ title: data.Heading || query, url: data.AbstractURL || '', snippet: data.Abstract, source: data.AbstractSource || 'Wikipedia' });
    if (data.Answer) results.push({ title: 'Quick Answer', url: '', snippet: data.Answer, source: 'DuckDuckGo' });
    for (const t of (data.RelatedTopics || []).slice(0, 4)) {
      if (t.Text && t.FirstURL) results.push({ title: t.Text.split(' - ')[0]?.slice(0, 80) || '', url: t.FirstURL, snippet: t.Text?.slice(0, 300) || '', source: new URL(t.FirstURL).hostname.replace('www.', '') });
    }
    return results.filter(r => r.snippet).slice(0, 5);
  } catch {
    return [{ title: query, url: '', snippet: 'Search unavailable — using trained knowledge.', source: 'fallback' }];
  }
}

// ─── CAD-TO-COST ENDPOINT ────────────────────────────────────────────────────

const CAD_COST_SYSTEM_PROMPT = `You are a Senior Cost Engineer and DFMA specialist with 20+ years experience in automotive Tier-1 manufacturing. You analyse CAD geometry data and engineering drawings to produce expert-level component cost estimates and DFM recommendations. You quote specific OEM/Tier-1 benchmarks and real material prices. You return ONLY valid JSON — no preamble.`;

function buildCadCostPrompt(geometry, config, livePrices) {
  const currency = config.currency || 'EUR';
  const currencySymbol = { EUR: '€', GBP: '£', USD: '$', CNY: '¥' }[currency] || '€';
  const volume = config.annualVolume || 50000;
  const region = config.plantRegion || 'germany';
  const labourRate = LABOUR_RATES[region] || '€45-55/hr';

  let geometrySection = '';

  if (geometry.isImage) {
    geometrySection = `The user has uploaded an engineering drawing/CAD screenshot. Analyse the image carefully to:
1. Read dimensions from the title block and dimension lines
2. Count features: holes (circle/arc callouts), ribs, pockets, threads (M-spec), bends, draft angles
3. Identify the material specification from the title block or material callout
4. Identify the manufacturing process from the geometry (casting, stamping, machining, moulding, etc.)
5. Estimate complexity level based on tolerances, surface finish specs, and feature count`;
  } else {
    const bb = geometry.boundingBox;
    const vol = geometry.estimatedVolume;
    const sa = geometry.estimatedSurfaceArea;
    const fc = geometry.featureCounts || {};
    geometrySection = `Extracted CAD geometry data:
• File: ${geometry.fileName} (${geometry.fileType.toUpperCase()}, ${(geometry.fileSize / 1024).toFixed(1)} KB)
• Bounding box: ${bb ? `${bb.x} × ${bb.y} × ${bb.z} mm` : 'not extracted'}
• Estimated volume: ${vol ? `${vol.toFixed(2)} cm³` : 'not extracted'}
• Estimated surface area: ${sa ? `${sa.toFixed(1)} cm²` : 'not extracted'}
• Feature counts: ${Object.entries(fc).map(([k, v]) => `${k}: ${v}`).join(' | ') || 'none extracted'}
${geometry.extractedDimensions?.length ? `• Extracted dimensions: ${geometry.extractedDimensions.slice(0, 10).join(', ')}` : ''}
${geometry.extractedMaterial ? `• Material from drawing: ${geometry.extractedMaterial}` : ''}
${geometry.productName ? `• Product name: ${geometry.productName}` : ''}
${geometry.extractedText?.length ? `• Drawing notes: ${geometry.extractedText.slice(0, 8).join(' | ')}` : ''}
${config.materialSpec ? `• User-specified material: ${config.materialSpec}` : ''}
${config.processSpec ? `• User-specified process: ${config.processSpec}` : ''}`;
  }

  return `Analyse this automotive component and generate a complete cost estimate + DFMA report.

${geometrySection}

Commercial parameters:
• Annual volume: ${volume.toLocaleString()} units/yr | Plant region: ${region} | Labour: ${labourRate}
• Currency: ${currency} | Programme: ${config.programmeLengthYears || 5} years

${livePrices}

Return a single JSON object with EXACTLY this structure:
{
  "partName": "inferred part name (≤8 words)",
  "inferredMaterial": "specific grade e.g. EN-AW-A380 HPDC aluminium or DP780 AHSS",
  "inferredProcess": "primary manufacturing process e.g. HPDC / progressive die stamp / CNC mill",
  "complexity": "Low|Medium|High",
  "massEstimateKg": number_or_null,
  "dfmaScore": number_1_to_10,
  "dfmaScoreRationale": "2-3 sentences explaining the score based on feature count, tolerances, material choice",
  "costBreakdown": {
    "material": { "value": number, "currency": "${currency}", "basis": "brief calc: mass × density × price/kg" },
    "process": { "value": number, "currency": "${currency}", "basis": "cycle time × labour rate + machine burden" },
    "tooling": { "value": number, "currency": "${currency}", "basis": "amortised tooling at ${volume.toLocaleString()} units/yr" },
    "overhead": { "value": number, "currency": "${currency}", "basis": "overhead + profit margin" },
    "totalUnit": { "value": number, "currency": "${currency}" }
  },
  "annualSpend": { "value": number, "currency": "${currency}" },
  "confidence": "verified|benchmarked|estimated|theoretical",
  "benchmarkReference": "specific OEM/Tier-1 comparable part and its published cost",
  "recommendations": [
    {
      "id": "slug",
      "title": "≤10 word action",
      "category": "material|process|design|commonisation",
      "difficulty": "Low|Medium|High",
      "saving": "e.g. ${currencySymbol}2.50/unit (~8%)",
      "annualSaving": "e.g. ${currencySymbol}125K at ${volume.toLocaleString()} units/yr",
      "description": "60-90 words: specific grades/processes/benchmarks, why this saving is achievable"
    }
  ],
  "topRisks": ["3-5 risk bullet points (tolerance, tooling, regulatory, NVH)"]
}

Provide 5 recommendations ordered by annual saving potential (highest first). DFMA score 10 = perfect design, 1 = highly complex. Return ONLY JSON.`;
}

app.post('/api/cad-analyze', requireAuth, async (req, res) => {
  const { geometry, config, apiKey } = req.body;
  if (!apiKey?.trim()) return res.status(400).json({ error: 'Anthropic API key required.' });
  if (!geometry) return res.status(400).json({ error: 'No CAD geometry data provided.' });

  await refreshPriceCache(null).catch(() => {});
  const livePrices = getPriceString();

  const client = new Anthropic({ apiKey: apiKey.trim() });
  const prompt = buildCadCostPrompt(geometry, config || {}, livePrices);

  try {
    let messages;

    if (geometry.isImage && geometry.base64Data) {
      // Use Claude Vision for drawing images
      const mediaType = geometry.mimeType === 'application/pdf' ? 'image/jpeg' : (geometry.mimeType || 'image/png');
      // Claude Vision supports image/* types; PDF pages need to be sent as images
      messages = [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: geometry.base64Data },
          },
          { type: 'text', text: prompt },
        ],
      }];
    } else {
      messages = [{ role: 'user', content: prompt }];
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      system: CAD_COST_SYSTEM_PROMPT,
      messages,
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock) throw new Error('No response from AI.');
    let raw = textBlock.text.trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd <= jsonStart) throw new Error('Invalid JSON response from AI.');

    const result = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    return res.json(result);
  } catch (err) {
    console.error('[CAD Analyze Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Commodity prices endpoint
app.get('/api/prices', async (req, res) => {
  const prices = await refreshPriceCache(null);
  res.json({
    prices,
    lastRefresh: priceCache.lastRefresh ? new Date(priceCache.lastRefresh).toISOString() : null,
    nextRefresh: priceCache.lastRefresh ? new Date(priceCache.lastRefresh + PRICE_CACHE_TTL).toISOString() : null,
    cacheAgeMinutes: priceCache.lastRefresh ? Math.round((Date.now() - priceCache.lastRefresh) / 60000) : null,
  });
});

function sanitize(s, maxLen = 500) {
  if (typeof s !== 'string') return '';
  return s.replace(/[<>'"]/g, '').trim().slice(0, maxLen);
}

const ANALYZE_TIMEOUT_MS = 120_000;

function autoSaveProject(userId, projectId, systemName, subassemblyName, partName, config, ideas, sources) {
  try {
    const now = new Date().toISOString();
    const summary = {
      totalIdeas: ideas.length,
      quickWins: ideas.filter(i => i.implementationDifficulty === 'Low').length,
      strategicItems: ideas.filter(i => i.implementationDifficulty === 'High').length,
      searchesPerformed: sources.length,
    };
    const safeConfig = { ...config, apiKey: '[redacted]' };
    db.prepare(`INSERT OR REPLACE INTO projects
      (id, userId, systemName, subassemblyName, partName, vehicleType, config, ideas, sources, summary, generatedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      projectId, userId, systemName, subassemblyName, partName || '', config.vehicleType || '',
      JSON.stringify(safeConfig), JSON.stringify(ideas), JSON.stringify(sources),
      JSON.stringify(summary), now, now, now,
    );
  } catch (err) {
    console.error('[autoSaveProject]', err.message);
  }
}

app.post('/api/analyze', requireAuth, async (req, res) => {
  const { config, systemName, subassemblyName, partName, enableSearch, searchApiKey, cadGeometry } = req.body;
  if (!config?.apiKey?.trim()) return res.status(400).json({ error: 'Anthropic API key is required.' });

  const sysName = sanitize(systemName, 120);
  const subName = sanitize(subassemblyName, 120);
  const prtName = sanitize(partName, 120);
  if (config.additionalContext) config.additionalContext = sanitize(config.additionalContext, 1000);

  const useSSE = (req.headers['accept'] || '').includes('text/event-stream');
  if (useSSE) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  function emit(data) {
    if (useSSE) res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  refreshPriceCache(searchApiKey).catch(() => {});

  // Check cache (only when search is disabled — search results are time-sensitive)
  if (!enableSearch && !cadGeometry) {
    const cacheKey = buildCacheKey(config, sysName, subName, prtName);
    const cached = analysisCache(cacheKey);
    if (cached) {
      emit({ type: 'connecting', message: 'Loading cached analysis…' });
      emit({ type: 'synthesizing', message: 'Restoring from cache…' });
      const projectId = crypto.randomUUID();
      autoSaveProject(req.user.id, projectId, sysName, subName, prtName, config, cached.ideas, cached.sources);
      emit({ type: 'complete', ideas: cached.ideas, sources: cached.sources, projectId, cached: true });
      res.end();
      return;
    }
  }

  const client = new Anthropic({ apiKey: config.apiKey });
  const messages = [{ role: 'user', content: buildAnalysisPrompt(config, sysName, subName, prtName, enableSearch, cadGeometry) }];
  const sources = [];

  emit({ type: 'connecting', message: 'Connecting to AI chief engineer...' });

  const deadline = Date.now() + ANALYZE_TIMEOUT_MS;

  try {
    for (let i = 0; i < 8; i++) {
      if (Date.now() > deadline) throw new Error('Analysis timed out after 2 minutes. Please try again with web search disabled.');
      const params = { model: 'claude-opus-4-8', max_tokens: 20000, system: CHIEF_ENGINEER_PROMPT, messages };
      if (enableSearch) { params.tools = [webSearchTool]; params.tool_choice = { type: 'auto' }; }

      const response = await client.messages.create(params);

      if (response.stop_reason === 'tool_use') {
        const toolResults = [];
        for (const block of response.content.filter(b => b.type === 'tool_use')) {
          emit({ type: 'searching', query: block.input.query, purpose: block.input.purpose, searchNumber: sources.length + 1 });
          const results = await performSearch(block.input.query, searchApiKey);
          sources.push({ query: block.input.query, purpose: block.input.purpose, results, timestamp: new Date().toISOString() });
          emit({ type: 'search_done', searchNumber: sources.length, resultCount: results.length, query: block.input.query });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ query: block.input.query, results }) });
          console.log(`[Search] ${block.input.purpose}: "${block.input.query}"`);
        }
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
      } else {
        emit({ type: 'synthesizing', message: `Synthesising all available cost-reduction ideas${sources.length > 0 ? ` (${sources.length} searches complete)` : ''}...` });
        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock) throw new Error('No text response from AI.');
        let raw = textBlock.text.trim();
        if (raw.startsWith('```')) raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
        const jsonStart = raw.indexOf('[');
        const jsonEnd = raw.lastIndexOf(']');
        if (jsonStart !== -1 && jsonEnd > jsonStart) raw = raw.slice(jsonStart, jsonEnd + 1);
        const ideas = JSON.parse(raw);

        // Auto-save project to DB
        const projectId = crypto.randomUUID();
        autoSaveProject(req.user.id, projectId, sysName, subName, prtName, config, ideas, sources);

        // Cache when search was disabled (results are deterministic)
        if (!enableSearch && !cadGeometry) {
          const cacheKey = buildCacheKey(config, sysName, subName, prtName);
          setAnalysisCache(cacheKey, ideas, sources);
        }

        if (useSSE) {
          emit({ type: 'complete', ideas, sources, projectId });
          res.end();
        } else {
          return res.json({ ideas, sources, projectId });
        }
        return;
      }
    }
    throw new Error('Max search iterations reached — try disabling web search.');
  } catch (err) {
    console.error('[Analysis Error]', err.message);
    if (useSSE) { emit({ type: 'error', message: err.message }); res.end(); }
    else res.status(500).json({ error: err.message });
  }
});

// ─── AI CHAT ROUTE ────────────────────────────────────────────────────────────

app.post('/api/chat', requireAuth, async (req, res) => {
  const { apiKey, ideas, config, systemName, subassemblyName, history, message } = req.body;
  if (!apiKey?.trim()) return res.status(400).json({ error: 'API key required.' });
  if (!message?.trim()) return res.status(400).json({ error: 'Message required.' });

  const safeMsg = sanitize(message, 2000);
  const scope = `${subassemblyName} (${systemName})`;
  const volume = config?.annualVolume || 80000;
  const currency = config?.currency || 'EUR';
  const currencySymbol = { EUR: '€', GBP: '£', USD: '$', CNY: '¥' }[currency] || '€';

  const ideasContext = (ideas || []).map((idea, i) => [
    `Idea ${i + 1}: "${idea.title}"`,
    `  Technical: ${String(idea.technicalDescription || '').slice(0, 220)}`,
    `  Savings: ${idea.costSavingPotential?.annualValue || 'N/A'} | Difficulty: ${idea.implementationDifficulty} | Timeline: ${idea.timeToImplement}`,
    `  Types: ${(idea.costSavingTypes || []).join(', ')} | Confidence: ${idea.confidenceLevel || 'N/A'}`,
    `  Risk: ${String(idea.riskNotes || '').slice(0, 130)}`,
  ].join('\n')).join('\n\n');

  const systemPrompt = `You are the same Chief Engineer AI who generated this VAVE analysis — 30+ years of automotive cost engineering experience. You are now in a live Q&A session with the engineering team, helping them interpret, prioritise, and act on these results.

ANALYSIS CONTEXT:
Target: ${scope} | Vehicle: ${config?.vehicleType || 'Automotive'} | Volume: ${volume.toLocaleString()} units/yr | Region: ${config?.plantRegion || 'Western Europe'} | Currency: ${currency}

GENERATED IDEAS (${(ideas || []).length} total):
${ideasContext}

RULES:
• Reference ideas by number ("Idea 3") or short title when discussing them
• Be specific — quote material grades, process names, OEM examples, costs in ${currencySymbol} where relevant
• When asked to prioritise, use the savings/difficulty/timeline data from the ideas above
• Keep answers concise (150–250 words) unless the user explicitly asks to elaborate
• If asked something beyond the scope of these ideas, say so and offer to redirect`;

  const safeHistory = (history || []).slice(-20).map(m => ({
    role: (m.role === 'user' ? 'user' : 'assistant'),
    content: sanitize(String(m.content || ''), 2000),
  }));

  const useSSE = (req.headers['accept'] || '').includes('text/event-stream');
  if (useSSE) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  try {
    const client = new Anthropic({ apiKey: apiKey.trim() });
    const stream = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [...safeHistory, { role: 'user', content: safeMsg }],
      stream: true,
    });

    if (useSSE) {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'chunk', text: event.delta.text })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } else {
      let text = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          text += event.delta.text;
        }
      }
      res.json({ reply: text });
    }
  } catch (err) {
    console.error('[Chat Error]', err.message);
    if (useSSE) { res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`); res.end(); }
    else res.status(500).json({ error: err.message });
  }
});

// ─── HEALTH & VERSION ─────────────────────────────────────────────────────────

app.get('/api/health', (_, res) => res.json({ status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() }));

// ─── PROJECT CRUD ─────────────────────────────────────────────────────────────

app.post('/api/projects', requireAuth, (req, res) => {
  const { id, systemName, subassemblyName, partName, vehicleType, config, ideas, sources, summary, generatedAt } = req.body;
  if (!ideas || !config) return res.status(400).json({ error: 'ideas and config are required.' });
  const projectId = id || crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT OR REPLACE INTO projects
    (id, userId, systemName, subassemblyName, partName, vehicleType, config, ideas, sources, summary, generatedAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    projectId, req.user.id, systemName || '', subassemblyName || '', partName || '', vehicleType || '',
    JSON.stringify(config), JSON.stringify(ideas), JSON.stringify(sources || []), JSON.stringify(summary || {}),
    generatedAt || now, now, now,
  );
  res.json({ id: projectId });
});

app.get('/api/projects', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT id, systemName, subassemblyName, partName, vehicleType, summary, generatedAt, createdAt FROM projects WHERE userId = ? ORDER BY createdAt DESC LIMIT 50'
  ).all(req.user.id);
  res.json(rows.map(r => ({ ...r, summary: JSON.parse(r.summary) })));
});

app.get('/api/projects/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Project not found.' });
  res.json({
    ...row,
    config: JSON.parse(row.config),
    ideas: JSON.parse(row.ideas),
    sources: JSON.parse(row.sources),
    summary: JSON.parse(row.summary),
  });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ? AND userId = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ─── TEAM SHARING ─────────────────────────────────────────────────────────────

app.post('/api/projects/:id/share', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id FROM projects WHERE id = ? AND userId = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Project not found.' });
  const { expiryDays = 30 } = req.body;
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO share_tokens (token, projectId, createdBy, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(token, req.params.id, req.user.id, expiresAt, new Date().toISOString());
  res.json({ token, shareUrl: `/shared/${token}`, expiresAt });
});

app.get('/api/shared/:token', (req, res) => {
  const shareRow = db.prepare('SELECT * FROM share_tokens WHERE token = ?').get(req.params.token);
  if (!shareRow) return res.status(404).json({ error: 'Share link not found or expired.' });
  if (shareRow.expiresAt && Date.now() > new Date(shareRow.expiresAt).getTime()) {
    return res.status(410).json({ error: 'This share link has expired.' });
  }
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(shareRow.projectId);
  if (!project) return res.status(404).json({ error: 'Project no longer exists.' });
  res.json({
    ...project,
    config: JSON.parse(project.config),
    ideas: JSON.parse(project.ideas),
    sources: JSON.parse(project.sources),
    summary: JSON.parse(project.summary),
    sharedBy: shareRow.createdBy,
    expiresAt: shareRow.expiresAt,
  });
});

// ─── ADMIN SEED ──────────────────────────────────────────────────────────────

const ADMIN_EMAIL    = 'admin@autocost.ai';
const ADMIN_PASSWORD = 'AutoCost@Admin2025';

async function seedAdminAccount() {
  const users = await readUsers();
  const exists = users.find(u => u.email === ADMIN_EMAIL);
  if (exists) return;
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  users.unshift({
    id: 'admin-00000000-0000-0000-0000-000000000001',
    name: 'Admin — Avinash Bhosale',
    email: ADMIN_EMAIL,
    passwordHash,
    isAdmin: true,
    verified: true,
    createdAt: new Date().toISOString(),
  });
  await writeUsers(users);
  console.log('   Admin account ready: admin@autocost.ai');
}

// ─── PATENT WATCH ─────────────────────────────────────────────────────────────

app.post('/api/patent-watch', rateLimit(20, 60 * 60 * 1000), async (req, res) => {
  const { title, description, apiKey } = req.body;
  if (!title || !apiKey) return res.status(400).json({ error: 'title and apiKey required' });
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are a patent risk analyst for automotive engineering. Analyse this cost reduction idea for potential IP/patent risk:

Title: ${title}
Description: ${description}

Provide a concise patent risk assessment (3-4 sentences) covering:
1. Likelihood of existing patents covering this approach (low/medium/high risk)
2. Key patent holders that may have IP in this space (cite 1-2 specific companies/patent families if known)
3. Recommended freedom-to-operate action
Keep it practical and actionable for an engineering team.`,
      }],
    });
    const analysis = msg.content[0]?.type === 'text' ? msg.content[0].text : 'Analysis unavailable';
    res.json({ analysis });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Patent search failed' });
  }
});

// ─── SHOULD-COST ──────────────────────────────────────────────────────────────

app.post('/api/should-cost', rateLimit(30, 60 * 60 * 1000), async (req, res) => {
  const { partName, material, process, weightKg, annualVolume, quotedCost, region, currency, apiKey } = req.body;
  if (!partName || !material || !process || !weightKg || !annualVolume || !apiKey) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const client = new Anthropic({ apiKey });
    const prompt = `You are an automotive cost engineering expert specialising in should-cost modelling. Build a bottom-up should-cost estimate for this part:

Part: ${partName}
Material: ${material}
Process: ${process}
Part weight: ${weightKg} kg
Annual volume: ${annualVolume.toLocaleString()} units/year
Plant region: ${region}
Currency: ${currency}
${quotedCost ? `Supplier quoted cost: ${currency} ${quotedCost} per unit` : ''}

Return ONLY a JSON object with these exact fields (no markdown):
{
  "materialCost": "${currency} X.XX",
  "processCost": "${currency} X.XX",
  "overheadCost": "${currency} X.XX",
  "totalShouldCost": "${currency} X.XX",
  ${quotedCost ? '"gapVsQuote": "±X.XX (X%)",' : ''}
  "explanation": "2-3 sentence explanation of the breakdown",
  "assumptions": ["assumption 1", "assumption 2", "assumption 3"],
  "negotiationLeverage": "1-2 sentences on negotiation strategy based on the gap"
}`;
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}';
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(clean);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Calculation failed' });
  }
});

// ─── WEBHOOK TEST ─────────────────────────────────────────────────────────────

app.post('/api/webhooks/test', requireAuth, async (req, res) => {
  const { url, type } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const payload = type === 'teams'
      ? { '@type': 'MessageCard', '@context': 'https://schema.org/extensions', summary: 'BrainSpark Test', text: '✅ BrainSpark webhook connected successfully!' }
      : { text: '✅ BrainSpark webhook connected successfully!' };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CAD Diff Analysis ───────────────────────────────────────────────────────
app.post('/api/cad-diff', rateLimit(15, 60 * 60 * 1000), async (req, res) => {
  const { designA, designB, apiKey } = req.body;
  if (!designA || !designB || !apiKey) return res.status(400).json({ error: 'designA, designB, and apiKey required' });
  try {
    const client = new Anthropic({ apiKey });
    const prompt = `You are an automotive DFMA expert. Two design revisions are described. Identify key geometric, process, and material differences then generate cost reduction ideas driven by those deltas.

DESIGN A (Current): ${designA}
DESIGN B (Proposed): ${designB}

Return a JSON array of 4-6 ideas. Each: {"title":"...","delta":"...","saving":"...","difficulty":"Low|Medium|High","action":"..."}
Return ONLY the JSON array with no markdown fences.`;
    const msg = await client.messages.create({
      model: 'claude-opus-4-8', max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '[]';
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    res.json({ ideas: JSON.parse(clean) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Analysis failed' });
  }
});

// ─── Cross-Pollination ────────────────────────────────────────────────────────
app.post('/api/projects/:id/cross-pollinate', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  try {
    const target = db.prepare('SELECT * FROM projects WHERE id = ? AND userId = ?').get(id, userId);
    if (!target) return res.status(404).json({ error: 'Project not found' });
    const targetIdeas = JSON.parse(target.ideas);
    const targetNorms = targetIdeas.map(i => i.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim());
    const others = db.prepare('SELECT * FROM projects WHERE userId = ? AND id != ? ORDER BY createdAt DESC LIMIT 10').all(userId, id);
    const crossIdeas = [];
    for (const other of others) {
      const otherIdeas = JSON.parse(other.ideas);
      for (const idea of otherIdeas) {
        const norm = idea.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
        const normWords = norm.split(' ').filter(w => w.length > 4);
        const already = targetNorms.some(tn => {
          const tnWords = new Set(tn.split(' ').filter(w => w.length > 4));
          const overlap = normWords.filter(w => tnWords.has(w)).length;
          return overlap >= 2 && overlap / Math.max(normWords.length, tnWords.size) > 0.4;
        });
        if (!already) {
          crossIdeas.push({ ...idea, sourceProject: `${other.systemName} — ${other.subassemblyName}`, crossPollinated: true });
        }
      }
    }
    res.json({ ideas: crossIdeas.slice(0, 5), sourceCount: others.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`\n⚡ BrainSpark Server v${APP_VERSION}`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Email mode: ${process.env.EMAIL_USER ? `SMTP (${process.env.EMAIL_USER})` : 'DEV (OTP shown on screen)'}`);
  console.log(`   Users file: ${USERS_FILE}`);
  await seedAdminAccount();
  console.log();
});
