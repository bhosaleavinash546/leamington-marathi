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
import type { CADAnalysisResult, OCCTGeometry } from '../ai-analysis.js';
import { pickHPDCMachineId, pickStampingPressId, pickMachiningCentreId } from '../machine-sizing.js';
import { computeFeatureMachining } from '../feature-machining.js';
import type { FeatureRow } from '../feature-ops.js';
import { estimatePackagingPerPart, estimateLogisticsPerPart } from '../geometry-sanity.js';
import { physicalRemovalCeilingMin } from '../feature-costing.js';
import { featureMinutesEach } from '../feature-machining.js';

/** Same machinability table the machining rules use — duplicated deliberately
 *  small rather than exporting rules internals into the mapper. */
const MACHINABILITY_FOR_CEILING: Partial<Record<MaterialFamily, number>> = {
  aluminium: 1.0, magnesium: 0.8, plastic: 0.6, 'copper alloy': 1.1,
  'cast iron': 1.4, steel: 1.5, titanium: 2.5,
};
import { representativeMaterialId, isLibraryMaterialId, familyFromMaterialId } from './derive/material.js';
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
): { id: string | null; assumed: string | null; family: MaterialFamily | null } {
  if (isLibraryMaterialId(carried)) {
    return { id: carried, assumed: null, family: familyFromMaterialId(carried) ?? familyHint ?? null };
  }
  // The model invents ids: round 1 of the A/B returned `mat-hss`, which is in
  // no library, and the whole part became uncostable. An invented id usually
  // still NAMES its family — resolve it through the same token matcher the
  // filenames use, substitute the representative grade, and say so out loud.
  const carriedFamily = carried ? familyFromMaterialId(carried) : null;
  const family = (carriedFamily ?? familyHint ?? (carried as MaterialFamily) ?? '') as MaterialFamily;
  if (!family) return { id: null, assumed: null, family: null };
  const id = representativeMaterialId(commodity, family);
  if (!id) return { id: null, assumed: null, family };
  const note = carried && carried !== family
    ? `materialId ('${carried}' is not in the rate library → ${family} → ${id})`
    : `materialId (${family} → ${id}, representative grade — not a drawing callout)`;
  return { id, assumed: note, family };
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
  /** Envelope-scaled when geometry was supplied; else the caller's flat default. */
  packagingPerPart?: number;
  logisticsPerPart?: number;
}

/**
 * Fixtures + CNC programming NRE for geometry-driven secondary machining.
 *
 * A stated parametric default, deliberately NOT the browser form's
 * `value="150000"` — that figure predates the currency cleanup and looks like
 * an INR leftover; £150k of fixturing on every casting would dwarf the die.
 */
const SECONDARY_MACHINING_NRE_GBP = 15_000;

/**
 * The machining a near-net part still needs, measured.
 *
 * A knuckle is cast AND machined — its feature table is full of bores. The
 * browser has wired `computeFeatureMachining` into the casting and forging
 * forms for months; the headless path never did, which is how the knuckle
 * costed −57% against its manual with literally zero machining content.
 */
function secondaryMachining(
  geo: OCCTGeometry | undefined, labourId: string,
): ReturnType<typeof computeFeatureMachining> | null {
  const rows = geo?.featureTable as FeatureRow[] | undefined;
  if (!rows?.length) return null;
  // Near-net secondary work is hole work by construction (`defaultInclude`
  // costs only holes on near_net stock) — that runs on a drilling centre, not
  // a milling VMC, and the rate difference is real money at 27 min/part.
  const r = computeFeatureMachining(rows, {
    machineId: 'mach-drill', labourId, stockCondition: 'near_net',
    oee: SHOP_DEFAULTS.oee, manning: SHOP_DEFAULTS.manning,
    labourEfficiency: SHOP_DEFAULTS.labourEfficiency,
  });
  return r.featureCount > 0 ? r : null;
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
  geo?: OCCTGeometry,
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

  // Packaging scales with the shipping envelope — a 1.7 m bumper is not a 3 g
  // servo horn. Same estimators the browser has always applied; flat defaults
  // survive only when no geometry was supplied.
  let packagingPerPart: number | undefined;
  let logisticsPerPart: number | undefined;
  const bb = geo?.boundingBox;
  if (bb) {
    const bboxVolCm3 = (bb.xMm * bb.yMm * bb.zMm) / 1000;
    packagingPerPart = estimatePackagingPerPart(bboxVolCm3, num(ci.netWeightKg));
    logisticsPerPart = estimateLogisticsPerPart(num(ci.netWeightKg), bboxVolCm3);
  } else {
    assumed.push('flat packaging/logistics (no geometry supplied)');
  }
  const finish = (r: ToCostParamsResult | null): ToCostParamsResult | null =>
    r === null ? null : { ...r, packagingPerPart, logisticsPerPart };

  return finish(buildParams());

  function buildParams(): ToCostParamsResult | null {
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
      const sec = secondaryMachining(geo, labourId);
      if (sec) {
        params.secondaryMachiningOps = sec.operations;
        params.secondaryMachiningToolingCost = SECONDARY_MACHINING_NRE_GBP;
        assumed.push(`secondary-machining NRE £${SECONDARY_MACHINING_NRE_GBP} (fixtures + programming)`);
      }
      return { commodity, params, assumed };
    }

    case 'forging': {
      const f = ci.forging;
      if (!f) return null;
      const weight = num(ci.netWeightKg);
      // The rules size the press and compute the heat-treat / descale / NDT
      // adders; until the orphan mapping landed, none of it reached here and a
      // weight-tier hack picked the press. Carried values now win; the hack is
      // the stated fallback.
      const params: Record<string, unknown> = {
        ...shop,
        materialId,
        partWeightKg: weight,
        flashAndScaleKg: num(f.flashKg),
        yieldFraction: num(f.yieldFraction, 0.675),
        forgeId: f.forgeId || `forge-press-${weight > 12 ? 4000 : weight > 5 ? 2500 : 1600}t`,
        strokesToForm: num(f.strokes, 3),
        timePerBlowSec: num(f.timePerBlowSec, 10),
        cycleTimeHr: 0,          // computed from strokes × time per blow
        heatingEnergyKwhPerKg: num(f.heatingEnergyKwhPerKg, 0.35),
        dieLife: num(f.dieLife, 30_000),
        dieCost: num(f.dieCostGBP),
      };
      if (num(f.projectedAreaCm2) > 0) params.projectedAreaCm2 = num(f.projectedAreaCm2);
      if (f.dieSteel) params.dieSteel = f.dieSteel;
      if (num(f.dieImpressions) > 0) params.dieImpressions = num(f.dieImpressions);
      if (num(f.heatTreatCostPerKg) > 0) params.heatTreatCostPerKg = num(f.heatTreatCostPerKg);
      if (num(f.descaleCostPerKg) > 0) params.descaleCostPerKg = num(f.descaleCostPerKg);
      if (num(f.ndtCostPerPart) > 0) params.ndtCostPerPart = num(f.ndtCostPerPart);
      if (!f.forgeId) assumed.push('forgeId (weight-tier fallback)');
      const sec = secondaryMachining(geo, labourId);
      if (sec) {
        params.secondaryMachiningOps = sec.operations;
        params.secondaryMachiningToolingCost = SECONDARY_MACHINING_NRE_GBP;
        assumed.push(`secondary-machining NRE £${SECONDARY_MACHINING_NRE_GBP} (fixtures + programming)`);
      }
      return { commodity, params, assumed };
    }

    case 'machining': {
      const ops = (ci.estimatedOperations ?? []).filter(o => num(o.cycleTimeHr) > 0);
      const cycleHr = num(ci.estimatedCycleTimeHr);
      const net = num(ci.netWeightKg);
      // The rules measure the billet from the envelope; net/0.65 survives only
      // as the no-geometry fallback (it is what the browser used for years).
      const stock = num(ci.machining?.stockWeightKg) || net / 0.65;
      const machineId = ci.machining?.machineId
        || pickMachiningCentreId({ principalDirections: 3, axisymmetric: false });
      // 100k/yr is not machined in batches of 100 — setup amortisation at that
      // batch size dominated a 3 g part. Roughly a batch per fortnightly-ish
      // run, clamped to sane shop floor sizes.
      const batchSize = Math.round(Math.min(5000, Math.max(50, annualVolume / 20)));
      // The golden rule, applied to TIME: whoever supplied these operations —
      // the rules or the model — the billed cycle cannot exceed what the stock
      // envelope can physically give up. The rules arm arrives pre-capped; the
      // model's ops arrived uncapped and stood, which is how its cycle numbers
      // become prices unexamined. Scale proportionally so the routing shape is
      // preserved and only the total moves.
      let opsScale = 1;
      if (geo?.volume?.cm3 && geo.boundingBox) {
        const stockCm3 = geo.boundingBox.xMm * geo.boundingBox.yMm * geo.boundingBox.zMm / 1000;
        const mf = MACHINABILITY_FOR_CEILING[mat.family ?? 'steel'] ?? 1.2;
        const holeRows = ((geo.featureTable ?? []) as FeatureRow[]).filter(r => r.kind === 'hole');
        const drillMin = holeRows.reduce((sum, r) => sum + featureMinutesEach(r) * r.count, 0);
        const ceilingHr = (physicalRemovalCeilingMin(
          geo.volume.cm3, stockCm3, geo.surfaceArea?.cm2 ?? 0, mf) + drillMin * mf) / 60;
        const supplied = ops.reduce((sum, o) => sum + num(o.cycleTimeHr), 0) || cycleHr;
        if (supplied > ceilingHr * 1.05 && supplied > 0) {
          opsScale = ceilingHr / supplied;
          assumed.push(`cycle capped to the removal ceiling (${supplied.toFixed(3)} → ${ceilingHr.toFixed(3)} hr)`);
        }
      }
      if (!ci.machining?.stockWeightKg) assumed.push('stockWeightKg (net / 0.65 fallback)');
      assumed.push(`batchSize=${batchSize} (annualVolume / 20)`, 'partsPerCycle=1', 'labourTimeHr=cycleTimeHr');
      return {
        commodity, assumed,
        params: {
          materialId,
          netWeightKg: net,
          stockWeightKg: stock,
          materialUtilization: num(ci.machining?.materialUtilization)
            || (stock > 0 ? net / stock : 0.65),
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
                name: 'Machining', machineId, cycleTimeHr: cycleHr,
                labourId, oee: D.oee, manning: D.manning, labourEfficiency: D.labourEfficiency,
              }]
          ).map(o => ({
            ...o, type: 'milling', partsPerCycle: 1,
            cycleTimeHr: o.cycleTimeHr * opsScale,
            labourTimeHr: o.cycleTimeHr * opsScale,
          })),
          setup: {
            machineId, labourId,
            setupTimeHr: num(ci.estimatedSetupTimeHr, 0.5),
            batchSize,
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
          cavityPressureMPa: num(m.cavityPressureMPa, 30),
          wallThicknessMm: wall,
          // Resin-specific when the rules carried it (they compute it per resin);
          // the PP figure is the no-carry fallback.
          coolTimeFactorSPerMm2: num(m.coolTimeFactorSPerMm2, 3.16),
          fillTimeSec: num(m.fillTimeSec, 2),
          packTimeSec: num(m.packTimeSec, 6),
          ejectTimeSec: num(m.ejectTimeSec, 3),
          machineId: m.machineId || pickIMMPressId(area),
          steelClass: m.steelClass || undefined,
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
      const shear = num(s.shearStrengthMPa, 250);
      // Blanking force ≈ perimeter × thickness × shear strength.
      const perimeter = 2 * (L + W);
      const tonnes = (perimeter * t * shear) / 9807;
      return {
        commodity, assumed: [...assumed, 'pressId', 'strokesPerMin', 'strip layout'],
        params: {
          ...shop,
          materialId,
          netWeightKg: num(ci.netWeightKg),
          blankLengthMm: L, blankWidthMm: W, thicknessMm: t,
          perimeterMm: perimeter,
          shearStrengthMPa: shear,
          stripWidthMm: num(s.stripWidthMm, W * 1.1),
          pitchMm: num(s.pitchMm, L * 1.05),
          partsPerStroke: 1,
          pressId: pickStampingPressId(tonnes),
          // Feed-limited when the rules carried it; 20 SPM was the old blind
          // default and alone inflated the cross-member cycle ~4.5×.
          strokesPerMin: num(s.strokesPerMin, 45),
          numOperations: num(s.numOps, 3),
          dieType: (s.dieType as string | undefined) || 'progressive',
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
}

/** Commodities `toCostParams` can convert today. */
export const COSTABLE_COMMODITIES = [
  'casting', 'forging', 'machining', 'injection_moulding', 'sheet_metal', 'blow_moulding',
];
