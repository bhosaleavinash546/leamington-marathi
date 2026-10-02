/**
 * Forming properties of the sheet grades, and the forming-limit check.
 *
 * The rate library prices a grade; it does not say how the grade forms. These
 * are the three numbers a one-step forming solve and a formability check need
 * — the strain-hardening exponent n, the normal anisotropy r and the strength
 * coefficient K of σ̄ = K·ε̄ⁿ — for every sheet grade the library carries, with
 * a family fallback. They are TYPICAL PUBLISHED VALUES, labelled as such: the
 * numbers a materials handbook or a supplier datasheet gives for the grade,
 * not JLR's measured coil data. Replace them with the grade data the plant
 * uses as soon as it is to hand; nothing else in the chain changes.
 *
 * The forming limit is Keeler–Brazier (1977): the plane-strain limit
 * FLC₀ = ln(1 + (23.3 + 14.13·t)·n / 21) in true strain, for t in mm and
 * n capped at 0.21 (the correlation's range), with the left branch at slope
 * −1 and the right branch at slope 0.6 — the standard shape of the curve for
 * steels, and a conservative one for aluminium, whose curves sit lower and
 * flatter. The verdict is the worst point's major strain against the limit at
 * its minor strain: under 0.8 passes, 0.8–1.0 is marginal (the usual 10–20%
 * safety band), above 1.0 the metal splits.
 */
import type { MaterialFamily } from './material-family.js';

export interface FormingProperties {
  /** Strain-hardening exponent. */
  nValue: number;
  /** Normal anisotropy (Lankford). */
  rValue: number;
  /** Strength coefficient, MPa, of σ̄ = K·ε̄ⁿ. */
  kMPa: number;
  /** Where the numbers came from. */
  source: string;
  /** True when a grade-specific entry was found; false on the family fallback. */
  gradeSpecific: boolean;
}

const TYPICAL = 'typical published value for the grade (handbook / supplier datasheet range), not measured coil data';

/** By rate-library material id. */
const BY_ID: Record<string, Omit<FormingProperties, 'source' | 'gradeSpecific'>> = {
  'mat-dc01':        { nValue: 0.21, rValue: 1.6, kMPa: 530 },
  'mat-dc01-gi':     { nValue: 0.21, rValue: 1.6, kMPa: 530 },
  'mat-dc01-ze':     { nValue: 0.21, rValue: 1.6, kMPa: 530 },
  'mat-dc03-ga':     { nValue: 0.22, rValue: 1.8, kMPa: 520 },
  'mat-hrpo':        { nValue: 0.18, rValue: 1.0, kMPa: 600 },
  'mat-hsla340':     { nValue: 0.16, rValue: 1.0, kMPa: 680 },
  'mat-hsla420':     { nValue: 0.14, rValue: 0.9, kMPa: 760 },
  'mat-dp600':       { nValue: 0.15, rValue: 0.9, kMPa: 980 },
  'mat-22mnb5':      { nValue: 0.10, rValue: 0.9, kMPa: 900 },   // as delivered; formed hot, where these do not apply
  'mat-aa5182':      { nValue: 0.30, rValue: 0.7, kMPa: 500 },
  'mat-aa5052':      { nValue: 0.12, rValue: 0.6, kMPa: 380 },
  'mat-aa5083':      { nValue: 0.25, rValue: 0.7, kMPa: 480 },
  'mat-aa5754-sheet': { nValue: 0.22, rValue: 0.7, kMPa: 430 },
  'mat-aa6061-sheet': { nValue: 0.06, rValue: 0.6, kMPa: 400 },
  'mat-aa6082-sheet': { nValue: 0.08, rValue: 0.6, kMPa: 420 },
  'mat-aa6063-sheet': { nValue: 0.10, rValue: 0.6, kMPa: 300 },
  'mat-aa3003-sheet': { nValue: 0.10, rValue: 0.6, kMPa: 220 },
  'mat-ss304-sheet': { nValue: 0.45, rValue: 1.0, kMPa: 1400 },
  'mat-ss316-sheet': { nValue: 0.40, rValue: 1.0, kMPa: 1300 },
  'mat-aisi430':     { nValue: 0.20, rValue: 1.2, kMPa: 800 },
  'mat-c110-copper': { nValue: 0.40, rValue: 0.8, kMPa: 450 },
};

const BY_FAMILY: Partial<Record<MaterialFamily, Omit<FormingProperties, 'source' | 'gradeSpecific'>>> = {
  steel:          { nValue: 0.20, rValue: 1.4, kMPa: 600 },
  aluminium:      { nValue: 0.22, rValue: 0.7, kMPa: 450 },
  'copper alloy': { nValue: 0.35, rValue: 0.8, kMPa: 500 },
};

/** The forming properties for a grade, else its family's, else null. */
export function formingPropertiesFor(materialId: string | null | undefined, family: MaterialFamily | null | undefined): FormingProperties | null {
  if (materialId && BY_ID[materialId]) {
    return { ...BY_ID[materialId], source: `${materialId}: ${TYPICAL}`, gradeSpecific: true };
  }
  if (family && BY_FAMILY[family]) {
    return { ...BY_FAMILY[family]!, source: `${family} family fallback — no grade entry; ${TYPICAL}`, gradeSpecific: false };
  }
  return null;
}

/** Keeler–Brazier plane-strain forming limit, true strain. */
export function flc0(nValue: number, thicknessMm: number): number {
  const n = Math.min(0.21, Math.max(0.02, nValue));
  const t = Math.min(3.1, Math.max(0.3, thicknessMm));
  return Math.log(1 + ((23.3 + 14.13 * t) * n) / 21);
}

/** Major-strain limit at a minor strain (true strains). */
export function flcLimit(nValue: number, thicknessMm: number, minorStrain: number): number {
  const f0 = flc0(nValue, thicknessMm);
  return minorStrain < 0 ? f0 - minorStrain : f0 + 0.6 * minorStrain;
}

export interface FormingLimitCheck {
  flc0: number;
  /** Worst major strain ÷ its limit; 0 when no point strains. */
  worstRatio: number;
  worst: { major: number; minor: number; limit: number } | null;
  verdict: 'pass' | 'marginal' | 'fail';
  /** Thinning at the worst point, percent of gauge. */
  thinningPct: number;
}

/** Check (major, minor) true-strain pairs against the curve. */
export function formingLimitCheck(points: Array<[number, number]>, nValue: number, thicknessMm: number): FormingLimitCheck {
  let worst: FormingLimitCheck['worst'] = null;
  let worstRatio = 0;
  for (const [e1, e2] of points) {
    if (!(e1 > 0)) continue;
    const limit = flcLimit(nValue, thicknessMm, e2);
    const ratio = e1 / limit;
    if (ratio > worstRatio) { worstRatio = ratio; worst = { major: e1, minor: e2, limit }; }
  }
  const verdict = worstRatio > 1 ? 'fail' : worstRatio > 0.8 ? 'marginal' : 'pass';
  const thinning = worst ? (1 - Math.exp(-(worst.major + worst.minor))) * 100 : 0;
  return { flc0: flc0(nValue, thicknessMm), worstRatio, worst, verdict, thinningPct: thinning };
}
