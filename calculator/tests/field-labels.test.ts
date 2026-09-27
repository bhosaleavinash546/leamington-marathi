import { describe, it, expect } from 'vitest';
import { fieldLabel } from '../src/ui/field-labels.js';

// The form printed engine paths to users: "rawMaterial.materialId: Material
// rate confidence: Medium". These pin the names it prints instead.
describe('validation fields read as plain English', () => {
  it.each([
    ['rawMaterial.materialId', 'Material'],
    ['tooling.amortizationVolume', 'Tooling amortisation volume'],
    ['marginPct', 'Margin %'],
    ['operations[0] (Turning).oee', 'Turning (operation 1) — OEE'],
    ['operations[2].partsPerCycle', 'Operation 3 — parts per cycle'],
    ['Turning.machineRatePerHr', 'Turning — machine rate'],
  ])('%s → %s', (field, label) => { expect(fieldLabel(field)).toBe(label); });

  it('passes an unknown path through rather than hiding it', () => {
    expect(fieldLabel('something.new')).toBe('something.new');
  });

  it('names every field the engine warns or errors on', async () => {
    // A new engine field with no name would reach users as a raw path again.
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = ['../src/engine', '../src/engine/modules'].map(d => join(__dirname, d))
      .flatMap(dir => readdirSync(dir).filter(f => f.endsWith('.ts')).map(f => readFileSync(join(dir, f), 'utf8'))).join('\n');
    const fixed = [...src.matchAll(/field: '([^']+)'/g)].map(m => m[1]);
    const unnamed = [...new Set(fixed)].filter(f => fieldLabel(f) === f);
    expect(unnamed).toEqual([]);
  });
});
