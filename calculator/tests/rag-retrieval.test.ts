import { describe, it, expect } from 'vitest';
import { buildRateCorpus, retrieve, groundingBlock } from '../src/engine/rag-retrieval.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const corpus = buildRateCorpus(DEFAULT_RATE_LIBRARY);

describe('RAG retrieval over the rate library', () => {
  it('builds a corpus spanning materials, machines and labour', () => {
    const kinds = new Set(corpus.map(d => d.kind));
    expect(kinds.has('material')).toBe(true);
    expect(kinds.has('machine')).toBe(true);
    expect(kinds.has('labour')).toBe(true);
    expect(corpus.length).toBeGreaterThan(50);
  });

  it('retrieves the most relevant docs for a material query', () => {
    const hits = retrieve('aluminium price per kg', corpus, 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].score).toBeGreaterThan(0);
    // The top hit should be a material and mention aluminium.
    expect(hits.some(h => h.kind === 'material' && /alumin/i.test(h.text))).toBe(true);
    // scores are sorted descending
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
  });

  it('retrieves labour docs for a wage query', () => {
    const hits = retrieve('skilled machinist hourly wage rate', corpus, 5);
    expect(hits.some(h => h.kind === 'labour')).toBe(true);
  });

  it('includes saved costings and can retrieve them', () => {
    const c = buildRateCorpus(DEFAULT_RATE_LIBRARY, [
      { id: 'p1', partName: 'Gearbox Housing', commodity: 'casting', totalCost: 42.5, currency: 'GBP', region: 'UK' },
    ]);
    const hits = retrieve('gearbox housing casting cost', c, 5);
    expect(hits.some(h => h.kind === 'costing' && h.id === 'p1')).toBe(true);
  });

  it('groundingBlock cites [kind:id] tags and is deterministic', () => {
    const a = groundingBlock('steel sheet price', corpus, 4);
    const b = groundingBlock('steel sheet price', corpus, 4);
    expect(a).toBe(b);
    expect(a).toMatch(/\[material:mat-/);
    expect(a.startsWith('GROUNDING DATA')).toBe(true);
  });
});
