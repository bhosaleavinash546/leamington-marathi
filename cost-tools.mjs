/**
 * Engine-as-tools
 * ------------------------------------------------------------------
 * Exposes the deterministic should-cost engine to the LLM as tool-use functions.
 * The model never invents a cost — it REQUESTS one, the engine computes it, and
 * the number is fed back. Free-text material/process are fuzzy-resolved, and the
 * family-compatibility guard turns nonsense proposals ("cast iron via injection
 * moulding") into a tool error the model reads and self-corrects from.
 *
 *   const kit = buildCostTools({ library, calibration });
 *   ... client.messages.create({ tools: kit.tools, ... })
 *   const result = await kit.exec(name, input);   // returns a JSON-able object
 *   kit.log  // every successful compute_should_cost call, for deterministic roll-up
 */
import { computeShouldCost, simulateShouldCost } from './costing-engine.mjs';
import { resolveMaterial, resolveProcess } from './material-process-resolve.mjs';

const REGION_KEYS = (lib) => Object.keys(lib.REGIONS);

export function buildCostTools({ library, calibration = null }) {
  const log = [];   // [{ material, process, weightKg, annualVolume, region, total }]

  const tools = [
    {
      name: 'list_catalogue',
      description: 'List the materials, processes and regions the cost engine supports. Call this first to see the valid search space before proposing alternatives.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'compute_should_cost',
      description: 'Compute the deterministic bottom-up should-cost (EUR/unit) for a part. Material and process may be free text (fuzzy-matched to the catalogue). Returns the total, a percentage breakdown, and the resolved catalogue keys, or an error if the material/process pair is physically incompatible.',
      input_schema: {
        type: 'object',
        properties: {
          material: { type: 'string', description: 'e.g. "Aluminium A356 (cast)", "DP780 steel", "PA66-GF30"' },
          process: { type: 'string', description: 'e.g. "HPDC", "Sand casting", "CNC machining", "Cold forging"' },
          weightKg: { type: 'number', description: 'finished part mass in kg' },
          annualVolume: { type: 'number', description: 'annual production volume (units/yr)' },
          region: { type: 'string', description: 'plant region, e.g. Germany, China, Mexico, Czech Republic' },
        },
        required: ['material', 'process', 'weightKg', 'annualVolume', 'region'],
      },
    },
    {
      name: 'simulate_should_cost',
      description: 'Return the Monte-Carlo P10/P50/P90 cost band (EUR/unit) for a part — the modelled uncertainty range. Same inputs as compute_should_cost.',
      input_schema: {
        type: 'object',
        properties: {
          material: { type: 'string' }, process: { type: 'string' },
          weightKg: { type: 'number' }, annualVolume: { type: 'number' }, region: { type: 'string' },
        },
        required: ['material', 'process', 'weightKg', 'annualVolume', 'region'],
      },
    },
  ];

  // Resolve + validate the common input shape used by the two cost tools.
  function resolve(input) {
    const matRes = resolveMaterial(String(input.material || ''), library.MATERIALS);
    const procRes = resolveProcess(String(input.process || ''), library.PROCESSES);
    if (!matRes) return { error: `Material "${input.material}" is not in the cost catalogue. Call list_catalogue for valid options.` };
    if (!procRes) return { error: `Process "${input.process}" is not in the cost catalogue. Call list_catalogue for valid options.` };
    const weightKg = Number(input.weightKg), annualVolume = Number(input.annualVolume);
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 100_000) return { error: 'weightKg must be a number between 0 and 100000.' };
    if (!Number.isFinite(annualVolume) || annualVolume <= 0 || annualVolume > 1e9) return { error: 'annualVolume must be a number between 0 and 1e9.' };
    const region = REGION_KEYS(library).includes(input.region) ? input.region : 'Germany';
    return { input: { material: matRes.key, process: procRes.key, weightKg, annualVolume, region }, matRes, procRes };
  }

  async function exec(name, input) {
    if (name === 'list_catalogue') {
      return {
        materials: Object.keys(library.MATERIALS),
        processes: Object.keys(library.PROCESSES),
        regions: REGION_KEYS(library),
      };
    }
    if (name === 'compute_should_cost' || name === 'simulate_should_cost') {
      const r = resolve(input);
      if (r.error) return { error: r.error };
      try {
        if (name === 'simulate_should_cost') {
          const s = simulateShouldCost(r.input, 2000, 12345, calibration, library);
          return { p10: s.p10, p50: s.p50, p90: s.p90, currency: 'EUR', material: r.input.material, process: r.input.process, region: r.input.region };
        }
        const calc = computeShouldCost(r.input, {}, calibration, library);
        log.push({ ...r.input, total: calc.totalShouldCost, approx: r.matRes.approx || r.procRes.approx });
        const b = calc.breakdown;
        return {
          totalShouldCost: calc.totalShouldCost, currency: 'EUR',
          material: r.input.material, process: r.input.process, region: r.input.region, weightKg: r.input.weightKg, annualVolume: r.input.annualVolume,
          breakdownPct: {
            material: b.material.pct, conversion: Number((b.machine.pct + b.labour.pct + b.setup.pct + b.finishing.pct).toFixed(1)),
            tooling: b.tooling.pct, overheadPlus: Number((b.overhead.pct + b.commercial.pct + b.sgaProfit.pct).toFixed(1)),
          },
          calibrationApplied: calc.calibration.applied,
        };
      } catch (e) {
        // Family-incompatibility etc. — return as a tool result so the model corrects.
        return { error: e.message || 'Costing failed for these inputs.' };
      }
    }
    return { error: `Unknown tool: ${name}` };
  }

  return { tools, exec, log };
}

/**
 * Run a bounded tool-use loop. Calls the model, executes any tool_use blocks via
 * kit.exec, feeds results back, and repeats until the model stops calling tools
 * or maxTurns is reached. Returns { finalText, turns, stoppedOnBudget }.
 */
export async function runToolLoop(client, { model = 'claude-opus-4-8', system, messages, tools, exec, maxTokens = 1500, maxTurns = 8, requestOptions }) {
  const convo = [...messages];
  let turns = 0;
  while (turns < maxTurns) {
    turns++;
    const resp = await client.messages.create({ model, max_tokens: maxTokens, system, messages: convo, tools }, requestOptions);
    const toolUses = resp.content.filter(b => b.type === 'tool_use');
    if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const finalText = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { finalText, turns, stoppedOnBudget: false };
    }
    convo.push({ role: 'assistant', content: resp.content });
    const results = [];
    for (const tu of toolUses) {
      let out;
      try { out = await exec(tu.name, tu.input || {}); }
      catch (e) { out = { error: e?.message || 'tool execution failed' }; }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
    }
    convo.push({ role: 'user', content: results });
  }
  return { finalText: '', turns, stoppedOnBudget: true };
}
