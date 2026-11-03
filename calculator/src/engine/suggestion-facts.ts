/**
 * Facts the suggestion layer (insights.ts, dfm-dfa.ts, idea-levers.ts) reads off the costing before it says anything,
 * so a lever's words match the arithmetic the costing did (7-country report review, 3 Nov 2026):
 *
 *  - `machiningRoutingVerdict` — the routing optimiser's verdict on the costed machining content, ranked as the router
 *    ranks it (machine + operator, the router's volume cell included). A lever may not propose a routing the router
 *    already ranked and rejected, and its printed £ figures subtract at the precision they are printed.
 *  - `utilisationReference` — ONE material-utilisation reference per process, the band the rules use, labelled.
 *  - `toolingBoughtByLife` — whether the tooling in the costing is a one-off investment (doubling the volume halves it
 *    per part) or bought by tool life (more volume buys more tools or sets).
 *  - `remeltableAlloy` — whether "secondary / remelt alloy" means anything for the part's material.
 *  - `itemisedProcessEnergy` — process energy the core priced into the material line (billet heating, melt).
 *
 * Pure functions of the costing input; no AI, no randomness.
 */
import type { CommodityType, RateLibrary, UniversalStackInput, PartCostResult } from './types.js';
import {
  optimiseMachiningRouting, costRoutingAsGiven, classifyOpName, standardBatchSize, CUTTING_MANNING,
} from './routing-optimiser.js';
import { activeLabourRate } from './rate-context.js';
import { FORGING_PROCESS_REFERENCE } from './modules/forging-advisor.js';

type Op = UniversalStackInput['operations'][number];

// ─── Machining routing ───────────────────────────────────────────────────────

/** Synthetic entries in the operation list that are not machining stations. */
const SYNTHETIC_OP = /setup \(amortised\)|\bcast|mould|mold|pour|shakeout|melt|foundry/i;
const CUTTING_OP = /mill|drill|turn|bor(e|ing)|tap|ream|grind|machin|fabrication|face|hob|shap/i;
/** Handling, bench finishing and the foundry's fettling ("gate / riser removal, grind" read as a grinding station). */
const HANDLING_OP = /load|clamp|unload|deburr|fettl|gauge|inspect|pack|change-over|pallet change|set-?up/i;

/** The real machining operations behind an operation list — synthetic entries (the amortised-setup pseudo-op, the
 *  casting pour), bench steps and handling excluded. */
export function machiningOpsOf(input: UniversalStackInput): Op[] {
  return (input.operations ?? []).filter(o => !o.benchOperation && !SYNTHETIC_OP.test(o.operationName ?? '')
    && CUTTING_OP.test(o.operationName ?? '') && !HANDLING_OP.test(o.operationName ?? ''));
}

export interface RoutingVerdict {
  /** Distinct machines carrying the optimisable (milling + drilling) content. */
  stations: number;
  /** £ a part, machine + operator, of the content AS COSTED — rounded to the penny it is printed at. */
  given: number;
  /** £ a part, machine + operator, of the same content on the router's cheapest routing — rounded to the penny. */
  best: number;
  /** given − best, from the two printed figures (so the printed figures subtract). */
  saving: number;
  /** saving ÷ given × 100, uncapped. */
  savingPctOfMachining: number;
  bestLabel: string;
  /** The costed routing already runs on the router's chosen machines — there is no routing lever left. */
  alreadyChosen: boolean;
  /** 5-axis consolidation is the cheapest routing and is not the one costed. */
  consolidationWins: boolean;
  /** 5-axis consolidation was ranked and does not win. */
  fiveAxisLoses: boolean;
  /** The router's own ranking text (every candidate, machine + operator). */
  basis: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The router's verdict on the costed milling + drilling content: the content as costed, and the router's cheapest
 * routing of it, both ranked as the router ranks (machine + operator; the twin-pallet volume cell is a candidate at
 * its volume). Null when no verifiable comparison exists (no optimisable content, or a machine the book does not
 * hold). The lever used to compare machine-only £ against the router's machine + operator choice, without the volume
 * cell: it told a stub axle the router had put on the volume cell to "re-quote on the cost-optimal routing" — a
 * routing the router had ranked £1.88 dearer (7-country review, 3 Nov 2026).
 */
export function machiningRoutingVerdict(
  input: UniversalStackInput, commodity: CommodityType | string, library?: RateLibrary,
): RoutingVerdict | null {
  // Turning stays on its lathe — the optimiser does not re-plan it ("Turning — … journals, taper, shoulders" classifies
  // as a TAP, i.e. drilling, by classifyOpName, and dragged the lathe into the milling comparison).
  const optimisable = machiningOpsOf(input).filter(o => {
    if (/\bturn|lathe/i.test(o.operationName ?? '')) return false;
    const cap = classifyOpName(o.operationName ?? '');
    return cap === 'mill3' || cap === 'mill5' || cap === 'drill';
  });
  if (optimisable.length === 0) return null;
  const perPart = (o: Op) => o.cycleTimeHr / Math.max(1, o.partsPerCycle ?? 1);
  const batch = standardBatchSize(input.annualVolume ?? input.tooling?.amortizationVolume ?? 0);
  const handlingMin = 0.8;
  let given: { costPerPart: number; setups: number } | null = null;
  const asGiven = optimisable.map(o => ({ name: o.operationName ?? '', machineId: o.machineId, cycleTimeHr: perPart(o) }));
  try {
    given = library ? costRoutingAsGiven(asGiven, batch, 45, handlingMin, library) : costRoutingAsGiven(asGiven, batch, 45, handlingMin);
  } catch { given = null; }
  if (!given) return null;
  let labourRate: number;
  try {
    labourRate = library?.labour?.find(l => l.id === 'lab-uk-skilled')?.fullyLoadedRatePerHr ?? activeLabourRate('lab-uk-skilled');
  } catch { return null; }
  const hrOf = (pred: (cap: string) => boolean) => optimisable
    .filter(o => pred(classifyOpName(o.operationName ?? ''))).reduce((s, o) => s + perPart(o), 0);
  const millingHr = hrOf(c => c !== 'drill');
  const drillHr = hrOf(c => c === 'drill');
  const millOps = optimisable.filter(o => classifyOpName(o.operationName ?? '') !== 'drill');
  const opt = optimiseMachiningRouting({
    millingHr, drillHr,
    // Each existing milling op is one fixturing of the split alternative — the ops are the only setup evidence here.
    principalDirections: Math.max(1, millOps.length),
    axisymmetric: false, bboxSortedMm: null, batchSize: batch,
    fromSolid: commodity === 'machining',
    annualVolume: input.annualVolume,
    labourRatePerHr: labourRate,
    ...(library ? { library } : {}),
  });
  // The costed content's operator, on the router's convention: cutting at the shared manning, handling a whole operator.
  const givenLabour = labourRate * ((millingHr + drillHr) * CUTTING_MANNING + given.setups * handlingMin / 60);
  const g = round2(given.costPerPart + givenLabour);
  const b = round2(opt.chosen.costPerPart + opt.chosen.labourPerPart);
  const saving = round2(g - b);
  const ids = new Set(optimisable.map(o => o.machineId));
  const chosenIds = new Set([opt.chosen.primaryMachineId, opt.chosen.drillMachineId]);
  const five = opt.alternatives.find(c => c.label === 'consolidated-5axis');
  return {
    stations: ids.size,
    given: g, best: b, saving,
    savingPctOfMachining: g > 0 ? (saving / g) * 100 : 0,
    bestLabel: opt.chosen.label,
    alreadyChosen: [...ids].every(id => chosenIds.has(id)),
    consolidationWins: opt.chosen.label === 'consolidated-5axis',
    fiveAxisLoses: !!five && opt.chosen.label !== 'consolidated-5axis',
    basis: opt.basis,
  };
}

/** A routing saving worth a claim: more than pennies and more than 2 % of the machining spend (on the printed figures). */
export function routingSavingIsMaterial(v: RoutingVerdict): boolean {
  return !v.alreadyChosen && v.saving > Math.max(0.05, v.given * 0.02);
}

// ─── Material utilisation reference ──────────────────────────────────────────

export interface UtilisationReference {
  /** Fractions, e.g. [0.55, 0.80]. */
  band: [number, number];
  /** What the band is the reference for, e.g. "closed-die forging". */
  label: string;
  /** Where the band comes from, printed beside it. */
  source: string;
}

/**
 * ONE material-utilisation reference per process — the band the rules use where a rule uses one (forging: the
 * closed-die yield band the forging rules size the billet from), otherwise the CostVision engineering estimate the
 * report's material section prints. A hub flange read "Reference: forging 75–90 %" in §3, "below the forging reference
 * of 75%" in §11 and was costed on a 55–80 % band (7-country review, 3 Nov 2026). Null where no reference is held
 * (a casting whose gating is remelted reports melt loss, not a yield; mouldings; pass-through material).
 */
export function utilisationReference(commodity: CommodityType | string): UtilisationReference | null {
  const c = String(commodity ?? '');
  if (c === 'forging') {
    const [lo, hi] = FORGING_PROCESS_REFERENCE['closed-die'].yieldBand;
    return { band: [lo, hi], label: 'closed-die forging',
      source: 'the closed-die yield band the forging rules size the billet from (engineering estimate, not a sourced survey)' };
  }
  if (c === 'sheet_metal' || c === 'sheet_metal_fab') {
    return { band: [0.55, 0.75], label: 'stamping / blanking (nesting + skeleton)', source: 'CostVision engineering estimate, not a sourced survey' };
  }
  if (c === 'machining') {
    return { band: [0.60, 0.75], label: 'machining from stock (stock removal)', source: 'CostVision engineering estimate, not a sourced survey' };
  }
  if (c === 'extrusion' || c === 'aluminium_extrusion') {
    return { band: [0.85, 0.95], label: 'extrusion (end crop)', source: 'CostVision engineering estimate, not a sourced survey' };
  }
  return null;
}

/** "55–80 %" */
export function bandText(ref: UtilisationReference): string {
  return `${Math.round(ref.band[0] * 100)}–${Math.round(ref.band[1] * 100)} %`;
}

// ─── Tooling basis ───────────────────────────────────────────────────────────

/**
 * Commodities whose module buys its tools by tool life × volume (die sets = ⌈volume ÷ die life⌉, moulds in service,
 * replacement tools, fractional wear-out) — more volume buys more tooling, so it does not dilute per part.
 */
const TOOL_LIFE_COMMODITIES = new Set<string>([
  'sheet_metal', 'casting', 'cast_and_machine', 'forging', 'injection_moulding', 'blow_moulding', 'rotational_moulding',
  'rubber', 'composites', 'aluminium_extrusion', 'e_motor', 'wiring_harness',
]);
const TOOL_LIFE_ITEM = /replac|wear|worn|in service|\bsets?\b|set\(s\)|\blife\b|moulds?:/i;

/**
 * Whether the costing's tooling is bought by tool life (true) or is one fixed investment amortised over the volume
 * (false). "Doubling volume halves per-part tooling" was printed on a stamping whose tooling per part ROSE from £1.03 at
 * 200k to £1.13 at 250k (a second die set) and on a composite whose 222 tools in service + 1,778 replacements made it
 * £69.30 at every volume (7-country review, 3 Nov 2026). The itemised tooling decides where it says; else the module.
 */
export function toolingBoughtByLife(input: UniversalStackInput, commodity: CommodityType | string): { byLife: boolean; why: string } {
  const items = input.tooling?.items ?? [];
  const lifeItems = items.filter(i => TOOL_LIFE_ITEM.test(i.label));
  const short = (l: string) => { const t = l.split(/ \(| — /)[0].trim(); return t.length > 90 ? `${t.slice(0, 87)}…` : t; };
  if (lifeItems.length) return { byLife: true, why: lifeItems.map(i => short(i.label)).join('; ') };
  if (TOOL_LIFE_COMMODITIES.has(String(commodity))) {
    return { byLife: true, why: 'the number of tools or die sets is sized from tool life × the volume' };
  }
  return { byLife: false, why: items.length ? items.map(i => short(i.label)).join('; ') : 'no replacement sets in the costing' };
}

// ─── Material family ─────────────────────────────────────────────────────────

/**
 * A non-ferrous casting / extrusion alloy, for which "secondary / remelt alloy" is a real grade choice (primary v
 * secondary aluminium, zinc, magnesium, copper alloys). It was offered on a DC04 steel stamping (7-country review).
 */
export function remeltableAlloy(input: UniversalStackInput, library?: RateLibrary): boolean {
  const id = input.rawMaterial?.materialId ?? '';
  const m = library?.materials?.find(x => x.id === id);
  const text = `${id} ${m?.grade ?? ''} ${m?.category ?? ''}`;
  if (/steel|iron|gj[slv]|stainless|titanium|nickel|polymer|resin|rubber|plastic|virtual/i.test(text)) return false;
  return /alumin|\bal\b|-al|zinc|zamak|magnes|copper|brass|bronze|\blm\d|adc\d|a3\d\d|en ac|en aw|6\d{3}|cusn/i.test(text);
}

// ─── Process energy in the material line ─────────────────────────────────────

/** £ a part of process energy (billet heating, melt) the core priced into the MATERIAL line, from the trace. */
export function itemisedProcessEnergy(result: PartCostResult): number {
  return ((result as { traceability?: Array<{ field: string; value: number }> }).traceability ?? [])
    .filter(t => t.field.startsWith('rawMaterial.energyKwh')).reduce((s, t) => s + (Number(t.value) || 0), 0);
}
