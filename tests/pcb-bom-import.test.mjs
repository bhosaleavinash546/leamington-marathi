// BOM import sanitization + value-priority pricing selection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImportedBom, selectPricingLines } from '../routes/pcb.mjs';

test('normalizeImportedBom: clamps, enum fallback, verbatim MPN, qty defaults', () => {
  const out = normalizeImportedBom([
    { refDes: 'U1', mpn: 'STM32F103C8T6', description: 'MCU', qty: 1, type: 'mcu', package: 'LQFP48', mount: 'SMT', pins: 48 },
    { refDes: 'X9', mpn: '  ', description: 'weird part', qty: 0, type: 'flux_capacitor', mount: 'sideways', pins: -3 },
    { mpn: 'GRM188R71C104KA01D', qty: 2.7, type: 'capacitor_mlcc' },
    { refDes: '', mpn: '', description: '', qty: 5, type: 'resistor' },   // empty identity → dropped
  ]);
  assert.equal(out.length, 3, 'line with no refDes/mpn/description is dropped');
  assert.equal(out[0].mpn, 'STM32F103C8T6', 'MPN passes through verbatim');
  assert.equal(out[1].type, 'other', 'unknown type falls back to other');
  assert.equal(out[1].mount, 'SMT', 'bad mount defaults to SMT');
  assert.equal(out[1].qty, 1, 'qty floor is 1');
  assert.ok(out[1].pins >= 1);
  assert.equal(out[2].qty, 3, 'fractional qty rounds');
});

test('normalizeImportedBom caps at 300 lines', () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ refDes: `R${i}`, qty: 1, type: 'resistor' }));
  assert.equal(normalizeImportedBom(many).length, 300);
});

test('selectPricingLines prioritises cost-dominant lines within the cap', () => {
  const lines = [
    { index: 0, query: 'GRM188 resistor', qty: 100, type: 'resistor' },            // 100 × ~£0.003
    { index: 1, query: 'i.MX8M SoC', qty: 1, type: 'soc' },                        // 1 × ~£12.75 — top value
    { index: 2, query: 'STM32F103', qty: 2, type: 'mcu' },                         // 2 × ~£2.1
    { index: 3, query: 'xx', qty: 999, type: 'soc' },                              // query too short → excluded
    { index: 4, query: 'priced already', qty: 1, type: 'other', unitCostOverride: 50 }, // override dominates
  ];
  const { selected, skipped } = selectPricingLines(lines, 2);
  assert.equal(skipped, 2, 'four candidates, cap 2 → 2 skipped');
  assert.deepEqual(selected.map(s => s.index), [4, 1], 'override £50 first, then the SoC');
});

test('selectPricingLines cap and empty behaviour', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ index: i, query: `PART-${i}`, qty: 1, type: 'resistor' }));
  const { selected, skipped } = selectPricingLines(many, 40);
  assert.equal(selected.length, 40);
  assert.equal(skipped, 20);
  assert.deepEqual(selectPricingLines([], 40), { selected: [], skipped: 0 });
});
