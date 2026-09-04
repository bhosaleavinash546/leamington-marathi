#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// DEPLOYMENT PREFLIGHT — prove the deployment is complete before users find out.
//
// This codebase's governing rule is that a system says what it cannot do rather
// than failing quietly. A deployment can violate that rule in ways the app
// itself cannot: Python missing so every CAD route dies at the first STEP file;
// no volume mounted so the database evaporates on the next deploy; SMTP unset
// so one-time passcodes print to the log where anyone with log access can read
// them and take over an account.
//
// None of those stop the server booting. All of them are discovered later, by
// someone who trusted the tool.
//
// So this runs INSIDE the deployed container and refuses to pass on any of them.
// Three outcomes per check, the same trichotomy the DFM engine uses:
//
//   PASS   verified working
//   FAIL   required for the feature set, and broken
//   NOTE   optional and absent — stated, never silently defaulted
//
// Usage:
//   node scripts/preflight.mjs              full check, exit 1 on any FAIL
//   node scripts/preflight.mjs --url URL    also probe a running instance
//   node scripts/preflight.mjs --json       machine-readable, for a deploy gate
// ─────────────────────────────────────────────────────────────────────────────
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? null : process.argv[i + 1]; };
const JSON_OUT = process.argv.includes('--json');

const results = [];
const pass = (area, name, detail) => results.push({ area, name, status: 'PASS', detail });
const fail = (area, name, detail, fix) => results.push({ area, name, status: 'FAIL', detail, fix });
const note = (area, name, detail) => results.push({ area, name, status: 'NOTE', detail });

// ── Runtime ─────────────────────────────────────────────────────────────────
{
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 22) pass('runtime', 'Node version', `v${process.versions.node}`);
  else fail('runtime', 'Node version', `v${process.versions.node}, CI builds and tests on 22`,
    'Use the node:22-bookworm-slim base image.');
}

// ── The native module. A glibc mismatch between build and runtime shows up
//    here as a loader error, not as a subtle bug later. ────────────────────────
try {
  const { default: Database } = await import('better-sqlite3');
  const probe = new Database(':memory:');
  probe.exec('CREATE TABLE t (a INTEGER); INSERT INTO t VALUES (1)');
  const got = probe.prepare('SELECT a FROM t').get()?.a;
  probe.close();
  if (got === 1) pass('runtime', 'better-sqlite3 native module', 'loads and executes SQL');
  else fail('runtime', 'better-sqlite3 native module', 'loaded but returned the wrong result', 'Rebuild the image.');
} catch (e) {
  fail('runtime', 'better-sqlite3 native module', String(e?.message || e).slice(0, 160),
    'The compiled binary does not match this platform. Build and run on the SAME base (node:22-bookworm → node:22-bookworm-slim); do not mix Alpine and Debian.');
}

// ── The geometry layer. This is the check that matters most for a "nothing
//    missing" deployment, because the app boots perfectly without it. ─────────
let occtOk = false;
try {
  const { stdout } = await execFileAsync('python3', ['-c', 'import sys; print(sys.version.split()[0])'], { timeout: 20_000 });
  pass('geometry', 'python3', stdout.trim());
  try {
    const probe = 'import OCP.gp, OCP.STEPControl, OCP.STEPCAFControl, OCP.BRepMesh, OCP.XCAFDoc; import OCP; print(getattr(OCP, "__version__", "ok"))';
    const { stdout: v } = await execFileAsync('python3', ['-c', probe], { timeout: 60_000 });
    occtOk = true;
    pass('geometry', 'OpenCascade (cadquery-ocp)', `every module the engines import resolves — ${v.trim()}`);
  } catch (e) {
    fail('geometry', 'OpenCascade (cadquery-ocp)', String(e?.stderr || e?.message || e).split('\n')[0].slice(0, 180),
      "pip install 'cadquery-ocp>=7.7,<7.9' AND the system libraries it links: libgl1 libx11-6 libxrender1 libexpat1 zlib1g. A missing libGL surfaces here as an ImportError, not as a graphics problem.");
  }
} catch (e) {
  fail('geometry', 'python3', 'not on PATH',
    'Without it, DFM Studio, DFA, assembly decomposition and every geometry-driven Prism dossier fail at the first uploaded part — while the rest of the app looks perfectly healthy.');
}

// ── Prove the engines actually run, not just that the import resolves. ───────
if (occtOk) {
  try {
    const py = `
import sys, json, tempfile, os
sys.path.insert(0, ${JSON.stringify(join(ROOT, 'cad-engine'))})
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.STEPControl import STEPControl_Writer, STEPControl_StepModelType
box = BRepPrimAPI_MakeBox(40.0, 25.0, 12.0).Shape()
p = os.path.join(tempfile.gettempdir(), 'preflight_box.step')
w = STEPControl_Writer(); w.Transfer(box, STEPControl_StepModelType.STEPControl_AsIs); w.Write(p)
import dfm_geometry, feature_recognition
print(json.dumps({'wrote': os.path.getsize(p) > 0, 'modules': True}))
os.remove(p)
`;
    const { stdout } = await execFileAsync('python3', ['-c', py], { timeout: 120_000, maxBuffer: 16 << 20 });
    const r = JSON.parse(stdout.trim().split('\n').pop());
    if (r.wrote && r.modules) pass('geometry', 'end-to-end kernel test', 'built a solid, wrote STEP, imported the DFM and feature-recognition engines');
    else fail('geometry', 'end-to-end kernel test', 'kernel loaded but the round trip failed', 'Check the cad-engine/ directory shipped into the image.');
  } catch (e) {
    fail('geometry', 'end-to-end kernel test', String(e?.stderr || e?.message || e).split('\n').slice(-2).join(' ').slice(0, 200),
      'OCP imports but cannot model or write STEP. Usually a partial wheel install or a missing system library.');
  }
}

// ── Secrets. These are the ones that decide whether the deployment is SAFE. ──
{
  const prod = process.env.NODE_ENV === 'production';
  const DEV_SECRET = 'autocost-ai-dev-secret-2025';
  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt === DEV_SECRET) {
    fail('secrets', 'JWT_SECRET', 'unset or still the shipped development value',
      'The fallback is in source control, so anyone can forge any token including an admin one. The server already refuses to boot on this in production — do not work around it. Generate: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"');
  } else if (jwt.length < 32) {
    fail('secrets', 'JWT_SECRET', `set but only ${jwt.length} characters`, 'Use at least 32 bytes of entropy.');
  } else pass('secrets', 'JWT_SECRET', `set, ${jwt.length} characters`);

  if (!process.env.CREDENTIALS_SECRET) {
    (prod ? fail : note)('secrets', 'CREDENTIALS_SECRET',
      'unset — users\' stored Anthropic keys are encrypted with JWT_SECRET instead',
      'Set it separately, or rotating the JWT secret makes every stored API key undecryptable.');
  } else pass('secrets', 'CREDENTIALS_SECRET', 'set independently of JWT_SECRET');

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    (prod ? fail : note)('secrets', 'SMTP credentials',
      'unset — one-time passcodes are PRINTED TO THE SERVER LOG instead of emailed',
      'This is a development affordance and an account-takeover hole the moment the app is reachable. Set EMAIL_USER and EMAIL_PASS.');
  } else pass('secrets', 'SMTP credentials', `configured (${process.env.EMAIL_USER})`);

  // THE ADMIN-BOOTSTRAP TRAP. ADMIN_EMAILS blocks public signup for those
  // addresses so an admin identity cannot be self-registered — correct. But
  // the ONLY way an admin comes to exist is ADMIN_EMAIL + ADMIN_PASSWORD
  // seeding one on an empty database. Set the first without the second on a
  // fresh deployment and no administrator can ever be created: the address is
  // blocked from signing up and nothing seeds it. The rate-library admin page
  // is then unreachable by anyone, forever, with no error anywhere.
  const adminList = (process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (adminList.length && !(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD)) {
    const dataDir = process.env.DATA_DIR || join(ROOT, 'data');
    let hasDb = false;
    try { hasDb = statSync(join(dataDir, 'brainspark.db')).size > 0; } catch { /* first boot */ }
    (hasDb ? note : fail)('secrets', 'admin bootstrap',
      `ADMIN_EMAILS names ${adminList.length} address${adminList.length === 1 ? '' : 'es'} but ADMIN_EMAIL/ADMIN_PASSWORD are unset — ${hasDb ? 'fine if an admin already exists in this database' : 'on this EMPTY database no admin can ever be created'}`,
      'Those addresses are blocked from public signup, and only ADMIN_EMAIL + ADMIN_PASSWORD seeds one. Set both for the first boot, then remove them.');
  } else if (adminList.length) pass('secrets', 'admin bootstrap', `${adminList.length} admin address(es), and a seed account is configured for first boot`);
  else note('secrets', 'admin bootstrap', 'ADMIN_EMAILS unset — no administrator; the rate-library admin page will be unreachable');

  if (!process.env.BRAVE_API_KEY) {
    note('secrets', 'BRAVE_API_KEY', 'unset — commodity prices stay on the built-in reference baseline and the homepage labels them "Reference", never "Live"; Horizon research reports "no live search". Deliberate if so; a surprise otherwise.');
  } else pass('secrets', 'BRAVE_API_KEY', 'set — daily commodity refresh and Horizon live search enabled');

  if (!process.env.ANTHROPIC_API_KEY) {
    note('secrets', 'ANTHROPIC_API_KEY',
      'unset — every LLM feature requires each user to add their own key in Settings. Deliberate for BYOK; a broken deployment otherwise.');
  } else pass('secrets', 'ANTHROPIC_API_KEY', 'set server-side');
}

// ── Persistence. A missing volume is invisible until the first redeploy. ─────
{
  const dataDir = process.env.DATA_DIR || join(ROOT, 'data');
  try {
    mkdirSync(dataDir, { recursive: true });
    const probe = join(dataDir, `.preflight-${process.pid}`);
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
    pass('persistence', 'DATA_DIR writable', dataDir);

    let dbBytes = 0;
    try { dbBytes = statSync(join(dataDir, 'brainspark.db')).size; } catch { /* first boot */ }
    if (dbBytes > 0) pass('persistence', 'database present', `${(dbBytes / 1e6).toFixed(1)} MB at ${join(dataDir, 'brainspark.db')}`);
    else note('persistence', 'database', 'not created yet — expected on a first boot; the marketplace seeds ~1,600 ideas on startup');

    // The check that actually catches the mistake: is DATA_DIR inside the
    // image, where a redeploy discards it, or on a mount that survives?
    if (dataDir.startsWith(ROOT)) {
      fail('persistence', 'DATA_DIR location', `${dataDir} is INSIDE the application directory`,
        'Every redeploy would silently start from an empty database — the marketplace would re-seed and every user, quote and calibration row would be gone. Mount a volume and point DATA_DIR at it (the image defaults to /data).');
    } else pass('persistence', 'DATA_DIR location', 'outside the application directory — survives a redeploy if a volume is mounted there');
  } catch (e) {
    fail('persistence', 'DATA_DIR writable', String(e?.message || e).slice(0, 160),
      'The container user cannot write to DATA_DIR. Check volume ownership (the image runs as `node`).');
  }
}

// ── Knowledge pack. Stale here means the ideation prompt silently disagrees
//    with what the Trends pages show. ──────────────────────────────────────────
try {
  const pack = JSON.parse(readFileSync(join(ROOT, 'kb-pack.json'), 'utf8'));
  const domains = Object.keys(pack.domains || {}).length;
  const levers = pack?.coverage?.levers ?? 0;
  if (domains >= 10 && levers > 100) pass('content', 'knowledge pack', `${domains} domains, ${levers} levers, curated as of ${pack.knowledgeAsOf ?? 'UNKNOWN'}`);
  else fail('content', 'knowledge pack', `only ${domains} domains / ${levers} levers`, 'Run npm run kb:export during the image build.');
} catch (e) {
  fail('content', 'knowledge pack', 'kb-pack.json missing or unreadable',
    'Generation falls back to the abbreviated inline maps and loses the deep curated levers. Run npm run kb:export in the build.');
}

// ── The built front end. ────────────────────────────────────────────────────
try {
  const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
  if (/<script[^>]+src=/.test(html)) pass('content', 'built front end', 'dist/index.html present with bundled assets');
  else fail('content', 'built front end', 'dist/index.html has no script tags', 'Re-run npm run build.');
} catch {
  fail('content', 'built front end', 'dist/ is missing',
    'server.mjs serves the SPA from dist/ — without it users get an API with no interface. Run npm run build in the image.');
}

// ── Things the browser fetches from OUTSIDE this server. ───────────────────
// Stated rather than tested: the container cannot see the user's network. The
// only external runtime dependency the built front end has is Google Fonts;
// behind a firewall it fails silently and Inter falls back to the system sans.
// Layout holds. Self-host the face if the fallback is unacceptable on stage.
note('content', 'external fonts', 'dist/index.html loads Inter from fonts.googleapis.com — a blocked network falls back to system-ui with no error');

// ── Outbound reachability, only when asked to probe a live instance. ─────────
const url = arg('--url');
if (url) {
  try {
    const res = await fetch(new URL('/api/health', url), { signal: AbortSignal.timeout(15_000) });
    const body = await res.json();
    if (res.ok && body.status === 'ok') pass('live', 'health endpoint', `${url} → ${body.version ?? 'ok'}`);
    else fail('live', 'health endpoint', `HTTP ${res.status}`, 'The process is up but not healthy.');
  } catch (e) {
    fail('live', 'health endpoint', String(e?.message || e).slice(0, 140), 'The instance is not reachable at that URL.');
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const failed = results.filter(r => r.status === 'FAIL');
const notes = results.filter(r => r.status === 'NOTE');

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: failed.length === 0, checked: results.length, failed: failed.length, notes: notes.length, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

const ICON = { PASS: '✓', FAIL: '✗', NOTE: '·' };
let area = '';
console.log('\n  BrainSpark deployment preflight\n  ' + '─'.repeat(66));
for (const r of results) {
  if (r.area !== area) { area = r.area; console.log(`\n  ${area.toUpperCase()}`); }
  console.log(`    ${ICON[r.status]} ${r.name.padEnd(30)} ${r.detail}`);
  if (r.fix) console.log(`      → ${r.fix}`);
}
console.log('\n  ' + '─'.repeat(66));
if (failed.length) {
  console.log(`  ${failed.length} of ${results.length} checks FAILED — this deployment is not complete.\n`);
  process.exit(1);
}
console.log(`  All ${results.length} checks passed${notes.length ? `, with ${notes.length} stated as absent by choice` : ''}.\n`);
