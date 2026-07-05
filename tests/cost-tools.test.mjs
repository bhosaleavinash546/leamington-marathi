import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCostTools, runToolLoop } from '../cost-tools.mjs';
import { getActiveLibrary } from '../active-library.mjs';

const library = getActiveLibrary();

test('list_catalogue returns the engine search space', async () => {
  const kit = buildCostTools({ library });
  const cat = await kit.exec('list_catalogue', {});
  assert.ok(cat.materials.includes('Aluminium A356 (cast)'));
  assert.ok(cat.processes.includes('Die Casting (Aluminium)'));
  assert.ok(cat.regions.includes('Germany'));
});

test('compute_should_cost resolves free text and logs the result', async () => {
  const kit = buildCostTools({ library });
  const r = await kit.exec('compute_should_cost', { material: 'A356', process: 'HPDC', weightKg: 1.2, annualVolume: 150000, region: 'Germany' });
  assert.ok(r.totalShouldCost > 0);
  assert.equal(r.material, 'Aluminium A356 (cast)');
  assert.equal(r.process, 'Die Casting (Aluminium)');
  assert.equal(kit.log.length, 1);
  assert.equal(kit.log[0].total, r.totalShouldCost);
});

test('incompatible material/process returns a tool error (not a throw)', async () => {
  const kit = buildCostTools({ library });
  const r = await kit.exec('compute_should_cost', { material: 'Cast Iron (Grey)', process: 'Injection Moulding', weightKg: 2, annualVolume: 80000, region: 'Germany' });
  assert.ok(r.error && /not compatible/i.test(r.error), `expected family error, got ${JSON.stringify(r)}`);
  assert.equal(kit.log.length, 0);   // failed compute is not logged as a real cost
});

test('unknown material returns a helpful error', async () => {
  const kit = buildCostTools({ library });
  const r = await kit.exec('compute_should_cost', { material: 'unobtanium', process: 'HPDC', weightKg: 1, annualVolume: 1000, region: 'Germany' });
  assert.ok(r.error && /catalogue/i.test(r.error));
});

test('out-of-range inputs are rejected by the tool', async () => {
  const kit = buildCostTools({ library });
  const r = await kit.exec('compute_should_cost', { material: 'A356', process: 'HPDC', weightKg: 1e9, annualVolume: 1000, region: 'Germany' });
  assert.ok(r.error && /weightKg/.test(r.error));
});

test('pinInputs forces weight/volume so alternatives stay comparable', async () => {
  const kit = buildCostTools({ library, pinInputs: { weightKg: 1.2, annualVolume: 150000 } });
  // model tries to cheat with a 10x volume and half the weight — both ignored
  const r = await kit.exec('compute_should_cost', { material: 'A356', process: 'HPDC', weightKg: 0.6, annualVolume: 1500000, region: 'Germany' });
  assert.equal(r.weightKg, 1.2, 'weight must be pinned to baseline');
  assert.equal(r.annualVolume, 150000, 'volume must be pinned to baseline');
  assert.equal(kit.log[0].weightKg, 1.2);
  assert.equal(kit.log[0].annualVolume, 150000);
});

test('runToolLoop drives a tool call then returns the final text', async () => {
  const kit = buildCostTools({ library });
  // Stub client: first turn asks to call the tool, second turn returns text.
  let turn = 0;
  const client = {
    messages: {
      create: async ({ messages }) => {
        turn++;
        if (turn === 1) {
          return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'compute_should_cost', input: { material: 'A356', process: 'HPDC', weightKg: 1.2, annualVolume: 150000, region: 'Germany' } }] };
        }
        // second turn should have received the tool_result
        const last = messages[messages.length - 1];
        assert.equal(last.role, 'user');
        assert.equal(last.content[0].type, 'tool_result');
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'The part should cost about that figure.' }] };
      },
    },
  };
  const out = await runToolLoop(client, { system: 'x', messages: [{ role: 'user', content: 'cost it' }], tools: kit.tools, exec: kit.exec, maxTurns: 5 });
  assert.equal(out.turns, 2);
  assert.match(out.finalText, /should cost/);
  assert.equal(kit.log.length, 1);
});

test('runToolLoop stops on the turn budget without throwing', async () => {
  const kit = buildCostTools({ library });
  const client = {
    messages: { create: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'list_catalogue', input: {} }] }) },
  };
  const out = await runToolLoop(client, { system: 'x', messages: [{ role: 'user', content: 'go' }], tools: kit.tools, exec: kit.exec, maxTurns: 3 });
  assert.equal(out.stoppedOnBudget, true);
  assert.equal(out.turns, 3);
});
