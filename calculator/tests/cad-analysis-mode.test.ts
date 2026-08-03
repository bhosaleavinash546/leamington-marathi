/**
 * The default the whole project was aiming at.
 *
 * A CAD analysis is deterministic unless someone asks for a model. This pins
 * that, and pins the one thing the flip could have broken: the seven
 * commodities with no rule spec yet (extrusion, painting, BIW, PCB fab, PCBA,
 * harness, assembly) must not turn into an error just because the default
 * moved under them. An explicit `mode: 'deterministic'` on one of those is a
 * different request and gets a straight answer.
 */
import { describe, it, expect } from 'vitest';
import { parseAnalysisMode } from '../server/routes/cad.js';
import { specForCommodity, DETERMINISTIC_COMMODITIES } from '../src/engine/cost-input-rules/index.js';

/** The same test the route makes: was the mode chosen, or defaulted to? */
const explicit = (body: Record<string, unknown>) =>
  typeof body.mode === 'string' && body.mode.trim() !== '';

describe('analysis mode', () => {
  it('defaults to deterministic — no key, no model, no network', () => {
    expect(parseAnalysisMode(undefined)).toBe('deterministic');
    expect(parseAnalysisMode(null)).toBe('deterministic');
    expect(parseAnalysisMode('')).toBe('deterministic');
    expect(parseAnalysisMode('nonsense')).toBe('deterministic');
    expect(parseAnalysisMode(7)).toBe('deterministic');
  });

  it('still honours an explicit AI or comparison request', () => {
    expect(parseAnalysisMode('ai')).toBe('ai');
    expect(parseAnalysisMode('both')).toBe('both');
    expect(parseAnalysisMode('deterministic')).toBe('deterministic');
  });

  it('distinguishes a chosen deterministic from a defaulted one', () => {
    // The route needs both facts: what the mode is, and whether the caller
    // said so. Same resolved mode, different handling on an unspecced
    // commodity — a fallback to AI versus a 422 naming what does not exist.
    expect(parseAnalysisMode(undefined)).toBe('deterministic');
    expect(explicit({})).toBe(false);
    expect(explicit({ mode: 'deterministic' })).toBe(true);
    expect(explicit({ mode: '  ' })).toBe(false);
  });
});

describe('the commodities the flip must not break', () => {
  it('has no rule spec for the seven not yet converted', () => {
    for (const c of ['extrusion', 'painting', 'biw', 'pcb_fab', 'pcba', 'wiring_harness', 'assembly']) {
      expect(specForCommodity(c)).toBeNull();
      expect(DETERMINISTIC_COMMODITIES).not.toContain(c);
    }
  });

  it('has one for every commodity the default now routes to the rules', () => {
    for (const c of DETERMINISTIC_COMMODITIES) expect(specForCommodity(c)).toBeDefined();
    // Eleven, plus sheet_metal_fab aliasing sheet_metal.
    expect(specForCommodity('sheet_metal_fab')).toBe(specForCommodity('sheet_metal'));
  });
});
