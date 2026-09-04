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
  // Sept 2026: the two shortfall cases below moved from `mismatch` to `partial`,
  // and that is the fix rather than a regression. Both bases END with a term
  // this parser cannot price — "plus efficiency/range credit", "plus copper
  // saving at motor level" — so the computed figure is a FLOOR and the gap to
  // the stated range is the reader's blind spot, not a proven model error. See
  // the `partial` tests below. A clean shortfall with nothing unpriced is still
  // a mismatch, which is what the first case here now checks.
  const a = checkArithmetic(idea('€700K–€1.4M at 10,000,000 units/yr', 'Loss-limited stack shortening ~10% steel mass out: 0.005 kg x 3.4 EUR/kg x 10M'));
  assert.equal(a.status, 'mismatch');
  assert.equal(a.computedEur, 170000);
  assert.equal(a.deltaPct, -76);
  assert.match(a.note, /below the stated minimum/);
  // The SAME basis with an unpriced credit appended is a floor, not a verdict.
  const aPartial = checkArithmetic(idea('€700K–€1.4M at 10,000,000 units/yr', 'Loss-limited stack shortening ~10% steel mass out: 0.005 kg x 3.4 EUR/kg x 10M plus efficiency/range credit'));
  assert.equal(aPartial.status, 'partial');
  assert.equal(aPartial.computedEur, 170000, 'the priced part is unchanged — only the verdict about it changes');
  // 3% of €0.10 × 10M = €30K against €250K–€500K, with an unpriced motor-level term.
  const b = checkArithmetic(idea('€250K–€500K at 10,000,000 units/yr', '2-4% stack length reduction on €0.10 material [E12] plus copper saving at motor level; ×10M lam'));
  assert.equal(b.status, 'partial');
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

test('live after-run strings: bucket lines are context, unlinked percentages do not multiply, €/kg needs a mass, "minus" subtracts', () => {
  // A bucket named before a figure is the cost being attacked; the saving is
  // the per-unit figure by the saving word.
  const a = checkArithmetic(idea('€250K–€500K at 10,000,000 units/yr', 'Material €0.10/part; reducing 43% overbuy by ~one-quarter via nesting + scrap buy-back saves ~€0.02-0.03/part × 10M'));
  assert.equal(a.status, 'consistent');
  assert.equal(a.computedEur, 250000);
  // "…~€0.02-0.03/part … and ~1-2% steel mass" — the percentage is a second
  // claim with no base, not a multiplier on the money figure.
  const b = checkArithmetic(idea('€180K–€350K at 10,000,000 units/yr', '€0.29/part baseline; ~€0.02-0.03/part from deleted interlock punches + stack-weld op and ~1-2% steel mass from higher stacking factor across 10M parts'));
  assert.equal(b.status, 'consistent');
  assert.equal(b.computedEur, 250000);
  // A €/kg price with no mass is not a per-part saving — refuse, do not guess.
  const c = checkArithmetic(idea('€120K–€300K at 10,000,000 units/yr', 'Iron-loss reduction lets stack shorten ~3-5%, trimming steel mass at 3.4 EUR/kg; part-level saving net of higher per-tonne thin-gauge price across 10M'));
  assert.equal(c.status, 'unparsed');
  assert.match(c.note, /€\/kg price with no mass/);
  // "minus €0.12/kg × 0.073 kg" subtracts from the term before it.
  const d = checkArithmetic(idea('€1.7M–€2.9M at 10,000,000 units/yr', '€0.29 base × ~7% net on machine+setup+tooling lines (E12), minus ~€0.12/kg coating premium × 0.073 kg'));
  assert.equal(d.status, 'mismatch');
  assert.equal(d.computedEur, 115400);
  // The released figure in brackets wins over the bucket build-up before it.
  const e = checkArithmetic(idea('€200K–€450K at 10,000,000 units/yr', 'Setup €0.05 + tooling €0.01 largely amortised across variants (~€0.02-0.03/part released) plus 2-4% steel volume-price gain × 10M'));
  assert.equal(e.status, 'consistent');
  assert.equal(e.computedEur, 250000);
  // A cost that goes UP is context; a programme-sized die figure is refused.
  const f = checkArithmetic(idea('Net −€0.6M–€1.2M part cost', 'Mass 0.051→0.029 kg but €1.45→€3.40/kg; part material €0.10→~€0.14 (E12,E61,E62)'), { annualVolume: 1e7 });
  assert.equal(f.status, 'unparsed');
  const g = checkArithmetic(idea('€0.3M–€0.8M portfolio-level', 'Avoids €0.5–1.5M dies on tail variants + die-life extension on runner (E12 tooling €0.01/part)'), { annualVolume: 1e7 });
  assert.equal(g.status, 'unparsed');
});

test('runArithmeticChecks stamps every idea, flags only mismatches, and counts honestly', () => {
  const ideas = [
    idea('€60K at 60,000 units/yr', '€1.03/part × 60,000 = €61.8K/yr'),
    idea('€700K–€1.4M at 10,000,000 units/yr', '0.005 kg x 3.4 EUR/kg x 10M'),
    idea('€30K', 'fixture amortisation across variants'),
  ];
  const s = runArithmeticChecks(ideas, { annualVolume: 60000 });
  const { corroboration, ...verdicts } = s;
  assert.deepEqual(verdicts, { computed: 0, consistent: 1, mismatch: 1, partial: 0, unparsed: 1 },
    'none of these fixtures carries a structured saving model, so none is `computed`');
  assert.equal(corroboration.absent, 3, 'none of these fixtures carries a cost bridge');
  assert.equal(ideas[0].arithmetic.status, 'consistent');
  assert.equal(ideas[0].validationFlags, undefined);
  assert.ok(ideas[1].validationFlags.some(f => /^arithmetic-mismatch\(-\d+%\)$/.test(f)));
  assert.equal(ideas[2].arithmetic.status, 'unparsed');
  assert.equal(ideas[2].validationFlags, undefined, 'unparsed is not a defect');
});

// ─────────────────────────────────────────────────────────────────────────────
// THE FALSE-POSITIVE REVIEW (Sept 2026).
//
// The checker reported 16 of 62 live Prism ideas as arithmetic mismatches —
// 25.8%. Reading all sixteen by hand found FOURTEEN were the reader's fault,
// not the model's. That is worse than not checking: a badge that cries wolf on
// seven cases out of eight teaches a reader to ignore it, and it was feeding
// `validationFlags` that the ranker reads.
//
// Every test below carries the exact basis string that exposed its defect, so a
// future change that reintroduces one fails here with the evidence attached.
// After these fixes: 2 mismatches of 62 (3.2%), both verified by hand as real
// overstatements of 5-10x and 15-25x.
// ─────────────────────────────────────────────────────────────────────────────
test('an HOURLY RATE is not a multiplicand', () => {
  // Worst false positive on the corpus: £38-47/hr multiplied into the chain
  // reported €81,039,000 against a stated €1.7M–€2.7M — a 2901% "error".
  const a = checkArithmetic(idea(
    '€1.7M–€2.7M at 200,000 units/yr',
    '€47.67 block × ~20% + DFA labour saving on ~8 fasteners/1 gasket at £38-47/hr × 200,000',
  ), { annualVolume: 200000 });
  assert.equal(a.status, 'consistent', a.note);
  assert.equal(a.computedEur, 1906800);
  assert.doesNotMatch(a.basis, /38|47\/hr/, 'the rate must not appear in the working');

  const b = checkArithmetic(idea(
    '€0.35M–€0.6M at 200,000 units/yr',
    '€11.22 × ~18% + DFA saving on 2 mounting ops at £42/hr × 200,000',
  ), { annualVolume: 200000 });
  assert.equal(b.status, 'consistent', b.note);

  // …but a per-part figure that merely sits near a rate is still counted.
  const c = checkArithmetic(idea('€60K at 60,000 units/yr', '€1.00/part saved at £45/hr line rate × 60,000'), { annualVolume: 60000 });
  assert.equal(c.status, 'consistent', c.note);
  assert.equal(c.computedEur, 60000);
});

test('the model\'s own product supersedes the working above it', () => {
  // "Removes bracket cost €1.32 less …(~€0.35); ~€0.60–€0.90/part × 60,000" is
  // one claim written twice. Adding both reported €124,200 against €35K–€55K.
  const a = checkArithmetic(idea(
    '€35K–€55K at 60,000 units/yr',
    'Removes bracket cost €1.32 less the marginal cost of rail feature (~€0.35); ~€0.60–€0.90/part × 60,000',
  ), { annualVolume: 60000 });
  assert.equal(a.status, 'consistent', a.note);
  assert.equal(a.computedEur, 45000);
  assert.match(a.basis, /working/, 'the verdict must say the earlier figures were treated as working');

  // Same shape reached through the result-marker branch ("saving ~€0.15–0.25/part × 60,000").
  const b = checkArithmetic(idea(
    '€8K–€15K at 60,000 units/yr',
    'Removes e-coat (€0.01) + weld op + mass; PA6-GF30 part mass ~0.10 kg × €3.2 = €0.32 vs steel material+finish; net process/complexity saving ~€0.15–0.25/part × 60,000',
  ), { annualVolume: 60000 });
  assert.equal(b.status, 'consistent', b.note);
  assert.equal(b.computedEur, 12000, 'the per-part summary must still be multiplied by the volume');

  // A single-clause basis has no working to supersede — unchanged behaviour.
  const c = checkArithmetic(idea('€60K at 60,000 units/yr', '€1.00/part × 60,000'), { annualVolume: 60000 });
  assert.equal(c.status, 'consistent');
  assert.equal(c.computedEur, 60000);
});

test('bare "saving €x" is a result marker, and "2.5x volume" is not a multiplicand', () => {
  // RESULT_RE listed "saves" and "saving of" but not bare "saving", so the
  // product chain multiplied the RATIO 2.5 and reported €45,750 vs €12K–€22K.
  const a = checkArithmetic(idea(
    '€12K–€22K at 60,000 units/yr',
    'Tooling €0.66/part; commonising over ~2.5× volume cuts tooling €/part to ~€0.26–0.35, saving ~€0.30/part × 60,000',
  ), { annualVolume: 60000 });
  assert.equal(a.status, 'consistent', a.note);
  assert.equal(a.computedEur, 18000);
});

test('a CAPTURE rate multiplies; it does not subtract', () => {
  // "€101K ceiling; net after freight/duty typically 50-70% capture" means keep
  // 50-70%. Reading it as a 60% loss put the total 19% under the stated range.
  const a = checkArithmetic(idea(
    '€50K–€100K/yr net at 60,000 units/yr',
    '€1.69/part ex-works (W4) × 60,000 = €101K ceiling; net after freight/duty on 2.546 kg part typically 50-70% capture',
  ), { annualVolume: 60000 });
  assert.equal(a.status, 'consistent', a.note);
  assert.ok(a.computedEur > 55000 && a.computedEur < 71000, `expected ~60% of €101K, got €${a.computedEur}`);

  // A genuine reduction still reduces.
  const b = checkArithmetic(idea('€40K at 60,000 units/yr', '€1.00/part × 60,000; less 30% logistics'), { annualVolume: 60000 });
  assert.equal(b.computedEur, 42000);
});

test('an unpriced or refused term makes the total a FLOOR, and only downward', () => {
  // Named but not priced → partial when short.
  const a = checkArithmetic(idea(
    '€2.5M–€4.0M at 200,000 units/yr',
    '~€130/unit tooled-line content × ~5-7% scale/NRE benefit × 200,000, plus cross-variant NRE avoidance',
  ), { annualVolume: 200000 });
  assert.equal(a.status, 'partial', a.note);
  assert.ok(Array.isArray(a.unpricedTerms) && a.unpricedTerms.length, 'the unpriced term must be named');
  assert.match(a.note, /FLOOR/);

  // A REFUSED clause is the same fact about the reader, so it counts too.
  const b = checkArithmetic(idea(
    '€1.0M–€2.5M at 10,000,000 units/yr',
    '220 t/yr overbuy × €1.45/kg = €319k prime value; scrap-value uplift + nesting recovery €0.7–1.8M (E13,E61)',
  ), { annualVolume: 10000000 });
  assert.equal(b.status, 'partial', b.note);

  // ASYMMETRY: an unpriced positive term cannot explain an OVERSHOOT, so a
  // computed figure above the stated range stays a mismatch.
  const c = checkArithmetic(idea(
    '€10K at 60,000 units/yr',
    '€5.00/part × 60,000, plus a warranty benefit we have not sized',
  ), { annualVolume: 60000 });
  assert.equal(c.status, 'mismatch', 'overshoot is never excused by a missing positive term');
  assert.ok(c.deltaPct > 0);
});

test('a cost-neutral claim is unparsed, never a division by zero', () => {
  // "Approx. cost-neutral at part level (~€0 to -€0.3M at 10M/yr)" produced
  // deltaPct null with the literal words "Infinity% above the stated maximum".
  const a = checkArithmetic(idea(
    'Approx. cost-neutral at part level (~€0 to -€0.3M at 10M/yr); efficiency credit to be confirmed by dyno',
    'Mass 0.051→~0.044 kg at 0.30 mm gauge; €/kg step from M250-35A (~€1.45) to intermediate NO grade (~€1.90)',
  ), { annualVolume: 10000000 });
  assert.equal(a.status, 'unparsed');
  assert.equal(a.deltaPct, null);
  assert.doesNotMatch(a.note, /Infinity|NaN/);
});

test('the genuine overstatements the corpus contained are STILL caught', () => {
  // The whole point of removing false positives is that the true ones are
  // believable. Both of these were verified by hand as real: the model stated
  // 15-25x and 5-10x more than its own basis supports.
  const backlack = checkArithmetic(idea(
    '€1.7M–€2.9M at 10,000,000 units/yr',
    '€0.29 base × ~7% net on machine+setup+tooling lines (E12), minus ~€0.12/kg coating premium × 0.073 kg',
  ), { annualVolume: 10000000 });
  assert.equal(backlack.status, 'mismatch', backlack.note);
  assert.ok(backlack.deltaPct < -80);

  const grade = checkArithmetic(idea(
    '€0.7M–€1.5M at 10,000,000 units/yr',
    '~€0.15–0.25/kg grade delta × 0.073 kg × 10M; material line €0.10/part (E12,E61)',
  ), { annualVolume: 10000000 });
  assert.equal(grade.status, 'mismatch', grade.note);
  assert.ok(grade.deltaPct < -70);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SECOND OPINION (review P-3).
//
// Every idea states its saving arithmetic twice and nothing compared them. The
// measurement that shaped the fix: across 69 ideas where both fields parse, the
// bridge reads a median 0.30x the basis, clustered between 0.02x and 0.17x —
// one parser reading a field it was not built for, not 64% of ideas
// contradicting themselves. So agreement counts and disagreement does not.
// ─────────────────────────────────────────────────────────────────────────────
import { checkCorroboration } from '../idea-arith.mjs';

const withBridge = (basis, annualValue, costBridge) => ({
  costSavingPotential: { annualValue, calculationBasis: basis },
  engineering: { costBridge },
});

test('two independent statements landing on the same figure is corroboration', () => {
  const r = checkCorroboration(
    withBridge('€1.00/part × 60,000', '€60K at 60,000 units/yr', 'Bracket €2.40 → €1.40, saving €1.00/part × 60,000'),
    { annualVolume: 60000 },
  );
  assert.equal(r.status, 'corroborated');
  assert.equal(r.bridgeEur, 60000);
  assert.match(r.note, /agreeing with the calculation basis/);
});

test('a divergence is reported as NOT corroborated, never as a contradiction', () => {
  const r = checkCorroboration(
    withBridge('€1.00/part × 60,000', '€60K at 60,000 units/yr', 'Removes €0.05 of finishing per part'),
    { annualVolume: 60000 },
  );
  assert.equal(r.status, 'not-corroborated');
  assert.match(r.note, /NOT a contradiction/);
  assert.match(r.note, /low bias/, 'the note must name the parser bias that makes the disagreement uninformative');
});

test('an unreadable or absent bridge is stated, and is not a finding about the idea', () => {
  const none = checkCorroboration(withBridge('€1.00/part × 60,000', '€60K at 60,000 units/yr', undefined), { annualVolume: 60000 });
  assert.equal(none.status, 'absent');
  const prose = checkCorroboration(
    withBridge('€1.00/part × 60,000', '€60K at 60,000 units/yr', 'Cheaper because the tooling is simpler and the line runs better.'),
    { annualVolume: 60000 },
  );
  assert.equal(prose.status, 'unreadable');
  assert.match(prose.note, /NOT a finding about the idea/);
});

test('corroboration rides on the arithmetic stamp and is counted separately', () => {
  const ideas = [withBridge('€1.00/part × 60,000', '€60K at 60,000 units/yr', 'saving €1.00/part × 60,000')];
  const s = runArithmeticChecks(ideas, { annualVolume: 60000 });
  assert.equal(ideas[0].arithmetic.corroboration.status, 'corroborated');
  assert.equal(s.corroboration.corroborated, 1);
  assert.equal(ideas[0].arithmetic.status, 'consistent', 'the primary verdict is unchanged by the second opinion');
});
