import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCommands, setPageCommands, getPageCommands } from '../src/lib/commands.ts';

const noop = () => {};
const cmds = [
  { id: 'new', label: 'New analysis', keywords: 'generate ideas start', group: 'Actions', run: noop },
  { id: 'theme', label: 'Switch to light theme', keywords: 'dark mode appearance', group: 'Actions', run: noop },
  { id: 'pdf', label: 'Export PDF report', keywords: 'download share', group: 'This page', run: noop },
  { id: 'xls', label: 'Export Excel workbook', keywords: 'xlsx spreadsheet download', group: 'This page', run: noop },
];

test('empty query lists the page commands before the global ones', () => {
  assert.deepEqual(rankCommands(cmds, '').map(c => c.id), ['pdf', 'xls', 'new', 'theme']);
});

test('empty query never lets page commands crowd out the global ones', () => {
  const many = [1, 2, 3, 4, 5].map(i => ({ id: `p${i}`, label: `Page ${i}`, group: 'This page', run: noop }));
  const ids = rankCommands([...many, ...cmds.slice(0, 2)], '', 5).map(c => c.id);
  assert.deepEqual(ids, ['p1', 'p2', 'p3', 'new', 'theme']);
});

test('label prefix beats a word prefix beats a keyword', () => {
  assert.deepEqual(rankCommands(cmds, 'export').map(c => c.id), ['pdf', 'xls']);
  assert.deepEqual(rankCommands(cmds, 'pdf').map(c => c.id), ['pdf']);
  assert.deepEqual(rankCommands(cmds, 'download').map(c => c.id), ['pdf', 'xls']);
  assert.deepEqual(rankCommands(cmds, 'dark').map(c => c.id), ['theme']);
  assert.deepEqual(rankCommands(cmds, 'zzz'), []);
});

test('page commands unregister with their owner, so a gone page offers nothing', () => {
  const a = Symbol('a'), b = Symbol('b');
  setPageCommands(a, [cmds[2]]);
  setPageCommands(b, [cmds[3]]);
  assert.equal(getPageCommands().length, 2);
  setPageCommands(a, null);
  assert.deepEqual(getPageCommands().map(c => c.id), ['xls']);
  setPageCommands(b, null);
  assert.equal(getPageCommands().length, 0);
});

import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('the shortcut sheet only lists shortcuts the code implements', () => {
  const sheet = src('components/layout/ShortcutSheet.tsx');
  const header = src('components/layout/Header.tsx');
  const results = src('pages/ResultsPage.tsx');
  assert.ok(/e\.metaKey \|\| e\.ctrlKey\) && e\.key\.toLowerCase\(\) === 'k'/.test(header), '⌘K is bound');
  assert.ok(sheet.includes("e.key === '?'"), '? is bound');
  for (const k of ["'Home'", "'End'", "'ArrowDown'", "'ArrowUp'"]) assert.ok(header.includes(k), `palette handles ${k}`);
  assert.ok(results.includes("['j', 'k', 'ArrowDown', 'ArrowUp']") && results.includes("=== 'x'"), 'Results j/k/x exist');
});

test('the palette runs actions and Results registers its own', () => {
  const header = src('components/layout/Header.tsx');
  assert.ok(header.includes("kind: 'action'") && header.includes('row.cmd.run()'), 'palette rows can be actions');
  for (const id of ['new-analysis', 'last-result', 'theme', 'shortcuts', 'run-cancel', 'run-open']) assert.ok(header.includes(`'${id}'`), `global action ${id}`);
  const results = src('pages/ResultsPage.tsx');
  for (const id of ['res-pdf', 'res-pptx', 'res-excel', 'res-rfq', 'res-view']) assert.ok(results.includes(`'${id}'`), `Results registers ${id}`);
});
