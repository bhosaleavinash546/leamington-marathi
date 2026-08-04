/**
 * The hop from a CAD analysis to a £/part, and the three defects it exposed.
 *
 * Nothing had ever costed a deterministic analysis outside a browser, so
 * nothing had ever discovered that it could not be done. The first real run
 * failed three times in a row, each failure invisible until a number was
 * actually demanded:
 *
 *   1. `Material '' not found` — the metal rules decide a material and
 *      `RULE_PATH_MAP` had no entry for it, so `costInputSuggestions.materialId`
 *      came back empty on every metal part. Plastics worked, which is why it
 *      had never been noticed.
 *   2. A family is not a grade. The rules resolve `aluminium`; the engine
 *      prices `mat-al6082-bar`. Nothing bridged them.
 *   3. `£NaN` through five of the eight buckets, because `partsPerCycle` is
 *      required by the machining module, is not on the analysis contract, and
 *      divides.
 *
 * Each of those is a test below. The NaN one matters most: it did not throw,
 * it produced a total, and the total was `NaN`.
 */
import { describe, it, expect } from 'vitest';
import { toCostParams, SHOP_DEFAULTS } from '../src/engine/cost-input-rules/to-cost-params.js';
import { representativeMaterialId, isLibraryMaterialId } from '../src/engine/cost-input-rules/derive/material.js';
import { executeCalculateCost } from '../server/services/cost-executor.js';
import { RULE_PATH_MAP } from '../src/engine/cost-input-rules/apply.js';
import type { CADAnalysisResult } from '../src/engine/ai-analysis.js';

type CI = CADAnalysisResult['costInputSuggestions'];

const machiningCI = (over: Partial<CI> = {}): CI => ({
  recommendedCommodity: 'machining',
  netWeightKg: 0.173,
  materialId: 'aluminium',        // a FAMILY — what the rules actually emit
  estimatedCycleTimeHr: 0.2693,
  estimatedSetupTimeHr: 0.5,
  estimatedOperations: [],
  ...over,
} as CI);

describe('costInputSuggestions → £/part', () => {
  describe('the material the rules decided reaches the cost', () => {
    it('maps machining and forging materialId, which nothing did before', () => {
      // Without these two entries the value is computed, discarded, and the
      // engine is handed an empty string.
      expect(RULE_PATH_MAP['machining.materialId']).toEqual({ to: 'materialId' });
      expect(RULE_PATH_MAP['forging.materialId']).toEqual({ to: 'materialId' });
    });

    it('turns a family into a grade the library actually prices', () => {
      const id = representativeMaterialId('machining', 'aluminium');
      expect(id).toBe('mat-al6082-bar');
      expect(isLibraryMaterialId(id!)).toBe(true);
    });

    it('picks the grade for the process, not just the family', () => {
      // Sheet steel and forged steel are both "steel" and are not the same
      // price — DC04 coil against 1045 bar.
      expect(representativeMaterialId('sheet_metal', 'steel')).toBe('mat-dc04');
      expect(representativeMaterialId('forging', 'steel')).toBe('mat-steel1045');
      expect(representativeMaterialId('casting', 'aluminium')).toBe('mat-adc12');
    });

    it('refuses a family the process cannot make', () => {
      expect(representativeMaterialId('forging', 'plastic')).toBeNull();
      expect(toCostParams('forging', machiningCI({ materialId: 'plastic' }))).toBeNull();
    });

    it('passes a real library id straight through, so the AI arm is untouched', () => {
      const r = toCostParams('machining', machiningCI({ materialId: 'mat-ti6al4v' }));
      expect(r!.params.materialId).toBe('mat-ti6al4v');
      // ...and does not claim to have assumed anything about it.
      expect(r!.assumed.join(' ')).not.toContain('representative grade');
    });

    it('reports the grade as an assumption when it resolved one', () => {
      const r = toCostParams('machining', machiningCI());
      expect(r!.params.materialId).toBe('mat-al6082-bar');
      expect(r!.assumed.join(' ')).toContain('representative grade');
    });
  });

  describe('the NaN', () => {
    it('costs a machined part to a real number in every bucket', () => {
      const mapped = toCostParams('machining', machiningCI(), 100_000);
      const cost = executeCalculateCost({
        commodity: 'machining', params: mapped!.params, partName: 'flange',
        overheadPct: SHOP_DEFAULTS.overheadPct, marginPct: SHOP_DEFAULTS.marginPct,
        packagingPerPart: SHOP_DEFAULTS.packagingPerPart,
        logisticsPerPart: SHOP_DEFAULTS.logisticsPerPart,
      });
      expect(cost.success).toBe(true);
      for (const [bucket, v] of Object.entries(cost.breakdown)) {
        expect(Number.isFinite(v), `${bucket} is not a finite number`).toBe(true);
      }
      expect(Number.isFinite(cost.total)).toBe(true);
      expect(cost.total).toBeGreaterThan(0);
    });

    it('supplies the two fields the module needs and the contract lacks', () => {
      const r = toCostParams('machining', machiningCI());
      const ops = r!.params.operations as Array<Record<string, unknown>>;
      // partsPerCycle divides. Zero or undefined is how the NaN got in.
      expect(ops[0].partsPerCycle).toBe(1);
      expect(ops[0].labourTimeHr).toBe(0.2693);
      expect(r!.assumed).toContain('partsPerCycle=1');
    });
  });

  describe('fairness of the comparison', () => {
    it('gives both arms the same shop', () => {
      // A cost difference between the arms must be a difference in what they
      // decided, never in the shop they were costed against.
      const rules = toCostParams('machining', machiningCI());
      const ai = toCostParams('machining', machiningCI({ materialId: 'mat-al6082-bar' }));
      for (const k of ['rejectRate', 'amortizationVolume'] as const) {
        expect(rules!.params[k]).toEqual(ai!.params[k]);
      }
      const rOps = rules!.params.operations as Array<Record<string, unknown>>;
      const aOps = ai!.params.operations as Array<Record<string, unknown>>;
      expect(rOps[0].oee).toEqual(aOps[0].oee);
      expect(rOps[0].labourEfficiency).toEqual(aOps[0].labourEfficiency);
    });

    it('returns null rather than a plausible wrong number', () => {
      // An unmapped commodity must not silently cost as something else.
      expect(toCostParams('extrusion', machiningCI())).toBeNull();
      // ...and a commodity whose sub-object is missing cannot be costed either.
      expect(toCostParams('casting', machiningCI({ casting: undefined }))).toBeNull();
    });
  });
});
