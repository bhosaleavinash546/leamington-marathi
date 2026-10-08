/**
 * Design to Cost — the live "where is the money, and what closes the gap" view.
 *
 * Boothroyd Dewhurst's Concurrent Costing and aPriori work the same way: hold a
 * TARGET next to the should-cost, show which drivers carry the cost, and let the
 * engineer switch design changes on and off and watch the piece price move. This
 * module is that, on CostVision's own stack. It sets no price of its own: every
 * figure is `computeUniversalStack` run on a varied copy of the costed input, so
 * overhead and margin follow exactly as they do on the headline.
 *
 * Three kinds of lever, kept apart because they are different claims:
 * - DESIGN levers come from the geometric DFM findings that carry a modelled £
 *   (a measured feature on this part, priced by the same constants as the cost).
 * - DRIVERS are the cost's own build-up (material, each operation, tooling …),
 *   each with what it would have to fall to for the part to hit the target ON ITS
 *   OWN, everything else held — a target-setting figure, not a promise.
 * - WHAT-IFs are free sliders (part mass, an operation's cycle, tooling volume).
 *   They are the stack's sensitivity: a module would move other inputs with them
 *   (a lighter casting also cools faster), so they are labelled what-if.
 */
import { computeUniversalStack } from './core.js';
import type { UniversalStackInput, RateLibrary, PartCostResult } from './types.js';

/** Structural — what the DFM report's grouped finding carries; no import from dfm-geometry (no cycle). */
export interface DtcFindingLike {
  ruleId: string;
  title?: string;
  totalCostGBP?: number;
  count?: number;
  faceIds?: number[];
  recommendation?: string;
  worst: { costImpact?: { kind?: string; basis?: string; confidence?: string } };
}

export interface DtcLever {
  id: string;
  title: string;
  /** What the lever changes, in words and numbers. */
  basis: string;
  confidence: 'modelled' | 'indicative';
  ruleId: string;
  faceIds: number[];
  /** The finding's own £/part (factory base, before overhead and margin). */
  jobGBP: number;
  /** Piece price saved through the whole stack when applied ALONE. */
  savingGBP: number;
  apply(input: UniversalStackInput): UniversalStackInput;
}

/** Which operation a finding's time comes off, by the operation's own name (the costing names them). */
const OP_FOR_RULE: Array<[RegExp, RegExp]> = [
  [/\.setup\./, /load|clamp|fixtur|handling/i],
  [/\.hole\.|cored-depth/, /drill|bore|hole/i],
  [/\.corner\./, /mill|pocket/i],
];

/** £/h of an operation's cost per hour of its cycle — the core's own formula (core.ts processCost / labourCost). */
function opCostPerHr(op: UniversalStackInput['operations'][number], library: RateLibrary): number {
  const rate = library.machines.find(m => m.id === op.machineId)?.computedRatePerHr ?? 0;
  const lab = library.labour.find(l => l.id === op.labourId)?.fullyLoadedRatePerHr ?? 0;
  const ppc = op.partsPerCycle >= 1 ? op.partsPerCycle : 1;
  const machine = op.benchOperation ? 0 : rate / ppc / (op.oee > 0 ? op.oee : 1);
  const labour = op.labourTimeHr > 0 ? lab * op.manning / ppc / (op.labourEfficiency > 0 ? op.labourEfficiency : 1) : 0;
  return machine + labour;
}

/**
 * The input with one finding's cost taken out — the single definition the DFM restack and the DtC panel share.
 *
 * feature_cost: the time off the costliest-per-hour machine operation that removes EXACTLY the finding's £ from
 * the factory base — dividing by machine + labour rate alone (as the restack once did) ignored parts per cycle,
 * OEE and manning, and overstated a machining finding by ~1/OEE. tooling: the slide / insert NRE off the tool.
 */
export function findingVariant(
  g: DtcFindingLike, input: UniversalStackInput, library: RateLibrary,
): { next: UniversalStackInput; basis: string } | null {
  const gbp = g.totalCostGBP ?? 0;
  if (!(gbp > 0)) return null;
  const kind = g.worst.costImpact?.kind ?? (/undercut|side-action|slide/.test(g.ruleId) ? 'tooling' : 'feature_cost');
  if (kind === 'tooling') {
    const vol = input.tooling.amortizationVolume || input.annualVolume || 0;
    const delta = gbp * (vol || 1);
    return {
      next: { ...input, tooling: { ...input.tooling, totalToolingCost: Math.max(0, input.tooling.totalToolingCost - delta) } },
      basis: `tooling NRE −£${delta.toFixed(0)} (the slide / insert) through the stack`,
    };
  }
  if (kind !== 'feature_cost') return null;
  const ops = input.operations;
  if (!ops.length) return null;
  // The operation the feature is cut on: the one whose name says so (a hole on the drilling op, a set-up on the
  // load / clamp op), else the longest machine (non-bench) cycle. Same £ either way — the op only names where it goes.
  const want_ = OP_FOR_RULE.find(([re]) => re.test(g.ruleId))?.[1];
  let k = want_ ? ops.findIndex(o => !o.benchOperation && o.cycleTimeHr > 0 && want_.test(o.operationName)) : -1;
  if (k < 0) ops.forEach((o, i) => { if (!o.benchOperation && (k < 0 || o.cycleTimeHr > ops[k].cycleTimeHr)) k = i; });
  if (k < 0) return null;
  const op = ops[k];
  const perHr = opCostPerHr(op, library);
  if (!(perHr > 0)) return null;
  // Never cut more than 90 % of the operation: a finding priced above the op it sits on is a modelling mismatch,
  // and the basis says how much was taken.
  const want = gbp / perHr;
  const hr = Math.min(want, op.cycleTimeHr * 0.9);
  const labourHr = op.labourTimeHr > 0 ? Math.min(hr, op.labourTimeHr * 0.9) : 0;
  return {
    next: { ...input, operations: ops.map((o, i) => i === k ? { ...o, cycleTimeHr: o.cycleTimeHr - hr, labourTimeHr: o.labourTimeHr - labourHr } : o) },
    basis: `${(hr * 60).toFixed(2)} min off ${op.operationName} (£${perHr.toFixed(2)} per hour of cycle after parts/cycle, OEE and crew)`
      + (hr < want ? ` — capped at 90 % of the operation; the finding is priced at £${gbp.toFixed(2)}` : '') + ' through the stack',
  };
}

/** Design levers: every DFM finding with a modelled £ that the stack can take out. */
export function dfmLevers(
  grouped: readonly DtcFindingLike[], input: UniversalStackInput, library: RateLibrary,
): DtcLever[] {
  const base = computeUniversalStack(input, library).total;
  const out: DtcLever[] = [];
  for (const g of grouped) {
    const v = findingVariant(g, input, library);
    if (!v) continue;
    let t: number;
    try { t = computeUniversalStack(v.next, library).total; } catch { continue; }
    const saving = round4(base - t);
    if (!(saving > 0)) continue;
    out.push({
      id: `dfm:${g.ruleId}`,
      title: g.title ?? g.ruleId,
      // What the £ IS (the finding's own pricing), then how it moves the stack.
      basis: g.worst.costImpact?.basis ? `${g.worst.costImpact.basis} — applied as ${v.basis}` : v.basis,
      confidence: g.worst.costImpact?.confidence === 'indicative' ? 'indicative' : 'modelled',
      ruleId: g.ruleId,
      faceIds: g.faceIds ?? [],
      jobGBP: g.totalCostGBP ?? 0,
      savingGBP: saving,
      apply: (inp) => findingVariant(g, inp, library)?.next ?? inp,
    });
  }
  return out.sort((a, b) => b.savingGBP - a.savingGBP);
}

// ── Drivers: where the money is, and what each would have to become ─────────

export type DriverKind = 'material' | 'operation' | 'tooling' | 'packaging' | 'logistics';

export interface DtcDriver {
  id: string;
  kind: DriverKind;
  label: string;
  /** Its share of the piece price THROUGH the stack (its overhead and margin included). */
  stackGBP: number;
  share: number;
  /** The driver's own quantity, and what it must fall to for the part to reach the target alone. */
  quantity?: { name: string; value: number; unit: string };
  toTarget?: { value: number; pct: number } | 'not-alone' | 'met';
}

interface DriverSpec {
  id: string; kind: DriverKind; label: string;
  quantity?: { name: string; value: number; unit: string };
  /** The input with this driver scaled by `f` (1 = as costed). */
  scale(input: UniversalStackInput, f: number): UniversalStackInput;
}

function driverSpecs(input: UniversalStackInput, library: RateLibrary): DriverSpec[] {
  const specs: DriverSpec[] = [];
  const rm = input.rawMaterial;
  if (rm.directCost === undefined && rm.netWeightKg > 0) {
    const mat = library.materials.find(m => m.id === rm.materialId);
    specs.push({
      id: 'material', kind: 'material', label: `Material${mat ? ` — ${mat.grade}` : ''}`,
      quantity: { name: 'net mass', value: rm.netWeightKg, unit: 'kg' },
      scale: (inp, f) => ({ ...inp, rawMaterial: { ...inp.rawMaterial, netWeightKg: inp.rawMaterial.netWeightKg * f,
        ...(inp.rawMaterial.energyKwh ? { energyKwh: scaleKwh(inp.rawMaterial.energyKwh, f) } : {}) } }),
    });
  } else if (rm.directCost !== undefined && rm.directCost > 0) {
    specs.push({
      id: 'material', kind: 'material', label: 'Material (priced directly)',
      quantity: { name: 'material £', value: rm.directCost, unit: '£' },
      scale: (inp, f) => ({ ...inp, rawMaterial: { ...inp.rawMaterial, directCost: (inp.rawMaterial.directCost ?? 0) * f } }),
    });
  }
  // The rest of the material line — consumables and services (tool wear, cores, heat treat …) and bought-in parts —
  // is cost too; leaving it out made the live manifold's drivers add to £40.01 against a £40.99 headline.
  if ((rm.consumablesCostPerPart ?? 0) > 0) {
    const items = (rm.consumablesItems ?? []).map(i => i.label).slice(0, 4).join(', ');
    specs.push({
      id: 'consumables', kind: 'material', label: `Consumables & services${items ? ` (${items})` : ''}`,
      quantity: { name: 'per part', value: rm.consumablesCostPerPart as number, unit: '£' },
      scale: (inp, f) => ({ ...inp, rawMaterial: { ...inp.rawMaterial, consumablesCostPerPart: (inp.rawMaterial.consumablesCostPerPart ?? 0) * f } }),
    });
  }
  if (rm.boughtIn && rm.boughtIn.cost > 0) {
    specs.push({
      id: 'bought-in', kind: 'material', label: 'Bought-in content',
      quantity: { name: 'bought-in £', value: rm.boughtIn.cost, unit: '£' },
      scale: (inp, f) => ({ ...inp, rawMaterial: { ...inp.rawMaterial, boughtIn: inp.rawMaterial.boughtIn ? { ...inp.rawMaterial.boughtIn, cost: inp.rawMaterial.boughtIn.cost * f } : undefined } }),
    });
  }
  input.operations.forEach((op, i) => {
    const isTime = op.cycleTimeHr > 0 && !op.benchOperation;
    const t = isTime ? op.cycleTimeHr : op.labourTimeHr;
    if (!(t > 0)) return;
    specs.push({
      id: `op:${i}`, kind: 'operation', label: op.operationName || `Operation ${i + 1}`,
      quantity: { name: isTime ? 'cycle' : 'labour time', value: t * 3600, unit: 's' },
      scale: (inp, f) => ({ ...inp, operations: inp.operations.map((o, j) => j === i
        ? { ...o, cycleTimeHr: o.cycleTimeHr * (isTime ? f : 1), labourTimeHr: o.labourTimeHr * f } : o) }),
    });
  });
  if (input.tooling.totalToolingCost > 0) {
    specs.push({
      id: 'tooling', kind: 'tooling', label: 'Tooling (amortised)',
      quantity: { name: 'tool NRE', value: input.tooling.totalToolingCost, unit: '£' },
      scale: (inp, f) => ({ ...inp, tooling: { ...inp.tooling, totalToolingCost: inp.tooling.totalToolingCost * f } }),
    });
  }
  if (input.packagingPerPart > 0) specs.push({ id: 'packaging', kind: 'packaging', label: 'Packaging',
    scale: (inp, f) => ({ ...inp, packagingPerPart: inp.packagingPerPart * f }) });
  if (input.logisticsPerPart > 0) specs.push({ id: 'logistics', kind: 'logistics', label: 'Logistics',
    scale: (inp, f) => ({ ...inp, logisticsPerPart: inp.logisticsPerPart * f }) });
  return specs;
}

function scaleKwh(e: NonNullable<UniversalStackInput['rawMaterial']['energyKwh']>, f: number) {
  return { ...e, ...(e.gas !== undefined ? { gas: e.gas * f } : {}), ...(e.electricity !== undefined ? { electricity: e.electricity * f } : {}) };
}

/**
 * The cost's drivers, largest first, each with the value it would have to reach for the part to meet `targetGBP`
 * alone. The stack is linear in each driver (overhead a % of the base, margin a % of the subtotal), so two
 * evaluations give the slope; a learning curve or a clamp bends it slightly, which is why the figure is re-checked
 * by costing the answer.
 */
export function costDrivers(input: UniversalStackInput, library: RateLibrary, targetGBP?: number): DtcDriver[] {
  const base = computeUniversalStack(input, library).total;
  const out: DtcDriver[] = [];
  for (const s of driverSpecs(input, library)) {
    let half: number;
    try { half = computeUniversalStack(s.scale(input, 0.5), library).total; } catch { continue; }
    const stackGBP = 2 * (base - half);                     // linear: the whole driver is twice its half
    if (!(stackGBP > 1e-6)) continue;
    const d: DtcDriver = { id: s.id, kind: s.kind, label: s.label, stackGBP: round4(stackGBP), share: base > 0 ? stackGBP / base : 0,
      ...(s.quantity ? { quantity: s.quantity } : {}) };
    if (targetGBP !== undefined && targetGBP > 0) {
      const gap = base - targetGBP;
      if (gap <= 0) d.toTarget = 'met';
      else if (gap >= stackGBP * 0.999) d.toTarget = 'not-alone';
      else {
        const f = 1 - gap / stackGBP;
        // Re-cost the answer: a learning curve or a clamp may bend the line; one secant step corrects it.
        let ff = f;
        try {
          const t1 = computeUniversalStack(s.scale(input, f), library).total;
          const slope = stackGBP;                            // £ per unit of f
          ff = Math.max(0, Math.min(1, f - (t1 - targetGBP) / slope));
        } catch { /* keep the linear answer */ }
        d.toTarget = { value: (s.quantity?.value ?? 1) * ff, pct: (ff - 1) * 100 };
      }
    }
    out.push(d);
  }
  return out.sort((a, b) => b.stackGBP - a.stackGBP);
}

// ── Projection: levers on, what-ifs set ───────────────────────────────────────

export interface DtcWhatIf {
  /** Net part mass, % change (−20 = 20 % lighter). Material bought by weight only. */
  massPct?: number;
  /** Per operation index, % change in its cycle (and labour) time. */
  cyclePct?: Record<number, number>;
  /** Tool amortisation volume × this factor (a commercial lever, not a design one). */
  toolingVolumeFactor?: number;
}

export interface DtcProjection {
  base: PartCostResult;
  projected: PartCostResult;
  savingGBP: number;
  /** Fraction of the gap to target the projection closes (1 = on target), when a target is set and missed. */
  gapClosed?: number;
  applied: string[];
}

export function projectDesignToCost(
  input: UniversalStackInput, library: RateLibrary, levers: readonly DtcLever[], whatIf: DtcWhatIf = {}, targetGBP?: number,
): DtcProjection {
  const base = computeUniversalStack(input, library);
  let next = input;
  const applied: string[] = [];
  for (const l of levers) { next = l.apply(next); applied.push(`${l.title}: ${l.basis}`); }
  const specs = driverSpecs(next, library);
  if (whatIf.massPct) {
    const m = specs.find(s => s.id === 'material');
    if (m) { next = m.scale(next, Math.max(0, 1 + whatIf.massPct / 100)); applied.push(`${m.quantity?.name ?? 'material'} ${fmtPct(whatIf.massPct)} (what-if)`); }
  }
  for (const [k, pct] of Object.entries(whatIf.cyclePct ?? {})) {
    if (!pct) continue;
    const s = specs.find(x => x.id === `op:${k}`);
    if (s) { next = s.scale(next, Math.max(0.01, 1 + pct / 100)); applied.push(`${s.label} ${s.quantity?.name ?? 'time'} ${fmtPct(pct)} (what-if)`); }
  }
  if (whatIf.toolingVolumeFactor && whatIf.toolingVolumeFactor !== 1 && next.tooling.totalToolingCost > 0) {
    next = { ...next, tooling: { ...next.tooling, amortizationVolume: next.tooling.amortizationVolume * whatIf.toolingVolumeFactor } };
    applied.push(`tooling amortised over ×${whatIf.toolingVolumeFactor} the volume (commercial what-if)`);
  }
  const projected = computeUniversalStack(next, library);
  const savingGBP = round4(base.total - projected.total);
  const gap = targetGBP && targetGBP > 0 ? base.total - targetGBP : 0;
  return { base, projected, savingGBP, ...(gap > 0 ? { gapClosed: savingGBP / gap } : {}), applied };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const fmtPct = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(0)} %`;
