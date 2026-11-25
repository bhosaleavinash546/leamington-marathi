/**
 * A MEASURED / typed board size is kept exactly, also above the 600 cm² that bounds an estimate (EDU control board,
 * 25 Nov 2026): the engineer typed 395 × 215 mm (849 cm²) for a Dana TM4 inverter control board and the costing used
 * 332 × 181 mm — the measured size had been treated as an estimate and shrunk to 600 cm², ~30 % of the bare board
 * and the coating area missing. An ESTIMATED size is still bounded as before.
 */
import { describe, it, expect } from 'vitest';
import { stabiliseBoardSpec } from '../server/utils/pcb-boardspec-stabilise.js';
import { runStage4 } from '../server/routes/pcb.js';

const asm = { smtPlacements: 2054, bgaCount: 2, reflowSides: 2 };

describe('measured board size above 600 cm²', () => {
  it('a typed 395 × 215 mm size is kept exactly', () => {
    const s: Record<string, unknown> = { widthMm: 395, heightMm: 215, dimensionsSource: 'measured', dimensionsEvidence: 'user', estimatedLayers: 6 };
    stabiliseBoardSpec(s, asm, 'automotive_adas');
    expect([s.widthMm, s.heightMm]).toEqual([395, 215]);
  });
  it('an ESTIMATED 395 × 215 mm is still bounded to 600 cm²', () => {
    const s: Record<string, unknown> = { widthMm: 395, heightMm: 215, dimensionsSource: 'estimated', estimatedLayers: 6 };
    stabiliseBoardSpec(s, asm, 'automotive_adas');
    expect(Number(s.widthMm) * Number(s.heightMm) / 100).toBeLessThanOrEqual(605);
  });
  it('a measured size beyond a production panel is not taken as measured', () => {
    const s: Record<string, unknown> = { widthMm: 900, heightMm: 700, dimensionsSource: 'measured', dimensionsEvidence: 'user', estimatedLayers: 4 };
    stabiliseBoardSpec(s, asm, 'general');
    expect(Number(s.widthMm) * Number(s.heightMm) / 100).toBeLessThanOrEqual(605);
  });
  it('Stage 4 costs the typed size: the bare board follows the area', async () => {
    const run = async (w: number, h: number) => {
      const a: Record<string, unknown> = {
        boardSpec: { widthMm: w, heightMm: h, dimensionsSource: 'measured', dimensionsEvidence: 'user', estimatedLayers: 6, throughVias: 100, surfaceFinish: 'hasl_lf' },
        assembly: { smtPlacements: 400, reflowSides: 2 },
        bom: [{ refDes: 'R1-R400', componentType: 'passive_0402', description: 'Chip resistor 0402', pkg: '0402', qty: 400 }],
      };
      const s4 = await runStage4({ analysis: a, domain: 'general', asilLevel: 'QM' as never,
        ocrResult: { icMarkings: [], refDesGroups: [], connectors: [], boardText: [], extractionQuality: 'medium' } as never, country: 'cn', orderQty: 10000, tag: '/test' });
      return { spec: a.boardSpec as Record<string, unknown>, fab: s4.selectedCountryBreakdown!.pcbFabPerBoard };
    };
    const big = await run(395, 215);
    expect([big.spec.widthMm, big.spec.heightMm]).toEqual([395, 215]);
    const small = await run(332, 181);
    expect(big.fab).toBeGreaterThan(small.fab);
  });
});
