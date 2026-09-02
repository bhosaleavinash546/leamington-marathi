// Arithmetic re-check, pinned on REAL calculation bases from four live Prism
// runs. Each rule in idea-arith.mjs exists because one of these strings broke
// the reading before it; the three statuses must stay honest — a basis the
// parser cannot read is "unparsed", never a verdict either way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkArithmetic, parseBasis, parseMoneyRange, parseVolume, findMoney, runArithmeticChecks } from '../idea-arith.mjs';

const idea = (annualValue, calculationBasis) => ({ costSavingPotential: { annualValue, calculationBasis } });

test('money and volume parsing handles ranges, suffixes, thousands and suffix currencies', () => {
  assert.deepEqual(parseMoneyRange('€40K–€75K at 60,000 units/yr'), { lo: 40000, hi: 75000, mid: 57500 });
  assert.deepEqual(parseMoneyRange('€0.30–0.60/part'), { lo: 0.3, hi: 0.6, mid: 0.45 });
  assert.deepEqual(parseMoneyRange('€3-5M dies'), { lo: 3e6, hi: 5e6, mid: 4e6 });
  assert.equal(findMoney('3.4 EUR/kg')[0].value, 3.4);
  assert.equal(parseVolume('at 60,000 units/yr'), 60000);
  assert.equal(parseVolume('× 10M lam'), 1e7);
  assert.equal(parseVolume('€3K–€6K/yr at 60,000 units/yr'), 60000, 'a money figure per year is not a volume');
  assert.equal(parseVolume('nothing here'), null);
});

test('unit saving × volume — volume from the basis, the annual value, or the run, in that order', () => {
  const a = checkArithmetic(idea('€60K at 60,000 units/yr', '€1.03/part process premium [W3] × 60,000 = €61.8K/yr'));
  assert.equal(a.status, 'consistent');
  assert.equal(a.computedEur, 61800);
  const b = checkArithmetic(idea('€25K-€55K at 60,000 units/yr', '€0.4-0.9/part cycle+tool saving × 60,000; addresses E10/E11 unpriced findings'));
  assert.equal(b.status, 'consistent');
  assert.equal(b.computedEur, 39000);
  const c = checkArithmetic(idea('€2.4M–€3.6M at 200,000 units/yr', '€12-18 saved per 1.8 kg set × 200,000 units'));
  assert.equal(c.status, 'consistent');
  const d = checkArithmetic(idea('€3K–€6K', '€0.06/part saving'), { annualVolume: 60000 });
  assert.equal(d.status, 'consistent');
  assert.match(d.basis, /volume from run/);
  const e = checkArithmetic(idea('€3K–€6K', '€0.06/part saving'));
  assert.equal(e.status, 'unparsed');
  assert.match(e.note, /without a volume/);
});

test('percentage of a per-unit figure, with product chains and mass × €/kg', () => {
  const a = checkArithmetic(idea('€7.7M–€12.0M at 200,000 units/yr', '€214.68 magnet line × ~20% avg net magnet cost reduction from ~60% heavy-RE cut × 200,000 units'));
  assert.equal(a.status, 'consistent');
  assert.equal(a.computedEur, 8587200);
  const b = checkArithmetic(idea('€600K–€1.1M at 10,000,000 units/yr', 'Buy-to-fly 1.43→1.18 saves ~0.017 kg x 3.4 EUR/kg x 10M less recovered-scrap credit'));
  assert.equal(b.status, 'consistent');
  assert.equal(b.computedEur, 578000);
  const c = checkArithmetic(idea('€3K–€7K/yr at 60,000 units/yr', 'Cut overbuy 61%→28% ≈ 0.08kg bought/part saved × 60k × ~€0.80/kg CRC net of scrap credit'));
  assert.equal(c.status, 'consistent');
  assert.equal(c.computedEur, 3840);
});

test('a real mismatch is reported with a signed delta against the nearest bound', () => {
  // The model's own basis gives €0.005/lam × 10M = €170K against a stated €700K–€1.4M.
  const a = checkArithmetic(idea('€700K–€1.4M at 10,000,000 units/yr', 'Loss-limited stack shortening ~10% steel mass out: 0.005 kg x 3.4 EUR/kg x 10M plus efficiency/range credit'));
  assert.equal(a.status, 'mismatch');
  assert.equal(a.computedEur, 170000);
  assert.equal(a.deltaPct, -76);
  assert.match(a.note, /below the stated minimum/);
  // 3% of €0.10 × 10M = €30K against €250K–€500K.
  const b = checkArithmetic(idea('€250K–€500K at 10,000,000 units/yr', '2-4% stack length reduction on €0.10 material [E12] plus copper saving at motor level; ×10M lam'));
  assert.equal(b.status, 'mismatch');
  assert.equal(b.deltaPct, -88);
  // Above: 50% of €214.68 × 200k = €21.5M against €6.0M–€10.8M.
  const c = checkArithmetic(idea('€6.0M–€10.8M at 200,000 units/yr', '40-60% NdFeB substitution to ferrite on €214.68 line, net of larger lamination/copper, × 200,000'));
  assert.equal(c.status, 'mismatch');
  assert.ok(c.deltaPct > 0);
});

test('context figures (baseline, gap, "most of €X", "vs") are not counted as savings', () => {
  const a = checkArithmetic(idea('€50K–€80K at 60,000 units/yr', 'Removes most of €1.32/part (E14) net of added rail-tool complexity; conservative €0.80–1.10/part net × 60,000'));
  assert.equal(a.status, 'consistent');
  assert.equal(a.computedEur, 57000);
  const b = checkArithmetic(idea('€40K-€90K at 60,000 units/yr', 'Machining setup deletion €0.6-1.2/part + process premium capture; blended vs W3 €1.03'));
  assert.equal(b.status, 'consistent');
  assert.equal(b.computedEur, 54000);
  const c = checkArithmetic(idea('€180K–€350K at 10,000,000 units/yr', '€0.29/lam baseline [E11]; ~€0.02-0.035/lam net from deleted interlock ops + tooling, minus coating premium, ×10M'));
  assert.equal(c.status, 'consistent');
  assert.equal(c.computedEur, 275000);
});

test('a cost build-up feeds a following "N% reduction"; "less N%" scales the total; "net" supersedes gross', () => {
  const a = checkArithmetic(idea('€400K–€900K at 10,000,000 units/yr', 'machine €0.05 + setup €0.05 + labour €0.01 = €0.11/part; 25% reduction x 10M'));
  assert.equal(a.computedEur, 275000);
  assert.equal(a.status, 'mismatch');
  const b = checkArithmetic(idea('€40K-€90K net at 60,000 units/yr', '€1.69/part × 60,000 = €101K gross [W4]; less 30-60% logistics/duty/risk'));
  assert.equal(b.status, 'consistent');
  assert.equal(b.computedEur, 55550);
  const c = checkArithmetic(idea('€3K–€6K/yr at 60,000 units/yr', '€0.10/part ex-works (W4) × 60k, less realistic intra-EU freight; Czech route captures ~€0.06 net'));
  assert.equal(c.status, 'consistent');
  assert.equal(c.computedEur, 3600);
});

test('from → to money pairs contribute the difference', () => {
  const a = checkArithmetic(idea('€2K–€4K/yr at 60,000 units/yr', '0.75→0.62mm ≈ 17% mass-out × 60k, near-flat €/t; material €0.20→~€0.17'));
  assert.equal(a.status, 'consistent');
  assert.equal(a.computedEur, 1800);
});

test('programme, lifetime and NRE totals are refused — never multiplied by a volume', () => {
  const a = checkArithmetic(idea('€250K-€400K vehicle-level at 60,000 units/yr', '1.25 kg/corner unsprung saving credited + bearing-sleeve op deletion; per bimetal precedent ~£833k programme'));
  assert.equal(a.status, 'unparsed');
  assert.match(a.note, /programme/);
  const b = checkArithmetic(idea('€2.0M–€4.0M/yr', 'Avoided per-variant die NRE (2-3 variants × ~€3-5M dies) amortised over 200,000×5-7yr'));
  assert.equal(b.status, 'unparsed');
  const c = checkArithmetic(idea('€30K-€70K at 60,000 units/yr', 'Volume-driven piece-price + fixture/validation amortisation across RH+LH+variants'));
  assert.equal(c.status, 'unparsed');
  assert.match(c.note, /no readable saving figure/);
  assert.equal(parseBasis(''), null);
});

test('runArithmeticChecks stamps every idea, flags only mismatches, and counts honestly', () => {
  const ideas = [
    idea('€60K at 60,000 units/yr', '€1.03/part × 60,000 = €61.8K/yr'),
    idea('€700K–€1.4M at 10,000,000 units/yr', '0.005 kg x 3.4 EUR/kg x 10M'),
    idea('€30K', 'fixture amortisation across variants'),
  ];
  const s = runArithmeticChecks(ideas, { annualVolume: 60000 });
  assert.deepEqual(s, { consistent: 1, mismatch: 1, unparsed: 1 });
  assert.equal(ideas[0].arithmetic.status, 'consistent');
  assert.equal(ideas[0].validationFlags, undefined);
  assert.ok(ideas[1].validationFlags.some(f => /^arithmetic-mismatch\(-\d+%\)$/.test(f)));
  assert.equal(ideas[2].arithmetic.status, 'unparsed');
  assert.equal(ideas[2].validationFlags, undefined, 'unparsed is not a defect');
});
