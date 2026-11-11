// Security review probe (audit only). Runs the real /api/kpi router on a throwaway DB in the scratchpad.
import type { AddressInfo } from 'node:net';
process.env.CV_DATA_DIR = process.env.SCRATCH_DB_DIR || `/tmp/cv-kpi-secprobe-${process.pid}`;
process.env.JWT_SECRET = 'sec-probe-secret-0123456789abcdef0123456789abcdef';
process.env.AIR_GAPPED = '1';

const { default: express } = await import('express');
const { default: db } = await import('../../../../server/db.js');
const { default: kpiRouter } = await import('../../../../server/routes/kpi.js');
const { signToken, requireAuth } = await import('../../../../server/middleware/auth-middleware.js');

const A = 'u-alice', B = 'u-bob', ADM = 'u-admin', E = 'u-noname';
const now = new Date().toISOString();
for (const [id, role, name] of [[A, 'user', 'Alice'], [B, 'user', 'Bob'], [ADM, 'admin', 'Ada'], [E, 'user', '']]) {
  db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@example.test`, name, role, now);
}
const app = express(); app.use(express.json({ limit: '10mb' })); app.use('/api/kpi', requireAuth, kpiRouter);
const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
async function call(user: string | null, method: string, path: string, body?: unknown) {
  const h: Record<string, string> = body ? { 'Content-Type': 'application/json' } : {};
  if (user) h.Authorization = `Bearer ${signToken(user, user, true)}`;
  const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, j };
}
const save = (id: string, total: number, over: object = {}) => ({
  scenario: { id, name: 'Knuckle', commodity: 'casting', region: 'UK', input: { partName: 'Knuckle', deliveryTerms: 'DAP', secretSupplierQuote: 'Acme £9.10', targetPrice: 8.5 }, result: { total, breakdown: { rawMaterial: 4 } } },
  details: { partNumber: 'LR-1', programme: 'L460', modelYear: 2027, powertrain: 'BEV', status: 'completed', currentCost: 20, currentCcy: 'GBP', currentTerms: 'DAP', annualVolume: 1000, ...over },
});
const out: Record<string, unknown> = {};
out.unauth = (await call(null, 'GET', '/api/kpi/summary')).s;
out.badToken = (await fetch(base + '/api/kpi/summary', { headers: { Authorization: 'Bearer x' } })).status;
const a = (await call(A, 'POST', '/api/kpi/records', save('sc-alice-1', 10))).j.record.id;
// admin approves + validates volume
out.adminPatch = (await call(ADM, 'PATCH', `/api/kpi/records/${a}`, { status: 'approved', volumeValidated: true })).s;
const f = `f=${encodeURIComponent(JSON.stringify({ datePreset: 'all' }))}`;
out.annualisedBefore = (await call(B, 'GET', `/api/kpi/summary?${f}`)).j.financial.annualised;
// owner edits non-money fields on an approved, volume-validated record
const p1 = await call(A, 'PATCH', `/api/kpi/records/${a}`, { annualVolume: 900000000, commodity: 'Anything', country: 'XX', programme: 'L461' });
out.ownerPatchNonMoney = { status: p1.s, statusAfter: p1.j?.record?.status, volumeValidated: p1.j?.record?.volumeValidated, annualVolume: p1.j?.record?.annualVolume, commodity: p1.j?.record?.commodity };
out.annualisedAfter = (await call(B, 'GET', `/api/kpi/summary?${f}`)).j.financial.annualised;
// owner sets / clears isTest (UI shows that box to admins only)
out.ownerSetsIsTest = (await call(A, 'PATCH', `/api/kpi/records/${a}`, { isTest: true })).s;
await call(ADM, 'PATCH', `/api/kpi/records/${a}`, { isTest: true });
const un = await call(A, 'PATCH', `/api/kpi/records/${a}`, { isTest: false });
out.ownerClearsAdminTestFlag = { status: un.s, isTest: un.j?.record?.isTest, excluded: un.j?.record?.excluded };
await call(A, 'PATCH', `/api/kpi/records/${a}`, { programme: 'L460' });
// Bob saves a newer COMPLETED costing of the same application with an arbitrary should-cost
const b = (await call(B, 'POST', '/api/kpi/records', save('sc-bob-1', 0.01))).j.record.id;
const list = (await call(A, 'GET', `/api/kpi/records?scope=all&${f}`)).j.rows.map((r: any) => ({ owner: r.ownerName, status: r.status, role: r.role, should: r.shouldCost, ownerId: r.ownerId }));
out.afterBobSave = list;
// cross-user read of the linked costing
const d = await call(B, 'GET', `/api/kpi/records/${a}`);
out.bobReadsAliceCosting = d.j?.costing;
// owner with no full name -> email shown
const e = (await call(E, 'POST', '/api/kpi/records', save('sc-e-1', 5, { partNumber: 'LR-2' }))).j.record;
out.noNameOwnerName = e.ownerName;
// downgrade an approved record to draft
await call(ADM, 'PATCH', `/api/kpi/records/${b}`, { status: 'approved' });
out.ownerDowngradesApproved = (await call(B, 'PATCH', `/api/kpi/records/${b}`, { status: 'draft' })).s;
// audit: what is logged for the edit
out.auditSample = (await call(ADM, 'GET', '/api/kpi/audit')).j.rows.slice(0, 4);
// meta
out.metaKeys = Object.keys((await call(B, 'GET', '/api/kpi/meta')).j);
console.log(JSON.stringify(out, null, 1));
srv.close(); process.exit(0);
