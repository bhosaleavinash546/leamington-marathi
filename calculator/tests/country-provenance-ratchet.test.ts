/**
 * Provenance ratchet (round 30 Oct 2026): a country may not become LESS sourced. Over a fixed set of real parts, the
 * median part's share on sourced rates may not fall, and the share on held rates (machine capital, materials by factor,
 * overhead / packaging multipliers) may not rise, beyond 0.5 point. Re-record with `scripts/country-trace/ratchet.ts
 * --write` only with the cause in the commit message.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ratchetNow } from '../scripts/country-trace/ratchet.js';

describe('country provenance ratchet', () => {
  it('no country is less sourced than its recorded baseline', async () => {
    const base = JSON.parse(readFileSync('tests/fixtures/country-provenance-ratchet.json', 'utf8')) as Record<string, { medianSourcedPct: number; heldPct: number }>;
    const now = await ratchetNow();
    for (const [r, b] of Object.entries(base)) {
      expect(now[r].medianSourcedPct, `${r} median part on sourced rates`).toBeGreaterThanOrEqual(b.medianSourcedPct - 0.5);
      expect(now[r].heldPct, `${r} share on held rates`).toBeLessThanOrEqual(b.heldPct + 0.5);
    }
  }, 600_000);
});
