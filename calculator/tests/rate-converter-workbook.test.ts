/**
 * The offline rate-card converter.
 *
 * JLR's rate card arrives in JLR's layout with JLR's labels; the upload wants
 * the tool's ids, because those ids are what the costing formulas ask for.
 * Retyping 548 numbers a quarter is both tedious and a source of mistakes, so
 * the converter workbook does it with formulas — no macro, which matters where
 * IT block .xlsm.
 *
 * WHAT THESE TESTS COVER, AND WHAT THEY CANNOT. They cover the pipeline: the
 * workbook parses, unmapped rows keep the tool's own values, and once the
 * lookups have resolved the parser reads JLR's numbers and the cost moves. They
 * CANNOT prove that Excel evaluates the formula strings the way I intend —
 * nothing here runs Excel. What reduces that risk is keeping the formulas
 * trivial (`IF($K2>0,$K2,3.62)`) and asserting their exact shape below, so a
 * change to the generator is visible rather than silent.
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
});

describe('the formulas stay simple enough to debug', () => {
  const wb = () => read();

  it('reads a rate from one helper column, not a nested lookup repeated', () => {
    // These were once the whole two-hop lookup inlined three times per machine
    // row: correct, unreadable, and slow over 178 rows.
    expect((wb().Sheets.Materials.D2 as XLSX.CellObject).f).toBe('IF($K2>0,$K2,3.62)');
    expect((wb().Sheets.Labour.D2 as XLSX.CellObject).f).toMatch(/^IF\(\$H2>0,\$H2,[\d.]+\)$/);
  });

  it('back-solves the machine build-up from a supplied £/hr', () => {
    // The tool derives £/hr from annual cost / (hours x utilisation) and ignores
    // any £/hr in the file, so a supplied rate has to be turned back into the
    // annual figure that returns it.
    expect((wb().Sheets.Machines.D2 as XLSX.CellObject).f).toMatch(/^IF\(\$O2>0,\$O2\*\d+\*[\d.]+,\d+\)$/);
  });

  it('says when a build-up is a placeholder rather than a real figure', () => {
    expect(String((wb().Sheets.Machines.M2 as XLSX.CellObject).f)).toContain('build-up not supplied');
  });

  it('uses INDEX/MATCH rather than XLOOKUP', () => {
    // XLOOKUP is missing from perpetual-licence Excel, which a plant may still
    // be on. INDEX/MATCH works everywhere.
    const helper = String((wb().Sheets.Materials.K2 as XLSX.CellObject).f);
    expect(helper).toContain('INDEX(');
    expect(helper).toContain('MATCH(');
    expect(helper).not.toContain('XLOOKUP');
  });
});

/**
 * Stand in for Excel: resolve each helper column the way its formula says, and
 * write the answer into the cached value. This proves the PIPELINE — parser,
 * fallbacks, costing — on the same cells Excel would fill. It does not prove
 * Excel's evaluation, which is why the shapes are asserted above.
 */
function recalculate(jlr: [string, string, number][], mapping: Record<string, string>): Buffer {
  const wb = read();
  wb.Sheets.JLRrates = XLSX.utils.aoa_to_sheet([
    ['category', 'your label', 'value', 'second value (materials: scrap £/kg)', 'note'],
    ...jlr.map(([cat, label, value]) => [cat, label, value, '', '']),
  ]);
  const rates = new Map(jlr.map(([, label, value]) => [label, value]));

  const resolve = (sheet: string, idCol: string, helperCol: string,
                   apply: (row: number, rate: number) => void) => {
    const ws = wb.Sheets[sheet];
    const range = XLSX.utils.decode_range(ws['!ref']!);
    for (let r = 2; r <= range.e.r + 1; r++) {
      const id = (ws[`${idCol}${r}`] as XLSX.CellObject | undefined)?.v as string | undefined;
      if (!id) continue;
      const label = mapping[id];
      const rate = label ? rates.get(label) ?? 0 : 0;
      const cell = ws[`${helperCol}${r}`] as XLSX.CellObject | undefined;
      if (cell) cell.v = rate;
      if (rate > 0) apply(r, rate);
    }
  };

  resolve('Materials', 'A', 'K', (r, rate) => { (wb.Sheets.Materials[`D${r}`] as XLSX.CellObject).v = rate; });
  resolve('Labour', 'A', 'H', (r, rate) => { (wb.Sheets.Labour[`D${r}`] as XLSX.CellObject).v = rate; });
  resolve('Machines', 'A', 'O', (r, rate) => {
    const ws = wb.Sheets.Machines;
    const hrs = (ws[`J${r}`] as XLSX.CellObject).v as number;
    const util = (ws[`K${r}`] as XLSX.CellObject).v as number;
    (ws[`D${r}`] as XLSX.CellObject).v = rate * hrs * util;
    for (const c of ['E', 'F', 'G', 'H', 'I']) (ws[`${c}${r}`] as XLSX.CellObject).v = 0;
    (ws[`M${r}`] as XLSX.CellObject).v = `JLR flat rate ${rate.toFixed(2)} per hr — build-up not supplied`;
  });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('once the lookups resolve, JLR’s numbers come through', () => {
  const filled = () => recalculate(
    [['material', 'JLR Steel 1045 bar', 1.9],
     ['machine', 'JLR CNC 3-axis machining', 62],
     ['labour', 'JLR skilled machinist', 44.5]],
    { 'mat-steel1045': 'JLR Steel 1045 bar',
      'mach-vmc3': 'JLR CNC 3-axis machining',
      'lab-uk-skilled': 'JLR skilled machinist' },
  );

  it('takes the material price', () => {
    const r = parseRateLibraryWorkbook(filled());
    expect(r.errors).toEqual([]);
    expect(r.library!.materials.find(m => m.id === 'mat-steel1045')!.pricePerKg).toBe(1.9);
  });

  it('returns the machine rate exactly, through the derivation', () => {
    // The whole point of the back-solve: 62 in, 62 out, via
    // annual cost / (hours x utilisation).
    const m = parseRateLibraryWorkbook(filled()).library!.machines.find(x => x.id === 'mach-vmc3')!;
    expect(m.computedRatePerHr).toBeCloseTo(62, 9);
    expect(m.sourceNote).toContain('build-up not supplied');
  });

  it('takes the labour rate', () => {
    expect(parseRateLibraryWorkbook(filled()).library!.labour.find(l => l.id === 'lab-uk-skilled')!
      .fullyLoadedRatePerHr).toBe(44.5);
  });

  it('leaves everything unmapped exactly as it was', () => {
    // A partial rate card has to be safe — map the twenty materials you buy and
    // the other three hundred keep working.
    const r = parseRateLibraryWorkbook(filled()).library!;
    expect(r.materials.find(m => m.id === 'mat-al6061')!.pricePerKg)
      .toBe(LIB.materials.find(m => m.id === 'mat-al6061')!.pricePerKg);
    expect(r.machines.find(m => m.id === 'mach-vmc5')!.computedRatePerHr)
      .toBeCloseTo(LIB.machines.find(m => m.id === 'mach-vmc5')!.computedRatePerHr, 6);
  });

  it('ignores a label that matches nothing on the rate card', () => {
    // A typo must not zero a rate. It keeps ours, and the Check tab counts it.
    const typo = recalculate([['material', 'JLR Steel 1045 bar', 1.9]],
                             { 'mat-steel1045': 'JLR Steel 1045 bar (typo)' });
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
