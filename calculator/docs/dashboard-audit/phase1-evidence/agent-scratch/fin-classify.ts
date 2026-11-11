import { classifyRecords, buildFromClassified, DEFAULT_FILTERS, resolveFx, normalisePartNumber, type KpiRecord } from '../../../../src/engine/kpi-dashboard.js';
const base = (o: Partial<KpiRecord>): KpiRecord => ({
  id: 'x', sourceTool: 'CostVision', sourceRef: '', ownerId: 'A', ownerName: 'A', partNumber: 'LR100', componentName: 'Knuckle',
  commodity: 'Casting', programme: 'L460', modelYear: 2027, powertrain: 'BEV', country: 'UK', status: 'completed',
  costingDate: '2026-10-01', createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z',
  shouldCost: 10, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: 14, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: 'PO',
  costUnit: 'piece', annualVolume: 100000, volumeValidated: true, savingStatus: null, savingPerPiece: null, savingCcy: null,
  fx: {}, gbpShould: 10, gbpCurrent: 14, gbpSaving: null, isTest: false, deleted: false, notes: '', ...o });
const opts = { today: '2026-11-11', nowIso: '2026-11-11T12:00:00Z', fxPolicy: 'monthly' as const, approvedRates: 0, referenceLabel: 'ref' };
const show = (title: string, recs: KpiRecord[], f = DEFAULT_FILTERS) => {
  const c = classifyRecords(recs); const s = buildFromClassified(c, f, opts);
  console.log(`\n== ${title}`);
  for (const r of c) console.log(`  ${r.id} owner=${r.ownerId} status=${r.status} date=${r.costingDate} role=${r.role} eligible=${r.eligible} saving=${r.savingStatus}`);
  console.log(`  KPI: eligible=${s.financial.eligible} opp=£${s.financial.opportunity.gbp} annualised=£${s.financial.annualised.gbp} validatedSavings=£${s.financial.validatedSavings.gbp} current=${s.operational.currentRecords} unique=${s.operational.uniqueComponents}`);
};
// 1 approved costing displaced by a newer unapproved costing by another user
show('1 approved (A) then newer completed by B', [
  base({ id: 'A-approved', status: 'approved', currentCost: 14 }),
  base({ id: 'B-new', ownerId: 'B', ownerName: 'B', status: 'completed', costingDate: '2026-11-05', currentCost: 9, gbpCurrent: 9, volumeValidated: false }),
]);
// 2 admin-set saving on rev 1, owner saves rev 2
show('2 validated saving on rev1, owner saves rev2', [
  base({ id: 'rev1', savingStatus: 'validated', savingPerPiece: 2, savingCcy: 'GBP', gbpSaving: 2 }),
  base({ id: 'rev2', costingDate: '2026-11-01', volumeValidated: false }),
]);
// 3 future-dated import hides the application in default 12m view
show('3 future-dated import + real current costing (default Last 12 months)', [
  base({ id: 'real-2026', costingDate: '2026-10-01' }),
  base({ id: 'import-2030', sourceTool: 'CSS System', ownerId: 'import:CSS System:X', costingDate: '2030-01-01' }),
]);
// 4 still-current costing saved 14 months ago
show('4 current costing 14 months old, default 12m', [ base({ id: 'old-but-current', costingDate: '2025-09-01' }) ]);
show('4b same, All time', [ base({ id: 'old-but-current', costingDate: '2025-09-01' }) ], { ...DEFAULT_FILTERS, datePreset: 'all' });
// 5 historical period: what was valid in 2025?
show('5 custom 2025 window: rev1 (2025-06, gap 4) superseded by rev2 (2026-06, gap 0)', [
  base({ id: 'rev1-2025', costingDate: '2025-06-01' }),
  base({ id: 'rev2-2026', costingDate: '2026-06-01', currentCost: 10, gbpCurrent: 10 }),
], { ...DEFAULT_FILTERS, datePreset: 'custom', dateFrom: '2025-01-01', dateTo: '2025-12-31' });
// 6 same-day tie broken by updatedAt: editing notes on the older one flips current
show('6 same day, older save later edited (notes)', [
  base({ id: 'save-0900', createdAt: '2026-11-10T09:00:00Z', updatedAt: '2026-11-10T16:00:00Z', costingDate: '2026-11-10', currentCost: 14 }),
  base({ id: 'save-1500', createdAt: '2026-11-10T15:00:00Z', updatedAt: '2026-11-10T15:00:00Z', costingDate: '2026-11-10', currentCost: 11, gbpCurrent: 11 }),
]);
// 7 two countries / two routes / supplier quotes by same owner
show('7 same owner, UK casting v CN forging route of same part', [
  base({ id: 'UK-casting', country: 'UK', commodity: 'Casting', costingDate: '2026-11-01' }),
  base({ id: 'CN-forging', country: 'CN', commodity: 'Forging', costingDate: '2026-11-02', currentCost: 11, gbpCurrent: 11 }),
]);
// 8 commodity filter after classification: CN forging current, filter Casting
show('8 same as 7 filtered commodity=Casting', [
  base({ id: 'UK-casting', country: 'UK', commodity: 'Casting', costingDate: '2026-11-01' }),
  base({ id: 'CN-forging', country: 'CN', commodity: 'Forging', costingDate: '2026-11-02' }),
], { ...DEFAULT_FILTERS, commodity: ['Casting'] });
// 9 part-number normalisation
for (const p of ['LR100', 'lr 100', 'LR-100', 'LR.100', 'LR100A', 'LR0100', 'LR‑100', 'LR​100', 'LR100 rev B'])
  console.log('  normalise', JSON.stringify(p), '->', normalisePartNumber(p));
// 10 programme casing
show('10 programme "L460" v "l460"', [ base({ id: 'p1' }), base({ id: 'p2', programme: 'l460', ownerId: 'B', costingDate: '2026-11-02' }) ]);
// 11 FX costing-date policy: stale daily beats monthly row for the month
const table = [ { currency: 'EUR', period: '2019-03-15', gbpPerUnit: 0.86, source: 'old daily', loadedAt: '' }, { currency: 'EUR', period: '2026-11', gbpPerUnit: 0.8358, source: 'Nov monthly', loadedAt: '' } ];
console.log('\n== 11 costing-date policy', JSON.stringify(resolveFx('EUR', '2026-11-11', 'costing-date', table, { rates: {}, source: 'r', effectiveDate: 'r' }, 'now')));
const t2 = [ { currency: 'EUR', period: '2027-12', gbpPerUnit: 0.70, source: 'budget 2027', loadedAt: '' }, { currency: 'EUR', period: '2026-11', gbpPerUnit: 0.8358, source: 'Nov monthly', loadedAt: '' } ];
console.log('== 11b reporting-date policy picks', JSON.stringify(resolveFx('EUR', '2026-11-11', 'reporting-date', t2, { rates: {}, source: 'r', effectiveDate: 'r' }, 'now')));
console.log('== 11c monthly, 2019 costing, no 2019 row -> reference', JSON.stringify(resolveFx('USD', '2019-04-01', 'monthly', [], { rates: { USD: 0.7509 }, source: 'Oct 2026 ref', effectiveDate: '2026-10-30' }, 'now')));
// 12 netting check: gap +4 and -4
show('12 netting', [ base({ id: 'g+' }), base({ id: 'g-', partNumber: 'LR200', currentCost: 6, gbpCurrent: 6 }) ]);
