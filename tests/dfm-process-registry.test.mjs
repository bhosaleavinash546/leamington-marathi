// Material → process → DFM rule family.
//
// The behaviour worth protecting: a process is routed to the rules that actually
// judge it, an impossible material/process pair cannot be offered, and a process
// that shapes nothing says so instead of returning an empty analysis.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MATERIALS, PROCESSES } from '../costing-engine.mjs';
import { PROCESS_FAMILIES, DFM_RULES, UNWRITTEN_RULES, resolveThreshold } from '../dfm-rule-catalogue.mjs';
import {
  PROCESS_TO_DFM_FAMILY, NO_DFM_REASON, dfmOptions, familyForSelection,
  processesForMaterial, materialsByFamily,
} from '../dfm-process-registry.mjs';
import { runDfmRules } from '../dfm-rules.mjs';

test('every costing process is routed, or explicitly declared unroutable', () => {
  // The gap this closes: "Sand Casting" was in the picker and in NO mapping, so
  // it silently fell through to a speculative sweep of all four families.
  for (const name of Object.keys(PROCESSES)) {
    assert.ok(Object.prototype.hasOwnProperty.call(PROCESS_TO_DFM_FAMILY, name),
      `${name} has no entry — it would fall through to a speculative sweep`);
    const family = PROCESS_TO_DFM_FAMILY[name];
    if (family) assert.ok(PROCESS_FAMILIES[family], `${name} routes to unknown family ${family}`);
    else assert.ok(NO_DFM_REASON[name], `${name} routes to nothing and gives no reason`);
  }
});

test('every declared family has at least one rule, and no rule is orphaned', () => {
  const withRules = new Set(DFM_RULES.map(r => r.process));
  for (const f of Object.keys(PROCESS_FAMILIES)) {
    assert.ok(withRules.has(f), `family ${f} is offered but has no rules`);
  }
  for (const f of withRules) {
    assert.ok(PROCESS_FAMILIES[f], `rules exist for undeclared family ${f}`);
  }
});

test('gravity die casting no longer borrows the die-casting wall band', () => {
  // THE BUG THIS FILE EXISTS FOR. Gravity castings run a 3-8 mm wall; judged at
  // HPDC's 1.0-3.5 every gravity part failed the wall rule automatically.
  assert.equal(PROCESS_TO_DFM_FAMILY['Gravity Die Casting'], 'gravity-die');
  const gdc = DFM_RULES.find(r => r.id === 'gdc-wall-thickness-range');
  const hpdc = DFM_RULES.find(r => r.id === 'hpdc-wall-thickness-range');
  assert.deepEqual(gdc.threshold, [3.0, 8.0]);
  assert.notDeepEqual(gdc.threshold, hpdc.threshold);
  // A 5 mm wall passes as a gravity casting and fails as a die casting.
  const geo = { dfm: { wallThickness: { p50Mm: 5.0 } } };
  assert.equal(runDfmRules(geo, 'gravity-die').findings.find(f => f.id === 'gdc-wall-thickness-range'), undefined);
  assert.ok(runDfmRules(geo, 'hpdc').findings.some(f => f.id === 'hpdc-wall-thickness-range'));
});

test('the alloy decides the threshold where the alloy decides the physics', () => {
  const bend = DFM_RULES.find(r => r.id === 'sm-bend-radius');
  // 6061-T6 splits at the radii mild steel tolerates. Same measure, same rule,
  // different number — and a report that used one for both passed a part that
  // cracks on the press.
  assert.equal(resolveThreshold(bend, 'Steel (mild)', 'ferrous').threshold, 1.0);
  assert.equal(resolveThreshold(bend, 'Aluminium 6061', 'aluminium').threshold, 3.0);
  const geo = { dfm: { sheetMetal: { isSheetMetal: true, minBendRadiusToThickness: 1.5 } } };
  const asSteel = runDfmRules(geo, 'sheet-metal', { material: 'Steel (mild)' });
  const asAlu = runDfmRules(geo, 'sheet-metal', { material: 'Aluminium 6061' });
  assert.equal(asSteel.findings.some(f => f.id === 'sm-bend-radius'), false, '1.5 r/t is fine in mild steel');
  assert.equal(asAlu.findings.some(f => f.id === 'sm-bend-radius'), true, '1.5 r/t splits 6061-T6');
});

test('an unknown material yields the generic band and SAYS it is generic', () => {
  const geo = { dfm: { sheetMetal: { isSheetMetal: true, minBendRadiusToThickness: 1.5 } } };
  const row = [...runDfmRules(geo, 'sheet-metal').findings,
    ...runDfmRules(geo, 'sheet-metal').passed].find(f => f.id === 'sm-bend-radius');
  assert.equal(row.thresholdBasis, 'process-generic');
  assert.equal(row.thresholdMatchedOn, null);
  // and with a material it is stamped with the material it was resolved for
  const tuned = runDfmRules(geo, 'sheet-metal', { material: 'Aluminium 6061' })
    .findings.find(f => f.id === 'sm-bend-radius');
  assert.equal(tuned.thresholdBasis, 'material');
  assert.equal(tuned.thresholdMatchedOn, 'Aluminium 6061');
});

test('a draft rule reads the angle it actually means off the curve', () => {
  // One hardcoded 1-degree cutoff served aluminium die casting, zinc (0.5),
  // sand (1.5) and hot forging (5). Each rule now names its own angle.
  const geo = { dfm: { draft: { wallAreaBelowDraftPct: { '0.5': 2, '1': 4, '1.5': 8, '5': 40 } } } };
  const zinc = runDfmRules(geo, 'hpdc-zinc');
  const sand = runDfmRules(geo, 'sand-casting');
  const forge = runDfmRules(geo, 'forging-hot');
  assert.equal(zinc.passed.find(f => f.id === 'hpdc-zinc-draft-minimum').measured, 2);
  assert.equal(sand.findings.find(f => f.id === 'sand-draft-minimum').measured, 8);
  assert.equal(forge.findings.find(f => f.id === 'forge-hot-draft-minimum').measured, 40);
});

test('a material can only be offered the processes that accept it', () => {
  const forAbs = processesForMaterial('ABS').map(p => p.name);
  assert.ok(forAbs.includes('Injection Moulding'));
  assert.ok(!forAbs.includes('Sand Casting'), 'ABS must not be sand castable');
  const forSteel = processesForMaterial('Steel (mild)').map(p => p.name);
  assert.ok(!forSteel.includes('Injection Moulding'), 'steel must not be injection mouldable');
  assert.ok(forSteel.includes('Stamping / Deep Drawing'));
});

test('every material grade is reachable through some family', () => {
  const reachable = new Set(materialsByFamily().flatMap(f => f.grades));
  for (const m of Object.keys(MATERIALS)) {
    assert.ok(reachable.has(m), `${m} is in the cost model but unselectable in the DFM picker`);
  }
});

test('a process that shapes nothing returns a reason, not an empty analysis', () => {
  const sel = familyForSelection({ process: 'E-coat (KTL)' });
  assert.equal(sel.family, null);
  assert.equal(sel.basis, 'no-rules');
  assert.match(sel.reason, /does not shape the part/);
});

test('dfmOptions carries a process list for every selectable grade', () => {
  const o = dfmOptions();
  for (const f of o.materialFamilies) {
    for (const g of f.grades) {
      assert.ok(Array.isArray(o.processesForMaterial[g]) && o.processesForMaterial[g].length,
        `${g} would show an empty process list`);
    }
  }
});

test('a company standard outranks every published guideline AND is graded higher', () => {
  // The grade matters as much as the number. Printing a plant's own threshold
  // under the original citation would credit a handbook for a value it never
  // gave; 'customer-standard' says someone accountable put their name to it.
  const geo = { dfm: { sheetMetal: { isSheetMetal: true, minBendRadiusToThickness: 1.5 } } };
  const overrides = { 'sm-bend-radius': { enabled: true, threshold: 1.2, note: 'press shop trial, 2024' } };
  const r = runDfmRules(geo, 'sheet-metal', { material: 'Aluminium 6061', overrides });
  const row = [...r.findings, ...r.passed].find(f => f.id === 'sm-bend-radius');
  assert.equal(row.threshold, 1.2, 'the company value must beat the 3.0 r/t material band');
  assert.equal(row.thresholdBasis, 'customer-standard');
  assert.equal(row.sourceStatus, 'customer-standard');
  assert.match(row.source, /press shop trial/, 'the note becomes the source line');
});

test('a switched-off rule leaves the denominator, not just the numerator', () => {
  // coveragePct means "what could not be MEASURED". Dragging it down for a check
  // the plant deliberately does not run would corrupt that meaning.
  const geo = { dfm: { sheetMetal: { isSheetMetal: true, minBendRadiusToThickness: 1.5 } } };
  const on = runDfmRules(geo, 'sheet-metal');
  const off = runDfmRules(geo, 'sheet-metal', { overrides: { 'sm-bend-radius': { enabled: false } } });
  assert.equal(off.ruleCount, on.ruleCount - 1);
  assert.deepEqual(off.disabledRuleIds, ['sm-bend-radius']);
  assert.ok(!off.findings.some(f => f.id === 'sm-bend-radius'));
  assert.ok(!off.notEvaluated.some(f => f.id === 'sm-bend-radius'), 'a disabled rule is not an unevaluated one');
});

test('material bands cover a real share of the catalogue, not a token few', () => {
  // The claim "not generic" was once true of 7% of the rules. This pins the
  // floor so it cannot quietly regress to a handful again.
  const aware = DFM_RULES.filter(r => r.byMaterial || r.byMaterialFamily);
  assert.ok(aware.length >= 40, `only ${aware.length} of ${DFM_RULES.length} rules vary by material`);
  // And every band must be shaped like the rule it overrides, or it silently
  // makes the rule unevaluatable on every part that selects that material.
  for (const r of aware) {
    for (const [, v] of Object.entries({ ...(r.byMaterial ?? {}), ...(r.byMaterialFamily ?? {}) })) {
      assert.ok(v.source, `${r.id} has a material band with no source of its own`);
      if (r.compare === 'between') {
        assert.ok(Array.isArray(v.threshold) && v.threshold.length === 2
          && v.threshold[0] <= v.threshold[1], `${r.id}: range rule needs [min, max]`);
      } else {
        assert.ok(Number.isFinite(v.threshold), `${r.id}: comparison rule needs a number`);
      }
    }
  }
});

test('no declared gap claims the tool cannot see something it now measures', () => {
  // A stale gap declaration is worse than none. This one said GD&T "lives in
  // the drawing, not in the solid geometry a STEP file carries" for a week
  // after the AP242 reader shipped.
  const tolerance = UNWRITTEN_RULES.find(u => /tolerance/i.test(u.topic));
  assert.ok(tolerance, 'the tolerance gap must still be declared — stack-up is genuinely missing');
  assert.doesNotMatch(tolerance.needs, /not in the solid geometry a STEP file carries/,
    'this claim stopped being true when semantic PMI became readable');
  assert.ok(tolerance.proxy, 'the half that DOES work must be named as the proxy');
});
