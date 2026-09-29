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
 * Ranges are indicative GBP unit prices at 100K, UK distributor / EMS-sourced,
 * 2025/26 (the same figures the prompt used). `automotive` selects the AEC-Q
 * variant. Each entry names what it is for, so a reviewer can argue with it.
 */

export interface ClassRange {
  /** Table key, e.g. "passive_0402.cap.automotive" */
  key: string;
  label: string;
  lo: number;
  hi: number;
}

type Row = { lo: number; hi: number; auto?: [number, number]; label: string };

const R = (lo: number, hi: number, label: string, auto?: [number, number]): Row => ({ lo, hi, label, auto });

/** Sub-kinds within a component type, by description / value keywords. Order matters. */
const TABLE: Record<string, Array<{ kind: string; test?: RegExp; row: Row }>> = {
  passive_0402: [
    { kind: 'res', test: /resist|\bres\b|(^|\s)\d+(\.\d+)?\s*[kKmM]?(Ω|ohm|R)(?=\s|$)/i, row: R(0.0005, 0.003, 'chip resistor 0402', [0.003, 0.012]) },
    { kind: 'ind', test: /inductor|choke|ferrite|bead/i, row: R(0.004, 0.04, 'chip inductor / ferrite 0402', [0.01, 0.08]) },
    { kind: 'cap_c0g', test: /c0g|np0/i, row: R(0.003, 0.02, 'MLCC C0G 0402', [0.012, 0.04]) },
    { kind: 'cap', row: R(0.001, 0.015, 'MLCC 0402', [0.008, 0.025]) },
  ],
  passive_0603: [
    { kind: 'res', test: /resist|\bres\b|(^|\s)\d+(\.\d+)?\s*[kKmM]?(Ω|ohm|R)(?=\s|$)/i, row: R(0.001, 0.005, 'chip resistor 0603', [0.004, 0.015]) },
    { kind: 'ind', test: /inductor|choke|ferrite|bead/i, row: R(0.006, 0.06, 'chip inductor / ferrite 0603', [0.025, 0.15]) },
    { kind: 'cap', row: R(0.002, 0.04, 'MLCC 0603', [0.015, 0.06]) },
  ],
  passive_0805: [
    { kind: 'res', test: /resist|\bres\b|(^|\s)\d+(\.\d+)?\s*[kKmM]?(Ω|ohm|R)(?=\s|$)/i, row: R(0.002, 0.01, 'chip resistor 0805', [0.006, 0.03]) },
    { kind: 'ind', test: /inductor|choke/i, row: R(0.018, 0.6, 'power / RF inductor 0805-class', [0.06, 1.8]) },
    { kind: 'fb', test: /ferrite|bead/i, row: R(0.008, 0.08, 'ferrite bead 0805', [0.02, 0.15]) },
    { kind: 'cap', row: R(0.005, 0.18, 'MLCC 0805', [0.015, 0.5]) },
  ],
  passive_1206: [
    { kind: 'res', test: /resist|\bres\b|(^|\s)\d+(\.\d+)?\s*[kKmM]?(Ω|ohm|R)(?=\s|$)/i, row: R(0.003, 0.015, 'chip resistor 1206', [0.008, 0.04]) },
    { kind: 'ind', test: /inductor|choke/i, row: R(0.03, 0.8, 'power inductor 1206-class', [0.08, 1.8]) },
    { kind: 'cap', row: R(0.008, 0.25, 'MLCC 1206', [0.02, 0.3]) },
  ],
  crystal_osc: [
    { kind: 'ocxo', test: /ocxo/i, row: R(6, 35, 'OCXO') },
    { kind: 'tcxo', test: /tcxo|vcxo|oscillator|\bosc\b/i, row: R(0.5, 2.8, 'TCXO / oscillator', [1.8, 8]) },
    { kind: 'xtal', row: R(0.04, 0.35, 'SMD crystal', [0.15, 1.2]) },
  ],
  power_module: [
    { kind: 'iso', test: /isolat/i, row: R(4, 22, 'isolated DC-DC module', [12, 55]) },
    { kind: 'dcdc', row: R(1.2, 7, 'DC-DC module', [4, 25]) },
  ],
  transformer: [
    { kind: 'cmc', test: /common[- ]?mode|choke/i, row: R(0.12, 1.2, 'common-mode choke', [0.6, 3.5]) },
    { kind: 'pwr', test: /power/i, row: R(1, 7, 'SMD power transformer', [2, 12]) },
    { kind: 'sig', row: R(0.35, 2, 'signal transformer', [0.8, 4]) },
  ],
  led: [
    { kind: 'hp', test: /high[- ]?power|\d+\s*W\b/i, row: R(0.2, 2, 'high-power LED') },
    { kind: 'rgb', test: /rgb/i, row: R(0.05, 0.25, 'RGB LED') },
    { kind: 'ind', row: R(0.01, 0.06, 'indicator LED', [0.03, 0.15]) },
  ],
  relay_switch: [
    { kind: 'relay_hc', test: /relay.*(high|\d{2}\s*A)|(high|\d{2}\s*A).*relay/i, row: R(1, 5.5, 'high-current relay', [1.2, 6]) },
    { kind: 'relay', test: /relay/i, row: R(0.14, 1, 'SMD signal relay', [0.6, 3]) },
    { kind: 'sw', row: R(0.02, 0.22, 'tactile switch', [0.06, 0.5]) },
  ],
  fuse_tvs: [
    { kind: 'array', test: /array|\d\s*ch/i, row: R(0.1, 0.6, 'TVS / ESD array', [0.2, 1.2]) },
    { kind: 'tvs', test: /tvs|esd|transient|zener/i, row: R(0.03, 0.22, 'TVS diode', [0.12, 0.8]) },
    { kind: 'poly', test: /poly|ptc/i, row: R(0.03, 0.15, 'SMD polyfuse', [0.08, 0.35]) },
    { kind: 'fuse', row: R(0.02, 0.12, 'SMD fuse', [0.05, 0.3]) },
  ],
  ic_soic: [
    { kind: 'sot', test: /\b(SOT-?23-?[5-8]?|SOT-?353|SOT-?363|SC-?70|TSOT|SOT-?553)\b/i, row: R(0.05, 0.6, 'small IC in SOT-23 / SC-70', [0.12, 1.2]) },
    { kind: 'flash', test: /flash|eeprom|memory|\bnor\b|fram/i, row: R(0.15, 1.5, 'serial memory SOIC', [0.3, 2.5]) },
    { kind: 'can', test: /\bcan\b|\blin\b|transceiver|rs-?485|rs-?232/i, row: R(0.3, 1.5, 'interface transceiver SOIC', [0.5, 3]) },
    { kind: 'ldo', test: /\bldo\b|regulator/i, row: R(0.08, 1.2, 'LDO regulator SOIC', [0.3, 3]) },
    { kind: 'opamp_p', test: /precision|instrumentation/i, row: R(0.5, 4, 'precision op-amp', [1.5, 8]) },
    { kind: 'opamp', test: /op-?amp|comparator|amplifier/i, row: R(0.1, 1.2, 'op-amp / comparator SOIC', [0.3, 3.5]) },
    { kind: 'driver', test: /driver|switch|mosfet driver/i, row: R(0.12, 1.8, 'driver IC SOIC', [0.4, 5]) },
    { kind: 'logic', test: /logic|gate|buffer|inverter|74[a-z]+/i, row: R(0.03, 0.25, 'logic IC', [0.08, 0.6]) },
    { kind: 'any', row: R(0.08, 1.8, 'SOIC / SOT IC (unidentified)', [0.25, 5]) },
  ],
  ic_qfn: [
    { kind: 'rf', test: /\brf\b|radar|transceiver|mmic|\bghz\b|wireless|bluetooth|wifi|gnss|gps/i, row: R(1, 12, 'RF IC QFN', [3, 22]) },
    { kind: 'pmic', test: /pmic|\bsbc\b|system basis|power management|supervisor/i, row: R(0.7, 7, 'PMIC QFN', [2.5, 12]) },
    { kind: 'mcu_c', test: /(complex|32-?bit|cortex-m[47]|arm).*(mcu|micro)|(mcu|micro).*(complex|32-?bit|cortex-m[47])/i, row: R(1.5, 9, 'complex MCU QFN', [3, 18]) },
    { kind: 'mcu', test: /\bmcu\b|microcontroller/i, row: R(0.18, 1.8, 'simple MCU QFN', [3, 18]) },
    { kind: 'phy', test: /ethernet|\bphy\b|\bcan\b|\blin\b|interface/i, row: R(0.5, 5, 'interface / PHY QFN', [0.8, 9]) },
    { kind: 'any', row: R(0.5, 9, 'QFN IC (unidentified)', [2, 15]) },
  ],
  ic_bga: [
    { kind: 'adas', test: /adas|vision processor|radar processor/i, row: R(60, 400, 'ADAS processor') },
    { kind: 'fpga_l', test: /fpga.*(large|ultrascale|kintex|virtex|stratix|arria)/i, row: R(30, 250, 'large FPGA') },
    { kind: 'fpga', test: /fpga|cpld/i, row: R(6, 40, 'small FPGA', [12, 60]) },
    { kind: 'ddr', test: /ddr|lpddr|sdram|dram|emmc|nand/i, row: R(1.5, 12, 'DDR / NAND memory BGA', [3, 20]) },
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
    { kind: 'elec', test: /electrolytic|\balu\b/i, row: R(0.05, 0.6, 'electrolytic capacitor', [0.12, 0.8]) },
    { kind: 'to220', test: /to-?220|to-?247|to-?263/i, row: R(0.14, 2.8, 'TO-220 / D2PAK power device', [0.4, 5]) },
    { kind: 'pwr_conn', test: /power connector|automotive.*connector/i, row: R(0.4, 4.5, 'TH power connector', [2, 12]) },
    { kind: 'conn', test: /connector|header|terminal|socket/i, row: R(0.12, 1.8, 'TH connector', [0.4, 4]) },
    { kind: 'any', row: R(0.05, 1.8, 'through-hole part (unidentified)', [0.12, 4]) },
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
  { test: /\b(SOT-?23|SOD-?123|SOD-?323|SOD-?523|SC-?70|SOT-?323|SOT-?363)\b.*\b(diode|tvs|transistor|mosfet|\bfet\b|\besd\b|rectifier|zener|schottky|bjt)\b|\b(diode|tvs|transistor|mosfet|\bfet\b|\besd\b|rectifier|zener|schottky|bjt)\b.*\b(SOT-?23|SOD-?123|SOD-?323|SOD-?523|SC-?70|SOT-?323|SOT-?363)\b/i,
    row: R(0.02, 0.1, 'SOT-23 / SOD-123 discrete', [0.05, 0.12]) },
  { test: /\b(dpak|d2pak|to-?252|to-?263|powerpak|lfpak)\b.*(mosfet|fet|transistor)|(mosfet|fet|transistor).*\b(dpak|d2pak|to-?252|to-?263|powerpak|lfpak)\b/i,
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
    const ref = refDes.toUpperCase();
    const want = /^R/.test(ref) ? 'res' : /^C/.test(ref) ? 'cap' : /^(L|FB)/.test(ref) ? 'ind'
      : CAP_WORDS.test(text) ? 'cap' : IND_WORDS.test(text) ? 'ind' : null;
    if (want) {
      const r = rows.find(x => x.kind === want || (want === 'ind' && x.kind === 'fb') || (want === 'cap' && x.kind === 'cap_c0g' && /c0g|np0/i.test(text)))
        ?? rows.find(x => x.kind === want);
      if (r) return { key: `${ct}.${r.kind}`, row: r.row };
    }
  }
  for (const r of rows) if (!r.test || r.test.test(text)) return { key: `${ct}.${r.kind}`, row: r.row };
  return null;
}

/** Map a component type the AI or the BOM-file inference produced onto a table key. */
export function tableTypeOf(componentType: string, pkg = '', description = ''): string {
  const ct = (componentType || '').toLowerCase();
  const p = `${pkg} ${description}`.toLowerCase();
  if (TABLE[ct]) return ct;
  // Hardware the ref-des prefixes do not know (SH1 shield can, MP1 standoff).
  if (/shield can|\bshield\b|\bcan\b|screw|standoff|spacer|heatsink|heat sink|bracket|\blabel\b|gasket|clip|mechanical/.test(p)) return 'mechanical';
  const size = (/(?:^|[^0-9])(0402|0603|0805|1206|1210|2512)(?![0-9])/.exec(`${ct} ${p}`) ?? [])[1];
  if (/^(resistor|capacitor|inductor|ferrite)/.test(ct) || ct.startsWith('passive')) {
    if (ct === 'capacitor_electrolytic' || /electrolytic|radial|tht|through/.test(p)) return 'through_hole';
    return size === '0402' ? 'passive_0402' : size === '0603' ? 'passive_0603' : size === '0805' ? 'passive_0805' : size ? 'passive_1206' : 'passive_0603';
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
  if (ct.startsWith('testpoint')) return 'mechanical';
  return 'ic_soic';
}

/** The price range a line's class and description justify. Never null. */
export function classRange(line: { componentType?: unknown; description?: unknown; pkg?: unknown; value?: unknown; automotive?: unknown; refDes?: unknown }, automotiveBoard = false): ClassRange {
  const desc = String(line.description ?? '');
  const text = `${desc} ${String(line.pkg ?? '')} ${String(line.value ?? '')}`;
  const auto = automotiveBoard || line.automotive === true || /AEC-?Q|automotive/i.test(text);
  const ct = tableTypeOf(String(line.componentType ?? ''), String(line.pkg ?? ''), desc);
  let key: string; let row: Row;
  const d = DISCRETE.find(x => x.test.test(text));
  if (d) { key = `discrete.${d.row.label}`; row = d.row; }
  else {
    const p = pick(ct, text, String((line as { refDes?: unknown }).refDes ?? '')) ?? pick('ic_soic', '')!;
    key = p.key; row = p.row;
  }
  const [lo, hi] = auto && row.auto ? row.auto : [row.lo, row.hi];
  return { key: `${key}${auto ? '.automotive' : ''}`, label: `${row.label}${auto ? ', AEC-Q' : ''}`, lo, hi };
}

/** Where a class-range line lands with no better information: the lower-half
 *  midpoint (the prompt's "default to the lower half" rule, made deterministic). */
export function classDefaultPrice(r: ClassRange): number {
  return Math.round((r.lo + (r.hi - r.lo) * 0.25) * 100000) / 100000;
}
