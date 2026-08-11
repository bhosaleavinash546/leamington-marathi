// ─────────────────────────────────────────────────────────────────────────────
// ISO 8062-4:2017 — "Dimensional and geometrical tolerances for moulded
// parts, Part 4: Rules and general tolerances for castings using profile
// tolerancing in a general datum system" — PINNED. Read FIRST-HAND from the
// user's copy (32 pages; the text layer extracts per character, so every
// table was reconstructed by word position and spot-checked).
//
// This is the document the register named as the blocker on every
// NON-FERROUS casting tolerance rule. It carries:
//   * Table 1  — general surface profile tolerances, grades P1..P15
//   * Table 2  — general DIMENSIONAL tolerances, grades S1..S15 (sizes of
//                complete cylinders and wall thicknesses; stops at 300 mm)
//   * Table 3  — required machining allowance, grades A..K
//   * Tables 4-8 — draft angles per process (hand / machine moulding,
//                permanent mould, pressure die, investment), by feature
//                height, Grade A (fine) / B (coarse), external / internal
//   * Annex B  — P/S grade selection per process x metal, long series
//                (Table B.1) and short series sand hand moulding (B.2)
//   * Annex C  — RMA grade selection per process x metal
//
// Conventions, matching the other pinned standards:
//   * Grade selection is judged at the LOOSEST of the printed band — what a
//     first quotation can rely on without asking the foundry for anything
//     special; the basis names the full band.
//   * '-' cells refuse rather than extrapolate.
//   * Draft is judged at Grade A (fine) EXTERNAL — the least demanding
//     printed column, because the engine cannot yet split internal from
//     external surfaces. Same under-reporting caveat as the NADCA draft.
//   * One printed anomaly is kept table-faithful: Table 6 (permanent mould)
//     prints 1,4 deg for the 10-16 mm internal fine cell, between 4,9 and
//     3,9 in the same column. Held as printed, like the CT-table anomaly.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (v) => Math.round(v * 100) / 100;

/** Which ISO 8062-4 metal column a picker material belongs to. */
export function isoMetalGroupFor(material) {
  if (!material || typeof material !== 'string') {
    return { ok: false, reason: 'No material was given, and ISO 8062-4 selects grades per metal group.' };
  }
  const m = material.toLowerCase();
  if (/stainless|steel/.test(m) && !/cast iron/.test(m)) return { ok: true, group: 'steel', label: 'Steel' };
  if (/gjs|ductile|sg iron|adi/.test(m)) return { ok: true, group: 'sgIron', label: 'S.G. iron' };
  if (/cast iron|gjv|simo|grey/.test(m)) return { ok: true, group: 'greyIron', label: 'Grey iron' };
  if (/brass|bronze|copper|cuzn/.test(m)) return { ok: true, group: 'copper', label: 'Copper alloys' };
  if (/zinc|zamak|za-8|\bza\b/.test(m)) return { ok: true, group: 'zinc', label: 'Zinc alloys' };
  if (/alumin|magnesium|am60|az91|silafont|castasil|mercalloy|magsimal|adc1|a356|a380/.test(m)) {
    return { ok: true, group: 'lightMetal', label: 'Light metal alloys' };
  }
  if (/nickel|inconel/.test(m)) return { ok: true, group: 'nickel', label: 'Nickel based alloys' };
  if (/cobalt/.test(m)) return { ok: true, group: 'cobalt', label: 'Cobalt based alloys' };
  return { ok: false, reason: `${material} is not a metal group ISO 8062-4 tabulates.` };
}

// ── TABLE 2 (p.8): general dimensional tolerances S, mm ─────────────────────
// For sizes (diameters of complete cylinders) and wall thicknesses; the table
// stops at 300 mm — beyond that the standard tolerances by profile (Table 1).
const S_BANDS_MM = [10, 30, 100, 300];
const S_TABLE_MM = [
  // S:      1     2     3     4     5     6     7    8    9    10   11   12  13  14  15
  /*<=10 */ [0.05, 0.06, 0.1, 0.12, 0.17, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2, null, null, null],
  /*30   */ [0.06, 0.07, 0.12, 0.15, 0.2, 0.3, 0.4, 0.6, 0.8, 1.2, 1.7, 2.5, 3, 4, 5],
  /*100  */ [0.07, 0.1, 0.14, 0.2, 0.25, 0.4, 0.5, 0.8, 1, 1.5, 2, 3, 4, 5, 7],
  /*300  */ [0.08, 0.12, 0.17, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2, 3, 4, 5, 7, 9],
];

export function sToleranceMm(dimensionMm, grade) {
  const d = Number(dimensionMm); const g = Number(grade);
  if (!(d > 0)) return { ok: false, reason: 'A dimensional tolerance needs the dimension it applies to.' };
  if (!(g >= 1 && g <= 15)) return { ok: false, reason: `S${grade} is not a grade Table 2 tabulates (S1-S15).` };
  if (d > 300) return { ok: false, reason: 'Table 2 stops at 300 mm; larger features are governed by the Table 1 profile tolerances.' };
  const row = S_BANDS_MM.findIndex((upTo) => d <= upTo);
  const value = S_TABLE_MM[row][g - 1];
  if (value === null) return { ok: false, reason: `Table 2 prints no S${g} value for a ${round2(d)} mm size.` };
  return {
    ok: true, totalBandMm: value, grade: g, dimensionMm: round2(d),
    basis: `ISO 8062-4:2017 Table 2: general dimensional tolerance ${value} mm at grade S${g} for a size in the ${row === 0 ? 'up to 10' : `${S_BANDS_MM[row - 1]}-${S_BANDS_MM[row]}`} mm band (sizes of complete cylinders and wall thicknesses; the tolerance is a total band, applied as +/- half unless otherwise specified).`,
  };
}

/** The smallest tolerance a grade ever tabulates — the declared-band fallback. */
export function sTightestPromiseMm(grade) {
  const g = Number(grade);
  if (!(g >= 1 && g <= 15)) return { ok: false, reason: `S${grade} is not a grade Table 2 tabulates.` };
  for (let row = 0; row < S_TABLE_MM.length; row++) {
    const value = S_TABLE_MM[row][g - 1];
    if (value !== null) {
      return {
        ok: true, totalBandMm: value, grade: g, bandUpToMm: S_BANDS_MM[row],
        basis: `ISO 8062-4:2017 Table 2: the tightest value S${g} ever tabulates is ${value} mm (sizes up to ${S_BANDS_MM[row]} mm) - the band was judged against that because no dimension was stated.`,
      };
    }
  }
  return { ok: false, reason: `S${grade} has no tabulated values.` };
}

// ── TABLE 1 (p.7): general surface profile tolerances P, mm ─────────────────
// Keyed on the moulded space diagonal — the diameter of the smallest
// enveloping sphere, which for a box is the bounding-box diagonal.
const P_BANDS_MM = [10, 30, 100, 300, 1000, 3000, 6300, 10000];
const P_TABLE_MM = [
  /*<=10 */ [0.09, 0.14, 0.19, 0.27, 0.37, 0.53, 0.76, 1.1, null, null, null, null, null, null, null],
  /*30   */ [0.12, 0.16, 0.23, 0.31, 0.44, 0.61, 0.86, 1.3, null, null, null, null, null, null, null],
  /*100  */ [0.14, 0.19, 0.27, 0.38, 0.53, 0.74, 1.1, 1.5, 2.1, 3, null, null, null, null, null],
  /*300  */ [0.15, 0.23, 0.35, 0.5, 0.7, 1, 1.4, 2, 2.8, 4, 5.6, 8, null, null, null],
  /*1000 */ [null, null, 0.42, 0.64, 0.8, 1.3, 1.9, 2.7, 3.8, 5.5, 7.5, 11, 15, 19, 23],
  /*3000 */ [null, null, null, null, null, 1.6, 2.4, 3.8, 5.4, 8, 10, 15, 21, 26, 33],
  /*6300 */ [null, null, null, null, null, null, null, null, 7, 10, 13, 19, 26, 33, 41],
  /*10000*/ [null, null, null, null, null, null, null, null, null, 11, 16, 23, 32, 40, 50],
];

export function pToleranceMm(diagonalMm, grade) {
  const d = Number(diagonalMm); const g = Number(grade);
  if (!(d > 0)) return { ok: false, reason: 'A profile tolerance needs the moulded space diagonal.' };
  if (!(g >= 1 && g <= 15)) return { ok: false, reason: `P${grade} is not a grade Table 1 tabulates (P1-P15).` };
  if (d > 10000) return { ok: false, reason: 'Table 1 stops at a 10 m diagonal.' };
  const row = P_BANDS_MM.findIndex((upTo) => d <= upTo);
  const value = P_TABLE_MM[row][g - 1];
  if (value === null) return { ok: false, reason: `Table 1 prints no P${g} value for a ${round2(d)} mm diagonal.` };
  return {
    ok: true, toleranceMm: value, grade: g, diagonalMm: Math.round(d),
    basis: `ISO 8062-4:2017 Table 1: general surface profile tolerance ${value} mm at grade P${g} for a moulded space diagonal (smallest enveloping sphere) up to ${P_BANDS_MM[row]} mm. Surface mismatch is included unless otherwise indicated.`,
  };
}

// ── TABLE 3 (p.9): required machining allowance, mm ─────────────────────────
const RMA_BANDS_MM = [40, 63, 100, 160, 250, 400, 630, 1000, 1600, 3000, 6300];
const RMA_TABLE_MM = {
  //   <=40 63   100  160  250  400  630  1000 1600 3000 6300
  A: [0.1, 0.1, 0.2, 0.3, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1],
  B: [0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.8, 0.9, 1, 1.1, 1.4],
  C: [0.2, 0.3, 0.4, 0.5, 0.7, 0.9, 1.1, 1.2, 1.4, 1.6, 2],
  D: [0.3, 0.3, 0.5, 0.8, 1, 1.3, 1.5, 1.8, 2, 2.2, 2.8],
  E: [0.4, 0.4, 0.7, 1.1, 1.4, 1.8, 2.2, 2.5, 2.8, 3.2, 4],
  F: [0.5, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5.5],
  G: [0.5, 0.7, 1.4, 2.2, 2.8, 3.5, 4, 5, 5.5, 6, 8],
  H: [0.7, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11],
  J: [1, 1.4, 2.8, 4, 5.5, 7, 9, 10, 11, 13, 16],
  K: [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 22],
};

export function isoRmaMm(diagonalMm, grade) {
  const col = RMA_TABLE_MM[grade];
  const d = Number(diagonalMm);
  if (!col) return { ok: false, reason: `RMA grade ${grade} is not in Table 3 (A-K).` };
  if (!(d > 0)) return { ok: false, reason: 'The RMA needs the moulded space diagonal.' };
  if (d > 6300) return { ok: false, reason: 'The 6300-10000 mm row of Table 3 was not fully legible in the supplied copy, so this module refuses beyond 6300 mm rather than guessing.' };
  const row = RMA_BANDS_MM.findIndex((upTo) => d <= upTo);
  return {
    ok: true, rmaMm: col[row], grade, diagonalMm: Math.round(d),
    basis: `ISO 8062-4:2017 Table 3: required machining allowance ${col[row]} mm per surface at grade ${grade} for a moulded space diagonal of ${Math.round(d)} mm.`,
  };
}

// ── ANNEX B: P/S grade selection per process x metal ────────────────────────
//
// Table B.1 (long series / mass production) — [min, max] or null where the
// standard prints '-'. Table B.2 (short series) covers sand HAND moulding
// only, clay-bonded vs chemically bonded; judged at the clay column (the
// looser of the two) since the binder is not an input.
const B1_LONG = {
  //            sandHand  sandMachine  permanentMould  pressureDie  investment
  steel: { sandHand: [11, 14], sandMachine: [8, 12], permanentMould: null, pressureDie: null, investment: [4, 9] },
  greyIron: { sandHand: [11, 14], sandMachine: [8, 12], permanentMould: [7, 9], pressureDie: null, investment: [4, 9] },
  sgIron: { sandHand: [11, 14], sandMachine: [8, 12], permanentMould: [7, 9], pressureDie: null, investment: [4, 9] },
  copper: { sandHand: [10, 13], sandMachine: [8, 10], permanentMould: [7, 9], pressureDie: [6, 8], investment: [4, 9] },
  zinc: { sandHand: [10, 13], sandMachine: [8, 10], permanentMould: [7, 9], pressureDie: [3, 6], investment: [4, 9] },
  lightMetal: { sandHand: [9, 12], sandMachine: [7, 9], permanentMould: [6, 8], pressureDie: [6, 9], investment: [4, 9] },
  nickel: { sandHand: [11, 14], sandMachine: [8, 12], permanentMould: null, pressureDie: null, investment: [4, 9] },
  cobalt: { sandHand: [11, 14], sandMachine: [8, 12], permanentMould: null, pressureDie: null, investment: [4, 9] },
};
const B2_SHORT_SAND_CLAY = {
  steel: [13, 14], greyIron: [13, 15], sgIron: [13, 15],
  copper: [13, 15], lightMetal: [11, 13],
};

/**
 * The S/P grade a part is judged at: the LOOSEST of the printed band for the
 * process and metal, short vs long series where the standard splits them.
 * Sand is judged at the HAND-moulding band — the looser one — because the
 * moulding method is not an input; the basis says so.
 */
export function isoGradeFor(process, material, series = 'short') {
  const metal = isoMetalGroupFor(material);
  if (!metal.ok) return { ok: false, reason: metal.reason };
  if (process === 'sand' && series !== 'long') {
    const band = B2_SHORT_SAND_CLAY[metal.group];
    if (!band) return { ok: false, reason: `Table B.2 (short series) prints no sand-casting band for ${metal.label} in the supplied copy.` };
    return {
      ok: true, grade: band[1], band: `S${band[0]}-S${band[1]}`, series: 'short', metal: metal.label,
      basis: `ISO 8062-4:2017 Table B.2 (short-series or single production, sand cast hand moulding, clay-bonded - the looser of the two printed binder columns): ${metal.label} grades ${band[0]}-${band[1]}. Judged at S${band[1]}, the loosest - a first article has had no tooling iteration.`,
    };
  }
  const row = B1_LONG[metal.group];
  if (!row) return { ok: false, reason: `Annex B prints no bands for ${metal.label}.` };
  const key = process === 'sand' ? 'sandHand' : process;
  const band = row[key];
  if (!band) return { ok: false, reason: `ISO 8062-4 Table B.1 prints '-' for ${metal.label} by ${process} - the standard does not tabulate that combination.` };
  const note = process === 'sand'
    ? ' Sand is judged at the HAND-moulding band, the looser of the two, because the moulding method is not an input; machine moulding and shell narrow it.'
    : '';
  return {
    ok: true, grade: band[1], band: `S${band[0]}-S${band[1]}`, series: 'long', metal: metal.label,
    basis: `ISO 8062-4:2017 Table B.1 (long-series or mass production): ${metal.label} by ${process === 'sand' ? 'sand casting' : process === 'permanentMould' ? 'metallic permanent mould' : process} grades ${band[0]}-${band[1]}. Judged at S${band[1]}, the loosest of the printed band.${note}`,
  };
}

// ── ANNEX C: RMA grade selection per process x metal ────────────────────────
const C1_RMA = {
  steel: { sandHand: ['G', 'K'], sandMachine: ['F', 'H'], permanentMould: null, pressureDie: null, investment: ['E', 'E'] },
  greyIron: { sandHand: ['F', 'H'], sandMachine: ['E', 'G'], permanentMould: ['D', 'F'], pressureDie: null, investment: ['E', 'E'] },
  sgIron: { sandHand: ['F', 'H'], sandMachine: ['E', 'G'], permanentMould: ['D', 'F'], pressureDie: null, investment: ['E', 'E'] },
  copper: { sandHand: ['F', 'H'], sandMachine: ['E', 'G'], permanentMould: ['D', 'F'], pressureDie: ['B', 'D'], investment: ['E', 'E'] },
  zinc: { sandHand: ['F', 'H'], sandMachine: ['E', 'G'], permanentMould: ['D', 'F'], pressureDie: ['A', 'D'], investment: null },
  lightMetal: { sandHand: ['F', 'H'], sandMachine: ['E', 'G'], permanentMould: ['D', 'F'], pressureDie: ['B', 'D'], investment: ['E', 'E'] },
  nickel: { sandHand: ['G', 'K'], sandMachine: ['F', 'H'], permanentMould: null, pressureDie: null, investment: ['E', 'E'] },
  cobalt: { sandHand: ['G', 'K'], sandMachine: ['F', 'H'], permanentMould: null, pressureDie: null, investment: null },
};

/** The RMA grade to judge declared stock against: the band's MINIMUM — the least the standard ever requires. */
export function isoRmaGradeFor(process, material) {
  const metal = isoMetalGroupFor(material);
  if (!metal.ok) return { ok: false, reason: metal.reason };
  const row = C1_RMA[metal.group];
  const key = process === 'sand' ? 'sandHand' : process;
  const band = row?.[key];
  if (!band) return { ok: false, reason: `ISO 8062-4 Table C.1 prints '-' for ${metal.label} by ${process}.` };
  return {
    ok: true, grade: band[0], band: `${band[0]}-${band[1]}`, metal: metal.label,
    basis: `ISO 8062-4:2017 Table C.1: RMA grades ${band[0]} to ${band[1]} for ${metal.label} by ${process === 'sand' ? 'sand casting, hand moulding' : process}. Judged at grade ${band[0]}, the least the standard ever requires.`,
  };
}

// ── TABLES 4-8: draft angles by process and feature height ──────────────────
//
// Grade A (fine) EXTERNAL column only — the least demanding printed value,
// because the engine cannot yet split internal from external surfaces. The
// full fine/coarse x external/internal structure exists in the standard;
// judging at fine-external UNDER-reports on internal walls, and the basis
// says so. Height bands (over, upTo]: shared spine per table.
const DRAFT_BANDS_MM = [4, 6.3, 10, 16, 25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600];
const DRAFT_FINE_EXTERNAL_DEG = {
  // Table 4 - sand cast, hand moulding
  hand: [6.9, 6.5, 4.8, 3.2, 2.6, 2.2, 1.9, 1.4, 1.0, 0.8, 0.7, 0.5, 0.5, 0.4],
  // Table 5 - sand cast, machine moulding (and shell)
  machine: [5.8, 5.3, 3.9, 2.7, 2.2, 2.0, 1.6, 1.2, 1.0, 0.9, 0.8, 0.7, 0.5, 0.4],
  // Table 6 - metallic permanent mould (gravity / low pressure)
  permanentMould: [8.5, 3.3, 3.5, 3.1, 2.8, 2.5, 2.2, 1.8, 1.8, 1.7, 1.4, 1.2, null, null],
  // Table 7 - pressure die casting
  pressureDie: [5.7, 2.2, 2.1, 1.3, 2.8, 2.5, 2.2, 0.8, 0.9, 0.7, 0.5, 0.5, null, null],
  // Table 8 - investment casting
  investment: [5.7, 2.2, 1.4, 0.9, 0.8, 0.5, 0.5, 0.3, 0.2, 0.2, 0.1, 0.1, null, null],
};
const DRAFT_TABLE_NO = { hand: 4, machine: 5, permanentMould: 6, pressureDie: 7, investment: 8 };

export function isoDraftDeg(process, featureHeightMm) {
  const col = DRAFT_FINE_EXTERNAL_DEG[process];
  const h = Number(featureHeightMm);
  if (!col) return { ok: false, reason: `No ISO 8062-4 draft table for "${process}".` };
  if (!(h > 0)) return { ok: false, reason: 'The draft tables are keyed on feature height.' };
  if (h > 1600) return { ok: false, reason: 'The draft tables stop at 1600 mm of feature height.' };
  const row = DRAFT_BANDS_MM.findIndex((upTo) => h <= upTo);
  const deg = col[row];
  if (deg === null) return { ok: false, reason: `Table ${DRAFT_TABLE_NO[process]} prints no value for a ${Math.round(h)} mm feature by ${process}.` };
  return {
    ok: true, deg, tableNo: DRAFT_TABLE_NO[process],
    basis: `ISO 8062-4:2017 Table ${DRAFT_TABLE_NO[process]}: draft angle ${deg} deg per side for a feature up to ${DRAFT_BANDS_MM[row]} mm tall - Grade A (fine), EXTERNAL column, the least demanding printed value; internal surfaces and Grade B (coarse) ask more, so this UNDER-reports on internal walls.`,
  };
}
