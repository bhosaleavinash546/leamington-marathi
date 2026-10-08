/** The CAD analysis wait states time, not an invented percentage (long-task-progress.ts). */
import { describe, it, expect } from 'vitest';
import { fmtDuration, fmtAllowance } from '../src/ui/long-task-progress.js';
import { geometryTimeoutMs } from '../src/engine/geometry-timeout.js';

describe('long-task progress text', () => {
  it('elapsed reads m:ss', () => {
    expect(fmtDuration(0)).toBe('0:00');
    expect(fmtDuration(42_400)).toBe('0:42');
    expect(fmtDuration(192_000)).toBe('3:12');
  });
  it('the allowance is the server\'s own kernel timeout for that file size', () => {
    expect(fmtAllowance(120_000)).toBe('2 min');
    expect(fmtAllowance(geometryTimeoutMs(31e6))).toMatch(/^\d+ min( \d+ s)?$/);
    expect(fmtAllowance(45_000)).toBe('45 s');
  });
});
