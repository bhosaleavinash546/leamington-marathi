/**
 * A plant can keep its own asset ids.
 *
 * The costing formulas name machines and labour by id — the smallest press that
 * covers the tonnage is `press-630t`, the machinist is `lab-uk-skilled`. Those
 * ids are SLOTS chosen by capability, not names of anyone's assets. Renaming
 * them breaks every costing, loudly and immediately:
 *
 *   Invalid cost inputs for "machining": operations[0].machineId:
 *   Machine 'mach-haas-vf2' not found in rate library
 *
 * which is the right failure but leaves a plant with no way to use its own
 * asset register. An alias closes that: JLR upload their machines under their
 * own ids and map slot -> asset. The formulas go on choosing slots; the slot
 * resolves to their economics; the report names their machine.
 *
 * Verified end to end against the running server before these were written —
 * upload accepted 179 machines, 43 labour grades and 2 aliases, and the same
 * bracket moved from £33.19 to £44.42 with material unchanged.
 */
import { describe, it, expect } from 'vitest';
import { applyAliases, resolveActiveLibrary } from '../src/engine/rate-library-merge.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import type { RateLibrary, RateAlias } from '../src/engine/types.js';

const BASE = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

/** JLR's own asset, under JLR's id, alongside everything already there. */
function withJlrAssets(aliases: RateAlias[]): RateLibrary {
  const vf2 = BASE.machines.find(m => m.id === 'mach-haas-vf2')!;
  const skilled = BASE.labour.find(l => l.id === 'lab-uk-skilled')!;
  return {
    ...BASE,
    machines: [...BASE.machines, {
      ...vf2, id: 'JLR-SOL-VMC-014', machineClass: 'Solihull VMC bay 14',
      sourceNote: 'Solihull asset register 2026-Q2',
      buildup: { ...vf2.buildup, annualDepreciation: 88_000, annualAvailableHours: 3_600 },
    }],
    labour: [...BASE.labour, {
      ...skilled, id: 'JLR-GRADE-MACH-B', skillLevel: 'JLR machinist grade B',
      fullyLoadedRatePerHr: 44.5, sourceNote: 'JLR HR banding 2026-Q2',
    }],
    aliases,
  };
}

describe('the slot resolves to the plant’s own asset', () => {
  const { library, errors } = applyAliases(withJlrAssets([
    { kind: 'machine', slot: 'mach-haas-vf2', useId: 'JLR-SOL-VMC-014' },
    { kind: 'labour', slot: 'lab-uk-skilled', useId: 'JLR-GRADE-MACH-B' },
  ]));

  it('accepts both mappings', () => {
    expect(errors).toEqual([]);
  });

  it('gives the slot the plant’s economics', () => {
    const slot = library.machines.find(m => m.id === 'mach-haas-vf2')!;
    const asset = library.machines.find(m => m.id === 'JLR-SOL-VMC-014')!;
    expect(slot.buildup.annualDepreciation).toBe(88_000);
    expect(slot.buildup.annualAvailableHours).toBe(3_600);
    // Same economics on both rows — the slot IS the asset now.
    expect(slot.computedRatePerHr).toBe(asset.computedRatePerHr);
    expect(library.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr).toBe(44.5);
  });

  it('names the plant’s machine and says which asset stood in', () => {
    // A report that still said "Haas VF-2" would be describing our library, not
    // their shop floor — and someone reading it later needs to see the swap.
    const slot = library.machines.find(m => m.id === 'mach-haas-vf2')!;
    expect(slot.machineClass).toBe('Solihull VMC bay 14');
    expect(slot.sourceNote).toContain('JLR-SOL-VMC-014');
    expect(slot.sourceNote).toContain('used for mach-haas-vf2');
  });

  it('leaves the engine to find the slot exactly as before', () => {
    // The whole point of materialising the alias: no lookup anywhere has to
    // learn about aliases, so none can be missed.
    expect(library.machines.some(m => m.id === 'mach-haas-vf2')).toBe(true);
    expect(library.labour.some(l => l.id === 'lab-uk-skilled')).toBe(true);
  });

  it('touches nothing it was not asked to', () => {
    const before = BASE.machines.find(m => m.id === 'mach-vmc3')!;
    const after = library.machines.find(m => m.id === 'mach-vmc3')!;
    expect(after.computedRatePerHr).toBe(before.computedRatePerHr);
    expect(library.materials).toBe(BASE.materials);
  });
});

describe('a mapping that cannot be honoured is refused, not guessed', () => {
  it('reports a target that is not in the sheet and leaves the slot alone', () => {
    // The bad outcome is costing on our machine while the plant believes it
    // replaced it. Dropping the alias and saying so is the whole point.
    const { library, errors } = applyAliases(withJlrAssets([
      { kind: 'machine', slot: 'mach-vmc5', useId: 'JLR-SOL-VMC-099' },
    ]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('JLR-SOL-VMC-099');
    expect(library.machines.find(m => m.id === 'mach-vmc5')!.computedRatePerHr)
      .toBe(BASE.machines.find(m => m.id === 'mach-vmc5')!.computedRatePerHr);
  });

  it('reports a kind it does not understand', () => {
    const { errors } = applyAliases(withJlrAssets([
      { kind: 'lathe' as RateAlias['kind'], slot: 'mach-lathe-cnc', useId: 'JLR-SOL-VMC-014' },
    ]));
    expect(errors[0]).toMatch(/machine' or 'labour/);
  });

  it('ignores a mapping of a slot to itself rather than calling it an error', () => {
    const { errors } = applyAliases(withJlrAssets([
      { kind: 'machine', slot: 'mach-haas-vf2', useId: 'mach-haas-vf2' },
    ]));
    expect(errors).toEqual([]);
  });
});

describe('a library with no aliases is untouched', () => {
  it('returns the same object, not a copy', () => {
    // Most plants will never fill the sheet in. They should pay nothing for it.
    const { library, errors } = applyAliases(BASE);
    expect(library).toBe(BASE);
    expect(errors).toEqual([]);
  });
});

describe('aliases are applied before cell overrides', () => {
  it('lets an override edit a slot the alias created', () => {
    // Order matters: an override edits a cell on a row, so the row a slot
    // points at has to exist first.
    const { library } = resolveActiveLibrary({
      builtIn: BASE,
      company: withJlrAssets([{ kind: 'labour', slot: 'lab-uk-skilled', useId: 'JLR-GRADE-MACH-B' }]),
      source: 'company',
      overrides: [{ table: 'labour', id: 'lab-uk-skilled', field: 'fullyLoadedRatePerHr', value: 47.25 }],
    });
    expect(library.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr).toBe(47.25);
  });
});
