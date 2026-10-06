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
  layersSource?: unknown; viasSource?: unknown;
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
/**
 * The physical density band an ESTIMATED size must sit in (placements per cm² per populated side).
 * It used to be ±30–40% around 1.6/cm² — right for a sparse ECU, but it turned a 20×20 mm automotive
 * camera module (80 parts on two sides, ~10/cm² a side; board data sheet: 20.0 × 20.0 mm) into
 * 59×59 mm, 8.7× the area, and the fab price with it (Oct 2026). A size is now changed only when
 * the density it implies is not buildable (denser than a phone board) or not credible (near-empty).
 */
const MAX_DENSITY_PER_SIDE_CM2 = 30;
const MIN_DENSITY_CM2 = 0.4;

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
 * Copper per layer (oz) from a board spec: the per-layer list when the board data
 * gave one (e.g. 70/70/35/35/35/35/70/70 µm), else the single copperWeightOz on the
 * two outer layers, else undefined (1 oz everywhere).
 */
export function copperLayersFromSpec(spec: Record<string, unknown>): number[] | undefined {
  const list = spec.copperOzByLayer;
  if (Array.isArray(list) && list.length > 0) return list.map(v => Math.max(0.5, n(v, 1)));
  const oz = n(spec.copperWeightOz, 1);
  const layers = Math.max(1, Math.round(n(spec.estimatedLayers, 2)));
  if (oz <= 1) return undefined;
  return Array.from({ length: layers }, (_, i) => (i === 0 || i === layers - 1 ? oz : 1));
}

/** Measured board weight (boardWeightG, grams) → kg, when the board data gives it. */
export function weightKgFromSpec(spec: Record<string, unknown>): number | undefined {
  const g = n(spec.boardWeightG, 0);
  return g > 0 ? g / 1000 : undefined;
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

  // A MEASURED size (read off a label, drawing, board-data sheet or ruler, or typed
  // by the user) is ground truth and is kept exactly. Only an ESTIMATED size is
  // pulled toward the placement-density anchor — that clamp exists to stop two
  // reads of one board disagreeing, and it assumes ~1.6 placements/cm², so it
  // turned a measured 87.8×48.9 mm automotive radar board (7.6/cm²) into 161×89.
  const measured = String(spec.dimensionsSource ?? '').toLowerCase() === 'measured'
    && modelAreaCm2 >= AREA_MIN_CM2 && modelAreaCm2 <= AREA_MAX_CM2;
  let areaCm2 = modelAreaCm2;
  if (!measured) {
    const sides = Math.max(1, Math.min(2, Math.round(n(asm.reflowSides, 1)) || 1));
    const minArea = placements > 0 ? placements / (MAX_DENSITY_PER_SIDE_CM2 * sides) : AREA_MIN_CM2;
    const maxArea = placements > 0 ? Math.max(minArea, placements / MIN_DENSITY_CM2) : AREA_MAX_CM2;
    if (!(modelAreaCm2 > 0)) areaCm2 = anchorAreaCm2;
    else if (modelAreaCm2 < minArea) areaCm2 = minArea;
    else if (modelAreaCm2 > maxArea) areaCm2 = maxArea;
    areaCm2 = Math.min(AREA_MAX_CM2, Math.max(Math.min(AREA_MIN_CM2, modelAreaCm2 > 0 ? modelAreaCm2 : AREA_MIN_CM2), areaCm2));
    // rebuild width/height at the stabilised area, preserving the model's aspect ratio
    const areaMm2 = areaCm2 * 100;
    const height = Math.sqrt(areaMm2 / aspect);
    const width = height * aspect;
    spec.widthMm = Math.round(width);
    spec.heightMm = Math.round(height);
  }

  // ── 2. Layers: quantise to a standard stack-up ──────────────────────────────
  // A layer count read from the fab data (copper-layer files) is kept as is.
  const layers = String(spec.layersSource ?? '') === 'measured' && n(spec.estimatedLayers) >= 1
    ? Math.round(n(spec.estimatedLayers)) : standardLayers(n(spec.estimatedLayers, 2));
  spec.estimatedLayers = layers;

  // ── 3. Vias: bound to a plausible density for the (stabilised) area × layers ──
  const expThrough = areaCm2 * layers * 0.9;                 // ~0.9 through-vias/cm²/layer
  // Upper bound 4× the norm: via-fenced RF/radar and shielded boards run 3–4× a
  // plain board's density (the 77 GHz radar board: ~1,000 vias on 43 cm², 3.2×).
  // It was 1.8×, which cut that board's vias to 556.
  // A via count from the drill file is ground truth — the density band is for guesses.
  spec.throughVias = String(spec.viasSource ?? '') === 'measured'
    ? Math.max(0, Math.round(n(spec.throughVias)))
    : Math.round(Math.min(Math.max(n(spec.throughVias), expThrough * 0.3), expThrough * 4));
  spec.microVias = Math.max(0, Math.round(n(spec.microVias)));
  spec.blindVias = Math.max(0, Math.round(n(spec.blindVias)));

  // ── 4. Technology + finish: deterministic from features ──────────────────────
  spec.technologyType = deriveTechnology(
    layers, n(spec.microVias), String(spec.hdiStructure ?? 'none'),
    Boolean(spec.impedanceControlRequired), bgaCount > 0 || Boolean(spec.bgaDetected), automotive);
  // HASL is not flat enough for fine-pitch BGA — move those to ENIG. A stated
  // flat finish (immersion silver, OSP, ENEPIG, ENIG) is kept: this used to force
  // ENIG onto every BGA board, overwriting a board's real immersion-silver finish.
  const finish = String(spec.surfaceFinish ?? '').toLowerCase();
  if (bgaCount > 0 && (finish === '' || finish.startsWith('hasl'))) spec.surfaceFinish = 'enig';

  return spec;
}

/**
 * Deterministic per-board FAB cost for a country, derived purely from the
 * (stabilised) board features — NOT from the model's own noisy fab guess. This
 * is what stabilises the headline: the fab number now depends only on stable
 * board features, so the same board costs the same every run.
 */
export function stableFabMid(spec: StabiliseInput, asm: AssemblyInput, orderQty: number, country: string, automotive = false): number {
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
      copperOzByLayer: copperLayersFromSpec(spec), weightKg: weightKgFromSpec(spec),
    }, country);
    // The headline "PCB Fabrication" band covers ALL non-BOM manufacturing (the
    // total is BOM + this), so include SMT/TH assembly + AOI/X-ray/ICT, not just
    // the bare board. Automotive adds an IATF-16949 + high-Tg + IPC-6012 Class 3
    // inspection premium on the FAB portion (~30%).
    const fab = automotive ? b.pcbFabPerBoard * 1.30 : b.pcbFabPerBoard;
    return fab + b.assemblyPerBoard;
  } catch { return 0; }
}
