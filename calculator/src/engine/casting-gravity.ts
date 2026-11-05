/**
 * Gravity die casting (permanent mould, tilt-pour) — the die cycle, the cell crew, the die life and the impressions, from
 * the research round of 5 Nov 2026 (scripts/research/2026-11-gravity-lpdc/data.json + notes.md; every row there carries
 * its URL, an exact quote and a grade). Each figure the rules print names its row; where the FIT between sources is a
 * judgement the basis says "engineering-typical". Low-pressure die casting was researched in the same round and is NOT
 * modelled (deferred).
 *
 * Grades: A published price / award / standard; B peer-reviewed, government, textbook, trade press; C vendor claim or
 * dealer list price; D our inference.
 */
import { fmt } from './cost-input-rules/types.js';

/** The research rows the gravity rules cite, in one line each (data.json ids). */
export const GRAVITY_SOURCES = {
  G1: 'G1 — Foundry Management & Technology (Vondriska, 2016): an 8-station turntable\'s "typical mechanical dry cycle is 75 seconds/station" (C)',
  G2: 'G2 — FMT (Hall, 2009): a single tilt-pour machine "12-30 cycles per hour" (2–5 min a die cycle); an indexing rotary table with tending robots run by one operator (C)',
  G3: 'G3 — Foundry-Planet (Gauss cell, Wuling, 2011): 11 cylinder heads an hour a machine, one operator "operates on four machines" (C)',
  G4: 'G4 — MIRAE 2(2) 2025: small motorcycle accessory castings, 3.0 min a part on a manual station → 1.24 min mechanised (B)',
  G5: 'G5 — Bonollo et al., La Metallurgia Italiana 6/2005: gravity die 0.15 h a casting for 6 kg and 13 kg castings, yield 0.80 / 0.73 (B)',
  D1: 'D1 — Made-in-China (WuXi JingJie): H13 / P20 gravity mould for a motorcycle caliper US$3,800 a set (C; cavities and slides not stated)',
  D3: 'D3 — Degarmo et al. (2003) via Wikipedia: permanent-mould life "10,000 to 120,000 cycles"; H13 "several times greater" than grey iron (B)',
  D5: 'D5 — US DOE / CWRU–AFS fact sheet (1999): wrought H13 is the best mould material in thermal fatigue; "selection … depends on the number of castings" (B)',
  K5: 'K5 — Made-in-China (Quanzhou Jingda): tilting gravity machine with robot pouring, US$19,000–19,800, max mould 250 kg (C)',
} as const;

// ── 1. Die cycle ────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The die cycle (one die opening; castings a cycle = impressions) from the metal poured a die opening and the governing
 * section 2·V/S:
 *
 *   t_mass    = 3.0 min at ≤ 3.0 kg poured, rising linearly to 4.8 min at 7.5 kg poured (flat above)
 *   t_section = 3.0 min × (2·V/S ÷ 10 mm)²          (Chvorinov: freezing time ∝ section²)
 *   die cycle = min(9.0 min, max(t_mass, t_section))
 *
 * Anchors — the small-part figure: G4's 3.0 min a small motorcycle casting on a manual station, inside G2's 2–5 min
 * single-machine band; 3 kg poured is a ≤ 2 kg casting at the 0.6–0.65 yields (the research's "≤ 2 kg" small class).
 * The large-part figure: the book's former flat 0.08 h = 4.8 min, which the research matches to G5's 6 kg casting
 * (7.5 kg poured at its 0.80 yield), G3's 5.5 min cored cylinder heads and the 5 min top of G2's band. The ceiling is
 * G5's 0.15 h = 9 min, the slowest gravity figure read. That the section term is pinned at 3.0 min for a 10 mm section,
 * and that the two terms combine by their maximum, is a judgement — engineering-typical, not sourced (no source gives
 * the section of G2 / G4's castings).
 */
export const GRAVITY_CYCLE = {
  smallPourKg: 3.0, smallMin: 3.0,
  largePourKg: 7.5, largeMin: 4.8,
  sectionRefMm: 10, sectionRefMin: 3.0,
  maxMin: 9.0,
} as const;

export interface GravityDieCycle {
  /** Minutes a die opening. */
  min: number;
  /** Hours a die opening (what the module charges, ÷ impressions as parts a cycle). */
  hr: number;
  massMin: number;
  sectionMin: number | null;
  /** Which term set the cycle: 'mass' | 'section' | 'ceiling'. */
  governs: 'mass' | 'section' | 'ceiling';
  text: string;
}

export function gravityDieCycle(pourKgPerOpening: number, sectionMm: number | null): GravityDieCycle {
  const C = GRAVITY_CYCLE;
  const pour = Math.max(0, pourKgPerOpening);
  const f = Math.min(1, Math.max(0, (pour - C.smallPourKg) / (C.largePourKg - C.smallPourKg)));
  const massMin = C.smallMin + (C.largeMin - C.smallMin) * f;
  const sectionMin = sectionMm != null && sectionMm > 0 ? C.sectionRefMin * (sectionMm / C.sectionRefMm) ** 2 : null;
  const raw = Math.max(massMin, sectionMin ?? 0);
  const min = Math.min(C.maxMin, raw);
  const governs: GravityDieCycle['governs'] = raw > C.maxMin ? 'ceiling' : (sectionMin ?? 0) > massMin ? 'section' : 'mass';
  // hours to 6 dp (the screen writes the field so — formatRuleValue), the text from the rounded figures it re-does
  const hr = Math.round(min / 60 * 1e6) / 1e6;
  const massText = f <= 0 ? `${fmt(pour, 3)} kg poured ≤ ${C.smallPourKg} kg → ${C.smallMin} min`
    : f >= 1 ? `${fmt(pour, 3)} kg poured ≥ ${C.largePourKg} kg → ${C.largeMin} min`
    : `${C.smallMin} + (${C.largeMin} − ${C.smallMin}) × (${fmt(pour, 3)} − ${C.smallPourKg}) ÷ (${C.largePourKg} − ${C.smallPourKg}) = ${fmt(massMin, 3)} min`;
  const secText = sectionMin == null ? 'no section measured'
    : `${C.sectionRefMin} × (${fmt(sectionMm!, 2)} ÷ ${C.sectionRefMm})² = ${fmt(sectionMin, 3)} min`;
  const text = `die cycle = min(${C.maxMin}, max(t_mass, t_section)): t_mass ${massText} (anchors: ${C.smallMin} min a small casting — `
    + `${GRAVITY_SOURCES.G4}; ${GRAVITY_SOURCES.G2} — and ${C.largeMin} min, the former 0.08 h book figure, which matches `
    + `${GRAVITY_SOURCES.G5} and ${GRAVITY_SOURCES.G3}); t_section ${secText} (Chvorinov — freezing ∝ section², the casting `
    + `modulus 2·V/S); the ${C.maxMin} min ceiling is G5's 0.15 h. Linear between the mass anchors, ${C.sectionRefMin} min at a `
    + `${C.sectionRefMm} mm section and the max of the two: engineering-typical, not sourced → ${fmt(min, 3)} min (${governs === 'ceiling' ? 'the ceiling' : `the ${governs} term`} `
    + `governs) = ${hr} h a die opening`;
  return { min, hr, massMin, sectionMin, governs, text };
}

// ── 2. Cell crew ────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The gravity cell, by annual volume. A manual tilt-pour cell (hand-ladled, an operator between two machines) below
 * `GRAVITY_AUTO_CELL_MIN_CASTINGS` a year; a multi-machine cell (dosing / robot ladle, extraction portal, one operator to
 * four machines) at or above it.
 */
export const GRAVITY_CELLS = {
  manual: {
    id: 'manual', crew: 0.5,
    label: 'manual tilt-pour cell (hand-ladled)',
    crewBasis: 'one operator between two tilt machines — the upper end of the research\'s ¼–½ operator a machine; no source '
      + 'states a hand-ladled cell\'s crew (engineering-typical, not sourced)',
  },
  automated: {
    id: 'automated', crew: 0.25,
    label: 'multi-machine gravity cell (dosing / robot ladle, extraction portal)',
    crewBasis: `one operator to four machines — ${GRAVITY_SOURCES.G3}; a robot-tended rotary table is one operator a table (${GRAVITY_SOURCES.G2})`,
  },
} as const;
export type GravityCellId = keyof typeof GRAVITY_CELLS;
/** CostVision engineering judgement, not sourced — no source gives a volume at which a foundry automates a gravity cell. */
export const GRAVITY_AUTO_CELL_MIN_CASTINGS = 50_000;
/** What the multi-machine cell's machine rate does NOT carry (research §3 gap 4: no published price was read). */
export const GRAVITY_AUTO_CELL_NOT_PRICED = 'the robot ladle / dosing unit, holding furnace and extraction portal are NOT priced — '
  + 'the machine rate is one tilt machine\'s (no published price for them was read; research gap 4)';

export function gravityCellFor(annualCastings: number): { cell: (typeof GRAVITY_CELLS)[GravityCellId]; why: string } {
  const n = Math.max(0, annualCastings || 0);
  const auto = n >= GRAVITY_AUTO_CELL_MIN_CASTINGS;
  const cell = auto ? GRAVITY_CELLS.automated : GRAVITY_CELLS.manual;
  const why = `${n.toLocaleString('en-GB')} castings a year ${auto ? '≥' : '<'} ${GRAVITY_AUTO_CELL_MIN_CASTINGS.toLocaleString('en-GB')} `
    + `(the threshold is CostVision engineering judgement, not sourced) → a ${cell.label}`;
  return { cell, why };
}

// ── 3. Die material and life — ONE decision ─────────────────────────────────────────────────────────────────────────
/**
 * The die is priced in H13 (the toolmaker build-up's cavity blocks, casting-tooling.ts) and lasts as H13 does: 100,000 die
 * cycles a cavity, the upper half of D3's 10,000–120,000 — H13 lasts "several times" grey iron (D3) and is the best in
 * thermal fatigue (D5); the choice of 100,000 is our inference (grade D). The life assumes the die is maintained —
 * re-nitrided, coating touched up, cavity inserts replaced — and NO source gives that maintenance's cost (research gap 3),
 * so it is not priced.
 */
export const GRAVITY_DIE = {
  material: 'h13' as const,
  lifeDieCycles: 100_000,
  lifeBasis: `H13 die, 100,000 die cycles a cavity — the upper half of ${GRAVITY_SOURCES.D3}; ${GRAVITY_SOURCES.D5}; the choice `
    + 'of 100,000 is our inference (grade D)',
  maintenanceNotPriced: 'mid-life maintenance (re-nitriding, coating touch-up, cavity inserts) is assumed done and NOT priced — '
    + 'no source gives its cost (research gap 3)',
} as const;

// ── 4. Impressions ──────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Two impressions fit a gravity die when the 2-up die is no heavier than the tilt machine takes and its face is no larger
 * than `faceMm`. The 60 % plate rule is a green-sand match-plate rule (DISA) and does not apply to a permanent die.
 */
export const GRAVITY_IMPRESSION_LIMITS = {
  maxMouldKg: 250,
  maxMouldBasis: `the tilt machine's maximum mould, ${GRAVITY_SOURCES.K5}`,
  faceMm: [800, 600] as const,
  faceBasis: 'die face up to 800 × 600 mm — CostVision engineering heuristic, not sourced (no tilt machine\'s platen size was read)',
  marginMm: 50,
} as const;

export interface GravityImpressionFit { fits: boolean; text: string }

/** Whether `n` impressions fit: the die's steel mass (both halves, all cavities) and the n-up face. */
export function gravityImpressionsFit(n: number, footprintMm: [number, number] | null, dieSteelKg: number): GravityImpressionFit {
  const L = GRAVITY_IMPRESSION_LIMITS;
  if (n <= 1) return { fits: true, text: 'one impression' };
  if (!footprintMm) return { fits: false, text: `${n} impressions not checked — no footprint measured; one costed` };
  const [a, b] = footprintMm.map(x => x + L.marginMm);
  const [FL, FW] = L.faceMm;
  const side = (x: number, y: number) => (n * x <= FL && y <= FW) || (n * x <= FW && y <= FL);
  const faceOk = side(a, b) || side(b, a);
  const massOk = dieSteelKg <= L.maxMouldKg;
  const text = `${n} impressions of ${fmt(footprintMm[0], 0)} × ${fmt(footprintMm[1], 0)} mm (+${L.marginMm} mm a side, engineering-typical) `
    + `${faceOk ? 'fit' : 'do not fit'} the ${FL} × ${FW} mm die face (${L.faceBasis}); the ${n}-up die's steel ${fmt(dieSteelKg, 1)} kg `
    + `${massOk ? '≤' : '>'} ${L.maxMouldKg} kg (${L.maxMouldBasis})`;
  return { fits: faceOk && massOk, text };
}
