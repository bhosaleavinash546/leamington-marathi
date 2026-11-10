/**
 * ISO 286-1:2010 — standard tolerance grades and fundamental deviations, transcribed for nominal sizes up to 500 mm,
 * grades IT5–IT14, and the letters in everyday use (shafts d e f g h js k m n p r s; holes D E F G H JS K M N P R S).
 *
 * Source: ISO 286-1:2010, Table 1 (standard tolerance grade values), Tables 2 and 3 (fundamental deviations of holes
 * A–M and N–ZC), Tables 4 and 5 (fundamental deviations of shafts a–j and k–zc). Values in micrometres.
 * Checked against the published limits of ISO 286-2 for the fits pinned in tests/drawing-extract.test.ts
 * (H7, g6, h6, k6, m6, n6, p6, r6, s6, f7, e8, d9, js6, F8, G7, E9, D10, K7, M7, N7, N9, P7, P9, R7, S7).
 *
 * Letters or grades outside this table are NOT computed: the fit is reported as written, without limits.
 */

/** Upper bounds of the main size steps, mm ("over … up to and including"). */
export const SIZE_STEPS = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500] as const;

/** Table 1 — IT values in µm per size step, for IT5 … IT14. */
export const IT: Record<number, readonly number[]> = {
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
  12: [100, 120, 150, 180, 210, 250, 300, 350, 400, 460, 520, 570, 630],
  13: [140, 180, 220, 270, 330, 390, 460, 540, 630, 720, 810, 890, 970],
  14: [250, 300, 360, 430, 520, 620, 740, 870, 1000, 1150, 1300, 1400, 1550],
};

/** Shafts d–g: UPPER deviation es (µm) per main size step. Holes D–G take EI = −es. */
export const SHAFT_ES: Record<string, readonly number[]> = {
  d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230],
  e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135],
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** Shafts k (grades IT4–IT7), m, n, p: LOWER deviation ei (µm) per main size step. */
export const SHAFT_EI: Record<string, readonly number[]> = {
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5],
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68],
};

/** Shafts r and s: LOWER deviation ei (µm) on the finer size steps the standard uses for them. */
export const FINE_STEPS = [3, 6, 10, 18, 30, 50, 65, 80, 100, 120, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500] as const;
export const SHAFT_EI_FINE: Record<string, readonly number[]> = {
  r: [10, 15, 19, 23, 28, 34, 41, 43, 51, 54, 63, 65, 68, 77, 80, 84, 94, 98, 108, 114, 126, 132],
  s: [14, 19, 23, 28, 35, 43, 53, 59, 71, 79, 92, 100, 108, 122, 130, 140, 158, 170, 190, 208, 232, 252],
};

function step(size: number, steps: readonly number[]): number {
  for (let i = 0; i < steps.length; i++) if (size <= steps[i]) return i;
  return -1;
}

export interface FitLimits { upper: number; lower: number; itMicron: number; basis: string }

/** µm → mm, kept to a tenth of a micrometre (js grades give half micrometres). */
const r4 = (um: number): number => Math.round(um * 10) / 10000 + 0;

/**
 * Limit deviations in mm of a tolerance class ("H7", "g6", "js9") at a nominal size, or undefined when the size, the
 * letter or the grade is outside the transcribed tables.
 */
export function fitLimits(nominalMm: number, letter: string, grade: number): FitLimits | undefined {
  if (!(nominalMm > 0) || nominalMm > 500) return undefined;
  const it = IT[grade];
  if (!it) return undefined;
  const i = step(nominalMm, SIZE_STEPS);
  if (i < 0) return undefined;
  const T = it[i];
  const range = `${i === 0 ? '0' : SIZE_STEPS[i - 1]}–${SIZE_STEPS[i]} mm`;
  const done = (upper: number, lower: number): FitLimits => ({ upper: r4(upper), lower: r4(lower), itMicron: T, basis: `ISO 286-1: IT${grade} = ${T} µm for ${range}` });
  const isHole = letter === letter.toUpperCase() && letter !== letter.toLowerCase();
  const l = letter.toLowerCase();
  if (l === 'js') return done(T / 2, -T / 2);
  const shaftEi = (): number | undefined => {
    if (l in SHAFT_EI) return SHAFT_EI[l][i];
    if (l in SHAFT_EI_FINE) { const j = step(nominalMm, FINE_STEPS); return j < 0 ? undefined : SHAFT_EI_FINE[l][j]; }
    return undefined;
  };
  if (!isHole) {
    if (l in SHAFT_ES) { const es = SHAFT_ES[l][i]; return done(es, es - T); }
    if (l === 'k') { const ei = grade >= 4 && grade <= 7 ? SHAFT_EI.k[i] : 0; return done(ei + T, ei); }
    const ei = shaftEi();
    return ei === undefined ? undefined : done(ei + T, ei);
  }
  // holes
  if (l in SHAFT_ES) { const EI = -SHAFT_ES[l][i]; return done(EI + T, EI); }
  // K, M, N up to IT8 and P–ZC up to IT7: ES = −ei + Δ, with Δ = ITn − IT(n−1). No Δ for sizes up to 3 mm.
  const prev = IT[grade - 1];
  const delta = nominalMm <= 3 ? 0 : (prev ? T - prev[i] : undefined);
  if (l === 'k') {
    if (grade > 8) return undefined;
    if (delta === undefined) return undefined;
    const ES = -SHAFT_EI.k[i] + delta;
    return done(ES, ES - T);
  }
  if (l === 'm') {
    if (grade <= 8) {
      if (delta === undefined) return undefined;
      // ISO 286-1 Table 3, note: M6 for 250–315 mm is −9, not the −11 the rule gives
      const ES = grade === 6 && i === 10 ? -9 : -SHAFT_EI.m[i] + delta;
      return done(ES, ES - T);
    }
    const ES = -SHAFT_EI.m[i];
    return done(ES, ES - T);
  }
  if (l === 'n') {
    if (grade <= 8) { if (delta === undefined) return undefined; const ES = -SHAFT_EI.n[i] + delta; return done(ES, ES - T); }
    const ES = nominalMm <= 3 ? -4 : 0;
    return done(ES, ES - T);
  }
  if (l === 'p' || l === 'r' || l === 's') {
    const ei = shaftEi();
    if (ei === undefined) return undefined;
    if (grade <= 7) { if (delta === undefined) return undefined; const ES = -ei + delta; return done(ES, ES - T); }
    return done(-ei, -ei - T);
  }
  return undefined;
}

/** Letters this table computes. */
export const FIT_LETTERS = ['d', 'e', 'f', 'g', 'h', 'js', 'k', 'm', 'n', 'p', 'r', 's', 'D', 'E', 'F', 'G', 'H', 'JS', 'K', 'M', 'N', 'P', 'R', 'S'] as const;
