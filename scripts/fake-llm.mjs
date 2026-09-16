#!/usr/bin/env node
// A stand-in for api.anthropic.com for integration tests and dry runs.
//
// Speaks just enough of the Messages API — streaming SSE and plain JSON — for
// the real server, browser and export path to be exercised end to end with
// the model stubbed out. Point the server at it with
//   ANTHROPIC_BASE_URL=http://127.0.0.1:19999
// (the SDK reads that variable itself; no product code involved).
//
// It exists because /api/analyze could not be driven without a live key and
// a live balance, which is how a debugging session became an API bill.
// Output is synthetic and says so in every idea id. It proves plumbing, not
// engineering judgement.
import http from 'node:http';

const PORT = Number(process.env.FAKE_LLM_PORT || 19999);
const PACE_MS = Number(process.env.FAKE_LLM_PACE_MS || 25000);   // stream duration, so progress is visible

const ideas = [
  { id: 'stub-1-gate-driver-integration', title: 'Integrate gate-driver PCB onto the power-module substrate', costSavingTypes: ['complexity','process'], implementationDifficulty: 'Medium', systemLevel: 'Subassembly', confidenceLevel: 'estimated',
    technicalDescription: 'SYNTHETIC TEST CONTENT. Move the isolated gate-driver stage from a separate FR4 board onto the module’s AMB substrate as an over-moulded hybrid, deleting the board-to-board connector, the standoff set and one reflow pass. Loop inductance drops with the shorter gate path, which lets the SiC switching edge be tightened without a snubber change.',
    manufacturingImpact: 'Deletes one SMT line pass and the connector insertion station; adds a hybrid over-mould step on the module line.', benchmarkReference: 'SYNTHETIC — no real programme is cited by this stub.', riskNotes: 'Thermal coupling of driver ICs to the switch tile; qualify at 175 °C junction.', timeToImplement: '12-18 months', dfmaPrinciples: ['Part count reduction','Eliminate fasteners','Minimise assembly steps'],
    costSavingPotential: { qualitative: 'Medium', percentage: '6-9%', paybackMonths: 14 },
    savingModel: { terms: [ { label: 'Connector + standoffs deleted', value: 3.2, scope: 'per-part', sign: 'saving' }, { label: 'Second SMT pass deleted', value: 1.9, scope: 'per-part', sign: 'saving' }, { label: 'Over-mould tooling', value: 180000, scope: 'annual', sign: 'cost' } ], excluded: ['Requalification test cost'] },
    engineCheckRequest: { kind: 'assembly', baseline: { parts: 5, fasteners: { screw: 4, boltNut: 0, rivet: 0, snapFit: 0, weldSpot: 0, adhesive: 0 } }, proposed: { parts: 2, fasteners: { screw: 0, boltNut: 0, rivet: 0, snapFit: 0, weldSpot: 0, adhesive: 0 } } },
    engineering: { mechanism: 'Shorter gate loop lowers parasitic inductance.', specDeltas: 'Gate loop inductance 12 nH → 4 nH; connector count 1 → 0.', validationPlan: 'Double-pulse test at 800 V / 400 A; overshoot ≤ 15% of bus.', dfmImplications: 'Over-mould draft ≥ 1° around driver ICs.', costBridge: 'Connector and second reflow pass removed; mould tooling added.' } },
  { id: 'stub-2-common-half-bridge', title: 'Common half-bridge module across front and rear inverters', costSavingTypes: ['commonisation','tooling'], implementationDifficulty: 'Low', systemLevel: 'Assembly', confidenceLevel: 'estimated',
    technicalDescription: 'SYNTHETIC TEST CONTENT. Size one half-bridge module to the rear PMSM duty and use it on both axles, accepting a small current-rating margin on the front induction machine. One substrate, one lead-frame, one over-mould tool.',
    manufacturingImpact: 'Two module part numbers collapse to one; line changeovers disappear.', benchmarkReference: 'SYNTHETIC — no real programme is cited by this stub.', riskNotes: 'Front-axle margin: verify thermal derate at continuous rating.', timeToImplement: '6-9 months', dfmaPrinciples: ['Standardise components','Reduce variants'],
    costSavingPotential: { qualitative: 'Medium', percentage: '4-6%', paybackMonths: 8 },
    savingModel: { terms: [ { label: 'Tooling amortisation on one part', value: 1.4, scope: 'per-part', sign: 'saving' }, { label: 'Changeover labour', value: 0.6, scope: 'per-part', sign: 'saving' } ], excluded: [] },
    engineCheckRequest: { kind: 'commonisation', material: 'copper', process: 'die casting', weightKg: 1.1, variants: 2, baselineVolumePerVariant: 120000 },
    engineering: { mechanism: 'Volume doubling on one tool.', specDeltas: 'Part numbers 2 → 1.', validationPlan: 'Continuous-rating thermal soak on front axle.', dfmImplications: 'None new.', costBridge: 'Tooling and changeover.' } },
  { id: 'stub-3-substrate', title: 'Thick-copper DBC in place of Si3N4 AMB where thermal margin allows', costSavingTypes: ['material'], implementationDifficulty: 'Medium', systemLevel: 'Part', confidenceLevel: 'theoretical',
    technicalDescription: 'SYNTHETIC TEST CONTENT. Where the junction-temperature budget shows headroom, substitute the active-metal-brazed silicon-nitride substrate with a thicker-copper direct-bonded-copper alumina substrate.',
    manufacturingImpact: 'Same attach process; supplier base broadens.', benchmarkReference: 'SYNTHETIC — no real programme is cited by this stub.', riskNotes: 'Power-cycling life is lower on DBC; confirm with mission profile.', timeToImplement: '9-12 months', dfmaPrinciples: ['Material selection'],
    costSavingPotential: { qualitative: 'High', percentage: '10-14%', paybackMonths: 3 },
    savingModel: { terms: [ { label: 'Substrate piece price', value: 6.5, scope: 'per-part', sign: 'saving' } ], excluded: ['Power-cycling requalification'] },
    engineCheckRequest: { kind: 'substitution', baselineMaterial: 'silicon nitride', baselineProcess: 'brazing', proposedMaterial: 'alumina', proposedProcess: 'brazing', referenceWeightKg: 0.08, proposedWeightKg: 0.09 },
    engineering: { mechanism: 'Cheaper ceramic, thicker copper carries the current.', specDeltas: 'Cu 0.3 mm → 0.5 mm.', validationPlan: 'Power cycling to 100k cycles at ΔTj 100 K.', dfmImplications: 'Flatness tolerance tightens.', costBridge: 'Ceramic cost delta.' } },
  { id: 'stub-4-busbar', title: 'Fold the DC-link laminated busbar into the capacitor housing', costSavingTypes: ['complexity'], implementationDifficulty: 'High', systemLevel: 'Subassembly', confidenceLevel: 'estimated',
    technicalDescription: 'SYNTHETIC TEST CONTENT. Insert-mould the DC-link bus plates into the film-capacitor housing so the separate laminated busbar and its fasteners are deleted.',
    manufacturingImpact: 'Deletes busbar assembly and torque station; adds insert-mould complexity.', benchmarkReference: 'SYNTHETIC — no real programme is cited by this stub.', riskNotes: 'Creepage and clearance at 800 V inside the mould.', timeToImplement: '18 months', dfmaPrinciples: ['Part count reduction','Eliminate fasteners'],
    costSavingPotential: { qualitative: 'Medium', percentage: '3-5%', paybackMonths: 20 },
    savingModel: { terms: [ { label: 'Busbar + fasteners', value: 4.1, scope: 'per-part', sign: 'saving' }, { label: 'Insert-mould tool', value: 260000, scope: 'annual', sign: 'cost' } ], excluded: [] },
    engineCheckRequest: { kind: 'assembly', baseline: { parts: 4, fasteners: { screw: 0, boltNut: 6, rivet: 0, snapFit: 0, weldSpot: 0, adhesive: 0 } }, proposed: { parts: 1, fasteners: { screw: 0, boltNut: 0, rivet: 0, snapFit: 0, weldSpot: 0, adhesive: 0 } } },
    engineering: { mechanism: 'Integration.', specDeltas: 'Fasteners 6 → 0.', validationPlan: 'Partial-discharge test at 1.5× bus.', dfmImplications: 'Insert location features in mould.', costBridge: 'Assembly labour and fasteners.' } },
  { id: 'stub-5-cooling', title: 'Direct-cooled baseplate replaces pin-fin plus TIM', costSavingTypes: ['process','material'], implementationDifficulty: 'Medium', systemLevel: 'Part', confidenceLevel: 'estimated',
    technicalDescription: 'SYNTHETIC TEST CONTENT. Cool the module baseplate directly in the coolant jacket, deleting the thermal-interface material and its dispense station.',
    manufacturingImpact: 'TIM dispense and cure deleted; seal groove machining added.', benchmarkReference: 'SYNTHETIC — no real programme is cited by this stub.', riskNotes: 'Coolant seal life; corrosion of baseplate.', timeToImplement: '12 months', dfmaPrinciples: ['Eliminate secondary operations'],
    costSavingPotential: { qualitative: 'Medium', percentage: '2-4%', paybackMonths: 10 },
    savingModel: { terms: [ { label: 'TIM material + dispense', value: 1.8, scope: 'per-part', sign: 'saving' }, { label: 'Seal groove machining', value: 0.7, scope: 'per-part', sign: 'cost' } ], excluded: [] },
    engineCheckRequest: { kind: 'substitution', baselineMaterial: 'aluminium', baselineProcess: 'die casting', proposedMaterial: 'aluminium', proposedProcess: 'die casting', referenceWeightKg: 0.9, proposedWeightKg: 0.8 },
    engineering: { mechanism: 'Lower thermal resistance without TIM.', specDeltas: 'Rth 0.12 → 0.08 K/W.', validationPlan: 'Thermal cycle and pressure test.', dfmImplications: 'Seal groove tolerance.', costBridge: 'TIM out, machining in.' } },
  { id: 'stub-6-die-count', title: 'Re-optimise parallel SiC die count against the true peak-current duty', costSavingTypes: ['material'], implementationDifficulty: 'Low', systemLevel: 'Part', confidenceLevel: 'theoretical',
    technicalDescription: 'SYNTHETIC TEST CONTENT. Use the measured drive-cycle peak-current histogram to drop one parallel die per switch position where the margin is not used.',
    manufacturingImpact: 'Fewer die attach and wire-bond operations per module.', benchmarkReference: 'SYNTHETIC — no real programme is cited by this stub.', riskNotes: 'Short-circuit withstand and derating at cold start.', timeToImplement: '6 months', dfmaPrinciples: ['Right-size specification'],
    costSavingPotential: { qualitative: 'High', percentage: '8-12%', paybackMonths: 2 },
    savingModel: { terms: [ { label: 'One SiC die per switch position', value: 9.0, scope: 'per-part', sign: 'saving' } ], excluded: ['Derate software validation'] },
    engineering: { mechanism: 'Remove unused current margin.', specDeltas: 'Die per switch 4 → 3.', validationPlan: 'Short-circuit and drive-cycle thermal validation.', dfmImplications: 'None.', costBridge: 'Die cost.' } },
];

const write = (res, ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

http.createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) { res.writeHead(404); return res.end(); }
  let body = ''; for await (const c of req) body += c;
  let p = {}; try { p = JSON.parse(body); } catch {}
  const tool = (p.tools || []).find(t => t.name === 'emit_ideas') || (p.tools || [])[0];
  const input = tool?.name === 'emit_ideas' ? { ideas } : {};
  const json = JSON.stringify(input);
  const inTok = Math.round(JSON.stringify(p.messages || '').length / 3.7), outTok = Math.round(json.length / 3.7);
  console.log(`[fake-llm] ${p.model} stream=${!!p.stream} tools=${(p.tools||[]).map(t=>t.name).join(',')||'-'} thinking=${p.thinking?.type||'off'} max_tokens=${p.max_tokens} -> ${tool ? 'tool_use:'+tool.name : 'text'} (${outTok} tok)`);
  const id = 'msg_stub_' + Date.now();
  if (!p.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ id, type: 'message', role: 'assistant', model: p.model, stop_sequence: null,
      content: tool ? [{ type: 'tool_use', id: 'toolu_stub', name: tool.name, input }] : [{ type: 'text', text: 'ok' }],
      stop_reason: tool ? 'tool_use' : 'end_turn', usage: { input_tokens: inTok, output_tokens: outTok } }));
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  write(res, 'message_start', { type: 'message_start', message: { id, type: 'message', role: 'assistant', model: p.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: inTok, output_tokens: 0 } } });
  let idx = 0;
  if (p.thinking) {   // a short, visible reasoning phase so the UI's "Reasoning…" state is exercised
    write(res, 'content_block_start', { type: 'content_block_start', index: idx, content_block: { type: 'thinking', thinking: '', signature: '' } });
    await sleep(Math.min(6000, PACE_MS * 0.25));
    write(res, 'content_block_delta', { type: 'content_block_delta', index: idx, delta: { type: 'thinking_delta', thinking: '' } });
    write(res, 'content_block_delta', { type: 'content_block_delta', index: idx, delta: { type: 'signature_delta', signature: 'stub' } });
    write(res, 'content_block_stop', { type: 'content_block_stop', index: idx }); idx++;
  }
  if (tool) {
    write(res, 'content_block_start', { type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: 'toolu_stub', name: tool.name, input: {} } });
    const chunks = 40, step = Math.ceil(json.length / chunks), pace = Math.max(50, (PACE_MS * 0.75) / chunks);
    for (let i = 0; i < json.length; i += step) { write(res, 'content_block_delta', { type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + step) } }); await sleep(pace); }
  } else {
    write(res, 'content_block_start', { type: 'content_block_start', index: idx, content_block: { type: 'text', text: '' } });
    write(res, 'content_block_delta', { type: 'content_block_delta', index: idx, delta: { type: 'text_delta', text: 'ok' } });
  }
  write(res, 'content_block_stop', { type: 'content_block_stop', index: idx });
  write(res, 'message_delta', { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: outTok } });
  write(res, 'message_stop', { type: 'message_stop' });
  res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`[fake-llm] listening on http://127.0.0.1:${PORT} — synthetic output, pace ${PACE_MS}ms`));
