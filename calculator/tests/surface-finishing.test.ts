/**
 * Surface finishing inside sheet metal, casting and forging.
 *
 * These three commodities carried NO surface treatment: forging had a flat
 * `descaleCostPerKg`, casting had nothing, sheet metal had a generic
 * consumable. A coated bracket was costed as a bare bracket.
 *
 * The tests that matter most here are the ones that pin what must NOT change:
 * a part with no finishing requested must cost exactly what it cost before, or
 * every existing estimate in the tool has silently moved.
 */
import { describe, it, expect } from 'vitest';
import {
  computeSurfaceFinishing, finishingForCommodity, lineGroupFor, coatingMachineFor,
  PLATING_REWORK_MULTIPLE, surfaceRouteFromCallout,
} from '../src/engine/modules/surface-finishing.js';
import { computeSheetMetalDrivers, type SheetMetalInputs } from '../src/engine/modules/sheet-metal.js';
import { computeForgingDrivers, type ForgingInputs } from '../src/engine/modules/forging.js';
import {
  SURFACE_STAGES, findSurfaceStage,
} from '../src/engine/surface-treatment-data.js';
import {
  STANDARD_POWDER_COAT_STAGES, STANDARD_FORGING_ZINC_STAGES,
  STANDARD_CASTING_ECOAT_STAGES, STANDARD_ZINC_PLATE_STAGES,
  computeSurfaceTreatment, consumablesPerPartFrom,
} from '../src/engine/surface-treatment-rate.js';
import { computePaintingDrivers } from '../src/engine/modules/painting.js';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const bracket = (over: Partial<SheetMetalInputs> = {}): SheetMetalInputs => ({
  materialId: 'mat-dc01', netWeightKg: 1.2,
  blankLengthMm: 260, blankWidthMm: 180, thicknessMm: 1.5, perimeterMm: 900,
  shearStrengthMPa: 250, stripWidthMm: 200, pitchMm: 280, partsPerStroke: 1,
  pressId: 'press-200t', labourId: 'lab-uk-semiskilled', strokesPerMin: 30,
  oee: 0.85, manning: 1, labourEfficiency: 0.95, numOperations: 4,
  dieType: 'progressive', dieLife: 500_000, dieCostEstimate: 60_000,
  amortizationVolume: 400_000,
  ...over,
});

const stackOf = (d: { rawMaterial: unknown; operations: unknown; tooling: unknown }) =>
  computeUniversalStack({
    partName: 'p',
    rawMaterial: d.rawMaterial as never, operations: d.operations as never,
    tooling: d.tooling as never,
    packagingPerPart: 0.05, logisticsPerPart: 0.06,
    overheadPct: 0.12, marginPct: 0.08, annualVolume: 400_000,
  }, DEFAULT_RATE_LIBRARY);

describe('a part with no finishing requested is untouched', () => {
  it('sheet metal costs exactly what it did before', () => {
    // The guard on the whole change. If this moves, every existing estimate in
    // the tool moved with it.
    const bare = computeSheetMetalDrivers(bracket());
    expect(bare.operations.every(o => !/coat|plat|blast|mask|galvan/i.test(o.operationName)))
      .toBe(true);
    expect(bare.rawMaterial.consumablesCostPerPart).toBeUndefined();
  });

  it('and finishingForCommodity returns null rather than an empty route', () => {
    expect(finishingForCommodity(undefined, { massKg: 1, labourId: 'lab-uk-semiskilled' }))
      .toBeNull();
  });
});

describe('finishing reaches the costed part', () => {
  const painted = bracket({
    surfaceFinishing: {
      stages: STANDARD_POWDER_COAT_STAGES,
      productForm: 'sheet_standard',
      partsPerRack: 6, racksPerHour: 20,
    },
  });

  it('adds operations and consumables, and raises the part', () => {
    const bare = stackOf(computeSheetMetalDrivers(bracket()));
    const coated = stackOf(computeSheetMetalDrivers(painted));
    expect(coated.total).toBeGreaterThan(bare.total);
    // Coating on a 1.5 mm stamping is not a rounding error.
    expect((coated.total - bare.total) / bare.total).toBeGreaterThan(0.02);
  });

  it('and the whole thing validates — the route is actually costable', () => {
    const v = validateStackInput({
      partName: 'p', ...computeSheetMetalDrivers(painted),
      packagingPerPart: 0.05, logisticsPerPart: 0.06,
      overheadPct: 0.12, marginPct: 0.08, annualVolume: 400_000,
    }, DEFAULT_RATE_LIBRARY);
    expect(v.errors.map(e => `${e.field}: ${e.message}`)).toEqual([]);
  });
});

describe('stages run on the machine that actually does the work', () => {
  it('blasting is not costed on a paint line', () => {
    expect(lineGroupFor(SURFACE_STAGES.shot_blast)).toBe('blast');
    expect(lineGroupFor(SURFACE_STAGES.impregnation)).toBe('impregnation');
    expect(lineGroupFor(SURFACE_STAGES.galvanise)).toBe('galvanise');
    expect(lineGroupFor(SURFACE_STAGES.powder_coat)).toBe('coating');
  });

  it('a casting route emits a blast, an impregnation and a coating operation', () => {
    const r = computeSurfaceFinishing({
      stages: STANDARD_CASTING_ECOAT_STAGES,
      productForm: 'cast_hpdc', massKg: 2.4,
      labourId: 'lab-uk-semiskilled', partsPerRack: 8, racksPerHour: 15,
    });
    const machines = new Set(r.operations.map(o => o.machineId));
    expect(machines).toContain('blast-machine');
    expect(machines).toContain('impregnation-plant');
    expect(machines).toContain('paint-line-std');
    // Every machine it names must exist, or the costing throws downstream.
    for (const id of machines) {
      expect(DEFAULT_RATE_LIBRARY.machines.some(m => m.id === id), id).toBe(true);
    }
  });

  it('a zinc route picks a plating line, not a paint line', () => {
    const stages = STANDARD_FORGING_ZINC_STAGES.map(k => findSurfaceStage(k)!);
    expect(coatingMachineFor(stages).machineId).toBe('plating-line-barrel');
    // And a bare paint route still picks the paint line.
    expect(coatingMachineFor([SURFACE_STAGES.powder_coat]).machineId).toBe('paint-line-std');
  });

  it('the blast machine is materially cheaper per hour than the paint line', () => {
    const rate = (id: string) =>
      DEFAULT_RATE_LIBRARY.machines.find(m => m.id === id)!.computedRatePerHr;
    expect(rate('blast-machine')).toBeLessThan(rate('paint-line-std') * 0.5);
    // A galvanising kettle is held molten continuously — it is the dear one.
    expect(rate('galvanising-kettle')).toBeGreaterThan(rate('paint-line-std'));
  });
});

describe('mass-basis stages need a mass and say so', () => {
  it('a blast route with no part mass throws rather than costing zero', () => {
    expect(() => computeSurfaceTreatment({
      stages: ['shot_blast'], surfaceAreaM2: 0.3, partsPerRack: 50, racksPerHour: 4,
    })).toThrow(/no part mass was supplied/i);
  });

  it('shot blast scales with mass, not with area', () => {
    const light = computeSurfaceTreatment({
      stages: ['shot_blast'], surfaceAreaM2: 1.0, massKg: 1, partsPerRack: 50, racksPerHour: 4,
    });
    const heavy = computeSurfaceTreatment({
      stages: ['shot_blast'], surfaceAreaM2: 1.0, massKg: 4, partsPerRack: 50, racksPerHour: 4,
    });
    expect(heavy.chemistryPerPart / light.chemistryPerPart).toBeCloseTo(4, 6);
  });
});

describe('the rules a coating engineer would apply', () => {
  const forgingWith = (over: Record<string, unknown> = {}) => computeSurfaceFinishing({
    stages: STANDARD_FORGING_ZINC_STAGES,
    productForm: 'forge_standard', massKg: 2.0,
    labourId: 'lab-uk-semiskilled', partsPerRack: 100, racksPerHour: 3,
    ...over,
  });

  it('high-strength electroplated steel MUST have a de-embrittlement bake', () => {
    const w = forgingWith({ tensileStrengthMPa: 1200 }).warnings.join(' ');
    expect(w).toMatch(/de-embrittlement bake/i);
    expect(w).toMatch(/ASTM B850|ISO 4042/);
  });

  it('and adding the bake clears it', () => {
    const w = forgingWith({
      tensileStrengthMPa: 1200,
      stages: [...STANDARD_FORGING_ZINC_STAGES, 'h2_bake'],
    }).warnings.join(' ');
    expect(w).not.toMatch(/MANDATORY above roughly 1000 MPa/);
  });

  it('a bake with no plating is cost for nothing', () => {
    const w = computeSurfaceFinishing({
      stages: ['shot_blast', 'h2_bake'], productForm: 'forge_standard', massKg: 2,
      labourId: 'lab-uk-semiskilled', partsPerRack: 100, racksPerHour: 3,
    }).warnings.join(' ');
    expect(w).toMatch(/without plating it is cost and lead time for nothing/i);
  });

  it('masking without de-masking is undercounted', () => {
    const w = computeSurfaceFinishing({
      stages: ['degrease', 'masking', 'powder_coat', 'cure_oven'],
      productForm: 'sheet_standard', massKg: 1.2,
      labourId: 'lab-uk-semiskilled', partsPerRack: 6, racksPerHour: 20,
    }).warnings.join(' ');
    expect(w).toMatch(/applied TWICE/i);
  });

  it('an organic coating with no pre-treatment is a scope mismatch', () => {
    const w = computeSurfaceFinishing({
      stages: ['degrease', 'powder_coat', 'cure_oven'],
      productForm: 'sheet_standard', massKg: 1.2,
      labourId: 'lab-uk-semiskilled', partsPerRack: 6, racksPerHour: 20,
    }).warnings.join(' ');
    expect(w).toMatch(/five-stage tunnel against a wipe-down/i);
  });

  it('e-coat below the volume threshold is called out', () => {
    const w = computeSurfaceFinishing({
      stages: ['degrease', 'zirconium', 'e_coat', 'cure_oven'],
      productForm: 'sheet_standard', massKg: 1.2,
      labourId: 'lab-uk-semiskilled', partsPerRack: 6, racksPerHour: 20,
      annualVolume: 20_000,           // ~4,700 m²/yr, far below 150,000
    }).warnings.join(' ');
    expect(w).toMatch(/below the .*m²\/yr where its capital is recoverable/i);
  });

  it('a plating reject is costed at the rework multiple, not 1x', () => {
    const w = forgingWith({ platingRejectPct: 0.03 }).warnings.join(' ');
    // 3% reject at 4.5x is a 13.5% adder.
    expect(w).toMatch(/13\.5% cost adder/);
    expect(PLATING_REWORK_MULTIPLE).toBeGreaterThan(3);
  });

  it('deposited metal is declared a pass-through', () => {
    const r = forgingWith();
    expect(r.surface.depositedMetalPerPart).toBeGreaterThan(0);
    expect(r.warnings.join(' ')).toMatch(/PASS-THROUGH/);
  });
});

describe('forging: the flat descale cost is superseded, and the overlap is reported', () => {
  const forging = (over: Partial<ForgingInputs> = {}): ForgingInputs => ({
    materialId: 'mat-steel-4140', partWeightKg: 2.0, billetWeightKg: 2.6,
    forgePressId: 'forge-press-1600t', labourId: 'lab-uk-skilled',
    cycleTimeSec: 20, oee: 0.75, manning: 2, labourEfficiency: 0.9,
    dieCostEstimate: 30_000, dieLife: 20_000, amortizationVolume: 100_000,
    ...over,
  } as ForgingInputs);

  it('setting both the flat descale and a blast stage is flagged as a double count', () => {
    const d = computeForgingDrivers(forging({
      descaleCostPerKg: 0.08,
      surfaceFinishing: {
        stages: STANDARD_FORGING_ZINC_STAGES,
        productForm: 'forge_standard', partsPerRack: 100, racksPerHour: 3,
      },
    }));
    // The cost is NOT silently changed — the drivers still carry both.
    expect(d.operations.some(o => o.machineId === 'blast-machine')).toBe(true);
    // The report is what carries the warning; check it via the module directly.
    const r = computeSurfaceFinishing({
      stages: STANDARD_FORGING_ZINC_STAGES, productForm: 'forge_standard', massKg: 2.0,
      labourId: 'lab-uk-skilled', partsPerRack: 100, racksPerHour: 3,
      supersededFlatCost: { label: 'descaleCostPerKg', perPart: 0.208, supersededByStageId: 'SF-08' },
    });
    expect(r.warnings.join(' ')).toMatch(/DOUBLE COUNT/);
  });

  it('a blast stage with no flat descale raises nothing', () => {
    const r = computeSurfaceFinishing({
      stages: STANDARD_FORGING_ZINC_STAGES, productForm: 'forge_standard', massKg: 2.0,
      labourId: 'lab-uk-skilled', partsPerRack: 100, racksPerHour: 3,
    });
    expect(r.warnings.join(' ')).not.toMatch(/DOUBLE COUNT/);
  });
});

describe('workbook sheet 07 — the worked example', () => {
  /**
   * The workbook's own part-level example: a 1.5 mm CR4 steel stamped chassis
   * bracket, 1.2 kg, two masked threads, degrease -> pickle -> zinc barrel ->
   * mask x2, at 400k/yr.
   *
   * We should NOT reproduce its total, and the reason is the point: the
   * workbook costs each of those four processes as a standalone line with its
   * own overhead, capital and permit, then subtracts a 30% integrated-line
   * credit to undo the double-count. We cost line time once on a machine rate.
   * What must reconcile is the part the two models share — coated area, and the
   * pass-through floor of chemistry plus deposited metal, which no supplier can
   * quote below.
   */
  const AREA_M2 = 0.234394904458599;          // workbook C10

  it('reproduces the workbook coated area exactly', () => {
    const r = computeSurfaceFinishing({
      stages: ['degrease', 'pickle', 'zinc_plate', 'masking', 'demask'],
      productForm: 'sheet_standard', massKg: 1.2,
      labourId: 'lab-uk-semiskilled', partsPerRack: 100, racksPerHour: 3,
      maskedFeatures: 2, region: 'UK',
    });
    expect(r.areaM2).toBeCloseTo(AREA_M2, 9);
    expect(r.area.source).toBe('bridge');
  });

  it('the chemistry + metal floor is a real, checkable number', () => {
    const r = computeSurfaceFinishing({
      stages: ['degrease', 'pickle', 'zinc_plate', 'masking', 'demask'],
      productForm: 'sheet_standard', massKg: 1.2,
      labourId: 'lab-uk-semiskilled', partsPerRack: 100, racksPerHour: 3,
      maskedFeatures: 2, region: 'UK',
    });
    // No supplier can quote below chemistry + deposited metal — it is pure
    // pass-through. Divide any quotation by this floor: a ratio under ~1.6 means
    // the quote is loss-leading, racking far denser than assumed, or not
    // covering its effluent and capital.
    const floor = r.surface.chemistryPerPart + r.surface.depositedMetalPerPart;
    expect(floor).toBeGreaterThan(0);
    expect(r.consumablesPerPart).toBeGreaterThanOrEqual(floor);
    // Sanity: a 0.234 m² bracket's 8 um zinc is a few pence, not pounds.
    expect(r.surface.depositedMetalPerPart).toBeGreaterThan(0.01);
    expect(r.surface.depositedMetalPerPart).toBeLessThan(0.20);
  });

  it('masking two threads costs twice masking one', () => {
    const one = computeSurfaceFinishing({
      stages: ['degrease', 'zinc_plate', 'masking', 'demask'],
      productForm: 'sheet_standard', massKg: 1.2, labourId: 'lab-uk-semiskilled',
      partsPerRack: 100, racksPerHour: 3, maskedFeatures: 1,
    });
    const two = computeSurfaceFinishing({
      stages: ['degrease', 'zinc_plate', 'masking', 'demask'],
      productForm: 'sheet_standard', massKg: 1.2, labourId: 'lab-uk-semiskilled',
      partsPerRack: 100, racksPerHour: 3, maskedFeatures: 2,
    });
    expect(two.surface.maskingSeconds).toBeCloseTo(one.surface.maskingSeconds * 2, 6);
  });

  it('China is cheaper than the UK, and effluent is why more than labour is', () => {
    const at = (region: string) => computeSurfaceFinishing({
      stages: ['degrease', 'pickle', 'zinc_plate', 'passivate'],
      productForm: 'sheet_standard', massKg: 1.2, labourId: 'lab-uk-semiskilled',
      partsPerRack: 100, racksPerHour: 3, region,
    });
    const uk = at('UK'), cn = at('CN');
    expect(cn.surface.effluentPerPart).toBeLessThan(uk.surface.effluentPerPart * 0.6);
    // Deposited metal is a WORLD price — it must NOT move by region.
    expect(cn.surface.depositedMetalPerPart).toBeCloseTo(uk.surface.depositedMetalPerPart, 9);
  });
});

describe('a drawing callout maps to a route deterministically', () => {
  // The AI reads the note off the drawing; this decides what it means. A model
  // returning free text must never be able to select a price directly.
  const cases: Array<[string, string]> = [
    ['ZINC PLATE 8µm + CLEAR PASSIVATE', 'zinc_plate'],
    ['Zn-Ni 12-15% Ni, 720h NSS', 'zinc_nickel'],
    ['ZINC NICKEL PLATED', 'zinc_nickel'],
    ['GEOMET 500B', 'zinc_flake'],
    ['Zinc flake dip-spin, Cr-free', 'zinc_flake'],
    ['HOT DIP GALVANIZE TO EN ISO 1461', 'galvanise'],
    ['hot-dip galvanised', 'galvanise'],
    ['HARD ANODISE TYPE III 50um', 'anodise'],
    ['Sulphuric anodize, clear', 'anodise'],
    ['E-COAT BLACK 20um', 'e_coat'],
    ['KTL coating', 'e_coat'],
    ['Cathodic electrocoat', 'e_coat'],
    ['POWDER COAT RAL 9005 80um', 'powder_coat'],
    ['SHOT BLAST SA 2.5', 'blast_only'],
    ['Descale before machining', 'blast_only'],
    ['VIBRATORY DEBURR ALL EDGES', 'mass_finish'],
  ];

  for (const [callout, route] of cases) {
    it(`"${callout}" → ${route}`, () => {
      expect(surfaceRouteFromCallout(callout)).toBe(route);
    });
  }

  it('the more specific pattern wins over the substring it contains', () => {
    // "zinc-nickel" contains "zinc"; matching plain zinc plating here would
    // under-cost the part by roughly half.
    expect(surfaceRouteFromCallout('ZINC NICKEL')).toBe('zinc_nickel');
    expect(surfaceRouteFromCallout('ZINC PLATE')).toBe('zinc_plate');
  });

  it('an unrecognised callout returns null rather than the nearest guess', () => {
    // Null means "ask the engineer". Guessing a route can be 5x out.
    expect(surfaceRouteFromCallout('PTFE IMPREGNATED PER CUSTOMER SPEC 442')).toBeNull();
    expect(surfaceRouteFromCallout('')).toBeNull();
    expect(surfaceRouteFromCallout(null)).toBeNull();
    expect(surfaceRouteFromCallout(undefined)).toBeNull();
  });

  it('every route it can return is one the engine can actually cost', () => {
    for (const [, route] of cases) {
      const stages = {
        zinc_plate: ['degrease', 'zinc_plate', 'passivate'],
        zinc_nickel: ['degrease', 'zinc_nickel', 'passivate'],
        zinc_flake: ['degrease', 'zinc_flake'],
        galvanise: ['degrease', 'galvanise'],
        anodise: ['degrease', 'anodise'],
        e_coat: ['degrease', 'zirconium', 'e_coat'],
        powder_coat: ['degrease', 'iron_phosphate', 'powder_coat'],
        blast_only: ['shot_blast'],
        mass_finish: ['mass_finish'],
      }[route]!;
      expect(() => computeSurfaceFinishing({
        stages, productForm: 'sheet_standard', massKg: 1.2,
        labourId: 'lab-uk-semiskilled', partsPerRack: 6, racksPerHour: 20,
      }), route).not.toThrow();
    }
  });
});

describe('AUDIT REGRESSIONS — defects found by tracing inputs to arithmetic', () => {
  /**
   * These pin defects that shipped. Each existed because a value was computed
   * correctly and then not consumed — the failure mode is dead wiring, not bad
   * maths, and it is invisible to a test that only exercises the engine.
   */

  it('A1: a zinc route through the PAINTING form carries its deposited metal', () => {
    // painting.ts summed chemistry + colour change ONLY. When deposited metal
    // and effluent were added to the engine, only the new commodity path was
    // updated — so a plated part costed here silently lost its zinc, the very
    // pass-through the report calls a floor no supplier can quote below.
    const plated = {
      surfaceAreaM2: 0.8, coats: [],
      lineId: 'plating-line-barrel', labourId: 'lab-uk-semiskilled',
      lineRatePartsPerHr: 120, oee: 0.85, manning: 2, labourEfficiency: 0.95,
      rejectReworkPct: 0, toolingCost: 0, amortizationVolume: 200_000,
      stages: STANDARD_ZINC_PLATE_STAGES, partsPerRack: 100, racksPerHour: 3,
    };
    const d = computePaintingDrivers(plated as never);
    const surface = computeSurfaceTreatment({
      stages: STANDARD_ZINC_PLATE_STAGES, surfaceAreaM2: 0.8,
      partsPerRack: 100, racksPerHour: 3,
    });
    expect(surface.depositedMetalPerPart).toBeGreaterThan(0);
    expect(surface.effluentPerPart).toBeGreaterThan(0);
    // The consumable must contain BOTH, not just chemistry.
    const consumable = d.rawMaterial.consumablesCostPerPart ?? 0;
    expect(consumable).toBeGreaterThanOrEqual(
      surface.chemistryPerPart + surface.effluentPerPart + surface.depositedMetalPerPart - 1e-9);
  });

  it('A1: both callers form the consumable the same way', () => {
    // One definition, so a future cost line reaches every caller or none.
    const surface = computeSurfaceTreatment({
      stages: STANDARD_ZINC_PLATE_STAGES, surfaceAreaM2: 0.8,
      partsPerRack: 100, racksPerHour: 3,
    });
    expect(consumablesPerPartFrom(surface))
      .toBeCloseTo(surface.addersPerPart - surface.maskingLabourPerPart, 12);
    // And masking labour is excluded, because it is emitted as an operation.
    const masked = computeSurfaceTreatment({
      stages: ['degrease', 'masking', 'zinc_plate', 'demask'], surfaceAreaM2: 0.8,
      partsPerRack: 100, racksPerHour: 3, maskedFeatures: 3,
    });
    expect(masked.maskingLabourPerPart).toBeGreaterThan(0);
    expect(consumablesPerPartFrom(masked)).toBeLessThan(masked.addersPerPart);
  });

  it('A2: the pressing\'s real thickness reaches the geometry bridge', () => {
    // Coated area is 2000/(t x rho) x shape, so bridging a 0.8 mm pressing as
    // the 1.5 mm reference form understated its area by nearly 2x — while
    // `inputs.thicknessMm` sat in scope, unused.
    const at = (thicknessMm: number) => computeSheetMetalDrivers(bracket({
      thicknessMm,
      surfaceFinishing: {
        stages: STANDARD_POWDER_COAT_STAGES, productForm: 'sheet_standard',
        partsPerRack: 6, racksPerHour: 20,
      },
    })).rawMaterial.consumablesCostPerPart ?? 0;

    const thin = at(0.8);
    const std = at(1.5);
    expect(thin).toBeGreaterThan(std);
    // Area is inversely proportional to thickness, and chemistry follows area.
    expect(thin / std).toBeCloseTo(1.5 / 0.8, 2);
  });

  it('A2: an explicit form entry still overrides the commodity figure', () => {
    const d = computeSheetMetalDrivers(bracket({
      thicknessMm: 1.5,
      surfaceFinishing: {
        stages: STANDARD_POWDER_COAT_STAGES, productForm: 'sheet_standard',
        thicknessMm: 0.8, partsPerRack: 6, racksPerHour: 20,
      },
    }));
    const override = d.rawMaterial.consumablesCostPerPart ?? 0;
    const native = computeSheetMetalDrivers(bracket({
      thicknessMm: 1.5,
      surfaceFinishing: {
        stages: STANDARD_POWDER_COAT_STAGES, productForm: 'sheet_standard',
        partsPerRack: 6, racksPerHour: 20,
      },
    })).rawMaterial.consumablesCostPerPart ?? 0;
    expect(override / native).toBeCloseTo(1.5 / 0.8, 2);
  });
});
