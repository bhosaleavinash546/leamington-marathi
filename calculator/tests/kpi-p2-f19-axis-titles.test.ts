/**
 * Phase 2 · F-19 (polish): every Chart.js chart on the dashboard names its axes, and the value axis names its
 * unit — "£ per piece" for money, a count for records / saves. (The doughnut has no axes; the heatmap and the
 * status bar are HTML with their own labels.) The same configs draw the PDF's chart images.
 */
import { describe, it, expect } from 'vitest';
import { buildDashboard, classifyRecords, DEFAULT_FILTERS, toGbp, type KpiRecord, type FxApplied } from '../src/engine/kpi-dashboard';
import { chartSpecs, withLightTheme } from '../src/ui/kpi-dashboard/kpi-charts';

const NOW = '2026-11-11T09:00:00Z';
const fx = (c: string, r: number): FxApplied => ({ currency: c, gbpPerUnit: r, source: 'Treasury', effectiveDate: '2026-11', retrievedAt: NOW, method: c === 'GBP' ? 'identity' : 'monthly', approved: true });
function rec(id: string, p: Partial<KpiRecord>): KpiRecord {
  const r: KpiRecord = {
    id, sourceTool: 'CostVision', sourceRef: 'sc-' + id, ownerId: 'u1', ownerName: 'A', partNumber: 'P-' + id, componentName: 'Part',
    commodity: 'Casting', programme: 'L460', modelYear: 2027, powertrain: 'BEV', country: 'UK', status: 'completed', costingDate: '2026-10-01',
    createdAt: NOW, updatedAt: NOW, shouldCost: 10, shouldCcy: 'GBP', shouldTerms: 'DAP', currentCost: 12, currentCcy: 'GBP', currentTerms: 'DAP', currentSource: 'quote',
    costUnit: 'piece', annualVolume: null, volumeValidated: false, savingStatus: null, savingPerPiece: null, savingCcy: null,
    fx: { should: fx('GBP', 1), current: fx('GBP', 1) }, gbpShould: null, gbpCurrent: null, gbpSaving: null, isTest: false, deleted: false, notes: '', ...p,
  };
  r.gbpShould = toGbp(r.shouldCost, r.fx.should); r.gbpCurrent = toGbp(r.currentCost, r.fx.current);
  return r;
}
const records = classifyRecords([rec('a', {}), rec('b', { commodity: 'Forging', programme: 'L461', powertrain: 'PHEV', modelYear: 2028 })]) as unknown as KpiRecord[];
const summary = buildDashboard(records, { ...DEFAULT_FILTERS, datePreset: 'all' }, { today: '2026-11-11', nowIso: NOW, fxPolicy: 'monthly', approvedRates: 1, referenceLabel: 'ref' });

type Scale = { title?: { display?: boolean; text?: string; color?: string } };
async function scalesOf(): Promise<Record<string, { type: string; x?: Scale; y?: Scale }>> {
  const out: Record<string, { type: string; x?: Scale; y?: Scale }> = {};
  await withLightTheme(async () => {
    for (const sp of chartSpecs(summary)) {
      if (!sp.config) continue;
      const c = sp.config();
      const sc = (c.options?.scales ?? {}) as { x?: Scale; y?: Scale };
      out[sp.id] = { type: c.type, x: sc.x, y: sc.y };
    }
  });
  return out;
}
const title = (s?: Scale) => (s?.title?.display ? s.title.text : undefined);

describe('F-19: chart axis titles with units', () => {
  it('every chart with axes titles both axes', async () => {
    const all = await scalesOf();
    const withAxes = Object.entries(all).filter(([, c]) => c.type !== 'doughnut');
    expect(withAxes.length).toBe(8);
    for (const [id, c] of withAxes) {
      expect(title(c.x), `${id} x`).toBeTruthy();
      expect(title(c.y), `${id} y`).toBeTruthy();
    }
  });
  it('the value axis carries its unit: £ per piece for money, a count otherwise', async () => {
    const all = await scalesOf();
    // vertical charts: value on y; horizontal: value on x
    expect(title(all.activity.y)).toBe('Costings saved (count)');
    expect(title(all.activity.x)).toBe('Costing date');
    expect(title(all.commodity.x)).toBe('Records (count)');
    expect(title(all.commodity.y)).toBe('Commodity');
    expect(title(all.cost.y)).toBe('£ per piece (Σ of eligible records)');
    expect(title(all.cost.x)).toBe('Commodity');
    expect(title(all.opportunity.x)).toBe('£ per piece (Σ of gaps above should-cost)');
    expect(title(all.opportunity.y)).toBe('Commodity');
    expect(title(all.programme.y)).toBe('Current records (count)');
    expect(title(all.programme.x)).toBe('Programme');
    expect(title(all.modelyear.y)).toBe('Current records (count)');
    expect(title(all.modelyear.x)).toBe('Model year');
    expect(title(all.tool.x)).toBe('Records (count)');
    expect(title(all.tool.y)).toBe('Costing tool');
    expect(title(all['opp-powertrain'].y)).toBe('£ per piece (Σ of gaps above should-cost)');
    expect(title(all['opp-powertrain'].x)).toBe('Powertrain');
  });
  it('titles are drawn in the theme text colour, not a series colour', async () => {
    const all = await scalesOf();
    const titled = Object.values(all).flatMap(c => [c.x, c.y]).filter(s => s?.title?.display);
    expect(titled.length).toBe(16);
    for (const s of titled) expect(s!.title!.color).toBe('#374769');
  });
});
