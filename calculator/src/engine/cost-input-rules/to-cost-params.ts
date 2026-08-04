/**
 * `costInputSuggestions` → the inputs a commodity module actually costs.
 *
 * This is the hop that has never existed outside the browser. `applyRuleDecisions`
 * stops at `analysis.costInputSuggestions`; everything from there to
 * `compute<X>Drivers` lives in `src/ui/main.ts` inside `applyCADToForm` and the
 * `collect<Commodity>Input()` functions, which read the DOM. So a CAD analysis
 * has never been costable headlessly — not in a test, not in a script, not on
 * the server — and that is why no rules-vs-AI comparison of **£/part** has ever
 * been run. Only the material bucket could be checked.
 *
 * ## Why both arms go through this same function
 *
 * The comparison is only honest if the two analyses are converted identically.
 * An AI analysis and a rule analysis are the same shape — `CADAnalysisResult` —
 * so they map through one function, and any difference in the resulting cost is
 * a difference in what the two paths *decided*, never in how they were read.
 *
 * That has a deliberate consequence worth stating: the rules compute about 55
 * values that `RULE_PATH_MAP` has nowhere to put (`ApplyResult.notWritten` —
 * machine ids, fill/pack/eject splits, projected areas). Those never reach
 * `costInputSuggestions`, so they do not reach the cost here either. This
 * measures what the tool *ships*, not what the rules could do if fully wired.
 * Closing that gap is separate work; pretending it is already closed would make
 * the comparison flattering and useless.
 *
 * ## The defaults
 *
 * Shop parameters — OEE, manning, labour efficiency, scrap, the labour grade —
 * are not in a CAD file and never will be. They are pinned in `SHOP_DEFAULTS`
 * below, applied identically to both arms, so a cost difference can never be an
 * artefact of one arm getting a kinder shop. They are assumptions, not
 * measurements, and any number that moves because of them is attributable to
 * this block.
 */
import type { CADAnalysisResult } from '../ai-analysis.js';
import { pickHPDCMachineId, pickStampingPressId, pickMachiningCentreId } from '../machine-sizing.js';
import { representativeMaterialId, isLibraryMaterialId } from './derive/material.js';
import type { MaterialFamily } from '../material-family.js';

type CostInputs = CADAnalysisResult['costInputSuggestions'];

/**
 * The grade to price this part at.
 *
 * Two shapes arrive here. The AI path returns a real library id; the rules
 * return the **family** they resolved, because that is what a measured volume
 * plus an engineer's answer honestly settles. A family is not a price, so it
 * is mapped to a representative grade and reported as an assumption.
 */
function resolveMaterialId(
  commodity: string, carried: string, familyHint?: MaterialFamily | null,
): { id: string | null; assumed: string | null } {
  if (isLibraryMaterialId(carried)) return { id: carried, assumed: null };
  const family = (carried || familyHint || '') as MaterialFamily;
  if (!family) return { id: null, assumed: null };
  const id = representativeMaterialId(commodity, family);
  return id
    ? { id, assumed: `materialId (${family} → ${id}, representative grade — not a drawing callout)` }
    : { id: null, assumed: null };
}

/**
 * Shop assumptions, identical for both arms.
 *
 * Values are ordinary mid-market figures: 80% OEE is a well-run line that is not
 * pretending, 92% labour efficiency allows for breaks and changeover, and a 2–5%
 * scrap band varies by how forgiving the process is.
 */
export const SHOP_DEFAULTS = {
  oee: 0.80,
  manning: 1,
  labourEfficiency: 0.92,
  rejectRate: 0.03,
  annualVolume: 100_000,
  /** £/part, both arms. The engine's own worked examples use this band. */
  packagingPerPart: 0.15,
  logisticsPerPart: 0.25,
  overheadPct: 0.12,
  marginPct: 0.08,
} as const;

/** Labour grade by commodity — a foundry hand is not a CNC setter. */
const LABOUR: Record<string, string> = {
  casting: 'lab-uk-foundry',
  cast_and_machine: 'lab-uk-foundry',
  forging: 'lab-uk-forge',
  machining: 'lab-uk-skilled',
  sheet_metal: 'lab-uk-semiskilled',
  sheet_metal_fab: 'lab-uk-skilled',
  injection_moulding: 'lab-uk-semiskilled',
  blow_moulding: 'lab-uk-blow',
  thermoforming: 'lab-uk-thermoform',
  rotational_moulding: 'lab-uk-roto',
  rubber: 'lab-uk-semiskilled',
  composites: 'lab-uk-skilled',
};

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;

/** Injection press tonnage from projected area — 30 MPa cavity pressure, ×1.2. */
function pickIMMPressId(projectedAreaCm2: number): string {
  const tonnes = (projectedAreaCm2 * 30 * 1.2) / 98.07;   // cm² × MPa → tonne-force
  const tiers = [50, 100, 200, 350, 400, 500, 800, 1200, 2000, 3500];
  return `imm-${tiers.find(t => t >= tonnes) ?? 3500}t`;
}

export interface ToCostParamsResult {
  commodity: string;
  params: Record<string, unknown>;
  /** Inputs the analysis did not carry, filled from SHOP_DEFAULTS or a picker. */
  assumed: string[];
}

/**
 * Build the `params` object `executeCalculateCost` feeds to `compute<X>Drivers`.
 *
 * Returns `null` for a commodity with no mapping yet rather than costing it
 * wrong — a silently-defaulted cost is worse than no cost, and this function
 * exists to be trusted by a comparison.
 */
export function toCostParams(
  commodity: string,
  ci: CostInputs,
  annualVolume = SHOP_DEFAULTS.annualVolume,
  familyHint?: MaterialFamily | null,
): ToCostParamsResult | null {
  const assumed: string[] = [];
  const D = SHOP_DEFAULTS;
  const labourId = LABOUR[commodity] ?? 'lab-uk-skilled';
  assumed.push('oee', 'manning', 'labourEfficiency', 'rejectRate', 'labourId');

  // A caller can hand us an analysis with no cost inputs at all (a model reply
  // that omitted the block). Returning null is the contract; throwing here would
  // take down a whole comparison run for one bad part.
  if (!ci) return null;
  const mat = resolveMaterialId(commodity, ci.materialId, familyHint);
  if (!mat.id) return null;     // no grade, no honest price
  const materialId = mat.id;
  if (mat.assumed) assumed.push(mat.assumed);

  const shop = {
    labourId, oee: D.oee, manning: D.manning,
    labourEfficiency: D.labourEfficiency, rejectRate: D.rejectRate,
    amortizationVolume: annualVolume,
  };

  switch (commodity) {
    case 'casting': {
      const c = ci.casting;
      if (!c) return null;
      const weight = num(ci.netWeightKg);
      const params: Record<string, unknown> = {
        ...shop,
        subtype: c.subtype,
        materialId,
        partWeightKg: weight,
        castingYield: num(c.yieldFraction, 0.65),
      };
      // Only the chosen subtype's block is built — the others are noise the
      // model emits for every part because the schema always includes them.
      if (c.subtype === 'hpdc') {
        // Tonnage is not in costInputSuggestions, so size from the plan area a
        // part of this mass implies rather than defaulting to one press.
        params.hpdc = {
          machineId: pickHPDCMachineId(weight * 220),
          cycleTimeSec: num(c.cycleTimeHpdcSec, 45),
          cavities: num(c.cavities, 1),
          dieCost: num(c.dieMouldCostGBP),
          dieLife: num(c.dieMouldLife, 100_000),
        };
        assumed.push('hpdc.machineId');
      } else if (c.subtype === 'sand') {
        params.sand = {
          mouldLineId: 'sand-cast-line',
          cycleTimeHr: num(c.cycleTimeSandGravHr, 0.25),
          patternCost: num(c.dieMouldCostGBP),
          patternLife: num(c.dieMouldLife, 50_000),
          coreCostPerPart: 0,
        };
        assumed.push('sand.mouldLineId', 'sand.coreCostPerPart');
      } else if (c.subtype === 'gravity') {
        params.gravity = {
          machineId: 'grav-die-cast-std',
          cycleTimeHr: num(c.cycleTimeSandGravHr, 0.08),
          mouldCost: num(c.dieMouldCostGBP),
          mouldLife: num(c.dieMouldLife, 50_000),
        };
        assumed.push('gravity.machineId');
      } else {
        params.investment = {
          waxCostPerPart: 0, shellBuildCostPerPart: 0,
          pourLabourId: labourId, pourCycleHr: num(c.cycleTimeSandGravHr, 0.15),
          pourMachineId: 'invest-cast-furnace', waxDieCost: num(c.dieMouldCostGBP),
        };
        assumed.push('investment.waxCostPerPart', 'investment.shellBuildCostPerPart');
      }
      return { commodity, params, assumed };
    }

    case 'forging': {
      const f = ci.forging;
      if (!f) return null;
      const weight = num(ci.netWeightKg);
      return {
        commodity, assumed: [...assumed, 'forgeId', 'heatingEnergyKwhPerKg'],
        params: {
          ...shop,
          materialId,
          partWeightKg: weight,
          flashAndScaleKg: num(f.flashKg),
          yieldFraction: num(f.yieldFraction, 0.675),
          // Tonnage is not carried; size from mass, which tracks plan area well
          // enough on the closed-die parts this path sees.
          forgeId: `forge-press-${weight > 12 ? 4000 : weight > 5 ? 2500 : 1600}t`,
          strokesToForm: num(f.strokes, 3),
          timePerBlowSec: num(f.timePerBlowSec, 10),
          cycleTimeHr: 0,          // computed from strokes × time per blow
          heatingEnergyKwhPerKg: 0.35,
          dieLife: num(f.dieLife, 30_000),
          dieCost: num(f.dieCostGBP),
        },
      };
    }

    case 'machining': {
      const ops = (ci.estimatedOperations ?? []).filter(o => num(o.cycleTimeHr) > 0);
      const cycleHr = num(ci.estimatedCycleTimeHr);
      const net = num(ci.netWeightKg);
      // The browser uses a flat net/0.65 when no stock weight is carried, and
      // costInputSuggestions has no stock field at all, so both arms get it.
      const stock = net / 0.65;
      assumed.push('stockWeightKg (net / 0.65 — no stock field on the contract)', 'partsPerCycle=1', 'labourTimeHr=cycleTimeHr');
      return {
        commodity, assumed,
        params: {
          materialId,
          netWeightKg: net,
          stockWeightKg: stock,
          materialUtilization: stock > 0 ? net / stock : 0.65,
          rejectRate: D.rejectRate,
          // `partsPerCycle` and `labourTimeHr` are required by the module and are
          // not on the analysis contract: one part per cycle, and the operator
          // attends the machine for the whole cut. Both are stated assumptions —
          // omitting them divides by zero and yields NaN rather than an error.
          operations: (ops.length
            ? ops.map(o => ({
                name: o.name,
                machineId: o.machineId || pickMachiningCentreId({ principalDirections: 3, axisymmetric: false }),
                cycleTimeHr: num(o.cycleTimeHr),
                labourId: o.labourId || labourId,
                oee: num(o.oee, D.oee),
                manning: num(o.manning, D.manning),
                labourEfficiency: num(o.labourEfficiency, D.labourEfficiency),
              }))
            : [{
                name: 'Machining', machineId: 'mach-vmc3', cycleTimeHr: cycleHr,
                labourId, oee: D.oee, manning: D.manning, labourEfficiency: D.labourEfficiency,
              }]
          ).map(o => ({ ...o, type: 'milling', partsPerCycle: 1, labourTimeHr: o.cycleTimeHr })),
          setup: {
            machineId: 'mach-vmc3', labourId,
            setupTimeHr: num(ci.estimatedSetupTimeHr, 0.5),
            batchSize: 100,
          },
          programmingNRE: 0,
          toolingCost: 0,
          amortizationVolume: annualVolume,
        },
      };
    }

    case 'injection_moulding': {
      const m = ci.injectionMoulding;
      if (!m) return null;
      const area = num(m.projectedAreaCm2, 100);
      const wall = num(m.wallThicknessMm, 3);
      return {
        commodity, assumed: [...assumed, 'machineId', 'fill/pack/eject split', 'coolTimeFactor'],
        params: {
          ...shop,
          materialId,
          partWeightKg: num(ci.netWeightKg),
          runnerWeightKg: num(m.runnerWeightKg),
          regrindFraction: 0.8,
          cavities: num(m.cavities, 1),
          projectedAreaCm2: area,
          cavityPressureMPa: 30,
          wallThicknessMm: wall,
          coolTimeFactorSPerMm2: 3.16,     // PP basis; the resin-specific figure is an orphan rule
          fillTimeSec: 2, packTimeSec: 6, ejectTimeSec: 3,
          machineId: pickIMMPressId(area),
          mouldCost: num(m.mouldCostGBP),
          mouldLife: num(m.mouldLife, 1_000_000),
        },
      };
    }

    case 'sheet_metal': {
      const s = ci.sheetMetal;
      if (!s) return null;
      const L = num(s.blankLengthMm, 100);
      const W = num(s.blankWidthMm, 100);
      const t = num(s.thicknessMm, 1.5);
      // Blanking force ≈ perimeter × thickness × shear strength.
      const perimeter = 2 * (L + W);
      const tonnes = (perimeter * t * 250) / 9807;
      return {
        commodity, assumed: [...assumed, 'pressId', 'strokesPerMin', 'strip layout'],
        params: {
          ...shop,
          materialId,
          netWeightKg: num(ci.netWeightKg),
          blankLengthMm: L, blankWidthMm: W, thicknessMm: t,
          perimeterMm: perimeter,
          shearStrengthMPa: 250,
          stripWidthMm: W * 1.1, pitchMm: L * 1.05, partsPerStroke: 1,
          pressId: pickStampingPressId(tonnes),
          strokesPerMin: 20,
          numOperations: num(s.numOps, 3),
          dieType: 'progressive',
          dieLife: num(s.dieLife, 1_000_000),
          dieCostEstimate: num(s.dieCostGBP),
        },
      };
    }

    case 'blow_moulding': {
      const b = ci.blowMoulding;
      if (!b) return null;
      return {
        commodity, assumed: [...assumed, 'machineId', 'coolTimeFactor', 'parisonExtrusionTime'],
        params: {
          ...shop,
          materialId,
          partWeightKg: num(ci.netWeightKg),
          flashWeightKg: num(b.flashWeightKg),
          wallThicknessMm: num(b.wallThicknessMm, 3),
          coolTimeFactorSPerMm2: 2.5,
          blowTimeSec: num(b.blowTimeSec, 8),
          openCloseSec: num(b.openCloseSec, 4),
          machineId: b.subtype === 'sbm' ? 'blow-sbm-2stage'
            : b.subtype === 'ibm' ? 'blow-ibm-linear'
            : b.barrierMultilayer ? 'blow-ebm-coex5' : 'blow-ebm-500l',
          cavities: num(b.cavities, 1),
          mouldCost: num(b.mouldCostGBP),
          mouldLife: num(b.mouldLife, 1_000_000),
          parisonExtrusionTimeSec: 6,
        },
      };
    }

    default:
      // No mapping yet. Returning null beats returning a plausible wrong number.
      return null;
  }
}

/** Commodities `toCostParams` can convert today. */
export const COSTABLE_COMMODITIES = [
  'casting', 'forging', 'machining', 'injection_moulding', 'sheet_metal', 'blow_moulding',
];
