// ─────────────────────────────────────────────────────────────────────────────
// Feature-based machining should-cost — the accuracy upgrade over the mass model.
//
// The parametric engine costs machining as base + s/kg·mass, so a 0.9 kg simple
// bracket and a 0.9 kg 5-axis manifold cost the same, and titanium (which cuts
// 3-4x slower than aluminium) is priced like steel. This module instead builds
// the cycle from GEOMETRY the OCCT engine already computes:
//
//   rough  = removal volume ÷ material MRR (cm³/min)      ← material-differentiated
//   finish = finished surface area ÷ finish feed-rate     ← surface-driven
//   drill  = per hole: (depth ÷ feed) + peck retracts + tool change
//   setup  = setup count × setup hours                    ← from setupAnalysis
//   nonCut = tool changes + rapids/probing overhead
//
// Material cost uses the ACTUAL stock (bounding box + allowance) with an exact
// scrap credit on the removed volume — feature-based buy-to-fly, not a mass guess.
//
// Deterministic + unit-testable. Falls back to the mass model (caller's job)
// when real geometry is absent.
// ─────────────────────────────────────────────────────────────────────────────
import { MATERIALS, REGIONS } from './costing-engine.mjs';

const round = (x, dp = 2) => Number(Number(x).toFixed(dp));

// Machinability by material family — roughing MRR (cm³/min on a mid-size 3-axis
// VMC), finishing feed-area (cm²/min), and a drill-feed factor (relative to
// steel = 1.0). Conservative, teardown-plausible; the whole point is that these
// DIFFER by material (Ti ≪ Al), which the mass model cannot express.
// finishRate is the AREA covered per minute by finish passes (face/contour
// milling covers area fast); roughMRR is aggressive-roughing volume/min.
// Calibrated to realistic carbide-tooling shop rates for a mid-size 3-axis VMC.
const MACHINABILITY = {
  ferrous:    { roughMRR: 55,  finishRate: 200, drillFactor: 1.0 },
  castiron:   { roughMRR: 90,  finishRate: 240, drillFactor: 1.3 },
  aluminium:  { roughMRR: 250, finishRate: 400, drillFactor: 3.0 },
  magnesium:  { roughMRR: 300, finishRate: 450, drillFactor: 3.5 },
  titanium:   { roughMRR: 18,  finishRate: 70,  drillFactor: 0.35 },  // cuts ~14x slower than Al — the mass model's blind spot
  copper:     { roughMRR: 110, finishRate: 260, drillFactor: 1.8 },
  zinc:       { roughMRR: 180, finishRate: 350, drillFactor: 2.5 },
  plastic:    { roughMRR: 300, finishRate: 500, drillFactor: 4.0 },
  composite:  { roughMRR: 50,  finishRate: 150, drillFactor: 0.6 },   // abrasive; special tooling
};
// Stainless is ferrous-family but markedly harder — override by exact name.
const MATERIAL_OVERRIDE = {
  'Stainless Steel 304': { roughMRR: 35, finishRate: 110, drillFactor: 0.55 },
  'Steel (high-strength)': { roughMRR: 40, finishRate: 150, drillFactor: 0.7 },
};

function machinabilityFor(materialKey, family) {
  return MATERIAL_OVERRIDE[materialKey] || MACHINABILITY[family] || MACHINABILITY.ferrous;
}

// Quality drivers (reuse the engine's semantics).
const TOL = { standard: 1.0, tight: 1.2, precision: 1.5 };
const FIN = { standard: 1.0, fine: 1.25, polished: 1.6 };

/**
 * @param {object} p
 * @param {object} p.geometry  { boundingBoxMm:{x,y,z}, partVolumeCm3, surfaceAreaCm2, holes:[{diaMm,depthMm,count}], setupCount }
 * @param {string} p.material   MATERIALS key
 * @param {string} [p.region='Germany']
 * @param {number} [p.annualVolume=50000]
 * @param {number} [p.batch=200]
 * @param {number} [p.stockAllowanceMm=3]   per-side machining allowance on the billet
 * @param {string} [p.toleranceClass='standard']
 * @param {string} [p.surfaceFinish='standard']
 * @param {number} [p.machineRate=65]  €/hr
 * @param {number} [p.perishablePerHr=8]
 * @param {object} [library]
 */
export function featuredMachiningCost(p, library = undefined) {
  const MAT = library?.MATERIALS || MATERIALS;
  const REG = library?.REGIONS || REGIONS;
  const g = p.geometry || {};
  const mat = MAT[p.material];
  if (!mat) throw new Error(`Unknown material: ${p.material}`);
  const reg = REG[p.region] || REG.Germany;

  const bb = g.boundingBoxMm || {};
  const bx = Math.max(1, Number(bb.x) || 0), by = Math.max(1, Number(bb.y) || 0), bz = Math.max(1, Number(bb.z) || 0);
  const partVolCm3 = Math.max(0.01, Number(g.partVolumeCm3) || 0);
  if (!(Number(g.partVolumeCm3) > 0)) throw new Error('partVolumeCm3 required for feature-based machining');
  const saCm2 = Number(g.surfaceAreaCm2) > 0 ? Number(g.surfaceAreaCm2) : 6 * Math.cbrt(partVolCm3) ** 2; // fallback ≈ cube SA
  const holes = Array.isArray(g.holes) ? g.holes : [];
  const setupCount = Math.max(1, Math.min(6, Math.round(Number(g.setupCount) || 2)));

  const mach = machinabilityFor(p.material, mat.family);
  const tol = TOL[p.toleranceClass] ?? 1.0;
  const fin = FIN[p.surfaceFinish] ?? 1.0;
  const allow = Number.isFinite(Number(p.stockAllowanceMm)) ? Math.max(0, Number(p.stockAllowanceMm)) : 3;

  // ── Stock & removal (buy-to-fly) ──
  const stockVolCm3 = ((bx + 2 * allow) * (by + 2 * allow) * (bz + 2 * allow)) / 1000; // mm³→cm³
  const removalVolCm3 = Math.max(0, stockVolCm3 - partVolCm3);
  const stockMassKg = (stockVolCm3 * mat.density) / 1000; // cm³×(g/cm³)→g→kg
  const partMassKg = (partVolCm3 * mat.density) / 1000;

  // ── Cycle (minutes) ──
  const roughMin = removalVolCm3 / mach.roughMRR;
  const finishMin = (saCm2 / mach.finishRate) * fin * tol;
  // drilling: per hole time = plunge(depth/feed) + approach/retract + peck penalty for deep holes
  const baseDrillFeed = 120 * mach.drillFactor; // mm/min at ~8mm dia in steel-equiv
  let drillMin = 0;
  for (const h of holes) {
    const dia = Math.max(1, Number(h.diaMm) || 6);
    const depth = Math.max(1, Number(h.depthMm) || dia);
    const count = Math.max(1, Math.round(Number(h.count) || 1));
    const feed = baseDrillFeed * Math.min(1.4, Math.max(0.5, 8 / dia)); // smaller holes feed faster (mm/min), big holes slower
    const pecks = depth > 3 * dia ? Math.ceil(depth / dia) * 0.025 : 0;  // deep-hole retract penalty (min)
    const perHole = depth / feed + 0.035 + pecks + 0.02; // plunge + approach/retract + peck + rapid positioning (modern VMC)
    drillMin += perHole * count;
  }
  const featureCount = holes.reduce((s, h) => s + Math.max(1, Math.round(Number(h.count) || 1)), 0) + Math.max(0, Number(g.planarFaceCount) || 0);
  const toolChangeMin = Math.min(20, featureCount * 0.06); // distinct tools, not per-hole; capped
  const cutMin = roughMin + finishMin + drillMin;
  const nonCutMin = toolChangeMin + cutMin * 0.15 * tol;   // rapids, probing, in-cycle handling
  const cycleMin = cutMin + nonCutMin;
  const cycleHr = cycleMin / 60;

  // ── Per-part conversion ──
  const machineRate = Number(p.machineRate) || 65;
  const machine = cycleHr * (machineRate + (Number(p.perishablePerHr) || 8));
  const labour = cycleHr * reg.labour * (Number(p.operators) || 0.5);
  const batch = Math.max(1, Number(p.batch) || 200);
  const setup = (setupCount * (Number(p.setupHr) || 1.0) * (machineRate + reg.labour)) / batch;

  // ── Material (buy-to-fly): pay for stock, credit the removed swarf ──
  const pricePerKg = mat.price;
  const grossMaterial = stockMassKg * pricePerKg;
  const scrapCredit = (stockMassKg - partMassKg) * pricePerKg * (mat.scrapRecovery ?? 0.2);
  const material = grossMaterial - scrapCredit;

  // ── Rollup (same structure as the main engine) ──
  const conversion = machine + labour + setup;
  const overhead = conversion * reg.overheadPct;
  const preCommercial = material + conversion + overhead;
  const commercial = preCommercial * 0.03;
  const works = preCommercial + commercial;
  const sga = works * reg.sgaPct;
  const total = works + sga;

  const buyToFly = round(stockMassKg / Math.max(partMassKg, 1e-6), 2);

  return {
    engine: 'feature-machining-v1',
    inputs: { material: p.material, region: p.region || 'Germany', annualVolume: Number(p.annualVolume) || 50000, batch, toleranceClass: p.toleranceClass || 'standard', surfaceFinish: p.surfaceFinish || 'standard' },
    drivers: {
      stockMassKg: round(stockMassKg, 3), partMassKg: round(partMassKg, 3), buyToFlyRatio: buyToFly,
      removalVolCm3: round(removalVolCm3, 1), surfaceAreaCm2: round(saCm2, 1),
      holeCount: holes.reduce((s, h) => s + Math.max(1, Math.round(Number(h.count) || 1)), 0),
      setupCount, cycleSec: round(cycleMin * 60, 0), machineRate,
      materialRoughMRR: mach.roughMRR,
    },
    cycleBreakdownSec: {
      roughing: round(roughMin * 60, 0), finishing: round(finishMin * 60, 0),
      drilling: round(drillMin * 60, 0), nonCut: round(nonCutMin * 60, 0),
    },
    breakdown: {
      material: { value: round(material) },
      machine: { value: round(machine) },
      labour: { value: round(labour) },
      setup: { value: round(setup) },
      overhead: { value: round(overhead) },
      commercial: { value: round(commercial) },
      sgaProfit: { value: round(sga) },
    },
    totalShouldCost: round(total),
  };
}

// Adapt the OCCT geometry-bridge output (OCCTGeometry) to the model input.
export function geometryToMachiningInput(occt) {
  const bb = occt?.boundingBox || {};
  const holes = Array.isArray(occt?.featureTable)
    ? occt.featureTable.filter(f => f.kind === 'hole').map(f => ({ diaMm: f.diaMm, depthMm: f.depthMm, count: f.count }))
    : [];
  return {
    boundingBoxMm: { x: bb.xMm, y: bb.yMm, z: bb.zMm },
    partVolumeCm3: occt?.volume?.cm3,
    surfaceAreaCm2: occt?.surfaceArea?.cm2,
    holes,
    planarFaceCount: occt?.features?.planarFaceCount,
    setupCount: occt?.setupAnalysis?.estimatedSetupCount,
  };
}
