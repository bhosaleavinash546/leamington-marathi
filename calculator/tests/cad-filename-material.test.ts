import { describe, it, expect } from 'vitest';
import { familyFromFilename, familyFromDensity, proseFamily, promoteHighestConfidence } from '../src/engine/material-family.js';

/** The filename material prior that stops "Aluminium…" being costed as plastic. */
describe('familyFromFilename', () => {
  it('reads the material family named in a CAD filename', () => {
    expect(familyFromFilename('ed1e77f6-Aluminium_25T_Servo_Horn.step')).toBe('aluminium');
    expect(familyFromFilename('steel_stub_axle.stp')).toBe('steel');
    expect(familyFromFilename('42CrMo4_shaft.step')).toBe('steel');
    expect(familyFromFilename('PA6_GF_bracket.step')).toBe('plastic');
    expect(familyFromFilename('GJS500_housing.stp')).toBe('cast iron');
    expect(familyFromFilename('Ti-6Al-4V_lug.step')).toBe('titanium');
    expect(familyFromFilename('CuZn39_fitting.step')).toBe('copper alloy');
  });

  it('returns null when no material is named (no false positives)', () => {
    expect(familyFromFilename('PRCR002.stp')).toBeNull();
    expect(familyFromFilename('bracket_rev_b.step')).toBeNull();
    expect(familyFromFilename('')).toBeNull();
  });
});

describe('familyFromDensity', () => {
  it('classifies density into a family', () => {
    expect(familyFromDensity(1140)).toBe('plastic');
    expect(familyFromDensity(2680)).toBe('aluminium');
    expect(familyFromDensity(7150)).toBe('cast iron');
    expect(familyFromDensity(7850)).toBe('steel');
    expect(familyFromDensity(undefined)).toBe('other');
  });
});

describe('proseFamily', () => {
  it('adds the article only where it reads naturally', () => {
    expect(proseFamily('plastic')).toBe('a plastic');
    expect(proseFamily('copper alloy')).toBe('a copper alloy');
    expect(proseFamily('aluminium')).toBe('aluminium');
    expect(proseFamily('steel')).toBe('steel');
  });
});

describe('promoteHighestConfidence (confidence-inversion guard)', () => {
  it('promotes a higher-confidence alternative over the primary (the servo-horn case)', () => {
    const primary = { materialId: 'mat-pa6', name: 'Glass-filled Nylon (PA6-GF)', confidencePct: 55 };
    const alts = [{ materialId: 'mat-al6061', name: 'Aluminium 6061', confidencePct: 65 }];
    const r = promoteHighestConfidence(primary, alts);
    expect(r.promoted).toBe(true);
    expect(r.primary.name).toBe('Aluminium 6061');
    expect(r.primary.confidencePct).toBe(65);
    expect(r.alternatives[0].name).toBe('Glass-filled Nylon (PA6-GF)');  // demoted
    expect(r.primary.reasoning).toMatch(/higher-confidence/i);
  });

  it('leaves a correctly-ranked list unchanged', () => {
    const primary = { materialId: 'mat-al6061', name: 'Aluminium 6061', confidencePct: 80 };
    const alts = [{ materialId: 'mat-pa6', name: 'PA6', confidencePct: 40 }];
    const r = promoteHighestConfidence(primary, alts);
    expect(r.promoted).toBe(false);
    expect(r.primary.name).toBe('Aluminium 6061');
  });

  it('is a no-op with no alternatives', () => {
    const primary = { materialId: 'mat-al6061', name: 'Aluminium 6061', confidencePct: 55 };
    expect(promoteHighestConfidence(primary, []).promoted).toBe(false);
  });
});
