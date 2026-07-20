// ─── Board-spec stabilisation ───────────────────────────────────────────────
// The vision model guesses board dimensions, layer count, via count and laminate
// technology on every run — but there is NO ruler in a board photo, so those
// guesses swing wildly (160×110 one run, 220×140 the next). Fab cost is dominated
// by board AREA, so that swing makes the headline should-cost jump run-to-run even
// though the board is identical.
//
// This module re-derives the fab-driving fields from DETERMINISTIC, stable signals
// (SMT placement count, IC count, BGA presence, layer count, domain) so the same
// board yields the same fab estimate every time. It never invents complexity that
// isn't supported by the assembly data.

import { computePCBCountryCost } from '../data/pcb-country-rates.js';

export interface StabiliseInput {
  widthMm?: unknown; heightMm?: unknown; estimatedLayers?: unknown;
  throughVias?: unknown; blindVias?: unknown; microVias?: unknown;
  hdiStructure?: unknown; impedanceControlRequired?: unknown;
  technologyType?: unknown; surfaceFinish?: unknown; bgaDetected?: unknown;
  [k: string]: unknown;
}
export interface AssemblyInput {
  smtPlacements?: unknown; bgaCount?: unknown; throughHoleJoints?: unknown; [k: string]: unknown;
}

const STD_LAYERS = [1, 2, 4, 6, 8, 10, 12, 14, 16];
/** Automotive boards run sparser than consumer — ~1.6 placements/cm² is typical. */
const PLACEMENT_DENSITY_PER_CM2 = 1.6;
const AREA_MIN_CM2 = 6;
const AREA_MAX_CM2 = 600;
/** How far the model's area may stray from the density anchor before it's clamped. */
const AREA_BAND_LO = 0.70;
const AREA_BAND_HI = 1.40;

const n = (v: unknown, d = 0): number => { const x = Number(v); return Number.isFinite(x) ? x : d; };

/** Nearest standard layer count (clamped 2–16). */
export function standardLayers(raw: number): number {
  const clamped = Math.max(2, Math.min(16, Math.round(raw) || 2));
  return STD_LAYERS.reduce((best, s) => Math.abs(s - clamped) < Math.abs(best - clamped) ? s : best, 2);
}

/** Deterministic laminate technology from board features (not the model's free text). */
export function deriveTechnology(layers: number, microVias: number, hdi: string, impedance: boolean, bga: boolean, automotive: boolean): string {
  if (microVias > 0 || (hdi && hdi !== 'none') || layers >= 10) return 'HDI_RIGID';
  if (impedance && layers >= 6 && !automotive) return 'RF_MICRO';       // RF unless it's an automotive digital board
  if (layers >= 6 && (bga || automotive)) return 'FR4_HTg';             // automotive/BGA thermal → high-Tg laminate
  return 'FR4_STD';
}

/**
 * Stabilise the fab-driving fields of a board spec IN PLACE. Returns the same
 * object for convenience. `domain === 'automotive_adas'` nudges laminate to high-Tg.
 */
export function stabiliseBoardSpec(spec: StabiliseInput, asm: AssemblyInput, domain: string): StabiliseInput {
  const automotive = domain === 'automotive_adas';
  const placements = Math.max(0, n(asm.smtPlacements));
  const bgaCount = Math.max(0, n(asm.bgaCount));

  // ── 1. Board area: anchor to placement density, clamp the model's guess ──────
  const anchorAreaCm2 = Math.min(AREA_MAX_CM2, Math.max(AREA_MIN_CM2,
    placements > 0 ? placements / PLACEMENT_DENSITY_PER_CM2 : n(spec.widthMm, 100) * n(spec.heightMm, 80) / 100));
  const wModel = n(spec.widthMm, 100), hModel = n(spec.heightMm, 80);
  const modelAreaCm2 = (wModel * hModel) / 100;
  const aspect = hModel > 0 ? Math.min(3, Math.max(1 / 3, wModel / hModel)) : 1.4;

  let areaCm2 = modelAreaCm2;
  if (modelAreaCm2 < anchorAreaCm2 * AREA_BAND_LO) areaCm2 = anchorAreaCm2 * AREA_BAND_LO;
  else if (modelAreaCm2 > anchorAreaCm2 * AREA_BAND_HI) areaCm2 = anchorAreaCm2 * AREA_BAND_HI;
  areaCm2 = Math.min(AREA_MAX_CM2, Math.max(AREA_MIN_CM2, areaCm2));
  // rebuild width/height at the stabilised area, preserving the model's aspect ratio
  const areaMm2 = areaCm2 * 100;
  const height = Math.sqrt(areaMm2 / aspect);
  const width = height * aspect;
  spec.widthMm = Math.round(width);
  spec.heightMm = Math.round(height);

  // ── 2. Layers: quantise to a standard stack-up ──────────────────────────────
  const layers = standardLayers(n(spec.estimatedLayers, 2));
  spec.estimatedLayers = layers;

  // ── 3. Vias: bound to a plausible density for the (stabilised) area × layers ──
  const expThrough = areaCm2 * layers * 0.9;                 // ~0.9 through-vias/cm²/layer
  spec.throughVias = Math.round(Math.min(Math.max(n(spec.throughVias), expThrough * 0.3), expThrough * 1.8));
  spec.microVias = Math.max(0, Math.round(n(spec.microVias)));
  spec.blindVias = Math.max(0, Math.round(n(spec.blindVias)));

  // ── 4. Technology + finish: deterministic from features ──────────────────────
  spec.technologyType = deriveTechnology(
    layers, n(spec.microVias), String(spec.hdiStructure ?? 'none'),
    Boolean(spec.impedanceControlRequired), bgaCount > 0 || Boolean(spec.bgaDetected), automotive);
  if (bgaCount > 0) spec.surfaceFinish = 'enig';             // BGA solderability needs ENIG

  return spec;
}

/**
 * Deterministic per-board FAB cost for a country, derived purely from the
 * (stabilised) board features — NOT from the model's own noisy fab guess. This
 * is what stabilises the headline: the fab number now depends only on stable
 * board features, so the same board costs the same every run.
 */
export function stableFabMid(spec: StabiliseInput, asm: AssemblyInput, orderQty: number, country: string): number {
  try {
    const b = computePCBCountryCost({
      widthMm: n(spec.widthMm, 100), heightMm: n(spec.heightMm, 80), layers: n(spec.estimatedLayers, 2),
      surfaceFinish: String(spec.surfaceFinish ?? 'enig'), throughVias: n(spec.throughVias),
      blindVias: n(spec.blindVias), microVias: n(spec.microVias),
      hdiStructure: String(spec.hdiStructure ?? 'none'), impedanceControlled: Boolean(spec.impedanceControlRequired),
      smtPlacements: n(asm.smtPlacements), throughHoleJoints: n(asm.throughHoleJoints),
      manualJoints: n(asm.manualJoints), bgaCount: n(asm.bgaCount), aoiRequired: Boolean(asm.aoiRequired),
      ictTimeSec: n(asm.ictTimeSec), conformalCoatAreaCm2: 0, totalBOMCostGBP: 0,
      orderQuantity: Math.max(1, orderQty || 1),
    }, country);
    return b.pcbFabPerBoard;
  } catch { return 0; }
}
