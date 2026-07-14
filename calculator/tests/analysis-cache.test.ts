import { describe, it, expect, afterAll } from 'vitest';
import { createAnalysisCache } from '../server/utils/analysis-cache.js';
import db from '../server/db.js';

const TABLE = 'test_analysis_cache';
const cache = createAnalysisCache(TABLE);

afterAll(() => { db.exec(`DROP TABLE IF EXISTS ${TABLE}`); });

describe('shared analysis cache', () => {
  it('produces a stable key for identical inputs and a different key for changed bytes', () => {
    const a = cache.buildKey([Buffer.from('step-file-bytes'), Buffer.from('{"deep":false}')]);
    const b = cache.buildKey([Buffer.from('step-file-bytes'), Buffer.from('{"deep":false}')]);
    const c = cache.buildKey([Buffer.from('step-file-byteX'), Buffer.from('{"deep":false}')]);
    const d = cache.buildKey([Buffer.from('step-file-bytes'), Buffer.from('{"deep":true}')]);
    expect(a).toBe(b);       // identical inputs → identical key → identical cached result
    expect(a).not.toBe(c);   // different file → different key
    expect(a).not.toBe(d);   // different settings → different key
  });

  it('round-trips a payload through SQLite (survives L1 eviction)', () => {
    const key = cache.buildKey([Buffer.from('roundtrip')]);
    cache.set(key, { total: 42.42, analysis: { partName: 'bracket' } });
    // Fresh instance = empty L1, forcing the SQLite read path (restart simulation)
    const cold = createAnalysisCache(TABLE);
    expect(cold.get(key)).toEqual({ total: 42.42, analysis: { partName: 'bracket' } });
  });

  it('returns null for unknown keys and expired entries', () => {
    expect(cache.get('nope')).toBeNull();
    const shortLived = createAnalysisCache(TABLE, 1); // 1 ms TTL
    const key = shortLived.buildKey([Buffer.from('expiring')]);
    shortLived.set(key, { v: 1 });
    return new Promise<void>(resolve => setTimeout(() => {
      expect(shortLived.get(key)).toBeNull();
      resolve();
    }, 10));
  });

  it('rejects unsafe table names', () => {
    expect(() => createAnalysisCache('bad; DROP TABLE users')).toThrow();
  });
});
