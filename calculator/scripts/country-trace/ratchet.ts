/**
 * The provenance ratchet's baseline: per country, the median part's share on sourced rates and the shares still held,
 * over a fixed set of real parts (one a commodity). tests/country-provenance-ratchet.test.ts fails when a change makes
 * a country LESS sourced than this. Re-record only when the cause is stated in the commit:
 *   npx tsx scripts/country-trace/ratchet.ts --write
 */
import { writeFileSync } from 'node:fs';
import { provenanceFor } from './provenance-lib.js';
import type { ManufacturingRegion } from '../../src/engine/regional-rates.js';

export const RATCHET_PARTS = ['FORGE_Hub_Flange.stp', 'PRCR002.stp', 'IM_ECU_Cover.stp', 'Seat_Locking_Bracket.stp', 'AL_Battery_Rail.stp',
  'BM_Air_Duct.stp', 'ROTO_Header_Tank.stp', 'TF_Trim_Cover.stp', 'COMP_Hat_Stiffener.stp', 'EXT_Vent_Pipe.stp', 'RUB_Grommet.stp',
  'test-gear-m3-z38.step', 'MACH_Hydraulic_Manifold.stp', 'Casting_Braket.stp', 'steering_knuckle_RH.stp'];
export const RATCHET_REGIONS: ManufacturingRegion[] = ['CN', 'IN', 'PL', 'HU'];

export async function ratchetNow(): Promise<Record<string, { medianSourcedPct: number; heldPct: number }>> {
  const out: Record<string, { medianSourcedPct: number; heldPct: number }> = {};
  for (const r of RATCHET_REGIONS) {
    const x = await provenanceFor(r, RATCHET_PARTS);
    out[r] = { medianSourcedPct: x.medianPartSourcedPct, heldPct: Math.round((x.sharePct.heldCap + x.sharePct.matFactor + x.sharePct.heldMult) * 10) / 10 };
  }
  return out;
}

if (process.argv.includes('--write')) {
  const now = await ratchetNow();
  writeFileSync('tests/fixtures/country-provenance-ratchet.json', JSON.stringify(now, null, 1) + '\n');
  console.log(JSON.stringify(now));
}
