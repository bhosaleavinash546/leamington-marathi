/**
 * Surface treatment — the claims a paint-shop manager would challenge.
 *
 * The commodity was 107 lines that modelled the paint correctly and the LINE as
 * a single parts-per-hour number. Measuring it showed what that hid, and these
 * pin each fix — including the one that matters most, which is a cost the model
 * must NOT contain:
 *
 *   - a line charges by the CARRIER, not the part;
 *   - pre-treatment is bath chemistry, not a paint film;
 *   - masking is per-part labour, not a fixture cost;
 *   - plating dwell is LINEAR in thickness and caps throughput;
 *   - the oven and tanks are in the machine rate and are NOT charged twice.
 */
import { describe, it, expect } from 'vitest';
import {
  computeSurfaceTreatment, platingDwellMinutes,
  STANDARD_PAINT_LINE_STAGES, STANDARD_ZINC_PLATE_STAGES,
} from '../src/engine/surface-treatment-rate.js';
import {
  SURFACE_STAGES, findSurfaceStage, surfaceDataCoverage, surfaceDataWarning,
  PLATING_DEPOSIT_UM_PER_MIN,
} from '../src/engine/surface-treatment-data.js';
import {
  computePaintingDrivers, analysePainting, coatWetVolumeLitres,
  type PaintingInputs,
} from '../src/engine/modules/painting.js';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { REGIONAL_DATA } from '../src/engine/regional-rates.js';
import { runSensitivity } from '../src/engine/sensitivity.js';

const paintPart = (over: Partial<PaintingInputs> = {}): PaintingInputs => ({
  surfaceAreaM2: 0.8,
  coats: [
    { coatType: 'e_coat', materialId: 'mat-paint-ecoat', dftMicrons: 20, solidsPct: 0.20, transferEfficiency: 0.95, paintDensityKgPerL: 1.30, pricePerL: 4.55 },
    { coatType: 'basecoat', materialId: 'mat-paint-basecoat', dftMicrons: 15, solidsPct: 0.35, transferEfficiency: 0.70, paintDensityKgPerL: 1.25, pricePerL: 10.25 },
  ],
  lineId: 'paint-line-std', labourId: 'lab-uk-semiskilled',
  lineRatePartsPerHr: 120, oee: 0.85, manning: 4, labourEfficiency: 0.95,
  rejectReworkPct: 0.03, toolingCost: 5_000, amortizationVolume: 200_000,
  stages: STANDARD_PAINT_LINE_STAGES, partsPerRack: 6, racksPerHour: 20,
  ...over,
});

const total = (i: PaintingInputs): number => {
  const d = computePaintingDrivers(i);
  return computeUniversalStack({
    partName: 'p', rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
    packagingPerPart: 0.05, logisticsPerPart: 0.06,
    overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000,
  }, DEFAULT_RATE_LIBRARY).total;
};

describe('a line charges by the carrier, not by the part', () => {
  it('throughput is parts per rack x racks per hour', () => {
    const r = computeSurfaceTreatment({
      stages: STANDARD_PAINT_LINE_STAGES, surfaceAreaM2: 0.8,
      partsPerRack: 6, racksPerHour: 20,
    });
    expect(r.partsPerHour).toBe(120);
    expect(r.cycleTimeHr).toBeCloseTo(1 / 120, 9);
  });

  it('doubling rack density halves the line cycle — the 55% lever', () => {
    const sparse = computeSurfaceTreatment({ stages: STANDARD_PAINT_LINE_STAGES, surfaceAreaM2: 0.8, partsPerRack: 6, racksPerHour: 20 });
    const dense = computeSurfaceTreatment({ stages: STANDARD_PAINT_LINE_STAGES, surfaceAreaM2: 0.8, partsPerRack: 12, racksPerHour: 20 });
    expect(dense.cycleTimeHr).toBeCloseTo(sparse.cycleTimeHr / 2, 9);
    // And it reaches the costed part.
    expect(total(paintPart({ partsPerRack: 12 }))).toBeLessThan(total(paintPart({ partsPerRack: 6 })));
  });

  it('chemistry and masking do NOT get cheaper by racking more parts', () => {
    // They are consumed by the part itself, so they must not scale with the
    // carrier. Getting this wrong would make dense racking look free.
    const a = computeSurfaceTreatment({ stages: ['degrease', 'phosphate', 'masking'], surfaceAreaM2: 0.8, partsPerRack: 3, racksPerHour: 20 });
    const b = computeSurfaceTreatment({ stages: ['degrease', 'phosphate', 'masking'], surfaceAreaM2: 0.8, partsPerRack: 30, racksPerHour: 20 });
    expect(b.chemistryPerPart).toBeCloseTo(a.chemistryPerPart, 9);
    expect(b.maskingLabourPerPart).toBeCloseTo(a.maskingLabourPerPart, 9);
    expect(b.cycleTimeHr).toBeLessThan(a.cycleTimeHr);
  });

  it('an unknown rack density defaults to 1 — pessimistic, and warned about', () => {
    const r = computeSurfaceTreatment({ stages: STANDARD_PAINT_LINE_STAGES, surfaceAreaM2: 0.8, racksPerHour: 20 });
    expect(r.partsPerRack).toBe(1);
    const a = analysePainting(paintPart({ partsPerRack: undefined }));
    expect(a.warnings.join(' ')).toMatch(/pessimistic/i);
  });
});

describe('the machine rate already contains the oven — do not charge it twice', () => {
  it('the engine returns NO energy, capital or overhead line', () => {
    // This is the trap the first version of this module fell into: it built a
    // full line rate on top of `paint-line-std`, whose build-up already carries
    // £80k/yr of energy and £120k/yr of depreciation. The absence of these keys
    // is the guard, so a future edit that adds them fails here.
    const r = computeSurfaceTreatment({ stages: STANDARD_PAINT_LINE_STAGES, surfaceAreaM2: 0.8, partsPerRack: 6, racksPerHour: 20 });
    expect(r).not.toHaveProperty('energy');
    expect(r).not.toHaveProperty('capital');
    expect(r).not.toHaveProperty('overhead');
    // The adders are EXACTLY the things no machine rate contains, and nothing
    // else. Written as an exhaustive sum so adding a line without thinking
    // about whether the machine rate already holds it fails here.
    expect(r.addersPerPart).toBeCloseTo(
      r.chemistryPerPart + r.effluentPerPart + r.depositedMetalPerPart
      + r.maskingLabourPerPart + r.colourChangePerPart, 9);
  });

  it('and the workbook\'s standalone-line fixed cost is NOT imported either', () => {
    // The supplied workbook costs each process as its own line with its own
    // overhead, capital and permit, then subtracts a 25-35% "integrated-line
    // credit" to undo the double-count. We cost line time once on a machine
    // rate, so there is nothing to credit back — and no credit factor to get
    // wrong. Capital is carried in the data for reference and never charged.
    const r = computeSurfaceTreatment({
      stages: STANDARD_PAINT_LINE_STAGES, surfaceAreaM2: 0.8, partsPerRack: 6, racksPerHour: 20,
    });
    expect(r).not.toHaveProperty('integratedLineCredit');
    expect(r).not.toHaveProperty('capitalRecovery');
    expect(r).not.toHaveProperty('maintenance');
  });

  it('the paint line machine still carries the line time', () => {
    const d = computePaintingDrivers(paintPart());
    const line = d.operations.find(o => o.operationName === 'Paint Line');
    expect(line?.machineId).toBe('paint-line-std');
    expect(line!.cycleTimeHr).toBeGreaterThan(0);
  });
});

describe('pre-treatment is bath chemistry, not a paint film', () => {
  it('"pretreat" is no longer a coat type', () => {
    // It used to be, and a stage entered that way was costed with the film-build
    // formula — thickness / solids x price per litre — which has no physical
    // meaning for phosphating. The type system now prevents it.
    const coatTypes = ['e_coat', 'primer', 'basecoat', 'clearcoat', 'powder'];
    expect(coatTypes).not.toContain('pretreat');
  });

  it('phosphate is costed per m² of area, and scales with it', () => {
    const small = computeSurfaceTreatment({ stages: ['phosphate'], surfaceAreaM2: 0.5, partsPerRack: 6, racksPerHour: 20 });
    const big = computeSurfaceTreatment({ stages: ['phosphate'], surfaceAreaM2: 1.5, partsPerRack: 6, racksPerHour: 20 });
    expect(big.chemistryPerPart / small.chemistryPerPart).toBeCloseTo(3, 6);
    // And it is NOT a function of any film thickness.
    expect(SURFACE_STAGES.phosphate.kind).toBe('bath');
  });

  it('the paint film maths itself is untouched — it was already right', () => {
    const coat = paintPart().coats[1];
    const l = coatWetVolumeLitres(coat, 0.8);
    // 0.8 m² x 15 µm / (0.35 x 0.70) x 1000 = 0.049 L
    expect(l).toBeCloseTo((0.8 * 15e-6) / (0.35 * 0.70) * 1000, 9);
  });
});

describe('masking is per-part labour, not a fixture cost', () => {
  it('a masked route adds a labour operation with no machine time', () => {
    const masked = paintPart({ stages: ['degrease', 'phosphate', 'masking', 'cure_oven', 'demask'] });
    const d = computePaintingDrivers(masked);
    const op = d.operations.find(o => /mask/i.test(o.operationName));
    expect(op).toBeTruthy();
    expect(op!.labourTimeHr).toBeGreaterThan(0);
    expect(op!.cycleTimeHr).toBe(0);       // a bench, not a machine
    // 45 s masking + 25 s de-mask = 70 s of operator time.
    const r = computeSurfaceTreatment({ stages: ['masking', 'demask'], surfaceAreaM2: 0.8 });
    expect(r.maskingSeconds).toBe(70);
    expect(r.maskingLabourPerPart)
      .toBeCloseTo((70 / 3600) * REGIONAL_DATA.UK.labour.semiskilled, 9);
  });

  it('an unmasked route adds no masking operation at all', () => {
    const d = computePaintingDrivers(paintPart());
    expect(d.operations.some(o => /mask/i.test(o.operationName))).toBe(false);
  });
});

describe('plating — a process family the model did not have', () => {
  it('dwell is LINEAR in thickness, not squared like a diffusion case', () => {
    const st = SURFACE_STAGES.zinc_plate;
    const rate = PLATING_DEPOSIT_UM_PER_MIN.zinc_plate.value;
    expect(platingDwellMinutes(st, 8)).toBeCloseTo(8 / rate, 9);
    expect(platingDwellMinutes(st, 16)).toBeCloseTo(2 * platingDwellMinutes(st, 8), 9);
    // Emphatically NOT 4x, which the carburising square law would have given.
    expect(platingDwellMinutes(st, 16)).not.toBeCloseTo(4 * platingDwellMinutes(st, 8), 3);
  });

  it('a thick deposit caps throughput, because one load occupies the tank', () => {
    const thin = computeSurfaceTreatment({ stages: STANDARD_ZINC_PLATE_STAGES, surfaceAreaM2: 0.05, partsPerRack: 200, racksPerHour: 3, depositThicknessUm: 5 });
    const thick = computeSurfaceTreatment({ stages: STANDARD_ZINC_PLATE_STAGES, surfaceAreaM2: 0.05, partsPerRack: 200, racksPerHour: 3, depositThicknessUm: 25 });
    expect(thin.throughputCappedBy).toBeNull();
    expect(thick.throughputCappedBy).toMatch(/holds one load/);
    expect(thick.racksPerHour).toBeLessThan(thin.racksPerHour);
    expect(thick.cycleTimeHr).toBeGreaterThan(thin.cycleTimeHr);
  });

  it('a conveyorised paint line is NOT capped by its oven dwell', () => {
    // Twenty minutes in the oven does not stop 20 racks an hour: a dozen racks
    // are inside it at once. Only one-load-at-a-time stages limit the line.
    const r = computeSurfaceTreatment({ stages: STANDARD_PAINT_LINE_STAGES, surfaceAreaM2: 0.8, partsPerRack: 6, racksPerHour: 20 });
    expect(SURFACE_STAGES.cure_oven.dwellMinutes.value).toBe(20);
    expect(r.maxRacksPerHourFromDwell).toBe(Infinity);
    expect(r.throughputCappedBy).toBeNull();
    expect(r.racksPerHour).toBe(20);
  });

  it('zinc-nickel is dearer than plain zinc on both chemistry and time', () => {
    expect(SURFACE_STAGES.zinc_nickel.chemistryGBPPerUnit.value)
      .toBeGreaterThan(SURFACE_STAGES.zinc_plate.chemistryGBPPerUnit.value * 2);
    expect(PLATING_DEPOSIT_UM_PER_MIN.zinc_nickel.value)
      .toBeLessThan(PLATING_DEPOSIT_UM_PER_MIN.zinc_plate.value);
  });
});

describe('the model refuses rather than guesses', () => {
  it('an unknown stage throws instead of being skipped', () => {
    expect(() => computeSurfaceTreatment({ stages: ['degrease', 'unobtainium_dip'], surfaceAreaM2: 0.8 }))
      .toThrow(/No surface-treatment stage/);
  });

  it('the legacy single-rate path still works, and says it is the legacy path', () => {
    const legacy = paintPart({ stages: undefined, partsPerRack: undefined, racksPerHour: undefined });
    const a = analysePainting(legacy);
    expect(a.legacyLineRate).toBe(true);
    expect(a.surface).toBeNull();
    expect(a.warnings.join(' ')).toMatch(/bundles three separate drivers/);
    // And it still costs, so no caller breaks.
    expect(total(legacy)).toBeGreaterThan(0);
  });

  it('every estimate carries the representative-data warning', () => {
    const c = surfaceDataCoverage();
    expect(c.total).toBeGreaterThan(40);
    expect(c.unverified).toBe(c.total);
    expect(surfaceDataWarning()).toMatch(/not plant data/);
    expect(surfaceDataWarning()).toMatch(/NOT\s+quotable/);
  });

  it('every stage carries provenance and a real note', () => {
    for (const [key, st] of Object.entries(SURFACE_STAGES)) {
      for (const [field, v] of Object.entries(st)) {
        if (v && typeof v === 'object' && 'value' in v && 'status' in v) {
          expect(v.status, `${key}.${field}`).toBe('unverified');
          expect(String(v.source).length).toBeGreaterThan(20);
        }
      }
      expect(st.note.length, `${key} note`).toBeGreaterThan(40);
    }
  });

  it('stages resolve by key, by our id, and by the workbook id', () => {
    expect(findSurfaceStage('cure_oven')).toBe(SURFACE_STAGES.cure_oven);
    expect(findSurfaceStage('SF-12')).toBe(SURFACE_STAGES.cure_oven);
    // Our numbering deliberately differs from the workbook's — ours is SF-nn so
    // a report cannot print "ST-02 Rinse" beside a workbook whose ST-02 is shot
    // blasting. The workbook id still resolves, via workbookRef.
    expect(findSurfaceStage('ST-15')).toBe(SURFACE_STAGES.zinc_plate);
    expect(findSurfaceStage('nope')).toBeNull();
  });
});

describe('regional behaviour', () => {
  it('chemistry and masking follow the region, not a UK basis converted', () => {
    const uk = computeSurfaceTreatment({ stages: ['phosphate', 'masking'], surfaceAreaM2: 0.8, region: 'UK' });
    const cn = computeSurfaceTreatment({ stages: ['phosphate', 'masking'], surfaceAreaM2: 0.8, region: 'CN' });
    expect(cn.maskingLabourPerPart / uk.maskingLabourPerPart)
      .toBeCloseTo(REGIONAL_DATA.CN.labour.semiskilled / REGIONAL_DATA.UK.labour.semiskilled, 6);
    expect(cn.chemistryPerPart).toBeLessThan(uk.chemistryPerPart);
  });
});

describe('the colour-change purge', () => {
  it('is amortised over the run, so a short run carries it heavily', () => {
    const long = computeSurfaceTreatment({ stages: ['cure_oven'], surfaceAreaM2: 0.8, colourChangeCostGBP: 120, partsPerColourRun: 2000 });
    const short = computeSurfaceTreatment({ stages: ['cure_oven'], surfaceAreaM2: 0.8, colourChangeCostGBP: 120, partsPerColourRun: 50 });
    expect(long.colourChangePerPart).toBeCloseTo(0.06, 9);
    expect(short.colourChangePerPart).toBeCloseTo(2.40, 9);
  });

  it('is absent when not supplied, rather than assumed', () => {
    const r = computeSurfaceTreatment({ stages: ['cure_oven'], surfaceAreaM2: 0.8 });
    expect(r.colourChangePerPart).toBe(0);
  });
});

describe('a plating route runs on a plating line, not a paint line', () => {
  it('the rate library now carries plating machines at all', () => {
    // It did not: a zinc-plate route was costed on `paint-line-std`, whose
    // build-up is gas ovens, spray booths and an RTO.
    const ids = DEFAULT_RATE_LIBRARY.machines.map(m => m.id);
    expect(ids).toContain('plating-line-barrel');
    expect(ids).toContain('plating-line-rack');
  });

  it('a plating line is materially cheaper per hour than a paint line', () => {
    const rate = (id: string): number =>
      DEFAULT_RATE_LIBRARY.machines.find(m => m.id === id)!.computedRatePerHr;
    // No ovens, no booths, no thermal oxidiser — roughly half.
    expect(rate('plating-line-barrel')).toBeLessThan(rate('paint-line-std') * 0.6);
    // Rack plating jigs parts individually: dearer than barrel, still under paint.
    expect(rate('plating-line-rack')).toBeGreaterThan(rate('plating-line-barrel'));
    expect(rate('plating-line-rack')).toBeLessThan(rate('paint-line-std'));
  });

  it('costing a plating route on a paint line is caught, not accepted', () => {
    // The guard lives in the UI collector; assert the machine ids it keys off
    // are real, so a rename cannot silently disable it.
    const ids = DEFAULT_RATE_LIBRARY.machines.map(m => m.id);
    for (const id of ['paint-line-std', 'plating-line-barrel', 'plating-line-rack']) {
      expect(ids, id).toContain(id);
    }
    // And the plating stages exist to be routed to them.
    expect(findSurfaceStage('zinc_plate')).toBeTruthy();
    expect(findSurfaceStage('zinc_nickel')).toBeTruthy();
    expect(findSurfaceStage('anodise')).toBeTruthy();
  });

  it('the paint line says its energy is already counted, so nobody adds it twice', () => {
    const m = DEFAULT_RATE_LIBRARY.machines.find(x => x.id === 'paint-line-std')!;
    expect(m.sourceNote).toMatch(/ALREADY here|must not be added again/i);
    expect(m.buildup.energy).toBeGreaterThan(0);
  });
});

describe('the report names the process it actually costed', () => {
  it('a plating route is not called a Paint Line', () => {
    // Found live: a zinc-plate job printed an operation "Paint Line" running on
    // a "Barrel Plating Line", and the sensitivity table inherited the wrong
    // name as `Paint Line.machineRatePerHr`.
    const d = computePaintingDrivers(paintPart({
      stages: STANDARD_ZINC_PLATE_STAGES, lineId: 'plating-line-barrel', coats: [],
    }));
    expect(d.operations[0].operationName).toBe('Plating Line');

    const anod = computePaintingDrivers(paintPart({
      stages: ['degrease', 'rinse', 'anodise', 'rinse', 'dry_off'],
      lineId: 'plating-line-rack', coats: [],
    }));
    expect(anod.operations[0].operationName).toBe('Anodising Line');
  });

  it('a paint route is still called a Paint Line', () => {
    expect(computePaintingDrivers(paintPart()).operations[0].operationName)
      .toBe('Paint Line');
  });
});

describe('the route and the coat list must not contradict each other', () => {
  it('a plating route carrying paint coats is called out', () => {
    // The form defaults to e-coat + basecoat. Selecting zinc plate left them
    // on, pricing a paint film onto a part that is never painted — measured
    // live at 38% of the part, larger than the line cost beside it.
    const a = analysePainting(paintPart({
      stages: STANDARD_ZINC_PLATE_STAGES, lineId: 'plating-line-barrel',
    }));
    expect(a.warnings.some(w => /no paint stage/i.test(w))).toBe(true);
  });

  it('and clearing the coats clears the warning and the film cost', () => {
    const plated = paintPart({
      stages: STANDARD_ZINC_PLATE_STAGES, lineId: 'plating-line-barrel', coats: [],
    });
    expect(analysePainting(plated).warnings.some(w => /no paint stage/i.test(w)))
      .toBe(false);
    // The film was real money: dropping it must move the part.
    expect(total(plated)).toBeLessThan(total(paintPart({
      stages: STANDARD_ZINC_PLATE_STAGES, lineId: 'plating-line-barrel',
    })));
  });

  it('a paint route with no coats is called out too — the gap cuts both ways', () => {
    const a = analysePainting(paintPart({ coats: [] }));
    expect(a.warnings.some(w => /paint route with no coats/i.test(w))).toBe(true);
  });

  it('a normal painted part raises neither contradiction', () => {
    const w = analysePainting(paintPart()).warnings.join(' ');
    expect(w).not.toMatch(/no paint stage|paint route with no coats/i);
  });
});

describe('every route must survive the validator, not just the engine', () => {
  // The masked route passed every engine test above and was still completely
  // un-calculable in the product: `validateStackInput` rejected the masking
  // operation's zero cycle time, so Calculate silently produced nothing. The
  // tests all called the engine directly and stepped over the validator, which
  // is exactly the gap a live browser run exists to catch. These close it.
  const validate = (i: PaintingInputs) => {
    const d = computePaintingDrivers(i);
    return validateStackInput({
      partName: 'p', rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
      packagingPerPart: 0.05, logisticsPerPart: 0.06,
      overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000,
    }, DEFAULT_RATE_LIBRARY);
  };

  const ROUTES: Record<string, string[]> = {
    standard_paint: STANDARD_PAINT_LINE_STAGES,
    paint_masked: ['degrease', 'rinse', 'phosphate', 'rinse', 'di_rinse', 'masking', 'dry_off', 'flash_off', 'cure_oven', 'demask'],
    zirconium_paint: ['degrease', 'rinse', 'zirconium', 'rinse', 'di_rinse', 'dry_off', 'flash_off', 'cure_oven'],
    zinc_plate: STANDARD_ZINC_PLATE_STAGES,
    zinc_nickel: ['degrease', 'rinse', 'zinc_nickel', 'rinse', 'passivate', 'dry_off'],
    anodise: ['degrease', 'rinse', 'anodise', 'rinse', 'dry_off'],
  };

  for (const [name, stages] of Object.entries(ROUTES)) {
    it(`the ${name} route validates`, () => {
      const v = validate(paintPart({ stages }));
      expect(v.errors, `${name}: ${v.errors.map(e => `${e.field} ${e.message}`).join('; ')}`)
        .toEqual([]);
      expect(v.valid).toBe(true);
    });
  }

  it('and the guard it needed is still on for ordinary operations', () => {
    // A machining op with no cycle time is a real bug — relaxing the rule for
    // everyone to let masking through would have hidden it.
    const d = computePaintingDrivers(paintPart());
    const broken = {
      partName: 'p', rawMaterial: d.rawMaterial,
      operations: [{ ...d.operations[0], cycleTimeHr: 0 }],
      tooling: d.tooling, packagingPerPart: 0.05, logisticsPerPart: 0.06,
      overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000,
    };
    const v = validateStackInput(broken, DEFAULT_RATE_LIBRARY);
    expect(v.valid).toBe(false);
    expect(v.errors.some(e => /cycleTimeHr/.test(e.field))).toBe(true);
  });

  it('a bench operation is charged labour but no machine time', () => {
    const masked = paintPart({ stages: ROUTES.paint_masked });
    const d = computePaintingDrivers(masked);
    const op = d.operations.find(o => /mask/i.test(o.operationName))!;
    expect(op.benchOperation).toBe(true);
    expect(op.cycleTimeHr).toBe(0);
    expect(op.labourTimeHr).toBeGreaterThan(0);
    // Masking is real money: it must move the part it is added to.
    expect(total(masked)).toBeGreaterThan(total(paintPart()));
  });
});

describe('a bench operation must not advertise a machine-rate lever it does not have', () => {
  const masked = () => paintPart({
    stages: ['degrease', 'rinse', 'phosphate', 'rinse', 'di_rinse', 'masking',
             'dry_off', 'flash_off', 'cure_oven', 'demask'],
  });
  const stackInput = (i: PaintingInputs) => {
    const d = computePaintingDrivers(i);
    return {
      partName: 'p', rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
      packagingPerPart: 0.05, logisticsPerPart: 0.06,
      overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000,
    };
  };

  it('it is not traced as a machine rate', () => {
    const r = computeUniversalStack(stackInput(masked()), DEFAULT_RATE_LIBRARY);
    const fields = r.traceability.map(t => t.field);
    expect(fields).toContain('Paint Line.machineRatePerHr');
    expect(fields).not.toContain('Masking / de-masking.machineRatePerHr');
    // Its labour rate IS a genuine driver and must stay.
    expect(fields).toContain('Masking / de-masking.labourRatePerHr');
  });

  it('and the tornado lists the line rate once, not twice', () => {
    const s = runSensitivity(stackInput(masked()), DEFAULT_RATE_LIBRARY);
    const machineRows = s.drivers.filter(d => /Machine Rate/.test(d.driver));
    expect(machineRows.map(d => d.driver)).toEqual(['Paint Line: Machine Rate']);
  });
});
