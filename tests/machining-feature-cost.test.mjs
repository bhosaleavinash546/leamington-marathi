// Feature-based machining: the behaviours the mass model CANNOT express —
// material differentiation, feature (complexity) sensitivity, and buy-to-fly.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { featuredMachiningCost, geometryToMachiningInput } from '../machining-feature-cost.mjs';
import { computeShouldCost } from '../costing-engine.mjs';

// A 100×80×40 mm block machined to ~60% of stock, moderate surface, 4 holes.
const blockGeom = {
  boundingBoxMm: { x: 100, y: 80, z: 40 },
  partVolumeCm3: (100 * 80 * 40 * 0.6) / 1000,   // 192 cm³
  surfaceAreaCm2: 320,
  holes: [{ diaMm: 8, depthMm: 30, count: 4 }],
  setupCount: 2,
};

describe('feature-based machining', () => {
  it('prices titanium far above aluminium for identical geometry (mass model cannot)', () => {
    const al = featuredMachiningCost({ geometry: blockGeom, material: 'Aluminium 6061', region: 'Germany', batch: 200 });
    const ti = featuredMachiningCost({ geometry: blockGeom, material: 'Titanium Ti-6Al-4V', region: 'Germany', batch: 200 });
    // Ti cuts ~15x slower → machining cost dominates → total should be several× Al.
    assert.ok(ti.totalShouldCost > al.totalShouldCost * 2.5, `Ti ${ti.totalShouldCost} vs Al ${al.totalShouldCost}`);
    // and the cycle itself must be much longer for Ti
    assert.ok(ti.drivers.cycleSec > al.drivers.cycleSec * 3);
  });

  it('is complexity-sensitive: a heavily-drilled part costs more than a plain one of equal mass', () => {
    const plain = featuredMachiningCost({ geometry: { ...blockGeom, holes: [] }, material: 'Steel (mild)' });
    const drilled = featuredMachiningCost({ geometry: { ...blockGeom, holes: [{ diaMm: 5, depthMm: 35, count: 40 }] }, material: 'Steel (mild)' });
    // same bounding box / part volume (≈ same mass) but 40 deep holes cost more
    assert.ok(drilled.totalShouldCost > plain.totalShouldCost, `${drilled.totalShouldCost} vs ${plain.totalShouldCost}`);
    assert.ok(drilled.cycleBreakdownSec.drilling > plain.cycleBreakdownSec.drilling);
  });

  it('exposes the mass model\'s blind spot: equal MASS, very different machining', () => {
    // Two steel parts, same finished mass, but one is a near-net billet (little
    // removal) and one is carved from a big block (lots of removal).
    const nearNet = featuredMachiningCost({ geometry: { boundingBoxMm: { x: 60, y: 50, z: 30 }, partVolumeCm3: 80, surfaceAreaCm2: 180, holes: [], setupCount: 1 }, material: 'Steel (mild)', stockAllowanceMm: 1 });
    const carved = featuredMachiningCost({ geometry: { boundingBoxMm: { x: 140, y: 120, z: 60 }, partVolumeCm3: 80, surfaceAreaCm2: 180, holes: [], setupCount: 2 }, material: 'Steel (mild)', stockAllowanceMm: 3 });
    // Same part volume (≈ mass) → mass model gives ~same cost. Feature model
    // charges the carved one for the huge removal + buy-to-fly.
    assert.ok(carved.totalShouldCost > nearNet.totalShouldCost * 1.3, `carved ${carved.totalShouldCost} vs near-net ${nearNet.totalShouldCost}`);
    assert.ok(carved.drivers.buyToFlyRatio > nearNet.drivers.buyToFlyRatio);
  });

  it('material breakdown reconciles with the total', () => {
    const r = featuredMachiningCost({ geometry: blockGeom, material: 'Aluminium 6061' });
    const b = r.breakdown;
    const sum = b.material.value + b.machine.value + b.labour.value + b.setup.value + b.overhead.value + b.commercial.value + b.sgaProfit.value;
    assert.ok(Math.abs(sum - r.totalShouldCost) < 0.05, `sum ${sum} vs total ${r.totalShouldCost}`);
  });

  it('cost falls with larger batch (setup amortised) and rises with tighter tolerance', () => {
    const b50 = featuredMachiningCost({ geometry: blockGeom, material: 'Steel (mild)', batch: 50 }).totalShouldCost;
    const b1000 = featuredMachiningCost({ geometry: blockGeom, material: 'Steel (mild)', batch: 1000 }).totalShouldCost;
    assert.ok(b1000 < b50);
    const std = featuredMachiningCost({ geometry: blockGeom, material: 'Steel (mild)', toleranceClass: 'standard' }).totalShouldCost;
    const prec = featuredMachiningCost({ geometry: blockGeom, material: 'Steel (mild)', toleranceClass: 'precision', surfaceFinish: 'polished' }).totalShouldCost;
    assert.ok(prec > std);
  });

  it('adapts real OCCT geometry-bridge output', () => {
    const occt = {
      boundingBox: { xMm: 100, yMm: 80, zMm: 40 },
      volume: { cm3: 192 }, surfaceArea: { cm2: 320 },
      featureTable: [{ kind: 'hole', diaMm: 8, depthMm: 30, count: 4 }, { kind: 'boss', diaMm: 20, count: 1 }],
      features: { planarFaceCount: 6 }, setupAnalysis: { estimatedSetupCount: 2 },
    };
    const input = geometryToMachiningInput(occt);
    assert.equal(input.partVolumeCm3, 192);
    assert.equal(input.holes.length, 1);   // only holes, not the boss
    assert.equal(input.setupCount, 2);
    const r = featuredMachiningCost({ geometry: input, material: 'Aluminium 6061' });
    assert.ok(r.totalShouldCost > 0);
  });

  it('rejects geometry with no part volume', () => {
    assert.throws(() => featuredMachiningCost({ geometry: { boundingBoxMm: { x: 10, y: 10, z: 10 } }, material: 'Steel (mild)' }));
  });
});
