// Wiring-harness model sanity: totals in industry bands, monotonic in the
// drivers that matter, honest validation errors.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeHarnessCost } from '../harness-cost.mjs';

describe('harness-cost', () => {
  it('a door harness (45 circuits) lands in the €8–35 band', () => {
    const r = computeHarnessCost({ circuits: 45, avgLengthM: 1.1, region: 'Mexico', annualVolume: 200000 });
    assert.ok(r.totalEur > 8 && r.totalEur < 35, `got €${r.totalEur}`);
  });

  it('a full-vehicle body harness (900 circuits) lands in the €180–650 band', () => {
    const r = computeHarnessCost({ circuits: 900, avgLengthM: 2.2, region: 'Mexico', annualVolume: 80000 });
    assert.ok(r.totalEur > 180 && r.totalEur < 650, `got €${r.totalEur}`);
  });

  it('cost is monotonic in circuits, length, and labour rate', () => {
    const base = computeHarnessCost({ circuits: 200, region: 'Mexico' }).totalEur;
    assert.ok(computeHarnessCost({ circuits: 400, region: 'Mexico' }).totalEur > base);
    assert.ok(computeHarnessCost({ circuits: 200, avgLengthM: 3.5, region: 'Mexico' }).totalEur > base);
    assert.ok(computeHarnessCost({ circuits: 200, region: 'Germany' }).totalEur > base, 'Germany labour must cost more than Mexico');
  });

  it('breakdown reconciles with the total (± NRC rounding)', () => {
    const r = computeHarnessCost({ circuits: 300 });
    const b = r.breakdown;
    const sum = b.conductor + b.insulation + b.connectors + b.terminals + b.splices + b.tapeConduit + b.labour + b.overhead + b.commercial + b.sgaProfit + b.nrcAmortised;
    assert.ok(Math.abs(sum - r.totalEur) < 0.15, `sum ${sum} vs total ${r.totalEur}`);
  });

  it('sealed connector share raises material cost', () => {
    const dry = computeHarnessCost({ circuits: 200, sealedPct: 0 }).breakdown.connectors;
    const wet = computeHarnessCost({ circuits: 200, sealedPct: 1 }).breakdown.connectors;
    assert.ok(wet > dry * 2, 'sealed connectors ~2.7× unsealed');
  });

  it('rejects nonsense circuit counts', () => {
    assert.throws(() => computeHarnessCost({ circuits: 0 }));
    assert.throws(() => computeHarnessCost({ circuits: 999999 }));
  });

  it('band widens with harness size (routing complexity honesty)', () => {
    const small = computeHarnessCost({ circuits: 50 }).band.pct;
    const big = computeHarnessCost({ circuits: 2000 }).band.pct;
    assert.ok(big > small);
  });
});
