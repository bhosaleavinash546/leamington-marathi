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

import { toGbp, sumInGbp } from '../src/lib/dashboard-kpis.ts';
import { moneyCurrency, parseMoney } from '../src/services/report-core.mjs';

const fx = { rates: { GBP: 0.85, USD: 1.10 } };   // units per EUR

test('moneyCurrency reads the currency the figure is written in', () => {
  assert.equal(moneyCurrency('€7.7M–€12.0M at 200,000 units/yr'), 'EUR');
  assert.equal(moneyCurrency('£350K–£650K'), 'GBP');
  assert.equal(moneyCurrency('$1.2M'), 'USD');
  assert.equal(moneyCurrency('1.2M EUR per year'), 'EUR');
  assert.equal(moneyCurrency('350K–650K'), null);
});

test('€ and £ figures are converted before they are added — the old bug summed them as pounds', () => {
  const items = [{ value: parseMoney('€2.0M'), currency: 'EUR' }, { value: parseMoney('£2.0M'), currency: 'GBP' }];
  const r = sumInGbp(items, fx);
  assert.equal(r.total, 2_000_000 * 0.85 + 2_000_000);   // not 4,000,000
  assert.equal(r.skipped, 0);
  assert.ok(Math.abs(toGbp(1_100_000, 'USD', fx) - 850_000) < 1e-6);
});

test('a figure that cannot be converted is left out and counted, never guessed', () => {
  const r = sumInGbp([{ value: 1e6, currency: 'EUR' }, { value: 5e5, currency: 'GBP' }, { value: 3e5, currency: null }], null);
  assert.equal(r.total, 5e5);
  assert.equal(r.skipped, 2);
  assert.equal(toGbp(1e6, 'CNY', fx), null);   // no CNY rate in the snapshot
});

test('a pipeline with converted cases says so, with the rate source', () => {
  const k = dashboardKpis({ pipeline: { totalPotential: 18500, confirmedSaving: 18500, gateCount: { G3: 2 }, totalCases: 2, convertedCases: 1, fx: { source: 'static reference', date: '2026-09-01' } }, projects: [], reviewed: 0, annotated: 0, now: new Date() });
  assert.match(k[0].source, /1 converted to GBP \(static reference, 2026-09-01\)/);
});
