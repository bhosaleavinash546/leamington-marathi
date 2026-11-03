/**
 * Report standard review (3 Nov 2026, docs/review/report-standard-2026-11/) — the costing CONTENT the five reviewers
 * found wrong: what the rules say and decide, not the report layout.
 *
 *   1. a checkbox rule field printed "on (edited)" whatever the costing applied (vent-pipe leak test, rotary former);
 *   2. a grade the file NAMES (hub flange "… C45 …") is stated on the grade and heat-treatment lines while the
 *      representative grade is costed — and answering it costs the grade's own heat treatment;
 *   3. the route comparison never downgrades an answered safety-critical iron, words the casting refusal by the costed
 *      grade, itemises consumables and marks rows that are not credible; a steel precision forging is MPI-tested, not CT;
 *   4. no "(not used)" / "not the kernel's" alternatives in a rule basis;
 *   5. standards wording: EN 1563 / EN 1561 leave heat treatment to the foundry; ISO 8062-3 stock = RMA + ½ DCTG, assumed;
 *   6. safety-critical and leak-tight asked (advisory) on the routes that did not ask them, a Yes listed as not costed;
 *   7. impregnation asked on a leak-tight iron casting instead of excluded.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ruleFieldReport } from '../src/engine/cost-input-rules/rule-field-report.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { RULE_SPECS } from '../src/engine/cost-input-rules/index.js';
import { FORGING_RULES, forgingNdtFor } from '../src/engine/cost-input-rules/commodities/forging.js';
import { CASTING_RULES } from '../src/engine/cost-input-rules/commodities/casting.js';
import { CAST_AND_MACHINE_RULES } from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { MACHINING_RULES } from '../src/engine/cost-input-rules/commodities/machining.js';
import { EXTRUSION_RULES } from '../src/engine/cost-input-rules/commodities/extrusion.js';
import { serviceNotCosted, IMPREGNATION_DECISION_ID } from '../src/engine/cost-input-rules/derive/service-questions.js';
import { safetyCriticalDecision, pressureTightDecision } from '../src/engine/cost-input-rules/derive/service-context.js';
import { castingProcessRefusal } from '../src/engine/modules/casting-advisor.js';
import { adviseForgingProcess } from '../src/engine/modules/forging-advisor.js';
import { consumablesOf, notCredibleReasons, processVariants } from '../server/services/route-compare.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import type { BulkPartResult } from '../server/services/bulk-run.js';

const BASELINE = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as
  Array<{ part: string; answers: Record<string, string>; geometry: OCCTGeometry }>;
const part = (p: string) => BASELINE.find(x => x.part === p)!;
const ctx = (p: string, commodity: string, answers: Record<string, string>, annualVolume = 200_000): RuleContext => ({
  geo: part(p).geometry, geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume, filename: p, answers,
} as RuleContext);
const run = (spec: typeof FORGING_RULES, c: RuleContext) => runCostInputRules(spec, c);

describe('1. a rule field is printed as the costing applied it', () => {
  it('an unticked checkbox is "No", not "on (edited)", against a false rule', () => {
    // the DOM value of a checkbox is "on" whether ticked or not
    expect(ruleFieldReport({ kind: 'checkbox', value: 'on', checked: false }, false)).toEqual({ shown: 'No', ruleShown: 'No', edited: false });
  });
  it('a ticked checkbox against a false rule is edited — and printed Yes', () => {
    expect(ruleFieldReport({ kind: 'checkbox', value: 'on', checked: true }, false)).toEqual({ shown: 'Yes', ruleShown: 'No', edited: true });
  });
  it('a boolean rule on a yes / no select compares as a boolean (gear case hardened)', () => {
    const options = [{ value: 'yes', text: 'Yes — carburise + quench' }, { value: 'no', text: 'No' }];
    expect(ruleFieldReport({ kind: 'select', value: 'yes', selectedText: 'Yes — carburise + quench', options }, true))
      .toEqual({ shown: 'Yes — carburise + quench', ruleShown: 'Yes — carburise + quench', edited: false });
    expect(ruleFieldReport({ kind: 'select', value: 'yes', selectedText: 'Yes — carburise + quench', options }, false).edited).toBe(true);
  });
  it('numbers still compare at the precision the form shows', () => {
    expect(ruleFieldReport({ kind: 'input', value: '0.004167' }, 0.0041666).edited).toBe(false);
    expect(ruleFieldReport({ kind: 'input', value: '12' }, 15).edited).toBe(true);
  });
});

describe('2. a grade the file names', () => {
  const hub = 'FORGE_Hub_Flange.stp';
  const answers = part(hub).answers;

  it('the hub flange (STEP name "… C45 …") is costed as 38MnVS6 and SAYS the file names C45', () => {
    const r = run(FORGING_RULES, ctx(hub, 'forging', answers));
    expect(r.provenance['forge-mat'].value).toBe('mat-steel-38mnvs6');
    expect(r.provenance['forge-mat'].basis).toMatch(/names C45 .* costed as 38MnVS6 .* until the grade question is answered/);
    // the grade question leans to C45
    const q = r.decisions.find(d => d.id === 'material.grade')!;
    expect(q.options.find(o => o.leaning)?.value).toBe('mat-steel-c45');
  });

  it('the heat-treatment line states the C45 normalise and its £, not costed', () => {
    const r = run(FORGING_RULES, ctx(hub, 'forging', answers));
    const ht = r.provenance['forge-ht-cost'];
    expect(ht.value).toBe(0);
    expect(ht.basis).toMatch(/controlled-cooled/);
    expect(ht.basis).toMatch(/The file names C45 .*normalised — £0\.3\/kg × 2\.842 kg = £0\.8526 a part .*NOT in this cost/);
  });

  it('answered C45, the heat treatment follows the grade (normalise) and the note goes', () => {
    const r = run(FORGING_RULES, ctx(hub, 'forging', { ...answers, 'material.grade': 'mat-steel-c45' }));
    expect(r.provenance['forge-mat'].value).toBe('mat-steel-c45');
    expect(r.provenance['forge-ht-cost'].value).toBe(0.3);
    expect(r.provenance['forge-ht-cost'].basis).toMatch(/^normalise for a carbon-steel forging/);
    expect(r.provenance['forge-mat'].basis).not.toMatch(/names C45/);
  });

  it('no note when nothing is named (the knuckle)', () => {
    const k = 'steering_knuckle_RH.stp';
    const r = run(FORGING_RULES, ctx(k, 'forging', part(k).answers));
    expect(r.provenance['forge-mat'].basis).not.toMatch(/names/);
    expect(r.provenance['forge-ht-cost'].basis).not.toMatch(/file names/);
  });
});

describe('3. route comparison', () => {
  it('machining a cast-iron part answered safety-critical buys DUCTILE iron, never grey', () => {
    const p = 'PRCR002.stp';
    const r = run(MACHINING_RULES, ctx(p, 'machining', { 'material.family': 'cast iron', 'service.safetyCritical': 'yes' }));
    expect(r.provenance['mach-mat'].value).toBe('mat-gjs500');
    const g = run(MACHINING_RULES, ctx(p, 'machining', { 'material.family': 'cast iron', 'service.safetyCritical': 'no' }));
    expect(g.provenance['mach-mat'].value).toBe('mat-gjl250');
  });

  it('the casting process refusal on a safety-critical iron part names ductile iron, and says "in this rate book"', () => {
    const p = 'PRCR002.stp';
    const v = processVariants('cast_and_machine', { geo: part(p).geometry, filename: p, current: 'cast_and_machine',
      answers: part(p).answers, annualVolume: 200_000, baseBook: DEFAULT_RATE_LIBRARY });
    const gravity = v.find(x => x.process === 'gravity')!;
    expect(gravity.refusal).toMatch(/^ductile iron castings are sand-moulded or investment cast in this rate book/);
    expect(gravity.refusal).not.toMatch(/grey/);
    expect(castingProcessRefusal('gravity', 'grey-iron', 10)).not.toMatch(/is not die cast/);
  });

  it('a row in brittle iron on a safety-critical part, or machined at 9 % utilisation, is not credible — with its reason', () => {
    const grey = { route: 'machining', material: { materialId: 'mat-gjl250', label: 'EN-GJL-250', netKg: 7.566, boughtKg: 84.351, utilisation: 0.09 } };
    const why = notCredibleReasons(grey, { 'service.safetyCritical': 'yes' });
    expect(why).toHaveLength(2);
    expect(why[0]).toMatch(/brittle iron .* safety-critical/);
    expect(why[1]).toMatch(/9\.0% utilisation .*CostVision engineering heuristic, not sourced/);
    // a well-used billet in ductile iron is credible
    expect(notCredibleReasons({ route: 'machining', material: { ...grey.material, materialId: 'mat-gjs500', utilisation: 0.5 } }, { 'service.safetyCritical': 'yes' })).toEqual([]);
  });

  it('consumables are itemised, and a remainder the module did not itemise is its own line', () => {
    const r = { trace: { stackInput: { rawMaterial: { consumablesCostPerPart: 2.5752, consumablesItems: [
      { label: 'descale', gbp: 0.3986 }, { label: 'NDT', gbp: 0.6809 }] } } } } as unknown as BulkPartResult;
    const lines = consumablesOf(r);
    expect(lines.map(l => l.label)).toEqual(['descale', 'NDT', 'other consumables (not itemised by the route\'s module)']);
    expect(lines.reduce((s, l) => s + l.gbp, 0)).toBeCloseTo(2.5752, 4);
  });

  it('a safety-critical PRECISION steel forging is MPI-tested like a closed-die one (it carried £32 of CT a part)', () => {
    expect(forgingNdtFor('precision', 'microalloyed-steel')).toBe('mpi');
    expect(forgingNdtFor('precision', 'alloy-steel')).toBe('mpi');
    expect(forgingNdtFor('precision', 'titanium')).toBe('ct');
    const k = 'steering_knuckle_RH.stp';
    const r = run(FORGING_RULES, ctx(k, 'forging', { ...part(k).answers, 'forging.processChoice': 'precision' }));
    expect(r.provenance['forge-ndt'].value).toBeLessThan(1);
    expect(r.provenance['forge-ndt'].basis).toMatch(/magnetic-particle/);
    const rec = adviseForgingProcess({ processOverride: 'precision', annualVolume: 200_000, partWeightKg: 3, complexity: 'medium',
      alloyFamily: 'microalloyed-steel', toleranceClass: 'standard', isRingShape: false, safetyCritical: true });
    expect(rec.processRoute.join(' ')).not.toMatch(/Solution \+ age|CT/);
    expect(rec.processRoute).toContain('MPI NDT');
  });
});

describe('4. no rejected alternative estimates in a rule basis', () => {
  it('no basis on any real part says "(not used)", "is not used" or "not the kernel\'s"', () => {
    const bad: string[] = [];
    for (const p of BASELINE) {
      const route = p.answers['commodity.route'] ?? (p.part.startsWith('test-gear') ? 'gear' : null);
      const spec = route ? RULE_SPECS[route] : null;
      if (!spec) continue;
      const r = run(spec, ctx(p.part, route!, p.answers, 50_000));
      for (const d of Object.values(r.byRule)) {
        if (/\(not used\)|is not used|not the kernel's/.test(d.basis)) bad.push(`${p.part} ${d.ruleId}: ${d.basis.slice(0, 120)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('5. standards wording', () => {
  it('ductile iron: EN 1563 leaves heat treatment to the foundry — never "specified as-cast", never EN 1561', () => {
    const p = 'PRCR002.stp';
    const r = run(CAST_AND_MACHINE_RULES, ctx(p, 'cast_and_machine', part(p).answers));
    const ht = r.provenance['cam-ht-cost'];
    expect(ht.value).toBe(0);
    expect(ht.basis).toMatch(/EN-GJS-500-7 .*normally met as-cast — EN 1563 sets the mechanical properties and leaves heat treatment to the foundry/);
    expect(ht.basis).not.toMatch(/specified as-cast|EN 1561/);
  });

  it('a -LT ductile grade says its ferritising anneal is not costed', () => {
    const p = 'PRCR002.stp';
    const r = run(CAST_AND_MACHINE_RULES, ctx(p, 'cast_and_machine', { ...part(p).answers, 'material.grade': 'mat-gjs350-lt' }));
    expect(r.provenance['cam-ht-cost'].basis).toMatch(/ferritising anneal — NOT COSTED/);
  });

  it('ISO 8062-3: the stock is RMA + half the DCTG, and the figure is an assumption', () => {
    const p = 'PRCR002.stp';
    const r = run(CAST_AND_MACHINE_RULES, ctx(p, 'cast_and_machine', part(p).answers));
    const b = r.provenance['cam-cast-wt'].basis;
    expect(b).toMatch(/assumed .*ISO 8062-3 .*RMA for the drawing's RMA grade plus half its DCTG casting tolerance/);
    expect(b).not.toMatch(/RMA typical/);
  });
});

describe('6. safety-critical and leak-tight asked where they were missing', () => {
  const cases: Array<[string, string, string]> = [
    ['MACH_Hydraulic_Manifold.stp', 'machining', 'service.pressureTight'],
    ['MACH_Hydraulic_Manifold.stp', 'machining', 'service.safetyCritical'],
    ['ROTO_Header_Tank.stp', 'rotational_moulding', 'service.pressureTight'],
    ['Seat_Locking_Bracket.stp', 'sheet_metal', 'service.safetyCritical'],
    ['AL_Battery_Rail.stp', 'aluminium_extrusion', 'service.safetyCritical'],
    ['test-gear-m3-z38.step', 'gear', 'service.safetyCritical'],
    ['EXT_Vent_Pipe.stp', 'extrusion', 'service.pressureTight'],
  ];
  for (const [p, route, id] of cases) {
    it(`${p} on ${route} asks ${id} — advisory, so it still costs`, () => {
      const r = run(RULE_SPECS[route], ctx(p, route, part(p).answers, 50_000));
      const q = r.decisions.find(d => d.id === id);
      expect(q?.severity).toBe('advisory');
      expect(r.status).toBe('complete');
    });
  }

  it('the names lean: a manifold and a header tank lean leak-tight, a hub, a wheel, a brake and a seat lean safety-critical', () => {
    const c = (filename: string, commodity = 'machining') => ({ filename, geo: {}, commodity, answers: {} } as unknown as RuleContext);
    const lean = (d: ReturnType<typeof safetyCriticalDecision>) => d.options.find(o => o.leaning)?.value;
    expect(lean(pressureTightDecision(c('MACH_Hydraulic_Manifold.stp')))).toBe('yes');
    expect(lean(pressureTightDecision(c('ROTO_Header_Tank.stp', 'rotational_moulding')))).toBe('yes');
    for (const n of ['FORGE_Hub_Flange.stp', 'wheel-carrier.step', 'Brake_Bracket.stp', 'Seat_Locking_Bracket.stp']) {
      expect(lean(safetyCriticalDecision(c(n))), n).toBe('yes');
    }
    // a letter before the word is not the word
    expect(lean(safetyCriticalDecision(c('freewheel_cover.stp')))).toBeUndefined();
  });

  it('a Yes the route does not cost is NOT COSTED on the basis and listed by serviceNotCosted', () => {
    const p = 'MACH_Hydraulic_Manifold.stp';
    const answers = { ...part(p).answers, 'service.safetyCritical': 'yes', 'service.pressureTight': 'yes' };
    const r = run(MACHINING_RULES, ctx(p, 'machining', answers, 50_000));
    expect(r.byRule['machining.q.safetyCritical'].basis).toMatch(/NOT COSTED/);
    expect(r.byRule['machining.q.pressureTight'].basis).toMatch(/NOT COSTED: leak \/ pressure test/);
    const nc = serviceNotCosted('machining', answers);
    expect(nc.map(x => x.decisionId)).toEqual(['service.safetyCritical', 'service.pressureTight']);
    expect(serviceNotCosted('machining', { 'service.safetyCritical': 'no', 'service.pressureTight': 'no' })).toEqual([]);
    // the casting and forging routes price their safety answer: nothing listed
    expect(serviceNotCosted('forging', { 'service.safetyCritical': 'yes' })).toEqual([]);
  });

  it('the extrusion pressure test is costed when the part is answered leak-tight, and only then', () => {
    const p = 'EXT_Vent_Pipe.stp';
    const no = run(EXTRUSION_RULES, ctx(p, 'extrusion', part(p).answers, 50_000));
    expect(no.provenance['ext-leak'].value).toBe(false);
    const yes = run(EXTRUSION_RULES, ctx(p, 'extrusion', { ...part(p).answers, 'service.pressureTight': 'yes' }, 50_000));
    expect(yes.provenance['ext-leak'].value).toBe(true);
    expect(yes.byRule['extrusion.q.pressureTight'].basis).toMatch(/costed/);
  });
});

describe('7. impregnation on a leak-tight iron casting is asked, not excluded', () => {
  const p = 'PRCR002.stp';
  const leak = { ...part(p).answers, 'service.pressureTight': 'yes' };

  it('unanswered: £0, NOT COSTED on the basis, an advisory question, and listed as not included', () => {
    const r = run(CASTING_RULES, ctx(p, 'casting', leak));
    expect(r.provenance['cast-impreg'].value).toBe(0);
    expect(r.provenance['cast-impreg'].basis).toMatch(/ductile iron casting — impregnation NOT COSTED/);
    expect(r.provenance['cast-impreg'].basis).not.toMatch(/or ferrous/);
    expect(r.decisions.find(d => d.id === IMPREGNATION_DECISION_ID)?.severity).toBe('advisory');
    expect(serviceNotCosted('casting', leak, { heavyAlloyCasting: true }).map(x => x.decisionId)).toEqual([IMPREGNATION_DECISION_ID]);
  });

  it('answered yes: priced at the casting route\'s impregnation rate', () => {
    const r = run(CASTING_RULES, ctx(p, 'casting', { ...leak, [IMPREGNATION_DECISION_ID]: 'yes' }));
    expect(r.provenance['cast-impreg'].value).toBe(0.9);
    expect(r.decisions.find(d => d.id === IMPREGNATION_DECISION_ID)).toBeUndefined();
  });

  it('not leak-tight: no impregnation and no question (the recorded stub axle does not move)', () => {
    const r = run(CASTING_RULES, ctx(p, 'casting', part(p).answers));
    expect(r.provenance['cast-impreg'].value).toBe(0);
    expect(r.provenance['cast-impreg'].basis).toBe('not pressure-tight — no impregnation');
    expect(r.decisions.find(d => d.id === IMPREGNATION_DECISION_ID)).toBeUndefined();
  });
});
