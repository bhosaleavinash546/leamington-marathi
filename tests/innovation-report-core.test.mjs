// Pure helpers behind the Innovation Studio PDF/Excel export. These decide what
// a reader is told about an idea's engine verdict, so they are tested directly
// rather than only through a rendered document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prettify, verdictOf, tabulate, columnWidths, safeName, sheetName,
} from '../src/services/innovation-report-core.mjs';

test('prettify splits camelCase and separators into a sentence-case heading', () => {
  assert.equal(prettify('functionCostMatrix'), 'Function cost matrix');
  assert.equal(prettify('poorValueList'), 'Poor value list');
  assert.equal(prettify('spec_relaxation-deltas'), 'Spec relaxation deltas');
  assert.equal(prettify('total'), 'Total');
  // An acronym keeps its case — a `costGBP` column must not become "cost gbp".
  assert.equal(prettify('costGBP'), 'Cost GBP');
  assert.equal(prettify(''), '');
  assert.equal(prettify(undefined), '');
});

test('verdictOf reads the engine stamp {direction, savingPct}', () => {
  const v = verdictOf({ engineCheck: { direction: 'confirmed', savingPct: 18.4 } });
  assert.equal(v.label, 'ENGINE-CONFIRMED');
  assert.equal(v.tone, 'confirmed');
  assert.match(v.detail, /18\.4%/);
});

test('verdictOf never softens a contradiction', () => {
  const v = verdictOf({ engineCheck: { direction: 'contradicted', savingPct: 2.1, note: 'flatness is not the binding driver' } });
  assert.equal(v.label, 'ENGINE-CONTRADICTED');
  assert.equal(v.tone, 'contradicted');
  assert.match(v.detail, /2\.1%/);
  assert.match(v.detail, /binding driver/);
});

test('verdictOf falls back through status and verdict rather than reporting unchecked', () => {
  assert.equal(verdictOf({ engineCheck: { status: 'confirmed' } }).tone, 'confirmed');
  assert.equal(verdictOf({ engineCheck: { verdict: 'contradicted' } }).tone, 'contradicted');
  // An unrecognised status is surfaced verbatim, not flattened to "unchecked".
  const other = verdictOf({ engineCheck: { status: 'partially verified' } });
  assert.equal(other.tone, 'other');
  assert.equal(other.label, 'PARTIALLY VERIFIED');
});

test('verdictOf reports honestly when there was no check at all', () => {
  for (const idea of [{ engineCheck: null }, { engineCheck: undefined }, {}, null]) {
    const v = verdictOf(idea);
    assert.equal(v.tone, 'none');
    assert.equal(v.label, 'NOT ENGINE-CHECKED');
    assert.match(v.detail, /no comparable basis/);
  }
});

test('verdictOf keeps a savingPct of zero and a negative saving visible', () => {
  assert.match(verdictOf({ engineCheck: { direction: 'contradicted', savingPct: 0 } }).detail, /saving 0%/);
  assert.match(verdictOf({ engineCheck: { direction: 'contradicted', savingPct: -3.2 } }).detail, /-3\.2%/);
});

test('verdictOf caps a hostile status label so it cannot run off the chip', () => {
  const v = verdictOf({ engineCheck: { status: 'x'.repeat(200) } });
  assert.equal(v.label.length, 22);
});

test('tabulate turns a list of objects into a table, union of keys, capped', () => {
  const t = tabulate([{ a: 1, b: 'x' }, { a: 2, c: true }]);
  assert.deepEqual(t.headers, ['a', 'b', 'c']);
  assert.deepEqual(t.rows, [['1', 'x', ''], ['2', '', 'true']]);
});

test('tabulate caps at six columns and forty rows', () => {
  const wide = tabulate([Object.fromEntries('abcdefghij'.split('').map(k => [k, 1]))]);
  assert.equal(wide.headers.length, 6);
  const tall = tabulate(Array.from({ length: 60 }, (_, i) => ({ i })));
  assert.equal(tall.rows.length, 40);
});

test('tabulate labels a list of plain values with the caller key, single column', () => {
  const t = tabulate(['React lateral load', 'Resist corrosion'], 'Poor value list');
  assert.deepEqual(t.headers, ['Poor value list']);
  assert.equal(t.rows.length, 2);
});

test('tabulate returns null for anything non-tabular', () => {
  for (const v of [null, undefined, [], {}, 'text', 42, [{}]]) assert.equal(tabulate(v), null);
});

test('tabulate stringifies a nested object cell instead of printing [object Object]', () => {
  const t = tabulate([{ components: { web: 40, boss: 60 } }]);
  assert.equal(t.rows[0][0], '{"web":40,"boss":60}');
});

test('columnWidths sum to the available width and favour the widest content', () => {
  const t = { headers: ['pct', 'verdict'], rows: [['34', 'poor value — over-engineered for the duty cycle it sees']] };
  const w = columnWidths(t, 178);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 178) < 1e-6);
  assert.ok(w[1] > w[0], 'the sentence column must be wider than the two-digit column');
});

test('columnWidths keeps a narrow column readable and never returns a negative', () => {
  const t = {
    headers: ['a', 'b', 'c'],
    rows: [['1', '2', 'z'.repeat(400)]],
  };
  const w = columnWidths(t, 178);
  assert.ok(w.every(x => x > 5), `every column stays usable: ${w}`);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 178) < 1e-6);
});

test('columnWidths handles an empty table without throwing', () => {
  assert.deepEqual(columnWidths({ headers: [], rows: [] }, 178), []);
});

test('safeName strips the characters a filesystem rejects', () => {
  assert.equal(safeName('a/b:c*d?e"f<g>h|i'), 'a-b-c-d-e-f-g-h-i');
});

test('sheetName obeys the Excel 31-character and reserved-character limits', () => {
  const n = sheetName('someExtremelyLongDeterministicAnalysisBlockName');
  assert.ok(n.length <= 31, n);
  assert.equal(/[[\]:*?/\\]/.test(sheetName('a/b[c]d:e')), false);
  assert.equal(sheetName(''), 'Sheet');
});
