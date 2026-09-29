import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harvestServerSearches, salvageIdeasFromPartialJson, serverWebSearchTool, MAX_WEB_SEARCHES } from '../anthropic-search.mjs';

test('the server tool is the current web search version, capped', () => {
  assert.deepEqual(serverWebSearchTool(), { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_WEB_SEARCHES });
});

test('searches are paired with their results, errors kept, repeats skipped', () => {
  const content = [
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'hairpin stator cost' } },
    { type: 'web_search_tool_result', tool_use_id: 's1', content: [
      { type: 'web_search_result', url: 'https://www.example.com/a', title: 'A', page_age: 'March 2026' },
      { type: 'web_search_result', url: 'https://b.org/x', title: 'B' } ] },
    { type: 'server_tool_use', id: 's2', name: 'web_search', input: { query: 'copper price' } },
    { type: 'web_search_tool_result', tool_use_id: 's2', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
    { type: 'tool_use', id: 't', name: 'emit_ideas', input: { ideas: [] } },
  ];
  const seen = new Set();
  const h = harvestServerSearches(content, seen);
  assert.equal(h.length, 2);
  assert.equal(h[0].query, 'hairpin stator cost');
  assert.equal(h[0].results.length, 2);
  assert.equal(h[0].results[0].source, 'example.com');
  assert.equal(h[0].error, null);
  assert.equal(h[1].error, 'max_uses_exceeded');
  assert.deepEqual(h[1].results, []);
  assert.equal(harvestServerSearches(content, seen).length, 0, 'a paused turn resent is not counted twice');
});

test('a cut-off idea list keeps every complete idea', () => {
  const partial = '{"ideas":[{"title":"A","x":{"y":[1,2]}},{"title":"B, with \\"quotes\\" and } brace"},{"title":"C","technicalDescription":"cut off he';
  assert.deepEqual(salvageIdeasFromPartialJson(partial).map(i => i.title), ['A', 'B, with "quotes" and } brace']);
  assert.deepEqual(salvageIdeasFromPartialJson('{"ideas":[{"title":"only partial'), []);
  assert.deepEqual(salvageIdeasFromPartialJson(''), []);
  assert.equal(salvageIdeasFromPartialJson('{"ideas":[{"a":1},{"a":2}]}').length, 2, 'a complete list parses too');
});

test('a search paused before its result is reported when the result arrives', () => {
  const seen = new Set(), pending = new Map();
  const first = [{ type: 'server_tool_use', id: 'p1', name: 'web_search', input: { query: 'paused query' } }];
  assert.equal(harvestServerSearches(first, seen, pending).length, 0, 'not reported as 0 results');
  const resumed = [{ type: 'web_search_tool_result', tool_use_id: 'p1', content: [{ type: 'web_search_result', url: 'https://x.com/r', title: 'R' }] }];
  const h = harvestServerSearches(resumed, seen, pending);
  assert.equal(h.length, 1);
  assert.equal(h[0].query, 'paused query');
  assert.equal(h[0].results.length, 1);
});
