/**
 * The converter, actually recalculated.
 *
 * `rate-converter-workbook.test.ts` proves the pipeline by standing in for
 * Excel — it fills the helper columns the way the formulas say and checks what
 * comes out. That leaves one thing unproven: whether a spreadsheet evaluates
 * the formula strings the way they were intended. A COUNTIFS criterion that
 * silently matches nothing looks identical to a rate JLR did not supply.
 *
 * So this file hands the workbook to a real spreadsheet. LibreOffice Calc is
 * told to recalculate on load, JLR's own rows are pasted in, and the result is
 * read back through the tool's own upload parser. What it asserts is the whole
 * chain: paste -> filter -> lookup -> annualise -> upload -> derive, ending on
 * the £/hr JLR published.
 *
 * It SKIPS where `soffice` is not installed, which includes CI. That is the
 * same tiering as the real-parts baseline: the tier that needs a heavy
 * dependency runs where the dependency is, and the lighter tier runs
 * everywhere. Excel and Calc are not the same program, but a formula that
 * survives Calc is no longer merely plausible.
 *
 * The machine rows are JLR's own. 712008's fourteen columns are exactly as
 * supplied; the other codes and their totals are from the same card, and where
 * a breakdown was not supplied the elements here are constructed to exercise a
 * path — each is marked below.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as XLSX from 'xlsx';
import { parseRateLibraryWorkbook } from '../server/utils/rate-library-xlsx.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import type { RateLibrary } from '../src/engine/types.js';

const LIB = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const haveCalc = spawnSync('soffice', ['--version'], { encoding: 'utf8' }).status === 0;

const M_HEAD = ['MACHINE_CODE', 'MACHINE_NAME', 'COUNTRY_NAME', 'PERIOD_CODE', 'LABOUR_CATEGORY',
  'TOTAL_LABOUR_RATE', 'DEPRECIATION', 'FLOORSPACE', 'MRO', 'INSURANCE', 'INTEREST',
  'UTILITIES', 'CONSUMABLES', 'TOTAL_MACHINE_RATE'];

const JLR_MACHINES: unknown[][] = [
  // Verbatim from the rate card supplied.
  [712008, '100t Hydraulic Injection Moulding MC + EuroMap290 Inj Unit', 'United Kingdom',
   '04042025', 'CB', 40.97, 1.75, 1.06, 1.97, 0.18, 0.64, 4.45, 0, 10.06],
  // The same machine in another country. Constructed — the point is that the
  // country filter passes over it, and it would be picked first without one.
  [712008, '100t Hydraulic Injection Moulding MC + EuroMap290 Inj Unit', 'Slovakia',
   '04042025', 'SK1', 18.40, 0.88, 0.42, 0.91, 0.09, 0.31, 1.99, 0, 4.60],
  // Total from the card, elements left out — the back-solve path.
  [712063, '120t Injection Moulding MC', 'United Kingdom', '04042025', 'CB', 40.97,
   0, 0, 0, 0, 0, 0, 0, 3.57],
  // The same code twice under one country and period. Constructed, but exports
  // do carry duplicates, and the sheet must refuse rather than pick one.
  [712075, '1000t Injection Moulding MC', 'United Kingdom', '04042025', 'CB', 40.97,
   6.10, 1.80, 3.40, 0.30, 1.15, 6.50, 0, 19.25],
  [712075, '1000t Injection Moulding MC', 'United Kingdom', '04042025', 'CB', 40.97,
   6.10, 1.80, 3.40, 0.30, 1.15, 6.50, 0, 19.25],
];

const JLR_MATERIALS: unknown[][] = [
  // Verbatim from the rate card supplied.
  [10080020309, 'HSLA360 Steel Coil: <1mm Thickness', 'United Kingdom', '04-04-2025', 0.72, 40.48, 2.19],
  // Constructed, for the country filter.
  [10080020309, 'HSLA360 Steel Coil: <1mm Thickness', 'Slovakia', '04-04-2025', 0.61, 38.00, 2.40],
];

/** tool id -> JLR code, as somebody would type it on the Mapping tab. */
const MAPPING: Record<string, string | number> = {
  'mat-steel1045': 10080020309,
  'imm-100t': 712008,
  'imm-200t': 712063,     // the total-only row
  'imm-350t': 712075,     // the duplicated row — must stay on our own value
  'lab-uk-skilled': 'CB', // labour, read out of the machine tab
};

let dir = '';
let parsed: ReturnType<typeof parseRateLibraryWorkbook>;
let lib: RateLibrary;
let recalculated: XLSX.WorkBook;
let untouched: XLSX.WorkBook;

const set = (ws: XLSX.WorkSheet, addr: string, v: string | number) => {
  ws[addr] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v };
};

/**
 * Recalculate with LibreOffice.
 *
 * Calc keeps whatever cached values a file arrives with unless it is told
 * otherwise, and this workbook arrives with the fallbacks cached on purpose —
 * so without forcing a recalculation the answer would be "nothing changed",
 * which is exactly the failure this file exists to catch. The setting lives in
 * a throwaway profile so nothing on the machine is touched.
 */
function recalc(src: string, name = 'filled'): string {
  const home = join(dir, 'lo-profile');
  const user = join(home, '.config', 'libreoffice', '4', 'user');
  mkdirSync(user, { recursive: true });
  writeFileSync(join(user, 'registrymodifications.xcu'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<oor:items xmlns:oor="http://openoffice.org/2001/registry" ' +
    'xmlns:xs="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
    '<item oor:path="/org.openoffice.Office.Calc/Formula/Load">' +
    '<prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>\n' +
    '</oor:items>\n');
  const out = join(dir, `recalculated-${name}`);
  execFileSync('soffice', ['--headless', '--norestore', '--convert-to', 'xlsx', '--outdir', out, src],
               { env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 240_000 });
  return join(out, `${name}.xlsx`);
}

beforeAll(() => {
  if (!haveCalc) return;
  dir = mkdtempSync(join(tmpdir(), 'rate-conv-calc-'));
  const blank = join(dir, 'blank.xlsx');
  execFileSync('npx', ['tsx', join(__dirname, '..', 'scripts', 'build-rate-converter-xlsx.ts'), blank],
               { cwd: join(__dirname, '..'), encoding: 'utf8', timeout: 180_000 });

  // Do exactly what the instructions say: paste, set the filters, map the codes.
  const wb = XLSX.read(readFileSync(blank), { cellFormula: true });
  wb.Sheets['JLR Machines'] = XLSX.utils.aoa_to_sheet([M_HEAD, ...JLR_MACHINES]);
  wb.Sheets['JLR Materials'] = XLSX.utils.aoa_to_sheet([
    ['CODE', 'MATERIAL', 'COUNTRY', 'PERIOD', 'MATERIAL_RATE', 'MATERIAL_RECLAIM', 'CO2'],
    ...JLR_MATERIALS]);
  // Left empty on purpose: labour has to come out of the machine tab.
  wb.Sheets['JLR Labour'] = XLSX.utils.aoa_to_sheet([
    ['LABOUR_CATEGORY', 'DESCRIPTION', 'COUNTRY_NAME', 'PERIOD_CODE', 'TOTAL_LABOUR_RATE']]);

  set(wb.Sheets.Settings, 'B2', 'United Kingdom');
  set(wb.Sheets.Settings, 'B3', '04042025');      // as the machine card stamps it
  set(wb.Sheets.Settings, 'B4', '04-04-2025');    // as the material card stamps it
  set(wb.Sheets.Settings, 'B5', 'percent');

  const map = wb.Sheets.Mapping;
  const rows = XLSX.utils.decode_range(map['!ref']!).e.r + 1;
  for (let r = 2; r <= rows; r++) {
    const id = (map[`A${r}`] as XLSX.CellObject | undefined)?.v as string | undefined;
    if (id && id in MAPPING) set(map, `C${r}`, MAPPING[id]);
  }

  const filled = join(dir, 'filled.xlsx');
  writeFileSync(filled, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);

  untouched = XLSX.read(readFileSync(recalc(blank, 'blank')));
  const done = readFileSync(recalc(filled));
  recalculated = XLSX.read(done);
  parsed = parseRateLibraryWorkbook(done);
  lib = parsed.library!;
}, 400_000);

const d = haveCalc ? describe : describe.skip;

d('a real spreadsheet turns JLR’s card into an upload the tool accepts', () => {
  it('parses with no errors after recalculation', () => {
    expect(parsed.errors).toEqual([]);
    expect(lib).not.toBeNull();
  });

  it('lands on JLR’s published machine rate to the penny', () => {
    // 10.06 £/hr is what the card says for 712008. Everything in between —
    // the country filter, the seven lookups, x3200 on the way in and /3200 on
    // the way out — has to cancel exactly for this to hold.
    const m = lib.machines.find(x => x.id === 'imm-100t')!;
    expect(m.computedRatePerHr).toBeCloseTo(10.06, 9);
  });

  it('keeps the build-up rather than flattening it', () => {
    // The point of mapping element by element: a report can still show what the
    // rate is made of. 3200 = 4000 annual hours x 0.8 utilisation, the tool's
    // own figures for this machine.
    const b = lib.machines.find(x => x.id === 'imm-100t')!.buildup;
    const perHr = (v: number) => v / (b.annualAvailableHours * b.machineUtilization);
    expect(perHr(b.maintenance)).toBeCloseTo(1.97, 6);   // MRO
    expect(perHr(b.energy)).toBeCloseTo(4.45, 6);        // UTILITIES
    expect(perHr(b.floorSpace)).toBeCloseTo(1.06, 6);    // FLOORSPACE
    expect(perHr(b.financeCost)).toBeCloseTo(0.64, 6);   // INTEREST
    expect(perHr(b.indirectSupport)).toBeCloseTo(0.18, 6); // INSURANCE + CONSUMABLES
    // Depreciation is 1.75 plus the penny by which JLR's seven elements fall
    // short of their own total, so the rebuilt rate equals the published one.
    expect(perHr(b.annualDepreciation)).toBeCloseTo(1.76, 6);
    expect(lib.machines.find(x => x.id === 'imm-100t')!.sourceNote)
      .toContain('build-up as supplied');
  });

  it('takes the country the filter asked for, not the first row found', () => {
    // Slovakia sits above nothing and below nothing in particular; without the
    // filter a plain MATCH would be a coin toss. 4.60 must not appear.
    expect(lib.machines.find(x => x.id === 'imm-100t')!.computedRatePerHr).not.toBeCloseTo(4.60, 2);
    expect(lib.materials.find(m => m.id === 'mat-steel1045')!.pricePerKg).toBe(0.72);
  });

  it('back-solves a row that gives only a total, and says so', () => {
    const m = lib.machines.find(x => x.id === 'imm-200t')!;
    expect(m.computedRatePerHr).toBeCloseTo(3.57, 9);
    expect(m.buildup.maintenance).toBe(0);
    expect(m.sourceNote).toContain('build-up not supplied');
  });

  it('refuses a code that matches two pasted rows', () => {
    // Both rows say 19.25, so taking either would have been right — and that is
    // exactly why this has to be tested on a case where guessing looks safe.
    const m = lib.machines.find(x => x.id === 'imm-350t')!;
    expect(m.computedRatePerHr).toBeCloseTo(LIB.machines.find(x => x.id === 'imm-350t')!.computedRatePerHr, 6);
    expect(m.computedRatePerHr).not.toBeCloseTo(19.25, 2);
  });

  it('reads MATERIAL_RECLAIM as the percentage Settings says it is', () => {
    // 0.72 x 40.48% = 0.291456. Read as £/kg it would be 40.48 — a scrap credit
    // fifty times the price of the material, which is why this is a setting and
    // not a guess.
    const m = lib.materials.find(x => x.id === 'mat-steel1045')!;
    expect(m.scrapRecoveryPricePerKg).toBeCloseTo(0.72 * 40.48 / 100, 9);
    expect(m.sourceNote).toContain('10080020309');
  });

  it('finds the labour rate inside the machine export', () => {
    // The JLR Labour tab was left empty. TOTAL_LABOUR_RATE 40.97 against
    // LABOUR_CATEGORY CB is the only place this number exists.
    expect(lib.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr).toBeCloseTo(40.97, 9);
  });

  it('leaves every unmapped row exactly as the tool ships it', () => {
    expect(lib.materials.find(m => m.id === 'mat-ss316l')!.pricePerKg)
      .toBe(LIB.materials.find(m => m.id === 'mat-ss316l')!.pricePerKg);
    expect(lib.machines.find(m => m.id === 'mach-vmc3')!.computedRatePerHr)
      .toBeCloseTo(LIB.machines.find(m => m.id === 'mach-vmc3')!.computedRatePerHr, 6);
    expect(lib.labour.find(l => l.id === 'lab-uk-engineer')!.fullyLoadedRatePerHr)
      .toBe(LIB.labour.find(l => l.id === 'lab-uk-engineer')!.fullyLoadedRatePerHr);
    expect(lib.materials).toHaveLength(LIB.materials.length);
    expect(lib.machines).toHaveLength(LIB.machines.length);
  });
});

/**
 * Every cell, evaluated, with nothing pasted in.
 *
 * This is the guard for a whole class of bug rather than one case: a formula
 * that a spreadsheet cannot evaluate shows as #VALUE! or #NAME? in the file
 * somebody opens, and the generator has no way of noticing. It caught two —
 * source notes quoting Xiaomi's "Titan Metal" and a "die-casting cluster",
 * where the quote had been escaped the JSON way, backslash instead of doubled.
 */
d('the workbook a person opens has no broken cells in it', () => {
  it('recalculates every formula without producing an error', () => {
    const ERR: Record<number, string> = { 0: '#NULL!', 7: '#DIV/0!', 15: '#VALUE!', 23: '#REF!',
                                          29: '#NAME?', 36: '#NUM!', 42: '#N/A' };
    const broken: string[] = [];
    for (const name of untouched.SheetNames) {
      const ws = untouched.Sheets[name];
      for (const addr of Object.keys(ws)) {
        if (addr.startsWith('!')) continue;
        const c = ws[addr] as XLSX.CellObject;
        if (c.t === 'e') broken.push(`${name}!${addr} ${ERR[c.v as number] ?? c.v}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('keeps a source note that contains a quotation mark intact', () => {
    // The two rows that were #VALUE!. Reading the text back proves the fix went
    // the right way — an empty string would also have cleared the error.
    const notes = XLSX.utils.sheet_to_json<Record<string, unknown>>(untouched.Sheets.Materials)
      .map(r => String(r.sourceNote ?? ''));
    expect(notes.some(n => n.includes('"Titan Metal"'))).toBe(true);
    const mach = XLSX.utils.sheet_to_json<Record<string, unknown>>(untouched.Sheets.Machines)
      .map(r => String(r.sourceNote ?? ''));
    expect(mach.some(n => n.includes('"die-casting cluster"'))).toBe(true);
  });
});

d('the Check tab reports what actually happened', () => {
  // By label, not by cell address — the tab gains lines, and a test that has to
  // be renumbered every time is a test that stops being read.
  const v = (label: string) => {
    const rows = XLSX.utils.sheet_to_json(recalculated.Sheets.Check, { header: 1 }) as unknown[][];
    const row = rows.find(r => String(r[0] ?? '').startsWith(label));
    if (!row) throw new Error(`no line on the Check tab starting "${label}"`);
    return row[1];
  };

  it('counts the codes filled in, and finds none of them wrong', () => {
    expect(v('Codes you have filled in')).toBe(Object.keys(MAPPING).length);
    expect(v('…of those, codes not found')).toBe(0);
  });

  it('counts the rates that actually arrived', () => {
    expect(v('Materials taking a JLR price')).toBe(1);
    expect(v('Machines taking a JLR rate')).toBe(2);   // 712008 and 712063
    expect(v('Labour grades taking a JLR rate')).toBe(1);
    expect(v('Codes that found their row but the rate')).toBe(0);
  });

  it('reports the duplicate rather than hiding it', () => {
    // The one number on this tab allowed to be non-zero here, because the
    // fixture deliberately contains a duplicate.
    expect(v('Codes matching MORE than one')).toBe(1);
  });

  it('confirms every rebuilt rate returns JLR’s own total', () => {
    expect(v('Machines whose rebuilt')).toBe(0);
  });

  it('finds JLR’s card consistent with itself', () => {
    // 712008's seven elements come to 10.05 against a stated 10.06 — a penny of
    // rounding, inside the tolerance. A real disagreement would show here.
    expect(v('Pasted machine rows whose 7 elements')).toBe(0);
  });
});
