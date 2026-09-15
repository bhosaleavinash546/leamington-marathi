/**
 * The offline rate-card converter.
 *
 * JLR's rate card arrives as JLR's export — MACHINE_CODE … TOTAL_MACHINE_RATE,
 * CODE … CO2 — and the upload wants the tool's ids, because those ids are what
 * the costing formulas ask for. Retyping 548 numbers a quarter is both tedious
 * and a source of mistakes, so the converter workbook does it with formulas —
 * no macro, which matters where IT block .xlsm.
 *
 * WHAT THIS TIER COVERS. It runs everywhere, CI included, and it covers the
 * pipeline: the workbook parses untouched, an unmapped row keeps the tool's own
 * value, and once the helper columns hold what their formulas say the parser
 * reads JLR's numbers through to a rate. It stands in for the spreadsheet
 * rather than being one, so it cannot prove a formula string evaluates as
 * intended — `rate-converter-excel.test.ts` does that by handing the workbook
 * to LibreOffice Calc, and runs wherever `soffice` is installed. The formula
 * shapes are asserted here as well so a change to the generator is visible in
 * the tier that always runs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import { parseRateLibraryWorkbook } from '../server/utils/rate-library-xlsx.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';

const LIB = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
let dir = '', BOOK = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rate-conv-'));
  BOOK = join(dir, 'converter.xlsx');
  execFileSync('npx', ['tsx', join(__dirname, '..', 'scripts', 'build-rate-converter-xlsx.ts'), BOOK],
               { cwd: join(__dirname, '..'), encoding: 'utf8', timeout: 180_000 });
}, 200_000);

const read = () => XLSX.read(readFileSync(BOOK), { cellFormula: true });
const cell = (ws: XLSX.WorkSheet, addr: string) => ws[addr] as XLSX.CellObject;

describe('the workbook is a valid upload the moment it is generated', () => {
  it('parses with no errors before anyone has opened it', () => {
    // SheetJS writes formulas with no cached result, and the parser reads
    // cached results — so without seeding the cache every formula cell would
    // read "not a valid number" and the whole file would be rejected.
    const r = parseRateLibraryWorkbook(readFileSync(BOOK));
    expect(r.errors).toEqual([]);
    expect(r.library).not.toBeNull();
  });

  it('carries exactly the values the tool already had', () => {
    // An untouched converter must be a no-op. If it shifted a rate on its own,
    // nobody could tell the converter's effect from JLR's.
    const r = parseRateLibraryWorkbook(readFileSync(BOOK));
    const steel = r.library!.materials.find(m => m.id === 'mat-steel1045')!;
    const vmc = r.library!.machines.find(m => m.id === 'mach-vmc3')!;
    expect(steel.pricePerKg).toBe(LIB.materials.find(m => m.id === 'mat-steel1045')!.pricePerKg);
    expect(vmc.computedRatePerHr).toBeCloseTo(LIB.machines.find(m => m.id === 'mach-vmc3')!.computedRatePerHr, 6);
  });

  it('offers every id the tool uses for mapping, with a description', () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(read().Sheets.Mapping);
    expect(rows).toHaveLength(LIB.materials.length + LIB.machines.length + LIB.labour.length
      + LIB.energy.length + LIB.fx.length + LIB.overheadDefaults.length);
    // The description is what lets someone match "1045 / C45" to their own
    // label without knowing our id scheme.
    for (const r of rows.slice(0, 40)) expect(String(r['what it is (do not edit)']).length).toBeGreaterThan(1);
  });

  it('carries JLR’s own headers on the tabs the card is pasted into', () => {
    // These are the columns JLR export. If the generator drifts from them the
    // paste stops lining up, silently — every lookup would read the wrong column.
    const wb = read();
    const head = (sheet: string) =>
      (XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 })[0] as string[]);
    expect(head('JLR Machines')).toEqual(['MACHINE_CODE', 'MACHINE_NAME', 'COUNTRY_NAME', 'PERIOD_CODE',
      'LABOUR_CATEGORY', 'TOTAL_LABOUR_RATE', 'DEPRECIATION', 'FLOORSPACE', 'MRO', 'INSURANCE',
      'INTEREST', 'UTILITIES', 'CONSUMABLES', 'TOTAL_MACHINE_RATE']);
    expect(head('JLR Materials')).toEqual(['CODE', 'MATERIAL', 'COUNTRY', 'PERIOD',
      'MATERIAL_RATE', 'MATERIAL_RECLAIM', 'CO2']);
  });
});

describe('the formulas stay simple enough to debug', () => {
  const wb = () => read();

  it('reads a rate from one helper column, not a nested lookup repeated', () => {
    // These were once the whole two-hop lookup inlined three times per machine
    // row: correct, unreadable, and slow over 178 rows.
    expect(cell(wb().Sheets.Materials, 'D2').f).toBe('IF($M2>0,$M2,3.62)');
    expect(cell(wb().Sheets.Labour, 'D2').f).toMatch(/^IF\(\$L2>0,\$L2,[\d.]+\)$/);
  });

  it('annualises each element of JLR’s build-up by that machine’s own hours', () => {
    // The tool derives £/hr from annual cost / (hours x utilisation), so an
    // element given in £/hr has to be multiplied by the same figure the tool
    // will divide by. MRO -> maintenance is the plainest case.
    const m = LIB.machines[0];
    const scale = m.buildup.annualAvailableHours * m.buildup.machineUtilization;
    expect(cell(wb().Sheets.Machines, 'E2').f).toBe(`IF($X2>0,IF($Y2>0,$S2*${scale},0),${m.buildup.maintenance})`);
  });

  it('puts insurance and consumables together, having nowhere else for them', () => {
    expect(cell(wb().Sheets.Machines, 'H2').f).toContain('($T2+$W2)');
  });

  it('says when a build-up is a placeholder rather than a real figure', () => {
    expect(String(cell(wb().Sheets.Machines, 'M2').f)).toContain('build-up not supplied');
  });

  it('takes a value only when exactly one pasted row matches', () => {
    // Two matches means the country/period filter has not narrowed the paste.
    // Averaging them would invent a rate nobody published.
    expect(String(cell(wb().Sheets.Machines, 'Q2').f)).toContain('IF($P2<>1,0,SUMIFS(');
    expect(String(cell(wb().Sheets.Materials, 'M2').f)).toContain('IF($L2<>1,0,SUMIFS(');
  });

  it('asks Settings what MATERIAL_RECLAIM means instead of assuming', () => {
    expect(String(cell(wb().Sheets.Materials, 'O2').f)).toContain('Settings!$B$5="percent"');
  });

  it('uses INDEX/MATCH and COUNTIFS rather than XLOOKUP', () => {
    // XLOOKUP is missing from perpetual-licence Excel, which a plant may still
    // be on. These work everywhere.
    const code = String(cell(wb().Sheets.Materials, 'K2').f);
    expect(code).toContain('INDEX(');
    expect(code).toContain('MATCH(');
    expect(code).not.toContain('XLOOKUP');
    expect(String(cell(wb().Sheets.Materials, 'L2').f)).toContain('COUNTIFS(');
  });
});

/**
 * Stand in for the spreadsheet: resolve each helper column the way its formula
 * says, and write the answer into the cached value. This proves the PIPELINE —
 * lookups, fallbacks, annualisation, parser — on the same cells Calc or Excel
 * would fill. Calc does the real thing in `rate-converter-excel.test.ts`.
 */
interface Jlr { machines: Record<string, number[]>; materials: Record<string, [number, number]>;
                labour: Record<string, number>; }

function recalculate(jlr: Jlr, mapping: Record<string, string>): Buffer {
  const wb = read();

  const codeOf = (sheet: string, row: number) =>
    mapping[(cell(wb.Sheets[sheet], `A${row}`)?.v as string) ?? ''] ?? '';
  const lastRow = (sheet: string) => XLSX.utils.decode_range(wb.Sheets[sheet]['!ref']!).e.r + 1;
  const put = (sheet: string, addr: string, v: number | string) => {
    const c = cell(wb.Sheets[sheet], addr);
    if (c) c.v = v;
  };

  for (let r = 2; r <= lastRow('Materials'); r++) {
    const code = codeOf('Materials', r);
    const row = jlr.materials[code];
    const [rate, reclaim] = row ?? [0, 0];
    const scrap = reclaim === 0 ? 0 : rate * reclaim / 100;      // Settings says percent
    put('Materials', `K${r}`, code); put('Materials', `L${r}`, row ? 1 : 0);
    put('Materials', `M${r}`, rate); put('Materials', `N${r}`, reclaim); put('Materials', `O${r}`, scrap);
    if (rate > 0) put('Materials', `D${r}`, rate);
    if (scrap > 0) put('Materials', `E${r}`, scrap);
  }

  // [DEPRECIATION, FLOORSPACE, MRO, INSURANCE, INTEREST, UTILITIES, CONSUMABLES, TOTAL]
  for (let r = 2; r <= lastRow('Machines'); r++) {
    const code = codeOf('Machines', r);
    const e = jlr.machines[code];
    put('Machines', `O${r}`, code); put('Machines', `P${r}`, e ? 1 : 0);
    if (!e) continue;
    const [dep, floor, mro, ins, int_, util, cons, total] = e;
    const sum = dep + floor + mro + ins + int_ + util + cons;
    const scale = (cell(wb.Sheets.Machines, `J${r}`).v as number)
                * (cell(wb.Sheets.Machines, `K${r}`).v as number);
    'QRSTUVWX'.split('').forEach((c, i) => put('Machines', `${c}${r}`, e[i]));
    put('Machines', `Y${r}`, sum);
    put('Machines', `D${r}`, sum > 0 ? Math.max(0, dep + total - sum) * scale : total * scale);
    put('Machines', `E${r}`, sum > 0 ? mro * scale : 0);
    put('Machines', `F${r}`, sum > 0 ? util * scale : 0);
    put('Machines', `G${r}`, sum > 0 ? floor * scale : 0);
    put('Machines', `H${r}`, sum > 0 ? (ins + cons) * scale : 0);
    put('Machines', `I${r}`, sum > 0 ? int_ * scale : 0);
    put('Machines', `M${r}`, `JLR machine ${code} at ${total.toFixed(2)} per hr — ` +
                             `build-up ${sum > 0 ? 'as supplied' : 'not supplied'}`);
  }

  for (let r = 2; r <= lastRow('Labour'); r++) {
    const code = codeOf('Labour', r);
    const rate = jlr.labour[code] ?? 0;
    put('Labour', `H${r}`, code); put('Labour', `L${r}`, rate);
    if (rate > 0) put('Labour', `D${r}`, rate);
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('once the lookups resolve, JLR’s numbers come through', () => {
  // 712008 exactly as it appears on the rate card supplied.
  const JLR: Jlr = {
    machines: { '712008': [1.75, 1.06, 1.97, 0.18, 0.64, 4.45, 0, 10.06],
                '712063': [0, 0, 0, 0, 0, 0, 0, 3.57] },
    materials: { '10080020309': [0.72, 40.48] },
    labour: { CB: 40.97 },
  };
  const MAP = { 'mat-steel1045': '10080020309', 'imm-100t': '712008',
                'imm-200t': '712063', 'lab-uk-skilled': 'CB' };
  const filled = () => parseRateLibraryWorkbook(recalculate(JLR, MAP));

  it('takes the material price and turns the reclaim percentage into £/kg', () => {
    const r = filled();
    expect(r.errors).toEqual([]);
    const m = r.library!.materials.find(x => x.id === 'mat-steel1045')!;
    expect(m.pricePerKg).toBe(0.72);
    expect(m.scrapRecoveryPricePerKg).toBeCloseTo(0.72 * 40.48 / 100, 9);
  });

  it('returns JLR’s machine rate exactly, through the tool’s own derivation', () => {
    // The whole point of annualising element by element: 10.06 in, 10.06 out,
    // via annual cost / (hours x utilisation), with the build-up intact.
    const m = filled().library!.machines.find(x => x.id === 'imm-100t')!;
    const scale = m.buildup.annualAvailableHours * m.buildup.machineUtilization;
    expect(m.computedRatePerHr).toBeCloseTo(10.06, 9);
    expect(m.buildup.maintenance / scale).toBeCloseTo(1.97, 6);
    expect(m.sourceNote).toContain('build-up as supplied');
  });

  it('back-solves a total-only row onto one line and says so', () => {
    const m = filled().library!.machines.find(x => x.id === 'imm-200t')!;
    expect(m.computedRatePerHr).toBeCloseTo(3.57, 9);
    expect(m.buildup.energy).toBe(0);
    expect(m.sourceNote).toContain('build-up not supplied');
  });

  it('takes the labour rate', () => {
    expect(filled().library!.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr)
      .toBeCloseTo(40.97, 9);
  });

  it('leaves everything unmapped exactly as it was', () => {
    // A partial rate card has to be safe — map the twenty materials you buy and
    // the other three hundred keep working.
    const r = filled().library!;
    expect(r.materials.find(m => m.id === 'mat-al6061')!.pricePerKg)
      .toBe(LIB.materials.find(m => m.id === 'mat-al6061')!.pricePerKg);
    expect(r.machines.find(m => m.id === 'mach-vmc5')!.computedRatePerHr)
      .toBeCloseTo(LIB.machines.find(m => m.id === 'mach-vmc5')!.computedRatePerHr, 6);
  });

  it('ignores a code that matches nothing on the rate card', () => {
    // A typo must not zero a rate. It keeps ours, and the Check tab counts it.
    const typo = recalculate(JLR, { 'mat-steel1045': '10080020999' });
    expect(parseRateLibraryWorkbook(typo).library!.materials.find(m => m.id === 'mat-steel1045')!.pricePerKg)
      .toBe(LIB.materials.find(m => m.id === 'mat-steel1045')!.pricePerKg);
  });
});

describe('cleanup', () => {
  it('removes the temporary workbook', () => {
    rmSync(dir, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
