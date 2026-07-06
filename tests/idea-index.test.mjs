import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, tokenize } from '../idea-index.mjs';

const docs = [
  { id: 'a', title: 'Giga-cast aluminium rear underbody', text: 'Giga-cast aluminium rear underbody replaces 70 stamped parts with one HPDC casting' },
  { id: 'b', title: 'Tailor-welded blank door inner', text: 'Laser welded tailored blank consolidates door inner stampings, thickness follows load path' },
  { id: 'c', title: 'PCB busbar laser welding', text: 'Laser welding replaces bolted busbar joints inside the battery pack, deletes fasteners' },
  { id: 'd', title: 'Zonal harness consolidation', text: 'Zonal E/E architecture cuts copper harness mass and connector count in doors' },
];

test('tokenize lowercases, strips punctuation and stopwords', () => {
  assert.deepEqual(tokenize('The Giga-Cast, ALUMINIUM (rear)!'), ['giga-cast', 'aluminium', 'rear']);
});

test('BM25 ranks the on-topic document first', () => {
  const idx = buildIndex(docs);
  assert.equal(idx.search('aluminium casting underbody')[0].doc.id, 'a');
  assert.equal(idx.search('battery busbar weld fastener')[0].doc.id, 'c');
  assert.equal(idx.search('door harness copper zonal')[0].doc.id, 'd');
});

test('no-hit and empty queries return empty results, never throw', () => {
  const idx = buildIndex(docs);
  assert.deepEqual(idx.search('unrelated gibberish zzz'), []);
  assert.deepEqual(idx.search(''), []);
  assert.deepEqual(buildIndex([]).search('anything'), []);
});

test('k limits the result count', () => {
  const idx = buildIndex(docs);
  assert.ok(idx.search('laser welded', 1).length === 1);
});
