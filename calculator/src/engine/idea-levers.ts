/**
 * 360° idea-generation levers — the deterministic answer to "what would a
 * VAVE workshop propose on this part?".
 *
 * Every lever reads only what the costing itself established: the 8-bucket
 * breakdown, the operation list (names, cycle times, manning, efficiency,
 * parts-per-cycle, per-op costs), the tooling NRE and amortisation volume,
 * packaging/logistics per part, and the SuggestionContext flags that record
 * what a person actually told the tool (region, volume, quoted pack rates).
 * No AI, no randomness: same part in, same ideas out.
 *
 * Categories span the whole 360°: material, design, process, tooling,
 * packaging & logistics, commercial, quality, sustainability. Levers that
 * would otherwise re-recommend a decision the tool already took, or instruct
 * on an assumed (not entered) value, are gated the same way §11–§15 of the
 * report are — see SuggestionContext in insights.ts.
 */
import { shortOperationName } from './operation-names.js';
import type { PartCostResult, UniversalStackInput, CommodityType, RateLibrary } from './types.js';
import type { SuggestionContext } from './insights.js';
import type { CostOptimisation } from './dfm-dfa.js';
import { computeUniversalStack } from './core.js';
import { remeltableAlloy, itemisedProcessEnergy } from './suggestion-facts.js';

/**
 * What a lever DOES to the cost drivers, as a pure transform on the stack input. A lever is re-costed — and so listed
 * with a £ — only when its change is PHYSICALLY DEFINED: a named driver moved to a value the costing, the rules or a
 * stated source give (report-standard review, 3 Nov 2026). What the five reviewers withdrew, and why:
 *
 *  - "Attack the bottleneck — cycle time −20 %": a sensitivity case, no change named that delivers it (the sensitivity
 *    table already carries ±10 % on every driver).
 *  - "Unmanned / lights-out — manning ×0.6": no pallet pool, probing or gauging capex was charged, and none is held
 *    from a source (the book's HMC note quotes a used EC-400 WITH a pallet pool, not the pool's own price) — the saving
 *    was overstated by construction, and on a safety-critical part it took people off the special-characteristic checks.
 *  - "Consumables ×0.8", "packaging ×0.5", "pack density ×0.8", "freight ×0.7", "net weight −10 %", "utilisation
 *    +10 points (regrind)", "tooling ×0.6 (soft tool)", "tool life ×1.25", "1:2 manning": each a rule-of-thumb
 *    multiplier on a driver, not a design or process change — and several re-recommended what the rules had already
 *    decided (regrind, soft tooling ≤ 25k, the crew per machine).
 *  - "Multi-cavity ×2 on every operation, tooling ×1.7": it halved the machining, fettling and melt shop of a casting
 *    (£5.93, 34 %, on a bracket whose pattern already carried 4 impressions — a further impression is worth ≤ £0.5) and
 *    doubled a blow moulder the rules had sized for one cavity. It now acts on the FORMING operation only, by the step
 *    the rules' own cavitation sizing allows (`SuggestionContext.cavitation`), with the forming machine re-sized where it
 *    depends on cavities — or it is not priced.
 *
 * Those levers stay in the catalogue as unpriced suggestions (counted, never listed with a figure — see
 * opportunity-ranking.ts) where they are still useful questions; the bottleneck and lights-out levers are gone.
 */
export type LeverTransform = (input: UniversalStackInput) => UniversalStackInput;

/** The smallest saving a lever is listed at: a lever that prints as £0.00 is not a lever (Director #45). */
export const MIN_LEVER_SAVING_GBP = 0.01;

/** The scrap-credit target: 30 % of the prime price — engineering-typical, not sourced (confirm against the scrap index). */
const SCRAP_CREDIT_SHARE_OF_PRIME = 0.30;

type Transform = (input: UniversalStackInput, result: PartCostResult, ctx: SuggestionContext | undefined, commodity: CommodityType | undefined)
  => { next: UniversalStackInput; basis: string } | null;

const LEVER_TRANSFORMS: Record<string, Transform> = {
  'Scrap Revenue Recovery at Index Prices': (input, result) => {
    // Raise the scrap CREDIT to 30% of prime. The costing already credits the scrap at its own recovery price, so the
    // lever is only the gap between that price and 30% of prime, on the scrap the part makes. It was modelled as better
    // utilisation — buying less metal AND still crediting the scrap: a Poland stamping showed zł0.39 for a lever worth
    // ~zł0.05 (live review, 10 Oct 2026).
    const rm = input.rawMaterial;
    if (rm.lossIsNotScrap || rm.directCost !== undefined || !(rm.materialUtilization > 0 && rm.materialUtilization < 1)) return null;
    const tr = (f: string) => result.traceability.find(t => t.field === f)?.value;
    const price = tr('material.pricePerKg'), scrap = tr('material.scrapRecoveryPricePerKg') ?? 0;
    if (!(price && price > 0)) return null;
    const target = SCRAP_CREDIT_SHARE_OF_PRIME * price;
    const scrapKg = rm.netWeightKg / rm.materialUtilization - rm.netWeightKg;
    const gain = scrapKg * (target - scrap);
    if (!(gain > 1e-6)) return null;
    return { next: { ...input, rawMaterial: { ...rm, scrapRecoveryPricePerKgOverride: target } },
      basis: `${scrapKg.toFixed(3)} kg of scrap a part credited at 30% of prime (£${target.toFixed(3)}/kg — 30% is engineering-typical, not sourced: confirm against the scrap index) instead of the costed £${scrap.toFixed(3)}/kg` };
  },
  'Multi-Cavity / Multi-Up Tooling': (input, _result, ctx, commodity) => formingCavityStep(input, ctx, commodity),
  'Multi-Cavity Tooling — Confirm the Annual Volume First': (input, _result, ctx, commodity) => {
    const t = formingCavityStep(input, ctx, commodity);
    return t ? { ...t, basis: `${t.basis} — at the ASSUMED volume` } : null;
  },
};

// ─── Multi-cavity: the forming operation only, by the rules' own step ────────

/** The forming operation by name: the moulding line, die-cast / blow / injection machine, press, former, rubber mould. */
const RX_FORMING = /mould|mold|die.?cast|hpdc|\bcasting\b|blow|inject|thermoform|forming|\bpress|stamp|transfer|compression|forg/i;
/** Never the forming operation: machining, the melt shop, fettling, trim / deflash, bench, handling, set-up, change-over,
 *  inspection — a cavity does not halve any of them (the bracket's 12.4 min HMC op and its fettling bench were halved). */
const RX_NOT_FORMING = /machin|drill|\bmill|turn|lathe|bor(e|ing)\b|\btap|ream|grind|melt|fettl|trim|deflash|deburr|inspect|gauge|set-?up|change|load|clamp|pallet|pack|cure oven|heat treat|blast/i;

/** Commodities whose forming machine is sized by the cavities it carries (shot, clamp, platen, heads). */
const CAVITY_SIZED_MACHINE: CommodityType[] = ['injection_moulding', 'blow_moulding', 'rubber'];

/** The index of the forming operation in the operation list (the one a cavity / impression step acts on), or −1. */
export function formingOperationIndex(input: UniversalStackInput, operationName?: string): number {
  const ops = input.operations ?? [];
  if (operationName) {
    const k = ops.findIndex(o => o.operationName === operationName);
    return k >= 0 && !ops[k].benchOperation && !RX_NOT_FORMING.test(ops[k].operationName ?? '') ? k : -1;
  }
  return ops.findIndex(o => !o.benchOperation && o.cycleTimeHr > 0
    && RX_FORMING.test(o.operationName ?? '') && !RX_NOT_FORMING.test(o.operationName ?? ''));
}

/**
 * The next cavity / impression step on the FORMING operation, as the rules' own sizing allows it
 * (`SuggestionContext.cavitation`): parts per cycle × next ÷ current on that one operation (machine AND labour, as
 * core.ts divides both), the forming machine re-sized where it depends on cavities, the forming tooling at the rules'
 * figure for `next`. Null — the lever is not priced — when the rules give no further step, or the forming machine
 * depends on cavities and no machine for `next` is given.
 */
function formingCavityStep(input: UniversalStackInput, ctx: SuggestionContext | undefined, commodity: CommodityType | undefined)
  : { next: UniversalStackInput; basis: string } | null {
  const cav = ctx?.cavitation;
  if (!cav || !(cav.current >= 1) || !(cav.next != null && cav.next > cav.current)) return null;
  const k = formingOperationIndex(input, cav.operationName);
  if (k < 0) return null;
  const op = input.operations[k];
  const sized = commodity ? CAVITY_SIZED_MACHINE.includes(commodity) || (/die.?cast|hpdc/i.test(op.operationName ?? '')) : false;
  if (sized && !cav.machineIdForNext) return null;
  const ratio = cav.next / cav.current;
  const cycleRatio = cav.cycleTimeHrForNext && op.cycleTimeHr > 0 ? cav.cycleTimeHrForNext / op.cycleTimeHr : 1;
  const nextOp = {
    ...op,
    partsPerCycle: (op.partsPerCycle ?? 1) * ratio,
    cycleTimeHr: op.cycleTimeHr * cycleRatio,
    labourTimeHr: (op.labourTimeHr ?? 0) * cycleRatio,
    ...(cav.machineIdForNext ? { machineId: cav.machineIdForNext } : {}),
  };
  const toolDelta = cav.formingToolGBP.next - cav.formingToolGBP.current;
  return {
    next: { ...input,
      operations: input.operations.map((o, i) => (i === k ? nextOp : o)),
      tooling: { ...input.tooling, totalToolingCost: Math.max(0, input.tooling.totalToolingCost + toolDelta) } },
    basis: `${shortOperationName(op.operationName)} only: ${cav.current} → ${cav.next} ${cav.unit ?? 'cavities'} (${cav.basis})`
      + (cav.machineIdForNext && cav.machineIdForNext !== op.machineId ? `; forming machine re-sized for ${cav.next}` : '')
      + `; forming tooling £${Math.round(cav.formingToolGBP.current).toLocaleString('en-GB')} → £${Math.round(cav.formingToolGBP.next).toLocaleString('en-GB')}`
      + '; no other operation changed',
  };
}

/**
 * A machine-paced operation one operator tends: not a bench step, not load / clamp / handling (the operator IS the
 * task), not a crewed line (a sand moulding line runs a crew of 4 — "4 operators per machine" was read as over-manning).
 */
function tendedMachineOp(o: UniversalStackInput['operations'][number]): boolean {
  const m = o.manning ?? 0;
  return !o.benchOperation && m >= 1 && m <= 1.5 && o.cycleTimeHr > 0 && o.cycleTimeHr > (o.labourTimeHr ?? 0) * 0.8
    && !/load|clamp|unload|handling|set-?up|inspect|gauge|deburr|fettl|pack/i.test(o.operationName ?? '');
}

/** £ per part of core / pattern / shell / moulding-sand consumables — itemised where the module itemises them. */
export function coreConsumables(input: UniversalStackInput): number {
  const items = input.rawMaterial.consumablesItems;
  if (items?.length) return items.filter(i => /core|pattern|shell|sand|wax|binder/i.test(i.label)).reduce((s, i) => s + i.gbp, 0);
  return 0;
}

/**
 * The METAL's share of the part — the material bucket less the consumables / services carried in it and the melt /
 * process energy the core priced into it. "Material is 40 % … the lever is the metal itself" quoted the whole bucket,
 * of which the metal was 17.9 % on the stub axle (casting 360 review, Oct 2026).
 */
export function metalShareOf(result: PartCostResult, input: UniversalStackInput): number {
  const tot = result.total || 0;
  if (!(tot > 0)) return 0;
  const energy = ((result as { traceability?: Array<{ field: string; value: number }> }).traceability ?? [])
    .filter(t => t.field.startsWith('rawMaterial.energyKwh')).reduce((s, t) => s + (Number(t.value) || 0), 0);
  const metal = (result.breakdown.rawMaterial || 0) - (input.rawMaterial.consumablesCostPerPart ?? 0) - energy;
  return Math.max(0, metal) / tot;
}

/** Cutting, drilling, boring, turning, handling, set-up and bench finishing after a casting / forging. */
const RX_MACHINING_OP = /machin|drill|bor(e|ing)|turn|mill|load \/ clamp|setup|deburr|tap/i;

/**
 * Run every lever that has a transform through the real stack. The saving
 * becomes Δtotal / total; a lever whose re-cost shows less than a penny is removed —
 * an idea that does not survive the arithmetic is not an idea, and a lever printed as
 * £0.00 is padding. Levers with no transform keep their bounded percentage and are
 * labelled `heuristic` (counted, never listed with a figure).
 */
export function recostLevers(
  levers: CostOptimisation[], result: PartCostResult, input: UniversalStackInput, library: RateLibrary,
  ctx?: SuggestionContext, commodity?: CommodityType,
): void {
  // Baseline from the SAME input the transforms start from, so Δ is the lever alone.
  const base = computeUniversalStack(input, library).total;
  for (let i = levers.length - 1; i >= 0; i--) {
    const lever = levers[i];
    const key = Object.keys(LEVER_TRANSFORMS).find(k => lever.title === k || lever.title.startsWith(k));
    if (!key) { lever.savingBasis = 'heuristic'; continue; }
    let t: { next: UniversalStackInput; basis: string } | null = null;
    try { t = LEVER_TRANSFORMS[key](input, result, ctx, commodity); } catch { t = null; }
    if (!t) { lever.savingBasis = 'heuristic'; continue; }
    let next: number;
    try { next = computeUniversalStack(t.next, library).total; } catch { lever.savingBasis = 'heuristic'; continue; }
    const savingGBP = base - next;
    if (!(savingGBP >= MIN_LEVER_SAVING_GBP)) { levers.splice(i, 1); continue; }   // did not survive the arithmetic
    lever.savingBasis = 'recosted';
    lever.savingGBP = Math.round(savingGBP * 10_000) / 10_000;
    lever.expectedSavingPct = Math.round((savingGBP / base) * 1000) / 10;
    lever.recostBasis = `${t.basis} → £${next.toFixed(4)} vs £${base.toFixed(4)} through the rate library`;
  }
}

/** Bucket shares and op stats already derived by generateDFMDFA — passed in so
 *  both layers read the identical numbers. */
export interface LeverSignals {
  matPct: number; procPct: number; labPct: number; toolPct: number;
  oheadPct: number; mgnPct: number; opCount: number; avgOEE: number; matUtil: number;
}

// ─── Op-name signal regexes (same style as the sheet-metal weld rule) ────────
export const RX_INSPECT = /inspect|cmm|gauge|\btest\b|testing|verification/i;
export const RX_REWORK  = /deburr|fettl|polish|buff|dress|linish|flash removal|rework|touch.?up/i;
/**
 * A finishing operation done as its own step (deburr, fettle, polish, rework) — not a machine operation that names a
 * deburr pass in passing: an extrusion's "Precision cut-to-length and deburr (cold saw, end trims)" was read as manual
 * finishing and told to "fix the burr at source … gate redesign" (7-country review, 3 Nov 2026).
 */
export function manualFinishingOp(name: string): boolean {
  return RX_REWORK.test(name ?? '') && !/\bsaw\b|cut-?to-?length|cut to length|machin|\bmill|\bturn|\bdrill/i.test(name ?? '');
}
const RX_TIGHT    = /grind|lapp?ing|hone|honing|ream|superfinish/i;
/** Casting / forging clean-up that grinds for the process, not for a callout. */
const RX_CAST_CLEAN = /fettl|gate|riser|degat|knock.?off|flash|clean|snag|shot.?blast|trim/i;
const RX_HEAT     = /heat treat|anneal|temper|normalis|carburis|nitrid|stress relie|solution|ag(e|ing) harden/i;

const METAL_FORM: CommodityType[] = ['machining', 'cast_and_machine', 'casting', 'forging', 'sheet_metal', 'sheet_metal_fab', 'extrusion'];
const MOULD_FAMILY: CommodityType[] = ['injection_moulding', 'blow_moulding', 'thermoforming'];
const CAVITY_PROCESSES: CommodityType[] = ['injection_moulding', 'blow_moulding', 'thermoforming', 'rubber', 'casting'];
const ENERGY_INTENSE: CommodityType[] = ['casting', 'forging', 'painting', 'rubber', 'composites', 'rotational_moulding'];
/** What the energy is spent on, per energy-intensive process (the lever said "melt, cure, oven" on a forging). */
const ENERGY_WHAT: Partial<Record<CommodityType, string>> = {
  casting: 'melting and holding the metal', cast_and_machine: 'melting and holding the metal', forging: 'heating the billet to forging temperature',
  painting: 'the cure oven', rubber: 'the cure', composites: 'the cure', rotational_moulding: 'the oven',
};
/** The upstream cause of finishing work, per process. */
export const FINISH_CAUSE: Partial<Record<CommodityType, string>> = {
  machining: 'tool condition and tool path', aluminium_extrusion: 'saw blade condition and cut parameters',
  casting: 'gating, parting line and die condition', cast_and_machine: 'gating, parting line and tool condition',
  forging: 'flash land and trim die condition', injection_moulding: 'parting line, venting and tool condition',
  sheet_metal: 'die clearance and die condition', sheet_metal_fab: 'cutting parameters and tool condition',
};

const LOW_COST_REGIONS = new Set(['cn', 'china', 'in', 'india', 'mx', 'mexico', 'pl', 'poland',
  'cz', 'czechia', 'czech republic', 'tr', 'turkey', 'th', 'thailand', 'vn', 'vietnam']);

/**
 * The extended lever catalogue. Returns only levers whose trigger fired —
 * each with the saving computed from this part's own numbers and capped.
 */
export function generateIdeaLevers(
  result: PartCostResult,
  input: UniversalStackInput,
  commodity: CommodityType,
  ctx: SuggestionContext | undefined,
  sig: LeverSignals,
): CostOptimisation[] {
  const out: CostOptimisation[] = [];
  const { matPct, procPct, labPct, toolPct, oheadPct, mgnPct, opCount, matUtil } = sig;
  const tot = result.total || 1;
  const ops = input.operations ?? [];
  const opDetails = result.operationDetails ?? [];

  const pkgPct = (result.breakdown.packaging / tot) * 100;
  const logPct = (result.breakdown.logistics / tot) * 100;
  const pkgLogEstimated = ctx?.pkgLogisticsEstimated === true;
  const volumeAssumed = ctx?.volumeProvided === false;
  const alreadyLowCost = LOW_COST_REGIONS.has((ctx?.region ?? '').trim().toLowerCase());

  // Only the consumables the lever is about — cores, patterns, shell, moulding sand. Heat treat, NDT and tool wear were
  // counted too, so a stub axle read "consumables are 59 % of the material line" (uploaded-parts review, Oct 2026).
  const materialBucket = result.breakdown.rawMaterial || 0;
  const consumShare = materialBucket > 0 ? coreConsumables(input) / materialBucket : 0;

  const amortVol = input.tooling?.amortizationVolume ?? 0;
  const toolingNRE = input.tooling?.totalToolingCost ?? 0;


  const maxManning = ops.filter(tendedMachineOp).reduce((m, o) => Math.max(m, o.manning ?? 0), 0);
  const hasOp = (rx: RegExp) => ops.some(o => rx.test(o.operationName ?? ''));
  const opShareOfTotal = (rx: RegExp) => opDetails
    .filter(o => rx.test(o.operationName ?? ''))
    .reduce((s, o) => s + o.processCost + o.labourCost, 0) / tot;

  // ═══ MATERIAL ═══════════════════════════════════════════════════════════════

  const metalPct = metalShareOf(result, input) * 100;
  const remeltable = remeltableAlloy(input, ctx?.library);
  const gradeExample = remeltable
    ? (/cast|casting/.test(commodity) ? 'e.g. primary → secondary casting alloy where the spec allows' : 'e.g. 6082 → 6060 where strength allows')
    : ['sheet_metal', 'sheet_metal_fab'].includes(commodity) ? 'e.g. DP600 → HSLA where CAE confirms, or one gauge down'
      : commodity === 'forging' ? 'e.g. a micro-alloyed grade in place of a quench-and-tempered one where the load case allows'
        : ['casting', 'cast_and_machine'].includes(commodity) ? 'e.g. a lower-alloy iron or steel grade where the load case allows'
          : 'e.g. a lower-cost grade of the same family where the load case allows';
  if (METAL_FORM.includes(commodity) && metalPct > 40) {
    out.push({
      category: 'material', lever: 'design',
      title: 'Alternate Material Grade Study',
      // "secondary / remelt alloy" only where the metal has one (non-ferrous) — it was offered on a DC04 steel stamping
      // (7-country review, 3 Nov 2026); the example substitutions are the part's own family.
      description: `The metal is ${metalPct.toFixed(1)}% of part cost — the largest lever on this part is the metal itself. An equivalent lower-cost grade`
        + (remeltable ? ' (or a secondary / remelt alloy where the spec allows)' : '') + ' attacks it directly.',
      expectedSavingPct: Math.min(8, 3 + (metalPct - 40) * 0.15),
      technicalJustification: `Grade substitution within the same family (${gradeExample}) typically saves 5–15% of the material line with no process change. Requires engineering sign-off against the load case.`,
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (MOULD_FAMILY.includes(commodity) && matUtil < 0.92) {
    out.push({
      category: 'material', lever: 'supplier',
      title: commodity === 'injection_moulding' ? 'Closed-Loop Regrind of Runners and Trim' : 'Closed-Loop Regrind of Trim',
      description: `${((1 - matUtil) * 100).toFixed(0)}% of the resin bought does not ship in the part. Reprocessing ${commodity === 'thermoforming' ? 'the sheet skeleton and trim' : commodity === 'blow_moulding' ? 'the flash, tails and trim' : commodity === 'rotational_moulding' ? 'the trimmed openings' : 'runners, sprues and trim'} as a controlled regrind blend recovers most of that value.`,
      expectedSavingPct: Math.min(5, (0.95 - matUtil) * 40),
      technicalJustification: 'A 10–20% regrind blend is standard practice for non-optical, non-safety mouldings and is invisible in the part when dried and dosed correctly. The saving is the resin price times the recovered fraction.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (['machining', 'cast_and_machine', 'sheet_metal', 'sheet_metal_fab', 'forging'].includes(commodity) && matUtil < 0.80) {
    out.push({
      category: 'material', lever: 'sourcing',
      title: 'Scrap Revenue Recovery at Index Prices',
      description: `${((1 - matUtil) * 100).toFixed(0)}% of the bought material leaves as chips, offcuts or skeleton. That scrap has an index price — the credit belongs in the piece price, not in the supplier's margin.`,
      expectedSavingPct: Math.min(4, 1 + (0.80 - matUtil) * 15),
      technicalJustification: 'Clean segregated scrap (Al swarf, steel skeleton, electrical-steel stamping web) trades at 20–60% of prime price. An open-book scrap credit clause at LME/index-linked prices is a standard automotive term.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (MOULD_FAMILY.includes(commodity) && matPct > 35) {
    out.push({
      category: 'sustainability', lever: 'design',
      title: 'Recycled-Content (PCR) Resin Blend',
      description: `Resin is ${matPct.toFixed(1)}% of the part. A 10–30% post-consumer-recycled blend cuts both cost and the part's carbon footprint where colour and mechanicals allow.`,
      expectedSavingPct: Math.min(4, matPct * 0.08),
      technicalJustification: 'PCR PP/ABS trades 15–30% below prime. Non-appearance and black parts are the natural first candidates; many OEM sustainability targets now require declared recycled content anyway.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (consumShare > 0.20) {
    out.push({
      category: 'material', lever: 'design',
      title: 'Consumables Rationalisation (Cores, Patterns, Shell)',
      description: `Cores, patterns and shell are ${(consumShare * 100).toFixed(0)}% of the material line. Core count, pattern life and shell recipe are all design-controllable.`,
      expectedSavingPct: Math.min(6, consumShare * 20),
      technicalJustification: 'Core consolidation (one complex core replacing two simple ones), longer-life wax/pattern tooling, and shell-sand reclaim each cut the recurring consumable line 10–30% in foundry practice.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  // Index only what an index moves: the metal / resin, not the cores, heat treatment, NDT and tool wear the material
  // bucket also carries ("material at 45.3%" on a stub axle whose metal was 9.7% — Poland live review, 10 Oct 2026).
  const indexPct = metalShareOf(result, input) * 100;
  if (indexPct > 40) {
    out.push({
      category: 'commercial', lever: 'sourcing',
      title: 'Raw-Material Price Indexation Clause',
      description: `With the metal / resin itself at ${indexPct.toFixed(1)}% of cost, the quote embeds the supplier's hedge against metal/resin volatility. An index-linked clause removes that risk premium from the piece price.`,
      expectedSavingPct: Math.min(3, indexPct * 0.05),
      technicalJustification: 'Indexing the material content to LME/CRU/resin indices with quarterly true-up removes the 2–5% volatility contingency suppliers price in, and makes future raw-material moves transparent in both directions.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  // ═══ DESIGN ═════════════════════════════════════════════════════════════════

  // Tolerance-driven finishing only — not the foundry's fettling ("gate / riser removal, grind"), a deburr or a casting
  // clean-up, which are there for the process, not a callout (7-country review: "Grinding/honing/reaming content is
  // 6.7%" was the stub axle's fettling).
  const tightShare = opDetails
    .filter(o => RX_TIGHT.test(o.operationName ?? '') && !RX_REWORK.test(o.operationName ?? '') && !RX_CAST_CLEAN.test(o.operationName ?? ''))
    .reduce((s, o) => s + o.processCost + o.labourCost, 0) / tot;
  // The machining operations' own share — the process bucket also holds the moulding line on a cast + machine part.
  const machPct = commodity === 'machining' ? procPct : opShareOfTotal(RX_MACHINING_OP) * 100;
  if (tightShare > 0.03 || (['machining', 'cast_and_machine'].includes(commodity) && machPct > 35)) {
    out.push({
      category: 'design', lever: 'design',
      title: 'Tolerance and Surface-Finish Relaxation',
      description: tightShare > 0.03
        ? `Grinding/honing/reaming content is ${(tightShare * 100).toFixed(1)}% of the part cost. Each of those operations exists to hit a callout — challenge the callouts before paying for them.`
        : `Machining is ${machPct.toFixed(1)}% of the part (its operations, machine and labour). The tightest tolerance and finish callouts set the machine, the cycle and the inspection burden — reviewing them is the cheapest cost lever that exists.`,
      expectedSavingPct: tightShare > 0.03 ? Math.min(6, tightShare * 100 * 0.8) : 4,
      technicalJustification: 'Industry DFM studies attribute 20–40% of precision-machining cost to the tightest decile of callouts. Opening a ±0.01 to ±0.05 where function allows can delete a grinding operation outright.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (opCount >= 5 && ['machining', 'cast_and_machine', 'sheet_metal', 'sheet_metal_fab', 'biw_assembly', 'pcba', 'wiring_harness'].includes(commodity)) {
    out.push({
      category: 'design', lever: 'design',
      title: 'Part-Count / Feature Integration Review (Boothroyd)',
      description: (['machining', 'cast_and_machine'].includes(commodity)
        ? `${opCount} operations: each exists for a feature. Ask of each feature whether the function needs it, and of the part whether it must be separate from its neighbours — does it move, must it be a different material, must it come apart for assembly or service (Boothroyd)?`
        : `${opCount} operations suggest features or joined parts that may not need to exist separately. The Boothroyd minimum-part-count test asks of each: does it move, must it be a different material, must it be separate for assembly?`),
      expectedSavingPct: 6,
      technicalJustification: 'Boothroyd–Dewhurst DFA practice: any part failing all three criteria is a candidate to integrate into its neighbour. Integrating a bracket into a casting or forming a feature instead of fastening it removes its entire operation chain.',
      risk: 'Medium', timeframe: 'Long Term',
    });
  }

  if ((commodity === 'casting' || commodity === 'rotational_moulding' || MOULD_FAMILY.includes(commodity)) && matPct > 42) {
    out.push({
      category: 'design', lever: 'design',
      title: 'Lightweighting / Wall Optimisation',
      description: `Material is ${matPct.toFixed(1)}% of cost and this is a wall-driven process — every 10% of wall thickness removed is roughly 10% off the material line and a shorter cooling/solidification cycle on top.`,
      expectedSavingPct: Math.min(6, 3 + (matPct - 42) * 0.15),
      technicalJustification: 'Topology/wall studies against the measured geometry (the kernel already knows the wall map) routinely find 8–15% mass with no load-path compromise. Cycle time falls with the square of wall on cooling-limited parts.',
      risk: 'Medium', timeframe: 'Long Term',
    });
  }

  // ═══ PROCESS ════════════════════════════════════════════════════════════════

  // No "attack the bottleneck — cycle time −20 %" lever: the −20 % named no change that delivers it — it is a sensitivity
  // case, and the sensitivity table already varies every driver (report-standard review, 3 Nov 2026; on 9 of 15 pages).

  // Multi-cavity / multi-up: ONLY on the forming operation, ONLY by the step the rules' own cavitation sizing allows
  // (`ctx.cavitation`: the cavities / impressions the costing runs and the next count that fits the flask, platen,
  // window or press ladder). It doubled parts per cycle on EVERY operation — the casting bracket's HMC machining,
  // fettling bench and melt shop — and printed £5.93 (34 %) for a pattern that already carried 4 impressions, and it
  // doubled an air duct on the blow moulder the rules had sized for one cavity (report-standard review, 3 Nov 2026).
  // The rules choose cavitation by cost (IM optimiser, rubber cavities), by fit (sand flask, thermoform window, roto
  // arm) or by machine (blow head and shot), so with no further step from them there is no lever.
  const cav = ctx?.cavitation;
  const formingIdx = cav ? formingOperationIndex(input, cav.operationName) : -1;
  if (CAVITY_PROCESSES.includes(commodity) && cav && cav.next != null && cav.next > cav.current && formingIdx >= 0) {
    const formingName = shortOperationName(ops[formingIdx].operationName);
    out.push({
      category: 'process', lever: 'supplier',
      title: volumeAssumed
        ? 'Multi-Cavity Tooling — Confirm the Annual Volume First'
        : 'Multi-Cavity / Multi-Up Tooling',
      description: `${formingName} runs ${cav.current} ${cav.unit ?? 'cavities'} a cycle; the rules' own sizing allows ${cav.next} (${cav.basis}). `
        + 'Only the forming operation divides by the extra cavity — machining, trimming, finishing and inspection stay per part.'
        + (volumeAssumed ? ' The volume in this cost is a tool assumption — confirm the real programme volume before committing cavity investment.' : ''),
      expectedSavingPct: 0,
      technicalJustification: 'Re-costed through the stack on the forming operation alone, with the forming tooling and (where it depends on cavities) the forming machine at the rules\' figures for the next step.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  // No "unmanned / lights-out — manning ×0.6" lever: it charged no pallet pool, probing or post-process gauging, and no
  // sourced figure for them is held, so the saving was overstated by construction; on a safety-critical part it took
  // people off the special-characteristic checks (report-standard review, 3 Nov 2026 — Director #10, quality #1). Whether
  // the supplier runs the cell unattended is a question for the negotiation, not a £.

  if (maxManning >= 1 && labPct > 15 && !['wiring_harness', 'composites', 'biw_assembly'].includes(commodity) && ops.some(tendedMachineOp)) {
    out.push({
      category: 'process', lever: 'supplier',
      title: 'Multi-Machine Manning',
      description: `Machine-paced operations are tended by ${maxManning.toFixed(1)} operator per machine. One operator tending two machines is the usual correction.`,
      expectedSavingPct: Math.min(5, labPct * 0.25),
      technicalJustification: 'Where the operator loads, starts and walks away, 1:2 or 1:3 manning halves or thirds the charged labour minutes. Requires cell layout and staggered cycles — a supplier kaizen, not an investment.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  const energyInMaterial = itemisedProcessEnergy(result);
  if (ENERGY_INTENSE.includes(commodity) || hasOp(RX_HEAT)) {
    out.push({
      category: 'sustainability', lever: 'supplier',
      title: 'Energy Productivity Programme',
      // Say where THIS costing carries the energy: a forging's billet heating is itemised in the material line (kWh × the
      // country tariff), not "inside the machine rate" (7-country review, 3 Nov 2026).
      description: `This process is energy-intensive (${[ENERGY_WHAT[commodity], hasOp(RX_HEAT) ? 'heat treatment' : ''].filter(Boolean).join(' and ')}). `
        + (energyInMaterial > 0
          ? `The process energy is itemised in the material line (kWh × the costing country's tariff, ${(energyInMaterial / tot * 100).toFixed(1)}% of cost); the machines' own energy sits in their machine rates — and energy is the fastest-moving input cost of the decade.`
          : 'Energy sits inside the machine rate and overhead — and it is the fastest-moving input cost of the decade.'),
      expectedSavingPct: 3,
      technicalJustification: 'Melt/furnace scheduling to off-peak tariffs, regenerative burners, cure-recipe optimisation and compressed-air leak programmes typically cut process energy 10–20%, of which 2–4% of part cost reaches the piece price — and the carbon line falls with it.',
      risk: 'Low', timeframe: 'Medium Term',
    });
  }

  // ═══ TOOLING ════════════════════════════════════════════════════════════════

  if (toolingNRE > 0 && toolPct > 10) {
    out.push({
      category: 'tooling', lever: 'sourcing',
      title: 'Tooling Ownership and End-of-Life Terms',
      description: `£${toolingNRE.toLocaleString()} of tooling sits behind this part. Who owns it, who maintains it, and what happens at end of programme are worth points of piece price — and all of it is negotiable before the tool is cut.`,
      expectedSavingPct: Math.min(4, toolPct * 0.2),
      technicalJustification: 'A separate tooling PO with customer ownership prevents the tool being re-amortised inside future piece prices, secures the asset for resourcing leverage, and makes tool maintenance an explicit (auditable) line instead of a hidden uplift.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (amortVol > 0 && amortVol < 25000 && toolPct > 25) {
    out.push({
      category: 'tooling', lever: 'supplier',
      title: 'Soft / Bridge Tooling for This Volume',
      description: `Tooling is ${toolPct.toFixed(1)}% of part cost over only ${amortVol.toLocaleString()} parts. Below ~25k parts, aluminium tools, printed inserts or master-frame systems beat hard steel tooling.`,
      expectedSavingPct: Math.min(8, toolPct * 0.3),
      technicalJustification: 'Aluminium production tools cost 40–60% of P20 steel and comfortably survive 10–100k shots in polyolefins; modular master frames share the base across a family. The right answer flips back to steel only when volume grows.',
      risk: 'Medium', timeframe: 'Medium Term',
    });
  }

  if (['casting', 'forging', 'sheet_metal', 'sheet_metal_fab'].includes(commodity) && toolPct > 15) {
    out.push({
      category: 'tooling', lever: 'supplier',
      title: 'Tool-Life Extension Programme',
      description: `Tooling at ${toolPct.toFixed(1)}% of part cost means every extra thousand shots of die life is money. Surface treatment and disciplined maintenance are the cheapest capacity there is.`,
      expectedSavingPct: Math.min(4, toolPct * 0.15),
      technicalJustification: 'Nitriding/PVD on wear surfaces, weld-repair schedules and hot-die lubrication programmes extend die life 30–100% in HPDC and forging practice — directly diluting the NRE per part.',
      risk: 'Low', timeframe: 'Medium Term',
    });
  }

  // ═══ PACKAGING & LOGISTICS ══════════════════════════════════════════════════

  if (pkgPct > 4) {
    out.push({
      category: 'logistics', lever: pkgLogEstimated ? 'assumption' : 'sourcing',
      title: pkgLogEstimated ? 'Packaging Cost — Confirm, Then Make It Returnable' : 'Returnable Packaging Loop',
      description: `Packaging is ${pkgPct.toFixed(1)}% of part cost.`
        + (pkgLogEstimated
          ? ' This figure is tool-estimated from size and weight — confirm the quoted packaging spec first, then evaluate a returnable loop.'
          : ' Evaluate a returnable tote / dunnage loop against expendable packaging at this share — its payback depends on the fleet size and return freight, which this costing does not hold.'),
      expectedSavingPct: Math.min(4, pkgPct * 0.5),
      technicalJustification: 'Returnables convert a per-part consumable into an amortised asset, with damage-rate and waste-stream benefits. The saving % shown is a CostVision heuristic (half the packaging share, capped at 4 %), not a sourced figure — cost the loop before quoting it.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if ((pkgPct + logPct) > 8) {
    out.push({
      category: 'logistics', lever: pkgLogEstimated ? 'assumption' : 'sourcing',
      title: 'Pack Density / Cube Utilisation Review',
      description: `Packaging plus logistics is ${(pkgPct + logPct).toFixed(1)}% of part cost. Freight is bought by the cubic metre — parts that nest, stack or ship in denser dunnage cut it directly.`,
      expectedSavingPct: Math.min(4, (pkgPct + logPct) * 0.3),
      technicalJustification: 'Nesting orientation studies and custom dunnage regularly lift parts-per-container 20–50%. On intercontinental routes this is often worth more than any process improvement on the part.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (logPct > 6 && !alreadyLowCost) {
    out.push({
      category: 'logistics', lever: pkgLogEstimated ? 'assumption' : 'sourcing',
      title: 'Freight Mode and Consolidation Review',
      description: `Logistics is ${logPct.toFixed(1)}% of part cost. Mode (sea vs air), consolidation (milk runs, full containers) and incoterm are all buyer-controlled levers.`,
      expectedSavingPct: Math.min(5, logPct * 0.5),
      technicalJustification: 'Air-to-sea conversion cuts freight 70–85% where lead time allows; consolidated FCL versus LCL saves 20–40%. The landed-cost module prices these scenarios per country on request.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (alreadyLowCost && logPct > 9) {
    out.push({
      category: 'logistics', lever: 'sourcing',
      title: 'Total Landed Cost — Near-Shore Check',
      description: `This part is costed in a low-cost region but logistics is ${logPct.toFixed(1)}% of its cost. At that freight share, a nearer supplier at a higher piece price can win on landed cost — the 20-country comparison quantifies it.`,
      expectedSavingPct: Math.min(6, logPct * 0.5),
      technicalJustification: 'Freight, duty, inventory-in-transit and expedite risk offset ex-works savings on heavy or bulky parts. Run the regional comparison on landed (not ex-works) cost before renewing the source.',
      risk: 'Medium', timeframe: 'Long Term',
    });
  }

  // ═══ QUALITY ════════════════════════════════════════════════════════════════

  const inspShare = opShareOfTotal(RX_INSPECT);
  // Not on a safety-critical part: skip-lot / reduced inspection takes people off the checks of its special
  // characteristics (quality review row 1, Nov 2026).
  if (hasOp(RX_INSPECT) && inspShare > 0.05 && !ctx?.safetyCritical) {
    out.push({
      category: 'quality', lever: 'supplier',
      title: 'Right-Size Inspection and Test',
      description: `Inspection/test operations carry ${(inspShare * 100).toFixed(1)}% of part cost as separate steps. Capable processes earn reduced inspection — that is what capability data is for.`,
      expectedSavingPct: Math.min(4, inspShare * 100 * 0.6),
      technicalJustification: 'SPC-based skip-lot inspection, in-line gauging on the machine, and poka-yoke at the source typically cut standalone inspection cost 40–70% once Cpk ≥ 1.33 is demonstrated — without raising escape risk.',
      risk: 'Low', timeframe: 'Medium Term',
    });
  }

  const reworkShare = opDetails.filter(o => manualFinishingOp(o.operationName ?? ''))
    .reduce((s, o) => s + o.processCost + o.labourCost, 0) / tot;
  if (ops.some(o => manualFinishingOp(o.operationName ?? '')) && reworkShare > 0.02) {
    out.push({
      category: 'quality', lever: 'supplier',
      title: 'Eliminate Manual Finishing at Source',
      // Name the upstream causes of THIS process: "gating" was printed on a saw-cut extrusion's deburr (Germany review).
      description: `Finishing operations (${ops.filter(o => manualFinishingOp(o.operationName ?? '')).map(o => o.operationName).join(', ')}) carry ${(reworkShare * 100).toFixed(1)}% of part cost. Manual finishing is a symptom — the cause is upstream (${FINISH_CAUSE[commodity] ?? 'tool and die condition'}) and cheaper to fix there.`,
      expectedSavingPct: Math.min(4, 1 + reworkShare * 100 * 0.5),
      technicalJustification: 'Removing the burr or flash at its source (tool condition, gating, die maintenance) beats removing it by hand. Where finishing must remain, tumbling / vibratory finishing replaces bench labour — the ratio depends on the part (CostVision engineering heuristic).',
      risk: 'Low', timeframe: 'Medium Term',
    });
  }

  // ═══ COMMERCIAL & STRATEGY ══════════════════════════════════════════════════

  if (mgnPct > 10) {
    out.push({
      category: 'commercial', lever: 'sourcing',
      title: 'Payment Terms / Early-Settlement Discount',
      description: `A supplier pricing ${mgnPct.toFixed(1)}% margin values cash. Early settlement (e.g. 14 days vs 60) is routinely worth 1–2% off the piece price and costs the buyer only working capital.`,
      expectedSavingPct: 2,
      technicalJustification: 'Standard dynamic-discounting maths: 2%/46 days ≈ 16% annualised — attractive to any supplier financing at SME rates. A pure win where the buyer’s cost of capital is lower than the supplier’s.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  if (oheadPct > 18 && (procPct + labPct) > 35) {
    out.push({
      category: 'commercial', lever: 'sourcing',
      title: 'Make-vs-Buy Assessment',
      description: `Overhead at ${oheadPct.toFixed(1)}% on top of ${(procPct + labPct).toFixed(1)}% conversion means a large share of this price is another factory's burden. If volumes justify a cell, in-housing removes overhead and margin together.`,
      expectedSavingPct: Math.min(6, oheadPct * 0.2),
      technicalJustification: 'Make-vs-buy on this should-cost basis: in-house cost = material + conversion at own rates + own burden. Parts with high supplier burden and mature process technology are the standard insourcing candidates.',
      risk: 'High', timeframe: 'Long Term',
    });
  }

  if (!input.learningCurve?.enabled && labPct > 20 && ctx?.volumeProvided === true) {
    out.push({
      category: 'commercial', lever: 'sourcing',
      title: 'Learning-Curve Price-Down Agreement',
      description: `Labour is ${labPct.toFixed(1)}% of cost and no learning curve is priced in. On a multi-year programme, labour productivity improves whether or not the contract captures it — the contract should.`,
      expectedSavingPct: 3,
      technicalJustification: 'Wright’s-law experience curves (85–95% typical in assembly-heavy work) imply 5–15% labour-cost reduction per volume doubling. An agreed annual price-down of 2–3% simply shares an improvement that will happen anyway.',
      risk: 'Low', timeframe: 'Quick Win',
    });
  }

  return out;
}
