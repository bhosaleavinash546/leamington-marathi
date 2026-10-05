import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardKpis, ideasThisMonth } from '../src/lib/dashboard-kpis.ts';

const now = new Date(2026, 9, 5, 14, 0);   // 5 Oct 2026
const projects = [
  { generatedAt: new Date(2026, 9, 1, 9).toISOString(), summary: { totalIdeas: 22 } },
  { generatedAt: new Date(2026, 9, 4, 9).toISOString(), summary: { totalIdeas: 8 } },
  { generatedAt: new Date(2026, 8, 30, 23).toISOString(), summary: { totalIdeas: 50 } },   // last month
  { generatedAt: 'not a date', summary: { totalIdeas: 99 } },
];

test('ideas this month counts only analyses dated in the current calendar month', () => {
  const m = ideasThisMonth(projects, now);
  assert.equal(m.ideas, 30);
  assert.equal(m.analyses, 2);
});

test('with no business cases, money tiles have NO value — never an annotation stand-in', () => {
  const k = dashboardKpis({ pipeline: null, projects, reviewed: 0, annotated: 0, now });
  const by = Object.fromEntries(k.map(x => [x.id, x]));
  assert.equal(by.pipeline.value, null);
  assert.equal(by.confirmed.value, null);
  assert.equal(by.reviewed.value, null);
  assert.match(by.confirmed.sub, /Nothing has passed G3/);
});

test('confirmed is the G3 gate; pipeline is the total; every tile names its source', () => {
  const k = dashboardKpis({ pipeline: { totalPotential: 4_200_000, confirmedSaving: 900_000, gateCount: { G3: 2 }, totalCases: 7 }, projects, reviewed: 3, annotated: 12, now });
  const by = Object.fromEntries(k.map(x => [x.id, x]));
  assert.equal(by.pipeline.value, 4_200_000);
  assert.equal(by.confirmed.value, 900_000);
  assert.equal(by.confirmed.sub, '2 ideas through G3');
  assert.equal(by.reviewed.value, 25);
  for (const t of k) assert.ok(t.source.length > 0, `${t.id} has a source`);
});
