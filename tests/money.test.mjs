// src/lib/money.ts — the client half of "engines compute in EUR, conversion
// at the display boundary". Transpiled from TS like storage.test.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const src = readFileSync(new URL('../src/lib/money.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const live = { base: 'EUR', rates: { EUR: 1, GBP: 0.85, USD: 1.08, CNY: 7.85 }, symbols: { EUR: '€', GBP: '£', USD: '$', CNY: '¥' }, live: true, date: '2026-09-26', stale: false, source: 'ECB (frankfurter.app)' };
const fallback = { ...live, live: false, date: '2026-09-01', stale: true, source: 'static reference' };

describe('convertEur', () => {
  it('converts at the snapshot rate and names rate, source and date', () => {
    const c = m.convertEur(100, 'GBP', live);
    assert.equal(c.converted, true);
    assert.equal(c.value, 85);
    assert.equal(c.symbol, '£');
    assert.match(c.note, /Converted from €100\.00 at 1 EUR = 0\.85 GBP · ECB \(frankfurter\.app\), 2026-09-26\./);
  });
  it('EUR is the engine currency: never converted, never a misleading note', () => {
    const c = m.convertEur(12.5, 'EUR', live);
    assert.equal(c.converted, false); assert.equal(c.value, 12.5); assert.equal(c.symbol, '€');
    assert.equal(c.note, 'Engine figures in EUR.');
  });
  it('with no snapshot the figure stays in EUR and SAYS it was not converted', () => {
    const c = m.convertEur(100, 'GBP', null);
    assert.equal(c.converted, false); assert.equal(c.value, 100); assert.equal(c.symbol, '€');
    assert.match(c.note, /Live rates unreachable/); assert.match(c.note, /not converted to GBP/);
  });
  it('a stale fallback snapshot converts but flags it', () => {
    const c = m.convertEur(100, 'GBP', fallback);
    assert.equal(c.converted, true);
    assert.match(c.note, /static reference, 2026-09-01 · rates may be outdated/);
  });
  it('an unknown currency is not guessed at', () => {
    const c = m.convertEur(100, 'XXX', live);
    assert.equal(c.converted, false); assert.equal(c.symbol, '€');
  });
  it('absent stays absent — never £0', () => {
    for (const v of [null, undefined, NaN, 'x']) assert.equal(Number.isNaN(m.convertEur(v, 'GBP', live).value), true);
  });
});

describe('fmtMoney / fxNote', () => {
  it('formats with symbol, decimals, suffix and compact', () => {
    assert.equal(m.fmtMoney(432, 'GBP', live), '£367.20');
    assert.equal(m.fmtMoney(432000, 'GBP', live, { compact: true, suffix: '/yr' }), '£367K/yr');
    assert.equal(m.fmtMoney(1_270_000, 'GBP', live, { compact: true }), '£1.08M');
    assert.equal(m.fmtMoney(null, 'GBP', live), '—');
    assert.equal(m.fmtMoney(9.5, 'GBP', null), '€9.50');
  });
  it('the page note reads the way a director would quote it', () => {
    assert.equal(m.fxNote('EUR', live), 'Engine figures in EUR.');
    assert.equal(m.fxNote('GBP', live), 'Converted from EUR at 1 EUR = 0.85 GBP · ECB (frankfurter.app), 2026-09-26.');
    assert.match(m.fxNote('GBP', null), /not converted to GBP/);
    assert.match(m.fxNote('CNY', fallback), /1 EUR = 7\.85 CNY · static reference, 2026-09-01 · rates may be outdated/);
  });
});
