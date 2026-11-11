/**
 * Phase 1 audit — live reproductions against a THROWAWAY server (temp SQLite in /tmp, AI off, no key).
 * Audit-only: no application file is changed; this script lives in the evidence folder and writes only
 * phase1-evidence/20-probes.json. Run from calculator/:
 *   npx tsx docs/dashboard-audit/phase1-evidence/probes.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const ROOT = resolve('.');
const OUT = resolve('docs/dashboard-audit/phase1-evidence/20-probes.json');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const results: Record<string, unknown> = {};
const MONTH = new Date().toISOString().slice(0, 7);
const f = (o: object) => `f=${encodeURIComponent(JSON.stringify(o))}`;

async function main() {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-phase1-probe-'));
  const secret = 'probe-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout?.on('data', d => { log += d; }); server.stderr?.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    for (const [id, name, role] of [['alice', 'Alice Able', 'user'], ['bob', 'Bob Baker', 'user'], ['ada', 'Ada Admin', 'admin'], ['gone', '', 'user']]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@test`, name, role, new Date().toISOString());
    }
    const tok = (id: string) => jwt.sign({ userId: id, email: `${id}@test`, emailVerified: true }, secret, { expiresIn: '2h' });
    const call = async (token: string | null, method: string, path: string, body?: unknown) => {
      const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* csv */ }
      return { status: r.status, json, text, bytes: text.length };
    };
    const api = (u: string, m: string, p: string, b?: unknown) => call(tok(u), m, p, b);
    const save = (user: string, sid: string, d: Record<string, unknown>, total: number) =>
      api(user, 'POST', '/api/kpi/records', { scenario: { id: sid, name: String(d.componentName ?? sid), commodity: 'casting', region: 'UK', input: { partName: d.componentName, deliveryTerms: 'DAP', annualVolume: 50000 }, result: { total, breakdown: { rawMaterial: 4, process: 3, labour: 2, tooling: 1.5, packaging: 0.3, logistics: 0.4, overhead: 1, margin: 0.8 } } }, details: { status: 'completed', ...d } });
    const b64 = (s: string) => Buffer.from(s).toString('base64');
    const head = 'source_tool,source_record_id,owner,part_number,component_name,commodity,programme,model_year,powertrain,country,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms';

    // ── P01 open sign-up → a stranger reads every supplier price ─────────────────────────────
    {
      const signup = await call(null, 'POST', '/api/auth/signup', { email: 'outsider@example.org', password: 'Outsider#2026pass', fullName: 'Out Sider' });
      const otp = signup.json?.devOtp;
      const verify = otp ? await call(null, 'POST', '/api/auth/verify-otp', { email: 'outsider@example.org', otp, purpose: 'signup' }) : null;
      const strangerToken = verify?.json?.token ?? null;
      const s = await save('alice', 'sc-p01', { partNumber: 'P01-SECRET', componentName: 'Supplier-priced part', programme: 'L460', modelYear: 2027, powertrain: 'BEV', currentCost: 123.45, currentCcy: 'EUR', currentTerms: 'DAP', currentSource: 'quote' }, 99);
      const rec = s.json?.record?.id;
      const list = strangerToken ? await call(strangerToken, 'GET', `/api/kpi/records?scope=all&all=1&${f({ datePreset: 'all' })}`) : null;
      const detail = strangerToken && rec ? await call(strangerToken, 'GET', `/api/kpi/records/${rec}`) : null;
      const csv = strangerToken ? await call(strangerToken, 'GET', `/api/kpi/records.csv?scope=all&${f({ datePreset: 'all' })}`) : null;
      results.P01_open_signup = {
        signupStatus: signup.status, devOtpReturnedToSameMachineRequest: !!otp, verifyStatus: verify?.status, gotToken: !!strangerToken,
        note: 'devOtp is returned only to a same-machine request (devOtpAllowed); from another machine the code is emailed — the point is that ANY email domain may sign up.',
        strangerSeesRecords: list?.json?.total, strangerSeesSupplierPrice: JSON.stringify(list?.json?.rows ?? []).includes('123.45'),
        strangerDetailStatus: detail?.status, detailIncludesFullCostingBreakdown: !!detail?.json?.costing?.result?.breakdown,
        strangerCsvStatus: csv?.status, csvContainsPrice: (csv?.text ?? '').includes('123.45'),
      };
    }
    // ── P02 owner can hide / reshape own record through the API (UI hides the test box) ───────
    {
      const s = await save('bob', 'sc-p02', { partNumber: 'P02-OWN', componentName: 'Owner record', programme: 'L461', modelYear: 2027, powertrain: 'BEV', currentCost: 50, currentCcy: 'GBP', currentTerms: 'DAP' }, 40);
      const id = s.json.record.id;
      await api('ada', 'PATCH', `/api/kpi/records/${id}`, { status: 'approved' });
      const asTest = await api('bob', 'PATCH', `/api/kpi/records/${id}`, { isTest: true });
      const after = await api('ada', 'GET', `/api/kpi/records/${id}`);
      const undo = await api('bob', 'PATCH', `/api/kpi/records/${id}`, { isTest: false });
      const toDraft = await api('bob', 'PATCH', `/api/kpi/records/${id}`, { status: 'draft' });
      const del = await api('bob', 'DELETE', `/api/kpi/records/${id}`);
      results.P02_owner_powers = {
        ownerSetsIsTestStatus: asTest.status, recordNowExcluded: after.json?.record?.excluded,
        ownerDowngradesApprovedToDraftStatus: toDraft.status, statusAfter: toDraft.json?.record?.status,
        ownerDeletesApprovedRecordStatus: del.status,
      };
    }
    // ── P03 FX guard: inverted EUR / USD accepted; currency without a reference unguarded; table overwrite ──
    {
      const inv = await api('ada', 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`currency,period,gbp_per_unit,source\nEUR,2026-01,1.19,inverted by mistake\nUSD,2026-01,1.31,inverted by mistake\n`) });
      const noRef = await api('ada', 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`currency,period,gbp_per_unit,source\nAED,2026-01,4.9,inverted (AED has no reference rate)\n`) });
      const absurd = await api('ada', 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`currency,period,gbp_per_unit,source\nAED,2026-03,4900,absurd (x20000)\n`) });
      const zarInv = await api('ada', 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`currency,period,gbp_per_unit,source\nZAR,2026-01,23.5,inverted\n`) });
      const first = await api('ada', 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`currency,period,gbp_per_unit,source\nCHF,2026-02,0.90,Treasury v1\n`) });
      const second = await api('ada', 'POST', '/api/kpi/fx/rates', { fileBase64: b64(`currency,period,gbp_per_unit,source\nCHF,2026-02,0.95,Treasury v2\n`) });
      const table = await api('ada', 'GET', '/api/kpi/fx');
      const audit = await api('ada', 'GET', '/api/kpi/audit');
      const ref = table.json?.reference?.rates ?? {};
      results.P03_fx_guard = {
        invertedEurUsdAcceptedStatus: inv.status, invertedEurUsdLoaded: inv.json?.loaded, referenceEUR: ref.EUR, referenceUSD: ref.USD,
        ratioInvertedEurToReference: ref.EUR ? 1.19 / ref.EUR : null,
        currenciesWithReferenceRate: Object.keys(ref).length, ZARinReference: 'ZAR' in ref, AEDinReference: 'AED' in ref,
        noReferenceCurrencyInvertedAcceptedStatus: noRef.status, noReferenceAbsurdAcceptedStatus: absurd.status, zarInvertedStatus: zarInv.status, zarInvertedMessage: zarInv.json?.error ?? zarInv.json, referenceZAR: ref.ZAR,
        chfRowsAfterTwoUploads: (table.json?.rates ?? []).filter((r: any) => r.currency === 'CHF'),
        auditEntriesForFxLoad: (audit.json?.rows ?? []).filter((r: any) => r.action === 'fx.load').map((r: any) => r.detail),
      };
    }
    // ── P04/P05 historical period v latest revision; a still-current costing older than 12 months ──
    {
      const csv = `${head}\nCSS System,H-1,R. Rao,P04-HIST,Hist part,Casting,L460,2027,BEV,GB,approved,2026-02-01,10,GBP,DAP,12,GBP,DAP\nCSS System,H-2,R. Rao,P04-HIST,Hist part,Casting,L460,2027,BEV,GB,completed,2026-10-01,10.5,GBP,DAP,12,GBP,DAP\nCSS System,O-1,R. Rao,P05-OLD,Old but current,Machining,L663,2026,Petrol,GB,approved,2025-06-01,20,GBP,DAP,26,GBP,DAP\n`;
      const imp = await api('ada', 'POST', '/api/kpi/import', { fileBase64: b64(csv) });
      const q1 = await api('bob', 'GET', `/api/kpi/summary?${f({ datePreset: 'custom', dateFrom: '2026-01-01', dateTo: '2026-03-31', tool: ['CSS System'] })}`);
      const def = await api('bob', 'GET', `/api/kpi/summary?${f({ datePreset: '12m', tool: ['CSS System'] })}`);
      const all = await api('bob', 'GET', `/api/kpi/summary?${f({ datePreset: 'all', tool: ['CSS System'] })}`);
      results.P04_P05_periods = {
        importStatus: imp.status, importResult: imp.json,
        Q1_2026_view: { totalRecords: q1.json?.operational?.totalRecords, currentRecords: q1.json?.operational?.currentRecords, eligible: q1.json?.financial?.eligible, opportunity: q1.json?.financial?.opportunity },
        note_Q1: 'P04-HIST had an approved costing (gap £2) dated Feb 2026; it was superseded by an Oct 2026 revision, so a Q1-2026 view shows the save in activity but NO financial figure for that part.',
        default12m_view: { currentRecords: def.json?.operational?.currentRecords, eligible: def.json?.financial?.eligible, opportunityGbp: def.json?.financial?.opportunity?.gbp },
        allTime_view: { currentRecords: all.json?.operational?.currentRecords, eligible: all.json?.financial?.eligible, opportunityGbp: all.json?.financial?.opportunity?.gbp },
        note_12m: 'P05-OLD (approved, still current, gap £6) costed 2025-06-01 is outside "last 12 months", so the default view omits £6 of opportunity that is still current.',
      };
    }
    // ── P06 newer unapproved costing by another user displaces an approved one ───────────────
    {
      const csv = `${head}\nCSS System,A-1,Approver Team,P06-RACE,Race part,Forging,L461,2027,BEV,GB,approved,2026-09-01,30,GBP,DAP,40,GBP,DAP\nCPSC II,B-1,Other Engineer,P06-RACE,Race part,Forging,L461,2027,BEV,GB,completed,2026-10-15,38,GBP,DAP,40,GBP,DAP\n`;
      await api('ada', 'POST', '/api/kpi/import', { fileBase64: b64(csv) });
      const rows = await api('bob', 'GET', `/api/kpi/records?scope=all&all=1&search=P06-RACE&${f({ datePreset: 'all' })}`);
      results.P06_newer_unapproved_wins = (rows.json?.rows ?? []).map((r: any) => ({ tool: r.sourceTool, status: r.status, costingDate: r.costingDate, role: r.role, gapGbp: r.gapGbp }));
    }
    // ── P07 a validated saving disappears when the owner saves a new revision ────────────────
    {
      const s = await save('alice', 'sc-p07a', { partNumber: 'P07-SAVE', componentName: 'Saving part', programme: 'EMA', modelYear: 2028, powertrain: 'BEV', currentCost: 20, currentCcy: 'GBP', currentTerms: 'DAP' }, 18);
      await api('ada', 'PATCH', `/api/kpi/records/${s.json.record.id}`, { savingStatus: 'validated', savingPerPiece: 1.5, savingCcy: 'GBP' });
      const before = await api('bob', 'GET', `/api/kpi/summary?${f({ datePreset: 'all', programme: ['EMA'] })}`);
      await save('alice', 'sc-p07b', { partNumber: 'P07-SAVE', componentName: 'Saving part', programme: 'EMA', modelYear: 2028, powertrain: 'BEV', currentCost: 19, currentCcy: 'GBP', currentTerms: 'DAP' }, 18);
      const after = await api('bob', 'GET', `/api/kpi/summary?${f({ datePreset: 'all', programme: ['EMA'] })}`);
      results.P07_saving_lost_on_revision = { validatedBefore: before.json?.financial?.validatedSavings, validatedAfterNewRevision: after.json?.financial?.validatedSavings };
    }
    // ── P08 part-number variants are different components; P09 future date + imported "approved" ──
    {
      const csv = `${head}\nCSS System,V-1,R. Rao,LR-VAR-100,Variant,Casting,L460,2027,BEV,GB,completed,2026-10-01,5,GBP,DAP,6,GBP,DAP\nCSS System,V-2,R. Rao,LRVAR100,Variant,Casting,L460,2027,BEV,GB,completed,2026-10-02,5,GBP,DAP,6,GBP,DAP\nCSS System,V-3,R. Rao,LR_VAR_100,Variant,Casting,L460,2027,BEV,GB,completed,2026-10-03,5,GBP,DAP,6,GBP,DAP\nCSS System,F-1,R. Rao,P09-FUTURE,Future dated,Casting,L460,2027,BEV,GB,approved,2031-01-01,5,GBP,DAP,9,GBP,DAP\n`;
      const imp = await api('ada', 'POST', '/api/kpi/import', { fileBase64: b64(csv) });
      const rows = await api('bob', 'GET', `/api/kpi/records?scope=all&all=1&search=VAR&${f({ datePreset: 'all' })}`);
      const fut = await api('bob', 'GET', `/api/kpi/records?scope=all&all=1&search=P09&${f({ datePreset: 'all' })}`);
      results.P08_P09_import = {
        importStatus: imp.status, variantsAsSeparateCurrentRecords: (rows.json?.rows ?? []).map((r: any) => `${r.partNumber}:${r.role}`),
        futureDatedImported: (fut.json?.rows ?? []).map((r: any) => ({ costingDate: r.costingDate, status: r.status, role: r.role })),
      };
    }
    // ── P10 personal data / internal ids in list rows; owner label falls back to e-mail ─────────
    {
      await save('gone', 'sc-p10', { partNumber: 'P10-NONAME', componentName: 'Account without a name', programme: 'JEA', modelYear: 2028, powertrain: 'BEV' }, 7);
      const rows = await api('bob', 'GET', `/api/kpi/records?scope=all&all=1&search=P10&${f({ datePreset: 'all' })}`);
      const any = await api('bob', 'GET', `/api/kpi/records?scope=all&pageSize=5&${f({ datePreset: 'all' })}`);
      const meta = await api('bob', 'GET', '/api/kpi/meta');
      results.P10_ids_and_emails = {
        ownerNameShown: rows.json?.rows?.[0]?.ownerName, rowCarriesOwnerId: rows.json?.rows?.[0]?.ownerId,
        importOwnerIdExample: (any.json?.rows ?? []).map((r: any) => r.ownerId).find((x: string) => x.startsWith('import:')),
        metaReturnsUserId: !!meta.json?.userId,
      };
    }
    // ── P11 no rate limit on the bulk endpoints ─────────────────────────────────────────────
    {
      const t0 = Date.now();
      const codes = await Promise.all(Array.from({ length: 60 }, () => api('bob', 'GET', `/api/kpi/records?scope=all&all=1&${f({ datePreset: 'all' })}`).then(r => r.status)));
      results.P11_rate_limit = { requests: 60, statuses: [...new Set(codes)], ms: Date.now() - t0 };
    }
    // ── P12 an over-long filter is silently dropped (server answers the UNFILTERED view) ─────
    {
      const many = Array.from({ length: 200 }, (_, i) => `Programme-name-padding-${i}-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);
      const big = await api('bob', 'GET', `/api/kpi/summary?${f({ datePreset: 'all', programme: many })}`);
      const none = await api('bob', 'GET', `/api/kpi/summary?${f({ datePreset: 'all', programme: ['NOPE'] })}`);
      results.P12_long_filter = {
        filterJsonChars: JSON.stringify({ datePreset: 'all', programme: many }).length, overLongFilterStatus: big.status, overLongFilterBodyHead: big.text.slice(0, 200),
        overLongFilterResultTotal: big.json?.operational?.totalRecords, overLongFilterEchoedProgrammes: big.json?.filters?.programme?.length, overLongFilterEchoedPreset: big.json?.filters?.datePreset,
        matchingNothingResultTotal: none.json?.operational?.totalRecords,
      };
    }
    // ── P13 unauthenticated + non-admin checks (positive controls) ───────────────────────────
    {
      results.P13_controls = {
        noTokenSummary: (await call(null, 'GET', '/api/kpi/summary')).status,
        userExcludedList: (await api('bob', 'GET', `/api/kpi/records?scope=excluded&${f({ datePreset: 'all' })}`)).status,
        userAudit: (await api('bob', 'GET', '/api/kpi/audit')).status,
        userFxPolicy: (await api('bob', 'PUT', '/api/kpi/fx/policy', { policy: 'reporting-date' })).status,
        userRecalc: (await api('bob', 'POST', '/api/kpi/fx/recalculate', { apply: true })).status,
        userImport: (await api('bob', 'POST', '/api/kpi/import', { fileBase64: b64('x') })).status,
        userEditsOthersRecord: (await api('bob', 'PATCH', `/api/kpi/records/${(await api('ada', 'GET', `/api/kpi/records?scope=all&search=P07&${f({ datePreset: 'all' })}`)).json?.rows?.[0]?.id}`, { notes: 'x' })).status,
        userSetsApproved: (await api('bob', 'PATCH', `/api/kpi/records/${(await save('bob', 'sc-p13', { partNumber: 'P13', componentName: 'c' }, 3)).json.record.id}`, { status: 'approved' })).status,
      };
    }
    // ── P14 an owner inflates a VALIDATED annual volume; the flag stays validated ─────────────
    {
      const s = await save('alice', 'sc-p14', { partNumber: 'P14-VOL', componentName: 'Volume part', programme: 'VOLPROG', modelYear: 2028, powertrain: 'BEV', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP' }, 10);
      const id = s.json.record.id;
      await api('ada', 'PATCH', `/api/kpi/records/${id}`, { annualVolume: 60000, volumeValidated: true, status: 'approved' });
      const before = await api('bob', 'GET', `/api/kpi/summary?${f({ datePreset: 'all', programme: ['VOLPROG'] })}`);
      const patch = await api('alice', 'PATCH', `/api/kpi/records/${id}`, { annualVolume: 6000000 });
      const rec = await api('ada', 'GET', `/api/kpi/records/${id}`);
      const after = await api('bob', 'GET', `/api/kpi/summary?${f({ datePreset: 'all', programme: ['VOLPROG'] })}`);
      results.P14_owner_inflates_validated_volume = {
        ownerPatchStatus: patch.status, stillValidated: rec.json?.record?.volumeValidated, statusAfter: rec.json?.record?.status, volumeAfter: rec.json?.record?.annualVolume,
        annualisedBefore: before.json?.financial?.annualised, annualisedAfter: after.json?.financial?.annualised,
      };
    }
    // ── P15 should-cost is whatever the client posts (no server re-derivation) ───────────────
    {
      const s = await api('bob', 'POST', '/api/kpi/records', { scenario: { id: 'sc-p15', name: 'Forged total', commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result: { total: 0.01, breakdown: { rawMaterial: 999, process: 999 } } }, details: { status: 'completed', partNumber: 'P15-FAKE', componentName: 'Forged total', programme: 'FAKEPROG', modelYear: 2027, powertrain: 'BEV', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP' } });
      const sum = await api('ada', 'GET', `/api/kpi/summary?${f({ datePreset: 'all', programme: ['FAKEPROG'] })}`);
      results.P15_client_supplied_should_cost = { saveStatus: s.status, storedShouldCost: s.json?.record?.shouldCost, breakdownSum: 1998, opportunityGbp: sum.json?.financial?.opportunity?.gbp };
    }
    // ── P16 programme case variants split one component ──────────────────────────────────────
    {
      await save('alice', 'sc-p16a', { partNumber: 'P16-CASE', componentName: 'Case part', programme: 'Q900', modelYear: 2028, powertrain: 'BEV', currentCost: 9, currentCcy: 'GBP', currentTerms: 'DAP' }, 7);
      await save('bob', 'sc-p16b', { partNumber: 'P16-CASE', componentName: 'Case part', programme: 'q900', modelYear: 2028, powertrain: 'BEV', currentCost: 9, currentCcy: 'GBP', currentTerms: 'DAP' }, 7);
      const rows = await api('ada', 'GET', `/api/kpi/records?scope=all&all=1&search=P16-CASE&${f({ datePreset: 'all' })}`);
      results.P16_programme_case = (rows.json?.rows ?? []).map((r: any) => `${r.programme}:${r.role}`);
    }
    // ── P17 malformed filter JSON silently returns the UNFILTERED view ───────────────────────
    {
      const bad = await api('bob', 'GET', `/api/kpi/summary?f=${encodeURIComponent('{"programme":["NOPE"')}`);
      const good = await api('bob', 'GET', `/api/kpi/summary?${f({ programme: ['NOPE'] })}`);
      results.P17_malformed_filter = { malformedStatus: bad.status, malformedTotal: bad.json?.operational?.totalRecords, wellFormedNoMatchTotal: good.json?.operational?.totalRecords };
    }
    results.serverErrors = (log.match(/\[kpi\][^\n]*/g) ?? []);
  } finally {
    writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), database: 'throwaway temp SQLite in /tmp (deleted with the temp dir)', results }, null, 1));
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
  }
  console.log(JSON.stringify(results, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
