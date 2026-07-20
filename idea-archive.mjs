/**
 * Quality-diversity archive (MAP-Elites-style) over the validated idea corpus.
 * ------------------------------------------------------------------
 * Behavioural dimensions: commodity (the shared classifier the marketplace UI
 * already uses) × lever type (keyword-normalised from the free-text
 * costSavingType — 100+ variants in the data) × difficulty. The archive powers:
 *
 *   • empty-cell targeting at generation time — "no verified idea yet for
 *     Chassis × commonisation, target it" (novelty search made concrete)
 *   • the marketplace coverage heatmap
 *
 * Pure over a rows array so it unit-tests without a DB; the server wraps it
 * with the same count-keyed cache getIdeaIndex uses.
 */
import { inferCommodityKey, COMMODITY_KEYS } from './src/data/commodity-classify.mjs';

export { COMMODITY_KEYS, inferCommodityKey };

// Canonical lever taxonomy. Ordered rules — FIRST match wins, so the more
// specific levers (consolidation, commonisation) outrank the broad ones.
export const LEVER_KEYS = ['consolidation', 'commonisation', 'weight', 'material', 'process', 'complexity', 'spec', 'technology', 'logistics'];
const LEVER_RULES = [
  ['consolidation', /consolidat|part[\s-]?count|part consolidation|integration|merge|combine/i],
  ['commonisation', /commonis|commoniz|carry[\s-]?over|platform|standardis|standardiz/i],
  ['weight', /weight|\bmass\b|lightweight/i],
  ['material', /material|grade|chemistry|substitut|alloy/i],
  ['process', /process|manufactur|assembly|dfma|labour|labor|tooling|capex|throughput|yield|energy/i],
  ['complexity', /complexity|simplif|decontent|delete|feature|part reduction/i],
  ['spec', /\bspec\b|design|tolerance|quality|performance|reliab|warranty|service|safety|accuracy/i],
  ['technology', /technolog|efficiency|software|architecture|cell|thermal|future/i],
  ['logistics', /logistic|supply|make vs buy|packaging|freight/i],
];

/** Normalise a free-text lever description to one canonical key ('other' if nothing matches). */
export function classifyLever(text) {
  const t = String(text || '');
  for (const [key, re] of LEVER_RULES) if (re.test(t)) return key;
  return 'other';
}

const parseSaving = (v) => {
  const m = String(v || '').replace(/[,\s]/g, '').match(/([\d.]+)\s*([mk]?)/i);
  if (!m) return 0;
  return parseFloat(m[1]) * (/m/i.test(m[2]) ? 1e6 : /k/i.test(m[2]) ? 1e3 : 1);
};

export const cellKey = (commodity, lever) => `${commodity}|${lever}`;

/**
 * Build the archive from marketplace-shaped rows
 * [{ id, title, system, costSavingType, annualSaving, difficulty, stars, verified }].
 * Cell = { count, verified, byDifficulty, best } where best is the highest
 * stars-then-saving idea in the cell.
 */
export function buildArchive(rows) {
  const cells = {};
  let total = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const commodity = inferCommodityKey(r.system || '');
    const lever = classifyLever(`${r.costSavingType || ''} ${r.title || ''}`);
    const key = cellKey(commodity, lever);
    const cell = cells[key] || (cells[key] = { commodity, lever, count: 0, verified: 0, byDifficulty: { Low: 0, Medium: 0, High: 0 }, best: null });
    cell.count++;
    if (r.verified) cell.verified++;
    if (cell.byDifficulty[r.difficulty] !== undefined) cell.byDifficulty[r.difficulty]++;
    const better = !cell.best
      || (r.stars || 0) > (cell.best.stars || 0)
      || ((r.stars || 0) === (cell.best.stars || 0) && parseSaving(r.annualSaving) > parseSaving(cell.best.annualSaving));
    if (better) cell.best = { id: r.id, title: r.title, annualSaving: r.annualSaving, stars: r.stars || 0 };
    total++;
  }
  return { cells, commodities: COMMODITY_KEYS, levers: LEVER_KEYS, total };
}

/**
 * Sparsest lever cells for a commodity — the generation targets. Empty cells
 * first, then the thinnest; 'other' excluded (it is a classifier bucket, not a
 * mechanism to aim at).
 */
export function coverageGaps(archive, commodity, { max = 3, sparseBelow = 3 } = {}) {
  if (!archive?.cells || !COMMODITY_KEYS.includes(commodity)) return [];
  return LEVER_KEYS
    .map(lever => ({ lever, count: archive.cells[cellKey(commodity, lever)]?.count || 0 }))
    .filter(g => g.count < sparseBelow)
    .sort((a, b) => a.count - b.count)
    .slice(0, max);
}

/** Flat grid for the coverage heatmap endpoint. */
export function archiveGrid(archive) {
  const grid = [];
  for (const commodity of COMMODITY_KEYS) {
    for (const lever of LEVER_KEYS) {
      const cell = archive.cells[cellKey(commodity, lever)];
      grid.push({ commodity, lever, count: cell?.count || 0, verified: cell?.verified || 0, bestTitle: cell?.best?.title || null });
    }
  }
  return grid;
}
