/**
 * Machining routing optimiser — the machine is a COST decision, not a default.
 *
 * Everything else in machine selection is capability or capacity sizing
 * (`machine-sizing.ts` picks the smallest press that closes, the machining
 * centre that can reach). What no layer ever did is compare the feasible
 * routings in pounds: a five-machine split routing re-fixtures the part at
 * every station but runs on cheap machines; a 5-axis consolidation pays a
 * higher rate to make most of the setups disappear. Which one wins depends on
 * the part (how many approach directions), the batch (setup amortisation) and
 * the library rates — so it is arithmetic, and a should-cost that models "the
 * most efficient plausible supplier" must DO that arithmetic rather than
 * recommend it to the reader afterwards. That is this module.
 *
 * The report symptom this kills: §11/§13 advising "consolidate operations
 * using multi-axis machining" on a routing the tool itself proposed. The
 * costing now takes the cheapest capable routing up front and prints the
 * losing alternatives in the trace; the suggestion layer can then say
 * "routing verified optimal, £X cheaper than the split alternative" instead
 * of critiquing its own output.
 *
 * Golden rule unchanged: this module only SELECTS machine ids — every £/hr
 * still comes from the deterministic rate library. And the comparison is
 * ranked on the library's UK base rates: regional factors scale the machining
 * family together, so the RANKING is region-stable while the absolute pounds
 * on the estimate still come from the regional engine run.
 */
import { DEFAULT_RATE_LIBRARY } from './rate-library.js';
import type { RateLibrary } from './types.js';

export type MachiningCapability = 'turn' | 'mill3' | 'mill5' | 'drill' | 'grind';

/**
 * What each machining machine in the rate library can do, and how big a part
 * it takes (work envelope, mm, sorted largest-first). BOTH machine families
 * are here — the generic tiers and the named centres — which is the point:
 * the capability picker alone could never reach the cheaper member of a
 * class (a HAAS VF-2 at £45/hr does 3-axis work the £55/hr generic VMC gets
 * by default). Envelopes are catalogue-typical figures; they exist to stop a
 * bumper being "optimised" onto a VF-2, not to be machining gospel.
 */
export const MACHINE_CATALOGUE: ReadonlyArray<{
  id: string; cap: MachiningCapability; envelopeMm: readonly [number, number, number];
}> = [
  { id: 'mach-vmc3',        cap: 'mill3', envelopeMm: [1020, 660, 635] },
  { id: 'mach-haas-vf2',    cap: 'mill3', envelopeMm: [762, 508, 406] },
  { id: 'mach-vmc5',        cap: 'mill5', envelopeMm: [800, 600, 500] },
  { id: 'mach-haas-umc500', cap: 'mill5', envelopeMm: [610, 406, 406] },
  { id: 'mach-dmg-dmu50',   cap: 'mill5', envelopeMm: [500, 450, 400] },
  { id: 'mach-lathe-cnc',   cap: 'turn',  envelopeMm: [600, 400, 400] },
  { id: 'mach-mazak-qt200', cap: 'turn',  envelopeMm: [540, 340, 340] },
  { id: 'mach-drill',       cap: 'drill', envelopeMm: [1000, 600, 600] },
  { id: 'mach-grind',       cap: 'grind', envelopeMm: [800, 400, 400] },
];

/** Classify a free-text operation name (an AI op, a form op) to a capability.
 *  Order matters: a "5-axis cross-bore" is a 5-axis milling op, not a drilling
 *  op, so the multi-axis signature is checked before the drill words. */
export function classifyOpName(name: string): MachiningCapability {
  const n = (name || '').toLowerCase();
  if (/grind|hone|lap/.test(n)) return 'grind';
  if (/5[\s-]?ax|cross.?bore|undercut/.test(n)) return 'mill5';
  if (/drill|tap|ream|\bbore\b|counterbore|spot.?face/.test(n)) return 'drill';
  if (/lathe|turn/.test(n)) return 'turn';
  return 'mill3';
}

/** One batch per fortnightly-ish run, clamped to sane shop-floor sizes — the
 *  single convention for machining setup amortisation (shared with the mapper). */
export function standardBatchSize(annualVolume: number): number {
  return Math.round(Math.min(5000, Math.max(50, (annualVolume || 10_000) / 20)));
}

export interface RoutingCandidate {
  /** 'split-3axis' | 'consolidated-5axis' | 'turned' */
  label: string;
  /** machine carrying the milling/turning content (and the setups). */
  primaryMachineId: string;
  /** machine carrying the drilling content. */
  drillMachineId: string;
  /** real fixturings this routing needs. */
  setups: number;
  /** machine cost per part incl. amortised setup, £ at UK library rates — for RANKING. */
  costPerPart: number;
  detail: string;
}

export interface RoutingChoice {
  chosen: RoutingCandidate;
  /** every candidate costed, cheapest first (chosen is [0]). */
  alternatives: RoutingCandidate[];
  /** £/part the chosen routing saves against the next-best candidate. */
  savingVsNext: number;
  basis: string;
}

function rateOf(library: RateLibrary, id: string): number | null {
  const m = library.machines.find((x: { id: string }) => x.id === id);
  return m ? m.computedRatePerHr : null;
}

/** Cheapest machine of a capability whose envelope takes the part. Oversize
 *  parts get the largest machine of the class rather than a dead end. */
function cheapestCapable(
  library: RateLibrary, cap: MachiningCapability, partSortedMm: readonly [number, number, number] | null,
): { id: string; ratePerHr: number; oversize: boolean } | null {
  const members = MACHINE_CATALOGUE.filter(m => m.cap === cap)
    .map(m => ({ ...m, rate: rateOf(library, m.id) }))
    .filter((m): m is typeof m & { rate: number } => m.rate !== null);
  if (members.length === 0) return null;
  const fits = (env: readonly [number, number, number]) =>
    !partSortedMm || partSortedMm.every((d, i) => d <= env[i]);
  const feasible = members.filter(m => fits(m.envelopeMm));
  if (feasible.length > 0) {
    const best = feasible.reduce((a, b) => (b.rate < a.rate ? b : a));
    return { id: best.id, ratePerHr: best.rate, oversize: false };
  }
  const biggest = members.reduce((a, b) =>
    (b.envelopeMm[0] * b.envelopeMm[1] * b.envelopeMm[2] > a.envelopeMm[0] * a.envelopeMm[1] * a.envelopeMm[2] ? b : a));
  return { id: biggest.id, ratePerHr: biggest.rate, oversize: true };
}

export interface RoutingInputs {
  /** milling (or turning) content, hr/part. */
  millingHr: number;
  /** drilling content, hr/part. */
  drillHr: number;
  /** distinct approach directions the geometry needs (setupAnalysis). */
  principalDirections: number;
  axisymmetric: boolean;
  /** part bbox, mm, sorted largest-first — envelope feasibility. */
  bboxSortedMm: readonly [number, number, number] | null;
  /** parts per machining batch — setup amortisation denominator. */
  batchSize: number;
  /** minutes per fixturing (existing convention: 45). */
  setupMinsPerSetup?: number;
  /** minutes of load/align/unload EVERY PART pays at EVERY fixturing — the
   *  per-piece cost of a split routing that batch amortisation cannot hide. */
  perPartHandlingMinPerSetup?: number;
  library?: RateLibrary;
}

const fmtGBP = (v: number) => `£${v.toFixed(2)}`;

/**
 * Cost the feasible routings and return the cheapest, with the losers priced
 * in the trace. Deterministic; same inputs, same routing, same words.
 */
export function optimiseMachiningRouting(p: RoutingInputs): RoutingChoice {
  const library = p.library ?? DEFAULT_RATE_LIBRARY;
  const setupHrEach = (p.setupMinsPerSetup ?? 45) / 60;
  const handlingHrEach = (p.perPartHandlingMinPerSetup ?? 0.8) / 60;
  const dirs = Math.max(1, Math.round(p.principalDirections) || 1);
  const batch = Math.max(1, p.batchSize);

  const candidates: RoutingCandidate[] = [];
  const push = (
    label: string,
    primary: { id: string; ratePerHr: number; oversize: boolean } | null,
    drillM: { id: string; ratePerHr: number } | null,
    setups: number,
    detailPrefix: string,
  ) => {
    if (!primary) return;
    const drill = p.drillHr > 0 ? (drillM ?? primary) : null;
    const cutting = p.millingHr * primary.ratePerHr + p.drillHr * (drill?.ratePerHr ?? 0);
    const setupCost = setups * setupHrEach * primary.ratePerHr / batch;
    const handlingCost = setups * handlingHrEach * primary.ratePerHr;
    const cost = cutting + setupCost + handlingCost;
    candidates.push({
      label,
      primaryMachineId: primary.id,
      drillMachineId: drill?.id ?? primary.id,
      setups,
      costPerPart: Math.round(cost * 10_000) / 10_000,
      detail: `${detailPrefix}: ${primary.id} £${primary.ratePerHr.toFixed(0)}/hr`
        + (drill && drill.id !== primary.id ? ` + ${drill.id} £${drill.ratePerHr.toFixed(0)}/hr` : '')
        + `, ${setups} setup(s) × ${(setupHrEach * 60).toFixed(0)} min / batch ${batch}`
        + ` + ${(handlingHrEach * 60).toFixed(1)} min handling per part per setup`
        + (primary.oversize ? ' (part exceeds catalogue envelopes — largest machine of class)' : ''),
    });
  };

  const drillMachine = cheapestCapable(library, 'drill', p.bboxSortedMm);

  if (p.axisymmetric) {
    // A turned part: one chucking, drilling either on the lathe's station or
    // off-machine. Model the conservative case: drilling moves to the drill
    // press with its own fixturing.
    push('turned', cheapestCapable(library, 'turn', p.bboxSortedMm), drillMachine,
      1 + (p.drillHr > 0 ? 1 : 0), 'turning-led routing');
  }

  // Split: 3-axis milling refixtured once per approach direction, drilling on
  // the drill press with its own setup.
  push('split-3axis', cheapestCapable(library, 'mill3', p.bboxSortedMm), drillMachine,
    dirs + (p.drillHr > 0 ? 1 : 0), `${dirs}-direction split routing`);

  // Consolidated: one datum on a 5-axis machine reaches every direction and
  // carries the drilling in the same clamping.
  push('consolidated-5axis', cheapestCapable(library, 'mill5', p.bboxSortedMm), null,
    1, 'single-setup 5-axis consolidation');

  candidates.sort((a, b) => a.costPerPart - b.costPerPart);
  const chosen = candidates[0];
  const next = candidates[1];
  const savingVsNext = next ? Math.round((next.costPerPart - chosen.costPerPart) * 10_000) / 10_000 : 0;

  const basis = `cost-ranked ${candidates.length} routing(s): `
    + candidates.map(c => `${c.label} ${fmtGBP(c.costPerPart)} (${c.detail})`).join(' vs ')
    + ` → ${chosen.label}`
    + (next ? `, ${fmtGBP(savingVsNext)}/part cheaper than ${next.label}` : '');

  return { chosen, alternatives: candidates, savingVsNext, basis };
}

/**
 * Cost of a routing AS GIVEN (an engineer's manual machine choices, an AI's
 * assignment) under the same conventions the optimiser ranks with — so the
 * suggestion layer can honestly compare "what was costed" against "what the
 * optimiser would do" without re-deriving anything.
 */
export function costRoutingAsGiven(
  ops: Array<{ name: string; machineId: string; cycleTimeHr: number }>,
  batchSize: number,
  setupMinsPerSetup = 45,
  perPartHandlingMinPerSetup = 0.8,
  library: RateLibrary = DEFAULT_RATE_LIBRARY,
): { costPerPart: number; setups: number } | null {
  if (ops.length === 0) return null;
  let cutting = 0;
  const stations = new Set<string>();
  for (const op of ops) {
    const rate = rateOf(library, op.machineId);
    if (rate === null) return null;   // unknown machine — cannot honestly cost
    cutting += Math.max(0, op.cycleTimeHr) * rate;
    stations.add(op.machineId);
  }
  // Each distinct machine is at least one fixturing, paid per batch AND per part.
  const setups = stations.size;
  const first = rateOf(library, ops[0].machineId) ?? 0;
  const setupCost = setups * (setupMinsPerSetup / 60) * first / Math.max(1, batchSize);
  const handlingCost = setups * (perPartHandlingMinPerSetup / 60) * first;
  return { costPerPart: Math.round((cutting + setupCost + handlingCost) * 10_000) / 10_000, setups };
}
