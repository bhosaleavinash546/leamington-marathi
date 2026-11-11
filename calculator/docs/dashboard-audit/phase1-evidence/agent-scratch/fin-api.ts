// Drives the real /api/kpi router on a throw-away DB (scratchpad), never the app's data.
process.env.CV_DATA_DIR = `/tmp/claude-0/-home-user-leamington-marathi/8bf32d1a-7485-5bd6-9947-7843ee6c5644/scratchpad/kpi-db-${Date.now()}`;
process.env.JWT_SECRET = 'scratch-secret-0123456789abcdef0123456789abcdef';
process.env.AIR_GAPPED = '1';
const main = async () => {
  const express = (await import('express')).default;
  const db = (await import('../../../../server/db.js')).default;
  const kpi = (await import('../../../../server/routes/kpi.js')).default;
  const { signToken, requireAuth } = await import('../../../../server/middleware/auth-middleware.js');
  const now = new Date().toISOString();
  for (const [id, role] of [['alice', 'user'], ['bob', 'user'], ['admin', 'admin']])
    db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_verified, role, created_at) VALUES (?, ?, 'x', ?, 1, ?, ?)`).run(id, `${id}@t`, id, role, now);
  const app = express(); app.use(express.json({ limit: '10mb' })); app.use('/api/kpi', requireAuth, kpi);
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const call = async (u: string, m: string, p: string, b?: unknown) => { const r = await fetch(base + p, { method: m, headers: { Authorization: `Bearer ${signToken(u, u + '@t', true)}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const save = (u: string, id: string, total: number, over: object = {}) => call(u, 'POST', '/api/kpi/records', { scenario: { id, name: 'K', commodity: 'casting', region: 'UK', input: { deliveryTerms: 'DAP' }, result: { total } }, details: { partNumber: 'LR-100', programme: 'L460', modelYear: 2027, powertrain: 'BEV', status: 'completed', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', annualVolume: 1000, ...over } });
  const sum = async () => (await call('admin', 'GET', `/api/kpi/summary?f=${encodeURIComponent(JSON.stringify({ datePreset: 'all' }))}`)).j.financial;

  // A: client-supplied should-cost is stored as is
  const a = await save('alice', 'sc-a1', 0.01); console.log('A should-cost from client result.total=0.01 →', a.s, a.j.record.shouldCost, 'gap', a.j.record.gapGbp);
  const id = a.j.record.id;
  // B: admin validates volume; owner then raises the volume — flag survives
  await call('admin', 'PATCH', `/api/kpi/records/${id}`, { volumeValidated: true, status: 'approved' });
  console.log('B after admin validation, annualised =', (await sum()).annualised);
  const b = await call('alice', 'PATCH', `/api/kpi/records/${id}`, { annualVolume: 1000000 });
  console.log('B owner sets annualVolume 1,000,000 →', b.s, 'volumeValidated', b.j.record.volumeValidated, 'status', b.j.record.status, 'annualised =', (await sum()).annualised);
  // C: owner changes part number / programme of an approved record — status kept
  const c = await call('alice', 'PATCH', `/api/kpi/records/${id}`, { partNumber: 'LR-999', programme: 'L663' });
  console.log('C owner moves approved record to LR-999/L663 →', c.s, 'status', c.j.record.status);
  // D: owner marks own record test (doc: admin-only) and owner un-marks an admin's test flag
  const d = await call('alice', 'PATCH', `/api/kpi/records/${id}`, { isTest: true }); console.log('D owner sets isTest →', d.s, d.j?.record?.isTest ?? d.j);
  const d2 = await call('alice', 'PATCH', `/api/kpi/records/${id}`, { isTest: false }); console.log('D owner clears isTest →', d2.s);
  // E: owner downgrades approved → draft
  const e = await call('alice', 'PATCH', `/api/kpi/records/${id}`, { status: 'draft' }); console.log('E owner approved→draft →', e.s, e.j.record.status);
  // F: admin sets saving; owner changes current cost: saving stays
  await call('admin', 'PATCH', `/api/kpi/records/${id}`, { savingStatus: 'validated', savingPerPiece: 5, savingCcy: 'GBP' });
  const f = await call('alice', 'PATCH', `/api/kpi/records/${id}`, { currentCost: 0.5 });
  console.log('F owner cuts current cost to 0.5 after a validated £5 saving →', f.j.record.savingStatus, f.j.record.savingPerPiece, 'validatedSavings', (await sum()).validatedSavings);
  // G: import claiming approved + validated volume + validated saving, future date
  const csv = 'source_tool,source_record_id,owner,part_number,component_name,status,costing_date,should_cost,should_currency,should_terms,current_cost,current_currency,current_terms,annual_volume,volume_validated,saving_status,saving_per_piece,saving_currency\r\nCSS System,X1,Someone,LR-999,K,approved,2031-01-01,1,GBP,DAP,50,GBP,DAP,9000000,yes,implemented,40,GBP\r\n';
  const g = await call('admin', 'POST', '/api/kpi/import', { fileBase64: Buffer.from(csv).toString('base64') }); console.log('G import approved+validated+implemented, 2031 date →', g.s, g.j);
  const all = await call('admin', 'GET', `/api/kpi/records?scope=all&f=${encodeURIComponent(JSON.stringify({ datePreset: 'all' }))}`);
  for (const r of all.j.rows) console.log('   ', r.id.slice(0, 12), r.partNumber, r.programme, r.costingDate, r.status, r.role, 'vol', r.annualVolume, r.volumeValidated, 'saving', r.savingStatus);
  console.log('G all-time financial', JSON.stringify(await sum()));
  console.log('G default 12m financial', JSON.stringify((await call('admin', 'GET', '/api/kpi/summary')).j.financial));
  // H: FX re-upload overwrites with no history in fx_rates
  const up = (rate: number) => call('admin', 'POST', '/api/kpi/fx/rates', { fileBase64: Buffer.from(`currency,period,gbp_per_unit,source\r\nEUR,2026-11,${rate},Treasury\r\n`).toString('base64') });
  await up(0.84); await up(1.19);
  console.log('H fx table after two uploads (second = inverted EUR, accepted):', JSON.stringify((await call('admin', 'GET', '/api/kpi/fx')).j.rates));
  console.log('H audit rows:', JSON.stringify((await call('admin', 'GET', '/api/kpi/audit')).j.rows.filter((r: any) => r.action === 'fx.load')));
  srv.close();
};
main().catch(e => { console.error(e); process.exit(1); });
