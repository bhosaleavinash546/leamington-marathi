// UX step 2 (docs/UX-REVIEW-2026-10.md §5.2): Results has ONE toolbar row and a
// table view, and the view is linkable through the URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/ResultsPage.tsx', import.meta.url), 'utf8');
const table = readFileSync(new URL('../src/components/results/IdeasTable.tsx', import.meta.url), 'utf8');

test('the filter chip wall is gone: filters are labelled selects', () => {
  for (const label of ['Filter by difficulty', 'Filter by saving type', 'Filter by status', 'Sort ideas', 'Search ideas']) {
    assert.ok(page.includes(`aria-label="${label}"`), `missing control: ${label}`);
  }
  assert.ok(!/whileHover=\{\{\s*scale/.test(page.slice(page.indexOf('{/* Toolbar'), page.indexOf('{/* Bulk selection'))), 'no spring-scale chips in the toolbar');
});

test('the view, filters and sort are read from and written to the URL', () => {
  for (const k of ['q', 'diff', 'type', 'status', 'sort', 'view']) {
    assert.ok(page.includes(`params.get('${k}')`), `not read from URL: ${k}`);
  }
  assert.ok(page.includes('setParams(next, { replace: true })'), 'URL updated without polluting history');
});

test('table view renders IdeasTable with sortable headers bound to the page sort', () => {
  assert.ok(page.includes("view === 'table'") && page.includes('<IdeasTable'), 'table view wired');
  assert.ok(table.includes('aria-sort'), 'sortable headers announce their state');
  assert.ok(table.includes('aria-expanded'), 'row expansion is announced');
  assert.ok(table.includes('engineCheckReason'), 'an unchecked idea says why, not just a blank');
});
