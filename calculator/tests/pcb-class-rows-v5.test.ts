/**
 * Class rows, EDU v5 (Nov 2026): the tool priced an unread line dearer than the parts of its own kind.
 *  1. The default point (lower-half midpoint) lay ABOVE the median of the sourced prices behind the row on 14 of 34
 *     catalogue rows — class prices are skewed, so lo + ¼(hi − lo) of [p10, p90] can exceed p50. It is now capped there.
 *  2. Rows were built from the wrong population: resistors ("Thick film 10k") and NTCs in the MLCC rows, SMD aluminium /
 *     hybrid cans in the 1206 MLCC row, isolated and current-sense amplifiers in the op-amp row, EEPROMs with NOR flash,
 *     rectifiers as the "fuse" row, CAN ESD parts with small-signal transistors. Each kind now has its own row.
 *  3. Pin headers took the TH connector row; the test point floor was a search listing never read.
 * Every row's figures are named in pcb-class-pricing.ts with their source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classRange, classDefaultPrice, EVIDENCE_ROWS } from '../server/utils/pcb-class-pricing.js';

const auto = (componentType: string, description: string, pkg = '') => classRange({ componentType, description, pkg, automotive: true }, true);

describe('EDU v5 — the default point never lies above the median of its evidence', () => {
  it('on every catalogue-built row', () => {
    for (const [key, ev] of Object.entries(EVIDENCE_ROWS)) {
      const point = classDefaultPrice({ key, label: '', lo: ev.lo, hi: ev.hi, p50: ev.p50 });
      expect(point, key).toBeLessThanOrEqual(ev.p50 + 1e-5);
      expect(point, key).toBeGreaterThanOrEqual(ev.lo - 1e-5);
    }
  });
  it('an 0603 MLCC line lands at the median of the catalogue MLCCs, not above it', () => {
    const r = auto('capacitor', 'MLCC X7R', '0603');
    expect(r.key).toBe('passive_0603.cap.automotive');
    expect(r.p50).toBeDefined();
    expect(classDefaultPrice(r)).toBeLessThanOrEqual(r.p50!);
  });
  it('a row without sourced prices keeps the plain lower-half midpoint', () => {
    expect(classDefaultPrice({ key: 'x', label: '', lo: 1, hi: 5 })).toBe(2);
  });
});

describe('EDU v5 — each kind takes its own row', () => {
  it('a resistor described by its film and value is a resistor, not an MLCC', () => {
    expect(auto('passive_0603', 'Thick film 10k 1% 1/10W, 0603, AEC-Q200', '0603').key).toBe('passive_0603.res.automotive');
    expect(auto('passive_0402', 'Thick film jumper 0 ohm, 0402', '0402').key).toBe('passive_0402.res.automotive');
    // a capacitor stated in farads stays a capacitor
    expect(auto('passive_0603', 'MLCC 100nF 50V X7R 10k-hour', '0603').key).toBe('passive_0603.cap.automotive');
  });
  it('a chip thermistor has its own row, whatever its designator letter', () => {
    expect(auto('resistor_ntc', 'NTC thermistor (board temperature)', '0603').key).toBe('passive_0603.ntc.automotive');
    expect(classRange({ refDes: 'RT1', componentType: 'resistor', description: 'NTC 10k thermistor', pkg: '0402', automotive: true }, true).key)
      .toBe('passive_0402.ntc.automotive');
  });
  it('an SMD aluminium / hybrid polymer can is not an MLCC and not a through-hole electrolytic', () => {
    const h = auto('capacitor', 'Hybrid polymer aluminium electrolytic 100 uF 50 V, 125 C', 'SMD 8x10');
    expect(h.key).toBe('passive_1206.alu.automotive');
    expect(auto('capacitor', 'Aluminium electrolytic 470 uF 35 V, radial', 'radial THT').key).toMatch(/^through_hole\.elec/);
    expect(auto('capacitor', 'Polymer tantalum capacitor 33uF 35V', '7343').key).toBe('passive_1206.tant.automotive');
  });
  it('isolated and current-sense amplifiers are not general-purpose op-amps', () => {
    expect(auto('ic_soic', 'Isolated amplifier / isolated HV-bus voltage sense across the creepage slots', 'SOIC-8 wide').key).toBe('ic_soic.iso_amp.automotive');
    expect(auto('ic_soic', 'Current-sense amplifier, bidirectional, PWM rejection', 'TSSOP-8').key).toBe('ic_soic.csa.automotive');
    const g = auto('ic_soic', 'Dual operational amplifier (resolver excitation / sense, current-sense conditioning)', 'SOIC-8');
    expect(g.key).toBe('ic_soic.opamp.automotive');
    expect(classDefaultPrice(g)).toBeLessThan(0.25);   // LM2904BQ £0.128 … TSV912 £0.595, median £0.199
  });
  it('an EEPROM is not priced with NOR flash', () => {
    const e = auto('ic_soic', 'Serial EEPROM (calibration / fault memory)', 'SOIC-8');
    expect(e.key).toBe('ic_soic.eeprom.automotive');
    expect(auto('ic_soic', 'Serial NOR flash 128 Mbit QSPI', 'SOIC-8').key).toBe('ic_soic.flash.automotive');
    expect(classDefaultPrice(e)).toBeLessThan(0.4);
  });
  it('a rectifier / Schottky diode is not a chip fuse', () => {
    expect(auto('diode', 'Rectifier / Schottky diode', 'SMA / SMB').key).toBe('fuse_tvs.rect.automotive');
    expect(auto('diode', 'Power diode (supply OR-ing / reverse protection)', 'SMC').key).toBe('fuse_tvs.rect.automotive');
    expect(auto('fuse', 'SMD chip fuse 2 A fast', '0603').key).toBe('fuse_tvs.fuse.automotive');
    expect(auto('diode_tvs', 'TVS diode on the gate-signal lines', 'SMB').key).toBe('fuse_tvs.tvs.automotive');
  });
  it('ESD protection in SOT-23 is apart from small-signal transistors and diodes', () => {
    expect(auto('ic_soic', 'ESD protection array on the motor-connector signal lines', 'SOT-23').key).toBe('discrete.ESD / TVS protection SOT-23.automotive');
    expect(auto('transistor', 'Small-signal MOSFET / BJT', 'SOT-23').key).toBe('discrete.SOT-23 / SOD-123 discrete.automotive');
  });
  it('a 2512 power resistor has its own row; a 2512 current-sense shunt keeps the shunt row', () => {
    expect(auto('resistor', 'Power / pulse chip resistor 2512', '2512').key).toBe('passive_1206.res_pwr.automotive');
    expect(auto('resistor', 'Current sense resistor 10 mOhm 2512', '2512').key).toBe('passive_1206.shunt.automotive');
    expect(auto('resistor', 'Thick-film chip resistor 46.4 kOhm 1%', '1206').key).toBe('passive_1206.res.automotive');
  });
  it('a plain pin / wire-to-board header is not a TH connector; a sealed or HVIL header still is', () => {
    expect(auto('through_hole', 'Pin header 2x4, 8 pins (debug / programming), through-hole', 'THT 2x4 2.54 mm').key).toBe('through_hole.header.automotive');
    expect(auto('through_hole', 'Wire-to-board connector header, white, 7 pins (5 contacts + 2 pegs), through-hole', 'THT 5-way 2.5 mm').key).toBe('through_hole.header.automotive');
    expect(auto('through_hole', 'HVIL connector header, 3 pins, through-hole', 'THT 3-way').key).toBe('through_hole.conn.automotive');
  });
});

describe('EDU v5 — the catalogue rows are built from the right population', () => {
  const cat = JSON.parse(readFileSync(new URL('../server/data/pcb-component-catalogue.json', import.meta.url), 'utf8')) as {
    parts: Array<{ mpn: string; desc: string; category: string; pkg: string; aecq: boolean; confidence: string }> };
  const keyOf = (e: { desc: string; category: string; pkg: string }) => classRange({ componentType: e.category, description: e.desc, pkg: e.pkg, automotive: true }, true).key;
  it('no catalogued resistor or thermistor is filed in an MLCC row', () => {
    for (const e of cat.parts.filter(p => p.category.startsWith('passive') && /thick[- ]film|thin[- ]film|thermistor/i.test(p.desc))) {
      expect(keyOf(e), `${e.mpn} ${e.desc}`).not.toMatch(/\.cap(_c0g)?\./);
    }
  });
  it('no isolated / current-sense amplifier is filed in the op-amp row, no EEPROM in the flash row', () => {
    for (const e of cat.parts.filter(p => p.category === 'ic_soic')) {
      const k = keyOf(e);
      if (/^AMC1|^AMC3|^INA2[0-9]{2}|^AD8418/.test(e.mpn)) expect(k, e.mpn).not.toBe('ic_soic.opamp.automotive');
      if (/eeprom/i.test(e.desc)) expect(k, e.mpn).not.toBe('ic_soic.flash.automotive');
    }
  });
});
