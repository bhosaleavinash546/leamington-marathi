import type { Scenario, ScenarioDelta, UniversalStackInput, PartCostResult } from './types.js';
import { computeUniversalStack } from './core.js';
import type { RateLibrary } from './types.js';
let _idb: { set: typeof import('idb-keyval').set; get: typeof import('idb-keyval').get; del: typeof import('idb-keyval').del; keys: typeof import('idb-keyval').keys } | null = null;

async function getIDB() {
  if (_idb) return _idb;
  if (typeof indexedDB === 'undefined') return null;
  const mod = await import('idb-keyval');
  _idb = { set: mod.set, get: mod.get, del: mod.del, keys: mod.keys };
  return _idb;
}

const PREFIX = 'sc:';
const LEGACY_KEY = 'shouldCostScenarios';

let _scenarios: Scenario[] = [];
let _ready = false;
let _onError: ((msg: string) => void) | null = null;

export function setScenarioErrorHandler(fn: (msg: string) => void): void {
  _onError = fn;
}

/** Call once on app startup before reading scenarios. */
export async function initScenarioStore(): Promise<void> {
  if (_ready) return;
  const idb = await getIDB();
  if (idb) {
    await _migrateFromLocalStorage();
    const allKeys = await idb.keys();
    const scKeys = allKeys.filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX));
    const loaded = await Promise.all(scKeys.map(k => idb.get<Scenario>(k)));
    _scenarios = (loaded.filter(Boolean) as Scenario[])
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  _ready = true;
}

async function _migrateFromLocalStorage(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  try {
    const idb = await getIDB();
    if (!idb) return;
    const list = JSON.parse(raw) as Scenario[];
    await Promise.all(list.map(s => idb.set(`${PREFIX}${s.id}`, s)));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore migration errors
  }
}

function _persist(scenario: Scenario): void {
  getIDB()
    .then(idb => idb?.set(`${PREFIX}${scenario.id}`, scenario))
    .catch((err: unknown) => {
      console.error('[scenario] IDB persist failed:', err);
      _onError?.('Scenario could not be saved to local storage — changes may be lost on page reload. Check browser storage quota or permissions.');
    });
}

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
  _persist(scenario);
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
  getIDB().then(idb => idb?.del(`${PREFIX}${id}`)).catch((err: unknown) => {
    console.error('[scenario] IDB delete failed:', err);
  });
}

export function clearScenarios(): void {
  const ids = _scenarios.map(s => s.id);
  _scenarios = [];
  getIDB().then(idb => { if (idb) ids.forEach(id => idb.del(`${PREFIX}${id}`).catch((err: unknown) => console.error('[scenario] IDB del failed:', err))); }).catch((err: unknown) => console.error('[scenario] IDB clear failed:', err));
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

export function importScenarios(json: string): { imported: number; errors: string[]; meta?: { version: string; exportedAt: string } } {
  const errors: string[] = [];
  let imported = 0;
  let meta: { version: string; exportedAt: string } | undefined;
  try {
    const data = JSON.parse(json) as unknown;
    // Support both old (plain array) and new (object with metadata) formats
    let scenarioList: unknown[];
    if (Array.isArray(data)) {
      scenarioList = data;
    } else if (typeof data === 'object' && data !== null && 'scenarios' in data && Array.isArray((data as { scenarios: unknown[] }).scenarios)) {
      const d = data as { scenarios: unknown[]; rateLibraryVersion?: string; exportedAt?: string };
      scenarioList = d.scenarios;
      meta = { version: d.rateLibraryVersion ?? 'unknown', exportedAt: d.exportedAt ?? 'unknown' };
    } else {
      errors.push('Expected a JSON array or export object with scenarios field');
      return { imported, errors };
    }
    for (const item of scenarioList) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'id' in item && 'name' in item && 'input' in item && 'result' in item
      ) {
        const s = item as Scenario;
        if (!_scenarios.find(ex => ex.id === s.id)) {
          _scenarios.push(s);
          _persist(s);
          imported++;
        }
      } else {
        errors.push(`Skipped malformed scenario: ${JSON.stringify(item).slice(0, 80)}`);
      }
    }
  } catch (err) {
    errors.push(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { imported, errors, meta };
}

export function exportScenarios(libraryMeta?: { version: string; lastModified: string }): string {
  const exportData = {
    exportedAt: new Date().toISOString(),
    rateLibraryVersion: libraryMeta?.version ?? 'unknown',
    rateLibraryLastModified: libraryMeta?.lastModified ?? 'unknown',
    scenarioCount: _scenarios.length,
    scenarios: _scenarios,
  };
  return JSON.stringify(exportData, null, 2);
}
