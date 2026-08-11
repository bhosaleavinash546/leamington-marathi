// ─────────────────────────────────────────────────────────────────────────────
// NADCA #402 — *Product Specification Standards for Die Castings*, 2021
// (11th edition) — READ FIRST-HAND, supplied by the user as PDFs.
//
// THIS IS THE DOCUMENT THE AUDIT REGISTER WAS BLOCKED ON. Every casting
// tolerance-capability rule in the catalogue carried "blockedBy: NADCA Product
// Specification Standards #402 not held". It is now held, and this module is
// the standard's tables as code: every constant tagged with its table id
// (S-4A-1-21 etc.) and page, every formula verified against the standard's own
// printed worked examples before being wired to anything.
//
// WHAT #402 COVERS. Conventional high-pressure die casting in aluminium,
// magnesium, zinc/ZA and copper — the tables carry exactly those four alloy
// columns. It does NOT tabulate LPDC, gravity or sand casting: those families'
// tolerance rules remain unaudited and their register entries now name
// ISO 8062-3 as the remaining primary source.
//
// STANDARD vs PRECISION. Every table comes in two grades. Standard is "normal
// die casting production practice at the most economical level"; Precision
// "involves extra precision in die construction and/or special control in
// production" and costs more. The tool defaults to Standard — the grade a
// first quotation assumes — and takes Precision as a declared choice.
//
// THE WORKED EXAMPLES USED FOR VERIFICATION (printed in the standard):
//   S-4A-1: aluminium, E1 = 5.00 in → ±0.010 first inch + 4 × ±0.001
//           = ±0.014 in; metric ±0.25 + 4 × 0.025 = ±0.35 mm.
//   P-4A-1: same dimension → ±0.002 + 4 × 0.001 = ±0.006 in (±0.15 mm).
//   S-4A-2: aluminium, 75 in² projected area → +0.012 in (+0.30 mm);
//           Total cross-PL = ±0.35 mm linear plus +0.30 = +0.65/−0.35 mm.
//   P-4A-2: same part → ±0.15 plus +0.20 = +0.35/−0.15 mm.
//   S-4A-3: aluminium, 75 in² core-slide head, 5 in slide → MDC +0.61 mm
//           plus linear ±0.35 = +0.96/−0.35 mm.
//   S-4A-8: 10 in diagonal → 0.008 + 7 × 0.003 = 0.029 in (0.76 mm).
//   P-4A-8: same diagonal → 0.005 + 7 × 0.002 = 0.019 in (0.48 mm).
// ─────────────────────────────────────────────────────────────────────────────
import { draftGroupFor } from './nadca-die-casting.mjs';

const MM_PER_INCH = 25.4;
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * ceil() with an epsilon, because 177.8 / 25.4 is 7.000000000000001 in IEEE 754
 * and a bare Math.ceil turns the standard's "7 additional inches" into 8 —
 * caught by the S-4A-8 worked example (0.84 computed against the printed 0.76)
 * before this module was wired to anything.
 */
const ceilInches = (v) => Math.ceil(v - 1e-9);

/**
 * Linear-dimension tolerance, Tables S-4A-1-21 / P-4A-1-21 (pp. 4A-7/4A-8).
 *
 * ± base for the first 25.4 mm of the dimension, plus a ± increment for each
 * additional 25.4 mm. "Linear tolerances apply to radii and diameters as well
 * as wall thicknesses", and only to features formed in ONE die part — a
 * dimension crossing the parting line or a slide adds S-4A-2 / S-4A-3 on top.
 *
 * Metric values are the table's own metric column, not conversions — the
 * standard itself notes 0.014 in is 0.36 mm but prints ±0.35, and the metric
 * arithmetic is the one a metric drawing uses.
 */
export const LINEAR_TOLERANCE_MM = {
  standard: {
    zinc: { baseMm: 0.25, perInchMm: 0.025 },
    aluminium: { baseMm: 0.25, perInchMm: 0.025 },
    magnesium: { baseMm: 0.25, perInchMm: 0.025 },
    copper: { baseMm: 0.36, perInchMm: 0.076 },
  },
  precision: {
    zinc: { baseMm: 0.05, perInchMm: 0.025 },
    aluminium: { baseMm: 0.05, perInchMm: 0.025 },
    magnesium: { baseMm: 0.05, perInchMm: 0.025 },
    copper: { baseMm: 0.18, perInchMm: 0.05 },
  },
};

/**
 * The ± linear tolerance (TOTAL band is twice this) the standard promises for
 * a dimension of `dimensionMm` in one die part.
 */
export function linearToleranceMm(material, dimensionMm, grade = 'standard') {
  const g = draftGroupFor(material);
  if (!g.ok) return { ok: false, reason: g.reason };
  const t = LINEAR_TOLERANCE_MM[grade]?.[g.group];
  if (!t) return { ok: false, reason: `No ${grade} linear tolerance column for ${g.group}.` };
  const d = Number(dimensionMm);
  if (!(d > 0)) return { ok: false, reason: 'A linear tolerance needs the dimension it applies to.' };
  const extraInches = Math.max(0, ceilInches(d / MM_PER_INCH) - 1);
  const plusMinus = round3(t.baseMm + extraInches * t.perInchMm);
  return {
    ok: true,
    group: g.group,
    grade,
    dimensionMm: Math.round(d * 100) / 100,
    plusMinusMm: plusMinus,
    totalBandMm: round3(plusMinus * 2),
    basis: `NADCA #402 (2021) Table ${grade === 'standard' ? 'S' : 'P'}-4A-1-21: ±${t.baseMm} mm for the first 25.4 mm plus ±${t.perInchMm} mm per additional 25.4 mm, for ${g.group === 'aluminium' ? 'an' : 'a'} ${g.group} feature formed in one die part. At ${Math.round(d)} mm that is ±${plusMinus} mm.`,
  };
}

/**
 * Parting-line tolerance, Tables S-4A-2-21 / P-4A-2-21 (pp. 4A-9/4A-10).
 *
 * A PLUS-ONLY adder on dimensions measured ACROSS the parting line, as a
 * function of the projected area of the casting on the parting plane — a
 * closed die has zero separation, so the die can only blow open. Added ON TOP
 * of the S-4A-1 linear tolerance: the standard's own composition is
 * +((linear ±) + PL) / −(linear ±).
 *
 * Bands are the table's, in cm²; copper stops at 322.6 cm² and larger copper
 * castings are "consult with your die caster" — returned as not-ok with that
 * reason rather than extrapolated.
 */
const PL_BANDS_CM2 = [64.5, 129.0, 322.6, 645.2, 1290.3, 1935.5];
export const PARTING_LINE_TOLERANCE_MM = {
  standard: {
    zinc: [0.114, 0.13, 0.15, 0.23, 0.30, 0.46],
    aluminium: [0.14, 0.165, 0.19, 0.30, 0.46, 0.61],
    magnesium: [0.14, 0.165, 0.19, 0.30, 0.46, 0.61],
    copper: [0.20, 0.23, 0.25, null, null, null],
  },
  precision: {
    zinc: [0.076, 0.089, 0.102, 0.153, 0.203, 0.305],
    aluminium: [0.089, 0.102, 0.153, 0.203, 0.305, 0.406],
    magnesium: [0.089, 0.102, 0.153, 0.203, 0.305, 0.406],
    copper: [0.20, 0.23, 0.25, null, null, null],
  },
};

export function partingLineToleranceMm(material, projectedAreaCm2, grade = 'standard') {
  const g = draftGroupFor(material);
  if (!g.ok) return { ok: false, reason: g.reason };
  const col = PARTING_LINE_TOLERANCE_MM[grade]?.[g.group];
  const a = Number(projectedAreaCm2);
  if (!col || !(a > 0)) return { ok: false, reason: 'Parting-line tolerance needs the projected area on the parting plane.' };
  const band = PL_BANDS_CM2.findIndex((limit) => a <= limit);
  if (band === -1) {
    return { ok: false, reason: `Projected area ${Math.round(a)} cm² is beyond the table's 1935.5 cm²: the standard says "consult with your die caster".` };
  }
  const plus = col[band];
  if (plus == null) {
    return { ok: false, reason: `The ${g.group} column stops at 322.6 cm²; larger ${g.group} castings are "consult with your die caster".` };
  }
  return {
    ok: true, group: g.group, grade, projectedAreaCm2: Math.round(a * 10) / 10,
    plusMm: plus,
    basis: `NADCA #402 (2021) Table ${grade === 'standard' ? 'S' : 'P'}-4A-2-21: a PLUS-ONLY ${plus} mm on cross-parting-line dimensions at ${Math.round(a)} cm² projected area, added to the S-4A-1 linear tolerance. Plus-only because a closed die has zero separation - it can only blow open.`,
  };
}

/**
 * The standard's own composition: Total Cross-Parting-Line Tolerance.
 * Verified against the printed example (Al, 127 mm thick, 483.9 cm²):
 * standard +0.65/−0.35 mm, precision +0.35/−0.15 mm.
 */
export function totalCrossPartingLineToleranceMm(material, thicknessAcrossPlMm, projectedAreaCm2, grade = 'standard') {
  const lin = linearToleranceMm(material, thicknessAcrossPlMm, grade);
  if (!lin.ok) return lin;
  const pl = partingLineToleranceMm(material, projectedAreaCm2, grade);
  if (!pl.ok) return pl;
  return {
    ok: true, grade,
    plusMm: round3(lin.plusMinusMm + pl.plusMm),
    minusMm: lin.plusMinusMm,
    basis: `${lin.basis} ${pl.basis} Composed per p.4A-9: +(linear + parting line) / -(linear).`,
  };
}

/**
 * Moving-die-component (slide) tolerance, Table S-4A-3-21 (p. 4A-11).
 * Same shape as the parting-line adder, keyed on the projected area of the
 * CORE-SLIDE HEAD facing the metal. Standard grade only: the P-4A-3 table in
 * the supplied copy renders as a chart whose values did not survive
 * extraction, and a guessed precision column would be a fabricated number
 * wearing a table id.
 */
export const MDC_TOLERANCE_MM = {
  standard: {
    zinc: [0.15, 0.23, 0.33, 0.48, 0.66, 0.81],
    aluminium: [0.20, 0.33, 0.48, 0.61, 0.81, 1.0],
    magnesium: [0.20, 0.33, 0.48, 0.61, 0.81, 1.0],
    copper: [0.305, null, null, null, null, null],
  },
};

export function movingDieToleranceMm(material, slideHeadAreaCm2, grade = 'standard') {
  if (grade !== 'standard') {
    return { ok: false, reason: 'Only the Standard MDC table (S-4A-3-21) was legible in the supplied copy; the Precision values are a chart whose numbers did not survive extraction.' };
  }
  const g = draftGroupFor(material);
  if (!g.ok) return { ok: false, reason: g.reason };
  const col = MDC_TOLERANCE_MM.standard[g.group];
  const a = Number(slideHeadAreaCm2);
  if (!col || !(a > 0)) return { ok: false, reason: 'MDC tolerance needs the projected area of the core-slide head.' };
  const band = PL_BANDS_CM2.findIndex((limit) => a <= limit);
  if (band === -1 || col[band] == null) {
    return { ok: false, reason: 'Beyond the table: the standard says "consult with your die caster".' };
  }
  return {
    ok: true, group: g.group, grade, plusMm: col[band],
    basis: `NADCA #402 (2021) Table S-4A-3-21: a PLUS-ONLY ${col[band]} mm on dimensions formed by a moving die component with a ${Math.round(a)} cm² slide head, added to the S-4A-1 linear tolerance.`,
  };
}

/**
 * As-cast flatness, Tables S-4A-8-21 / P-4A-8-21 (pp. 4A-23/4A-24).
 *
 * ALL ALLOYS, one column: flatness is a property of the die and the thermal
 * history, not the alloy. Keyed on the LARGEST dimension of the surface — the
 * diameter of a circular face or the diagonal of a rectangular one.
 * Verified against both printed examples (254 mm → 0.76 / 0.48 mm).
 */
export const FLATNESS_MM = {
  standard: { baseMm: 0.20, perInchMm: 0.08 },
  precision: { baseMm: 0.13, perInchMm: 0.05 },
};
const FLATNESS_BASE_SPAN_MM = 76.2;   // the base covers the first 3.00 in

export function flatnessToleranceMm(largestDimensionMm, grade = 'standard') {
  const t = FLATNESS_MM[grade];
  const d = Number(largestDimensionMm);
  if (!t || !(d > 0)) return { ok: false, reason: 'Flatness capability needs the largest dimension of the surface (diameter or diagonal).' };
  const extraInches = Math.max(0, ceilInches((d - FLATNESS_BASE_SPAN_MM) / MM_PER_INCH));
  const tol = round3(t.baseMm + extraInches * t.perInchMm);
  return {
    ok: true, grade, largestDimensionMm: Math.round(d), toleranceMm: tol,
    basis: `NADCA #402 (2021) Table ${grade === 'standard' ? 'S' : 'P'}-4A-8-21, all alloys: ${t.baseMm} mm up to 76.2 mm largest dimension plus ${t.perInchMm} mm per additional 25.4 mm. At ${Math.round(d)} mm that is ${tol} mm.`,
  };
}

/**
 * Machining stock, S/P-4A-13-21 (p. 4A-34): "Normal minimum machining
 * allowance is 0.010 in. (0.25 mm) to avoid excessive tool wear and minimize
 * exposure of porosity." Pairs with the 0.38-0.50 mm chilled skin from the
 * design book: stock should sit in the 0.25-0.50 mm band — enough to clean up,
 * shallow enough to stay in dense metal.
 */
export const MACHINING_STOCK = {
  minMm: 0.25,
  basis: 'NADCA #402 (2021) S/P-4A-13-21 p.4A-34: normal minimum machining allowance is 0.010 in (0.25 mm), to avoid excessive tool wear and minimise exposure of porosity.',
};
