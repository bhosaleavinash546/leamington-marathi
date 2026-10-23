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
    expect(q.text).toMatch(/line-item supplier quote/);
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
    expect(v.text).toMatch(/connected vehicle-years \(1,200,000 vehicles × 8 years\) × £/);
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

// ── Code review, 23 Oct 2026 (14 findings, docs/review/sw-report-360-build-2026-10-14.md §Code review) ─────────────────
import ExcelJS from 'exceljs';
import { coveredGaps, withDrivetrainArticle, type SWCustomModule } from '../src/engine/sw-should-cost.js';
import { buildSWReportWorkbook } from '../src/export/sw-report-xlsx.js';
import { hubRateFor } from '../src/export/sw-report-request.js';
import { swCostingSteps } from '../src/engine/sw-costing-steps.js';
import { hardenPdfText } from '../src/export/pdf.js';
import { localiseReportText } from '../src/export/money-text.js';

const withCustom = (c: Partial<SWCustomModule> & { id: string; name: string }, pm = 120): SWProgramInputs => {
  const p = prog('rr_l460');
  const mod: SWCustomModule = { category: 'D', nominalPersonMonths: pm, defaultAsil: 'B', defaultComplexity: 'Medium', source: 'test programme', ...c };
  return { ...p, customModules: [mod], modules: [...p.modules, { moduleId: mod.id, enabled: true, asil: 'B', complexity: 'Medium', reuse: 'Fresh', customPersonMonths: null }] };
};
const sheetText = async (bytes: Uint8Array, name: string) => {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(bytes) as never);
  const out: string[] = [];
  wb.getWorksheet(name)!.eachRow(r => r.eachCell(c => { if (c.isMerged && c.master !== c) return; const v = c.value; out.push(typeof v === 'object' && v && 'formula' in v ? String((v as ExcelJS.CellFormulaValue).result) : String(v ?? '')); }));
  return out.join('\n');
};

describe('code review fixes', () => {
  it('1: the workbook cover of a focused report counts the slice\'s components', async () => {
    const m = report(prog('rr_l460'), 'module', { moduleIds: ['bms_core'] }).model;
    const t = await sheetText(await buildSWReportWorkbook(m), 'Cover');
    expect(t).toContain(`Where the software runs: ${m.slice.components} vehicle components`);
    expect(m.slice.components).toBeLessThan(m.components.length);
  });
  it('2: evidence lines follow the module id — a name containing " — " keeps its lines and every check passes', () => {
    const p = withCustom({ id: 'custom-restraint', name: 'Restraint — airbag ECU' });
    const m = report(p, 'domain', { domains: ['D'] }).model;
    const own = m.evidenceLines.filter(l => l.moduleId === 'custom-restraint');
    expect(own.length).toBeGreaterThan(0);
    expect(m.modules.find(x => x.id === 'custom-restraint')!.evidence.length).toBe(own.length);
    expect(m.checks.filter(c => !c.ok)).toEqual([]);
  });
  it('3: a gap is covered only by an explicit link or its exact name — never a partial or empty name', () => {
    for (const name of ['Seat', 'T', 'Electric power steering', 'Electric', ' ']) expect(coveredGaps(withCustom({ id: 'custom-x', name }))).toEqual([]);
    expect(coveredGaps(withCustom({ id: 'custom-x', name: 'tyre-pressure MONITORING' }))).toEqual(['tpms']);
    expect(coveredGaps(withCustom({ id: 'custom-x', name: 'Our TPMS', coversGap: 'tpms' }))).toEqual(['tpms']);
    expect(coveredGaps(withCustom({ id: 'custom-x', name: 'Tyre-pressure monitoring' }, 0))).toEqual([]);   // no effort, not costed
  });
  it('4: the fixed £ is split at the last build — the platform paid in service years is not a production-year cost', () => {
    const p = { ...prog('rr_l460'), cloudFixedPerYearGBP: 1_000_000 };
    const m = report(p).model;
    const u = m.unit;
    expect(m.fixedSplit.production + m.fixedSplit.afterLastBuild).toBeCloseTo(u.fixedPerYear * p.programLifeYears, 2);
    expect(m.fixedSplit.platformAfter).toBeCloseTo(1_000_000 * (m.result.summary.horizonYears - p.programLifeYears), 2);
  });
  it('5: in a non-£ report the PDF measures the same converted text it draws (autoTable widths)', () => {
    const doc = hardenPdfText(new jsPDF({ unit: 'mm', format: 'a4' }), { fx: 1.17, sym: '€', localise: localiseReportText });
    expect(doc.getTextWidth('£525 a day')).toBeCloseTo(doc.getTextWidth('€614 a day'), 6);
    expect(localiseReportText('÷ 1.165 EUR per £ = £6,206', 1.165, '€')).toBe('÷ 1.165 EUR per £ = GBP 6,206');
  });
  it('6: the cloud line\'s count × rate equals its amount when part of the fleet is connected', () => {
    const m = report({ ...prog('rr_l460'), connectedVehicleShare: 0.8 }).model;
    const line = m.modules.flatMap(x => x.lines).find(l => l.label === 'Cloud')!;
    const nums = line.expr.match(/^([\d,]+) connected vehicle-years .*? × £([\d.]+)/)!;
    // the rate prints at 4 dp, so the product agrees to that precision
    expect(Number(nums[1].replace(/,/g, '')) * Number(nums[2]) / line.value).toBeCloseTo(1, 3);
  });
  it('7 / 11: only applied supplier quotes are counted, and the quote status is said once', async () => {
    const p0 = prog('rr_l460');
    const typedPM = { ...p0, modules: p0.modules.map((x, i) => (i < 2 ? { ...x, customPersonMonths: 50 } : x)) };
    expect(report(typedPM).model.quotesApplied).toBe(0);
    const offModule = { ...p0, quotes: { modules: { digital_key: { perVehicleBuilt: { value: 3, source: 'quote' } } } } };
    expect(report(offModule).model.quotesApplied).toBe(0);
    const q = report(quoted(), 'supplier').model;
    expect(q.quotesApplied).toBe(1);
    const t = await sheetText(await buildSWReportWorkbook(q), 'Make or buy');
    expect(t.match(/No total supplier quote/g)?.length).toBe(1);
  });
  it('9: security-support years are the engine\'s rounded figure', () => {
    const m = report({ ...prog('rr_l460'), postProductionSupportYears: 7.5 }).model;
    expect(m.postSupportYears).toBe(8);
  });
  it('10: salary observations print a readable annualisation, no raw float factors', () => {
    for (const hub of ['RO', 'RS', 'AT', 'US-MI', 'UK']) {
      const t = (hubRateFor(hub)?.sources ?? []).map(x => x[0]).join(' ');
      expect(t, hub).not.toMatch(/\d\.\d{4,}/);
    }
  });
  it('12: drivetrain articles — an ICE, an MHEV, a PHEV, a BEV', () => {
    expect(['ICE', 'MHEV', 'PHEV', 'BEV'].map(x => withDrivetrainArticle(x as never))).toEqual(['an ICE', 'an MHEV', 'a PHEV', 'a BEV']);
    const r = computeSWProgram(prog('bmw_x7'));
    const steps = swCostingSteps(r, { perPMGBP: 1, hubLabel: 'x', build: 'x' }, { money: n => String(n), number: n => String(n) });
    expect(steps[0].detail).toMatch(/on an MHEV vehicle/);
  });
  it('13: programme items carry their kind', () => {
    const m = report({ ...prog('rr_l460'), cloudFixedPerYearGBP: 500_000 }).model;
    expect(m.programmeItems.map(x => x.kind).sort()).toEqual(['cloudFixed', 'homologation']);
  });
});
