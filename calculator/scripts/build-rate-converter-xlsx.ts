/**
 * Build the offline rate-card converter workbook.
 *
 *   npx tsx scripts/build-rate-converter-xlsx.ts [out.xlsx]
 *
 * THE PROBLEM IT SOLVES. JLR's rate card arrives in JLR's own layout with
 * JLR's own labels. The tool's upload template wants its own ids — `mat-steel1045`,
 * `mach-vmc3`, `lab-uk-skilled` — because those ids are what the costing formulas
 * ask for. Nobody wants to retype 328 materials, 178 machines and 42 labour
 * grades every quarter, and a human retyping 548 numbers will make mistakes.
 *
 * HOW IT WORKS. Three tabs do the work:
 *
 *   JLRrates   paste the rate card here: category, your label, the number
 *   Mapping    one row per tool id, pre-filled with what it is. Type YOUR
 *              label next to the ones you have. Leave the rest blank.
 *   Materials / Machines / Labour / Energy / FX / Overhead
 *              the tool's exact upload format, filled by formula from the two
 *              tabs above. This is the file you upload.
 *
 * NO MACRO. Everything is INDEX/MATCH, so it opens in any Excel and needs no
 * macro permission — which matters where IT block .xlsm. Verified: the upload
 * parser reads a formula cell's cached value, so a formula workbook uploads as
 * cleanly as a typed one.
 *
 * NO HARDCODING, AND NOTHING LOST. Every row falls back to the tool's own value
 * when JLR have not mapped it, so a partial rate card is fine — map the twenty
 * materials you buy and the rest keep working. Next quarter is paste, refresh,
 * upload. Nobody edits code.
 *
 * MACHINES. The tool never takes £/hr from a file — it derives it from
 * annual cost / (hours x utilisation), and the field is on the protected list.
 * So if JLR supply a flat £/hr the workbook back-solves it: it keeps the
 * built-in hours and utilisation and puts the implied annual cost on one line,
 * which returns exactly the supplied rate. That line is then not a real
 * depreciation figure and the sheet says so in the source note, because a
 * number that looks like a build-up but is not is worse than an obvious
 * placeholder. Supply a real build-up in the seven columns and it is used as-is.
 */
import * as XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';

const LIB = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const OUT = process.argv[2] ?? 'CostVision-JLR-Rate-Converter.xlsx';

/**
 * The rate JLR gave for this row, or 0 when they gave none.
 *
 * Two hops on purpose. `Mapping` answers "what does JLR call this?" and
 * `JLRrates` answers "what is that worth?", so next quarter's card is pasted in
 * untouched and only the numbers move.
 *
 * This goes in a HELPER COLUMN and every other column points at it. Inlining it
 * meant the machine formulas carried the whole lookup three times over — correct,
 * but unreadable for the person who has to debug a mismatch, and slow across 178
 * rows. A helper column is what someone would write by hand.
 *
 * 0 means "not given", never "free": a mapped-but-blank label and a label with
 * no row on the card both land here, and the columns below treat 0 as "keep what
 * the tool already had".
 */
function jlrLookup(row: number, valueCol: 'C' | 'D'): string {
  const label = `INDEX(Mapping!$C:$C,MATCH($A${row},Mapping!$A:$A,0))`;
  const value = `INDEX(JLRrates!$${valueCol}:$${valueCol},MATCH(${label},JLRrates!$B:$B,0))`;
  return `IFERROR(IF(OR(${label}="",${value}=""),0,${value}),0)`;
}

/** Take the JLR value from the helper column when there is one, else keep ours. */
const orBuiltin = (helper: string, builtin: number): string =>
  `IF(${helper}>0,${helper},${builtin})`;

/**
 * A formula cell, carrying the value it evaluates to before Excel has ever run.
 *
 * SheetJS writes formulas with no cached result, and the upload parser reads
 * cached results — so a workbook that has never been opened parses as "not a
 * valid number" on every formula cell. Seeding the cache with the fallback
 * means a file downloaded and uploaded untouched still loads, carrying exactly
 * the values the tool already had. Excel overwrites the cache the moment it
 * recalculates, so once JLR fill it in the real numbers go up.
 */
const fx = (formula: string, cached: number | string) =>
  (typeof cached === 'number'
    ? { f: formula, v: cached, t: 'n' }
    : { f: formula, v: cached, t: 's' }) as XLSX.CellObject;

const wb = XLSX.utils.book_new();
const add = (name: string, rows: unknown[][], widths: number[]) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, name);
};

// ── 1. Read me ───────────────────────────────────────────────────────────────
add('Read me', [
  ['CostVision — JLR rate card converter'],
  [],
  ['What this is for'],
  ['Put JLR rates into the tool without retyping them and without renaming anything.'],
  ['The ids stay exactly as the tool expects. Only the numbers change.'],
  [],
  ['What to do'],
  ['1.', 'Open the JLRrates tab. Paste your rate card into it — one row per rate.'],
  ['', '   category = material, machine, labour, energy, fx or overhead'],
  ['', '   your label = whatever you call it. value = the number.'],
  ['2.', 'Open the Mapping tab. It already lists every rate the tool uses and what it is.'],
  ['', '   Type YOUR label in column C next to the ones you have. Leave the rest blank.'],
  ['3.', 'Press F9 to recalculate (or just save — Excel does it on save).'],
  ['4.', 'Check the Check tab. It tells you how many rates were picked up and flags'],
  ['', '   any label that could not be found on the rate card.'],
  ['5.', 'Save the file, then upload it in the tool: Edit Rates → Upload company rates.'],
  [],
  ['Things worth knowing'],
  ['•', 'Anything you do not map keeps the value the tool ships with. A partial rate'],
  ['', 'card is fine — map the materials you actually buy.'],
  ['•', 'No macros. It is ordinary formulas, so it opens anywhere and needs no'],
  ['', 'permission to run.'],
  ['•', 'Do not rename anything in column A of the Materials, Machines or Labour tabs.'],
  ['', 'Those ids are what the costing formulas ask for. Rename one and every costing'],
  ['', 'using it will stop with "not found in rate library".'],
  ['•', 'Machines: if you only have a £/hr, put it in and the sheet works backwards to'],
  ['', 'the annual figures so the rate comes out exactly right. The source note then'],
  ['', 'says the build-up was not supplied, so nobody mistakes the placeholder for a'],
  ['', 'real depreciation number. If you have the full build-up, type it into the'],
  ['', 'seven columns on the Machines tab and it is used as it stands.'],
  [],
  [`Built from the tool's library version ${LIB.version}. Generated ${new Date().toISOString().slice(0, 10)}.`],
], [4, 100]);

// ── 2. JLRrates — where the rate card is pasted ──────────────────────────────
add('JLRrates', [
  ['category', 'your label', 'value', 'second value (materials: scrap £/kg)', 'note'],
  ['# material', '# Steel 1045 bar', 1.9, 0.22, '# delete these example rows'],
  ['# machine', '# CNC machining centre 3-axis', 62, '', '# £/hr, or leave blank and fill the build-up'],
  ['# labour', '# Skilled machinist', 44.5, '', '# fully loaded £/hr'],
], [14, 44, 14, 34, 40]);

// ── 3. Mapping — every id the tool uses, waiting for a JLR label ─────────────
const mapRows: unknown[][] = [['tool id', 'what it is (do not edit)', 'your label for it', 'category']];
for (const m of LIB.materials) mapRows.push([m.id, `${m.grade}${m.category ? ` — ${m.category}` : ''}`, '', 'material']);
for (const m of LIB.machines) mapRows.push([m.id, m.machineClass, '', 'machine']);
for (const l of LIB.labour) mapRows.push([l.id, l.skillLevel, '', 'labour']);
for (const e of LIB.energy) mapRows.push([e.id, `Energy — ${e.region}`, '', 'energy']);
for (const f of LIB.fx) mapRows.push([f.id, `${f.fromCurrency} to ${f.toCurrency}`, '', 'fx']);
for (const o of LIB.overheadDefaults) mapRows.push([o.id, `${o.commodityType} — ${o.supplierTier}`, '', 'overhead']);
add('Mapping', mapRows, [24, 46, 34, 12]);

// ── 4. Builtin — what the tool ships with, so a blank mapping keeps working ──
const builtinRows: unknown[][] = [['id', 'v1', 'v2']];
for (const m of LIB.materials) builtinRows.push([m.id, m.pricePerKg, m.scrapRecoveryPricePerKg]);
for (const m of LIB.machines) builtinRows.push([m.id, m.computedRatePerHr, '']);
for (const l of LIB.labour) builtinRows.push([l.id, l.fullyLoadedRatePerHr, '']);
add('Builtin', builtinRows, [24, 14, 14]);

// ── 5. The tool's own format, filled by formula ──────────────────────────────
const matRows: unknown[][] = [[
  'id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3',
  'region', 'effectiveDate', 'sourceNote', 'confidence',
  // Helper columns. The upload ignores anything it does not recognise — checked —
  // so they can stay where the person filling this in can see the lookup working.
  'JLR price found', 'JLR scrap found',
]];
LIB.materials.forEach((m, i) => {
  const r = i + 2;
  matRows.push([
    m.id, m.grade, m.category,
    fx(orBuiltin(`$K${r}`, m.pricePerKg), m.pricePerKg),
    fx(orBuiltin(`$L${r}`, m.scrapRecoveryPricePerKg), m.scrapRecoveryPricePerKg),
    m.densityKgPerM3, m.region, m.effectiveDate, m.sourceNote, m.confidence,
    fx(jlrLookup(r, 'C'), 0), fx(jlrLookup(r, 'D'), 0),
  ]);
});
add('Materials', matRows, [22, 24, 16, 12, 22, 14, 10, 14, 36, 12, 16, 16]);

/**
 * Machines. `computedRatePerHr` is derived by the tool and ignored from the
 * file, so a supplied £/hr has to be turned back into the annual figures the
 * derivation uses: rate x hours x utilisation, all on one line.
 */
const machRows: unknown[][] = [[
  'id', 'machineClass', 'region', 'annualDepreciation', 'maintenance', 'energy', 'floorSpace',
  'indirectSupport', 'financeCost', 'annualAvailableHours', 'machineUtilization',
  'effectiveDate', 'sourceNote', 'confidence', 'JLR £/hr found',
]];
LIB.machines.forEach((m, i) => {
  const r = i + 2;
  const b = m.buildup;
  const rate = `$O${r}`;                                   // the helper column
  const hrs = b.annualAvailableHours, util = b.machineUtilization;
  machRows.push([
    m.id, m.machineClass, m.region,
    // Mapped: the whole annual cost on one line, back-solved from the £/hr so
    // the tool's own division returns exactly that rate. Unmapped: our figures,
    // untouched.
    fx(`IF(${rate}>0,${rate}*${hrs}*${util},${b.annualDepreciation})`, b.annualDepreciation),
    fx(`IF(${rate}>0,0,${b.maintenance})`, b.maintenance),
    fx(`IF(${rate}>0,0,${b.energy})`, b.energy),
    fx(`IF(${rate}>0,0,${b.floorSpace})`, b.floorSpace),
    fx(`IF(${rate}>0,0,${b.indirectSupport})`, b.indirectSupport),
    fx(`IF(${rate}>0,0,${b.financeCost})`, b.financeCost),
    hrs, util, m.effectiveDate,
    // Say plainly that the build-up is a placeholder, so nobody reads the
    // depreciation line as a real figure.
    fx(`IF(${rate}>0,"JLR flat rate "&TEXT(${rate},"0.00")&" per hr — build-up not supplied",${JSON.stringify(m.sourceNote ?? '')})`,
       m.sourceNote ?? ''),
    m.confidence,
    fx(jlrLookup(r, 'C'), 0),
  ]);
});
add('Machines', machRows, [22, 28, 10, 18, 14, 12, 12, 16, 14, 20, 18, 14, 44, 12, 16]);

const labRows: unknown[][] = [[
  'id', 'region', 'skillLevel', 'fullyLoadedRatePerHr', 'effectiveDate', 'sourceNote',
  'confidence', 'JLR £/hr found',
]];
LIB.labour.forEach((l, i) => {
  const r = i + 2;
  labRows.push([
    l.id, l.region, l.skillLevel,
    fx(orBuiltin(`$H${r}`, l.fullyLoadedRatePerHr), l.fullyLoadedRatePerHr),
    l.effectiveDate, l.sourceNote, l.confidence,
    fx(jlrLookup(r, 'C'), 0),
  ]);
});
add('Labour', labRows, [22, 12, 26, 20, 14, 36, 12, 16]);

// Energy, FX and Overhead change rarely and have no natural JLR label, so they
// are carried through as values. Edit in place if they need to move.
add('Energy', [
  ['id', 'region', 'electricityPerKwh', 'gasPerKwh', 'effectiveDate', 'sourceNote', 'confidence'],
  ...LIB.energy.map(e => [e.id, e.region, e.electricityPerKwh, e.gasPerKwh, e.effectiveDate, e.sourceNote, e.confidence]),
], [22, 12, 18, 14, 14, 36, 12]);
add('FX', [
  ['id', 'fromCurrency', 'toCurrency', 'rate', 'effectiveDate', 'sourceNote'],
  ...LIB.fx.map(f => [f.id, f.fromCurrency, f.toCurrency, f.rate, f.effectiveDate, f.sourceNote]),
], [16, 14, 12, 12, 14, 36]);
add('Overhead', [
  ['id', 'commodityType', 'supplierTier', 'overheadPct', 'marginPct', 'sourceNote'],
  ...LIB.overheadDefaults.map(o => [o.id, o.commodityType, o.supplierTier, o.overheadPct, o.marginPct, o.sourceNote]),
], [22, 20, 16, 12, 12, 36]);

// ── 6. Check — did it pick anything up, and did anything go missing ──────────
const nMat = LIB.materials.length, nMach = LIB.machines.length, nLab = LIB.labour.length;
const mapEnd = 1 + nMat + nMach + nLab;
add('Check', [
  ['Check before you upload'],
  [],
  ['What', 'Count', 'Should be'],
  ['Labels you have filled in on Mapping',
   fx(`COUNTIFS(Mapping!C2:C${mapEnd},"<>")`, 0), 'however many you have'],
  ['…of those, labels NOT found on the JLRrates tab',
   fx(`SUMPRODUCT((Mapping!C2:C${mapEnd}<>"")*(COUNTIF(JLRrates!B:B,Mapping!C2:C${mapEnd})=0))`, 0),
   '0 — anything else is a typo'],
  [],
  ['Materials taking a JLR price',
   fx(`SUMPRODUCT((Materials!D2:D${nMat + 1}<>Builtin!B2:B${nMat + 1})*1)`, 0), ''],
  ['Machines taking a JLR rate',
   fx(`COUNTIF(Machines!M2:M${nMach + 1},"JLR flat rate*")`, 0), ''],
  ['Labour grades taking a JLR rate',
   fx(`SUMPRODUCT((Labour!D2:D${nLab + 1}<>Builtin!B${nMat + nMach + 2}:B${nMat + nMach + nLab + 1})*1)`, 0), ''],
  [],
  ['If the second row is not zero, a label on Mapping does not match any row on'],
  ['JLRrates — usually a stray space or a different spelling. Fix it and press F9.'],
  [],
  ['Everything you did not map keeps the value the tool ships with. That is fine.'],
], [46, 16, 30]);

writeFileSync(OUT, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
console.log(`${OUT}`);
console.log(`  Mapping rows : ${nMat} materials, ${nMach} machines, ${nLab} labour`);
console.log(`  tabs         : ${wb.SheetNames.join(', ')}`);
