/**
 * A weighed board is the engineer's figure (EDU control board, Nov 2026). The PCB form had no weight field, so a
 * 552 g populated board shipped at the estimate area × layers × 28 g/dm² = 1.43 kg. A typed weight now carries
 * user evidence through the evidence gate and freight uses it; blank goes back to the estimate.
 */
import { describe, it, expect } from 'vitest';
import { boardSpecPatch, FAB_FIELDS } from '../src/ui/pcb/analysis-link.js';
import { gateBoardEvidence, weightKgFromSpec } from '../server/utils/pcb-boardspec-stabilise.js';
import { computePCBCountryCost, type PCBCostInput } from '../server/data/pcb-country-rates.js';

const doc = (vals: Record<string, string>) => ({ getElementById: (id: string) => (id in vals ? { value: vals[id], type: 'number' } : null) }) as unknown as Document;

describe('board weight typed on the PCB form', () => {
  it('is a mapped fab field', () => {
    expect(FAB_FIELDS.find(f => f.id === 'pcbf-board-weight')?.key).toBe('boardWeightG');
  });
  it('a typed weight carries user evidence; blank clears it', () => {
    expect(boardSpecPatch(['pcbf-board-weight'], doc({ 'pcbf-board-weight': '552' })).spec).toMatchObject({ boardWeightG: 552, weightEvidence: 'user' });
    const blank = boardSpecPatch(['pcbf-board-weight'], doc({ 'pcbf-board-weight': '' })).spec;
    expect(blank.boardWeightG).toBe(0);
    expect(blank.weightEvidence).toBeUndefined();
  });
  it('the evidence gate keeps a user weight and strikes a model weight no board text shows', () => {
    const user: Record<string, unknown> = { boardWeightG: 552, weightEvidence: 'user' };
    expect(gateBoardEvidence(user, [])).toEqual([]);
    expect(weightKgFromSpec(user)).toBeCloseTo(0.552, 9);
    const model: Record<string, unknown> = { boardWeightG: 552 };
    expect(gateBoardEvidence(model, []).length).toBe(1);
    expect(weightKgFromSpec(model)).toBeUndefined();
  });
  it('freight follows the weighed board (0.552 kg × £0.40/kg by sea), not the 1.43 kg estimate', () => {
    const edu: PCBCostInput = {
      widthMm: 395, heightMm: 215, layers: 6, surfaceFinish: 'enig', throughVias: 4500, blindVias: 0, microVias: 0,
      hdiStructure: 'none', impedanceControlled: true, smtPlacements: 2008, throughHoleJoints: 43, manualJoints: 0, bgaCount: 2,
      aoiRequired: true, ictTimeSec: 90, conformalCoatAreaCm2: 849.25, totalBOMCostGBP: 200, orderQuantity: 10_000,
    };
    const est = computePCBCountryCost(edu, 'cn').breakdown.logistics;
    const weighed = computePCBCountryCost({ ...edu, weightKg: 0.552 }, 'cn').breakdown.logistics;
    expect(est).toBeCloseTo(8.4925 * 6 * 0.028 * 0.40, 2);
    expect(weighed).toBeCloseTo(0.552 * 0.40, 2);   // the breakdown prints freight to the penny
  });
});
