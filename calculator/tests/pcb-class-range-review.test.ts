/** Class ranges found wrong by the whole-catalogue audit (scripts/pcb-catalogue-audit.ts, 6 Oct 2026). */
import { describe, it, expect } from 'vitest';
import { classRange } from '../server/utils/pcb-class-pricing.js';

describe('class ranges after the catalogue audit', () => {
  it('an IC that names a diode in its description is not a small-signal discrete', () => {
    const r = classRange({ componentType: 'ic_soic', description: 'Ideal diode controller, reverse battery', pkg: 'SOT-23-6' }, true);
    expect(r.key).not.toMatch(/^discrete/);
    expect(r.hi).toBeGreaterThan(0.75);          // LM74700-Q1 is £0.75 at 1k
  });
  it('an NPN / PNP in SOT-23 takes the discrete range, not the fuse row', () => {
    const r = classRange({ componentType: 'fuse_tvs', description: 'NPN 45 V 100 mA', pkg: 'SOT-23' }, true);
    expect(r.key).toMatch(/^discrete\.SOT-23/);
  });
  it('QFN LDOs, DC-DC converters and drivers have their own rows, inside the catalogue\'s spread', () => {
    const ldo = classRange({ componentType: 'ic_qfn', description: 'Low-noise LDO 3.3V 500mA', pkg: 'TSON-10' }, true);
    const dcdc = classRange({ componentType: 'ic_qfn', description: '36V 3A synchronous buck converter', pkg: 'VQFN' }, true);
    const drv = classRange({ componentType: 'ic_qfn', description: 'H-bridge gate driver', pkg: 'VQFN-24' }, true);
    expect([ldo.lo, ldo.hi]).toEqual([0.3, 2]);       // TLS205 £0.59, TLV767 £0.61 sit inside; was £2–15
    expect([dcdc.lo, dcdc.hi]).toEqual([0.8, 4.5]);   // LMR33630 £1.03, TPS62810 £1.42, LMQ61460 £2.61
    expect([drv.lo, drv.hi]).toEqual([0.6, 3.5]);     // DRV8705 £1.24, TLD5542 £1.68
  });
});
