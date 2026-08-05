/** The toolmaking shop model — the shared quotation grammar, pinned by hand. */
import { describe, it, expect } from 'vitest';
import {
  composeTool, labourLine, materialLine, toolBaseCost, cavityCncHours, cavitySteelKg,
  TOOLROOM_RATES, SHOP_OVERHEAD_PROFIT,
} from '../src/engine/toolmaking.js';

describe('toolmaking shop model', () => {
  it('composes lines with the 22% shop overhead as its own line, summing exactly', () => {
    const d = composeTool([
      labourLine('CNC', 'machining', 100, TOOLROOM_RATES.cnc, 'x'),
      materialLine('steel', 100, 'h13', 'x'),
    ]);
    // 100h × £52 + 100kg × £9.5 = £6,150 → +22% = £7,503
    expect(d.total).toBe(Math.round(6150 * (1 + SHOP_OVERHEAD_PROFIT)));
    expect(d.lines.at(-1)!.kind).toBe('overheadProfit');
    expect(d.lines.reduce((s, l) => s + l.cost, 0)).toBe(d.total);
    expect(d.labourHours).toBe(100);
  });

  it('cavity hours: 12 + 3.4 × area^0.72, monotonic and depth-corrected', () => {
    // small areas hit the 3 cm minimum-depth floor, which adds a whisker of depth factor
    expect(cavityCncHours(46)).toBeCloseTo(12 + 3.4 * Math.pow(46, 0.72), 0);
    expect(cavityCncHours(9000)).toBeGreaterThan(cavityCncHours(1000));
    expect(cavityCncHours(1000, 40)).toBeGreaterThan(cavityCncHours(1000)); // deep draw costs more
  });

  it('steel mass and base track the footprint', () => {
    expect(cavitySteelKg(9000)).toBeGreaterThan(8000);   // a fascia block is ~8.5 t
    expect(toolBaseCost(9000).cost).toBeGreaterThan(toolBaseCost(92).cost);
  });
});
