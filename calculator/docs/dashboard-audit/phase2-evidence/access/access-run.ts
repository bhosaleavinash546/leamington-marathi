/**
 * Phase 2 · Step 4 access checks (evidence script, not part of the app) for A-02, A-03, A-05 and A-23.
 * (A-01 and A-25 are blocked — D-8 and the domains are blank — so no "outside the allowed domains" role.)
 *
 * Starts ONE code tree's server (argv[2] = its calculator/ directory) on a throwaway SQLite database in /tmp, AI off,
 * synthetic users only, and calls every /api/kpi route directly as each role: signed-out, ordinary user (bob — not the
 * owner), record owner (alice), admin (ada). Every request and response is written to <outDir>/requests.json with the
 * Authorization header replaced by "Bearer <removed>" (tokens are never written). <outDir>/checks.json holds each
 * confirmation the brief lists, PASS / FAIL with the evidence.
 *
 *   npx tsx docs/dashboard-audit/phase2-evidence/access/access-run.ts <calculatorRoot> <outDir>
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve(process.argv[2] ?? '.');
const OUT = resolve(process.argv[3] ?? 'access-out'); mkdirSync(OUT, { recursive: true });
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const ALL = encodeURIComponent(JSON.stringify({ datePreset: 'all' }));
const b64 = (s: string) => Buffer.from(s).toString('base64');
const HEAD = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(test|org|com)\b/g;

async function main() {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-phase2-access-'));
  const secret = 'acc-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const log: unknown[] = [];
  const checks: { id: string; finding: string; check: string; pass: boolean; evidence: unknown }[] = [];
  const check = (id: string, finding: string, chk: string, pass: boolean, evidence: unknown) => checks.push({ id, finding, check: chk, pass, evidence });
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    for (const [id, name, role] of [['alice', 'Alice Able', 'user'], ['bob', 'Bob Baker', 'user'], ['ada', 'Ada Admin', 'admin'], ['noname', '', 'user']]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@corp.test`, name, role, new Date().toISOString());
    }
    db.close();
    const tok = (id: string) => jwt.sign({ userId: id, email: `${id}@corp.test`, emailVerified: true }, secret, { expiresIn: '2h' });
    const call = async (role: string, user: string | null, method: string, path: string, body?: unknown) => {
      const r = await fetch(base + path, { method, headers: { ...(user ? { Authorization: `Bearer ${tok(user)}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* csv */ }
      log.push({ role, request: { method, path: decodeURIComponent(path), headers: user ? { Authorization: 'Bearer <removed>' } : {}, body: body && typeof body === 'object' && 'fileBase64' in (body as object) ? { fileBase64: '<synthetic file, base64 omitted>' } : body ?? null },
        response: { status: r.status, body: json ?? (text.length > 1500 ? text.slice(0, 1500) + `… (${text.length} chars)` : text) } });
      return { status: r.status, json, text };
    };
    const asUser = (u: string) => (m: string, p: string, b?: unknown) => call(u === 'alice' ? 'owner (alice)' : u === 'bob' ? 'ordinary user (bob)' : u === 'ada' ? 'admin (ada)' : u, u, m, p, b);
    const alice = asUser('alice'), bob = asUser('bob'), ada = asUser('ada'), noname = asUser('noname');
    const anon = (m: string, p: string, b?: unknown) => call('signed-out', null, m, p, b);

    // ── fixtures (synthetic) ──
    const saveBody = (sid: string, pn: string, extra: Record<string, unknown> = {}) => ({
      scenario: { id: sid, name: pn, commodity: 'casting', region: 'UK', input: { partName: pn, deliveryTerms: 'DAP', secretSupplierQuote: 77.7, targetPrice: 66.6 },
        result: { total: 10, breakdown: { rawMaterial: 5, process: 5 }, operationDetails: [{ name: 'Op 10 turn', cost: 5, cycleTimeSec: 42, machineId: 'mach-x' }], internalTrace: { a: 1 } } },
      details: { status: 'completed', partNumber: pn, componentName: pn, programme: 'L460', modelYear: 2027, powertrain: 'BEV', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', ...extra },
    });
    const mk = async (pn: string, approve: boolean, extra: Record<string, unknown> = {}) => {
      const s = await alice('POST', '/api/kpi/records', saveBody(`acc-${pn}`, pn, extra));
      if (approve) await ada('PATCH', `/api/kpi/records/${s.json.record.id}`, { status: 'approved' });
      return s.json.record.id as string;
    };
    const recA = await mk('ACC-VIEW', false);
    await noname('POST', '/api/kpi/records', saveBody('acc-noname', 'ACC-NONAME'));
    await ada('POST', '/api/kpi/import', { fileBase64: b64(`${HEAD}\nCSS System,ACC-IMP-1,r.rao@supplier.test,ACC-IMP,Imported,Casting,L460,2027,BEV,GB,completed,2026-10-01,5,GBP,DAP,6,GBP,DAP\nCPSC II,ACC-IMP-2,R. Rao,ACC-IMP2,Imported 2,Casting,L460,2027,BEV,GB,completed,2026-10-01,5,GBP,DAP,6,GBP,DAP\n`) });

    // ── 1. signed-out: 401 on every route ──
    const routes: [string, string, unknown?][] = [
      ['GET', '/api/kpi/meta'], ['GET', `/api/kpi/summary?f=${ALL}`], ['GET', `/api/kpi/records?f=${ALL}`], ['GET', `/api/kpi/records.csv?f=${ALL}`],
      ['GET', `/api/kpi/drill?drill=commodity&f=${ALL}`], ['GET', `/api/kpi/records/${recA}`], ['GET', '/api/kpi/fx'],
      ['POST', '/api/kpi/records', saveBody('acc-anon', 'ACC-ANON')], ['PATCH', `/api/kpi/records/${recA}`, { notes: 'x' }], ['DELETE', `/api/kpi/records/${recA}`],
      ['PUT', '/api/kpi/fx/policy', { policy: 'monthly' }], ['POST', '/api/kpi/fx/rates', { fileBase64: b64('x') }], ['POST', '/api/kpi/fx/recalculate', { apply: false }],
      ['GET', '/api/kpi/import/template.csv'], ['POST', '/api/kpi/import', { fileBase64: b64('x') }], ['GET', '/api/kpi/audit'],
    ];
    const anonStatus: Record<string, number> = {};
    for (const [m, p, b] of routes) anonStatus[`${m} ${p.split('?')[0].replace(recA, ':id')}`] = (await anon(m, p, b)).status;
    check('S1', 'all', 'Signed-out users get 401 on every /api/kpi route (16 routes)', Object.values(anonStatus).every(s => s === 401), anonStatus);

    // ── 2. admin-only routes → 403 for an ordinary user ──
    const adminOnly: Record<string, number> = {
      'GET /records?scope=excluded': (await bob('GET', `/api/kpi/records?scope=excluded&f=${ALL}`)).status,
      'GET /records.csv?scope=excluded': (await bob('GET', `/api/kpi/records.csv?scope=excluded&f=${ALL}`)).status,
      'PUT /fx/policy': (await bob('PUT', '/api/kpi/fx/policy', { policy: 'monthly' })).status,
      'POST /fx/rates': (await bob('POST', '/api/kpi/fx/rates', { fileBase64: b64('currency,period,units_per_gbp,source\nEUR,2026-11,1.19,x\n') })).status,
      'POST /fx/recalculate': (await bob('POST', '/api/kpi/fx/recalculate', { apply: true })).status,
      'POST /import': (await bob('POST', '/api/kpi/import', { fileBase64: b64(`${HEAD}\n`) })).status,
      'GET /audit': (await bob('GET', '/api/kpi/audit')).status,
    };
    check('S6', 'all', 'Admin-only routes return 403 to an ordinary user', Object.values(adminOnly).every(s => s === 403), adminOnly);

    // ── 3. ordinary user: only the panel fields, no internal user ids, no e-mail addresses (A-02, A-23) ──
    const vBob = await bob('GET', `/api/kpi/records/${recA}`);
    const c = vBob.json?.costing;
    const panelOk = !!c && JSON.stringify(Object.keys(c).sort()) === '["commodity","region","result"]'
      && Object.keys(c.result).every((k: string) => ['total', 'breakdown', 'operationDetails'].includes(k))
      && (c.result.operationDetails ?? []).every((o: object) => JSON.stringify(Object.keys(o).sort()) === '["cost","name"]')
      && !/secretSupplierQuote|targetPrice|cycleTimeSec|machineId|internalTrace/.test(vBob.text);
    check('S3a', 'A-02', 'Ordinary user (not the owner) gets only the panel fields of another user\'s costing', panelOk, { status: vBob.status, costingKeys: c ? Object.keys(c) : null, resultKeys: c?.result ? Object.keys(c.result) : null, opKeys: c?.result?.operationDetails?.[0] ? Object.keys(c.result.operationDetails[0]) : null, canEdit: vBob.json?.canEdit, fxHistoryShown: vBob.json?.fxHistory !== undefined });
    const vAlice = await alice('GET', `/api/kpi/records/${recA}`), vAda = await ada('GET', `/api/kpi/records/${recA}`);
    check('S3b', 'A-02', 'The owner and an admin still get the full saved costing', !!vAlice.json?.costing?.input?.secretSupplierQuote && !!vAda.json?.costing?.input?.secretSupplierQuote && !!vAlice.json?.costing?.result?.internalTrace, { aliceKeys: Object.keys(vAlice.json?.costing ?? {}), adaKeys: Object.keys(vAda.json?.costing ?? {}), aliceCanEdit: vAlice.json?.canEdit });
    const listBob = await bob('GET', `/api/kpi/records?scope=all&all=1&f=${ALL}`);
    const sumBob = await bob('GET', `/api/kpi/summary?f=${ALL}`);
    const csvBob = await bob('GET', `/api/kpi/records.csv?scope=all&f=${ALL}`);
    const drillBob = await bob('GET', `/api/kpi/drill?drill=record&f=${ALL}`);
    const userBodies = { list: listBob.text, recordView: vBob.text, summary: sumBob.text, csv: csvBob.text, drill: drillBob.text };
    const emails = Object.fromEntries(Object.entries(userBodies).map(([k, t]) => [k, [...new Set(t.match(EMAIL_RE) ?? [])]]));
    const ownerIdRows = (listBob.json?.rows ?? []).filter((r: object) => 'ownerId' in r).length;
    const idsInBodies = Object.fromEntries(Object.entries(userBodies).map(([k, t]) => [k, /"ownerId"|import:CSS System:|"alice"|"bob"|"ada"|"noname"/.test(t)]));
    check('S3c', 'A-23', 'Ordinary user: no internal user id in list rows, record view, summary, CSV or drill', ownerIdRows === 0 && Object.values(idsInBodies).every(v => !v), { rowsWithOwnerIdKey: ownerIdRows, internalIdFoundIn: idsInBodies });
    check('S3d', 'A-23', 'Ordinary user: no e-mail address anywhere in the responses (blank-name user and an e-mail-shaped import owner show "Unnamed user")', Object.values(emails).every(v => v.length === 0), { emailsFound: emails, ownerNames: [...new Set((listBob.json?.rows ?? []).map((r: { ownerName: string }) => r.ownerName))] });
    const listAda = await ada('GET', `/api/kpi/records?scope=all&all=1&f=${ALL}`);
    check('S3e', 'A-23', 'An admin still gets the owner id in rows', (listAda.json?.rows ?? []).every((r: object) => 'ownerId' in r), { adminRowsWithOwnerId: (listAda.json?.rows ?? []).filter((r: object) => 'ownerId' in r).length, of: (listAda.json?.rows ?? []).length });
    const metaBob = await bob('GET', '/api/kpi/meta');
    check('S3f', 'A-23', '/meta returns only the caller\'s OWN id (not a list row; not in the approved fix)', metaBob.json?.userId === 'bob', { userId: metaBob.json?.userId });

    // ── 4. owner limits (A-05) and the A-03 / A-05 resets ──
    const recT = await mk('ACC-OWN-T', true), recC = await mk('ACC-OWN-C', true), recS = await mk('ACC-OWN-S', true);
    const ownerIsTest = await alice('PATCH', `/api/kpi/records/${recT}`, { isTest: true });
    const ownerCommodity = await alice('PATCH', `/api/kpi/records/${recC}`, { commodity: 'Forging' });
    const ownerCountry = await alice('PATCH', `/api/kpi/records/${recC}`, { country: 'CN' });
    const ownerDraft = await alice('PATCH', `/api/kpi/records/${recS}`, { status: 'draft' });
    const ownerCompleted = await alice('PATCH', `/api/kpi/records/${recS}`, { status: 'completed' });
    const ownerApproveOwn = await alice('PATCH', `/api/kpi/records/${await mk('ACC-OWN-A', false)}`, { status: 'approved' });
    const ownerValidate = await alice('PATCH', `/api/kpi/records/${recS}`, { volumeValidated: true });
    const ownerSaving = await alice('PATCH', `/api/kpi/records/${recS}`, { savingStatus: 'validated', savingPerPiece: 1, savingCcy: 'GBP' });
    const after = async (id: string) => (await ada('GET', `/api/kpi/records/${id}`)).json?.record;
    const tAfter = await after(recT), cAfter = await after(recC), sAfter = await after(recS);
    const blocked = { isTest: ownerIsTest.status, commodity: ownerCommodity.status, country: ownerCountry.status, approvedToDraft: ownerDraft.status, approvedToCompleted: ownerCompleted.status, approveOwn: ownerApproveOwn.status, volumeValidated: ownerValidate.status, savingStatus: ownerSaving.status };
    check('S4a', 'A-05', 'Owner cannot change test flag, commodity, country or an admin-set status (each 403, record unchanged)',
      Object.values(blocked).every(s => s === 403) && tAfter.isTest === false && !tAfter.excluded && cAfter.commodity === 'Casting' && cAfter.country === 'UK' && sAfter.status === 'approved',
      { statuses: blocked, after: { isTest: tAfter.isTest, excluded: tAfter.excluded, commodity: cAfter.commodity, country: cAfter.country, status: sAfter.status } });
    const idChanges: Record<string, unknown> = {};
    for (const [field, value] of [['partNumber', 'ACC-MOVED'], ['programme', 'L461'], ['modelYear', 2028], ['powertrain', 'MHEV'], ['annualVolume', 1234]] as const) {
      const id = await mk(`ACC-ID-${field}`, true);
      const r = await alice('PATCH', `/api/kpi/records/${id}`, { [field]: value });
      idChanges[field] = { status: r.status, statusAfter: r.json?.record?.status };
    }
    check('S4b', 'A-05', 'Owner: an identity (part number, programme, model year, powertrain) or volume change on an approved record → "completed"',
      Object.values(idChanges).every((v: any) => v.status === 200 && v.statusAfter === 'completed'), idChanges);
    const recNotes = await mk('ACC-NOTES', true);
    const notes = await alice('PATCH', `/api/kpi/records/${recNotes}`, { status: 'approved', partNumber: 'ACC-NOTES', programme: 'L460', modelYear: 2027, powertrain: 'BEV', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', annualVolume: null, notes: 'owner note' });
    check('S4c', 'A-05', 'Owner: a notes-only full-form save of an approved record is accepted and stays approved', notes.status === 200 && notes.json?.record?.status === 'approved', { status: notes.status, statusAfter: notes.json?.record?.status, error: notes.json?.error });
    const recVol = await mk('ACC-VOL', false, { annualVolume: 50000 });
    await ada('PATCH', `/api/kpi/records/${recVol}`, { annualVolume: 60000, volumeValidated: true, status: 'approved' });
    const vol = await alice('PATCH', `/api/kpi/records/${recVol}`, { annualVolume: 600000 });
    check('S4d', 'A-03 / A-05', 'Owner changes a validated volume on an approved record → validation cleared AND status "completed"', vol.status === 200 && vol.json?.record?.volumeValidated === false && vol.json?.record?.status === 'completed', { status: vol.status, volumeValidated: vol.json?.record?.volumeValidated, statusAfter: vol.json?.record?.status });
    const recVolA = await mk('ACC-VOLA', false, { annualVolume: 50000 });
    await ada('PATCH', `/api/kpi/records/${recVolA}`, { annualVolume: 60000, volumeValidated: true, status: 'approved' });
    const volA = await ada('PATCH', `/api/kpi/records/${recVolA}`, { annualVolume: 70000 });
    // the same-request re-validation rule applies to a record that is STILL validated (a second record, untouched)
    const recVolB = await mk('ACC-VOLB', false, { annualVolume: 50000 });
    await ada('PATCH', `/api/kpi/records/${recVolB}`, { annualVolume: 60000, volumeValidated: true, status: 'approved' });
    const volBoth = await ada('PATCH', `/api/kpi/records/${recVolB}`, { annualVolume: 80000, volumeValidated: true });
    const reval = await ada('PATCH', `/api/kpi/records/${recVolA}`, { volumeValidated: true });
    const reapp = await ada('PATCH', `/api/kpi/records/${recVolA}`, { status: 'approved' });
    check('S4e', 'A-03 / A-05', 'Admin changes a validated volume → cleared + completed; change + re-validate in one request → 400; separate re-validate and re-approve → 200',
      volA.json?.record?.volumeValidated === false && volA.json?.record?.status === 'completed' && volBoth.status === 400 && reval.status === 200 && reval.json?.record?.volumeValidated === true && reapp.json?.record?.status === 'approved',
      { adminChange: { status: volA.status, validated: volA.json?.record?.volumeValidated, statusAfter: volA.json?.record?.status }, changeAndRevalidate: { status: volBoth.status, error: volBoth.json?.error }, revalidate: { status: reval.status, validated: reval.json?.record?.volumeValidated }, reapprove: { status: reapp.status, statusAfter: reapp.json?.record?.status } });
    const bobEdit = await bob('PATCH', `/api/kpi/records/${recA}`, { notes: 'not mine' });
    const bobDel = await bob('DELETE', `/api/kpi/records/${recA}`);
    check('S4f', 'all', 'An ordinary user cannot edit or delete another user\'s record (403)', bobEdit.status === 403 && bobDel.status === 403, { edit: bobEdit.status, delete: bobDel.status });

    // ── 5. admin can still do everything it could before ──
    const recAdm = await mk('ACC-ADM', false);
    const adm: Record<string, unknown> = {
      approve: (await ada('PATCH', `/api/kpi/records/${recAdm}`, { status: 'approved' })).status,
      review: (await ada('PATCH', `/api/kpi/records/${await mk('ACC-ADM-R', false)}`, { status: 'reviewed' })).status,
      commodity: (await ada('PATCH', `/api/kpi/records/${recAdm}`, { commodity: 'Forging' })).status,
      country: (await ada('PATCH', `/api/kpi/records/${recAdm}`, { country: 'CN' })).status,
      volume: (await ada('PATCH', `/api/kpi/records/${recAdm}`, { annualVolume: 1000, volumeValidated: true })).status,
      saving: (await ada('PATCH', `/api/kpi/records/${recAdm}`, { savingStatus: 'validated', savingPerPiece: 0.5, savingCcy: 'GBP' })).status,
      isTest: (await ada('PATCH', `/api/kpi/records/${recAdm}`, { isTest: true })).status,
      isTestOff: (await ada('PATCH', `/api/kpi/records/${recAdm}`, { isTest: false })).status,
      excludedList: (await ada('GET', `/api/kpi/records?scope=excluded&f=${ALL}`)).status,
      fxRates: (await ada('POST', '/api/kpi/fx/rates', { fileBase64: b64('currency,period,units_per_gbp,source\nEUR,2026-11,1.19,Synthetic\n') })).status,
      fxPolicy: (await ada('PUT', '/api/kpi/fx/policy', { policy: 'monthly' })).status,
      fxRecalcPreview: (await ada('POST', '/api/kpi/fx/recalculate', { apply: false })).status,
      fxRecalcApply: (await ada('POST', '/api/kpi/fx/recalculate', { apply: true })).status,
      importTemplate: (await ada('GET', '/api/kpi/import/template.csv')).status,
      import: (await ada('POST', '/api/kpi/import', { fileBase64: b64(`${HEAD}\nCSS System,ACC-IMP-3,R. Rao,ACC-IMP3,Imported 3,Casting,L460,2027,BEV,GB,completed,2026-10-01,5,GBP,DAP,6,GBP,DAP\n`) })).status,
      audit: (await ada('GET', '/api/kpi/audit')).status,
      editOthers: (await ada('PATCH', `/api/kpi/records/${recA}`, { notes: 'admin note' })).status,
      deleteOthers: (await ada('DELETE', `/api/kpi/records/${await mk('ACC-ADM-D', true)}`)).status,
    };
    const admFinal = await after(recAdm);
    check('S5', 'all', 'Admin can still approve / review, set commodity, country, validated volume, saving, test flag, read excluded, load FX, set policy, recalculate, import, read audit, edit and delete others\' records',
      Object.values(adm).every(s => s === 200), { statuses: adm, finalRecord: { status: admFinal?.status, commodity: admFinal?.commodity, country: admFinal?.country, volumeValidated: admFinal?.volumeValidated, savingStatus: admFinal?.savingStatus, isTest: admFinal?.isTest } });
    // owner delete of an approved record — D-4 (unchanged by design)
    const ownerDelApproved = await alice('DELETE', `/api/kpi/records/${await mk('ACC-DEL', true)}`);
    check('S4g', 'A-05 (D-4)', 'Owner delete of an approved record — UNCHANGED by design (D-4 blank): expected 200 before and after', ownerDelApproved.status === 200, { status: ownerDelApproved.status });
  } finally {
    writeFileSync(join(OUT, 'requests.json'), JSON.stringify({ generated: new Date().toISOString(), codeTree: ROOT, database: 'throwaway SQLite in /tmp (deleted after the run)', note: 'Authorization headers replaced by "Bearer <removed>"; no token is written', requests: log }, null, 1));
    writeFileSync(join(OUT, 'checks.json'), JSON.stringify({ generated: new Date().toISOString(), codeTree: ROOT, passed: checks.filter(c => c.pass).length, failed: checks.filter(c => !c.pass).length, checks }, null, 1));
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id} [${c.finding}] ${c.check}`);
}
main().catch(e => { console.error(e); process.exit(1); });
