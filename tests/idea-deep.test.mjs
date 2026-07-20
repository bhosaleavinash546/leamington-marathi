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
  // panel challenged from all three personas (majority-challenged).
  assert.equal(summary.refineAttempted, 2);
  assert.equal(summary.refined, 2, 'both candidates repaired');
  const repaired = ideas.find(i => i.refined?.fromTitle === 'Idea three');
  assert.ok(repaired, 'contradicted idea replaced in place');
  assert.match(repaired.refined.note, /engine contradiction/);
  assert.ok(!repaired.engineCheck || repaired.engineCheck.direction !== 'contradicted', 'repair may not still be contradicted');
});

test('runDeepPass: no-ops on tiny batches', async () => {
  const summary = await runDeepPass(fakeClient(), [mkIdea('only')], { partName: 'x', smallModel: 's' });
  assert.deepEqual(summary, { critiqued: 0, challenges: 0, eloMatches: 0, refineAttempted: 0, refined: 0 });
});
