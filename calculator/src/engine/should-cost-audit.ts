/**
 * Should-cost self-audit — the lessons registry as automated pre-flight checks.
 *
 * Every lesson learned from a real part (wrong machine, stale amort, implausible
 * wall, weight that contradicts the geometry) is encoded here as a deterministic
 * detector: given the finished estimate + measured geometry it recomputes what the
 * physics demands and flags any estimate that disagrees. This is the agentic
 * memory — a new commodity inherits every past check for free, and the checks run
 * on EVERY estimate, not just the part that first exposed the bug.
 *
 * Golden rule preserved: the audit never sets a price. It flags, explains, and (for
 * the safe cases) proposes a bounded correction the caller may apply — a machine id
 * from the rate library or the annual amortisation volume, never a £.
 */
import { sizeProcessMachine, SIZE_TIERED_COMMODITIES, type MachineSizingParams } from './machine-sizing.js';
import { DEFAULT_RATE_LIBRARY } from './rate-library.js';
import { physicalRemovalCeilingMin } from './feature-costing.js';
import type { UniversalStackInput, RateLibrary, PartCostResult } from './types.js';

export type AuditSeverity = 'high' | 'medium' | 'low';

/** A bounded correction the caller may apply — never a price. */
export type AuditCorrection =
  | { kind: 'machineId'; machineId: string }
  | { kind: 'amortVolume'; value: number };

export interface AuditFinding {
  /** Stable slug — one per lesson. */
  id: string;
  title: string;
  severity: AuditSeverity;
  message: string;
  expected?: string;
  actual?: string;
  /** Present only when the fix is a safe, deterministic value the caller can apply. */
  correction?: AuditCorrection;
}

export interface AuditGeometry {
  volumeCm3?: number | null;
  surfaceAreaCm2?: number | null;
  bboxMm?: { x: number; y: number; z: number } | null;
  wallMeanMm?: number | null;
  /** solid volume ÷ bbox volume (0–1) — low means a thin shell / hollow part. */
  fillRatio?: number | null;
}

export interface AuditContext {
  commodity: string;
  input: UniversalStackInput;
  /** The finished estimate. Needed by the checks that read the 8-bucket split
   *  rather than the inputs — a zero-conversion costing is only visible there. */
  result?: PartCostResult;
  library: RateLibrary;
  annualVolume?: number | null;
  /** The primary process machine actually selected for this estimate. */
  selectedMachineId?: string | null;
  /** Physics drivers so the audit can independently recompute the right machine. */
  sizingParams?: MachineSizingParams;
  geometry?: AuditGeometry;
}

/** Parse a capacity in metric tonnes from a rate-library machine id
 *  (imm-200t, hpdc-800t, forge-press-1600t, press-400t). null when not tonnage-tiered. */
export function machineCapacityTonnes(id: string): number | null {
  const m = /(\d+)\s*t\b/i.exec(id);
  return m ? Number(m[1]) : null;
}

type Check = (ctx: AuditContext) => AuditFinding | null;

/** Lesson: the machine must be sized to the part (fuel-tank bottle machine, bumper
 *  press). Recompute the required machine from physics; flag only when the selected
 *  one is genuinely smaller (a bigger machine is a choice, not a bug). */
const checkMachineSizing: Check = (ctx) => {
  if (!(ctx.commodity in SIZE_TIERED_COMMODITIES)) return null;
  if (!ctx.sizingParams || !ctx.selectedMachineId) return null;
  const expected = sizeProcessMachine(ctx.commodity, ctx.sizingParams);
  if (!expected || expected === ctx.selectedMachineId) return null;
  const ecap = machineCapacityTonnes(expected);
  const acap = machineCapacityTonnes(ctx.selectedMachineId);
  // Tonnage-tiered: only flag an under-capacity machine. Non-tonnage (blow shot
  // weight): any mismatch from the sized pick is worth surfacing.
  if (ecap != null && acap != null && acap >= ecap) return null;
  return {
    id: 'machine-undersized',
    title: 'Machine not sized to the part',
    severity: 'high',
    message: `Selected ${ctx.selectedMachineId}, but the part's process force/shot needs ${expected}. An undersized machine mis-costs the process (the fuel-tank bottle-machine class of error).`,
    expected,
    actual: ctx.selectedMachineId,
    correction: { kind: 'machineId', machineId: expected },
  };
};

/** Lesson (the machining-routing lesson, generalised to every sized process):
 *  an OVERSIZED machine is a cost decision nobody made. The deterministic path
 *  always picks the smallest tier that covers the physics — which on a
 *  monotonic rate ladder is also the cheapest — but an AI- or hand-picked
 *  machine a tier or three too big sailed through unchallenged, booking £/hr
 *  the part never needed. Flag it WITH the per-part delta so the reader can
 *  either fix it or, if the big machine is a deliberate supplier reality,
 *  quote this line in negotiation. */
const checkMachineOversized: Check = (ctx) => {
  if (!(ctx.commodity in SIZE_TIERED_COMMODITIES)) return null;
  if (!ctx.sizingParams || !ctx.selectedMachineId) return null;
  const expected = sizeProcessMachine(ctx.commodity, ctx.sizingParams);
  if (!expected || expected === ctx.selectedMachineId) return null;
  const ecap = machineCapacityTonnes(expected);
  const acap = machineCapacityTonnes(ctx.selectedMachineId);
  if (ecap == null || acap == null || acap <= ecap) return null;   // undersize is the check above
  const rateOf = (id: string) =>
    DEFAULT_RATE_LIBRARY.machines.find(m => m.id === id)?.computedRatePerHr ?? null;
  const actualRate = rateOf(ctx.selectedMachineId);
  const expectedRate = rateOf(expected);
  if (actualRate == null || expectedRate == null || actualRate <= expectedRate) return null;
  // Effective machine hours this part books on the oversized machine.
  const hours = (ctx.input.operations ?? [])
    .filter(o => o.machineId === ctx.selectedMachineId)
    .reduce((sum, o) => sum + o.cycleTimeHr / Math.max(0.3, o.oee ?? 0.85) / Math.max(1, o.partsPerCycle ?? 1), 0);
  const deltaPerPart = hours * (actualRate - expectedRate);
  if (deltaPerPart < 0.01) return null;   // pennies — not worth a finding
  return {
    id: 'machine-oversized',
    title: 'Machine larger than the part needs',
    severity: 'medium',
    message: `Selected ${ctx.selectedMachineId} (£${actualRate.toFixed(0)}/hr) where the physics needs only `
      + `${expected} (£${expectedRate.toFixed(0)}/hr). At the costed cycle that books £${deltaPerPart.toFixed(2)}/part `
      + `the part does not need. If the larger machine is the supplier's real cell, keep it — and use this line as the negotiation lever.`,
    expected,
    actual: ctx.selectedMachineId,
    correction: { kind: 'machineId', machineId: expected },
  };
};

/** Lesson: tooling amortises over the stated annual volume, not a stale form
 *  default (the progressive-die £0.05-vs-£0.25 error). */
const checkAmortVolume: Check = (ctx) => {
  const av = ctx.annualVolume;
  if (!av || av <= 0) return null;
  const amort = ctx.input.tooling?.amortizationVolume;
  if (amort == null || amort <= 0) return null;
  if (Math.abs(amort - av) / av <= 0.02) return null;   // within 2% — consistent
  return {
    id: 'amort-not-annual',
    title: 'Tooling not amortised over annual volume',
    // Scale with the size of the error. The ECU amortised a 46k tooling spend
    // over 5,000 parts against a stated 150,000 — 30x out, and reported as a
    // "low" note. An order of magnitude is not a note.
    severity: (amort / av >= 5 || av / amort >= 5) ? 'high'
      : (amort / av >= 1.5 || av / amort >= 1.5) ? 'medium' : 'low',
    message: `Tooling amortises over ${Math.round(amort).toLocaleString()} parts but the stated annual volume is ${Math.round(av).toLocaleString()}. Per-part tooling is off by ${(amort / av).toFixed(2)}×.`,
    expected: Math.round(av).toLocaleString(),
    actual: Math.round(amort).toLocaleString(),
    correction: { kind: 'amortVolume', value: av },
  };
};

/** Lesson: a measured wall must be physically possible and, on a thin hollow shell,
 *  near 2·V/S — not the ray-cast's local depth (bumper 27 mm vs real 2.5 mm). */
const checkWallPlausible: Check = (ctx) => {
  const g = ctx.geometry;
  if (!g || g.wallMeanMm == null || !g.bboxMm) return null;
  const wall = g.wallMeanMm;
  const minDim = Math.min(g.bboxMm.x, g.bboxMm.y, g.bboxMm.z);
  if (minDim > 0 && wall > minDim) {
    return {
      id: 'wall-exceeds-bbox',
      title: 'Wall thicker than the part',
      severity: 'high',
      message: `Measured wall ${wall.toFixed(1)} mm exceeds the smallest bounding-box dimension ${minDim.toFixed(1)} mm — the geometry read is impossible.`,
      expected: `≤ ${minDim.toFixed(1)} mm`,
      actual: `${wall.toFixed(1)} mm`,
    };
  }
  // Thin hollow shell: the shell wall ≈ 2·V/S. A ray-cast reading far above it is
  // the local-depth artefact that made a mouldable part look castable.
  if (g.volumeCm3 && g.surfaceAreaCm2 && g.surfaceAreaCm2 > 0 && g.fillRatio != null && g.fillRatio < 0.08) {
    const shellWallMm = 20 * (g.volumeCm3 / g.surfaceAreaCm2); // 2·(V/S) cm → mm
    if (shellWallMm > 0 && wall > shellWallMm * 3) {
      return {
        id: 'wall-over-measured',
        title: 'Wall likely over-measured on a thin shell',
        severity: 'medium',
        message: `Measured wall ${wall.toFixed(1)} mm is >3× the shell estimate 2·V/S = ${shellWallMm.toFixed(1)} mm for a hollow part (fill ${(g.fillRatio * 100).toFixed(1)}%). Cooling time ∝ wall² — a wrong wall corrupts a moulded cost.`,
        expected: `~${shellWallMm.toFixed(1)} mm`,
        actual: `${wall.toFixed(1)} mm`,
      };
    }
  }
  return null;
};

/** Lesson: the costed net weight must match the measured geometry × the chosen
 *  material's density — a large mismatch means the weight and material are out of
 *  sync (a fallback weight, or a material swapped without re-deriving mass). */
const checkWeightVsGeometry: Check = (ctx) => {
  const g = ctx.geometry;
  if (!g?.volumeCm3 || g.volumeCm3 <= 0) return null;
  const mat = ctx.library.materials.find(m => m.id === ctx.input.rawMaterial.materialId);
  if (!mat || !mat.densityKgPerM3) return null;
  const impliedKg = g.volumeCm3 * 1e-6 * mat.densityKgPerM3;
  const costedKg = ctx.input.rawMaterial.netWeightKg;
  if (impliedKg <= 0 || costedKg <= 0) return null;
  const ratio = costedKg / impliedKg;
  if (ratio > 0.7 && ratio < 1.4) return null;   // consistent within tolerance
  return {
    id: 'weight-geometry-mismatch',
    title: 'Costed weight inconsistent with the geometry',
    severity: 'medium',
    message: `Net weight ${costedKg.toFixed(3)} kg vs ${impliedKg.toFixed(3)} kg implied by the measured volume × ${mat.grade} density (${ratio.toFixed(2)}×). Check the material family or the weight source.`,
    expected: `~${impliedKg.toFixed(3)} kg`,
    actual: `${costedKg.toFixed(3)} kg`,
  };
};

/** Lesson: a thin hollow shell on a large envelope is atypical for casting/forging
 *  (chunky solids) — the fuel-tank-costed-as-sand-casting error. Flag the process. */
const checkThinHollowNotCast: Check = (ctx) => {
  const g = ctx.geometry;
  if (!g || g.fillRatio == null || !g.bboxMm) return null;
  if (!(ctx.commodity === 'casting' || ctx.commodity === 'cast_and_machine' || ctx.commodity === 'forging')) return null;
  const maxDim = Math.max(g.bboxMm.x, g.bboxMm.y, g.bboxMm.z);
  if (g.fillRatio < 0.05 && maxDim > 300) {
    return {
      id: 'thin-hollow-not-cast',
      title: 'Thin hollow shape is atypical for casting/forging',
      severity: 'high',
      message: `Fill ratio ${(g.fillRatio * 100).toFixed(1)}% on a ${maxDim.toFixed(0)} mm envelope is a thin enclosed shell — castings/forgings are chunky solids. More likely injection/blow moulding or sheet metal (the fuel-tank sand-casting error). Verify the process.`,
      expected: 'moulding / blow / sheet',
      actual: ctx.commodity,
    };
  }
  return null;
};

/** Lesson: machining time can't exceed the stock-removal envelope (volume ÷ MRR +
 *  surface finishing) — the servo-horn 266-min-on-a-3 g-part over-count. */
const checkMachiningEnvelope: Check = (ctx) => {
  if (ctx.commodity !== 'machining') return null;
  const g = ctx.geometry;
  if (!g?.volumeCm3 || !g.bboxMm) return null;
  const stockCm3 = (g.bboxMm.x * g.bboxMm.y * g.bboxMm.z) / 1000;   // billet stock ≈ bbox
  if (stockCm3 <= 0) return null;
  const ceilingMin = physicalRemovalCeilingMin(g.volumeCm3, stockCm3, g.surfaceAreaCm2 ?? 0, 1);
  const actualMin = ctx.input.operations.reduce((s, op) => s + (op.cycleTimeHr / Math.max(1, op.partsPerCycle)) * 60, 0);
  if (actualMin <= 0 || ceilingMin <= 0 || actualMin <= ceilingMin * 2) return null;
  return {
    id: 'machining-over-envelope',
    title: 'Machining time exceeds the removal envelope',
    severity: 'medium',
    message: `Costed machine time ${actualMin.toFixed(0)} min is >2× the ${ceilingMin.toFixed(0)} min a machinist needs to remove ${(stockCm3 - g.volumeCm3).toFixed(0)} cm³ of stock + finishing. Likely an over-counted cycle (the servo-horn class of error).`,
    expected: `~${ceilingMin.toFixed(0)} min`,
    actual: `${actualMin.toFixed(0)} min`,
  };
};

/** Lesson (Bosch IPB2.0 ECU, Aug 2026): a populated brake ECU was costed as
 *  `pcb_fab` — a bare board — and published with Process GBP 0.00, Labour
 *  GBP 0.00 and "Operations: 0". Every manufactured part has conversion cost;
 *  a costing that is pure material is a mis-classified commodity or a routing
 *  nobody entered, and it under-states by whatever the conversion would have
 *  been (on that board, 88%). Commodity-agnostic on purpose: the same shape of
 *  error is possible on any commodity, not just electronics. */
const checkZeroConversion: Check = (ctx) => {
  const b = ctx.result?.breakdown;
  if (!b) return null;
  const conversion = b.process + b.labour;
  const material = b.rawMaterial;
  if (material <= 0) return null;               // nothing costed at all — not this lesson
  if (conversion > 0.005) return null;          // has a routing
  const ops = ctx.input.operations?.length ?? 0;
  return {
    id: 'zero-conversion-cost',
    title: 'Costed as material only — no conversion',
    severity: 'high',
    message: `Material is ${material.toFixed(2)} but process and labour are both zero across ${ops} operation(s). `
      + 'Every manufactured part has conversion cost. Either the commodity is wrong (a populated assembly costed as '
      + 'a bare fabrication) or no routing was entered — the estimate is a purchase price, not a should-cost.',
    expected: 'at least one operation with machine or labour time',
    actual: `${ops} operations, conversion 0.00`,
  };
};

/** Lesson (same board): the largest cost bucket was a single `mat-virtual` line
 *  with no itemisation, so 72% of the part could not be checked by anyone. A
 *  pass-through material bucket must carry the lines behind it — the BOM for a
 *  PCBA, the wire schedule for a harness, the sub-part list for a BIW. */
const checkUnitemisedMaterial: Check = (ctx) => {
  const b = ctx.result?.breakdown;
  const rm = ctx.input.rawMaterial;
  if (!b || rm?.directCost === undefined) return null;      // weight-based material is traceable via the rate
  const total = b.rawMaterial + b.process + b.labour + b.tooling + b.packaging + b.logistics + b.overhead + b.margin;
  if (total <= 0) return null;
  const share = b.rawMaterial / total;
  if (share < 0.40) return null;                            // not the dominant bucket
  if ((rm.lines?.length ?? 0) > 0) return null;             // itemised — auditable
  return {
    id: 'unitemised-direct-material',
    title: 'Largest cost bucket is not auditable',
    severity: 'high',
    message: `Material is ${(share * 100).toFixed(0)}% of the part and enters as one pass-through figure with no `
      + 'line items. Nobody reviewing this can check the biggest number in it. Attach the bill of materials '
      + '(or wire / sub-part schedule) so each line carries its own quantity, price and source.',
    expected: 'itemised lines behind the material bucket',
    actual: 'single directCost line',
  };
};

const CHECKS: ReadonlyArray<Check> = [
  checkMachineSizing,
  checkMachineOversized,
  checkThinHollowNotCast,
  checkMachiningEnvelope,
  checkWallPlausible,
  checkWeightVsGeometry,
  checkAmortVolume,
  checkZeroConversion,
  checkUnitemisedMaterial,
];

const SEVERITY_ORDER: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Run every applicable lesson check and return findings, most-severe first. */
export function runShouldCostAudit(ctx: AuditContext): AuditFinding[] {
  return CHECKS
    .map(fn => fn(ctx))
    .filter((f): f is AuditFinding => f !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
