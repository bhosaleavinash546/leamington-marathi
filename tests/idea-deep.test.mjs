// Deep mode: pure tournament mechanics + the full pass with a fake LLM client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eloUpdate, swissPairs, pairKey, eloFactor, selectForRefine, runDeepPass, mulberry32 } from '../idea-deep.mjs';

test('eloUpdate: zero-sum, winner gains, upset gains more', () => {
  const [a1, b1] = eloUpdate(1000, 1000, true);
  assert.ok(a1 > 1000 && b1 < 1000);
  assert.ok(Math.abs((a1 - 1000) + (b1 - 1000)) < 1e-9, 'zero-sum');
  const [under] = eloUpdate(900, 1100, true);    // underdog win
  const [fav] = eloUpdate(1100, 900, true);      // favourite win
  assert.ok((under - 900) > (fav - 1100), 'upset moves ratings more');
});

test('swissPairs: no self-pairs, no duplicates within a round, avoids rematches', () => {
  const idx = [0, 1, 2, 3, 4, 5];
  const ratings = { 0: 1050, 1: 1040, 2: 1030, 3: 1020, 4: 1010, 5: 1000 };
  const r1 = swissPairs(idx, ratings, new Set());
  assert.equal(r1.length, 3);
  const seen = new Set();
  for (const [a, b] of r1) {
    assert.notEqual(a, b);
    assert.ok(!seen.has(a) && !seen.has(b));
    seen.add(a); seen.add(b);
  }
  assert.deepEqual(r1[0], [0, 1], 'round pairs adjacent by rating');
  const played = new Set(r1.map(([a, b]) => pairKey(a, b)));
  const r2 = swissPairs(idx, ratings, played);
  for (const [a, b] of r2) assert.ok(!played.has(pairKey(a, b)), `rematch ${a}v${b}`);
  // odd count: lowest-rated sits out
  const r3 = swissPairs([0, 1, 2], { 0: 1100, 1: 1050, 2: 1000 }, new Set());
  assert.equal(r3.length, 1);
});

test('eloFactor: bounded ×0.85–1.15 around base 1000', () => {
  assert.equal(eloFactor(1000), 1);
  assert.equal(eloFactor(5000), 1.15);
  assert.equal(eloFactor(0), 0.85);
  assert.ok(eloFactor(1064) > 1 && eloFactor(1064) < 1.15);
});

test('selectForRefine: engine contradiction or ≥2 challenges, contradiction prioritised, capped', () => {
  const mk = (over) => ({ title: 't', critiques: [], ...over });
  const ideas = [
    mk({ engineCheck: { direction: 'confirmed' } }),                                           // 0 fine
    mk({ engineCheck: { direction: 'contradicted' } }),                                        // 1 contradicted
    mk({ critiques: [{ verdict: 'challenge' }, { verdict: 'challenge' }] }),                   // 2 majority-challenged
    mk({ critiques: [{ verdict: 'challenge' }] }),                                             // 3 single challenge — not enough
    mk({ engineCheck: { direction: 'contradicted' }, critiques: [{ verdict: 'challenge' }, { verdict: 'challenge' }, { verdict: 'challenge' }] }), // 4 worst
  ];
  const sel = selectForRefine(ideas);
  assert.deepEqual(sel[0], 4, 'contradicted + most challenged first');
  assert.ok(sel.includes(1) && sel.includes(2));
  assert.ok(!sel.includes(0) && !sel.includes(3));
  assert.ok(selectForRefine(ideas, { max: 1 }).length === 1);
});

test('mulberry32 is deterministic', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

// ── Full pass with a fake client ─────────────────────────────────────────────
// The fake answers by tool name: critiques challenge idea 2 from every persona,
// verdicts always pick A, and the refine call returns a repaired idea whose
// engineCheckRequest the real engine CONFIRMS (steel → aluminium at lower mass).
function fakeClient() {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        const toolName = params.tools[0].name;
        calls.push(toolName);
        const input = {
          emit_critiques: { critiques: [{ index: 2, verdict: 'challenge', critique: 'Not feasible on current lines.' }, { index: 1, verdict: 'strengthen', critique: 'Solid.' }] },
          emit_verdict: { winner: 'A' },
          emit_refined: {
            // A repair the REAL engine confirms (machined billet → HPDC is
            // genuinely cheaper) — the pass re-verifies every repair and must
            // reject one that is still contradicted.
            idea: {
              title: 'Repaired idea', technicalDescription: 'Convert the machined billet aluminium bracket to a near-net high-pressure die casting with machining only on the two datum faces, deleting most cycle time and swarf loss for a leaner one-piece design.',
              costSavingTypes: ['process'], implementationDifficulty: 'Medium', systemLevel: 'Part',
              costSavingPotential: { qualitative: 'High', percentage: '15%', annualValue: '£200K', calculationBasis: 'cycle delta', paybackMonths: 12 },
              engineCheckRequest: { baselineMaterial: 'Aluminium', baselineProcess: 'CNC machining', proposedMaterial: 'Aluminium', proposedProcess: 'High pressure die casting', referenceWeightKg: 1.2, proposedWeightKg: 1.0 },
            },
          },
        }[toolName];
        return { content: [{ type: 'tool_use', name: toolName, input }] };
      },
    },
  };
}

const mkIdea = (title, over = {}) => ({
  title, technicalDescription: `${title} description with sufficient words to look like a real technical description of the idea in question.`,
  qualityScore: 80, costSavingPotential: { qualitative: 'Medium' }, riskNotes: 'some risk', ...over,
});

test('runDeepPass: critiques stamped, elo bounded, contradicted idea repaired & re-verified', async () => {
  const ideas = [
    mkIdea('Idea one'),
    mkIdea('Idea two'),
    // engine-contradicted → refine candidate; repair must survive validation + engine re-check
    mkIdea('Idea three', { engineCheck: { direction: 'contradicted', referenceCase: 'x', baselineEur: 10, proposedEur: 12, savingPct: -20, basis: 'b' } }),
    mkIdea('Idea four'),
  ];
  const client = fakeClient();
  const summary = await runDeepPass(client, ideas, {
    partName: 'bracket', manufacturingContext: 'kb', commercialContext: 'precedents',
    region: 'Germany', annualVolume: 80000, library: undefined, smallModel: 'small', searchExecuted: false,
  }, { seed: 7 });

  assert.ok(summary.critiqued >= 1, 'panel stamped critiques');
  assert.ok(summary.eloMatches >= 3, `2 swiss rounds over 4 ideas ≥3 matches (got ${summary.eloMatches})`);
  for (const i of ideas) {
    if (typeof i.eloFactor === 'number') assert.ok(i.eloFactor >= 0.85 && i.eloFactor <= 1.15);
  }
  // Two refine candidates: the engine-contradicted idea AND the idea the fake
  // panel challenged from every persona (majority-challenged). The fake
  // returns the SAME repaired text for both, so the second repair restates
  // the first and must be rejected — a repair has to stay a distinct idea.
  assert.equal(summary.refineAttempted, 2);
  assert.equal(summary.refined, 1, 'one candidate repaired, the duplicate repair rejected');
  assert.equal(summary.repairRejected.length, 1);
  assert.match(summary.repairRejected[0].reason, /restates/);
  // The majority-challenged idea outranks the contradicted one in the refine
  // queue (4 challenges vs priority 2), so IT is the one repaired in place.
  const repaired = ideas.find(i => i.refined);
  assert.ok(repaired, 'a candidate was replaced in place');
  assert.match(repaired.refined.note, /engine contradiction|panel challenges/);
  assert.ok(!repaired.engineCheck || repaired.engineCheck.direction !== 'contradicted', 'repair may not still be contradicted');
});

test('runDeepPass critique level: four-persona panel + small-model repair, NO tournament, no Elo stamps', async () => {
  const ideas = [
    mkIdea('Idea one'),
    mkIdea('Idea two'),
    mkIdea('Idea three', { engineCheck: { direction: 'contradicted', referenceCase: 'x', baselineEur: 10, proposedEur: 12, savingPct: -20, basis: 'b' } }),
    mkIdea('Idea four'),
  ];
  const client = fakeClient();
  const summary = await runDeepPass(client, ideas, {
    partName: 'bracket', manufacturingContext: 'kb', commercialContext: 'precedents',
    region: 'Germany', annualVolume: 80000, library: undefined, smallModel: 'small', searchExecuted: false,
  }, { seed: 7, level: 'critique' });
  assert.equal(summary.level, 'critique');
  assert.equal(summary.eloMatches, 0, 'no tournament at the critique level');
  assert.ok(!client.calls.includes('emit_verdict'), 'no judge calls were paid for');
  assert.equal(client.calls.filter(c => c === 'emit_critiques').length, 4, 'four personas, including the test engineer');
  for (const i of ideas) assert.equal(i.eloFactor, undefined, 'no Elo stamp without a tournament');
  assert.ok(summary.critiqued >= 1);
  assert.ok(summary.refined >= 1, 'a candidate was still repaired');
  assert.ok(ideas.some(i => i.refined));
  // The fourth persona's critiques are stamped with its own id.
  assert.ok(ideas.some(i => (i.critiques || []).some(c => c.persona === 'test')), 'test-engineer critiques stamped');
});

test('runDeepPass accepts a repaired idea returned as a JSON STRING (live small-model behaviour)', async () => {
  // Sept 2026 live after-run: 9 repairs attempted, 0 landed — the model put
  // the idea in the tool call as a JSON-encoded string and the validator
  // dropped it. The bare `{type:'object'}` schema also produced `{}`.
  const base = fakeClient();
  const client = {
    calls: base.calls,
    messages: { create: async (params) => {
      const r = await base.messages.create(params);
      if (params.tools[0].name === 'emit_refined') {
        const input = r.content[0].input;
        return { content: [{ type: 'tool_use', name: 'emit_refined', input: { idea: JSON.stringify(input.idea) } }] };
      }
      return r;
    } },
  };
  const ideas = [
    mkIdea('Idea one'), mkIdea('Idea two'),
    mkIdea('Idea three', { engineCheck: { direction: 'contradicted', referenceCase: 'x', baselineEur: 10, proposedEur: 12, savingPct: -20, basis: 'b' } }),
    mkIdea('Idea four'),
  ];
  const summary = await runDeepPass(client, ideas, { partName: 'bracket', region: 'Germany', annualVolume: 80000, smallModel: 'small', searchExecuted: false }, { seed: 7, level: 'critique' });
  assert.ok(summary.refined >= 1, `string-encoded repair must land (refined=${summary.refined})`);
  assert.ok(ideas.some(i => i.refined));
});

test('REFINE_SCHEMA spells out the idea shape so a forced tool call cannot come back empty', async () => {
  const { REFINE_SCHEMA } = await import('../idea-deep.mjs');
  const props = REFINE_SCHEMA.properties.idea.properties;
  for (const k of ['title', 'technicalDescription', 'costSavingPotential', 'engineering', 'engineCheckRequest']) assert.ok(props[k], `schema names ${k}`);
  assert.ok(REFINE_SCHEMA.properties.idea.required.includes('engineering'));
});

test('a repair of an engine-contradicted idea must itself be engine-checkable, or the original stands', async () => {
  // Live (Sept 2026): every repair came back with no resolvable engine
  // request, so "not contradicted" meant "not looked at". That is dodging
  // the verdict, and it is rejected with the reason.
  const base = fakeClient();
  const client = {
    calls: base.calls,
    messages: { create: async (params) => {
      const r = await base.messages.create(params);
      if (params.tools[0].name === 'emit_refined') {
        const idea = { ...r.content[0].input.idea, title: 'Entirely different repaired lever with no request', technicalDescription: 'A different mechanism altogether: roll-form the bracket profile from coil and delete the progressive die, holding section modulus with a hem.' };
        delete idea.engineCheckRequest;
        return { content: [{ type: 'tool_use', name: 'emit_refined', input: { idea } }] };
      }
      return r;
    } },
  };
  const ideas = [
    mkIdea('Idea one'), mkIdea('Idea two'),
    mkIdea('Idea three', { engineCheck: { direction: 'contradicted', referenceCase: 'x', baselineEur: 10, proposedEur: 12, savingPct: -20, basis: 'b' } }),
    mkIdea('Idea four'),
  ];
  const summary = await runDeepPass(client, ideas, { partName: 'bracket', region: 'Germany', annualVolume: 80000, smallModel: 'small', searchExecuted: false }, { seed: 7, level: 'critique' });
  const three = ideas.find(i => i.title === 'Idea three');
  assert.ok(three && !three.refined, 'the contradicted original stands');
  const rej = summary.repairRejected.find(r => r.title === 'Idea three');
  assert.ok(rej, 'rejection recorded');
  assert.match(rej.reason, /not engine-checkable/);
});

test('runDeepPass: no-ops on tiny batches', async () => {
  const summary = await runDeepPass(fakeClient(), [mkIdea('only')], { partName: 'x', smallModel: 's' });
  assert.deepEqual(summary, { critiqued: 0, challenges: 0, eloMatches: 0, refineAttempted: 0, refined: 0, repairRejected: [], level: 'full' });
});
