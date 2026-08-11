// ─────────────────────────────────────────────────────────────────────────────
// SFSA SUPPLEMENT 3 "DIMENSIONAL CAPABILITIES OF STEEL CASTINGS" — PINNED.
//
// Steel Founders' Society of America, read FIRST-HAND from the user's copy
// (33 pages, full text layer). This is the tolerance authority for STEEL
// castings: the ISO 8062-1994 CT table adopted as "SFSA 2000", the grade
// selections per process and production series, the capability regression
// models behind them, required machining allowances, and the ISO 8062-2
// geometric tolerance tables.
//
// Verification discipline: the document prints every table in BOTH mm and
// inches, and the tests cross-check the mm values against the printed inch
// values — the same role the worked examples played for NADCA #402. One
// printed anomaly is kept table-faithful rather than "corrected": the
// <=10 mm row reads CT9 = 2, CT10 = 2 (canonical ISO 8062 prints 1.5 for
// CT9 there); this copy prints 2 twice, verified against the page image.
//
// Scope: STEEL (castSteelGroupFor gates it, as with Supplement 1). The CT
// value table itself is metal-independent in ISO 8062, but the GRADE
// selection printed here is steel-specific — so aluminium sand castings
// keep their screening values and the register says why.
// ─────────────────────────────────────────────────────────────────────────────

export { castSteelGroupFor } from './sfsa-steel-casting.mjs';

const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;

// ── TABLE 3.1 (p.10): total casting tolerance, mm, by dimension band × CT ───
// Bands are (over, upTo]; null = the printed '-' (grade not defined there).
const CT_BANDS_MM = [10, 16, 25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000];
const CT_TABLE_MM = [
  // CT:      1     2     3     4     5     6     7    8    9    10   11   12  13  14  15  16
  /*<=10 */ [0.09, 0.13, 0.18, 0.26, 0.36, 0.52, 0.74, 1, 2, 2, 2.8, 4.2, null, null, null, null],
  /*16   */ [0.10, 0.14, 0.20, 0.28, 0.38, 0.54, 0.78, 1.1, 1.6, 2.2, 3, 4.4, null, null, null, null],
  /*25   */ [0.11, 0.15, 0.22, 0.3, 0.42, 0.58, 0.82, 1.2, 1.7, 2.4, 3.2, 4.6, 6, 8, 10, 12],
  /*40   */ [0.12, 0.17, 0.24, 0.32, 0.46, 0.64, 0.9, 1.3, 1.8, 2.6, 3.6, 5, 7, 9, 11, 14],
  /*63   */ [0.13, 0.18, 0.26, 0.36, 0.50, 0.70, 1, 1.4, 2, 2.8, 4, 5.6, 8, 10, 12, 16],
  /*100  */ [0.14, 0.20, 0.28, 0.40, 0.56, 0.78, 1.1, 1.6, 2.2, 3.2, 4.4, 6, 9, 11, 14, 18],
  /*160  */ [0.15, 0.22, 0.30, 0.44, 0.62, 0.88, 1.2, 1.8, 2.5, 3.6, 5, 7, 10, 12, 16, 20],
  /*250  */ [null, 0.24, 0.34, 0.50, 0.70, 1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 14, 18, 22],
  /*400  */ [null, null, 0.40, 0.56, 0.78, 1.1, 1.6, 2.2, 3.2, 4.4, 6.2, 9, 12, 16, 20, 25],
  /*630  */ [null, null, null, 0.64, 0.90, 1.2, 1.8, 2.6, 3.6, 5, 7, 10, 14, 18, 22, 28],
  /*1000 */ [null, null, null, null, 1, 1.4, 2, 2.8, 4, 6, 8, 11, 16, 20, 25, 32],
  /*1600 */ [null, null, null, null, null, 1.6, 2.2, 3.2, 4.6, 7, 9, 13, 18, 23, 29, 37],
  /*2500 */ [null, null, null, null, null, null, 2.6, 3.8, 5.4, 8, 10, 15, 21, 26, 33, 42],
  /*4000 */ [null, null, null, null, null, null, null, 4, 6.2, 9, 12, 17, 24, 30, 38, 49],
  /*6300 */ [null, null, null, null, null, null, null, null, 7, 10, 14, 20, 28, 35, 44, 56],
  /*10000*/ [null, null, null, null, null, null, null, null, null, 11, 16, 23, 32, 40, 50, 64],
];

/**
 * Total casting tolerance (mm) for a basic dimension at a CT grade.
 * Refuses outside the table — a '-' cell means the grade is not defined for
 * that dimension, and this module never extrapolates a standard.
 */
export function ctToleranceMm(dimensionMm, grade) {
  const d = Number(dimensionMm); const g = Number(grade);
  if (!(d > 0)) return { ok: false, reason: 'A CT tolerance needs the dimension it applies to.' };
  if (!(g >= 1 && g <= 16)) return { ok: false, reason: `CT${grade} is not a grade Table 3.1 tabulates (CT1-CT16).` };
  if (d > 10000) return { ok: false, reason: 'Table 3.1 stops at 10 m - consult the foundry.' };
  const row = CT_BANDS_MM.findIndex((upTo) => d <= upTo);
  const value = CT_TABLE_MM[row][g - 1];
  if (value === null) {
    return { ok: false, reason: `Table 3.1 prints no CT${g} value for a ${round2(d)} mm dimension - the grade is not defined in that band.` };
  }
  return {
    ok: true,
    totalBandMm: value,
    grade: g,
    dimensionMm: round2(d),
    basis: `SFSA Supplement 3, Table 3.1 (ISO 8062-1994 adopted as SFSA 2000 for steel castings): total casting tolerance ${value} mm at CT${g} for a dimension in the ${row === 0 ? 'up to 10' : `${CT_BANDS_MM[row - 1]}-${CT_BANDS_MM[row]}`} mm band.`,
  };
}

/**
 * The smallest tolerance a grade EVER tabulates — what a declared band with
 * no stated dimension is judged against, mirroring the #402 first-inch
 * convention. High grades start at 16 mm (below that the table prints '-').
 */
export function ctTightestPromiseMm(grade) {
  const g = Number(grade);
  if (!(g >= 1 && g <= 16)) return { ok: false, reason: `CT${grade} is not a grade Table 3.1 tabulates.` };
  for (let row = 0; row < CT_TABLE_MM.length; row++) {
    const value = CT_TABLE_MM[row][g - 1];
    if (value !== null) {
      return {
        ok: true, totalBandMm: value, grade: g,
        bandUpToMm: CT_BANDS_MM[row],
        basis: `SFSA Supplement 3, Table 3.1: the tightest value CT${g} ever tabulates is ${value} mm (dimensions up to ${CT_BANDS_MM[row]} mm) - the band was judged against that because no dimension was stated.`,
      };
    }
  }
  return { ok: false, reason: `CT${grade} has no tabulated values.` };
}

/**
 * Grade selection, Tables 3.3 / 3.4 (pp.11-12).
 *
 * The chosen grade is the LOOSEST of the "appropriate for most casting types
 * and sand molding processes" band — the number a first quotation can rely
 * on without asking the foundry for anything special. The full band is named
 * in the basis so a tighter negotiated grade is a conversation, not a lie.
 */
export function ctGradeFor(process, series = 'short') {
  const s = series === 'long' ? 'long' : 'short';
  if (process === 'investment') {
    return {
      ok: true, grade: 7, band: 'CT5-7', series: 'long',
      basis: 'SFSA Supplement 3, Table 3.3: investment casting CT5-7 (long production series only - investment tooling is always iterated). Judged at CT7, the loosest of the band.',
    };
  }
  if (process === 'sand') {
    return s === 'long'
      ? { ok: true, grade: 12, band: 'CT10-12', series: s,
        basis: 'SFSA Supplement 3, Table 3.3 (long production series): CT10-12 "appropriate for most casting types and sand molding processes"; CT8-10 within capability but not for all; CT12-14 fully capable. Judged at CT12.' }
      : { ok: true, grade: 13, band: 'CT11-13', series: s,
        basis: 'SFSA Supplement 3, Table 3.4 (short production series): CT11-13 "appropriate for most casting types and sand molding processes". Judged at CT13 - a first article has had no pattern re-engineering to centre its dimensions.' };
  }
  return { ok: false, reason: `SFSA 2000 grade selection covers sand and investment steel castings, not "${process}".` };
}

// ── TABLE 2.2 (p.5): required machining allowance, mm ──────────────────────
const RMA_BANDS_MM = [40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000];
const RMA_TABLE_MM = {
  //     <=40  63   100  160  250  400  630  1000 1600 2500 4000 6300 10000
  E: [0.4, 0.4, 0.7, 1.1, 1.4, 1.8, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5],
  F: [0.5, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6],
  G: [0.5, 0.7, 1.4, 2.2, 2.8, 3.5, 4, 5, 5.5, 6, 7, 8, 9],
  H: [0.7, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  J: [1, 1.4, 2.8, 4, 5.5, 7, 9, 10, 11, 13, 14, 16, 17],
  K: [1.4, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
};

export const RMA_GRADE_SELECTION = {
  sandHandMolded: 'G-K',
  sandMachineMolded: 'F-H',   // includes shell
  investment: 'E',
  copeSurfaceMinMm: 6,
  basis: 'SFSA Supplement 3, Table 2.2 (p.5): sand casting hand molded use grade G-K; machine molded (and shell) F-H; investment E. "A minimum of 6 mm RMA required on all cope casting surfaces."',
};

/** Required machining allowance at the part's largest dimension. */
export function rmaMm(largestDimensionMm, grade = 'F') {
  const d = Number(largestDimensionMm);
  const col = RMA_TABLE_MM[grade];
  if (!col) return { ok: false, reason: `RMA grade ${grade} is not in Table 2.2 (E-K).` };
  if (!(d > 0)) return { ok: false, reason: 'RMA needs the largest dimension of the casting.' };
  if (d > 10000) return { ok: false, reason: 'Table 2.2 stops at 10 m; castings over 5 m already print "consult the foundry".' };
  const row = RMA_BANDS_MM.findIndex((upTo) => d <= upTo);
  return {
    ok: true,
    rmaMm: col[row],
    grade,
    largestDimensionMm: Math.round(d),
    basis: `SFSA Supplement 3, Table 2.2: required machining allowance ${col[row]} mm per surface at grade ${grade} for a casting whose largest dimension is ${Math.round(d)} mm. Cope surfaces carry a printed 6 mm minimum regardless - which surface is cope is the foundry's choice, so it is stated rather than assumed. The table is conservative for short runs and "may be reduced for high production run castings" after machining trials.`,
  };
}

// ── TABLES 3.8 / 3.12b: capability regression models, mm ───────────────────
//
// 6-sigma total tolerance as a function of feature length L (mm), casting
// weight W (kg) and whether the feature crosses the parting line (PL 0/1).
// r^2 is only 0.4-0.7 — foundry-to-foundry variation is large — so these
// REPORT expected capability; the CT tables above are what gates.
// Each percentile row is stored EXACTLY as printed — the no-bake rows vary
// their L and W coefficients per percentile and this module does not smooth
// a standard. Row form: 6sigma = c + l*L^lExp + w*W^wExp + pl*PL + plL*PL*L^lExp.
const CAPABILITY_MODELS_MM = {
  greenSand: {
    label: 'green sand', maxWeightKg: 230, usesPL: false,
    short: {
      p90: { c: 5.200, l: 0.0007, lExp: 1.3, w: 0.340, wExp: 0.4 },
      p50: { c: 2.140, l: 0.0007, lExp: 1.3, w: 0.340, wExp: 0.4 },
      p10: { c: -0.922, l: 0.0007, lExp: 1.3, w: 0.340, wExp: 0.4 },
    },
    long: {
      p90: { c: 4.330, l: 0.0006, lExp: 1.3, w: 0.284, wExp: 0.4 },
      p50: { c: 1.780, l: 0.0006, lExp: 1.3, w: 0.284, wExp: 0.4 },
      p10: { c: -0.768, l: 0.0006, lExp: 1.3, w: 0.284, wExp: 0.4 },
    },
  },
  noBake: {
    label: 'no-bake', maxWeightKg: 900, usesPL: true,
    short: {
      p90: { c: 3.590, l: 0.014, lExp: 0.9, w: 0.010, wExp: 0.8, pl: 1.230 },
      p50: { c: 1.560, l: 0.012, lExp: 0.9, w: 0.012, wExp: 0.8, pl: 1.230 },
      p10: { c: 0.460, l: 0.010, lExp: 0.9, w: 0.014, wExp: 0.8, pl: 1.230 },
    },
    long: {
      p90: { c: 2.990, l: 0.018, lExp: 0.9, w: 0.009, wExp: 0.8, pl: 1.020 },
      p50: { c: 1.300, l: 0.010, lExp: 0.9, w: 0.010, wExp: 0.8, pl: 1.020 },
      p10: { c: -0.383, l: 0.008, lExp: 0.9, w: 0.012, wExp: 0.8, pl: 1.030 },
    },
  },
  shell: {
    label: 'shell', maxWeightKg: 50, usesPL: true,
    short: {
      p90: { c: 2.040, l: 0.001, lExp: 1.4, pl: 0.494, plL: -0.0005 },
      p50: { c: 1.090, l: 0.001, lExp: 1.4, pl: 0.499, plL: -0.0005 },
      p10: { c: 0.138, l: 0.001, lExp: 1.4, pl: 0.504, plL: -0.0005 },
    },
    long: {
      p90: { c: 1.700, l: 0.0009, lExp: 1.4, pl: 0.412, plL: -0.0004 },
      p50: { c: 0.909, l: 0.0009, lExp: 1.4, pl: 0.416, plL: -0.0004 },
      p10: { c: 0.115, l: 0.0008, lExp: 1.4, pl: 0.420, plL: -0.0004 },
    },
  },
};

// Table 3.12b: the mm rows share their coefficients across percentiles. (The
// inch table's 50% row prints 0.0005L where the mm table prints 0.005L for
// all three — the internally consistent mm table is the one held here.)
const INVESTMENT_MODEL_MM = { c90: 0.724, c50: 0.212, c10: 0.029, l: 0.005, w: 0.012, pl: -0.013 };

const evalRow = (k, L, W, PL) =>
  k.c + k.l * L ** k.lExp + (k.w ? k.w * W ** k.wExp : 0) + (k.pl ? k.pl * PL : 0) + (k.plL ? k.plL * PL * L ** k.lExp : 0);

/**
 * Expected 6-sigma capability for one sand molding route, Table 3.8.
 * Returns {p10, p50, p90} in mm, or {ok:false} outside the model's fitted
 * weight domain — the regression was never fitted there.
 */
export function capabilityModelMm(molding, { lengthMm, weightKg, crossesParting = false, series = 'short' } = {}) {
  const m = CAPABILITY_MODELS_MM[molding];
  if (!m) return { ok: false, reason: `No Table 3.8 model for "${molding}" (greenSand, noBake, shell).` };
  const L = Number(lengthMm); const W = Number(weightKg);
  if (!(L > 0) || !(W > 0)) return { ok: false, reason: 'The capability models need feature length and casting weight.' };
  if (W > m.maxWeightKg) return { ok: false, reason: `The ${m.label} model was fitted on castings up to ${m.maxWeightKg} kg; at ${round2(W)} kg it does not apply.` };
  const rows = m[series === 'long' ? 'long' : 'short'];
  const PL = m.usesPL && crossesParting ? 1 : 0;
  return {
    ok: true,
    molding: m.label,
    series: series === 'long' ? 'long' : 'short',
    p10Mm: round2(Math.max(0, evalRow(rows.p10, L, W, PL))),
    p50Mm: round2(evalRow(rows.p50, L, W, PL)),
    p90Mm: round2(evalRow(rows.p90, L, W, PL)),
    basis: `SFSA Supplement 3, Table 3.8 (${m.label}, ${series === 'long' ? 'long' : 'short'} production series): 6-sigma capability regression at this part's own feature length and weight. r^2 was 0.4-0.7 - foundry-to-foundry differences are large - so this is the industry's expected spread, not a promise.`,
  };
}

/** Investment capability, Table 3.12b (long series only). */
export function investmentCapabilityMm({ lengthMm, weightKg, crossesParting = false } = {}) {
  const L = Number(lengthMm); const W = Number(weightKg);
  if (!(L > 0) || !(W > 0)) return { ok: false, reason: 'The investment capability model needs feature length and casting weight.' };
  const k = INVESTMENT_MODEL_MM;
  const core = k.l * L + k.w * W + (crossesParting ? k.pl : 0);
  return {
    ok: true,
    p10Mm: round3(Math.max(0, k.c10 + core)),
    p50Mm: round3(k.c50 + core),
    p90Mm: round3(k.c90 + core),
    basis: 'SFSA Supplement 3, Table 3.12b: investment casting 6-sigma capability (long production series - investment tooling is always iterated).',
  };
}

// ── TABLE 4.2a (p.24): flatness, and Table 4.5: CTG selection ──────────────
const CTG_FLATNESS_BANDS_MM = [10, 30, 100, 300, 1000, 3000, 10000];
const CTG_FLATNESS_MM = {
  // CTG:  4     5     6     7     8
  4: [0.18, 0.27, 0.4, 0.6, 0.9, 1.4, null],
  5: [0.27, 0.4, 0.6, 0.9, 1.4, 2.0, 3.0],
  6: [0.4, 0.6, 0.9, 1.4, 2.0, 3.0, 4.6],
  7: [0.6, 0.9, 1.4, 2.0, 3.0, 4.6, 6.8],
  8: [0.9, 1.4, 2.0, 3.0, 4.6, 6.8, 10],
};

export const CTG_SELECTION = {
  sandHandMolded: [6, 8],
  sandMachineMolded: [5, 7],   // includes shell
  investment: [4, 6],
  basis: 'SFSA Supplement 3, Table 4.5 (ISO 8062-2 based): casting geometrical tolerance grades for steel - sand hand molding CTG 6-8, machine and shell molding CTG 5-7, investment CTG 4-6.',
};

/**
 * Flatness capability at a CTG grade, keyed on the feature's nominal length
 * (the standard says: the largest dimension of the considered feature).
 */
export function ctgFlatnessMm(nominalLengthMm, ctg) {
  const col = CTG_FLATNESS_MM[ctg];
  const d = Number(nominalLengthMm);
  if (!col) return { ok: false, reason: `CTG${ctg} is not a grade Table 4.2 tabulates (CTG4-8).` };
  if (!(d > 0)) return { ok: false, reason: 'A flatness tolerance needs the feature length it applies to.' };
  if (d > 10000) return { ok: false, reason: 'Table 4.2 stops at 10 m.' };
  const row = CTG_FLATNESS_BANDS_MM.findIndex((upTo) => d <= upTo);
  const value = col[row];
  if (value === null) return { ok: false, reason: `Table 4.2 prints no CTG${ctg} flatness value in that length band.` };
  return {
    ok: true,
    toleranceMm: value,
    ctg,
    basis: `SFSA Supplement 3, Table 4.2a (ISO 8062-2 based): flatness ${value} mm at CTG${ctg} for a feature up to ${CTG_FLATNESS_BANDS_MM[row]} mm.`,
  };
}

// ── TABLE 3.10 (p.19): parting-line variability adders ─────────────────────
export const PARTING_LINE_VARIABILITY_MM = {
  greenSand: 0,
  noBake: 1.0,
  shell: 0.2,
  basis: 'SFSA Supplement 3, Table 3.10: additional 6-sigma variability for features crossing the parting line - green sand none expected, no-bake +1 mm (significant), shell +0.2 mm.',
};

// ── TABLE 3.14 (p.23): weight tolerances, ISO 4990-1986 ────────────────────
export const WEIGHT_TOLERANCE = {
  machineMoldedPct: 5,
  handMoldedPct: 7,
  otherPct: 15,
  basis: 'SFSA Supplement 3, Table 3.14 (ISO 4990-1986): casting mass tolerance +/-5% machine molded, +/-7% hand molded, under +15% all other castings.',
};
