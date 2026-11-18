/** Phase 2 · A-28 (b) evidence: write the workbook of tests/kpi-p2-a28b-reconciliation-rows.test.ts's fixture (plus
 *  one negative gap) to a file for the LibreOffice recalculation.  npx tsx unit-book.ts <out.xlsx> (from calculator/) */
import { writeFileSync } from 'node:fs';
import { buildDashboard, classifyRecords, DEFAULT_FILTERS, toGbp, type KpiRecord, type FxApplied } from '../../../../src/engine/kpi-dashboard';
import { buildExcel, type ExportRow } from '../../../../src/ui/kpi-dashboard/kpi-export';
const NOW = '2026-11-11T09:00:00Z';
const fx = (c: string, r: number): FxApplied => ({ currency: c, gbpPerUnit: r, source: 'Treasury', effectiveDate: '2026-11', retrievedAt: NOW, method: c === 'GBP' ? 'identity' : 'monthly', approved: true });
function rec(id: string, p: Partial<KpiRecord>): KpiRecord {
  const r: KpiRecord = { id, sourceTool: 'CostVision', sourceRef: 'sc-' + id, ownerId: 'u1', ownerName: 'A', partNumber: 'P-' + id, componentName: 'Part', commodity: 'Casting', programme: 'L460', modelYear: 2027, powertrain: 'BEV', country: 'UK', status: 'completed', costingDate: '2026-10-01', createdAt: NOW, updatedAt: NOW, shouldCost: 10, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: 'quote', costUnit: 'piece', annualVolume: null, volumeValidated: false, savingStatus: null, savingPerPiece: null, savingCcy: null, fx: { should: fx('GBP', 1), current: fx('GBP', 1) }, gbpShould: null, gbpCurrent: null, gbpSaving: null, isTest: false, deleted: false, notes: '', ...p };
  r.gbpShould = toGbp(r.shouldCost, r.fx.should); r.gbpCurrent = toGbp(r.currentCost, r.fx.current);
  r.gbpSaving = r.savingPerPiece === null ? null : toGbp(r.savingPerPiece, r.savingCcy === 'EUR' ? fx('EUR', 0.85) : fx('GBP', 1));
  return r;
}
const records = [
  rec('a', { annualVolume: 60000, volumeValidated: true, savingStatus: 'validated', savingPerPiece: 0.8, savingCcy: 'GBP' }),
  rec('b', { programme: 'L461', currentCost: 11.5, annualVolume: 40000, volumeValidated: true, savingStatus: 'implemented', savingPerPiece: 1.5, savingCcy: 'EUR' }),
  rec('c', { programme: 'L462', annualVolume: 99999, volumeValidated: false }),
  rec('d', { programme: 'L663', currentCost: 5.97, annualVolume: 10000, volumeValidated: true }),
  rec('e', { programme: 'EMA', currentCost: null, currentCcy: null, savingStatus: 'validated', savingPerPiece: 0.25, savingCcy: 'GBP' }),
];
const s = buildDashboard(records, { ...DEFAULT_FILTERS, datePreset: 'all' }, { today: '2026-11-11', nowIso: NOW, fxPolicy: 'monthly', approvedRates: 1, referenceLabel: 'ref' });
buildExcel(s, classifyRecords(records) as unknown as ExportRow[]).then(async b => { writeFileSync(process.argv[2], Buffer.from(await b.arrayBuffer())); console.log(JSON.stringify(s.financial)); });
