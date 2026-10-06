// The chart theme (DECISIONS 123): one validated palette, used everywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { chartTheme, CATEGORICAL, foldOther, slotColor } from '../src/lib/chart-palette.ts';

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(new URL(e.name + '/', d)) : /\.tsx$/.test(e.name) ? [[e.name, readFileSync(new URL(e.name, d), 'utf8')]] : []);
const files = walk(new URL('../src/', import.meta.url));
const chartFiles = files.filter(([, s]) => s.includes("from 'recharts'"));

test('every chart file draws from the shared chart theme', () => {
  assert.ok(chartFiles.length >= 4);
  for (const [f, s] of chartFiles) assert.ok(s.includes('useChartTheme'), `${f} uses useChartTheme`);
});

test('no chart file hard-codes a colour on a mark, a grid or a tooltip', () => {
  const lit = /\b(fill|stroke|stopColor|color|background)\s*[=:]\s*\{?\s*['"](#[0-9a-fA-F]{3,8}|rgba?\()/;
  for (const [f, s] of chartFiles) assert.ok(!lit.test(s), `${f} has a literal chart colour`);
  for (const [f, s] of chartFiles) assert.ok(!/strokeDasharray="3 3"/.test(s), `${f}: gridlines are solid hairlines`);
});

test('the palettes are the validated eight, in both themes, in fixed order', () => {
  assert.equal(CATEGORICAL.light.length, 8);
  assert.equal(CATEGORICAL.dark.length, 8);
  assert.equal(chartTheme(false).accent, CATEGORICAL.light[0]);
  assert.equal(chartTheme(true).accent, CATEGORICAL.dark[0]);
  assert.equal(chartTheme(true).surface, '#111827', 'validated against the dark card surface');
  assert.equal(chartTheme(false).surface, '#ffffff', 'validated against the light card surface');
});

test('a ninth category folds into Other; the remainder slot is neutral', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ name: `v${i}`, value: 10 - i }));
  const f = foldOther(nine, 5);
  assert.equal(f.length, 5);
  assert.equal(f[4].name, 'Other');
  assert.equal(f[4].value, 6 + 5 + 4 + 3 + 2);
  assert.ok(!CATEGORICAL.dark.includes(slotColor(null, chartTheme(true))));
});

import { niceTicks } from '../src/lib/chart-palette.ts';
test('axis ticks are round numbers', () => {
  assert.deepEqual(niceTicks(1284), [0, 500, 1000, 1500]);
  assert.deepEqual(niceTicks(1804), [0, 500, 1000, 1500, 2000]);
  assert.deepEqual(niceTicks(16), [0, 5, 10, 15, 20]);
  assert.deepEqual(niceTicks(0), [0, 1]);
});

test('hand-drawn charts (Horizon, Prism, DFM, Innovation, score dial) use the theme too', () => {
  const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
  const svgFiles = ['pages/ForesightPage.tsx', 'pages/PrismPage.tsx', 'pages/DfmStudioPage.tsx', 'pages/InnovationStudioPage.tsx', 'components/dfm/ScoreRing.tsx'];
  // A literal colour on an SVG mark; #ffffff is allowed only as text set inside a filled mark.
  const lit = /\b(fill|stroke)\s*=\s*\{?\s*['"](?!#ffffff)(#[0-9a-fA-F]{3,8}|rgba?\()/;
  for (const f of svgFiles) {
    const s = read(f);
    assert.ok(s.includes('chart-theme') || s.includes('chart-palette'), `${f} imports the chart theme`);
    assert.ok(!lit.test(s), `${f} has a literal colour on an SVG mark`);
  }
  // Data bars are solid: no gradient fill, no glow, no colour-by-rank.
  const prism = read('pages/PrismPage.tsx');
  assert.ok(!/bg-gradient-to-r from-(teal|gold|slate)-\d+\/\d+ to-/.test(prism), 'Prism bars are solid');
  assert.ok(!/shadow-\[0_0_14px/.test(prism), 'no glow on the entitlement bar');
  assert.ok(!read('pages/ForesightPage.tsx').includes('bg-gradient-to-r from-teal-500 to-gold-400'), 'momentum bar is solid');
  assert.ok(!/bg-white\/5 overflow-hidden/.test(read('pages/ForesightPage.tsx')), 'bar tracks flip with the theme');
});
