// ─────────────────────────────────────────────────────────────────────────────
// Feature-based stamping should-cost — the accuracy upgrade for sheet metal.
//
// The parametric engine stamps at a FLAT machine rate (120 €/hr) with a FIXED
// nesting utilisation (0.62) for every part, so it cannot tell a 1,000-tonne
// deep-drawn body panel (slow, expensive press) from a 63-tonne flat bracket
// (fast, cheap press), and it uses the same web-scrap for a compact part and an
// L-shaped one. This module drives cost from GEOMETRY:
//
//   tonnage  = blanking (perimeter × t × shear) + forming (proj. area × draw)
//              → selects the PRESS TIER (rate €/hr and strokes/min)
//   material = blank area (part area ÷ geometry-driven nesting utilisation)
//              × t × density, with a scrap credit on the skeleton web
//   cycle    = 60 ÷ strokes-per-minute + handling
//   tooling  = progressive-die cost (size × stations × tonnage) amortised
//
// Deterministic + unit-testable. The mass model's blind spots (press tier,
// geometry utilisation, thickness) are exactly what this expresses.
// ─────────────────────────────────────────────────────────────────────────────
import { MATERIALS, REGIONS } from './costing-engine.mjs';

const round = (x, dp = 2) => Number(Number(x).toFixed(dp));

// Shear strength (MPa) for blanking tonnage, by family + exact overrides.
const SHEAR = { ferrous: 320, aluminium: 170, castiron: 300, copper: 200, zinc: 120, magnesium: 140, titanium: 550, plastic: 40, composite: 120 };
const SHEAR_OVERRIDE = { 'Steel (high-strength)': 600, 'Stainless Steel 304': 520, 'Steel (mild)': 300 };
const shearFor = (key, family) => SHEAR_OVERRIDE[key] ?? SHEAR[family] ?? 320;

// Press tiers: max clamp tonnage → { rate €/hr fully-burdened, spm strokes/min }.
// Bigger presses cost far more per hour and cycle slower — the mass model's flat
// 120 €/hr can't express this.
// rate = fully-burdened stamping LINE €/hr (press + coil line + automation, not
// bare press). spm is nominal; an OEE factor derates effective throughput.
const PRESS_TIERS = [
  { maxT: 63,   rate: 70,  spm: 45 },
  { maxT: 160,  rate: 95,  spm: 32 },
  { maxT: 400,  rate: 140, spm: 22 },
  { maxT: 800,  rate: 200, spm: 15 },
  { maxT: 1600, rate: 280, spm: 10 },
  { maxT: Infinity, rate: 360, spm: 7 },
];
const OEE = 0.72;   // effective vs nominal strokes/min (changeover, jams, blank feed)
const pressFor = (tonnes) => PRESS_TIERS.find(t => tonnes <= t.maxT) || PRESS_TIERS[PRESS_TIERS.length - 1];

const TOL = { standard: 1.0, tight: 1.15, precision: 1.35 };

/**
 * @param {object} p
 * @param {object} p.geometry { boundingBoxMm:{x,y,z}, partVolumeCm3, surfaceAreaCm2, thicknessMm }
 * @param {string} p.material
 * @param {string} [p.region='Germany']
 * @param {number} [p.annualVolume=200000]
 * @param {number} [p.bends=2]              forming complexity (bends/draws)
 * @param {number} [p.drawDepthMm=0]        deep-draw depth (0 = flat/shallow)
 * @param {number} [p.materialUtilisation]  nesting yield 0-1 (else geometry-derived)
 * @param {number} [p.programYears=5]
 * @param {string} [p.toleranceClass='standard']
 */
export function stampingFeatureCost(p, library = undefined) {
  const MAT = library?.MATERIALS || MATERIALS;
  const REG = library?.REGIONS || REGIONS;
  const mat = MAT[p.material];
  if (!mat) throw new Error(`Unknown material: ${p.material}`);
  if (!['ferrous', 'aluminium', 'castiron', 'copper', 'titanium', 'zinc', 'magnesium'].includes(mat.family)) {
    throw new Error(`${p.material} (${mat.family}) is not a sheet-stampable metal`);
  }
  const reg = REG[p.region] || REG.Germany;
  const g = p.geometry || {};
  const bb = g.boundingBoxMm || {};
  const bx = Math.max(1, Number(bb.x) || 0), by = Math.max(1, Number(bb.y) || 0);
  const partVolCm3 = Number(g.partVolumeCm3);
  if (!(partVolCm3 > 0)) throw new Error('partVolumeCm3 required for feature-based stamping');

  // Thickness: given, or inferred from a thin part (vol = sheetArea × t; SA ≈ 2·sheetArea → t ≈ 2·vol/SA).
  let tMm = Number(g.thicknessMm);
  if (!(tMm > 0)) {
    const saCm2 = Number(g.surfaceAreaCm2) > 0 ? Number(g.surfaceAreaCm2) : 6 * Math.cbrt(partVolCm3) ** 2;
    tMm = Math.max(0.4, Math.min(6, (2 * partVolCm3 * 10) / saCm2));   // cm→mm via ×10 on one axis
  }
  const tCm = tMm / 10;
  const bends = Math.max(0, Math.min(20, Math.round(Number.isFinite(Number(p.bends)) ? Number(p.bends) : 2)));
  const drawDepthMm = Math.max(0, Number(p.drawDepthMm) || 0);
  const tol = TOL[p.toleranceClass] ?? 1.0;

  // Part sheet area (cm²) = volume / thickness.
  const partAreaCm2 = partVolCm3 / tCm;
  // Nesting utilisation: geometry-driven. Compact rectangles nest well; slender or
  // draw-heavy parts waste web. Bounded 0.40–0.80.
  const aspect = Math.max(bx, by) / Math.min(bx, by);
  let util = Number(p.materialUtilisation);
  if (!(util > 0 && util <= 0.95)) {
    util = 0.78 - Math.min(0.22, (aspect - 1) * 0.06) - Math.min(0.12, bends * 0.015) - (drawDepthMm > 0 ? 0.08 : 0);
    util = Math.max(0.40, Math.min(0.80, util));
  }
  const blankAreaCm2 = partAreaCm2 / util;

  // ── Tonnage ──
  const shear = shearFor(p.material, mat.family);          // MPa = N/mm²
  const blankPerimeterMm = Math.max(2 * (bx + by), 3.5 * Math.sqrt(partAreaCm2 * 100)); // mm; compact-shape floor
  const blankTonnes = (blankPerimeterMm * tMm * shear) / 1000 / 9.81;    // kN → tonnes-force
  const projAreaMm2 = bx * by;
  const formPressureMPa = (drawDepthMm > 0 ? 2.8 : 0.7) * (1 + bends * 0.05);   // draw needs far more than a simple form
  const formTonnes = (projAreaMm2 * formPressureMPa) / 1000 / 9.81;
  // Deep draws also need blank-holder force over the whole blank (often ≈ draw force).
  const blankAreaMm2 = blankAreaCm2 * 100;
  const holderTonnes = drawDepthMm > 0 ? (blankAreaMm2 * 0.45) / 1000 / 9.81 : 0;
  const tonnage = blankTonnes + formTonnes + holderTonnes;
  const press = pressFor(tonnage);

  // Press operations: a simple progressive part is one stroke; a deep-drawn/
  // complex part runs a tandem/transfer line (draw → trim → flange → pierce),
  // each op a press hit accumulating press+labour cost.
  const pressOps = drawDepthMm > 0
    ? Math.max(2, Math.min(5, 2 + Math.floor(bends / 2) + (drawDepthMm > 60 ? 1 : 0)))
    : 1;

  // ── Cycle (OEE-derated throughput) ──
  const strokeSec = 60 / (press.spm * OEE);
  const handlingSec = drawDepthMm > 0 || bends > 4 ? 2.5 : 1.0;   // transfer/robot handling
  const cycleSec = (strokeSec * pressOps + handlingSec) * tol;

  // ── Per-part conversion ──
  const cycleHr = cycleSec / 3600;
  const machine = cycleHr * press.rate;
  const labour = cycleHr * reg.labour * (Number(p.operators) || 0.3);   // stamping is highly automated
  const batch = Math.max(500, Math.min(20000, Math.round((Number(p.annualVolume) || 200000) / 40)));
  const setup = ((Number(p.setupHr) || 2.0) * (press.rate + reg.labour)) / batch;

  // ── Secondary operations (deburr / wash / inspect / pack) ──
  // Universal for stamped automotive parts and entirely absent from the raw
  // press cost above; the flat-rate mass model buries them in its blended rate.
  // Deburr/handling scale with blank edge length; inspection with feature count;
  // wash+pack a small per-part floor. All geometry-driven, not anchor-fitted.
  const perimeterCm = blankPerimeterMm / 10;
  const deburrSec = perimeterCm * 0.08 * (tol);                 // edge length to relieve
  const inspectSec = 1.2 + bends * 0.4 + (drawDepthMm > 0 ? 2 : 0); // dimensional check
  const secondaryHr = (deburrSec + inspectSec) / 3600;
  const secondary = secondaryHr * (reg.labour + 25) + 0.012;   // small wash+pack floor

  // ── Material (blank, not finished mass) with skeleton scrap credit ──
  const blankMassKg = (blankAreaCm2 * tCm * mat.density) / 1000;
  const partMassKg = (partAreaCm2 * tCm * mat.density) / 1000;
  const grossMaterial = blankMassKg * mat.price;
  const scrapCredit = (blankMassKg - partMassKg) * mat.price * (mat.scrapRecovery ?? 0.2);
  const material = grossMaterial - scrapCredit;

  // ── Tooling: progressive/transfer die, station count from complexity ──
  const stations = 2 + bends + (drawDepthMm > 0 ? 2 : 0);
  const dieCost = 40_000 + stations * 22_000 + tonnage * 60 + partAreaCm2 * 8;
  const programVol = Math.max(1, (Number(p.annualVolume) || 200000) * (Number(p.programYears) || 5));
  const toolLife = 1_500_000;
  const toolingPerPart = dieCost / Math.min(programVol, toolLife);

  // ── Rollup (same structure as the main engine) ──
  const conversion = machine + labour + setup + secondary;
  const overhead = conversion * reg.overheadPct;
  const preCommercial = material + conversion + overhead + toolingPerPart;
  const commercial = preCommercial * 0.03;
  const works = preCommercial + commercial;
  const sga = works * reg.sgaPct;
  const total = works + sga;

  return {
    engine: 'feature-stamping-v1',
    inputs: { material: p.material, region: p.region || 'Germany', annualVolume: Number(p.annualVolume) || 200000, bends, drawDepthMm, toleranceClass: p.toleranceClass || 'standard' },
    drivers: {
      thicknessMm: round(tMm, 2), partAreaCm2: round(partAreaCm2, 1), blankAreaCm2: round(blankAreaCm2, 1),
      materialUtilisationPct: round(util * 100, 0), blankMassKg: round(blankMassKg, 3), partMassKg: round(partMassKg, 3),
      tonnage: round(tonnage, 0), pressRate: press.rate, strokesPerMin: press.spm, cycleSec: round(cycleSec, 1),
      dieCost: round(dieCost, 0), stations,
    },
    breakdown: {
      material: { value: round(material) },
      machine: { value: round(machine) },
      labour: { value: round(labour) },
      setup: { value: round(setup) },
      secondary: { value: round(secondary) },
      tooling: { value: round(toolingPerPart, 3) },
      overhead: { value: round(overhead) },
      commercial: { value: round(commercial) },
      sgaProfit: { value: round(sga) },
    },
    totalShouldCost: round(total),
  };
}

// Adapt CAD geometry (client parse or OCCT) into the stamping model input.
export function geometryToStampingInput(g) {
  const bb = g?.boundingBox || g?.boundingBoxMm || {};
  const thickness = Number(g?.featureMap?.charThicknessMm) || Number(g?.wallThickness?.meanMm) || Number(g?.thicknessMm) || undefined;
  return {
    boundingBoxMm: { x: Number(bb.x ?? bb.xMm), y: Number(bb.y ?? bb.yMm), z: Number(bb.z ?? bb.zMm) },
    partVolumeCm3: Number(g?.estimatedVolume ?? g?.volume?.cm3),
    surfaceAreaCm2: Number(g?.estimatedSurfaceArea ?? g?.surfaceArea?.cm2) || undefined,
    thicknessMm: thickness,
  };
}
