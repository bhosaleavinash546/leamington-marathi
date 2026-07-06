import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferCommodityKey } from '../src/data/commodity-classify.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ideas = JSON.parse(fs.readFileSync(path.join(ROOT, 'marketplace-offroad-luxury-ideas.json'), 'utf8'));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

test('exactly 300 ideas, 15 per commodity across 20 commodities', () => {
  assert.equal(ideas.length, 300);
  const bySys = {};
  for (const i of ideas) bySys[i.system] = (bySys[i.system] || 0) + 1;
  assert.equal(Object.keys(bySys).length, 20);
  for (const [sys, n] of Object.entries(bySys)) assert.equal(n, 15, `${sys} has ${n}, expected 15`);
});

test('every idea title is unique and unique vs the existing marketplace files', () => {
  const local = ideas.map(i => norm(i.title));
  assert.equal(new Set(local).size, 300, 'internal title collision');
  const existing = new Set();
  for (const f of ['marketplace-extra-ideas.json', 'marketplace-suv-ideas.json', 'marketplace-bev-cooling-ideas.json', 'marketplace-driveline-ideas.json']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const i of JSON.parse(fs.readFileSync(p, 'utf8'))) existing.add(norm(i.title));
  }
  for (const t of local) assert.ok(!existing.has(t), `duplicate of an existing idea: ${t}`);
});

test('every idea routes to a commodity tab (no orphans)', () => {
  for (const i of ideas) assert.ok(inferCommodityKey(i.system), `${i.system} orphaned`);
});

test('every idea has the required deep fields (materials ≥3, processes ≥2, DFMA, benchmark, savings)', () => {
  for (const i of ideas) {
    assert.ok(i.id && i.title && i.system && i.description, `${i.id} missing top-level fields`);
    const d = i.ideaData;
    assert.ok(d && d.technicalDescription, `${i.id} missing technicalDescription`);
    assert.ok(Array.isArray(d.materialAlternatives) && d.materialAlternatives.length >= 3, `${i.id} needs ≥3 materials`);
    assert.ok(Array.isArray(d.processAlternatives) && d.processAlternatives.length >= 2, `${i.id} needs ≥2 processes`);
    assert.ok(Array.isArray(d.dfmaPrinciples) && d.dfmaPrinciples.length >= 1, `${i.id} missing DFMA`);
    assert.ok(d.benchmarkReference, `${i.id} missing benchmark`);
    assert.ok(d.costSavingPotential && d.costSavingPotential.annualValue, `${i.id} missing savings`);
    assert.ok(['estimated', 'benchmarked', 'theoretical', 'verified'].includes(d.confidenceLevel), `${i.id} bad confidence`);
  }
});

test('ids are unique and follow the orl### scheme', () => {
  const ids = ideas.map(i => i.id);
  assert.equal(new Set(ids).size, 300);
  for (const id of ids) assert.match(id, /^orl\d{3}$/);
});
