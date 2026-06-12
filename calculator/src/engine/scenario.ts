import type { Scenario, ScenarioDelta, UniversalStackInput, PartCostResult } from './types.js';
import { computeUniversalStack } from './core.js';
import type { RateLibrary } from './types.js';

const STORAGE_KEY = 'shouldCostScenarios';

let _scenarios: Scenario[] = [];

function load(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _scenarios = raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    _scenarios = [];
  }
}

function persist(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_scenarios));
}

load();

export function saveScenario(
  name: string,
  description: string,
  input: UniversalStackInput,
  result: PartCostResult
): Scenario {
  const scenario: Scenario = {
    id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    description,
    input,
    result,
    createdAt: new Date().toISOString(),
  };
  _scenarios.push(scenario);
  persist();
  return scenario;
}

export function listScenarios(): Scenario[] {
  return [..._scenarios];
}

export function getScenario(id: string): Scenario | undefined {
  return _scenarios.find(s => s.id === id);
}

export function deleteScenario(id: string): void {
  _scenarios = _scenarios.filter(s => s.id !== id);
  persist();
}

export function clearScenarios(): void {
  _scenarios = [];
  persist();
}

export function compareScenarios(
  baselineId: string,
  targetId: string,
  library: RateLibrary
): { baseline: Scenario; target: Scenario; delta: ScenarioDelta } {
  const baseline = getScenario(baselineId);
  const target = getScenario(targetId);
  if (!baseline) throw new Error(`Scenario '${baselineId}' not found`);
  if (!target) throw new Error(`Scenario '${targetId}' not found`);

  // Re-compute results to ensure they reflect current library
  const bResult = computeUniversalStack(baseline.input, library);
  const tResult = computeUniversalStack(target.input, library);

  const b = bResult.breakdown;
  const t = tResult.breakdown;
  const deltaTotal = tResult.total - bResult.total;
  const delta: ScenarioDelta = {
    rawMaterial: t.rawMaterial - b.rawMaterial,
    process: t.process - b.process,
    labour: t.labour - b.labour,
    tooling: t.tooling - b.tooling,
    packaging: t.packaging - b.packaging,
    logistics: t.logistics - b.logistics,
    overhead: t.overhead - b.overhead,
    margin: t.margin - b.margin,
    total: deltaTotal,
    totalPct: bResult.total > 0 ? (deltaTotal / bResult.total) * 100 : 0,
  };

  return {
    baseline: { ...baseline, result: bResult },
    target: { ...target, result: tResult },
    delta,
  };
}

export function importScenarios(json: string): { imported: number; errors: string[] } {
  const errors: string[] = [];
  let imported = 0;
  try {
    const data = JSON.parse(json) as unknown;
    if (!Array.isArray(data)) {
      errors.push('Expected a JSON array of scenarios');
      return { imported, errors };
    }
    for (const item of data as unknown[]) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'id' in item && 'name' in item && 'input' in item && 'result' in item
      ) {
        const s = item as Scenario;
        if (!_scenarios.find(ex => ex.id === s.id)) {
          _scenarios.push(s);
          imported++;
        }
      } else {
        errors.push(`Skipped malformed scenario: ${JSON.stringify(item).slice(0, 80)}`);
      }
    }
    persist();
  } catch (err) {
    errors.push(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { imported, errors };
}

export function exportScenarios(): string {
  return JSON.stringify(_scenarios, null, 2);
}
