/**
 * Improvement round (14 Oct 2026, docs/review/rr-phev-software-costing-review-2026-10-14.md §6): supplier quotes and the
 * licence register, your own modules for software the catalogue lacks, bulk actuals for calibration, calibration
 * priorities, and the report builders the PDF and Excel share.
 */
import { describe, it, expect } from 'vitest';
import { computeSWProgram, validateSWInputs, swModuleDefs, customModuleDef, SW_MODULES, SW_CLOUD_REFERENCE_FLEET, SW_DEFAULT_SERVICE_YEARS,
  swCloudPerVehicleYear, type SWProgramInputs } from '../src/engine/sw-should-cost.js';
import { swEvidence, swCalibrationPriorities, SW_CATALOGUE_GAPS } from '../src/engine/sw-cockpit.js';
import { actualsTemplateCsv, parseActualsCsv, calibrateSWEffort } from '../src/engine/sw-calibration.js';
import { swYourFigures, swExcludedModules, swAssumptionRows } from '../src/export/sw-report-pdf.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../src/ui/panels/sw-should-cost-ui.js';
import { readFileSync } from 'node:fs';

const demo = SW_VEHICLE_DEMOS.find(d => d.id === 'rr_l460')!;
const base = (): SWProgramInputs => ({ ...buildVehicleInputs(demo), annualProductionVolume: 200_000, programLifeYears: 6 });

describe('supplier quotes replace catalogue figures and carry their source', () => {
  it('a cloud quote sets the whole back-end rate: cloud = rate × connected vehicle-years, graded yours', () => {
    const p = { ...base(), quotes: { cloudPerVehicleYear: { value: 6, source: 'AWS proposal 2026-09, ref A12' } } };
    const r = computeSWProgram(p);
    expect(swCloudPerVehicleYear(p)).toBeCloseTo(6, 9);
    expect(r.summary.totalCloud).toBeCloseTo(6 * 200_000 * 6 * SW_DEFAULT_SERVICE_YEARS, 0);
    const cloud = swEvidence(r).lines.filter(l => l.kind === 'cloud');
    expect(cloud.length).toBeGreaterThan(0);
    expect(cloud.every(l => l.grade === 'entered' && /AWS proposal 2026-09/.test(l.basis))).toBe(true);
  });
  it('module royalty and IP quotes move exactly their lines; the rest stay catalogue', () => {
    const p0 = base(), r0 = computeSWProgram(p0);
    const p = { ...p0, quotes: { modules: { tcu_software: { perVehicleBuilt: { value: 10, source: 'Avanci + TCU supplier quote Q3' } }, hmi_framework: { annualIP: { value: 50_000, source: 'Qt quote 2026' } } } } };
    const r = computeSWProgram(p);
    const tcu0 = r0.modules.find(m => m.moduleId === 'tcu_software')!, tcu = r.modules.find(m => m.moduleId === 'tcu_software')!;
    const def0 = SW_MODULES.find(m => m.id === 'tcu_software')!;
    expect(tcu.licensingCost - tcu0.licensingCost).toBeCloseTo((10 - def0.perVehicleRoyaltyGBP!) * 200_000 * 6, 0);
    const hmi = r.modules.find(m => m.moduleId === 'hmi_framework')!;
    expect(hmi.yearly.licences[0]).toBe(50_000);
    const ev = swEvidence(r).lines;
    expect(ev.find(l => l.label.startsWith('Telematics') && l.kind === 'royalties')!.grade).toBe('entered');
    expect(ev.find(l => l.label.startsWith('App Framework') && l.kind === 'licences')!.grade).toBe('entered');
    expect(ev.find(l => l.label.startsWith('Navigation') && l.kind === 'royalties')!.grade).toBe('unsourced');
  });
  it('a quote without a source, a negative quote or a quote for an unknown module is refused', () => {
    expect(validateSWInputs({ ...base(), quotes: { cloudPerVehicleYear: { value: 6, source: '' } } }).join(' ')).toMatch(/say where the quote comes from/);
    expect(validateSWInputs({ ...base(), quotes: { modules: { tcu_software: { perVehicleBuilt: { value: -1, source: 'x y' } } } } }).join(' ')).toMatch(/royalty quote/);
    expect(validateSWInputs({ ...base(), quotes: { modules: { nope: { annualIP: { value: 1, source: 'x y' } } } } }).join(' ')).toMatch(/not in the catalogue/);
  });
});

describe('your own modules cover what the catalogue lacks — nothing invented', () => {
  const airbag = { id: 'custom-airbag', name: 'Occupant restraint (airbag) control', category: 'D' as const, nominalPersonMonths: 120, defaultAsil: 'D' as const,
    defaultComplexity: 'High' as const, source: 'Our 2024 restraint ECU programme, 120 PM booked' };
  it('is costed by the same rules, its fractions are its domain\'s catalogue medians, and its effort is graded yours', () => {
    const p = { ...base(), customModules: [airbag], modules: [...base().modules, { moduleId: airbag.id, enabled: true, asil: 'D' as const, complexity: 'High' as const, reuse: 'Fresh' as const, customPersonMonths: null }] };
    const r = computeSWProgram(p);
    const m = r.modules.find(x => x.moduleId === airbag.id)!;
    expect(m.moduleName).toBe(airbag.name);
    expect(m.grandTotal).toBeGreaterThan(0);
    const def = customModuleDef(airbag);
    const peers = SW_MODULES.filter(x => x.category === 'D').map(x => x.testingFractionBase).sort((a, b) => a - b);
    const med = peers.length % 2 ? peers[(peers.length - 1) / 2] : (peers[peers.length / 2 - 1] + peers[peers.length / 2]) / 2;
    expect(def.testingFractionBase).toBe(med);
    expect(swEvidence(r).lines.find(l => l.label.startsWith(airbag.name) && l.kind === 'effort')!.grade).toBe('entered');
    expect(r.summary.grandTotal).toBeGreaterThan(computeSWProgram(base()).summary.grandTotal);
  });
  it('a just-added module with no figure costs nothing and needs no source yet; with a figure it must say where it comes from', () => {
    const empty = { ...airbag, nominalPersonMonths: 0, source: '' };
    const p = { ...base(), customModules: [empty], modules: [...base().modules, { moduleId: empty.id, enabled: true, asil: 'QM' as const, complexity: 'Medium' as const, reuse: 'Fresh' as const, customPersonMonths: null }] };
    expect(validateSWInputs(p)).toEqual([]);
    expect(computeSWProgram(p).modules.find(x => x.moduleId === empty.id)!.grandTotal).toBe(0);
    expect(validateSWInputs({ ...p, customModules: [{ ...empty, nominalPersonMonths: 50 }] }).join(' ')).toMatch(/say where its effort figure comes from/);
    expect(validateSWInputs({ ...p, customModules: [{ ...empty, id: 'airbag' }] }).join(' ')).toMatch(/must be "custom-…"/);
  });
  it('the resolver is the one place modules come from', () => {
    const defs = swModuleDefs({ ...base(), customModules: [airbag] });
    expect(defs.size).toBe(SW_MODULES.length + 1);
    expect(defs.get('custom-airbag')!.custom).toBe(true);
  });
});

describe('bulk actuals: the template round-trips; a bad row is named, never guessed', () => {
  it('one row per catalogue module in scope at this programme\'s settings, actual effort blank', () => {
    const p = base();
    const csv = actualsTemplateCsv(p);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('module_id,module_name,asil,complexity,reuse,size_ksloc,actual_person_months,project');
    expect(lines.length - 1).toBe(p.modules.filter(m => m.enabled).length);
    expect(parseActualsCsv(csv)).toEqual({ actuals: [], notFilled: lines.length - 1, problems: [] });
  });
  it('filled rows become actuals the calibration uses; bad rows are reported by line', () => {
    const p = base();
    const lines = actualsTemplateCsv(p).trim().split('\n');
    const filled = [lines[0], lines[1].replace(/,,,$/, ',,140,Project X'), lines[2].replace(/,,,$/, ',,abc,'), 'nope,Nope,QM,Medium,Fresh,,10,'].join('\n');
    const out = parseActualsCsv(filled);
    expect(out.actuals).toHaveLength(1);
    expect(out.actuals[0].actualPersonMonths).toBe(140);
    expect(out.actuals[0].project).toBe('Project X');
    expect(out.problems.join(' ')).toMatch(/Line 3: actual effort "abc"/);
    expect(out.problems.join(' ')).toMatch(/Line 4: unknown module "nope"/);
    expect(calibrateSWEffort(out.actuals).factor).toBeGreaterThan(0);
  });
});

describe('calibration priorities and the shared report builders', () => {
  const r = computeSWProgram(base());
  it('ranks the unsourced engineering £, largest first; shares add to 1', () => {
    const c = swCalibrationPriorities(r);
    expect(c.rows.length).toBe(r.modules.length);
    for (let i = 1; i < c.rows.length; i++) expect(c.rows[i].amount).toBeLessThanOrEqual(c.rows[i - 1].amount);
    expect(c.rows.at(-1)!.cumulative).toBeCloseTo(1, 9);
    expect(c.rows.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 9);
  });
  it('your figures list every quote and module with its source; exclusions and assumptions are complete', () => {
    const p = { ...base(), quotes: { cloudPerVehicleYear: { value: 6, source: 'AWS proposal' } }, customModules: [{ id: 'custom-tpms', name: 'Tyre-pressure monitoring', category: 'D' as const, nominalPersonMonths: 30, defaultAsil: 'A' as const, defaultComplexity: 'Medium' as const, source: 'supplier estimate' }],
      modules: [...base().modules, { moduleId: 'custom-tpms', enabled: true, asil: 'A' as const, complexity: 'Medium' as const, reuse: 'Fresh' as const, customPersonMonths: null }] };
    const y = swYourFigures(computeSWProgram(p));
    expect(y.map(x => x.source)).toEqual(['AWS proposal', 'supplier estimate']);
    expect(swExcludedModules(r).map(x => x[0])).toEqual(expect.arrayContaining(['Digital Key (UWB/BLE) & Secure Access']));
    expect(swAssumptionRows('margin basis').length).toBeGreaterThanOrEqual(12);
    expect(SW_CATALOGUE_GAPS.length).toBe(6);
    expect(SW_CLOUD_REFERENCE_FLEET).toBe(440_000);
  });
});

describe('the preset handler only takes the preset buttons', () => {
  it('a button sharing the preset class (actuals Add / template) no longer retires the vehicle demo', () => {
    const ui = readFileSync('src/ui/panels/sw-should-cost-ui.ts', 'utf8');
    expect(ui).toContain("querySelectorAll<HTMLButtonElement>('.sw-preset-btn[data-preset]')");
    expect(ui).not.toContain(".sw-preset-btn:not(.sw-vehicle-btn)");
  });
});
