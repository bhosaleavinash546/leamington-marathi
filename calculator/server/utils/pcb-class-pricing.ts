/**
 * Deterministic component price ranges by class — the tool's own table, in code.
 *
 * The golden rule ("AI never sets a price") was broken in the photo pipeline:
 * the model was shown this table as prose and asked to write `unitPriceGBP`,
 * and for every line it could not name — passives, discretes, connectors,
 * unmarked ICs, i.e. most of the BOM — that guess WAS the price. Now the table
 * is data: every unnamed line is priced inside its class range, the model's
 * estimate only chooses a point within it, and each line records its basis.
 *
 * Ranges are indicative GBP unit prices, UK distributor / EMS-sourced, 2025/26 (the same figures the prompt used).
 * Their evidence is distributor listings at 1k–28k, so the tool reads them as ~10k reel prices (TABLE_BASIS_QTY in
 * pcb.ts) and moves them along the franchise curve on the parts bought — the prompt still says "100K"; the model's
 * price is never used. `automotive` selects the AEC-Q
 * variant. Each entry names what it is for, so a reviewer can argue with it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { marketRow } from '../data/pcb-component-market.js';

/**
 * AEC-Q ranges set by the catalogue's own distributor prices (p10–p90 at 10k, rows with ≥ 10 parts from ≥ 2
 * distributors), written by scripts/pcb-class-rows/check.mts --write (EDU audit G-12, Nov 2026). They replace the
 * table's automotive range for that row; the non-automotive range and every other row are unchanged.
 */
const CLASS_ROWS_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../data/pcb-class-rows.json');
export const EVIDENCE_ROWS: Record<string, { lo: number; hi: number; n: number; distributors: number; p50: number }> =
  (() => { try { return JSON.parse(readFileSync(CLASS_ROWS_FILE, 'utf8')).rows ?? {}; } catch { return {}; } })();

export interface ClassRange {
  /** Table key, e.g. "passive_0402.cap.automotive" */
  key: string;
  label: string;
  lo: number;
  hi: number;
  /** Median of the sourced prices the range came from, when it came from sourced prices: the default point never
   *  lies above it (EDU v5, Nov 2026). */
  p50?: number;
}

type Row = { lo: number; hi: number; auto?: [number, number]; label: string; autoP50?: number };

const R = (lo: number, hi: number, label: string, auto?: [number, number], autoP50?: number): Row => ({ lo, hi, label, auto, autoP50 });

/** A resistor stated by its film or by a bare k / M value ("Thick film 10k 1%"): catalogue resistors were filed in the
 *  capacitor rows and lifted them (EDU v5, Nov 2026). */
const RES_WORDS = /resist|\bres\b|thick[- ]film|thin[- ]film|metal[- ]film|zero[- ]ohm|\bjumper\b|(^|\s)\d+(\.\d+)?\s*[kKmM]?(Ω|ohm|R)(?=\s|$)|(^|\s)\d+(\.\d+)?[kKM](?=[\s,]|$)/i;

/** A chip thermistor (NTC / PTC): its own row, not an MLCC (EDU v5). Catalogue, AEC-Q at 10k: NCU03XH103 £0.0188,
 *  NCU15XH103 £0.0253, NTCG163JF103 £0.090, NTCS0603E3103 £0.114, NTCSP163JF103 £0.119 (Digi-Key); standard grade
 *  NCP18XH103F03RB szlcsc whole reel £0.0115 (page read 25 Nov 2026, scripts/edu-ctrl-2026-11-25/xcheck/china-volume.json). */
const THERMISTOR = { kind: 'ntc', test: /thermistor|\bntc\b|\bptc\b/i, row: R(0.0115, 0.12, 'chip NTC / PTC thermistor', [0.019, 0.12], 0.09) };

/** Sub-kinds within a component type, by description / value keywords. Order matters. */
const TABLE: Record<string, Array<{ kind: string; test?: RegExp; row: Row }>> = {
  passive_0402: [
    THERMISTOR,
    { kind: 'res', test: RES_WORDS, row: R(0.0005, 0.003, 'chip resistor 0402', [0.0018, 0.0047], 0.0042) },   // EDU v5 — general-purpose thick film AEC-Q200 at 10k (catalogue): AC0402FR £0.0018, CRCW04020000Z0EDC £0.0012 (jumper), ERJ-2GE0R00 £0.0031, CRCW040210K0 £0.0033, RK73H1E £0.0036, CRCW0402… ×11 £0.0042–0.0047, ERJ-2RKF £0.0043; was [0.003, 0.012], not sourced
    { kind: 'ind', test: /inductor|choke|ferrite|bead/i, row: R(0.004, 0.04, 'chip inductor / ferrite 0402', [0.01, 0.08]) },
    { kind: 'cap_c0g', test: /c0g|np0/i, row: R(0.003, 0.02, 'MLCC C0G 0402', [0.012, 0.04]) },
    { kind: 'cap', row: R(0.001, 0.015, 'MLCC 0402', [0.005, 0.025]) },   // GCM155 100 nF AEC $0.006–0.0087 @10k (2026-10-01)
  ],
  passive_0603: [
    THERMISTOR,
    // Current-sense shunts / precision metal-strip resistors were priced as plain chip resistors and lifted the
    // resistor rows' catalogue evidence (EDU audit G-12): their own row.
    { kind: 'shunt', test: /shunt|current[- ]?sens|sense resistor|milli-?ohm|\bm(Ω|ohm)\b|metal[- ]strip|\d+\s*m(Ω|ohm|R)\b/i, row: R(0.03, 0.6, 'current-sense shunt resistor', [0.05, 0.8]) },
    { kind: 'res', test: RES_WORDS, row: R(0.001, 0.005, 'chip resistor 0603', [0.0025, 0.0051], 0.0045) },   // EDU v5 — catalogue thick film AEC-Q200 at 10k: RK73B1J £0.0025, RK73H1J £0.0035, CRCW060310K0 £0.0045, AC0603FR £0.0045, ERJ-3GEY0R00 £0.0047, ERJ-3EKF £0.0051; was [0.004, 0.015]
    { kind: 'ind', test: /inductor|choke|ferrite|bead/i, row: R(0.006, 0.06, 'chip inductor / ferrite 0603', [0.025, 0.15]) },
    { kind: 'cap', row: R(0.002, 0.04, 'MLCC 0603', [0.012, 0.06]) },   // GCM188 1 µF AEC $0.030 @28k (2026-10-01)
  ],
  passive_0805: [
    THERMISTOR,
    // Current-sense shunts / precision metal-strip resistors were priced as plain chip resistors and lifted the
    // resistor rows' catalogue evidence (EDU audit G-12): their own row.
    { kind: 'shunt', test: /shunt|current[- ]?sens|sense resistor|milli-?ohm|\bm(Ω|ohm)\b|metal[- ]strip|\d+\s*m(Ω|ohm|R)\b/i, row: R(0.03, 0.6, 'current-sense shunt resistor', [0.05, 0.8]) },
    { kind: 'res', test: RES_WORDS, row: R(0.002, 0.01, 'chip resistor 0805', [0.0066, 0.0079], 0.0067) },   // EDU v5 — catalogue thick film AEC-Q200 at 10k: ERJ-6ENF £0.0066, CRCW08051K00 £0.0067, AC0805FR £0.0067, CRCW080510K0 £0.0071, RCA0805 £0.0079; was [0.006, 0.03]
    { kind: 'ind', test: /inductor|choke/i, row: R(0.018, 0.6, 'power / RF inductor 0805-class', [0.06, 1.8]) },
    { kind: 'fb', test: /ferrite|bead/i, row: R(0.008, 0.08, 'ferrite bead 0805', [0.02, 0.15]) },
    { kind: 'cap', row: R(0.005, 0.18, 'MLCC 0805', [0.03, 0.5]) },   // GCM21B 10 µF AEC $0.113–0.124 @10k (2026-10-01)
  ],
  passive_1206: [
    // Round 5: SMD tantalum / polymer tantalum, 6 catalogue parts (KEMET T598 / T495, AVX), 10k p10–p90 £0.36–1.42 (AEC-Q £0.55–1.50) —
    // they were priced as an MLCC (£0.09 v £1.18–2.15 sourced).
    { kind: 'tant', test: /tantal|polymer tant/i, row: R(0.36, 1.42, 'tantalum / polymer tantalum capacitor', [0.55, 1.5]) },
    // EDU v5: SMD aluminium / hybrid polymer cans were filed as 1206 MLCCs (and lifted that row) or priced as a through-hole
    // electrolytic. Catalogue, AEC-Q at 10k (Digi-Key / Mouser): UCM1V101 £0.129, EEE-FK1E471 £0.170, GYF1E101 £0.171,
    // GYE1V101 £0.192, HHXC350ARA271 £0.220, GYB1V271 £0.260, UCZ1V101 £0.274, EEH-ZA1H101 £0.360, GYA1V271 £0.381,
    // GYC1V271 £0.396, PCV1V101 £0.946 — median £0.26.
    { kind: 'alu', test: /electrolytic|alumin\w*|hybrid polymer|polymer (alu|hybrid)|conductive polymer/i, row: R(0.12, 0.95, 'SMD aluminium / hybrid polymer capacitor', [0.129, 0.946], 0.26) },
    // Current-sense shunts / precision metal-strip resistors were priced as plain chip resistors and lifted the
    // resistor rows' catalogue evidence (EDU audit G-12): their own row.
    { kind: 'shunt', test: /shunt|current[- ]?sens|sense resistor|milli-?ohm|\bm(Ω|ohm)\b|metal[- ]strip|\d+\s*m(Ω|ohm|R)\b/i, row: R(0.03, 0.6, 'current-sense shunt resistor', [0.05, 0.8]) },
    // A 2010 / 2512 power resistor is not a 1206 (it took the 1206 row once that row was sourced) — catalogue AEC-Q200 at
    // 10k: CRCW25121K00 £0.046, CRCW251210R0 £0.078 (EDU v5).
    { kind: 'res_pwr', test: /\b(2010|2512|2816|3637)\b|\b[1-3]\s*W\b/i, row: R(0.015, 0.08, 'power chip resistor 2010 / 2512', [0.0457, 0.0782]) },
    { kind: 'res', test: RES_WORDS, row: R(0.003, 0.015, 'chip resistor 1206', [0.0049, 0.0109], 0.008) },   // EDU v5 — catalogue thick film AEC-Q200 at 10k: CRCW120612R0 £0.0049, CRCW120610R0 £0.0076, CRCW12061M00 £0.0080, CRCW120610K0 £0.0087, AC1206FR £0.0109; was [0.008, 0.04]
    { kind: 'ind', test: /inductor|choke/i, row: R(0.03, 0.8, 'power inductor 1206-class', [0.08, 1.8]) },
    { kind: 'cap', row: R(0.008, 0.25, 'MLCC 1206', [0.02, 0.3]) },
  ],
  crystal_osc: [
    { kind: 'ocxo', test: /ocxo/i, row: R(6, 35, 'OCXO') },
    { kind: 'tcxo', test: /tcxo|vcxo|oscillator|\bosc\b/i, row: R(0.5, 2.8, 'TCXO / oscillator', [1.8, 8]) },
    { kind: 'xtal', row: R(0.12, 0.45, 'SMD crystal', [0.2, 0.8]) },   // TXC 7V $0.46, ECS $0.19, ABM8 $0.16–0.30 @1–3k (2026-10-01)
  ],
  power_module: [
    { kind: 'iso', test: /isolat/i, row: R(4, 22, 'isolated DC-DC module', [12, 55]) },
    { kind: 'dcdc', row: R(1.2, 7, 'DC-DC module', [4, 25]) },
  ],
  transformer: [
    // Signal / coax-PoC CMCs are £0.15–0.30 (DLW21SH900 $0.29, TME $0.20 @1k); a CAN CMC £0.64 (ACT45B).
    { kind: 'cmc', test: /common[- ]?mode|choke/i, row: R(0.08, 0.9, 'common-mode choke', [0.12, 0.9]) },
    { kind: 'pwr', test: /power/i, row: R(1, 7, 'SMD power transformer', [2, 12]) },
    { kind: 'sig', row: R(0.35, 2, 'signal transformer', [0.8, 4]) },
  ],
  led: [
    { kind: 'hp', test: /high[- ]?power|\d+\s*W\b/i, row: R(0.2, 2, 'high-power LED') },
    { kind: 'rgb', test: /rgb/i, row: R(0.05, 0.25, 'RGB LED') },
    { kind: 'ind', row: R(0.02, 0.14, 'indicator LED', [0.05, 0.25]) },   // OSRAM LG L29K $0.10–0.14 @3k (2026-10-01)
  ],
  relay_switch: [
    { kind: 'relay_hc', test: /relay.*(high|\d{2}\s*A)|(high|\d{2}\s*A).*relay/i, row: R(1, 5.5, 'high-current relay', [1.2, 6]) },
    { kind: 'relay', test: /relay/i, row: R(0.5, 3.5, 'SMD signal relay', [0.8, 3.5]) },   // Omron G6K $0.61–3.18 @1k (2026-10-01)
    { kind: 'sw', row: R(0.02, 0.22, 'tactile switch', [0.06, 0.5]) },
  ],
  fuse_tvs: [
    { kind: 'array', test: /array|\d\s*ch/i, row: R(0.1, 0.6, 'TVS / ESD array', [0.2, 1.2]) },
    { kind: 'tvs', test: /tvs|esd|transient|zener/i, row: R(0.03, 0.22, 'TVS diode', [0.12, 0.8]) },
    { kind: 'poly', test: /poly|ptc/i, row: R(0.03, 0.15, 'SMD polyfuse', [0.08, 0.35]) },
    // A rectifier / Schottky diode fell to the fuse row — and, filed the same way, catalogue rectifiers made up 10 of
    // the fuse row's 11 evidence parts (EDU v5). Catalogue AEC-Q at 10k: BAT46WJ £0.036, RB160MM-60 £0.058, S1MHE3 £0.062,
    // STPS2H100AY £0.082, US1MHE3 £0.092, ES1DHE3 £0.101, NRVB140SF £0.108, PMEG6030ELP-Q £0.123, NRVBA340 £0.152,
    // NRVBS340 £0.176 (median £0.096).
    { kind: 'rect', test: /rectifier|schottky|power diode|\bdiode\b/i, row: R(0.03, 0.2, 'rectifier / Schottky diode', [0.036, 0.176], 0.096) },
    { kind: 'fuse', row: R(0.08, 0.4, 'SMD chip fuse', [0.15, 0.6]) },   // Littelfuse 0603SF $0.32–0.37 @1–4k (2026-10-01)
  ],
  ic_soic: [
    // Round 5: IMU / accelerometer / gyroscope, 14 catalogue parts, 10k p10–p90 £1.43–15.6 (AEC-Q 10: £1.32–5.11).
    { kind: 'imu', test: /\bimu\b|accelerometer|gyro|inertial|6-?(dof|axis)/i, row: R(1.4, 15.6, 'IMU / inertial sensor', [1.3, 5.1]) },
    // Logic before the package row: a single-gate buffer in SC-70 took the generic small-IC row (EDU audit G-02).
    // Logic AEC-Q at 10k from the catalogue (EDU v5): 74LVC1G08QSE £0.059, SN74LVC1G08-Q1 £0.076, SN74LVC1G17-Q1 £0.105,
    // SN74LV4T125-Q1 £0.538 (median £0.091). Was [0.08, 0.6], not sourced.
    { kind: 'logic', test: /^(?!.*\b(driver|drivers|mosfet|igbt|transistor|sensor|isolat\w*)\b)(?=.*(\blogic\b(?![- ]?level)|single[- ]gate|\b(and|or|nand|nor|xor|xnor)[- ]gate\b|\bbuffer\b|\binverter\b|\b74[a-z]{1,4}\d))/i, row: R(0.03, 0.25, 'logic IC', [0.059, 0.54], 0.091) },
    // Isolated amplifiers / modulators and current-sense amplifiers were filed under "op-amp" and set its evidence row
    // (p50 £1.70 for a row an LM2904 line takes) — EDU v5. Catalogue AEC-Q at 10k: AMC3301 £1.94, AMC1301 £2.40,
    // AMC1311 £2.46, AMC1350 £2.59, AMC1302 £2.60, AMC3330 £2.74, Si8931 £3.42; INA240 £1.61, AD8418 £1.70, TSC2012
    // £1.01, TSC2020 £0.90.
    { kind: 'iso_amp', test: /isolat\w*[^.]*\b(amplifier|amp|modulator|adc|voltage sense)\b|delta[- ]sigma modulator|reinforced[^.]*(amplifier|modulator)/i, row: R(1.5, 3.5, 'isolated amplifier / modulator', [1.94, 3.42], 2.59) },
    { kind: 'csa', test: /current[- ]sens\w*\s+amp|current[- ]shunt (monitor|amp)|shunt amp/i, row: R(0.6, 1.8, 'current-sense amplifier', [0.9, 1.7], 1.31) },
    { kind: 'sot', test: /\b(SOT-?23-?[5-8]?|SOT-?353|SOT-?363|SC-?70|TSOT|SOT-?553)\b/i, row: R(0.05, 0.6, 'small IC in SOT-23 / SC-70', [0.12, 1.2]) },
    // EEPROMs had their own price lifted by the NOR-flash parts in the memory row (EDU v5). Catalogue at 10k: AEC-Q
    // M95640 £0.175, M24C02 £0.176, NV24C64 £0.167, M93C86 £0.503, M24C64 £0.517, M95160 £0.557, M95320 £0.696, M95256
    // £0.775 (median £0.51); standard AT24C02D £0.092, CAT24C512 £0.283.
    { kind: 'eeprom', test: /eeprom/i, row: R(0.09, 0.78, 'serial EEPROM', [0.167, 0.775], 0.51) },
    { kind: 'flash', test: /flash|memory|\bnor\b|fram/i, row: R(0.15, 1.5, 'serial memory SOIC', [0.3, 2.5]) },
    { kind: 'can', test: /\bcan\b|\blin\b|transceiver|rs-?485|rs-?232/i, row: R(0.3, 1.5, 'interface transceiver SOIC', [0.5, 3]) },
    { kind: 'ldo', test: /\bldo\b|regulator/i, row: R(0.08, 1.2, 'LDO regulator SOIC', [0.3, 3]) },
    { kind: 'opamp_p', test: /precision|instrumentation/i, row: R(0.5, 4, 'precision op-amp', [1.5, 8]) },
    // General-purpose op-amps / comparators, AEC-Q at 10k from the catalogue (EDU v5): LM2903QS £0.056, LM2904BQ £0.128,
    // LM393BQ £0.149, LMV358AQ £0.182, TLV9002Q £0.199, LMV321 £0.223, TLV9062Q £0.352, TS393 £0.437, TSV912 £0.595
    // (median £0.199). Was [0.3, 3.5], not sourced.
    { kind: 'opamp', test: /op-?amp|operational amplifier|comparator|amplifier/i, row: R(0.05, 0.6, 'op-amp / comparator SOIC', [0.056, 0.6], 0.199) },
    { kind: 'driver', test: /driver|switch|mosfet driver/i, row: R(0.12, 1.8, 'driver IC SOIC', [0.4, 5]) },
    { kind: 'any', row: R(0.08, 1.8, 'SOIC / SOT IC (unidentified)', [0.25, 5]) },
  ],
  ic_qfn: [
    { kind: 'imu', test: /\bimu\b|accelerometer|gyro|inertial|6-?(dof|axis)/i, row: R(1.4, 15.6, 'IMU / inertial sensor', [1.3, 5.1]) },
    { kind: 'pmic', test: /pmic|\bsbc\b|system basis|power management|supervisor/i, row: R(0.7, 7, 'PMIC QFN', [2.5, 12]) },
    // Round 5: a CAN / LIN transceiver matched "transceiver" in the RF row (TLIN2029-Q1 £7.75 v £0.40 sourced). 7 catalogue
    // AEC-Q parts in QFN / VSON, 10k p10–p90 £0.37–1.75.
    { kind: 'can_lin', test: /^(?!.*\b(mcu|microcontroller|soc|processor|sbc|system basis)\b).*(\b(can|lin|flexray)\b.*\b(transceiver|phy)\b|\b(transceiver|phy)\b.*\b(can|lin|flexray)\b)/i, row: R(0.37, 1.75, 'CAN / LIN transceiver QFN', [0.37, 1.75]) },
    { kind: 'rf', test: /\brf\b|radar|transceiver|mmic|\bghz\b|wireless|bluetooth|wifi|gnss|gps/i, row: R(1, 12, 'RF IC QFN', [3, 22]) },
    { kind: 'mcu_c', test: /(complex|32-?bit|cortex-m[47]|arm).*(mcu|micro)|(mcu|micro).*(complex|32-?bit|cortex-m[47])/i, row: R(1.5, 9, 'complex MCU QFN', [3, 18]) },
    { kind: 'mcu', test: /\bmcu\b|microcontroller/i, row: R(0.18, 1.8, 'simple MCU QFN', [3, 18]) },
    { kind: 'phy', test: /ethernet|\bphy\b|\bcan\b|\blin\b|interface/i, row: R(0.5, 5, 'interface / PHY QFN', [0.8, 9]) },
    // The three rows below are the catalogue's own AEC-Q distributor prices (10th–90th percentile at 1k,
    // 6 Oct 2026): QFN LDOs £0.61–1.4 median, DC-DC converters £1.16–2.07 median, bridge / LED / gate
    // drivers £0.79–1.75. Before, these lines fell to "QFN IC (unidentified)" at £2–15.
    { kind: 'dcdc', test: /buck|boost|dc-?dc|step-?down|converter|switching regulator|switcher/i, row: R(0.4, 2.5, 'DC-DC converter / controller QFN', [0.8, 4.5]) },
    { kind: 'ldo', test: /\bldo\b|linear regulator|regulator/i, row: R(0.15, 1.2, 'LDO regulator QFN', [0.3, 2]) },
    { kind: 'driver', test: /driver|h-?bridge|half-?bridge|high-?side|low-?side|gate drive/i, row: R(0.3, 2, 'driver IC QFN', [0.6, 3.5]) },
    { kind: 'any', row: R(0.5, 9, 'QFN IC (unidentified)', [2, 15]) },
  ],
  ic_bga: [
    { kind: 'adas', test: /adas|vision processor|radar processor/i, row: R(60, 400, 'ADAS processor') },
    // Automotive CMOS imagers AT VOLUME (camera-board trial, Oct 2026; docs/pcb/research/camera-board-evidence-2026-10.md):
    // 1–2 MP automotive sensors US$3–8, 8 MP > US$10 (China industry press 2025); Yole: low-resolution automotive
    // prices falling. Distributor single-unit listings (OX01F10 $12–18, AR0233 £24) are NOT volume prices.
    // A camera's sensor is its largest line — it must never fall to a generic IC range.
    { kind: 'imager', test: /image sensor|cmos sensor|camera sensor|imager\b/i, row: R(2.5, 12, 'CMOS image sensor', [3, 15]) },
    { kind: 'fpga_l', test: /fpga.*(large|ultrascale|kintex|virtex|stratix|arria)/i, row: R(30, 250, 'large FPGA') },
    { kind: 'fpga', test: /fpga|cpld/i, row: R(6, 40, 'small FPGA', [12, 60]) },
    { kind: 'ddr', test: /ddr|lpddr|sdram|dram|emmc|nand/i, row: R(1.5, 12, 'DDR / NAND memory BGA', [3, 20]) },
    // Round 5: an MCU in BGA (TC3xx / S32K3 BGA / i.MX RT) took the SoC row (i.MX RT1062 £53.50 v £3.95 sourced). 12 catalogue
    // parts, 10k p10–p90 £6.8–31.9 (AEC-Q 10: £15.5–32.5; the 2 non-automotive parts £3.36 / £6.48).
    { kind: 'mcu', test: /\bmcu\b|microcontroller|cortex-m|crossover/i, row: R(3.3, 32, 'MCU in BGA', [15.5, 32.5]) },   // non-automotive lower bound: i.MX RT1062 £3.36, STM32H735 £6.48
    { kind: 'soc', test: /\bsoc\b|application|processor|\bmcu\b|\bcpu\b/i, row: R(18, 160, 'SoC / processor BGA', [22, 200]) },
    { kind: 'any', row: R(6, 160, 'BGA IC (unidentified)', [18, 200]) },
  ],
  ic_tqfp: [
    { kind: 'dsp', test: /\bdsp\b/i, row: R(3, 18, 'DSP TQFP', [8, 45]) },
    { kind: 'cpld', test: /cpld|fpga/i, row: R(1.8, 12, 'CPLD TQFP', [4, 20]) },
    { kind: 'pmic', test: /pmic|\bsbc\b|supervisor|power management/i, row: R(1, 7, 'PMIC / SBC TQFP', [2.5, 12]) },
    { kind: 'mcu', row: R(1, 6, 'MCU TQFP', [5, 45]) },
  ],
  connector_smt: [
    { kind: 'hmtd', test: /h-?mtd|matenet|hsd/i, row: R(5, 25, 'H-MTD / MATEnet / HSD') },
    { kind: 'fakra', test: /fakra|\bsmb\b/i, row: R(4, 18, 'FAKRA / SMB') },
    { kind: 'sealed', test: /sealed|ip6[7-9]|ampseal|mx150|kostal|automotive.*connector/i, row: R(3, 18, 'sealed automotive connector body', [3, 18]) },
    { kind: 'rf', test: /\bsma\b|\brf\b|u\.?fl|mmcx|coax/i, row: R(0.22, 1.8, 'SMA / RF connector', [0.6, 4]) },
    { kind: 'usb', test: /usb/i, row: R(0.1, 0.7, 'USB connector', [0.3, 1.5]) },
    { kind: 'fpc', test: /fpc|ffc|flex/i, row: R(0.05, 0.4, 'FPC / FFC connector', [0.15, 0.9]) },
    { kind: 'b2b', test: /board[- ]to[- ]board|mezzanine|df17|df40|header|edge/i, row: R(0.6, 3.5, 'board-to-board connector', [1, 6]) },
    { kind: 'any', row: R(0.3, 3.5, 'SMT connector (unidentified)', [1, 8]) },
  ],
  through_hole: [
    { kind: 'elec_l', test: /electrolytic.*(\d{3,}\s*[uµ]F|\d{2,}x\d{2,}|large)|(\d{3,}\s*[uµ]F).*electrolytic/i, row: R(0.22, 2.8, 'large electrolytic', [0.4, 3.5]) },
    { kind: 'elec', test: /electrolytic|\balu\b/i, row: R(0.12, 0.9, 'electrolytic capacitor', [0.2, 1.2]) },   // Nichicon UCD 100 µF/100 V $1.04, EEE-FK 100 µF/35 V $0.17–0.27 @1k (2026-10-01)
    // Round 5: DC-link film £0.72–6.75 (4 catalogue parts: EZP-V80506MTS, MKP1848C, B32776); X / Y safety film £0.11–0.15 (2 parts) —
    // a film capacitor fell to "through-hole part (unidentified)" (£0.49 v £7.20 sourced).
    { kind: 'film_dclink', test: /dc-?link/i, row: R(0.7, 6.8, 'DC-link film capacitor', [0.7, 6.8]) },
    { kind: 'film_safety', test: /\b(x1|x2|y1|y2)\b.*\b(cap|capacitor|film)\b|\b(cap|capacitor|film)\b.*\b(x1|x2|y1|y2)\b|suppression cap|safety.*film|film.*safety/i, row: R(0.08, 0.3, 'X / Y safety film capacitor', [0.1, 0.35]) },
    { kind: 'film', test: /film cap|film capacitor|\bmkp\b|\bmkt\b|polypropylene/i, row: R(0.1, 2, 'film capacitor', [0.15, 3]) },
    { kind: 'to220', test: /to-?220|to-?247|to-?263/i, row: R(0.14, 2.8, 'TO-220 / D2PAK power device', [0.4, 5]) },
    { kind: 'pwr_conn', test: /power connector|automotive.*connector/i, row: R(0.4, 4.5, 'TH power connector', [2, 12]) },
    // A plain pin header / wire-to-board header took the TH connector row (£1.24 on the EDU board's 2 × 4 debug header).
    // Lower bound page-read 25 Nov 2026 (scripts/edu-ctrl-2026-11-25/xcheck/china-volume.json): JST B5B-XH-A szlcsc whole
    // reel £0.030 (LCSC £0.040), CJT A2541WV-2x4P £0.051 (LCSC £0.066). No franchised page could be read (503 / wrong
    // part), so the upper bound £0.40 is a CostVision engineering heuristic, not sourced. Headers carry no AEC-Q grade.
    { kind: 'header', test: /^(?!.*\b(sealed|press[- ]?fit|ampseal|mx150|hvil|power|automotive)\b).*(pin header|wire[- ]to[- ]board|\b(2\.54|2\.5|2\.0|2|1\.27|1\.25)\s*mm\b.*header|header.*\b(2\.54|2\.5|2\.0|1\.27|1\.25)\s*mm\b)/i, row: R(0.03, 0.4, 'pin / wire-to-board header', [0.03, 0.4]) },
    { kind: 'conn', test: /connector|header|terminal|socket/i, row: R(0.12, 1.8, 'TH connector', [0.4, 4]) },
    { kind: 'any', row: R(0.05, 1.8, 'through-hole part (unidentified)', [0.12, 4]) },
  ],
  // An SMD test point fitted as a part (loop / terminal). Keystone 5015: Digi-Key $0.18 at 5,000 = £0.142 (page read
  // 25 Nov 2026, scripts/edu-ctrl-2026-11-25/xcheck/components.json). Lower bound: the equivalent RH-5015 on szlcsc, whole
  // reel £0.0322 ex-VAT (LCSC £0.040), page read 25 Nov 2026 (xcheck/china-volume.json) — EDU v5; was £0.09, a search
  // listing never read (EDU audit G-01).
  testpoint: [
    { kind: 'any', row: R(0.032, 0.142, 'SMD test point (loop / terminal)', [0.032, 0.142]) },
  ],
  manual_solder: [
    { kind: 'any', row: R(0.02, 0.22, 'wire / jumper / hand-fitted part', [0.05, 0.5]) },
  ],
  mechanical: [
    { kind: 'any', row: R(0.02, 0.4, 'mechanical part', [0.05, 0.8]) },
  ],
};

/** Discrete semiconductors have no component type of their own in the prompt's
 *  list, so they arrive as fuse_tvs / ic_soic / passive. Description wins. */
const DISCRETE: Array<{ test: RegExp; row: Row }> = [
  // Round 5 (13 Oct 2026): from the catalogue's own distributor prices at 10k (p10–p90). A 1200 V SiC MOSFET used to
  // fall to "power MOSFET DPAK-class" (£1.01 v £22.62 sourced) — SiC / GaN (24 parts, AEC-Q 17) and IGBTs (16 parts).
  { test: /\b(sic|silicon carbide|coolsic|elitesic|gan|gallium nitride|coolgan)\b.*\b(mosfet|fet|transistor|hemt|diode|schottky|switch)\b|\b(mosfet|fet|transistor|hemt|diode|schottky)\b.*\b(sic|silicon carbide|gan|gallium nitride)\b/i,
    row: R(1.6, 18, 'SiC / GaN power semiconductor', [4.3, 19]) },
  { test: /\bigbt\b/i, row: R(0.95, 4.5, 'discrete IGBT', [0.95, 4.5]) },
  // ESD / TVS protection in SOT-23 apart from small-signal transistors and diodes: the CAN / Ethernet protection parts
  // (£0.05–0.30) lifted the small-signal row (EDU v5). Catalogue AEC-Q at 10k: AQ24CANFD £0.048, SZNUP2105L £0.056,
  // PESD1CAN £0.065, PESD2CANFD24V £0.067, CDSOT23-T24CAN £0.067, PESD2IVN24 £0.075, ESD2CANFD24 £0.110, PESD2ETH100
  // £0.113, TPD2E2U06 £0.131, ESD2CAN24 £0.160, TPD2E007 £0.295 (median £0.075).
  { test: /\b(SOT-?23(-?\d)?|SOD-?323|SC-?70|SOT-?323|SOT-?363)\b.*\b(esd|tvs|transient|surge)\b|\b(esd|tvs|transient|surge)\b.*\b(SOT-?23(-?\d)?|SOD-?323|SC-?70|SOT-?323|SOT-?363)\b/i,
    row: R(0.04, 0.3, 'ESD / TVS protection SOT-23', [0.048, 0.295], 0.075) },
  { test: /\b(SOT-?23|SOD-?123|SOD-?323|SOD-?523|SC-?70|SOT-?323|SOT-?363)\b.*\b(diode|tvs|transistor|mosfet|\bfet\b|\besd\b|rectifier|zener|schottky|bjt|npn|pnp)\b|\b(diode|tvs|transistor|mosfet|\bfet\b|\besd\b|rectifier|zener|schottky|bjt|npn|pnp)\b.*\b(SOT-?23|SOD-?123|SOD-?323|SOD-?523|SC-?70|SOT-?323|SOT-?363)\b/i,
    row: R(0.015, 0.1, 'SOT-23 / SOD-123 discrete', [0.03, 0.12]) },   // BC847 $0.017–0.023, 2N7002 AEC $0.025–0.049, BSS138 $0.045–0.06 @3k (2026-10-01)
  // "LFPAK56" / "TOLL" did not match \blfpak\b and fell to "SOIC IC (unidentified)" (round 5).
  { test: /\b(dpak|d2pak|to-?252|to-?263|powerpak|lfpak\d*|toll|tolt)\b.*(mosfet|fet|transistor)|(mosfet|fet|transistor).*\b(dpak|d2pak|to-?252|to-?263|powerpak|lfpak\d*|toll|tolt)\b/i,
    row: R(0.15, 1.5, 'power MOSFET DPAK-class', [0.35, 3]) },
];

const CAP_WORDS = /\bcap\b|capacitor|mlcc|x7r|x5r|c0g|np0|\d+(\.\d+)?\s*[pnuµ]F\b/i;
const IND_WORDS = /inductor|choke|ferrite|bead|\d+(\.\d+)?\s*[nuµm]?H\b/i;

function pick(ct: string, text: string, refDes = ''): { key: string; row: Row } | null {
  const rows = TABLE[ct];
  if (!rows) return null;
  // Passives: the ref-des letter is the strongest signal (R/C/L/FB), then the
  // words; "X7R" must not read as a 7 Ω resistor.
  if (ct.startsWith('passive')) {
    // The ref-des letter counts only on a real designator (R12, FB3): a group label "Resolver boost inductor pair"
    // read as a resistor (EDU audit G-02).
    const ref = /^[A-Z]{1,3}\d/i.test(refDes.trim()) ? refDes.toUpperCase() : '';
    const want = /^R/.test(ref) ? 'res' : /^C/.test(ref) ? 'cap' : /^(L|FB)/.test(ref) ? 'ind'
      : CAP_WORDS.test(text) ? 'cap' : IND_WORDS.test(text) ? 'ind' : RES_WORDS.test(text) ? 'res' : null;
    // A thermistor's own words outrank the designator letter (RT1, TH1 read as a resistor); then the capacitor bodies
    // that are not MLCCs (EDU v5).
    for (const k of ['ntc', 'tant', 'alu', 'res_pwr'] as const) {
      const r = rows.find(x => x.kind === k);
      if (k === 'res_pwr' && ((want !== 'res' && !(want === null && RES_WORDS.test(text))) || rows.some(x => x.kind === 'shunt' && x.test!.test(text)))) continue;
      if (r && r.test!.test(text) && (k !== 'alu' || !/tantal/i.test(text))) return { key: `${ct}.${k}`, row: r.row };
    }
    const shunt = rows.find(x => x.kind === 'shunt' && x.test!.test(text));
    if (shunt && want !== 'cap' && want !== 'ind') return { key: `${ct}.shunt`, row: shunt.row };
    if (want) {
      const r = rows.find(x => x.kind === want || (want === 'ind' && x.kind === 'fb') || (want === 'cap' && x.kind === 'cap_c0g' && /c0g|np0/i.test(text)))
        ?? rows.find(x => x.kind === want);
      if (r) return { key: `${ct}.${r.kind}`, row: r.row };
    }
  }
  for (const r of rows) if (!r.test || r.test.test(text)) return { key: `${ct}.${r.kind}`, row: r.row };
  return null;
}

/** The IC table class a package name states, or null when it states none. */
export function icPackageFamily(pkg: string): string | null {
  const k = String(pkg || '').toLowerCase();
  if (/bga|csp/.test(k)) return 'ic_bga';
  if (/qfn|dfn|\bson|wson|vson|lga/.test(k)) return 'ic_qfn';
  if (/qfp/.test(k)) return 'ic_tqfp';
  if (/soic|\bsop|ssop|tssop|msop|\bso-?\d|\bsot-?\d|\bsot\b/.test(k)) return 'ic_soic';
  return null;
}

/** Map a component type the AI or the BOM-file inference produced onto a table key. */
export function tableTypeOf(componentType: string, pkg = '', description = ''): string {
  const ct = (componentType || '').toLowerCase();
  // "<= 1206" is a size limit, not a size (see inferComponentType).
  const p = `${pkg} ${description}`.toLowerCase().replace(/(<=|≤|=<|up to|max\.?)\s*(01005|0201|0402|0603|0805|1206|1210)/g, ' ');
  if (TABLE[ct]) {
    // The line's own PACKAGE outranks the model's IC class: U9 "QFN-16" typed ic_bga was priced as a BGA (£14.34 v
    // £3.19, 360 review Oct 2026). Imagers stay BGA-class (their own rule).
    if (/^ic_(bga|qfn|tqfp|soic)$/.test(ct) && !/image sensor|cmos sensor|camera sensor|imager\b/.test(p)) {
      const fam = icPackageFamily(pkg);
      if (fam && fam !== ct) return fam;
    }
    return ct;
  }
  if (/image sensor|cmos sensor|camera sensor|imager\b/.test(p)) return 'ic_bga';   // CSP / BGA imagers
  // Hardware the ref-des prefixes do not know (SH1 shield can, MP1 standoff).
  // A fitted test point (loop / terminal) has its own row (EDU audit G-01).
  if (/^test_?point/.test(ct) || (!ct || ct === 'unknown') && /test ?point|test loop/.test(p) && !/\bpads?\b/.test(p)) return 'testpoint';
  // Hardware words read only on a line that is not an electrical part: "CAN common-mode choke" typed inductor was
  // priced as a shield can (EDU audit G-02).
  const electrical = /^(resistor|capacitor|inductor|ferrite|ic|diode|transistor|connector|crystal|led|switch|relay|transformer|fuse|passive|power)/.test(ct)
    || /\b(choke|inductor|transceiver|capacitor|resistor|diode|mosfet|regulator)\b/.test(p);
  if (!electrical && /shield can|\bshield\b|\bcan\b|screw|standoff|spacer|heatsink|heat sink|bracket|\blabel\b|gasket|clip|mechanical/.test(p)) return 'mechanical';
  const size = (/(?:^|[^0-9])(0402|0603|0805|1206|1210|1812|2010|2220|2512)(?![0-9])/.exec(`${ct} ${p}`) ?? [])[1];
  // A body stated in mm ("SMD 6x6", "10 x 10") larger than an 1206 is a large part, never the 0603 default: power
  // inductors fell to the 0603 row (EDU audit G-02).
  const body = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/.exec(p);
  const bigBody = body ? Math.max(Number(body[1]), Number(body[2])) >= 3.2 && Math.max(Number(body[1]), Number(body[2])) <= 30 : false;
  if (/^(resistor|capacitor|inductor|ferrite)/.test(ct) || ct.startsWith('passive')) {
    // An SMD can (V-chip, "SMD 8x10", hybrid polymer) is not a through-hole electrolytic (EDU v5).
    const smdCan = /electrolytic|alumin|hybrid polymer|conductive polymer/.test(p) && /\bsmd\b|\bsmt\b|v-?chip|surface[- ]mount/.test(p) && !/radial|\btht\b|through/.test(p);
    if (smdCan) return 'passive_1206';
    if (ct === 'capacitor_electrolytic' || /electrolytic|radial|tht|through/.test(p)) return 'through_hole';
    if (/tantal|polymer tant/.test(p)) return 'passive_1206';   // case A–E (3216–7343): not an 0603 MLCC (round 5)
    return size === '0402' ? 'passive_0402' : size === '0603' ? 'passive_0603' : size === '0805' ? 'passive_0805' : size || bigBody ? 'passive_1206' : 'passive_0603';
  }
  if (ct.startsWith('ic') || ct === 'unknown') {
    if (/bga|csp/.test(p)) return 'ic_bga';
    if (/qfn|dfn|son|lga|wlcsp/.test(p)) return 'ic_qfn';
    if (/qfp|lqfp|tqfp/.test(p)) return 'ic_tqfp';
    if (ct.startsWith('ic')) return 'ic_soic';
  }
  if (ct.startsWith('connector')) return /tht|through|radial|pin header|2\.54/.test(p) ? 'through_hole' : 'connector_smt';
  if (ct.startsWith('crystal')) return 'crystal_osc';
  if (ct.startsWith('diode') || ct.startsWith('fuse')) return 'fuse_tvs';
  if (ct.startsWith('transistor')) return 'ic_soic';
  if (ct.startsWith('led')) return 'led';
  if (ct.startsWith('switch') || ct.startsWith('relay')) return 'relay_switch';
  if (ct.startsWith('transformer')) return 'transformer';
  if (ct.startsWith('mechanical')) return 'mechanical';
  if (ct.startsWith('testpoint')) return 'testpoint';
  return 'ic_soic';
}

/** The price range a line's class and description justify. Never null. */
export function classRange(line: { componentType?: unknown; description?: unknown; pkg?: unknown; value?: unknown; automotive?: unknown; refDes?: unknown; bomSource?: unknown; userCorrected?: unknown }, automotiveBoard = false, market?: string): ClassRange {
  const desc = String(line.description ?? '');
  const text = `${desc} ${String(line.pkg ?? '')} ${String(line.value ?? '')}`;
  // A line takes the AEC-Q range on an automotive board, or when the USER's BOM (file / picture / edit) says the part is
  // automotive. The model's own flag or wording on a board classified "general" moved the BOM +19% (360 review, Oct 2026).
  const userSays = line.bomSource === 'file' || line.bomSource === 'image' || line.userCorrected === true;
  const auto = automotiveBoard || (userSays && (line.automotive === true || /AEC-?Q|automotive/i.test(text)));
  const ct = tableTypeOf(String(line.componentType ?? ''), String(line.pkg ?? ''), desc);
  let key: string; let row: Row;
  // An IC whose description names a diode or transistor ("ideal diode controller, SOT-23-6") is
  // still an IC: it never takes the small-signal discrete range (LM74700-Q1 is £0.75, not £0.03–0.12).
  const isIC = /controller|driver|regulator|\bldo\b|monitor|amplifier|supervisor|converter|transceiver|\bic\b/i.test(text);
  const d = isIC ? undefined : DISCRETE.find(x => x.test.test(text));
  if (d) { key = `discrete.${d.row.label}`; row = d.row; }
  else {
    const p = pick(ct, text, String((line as { refDes?: unknown }).refDes ?? '')) ?? pick('ic_soic', '')!;
    key = p.key; row = p.row;
  }
  // The build country's market (EDU v6): an automotive row priced from that country's sourced reel prices.
  const mk = auto ? marketRow(market, key) : null;
  if (mk) return { key: `${key}.automotive@${market}`, label: `${row.label}, AEC-Q (${market === 'cn' ? 'China' : market} market: own-stock reel prices ex-VAT, p10–p90 of ${mk.n} parts)`, lo: mk.lo, hi: mk.hi, p50: mk.p50 };
  const ev = auto ? EVIDENCE_ROWS[`${key}.automotive`] : undefined;
  const [lo, hi] = ev ? [ev.lo, ev.hi] : auto && row.auto ? row.auto : [row.lo, row.hi];
  const p50 = ev ? ev.p50 : auto && row.auto ? row.autoP50 : undefined;
  return { key: `${key}${auto ? '.automotive' : ''}`, label: `${row.label}${auto ? ', AEC-Q' : ''}${ev ? ` (catalogue p10–p90 of ${ev.n} parts)` : ''}`, lo, hi, ...(p50 !== undefined ? { p50 } : {}) };
}

/** Where a class-range line lands with no better information: the lower-half
 *  midpoint (the prompt's "default to the lower half" rule, made deterministic) — and never above the median of
 *  the sourced prices the range came from. Class prices are skewed (p10–p90 spans ten times or more), so the
 *  arithmetic quarter point lay ABOVE the row's own median on 14 of the 34 catalogue rows: "the lower half" priced
 *  an unread line dearer than half the parts of its kind (EDU v5, Nov 2026). */
export function classDefaultPrice(r: ClassRange): number {
  const quarter = r.lo + (r.hi - r.lo) * 0.25;
  const point = r.p50 !== undefined && r.p50 > 0 ? Math.min(quarter, r.p50) : quarter;
  return Math.round(point * 100000) / 100000;
}

/**
 * The table row behind a class key ("passive_0402.res.automotive", "discrete.SOT-23 / SOD-123 discrete.automotive") —
 * the table as DATA, for an independent re-add of a line's price (scripts/arith-audit/pcb.ts). Null for an unknown key.
 */
export function classRowByKey(key0: string): { lo: number; hi: number; label: string; p50?: number } | null {
  // "<key>.automotive@cn": the build country's market row (EDU v6).
  const [key, market] = key0.split('@');
  if (market) { const mk = marketRow(market, key.replace(/\.automotive$/, '')); return mk ? { lo: mk.lo, hi: mk.hi, p50: mk.p50, label: `${market} market` } : null; }
  const auto = /\.automotive$/.test(key);
  const k = key.replace(/\.automotive$/, '');
  let row: Row | undefined;
  if (k.startsWith('discrete.')) row = DISCRETE.find(d => d.row.label === k.slice('discrete.'.length))?.row;
  else { const [ct, kind] = k.split('.'); row = TABLE[ct]?.find(x => x.kind === kind)?.row; }
  if (!row) return null;
  const ev = auto ? EVIDENCE_ROWS[key] : undefined;
  const [lo, hi] = ev ? [ev.lo, ev.hi] : auto && row.auto ? row.auto : [row.lo, row.hi];
  const p50 = ev ? ev.p50 : auto && row.auto ? row.autoP50 : undefined;
  return { lo, hi, label: row.label, ...(p50 !== undefined ? { p50 } : {}) };
}
