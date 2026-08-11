// ─────────────────────────────────────────────────────────────────────────────
// DIN 16742:2013-10 — "Kunststoff-Formteile — Toleranzen und
// Abnahmebedingungen / Plastics moulded parts — Tolerances and acceptance
// conditions" — PINNED. Read FIRST-HAND from the user's copy (36 pages,
// bilingual German/English; the replacement for the withdrawn DIN 16901).
//
// This is the document the register named as the blocker on the injection-
// moulding tolerance rule — the tolerance tables the plastics industry
// actually quotes against. It carries:
//   * Table 1  — tolerance groups TG1-TG9 mapped to ISO 286 IT grades
//                (layout information only; Table 2 is the applicable table)
//   * Table 2  — plastic moulded part tolerances as symmetrical limit
//                dimensions (±) for sizes, TG1-TG9 x 16 nominal size bands,
//                tool-specific (W) and non-tool-specific (NW) columns
//   * Tables 3-8 — the TG selection point system (process, stiffness,
//                shrinkage, shrinkage knowledge, production expense)
//   * Table 9  — position tolerances (cylindrical zones) per TG and DP
//   * Table 10 — general tolerances for profile forms per DP dimension
//   * Annex C  — orientation assignment of moulding compounds to tolerance
//                series columns A-F, and Table C.1 mapping series x column
//                to the TG
//   * Annex G  — a printed worked example: TG4, DP = 84,13 mm → dimensional
//                tolerance ± 0,32 mm (Table 2 NW) and position Ø 0,9 mm
//                (Table 9 NW). The self-check the tests reproduce.
//
// Conventions, matching the other pinned standards:
//   * Judged at the NON-TOOL-SPECIFIC (NW) column — the looser of the two.
//     Doubly justified: the engine cannot tell whether a dimension crosses
//     tool parts, and Table 2 NOTE 5 prints "Only the limit values for
//     non-tool-specific dimensions are to be used for general tolerances."
//   * Grade selection is the Annex C orientation path at the LOOSEST printed
//     branch wherever a knowledge input (shrinkage compliance within ±10%,
//     anisotropy considered in contour dimensioning) is not an input of this
//     tool — what a first quotation can rely on without asking the moulder.
//   * Tolerance series: 'standard' → series 1 (normal production, the only
//     series valid for general tolerances per §5.2); 'precision' → series 2
//     (accurate production). Series 3 and 4 are "always subject to mandatory
//     agreement" (Table 8) and are refused rather than assumed.
//   * Dimensions under 1 mm and above 1000 mm are "subject to mandatory
//     agreement" (NOTE 4) — refuse, never extrapolate. '-' cells refuse.
//   * Rotational moulding is classified by the standard itself into TG9
//     (§7.1.1) — the one process whose grade needs no selection at all.
// ─────────────────────────────────────────────────────────────────────────────

const round3 = (v) => Math.round(v * 1000) / 1000;

// ── TABLE 2 (p.15): symmetrical limit dimensions (± mm) for sizes ───────────
// Bands are (over, upTo]; the first band starts at 1 mm. null = '-'.
export const DIN_SIZE_BANDS_MM = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500, 630, 800, 1000];
const TG_TABLE = {
  1: {
    w: [0.007, 0.012, 0.018, 0.022, 0.026, 0.031, 0.037, 0.044, null, null, null, null, null, null, null, null],
    nw: [0.012, 0.018, 0.022, 0.026, 0.031, 0.037, 0.044, 0.050, null, null, null, null, null, null, null, null],
  },
  2: {
    w: [0.013, 0.020, 0.029, 0.035, 0.042, 0.050, 0.060, 0.090, 0.13, 0.15, 0.16, 0.18, 0.20, null, null, null],
    nw: [0.020, 0.029, 0.035, 0.042, 0.050, 0.060, 0.090, 0.13, 0.15, 0.16, 0.18, 0.20, 0.22, null, null, null],
  },
  3: {
    w: [0.020, 0.031, 0.05, 0.06, 0.07, 0.08, 0.10, 0.15, 0.20, 0.23, 0.26, 0.29, 0.40, 0.55, 0.63, 0.70],
    nw: [0.031, 0.050, 0.06, 0.07, 0.08, 0.10, 0.15, 0.20, 0.23, 0.26, 0.29, 0.40, 0.55, 0.63, 0.70, 0.77],
  },
  4: {
    w: [0.03, 0.05, 0.08, 0.09, 0.11, 0.13, 0.15, 0.23, 0.32, 0.35, 0.41, 0.45, 0.63, 0.88, 1.00, 1.15],
    nw: [0.05, 0.08, 0.09, 0.11, 0.13, 0.15, 0.23, 0.32, 0.35, 0.41, 0.45, 0.63, 0.88, 1.00, 1.15, 1.30],
  },
  5: {
    w: [0.05, 0.08, 0.11, 0.14, 0.17, 0.20, 0.23, 0.36, 0.50, 0.58, 0.65, 0.70, 1.00, 1.40, 1.60, 1.80],
    nw: [0.08, 0.11, 0.14, 0.17, 0.20, 0.23, 0.36, 0.50, 0.58, 0.65, 0.70, 1.00, 1.40, 1.60, 1.80, 2.10],
  },
  6: {
    w: [0.07, 0.12, 0.18, 0.22, 0.26, 0.31, 0.37, 0.57, 0.80, 0.93, 1.05, 1.15, 1.60, 2.20, 2.50, 2.80],
    nw: [0.12, 0.18, 0.22, 0.26, 0.31, 0.37, 0.57, 0.80, 0.93, 1.05, 1.15, 1.60, 2.20, 2.50, 2.80, 3.10],
  },
  7: {
    w: [0.13, 0.20, 0.29, 0.35, 0.42, 0.50, 0.60, 0.90, 1.25, 1.45, 1.60, 1.80, 2.60, 3.50, 4.00, 4.50],
    nw: [0.20, 0.29, 0.35, 0.42, 0.50, 0.60, 0.90, 1.25, 1.45, 1.60, 1.80, 2.60, 3.50, 4.00, 4.50, 5.00],
  },
  8: {
    w: [0.20, 0.31, 0.45, 0.55, 0.65, 0.80, 0.95, 1.40, 2.00, 2.30, 2.60, 2.85, 4.00, 5.50, 6.25, 7.00],
    nw: [0.31, 0.45, 0.55, 0.65, 0.80, 0.95, 1.40, 2.00, 2.30, 2.60, 2.85, 4.00, 5.50, 6.25, 7.00, 7.75],
  },
  // TG9 prints one row: "The differentiation of tool-specific and
  // non-tool-specific dimension is not necessary for TG9" (NOTE 2).
  9: {
    w: [0.30, 0.49, 0.75, 0.90, 1.05, 1.25, 1.50, 2.25, 3.15, 3.60, 4.05, 4.45, 6.20, 8.50, 10.00, 11.50],
    nw: [0.30, 0.49, 0.75, 0.90, 1.05, 1.25, 1.50, 2.25, 3.15, 3.60, 4.05, 4.45, 6.20, 8.50, 10.00, 11.50],
  },
};

export function tgToleranceMm(dimensionMm, tg, { toolSpecific = false } = {}) {
  const d = Number(dimensionMm); const g = Number(tg);
  if (!(d > 0)) return { ok: false, reason: 'A dimensional tolerance needs the dimension it applies to.' };
  if (!TG_TABLE[g]) return { ok: false, reason: `TG${tg} is not a tolerance group Table 2 tabulates (TG1-TG9).` };
  if (d < 1) return { ok: false, reason: 'Dimensions under 1 mm are subject to mandatory agreement (Table 2, NOTE 4).' };
  if (d > 1000) return { ok: false, reason: 'Dimensions above 1000 mm are subject to mandatory agreement (Table 2, NOTE 4).' };
  const row = DIN_SIZE_BANDS_MM.findIndex((upTo) => d <= upTo);
  const col = toolSpecific ? 'w' : 'nw';
  const pm = TG_TABLE[g][col][row];
  if (pm === null) return { ok: false, reason: `Table 2 prints '-' for TG${g} at a ${round3(d)} mm size.` };
  return {
    ok: true, plusMinusMm: pm, totalBandMm: round3(2 * pm), tg: g,
    column: toolSpecific ? 'W (tool-specific)' : 'NW (non-tool-specific)', dimensionMm: round3(d),
    basis: `DIN 16742:2013-10 Table 2: ±${pm} mm (a ${round3(2 * pm)} mm total band) at TG${g} for a size in the ${row === 0 ? '1 to 3' : `${DIN_SIZE_BANDS_MM[row - 1]}-${DIN_SIZE_BANDS_MM[row]}`} mm band, ${toolSpecific ? 'tool-specific (W) column' : 'NON-tool-specific (NW) column - the looser one, used because the engine cannot tell whether a dimension crosses tool parts, and NOTE 5 prints it as the column for general tolerances'}.`,
  };
}

/** The smallest band a TG ever tabulates — the declared-band fallback. */
export function tgTightestPromiseMm(tg, { toolSpecific = false } = {}) {
  const g = Number(tg);
  if (!TG_TABLE[g]) return { ok: false, reason: `TG${tg} is not a tolerance group Table 2 tabulates.` };
  const col = toolSpecific ? 'w' : 'nw';
  for (let row = 0; row < DIN_SIZE_BANDS_MM.length; row++) {
    const pm = TG_TABLE[g][col][row];
    if (pm !== null) {
      return {
        ok: true, plusMinusMm: pm, totalBandMm: round3(2 * pm), tg: g, bandUpToMm: DIN_SIZE_BANDS_MM[row],
        basis: `DIN 16742:2013-10 Table 2: the tightest value TG${g} ever tabulates is ±${pm} mm (${round3(2 * pm)} mm total band, sizes up to ${DIN_SIZE_BANDS_MM[row]} mm, ${toolSpecific ? 'W' : 'NW'} column) - the band was judged against that because no dimension was stated.`,
      };
    }
  }
  return { ok: false, reason: `TG${g} has no tabulated values.` };
}

// ── TABLE 10 (p.20): general tolerances for profile forms, by DP ────────────
const PROFILE_BANDS_MM = [30, 100, 250, 400, 1000];
const PROFILE_T_MM = [0.5, 1, 2, 4, 6];

export function dinProfileToleranceMm(dpMm) {
  const d = Number(dpMm);
  if (!(d > 0)) return { ok: false, reason: 'The profile form tolerance is keyed on the DP dimension.' };
  if (d > 1000) return { ok: false, reason: 'Table 10 stops at a 1000 mm DP dimension.' };
  const row = PROFILE_BANDS_MM.findIndex((upTo) => d <= upTo);
  return {
    ok: true, toleranceMm: PROFILE_T_MM[row], dpMm: Math.round(d),
    basis: `DIN 16742:2013-10 Table 10: general profile form tolerance t = ${PROFILE_T_MM[row]} mm for a DP dimension (furthest distance from the reference-system origin) up to ${PROFILE_BANDS_MM[row]} mm. Applies as the general tolerance for freeform and profile surfaces.`,
  };
}

// ── ANNEX C: moulding compound → tolerance series column (A-F) ──────────────
//
// The standard's own orientation scheme, applied at the LOOSEST printed
// branch wherever the deciding knowledge (shrinkage calculated value held to
// ±10%, anisotropy considered in the contour dimensioning) is not an input
// of this tool. The typical shrinkage figures used to pick a semi-crystalline
// resin's class are industry consensus (the same figures the old flat rule
// cited) — the CLASS BOUNDARIES and the letter logic are the standard's own,
// and the basis names both parts.
const RESIN_LETTERS = {
  // C.2 — amorphous thermoplastics (PC, ABS and "(PC+ABS)" are named in the
  // section's own type list). Unfilled; compliance of the shrinkage value
  // within ±10% is unknowable here, so the looser of the printed A/B pair.
  'ABS': { letter: 'B', section: 'C.2', why: 'amorphous (named in the C.2 type list), unfilled; judged at B, the looser of the printed A/B pair, because compliance of the shrinkage calculated value within ±10% is not an input of this tool' },
  'Polycarbonate (PC)': { letter: 'B', section: 'C.2', why: 'amorphous (PC is named in the C.2 type list), unfilled; judged at B, the looser of the printed A/B pair' },
  'PC/ABS blend': { letter: 'B', section: 'C.2', why: 'amorphous ("(PC+ABS)" is named in the C.2 type list); judged at B, the looser of the printed A/B pair' },
  // C.3 — semi-crystalline thermoplastics, unfilled, E-modulus above
  // 1200 N/mm²: letter by the shrinkage class (under 1% → B, 1-2% → C,
  // over 2% → D). The typical shrinkage is consensus; the boundary is DIN's.
  'PPS': { letter: 'B', section: 'C.3', why: 'semi-crystalline, unfilled, modulus above 1200 N/mm², typical moulding shrinkage under 1% (consensus figure) → the printed B class' },
  'PA6 (Nylon)': { letter: 'C', section: 'C.3', why: 'semi-crystalline, unfilled, modulus above 1200 N/mm² (dry), typical moulding shrinkage 1-2% (consensus figure) → the printed C class' },
  'PBT': { letter: 'C', section: 'C.3', why: 'semi-crystalline, unfilled, modulus above 1200 N/mm², typical moulding shrinkage about 1.8% (consensus figure) → the printed 1-2% C class' },
  'PET': { letter: 'C', section: 'C.3', why: 'semi-crystalline, unfilled, modulus above 1200 N/mm², typical moulding shrinkage 1-2% (consensus figure) → the printed C class' },
  'PEEK': { letter: 'C', section: 'C.3', why: 'semi-crystalline, unfilled, modulus above 1200 N/mm², typical moulding shrinkage about 1.1% (consensus figure) → the printed 1-2% C class' },
  'Polypropylene (PP)': { letter: 'D', section: 'C.3', why: 'semi-crystalline, unfilled, modulus above 1200 N/mm²; neat PP shrinkage runs 1-2.5% (consensus figure) and can exceed the 2% boundary, so it is judged at the looser D class' },
  'POM (Acetal)': { letter: 'D', section: 'C.3', why: 'semi-crystalline, unfilled, modulus above 1200 N/mm²; acetal shrinks about 2% and keeps moving after ejection (consensus figure), so it is judged at the looser over-2% D class' },
  // C.3 — unfilled semi-crystalline with modulus BELOW 1200 N/mm²: the
  // printed classes shift one letter looser (under 1% → C, 1-2% → D,
  // over 2% → E).
  'HDPE': { letter: 'E', section: 'C.3', why: 'semi-crystalline, unfilled, modulus below 1200 N/mm²; HDPE shrinks 1.5-3% (consensus figure) and can exceed the 2% boundary → the printed E class for the low-stiffness branch' },
  // C.3 — filled/reinforced semi-crystalline: "without consideration of the
  // shrinkage anisotropy for contour dimensioning → C" (consideration is not
  // an input of this tool, so the looser printed branch).
  'PA66-GF30 (glass-filled)': { letter: 'C', section: 'C.3', why: 'semi-crystalline with strengthening agents (glass fibre); judged at C, the printed branch for anisotropy NOT considered in contour dimensioning, because that consideration is not an input of this tool' },
  'PP-T20 (talc-filled)': { letter: 'C', section: 'C.3', why: 'semi-crystalline with filling agents (talc); judged at C, the printed branch for anisotropy not considered in contour dimensioning' },
  // C.4 — soft-elastic thermoplastics / TPE, via Table C.2: TPU spans the
  // Shore A 50-90 row of the picker grade; curing class I (shrinkage
  // calculated value under 1.5%) gives the printed D.
  'TPU (thermoplastic PU)': { letter: 'D', section: 'C.4 + Table C.2', why: 'thermoplastic elastomer; judged in the Shore A 50-90 row of Table C.2 at curing class I (typical TPU shrinkage under 1.5%, consensus figure) → the printed D' },
};

// ── TABLE C.1: tolerance series x column letter → TG ────────────────────────
const C1_SERIES_TG = {
  1: { A: 4, B: 5, C: 6, D: 7, E: 8, F: 9 },   // normal production
  2: { A: 3, B: 4, C: 5, D: 6, E: 7, F: 8 },   // accurate production
};

/**
 * The tolerance group a moulding is judged at: the Annex C column letter for
 * the material, read through Table C.1 at the declared tolerance series.
 * Series 3 and 4 are refused — Table 8 prints them as "always subject to
 * mandatory agreement", which is a negotiation, not a first quotation.
 */
export function dinTgFor(material, { series = 1 } = {}) {
  if (!material || typeof material !== 'string') {
    return { ok: false, reason: 'No material was given, and DIN 16742 assigns tolerance groups per moulding compound (Annex C).' };
  }
  const entry = RESIN_LETTERS[material];
  if (!entry) return { ok: false, reason: `${material} is not a moulding compound this tool has assigned to a DIN 16742 Annex C column.` };
  const s = Number(series);
  if (s === 3 || s === 4) {
    return { ok: false, reason: 'Tolerance series 3 (precision) and 4 (precision special) are "always subject to mandatory agreement" (Table 8) - a first quotation cannot assume them.' };
  }
  const map = C1_SERIES_TG[s];
  if (!map) return { ok: false, reason: `Series ${series} is not a tolerance series Table C.1 tabulates.` };
  const tg = map[entry.letter];
  return {
    ok: true, tg, letter: entry.letter, series: s,
    basis: `DIN 16742:2013-10 Annex ${entry.section}: ${entry.why}. Table C.1 maps column ${entry.letter} at series ${s} (${s === 1 ? 'normal production - the only series valid for general tolerances per 5.2' : 'accurate production'}) to TG${tg}.`,
  };
}

/** Every material this module can assign — the honest gate for the engine. */
export function dinMaterials() { return Object.keys(RESIN_LETTERS); }

// ── §7.1.1: rotational moulding is TG9, by the standard's own sentence ──────
export const ROTOMOULDING_TG = 9;
export const ROTOMOULDING_BASIS = 'DIN 16742:2013-10, 7.1.1: "The production method rotational moulding is classified into tolerance group 9." No selection scheme applies - TG9 is the printed grade for the process, whatever the compound.';
