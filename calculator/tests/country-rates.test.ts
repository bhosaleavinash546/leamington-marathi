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
    const uk = computeExtrusionDrivers(p).rawMaterial.consumablesCostPerPart!;
    const cn = withRates(CN, () => computeExtrusionDrivers(p)).rawMaterial.consumablesCostPerPart!;
    expect(cn / uk).toBeCloseTo(R.CN.energy.electricityPerKwh / R.UK.energy.electricityPerKwh, 3);
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
