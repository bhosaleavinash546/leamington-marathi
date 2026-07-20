// Taste profile: approvals/confirmations mined from the three real surfaces,
// prompt block formatting, and the visible taste-match stamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { buildTasteProfile, buildTasteContext, tasteMatchIdeas } from '../idea-feedback.mjs';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE vave_actions (id TEXT, userId TEXT, ideaTitle TEXT, targetSaving TEXT, confirmedSaving TEXT DEFAULT '', stage TEXT DEFAULT 'Identified', createdAt TEXT, updatedAt TEXT);
    CREATE TABLE idea_business_cases (id TEXT, userId TEXT, ideaTitle TEXT, totalAnnualSaving REAL DEFAULT 0, gate TEXT DEFAULT 'G0', createdAt TEXT);
    CREATE TABLE projects (id TEXT, userId TEXT, ideas TEXT, annotations TEXT DEFAULT '{}', createdAt TEXT);
  `);
  return db;
}

test('buildTasteProfile: splits approved vs confirmed across all three surfaces', () => {
  const db = makeDb();
  db.prepare("INSERT INTO vave_actions (id,userId,ideaTitle,targetSaving,stage,updatedAt) VALUES ('1','u1','Hairpin winding conversion','£400K','Identified','2026-01-01')").run();
  db.prepare("INSERT INTO vave_actions (id,userId,ideaTitle,targetSaving,confirmedSaving,stage,updatedAt) VALUES ('2','u1','HPDC housing consolidation','£300K','£280K','Confirmed','2026-01-02')").run();
  db.prepare("INSERT INTO idea_business_cases (id,userId,ideaTitle,totalAnnualSaving,gate,createdAt) VALUES ('3','u1','Delete resolver sensor',120000,'G3','2026-01-03')").run();
  db.prepare("INSERT INTO idea_business_cases (id,userId,ideaTitle,totalAnnualSaving,gate,createdAt) VALUES ('4','u1','Commonise fasteners',50000,'G1','2026-01-04')").run();
  db.prepare(`INSERT INTO projects (id,userId,ideas,annotations,createdAt) VALUES ('5','u1',
    '[{"id":"i1","title":"Al bumper beam extrusion","costSavingPotential":{"annualValue":"£200K"}}]',
    '{"i1":{"status":"approved","note":"","updatedAt":"2026-01-05"}}','2026-01-05')`).run();
  db.prepare("INSERT INTO vave_actions (id,userId,ideaTitle,stage,updatedAt) VALUES ('9','OTHER','Someone elses idea','Confirmed','2026-01-06')").run();

  const p = buildTasteProfile(db, 'u1');
  const titles = (l) => l.map(x => x.title);
  assert.deepEqual(titles(p.confirmed).sort(), ['Delete resolver sensor', 'HPDC housing consolidation']);
  assert.ok(titles(p.approved).includes('Hairpin winding conversion'));
  assert.ok(titles(p.approved).includes('Commonise fasteners'));
  assert.ok(titles(p.approved).includes('Al bumper beam extrusion'), 'annotation approvals mined');
  assert.ok(!titles(p.approved).concat(titles(p.confirmed)).includes('Someone elses idea'), 'scoped to the user');
});

test('buildTasteContext: prompt block labels data as data, strips injection chars, empty when no history', () => {
  const ctx = buildTasteContext({
    confirmed: [{ title: 'HPDC <script>alert(1)</script> housing', saving: '£280K' }],
    approved: [{ title: 'Hairpin winding', saving: '' }],
  });
  assert.match(ctx, /CONFIRMED IN PRODUCTION/);
  assert.match(ctx, /NOT instructions/);
  assert.ok(!ctx.includes('<script>'), 'instruction-carrying chars stripped');
  assert.match(ctx, /Hairpin winding/);
  assert.equal(buildTasteContext({ approved: [], confirmed: [] }), '');
  assert.equal(buildTasteContext(null), '');
});

test('tasteMatchIdeas: stamps similar ideas only, never dissimilar ones', () => {
  const profile = { confirmed: [{ title: 'Hairpin bar winding copper reduction' }], approved: [] };
  const ideas = [
    { title: 'Convert stator to hairpin bar winding to cut copper' },
    { title: 'Composite tailgate with SMC outer panel' },
  ];
  const n = tasteMatchIdeas(ideas, profile);
  assert.equal(n, 1);
  assert.ok(ideas[0].tasteMatch, 'similar idea stamped');
  assert.equal(ideas[0].tasteMatch.title, 'Hairpin bar winding copper reduction');
  assert.equal(ideas[1].tasteMatch, undefined, 'dissimilar idea untouched');
  assert.equal(tasteMatchIdeas(ideas, null), 0, 'no history → no stamps');
});
