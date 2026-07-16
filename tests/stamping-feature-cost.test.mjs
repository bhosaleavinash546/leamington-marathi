// Feature-based stamping: the behaviours the flat-rate mass model CANNOT express
// — press-tonnage tiering, geometry-driven nesting utilisation, and thickness.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stampingFeatureCost, geometryToStampingInput } from '../stamping-feature-cost.mjs';

// A small flat bracket: 120×80 mm, 2 mm steel, ~40 cm² part area.
const bracket = { boundingBoxMm: { x: 120, y: 80, z: 12 }, partVolumeCm3: (120 * 80 * 2) / 1000, surfaceAreaCm2: 220, thicknessMm: 2 };
// A large deep-drawn panel: 900×600 mm, 0.8 mm, deep draw.
const panel = { boundingBoxMm: { x: 900, y: 600, z: 180 }, partVolumeCm3: (900 * 600 * 0.8) / 1000, surfaceAreaCm2: 12000, thicknessMm: 0.8 };

describe('feature-based stamping', () => {
  it('selects a bigger, slower, dearer press for a large panel (mass model uses one flat rate)', () => {
    const br = stampingFeatureCost({ geometry: bracket, material: 'Steel (mild)', bends: 2, annualVolume: 200000 });
    const pn = stampingFeatureCost({ geometry: panel, material: 'Steel (mild)', bends: 1, drawDepthMm: 120, annualVolume: 200000 });
    assert.ok(pn.drivers.tonnage > br.drivers.tonnage * 3, `panel ${pn.drivers.tonnage}t vs bracket ${br.drivers.tonnage}t`);
    assert.ok(pn.drivers.pressRate > br.drivers.pressRate, 'bigger press costs more per hour');
    assert.ok(pn.drivers.strokesPerMin < br.drivers.strokesPerMin, 'bigger press cycles slower');
  });

  it('material cost tracks nesting utilisation (blank, not finished mass)', () => {
    const good = stampingFeatureCost({ geometry: bracket, material: 'Steel (mild)', materialUtilisation: 0.80 });
    const poor = stampingFeatureCost({ geometry: bracket, material: 'Steel (mild)', materialUtilisation: 0.45 });
    // worse nesting → more blank → more material cost
    assert.ok(poor.breakdown.material.value > good.breakdown.material.value, `${poor.breakdown.material.value} vs ${good.breakdown.material.value}`);
    assert.ok(poor.drivers.blankAreaCm2 > good.drivers.blankAreaCm2);
  });

  it('derives worse utilisation for a slender, bend-heavy part than a compact one', () => {
    const compact = stampingFeatureCost({ geometry: { boundingBoxMm: { x: 100, y: 90, z: 10 }, partVolumeCm3: 18, surfaceAreaCm2: 200, thicknessMm: 2 }, material: 'Steel (mild)', bends: 1 });
    const slender = stampingFeatureCost({ geometry: { boundingBoxMm: { x: 400, y: 40, z: 30 }, partVolumeCm3: 18, surfaceAreaCm2: 200, thicknessMm: 2 }, material: 'Steel (mild)', bends: 6 });
    assert.ok(slender.drivers.materialUtilisationPct < compact.drivers.materialUtilisationPct, `slender ${slender.drivers.materialUtilisationPct}% vs compact ${compact.drivers.materialUtilisationPct}%`);
  });

  it('thicker gauge → higher tonnage and more material', () => {
    const thin = stampingFeatureCost({ geometry: { ...bracket, partVolumeCm3: (120 * 80 * 1) / 1000, thicknessMm: 1 }, material: 'Steel (mild)' });
    const thick = stampingFeatureCost({ geometry: { ...bracket, partVolumeCm3: (120 * 80 * 3) / 1000, thicknessMm: 3 }, material: 'Steel (mild)' });
    assert.ok(thick.drivers.tonnage > thin.drivers.tonnage);
    assert.ok(thick.breakdown.material.value > thin.breakdown.material.value);
  });

  it('high-strength steel needs more tonnage than mild for the same blank', () => {
    const mild = stampingFeatureCost({ geometry: bracket, material: 'Steel (mild)' });
    const hss = stampingFeatureCost({ geometry: bracket, material: 'Steel (high-strength)' });
    assert.ok(hss.drivers.tonnage > mild.drivers.tonnage, 'HSS shears harder');
  });

  it('breakdown reconciles with the total', () => {
    const r = stampingFeatureCost({ geometry: bracket, material: 'Steel (mild)' });
    const b = r.breakdown;
    const sum = b.material.value + b.machine.value + b.labour.value + b.setup.value + b.secondary.value + b.tooling.value + b.overhead.value + b.commercial.value + b.sgaProfit.value;
    assert.ok(Math.abs(sum - r.totalShouldCost) < 0.05, `sum ${sum} vs total ${r.totalShouldCost}`);
  });

  it('rejects a non-stampable material and missing volume', () => {
    assert.throws(() => stampingFeatureCost({ geometry: bracket, material: 'Polypropylene (PP)' }));
    assert.throws(() => stampingFeatureCost({ geometry: { boundingBoxMm: { x: 10, y: 10, z: 2 } }, material: 'Steel (mild)' }));
  });

  it('adapts CAD geometry (client featureMap thickness or OCCT wallThickness)', () => {
    const client = geometryToStampingInput({ boundingBox: { x: 120, y: 80, z: 12 }, estimatedVolume: 19.2, estimatedSurfaceArea: 220, featureMap: { charThicknessMm: 2 } });
    assert.equal(client.thicknessMm, 2);
    const r = stampingFeatureCost({ geometry: client, material: 'Steel (mild)' });
    assert.ok(r.totalShouldCost > 0);
  });
});
