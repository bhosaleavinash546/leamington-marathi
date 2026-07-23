import { describe, it, expect } from 'vitest';
import { looksAutomotiveSilicon } from '../server/routes/pcb.js';

describe('PCB automotive-silicon promotion (fuel-tank↔radar analogue)', () => {
  it('recognises automotive-radar and automotive-MCU part numbers from OCR', () => {
    // Real marking off the demo board + common automotive silicon families.
    const yes = [
      ['FS32R294KCMJD', 'OP68C'],           // the demo radar MCU
      ['S32R294'], ['S32K344'], ['S32G274A'],
      ['NXP MR3003'], ['TEF810X'],          // 77GHz radar transceivers
      ['AWR1642'], ['IWR6843'],             // TI mmWave radar
      ['AURIX TC397'], ['SPC58'], ['MPC5748G'],
      ['RH850/U2A'], ['SJA1105'], ['TJA1042'], ['TLF35584'],
    ];
    for (const m of yes) expect(looksAutomotiveSilicon(m), m.join(' ')).toBe(true);
  });

  it('does NOT fire on ordinary passives / generic parts (no false automotive path)', () => {
    const no = [
      ['GRM155R71H'], ['0402 resistor'], ['LM358'], ['NE555'],
      ['100V electrolytic'], ['ATMEGA328'], ['ESP32'], ['random text'], [''],
    ];
    for (const m of no) expect(looksAutomotiveSilicon(m), m.join(' ')).toBe(false);
  });
});
