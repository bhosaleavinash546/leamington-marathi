// PHASE 3 OF THE SEPT 2026 REVIEW — the engine-accuracy findings, each with a
// test that FAILS on the pre-fix code. Where a finding was "the axis does not
// exist", the test asserts the axis moves the number; where it was "two engines
// disagree on the same part", the test asserts they agree.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeShouldCost, REGIONS, MATERIALS, PROCESSES, cuttingMachinabilityMult } from '../costing-engine.mjs';
import { computeCarbon, GRID_G_CO2_PER_KWH, ETS_PRICE_AS_OF, GRID_G_CO2_AS_OF } from '../carbon.mjs';
import { featuredMachiningCost } from '../machining-feature-cost.mjs';
import { stampingFeatureCost } from '../stamping-feature-cost.mjs';
import { fitCalibration, calibrationFactor, calibrationSource, volumeBand } from '../calibration.mjs';
import { suggestForName } from '../prism-assembly.mjs';

const CAT = { materials: MATERIALS, processes: PROCESSES };

describe('R-27 — the region axis reaches the machine, not just the operator', () => {
  const part = { material: 'Polypropylene (PP)', process: 'Injection Moulding', weightKg: 0.15, annualVolume: 200_000 };

  it('a labour-light moulded part still moves with region', () => {
    const de = computeShouldCost({ ...part, region: 'Germany' }).totalShouldCost;
    const cn = computeShouldCost({ ...part, region: 'China' }).totalShouldCost;
    // Before: 1.15x on a 3.6x labour gap, because machineRate was a global
    // constant and commercial was a flat 5%.
    assert.ok(de > cn, `Germany (${de}) must exceed China (${cn})`);
    assert.ok(de / cn > 1.15, `region spread ${(de / cn).toFixed(3)}x — the machine and energy axes must contribute beyond labour`);
  });

  it('energy price and machine multiplier are declared per region, not assumed', () => {
    for (const [name, r] of Object.entries(REGIONS)) {
      assert.ok(Number(r.energyEurPerKwh) > 0, `${name} has no energy price`);
      assert.ok(Number(r.machineMult) > 0, `${name} has no machine multiplier`);
      assert.ok(Number(r.commercialPct) > 0, `${name} has no commercial percentage`);
    }
  });

  it('the ten regions added for footprint work are all costable', () => {
    for (const region of ['Turkey', 'Morocco', 'Poland', 'Romania', 'Slovakia', 'Portugal', 'Vietnam', 'Thailand', 'Japan', 'Brazil']) {
      const t = computeShouldCost({ material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 1.2, annualVolume: 150_000, region }).totalShouldCost;
      assert.ok(Number.isFinite(t) && t > 0, `${region} did not cost`);
    }
  });
});

describe('R-31 — cutting cycle responds to machinability', () => {
  it('titanium takes materially longer to cut than aluminium on the same mass', () => {
    const ti = cuttingMachinabilityMult('Titanium Ti-6Al-4V', 'titanium', 'Machining (CNC)');
    const al = cuttingMachinabilityMult('Aluminium 6061', 'aluminium', 'Machining (CNC)');
    assert.ok(ti > 1.5, `titanium multiplier ${ti} — must be well above the ferrous anchor`);
    assert.ok(al < 1, `aluminium multiplier ${al} — must be below the ferrous anchor`);
    assert.ok(ti / al > 2, 'the Ti/Al cycle ratio must survive the removal-share blend');
  });

  it('the multiplier is inert on processes that do not cut metal', () => {
    assert.equal(cuttingMachinabilityMult('Titanium Ti-6Al-4V', 'titanium', 'Sand Casting'), 1);
    assert.equal(cuttingMachinabilityMult('Polypropylene (PP)', 'plastic', 'Injection Moulding'), 1);
  });

  it('an unknown material does not silently become a fast one', () => {
    // Absent ≠ default-to-favourable: it falls back to the ferrous anchor (1.0),
    // never to the aluminium rate.
    assert.equal(cuttingMachinabilityMult('Nothing At All', undefined, 'Machining (CNC)'), 1);
  });
});

describe('R-32 — calibration keyed on process x region x volume band', () => {
  const quote = (process, region, annualVolume, ratio) => ({ process, region, annualVolume, modelled: 10, actual: 10 * ratio });

  it('a region-and-volume cell overrides the process factor once it has enough quotes', () => {
    const pairs = [
      // Eight machining quotes at low volume that agree with the model…
      ...Array.from({ length: 8 }, () => quote('Machining (CNC)', 'Germany', 5_000, 1.0)),
      // …and six high-volume ones that all run 40% hot.
      ...Array.from({ length: 6 }, () => quote('Machining (CNC)', 'Germany', 500_000, 1.4)),
    ];
    const cal = fitCalibration(pairs);
    const low = calibrationFactor(cal, 'Machining (CNC)', { region: 'Germany', annualVolume: 5_000 });
    const high = calibrationFactor(cal, 'Machining (CNC)', { region: 'Germany', annualVolume: 500_000 });
    assert.ok(high > low, `high-volume cell ${high} must exceed low-volume cell ${low} — a blended process factor cannot express this`);
    assert.equal(calibrationSource(cal, 'Machining (CNC)', { region: 'Germany', annualVolume: 500_000 }), 'cell');
  });

  it('a thin cell falls back to the process factor and SAYS so', () => {
    const pairs = [
      ...Array.from({ length: 8 }, () => quote('Machining (CNC)', 'Germany', 5_000, 1.2)),
      quote('Machining (CNC)', 'India', 5_000, 3.0),   // one quote: not a cell
    ];
    const cal = fitCalibration(pairs);
    assert.equal(calibrationSource(cal, 'Machining (CNC)', { region: 'India', annualVolume: 5_000 }), 'process');
  });

  it('volume bands are ordered and total', () => {
    assert.equal(volumeBand(1_000), 'low');
    assert.equal(volumeBand(100_000), 'mid');
    assert.equal(volumeBand(5_000_000), 'high');
  });

  it('a corpus that agrees with the model is reported as a result, not as absence', () => {
    const cal = fitCalibration(Array.from({ length: 6 }, () => quote('Sand Casting', 'Germany', 20_000, 1.0)));
    assert.equal(calibrationSource(cal, 'Injection Moulding', {}), 'global');
    const none = fitCalibration([]);
    assert.equal(calibrationSource(none, 'Injection Moulding', {}), 'none');
  });
});

describe('R-30 / R-34 — the feature engines cost on the same terms as the parametric one', () => {
  const geometry = {
    boundingBoxMm: { x: 120, y: 80, z: 40 }, partVolumeCm3: 190, surfaceAreaCm2: 420,
    holes: [{ diaMm: 8, depthMm: 25, count: 6 }], setupCount: 2,
  };
  const base = { geometry, material: 'Aluminium 6061', region: 'Germany', annualVolume: 50_000, batch: 200 };

  it('machining: commercial comes from the region library, not a hardcoded 3%', () => {
    const de = featuredMachiningCost(base);
    const pre = de.breakdown.material.value + de.breakdown.machine.value + de.breakdown.labour.value
      + de.breakdown.setup.value + de.breakdown.overhead.value;
    const pct = de.breakdown.commercial.value / pre;
    assert.ok(Math.abs(pct - REGIONS.Germany.commercialPct) < 0.004,
      `commercial ran at ${(pct * 100).toFixed(2)}% against the library's ${(REGIONS.Germany.commercialPct * 100).toFixed(2)}%`);
  });

  it('machining: a calibration factor scales the total AND every line, and is disclosed', () => {
    const cal = fitCalibration(Array.from({ length: 10 }, () => ({ process: 'Machining (CNC)', region: 'Germany', annualVolume: 50_000, modelled: 10, actual: 13 })));
    const flat = featuredMachiningCost({ ...base, process: 'Machining (CNC)' });
    const cald = featuredMachiningCost({ ...base, process: 'Machining (CNC)' }, undefined, cal);
    assert.equal(flat.calibration.applied, false);
    assert.equal(cald.calibration.applied, true);
    assert.ok(cald.calibration.factor > 1, 'a corpus running hot must raise the factor');
    assert.ok(cald.totalShouldCost > flat.totalShouldCost);
    // Composition unchanged: every line scales by the same factor.
    const ratio = cald.totalShouldCost / flat.totalShouldCost;
    for (const k of Object.keys(flat.breakdown)) {
      if (flat.breakdown[k].value === 0) continue;
      const r = cald.breakdown[k].value / flat.breakdown[k].value;
      assert.ok(Math.abs(r - ratio) < 0.06, `line "${k}" scaled ${r.toFixed(3)} against a total ratio of ${ratio.toFixed(3)}`);
    }
  });

  it('stamping: same two contracts', () => {
    // A big enough part that 2-dp rounding of each line is not the dominant term.
    const g = { boundingBoxMm: { x: 520, y: 340, z: 6 }, partVolumeCm3: 900, thicknessMm: 2.0 };
    const p = { geometry: g, material: 'Steel (mild)', region: 'Germany', annualVolume: 300_000, bends: 2 };
    const flat = stampingFeatureCost(p);
    const cal = fitCalibration(Array.from({ length: 10 }, () => ({ process: 'Stamping / Deep Drawing', region: 'Germany', annualVolume: 300_000, modelled: 10, actual: 12 })));
    const cald = stampingFeatureCost({ ...p, process: 'Stamping / Deep Drawing' }, undefined, cal);
    assert.equal(flat.calibration.applied, false);
    assert.equal(cald.calibration.applied, true);
    assert.ok(cald.totalShouldCost > flat.totalShouldCost);
    const pre = flat.breakdown.material.value + flat.breakdown.machine.value + flat.breakdown.labour.value
      + flat.breakdown.setup.value + flat.breakdown.secondary.value + flat.breakdown.tooling.value + flat.breakdown.overhead.value;
    const pct = flat.breakdown.commercial.value / pre;
    assert.ok(Math.abs(pct - REGIONS.Germany.commercialPct) / REGIONS.Germany.commercialPct < 0.05,
      `stamping commercial ran at ${(pct * 100).toFixed(2)}% against the library's ${(REGIONS.Germany.commercialPct * 100).toFixed(2)}%`);
  });
});

describe('R-35 / R-27 — carbon refuses to guess and dates what it knows', () => {
  it('every costable region has a grid factor', () => {
    const missing = Object.keys(REGIONS).filter(r => !Number.isFinite(GRID_G_CO2_PER_KWH[r]));
    assert.deepEqual(missing, [], `regions costable but not carbon-mappable: ${missing.join(', ')}`);
  });

  it('an unmapped process is NAMED, not defaulted', () => {
    const c = computeCarbon(
      { material: 'Steel (mild)', route: ['Stamping / Deep Drawing', 'A Process Nobody Modelled'], region: 'Germany' },
      { inputMassKg: 2, finishedMassKg: 1.6 },
    );
    assert.equal(c.partial, true);
    assert.ok(c.notEstimated.some(n => /A Process Nobody Modelled/.test(n)), c.notEstimated?.join(' | '));
  });

  it('a complete estimate carries no partial flag at all', () => {
    const c = computeCarbon(
      { material: 'Steel (mild)', process: 'Stamping / Deep Drawing', region: 'Germany' },
      { inputMassKg: 2, finishedMassKg: 1.6 },
    );
    assert.equal(c.partial, undefined);
    assert.equal(c.notEstimated, undefined);
  });

  it('the EU set covers every EU region in the cost table, so no CBAM line is invented', () => {
    for (const region of ['Poland', 'Romania', 'Slovakia', 'Portugal', 'Germany', 'Spain', 'Czech Republic']) {
      const c = computeCarbon({ material: 'Steel (mild)', process: 'Stamping / Deep Drawing', region }, { inputMassKg: 2, finishedMassKg: 1.6 });
      assert.equal(c.cbam, null, `${region} is in the EU — a CBAM import levy there is an overclaim`);
    }
    const tr = computeCarbon({ material: 'Steel (mild)', process: 'Stamping / Deep Drawing', region: 'Turkey' }, { inputMassKg: 2, finishedMassKg: 1.6 });
    assert.ok(tr.cbam && tr.cbam.eur > 0, 'a non-EU ferrous import must carry the indicative CBAM line');
  });

  it('market and data vintages are dated on the result, not left to be assumed current', () => {
    assert.match(ETS_PRICE_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(GRID_G_CO2_AS_OF, /^\d{4}$/);
    const c = computeCarbon({ material: 'Steel (mild)', process: 'Stamping / Deep Drawing', region: 'Turkey' }, { inputMassKg: 2, finishedMassKg: 1.6 });
    assert.equal(c.cbam.asOf, ETS_PRICE_AS_OF);
    assert.equal(c.gridAsOf, GRID_G_CO2_AS_OF);
  });
});

describe('R-36 — Prism never suggests a pair the engine would refuse', () => {
  it('a compound name resolves to its HEAD noun', () => {
    assert.equal(suggestForName('Shaft seal', CAT).hintId, 'seal');
    assert.equal(suggestForName('shaft_seal_front', CAT).hintId, 'seal');
    assert.equal(suggestForName('Rotor shaft', CAT).hintId, 'shaft');
    assert.equal(suggestForName('Bearing cover', CAT).hintId, 'endcover');
  });

  it('a shaft seal is priced as a moulded elastomer, not a turned billet', () => {
    const s = suggestForName('Shaft seal', CAT);
    assert.equal(s.material, 'EPDM Rubber');
    assert.equal(s.process, 'Rubber Moulding (Compression/Injection)');
  });

  it('every non-bought hint is a pair computeShouldCost will actually accept', () => {
    const names = ['stator lamination stack', 'rotor core stack', 'magnet segment', 'hairpin winding',
      'rotor shaft', 'stator housing', 'end cover', 'busbar phase U', 'sun gear', 'shaft seal'];
    for (const n of names) {
      const s = suggestForName(n, CAT);
      assert.ok(s, `${n} matched no hint`);
      if (s.boughtPart) continue;
      assert.ok(s.material && s.process, `${n} produced no suggestion: ${s.basis}`);
      assert.doesNotThrow(
        () => computeShouldCost({ material: s.material, process: s.process, weightKg: 0.5, annualVolume: 100_000, region: 'Germany' }),
        `${n} → ${s.material} + ${s.process} is a pair the engine refuses`,
      );
    }
  });

  it('an incompatible pair is withheld with the reason, never offered', () => {
    // A catalogue where the process exists but has been narrowed away from the
    // hint's material: the suggestion must go to null and say why.
    const processes = { ...PROCESSES, 'Stamping / Deep Drawing': { ...PROCESSES['Stamping / Deep Drawing'], families: ['ferrous'] } };
    const s = suggestForName('Busbar phase U', { materials: MATERIALS, processes });
    assert.equal(s.material, null);
    assert.equal(s.process, null);
    assert.equal(s.incompatible.family, 'copper');
    assert.match(s.basis, /modelled for ferrous only/);
  });

  it('bought parts are still excluded rather than mis-costed', () => {
    for (const n of ['Ball bearing 6208', 'Resolver', 'M8 bolt', 'Inverter PCB']) {
      assert.equal(suggestForName(n, CAT).boughtPart, true, n);
    }
  });
});
