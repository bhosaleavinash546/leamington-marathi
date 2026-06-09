/**
 * AutoCost AI — Backend Server v2.1
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json({ limit: '10mb' }));

const PORT        = process.env.PORT        || 3001;
const JWT_SECRET  = process.env.JWT_SECRET  || 'autocost-ai-dev-secret-2025';
const USERS_FILE  = path.join(__dirname, 'users.json');
const APP_VERSION = '2.1.0';

// ─── User store (JSON file) ──────────────────────────────────────────────────

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

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
      <span style="color:#fff;font-size:20px;font-weight:800">AutoCost <span style="color:#f59e0b">AI</span></span>
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
    <p style="color:#334155;font-size:12px;margin:0">AutoCost AI v${APP_VERSION} · Designed &amp; Created by <strong style="color:#475569">Avinash Bhosale</strong></p>
  </div>
</div>
</body></html>`;
}

async function sendOTPEmail(email, otp, type) {
  const isSignup = type === 'signup';
  const title = isSignup ? 'Verify your AutoCost AI account' : 'Reset your AutoCost AI password';
  const message = isSignup
    ? 'Welcome! Enter the code below in the app to verify your email address and activate your account.'
    : 'Use the code below to reset your AutoCost AI password. If you didn\'t request this, please ignore this email.';

  if (!transporter) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧  OTP for ${email} [${type}]: \x1b[33m${otp}\x1b[0m`);
    console.log('    (Configure EMAIL_USER in .env for real emails)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return;
  }

  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'AutoCost AI'}" <${process.env.EMAIL_USER}>`,
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
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
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

  const users = readUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const otp = storeOTP(email, 'signup');

  // Store pending user (unverified)
  const pendingKey = `pending:${email}`;
  otpStore.set(pendingKey, { name: name.trim(), email: email.toLowerCase(), passwordHash });

  try {
    await sendOTPEmail(email, otp, 'signup');
    res.json({ message: 'OTP sent to your email. Please check your inbox.' });
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

  const users = readUsers();
  if (users.find(u => u.email === email.toLowerCase())) {
    return res.status(409).json({ error: 'Account already exists.' });
  }

  const user = { id: crypto.randomUUID(), name: pending.name, email: pending.email, passwordHash: pending.passwordHash, createdAt: new Date().toISOString(), verified: true };
  users.push(user);
  writeUsers(users);

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// Sign In
app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'No account found with this email. Please sign up.' });
  if (!user.verified) return res.status(401).json({ error: 'Please verify your email before signing in.' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// Forgot Password — step 1: send OTP
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email address is required.' });

  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  // Always return success to prevent email enumeration
  if (user) {
    const otp = storeOTP(email, 'reset');
    try { await sendOTPEmail(email, otp, 'reset'); } catch (err) { console.error('Email error:', err.message); }
  }

  res.json({ message: 'If an account exists with this email, an OTP has been sent.' });
});

// Forgot Password — step 2: verify OTP + set new password
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields are required.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const result = verifyOTP(email, otp, 'reset');
  if (!result.ok) return res.status(400).json({ error: result.reason });

  const users = readUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'Account not found.' });

  users[idx].passwordHash = await bcrypt.hash(newPassword, 10);
  writeUsers(users);

  const token = signToken(users[idx]);
  res.json({ token, user: { id: users[idx].id, name: users[idx].name, email: users[idx].email } });
});

// Resend OTP
app.post('/api/auth/resend-otp', async (req, res) => {
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
app.get('/api/auth/me', requireAuth, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt });
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

OUTPUT FORMAT: Return ONLY valid JSON — a single array of 8 idea objects. No markdown, no preamble.`;

function buildAnalysisPrompt(config, systemName, subassemblyName, partName, enableSearch) {
  const scope = partName ? `Part: **${partName}** (within ${subassemblyName}, System: ${systemName})` : `Subassembly: **${subassemblyName}** (System: ${systemName})`;
  const cadLine = config.cadFileName ? `\nCAD file: ${config.cadFileName} (${config.cadFileType}) — reference typical geometry, feature count, wall thickness.` : '';
  const searchInstruction = enableSearch ? `\nIMPORTANT: Use web_search NOW for: (1) current material costs, (2) recent 2024–2025 innovations, (3) OEM/Tier-1 benchmarks. Do 3–5 searches before generating ideas.` : '';

  return `Generate 8 expert-level cost reduction ideas for: Vehicle: ${config.vehicleType} | ${scope}${config.additionalContext ? ` | Context: ${config.additionalContext}` : ''}${cadLine}${searchInstruction}

Each idea JSON object must have EXACTLY:
{"id":"slug","title":"≤12 words","technicalDescription":"180-220 words, specific grades/processes/benchmarks","manufacturingImpact":"90-130 words","costSavingTypes":["material|process|logistics|complexity|warranty|tooling|weight|commonisation"],"costSavingPotential":{"qualitative":"High/Medium/Low — reason","percentage":"e.g. 10-18%","annualValue":"e.g. €350K–€650K at 80K units/yr","calculationBasis":"brief calc logic"},"implementationDifficulty":"Low|Medium|High","riskNotes":"70-90 words on NCAP/NVH/durability/regulatory risks + mitigations","dfmaPrinciples":["3-6 principles"],"systemLevel":"Assembly|Subassembly|Part","timeToImplement":"e.g. 6-12 months","benchmarkReference":"specific OEM/supplier example","searchDataUsed":true|false}

Mix: ≥2 Low difficulty, 3 Medium, 2 High. Include 1 commonisation + 1 emerging-tech idea. Return ONLY JSON array.`;
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
    const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`, { headers: { 'User-Agent': 'AutoCostAI/2.1' }, signal: AbortSignal.timeout(8000) });
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

app.post('/api/analyze', requireAuth, async (req, res) => {
  const { config, systemName, subassemblyName, partName, enableSearch, searchApiKey } = req.body;
  if (!config?.apiKey?.trim()) return res.status(400).json({ error: 'Anthropic API key is required.' });

  const client = new Anthropic({ apiKey: config.apiKey });
  const messages = [{ role: 'user', content: buildAnalysisPrompt(config, systemName, subassemblyName, partName, enableSearch) }];
  const sources = [];

  try {
    for (let i = 0; i < 8; i++) {
      const params = { model: 'claude-opus-4-8', max_tokens: 12000, system: CHIEF_ENGINEER_PROMPT, messages };
      if (enableSearch) { params.tools = [webSearchTool]; params.tool_choice = { type: 'auto' }; }

      const response = await client.messages.create(params);

      if (response.stop_reason === 'tool_use') {
        const toolResults = [];
        for (const block of response.content.filter(b => b.type === 'tool_use')) {
          const results = await performSearch(block.input.query, searchApiKey);
          sources.push({ query: block.input.query, purpose: block.input.purpose, results, timestamp: new Date().toISOString() });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ query: block.input.query, results }) });
          console.log(`[Search] ${block.input.purpose}: "${block.input.query}"`);
        }
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
      } else {
        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock) throw new Error('No text response from AI.');
        let raw = textBlock.text.trim();
        if (raw.startsWith('```')) raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
        return res.json({ ideas: JSON.parse(raw), sources });
      }
    }
    throw new Error('Max iterations reached.');
  } catch (err) {
    console.error('[Analysis Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── HEALTH & VERSION ─────────────────────────────────────────────────────────

app.get('/api/health', (_, res) => res.json({ status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() }));

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚗 AutoCost AI Server v${APP_VERSION}`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Email mode: ${process.env.EMAIL_USER ? `SMTP (${process.env.EMAIL_USER})` : 'DEV (OTP logged to console)'}`);
  console.log(`   Users file: ${USERS_FILE}\n`);
});
