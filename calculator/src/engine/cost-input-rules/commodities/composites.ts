/**
 * Composites cost inputs, derived from the measured laminate.
 *
 * The plan expected this one to stay engineer-input, because composites is the
 * only commodity with no parametric advisor. That turned out to be half right:
 * there is no advisor, but there did not need to be one. Once the fibre/resin
 * system is chosen, everything the costing wants falls out of the measurement
 * and the published characteristics of the system:
 *
 *   plies          = measured wall ÷ cured ply thickness
 *   areaM2         = measured surface area
 *   layup hours    = laminate mass laid ÷ the published hand-layup rate (prepreg; dry fabric: area × plies × its rate)
 *   cure time      = the resin system's published schedule (autoclave prepreg) or the PCM press cycle
 *   fibre fraction, waste fraction = properties of the system
 *   tool cost      = area × the tool rate for the process (unsourced, labelled)
 *   tool life      = the tool material the cycles each tool sees call for, at its published life
 *
 * Published data (report-standard round, Nov 2026): scripts/research/2026-11-report-standard/composites/ (notes.md,
 * data.json; re-read in ../verify.md). Ids in [brackets] are that file's rows.
 *
 * The prompt asked the model for `plies: estimate from structural requirement
 * (typical CFRP 4–16 plies; GFRP 3–8 plies)` — a guess at a number the kernel
 * has already measured. A 4 mm wall in 0.25 mm carbon prepreg is sixteen plies;
 * the same wall in 0.55 mm infused glass is seven. That is not a judgement call,
 * it is a division.
 *
 * A defect found on the way in: the prompt offers the model six process names
 * (`hand_layup | prepreg_autoclave | rtm | infusion | smc | wet_layup`) and the
 * engine accepts six different ones (`hand_layup | prepreg_layup | rtm | vartm |
 * filament_winding | pultrusion`). Only two words overlap. A model that
 * obediently answered "infusion" was returning a value nothing downstream could
 * use. See `derive/laminate.ts`.
 */
import { materialGradeName } from '../derive/material.js';
import { countryFactor, countryNote } from '../../regional-services.js';
import { activeToolroomFactor, activeLabourRate, activeRates, factorText } from '../../rate-context.js';
import { CURE_ATTENDANCE, type CompositeProcess } from '../../modules/composites.js';
import { decided, ask, fmt, type CommodityRuleSpec, type RuleContext, type RuleOutcome } from '../types.js';
import {
  laminateFacts, autoclaveCure, resinSystemOf, HAND_LAYUP_KG_PER_HR, ATL_KG_PER_HR, LAYUP_RATE_SOURCE,
  type LaminateSystem, type ResinSystem,
} from '../derive/laminate.js';
import { amortisationParts } from './injection-moulding.js';
import { planAreaCm2, bboxSortedMm } from '../derive/envelope.js';
import { shellWallMm } from '../derive/shell-wall.js';

/** Tool cost per m² of moulding surface, by process — the ranges the prompt carried. Engineering-typical, NOT
 *  sourced, and printed as such in the tool cost basis (arithmetic audit, Oct 2026; research gap 2, Nov 2026: no tool
 *  price per m² by material was found). `life` is used only where no tool material below has a published life (vartm,
 *  hand layup, filament winding, pultrusion — printed "not sourced"). PCM has no tool price of its own: it is priced on
 *  the RTM matched-die build-up and says so. */
export const TOOL_RATE_PER_M2: Record<CompositeProcess, { base: number; perM2: number; life: number }> = {
  prepreg_layup:    { base: 12_000, perM2: 14_000, life: 500 },   // autoclave layup tool (life: COMP_TOOL_LIFE)
  vartm:            { base: 4_000,  perM2: 5_000,  life: 300 },   // one-sided infusion tool
  rtm:              { base: 25_000, perM2: 30_000, life: 5_000 }, // matched die, both faces (life: COMP_TOOL_LIFE)
  prepreg_compression: { base: 25_000, perM2: 30_000, life: 100_000 }, // = the RTM matched-die build-up (life: COMP_TOOL_LIFE)
  hand_layup:       { base: 3_000,  perM2: 4_000,  life: 200 },
  filament_winding: { base: 8_000,  perM2: 6_000,  life: 2_000 },
  pultrusion:       { base: 15_000, perM2: 2_000,  life: 20_000 },
};

// ─── Tool life by tool material (report-standard research, 3 Nov 2026) ─────────────────────────────────────────────
// scripts/research/2026-11-report-standard/composites/data.json (ids in brackets), every row CONFIRMED in ../verify.md.
// "fetch tool": the page refuses a plain download and was read through a page-fetch tool that returned the sentence
// verbatim — open it in a browser before a report quotes it.

export type CompToolMaterial = 'cfrp-epoxy' | 'cfrp-bmi' | 'nickel-shell' | 'metal-layup' | 'composite-rtm' | 'steel-matched';

export interface CompToolLife {
  label: string;
  /** Cure / moulding cycles a tool lasts; null = no published count (the tool is taken to last the programme). */
  life: number | null;
  source: string;
}

export const COMP_TOOL_LIFE: Record<CompToolMaterial, CompToolLife> = {
  'cfrp-epoxy': { label: 'carbon/epoxy tooling-prepreg layup tool', life: 300,
    source: 'Cytec, quoted in SME Media "Tooling It Up for Composites" (Apr 2010): "Epoxy tooling is generally limited to less than '
      + '300 cure cycles at temperatures not exceeding 185°C" [TL-1] — 300 is the upper bound' },
  'cfrp-bmi': { label: 'carbon/BMI layup tool (HexTool M61 class)', life: 500,
    source: 'Hexcel HexTool M61 data sheet ©2015: "after more than 500 part cure cycles" [TL-3]; CompositesWorld "Tooling for composites" '
      + '(2016): "can survive 500 autoclave cycles" [TL-5, fetch tool]; the older M61 sheet says 1,000 tool thermal cycles [TL-4]' },
  'nickel-shell': { label: 'nickel-shell layup tool', life: 1_000,
    source: 'Weber Manufacturing (a vendor claim), quoted in SME Media (Apr 2010): "1000–100,000 parts or more" [TL-8] — the lower end' },
  'metal-layup': { label: 'metal layup tool (Invar / steel)', life: null,
    source: 'no cycle count is published: Invar tooling "would last the life of the program" (SME Media, Apr 2009) [TL-7]; metal tools '
      + '"withstand many thousands of production cycles" (CompositesWorld "Tooling for composites", 2016) [TL-6, fetch tool]' },
  'composite-rtm': { label: 'composite RTM mould', life: 5_000,
    source: 'JHM Technologies, "Demystifying the RTM Process" (1998): RTM tool life "> 1,000 to 5,000" mouldings [TL-11] — the upper end' },
  'steel-matched': { label: 'matched steel compression die', life: 100_000,
    source: 'SMC ANALOGUE — no PCM / HP-RTM tool life is published: JHM Technologies (1998): "Expected tooling life for a steel tool as used '
      + 'in the SMC process is greater then 100,000 moldings" [TL-11]; up to 200,000 parts on forged steel dies (CompositesWorld, 2007) '
      + '[TL-10, fetch tool]; compression-mould steel is AISI 4140 at 30–32 HRC, plated (CKN A302) [TL-12]' },
};

/** The tool materials each process can use, shortest life first. A process not listed keeps its unsourced life. */
export const TOOL_MATERIALS_BY_PROCESS: Partial<Record<CompositeProcess, CompToolMaterial[]>> = {
  prepreg_layup: ['cfrp-epoxy', 'cfrp-bmi', 'nickel-shell', 'metal-layup'],
  rtm: ['composite-rtm', 'steel-matched'],
  prepreg_compression: ['steel-matched'],
};

export interface ToolChoice {
  material: CompToolMaterial | null;
  /** The life the costing uses (for a metal layup tool: the cycles each tool sees — not a published life). */
  life: number;
  cyclesPerTool: number;
  replacements: boolean;
  basis: string;
  /** Set when something about the tool is NOT in the price. */
  notCosted: string | null;
}

/**
 * Choose the tool material from the cycles each tool must see over the programme: programme parts ÷ tools in service.
 * The tool PRICE is the same (unsourced) build-up whatever the material, so the material that lasts with the shortest
 * life is chosen and no tool is replaced; when none lasts (the steel die beyond 100,000), the longest-lived is costed
 * and its wear replacements are bought. A metal layup tool has no published count: no wear replacements are charged
 * and resurfacing / replacement is listed as NOT costed.
 */
export function chooseToolMaterial(process: CompositeProcess, programmeParts: number, toolsInService: number): ToolChoice {
  const cycles = programmeParts / Math.max(1, toolsInService);
  const cyc = Math.ceil(cycles);
  const cands = TOOL_MATERIALS_BY_PROCESS[process];
  const lead = `${programmeParts.toLocaleString('en-GB')} programme parts ÷ ${toolsInService} tool${toolsInService === 1 ? '' : 's'} in service `
    + `= ${cyc.toLocaleString('en-GB')} cycles a tool`;
  if (!cands) {
    const life = TOOL_RATE_PER_M2[process].life;
    return { material: null, life, cyclesPerTool: cycles, replacements: cycles > life, notCosted: null,
      basis: `${lead}; ${life.toLocaleString('en-GB')} parts a tool, engineering-typical, not sourced (no published life for this `
        + 'process\'s tool was found); the costing buys the larger of the tools in service and programme parts ÷ this life' };
  }
  const lasts = cands.find(m => COMP_TOOL_LIFE[m].life === null || COMP_TOOL_LIFE[m].life! >= cycles);
  const m = lasts ?? cands[cands.length - 1];
  const t = COMP_TOOL_LIFE[m];
  const skipped = cands.slice(0, cands.indexOf(m)).map(x => `${COMP_TOOL_LIFE[x].label} ${COMP_TOOL_LIFE[x].life!.toLocaleString('en-GB')}`);
  const why = skipped.length ? ` — more than the published life of a ${skipped.join(', ')} cycles` : '';
  if (t.life === null) {
    return { material: m, life: cyc, cyclesPerTool: cycles, replacements: false,
      notCosted: `Layup tool resurfacing / replacement — not costed (no published cycle life for a ${t.label}; confirm the life with the tool maker)`,
      basis: `${lead}${why}: a ${t.label}. Its life: ${t.source}. No wear replacements are charged — the life entered is the ${cyc.toLocaleString('en-GB')} `
        + 'cycles each tool sees, NOT a published life; tool resurfacing / replacement is NOT costed (no published cycle life)' };
  }
  return { material: m, life: t.life, cyclesPerTool: cycles, replacements: !lasts, notCosted: null,
    basis: `${lead}: a ${t.label}, ${t.life.toLocaleString('en-GB')} cycles${lasts ? `${why}, and it lasts them — no replacements`
      : ' — fewer than each tool sees, so wear replacements are bought (programme parts ÷ life)'}. ${t.source}` };
}

/**
 * Ply count from the measured wall.
 *
 * Rounded up: you cannot lay two-thirds of a ply, and a laminate is always at
 * least two so it can be balanced about its mid-plane.
 */
export function plyCount(wallMm: number, system: LaminateSystem): { n: number; basis: string } {
  const exact = wallMm / system.plyThicknessMm;
  const n = Math.max(2, Math.ceil(exact));
  return {
    n,
    basis: `${fmt(wallMm, 2)} mm measured wall ÷ ${system.plyThicknessMm} mm cured ply `
      + `= ${fmt(exact, 1)}, rounded up to ${n}`,
  };
}

/** Laminated area in m² — the surface the plies actually cover. */
export function laminateAreaM2(ctx: RuleContext): number | null {
  const cm2 = ctx.geo.surfaceArea?.cm2;
  if (!cm2) return null;
  // A laminate is laid on one face of the tool, so the mould-side area is about
  // half the closed surface the kernel measures.
  return Math.round(cm2 / 2 / 10_000 * 1000) / 1000;
}

/**
 * Where each system cures, and the bed it cures on (usable length × width, m).
 * An autoclave or oven cures a LOAD of tools; an RTM part cures in its die on
 * the press, one at a time. The screen used to batch 4 to a cure and headless
 * did not cost composites at all.
 */
export const CURE_CELLS: Record<string, { machineId: string; bedM: [number, number] | null; label: string }> = {
  'prepreg-cf': { machineId: 'autoclave-1200mm', bedM: [2.8, 1.0], label: '1200 mm autoclave' },
  'prepreg-gf': { machineId: 'oven-composite-cure', bedM: [3.0, 2.0], label: 'cure oven' },
  'infusion-gf': { machineId: 'oven-composite-cure', bedM: [3.0, 2.0], label: 'cure oven (post-cure on the tool)' },
  'rtm-gf': { machineId: 'rtm-press-std', bedM: null, label: 'RTM press — cures in the die' },
};
/** Tool flange around the part on a layup tool, each side, m. */
const TOOL_MARGIN_M = 0.05;
/** Hours a year a layup tool can work: two shifts. */
export const COMP_TOOL_HOURS = 4000;
export const COMP_OEE = 0.80;
/** Debag, demould, clean and release-coat a tool between parts, hr — sizes the tools in service only (the
 *  labour of it is NOT costed: see the arithmetic audit, composites-rubber.md, finding C7). */
const TOOL_TURNAROUND_HR = 0.5;
/** Waterjet trim: load and fixture, then the outline at a cutting speed. Engineering-typical, not sourced. */
const TRIM_LOAD_HR = 0.1;
const TRIM_M_PER_MIN = 1.5;
/** Most tools one autoclave / oven load is costed with (the bed can fit more of a small part). */
export const MAX_PARTS_PER_CURE = 20;
/** Reject allowance the rules set (porosity, delamination, dimensional) — engineering-typical, not sourced. */
export const COMP_REJECT = 0.04;

// ─── Process choice: layup + cure cell, or prepreg compression moulding (report-standard research, Nov 2026) ───────

/** The engineer's (or the route comparison's) choice of composites process — an answer, never asked by the rules. */
export const COMPOSITES_PROCESS_CHOICE_ID = 'composites.processChoice';
export type CompositesProcessChoice = 'layup' | 'pcm';
export const COMPOSITES_PROCESS_LABEL: Record<CompositesProcessChoice, string> = {
  layup: 'Prepreg layup + cure cell',
  pcm: 'Prepreg compression moulding (PCM)',
};

/**
 * Prepreg compression moulding — the same prepreg (so the same material family), pressed in a heated matched steel die.
 * Every figure from data.json [id]; CompositesWorld rows were read through a fetch tool.
 */
export const PCM = {
  /** "The molding cycle in a hydraulic compression press is 8 minutes at 140°C, using 8 MPa forming pressure" — the only
   *  published total PCM cycle (Mitsubishi Rayon, Nissan GT-R decklid; CompositesWorld, Jun 2015) [VR-1, fetch tool]. */
  pressCycleMin: 8,
  /** "takt times of 3 minutes or less for small to medium parts using automotive prepregs" (Solvay; CompositesWorld,
   *  May 2020) [VR-3, fetch tool] — costed when the resin system is answered fast-cure. */
  fastCureTaktMin: 3,
  /** Preforming "< 5 min" (1 min heat to 60–70 °C, 0.3 MPa form) [VR-1] — the upper bound, laminator time. */
  preformMin: 5,
  /** Forming pressure, MPa [VR-1]: press force = this × the measured plan area. */
  pressureMPa: 8,
  /** Parts a tool a year the source reports: 50,000 (5-min-cure prepreg) to 84,000 (3-min-cure) [VR-1] — a cross-check. */
  annualPerTool: [50_000, 84_000] as [number, number],
  /** The library's hydraulic composites press (Langzauner awards — tonnage not stated in the book). */
  machineId: 'rtm-press-std',
} as const;

/** Prepreg autoclave above this many parts a year carries a route alert — the industry quote's ceiling of prepreg's
 *  sweet spot (Huntsman, ACMA Composites Manufacturing, Jul 2016) [VR-4]. Not a judgement: the number is the quote's. */
export const AUTOCLAVE_VOLUME_ALERT = 25_000;
export const AUTOCLAVE_VOLUME_ALERT_TEXT = 'ROUTE ALERT (industry quote): prepreg in an autoclave is a low-volume route — '
  + '"Around 20,000 to 25,000 parts per year on a single production line such as the Corvette roof" is prepreg\'s sweet spot and '
  + '"In automotive, you haven\'t reached high volume until about 100,000 parts" (Huntsman, in ACMA Composites Manufacturing, '
  + '"Fast-cure Prepreg is Making Inroads", Jul 2016). Compare prepreg compression moulding (PCM) in the route comparison';

/** The route alert for a costing, or null below the threshold / off the autoclave route. */
export function compositesRouteAlert(annualVolume: number, cureMachineId: string, process: CompositeProcess): string | null {
  if (process !== 'prepreg_layup' || !/autoclave/.test(cureMachineId) || !(annualVolume > AUTOCLAVE_VOLUME_ALERT)) return null;
  return `${annualVolume.toLocaleString('en-GB')} a year is above ${AUTOCLAVE_VOLUME_ALERT.toLocaleString('en-GB')}. ${AUTOCLAVE_VOLUME_ALERT_TEXT}`;
}

/** Cure cells (autoclaves / ovens / presses) the volume implies, with its arithmetic — the same formula the report's
 *  capacity table uses (annual × cycle a part ÷ OEE ÷ the machine's annual hours, the cycle carrying the reject allowance). */
export function cureCellsImplied(annualVolume: number, cureHr: number, perCure: number, machineId: string): { n: number; basis: string } {
  const m = activeRates().machines.find(x => x.id === machineId);
  const hours = m?.buildup?.annualAvailableHours ?? COMP_TOOL_HOURS;
  const perPart = cureHr / Math.max(1, perCure) / (1 - COMP_REJECT);
  const n = annualVolume * perPart / COMP_OEE / hours;
  const what = /autoclave/.test(machineId) ? 'autoclave' : /oven/.test(machineId) ? 'oven' : 'press';
  const plural = (w: string) => (w === 'press' ? 'presses' : `${w}s`);
  return { n, basis: `${plural(what)} implied: ${annualVolume.toLocaleString('en-GB')}/yr × ${cureHr} h ÷ ${perCure} a load ÷ (1 − ${COMP_REJECT} reject) `
    + `÷ ${COMP_OEE} OEE ÷ ${hours.toLocaleString('en-GB')} h a year (rate book) = ${n.toFixed(1)} ${n >= 1.05 ? plural(what) : what}` };
}

/** What a composites costing does NOT price, for the report's "Not included" list (each with its reason). */
export interface CompositesNotCosted { item: string; reason: string }

/**
 * Ultrasonic C-scan of structural carbon as a STATION — time × rates — not a flat £ (arithmetic audit, Oct 2026).
 * It was "£25 a part (UK)", unsourced: £26.04 of the hat stiffener's £34.15 material bucket, on a 0.08 m² part. An
 * automated scan costs the time the part spends in the cell: load, register and unload, then the laminate area at a
 * scan rate. Every figure is ENGINEERING-TYPICAL and printed as such: research robotic phased-array cells report scan
 * rates of the order of 25 m²/h with conventional beamforming (not verified against a paper here); the cell's £/h is a
 * ~£400k robot PAUT cell over 10 yr at 4,000 h (£10/h) + 50 % for maintenance, couplant and power. The inspector is
 * the costed country's `lab-uk-inspector` role; the cell's £/h is UK basis × the country's inspection factor.
 */
export const NDI_STATION = { scanM2PerHr: 25, loadUnloadSec: 60, manning: 1, cellGbpPerHrUk: 15 } as const;

/** The C-scan station's £ a part on `areaM2` of laminate, in the costed country, with its arithmetic. */
export function ndiStationCost(areaM2: number): { gbp: number; basis: string } {
  const st = NDI_STATION;
  const inspector = activeLabourRate('lab-uk-inspector');
  const cell = st.cellGbpPerHrUk * countryFactor('inspection');
  const loadHr = st.loadUnloadSec / 3600, scanHr = areaM2 / st.scanM2PerHr;
  const hr = loadHr + scanHr;
  const perHr = inspector * st.manning + cell;
  // To 4 dp, not the UK penny: a value rounded to £0.01 broke its own printed arithmetic once converted (¥7.67 printed,
  // ¥7.64 costed — 7-country review, 3 Nov 2026).
  const gbp = Math.round(hr * perHr * 10_000) / 10_000;
  return {
    gbp,
    basis: `structural carbon: ultrasonic C-scan station — ${st.loadUnloadSec} s load and unload (${loadHr.toFixed(4)} h) `
      + `+ ${fmt(areaM2, 3)} m² scanned at ${st.scanM2PerHr} m²/h (${scanHr.toFixed(4)} h) = ${hr.toFixed(4)} h, at `
      + `£${perHr.toFixed(2)}/h (inspector £${inspector.toFixed(2)}/h × ${st.manning} + cell £${cell.toFixed(2)}/h) `
      + `= £${gbp.toFixed(4)} (engineering-typical station figures, not sourced; `
      + `charged in the material bucket as a per-part service, as casting NDT is)${countryNote('inspection')}`,
  };
}

/** Parts on one cure load: tools (plan + flange) across the bed. */
export function partsPerCure(lM: number, wM: number, bed: [number, number] | null): { n: number; basis: string } {
  if (!bed) return { n: 1, basis: 'cures in its own die, one part a press cycle' };
  const a = lM + 2 * TOOL_MARGIN_M, b = wM + 2 * TOOL_MARGIN_M;
  const fit = (x: number, y: number) => Math.floor(bed[0] / x) * Math.floor(bed[1] / y);
  const fits = Math.max(fit(a, b), fit(b, a));
  const n = Math.min(MAX_PARTS_PER_CURE, fits);
  if (n < 1) return { n: 1, basis: `a ${a.toFixed(2)} × ${b.toFixed(2)} m tool does not fit the ${bed[0]} × ${bed[1]} m bed — costed one to a load; a larger cure cell is needed` };
  return { n, basis: `${n} tools of ${a.toFixed(2)} × ${b.toFixed(2)} m on the ${bed[0]} × ${bed[1]} m bed`
    + (fits > n ? ` (${fits} fit; capped at ${MAX_PARTS_PER_CURE} a load — engineering-typical, not sourced)` : '')
    + ` — each part carries 1/${n} of the cure` };
}

interface CompAdvice {
  system: LaminateSystem;
  /** The process costed: the laminate's own, or PCM when answered. */
  process: CompositeProcess;
  choice: CompositesProcessChoice;
  resin: ResinSystem;
  resinAnswered: boolean;
  massKg: number;
  fibrePrice: number;
  resinPrice: number;
  basis: string;
  wallMm: number;
  wallBasis: string;
  plies: number;
  pliesBasis: string;
  areaM2: number;
  layupHr: number;
  layupBasis: string;
  cureHr: number;
  cureBasis: string;
  planM2: number;
  planBasis: string;
  cureMachineId: string;
  cureLabel: string;
  cureMachineBasis: string;
  perCure: number;
  perCureBasis: string;
  cells: number;
  cellsBasis: string;
  tools: number;
  toolsBasis: string;
  tool: ToolChoice;
  trimHr: number;
  trimBasis: string;
  ndi: number;
  ndiBasis: string;
  alert: string | null;
  notCosted: CompositesNotCosted[];
}

function envelopeAsk(): RuleOutcome<never> {
  return ask({
    id: 'composites.envelope', kind: 'geometry_gap',
    question: 'What is the laminate thickness and the moulded area?',
    why: 'No wall thickness or surface area was measured, so the ply count and the '
      + 'layup hours cannot be derived — and layup is most of the labour.',
    options: [{ value: 'enter', label: 'Enter laminate thickness and area' }],
    entry: { kind: 'number' },
    blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
  });
}

/** A prepreg system: the fibre £/kg buys the resin too, and it can be laid up OR compression moulded. */
const isPrepreg = (s: LaminateSystem) => s.resinId === null && s.process === 'prepreg_layup';

function advise(ctx: RuleContext): { advice: CompAdvice } | { blocked: RuleOutcome<never> } {
  const lam = laminateFacts(ctx);
  if (lam.decision) return { blocked: ask(lam.decision) };

  // 2·V/S, the area-mean laminate thickness: the ray mean reads across an
  // open shell's cavity (the same fault the moulding reviews found).
  const w = shellWallMm(ctx.geo);
  const areaM2 = laminateAreaM2(ctx);
  const plan = planAreaCm2(ctx);
  const d = bboxSortedMm(ctx);
  if (!w || !areaM2 || !plan || !d) return { blocked: envelopeAsk() };
  const wallMm = Math.round(w.mm * 100) / 100;

  const s = lam.system!;
  const prepreg = isPrepreg(s);
  // PCM is a prepreg process: on a dry-fabric laminate the answer is not one this laminate can take, and is ignored.
  const choice: CompositesProcessChoice = prepreg && ctx.answers[COMPOSITES_PROCESS_CHOICE_ID] === 'pcm' ? 'pcm' : 'layup';
  const pcm = choice === 'pcm';
  const process: CompositeProcess = pcm ? 'prepreg_compression' : s.process;
  const { resin, answered: resinAnswered } = resinSystemOf(ctx.answers);
  const notCosted: CompositesNotCosted[] = [];
  const p = plyCount(wallMm, s);

  // ── Layup: a prepreg at the published hand-layup mass rate; dry fabric at its (unsourced) area rate ───────────────
  let layupHr: number, layupBasis: string;
  if (prepreg) {
    const plyKgM2 = s.plyThicknessMm * s.densityKgPerM3 / 1000;
    const laidKg = areaM2 * p.n * plyKgM2;
    const stackHr = laidKg / HAND_LAYUP_KG_PER_HR;
    const preformHr = pcm ? PCM.preformMin / 60 : 0;
    layupHr = Math.round((stackHr + preformHr) * 1000) / 1000;
    layupBasis = `HAND LAYUP costed: ${fmt(areaM2, 3)} m² × ${p.n} plies × ${fmt(plyKgM2, 4)} kg/m² a ply (${s.plyThicknessMm} mm × `
      + `${s.densityKgPerM3} kg/m³) = ${fmt(laidKg, 4)} kg laid ÷ ${fmt(HAND_LAYUP_KG_PER_HR, 3)} kg/h (2 lb/h) = ${fmt(stackHr, 3)} h`
      + (pcm ? ` + preform ${PCM.preformMin} min (≤ ${PCM.preformMin} min, CompositesWorld Jun 2015 [VR-1], fetch tool — the preform `
        + `station's heater and press time is NOT costed, no rate in the book) = ${layupHr} h — a flat stack, which is what the published rate measured`
        : ' — the published rate is for a flat charge, so on a shaped tool it is an upper bound (the part takes longer)')
      + `. Source: ${LAYUP_RATE_SOURCE}. Tape laying (${fmt(ATL_KG_PER_HR, 1)} kg/h, same source) is NOT costed: `
      + (pcm ? 'the tape-laying cell\'s capital is not sourced in the rate book'
        : 'it lays a flat charge, a shaped part then needs a forming step with no published rate, and the tape-laying cell\'s capital '
          + 'is not sourced in the rate book')
      + (s.value !== 'prepreg-cf' ? '; the rate was measured on carbon/epoxy prepreg and is applied to this prepreg as an analogue' : '');
  } else {
    layupHr = Math.round(areaM2 * p.n * s.layupHrPerM2PerPly * 1000) / 1000;
    layupBasis = `${fmt(areaM2, 3)} m² × ${p.n} plies × ${s.layupHrPerM2PerPly} hr/m²/ply for ${s.label} = ${layupHr} h (dry-fabric `
      + `preforming rate engineering-typical, not sourced — no published rate was found: it lays `
      + `${fmt(s.plyThicknessMm * s.densityKgPerM3 / 1000 / s.layupHrPerM2PerPly, 1)} kg of laminate an hour)`;
  }

  // ── Cure: the press cycle (PCM), the resin system's published autoclave schedule, or the cell's unsourced cycle ────
  const cell = pcm ? { machineId: PCM.machineId, bedM: null, label: 'heated hydraulic compression press — cures in the matched die' }
    : CURE_CELLS[s.value];
  let cureHr: number, cureBasis: string;
  if (pcm) {
    const fast = resin === 'fast-cure' && resinAnswered;
    const min = fast ? PCM.fastCureTaktMin : PCM.pressCycleMin;
    cureHr = Math.round(min / 60 * 10_000) / 10_000;
    cureBasis = fast
      ? `PCM press takt ${min} min with a fast-cure automotive prepreg — "takt times of 3 minutes or less for small to medium parts using `
        + 'automotive prepregs" (Solvay, CompositesWorld May 2020 [VR-3], fetch tool)'
      : `PCM press cycle ${min} min at 140 °C, 8 MPa — "The molding cycle in a hydraulic compression press is 8 minutes at 140°C" `
        + '(Mitsubishi Rayon PCM, CompositesWorld Jun 2015 [VR-1], fetch tool; the only published total PCM cycle — a 3-min takt is '
        + `costed when the resin system is answered fast-cure)${resin === 'epoxy-180' && resinAnswered ? '. A 180 °C aerospace epoxy is not a press-cure prepreg; the published PCM cycle is costed' : ''}`;
    cureBasis += `; ${min} min = ${cureHr} h. The prepreg priced is the library grade — a PCM-grade prepreg price is not separately sourced`;
  } else if (/autoclave/.test(cell.machineId) && prepreg) {
    const c = autoclaveCure(resin);
    cureHr = c.hr;
    cureBasis = `resin system ${resinAnswered ? 'answered' : 'costed (unanswered: an autoclave prepreg is costed as the 180 °C aerospace system '
      + 'its laminate option names; answer composites.resinSystem "fast-cure" for the 23-min M77 cycle)'}: ${c.basis}`
      + (c.lowHr !== c.highHr ? `; range ${c.lowHr}–${c.highHr} h` : '')
      + (/125\s*°C/.test(String(activeRates().materials.find(m => m.id === s.fibreId)?.grade ?? ''))
        ? '. NOTE: the library prepreg priced is a 125 °C-cure grade; no published cure schedule for that grade was read' : '');
  } else {
    cureHr = s.cureHr;
    cureBasis = `${s.label} cure cycle including ramp and dwell (engineering-typical, not sourced — no published schedule was read for it)`;
  }
  cureBasis += `; the cure operator is charged ${CURE_ATTENDANCE * 100} % of each part's share of it — load, check, unload`;

  const cure = partsPerCure(d[0] / 1000, d[1] / 1000, cell.bedM);
  const forceKn = PCM.pressureMPa * plan.cm2 / 10_000 * 1000;
  const cureMachineBasis = pcm
    ? `PCM cures in a heated hydraulic compression press: ${PCM.pressureMPa} MPa forming pressure [VR-1] × ${fmt(plan.cm2 / 10_000, 4)} m² `
      + `measured plan (${plan.basis}) = ${fmt(forceKn, 0)} kN (${fmt(forceKn / 9.80665, 0)} t) press force; costed on the library's hydraulic `
      + 'composites press, whose tonnage the rate book does not state — confirm the press against this force'
    : `${s.label} cures in the ${cell.label}`;

  // Tools the volume needs: a layup tool is tied up through layup, cure and turnaround; a PCM die only through the press
  // cycle (the preform is made on its own preform tool). The module bought only as many as tool LIFE demanded.
  const toolCycleHr = pcm ? cureHr : layupHr + cureHr + TOOL_TURNAROUND_HR;
  const needed = ctx.annualVolume * toolCycleHr / (COMP_TOOL_HOURS * COMP_OEE);
  const tools = Math.max(1, Math.ceil(needed));
  const toolsBasis = (pcm
    ? `${ctx.annualVolume.toLocaleString('en-GB')}/yr × ${cureHr} h a die is in the press`
    : `${ctx.annualVolume.toLocaleString('en-GB')}/yr × ${toolCycleHr.toFixed(2)} h a tool is tied up `
      + `(layup ${layupHr.toFixed(2)} + cure ${cureHr} + turnaround ${TOOL_TURNAROUND_HR})`)
    + ` ÷ (${COMP_TOOL_HOURS} h × ${COMP_OEE} OEE) = ${needed.toFixed(2)} → ${tools} tool${tools === 1 ? '' : 's'}`
    + (pcm ? ` (${Math.round(COMP_TOOL_HOURS * COMP_OEE / cureHr).toLocaleString('en-GB')} parts a die a year; the source reports `
      + `${PCM.annualPerTool[0].toLocaleString('en-GB')}–${PCM.annualPerTool[1].toLocaleString('en-GB')} with 5- and 3-min-cure prepregs [VR-1])` : '');
  const tool = chooseToolMaterial(process, amortisationParts(ctx), tools);
  if (tool.notCosted) notCosted.push({ item: tool.notCosted, reason: 'no published cycle life for a metal layup tool' });

  const cells = cureCellsImplied(ctx.annualVolume, cureHr, cure.n, cell.machineId);
  const alert = compositesRouteAlert(ctx.annualVolume, cell.machineId, process);
  if (prepreg && !pcm) {
    notCosted.push({ item: 'Vacuum-bag consumables (bag film, breather, peel ply, sealant)', reason: 'no published price was found — needs a distributor price list' });
    notCosted.push({ item: 'Autoclave load, pressurise and unload time beyond the datasheet cure schedule', reason: 'no published figure' });
  }
  if (pcm) notCosted.push({ item: 'PCM preform station (heater + 0.3 MPa forming press) machine time and preform tool', reason: 'no rate in the book; the 5-min preform is charged as laminator time' });

  const perimM = 2 * (d[0] + d[1]) / 1000;
  const trimHr = Math.round((TRIM_LOAD_HR + perimM / TRIM_M_PER_MIN / 60) * 1000) / 1000;
  const trimBasis = `5-axis waterjet: ${TRIM_LOAD_HR} h load and fixture + ${perimM.toFixed(2)} m bounding-box perimeter `
    + `2(L+W) at ${TRIM_M_PER_MIN} m/min = ${trimHr} h (engineering-typical, not sourced)`;
  // Structural carbon is ultrasonically scanned; glass covers are not.
  const ndi = s.value === 'prepreg-cf' ? ndiStationCost(areaM2)
    : { gbp: 0, basis: 'glass laminate: no ultrasonic scan costed (a visual check is not costed separately)' };

  return {
    advice: {
      system: s, process, choice, resin, resinAnswered, massKg: lam.massKg!,
      fibrePrice: lam.fibrePricePerKg!, resinPrice: lam.resinPricePerKg!,
      basis: lam.basis, wallMm, wallBasis: w.basis,
      plies: p.n, pliesBasis: p.basis,
      areaM2, layupHr, layupBasis, cureHr, cureBasis,
      planM2: plan.cm2 / 10_000, planBasis: plan.basis,
      cureMachineId: cell.machineId, cureLabel: cell.label, cureMachineBasis,
      perCure: cure.n, perCureBasis: cure.basis, cells: cells.n, cellsBasis: cells.basis,
      tools, toolsBasis, tool, trimHr, trimBasis,
      ndi: ndi.gbp, ndiBasis: ndi.basis, alert, notCosted,
    },
  };
}

/**
 * What this costing does NOT price (the report's "Not included" list): metal layup tool resurfacing, bag consumables,
 * autoclave handling time, the PCM preform station. Empty while the laminate is unanswered.
 */
export function compositesNotCosted(ctx: RuleContext): CompositesNotCosted[] {
  const r = advise(ctx);
  return 'blocked' in r ? [] : r.advice.notCosted;
}

/** The route alert for this costing (prepreg autoclave above 25,000 a year), or null. */
export function compositesAlert(ctx: RuleContext): string | null {
  const r = advise(ctx);
  return 'blocked' in r ? null : r.advice.alert;
}

type Src = 'geometry' | 'rule' | 'library' | 'advisor' | 'engineer';
function fromAdvice<T extends string | number | boolean>(
  id: string, fieldId: string | undefined, label: string,
  pick: (a: CompAdvice) => { value: T; source: Src; basis: string; confidence: number },
) {
  return {
    id, path: id, ...(fieldId ? { fieldId } : {}), label,
    evaluate: (ctx: RuleContext) => {
      const r = advise(ctx);
      if ('blocked' in r) return r.blocked;
      const v = pick(r.advice);
      return decided(id, v.value, v.source, v.basis, v.confidence);
    },
  };
}

export const COMPOSITES_RULES: CommodityRuleSpec = {
  commodity: 'composites',
  header: 'COMPOSITES COST INPUT RULES:',
  rules: [
    {
      id: 'composites.process',
      path: 'composites.process',
      fieldId: 'comp-process',
      label: 'process',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        return decided('composites.process', a.process, 'engineer',
          (a.choice === 'pcm'
            ? `${COMPOSITES_PROCESS_LABEL.pcm} of ${a.system.label.replace(/, autoclave$/, '')} — answered (or the route comparison's row): `
              + 'the same prepreg pressed in a heated matched steel die'
            : `${a.system.label} — ${a.system.note}`)
          + (a.alert ? `. ${a.alert}` : ''), 1);
      },
    },
    {
      id: 'composites.fibrePricePerKg',
      path: 'composites.fibrePricePerKg',
      fieldId: 'comp-fibre-price',
      label: 'fibrePricePerKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.fibrePricePerKg', r.advice.fibrePrice, 'library',
          `${materialGradeName(r.advice.system.fibreId, ctx.rates)} list price`, 0.9);
      },
    },
    {
      id: 'composites.resinPricePerKg',
      path: 'composites.resinPricePerKg',
      fieldId: 'comp-resin-price',
      label: 'resinPricePerKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.resinPricePerKg', r.advice.resinPrice, 'library',
          r.advice.system.resinId
            ? `${materialGradeName(r.advice.system.resinId, ctx.rates)} list price`
            : 'prepreg arrives impregnated — there is no separate resin buy', 0.9);
      },
    },
    {
      id: 'composites.partWeightKg',
      path: 'composites.partWeightKg',
      fieldId: 'comp-part-wt',
      label: 'partWeightKg',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.partWeightKg', r.advice.massKg, 'geometry', r.advice.basis, 0.9);
      },
    },
    {
      id: 'composites.fibreWeightFraction',
      path: 'composites.fibreWeightFraction',
      fieldId: 'comp-fibre-frac',
      label: 'fibreWeightFraction',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.fibreWeightFraction', r.advice.system.fibreWeightFraction, 'library',
          `${r.advice.system.label} consolidates to this fibre mass fraction`, 0.75);
      },
    },
    {
      id: 'composites.wasteFraction',
      path: 'composites.wasteFraction',
      fieldId: 'comp-waste-frac',
      label: 'wasteFraction',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.wasteFraction', r.advice.system.wasteFraction, 'library',
          `${r.advice.system.label}: nested ply cutting and trim offcuts`, 0.7);
      },
    },
    {
      // THE PLY FIX. The prompt asked the model to guess a number the kernel
      // has already measured.
      id: 'composites.plies',
      path: 'composites.plies',
      fieldId: 'comp-plies',
      label: 'plies',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.plies', r.advice.plies, 'geometry', r.advice.pliesBasis, 0.8);
      },
    },
    {
      id: 'composites.areaM2',
      path: 'composites.areaM2',
      fieldId: 'comp-area',
      label: 'areaM2',
      evaluate: (ctx) => {
        const a = laminateAreaM2(ctx);
        if (a === null) return ask({
          id: 'composites.envelope', kind: 'geometry_gap',
          question: 'What is the laminate thickness and the moulded area?',
          why: 'No surface area was measured.',
          options: [{ value: 'enter', label: 'Enter laminate thickness and area' }],
          entry: { kind: 'number' },
          blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking',
        });
        return decided('composites.areaM2', a, 'geometry',
          `${(ctx.geo.surfaceArea?.cm2 ?? 0).toFixed(0)} cm² measured surface, halved — `
          + 'plies cover the mould side only', 0.75);
      },
    },
    {
      id: 'composites.layupTimeHrPerPart',
      path: 'composites.layupTimeHrPerPart',
      fieldId: 'comp-layup-time',
      label: 'layupTimeHrPerPart',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.layupTimeHrPerPart', r.advice.layupHr, 'rule', r.advice.layupBasis, 0.6);
      },
    },
    {
      id: 'composites.cureTimeHr',
      path: 'composites.cureTimeHr',
      fieldId: 'comp-cure-time',
      label: 'cureTimeHr',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        return decided('composites.cureTimeHr', r.advice.cureHr, 'library', r.advice.cureBasis, 0.7);
      },
    },
    {
      id: 'composites.toolingCost',
      path: 'composites.toolingCost',
      fieldId: 'comp-tool-cost',
      label: 'toolingCostGBP',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const a = r.advice;
        const rate = TOOL_RATE_PER_M2[a.process];
        // The tool is sized to the part's footprint, not its laminated area — a
        // deep part covers more cloth than it occupies on the shop floor.
        const footprintM2 = a.planM2;
        // Built where the part is made: × the country's toolroom factor (1 in the UK).
        const tf = activeToolroomFactor();
        const ukGbp = rate.base + footprintM2 * rate.perM2;
        const total = Math.round(ukGbp * tf);
        // The chain in full, the country's toolroom factor printed every time (UK 1.00) — it was printed only when not
        // 1, after the plan × rate, so "base + plan × rate × factor" read as if the base were not scaled (report
        // standard round, Nov 2026). The plan is cm² to 0.1 (5 dp in m²), so both equations hold as printed.
        const money = (n: number, dp = 0) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
        return decided('composites.toolingCost', total, 'rule',
          `${a.process === 'prepreg_compression' ? 'PCM matched steel die, priced on the RTM matched-die build-up (no PCM tool price was found)'
            : `${a.process} tool`}: ${money(rate.base)} base + ${fmt(footprintM2, 5)} m² plan × ${money(rate.perM2)}/m² = ${money(ukGbp, 2)} UK; `
          + `${money(ukGbp, 2)} × ${factorText('toolroom', tf)} = ${money(total)} a tool `
          + `(plan: ${a.planBasis}; engineering-typical rates, not sourced; the same price whatever the tool material)`, 0.55);
      },
    },
    {
      id: 'composites.toolingLife',
      path: 'composites.toolingLife',
      fieldId: 'comp-tool-life',
      label: 'toolingLife',
      evaluate: (ctx) => {
        const r = advise(ctx);
        if ('blocked' in r) return r.blocked;
        const t = r.advice.tool;
        return decided('composites.toolingLife', t.life, 'rule', t.basis, t.material && COMP_TOOL_LIFE[t.material].life !== null ? 0.7 : 0.5);
      },
    },
    fromAdvice('composites.cureMachineId', 'comp-cure-mach', 'cureMachineId', a => ({
      value: a.cureMachineId, source: 'rule', confidence: 0.7, basis: a.cureMachineBasis })),
    fromAdvice('composites.partsPerCureCycle', 'comp-cure-batch', 'partsPerCureCycle', a => ({
      value: a.perCure, source: 'rule', confidence: 0.6, basis: `${a.perCureBasis}; ${a.cellsBasis}` })),
    fromAdvice('composites.toolsInService', 'comp-tools', 'toolsInService', a => ({
      value: a.tools, source: 'rule', confidence: 0.6, basis: a.toolsBasis })),
    fromAdvice('composites.trimMachineId', 'comp-trim-mach', 'trimMachineId', () => ({
      value: 'waterjet-5ax-composite', source: 'rule', confidence: 0.7, basis: 'laminates are trimmed and drilled on a 5-axis waterjet — no delamination, no tool wear' })),
    fromAdvice('composites.trimTimeHr', 'comp-trim-time', 'trimTimeHr', a => ({
      value: a.trimHr, source: 'rule', confidence: 0.55, basis: a.trimBasis })),
    fromAdvice('composites.ndiCostPerPart', 'comp-ndi', 'ndiCostPerPart', a => ({
      value: a.ndi, source: 'rule', confidence: 0.5,
      basis: a.ndiBasis })),
    fromAdvice('composites.layupLabourId', 'comp-layup-lab', 'layupLabourId', () => ({
      value: 'lab-uk-skilled', source: 'library', confidence: 0.7, basis: 'skilled laminator' })),
    fromAdvice('composites.cureLabourId', 'comp-cure-lab', 'cureLabourId', () => ({
      value: 'lab-uk-semiskilled', source: 'library', confidence: 0.7, basis: 'loads, checks and unloads the cure' })),
    fromAdvice('composites.trimLabourId', 'comp-trim-lab', 'trimLabourId', () => ({
      value: 'lab-uk-semiskilled', source: 'library', confidence: 0.7, basis: 'waterjet operator' })),
    fromAdvice('composites.manning', 'comp-manning', 'manning', () => ({
      value: 1, source: 'rule', confidence: 0.6, basis: 'the layup hours are laminator-hours — one laminator per hour of them' })),
    fromAdvice('composites.oee', 'comp-oee', 'oee', () => ({
      value: COMP_OEE, source: 'rule', confidence: 0.6, basis: 'shop OEE, as every route' })),
    fromAdvice('composites.labourEfficiency', 'comp-lab-eff', 'labourEfficiency', () => ({
      value: 0.92, source: 'rule', confidence: 0.6, basis: 'shop labour efficiency, as every route' })),
    fromAdvice('composites.rejectRate', 'comp-reject', 'rejectRate', () => ({
      value: COMP_REJECT, source: 'rule', confidence: 0.55, basis: `porosity, delamination, dimensional: ${COMP_REJECT * 100}% (engineering-typical, not sourced)` })),
  ],
};
