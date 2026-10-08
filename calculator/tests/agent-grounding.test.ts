/**
 * The costing agent costs only numbers the user gave (AI-path audit, Oct 2026). The model wrote `params` freely and
 * every number in it became a "should-cost".
 */
import { describe, it, expect } from 'vitest';
import { numbersIn, isGrounded, groundToolInput } from '../server/utils/agent-grounding.js';
import { groundedCostCall } from '../server/routes/agent.js';

describe('agent grounding', () => {
  it('reads the numbers a user writes, including 200k and 1,200', () => {
    expect(numbersIn(['200k parts a year, 1,200 kg, 0.85 OEE, 12%'])).toEqual([200000, 1200, 0.85, 12]);
  });
  it('accepts a user number in another unit (45 s as hours, 12 % as a fraction, 2.5 kg as grams)', () => {
    const g = numbersIn(['cycle 45 s, margin 12 %, weight 2.5 kg']);
    expect(isGrounded(45 / 3600, g)).toBe(true);
    expect(isGrounded(0.12, g)).toBe(true);
    expect(isGrounded(2500, g)).toBe(true);
    expect(isGrounded(37, g)).toBe(false);
  });
  it('a call with a number the user never gave is refused, naming it', () => {
    const r = groundedCostCall({ commodity: 'machining', params: { netWeightKg: 2.5, cycleTimeHr: 0.4 } } as never,
      'UK', ['A 2.5 kg aluminium bracket']);
    expect(r.success).toBe(false);
    expect(String(r.error)).toMatch(/params\.cycleTimeHr = 0\.4/);
  });
  it('overhead / margin the user did not state fall back to the country default', () => {
    const g = groundToolInput({ params: {}, overheadPct: 0.3, marginPct: 0.08 }, ['margin 8 %']);
    expect(g.defaulted).toEqual(['overheadPct']);
    expect((g.input as Record<string, unknown>).marginPct).toBe(0.08);
  });
});
