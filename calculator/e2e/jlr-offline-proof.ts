/**
 * JLR Phase 1 readiness — the offline proof (change 5). Starts the server the way the JLR server runs it (NODE_ENV=production,
 * AIR_GAPPED=1, no AI key, sign-up limited to one domain, its own data folder) and checks the Phase 1 features over HTTP, then a
 * backup → change → restore round trip with the same scripts the server's backup.sh / restore.sh use.
 *
 * Run it with NO NETWORK, so anything that tries to reach the internet fails loudly:
 *   unshare --net sh -c 'python3 <lo-up.py> && npx tsx e2e/jlr-offline-proof.ts <out-dir>'
 * (deploy/jlr/README: the same checks against the built image run in .github/workflows/docker-cad.yml.)
 * Prints PASS / FAIL per check and writes <out-dir>/jlr-offline-proof.json.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] ?? join(tmpdir(), 'jlr-offline-proof'));
mkdirSync(OUT, { recursive: true });
const DATA = mkdtempSync(join(tmpdir(), 'cv-jlr-proof-'));
const PORT = 3460 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${PORT}`;
const results: Array<{ check: string; pass: boolean; detail: string }> = [];
const check = (name: string, pass: boolean, detail = '') => { results.push({ check: name, pass, detail }); console.log(`[jlr] ${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

const env = {
  ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(PORT),
  CV_DATA_DIR: DATA, CV_DRAWING_FILE_DIR: join(DATA, 'drawing-files'), CV_GEOMETRY_FILE_DIR: join(DATA, 'geometry-files'),
  AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', JWT_SECRET: randomBytes(32).toString('hex'),
  ADMIN_EMAILS: 'admin@example.com', CV_SIGNUP_DOMAINS: 'example.com',
  // As on the JLR server, behind its gateway: rate limits count each user's own address (X-Forwarded-For).
  CV_TRUST_PROXY: '1',
  // Test only: no mail relay here, so the sign-in code is returned to the caller. NEVER set on the JLR server.
  CV_SHOW_DEV_OTP: '1', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
};

function startServer() {
  const p = spawn(join(ROOT, 'node_modules', '.bin', 'tsx'), ['server/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; p.stdout.on('data', d => { log += d; }); p.stderr.on('data', d => { log += d; });
  return { p, log: () => log };
}
async function waitUp() {
  for (let i = 0; i < 480; i++) { try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)); }
  throw new Error('server did not start');
}
const json = (b: unknown, h: Record<string, string> = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) });
let userNo = 0;
/** A user arriving through the gateway from their own address. */
const viaGw = () => ({ 'X-Forwarded-For': `10.20.0.${++userNo}` });
async function account(email: string): Promise<string> {
  const ip = viaGw();
  const s = await (await fetch(`${base}/api/auth/signup`, json({ email, password: 'Aa1!aaaaaa', fullName: email.split('@')[0] }, ip))).json() as { devOtp?: string };
  const v = await (await fetch(`${base}/api/auth/verify-otp`, json({ email, otp: s.devOtp, purpose: 'signup' }, ip))).json() as { token?: string };
  return v.token ?? '';
}

let srv = startServer();
try {
  // 0. No network at all from this process (the proof is meaningless otherwise).
  try { await fetch('https://example.com', { signal: AbortSignal.timeout(5000) }); check('no outbound network in the proof environment', false, 'example.com was reachable'); }
  catch (e) { check('no outbound network in the proof environment', true, String((e as { cause?: { code?: string } }).cause?.code ?? (e as Error).message)); }

  await waitUp();
  const h = await (await fetch(`${base}/api/health`)).json() as Record<string, unknown>;
  check('health: up, AI unavailable, login secret configured', h.aiAvailable === false && h.jwtConfigured === true, JSON.stringify({ aiAvailable: h.aiAvailable, jwtConfigured: h.jwtConfigured }));

  // 1. Sign-up policy (D-8).
  // Through the gateway (a forwarded request), even the first sign-up on an empty database must be a listed domain.
  const viaGateway = await fetch(`${base}/api/auth/signup`, json({ email: 'someone@outside.example', password: 'Aa1!aaaaaa', fullName: 'X' }, { 'X-Forwarded-For': '10.1.2.3' }));
  check('sign-up through the gateway from an unlisted domain is refused, even on an empty database (403)', viaGateway.status === 403, String(viaGateway.status));
  const admin = await account('admin@example.com');
  const user = await account('engineer@example.com');
  check('listed admin and listed-domain engineer can register and sign in', !!admin && !!user);
  const refused = await fetch(`${base}/api/auth/signup`, json({ email: 'someone@outside.example', password: 'Aa1!aaaaaa', fullName: 'X' }, viaGw()));
  check('once an account exists, an unlisted domain is refused from anywhere (403)', refused.status === 403, String(refused.status));
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // 2. CAD to COST — a real STEP (measured by the CAD kernel) and an STL, deterministic (no AI).
  const cad = async (file: string, name: string) => {
    const fd = new FormData(); fd.append('cadFile', new Blob([readFileSync(file)]), name); fd.append('mode', 'deterministic');
    const r = await fetch(`${base}/api/cad/analyze`, { method: 'POST', headers: auth(user), body: fd });
    return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, any> };
  };
  const step = await cad(join(ROOT, '..', 'cad-audit', 'parts', 'Seat_Locking_Bracket.stp'), 'Seat_Locking_Bracket.stp');
  check('CAD to COST: STEP measured by the CAD kernel and analysed offline (no AI)', step.status === 200 && !!step.body.analysis && step.body.geometrySource === 'occt' && step.body.mode === 'deterministic',
    `${step.status}, geometry ${step.body.geometrySource}, mode ${step.body.mode}`);
  const stl = await cad(join(ROOT, 'tests', 'fixtures', 'stl-dfm', 'FORGE_Hub_Flange.stl'), 'FORGE_Hub_Flange.stl');
  check('CAD to COST: STL analysed offline', stl.status === 200 && !!stl.body.analysis, String(stl.status));

  // 3. Offline drawing reader.
  {
    const fd = new FormData(); fd.append('drawing', new Blob([readFileSync(join(ROOT, 'tests', 'fixtures', 'drawings', 'gen-casting.pdf'))]), 'gen-casting.pdf');
    const r = await fetch(`${base}/api/drawing/read`, { method: 'POST', headers: auth(user), body: fd });
    const b = await r.json().catch(() => ({})) as Record<string, any>;
    const n = JSON.stringify(b).length;
    check('2D drawing read offline (CAD-exported PDF)', r.status === 200 && n > 200, `${r.status}, ${n} bytes of reading`);
  }

  // 4. AI is refused whatever is offered (a user-supplied key included).
  {
    const r = await fetch(`${base}/api/aichat`, { ...json({ message: 'hello' }, { ...auth(user), 'X-Anthropic-Key': 'sk-ant-user-supplied' }) });
    check('AI assistant refused while AIR_GAPPED=1 (even with a user key)', r.status === 503, String(r.status));
  }

  // 5. KPI dashboard reads.
  {
    const r = await fetch(`${base}/api/kpi/summary`, { headers: auth(user) });
    check('KPI dashboard summary', r.status === 200, String(r.status));
  }

  // 6. The page itself is served (the built front end), with the security headers.
  {
    const r = await fetch(`${base}/`);
    const csp = r.headers.get('content-security-policy') ?? '';
    check('front end served with a content security policy', r.status === 200 && csp.includes("default-src 'self'"), `${r.status}, CSP ${csp ? 'present' : 'missing'}`);
  }

  // 7. Backup while running → change → restore → the change is gone, the backup's data is back.
  {
    const bk = join(OUT, 'proof-backup.db');
    rmSync(bk, { force: true });
    const out = execFileSync('node', ['scripts/ops/db-backup.mjs', bk], { cwd: ROOT, env }).toString();
    const before = JSON.parse(out.trim().split('\n').pop()!);
    check('backup while running: integrity ok', before.ok === true, `${before.integrity}, users ${before.rows.users}`);
    await account('later@example.com');   // a change after the backup
    srv.p.kill('SIGTERM'); await new Promise(r => srv.p.once('exit', r));
    for (const f of ['should-cost.db-wal', 'should-cost.db-shm']) rmSync(join(DATA, f), { force: true });
    copyFileSync(bk, join(DATA, 'should-cost.db'));
    const after = JSON.parse(execFileSync('node', ['scripts/ops/db-check.mjs', join(DATA, 'should-cost.db')], { cwd: ROOT }).toString().trim());
    check('restore: integrity ok and the user count is the backup\'s', after.ok && after.rows.users === before.rows.users, `users ${after.rows.users} (backup ${before.rows.users})`);
    srv = startServer(); await waitUp();
    const back = await (await fetch(`${base}/api/health`)).json() as Record<string, unknown>;
    check('server starts on the restored database', back.ok !== false, 'health 200');
  }
  check('server log: no unhandled error', !/Unhandled|UnhandledPromiseRejection|FATAL/i.test(srv.log()), '');
} catch (e) {
  check('proof ran to the end', false, (e as Error).message);
} finally {
  srv.p.kill('SIGTERM');
  writeFileSync(join(OUT, 'jlr-offline-proof.json'), JSON.stringify({ ranAt: new Date().toISOString(), node: process.version, results }, null, 2));
  const pass = results.filter(r => r.pass).length;
  console.log(`[jlr] ${pass}/${results.length} PASS → ${OUT}`);
  if (existsSync(DATA)) rmSync(DATA, { recursive: true, force: true });
  process.exit(pass === results.length ? 0 : 1);
}
