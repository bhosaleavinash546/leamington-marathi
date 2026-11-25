/**
 * Phase 2 · Step 3 (evidence script): the FIXED server reading data saved by the PRE-FIX code. Copies the pre-fix
 * reconciliation database (before/db-path.txt) to a new /tmp directory, starts the fixed server on the copy (AI off) and
 * reads the all-time summary and every record as the admin — A-04 must flag the pre-fix 0.01 total "not re-added"
 * without excluding it (KPI definitions unchanged); A-06 re-selects the same-day tie on the creation time.
 *   npx tsx docs/dashboard-audit/phase2-evidence/reconciliation/existing-data.ts <before/db-path.txt> <out.json>
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import jwt from 'jsonwebtoken';

const SRC = readFileSync(resolve(process.argv[2]), 'utf8').trim();
const OUT = resolve(process.argv[3]);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const ALL = encodeURIComponent(JSON.stringify({ datePreset: 'all' }));

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'cv-phase2-recon-existing-'));
  copyFileSync(SRC, join(dir, 'should-cost.db'));
  const port = await freePort(); const secret = 'ex-' + Math.random().toString(36).slice(2);
  const server = spawn(join(resolve('.'), 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: resolve('.'), env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir }, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('no server'); await new Promise(r => setTimeout(r, 250)); }
    const t = jwt.sign({ userId: 'ada', email: 'ada@test', emailVerified: true }, secret, { expiresIn: '1h' });
    const get = async (p: string) => (await fetch(base + p, { headers: { Authorization: `Bearer ${t}` } })).json() as Promise<any>;
    const s = await get(`/api/kpi/summary?f=${ALL}`);
    const rows = (await get(`/api/kpi/records?scope=all&all=1&f=${ALL}`)).rows as any[];
    const pick = (ref: string) => rows.filter(r => r.sourceRef === ref).map(r => ({ part: r.partNumber, role: r.role, eligible: r.eligible, gapGbp: r.gapGbp, shouldBasis: r.shouldBasis, status: r.status, volumeValidated: r.volumeValidated }));
    const out = { source: `copy of the pre-fix reconciliation database (${SRC}) read by the fixed server`, financial: s.financial, operational: s.operational, dataQualityShouldBasis: s.dataQuality.shouldBasis, excludedBy: s.dataQuality.excludedBy,
      R14_forged_total: pick('rc-r14'), R7_first_same_day: pick('rc-r7'), R8_second_same_day: pick('rc-r8'), R9_volume: pick('rc-r9'), R10_test: (await get(`/api/kpi/records?scope=excluded&all=1&f=${ALL}`)).rows.map((r: any) => ({ part: r.partNumber, excluded: r.excluded })) };
    writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
  } finally { try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ } }
}
main().catch(e => { console.error(e); process.exit(1); });
