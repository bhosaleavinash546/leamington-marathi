// Detailed CBD engine: parity with the simple engine at defaults, waterfall
// integrity, yield structure, MHR build-up, and override propagation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveDrivers, costBomDetailed, mhrFromBuildup, sanitizeDriverOverrides } from '../pcb-detailed.mjs';

const BOM = {
  board: { widthMm: 120, heightMm: 80, layers: 4, finish: 'enig' },
  components: [
    { refDes: 'U1', type: 'mcu', qty: 1, pins: 100 },
    { refDes: 'U2', type: 'ic_power', qty: 4 },
    { refDes: 'R', type: 'resistor', qty: 80 },
    { refDes: 'C', type: 'capacitor_mlcc', qty: 60 },
    { refDes: 'J', type: 'connector', qty: 2, pins: 24 },
  ],
};

test('ONE ENGINE, TWO VIEWS: detailed reconciles with simple <0.5% at defaults', () => {
  for (const [volume, region] of [[1000, 'china'], [10000, 'china'], [150000, 'china'], [150000, 'germany'], [150000, 'mexico'], [500, 'usa']]) {
    const r = costBomDetailed(BOM, { volume, region });
    assert.ok(Math.abs(r.parity.deltaPct) < 0.5, `${region}@${volume}: delta ${r.parity.deltaPct}%`);
  }
});

test('waterfall lines sum to the landed total', () => {
  const r = costBomDetailed(BOM, { volume: 150000, region: 'china', tariffPct: 10 });
  const sum = r.lines.reduce((s, l) => s + l.value, 0);
  assert.ok(Math.abs(sum - r.landed) < 0.05, `lines £${sum.toFixed(2)} vs landed £${r.landed}`);
  assert.ok(r.exWorks < r.landed, 'landed includes below-the-line adders');
});

test('drivers are physically meaningful and region/volume aware', () => {
  const cn = deriveDrivers(BOM, { volume: 150000, region: 'china' });
  const de = deriveDrivers(BOM, { volume: 150000, region: 'germany' });
  const smtCn = cn.stations.find(s => s.id === 'smt');
  const smtDe = de.stations.find(s => s.id === 'smt');
  assert.ok(Math.abs(smtCn.cycleSec - smtDe.cycleSec) < 0.2, 'cycle TIME is region-invariant');
  assert.ok(smtDe.mhr > smtCn.mhr * 2, 'German line RATE is much higher');
  assert.ok(cn.stations.some(s => s.id === 'ict') && cn.stations.some(s => s.id === 'fct'), 'automotive volume gets full test suite');
  const rtyDefault = (cn.yieldD.fpyPrintPct / 100) * (cn.yieldD.fpyPlacePct / 100) * (cn.yieldD.fpyReflowPct / 100) * (cn.yieldD.fpyTestPct / 100);
  assert.ok(Math.abs(rtyDefault - 0.985) < 0.001, 'stage FPYs multiply to the v2 yield');
  assert.equal(cn.overheads.mfgOhPct + cn.overheads.sgaPct + cn.overheads.profitPct, 30, 'overhead pools sum to v2 conversion overhead');
});

test('override propagation: MHR doubles conversion only; SG&A=0 drops its line', () => {
  const base = costBomDetailed(BOM, { volume: 150000, region: 'china' });
  const smt = base.stations.find(s => s.id === 'smt');
  const doubled = costBomDetailed(BOM, { volume: 150000, region: 'china' }, { stations: { smt: { mhr: smt.mhr * 2 } } });
  const smtLine = (r) => r.lines.find(l => l.label.startsWith('SMT line')).value;
  const matLine = (r) => r.lines.find(l => l.label.startsWith('Purchased components')).value;
  assert.ok(Math.abs(smtLine(doubled) - smtLine(base) * 2) < 0.01, 'SMT cost doubles with MHR');
  assert.equal(matLine(doubled), matLine(base), 'material untouched');
  assert.ok(doubled.landed > base.landed, 'total rises');

  const noSga = costBomDetailed(BOM, { volume: 150000, region: 'china' }, { overheads: { sgaPct: 0 } });
  assert.equal(noSga.lines.find(l => l.label.startsWith('SG&A')).value, 0);
  assert.ok(noSga.landed < base.landed);
});

test('yield: worse FPY raises cost; rework mode is cheaper than scrapping late-stage boards', () => {
  const base = costBomDetailed(BOM, { volume: 150000, region: 'china' });
  const worse = costBomDetailed(BOM, { volume: 150000, region: 'china' }, { yieldD: { fpyTestPct: 95 } });
  assert.ok(worse.landed > base.landed, 'lower FPY costs more');
  const reworked = costBomDetailed(BOM, { volume: 150000, region: 'china' }, { yieldD: { fpyTestPct: 95, reworkSharePct: 80 } });
  assert.ok(reworked.landed < worse.landed, 'reworking most failures beats scrapping them at accumulated cost');
});

test('NRE amortisation volume override moves per-board cost', () => {
  const base = costBomDetailed(BOM, { volume: 150000, region: 'china' });
  const programLife = costBomDetailed(BOM, { volume: 150000, region: 'china' }, { nre: { ict_fixture: { amortVolume: 750000 } } });
  const nreLine = (r) => r.lines.find(l => l.label.startsWith('NRE')).value;
  assert.ok(nreLine(programLife) < nreLine(base), '5-year amortisation cuts per-board NRE');
});

test('mhrFromBuildup follows the standard formula and reacts to drivers', () => {
  const base = mhrFromBuildup({});
  assert.ok(base > 20 && base < 200, `default MHR £${base}/hr plausible`);
  assert.ok(mhrFromBuildup({ investment: 2_000_000 }) > base, 'more capital → higher rate');
  assert.ok(mhrFromBuildup({ productiveHoursYr: 7000 }) < base, 'more productive hours → lower rate');
  assert.ok(mhrFromBuildup({ operators: 2, labourRate: 40 }) > base, 'more operator content → higher rate');
});

test('sanitizeDriverOverrides clamps and whitelists', () => {
  const out = sanitizeDriverOverrides({
    material: { attritionPct: 5, materialOhPct: 999 },
    overheads: { profitPct: -3, sgaPct: 6 },
    stations: { smt: { mhr: 95, cycleSec: -1 }, evil: { mhr: 1e9 } },
    nre: { ict_fixture: { amount: 12000, amortVolume: 0 } },
    hax: { anything: 1 },
  });
  assert.equal(out.material.attritionPct, 5);
  assert.equal(out.material.materialOhPct, undefined, 'out-of-range dropped');
  assert.equal(out.overheads.profitPct, undefined);
  assert.equal(out.overheads.sgaPct, 6);
  assert.equal(out.stations.smt.mhr, 95);
  assert.equal(out.stations.smt.cycleSec, undefined);
  assert.equal(out.stations.evil, undefined, 'absurd values dropped whole');
  assert.equal(out.nre.ict_fixture.amount, 12000);
  assert.equal(out.nre.ict_fixture.amortVolume, undefined, 'amortVolume must be ≥1');
  assert.equal(out.hax, undefined);
});
