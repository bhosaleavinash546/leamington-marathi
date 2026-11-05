/**
 * Rates flow, round R1 (Nov 2026) — the company rate book reaches the cost correctly.
 *
 * Audit: scratchpad rates-flow/trace.md (gap register P0-1 … P2-8). Each block fails on the code before R1:
 *  1 merge by id (the company book replaced the built-in whole), the template (country rows pre-filled and frozen),
 *    "changed" = a value different from the built-in (unchanged rows keep following refreshes);
 *  4 the UK energy tariff by id (it was `energy[0]`);
 *  5 no silent UK fallback in `activeMachineRate` / `activeLabourRate`;
 *  6 precedence override > company > built-in;
 *  7 validation (zero, hours, utilisation 80 → "use 0.80", text / currency symbols, duplicates, unknown ids, sheets,
 *    columns, currency) with sheet / row / column in every message;
 *  9 the PCB cache key carries the PCB country overrides; `bulk-cost --rates` applies the Aliases sheet.
 * The routes (upload, status, audit, caches, a real part costed through the server) are in rates-flow-r1-routes.test.ts.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import {
  resolveActiveLibrary, mergeCompanyRows, companyDelta, companyRowReport, rateValueError,
} from '../src/engine/rate-library-merge.js';
import { buildRateLibraryWorkbook, parseRateLibraryWorkbook, bookFromWorkbook } from '../server/utils/rate-library-xlsx.js';
import { fingerprintRateLibrary } from '../server/utils/rate-library-fingerprint.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { withRates, activeMachineRate, activeLabourRate, activeElectricityPerKwh } from '../src/engine/rate-context.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { bookEnergyTariff } from '../src/engine/book-tariff.js';
import type { RateLibrary, UniversalStackInput } from '../src/engine/types.js';
import { rateBookStampLabel, retireLocalRateCopy, adoptServerBook } from '../src/ui/rate-book-sync.js';

const LIB = DEFAULT_RATE_LIBRARY;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The template as a SheetJS workbook, edited cell by cell, back to a buffer. */
function editTemplate(edit: (wb: XLSX.WorkBook) => void, lib: RateLibrary = LIB): Buffer {
  const wb = XLSX.read(buildRateLibraryWorkbook(lib, { template: true }), { type: 'buffer' });
  edit(wb);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}
/** Set column `col` of the row whose id is `id` on `sheet`. */
function setCell(wb: XLSX.WorkBook, sheet: string, id: string, col: string, value: unknown): number {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1 });
  const c = (rows[0] as string[]).indexOf(col);
  const r = rows.findIndex(x => (x as unknown[])[0] === id);
  if (c < 0 || r < 0) throw new Error(`no ${sheet}!${id}.${col}`);
  XLSX.utils.sheet_add_aoa(wb.Sheets[sheet], [[value]], { origin: { r, c } });
  return r + 1;   // the Excel row number
}
function appendRow(wb: XLSX.WorkBook, sheet: string, cells: Record<string, unknown>): number {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1 });
  const head = rows[0] as string[];
  XLSX.utils.sheet_add_aoa(wb.Sheets[sheet], [head.map(h => cells[h] ?? '')], { origin: -1 });
  return rows.length + 1;
}

describe('1 · the company book is merged by id over the built-in', () => {
  it('a company row overrides the built-in row with its id; every other row stays built-in', () => {
    const vmc = LIB.machines.find(m => m.id === 'mach-vmc3')!;
    const company = { ...clone(LIB), materials: [], labour: [], energy: [], fx: [], overheadDefaults: [],
      machines: [{ ...clone(vmc), buildup: { ...vmc.buildup, annualDepreciation: vmc.buildup.annualDepreciation * 2 } }] };
    const { library } = resolveActiveLibrary({ builtIn: LIB, company, source: 'company' });
    expect(library.machines.find(m => m.id === 'mach-vmc3')!.buildup.annualDepreciation).toBe(vmc.buildup.annualDepreciation * 2);
    // Before R1 the company book WAS the book: an id it did not carry was "not found".
    expect(library.machines).toHaveLength(LIB.machines.length);
    expect(library.materials).toHaveLength(LIB.materials.length);
    expect(library.labour.find(l => l.id === 'lab-uk-skilled')).toEqual(LIB.labour.find(l => l.id === 'lab-uk-skilled'));
  });

  it('a built-in refresh (a new engine id, a re-priced row) keeps flowing to a company deployment', () => {
    // The company uploaded against today's book and changed one material.
    const company = companyDelta(LIB, { ...clone(LIB), materials: LIB.materials.map((m, i) => i === 0 ? { ...m, pricePerKg: m.pricePerKg + 1 } : m) });
    expect(company.materials).toHaveLength(1);
    expect(company.machines).toHaveLength(0);
    // Next release: a new foundry machine, and a refreshed price on a row the company did not change.
    const refreshed = clone(LIB);
    refreshed.machines.push({ ...clone(LIB.machines[0]), id: 'sand-new-line-2027' });
    refreshed.materials[1].pricePerKg += 0.5;
    const { library } = resolveActiveLibrary({ builtIn: refreshed, company, source: 'company' });
    expect(library.machines.some(m => m.id === 'sand-new-line-2027')).toBe(true);
    expect(library.materials[1].pricePerKg).toBe(refreshed.materials[1].pricePerKg);          // follows the refresh
    expect(library.materials[0].pricePerKg).toBe(LIB.materials[0].pricePerKg + 1);            // the company's, pinned
  });

  it('with no company rows the merge IS the built-in book (no cost can move)', () => {
    const empty = companyDelta(LIB, clone(LIB));
    const merged = resolveActiveLibrary({ builtIn: LIB, company: empty, source: 'company' }).library;
    expect(fingerprintRateLibrary(merged)).toBe(fingerprintRateLibrary(LIB));
    expect(resolveActiveLibrary({ builtIn: LIB, source: 'builtin' }).library).toBe(LIB);
  });

  it('a new id is appended; the report lists changed, added and what is left built-in', () => {
    const company = { ...clone(LIB), materials: [{ ...clone(LIB.materials[0]), id: 'mat-company-own', pricePerKg: 9 },
      { ...clone(LIB.materials[1]), pricePerKg: LIB.materials[1].pricePerKg + 0.25 }], machines: [], labour: [], energy: [], fx: [], overheadDefaults: [] };
    const merged = mergeCompanyRows(LIB, company);
    expect(merged.materials.at(-1)!.id).toBe('mat-company-own');
    const r = companyRowReport(LIB, company);
    expect(r.added).toEqual([{ table: 'materials', id: 'mat-company-own' }]);
    expect(r.changed).toEqual([{ table: 'materials', id: LIB.materials[1].id, fields: ['pricePerKg'] }]);
    expect(r.leftBuiltIn.materials).toBe(LIB.materials.length - 1);
    expect(r.leftBuiltIn.machines).toBe(LIB.machines.length);
  });
});

describe('1 · the template and the "changed" rule', () => {
  const tpl = XLSX.read(buildRateLibraryWorkbook(LIB, { template: true }), { type: 'buffer' });
  const ids = (sheet: string) => XLSX.utils.sheet_to_json<{ id: string }>(tpl.Sheets[sheet]).map(r => r.id);

  it('does not pre-fill country rows; keeps the base UK rows', () => {
    expect(ids('Labour').some(id => /^lab-(?!uk-)[a-z]{2}-/.test(id))).toBe(false);
    expect(ids('Labour')).toContain('lab-uk-skilled');
    expect(ids('Energy')).toEqual(['energy-uk']);
    expect(ids('Machines')).toContain('mach-vmc3');
    expect(ids('Machines')).not.toContain('mach-vmc3-cn');
    expect(ids('Materials')).toHaveLength(LIB.materials.length);
  });

  it('says in its Instructions sheet that unchanged rows are ignored and what "changed" means', () => {
    expect(tpl.SheetNames[0]).toBe('Instructions');
    const text = XLSX.utils.sheet_to_json<unknown[]>(tpl.Sheets.Instructions, { header: 1 }).flat().join(' ');
    expect(text).toMatch(/Unchanged rows are ignored/i);
    expect(text).toMatch(/keeps following future built-in refreshes/);
    expect(text).toMatch(/A value different from the built-in value/);
    expect(text).toMatch(/CLEARS every cell override/);
    expect(text).toMatch(/override > company row > built-in/);
  });

  it('an untouched template stores nothing; a sourceNote-only edit is not a change; a price edit is', () => {
    const untouched = parseRateLibraryWorkbook(buildRateLibraryWorkbook(LIB, { template: true }));
    expect(untouched.errors).toEqual([]);
    expect(untouched.report!.changed).toEqual([]);
    expect(untouched.delta!.materials).toEqual([]);
    const id = LIB.materials[3].id;
    const noteOnly = parseRateLibraryWorkbook(editTemplate(wb => { setCell(wb, 'Materials', id, 'sourceNote', 'our buyer said so'); }));
    expect(noteOnly.report!.changed).toEqual([]);
    const priced = parseRateLibraryWorkbook(editTemplate(wb => { setCell(wb, 'Materials', id, 'pricePerKg', 7.25); }));
    expect(priced.report!.changed).toEqual([{ table: 'materials', id, fields: ['pricePerKg'] }]);
    expect(priced.delta!.materials).toHaveLength(1);
    // the built-in's source note is not left on the company's figure
    expect(priced.delta!.materials[0].sourceNote).toBe('Company rate book (uploaded workbook)');
  });
});

describe('7 · the parser refuses garbage, naming sheet, row and column', () => {
  const errs = (edit: (wb: XLSX.WorkBook) => void) => parseRateLibraryWorkbook(editTemplate(edit)).errors;

  it('a zero price, a zero labour rate, zero hours', () => {
    let row = 0;
    expect(errs(wb => { row = setCell(wb, 'Materials', 'mat-al6082-bar', 'pricePerKg', 0); }))
      .toContain(`Materials row ${row}, column pricePerKg: 0 must be more than 0 (a zero rate would cost the item free).`);
    expect(errs(wb => { row = setCell(wb, 'Labour', 'lab-uk-skilled', 'fullyLoadedRatePerHr', 0); })[0]).toMatch(/^Labour row \d+, column fullyLoadedRatePerHr: 0 must be more than 0/);
    expect(errs(wb => { row = setCell(wb, 'Machines', 'mach-vmc3', 'annualAvailableHours', 0); }))
      .toContain(`Machines row ${row}, column annualAvailableHours: 0 must be more than 0 hours.`);
  });

  it('utilisation typed as a percentage: 80 → "use 0.80"; ≤ 0 refused', () => {
    let row = 0;
    expect(errs(wb => { row = setCell(wb, 'Machines', 'mach-vmc3', 'machineUtilization', 80); }))
      .toContain(`Machines row ${row}, column machineUtilization: 80 looks like a percentage — use 0.80.`);
    expect(errs(wb => { setCell(wb, 'Machines', 'mach-vmc3', 'machineUtilization', 0); })[0]).toMatch(/machineUtilization: 0 must be more than 0/);
  });

  it('text or a currency symbol in a number cell (it used to be stripped and booked as £)', () => {
    let row = 0;
    expect(errs(wb => { row = setCell(wb, 'Materials', 'mat-al6082-bar', 'pricePerKg', '€12.50'); }))
      .toContain(`Materials row ${row}, column pricePerKg: '€12.50' is text — type the number only (no £ / € / $ signs, thousands separators or units).`);
    expect(errs(wb => { setCell(wb, 'Labour', 'lab-uk-skilled', 'fullyLoadedRatePerHr', '1,234.5'); })[0]).toMatch(/'1,234\.5' is text/);
    // a plain number stored as text is unambiguous
    expect(errs(wb => { setCell(wb, 'Labour', 'lab-uk-skilled', 'fullyLoadedRatePerHr', '31.5'); })).toEqual([]);
  });

  it('a currency other than GBP on a base-book row', () => {
    let row = 0;
    expect(errs(wb => { row = setCell(wb, 'Labour', 'lab-uk-skilled', 'currency', 'EUR'); })[0])
      .toBe(`Labour row ${row}, column currency: 'EUR' — the base book is in GBP: write GBP and the figure in pounds (country rows in their own currency come with the country sheets).`);
  });

  it('duplicate ids; an unknown id where the sheet takes only template ids; a new row missing a field', () => {
    let row = 0;
    const dup = errs(wb => { row = appendRow(wb, 'Labour', { id: 'lab-uk-skilled', skillLevel: 'Skilled', fullyLoadedRatePerHr: 30, currency: 'GBP' }); });
    expect(dup[0]).toMatch(new RegExp(`^Labour row ${row}, column id: duplicate id 'lab-uk-skilled' \\(first on row \\d+\\)\\.$`));
    expect(errs(wb => { row = appendRow(wb, 'Energy', { id: 'energy-xx', electricityPerKwh: 0.2, gasPerKwh: 0.05, currency: 'GBP' }); }))
      .toContain(`Energy row ${row}, column id: unknown id 'energy-xx' — the Energy sheet takes only the template's ids.`);
    const newMat = errs(wb => { row = appendRow(wb, 'Materials', { id: 'mat-ours', grade: 'Our alloy', category: 'Aluminum', pricePerKg: 3, scrapRecoveryPricePerKg: 1, densityKgPerM3: 2700, currency: 'GBP' }); });
    expect(newMat[0]).toMatch(new RegExp(`^Materials row ${row}, column category: 'Aluminum' is not a category the built-in book uses`));
    // a well-formed new material is accepted and reported as added
    const ok = parseRateLibraryWorkbook(editTemplate(wb => { appendRow(wb, 'Materials', { id: 'mat-ours', grade: 'Our alloy', category: LIB.materials[0].category, pricePerKg: 3, scrapRecoveryPricePerKg: 1, densityKgPerM3: 2700, currency: 'GBP' }); }));
    expect(ok.errors).toEqual([]);
    expect(ok.report!.added).toEqual([{ table: 'materials', id: 'mat-ours' }]);
  });

  it('a missing required sheet or column', () => {
    const noEnergy = errs(wb => { delete wb.Sheets.Energy; wb.SheetNames = wb.SheetNames.filter(n => n !== 'Energy'); });
    expect(noEnergy).toContain('Energy: sheet is missing — start from the template (GET /api/rate-library/template).');
    const noCurrency = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(noCurrency, XLSX.utils.aoa_to_sheet([['id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3']]), 'Materials');
    const e = parseRateLibraryWorkbook(XLSX.write(noCurrency, { bookType: 'xlsx', type: 'buffer' }) as Buffer).errors;
    expect(e).toContain('Materials row 1, column currency: column is missing — start from the template (GET /api/rate-library/template).');
  });

  it('the override route and the parser share one rule', () => {
    expect(rateValueError('buildup.machineUtilization', 80)).toBe('looks like a percentage — use 0.80');
    expect(rateValueError('buildup.annualAvailableHours', 0)).toBe('must be more than 0 hours');
    expect(rateValueError('scrapRecoveryPricePerKg', 0)).toBeNull();   // a zero scrap credit is a real answer
  });
});

describe('4 · the UK energy tariff is picked by id, never the first row', () => {
  // A company sheet sorted by id puts energy-cn first.
  const shuffled: RateLibrary = { ...LIB, energy: [...LIB.energy].sort((a, b) => a.id.localeCompare(b.id)) };
  const uk = LIB.energy.find(e => e.id === 'energy-uk')!;

  it('the stack prices kWh at energy-uk', () => {
    expect(shuffled.energy[0].id).not.toBe('energy-uk');
    const withKwh: UniversalStackInput = {
      partName: 'kWh probe', rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65, energyKwh: { electricity: 10, gas: 0 } },
      operations: [{ operationName: 'Mill', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.1, partsPerCycle: 1,
        oee: 0.85, manning: 1, labourTimeHr: 0.1, labourEfficiency: 0.92 }],
      tooling: { totalToolingCost: 0, amortizationVolume: 1, mode: 'amortized' },
      packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08,
    } as UniversalStackInput;
    const lib = recomputeMachineRates(shuffled);
    const line = computeUniversalStack(withKwh, lib).traceability.find(t => t.field === 'rawMaterial.energyKwh.electricity')!;
    expect(line.rateId).toBe('energy-uk');
    expect(line.value).toBeCloseTo(10 * uk.electricityPerKwh, 12);
  });

  it('module fallbacks (activeElectricityPerKwh) too; a country book uses its own energy-<cc>', () => {
    expect(withRates(shuffled, () => activeElectricityPerKwh())).toBe(uk.electricityPerKwh);
    const cn = buildRegionalLibrary(recomputeMachineRates(LIB), 'CN');
    expect(bookEnergyTariff(cn).id).toBe('energy-cn');
    expect(withRates({ ...LIB, energy: [] }, () => { try { activeElectricityPerKwh(); return 'priced'; } catch (e) { return (e as Error).message; } }))
      .toBe("Energy tariff 'energy-uk' not found in rate library");
  });
});

describe('5 · no silent UK fallback for a missing machine or labour id', () => {
  const lacking: RateLibrary = { ...LIB, machines: LIB.machines.filter(m => m.id !== 'mach-vmc3'), labour: LIB.labour.filter(l => l.id !== 'lab-uk-engineer') };
  it('fails the way the stack does instead of pricing at the built-in UK row', () => {
    expect(() => withRates(lacking, () => activeMachineRate('mach-vmc3'))).toThrow("Machine 'mach-vmc3' not found in rate library");
    expect(() => withRates(lacking, () => activeLabourRate('lab-uk-engineer'))).toThrow("Labour rate 'lab-uk-engineer' not found in rate library");
  });
  it('a merged company book cannot lose a built-in id', () => {
    const merged = resolveActiveLibrary({ builtIn: LIB, company: { ...lacking, machines: [], labour: [] }, source: 'company' }).library;
    expect(withRates(merged, () => activeMachineRate('mach-vmc3'))).toBe(LIB.machines.find(m => m.id === 'mach-vmc3')!.computedRatePerHr);
  });
});

describe('6 · precedence: cell override > company row > built-in', () => {
  it('each layer wins over the one below it', () => {
    const id = 'lab-uk-skilled';
    const builtIn = LIB.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;
    const company = { ...clone(LIB), materials: [], machines: [], energy: [], fx: [], overheadDefaults: [],
      labour: [{ ...clone(LIB.labour.find(l => l.id === id)!), fullyLoadedRatePerHr: builtIn + 3 }] };
    const rate = (o: Parameters<typeof resolveActiveLibrary>[0]) => resolveActiveLibrary(o).library.labour.find(l => l.id === id)!.fullyLoadedRatePerHr;
    expect(rate({ builtIn: LIB, source: 'builtin' })).toBe(builtIn);
    expect(rate({ builtIn: LIB, company, source: 'company' })).toBe(builtIn + 3);
    expect(rate({ builtIn: LIB, company, source: 'company', overrides: [{ table: 'labour', id, field: 'fullyLoadedRatePerHr', value: 99 }] })).toBe(99);
    expect(rate({ builtIn: LIB, company, source: 'builtin', overrides: [{ table: 'labour', id, field: 'fullyLoadedRatePerHr', value: 99 }] })).toBe(99);
  });
});

describe('9 · other caches and readers', () => {
  it('bulk-cost --rates reads the Aliases sheet (the book the upload would make)', () => {
    const buf = editTemplate(wb => { appendRow(wb, 'Aliases', { kind: 'machine', slot: 'mach-vmc3', useId: 'mach-haas-vf2', note: 'our VF2' }); });
    const { library, errors } = bookFromWorkbook(buf);
    expect(errors).toEqual([]);
    const slot = library!.machines.find(m => m.id === 'mach-vmc3')!;
    expect(slot.computedRatePerHr).toBe(LIB.machines.find(m => m.id === 'mach-haas-vf2')!.computedRatePerHr);
    expect(slot.sourceNote).toMatch(/^mach-haas-vf2/);
  });

  it('the PCB analysis cache key changes with the PCB country overrides', async () => {
    const { pcbCacheKey } = await import('../server/routes/pcb.js');
    const { applyPCBCountryRateOverrides } = await import('../server/data/pcb-country-rates.js');
    const req = { body: { country: 'cn', orderQty: '100' } } as never;
    const before = pcbCacheKey(req, undefined, false, []);
    try {
      const r = applyPCBCountryRateOverrides({ cn: { smtLineRatePerHr: 999 } });
      expect(r.appliedPaths.length + r.rejectedPaths.length).toBeGreaterThan(0);
      if (r.appliedPaths.length) expect(pcbCacheKey(req, undefined, false, [])).not.toBe(before);
    } finally { applyPCBCountryRateOverrides({}); }
    expect(pcbCacheKey(req, undefined, false, [])).toBe(before);
  });
});

describe('3 · the screen follows the server book', () => {
  it('adopts /active whatever its source (it adopted only "company")', () => {
    const a = adoptServerBook({ library: LIB, source: 'builtin', fingerprint: 'abcdef0123456789', label: 'built-in + 1 cell override', overrideCount: 1 });
    expect(a!.library).toBe(LIB);
    expect(a!.info).toEqual({ fingerprint: 'abcdef0123456789', label: 'built-in + 1 cell override', source: 'builtin', overrideCount: 1 });
    const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
    expect(main).not.toMatch(/data\.source === 'company' && data\.library/);
    expect(main).not.toMatch(/saveLibraryToStorage|getLibraryFromStorage/);   // no browser-local copy is read or written
    expect(main).toMatch(/window\.addEventListener\('focus', \(\) => \{ void recheckServerBook\(\); \}\)/);
  });

  it('a browser-local copy is retired to a backup and never read again', () => {
    const store = new Map<string, string>([['shouldCostRateLibrary', JSON.stringify({ version: '2.1.0' })]]);
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
    expect(retireLocalRateCopy(s)).toMatch(/Rates now always come from the server's rate book/);
    expect(store.has('shouldCostRateLibrary')).toBe(false);
    expect(store.get('shouldCostRateLibrary.backup-2.1.0')).toBe(JSON.stringify({ version: '2.1.0' }));
    expect(retireLocalRateCopy(s)).toBe('');
  });

  it('the rate table is read only (no per-browser edits)', () => {
    const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(main).not.toMatch(/data-update="material\.|function applyRateLibraryEdits/);
    expect(html).not.toMatch(/apply-rates-btn|reset-rates-btn/);
    expect(html).toMatch(/the server's rate book \(read only\)/);
  });
});

describe('8 · the stamp names the resolved book by fingerprint and label', () => {
  it('prints the version first (stampNamesBook reads it), then the label and the short fingerprint', () => {
    const s = rateBookStampLabel('United Kingdom', '2.2.0', { fingerprint: '1a2b3c4d5e6f7a8b', label: 'company book: 3 changed, 1 added', source: 'company', overrideCount: 0 });
    expect(s).toBe('United Kingdom rate book v2.2.0 · company book: 3 changed, 1 added · book 1a2b3c4d');
    expect(/\bUnited Kingdom rate book v\d+(?:\.\d+)*(?![-\w.])/.test(s)).toBe(true);
    expect(rateBookStampLabel('China', '2.2.0-CN', null)).toBe('China rate book v2.2.0-CN · not checked against a server book');
    const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/rateBook: rateBookStampLabel\(country, library\.version, _resultBook \?\? _serverBook\)/);
  });
});

describe('4b · electricity inside a machine £/h follows the book tariff', () => {
  it('a changed energy-uk moves every UK machine £/h by its kWh × Δtariff; the built-in book does not move', async () => {
    const { UK_ELECTRICITY_GBP_PER_KWH } = await import('../src/engine/uk-energy.js');
    const { computeMachineRateFromBuildup, machineEnergyFactor } = await import('../src/engine/rate-library.js');
    expect(machineEnergyFactor(LIB)).toBe(1);
    const base = recomputeMachineRates(LIB);
    for (const m of base.machines) expect(m.computedRatePerHr).toBe(computeMachineRateFromBuildup(m.buildup));
    const dearer: RateLibrary = { ...LIB, energy: LIB.energy.map(e => e.id === 'energy-uk' ? { ...e, electricityPerKwh: 0.2002 } : e) };
    const after = recomputeMachineRates(dearer);
    const autoclave = LIB.machines.find(m => m.buildup.energy > 20_000)!;
    const b = autoclave.buildup;
    const kwh = b.energy / UK_ELECTRICITY_GBP_PER_KWH;
    const want = base.machines.find(m => m.id === autoclave.id)!.computedRatePerHr + kwh * (0.2002 - 0.182) / (b.annualAvailableHours * b.machineUtilization);
    expect(after.machines.find(m => m.id === autoclave.id)!.computedRatePerHr).toBeCloseTo(want, 10);
    // a country book's machine energy is already at its own tariff (buildRegionalLibrary) — not re-scaled
    const cn = buildRegionalLibrary(base, 'CN');
    expect(recomputeMachineRates(cn).machines.map(m => m.computedRatePerHr)).toEqual(cn.machines.map(m => computeMachineRateFromBuildup(m.buildup)));
  });
});
