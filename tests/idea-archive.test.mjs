// Quality-diversity archive: lever classifier, cell aggregation, gap targeting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLever, buildArchive, coverageGaps, archiveGrid, cellKey, LEVER_KEYS, COMMODITY_KEYS } from '../idea-archive.mjs';

test('classifyLever: normalises the free-text zoo to canonical keys, ordered rules', () => {
  assert.equal(classifyLever('Material + Weight'), 'weight');            // weight outranks material
  assert.equal(classifyLever('Part Consolidation'), 'consolidation');
  assert.equal(classifyLever('Platform Commonisation'), 'commonisation');
  assert.equal(classifyLever('Manufacturing Process'), 'process');
  assert.equal(classifyLever('Material Grade'), 'material');
  assert.equal(classifyLever('Complexity + Cost'), 'complexity');
  assert.equal(classifyLever('Design / Specification'), 'spec');
  assert.equal(classifyLever('Latest Technology'), 'technology');
  assert.equal(classifyLever('Make vs Buy'), 'logistics');
  assert.equal(classifyLever('zzz nothing matches'), 'other');
});

const ROWS = [
  { id: '1', title: 'Al subframe', system: 'Chassis', costSavingType: 'Material Grade', annualSaving: '£500K', difficulty: 'Medium', stars: 4, verified: 1 },
  { id: '2', title: 'Forged knuckle', system: 'Front Suspension', costSavingType: 'Material substitution', annualSaving: '£1.2M', difficulty: 'High', stars: 5, verified: 1 },
  { id: '3', title: 'Common damper', system: 'Chassis', costSavingType: 'Commonisation', annualSaving: '£200K', difficulty: 'Low', stars: 3, verified: 0 },
  { id: '4', title: 'Hairpin stator', system: 'Electric Motor Stator', costSavingType: 'Latest Technology', annualSaving: '£2M', difficulty: 'High', stars: 5, verified: 1 },
];

test('buildArchive: cells keyed by commodity × lever with best-idea tracking', () => {
  const a = buildArchive(ROWS);
  assert.equal(a.total, 4);
  const chassisMat = a.cells[cellKey('Chassis', 'material')];
  assert.equal(chassisMat.count, 2, 'both suspension rows classify to Chassis × material');
  assert.equal(chassisMat.best.title, 'Forged knuckle', 'higher stars wins best');
  assert.equal(a.cells[cellKey('EDU', 'technology')].count, 1);
  assert.equal(a.cells[cellKey('Chassis', 'commonisation')].byDifficulty.Low, 1);
});

test('coverageGaps: empty cells first, thin cells next, "other" never targeted, capped', () => {
  const a = buildArchive(ROWS);
  const gaps = coverageGaps(a, 'Chassis', { max: 9, sparseBelow: 3 });
  assert.ok(gaps.length > 0);
  assert.equal(gaps[0].count, 0, 'empty cells lead');
  assert.ok(gaps.every(g => g.lever !== 'other'));
  assert.ok(gaps.every(g => LEVER_KEYS.includes(g.lever)));
  // Chassis × material has 2 (< sparseBelow 3) so it may appear; commonisation has 1
  assert.ok(coverageGaps(a, 'Chassis', { max: 2 }).length === 2, 'max respected');
  assert.deepEqual(coverageGaps(a, 'NotACommodity'), []);
});

test('archiveGrid: full dense grid for the heatmap', () => {
  const grid = archiveGrid(buildArchive(ROWS));
  assert.equal(grid.length, COMMODITY_KEYS.length * LEVER_KEYS.length);
  const cell = grid.find(g => g.commodity === 'Chassis' && g.lever === 'material');
  assert.equal(cell.count, 2);
  assert.equal(cell.verified, 2);
  const empty = grid.find(g => g.commodity === 'Interior' && g.lever === 'weight');
  assert.equal(empty.count, 0);
  assert.equal(empty.bestTitle, null);
});

test('determinism: same rows → identical archive', () => {
  assert.deepEqual(buildArchive(ROWS), buildArchive([...ROWS]));
});
