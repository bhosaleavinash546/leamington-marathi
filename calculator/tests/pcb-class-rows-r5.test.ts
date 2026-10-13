/**
 * Round 5 class rows (13 Oct 2026, docs/pcb/catalogue-round-5-2026-10-13.md). Round 4 measured the class range a BOM line
 * took against the part's sourced price: SiC MOSFETs, tantalum, film capacitors, IMUs, BGA MCUs and CAN / LIN transceivers in
 * QFN were 3–60× off because the table had no row for them. Each new row is the catalogue's own distributor prices at 10k
 * (p10–p90), and must not capture a neighbouring kind.
 */
import { describe, it, expect } from 'vitest';
import { classRange, classDefaultPrice } from '../server/utils/pcb-class-pricing.js';

const cr = (componentType: string, description: string, pkg = '', automotive = true) =>
  classRange({ componentType, description, pkg, bomSource: 'file', automotive }, automotive);

describe('round 5 class rows', () => {
  it('a SiC MOSFET is a SiC / GaN power device, not a DPAK MOSFET (NVBG020N120SC1: £1.01 → sourced £22.62)', () => {
    const r = cr('ic_soic', 'SiC MOSFET 1200V 20mohm', 'D2PAK-7');
    expect(r.label).toMatch(/SiC \/ GaN/);
    expect(classDefaultPrice(r)).toBeGreaterThan(4);
  });
  it('a SiC gate DRIVER stays an IC (an IC never takes a discrete range)', () => {
    expect(cr('ic_soic', 'Isolated gate driver for SiC MOSFET', 'SOIC-16').label).not.toMatch(/SiC \/ GaN/);
  });
  it('IGBT, DC-link film, X2 film and tantalum have their own rows', () => {
    expect(cr('through_hole', 'IGBT 750V 200A', 'TO-247').label).toMatch(/IGBT/);
    expect(cr('through_hole', 'DC-link film capacitor 10uF 1200V', 'radial').label).toMatch(/DC-link film/);
    expect(cr('through_hole', 'X2 film suppression capacitor 0.1uF', 'radial', false).label).toMatch(/safety film/);
    const t = cr('capacitor', 'Polymer tantalum capacitor 33uF 35V', '7343');
    expect(t.label).toMatch(/tantalum/);
    expect(t.key).toMatch(/^passive_1206\.tant/);   // a 7343 case is not an 0603 MLCC
  });
  it('a pin header is still a connector, an MLCC still an MLCC', () => {
    expect(cr('through_hole', '2x2 pin header 2.54mm', 'THT', false).label).toMatch(/connector/);
    expect(cr('passive_0805', 'MLCC 10uF 25V X7R', '0805').label).toMatch(/MLCC 0805/);
  });
  it('a CAN / LIN transceiver in QFN is not an RF IC (TLIN2029-Q1: £7.75 → sourced £0.40)', () => {
    const r = cr('ic_qfn', 'LIN transceiver', 'VSON-8');
    expect(r.label).toMatch(/CAN \/ LIN/);
    expect(r.hi).toBeLessThan(2);
  });
  it('an MCU or SBC that mentions CAN keeps its own range; a radar transceiver stays RF', () => {
    expect(cr('ic_qfn', 'Automotive MCU Cortex-M7 with CAN FD and LIN', 'QFN-48').label).toMatch(/MCU/);
    expect(cr('ic_qfn', 'System basis chip with CAN transceiver', 'QFN-32').label).toMatch(/PMIC/);
    expect(cr('ic_qfn', 'Radar transceiver 77GHz', 'QFN').label).toMatch(/RF IC/);
  });
  it('an IMU has its own row; an MCU in BGA is not an application SoC (i.MX RT1062: £53.50 → sourced £3.95)', () => {
    expect(cr('ic_qfn', '6-axis IMU accelerometer gyroscope', 'LGA-14').label).toMatch(/IMU/);
    const m = cr('ic_bga', 'Crossover MCU Cortex-M7', 'BGA-196', false);
    expect(m.label).toMatch(/MCU in BGA/);
    expect(m.lo).toBeLessThan(4);
    expect(cr('ic_bga', 'Application processor SoC', 'BGA').label).toMatch(/SoC/);
  });
  it('an LFPAK56 / TOLL MOSFET is a power MOSFET (it fell to "SOIC IC, unidentified")', () => {
    expect(cr('ic_soic', 'N-channel power MOSFET 40V LFPAK56', 'LFPAK56').label).toMatch(/power MOSFET/);
    expect(cr('ic_soic', 'MOSFET 80V TOLL', 'TOLL').label).toMatch(/power MOSFET/);
  });
});
