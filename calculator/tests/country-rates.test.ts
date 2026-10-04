/**
 * Country-rates review, Oct 2026 — a costing in China uses China's rates for
 * EVERYTHING: material, labour, machines, energy, the toolroom behind its tools,
 * the rule-priced items, overhead, packaging and logistics; on the screen, in a
 * bulk run and in the comparison table alike.
 * docs/rates/2026-10-country-rates-review.md lists the errors these pin.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import {
  REGIONAL_DATA, buildRegionalLibrary, toolroomFactorFor, regionalShopDefaults, computeRegionalComparison,
  type ManufacturingRegion,
} from '../src/engine/regional-rates.js';
import { computeRegionalComparisonExact } from '../src/engine/regional-comparison.js';
import { withRates, activeRates, activeLabourRate, activeMachineRate } from '../src/engine/rate-context.js';
import { TOOLROOM_RATES, TOOLROOM_RATES_UK } from '../src/engine/toolmaking.js';
import { tariffElectricityPerKwh } from '../src/engine/uk-tariff.js';
import { computeExtrusionDrivers } from '../src/engine/modules/extrusion.js';
import { estimateRotoMouldCost } from '../src/engine/modules/roto-advisor.js';
import { fixtureCostGBP } from '../src/engine/machining-time.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { executeCalculateCost } from '../server/services/cost-executor.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const CN = buildRegionalLibrary(UK, 'CN');
const R = REGIONAL_DATA;

const op = (name: string, machineId: string, t: number) => ({
  operationName: name, machineId, labourId: 'lab-uk-skilled', cycleTimeHr: t, partsPerCycle: 1,
  oee: 0.85, manning: 1, labourTimeHr: t, labourEfficiency: 0.92,
});
const BRACKET: UniversalStackInput = {
  partName: 'Reference bracket', rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65 },
  operations: [op('Turn', 'mach-lathe-cnc', 0.05), op('Mill', 'mach-vmc3', 0.12), op('Drill', 'mach-drill', 0.03)],
  tooling: { totalToolingCost: 15000, amortizationVolume: 50000, mode: 'amortized' },
  packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08,
};

describe('1. the China book carries China rates, every line', () => {
  it('labour: a category grade takes China\'s category rate; a process grade moves by ITS category, not by "skilled"', () => {
    for (const cat of ['skilled', 'semiskilled', 'engineer', 'foundry', 'inspector', 'technician', 'supervisor', 'electronics'] as const) {
      expect(CN.labour.find(l => l.id === `lab-uk-${cat}`)!.fullyLoadedRatePerHr, cat).toBe(R.CN.labour[cat]);
    }
    const ukForge = UK.labour.find(l => l.id === 'lab-uk-forge')!.fullyLoadedRatePerHr;
    expect(CN.labour.find(l => l.id === 'lab-uk-forge')!.fullyLoadedRatePerHr)
      .toBeCloseTo(ukForge * R.CN.labour.foundry / R.UK.labour.foundry, 2);
    const ukBlow = UK.labour.find(l => l.id === 'lab-uk-blow')!.fullyLoadedRatePerHr;
    expect(CN.labour.find(l => l.id === 'lab-uk-blow')!.fullyLoadedRatePerHr)
      .toBeCloseTo(ukBlow * R.CN.labour.semiskilled / R.UK.labour.semiskilled, 2);
  });
  it('energy is China\'s, and every machine is re-priced', () => {
    expect(CN.energy).toHaveLength(1);
    expect(CN.energy[0].electricityPerKwh).toBe(R.CN.energy.electricityPerKwh);
    for (const m of CN.machines) expect(m.computedRatePerHr, m.id).toBeLessThan(UK.machines.find(x => x.id === m.id)!.computedRatePerHr);
  });
  it('the book says which country it is, with its toolroom factor', () => {
    expect(CN.regional).toEqual({ code: 'CN', name: 'China', toolroomFactor: toolroomFactorFor('CN') });
    expect(toolroomFactorFor('CN')).toBeCloseTo(0.5 * 8.08 / 26.19 + 0.5 * 0.55, 4);
    expect(toolroomFactorFor('UK')).toBe(1);
  });
  it('the library\'s own country labour entries equal the country\'s rates (eight disagreed)', () => {
    for (const l of DEFAULT_RATE_LIBRARY.labour) {
      const m = l.id.match(/^lab-([a-z]+)-([a-z]+)$/);
      const rd = m && R[m[1].toUpperCase() as ManufacturingRegion];
      const v = rd ? (rd.labour as Record<string, number>)[m![2]] : undefined;
      if (v !== undefined) expect(l.fullyLoadedRatePerHr, l.id).toBeCloseTo(v, 2);
    }
  });
});

describe('2. rates used BEFORE the stack follow the country (rate-context.ts)', () => {
  it('outside any country it is the UK book; inside China it is China\'s', () => {
    expect(activeRates()).toBe(DEFAULT_RATE_LIBRARY);
    withRates(CN, () => {
      expect(tariffElectricityPerKwh()).toBe(R.CN.energy.electricityPerKwh);
      expect(activeLabourRate('lab-uk-engineer')).toBe(R.CN.labour.engineer);
      expect(activeMachineRate('blast-machine')).toBe(CN.machines.find(m => m.id === 'blast-machine')!.computedRatePerHr);
    });
    expect(tariffElectricityPerKwh()).toBe(DEFAULT_RATE_LIBRARY.energy[0].electricityPerKwh);
  });
  it('toolroom £/hr: UK rates in the UK, × the toolroom factor in China', () => {
    expect(TOOLROOM_RATES.cnc).toBe(TOOLROOM_RATES_UK.cnc);
    withRates(CN, () => expect(TOOLROOM_RATES.cnc).toBeCloseTo(TOOLROOM_RATES_UK.cnc * toolroomFactorFor('CN'), 2));
  });
  it('parametric tools and fixtures are built at the country\'s toolroom', () => {
    const uk = estimateRotoMouldCost({ projectedAreaCm2: 5000 }).total;
    const cn = withRates(CN, () => estimateRotoMouldCost({ projectedAreaCm2: 5000 }).total);
    expect(cn / uk).toBeCloseTo(toolroomFactorFor('CN'), 2);
    expect(withRates(CN, () => fixtureCostGBP(2, 0, 50_000).gbp)).toBeLessThan(fixtureCostGBP(2, 0, 50_000).gbp);
  });
  it('a module with no tariff given falls back to the COSTED country\'s, not the UK\'s', () => {
    const p = {
      materialId: 'mat-pe100-pipe', profileWeightKgPerM: 0.5, partLengthM: 6, lineRateKgPerHr: 200,
      extruderId: 'extruder-pipe-line', labourId: 'lab-uk-semiskilled', oee: 0.85, manning: 1, labourEfficiency: 0.95,
      startupScrapFraction: 0.03, dieCost: 1000, amortizationVolume: 100000,
      family: 'pe' as const, process: 'pipe' as const, screwDiameterMm: 90, wallThicknessMm: 3, cooling: 'water-bath' as const,
    };
    // The module hands the core kWh; the core prices them at the costing book's tariff.
    const d = computeExtrusionDrivers(p);
    const kwh = d.rawMaterial.energyKwh!.electricity!;
    const priced = (lib: typeof UK) => computeUniversalStack({ partName: 'p', ...d, packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0, marginPct: 0 }, lib)
      .traceability.find(t => t.field === 'rawMaterial.energyKwh.electricity')!.value;
    expect(priced(UK)).toBeCloseTo(kwh * R.UK.energy.electricityPerKwh, 6);
    expect(priced(CN)).toBeCloseTo(kwh * R.CN.energy.electricityPerKwh, 6);
    // and the headless executor runs the module in the book it is given
    const viaExec = executeCalculateCost({ commodity: 'extrusion', params: p, rateLibrary: CN } as never);
    const ukExec = executeCalculateCost({ commodity: 'extrusion', params: p, rateLibrary: UK } as never);
    expect(viaExec.breakdown.rawMaterial).toBeLessThan(ukExec.breakdown.rawMaterial);
  });
});

describe('3. overhead, packaging and logistics: one function for screen and headless', () => {
  it('China: 12 % × 0.75, and the UK-basis packaging / logistics × China\'s multipliers', () => {
    const s = regionalShopDefaults('CN', { packagingPerPart: 0.40, logisticsPerPart: 0.60 });
    expect(s.overheadPct).toBe(0.09);
    expect(s.packagingPerPart).toBeCloseTo(0.40 * R.CN.packagingMultiplier, 4);
    expect(s.logisticsPerPart).toBeCloseTo(0.60 * R.CN.logisticsMultiplier, 4);
    expect(regionalShopDefaults('UK')).toEqual({ overheadPct: 0.12, packagingPerPart: 0.15, logisticsPerPart: 0.25 });
  });
  it('the screen\'s country switch writes the fields that exist, through that function', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).not.toMatch(/'packaging-cost'|'logistics-cost'/);
    expect(main).toContain('applyCountryShopFields(region)');
    // one handler for both pickers
    expect(main.match(/_applyCountry\(\(e\.target as HTMLSelectElement\)\.value\)/g)).toHaveLength(2);
    // no fixed £0.20 energy default on the forms
    expect(main).not.toMatch(/id="(ext|tf)-kwh"[^>]*value="0\.20"/);
    expect(main).not.toMatch(/num\('(ext|tf)-kwh'\) \|\| 0\.20/);
  });
});

describe('4. the comparison table is the costing selecting that country gives', () => {
  it('the exact table\'s China row = the bracket costed in the China book (tooling at China\'s toolroom)', () => {
    const rows = computeRegionalComparisonExact(BRACKET, UK, { regions: ['UK', 'CN'] });
    const cn = rows.find(r => r.code === 'CN')!;
    const direct = computeUniversalStack({
      ...BRACKET,
      tooling: { ...BRACKET.tooling, totalToolingCost: 15000 * toolroomFactorFor('CN') },
      overheadPct: 0.12 * R.CN.overheadMultiplier,
      packagingPerPart: 0.15 * R.CN.packagingMultiplier, logisticsPerPart: 0.25 * R.CN.logisticsMultiplier,
    }, CN);
    expect(cn.total).toBeCloseTo(direct.total, 6);
    expect(rows.find(r => r.code === 'UK')!.total).toBeCloseTo(computeUniversalStack(BRACKET, UK).total, 6);
  });
  it('the estimate table scales tooling by the same toolroom factor as the rebuild', () => {
    const bkd = { rawMaterial: 2, process: 10, labour: 4, tooling: 1, overhead: 2, packaging: 0.15, logistics: 0.25, margin: 1.5 };
    const cn = computeRegionalComparison(bkd, { regions: ['UK', 'CN'] }).find(r => r.code === 'CN')!;
    expect(cn.tooling).toBeCloseTo(toolroomFactorFor('CN'), 6);
  });
});

describe('5. a real part in China, headless (bulk) — every bucket China\'s', () => {
  const baseline = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as
    { part: string; answers: Record<string, string>; geometry: never; outcome: { commodity?: string } }[];
  const run = async (file: string, region: ManufacturingRegion) => {
    const p = baseline.find(x => x.part === file)!;
    return costMeasuredPart(p.geometry, file, { partNumber: file, file, annualVolume: 50_000,
      ...(p.outcome.commodity ? { commodity: p.outcome.commodity } : {}) },
    p.answers, region, { annualVolume: 50_000 }, UK, { partNumber: file, file, status: 'error' });
  };
  it('the BIW inner panel: dies at China\'s toolroom, packaging and logistics at China\'s factors', async () => {
    const uk = await run('BIW_Inner_Panel.stp', 'UK');
    const cn = await run('BIW_Inner_Panel.stp', 'CN');
    expect(cn.status).toBe('costed');
    // before the review the die was £17.72 in both
    expect(cn.breakdown!.tooling).toBeLessThan(uk.breakdown!.tooling * 0.8);
    expect(cn.breakdown!.packaging / uk.breakdown!.packaging).toBeCloseTo(R.CN.packagingMultiplier, 2);
    expect(cn.breakdown!.logistics / uk.breakdown!.logistics).toBeCloseTo(R.CN.logisticsMultiplier, 2);
  }, 60_000);
  it('a UK costing does not move', async () => {
    const p = baseline.find(x => x.part === 'Casting_Braket.stp')!;
    const uk = await run('Casting_Braket.stp', 'UK');
    expect(uk.total).toBeCloseTo((p.outcome as { total: number }).total, 2);
  }, 60_000);
});

describe('6. the CAD route prices its rules in the requested country', () => {
  it('ruleContextFor carries that country\'s book (and the UK one when none is sent)', async () => {
    const { ruleContextFor } = await import('../server/routes/cad.js');
    const geo = { status: 'success', volume: { cm3: 10, mm3: 10_000 } } as never;
    const ov = { annualVolume: 10_000, forcedCommodity: 'casting', forcedMaterial: '' };
    expect(ruleContextFor('casting', geo, 'p.stp', { ...ov, region: 'CN' }).rates?.regional?.code).toBe('CN');
    expect(ruleContextFor('casting', geo, 'p.stp', ov).rates?.regional).toBeUndefined();
  });
});

describe('7. India re-check (Oct 2026): every rate line of every real part is India\'s', () => {
  const IN = buildRegionalLibrary(UK, 'IN');
  it('every machine, labour, material and energy line of every costed part — none at a UK rate', async () => {
    const baseline = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as
      { part: string; answers: Record<string, string>; geometry: never; outcome: { commodity?: string } }[];
    const bad: string[] = [];
    let lines = 0, costed = 0;
    for (const p of baseline) {
      const r = await costMeasuredPart(p.geometry, p.part, { partNumber: p.part, file: p.part, annualVolume: 50_000,
        ...(p.outcome.commodity ? { commodity: p.outcome.commodity } : {}) },
      p.answers, 'IN', { annualVolume: 50_000 }, UK, { partNumber: p.part, file: p.part, status: 'error' });
      if (r.status !== 'costed') continue;
      costed++;
      expect(r.trace!.rateBook, p.part).toMatch(/-IN$/);
      for (const o of r.trace!.operations) {
        lines += 2;
        const m = IN.machines.find(x => x.id === o.machineId)!, l = IN.labour.find(x => x.id === o.labourId)!;
        if (Math.abs(o.machineRateUsed - m.computedRatePerHr) > 1e-6) bad.push(`${p.part} ${o.operationName} machine`);
        if (Math.abs(o.labourRateUsed - l.fullyLoadedRatePerHr) > 1e-6) bad.push(`${p.part} ${o.operationName} labour`);
      }
      for (const t of r.trace!.traceability) {
        if (t.field === 'material.pricePerKg') { lines++; if (Math.abs(t.value - IN.materials.find(m => m.id === t.rateId)!.pricePerKg) > 1e-6) bad.push(`${p.part} material`); }
        if (t.field.startsWith('rawMaterial.energyKwh')) { lines++; if (t.rateId !== 'energy-in') bad.push(`${p.part} energy`); }
      }
    }
    expect(bad).toEqual([]);
    expect(costed).toBeGreaterThanOrEqual(35);
    expect(lines).toBeGreaterThan(300);
  }, 120_000);
  it('casting fettling is charged at India\'s foundry rate (it was the UK\'s)', async () => {
    const { estimateCastingSecondaryAdders } = await import('../src/engine/modules/casting-advisor.js');
    const at = (lib?: typeof IN) => withRates(lib, () => estimateCastingSecondaryAdders({ alloyFamily: 'aluminium', partWeightKg: 2, fettling: 'heavy' } as never))
      .adders.find(a => /fettl/i.test(a.label))!.costPerPartGbp;
    expect(at(IN) / at()).toBeCloseTo(R.IN.labour.foundry / R.UK.labour.foundry, 1);
  });
  it('the AI agent\'s costing tool prices in the region asked for — it ran on the UK book whatever the region', async () => {
    const { costInRegion } = await import('../server/routes/agent.js');
    const p = {
      materialId: 'mat-pe100-pipe', profileWeightKgPerM: 0.5, partLengthM: 6, lineRateKgPerHr: 200,
      extruderId: 'extruder-pipe-line', labourId: 'lab-uk-semiskilled', oee: 0.85, manning: 1, labourEfficiency: 0.95,
      startupScrapFraction: 0.03, dieCost: 1000, amortizationVolume: 100000,
      family: 'pe', process: 'pipe', screwDiameterMm: 90, wallThicknessMm: 3, cooling: 'water-bath',
    };
    const uk = costInRegion({ commodity: 'extrusion', params: p }, undefined);
    const india = costInRegion({ commodity: 'extrusion', params: p }, 'India');
    const named = costInRegion({ commodity: 'extrusion', params: p, region: 'IN' }, 'UK');
    expect(uk.region).toBe('UK');
    expect(india.region).toBe('IN');
    expect(named.total).toBeCloseTo(india.total, 6);
    expect(india.total).toBeLessThan(uk.total);
    expect(india.breakdown.labour / uk.breakdown.labour).toBeCloseTo(R.IN.labour.semiskilled / R.UK.labour.semiskilled, 2);
    expect('trace' in india).toBe(false);
  });
});

describe('8. root cause: ONE country source for every country (Oct 2026, third pass)', () => {
  const ALL = Object.keys(REGIONAL_DATA) as ManufacturingRegion[];
  it('every country: labour is one entry per role, priced in that country — no duplicates, no other country', async () => {
    const { labourRoles, labourRoleId, isCountryPinnedLabour } = await import('../src/engine/labour-roles.js');
    for (const c of ALL) {
      const book = c === 'UK' ? UK : buildRegionalLibrary(UK, c);
      const roles = labourRoles(book);
      const names = roles.map(l => l.skillLevel);
      expect(new Set(names).size, `${c} duplicate roles`).toBe(names.length);
      for (const l of roles) expect(l.region, `${c} ${l.id}`).toBe(REGIONAL_DATA[c].name === 'United Kingdom' && c === 'UK' ? l.region : REGIONAL_DATA[c].name);
    }
    expect(isCountryPinnedLabour('lab-cn-skilled')).toBe(true);
    expect(isCountryPinnedLabour('lab-uk-trim-router')).toBe(false);
    expect(labourRoleId('lab-de-foundry')).toBe('lab-uk-foundry');
  });
  it('every country\'s data is internally consistent (labour order, gas below power, machine cost vs labour cost)', () => {
    for (const c of ALL) {
      const r = REGIONAL_DATA[c], L = r.labour, ratio = L.semiskilled / REGIONAL_DATA.UK.labour.semiskilled;
      expect(L.engineer > L.skilled && L.skilled > L.semiskilled, `${c} labour order`).toBe(true);
      expect(r.energy.gasPerKwh, `${c} gas`).toBeLessThan(r.energy.electricityPerKwh);
      expect(ratio < 0.6 && r.machineRateMultiplier >= 0.95, `${c} machine vs labour`).toBe(false);
      expect(ratio > 0.9 && r.machineRateMultiplier < 0.7, `${c} machine vs labour (Singapore carried Thailand's 0.58)`).toBe(false);
    }
  });
  it('the PCB country table takes power, FX and operator labour from the main table (they disagreed)', async () => {
    const { PCB_COUNTRY_RATES } = await import('../server/data/pcb-country-rates.js');
    for (const [id, p] of Object.entries(PCB_COUNTRY_RATES)) {
      const rd = REGIONAL_DATA[(id === 'gb' ? 'UK' : id.toUpperCase()) as ManufacturingRegion];
      expect(rd, id).toBeDefined();
      expect(p.energyCostPerKWh, id).toBe(rd.energy.electricityPerKwh);
      expect(p.fxToGBP, id).toBe(rd.fxToGBP);
      expect(p.assembly.labourRatePerHr, id).toBe(rd.labour.electronics);
    }
  });
  it('every country maps to a PCB market — its own where the data exists, else the nearest, stated', async () => {
    const { pcbMarketFor, pcbFabRegionFor } = await import('../src/engine/pcb-market.js');
    const { PCB_COUNTRY_RATES } = await import('../server/data/pcb-country-rates.js');
    for (const c of ALL) {
      const m = pcbMarketFor(c);
      expect(PCB_COUNTRY_RATES[m.id], `${c} → ${m.id}`).toBeDefined();
      if (!m.own) expect(m.basis, c).toBeTruthy();
      expect(['uk', 'eu', 'china', 'india', 'na']).toContain(pcbFabRegionFor(c).region);
    }
    expect(Object.keys(PCB_COUNTRY_RATES).every(id => ALL.some(c => pcbMarketFor(c).id === id && pcbMarketFor(c).own))).toBe(true);
  });
  it('the screen: money inputs hold £ or say what they hold; rates are shown in the display currency', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).not.toMatch(/£\$\{\w+\.computedRatePerHr\.toFixed/);               // machine drop-downs in display currency
    expect(main).not.toMatch(/Packaging \(\$\{sym\}\/part\)/);                        // the £ input is labelled £
    expect(main).toContain('_targetPriceGbp()');                                       // a ¥ target is compared in £
    expect(main).toMatch(/value="\$\{_inCur\(m\.pricePerKg\)\}"/);                     // rate table in the display currency…
    expect(main).toContain('typed / (_displayFxRate || 1)');                          // …and saved back in £
    expect(main).toContain('labourRoles(library).map');                               // labour drop-down: roles only
    expect(main).toContain('syncPcbPickers(region)');                                 // PCB pickers follow the country
  });
  it('the line audit, every country: all machine, labour, material and energy lines are that country\'s', async () => {
    const baseline = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as
      { part: string; answers: Record<string, string>; geometry: never; outcome: { commodity?: string } }[];
    const bad: string[] = [];
    for (const c of ALL.filter(x => x !== 'UK')) {
      const book = buildRegionalLibrary(UK, c);
      for (const p of baseline) {
        const r = await costMeasuredPart(p.geometry, p.part, { partNumber: p.part, file: p.part, annualVolume: 50_000,
          ...(p.outcome.commodity ? { commodity: p.outcome.commodity } : {}) },
        p.answers, c, { annualVolume: 50_000 }, UK, { partNumber: p.part, file: p.part, status: 'error' });
        if (r.status !== 'costed') continue;
        for (const o of r.trace!.operations) {
          if (Math.abs(o.machineRateUsed - book.machines.find(x => x.id === o.machineId)!.computedRatePerHr) > 1e-6) bad.push(`${c} ${p.part} machine`);
          if (Math.abs(o.labourRateUsed - book.labour.find(x => x.id === o.labourId)!.fullyLoadedRatePerHr) > 1e-6) bad.push(`${c} ${p.part} labour`);
        }
        for (const t of r.trace!.traceability) {
          if (t.field === 'material.pricePerKg' && Math.abs(t.value - book.materials.find(m => m.id === t.rateId)!.pricePerKg) > 1e-6) bad.push(`${c} ${p.part} material`);
          if (t.field.startsWith('rawMaterial.energyKwh') && t.rateId !== `energy-${c.toLowerCase()}`) bad.push(`${c} ${p.part} energy`);
        }
      }
    }
    expect(bad).toEqual([]);
  }, 600_000);
});

describe('9. flow review (Oct 2026, fourth pass): the country survives every step of the workflow', () => {
  it('a casting re-costed for another country re-prices its melt energy (energy is kWh, not £ fixed at the first country)', async () => {
    const { computeCastingDrivers } = await import('../src/engine/modules/casting.js');
    const d = computeCastingDrivers({
      subtype: 'sand', materialId: 'mat-gs-c25', partWeightKg: 2.512, castingYield: 0.65, rejectRate: 0.03,
      labourId: 'lab-uk-foundry', oee: 0.8, manning: 1, labourEfficiency: 0.92, amortizationVolume: 50_000,
      sand: { mouldLineId: 'sand-cast-line', cycleTimeHr: 0.0083, patternCost: 4253, patternLife: 8000, coreCostPerPart: 1.5 },
    } as never);
    expect(d.rawMaterial.energyKwh?.electricity).toBeGreaterThan(0);
    const input = { partName: 'c', ...d, packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08 } as UniversalStackInput;
    const row = computeRegionalComparisonExact(input, UK, { regions: ['UK', 'CN'] }).find(r => r.code === 'CN')!;
    const direct = computeUniversalStack({ ...input,
      tooling: { ...input.tooling, totalToolingCost: input.tooling.totalToolingCost * toolroomFactorFor('CN') },
      overheadPct: 0.12 * R.CN.overheadMultiplier, packagingPerPart: 0.15 * R.CN.packagingMultiplier, logisticsPerPart: 0.25 * R.CN.logisticsMultiplier,
    }, CN);
    expect(row.material).toBeCloseTo(direct.breakdown.rawMaterial, 6);
    expect(direct.traceability.find(t => t.field === 'rawMaterial.energyKwh.electricity')!.rateId).toBe('energy-cn');
  });
  it('a saved scenario keeps its country and is compared in it (both used to be re-costed in the selected country)', async () => {
    const { saveScenario, compareScenarios } = await import('../src/engine/scenario.js');
    const cnRes = computeUniversalStack(BRACKET, CN), ukRes = computeUniversalStack(BRACKET, UK);
    const a = saveScenario('China', '', BRACKET, cnRes, 'CN');
    const b = saveScenario('UK', '', BRACKET, ukRes, 'UK');
    expect(a.region).toBe('CN');
    const cmp = compareScenarios(a.id, b.id, UK, r => (r === 'UK' ? UK : buildRegionalLibrary(UK, r as ManufacturingRegion)));
    expect(cmp.delta.total).toBeCloseTo(ukRes.total - cnRes.total, 6);
  });
  it('a rate book\'s OWN rate for a country wins over the regional table (company lab-cn-skilled, energy-cn)', () => {
    const company = {
      ...UK,
      labour: UK.labour.map(l => (l.id === 'lab-cn-skilled' ? { ...l, fullyLoadedRatePerHr: 9.99 } : l)),
      energy: [...UK.energy.filter(e => e.id !== 'energy-cn'), { ...UK.energy.find(e => e.id === 'energy-cn')!, electricityPerKwh: 0.0555 }],
    };
    const book = buildRegionalLibrary(company, 'CN');
    expect(book.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr).toBe(9.99);
    expect(book.energy[0].electricityPerKwh).toBe(0.0555);
    expect(book.machines[0].sourceNote).toContain('0.0555');
    // the built-in book's own entries equal the regional table, so built-in costs do not move
    expect(CN.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr).toBe(R.CN.labour.skilled);
  });
  it('the screen: the country persists, a draft APPLIES its country, history compares like with like, the agent and Excel know the country', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).toContain("localStorage.setItem('cv-region', region)");
    expect(main).toContain("const DRAFT_SKIP = new Set(['costing-country-sel', 'mfg-region-selector', 'pcb-mfg-country', 'pcbf-region'])");
    expect(main).toContain('region: _mfgRegion, fields: collectDraft()');
    expect(main).toContain("(h.region ?? 'UK') === region");
    expect(main.match(/region: _mfgRegion,\s+\/\/ the agent's costing tool/g)).toHaveLength(2);
    expect(main).toContain('saveScenario(name, desc, lastInput, lastResult, _mfgRegion)');
    const xl = readFileSync('src/export/excel.ts', 'utf8');
    expect(xl).toContain("'Manufacturing Country'");
    expect(xl).toContain('labourRoles(library)');
  });
  it('no module turns energy into £ at a fixed tariff any more (the screen and the executor pass none)', () => {
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).not.toMatch(/energyPricePerKwh: library\.energy/);
    expect(main).not.toMatch(/heatingEnergyPricePerKwh,/);
    expect(readFileSync('server/services/cost-executor.ts', 'utf8')).not.toMatch(/energyPricePerKwh: tariff/);
  });
});

describe('10. errors the LIVE India run of the PRCR002 aluminium housing exposed (Oct 2026)', () => {
  const IN = buildRegionalLibrary(UK, 'IN');
  it('the machining route is chosen on the costed country\'s machine rates (it read the UK book: VF2 £46/hr in India)', async () => {
    const src = readFileSync('src/engine/routing-optimiser.ts', 'utf8');
    expect(src).toContain('p.library ?? activeRates()');
    expect(readFileSync('src/engine/cavitation-optimiser.ts', 'utf8')).toContain('p.library ?? activeRates()');
    expect(withRates(IN, () => activeMachineRate('mach-haas-vf2'))).toBeCloseTo(IN.machines.find(m => m.id === 'mach-haas-vf2')!.computedRatePerHr, 9);
  });
  it('casting / forging heat treatment, NDT and finishing services are priced in the country (T6 was £1.10/kg everywhere)', async () => {
    const { estimateCastingSecondaryAdders } = await import('../src/engine/modules/casting-advisor.js');
    const { heatTreatServiceFactor, ndtServiceFactor } = await import('../src/engine/regional-services.js');
    const inp = { alloyFamily: 'aluminium', partWeightKg: 2, heatTreat: 't6', ndt: 'xray', impregnation: true, shotBlast: true } as never;
    const uk = estimateCastingSecondaryAdders(inp).adders, ind = withRates(IN, () => estimateCastingSecondaryAdders(inp)).adders;
    const by = (a: typeof uk, re: RegExp) => a.find(x => re.test(x.label))!.unitCostGbp;
    expect(by(uk, /heat/i)).toBe(1.1);
    expect(by(ind, /heat/i)).toBeCloseTo(1.1 * heatTreatServiceFactor('IN'), 3);
    expect(by(ind, /x-ray|ndt|radiograph/i)).toBeCloseTo(5 * ndtServiceFactor('IN'), 2);
    expect(heatTreatServiceFactor('UK')).toBe(1);
    expect(heatTreatServiceFactor('IN')).toBeLessThan(0.6);
  });
  it('the casting tool\'s plausible band moves with the country (an India die was floored at the UK £8,000)', async () => {
    const src = readFileSync('src/engine/casting-tooling.ts', 'utf8');
    expect(src).toContain('Math.min(hi * tf, Math.max(lo * tf, detail.total))');
  });
  it('every CAD analysis response says which country\'s book its rules priced in', () => {
    const src = readFileSync('server/routes/cad.ts', 'utf8');
    expect(src.match(/ratesRegion: ruleCtx\.rates\?\.regional\?\.code \?\? 'UK'/g)).toHaveLength(4);
  });
  it('the AI agent is grounded on the selected country\'s rates (it was always the UK book)', () => {
    const src = readFileSync('server/routes/agent.ts', 'utf8');
    expect(src).toContain('groundingBlock(message, ragCorpusFor(region), 6)');
  });
});

/**
 * The all-commodity audit (Oct 2026). A test country whose every labour rate, tariff, machine
 * multiplier and material factor is EXACTLY 2× the UK's must cost every country-made £ at 2×.
 * Every real part in cad-audit/ is replayed through the product's own chain in the UK and in it;
 * a driver that stays at ×1 is a fixed UK £ — allowed only where it is a traded good, stated here.
 */
describe('11. all commodities: no fixed UK £ survives a country change ("twice the UK" probe)', async () => {
  const RR = await import('../src/engine/regional-rates.js');
  const AL = await import('../src/engine/al-extrusion-data.js');
  const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
    part: string; answers: Record<string, string>; commodity?: string; geometry: never; outcome: { status: string } }>;
  const K = 2;
  const dbl = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * K]));
  const UKD = RR.REGIONAL_DATA.UK;
  const inject = () => {
    (RR.REGIONAL_DATA as Record<string, unknown>).ZZ = { ...UKD, name: 'Twice-UK', labour: dbl(UKD.labour), energy: dbl(UKD.energy),
      materialFactors: dbl(UKD.materialFactors), materialMultiplier: K, machineRateMultiplier: K,
      overheadMultiplier: 1, packagingMultiplier: 1, logisticsMultiplier: 1 };
    (RR.REGION_NAMES as Record<string, unknown>).ZZ = 'Twice-UK';
    (RR.SURFACE_REGIONAL_FACTORS as Record<string, unknown>).ZZ = { effluent: K, chemical: K };
    (AL.BILLET_PREMIUM_USD_PER_T as Record<string, unknown>).ZZ = AL.BILLET_PREMIUM_USD_PER_T.UK;
  };
  const remove = () => {
    for (const t of [RR.REGIONAL_DATA, RR.REGION_NAMES, RR.SURFACE_REGIONAL_FACTORS, AL.BILLET_PREMIUM_USD_PER_T]) delete (t as Record<string, unknown>).ZZ;
  };
  /** Drivers allowed to stay at ×1, and why: traded goods priced the same everywhere. */
  const GLOBAL_OK: Record<string, string[]> = {
    machining: ['consumablesCostPerPart'],            // cutting-insert wear (£/min of cut) — a traded consumable
    aluminium_extrusion: ['material'],                // billet = LME + the region's premium (held at the UK's in this probe)
  };
  it('every costed real part: labour and process double exactly; no material, consumable or tool £ stays at the UK figure', async () => {
    inject();
    try {
      const base = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
      let checked = 0;
      for (const p of parts) {
        if (p.outcome.status !== 'costed') continue;
        const run = (reg: string) => costMeasuredPart(p.geometry, p.part,
          { partNumber: p.part, file: p.part, annualVolume: 50_000, ...(p.commodity ? { commodity: p.commodity } : {}) },
          p.answers, reg as never, { annualVolume: 50_000 }, base, { partNumber: p.part, file: p.part, status: 'error' } as never);
        const a = await run('UK'), b = await run('ZZ');
        expect(b.commodity, p.part).toBe(a.commodity);
        const c = a.commodity!;
        for (const k of ['process', 'labour'] as const) {
          // ×2 to the 4-dp rounding of the breakdown
          if (a.breakdown![k] > 0.001) expect(Math.abs(b.breakdown![k] - K * a.breakdown![k]), `${p.part} ${k}`).toBeLessThan(2.5e-4);
        }
        const da = a.trace!.drivers!, db = b.trace!.drivers!;
        const unchanged: string[] = [];
        const same = (x?: number, y?: number) => (x ?? 0) > 0 && Math.abs((y ?? 0) / (x ?? 1) - 1) < 1e-6;
        if (same(da.rawMaterial.directCost, db.rawMaterial.directCost)) unchanged.push('directCost');
        if (same(da.rawMaterial.consumablesCostPerPart, db.rawMaterial.consumablesCostPerPart)) unchanged.push('consumablesCostPerPart');
        if (same(da.tooling.totalToolingCost, db.tooling.totalToolingCost)) unchanged.push('tooling');
        const pa = a.trace!.traceability.find(t => t.field === 'material.pricePerKg')?.value;
        const pb = b.trace!.traceability.find(t => t.field === 'material.pricePerKg')?.value;
        if (same(pa, pb)) unchanged.push('material');
        expect(unchanged.filter(u => !(GLOBAL_OK[c] ?? []).includes(u)), `${p.part} (${c}) keeps a UK £`).toEqual([]);
        checked++;
      }
      expect(checked).toBeGreaterThanOrEqual(35);
    } finally { remove(); }
  }, 600_000);

  it('each leak the audit found now moves with the country', async () => {
    const IN = buildRegionalLibrary(UK, 'IN');
    const S = await import('../src/engine/regional-services.js');
    expect(S.countryFactor('toolroom', 'UK')).toBe(1);
    expect(S.countryFactor({ globalShare: 0.2, rest: 'toolroom' }, 'IN')).toBeCloseTo(0.2 + 0.8 * S.countryFactor('toolroom', 'IN'), 4);
    // Al-extrusion die (UK die-maker prices) and the fab programmer
    const { dieCost } = await import('../src/engine/modules/aluminium-extrusion-advisor.js');
    const sec = { areaMm2: 400, perimeterMm: 120, minWallMm: 2, voids: 0 } as never;
    const dUK = dieCost('solid', 100, 1, sec).gbp, dIN = withRates(IN, () => dieCost('solid', 100, 1, sec).gbp);
    expect(dIN / dUK).toBeCloseTo(withRates(IN, () => S.countryFactor({ globalShare: 0.2, rest: 'toolroom' })), 2);
    expect(readFileSync('src/engine/modules/aluminium-extrusion.ts', 'utf8')).toContain("activeLabourRate('lab-uk-engineer')");
    // stamping die design: hours from the UK rate, priced at the country's (the factor cancelled)
    expect(readFileSync('src/engine/modules/sheet-metal-advisor.ts', 'utf8')).toContain('nre / TOOLROOM_RATES_UK.design, TOOLROOM_RATES.design');
    // gear: heat treat in the costed country headless; bar from the country's book
    expect(readFileSync('src/engine/modules/gear.ts', 'utf8')).toContain("inputs.region ?? activeRegion()");
    expect(readFileSync('src/engine/cost-input-rules/commodities/gear.ts', 'utf8')).toContain('activeRates().materials.find(m => m.id === grade.id)');
    // composites: laminate prices from the country's book, NDI at the inspection factor
    expect(readFileSync('src/engine/cost-input-rules/derive/laminate.ts', 'utf8')).not.toContain('DEFAULT_RATE_LIBRARY');
    // PCB fab: adders in the panel's market
    const { computePCBFabDrivers } = await import('../src/engine/modules/pcb-fab.js');
    expect(readFileSync('src/engine/modules/pcb-fab.ts', 'utf8')).toContain('const market = BASE_PANEL_PRICE_2L[inputs.region] / BASE_PANEL_PRICE_2L.uk');
    expect(typeof computePCBFabDrivers).toBe('function');
    // lamination stack joining
    const { estimateLaminationJoinCostPerStack } = await import('../src/engine/modules/lamination-advisor.js');
    const j = { stackMethod: 'laser-weld', laminationCount: 100, stackHeightMm: 35 } as never;
    expect(withRates(IN, () => estimateLaminationJoinCostPerStack(j)) / estimateLaminationJoinCostPerStack(j))
      .toBeCloseTo(S.processServiceFactor('IN'), 3);
  });

  it('PCB automotive flat premiums (burn-in, serialisation, class-3 lab, coupons, NRE) are priced in the board\'s country', async () => {
    const { computeAutomotiveAssemblyCost } = await import('../server/routes/pcb.js');
    const S = await import('../src/engine/regional-services.js');
    const asm = { smtPlacements: 400, bgaCount: 2 };
    const gb = computeAutomotiveAssemblyCost(asm, 'ASIL-D', 50_000, 10, 'gb');
    const ind = computeAutomotiveAssemblyCost(asm, 'ASIL-D', 50_000, 10, 'in');
    expect(ind.burnInGBP / gb.burnInGBP).toBeCloseTo(S.ndtServiceFactor('IN'), 1);
    const gbSmall = computeAutomotiveAssemblyCost(asm, 'ASIL-D', 500, 10, 'gb'), inSmall = computeAutomotiveAssemblyCost(asm, 'ASIL-D', 500, 10, 'in');
    expect(inSmall.serialisationGBP / gbSmall.serialisationGBP).toBeCloseTo(S.processServiceFactor('IN'), 1);
    expect(readFileSync('server/routes/pcb.ts', 'utf8').match(/selectedCountry2?\)/g)!.length).toBeGreaterThanOrEqual(9);
  });

  it('heat-treat load QC follows the country (it was a UK £ per load)', async () => {
    const { computeHeatTreatRate } = await import('../src/engine/gear-heat-treat-rate.js');
    expect(computeHeatTreatRate('quench_temper', 'UK').basis).toContain('QC');
    expect(readFileSync('src/engine/gear-heat-treat-rate.ts', 'utf8')).toContain('proc.qcGBPPerLoad.value * f.qcMult / netLoad');
  });
});

describe('12. the forms\' £ defaults follow the country; a typed figure is a quote', async () => {
  const M = await import('../src/ui/country-money-defaults.js');
  const S = await import('../src/engine/regional-services.js');
  /** A stand-in for the form: the module needs inputs with id, value and attributes. */
  const fakeInput = (id: string, value: string) => {
    const attrs = new Map<string, string>();
    return { id, value, title: '', type: 'number',
      hasAttribute: (k: string) => attrs.has(k), getAttribute: (k: string) => attrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => { attrs.set(k, v); } };
  };
  const form = (inputs: ReturnType<typeof fakeInput>[]) => ({ querySelectorAll: () => inputs }) as unknown as ParentNode;

  it('a default moves with every switch; a typed figure never does', () => {
    const die = fakeInput('cast-hpdc-die-cost', '120000'), nre = fakeInput('cam-mach-prog-nre', '2000');
    const insert = fakeInput('imm-insert-cost', '0.05'), typed = fakeInput('forge-die-cost', '80000');
    const root = form([die, nre, insert, typed]);
    M.applyCountryMoneyDefaults(root, 'UK');
    expect(die.value).toBe('120000');
    typed.value = '65000';                                     // the engineer's quote
    M.applyCountryMoneyDefaults(root, 'IN');
    expect(Number(die.value)).toBe(Math.round(120000 * S.countryFactor({ globalShare: 0.2, rest: 'toolroom' }, 'IN')));
    expect(Number(nre.value)).toBe(Math.round(2000 * S.engineerFactor('IN')));
    expect(insert.value).toBe('0.05');                         // brass inserts are traded
    expect(typed.value).toBe('65000');
    M.applyCountryMoneyDefaults(root, 'DE');
    expect(Number(die.value)).toBe(Math.round(120000 * S.countryFactor({ globalShare: 0.2, rest: 'toolroom' }, 'DE')));
    M.applyCountryMoneyDefaults(root, 'UK');
    expect(die.value).toBe('120000');                          // back to the UK basis exactly
  });

  it('every £ input on every form has a stated country basis', () => {
    const src = ['src/ui/main.ts', ...['al-extrusion-form.ts'].map(f => `src/ui/${f}`)].map(f => readFileSync(f, 'utf8')).join('\n');
    const re = /<label>((?:[^<]|<span[^>]*>[^<]*<\/span>)*)<\/label>\s*<input[^>]*id="([^"$]+)"/g;
    const missing: string[] = [];
    let n = 0;
    for (const m of src.matchAll(re)) {
      if (!/£/.test(m[1].replace(/<span[^>]*>[^<]*<\/span>/g, ''))) continue;
      if (/kwh/i.test(m[1])) continue;                         // a typed tariff overrides the book's
      n++;
      if (!M.basisFor(m[2])) missing.push(`${m[2]} (${m[1].replace(/<[^>]+>/g, '').trim()})`);
    }
    expect(n).toBeGreaterThan(40);
    expect(missing).toEqual([]);
    for (const row of ['coat3-price', 'bom4-price', 'join2-cost', 'sm-hw2-cost']) expect(M.basisFor(row), row).toBeDefined();
  });
});

/**
 * Every country, not just India (Oct 2026): every real part in cad-audit/ is costed in all
 * 39 countries through the product's own chain; every charged rate must be THAT country's,
 * the book must name it, and the total vs the UK must sit inside the country's own factor
 * envelope (a wrong formula lands outside it).
 */
describe('13. all 39 countries × every real part: each costing is priced in its own country', async () => {
  const RR = await import('../src/engine/regional-rates.js');
  const S = await import('../src/engine/regional-services.js');
  const parts = (JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
    part: string; answers: Record<string, string>; commodity?: string; geometry: never; outcome: { status: string } }>)
    .filter(p => p.outcome.status === 'costed');
  const ALL = Object.keys(RR.REGIONAL_DATA) as Array<keyof typeof RR.REGIONAL_DATA>;
  it('every charged machine, labour, material and energy rate is the selected country\'s', async () => {
    const base = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
    const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
    const bad: string[] = []; const ukTotal: Record<string, number> = {};
    for (const X of ['UK', ...ALL.filter(c => c !== 'UK')] as Array<typeof ALL[number]>) {
      const B = X === 'UK' ? base : RR.buildRegionalLibrary(base, X);
      const rd = RR.REGIONAL_DATA[X], uk = RR.REGIONAL_DATA.UK;
      const f = [rd.labour.semiskilled / uk.labour.semiskilled, rd.labour.skilled / uk.labour.skilled, rd.machineRateMultiplier, rd.materialMultiplier,
        rd.materialFactors.commodityResin, rd.materialFactors.engineeringResin, rd.materialFactors.highPerfResin,
        rd.energy.electricityPerKwh / uk.energy.electricityPerKwh, S.countryFactor('toolroom', X), S.countryFactor('process', X),
        S.countryFactor('heatTreat', X), rd.logisticsMultiplier, rd.packagingMultiplier, 1];
      const lo = Math.min(...f) * 0.9, hi = Math.max(...f) * 1.1;
      for (const p of parts) {
        const r = await costMeasuredPart(p.geometry, p.part,
          { partNumber: p.part, file: p.part, annualVolume: 50_000, ...(p.commodity ? { commodity: p.commodity } : {}) },
          p.answers, X, { annualVolume: 50_000 }, base, { partNumber: p.part, file: p.part, status: 'error' } as never);
        if (r.status !== 'costed') { bad.push(`${X} ${p.part}: ${r.status}`); continue; }
        if (r.trace!.rateBook !== B.version) bad.push(`${X} ${p.part}: book ${r.trace!.rateBook}`);
        for (const o of r.trace!.operations) {
          const m = B.machines.find(x => x.id === o.machineId), l = B.labour.find(x => x.id === o.labourId);
          if (o.machineRateUsed && !close(o.machineRateUsed, m?.computedRatePerHr ?? NaN)) bad.push(`${X} ${p.part} ${o.machineId}`);
          if (o.labourRateUsed && !close(o.labourRateUsed, l?.fullyLoadedRatePerHr ?? NaN)) bad.push(`${X} ${p.part} ${o.labourId}`);
        }
        for (const t of r.trace!.traceability) {
          if (t.field === 'material.pricePerKg' && !close(t.value, B.materials.find(m => m.id === t.rateId)?.pricePerKg ?? NaN)) bad.push(`${X} ${p.part} ${t.rateId}`);
          if (t.field.startsWith('rawMaterial.energyKwh') && t.rateId !== B.energy[0].id) bad.push(`${X} ${p.part} energy ${t.rateId}`);
        }
        if (X === 'UK') ukTotal[p.part] = r.total!;
        else { const q = r.total! / ukTotal[p.part]; if (q < lo || q > hi) bad.push(`${X} ${p.part} ×${q.toFixed(3)} outside [${lo.toFixed(2)}, ${hi.toFixed(2)}]`); }
      }
    }
    expect(bad).toEqual([]);
  }, 1_200_000);

  it('heat treatment counts the country once (own-shop countries were cut twice by the overhead factor)', () => {
    const src = readFileSync('src/engine/gear-heat-treat-rate.ts', 'utf8');
    expect(src).toContain('(ownShop ? 1 : f.ovhMult)');
    expect(src).toContain('(ownShop ? 1 : f.freightMult)');
  });

  it('the sourcing insight compares against the country costed in, for every country', async () => {
    const { generateInsights } = await import('../src/engine/insights.js');
    expect(typeof generateInsights).toBe('function');
    const src = readFileSync('src/engine/insights.ts', 'utf8');
    expect(src).toContain('resolveManufacturingRegion(ctx?.region');
    expect(src).not.toContain("REGIONAL_COST_INDEX['China']");
  });

  it('software should-cost follows the country to its nearest engineering hub, for every country', async () => {
    const { swRegionFor } = await import('../src/engine/sw-should-cost.js');
    for (const c of ALL) expect(swRegionFor(c).region, c).toBeTruthy();
    expect(swRegionFor('IN').region).toBe('India');
    expect(swRegionFor('PL').region).toBe('Eastern_Europe');
    expect(swRegionFor('VN').basis).toContain('nearest');
    expect(readFileSync('src/ui/main.ts', 'utf8')).toContain("swSel.value = swRegionFor(region).region");
  });

  it('the AI agent quotes the request country\'s £/hr (it quoted the UK\'s in every country)', () => {
    const src = readFileSync('server/routes/agent.ts', 'utf8');
    expect(src.match(/system: systemPromptFor\(region\)/g)).toHaveLength(3);
  });
});
