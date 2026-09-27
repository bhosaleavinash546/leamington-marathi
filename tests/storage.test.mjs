// src/lib/storage.ts, run as plain JS against a fake window: the point of the
// module is that a throwing localStorage never reaches the caller.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const src = readFileSync(new URL('../src/lib/storage.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

function fakeStorage({ throwOnSet = false, throwOnGet = false } = {}) {
  const m = new Map();
  return {
    getItem: k => { if (throwOnGet) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (throwOnSet) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: k => m.delete(k),
    _m: m,
  };
}

describe('storage helper', () => {
  beforeEach(() => { globalThis.window = { localStorage: fakeStorage() }; });

  it('round-trips a string and JSON', () => {
    assert.equal(mod.writeString('a', 'x'), true);
    assert.equal(mod.readString('a'), 'x');
    assert.equal(mod.writeJSON('b', { n: 1 }), true);
    assert.deepEqual(mod.readJSON('b', null), { n: 1 });
  });

  it('a throwing setItem returns false instead of throwing', () => {
    globalThis.window = { localStorage: fakeStorage({ throwOnSet: true }) };
    assert.equal(mod.writeString('a', 'x'), false);
    assert.equal(mod.writeJSON('a', {}), false);
  });

  it('a throwing getItem, a missing key and corrupt JSON all yield the fallback', () => {
    globalThis.window = { localStorage: fakeStorage({ throwOnGet: true }) };
    assert.equal(mod.readString('a', 'fb'), 'fb');
    globalThis.window = { localStorage: fakeStorage() };
    assert.deepEqual(mod.readJSON('missing', [1]), [1]);
    window.localStorage.setItem('bad', '{not json');
    assert.deepEqual(mod.readJSON('bad', 'fb'), 'fb');
  });

  it('no window at all (SSR, a worker) is a no-op, never a crash', () => {
    delete globalThis.window;
    assert.equal(mod.readString('a', 'fb'), 'fb');
    assert.equal(mod.writeString('a', 'x'), false);
  });

  it('pushRecent keeps most-recent-first, de-duplicated and capped', () => {
    mod.pushRecent('r', 'a', 3); mod.pushRecent('r', 'b', 3); mod.pushRecent('r', 'a', 3);
    assert.deepEqual(mod.readJSON('r', []), ['a', 'b']);
    mod.pushRecent('r', 'c', 3); mod.pushRecent('r', 'd', 3);
    assert.deepEqual(mod.readJSON('r', []), ['d', 'c', 'a']);
  });
});
