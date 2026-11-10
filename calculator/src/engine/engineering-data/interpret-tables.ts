/**
 * The interpretation tables — every mapping from what a drawing WRITES to the form an existing engine question takes,
 * in one place, each row with where it comes from (offline 2D drawing intelligence, Layer 3).
 *
 * How to read a row's `certainty`:
 *  - `by-name`    the standard's own class name or number is the answer (ISO 1328 class 7 → "7"; EN 10243-1 grade E
 *                 "close" → tight). Standards were NOT re-read in this build: the class names are as commonly cited, and
 *                 a person should check them against the standard's text before a report quotes one.
 *  - `by-label`   the reading falls inside the range the engine's own option label states ("Tight — ±0.1–0.5 mm").
 *  - `judgement`  ENGINEERING JUDGEMENT. The engine's three tolerance classes, its coating routes and its hardening
 *                 routes are the cost model's own vocabulary, not a standard's, so a standard's class maps onto them
 *                 only by judgement. Such a reading is always `needs-validation`.
 *
 * Whatever the certainty, an interpreted value is only ever a LEANING until the engineer confirms it. A text no row
 * recognises produces nothing: an unknown designation, standard or coating never becomes a value.
 *
 * Data and pattern matching only; no cost formula.
 */
import type { ToleranceClass } from '../modules/casting-advisor.js';
import type { HardeningRoute } from '../modules/gear-advisor.js';

export type Certainty = 'by-name' | 'by-label' | 'judgement';

// ─── General tolerance → the `service.toleranceClass` options ─────────────────────────────────────────────────────

export interface ToleranceRule {
  id: string;
  /** The standard or notation the row reads. */
  standard: string;
  pattern: RegExp;
  /** The engine class for a match, or null when this notation states a class the engine has no place for. */
  classOf: (m: RegExpExecArray) => ToleranceClass | null;
  certainty: Certainty;
  /** Printed in the parameter's note. */
  basis: string;
  /** The class as the standard writes it, for the note ("DCTG 9", "ISO 2768-m"). */
  written: (m: RegExpExecArray) => string;
}

/**
 * The engine's classes (derive/service-context.ts::toleranceClassDecision — the same strings, checked by a test):
 *   loose    "general as-cast" — sand casting viable
 *   standard "the usual route for the alloy"
 *   tight    "±0.1–0.5 mm" — investment casting or added machining
 * Only "tight" carries a figure, so only a reading inside ±0.5 mm maps `by-label`.
 */

/** ISO 8062-3 casting tolerance grade → class. Band edges are ENGINEERING JUDGEMENT (see the row's basis). */
export const DCTG_BANDS = { tightMax: 6, standardMax: 10 } as const;
export function classOfCastingGrade(n: number): ToleranceClass | null {
  if (!Number.isInteger(n) || n < 1 || n > 16) return null;
  return n <= DCTG_BANDS.tightMax ? 'tight' : n <= DCTG_BANDS.standardMax ? 'standard' : 'loose';
}

/** The widest ± (mm) the "tight" option's own label covers. */
export const TIGHT_LABEL_MAX_MM = 0.5;

/** Most specific first: a process tolerance (casting, forging) outranks a machining general tolerance on the same note. */
export const TOLERANCE_RULES: readonly ToleranceRule[] = [
  {
    id: 'iso8062-dctg', standard: 'ISO 8062-3 (casting tolerance grade DCTG) / ISO 8062:1994 (CT)',
    pattern: /\b(?:DCTG|CT)\s*-?\s*(\d{1,2})\b/i,
    classOf: m => classOfCastingGrade(Number(m[1])),
    certainty: 'judgement',
    written: m => `DCTG ${Number(m[1])}`,
    basis: `ISO 8062-3 casting tolerance grade: DCTG 1–${DCTG_BANDS.tightMax} → tight, ${DCTG_BANDS.tightMax + 1}–${DCTG_BANDS.standardMax} → standard, `
      + `${DCTG_BANDS.standardMax + 1}–16 → loose. ENGINEERING JUDGEMENT: the bands follow the processes the standard's informative annex `
      + 'associates with each grade (investment and pressure die casting at the fine end, machine-moulded sand in the middle, '
      + 'hand-moulded sand at the coarse end), set against the engine\'s own class descriptions. The annex was not re-read in this build.',
  },
  {
    id: 'en10243-grade', standard: 'EN 10243-1 (steel die forgings) / DIN 7526 forging grade',
    pattern: /\b(?:EN\s*10243(?:\s*-\s*[12])?|DIN\s*7526)\b[^A-Za-z0-9]{0,6}(?:(?:grade|g[üu]te|klasse|schmiedeg[üu]te|toleran\w*)\s*)*([FE])\b/i,
    classOf: m => (m[1].toUpperCase() === 'E' ? 'tight' : 'standard'),
    certainty: 'by-name',
    written: m => `forging grade ${m[1].toUpperCase()}`,
    basis: 'EN 10243-1 forging grade: F (the standard\'s normal grade) → standard, E (its close-tolerance grade) → tight — the standard\'s own '
      + 'two grade names, as commonly cited (not re-read in this build).',
  },
  {
    id: 'explicit-plus-minus', standard: 'a single stated general tolerance ("± 0.2")',
    // one ± figure in the whole note; a block of several (".XX ±.01  .XXX ±.005") is not read (see GENERAL_TOLERANCE_NOT_MAPPED)
    pattern: /(?:±|\+\s*\/\s*-|\+-)\s*(\d*[.,]?\d+)\s*(mm|in|")?/i,
    classOf: () => null,          // decided in interpret.ts: needs the drawing's units
    certainty: 'by-label',
    written: m => `±${m[1]}${m[2] ?? ''}`,
    basis: `a stated general tolerance within ±${TIGHT_LABEL_MAX_MM} mm is the engine's "tight" class by that option's own label (±0.1–0.5 mm). `
      + 'A wider figure is NOT mapped: the engine states no boundary between "standard" and "loose".',
  },
];

/** Notations that are recognised and deliberately NOT mapped, with the reason printed to the engineer. */
export const GENERAL_TOLERANCE_NOT_MAPPED: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  // ISO 2768 used to answer the question (f / m → tight, c → standard, v → loose). The question is asked on cast and forged
  // routes only and asks the AS-CAST / AS-FORGED tolerance (it decides investment v sand casting); ISO 2768-1 covers
  // dimensions made by metal removal or formed from sheet, so on those routes it governs the machined features. The default
  // title-block note "ISO 2768-mK" therefore pushed a casting toward investment casting (independent validation, 10 Nov 2026).
  { pattern: /\bISO\s*2768\b/i, why: 'ISO 2768-1 sets the tolerances of machined and sheet-metal dimensions; the question here is the as-cast / '
    + 'as-forged tolerance (ISO 8062-3 DCTG for castings, EN 10243-1 grade for forgings), which this note does not state — choose the class' },
  { pattern: /\bDIN\s*7168\b/i, why: 'DIN 7168 (withdrawn; replaced by ISO 2768-1) sets the tolerances of machined dimensions; the question here is '
    + 'the as-cast / as-forged tolerance, which this note does not state — choose the class' },
  { pattern: /\bVDG\s*P\s*69\d\b/i, why: 'VDG P 690 (investment casting accuracy grades): no defensible mapping to the engine\'s three classes — choose the class' },
  { pattern: /\bDIN\s*16(?:80|83|84|85|86|87|88)\b|\bGT[AB]\s*\d+/i, why: 'DIN 1680–1688 casting tolerances (GTA / GTB): withdrawn series with no defensible mapping here — choose the class' },
  { pattern: /\bISO\s*20457\b|\bDIN\s*16742\b|\bDIN\s*16901\b/i, why: 'a plastics moulding tolerance standard: no route that asks the tolerance class moulds plastics' },
  { pattern: /\bISO\s*13920\b/i, why: 'ISO 13920 (welded constructions): no route asks a tolerance class for a welded fabrication' },
  { pattern: /\.X{1,4}\b|\bX\.X{1,4}\b|(?:±|\+\s*\/\s*-)[^±+]*(?:±|\+\s*\/\s*-)/i, why: 'a block of several tolerances by decimal places: which one governs the process is the engineer\'s reading — choose the class' },
];

// ─── Coating / plating text → the `service.finish` routes ─────────────────────────────────────────────────────────

export interface CoatingRule {
  /** A key of SURFACE_FINISH_ROUTES (surface-finish-routes.ts), checked by a test. */
  route: string;
  pattern: RegExp;
  /** A match of this pattern cancels the row (hard anodise is not the sulphuric anodise route). */
  unless?: RegExp;
  certainty: Certainty;
  basis: string;
}

/** Most specific first. Every route named here is one the existing finish question offers on some route and metal (checked by a test). */
export const COATING_RULES: readonly CoatingRule[] = [
  { route: 'zinc_nickel', pattern: /zinc[\s-]*nickel|\bZn\s*-?\s*Ni\b|ZnNi|ISO\s*19598/i, certainty: 'by-name',
    basis: 'zinc-nickel electroplate (ISO 19598 designation ZnNi) → the "Zinc-nickel + passivate" route' },
  { route: 'zinc_flake', pattern: /zinc[\s-]*flake|zinklamelle|\bflZn|\bgeomet(?![a-z])|\bdacromet(?![a-z])|delta[\s-]*(?:protekt|tone|seal)|\bzintek(?![a-z])|ISO\s*10683/i, certainty: 'by-name',
    basis: 'non-electrolytic zinc flake (ISO 10683 flZn, and the trade names Geomet / Dacromet / Delta-Protekt / Zintek — whole words: "geometric" is not Geomet) → the "Zinc flake dip-spin" route' },
  { route: 'galvanise', pattern: /hot[\s-]*dip(?:ped)?[\s-]*galvani[sz]|hot[\s-]*dip(?:ped)?[\s-]*zinc|\bHDG\b|feuerverzink|ISO\s*1461|\btZn/i, certainty: 'by-name',
    basis: 'hot dip galvanising (ISO 1461, tZn) → the "Hot dip galvanise" route' },
  { route: 'zinc_plate', pattern: /electro[\s-]*(?:zinc|galvani[sz])|zinc[\s-]*(?:electro[\s-]*)?plat|\bZn[\s-]*plat|galvanisch[\s-]*verzinkt|Fe\s*\/\/?\s*Zn\s*\d|ISO\s*2081|\bZn\s*\d{1,2}\b/i, certainty: 'by-name',
    basis: 'electroplated zinc (ISO 2081 designation Fe//Zn…) → the "Zinc plate + passivate" route' },
  { route: 'e_coat', pattern: /\be[\s-]*coat|electro[\s-]*coat|\bKTL\b|\bCED\b|cataphor|kataphor|electrophoretic|cathodic[\s-]*(?:dip|electro)/i, certainty: 'by-name',
    basis: 'cathodic electro-deposition (e-coat, KTL, CED, cataphoresis) → the "E-coat / KTL" route' },
  { route: 'powder_coat_zn', pattern: /powder[\s\S]{0,60}zinc[\s-]*phosphat|zinc[\s-]*phosphat[\s\S]{0,60}powder/i, certainty: 'by-name',
    basis: 'powder coat over a zinc phosphate pre-treatment, both stated → the "Powder coat (zinc phosphate pre-treat)" route' },
  { route: 'powder_coat', pattern: /powder[\s-]*(?:coat|paint)|pulverbeschicht|\bEPS\b(?=[^.;\n]{0,24}\b(?:coat\w*|RAL|powder|finish)\b)/i, certainty: 'judgement',
    basis: 'powder coat with no pre-treatment stated → the "Powder coat (iron phosphate pre-treat)" route. ENGINEERING JUDGEMENT: the drawing '
      + 'does not name the pre-treatment; the zinc phosphate route is the other choice where it is offered.' },
  { route: 'anodise', pattern: /anodi[sz]|eloxal|eloxier|ISO\s*7599|MIL[\s-]*A[\s-]*8625|\bAA\s*\d{1,2}\b/i, unless: /hard[\s-]*anodi|hartelox|hard[\s-]*coat|type\s*III\b/i, certainty: 'by-name',
    basis: 'sulphuric anodising (ISO 7599 class AA…) → the "Sulphuric anodise" route' },
  { route: 'mass_finish', pattern: /vibratory|vibro[\s-]*finish|mass[\s-]*finish|tumbl|barrel[\s-]*(?:finish|deburr)|gleitschleif/i, certainty: 'by-name',
    basis: 'vibratory / barrel mass finishing → the "Vibratory mass finish (deburr)" route' },
];

/** Finishes that are recognised and have NO route in the existing finish question — never mapped, always stated. */
export const COATING_NOT_MAPPED: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /hard[\s-]*anodi|hartelox|hard[\s-]*coat|type\s*III\b/i, why: 'hard anodising is not the sulphuric anodise route (coating-drawing-read.ts) — no route for it' },
  { pattern: /\bpaint|lacquer|primer|top[\s-]*coat|base[\s-]*coat|clear[\s-]*coat|lackier|\bRAL\s*\d{4}\b(?![\s\S]*powder)/i, why: 'wet paint is costed by the Painting commodity; the finish question has no paint route' },
  { pattern: /black[\s-]*oxide|br[üu]nier|blacken/i, why: 'black oxide has no route in the finish question' },
  { pattern: /chrom(?:e|ium)[\s-]*plat|hard[\s-]*chrom|verchrom/i, why: 'chromium plating has no route in the finish question' },
  { pattern: /nickel[\s-]*plat|electroless[\s-]*nickel|\bENP\b|vernickel/i, why: 'nickel plating has no route in the finish question' },
  { pattern: /\btin[\s-]*plat|verzinnt/i, why: 'tin plating has no route in the finish question' },
  { pattern: /phosphat/i, why: 'phosphating on its own (no top coat) has no route in the finish question' },
  { pattern: /passivat|chromat|alodine|surtec|conversion[\s-]*coat/i, why: 'a conversion coating / passivation on its own has no route in the finish question' },
  { pattern: /shot[\s-]*blast|grit[\s-]*blast|sand[\s-]*blast|bead[\s-]*blast|gestrahlt/i,
    why: 'blasting on its own is not offered by the finish question: a casting is already shot-blasted and a forging descaled by its own rules (surface-finish-routes.ts)' },
];

// ─── Heat-treatment text → aluminium casting temper and gear hardening route ─────────────────────────────────────

/** The options of `casting.heatTreat` (cost-input-rules/commodities/casting.ts::alHeatTreatDecision), checked by a test. */
export const AL_CASTING_TEMPERS = ['T6', 'T5', 'F'] as const;
export type AlCastingTemper = typeof AL_CASTING_TEMPERS[number];

export interface TemperRule { temper: AlCastingTemper; pattern: RegExp; certainty: Certainty; basis: string }

/** EN 1706 / EN 515 temper designations of an aluminium casting. */
export const AL_TEMPER_RULES: readonly TemperRule[] = [
  { temper: 'T6', pattern: /(?<![A-Za-z0-9])T6(?![0-9])|solution[\s-]*(?:heat[\s-]*)?treat\w*[\s\S]{0,40}(?:artificial\w*[\s-]*)?age|l[öo]sungsgegl[üu]ht[\s\S]{0,30}warmausgelagert/i, certainty: 'by-name',
    basis: 'temper T6 (solution heat treated and artificially aged — EN 1706 temper designation) → the "T6" option' },
  { temper: 'T5', pattern: /(?<![A-Za-z0-9])T5(?![0-9])|artificial\w*[\s-]*aged?[\s-]*only|controlled[\s-]*cool\w*[\s\S]{0,30}artificial\w*[\s-]*age/i, certainty: 'by-name',
    basis: 'temper T5 (cooled from casting and artificially aged — EN 1706) → the "T5" option' },
  { temper: 'F', pattern: /(?<![A-Za-z0-9])as[\s-]*cast(?![A-Za-z])|temper[\s:-]*F\b|\bF[\s-]*temper|no[\s-]*heat[\s-]*treat|not[\s-]*heat[\s-]*treated|gusszustand/i, certainty: 'by-name',
    basis: 'temper F (as cast, no heat treatment — EN 1706) → the "F" option' },
];

/** Tempers that are recognised and are not one of the three options. */
export const AL_TEMPER_NOT_MAPPED: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /(?<![A-Za-z0-9])T7(?![0-9])|over[\s-]*aged?/i, why: 'T7 (over-aged) is not an option of the casting heat-treat question (T6, T5, F) — choose the nearest, or leave it open' },
  { pattern: /(?<![A-Za-z0-9])T4(?![0-9])|natural\w*[\s-]*aged?/i, why: 'T4 (naturally aged) is not an option of the casting heat-treat question (T6, T5, F)' },
  { pattern: /(?<![A-Za-z0-9])T64(?![0-9])/i, why: 'T64 (under-aged) is not an option of the casting heat-treat question (T6, T5, F)' },
];

/** The gear hardening routes, typed against the engine's own union so a route added there fails the build here. */
export const GEAR_HARDENING_ROUTES = {
  none: true, case_hardening: true, lpc_carburising: true, carbonitriding: true, quench_temper: true, martempering: true,
  austempering: true, nitriding: true, fnc: true, induction_hardening: true,
} as const satisfies Record<HardeningRoute, true>;

export interface HardeningRule { route: HardeningRoute; pattern: RegExp; certainty: Certainty; basis: string }

/** Most specific first (low-pressure carburising before carburising; nitrocarburising before nitriding). */
export const HARDENING_RULES: readonly HardeningRule[] = [
  { route: 'lpc_carburising', pattern: /low[\s-]*pressure[\s-]*carburi[sz]|vacuum[\s-]*carburi[sz]|\bLPC\b|niederdruck[\s-]*aufkohl/i, certainty: 'by-name',
    basis: 'low-pressure (vacuum) carburising → the "Low-pressure (vacuum) carburise" route' },
  { route: 'carbonitriding', pattern: /carbo[\s-]*nitrid|carbonitrier/i, certainty: 'by-name', basis: 'carbonitriding → the "Carbonitride" route' },
  { route: 'fnc', pattern: /nitro[\s-]*carburi[sz]|\bFNC\b|tenifer|tufftride|\bQPQ\b|nitrocarburier/i, certainty: 'by-name',
    basis: 'ferritic nitrocarburising (FNC; trade names Tenifer / Tufftride / QPQ) → the "Ferritic nitrocarburise" route' },
  { route: 'nitriding', pattern: /nitrid|nitrier/i, certainty: 'by-name', basis: 'nitriding (gas or plasma) → the "Nitride" route' },
  { route: 'induction_hardening', pattern: /induction[\s-]*harden|induktiv\w*[\s-]*geh[äa]rtet|induktionsh[äa]rt/i, certainty: 'by-name',
    basis: 'induction hardening → the "Induction harden" route' },
  { route: 'case_hardening', pattern: /case[\s-]*harden|carburi[sz]|einsatzgeh[äa]rtet|einsatzh[äa]rt|\bCHD\b|\bEht\b/i, certainty: 'by-name',
    basis: 'case hardening / carburising (case depth CHD, Eht) → the "Carburise, quench and temper" route' },
  { route: 'martempering', pattern: /martemper|marquench|warmbadh[äa]rt/i, certainty: 'by-name', basis: 'martempering → the "Martemper (hot-oil quench)" route' },
  { route: 'austempering', pattern: /austemper|bainiti/i, certainty: 'by-name', basis: 'austempering → the "Austemper (bainitic)" route' },
  { route: 'quench_temper', pattern: /quench\w*[\s-]*(?:and|&|\+)[\s-]*temper|\bQ\s*(?:&|\+|and)\s*T\b|\bQT\b|harden\w*[\s-]*(?:and|&|\+)[\s-]*temper|through[\s-]*harden|verg[üu]tet/i, certainty: 'by-name',
    basis: 'quenched and tempered / through hardened → the "Harden and temper (through)" route' },
  { route: 'none', pattern: /no[\s-]*heat[\s-]*treat|not[\s-]*harden|unharden|soft[\s-]*(?:state|condition)|ungeh[äa]rtet/i, certainty: 'by-name',
    basis: 'no hardening stated → the "Leave soft" route' },
];

// ─── Gear quality → the ISO 1328 class number of `gear.qualityClass` ──────────────────────────────────────────────

export interface GearQualityRule { id: string; pattern: RegExp; classOf: (m: RegExpExecArray) => number; certainty: Certainty; basis: string }

/** The class numbers the engine accepts (cost-input-rules/commodities/gear.ts::answeredQuality: 1–11). */
export const GEAR_CLASS_RANGE = { min: 1, max: 11 } as const;

export const GEAR_QUALITY_RULES: readonly GearQualityRule[] = [
  { id: 'iso1328', pattern: /ISO\s*1328(?:\s*-\s*[12])?(?:\s*:\s*\d{4})?\D{0,25}?(\d{1,2})(?![0-9.])/i, classOf: m => Number(m[1]), certainty: 'by-name',
    basis: 'ISO 1328 flank tolerance class, the number as written — the question asks for exactly this' },
  { id: 'din396x', pattern: /DIN\s*39(?:61|62|63|67)\D{0,25}?(\d{1,2})(?![0-9.])/i, classOf: m => Number(m[1]), certainty: 'judgement',
    basis: 'DIN 3961–3967 gear quality read as the same-numbered ISO 1328 class. ENGINEERING JUDGEMENT: the two series are numbered alike '
      + 'but their tolerance values are not identical.' },
  { id: 'agma-q', pattern: /AGMA[^Q]{0,25}?\bQ\s*(\d{1,2})\b/i, classOf: m => 17 - Number(m[1]), certainty: 'judgement',
    basis: 'AGMA 2000-A88 quality number Q read as ISO 1328 class 17 − Q. ENGINEERING JUDGEMENT: a commonly used approximation, not an '
      + 'equivalence in either standard.' },
];

// ─── Notes → the service flags ────────────────────────────────────────────────────────────────────────────────────

/** A note that states a leak or pressure requirement. */
export const LEAK_NOTE_RE = /leak[\s-]*(?:test|tight|proof|rate|free)|leakage|pressure[\s-]*(?:test|tight|proof)|helium[\s-]*(?:leak|test)|air[\s-]*decay|dichtheit|druckpr[üu]f|druckdicht/i;
/** A note that says there is NO such requirement — never read as a requirement. */
export const LEAK_NEGATION_RE = /no[\s-]*(?:leak|pressure)[\s-]*test|not[\s-]*(?:leak|pressure)[\s-]*tested|(?:leak|pressure)[\s-]*test\w*[\s-]*not[\s-]*required/i;

/** A note or marking that designates a safety / critical characteristic. */
export const SAFETY_NOTE_RE = /safety[\s-]*(?:critical|relevant|part|characteristic|component)|critical[\s-]*characteristic|special[\s-]*characteristic|sicherheitsteil|sicherheitsrelevant|dokumentationspflicht|\bD\s*\/\s*TLD\b|\bTLD\b/i;

/** An impregnation note; and its negation. */
export const IMPREGNATION_RE = /impregnat|impr[äa]gnier/i;
export const IMPREGNATION_NEGATION_RE = /no[\s-]*impregnat|without[\s-]*impregnat|impregnat\w*[\s-]*(?:is[\s-]*)?(?:not[\s-]*(?:permitted|allowed|permissible)|prohibited|forbidden)|nicht[\s-]*impr[äa]gnier/i;

// ─── Company specification codes ──────────────────────────────────────────────────────────────────────────────────

/**
 * One row of the company specification lookup (server/data/spec-lookup.json). The company supplies the table; a code
 * that is not in it is NEVER given a meaning.
 */
export interface SpecLookupEntry {
  /** The designation the code stands for, as a material standard writes it ("EN-GJS-500-7"). */
  designation: string;
  /** The standard that designation belongs to ("EN 1563"). */
  standard?: string;
  note?: string;
  /** Who said so, and when ("Materials Engineering, specification register rev. 12, 2026-11"). Required. */
  source: string;
}
export type SpecLookup = Readonly<Record<string, SpecLookupEntry>>;

/** The lookup table from the JSON file's content: `{ "entries": { "<code>": { designation, standard?, note?, source } } }`. */
export function parseSpecLookup(json: unknown): SpecLookup {
  const entries = json && typeof json === 'object' ? (json as { entries?: unknown }).entries : null;
  const out: Record<string, SpecLookupEntry> = {};
  if (!entries || typeof entries !== 'object') return out;
  for (const [code, raw] of Object.entries(entries as Record<string, unknown>)) {
    const e = raw as Partial<SpecLookupEntry> | null;
    // A row without a designation or without a source is not a fact — it is skipped, never half-used.
    if (!e || typeof e.designation !== 'string' || !e.designation.trim() || typeof e.source !== 'string' || !e.source.trim()) continue;
    out[code.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g, '')] = {
      designation: e.designation.trim(), source: e.source.trim(),
      ...(typeof e.standard === 'string' && e.standard.trim() ? { standard: e.standard.trim() } : {}),
      ...(typeof e.note === 'string' && e.note.trim() ? { note: e.note.trim() } : {}),
    };
  }
  return out;
}

// ─── Cast aluminium: EN 1706 designations the rate book holds under their US / BS names ─────────────────────────────

/**
 * EN 1706 cast aluminium designations that name a rate-book grade held under its US / BS name. The engine's stem matcher
 * reads "AlSi7Mg0.3" (EN AC-42100, the A356 alloy) as A357 (AlSi7Mg0.6) through the shared "AlSi7Mg" stem, and finds no
 * grade at all for "EN AC-42100" (independent validation, 10 Nov 2026). Only designations whose chemical limits ARE the
 * library grade's alloy are listed: EN AC-42100 AlSi7Mg0.3 and ASTM A356 both hold Mg 0.25–0.45 %; EN AC-42200 AlSi7Mg0.6
 * and A357 both Mg 0.45–0.70 %. EN AC-42000 (AlSi7Mg) is NOT listed: the rate book has two grades it could be (LM25 / A356
 * gravity, A365 / AlSi7Mg die cast) — the engine's matcher and the engineer choose. Equivalences as commonly cross-referenced
 * (EN 1706 / ASTM B26 / B108), not re-read in this build.
 */
export const CAST_AL_DESIGNATIONS: ReadonlyArray<{ pattern: RegExp; gradeId: string; written: string }> = [
  { pattern: /\bEN\s*AC\s*-?\s*42100\b|\bAlSi7Mg0[.,]3\b/i, gradeId: 'mat-lm25', written: 'EN AC-42100 (AlSi7Mg0.3) = A356' },
  { pattern: /\bEN\s*AC\s*-?\s*42200\b|\bAlSi7Mg0[.,]6\b/i, gradeId: 'mat-a357', written: 'EN AC-42200 (AlSi7Mg0.6) = A357' },
];

// ─── A designation's family by its standard's own numbering (the text is a material reading, not a file name) ─────

/**
 * Designation systems whose FORM names the family, read only from a material reading (a material cell or a material
 * note), never from a file name or free text. Added by the independent validation (10 Nov 2026): "5052", "S235JR", "Q235",
 * "45#" named no family, so a correct reading answered nothing. Each row is the standard's own numbering:
 * - Aluminium Association / EN 573 wrought 4-digit numbers 1xxx–8xxx (optional A, temper H/T/O/F), cast 3-digit.x ("356.0");
 * - EN 10025 / EN 10027 structural and engineering steel names (S235JR, S355J2, E295, P265GH, DC01…DC06, DX51D, C45E, 42CrMo4);
 * - GB / T 700 & 1591 carbon and low-alloy steels (Q195–Q690), GB/T 699 "45#" / "45钢", GB/T 3077 40Cr;
 * - JIS G 3101 / 4051 (SS400, S45C, SPCC, SPHC);
 * - copper alloys by name (CuZn…, CW…N, C2xxxx brass numbers are NOT read — they collide with part numbers).
 * Certainty 'by-name': the numbering is the standard's; the row names a family only, never a grade.
 */
export const DESIGNATION_FAMILY_RULES: ReadonlyArray<{ pattern: RegExp; family: 'aluminium' | 'steel' | 'copper alloy'; system: string }> = [
  { pattern: /^(?:(?:AL|ALU|ALUMINIUM|ALUMINUM|AA|EN\s*AW)\s*[-\s]?)?[1-8]\d{3}A?(?:\s*[-\s]?\s*(?:[HT]\s*-?\s*\d{1,4}|O|F))?(?:\s*(?:铝|ALLOY|ALUMINIUM|ALUMINUM|AL))?$/i, family: 'aluminium', system: 'Aluminium Association / EN 573 wrought 4-digit number' },
  { pattern: /^(?:S|E|P)\d{3}(?:[A-Z]{1,3}\d?)?(?:\+[A-Z]+)?$|^D[CDX]\d{2}[A-Z]?(?:\+[A-Z]+)?$/i, family: 'steel', system: 'EN 10027-1 steel name' },
  { pattern: /^Q(?:195|215|235|275|295|345|355|390|420|460|500|550|620|690)[A-E]?$/i, family: 'steel', system: 'GB/T 700 / GB/T 1591 steel grade' },
  { pattern: /^(?:10|15|20|25|30|35|40|45|50|55|60|65)\s*(?:#|钢)$|^\d{2}(?:Cr|Mn|CrMo|CrNiMo|MnB)\d?(?:钢)?$/i, family: 'steel', system: 'GB/T 699 / GB/T 3077 steel grade' },
  { pattern: /^(?:SS[34]00|S\d{2}C|SPCC|SPHC|SPCD|SPCE|SCM\d{3}|SUS\d{3}L?)$/i, family: 'steel', system: 'JIS steel grade' },
];
