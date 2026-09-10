/**
 * Rubber, rotomoulding and thermoforming reach a price on the bulk path.
 *
 * All three had a working rules pack, a working engine module and a
 * cost-executor entry, and still refused: `toCostParams` had no case, so a part
 * answered every question and dead-ended at `no_cost_mapping`. Same shape as
 * the `cast_and_machine` gap. The browser was unaffected because it fills the
 * commodity's own form instead.
 *
 * The mapping for rubber also fixes a silent wrong answer rather than just an
 * absence — see the token test below.
 */
import { describe, it, expect } from 'vitest';
import { toCostParams, COSTABLE_COMMODITIES, SHOP_DEFAULTS } from '../src/engine/cost-input-rules/to-cost-params.js';
import { rubberProcFromSuggestion } from '../src/engine/modules/rubber-advisor.js';
import { executeCalculateCost } from '../server/services/cost-executor.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import type { CADAnalysisResult } from '../src/engine/ai-analysis.js';

const LIB = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const VOLUME = 50_000;

type CI = CADAnalysisResult['costInputSuggestions'];
const cost = (commodity: string, ci: CI, family = 'steel') => {
  const mapped = toCostParams(commodity, ci, VOLUME, family as never);
  if (!mapped) return null;
  return {
    mapped,
    result: executeCalculateCost({
      commodity, params: mapped.params as unknown as Record<string, unknown>, partName: 'T',
      rateLibrary: LIB,
      overheadPct: SHOP_DEFAULTS.overheadPct, marginPct: SHOP_DEFAULTS.marginPct,
      packagingPerPart: SHOP_DEFAULTS.packagingPerPart,
      logisticsPerPart: SHOP_DEFAULTS.logisticsPerPart,
    }),
  };
};

// What each rules pack produces for Seat_Locking_Bracket.stp, verbatim.
const RUBBER = {
  recommendedCommodity: 'rubber', netWeightKg: 0.0817, materialId: 'mat-epdm',
  rubber: { process: 'transfer', cycleTimeSec: 224, cavities: 1, flashWeightKg: 0.0025,
            mouldCostGBP: 26_394, mouldLife: 200_000 },
} as unknown as CI;

const ROTO = {
  recommendedCommodity: 'rotational_moulding', netWeightKg: 0.0682, materialId: 'mat-hdpe',
  rotationalMoulding: { heatTimeSec: 566, coolTimeSec: 764, numArms: 4, partsPerArm: 8,
                        mouldCostGBP: 22_361, mouldLife: 10_000 },
} as unknown as CI;

const THERMO = {
  recommendedCommodity: 'thermoforming', netWeightKg: 0, materialId: 'mat-hips',
  thermoforming: { method: 'vacuum', partWeightKg: 0.0739, sheetWeightKg: 0.1488,
                   heatTimeSec: 30, formTimeSec: 6, trimTimeSec: 12, toolCostGBP: 6_855 },
} as unknown as CI;

describe('all three are costable now', () => {
  it.each(['rubber', 'rotational_moulding', 'thermoforming'])('%s is on the list', c => {
    expect(COSTABLE_COMMODITIES).toContain(c);
  });

  it.each([
    ['rubber', RUBBER], ['rotational_moulding', ROTO], ['thermoforming', THERMO],
  ] as [string, CI][])('%s reaches a finite total in every bucket', (c, ci) => {
    const out = cost(c, ci);
    expect(out, `${c} did not map`).not.toBeNull();
    expect(out!.result.success, out!.result.error).toBe(true);
    expect(out!.result.total).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(out!.result.breakdown as Record<string, number>)) {
      expect(Number.isFinite(v), `${c}: ${k} is ${v}`).toBe(true);
    }
  });
});

describe('rubber: the process token was silently dropped', () => {
  // `costInputSuggestions.rubber.process` is the schema shared with the AI path
  // and is short ('transfer'); the module and the form are long
  // ('transfer_mould'). Nothing converted, so the browser's guard — correctly
  // refusing a value the select does not offer — never matched, and every
  // CAD-suggested rubber part silently fell back to compression moulding.
  it('maps every short token to the real process', () => {
    expect(rubberProcFromSuggestion('transfer')).toBe('transfer_mould');
    expect(rubberProcFromSuggestion('compression')).toBe('compression_mould');
    expect(rubberProcFromSuggestion('injection')).toBe('injection_mould_lsr');
    expect(rubberProcFromSuggestion('extrusion')).toBe('extrusion_vulcanise');
    expect(rubberProcFromSuggestion('die_cut')).toBe('die_cut');
  });

  it('accepts the long token too, since the rules emit that internally', () => {
    expect(rubberProcFromSuggestion('transfer_mould')).toBe('transfer_mould');
  });

  it('returns null for anything else rather than defaulting', () => {
    // A token nobody recognises is a contract change. Costing it as compression
    // moulding is the failure this replaced.
    for (const bad of ['', 'moulding', 'TRANSFER MOULD', undefined, null, 42]) {
      expect(rubberProcFromSuggestion(bad), String(bad)).toBeNull();
    }
  });

  it('carries the process through to the params, not the default', () => {
    const out = cost('rubber', RUBBER)!;
    const p = out.mapped.params as Record<string, unknown>;
    expect(p.process).toBe('transfer_mould');
    expect(p.machineId).toBe('transfer-mould-std');
  });

  it('refuses the part rather than costing an unknown process', () => {
    const bad = { ...RUBBER, rubber: { ...(RUBBER as never as { rubber: object }).rubber, process: 'sintering' } } as unknown as CI;
    expect(toCostParams('rubber', bad, VOLUME, 'steel')).toBeNull();
  });
});

describe('rotomoulding: the tool count is the story', () => {
  it('charges one mould per station, and says how many', () => {
    // `mouldCostGBP` prices ONE tool (roto-advisor's estimator is base +
    // area x rate), and roto needs one per station. 4 arms x 8 per arm = 32
    // tools at £22,361 over 50,000 parts = £14.31 — which dominates a 68 g
    // part. That is the model being consistent, not a fault, but a total of
    // £18.98 does not show it, so the mapping states it.
    const out = cost('rotational_moulding', ROTO)!;
    const p = out.mapped.params as Record<string, unknown>;
    expect(p.numArms).toBe(4);
    expect(p.partsPerArm).toBe(8);
    expect(out.mapped.assumed.join(' ')).toMatch(/32 moulds \(4 arms x 8 per arm\)/);

    const tooling = (out.result.breakdown as unknown as Record<string, number>).tooling;
    expect(tooling).toBeCloseTo(22_361 * 32 / VOLUME, 2);
  });

  it('picks the machine from the arm count rather than a default', () => {
    const one = { ...ROTO, rotationalMoulding: { ...(ROTO as never as { rotationalMoulding: object }).rotationalMoulding, numArms: 1, partsPerArm: 1 } } as unknown as CI;
    expect((cost('rotational_moulding', one)!.mapped.params as Record<string, unknown>).machineId)
      .toBe('rotomould-lab-1arm');
    expect((cost('rotational_moulding', ROTO)!.mapped.params as Record<string, unknown>).machineId)
      .toBe('rotomould-carousel-4arm');
  });
});

describe('thermoforming: parts per sheet is measured, not assumed', () => {
  it('divides the sheet weight by the part weight', () => {
    // 0.1488 kg of sheet yielding 0.0739 kg parts is two parts per sheet. Both
    // are measured by the rules, so this is arithmetic — and it matters,
    // because the sheet is the material bucket and a wrong yield doubles it.
    const out = cost('thermoforming', THERMO)!;
    const p = out.mapped.params as Record<string, unknown>;
    expect(p.partsPerSheet).toBe(2);
    expect(p.partWeightKg).toBe(0.0739);
    expect(out.mapped.assumed.join(' ')).toMatch(/partsPerSheet=2 \(sheet weight \/ part weight\)/);
  });

  it('falls back to the net weight when the pack states no part weight', () => {
    const noPart = { ...THERMO, netWeightKg: 0.05,
      thermoforming: { ...(THERMO as never as { thermoforming: object }).thermoforming, partWeightKg: 0 } } as unknown as CI;
    expect((cost('thermoforming', noPart)!.mapped.params as Record<string, unknown>).partWeightKg).toBe(0.05);
  });

  it('uses the pressure former when the method says so', () => {
    const press = { ...THERMO,
      thermoforming: { ...(THERMO as never as { thermoforming: object }).thermoforming, method: 'pressure' } } as unknown as CI;
    expect((cost('thermoforming', press)!.mapped.params as Record<string, unknown>).machineId)
      .toBe('thermoform-pressure');
  });
});
