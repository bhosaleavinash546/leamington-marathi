// src/lib/results-store.ts — the pure rule, and the fallback path when
// IndexedDB is absent (blocked site data, some private windows).
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const load = async (file) => {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace("from './storage'", `from '${new URL('../src/lib/storage.ts', import.meta.url).href.replace('.ts', '.mjs')}'`);
  return js;
};
// Write the transpiled storage helper to a data URL the store can import.
const storageJs = await load('../src/lib/storage.ts');
const storageUrl = 'data:text/javascript;base64,' + Buffer.from(storageJs).toString('base64');
const storeJs = (await load('../src/lib/results-store.ts')).replace(/from '[^']*storage\.mjs'/, `from '${storageUrl}'`);
const m = await import('data:text/javascript;base64,' + Buffer.from(storeJs).toString('base64'));

function fakeStorage() { const s = new Map(); return { getItem: k => (s.has(k) ? s.get(k) : null), setItem: (k, v) => s.set(k, String(v)), removeItem: k => s.delete(k) }; }
const rec = (id, savedAt) => ({ id, systemName: 'S', subName: 'A', result: { ideas: [id] }, savedAt });

describe('pruneToMax', () => {
  it('keeps the newest N, newest first', () => {
    const out = m.pruneToMax([rec('a', '2026-01-01'), rec('c', '2026-03-01'), rec('b', '2026-02-01')], 2);
    assert.deepEqual(out.map(r => r.id), ['c', 'b']);
  });
});

describe('without IndexedDB the localStorage fallback round-trips and caps', () => {
  beforeEach(() => { globalThis.window = { localStorage: fakeStorage() }; delete globalThis.indexedDB; });
  it('put / get / list', async () => {
    assert.equal(await m.putResult(rec('x', '2026-09-01')), true);
    assert.deepEqual((await m.getResult('x')).result, { ideas: ['x'] });
    assert.equal(await m.getResult('nope'), null);
    for (let i = 0; i < 30; i++) await m.putResult(rec('r' + i, `2026-09-${String(i + 1).padStart(2, '0')}`));
    const list = await m.listResults();
    assert.equal(list.length, m.MAX_SAVED, 'capped at MAX_SAVED');
    assert.equal(list[0].id, 'r29', 'newest first');
    assert.equal(await m.getResult('x'), null, 'the oldest was pruned');
  });
  it('re-saving the same id replaces rather than duplicates', async () => {
    await m.putResult(rec('same', '2026-09-01'));
    await m.putResult({ ...rec('same', '2026-09-02'), result: { ideas: ['v2'] } });
    assert.equal((await m.listResults()).filter(r => r.id === 'same').length, 1);
    assert.deepEqual((await m.getResult('same')).result, { ideas: ['v2'] });
  });
});
