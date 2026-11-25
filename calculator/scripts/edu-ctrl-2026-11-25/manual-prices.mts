/** Manual costing, component prices: each reading line → a NAMED catalogue analogue priced at the parts bought a year
 *  (qty a board × 10,000), via the catalogue's own volume model; or a stated engineering estimate. Writes manual-prices.json. */
import { readFileSync, writeFileSync } from 'node:fs';
import { cataloguePriceAt, catalogueEntry } from '../../server/utils/pcb-price-catalogue.js';
const D = 'scripts/edu-ctrl-2026-11-25/';
const reading = JSON.parse(readFileSync(D + 'reading.json', 'utf8'));
const BOARDS = 10000;
// line refDes → [analogue MPN(s) (averaged), or null, engineering £ if null, note]
const MAP: Record<string, [string[] | null, number | null, string]> = {
  'AURIX pair': [['SAK-TC387QP-160F300S AE'], null, 'the part read off the chip'],
  'U39, U40': [['TLF35584QVVS2'], null, 'analogue: Infineon TLF35584, the safety PMIC usually paired with AURIX TC3xx (marking not read)'],
  'DC-DC group': [['LMR33630BQRNXRQ1'], null, 'analogue: 36 V 3 A automotive buck'],
  'LDO group': [['NCV8730ASNADJT1G'], null, 'analogue: 38 V 150 mA automotive LDO'],
  'CAN group': [['TJA1044GT/3Z'], null, 'analogue: NXP CAN FD transceiver'],
  'U8, U15, U61': [['AMC1311BQDWVRQ1'], null, 'analogue: TI reinforced isolated amplifier'],
  'Flyback ctrl': [['UCC28740QDRQ1'], null, 'analogue: automotive flyback controller'],
  'U12, U16, U17': [['LM2904BQDRQ1'], null, 'analogue: automotive dual op-amp'],
  'Dual op-amp group, channel two': [['LM2904BQDRQ1'], null, 'analogue: automotive dual op-amp'],
  'Quad op-amp group': [null, 0.20, 'engineering: quad version of the LM2904B-Q1 class (dual £0.13 at volume) ≈ 1.5×'],
  'U35, U36': [['ISO7741QDWRQ1'], null, 'analogue: quad reinforced digital isolator (function inferred, marking not read)'],
  'U20, U22, U43': [null, 1.00, 'engineering: small automotive mixed-signal QFN, range £0.50-2.50 (function not read)'],
  'Comparator group': [['LM2903QS-13'], null, 'analogue: automotive dual comparator'],
  'Logic group': [['74LVC1G08QSE-7'], null, 'analogue: automotive single gate'],
  'Ref group': [['TL431AIYDT'], null, 'analogue: automotive shunt reference'],
  'U63, U64, U65, U66, U67, U68': [['PESD2CANFD24V-TR'], null, 'analogue: automotive ESD diode, SOT-23'],
  'EEPROM group': [['M95256-DRMN3TP/K'], null, 'analogue: 256 Kb automotive SPI EEPROM'],
  'Q62': [null, 2.50, 'engineering: bus-rated (≥650 V) MOSFET / IGBT in D2PAK-7, range £1.50-5 (Si IGBT to SiC MOSFET)'],
  'Q3': [null, 2.00, 'engineering: bus-rated MOSFET / IGBT in D2PAK, range £1.20-4'],
  'Q63': [null, 2.50, 'engineering: as Q62'],
  'Power MOSFET group': [['IAUC60N04S6L039ATMA1'], null, 'analogue: 40 V automotive MOSFET'],
  'Q small-signal group': [['2N7002,215', 'BC847B,215'], null, 'analogue: mean of an automotive small-signal MOSFET and BJT'],
  'K1, K2': [null, 1.20, 'engineering: automotive photorelay (e.g. Toshiba TLX9xxx class), range £0.80-1.80'],
  'D small-signal group': [['BAV99,215'], null, 'analogue: automotive switching diode'],
  'D rectifier group': [['PMEG6030ELP-QX'], null, 'analogue: 60 V 3 A automotive Schottky'],
  'D34, D35': [['NRVBS340T3G'], null, 'analogue: 40 V 3 A automotive Schottky'],
  'Power diode pair, channel two': [['NRVBS340T3G'], null, 'analogue: 40 V 3 A automotive Schottky'],
  'Z4, Z6, Z8, Z10, Z12, Z14': [['SMBJ24CA-Q'], null, 'analogue: 600 W automotive TVS'],
  'TVS SMA group': [['SMBJ33A-Q'], null, 'analogue: automotive TVS (SMB used for SMA, conservative)'],
  'Zener group': [['BZT52C5V1Q-7-F'], null, 'analogue: automotive zener SOD-123'],
  'LED group': [['LG L29K-G2J1-24'], null, 'analogue: 0603 SmartLED (commercial listing; automotive LED is similar)'],
  'Bus-discharge bank (10 x 18 grid)': [['CRCW120610K0FKEA'], null, 'analogue: AEC-Q200 1206 1% thick film (value 46.4 k)'],
  'R 0402 group': [['CRCW040210K0FKED'], null, 'analogue: AEC-Q200 0402 1%'],
  'R 0603 group': [['CRCW060310K0FKEA'], null, 'analogue: AEC-Q200 0603 1%'],
  'R 0805 group': [['CRCW080510K0FKEA'], null, 'analogue: AEC-Q200 0805 1%'],
  'R 1206 group': [['CRCW120610K0FKEA'], null, 'analogue: AEC-Q200 1206 1%'],
  'R 2512 group': [null, 0.04, 'engineering: AEC-Q200 2512 thick-film power resistor'],
  'NTC group': [['NCP18XH103F03RB'], null, 'analogue: 10 k NTC 0603'],
  'PTC thermistor group': [null, 0.40, 'engineering: leaded disc PTC (Vishay BC Components class), range £0.25-0.60'],
  'C 0402 group': [['GCM155R71C104KA55D'], null, 'analogue: AEC-Q200 0402 100 nF'],
  'C 0603 group': [['GCM188R71H104KA57D'], null, 'analogue: AEC-Q200 0603 100 nF'],
  'C 0805 group': [['GCM21BR71H105KA03L'], null, 'analogue: AEC-Q200 0805 1 µF 50 V'],
  'C 1206 group': [['CGA5L1X7R1H475K160AC'], null, 'analogue: AEC-Q200 1206 4.7 µF 50 V'],
  'C 1210 group': [['GCM32ER71H475KA55L'], null, 'analogue: AEC-Q200 1210 4.7 µF 50 V'],
  'Hybrid 100 uF group': [['EEH-ZA1H101P'], null, 'analogue: Panasonic hybrid polymer 100 µF 50 V (the board carries Nichicon GYC)'],
  'Hybrid 330 uF pair': [null, 0.45, 'engineering: hybrid polymer 330 µF 25 V 125 °C, ~1.3× the 100 µF 50 V analogue'],
  'Film capacitor (bottom)': [['B32922C3104M000'], null, 'analogue: X2 film 0.1 µF'],
  'Motor-line filter inductors': [null, 0.10, 'engineering: 1812 signal-line inductor / ferrite, automotive'],
  'L39, L41': [['DLW43SH510XK2L'], null, 'analogue: Murata automotive CAN common-mode choke'],
  'Coupled choke group': [null, 0.45, 'engineering: ~7×7 mm automotive common-mode / coupled choke'],
  'Small choke group': [null, 0.10, 'engineering: 1210 automotive inductor'],
  'Power inductor 4.7 uH group': [null, 0.30, 'engineering: 6×6 mm automotive shielded power inductor (commercial SRN6045 £0.16, XAL7030 £0.56)'],
  '10 uH pair': [null, 0.30, 'engineering: as the 4.7 µH'],
  'L35, L36': [null, 0.25, 'engineering: 4×4 mm automotive power inductor'],
  'L29': [null, 0.55, 'engineering: 10×10 mm automotive shielded power inductor 22 µH'],
  'Resolver boost inductor pair': [null, 0.25, 'engineering: 4×4 mm automotive power inductor'],
  'Ferrite bead group': [['BLM18KG601SH1D'], null, 'analogue: Murata automotive 0603 bead'],
  'Large choke (top edge)': [null, 1.20, 'engineering: through-hole common-mode choke ~12×12 mm, automotive'],
  'T1': [null, 3.50, 'engineering: custom automotive flyback transformer, triple-insulated, EP/EFD-25 class, range £2.50-5'],
  'Y1, Y2': [['NX3225GA-25.000M-STD-CRG-2'], null, 'analogue: NDK automotive crystal 3225'],
  'J12 CUSTOMER': [['776087-1'], null, 'analogue: TE AMPSEAL 23-way sealed header, scaled ×1.4 for 34 ways'],
  'J2, J3 MOTOR': [null, 1.80, 'engineering: 20-way press-fit automotive header, right angle'],
  'J22, J23': [null, 0.90, 'engineering: ~30-way SMD board-to-board connector'],
  'J1': [null, 0.35, 'engineering: 3-way automotive header'],
  'J4, J5': [null, 0.15, 'engineering: 5-way wire-to-board header'],
  'J6, J7': [null, 0.10, 'engineering: 2×4 pin header'],
  'J10, J11': [null, 0.06, 'engineering: SMD tactile switch'],
  'J15-J21': [null, 0.03, 'engineering: single press-fit / solder pin'],
  'TP group': [null, 0.06, 'engineering: SMD test loop (Keystone 5015 class)'],
  'Earth lug pair': [null, 0.08, 'engineering: stamped earth lug'],
  'Bus terminals (+ / -)': [null, 0.10, 'engineering: M5 press-in nut'],
};
const out: Array<Record<string, unknown>> = [];
for (const l of reading.lines) {
  const m = MAP[l.refDes];
  if (!m) throw new Error(`no manual price for ${l.refDes}`);
  const [mpns, est, note] = m;
  const bought = l.qty * BOARDS;
  let unit: number; const src: string[] = [];
  if (mpns) {
    const ps = mpns.map(p => { const v = cataloguePriceAt(p, bought); if (v == null) throw new Error(`not in catalogue: ${p}`); const e = catalogueEntry(p)!; src.push(`${p} (${e.confidence}, ${e.asOf}) £${v.toFixed(5)} at ${bought.toLocaleString('en-GB')} a year`); return v; });
    unit = ps.reduce((a, b) => a + b, 0) / ps.length;
    if (l.refDes === 'J12 CUSTOMER') unit *= 1.4;
  } else unit = est!;
  out.push({ refDes: l.refDes, description: l.description, pkg: l.pkg, qty: l.qty, basis: l.basis, partsBought: bought,
    unitGBP: Math.round(unit * 100000) / 100000, lineGBP: Math.round(unit * l.qty * 10000) / 10000,
    priceKind: mpns ? (l.refDes === 'AURIX pair' ? 'catalogue (part read)' : 'catalogue analogue') : 'engineering estimate', priceNote: note, priceSource: src.join('; ') });
}
writeFileSync(D + 'manual-prices.json', JSON.stringify(out, null, 1));
const tot = out.reduce((t, l) => t + Number(l.lineGBP), 0);
console.log('lines', out.length, 'components £', tot.toFixed(2));
for (const l of [...out].sort((a, b) => Number(b.lineGBP) - Number(a.lineGBP)).slice(0, 15)) console.log(String(l.lineGBP).padEnd(9), String(l.unitGBP).padEnd(9), l.qty, l.refDes, '|', l.priceKind);
