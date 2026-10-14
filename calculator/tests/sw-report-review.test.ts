/**
 * Independent review of the 360 software report (14 Oct 2026, docs/review/sw-report-360-build-2026-10-14.md §Review):
 * each finding pinned so it cannot come back.
 */
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeSWProgram, type SWProgramInputs } from '../src/engine/sw-should-cost.js';
import { buildSWReportModel, type SWReportProfile } from '../src/engine/sw-report-model.js';
import { buildSWReportRequest } from '../src/export/sw-report-request.js';
import { renderSWReportPdf } from '../src/export/sw-report-pdf.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../src/ui/panels/sw-should-cost-ui.js';

const prog = (id: string): SWProgramInputs => ({ ...buildVehicleInputs(SW_VEHICLE_DEMOS.find(d => d.id === id)!), annualProductionVolume: 200_000, programLifeYears: 6 });
const report = (p: SWProgramInputs, profile: SWReportProfile = 'vehicle', extra: Record<string, unknown> = {}, currency?: { code: string; sym: string; perGbp: number }) => {
  const r = computeSWProgram(p);
  const fmt = currency ? { money: (n: number, dp = 0) => `${currency.sym}${(n * currency.perGbp).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`,
    moneyM: (n: number) => `${currency.sym}${(n * currency.perGbp / 1e6).toFixed(1)}M`, number: (n: number, dp = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: dp, minimumFractionDigits: dp }) } : undefined;
  const model = buildSWReportModel(r, buildSWReportRequest(r, { options: { profile, ...extra }, title: 'Review', currency, fmt, generatedAt: new Date(2026, 9, 14) }));
  const texts: string[] = [];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const orig = doc.text.bind(doc);
  (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (...a: unknown[]) => { texts.push(Array.isArray(a[0]) ? (a[0] as string[]).join(' ') : String(a[0])); return orig(...(a as Parameters<typeof orig>)); };
  renderSWReportPdf(doc, autoTable as never, model);
  return { model, text: texts.join('\n') };
};
const quoted = (): SWProgramInputs => {
  const p = prog('rr_l460');
  const c = { id: 'custom-airbag', name: 'Occupant restraint (airbag) control', category: 'D' as const, nominalPersonMonths: 120, defaultAsil: 'D' as const, defaultComplexity: 'High' as const, source: 'Our 2024 restraint ECU programme' };
  return { ...p, quotes: { cloudPerVehicleYear: { value: 6, source: 'AWS proposal 2026-09' } }, customModules: [c],
    modules: [...p.modules, { moduleId: c.id, enabled: true, asil: 'D', complexity: 'High', reuse: 'Fresh', customPersonMonths: null }] };
};

describe('review findings', () => {
  const v = report(prog('rr_l460'));
  it('H1: the per-vehicle volume row is printed in £ per vehicle, never as £0.0M in the tornado', () => {
    expect(v.text).toMatch(/Per vehicle — what volume does/);
    expect(v.text).not.toMatch(/Production volume[^\n]*£0\.0M/);
  });
  it('H2 / H3: a quoted cloud names its quote; a covered gap is not repeated; line quotes are acknowledged', () => {
    const q = report(quoted());
    expect(q.model.assumptions.find(([k]) => k.startsWith('Cloud'))![1]).toMatch(/Your quote: £6\.00 .* AWS proposal 2026-09/);
    expect(q.model.gaps.some(g => /airbag/.test(g))).toBe(false);
    expect(q.model.gapsCovered.some(g => /airbag/.test(g))).toBe(true);
    expect(q.text).toMatch(/line-item quote/);
    expect(q.text).not.toMatch(/reference fleet — unsourced estimate\) × 100 % connected/);
  });
  it('H4 / H5: a focused report states its own evidence share, component count and calibration list', () => {
    const m = report(prog('rr_l460'), 'module', { moduleIds: ['bms_core', 'navigation'] });
    expect(m.model.slice.unsourcedShare).not.toBeCloseTo(v.model.slice.unsourcedShare, 3);
    expect(m.model.slice.components).toBeLessThan(v.model.components.length);
    const d = report(prog('rr_l460'), 'domain', { domains: ['B'] });
    expect(d.model.calibration.rows.at(-1)!.cumulative).toBeCloseTo(1, 9);
    expect(d.model.calibration.rows.every(x => d.model.modules.some(mm => mm.name === x.name))).toBe(true);
    expect(m.text).not.toMatch(/\(section 2\)/);
  });
  it('H6: an EUR report prints no £ amount in its text', () => {
    const e = report(prog('porsche_cayenne'), 'vehicle', {}, { code: 'EUR', sym: '€', perGbp: 1.17 });
    expect(e.text.match(/£\d[\d,.]*/g) ?? []).toEqual([]);
    expect(e.text).not.toMatch(/loaded £ per/);
  });
  it('M7 / M9: security support after the last build is its own unit-economics line; the target leaves homologation with the OEM', () => {
    expect(v.text).toMatch(/Security support after the last build/);
    expect(v.text).toMatch(/Homologation[\s\S]{0,120}stays with[\s\S]{0,4}the OEM/);
  });
  it('M10 / M11: royalty and cloud lines show their arithmetic; no module id or code constant reaches the page', () => {
    expect(v.text).toMatch(/1,200,000 vehicles × £/);
    expect(v.text).toMatch(/connected vehicle-years \(8 a vehicle\) × £/);
    expect(v.text).not.toMatch(/\b(vehicle_motion|edu_control|chassis_control|thermal_mgmt|USD_PER_GBP)\b/);
  });
  it('M12 / M13 / M14: off-vehicle cloud has no ASIL; a demo description is labelled; grammar', () => {
    expect(v.model.components.find(c => c.id === 'cloud')!.offVehicle).toBe(true);
    const ice = report(prog('porsche_cayenne_ice'));
    expect(ice.model.definition.find(([k]) => k === 'Vehicle')![1]).toMatch(/^Not provided|^Demo description/);
    expect(ice.text).not.toMatch(/by a oem|on a ICE|not on a ICE/);
    expect(ice.text).toMatch(/not used on an ICE vehicle/);
  });
});

describe('review: a conversion stated in the text is not converted again', () => {
  it('the hub build-up keeps "÷ FX EUR per £ = GBP x" in an EUR report', () => {
    const e = report(prog('porsche_cayenne'), 'vehicle', {}, { code: 'EUR', sym: '€', perGbp: 1.165 });
    expect(e.text).not.toMatch(/per £ = €/);
    expect(e.text).toMatch(/per £ = GBP \d/);
    expect(e.text).not.toMatch(/of the £ rests/);
  });
});
