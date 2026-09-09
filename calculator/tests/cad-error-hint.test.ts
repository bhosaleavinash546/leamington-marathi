/**
 * The advice under a CAD analysis error has to fit the error.
 *
 * One line used to serve every failure: "Ensure the API server is running and
 * ANTHROPIC_API_KEY is configured." Right for a missing key, wrong for anything
 * else — and on the JLR build, which runs with AI switched off entirely, a
 * process that simply has no rule pack yet reads as "this tool needs AI". That
 * is the wrong sentence to have on screen in front of the person being shown
 * that it does not.
 */
import { describe, it, expect } from 'vitest';
import { analysisErrorHint } from '../src/ui/cad-error-hint.js';

describe('the hint matches the failure', () => {
  it('does not mention an API key when a process has no rules', () => {
    // The exact message the server returns — verified live: POST
    // /api/cad/analyze with commodity=painting answers 422 with this.
    const msg = "No deterministic rules exist for 'painting' yet. Converted so far: "
      + 'casting, cast_and_machine, sheet_metal, sheet_metal_fab, injection_moulding, '
      + 'blow_moulding, machining, forging, thermoforming, rotational_moulding, '
      + 'rubber, composites, gear.';
    const hint = analysisErrorHint(msg);
    expect(hint).not.toMatch(/ANTHROPIC|API key/i);
    expect(hint).toMatch(/no rule pack yet/i);
    // It must leave the engineer somewhere to go, not just say no.
    expect(hint).toMatch(/its own form/i);
  });

  it('points at the key — and at the mode that needs none — when the key is missing', () => {
    const hint = analysisErrorHint('ANTHROPIC_API_KEY not configured. Set it in .env, …');
    expect(hint).toMatch(/Rules only/);
  });

  it('says what to do about a timeout', () => {
    expect(analysisErrorHint('Geometry analysis timed out')).toMatch(/simplify|Try again/i);
  });

  it('falls back to the server check for anything unrecognised', () => {
    expect(analysisErrorHint('socket hang up')).toMatch(/npm run server/);
  });
});
