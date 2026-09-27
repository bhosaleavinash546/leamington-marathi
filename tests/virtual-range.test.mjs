// src/lib/virtual-range.ts — the windowing arithmetic behind the marketplace list.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const src = readFileSync(new URL('../src/lib/virtual-range.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

describe('prefixOffsets / rowAt', () => {
  it('offsets are prefix sums and the last entry is the total', () => {
    assert.deepEqual(m.prefixOffsets([100, 200, 50]), [0, 100, 300, 350]);
    assert.deepEqual(m.prefixOffsets([]), [0]);
  });
  it('rowAt finds the row containing y, clamped at both ends', () => {
    const o = m.prefixOffsets([100, 200, 50]);
    assert.equal(m.rowAt(o, -5), 0);
    assert.equal(m.rowAt(o, 0), 0);
    assert.equal(m.rowAt(o, 99), 0);
    assert.equal(m.rowAt(o, 100), 1);
    assert.equal(m.rowAt(o, 299), 1);
    assert.equal(m.rowAt(o, 300), 2);
    assert.equal(m.rowAt(o, 10_000), 2);
  });
});

describe('computeRange', () => {
  const heights = Array.from({ length: 1600 }, (_, i) => 200 + (i % 5) * 40);   // 200..360 px, varied
  const offsets = m.prefixOffsets(heights);
  const total = offsets[offsets.length - 1];

  it('renders only the rows near the viewport, with spacers that add up to the total', () => {
    const r = m.computeRange(offsets, 50_000, 900, 600);
    assert.ok(r.end - r.start < 20, `rendered ${r.end - r.start} rows for a 900 px viewport`);
    assert.ok(offsets[r.start] <= 50_000 - 600 + 360, 'first rendered row starts before the overscan top');
    assert.ok(offsets[r.end] >= 50_000 + 900 + 600 - 1, 'last rendered row ends after the overscan bottom');
    assert.equal(r.offsetTop + (offsets[r.end] - offsets[r.start]) + r.offsetBottom, total, 'spacers + rows = total height');
    assert.equal(r.totalHeight, total);
  });
  it('at the top and at the bottom the range is clamped and still covers the viewport', () => {
    const top = m.computeRange(offsets, 0, 900, 600);
    assert.equal(top.start, 0); assert.equal(top.offsetTop, 0);
    assert.ok(offsets[top.end] >= 1500);
    const bottom = m.computeRange(offsets, total - 900, 900, 600);
    assert.equal(bottom.end, 1600); assert.equal(bottom.offsetBottom, 0);
    assert.ok(offsets[bottom.start] <= total - 900 - 600 + 360);
  });
  it('scrolled far past the end still renders the last row rather than nothing', () => {
    const r = m.computeRange(offsets, total + 5000, 900, 600);
    assert.equal(r.end, 1600); assert.ok(r.end > r.start);
  });
  it('an empty list is an empty range', () => {
    assert.deepEqual(m.computeRange([0], 100, 900), { start: 0, end: 0, offsetTop: 0, offsetBottom: 0, totalHeight: 0 });
  });
  it('a taller measured row shifts everything below it — the scrollbar stays honest', () => {
    const h2 = [...heights]; h2[10] += 500;
    const o2 = m.prefixOffsets(h2);
    assert.equal(o2[o2.length - 1], total + 500);
    assert.equal(m.computeRange(o2, 0, 900).totalHeight, total + 500);
  });
});
