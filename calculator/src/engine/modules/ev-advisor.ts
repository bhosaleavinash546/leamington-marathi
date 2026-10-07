/**
 * EV propulsion checks (battery pack, e-motor): what the result says against the cited market benchmarks.
 * Advisory only — no cost path reads these. Every comparison names its source (ev-data.ts).
 */
import type { PartCostResult } from '../types.js';
import { activeRates } from '../rate-context.js';
import { BNEF_CELL_SHARE_OF_PACK, BNEF_PACK_INTEGRATION_USD_PER_KWH, type CellChemistry } from '../ev-data.js';
import type { BatteryPackFacts } from './battery-pack.js';
import type { EMotorFacts, MotorType } from './e-motor.js';

export interface EvCheck { label: string; value: string; benchmark: string; flag: 'ok' | 'check' }

const usdPerGbp = () => activeRates().fx?.find(f => f.id === 'fx-gbp-usd')?.rate ?? 1.324;
const pct = (n: number) => `${(n * 100).toFixed(1)} %`;

/** BNEF 2025: BEV cells 80 % of the pack; pack integration $20/kWh; LFP packs $81, NMC $128 (all-segment averages). */
export function batteryPackChecks(result: PartCostResult, facts: BatteryPackFacts, cellsCost: number, chemistry: CellChemistry): EvCheck[] {
  const fx = usdPerGbp();
  const packUsdKwh = result.total * fx / facts.packKwh;
  const share = cellsCost / result.total;
  const nonCellUsdKwh = (result.total - cellsCost) * fx / facts.packKwh;
  const packRef = chemistry === 'LFP' || chemistry === 'LMFP' ? 81 : 128;
  return [
    { label: 'Pack price', value: `$${packUsdKwh.toFixed(1)}/kWh`, benchmark: `BNEF 2025 ${chemistry === 'LFP' || chemistry === 'LMFP' ? 'LFP' : 'NMC'} pack average $${packRef}/kWh`,
      flag: Math.abs(packUsdKwh / packRef - 1) <= 0.25 ? 'ok' : 'check' },
    { label: 'Cell share of pack', value: pct(share), benchmark: `BNEF 2025 BEV average ${pct(BNEF_CELL_SHARE_OF_PACK)}`,
      flag: Math.abs(share - BNEF_CELL_SHARE_OF_PACK) <= 0.10 ? 'ok' : 'check' },
    { label: 'Everything but the cells', value: `$${nonCellUsdKwh.toFixed(1)}/kWh`,
      benchmark: `BNEF 2025 BEV pack − cell = $${BNEF_PACK_INTEGRATION_USD_PER_KWH}/kWh (integration; this figure also holds overhead, margin, packaging and freight)`,
      flag: nonCellUsdKwh <= BNEF_PACK_INTEGRATION_USD_PER_KWH * 2 ? 'ok' : 'check' },
  ];
}

/** Magnet mass against the 1–2 kg industry figure; rare-earth share of the motor; strip utilisation. */
export function eMotorChecks(result: PartCostResult, facts: EMotorFacts, motorType: MotorType): EvCheck[] {
  const out: EvCheck[] = [];
  if (motorType === 'pmsm') {
    out.push({ label: 'Magnet mass', value: `${facts.magnetKg.toFixed(2)} kg`, benchmark: '1–2 kg NdFeB per traction PMSM (industry benchmark)',
      flag: facts.magnetKg >= 0.8 && facts.magnetKg <= 3 ? 'ok' : 'check' });
    out.push({ label: 'Rare-earth exposure', value: pct(facts.magnetKg * facts.magnetGbpPerKg / result.total),
      benchmark: 'share of the motor price that moves with NdPr / Tb — a sourcing risk, not a benchmark', flag: 'ok' });
  }
  const net = facts.statorSteelKg + facts.rotorSteelKg;
  out.push({ label: 'Lamination strip utilisation', value: pct(net / facts.grossSteelKg),
    benchmark: 'square-pitch progressive die with the rotor nested in the stator bore: typically 45–60 % (engineering typical)',
    flag: net / facts.grossSteelKg >= 0.4 ? 'ok' : 'check' });
  return out;
}
