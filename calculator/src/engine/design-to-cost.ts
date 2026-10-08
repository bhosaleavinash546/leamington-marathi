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
export interface DtcCostImpactLike {
  perPartGBP?: number; kind?: string; basis?: string; confidence?: string; costGroup?: string;
  /** Time findings: minutes per part in the costing's own time model — what comes off the costed operation. */
  minutes?: number;
  /** Tooling findings: the one-off NRE the per-part figure was amortised from. */
  nreGBP?: number;
}
export interface DtcFindingLike {
  ruleId: string;
  title?: string;
  totalCostGBP?: number;
  count?: number;
  faceIds?: number[];
  recommendation?: string;
  worst: { costImpact?: DtcCostImpactLike };
  /** Per-feature instances — so one hole flagged by two rules is taken out once, not twice. */
  instances?: Array<{ featureId: string; costImpact?: DtcCostImpactLike }>;
}

/**
 * What a lever's £ means. `redesign`: the change removes the cost (a set-up, a slide, a tool change). `upper-bound`:
 * the pricer costs the WHOLE feature (the hole's drilling, the corner's pocket pass) — deleting it recovers that,
 * shortening or opening it recovers part, so the saving is the ceiling. Findings priced on cost the sheet does NOT
 * carry (`NOT_IN_STACK`: a hole the sheet assumes is cored) are not levers at all — taking them out of the stack
 * would remove money that was never in it; the tab lists them as costs to add.
 */
export type LeverKind = 'redesign' | 'upper-bound';
const UPPER_BOUND_RULES = /\.hole\.depth-beyond-standard-drill|\.hole\.many-sizes/;
/** Priced on work the cost sheet does not carry (a hole the sheet prices as pierced but must be drilled). */
export const NOT_IN_STACK_RULES = new Set(['sheetmetal.hole.smaller-than-thickness']);

export interface DtcLever {
  id: string;
  title: string;
  /** What the lever changes, in words and numbers (the full calculation, one string). */
  basis: string;
  /** One plain line for the screen: what comes out of the costing. */
  summary: string;
  /** The calculation, step by step — the finding's own pricing, then how it moves the stack. */
  steps: string[];
  confidence: 'modelled' | 'indicative';
  kind: LeverKind;
  ruleId: string;
  faceIds: number[];
  /** The finding's own £/part (factory base, before overhead and margin). */
  jobGBP: number;
  /** Piece price saved through the whole stack when applied ALONE. */
  savingGBP: number;
  /**
   * The input with this lever's cost out. `removed` (key → £) is shared across the levers applied together: a cost
   * another lever already took out (the same hole, the same slide) is not taken out twice.
   */
  apply(input: UniversalStackInput, removed?: Map<string, number>): UniversalStackInput;
}

/** A finding's cost items, de-duplicated the way `totalCostGBP` counts them: a feature's own cost once, a cost group once. */
interface CostItem { key: string; gbp: number; nre?: number; minutes?: number }
function costItems(g: DtcFindingLike): CostItem[] {
  const inst = g.instances?.filter(x => (x.costImpact?.perPartGBP ?? 0) > 0) ?? [];
  if (!inst.length) {
    const gbp = g.totalCostGBP ?? 0;
    return gbp > 0 ? [{ key: `rule:${g.ruleId}`, gbp, nre: g.worst.costImpact?.nreGBP, minutes: g.worst.costImpact?.minutes }] : [];
  }
  const by = new Map<string, CostItem>();
  inst.forEach((x, n) => {
    const c = x.costImpact!;
    const key = c.costGroup ? `group:${c.costGroup}`
      : c.kind === 'feature_cost' && !x.featureId.startsWith('PART:') ? `feature:${x.featureId}` : `rule:${g.ruleId}:${n}`;
    const prev = by.get(key);
    if (!prev || (c.perPartGBP ?? 0) > prev.gbp) by.set(key, { key, gbp: c.perPartGBP ?? 0, nre: c.nreGBP, minutes: c.minutes });
  });
  return [...by.values()];
}

/** Which operation a finding's time comes off, by the operation's own name (the costing names them). */
const OP_FOR_RULE: Array<[RegExp, RegExp]> = [
  [/\.setup\./, /load|clamp|fixtur|handling/i],
  [/\.hole\.|cored-depth/, /drill|bore|hole/i],
  [/\.corner\./, /mill|pocket/i],
];

/** An operation's £ per hour of cycle, machine and labour apart — the core's own formula (core.ts). */
function opSlopes(op: UniversalStackInput['operations'][number], library: RateLibrary): { m: number; l: number } {
  const rate = library.machines.find(m => m.id === op.machineId)?.computedRatePerHr ?? 0;
  const lab = library.labour.find(l => l.id === op.labourId)?.fullyLoadedRatePerHr ?? 0;
  const ppc = op.partsPerCycle >= 1 ? op.partsPerCycle : 1;
  return {
    m: op.benchOperation ? 0 : rate / ppc / (op.oee > 0 ? op.oee : 1),
    l: op.labourTimeHr > 0 ? lab * op.manning / ppc / (op.labourEfficiency > 0 ? op.labourEfficiency : 1) : 0,
  };
}

/**
 * The input with `gbp` (feature cost) or `nre` (tooling) taken out for finding `g` — the single definition the DFM
 * restack and the DtC panel share. Feature cost comes off the operation that carries it as the time that removes
 * EXACTLY that £ from the factory base: machine time at the machine's £ per cycle-hour (after parts per cycle and OEE),
 * labour hour for hour until the op's labour time runs out, then machine alone. Never more than 90 % of the op; the
 * basis says when the cap bit. Tooling comes off the tool NRE — the NRE the finding was priced from, not the per-part
 * figure × the stack's amortisation volume (a slide priced over 50k parts a year read as five slides over 250k).
 */
export function findingVariant(
  g: DtcFindingLike, input: UniversalStackInput, library: RateLibrary, amount?: { gbp: number; nre?: number; minutes?: number },
): { next: UniversalStackInput; basis: string; short: string; removedGBP: number } | null {
  const items = costItems(g);
  const gbp = amount?.gbp ?? items.reduce((a, x) => a + x.gbp, 0);
  // Minutes in the costing's own time model, when every item carries them (the time pricers do): the saving is then
  // those minutes at the costed operation's rates — not the job's reference-rate £.
  const minutes = amount ? amount.minutes : (items.every(x => x.minutes !== undefined) ? items.reduce((a, x) => a + (x.minutes ?? 0), 0) : undefined);
  if (!(gbp > 0)) return null;
  const kind = g.worst.costImpact?.kind ?? (/undercut|side-action|slide/.test(g.ruleId) ? 'tooling' : 'feature_cost');
  if (kind === 'tooling') {
    const vol = input.tooling.amortizationVolume || input.annualVolume || 0;
    const nre = amount ? (amount.nre ?? gbp * (vol || 1)) : items.reduce((a, x) => a + (x.nre ?? x.gbp * (vol || 1)), 0);
    const delta = Math.min(nre, input.tooling.totalToolingCost);
    return {
      next: { ...input, tooling: { ...input.tooling, totalToolingCost: input.tooling.totalToolingCost - delta } },
      basis: `tooling NRE −£${delta.toFixed(0)} (the slide / insert) through the stack`,
      short: `£${delta.toFixed(0)} less tooling (the slide / insert), spread over ${vol > 0 ? vol.toLocaleString('en-GB') : 'the'} parts`,
      removedGBP: vol > 0 ? delta / vol : 0,
    };
  }
  if (kind !== 'feature_cost') return null;
  const ops = input.operations;
  if (!ops.length) return null;
  const want_ = OP_FOR_RULE.find(([re]) => re.test(g.ruleId))?.[1];
  let k = want_ ? ops.findIndex(o => !o.benchOperation && o.cycleTimeHr > 0 && want_.test(o.operationName)) : -1;
  if (k < 0) ops.forEach((o, i) => { if (!o.benchOperation && (k < 0 || o.cycleTimeHr > ops[k].cycleTimeHr)) k = i; });
  if (k < 0) return null;
  const op = ops[k];
  const { m, l } = opSlopes(op, library);
  if (!(m + l > 0)) return null;
  const hrCap = op.cycleTimeHr * 0.9, labCap = op.labourTimeHr * 0.9;
  let hr: number;
  let want: number;
  if (minutes !== undefined && minutes > 0) {
    // the costing's own minutes, off its own operation (labour falls with the cycle, as the costing adds it)
    want = minutes / 60;
    hr = Math.min(want, hrCap);
  } else {
    // no minutes (an older payload): the time that removes the £ at this operation's rates
    hr = gbp / (m + l);
    if (l > 0 && hr > labCap) hr = m > 0 ? labCap + (gbp - (m + l) * labCap) / m : labCap;
    want = hr;
    hr = Math.min(hr, hrCap);
  }
  const labourHr = l > 0 ? Math.min(hr, labCap) : 0;
  const removed = m * hr + l * labourHr;
  return {
    next: { ...input, operations: ops.map((o, i) => i === k ? { ...o, cycleTimeHr: o.cycleTimeHr - hr, labourTimeHr: o.labourTimeHr - labourHr } : o) },
    basis: `${(hr * 60).toFixed(2)} min off ${op.operationName} at that operation\u2019s own rates (£${(m + l).toFixed(2)} per hour `
      + 'of cycle after parts/cycle, OEE and crew)'
      + (hr < want - 1e-12 ? ` — capped at 90 % of the operation (${(want * 60).toFixed(2)} min asked)` : '')
      + ' through the stack',
    short: `${(hr * 60).toFixed(2)} min of ${opShortName(op.operationName)} off each part, at that operation\u2019s own rate`,
    removedGBP: removed,
  };
}

/** "Drilling — 13 holes (4×Ø5.0×12, …) [geometry-measured]" → "drilling": the operation's name, not its spec. */
export function opShortName(name: string): string {
  const head = name.split(/\s+[—–-]\s+/)[0].replace(/\s*[([].*$/, '').trim();
  return head ? head.charAt(0).toLowerCase() + head.slice(1) : name;
}

/** Design levers: every DFM finding with a modelled £ that the stack carries and the design change can take out. */
export function dfmLevers(
  grouped: readonly DtcFindingLike[], input: UniversalStackInput, library: RateLibrary,
): DtcLever[] {
  const base = computeUniversalStack(input, library).total;
  const out: DtcLever[] = [];
  for (const g of grouped) {
    if (NOT_IN_STACK_RULES.has(g.ruleId)) continue;
    const items = costItems(g);
    const v = findingVariant(g, input, library);
    if (!v) continue;
    let t: number;
    try { t = computeUniversalStack(v.next, library).total; } catch { continue; }
    const saving = round4(base - t);
    if (!(saving > 0)) continue;
    const kind: LeverKind = UPPER_BOUND_RULES.test(g.ruleId) ? 'upper-bound' : 'redesign';
    const upper = 'Upper bound: this is the features\u2019 whole cost. Deleting them saves all of it; shortening or opening them saves part of it.';
    const steps = [
      ...(g.worst.costImpact?.basis ? [`The finding: ${g.worst.costImpact.basis}`] : []),
      `In this costing: ${v.basis}.`,
      ...(kind === 'upper-bound' ? [upper] : []),
    ];
    out.push({
      id: `dfm:${g.ruleId}`,
      title: g.title ?? g.ruleId,
      summary: `${v.short.charAt(0).toUpperCase()}${v.short.slice(1)}.`,
      steps,
      // What the £ IS (the finding's own pricing), then how it moves the stack.
      basis: steps.join(' '),
      confidence: g.worst.costImpact?.confidence === 'indicative' ? 'indicative' : 'modelled',
      kind,
      ruleId: g.ruleId,
      faceIds: g.faceIds ?? [],
      jobGBP: items.reduce((a, x) => a + x.gbp, 0),
      savingGBP: saving,
      apply: (inp, removed) => {
        if (!removed) return findingVariant(g, inp, library)?.next ?? inp;
        // only what no earlier lever already took out
        let gbp = 0, nre = 0, mins = 0;
        const allMinutes = items.every(x => x.minutes !== undefined);
        for (const it of items) {
          const done = removed.get(it.key) ?? 0;
          const left = Math.max(0, it.gbp - done);
          if (left > 0) {
            gbp += left;
            nre += it.nre !== undefined ? it.nre * (left / it.gbp) : 0;
            mins += it.minutes !== undefined ? it.minutes * (left / it.gbp) : 0;
          }
          removed.set(it.key, Math.max(done, it.gbp));
        }
        if (!(gbp > 0)) return inp;
        return findingVariant(g, inp, library, { gbp, ...(nre > 0 ? { nre } : {}), ...(allMinutes ? { minutes: mins } : {}) })?.next ?? inp;
      },
    });
  }
  return out.sort((a, b) => b.savingGBP - a.savingGBP);
}

/** Findings priced on cost the sheet does not carry yet — to ADD to the should-cost, not levers to take out. */
export function costsNotInStack(grouped: readonly DtcFindingLike[]): Array<{ ruleId: string; title: string; gbp: number; faceIds: number[]; basis?: string }> {
  return grouped.filter(g => NOT_IN_STACK_RULES.has(g.ruleId) && (g.totalCostGBP ?? 0) > 0)
    .map(g => ({ ruleId: g.ruleId, title: g.title ?? g.ruleId, gbp: g.totalCostGBP!, faceIds: g.faceIds ?? [], basis: g.worst.costImpact?.basis }));
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
  const removed = new Map<string, number>();     // one hole / one slide comes out once, whichever levers point at it
  for (const l of levers) { next = l.apply(next, removed); applied.push(`${l.title} — ${l.summary.replace(/\.$/, '')}`); }
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
