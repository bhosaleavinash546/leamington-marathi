import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeShouldCost, simulateShouldCost, volumeSensitivity,
  MATERIALS, PROCESSES, REGIONS, listMaterials, listProcesses, listRegions,
} from '../costing-engine.mjs';

const base = { material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 4.2, annualVolume: 80000, region: 'Germany' };

test('catalogue helpers expose non-empty lists', () => {
  assert.ok(listMaterials().length >= 8);
  assert.ok(listProcesses().length >= 10);
  assert.ok(listRegions().length >= 8);
});

test('computeShouldCost returns a positive, fully-decomposed total', () => {
  const r = computeShouldCost(base);
  assert.ok(r.totalShouldCost > 0);
  const sum = Object.values(r.breakdown).reduce((s, b) => s + b.value, 0);
  // sum of components must reconcile with the reported total within rounding
  assert.ok(Math.abs(sum - r.totalShouldCost) < 0.05, `components ${sum} vs total ${r.totalShouldCost}`);
});

test('breakdown percentages sum to ~100', () => {
  const r = computeShouldCost(base);
  const pct = Object.values(r.breakdown).reduce((s, b) => s + b.pct, 0);
  assert.ok(Math.abs(pct - 100) < 1.5, `pct sum ${pct}`);
});

test('material cost scales with part weight', () => {
  const light = computeShouldCost({ ...base, weightKg: 2 });
  const heavy = computeShouldCost({ ...base, weightKg: 8 });
  assert.ok(heavy.breakdown.material.value > light.breakdown.material.value);
});

test('higher volume lowers per-part tooling amortisation', () => {
  const lowVol = computeShouldCost({ ...base, annualVolume: 5000 });
  const highVol = computeShouldCost({ ...base, annualVolume: 500000 });
  assert.ok(highVol.breakdown.tooling.value < lowVol.breakdown.tooling.value);
});

test('cheaper-labour region lowers total for labour-bearing process', () => {
  const de = computeShouldCost({ ...base, process: 'MIG Welding Assembly', region: 'Germany' });
  const mx = computeShouldCost({ ...base, process: 'MIG Welding Assembly', region: 'Mexico' });
  assert.ok(mx.totalShouldCost < de.totalShouldCost);
});

test('CNC machining is machine-time dominated vs stamping', () => {
  const cnc = computeShouldCost({ material: 'Aluminium 6061', process: 'Machining (CNC)', weightKg: 1.5, annualVolume: 20000, region: 'Germany' });
  assert.ok(cnc.breakdown.machine.pct > cnc.breakdown.tooling.pct);
});

test('invalid inputs throw clearly', () => {
  assert.throws(() => computeShouldCost({ ...base, material: 'Unobtainium' }), /Unknown material/);
  assert.throws(() => computeShouldCost({ ...base, process: 'Teleportation' }), /Unknown process/);
  assert.throws(() => computeShouldCost({ ...base, region: 'Atlantis' }), /Unknown region/);
  assert.throws(() => computeShouldCost({ ...base, weightKg: 0 }), /weightKg/);
  assert.throws(() => computeShouldCost({ ...base, annualVolume: -5 }), /annualVolume/);
});

test('prototype-chain keys resolve to "unknown", not NaN', () => {
  for (const bad of ['constructor', '__proto__', 'hasOwnProperty', 'toString']) {
    assert.throws(() => computeShouldCost({ ...base, material: bad }), /Unknown material/, `material=${bad}`);
    assert.throws(() => computeShouldCost({ ...base, process: bad }), /Unknown process/, `process=${bad}`);
    assert.throws(() => computeShouldCost({ ...base, region: bad }), /Unknown region/, `region=${bad}`);
  }
});

test('incompatible material/process family throws instead of silently mis-costing', () => {
  // A ferrous part cannot be costed on the aluminium-die-casting model.
  assert.throws(
    () => computeShouldCost({ ...base, material: 'Steel (mild)', process: 'Die Casting (Aluminium)' }),
    /not compatible/,
  );
  // Injection moulding is plastic-only.
  assert.throws(
    () => computeShouldCost({ ...base, material: 'Steel (mild)', process: 'Injection Moulding' }),
    /not compatible/,
  );
  // A compatible pair still works.
  assert.ok(computeShouldCost({ ...base, material: 'Aluminium 6061', process: 'Die Casting (Aluminium)' }).totalShouldCost > 0);
});

test('simulation is deterministic and well-ordered (p10 <= p50 <= p90)', () => {
  const a = simulateShouldCost(base);
  const b = simulateShouldCost(base);
  assert.equal(a.p50, b.p50);
  assert.equal(a.p10, b.p10);
  assert.equal(a.p90, b.p90);
  assert.ok(a.p10 <= a.p50 && a.p50 <= a.p90);
  // deterministic point estimate sits inside the band
  const det = computeShouldCost(base).totalShouldCost;
  assert.ok(det >= a.p10 - 0.5 && det <= a.p90 + 0.5);
});

test('every process references valid material families', () => {
  const fams = new Set(Object.values(MATERIALS).map(m => m.family));
  for (const [name, p] of Object.entries(PROCESSES)) {
    assert.ok(Array.isArray(p.families) && p.families.length > 0, `${name} missing families`);
    for (const f of p.families) assert.ok(fams.has(f), `${name} references unknown family ${f}`);
  }
});

test('every material has at least one compatible process (no orphans)', () => {
  const procFamilies = Object.values(PROCESSES).flatMap(p => p.families);
  for (const [name, m] of Object.entries(MATERIALS)) {
    assert.ok(procFamilies.includes(m.family), `${name} (${m.family}) has no compatible process`);
    // and it actually costs without throwing on some compatible process
    const proc = Object.keys(PROCESSES).find(p => PROCESSES[p].families.includes(m.family));
    assert.ok(computeShouldCost({ material: name, process: proc, weightKg: 2, annualVolume: 80000, region: 'Germany' }).totalShouldCost > 0);
  }
});

test('cast iron is castable and cannot be stamped/forged', () => {
  const knuckle = computeShouldCost({ material: 'Cast Iron (Ductile/GJS)', process: 'Sand Casting', weightKg: 6.7, annualVolume: 200000, region: 'China' });
  assert.ok(knuckle.totalShouldCost > 0);
  assert.throws(() => computeShouldCost({ material: 'Cast Iron (Grey)', process: 'Stamping / Deep Drawing', weightKg: 2, annualVolume: 80000, region: 'Germany' }), /not compatible/);
});

test('volumeSensitivity: unit cost falls monotonically as volume rises', () => {
  const curve = volumeSensitivity(base, [10000, 50000, 250000, 500000]);
  assert.equal(curve.length, 4);
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i].unitCost <= curve[i - 1].unitCost, `cost should not rise from ${curve[i-1].volume} to ${curve[i].volume}`);
  }
  assert.equal(curve[0].volume, 10000);
});

test('all regions have sane rate fields', () => {
  for (const [name, r] of Object.entries(REGIONS)) {
    assert.ok(r.labour > 0, `${name} labour`);
    assert.ok(r.overheadPct > 0 && r.overheadPct < 1, `${name} overheadPct`);
    assert.ok(r.sgaPct > 0 && r.sgaPct < 1, `${name} sgaPct`);
  }
});

test('non-finite / out-of-range weight & volume throw instead of returning NaN', () => {
  const ok = { material: 'Cast Iron (Ductile/GJS)', process: 'Sand Casting', annualVolume: 200000, region: 'China' };
  for (const w of [Infinity, -Infinity, NaN, 0, -5, '1e999']) {
    assert.throws(() => computeShouldCost({ ...ok, weightKg: Number(w) }), /weightKg must be a finite number/);
  }
  // finite-but-overflowing weight is caught by the non-finite-total guard
  assert.throws(() => computeShouldCost({ ...ok, weightKg: 1e306 }), /finite/);
  for (const v of [Infinity, NaN, 0, -1]) {
    assert.throws(() => computeShouldCost({ material: 'Steel (mild)', process: 'Stamping / Deep Drawing', weightKg: 2, annualVolume: v, region: 'Germany' }), /annualVolume must be a finite number/);
  }
});

test('a library process missing load-bearing fields throws, not NaN', () => {
  const badLib = {
    MATERIALS, REGIONS,
    PROCESSES: { Broken: { machineRate: 50, operators: 1, cavities: 1, scrapPct: 0.05, setupHr: 1, batch: 100, toolLife: 1e6, cycleBase: 10, cyclePerKg: 1, toolingBase: 1000, toolingPerKg: 0, families: ['ferrous'] } },
  }; // utilisation intentionally absent
  assert.throws(() => computeShouldCost({ material: 'Steel (mild)', process: 'Broken', weightKg: 2, annualVolume: 80000, region: 'Germany' }, {}, null, badLib), /utilisation/);
});

test('simulation band is wide enough to be a useful should-cost range', () => {
  const s = simulateShouldCost({ material: 'Cast Iron (Ductile/GJS)', process: 'Sand Casting', weightKg: 6.7, annualVolume: 200000, region: 'China' });
  assert.ok(s.p10 < s.p50 && s.p50 < s.p90, 'percentiles must be ordered');
  const spread = (s.p90 - s.p10) / s.p50;
  assert.ok(spread > 0.12, `P10–P90 spread ${(spread * 100).toFixed(0)}% too narrow to cover real price scatter`);
  assert.ok(spread < 0.80, `P10–P90 spread ${(spread * 100).toFixed(0)}% implausibly wide`);
});

test('casting reports a physical poured (buy-to-fly) mass, not finished mass', () => {
  const r = computeShouldCost({ material: 'Cast Iron (Ductile/GJS)', process: 'Sand Casting', weightKg: 6.7, annualVolume: 200000, region: 'China' });
  // sand-cast metal yield 0.55 → poured mass ≈ 12 kg, well above the 6.7 kg finished part
  assert.ok(r.drivers.inputMassKg > 10 && r.drivers.inputMassKg < 14, `poured mass ${r.drivers.inputMassKg}kg not physical`);
});
