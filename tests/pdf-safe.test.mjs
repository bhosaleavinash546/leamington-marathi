// WinAnsi sanitizer for PDF exports — reproduces the exact strings that
// rendered as mangled, letter-spaced garbage in the EDU report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfSafe, deepPdfSafe } from '../src/services/pdf-safe.mjs';

test('the report-breaking strings become clean, meaning-preserved ASCII', () => {
  assert.equal(pdfSafe('0.5-1.5 efficiency pts → pack saving'), '0.5-1.5 efficiency pts -> pack saving');
  assert.equal(pdfSafe('insulation ↓20-30%, +fill'), 'insulation -20-30%, +fill');
  assert.equal(pdfSafe('resin ↓30-50%, energy/cycle ↓20-40%'), 'resin -30-50%, energy/cycle -20-40%');
  assert.equal(pdfSafe('slot fill 42%→62%, copper ↓18%'), 'slot fill 42%->62%, copper -18%');
  assert.equal(pdfSafe('conductor cost ↓15-30% where applied'), 'conductor cost -15-30% where applied');
});

test('cp1252-representable characters pass through untouched', () => {
  const ok = '£1.1M–£1.5M · 80,000 units/yr — “quote-ready” … 15% • I²R × ° € ± ½';
  assert.equal(pdfSafe(ok), ok);
});

test('exotic characters map sensibly or drop — never garble', () => {
  assert.equal(pdfSafe('ΔT ≈ 5K, ≤3 μm, ✓ verified'), 'deltaT ~ 5K, <=3 um,  verified');
  assert.equal(pdfSafe('温度'), '');   // unmapped non-Latin drops rather than corrupting the PDF
  assert.equal(pdfSafe(null), '');
  assert.equal(pdfSafe(42), '42');
});

test('deepPdfSafe sanitizes nested report data, preserving structure and non-strings', () => {
  const idea = {
    title: 'Thin-gauge NO20 cuts iron loss',
    costSavingPotential: { percentage: '0.5-1.5 efficiency pts → pack saving', paybackMonths: 14 },
    costSavingTypes: ['weight', 'material'],
    engineCheck: null,
    tags: ['fill ↑', 'loss ↓'],
  };
  const out = deepPdfSafe(idea);
  assert.equal(out.costSavingPotential.percentage, '0.5-1.5 efficiency pts -> pack saving');
  assert.equal(out.costSavingPotential.paybackMonths, 14);
  assert.deepEqual(out.tags, ['fill +', 'loss -']);
  assert.equal(out.engineCheck, null);
  assert.equal(idea.costSavingPotential.percentage.includes('→'), true, 'original object not mutated');
});
