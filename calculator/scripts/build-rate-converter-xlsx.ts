/**
 * Build the offline rate-card converter workbook.
 *
 *   npx tsx scripts/build-rate-converter-xlsx.ts [out.xlsx]
 *
 * THE PROBLEM IT SOLVES. JLR's rate card arrives as JLR's own export, in JLR's
 * own columns, keyed by JLR's own codes. The tool's upload wants the tool's ids
 * — `mat-steel1045`, `mach-vmc3`, `lab-uk-skilled` — because those ids are what
 * the costing formulas ask for, and renaming one stops every costing that uses
 * it. Nobody is retyping 328 materials, 178 machines and 42 labour grades every
 * quarter, and a human retyping 548 numbers will make mistakes.
 *
 * HOW IT WORKS. Paste JLR's three exports into the three tabs that carry JLR's
 * exact headers. Say which country and period you want on Settings. Put the JLR
 * code against each tool id on Mapping, once — it survives every future
 * quarter. Everything else fills itself in and the file is ready to upload.
 *
 *   JLR Machines    MACHINE_CODE … TOTAL_MACHINE_RATE, as exported
 *   JLR Materials   CODE … CO2, as exported
 *   JLR Labour      LABOUR_CATEGORY … TOTAL_LABOUR_RATE (optional — see below)
 *   Settings        country, period, and what MATERIAL_RECLAIM means
 *   Mapping         tool id -> JLR code, with JLR's own name echoed back
 *   Materials / Machines / Labour / Energy / FX / Overhead
 *                   the tool's exact upload format, filled by formula
 *   Check           did it pick anything up, and does it add up
 *
 * THE MACHINE BUILD-UP SURVIVES. JLR's machine rate is already a build-up in
 * £/hr, and its seven elements sum to TOTAL_MACHINE_RATE (verified against the
 * supplied card, to a penny of rounding). The tool's build-up is the same shape
 * annualised, so each element maps across and is multiplied by that row's own
 * hours x utilisation — which the tool then divides straight back out. The rate
 * lands on JLR's published number and the report shows a real breakdown.
 * Depreciation absorbs the rounding residual so the two agree exactly.
 *
 * If a row gives only TOTAL_MACHINE_RATE and no elements, the total is
 * back-solved onto one line and the source note says the build-up was not
 * supplied — a number that looks like a build-up but is not is worse than an
 * obvious placeholder.
 *
 * LABOUR COMES EITHER WAY. On the card supplied, labour rides inside the
 * machine export as TOTAL_LABOUR_RATE keyed by LABOUR_CATEGORY. So the labour
 * lookup reads the JLR Labour tab if it has been filled in, and otherwise reads
 * the category out of the machine tab.
 *
 * NO MACRO, NO HARDCODING. Everything is COUNTIFS/SUMIFS/INDEX-MATCH, so it
 * opens in any Excel and needs no macro permission — which matters where IT
 * block .xlsm. Every row falls back to the tool's own value when JLR have not
 * mapped it, so a partial card is fine: map the twenty materials you buy and
 * the other three hundred keep working. Next quarter is paste, refresh, upload.
 * Nobody edits code.
 *
 * WHAT IT REFUSES TO GUESS. A code that matches more than one pasted row (two
 * countries, two periods) keeps the tool's own value and is counted on Check.
 * A wrong rate is worse than an unchanged one.
 */
import * as XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';

const LIB = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const OUT = process.argv[2] ?? 'CostVision-JLR-Rate-Converter.xlsx';

/** The three tabs JLR's export is pasted into, named as they are referenced. */
const MACH = `'JLR Machines'`;
const MATL = `'JLR Materials'`;
const LABR = `'JLR Labour'`;

/**
 * The country and period to take, as SUMIFS/COUNTIFS criteria.
 *
 * Blank means "no filter": `"<>"` reads as "not empty", which matches every
 * pasted row whether the cell holds text or a number. That matters because
 * PERIOD_CODE arrives sometimes as 04042025 text and sometimes as a number,
 * depending on how Excel took the paste.
 */
const CTRY = `IF(Settings!$B$2="","<>",Settings!$B$2)`;

/**
 * The period, and why there are two cells for it.
 *
 * The same quarter is stamped differently on the two exports — the machine card
 * carries PERIOD_CODE 04042025 and the material card carries PERIOD 04-04-2025.
 * One filter cell could not match both, and a filter that silently fails to
 * match is the worst outcome here, so each tab gets its own.
 */
const PERI_MACH = `IF(Settings!$B$3="","<>",Settings!$B$3)`;
const PERI_MATL = `IF(Settings!$B$4="","<>",Settings!$B$4)`;

/** Same country/period filter on whichever tab, as the tail of a *IFS call. */
const filt = (tab: string, countryCol: string, periodCol: string) => {
  const period = tab === MATL ? PERI_MATL : PERI_MACH;
  return `${tab}!$${countryCol}:$${countryCol},${CTRY},${tab}!$${periodCol}:$${periodCol},${period}`;
};

/**
 * The JLR code somebody put against this tool id on the Mapping tab, or "".
 *
 * Codes rather than names on purpose. `712008` is short, stable quarter to
 * quarter, and cannot be mistyped the way "100t Hydraulic Injection Moulding MC
 * + EuroMap290 Inj Unit" can. Mapping echoes JLR's own name back beside it so
 * the person filling it in can see they picked the right row.
 */
const code = (row: number) =>
  `IFERROR(INDEX(Mapping!$C:$C,MATCH($A${row},Mapping!$A:$A,0)),"")`;

/**
 * How many pasted rows this code matches under the current filter.
 *
 * Every value below is taken only when this is exactly 1. Two matches means the
 * paste covers two countries or two periods and the Settings filter has not
 * narrowed it — averaging them would invent a rate nobody published, so the row
 * keeps the tool's own value and Check counts it.
 */
const matches = (codeCell: string, tab: string, keyCol: string, countryCol: string, periodCol: string) =>
  `IF(${codeCell}="",0,COUNTIFS(${tab}!$${keyCol}:$${keyCol},${codeCell},${filt(tab, countryCol, periodCol)}))`;

/** One column of the matched row, or 0 when it is not a clean single match. */
const pick = (countCell: string, codeCell: string, tab: string, keyCol: string,
              valueCol: string, countryCol: string, periodCol: string) =>
  `IF(${countCell}<>1,0,SUMIFS(${tab}!$${valueCol}:$${valueCol},${tab}!$${keyCol}:$${keyCol},${codeCell},${filt(tab, countryCol, periodCol)}))`;

/** A text column of the first row carrying this code (SUMIFS cannot return text). */
const pickText = (countCell: string, codeCell: string, tab: string, keyCol: string,
                  valueCol: string, fallback: string) =>
  `IF(${countCell}<>1,${fallback},IFERROR(INDEX(${tab}!$${valueCol}:$${valueCol},MATCH(${codeCell},${tab}!$${keyCol}:$${keyCol},0)),${fallback}))`;

/** Take the JLR value when there is one, else keep ours. */
const orBuiltin = (helper: string, builtin: number): string => `IF(${helper}>0,${helper},${builtin})`;

const q = (s: string) => JSON.stringify(s ?? '');

/**
 * A formula cell, carrying the value it evaluates to before Excel has ever run.
 *
 * SheetJS writes formulas with no cached result, and the upload parser reads
 * cached results — so a workbook that has never been opened parses as "not a
 * valid number" on every formula cell. Seeding the cache with the fallback
 * means a file downloaded and uploaded untouched still loads, carrying exactly
 * the values the tool already had. Excel overwrites the cache the moment it
 * recalculates, so once JLR's numbers are in they go up.
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
  ['1.', 'Paste your exports, headers and all, into the three tabs that carry JLR headers:'],
  ['', '   JLR Machines   — MACHINE_CODE … TOTAL_MACHINE_RATE'],
  ['', '   JLR Materials  — CODE … CO2'],
  ['', '   JLR Labour     — only if you get labour as its own file. If your labour'],
  ['', '                    rates sit inside the machine export as TOTAL_LABOUR_RATE,'],
  ['', '                    leave this tab empty; the sheet reads them from there.'],
  ['2.', 'Open Settings. Type the country, and the period as each file stamps it — the'],
  ['', '   machine card says 04042025 and the material card says 04-04-2025 for the'],
  ['', '   same quarter, so there is a cell for each. Your export covers every country,'],
  ['', '   and the same machine code appears once per country — this is what picks one.'],
  ['3.', 'Open Mapping. It lists every rate the tool uses and what it is. Put the JLR'],
  ['', '   CODE in column C next to the ones you have. Column D shows you the name'],
  ['', '   JLR have against that code, so you can see you picked the right row.'],
  ['', '   Leave the rest blank. You only do this once — next quarter is paste and go.'],
  ['4.', 'Press F9 to recalculate (or just save — Excel does it on save).'],
  ['5.', 'Check the Check tab. Every line that says "should be 0" should be 0.'],
  ['6.', 'Save the file, then upload it in the tool: Edit Rates → Upload company rates.'],
  [],
  ['How the machine rate is carried across'],
  ['JLR give a machine rate as seven elements in £/hr that add up to TOTAL_MACHINE_RATE.'],
  ['The tool holds the same build-up as annual figures and divides by hours × utilisation.'],
  ['So each element is multiplied by that machine’s hours × utilisation and the tool'],
  ['divides it straight back out — the rate comes out on JLR’s number, and the report'],
  ['shows a real breakdown rather than one lump. Depreciation takes the penny of'],
  ['rounding so the rebuilt rate matches TOTAL_MACHINE_RATE exactly.'],
  [],
  ['   DEPRECIATION → annualDepreciation      MRO       → maintenance'],
  ['   UTILITIES    → energy                  FLOORSPACE → floorSpace'],
  ['   INTEREST     → financeCost             INSURANCE + CONSUMABLES → indirectSupport'],
  [],
  ['If a row has only TOTAL_MACHINE_RATE and no elements, the total goes on one line and'],
  ['the source note says the build-up was not supplied, so nobody reads it as real.'],
  [],
  ['Things worth knowing'],
  ['•', 'Anything you do not map keeps the value the tool ships with. A partial rate'],
  ['', 'card is fine — map the materials you actually buy.'],
  ['•', 'If a code matches more than one pasted row, the sheet keeps the tool’s own'],
  ['', 'value rather than pick one, and Check counts it. Narrow it on Settings.'],
  ['•', 'MATERIAL_RECLAIM: set on Settings whether it is a percentage of the material'],
  ['', 'rate or already £/kg. Please confirm this with whoever owns the rate card —'],
  ['', 'on the card supplied, 40.48 against a rate of 0.72 reads as a percentage.'],
  ['•', 'CO2 is brought across to the Materials tab for reference only. The upload'],
  ['', 'format has no carbon field, so the tool will ignore that column.'],
  ['•', 'No macros. It is ordinary formulas, so it opens anywhere and needs no'],
  ['', 'permission to run.'],
  ['•', 'Do not rename anything in column A of the Materials, Machines or Labour tabs.'],
  ['', 'Those ids are what the costing formulas ask for. Rename one and every costing'],
  ['', 'using it will stop with "not found in rate library".'],
  [],
  [`Built from the tool's library version ${LIB.version}. Generated ${new Date().toISOString().slice(0, 10)}.`],
], [4, 100]);

// ── 2. Settings ──────────────────────────────────────────────────────────────
add('Settings', [
  ['Setting', 'Value', 'What it does'],
  ['Country', '', 'Must match COUNTRY_NAME / COUNTRY exactly, e.g. United Kingdom. Blank = take any.'],
  ['Machine period', '', 'Must match PERIOD_CODE on the JLR Machines and JLR Labour tabs, e.g. 04042025.'],
  ['Material period', '', 'Must match PERIOD on the JLR Materials tab, e.g. 04-04-2025. The two exports'],
  ['MATERIAL_RECLAIM is', 'percent', 'Type percent (of the material rate) or per kg. Confirm with your rates team.'],
  [],
  ['The two period cells are deliberate: the machine card stamps the quarter as'],
  ['04042025 and the material card stamps the same quarter as 04-04-2025. Copy each'],
  ['one exactly as it appears in its own file.'],
  [],
  ['Leave a cell blank only if you have already filtered that export down to one'],
  ['country and one period before pasting it.'],
], [24, 18, 84]);

// ── 3. The three paste tabs, carrying JLR's own headers ──────────────────────
add('JLR Machines', [
  ['MACHINE_CODE', 'MACHINE_NAME', 'COUNTRY_NAME', 'PERIOD_CODE', 'LABOUR_CATEGORY',
   'TOTAL_LABOUR_RATE', 'DEPRECIATION', 'FLOORSPACE', 'MRO', 'INSURANCE', 'INTEREST',
   'UTILITIES', 'CONSUMABLES', 'TOTAL_MACHINE_RATE'],
  [712008, '100t Hydraulic Injection Moulding MC + EuroMap290 Inj Unit — EXAMPLE ROW, DELETE IT',
   'United Kingdom', '04042025', 'CB', 40.97, 1.75, 1.06, 1.97, 0.18, 0.64, 4.45, 0, 10.06],
], [14, 56, 16, 14, 16, 18, 14, 12, 10, 11, 10, 11, 13, 20]);

add('JLR Materials', [
  ['CODE', 'MATERIAL', 'COUNTRY', 'PERIOD', 'MATERIAL_RATE', 'MATERIAL_RECLAIM', 'CO2'],
  [10080020309, 'HSLA360 Steel Coil: <1mm Thickness — EXAMPLE ROW, DELETE IT',
   'United Kingdom', '04-04-2025', 0.72, 40.48, 2.19],
], [16, 56, 16, 14, 14, 18, 10]);

add('JLR Labour', [
  ['LABOUR_CATEGORY', 'DESCRIPTION', 'COUNTRY_NAME', 'PERIOD_CODE', 'TOTAL_LABOUR_RATE'],
  ['CB', 'EXAMPLE ROW, DELETE IT — or leave this whole tab empty and the sheet will',
   'United Kingdom', '04042025', 40.97],
  ['', 'read TOTAL_LABOUR_RATE out of the JLR Machines tab by LABOUR_CATEGORY instead.'],
], [18, 72, 16, 14, 18]);

// ── 4. Mapping — every id the tool uses, waiting for a JLR code ──────────────
const mapRows: unknown[][] = [['tool id', 'what it is (do not edit)', 'JLR code', 'JLR name for that code', 'category']];
type MapSeed = [id: string, what: string, category: string];
const seeds: MapSeed[] = [
  ...LIB.materials.map(m => [m.id, `${m.grade}${m.category ? ` — ${m.category}` : ''}`, 'material'] as MapSeed),
  ...LIB.machines.map(m => [m.id, m.machineClass, 'machine'] as MapSeed),
  ...LIB.labour.map(l => [l.id, l.skillLevel, 'labour'] as MapSeed),
  ...LIB.energy.map(e => [e.id, `Energy — ${e.region}`, 'energy'] as MapSeed),
  ...LIB.fx.map(f => [f.id, `${f.fromCurrency} to ${f.toCurrency}`, 'fx'] as MapSeed),
  ...LIB.overheadDefaults.map(o => [o.id, `${o.commodityType} — ${o.supplierTier}`, 'overhead'] as MapSeed),
];
seeds.forEach(([id, what, category], i) => {
  const r = i + 2;
  // Echo JLR's own name back. Looked up on code alone, ignoring the country and
  // period filter — this is here to confirm the code is right, not to price
  // anything, and it should still answer when the filter excludes every row.
  const echo =
    `IF($C${r}="","",IFERROR(` +
    `IF($E${r}="machine",INDEX(${MACH}!$B:$B,MATCH($C${r},${MACH}!$A:$A,0)),` +
    `IF($E${r}="material",INDEX(${MATL}!$B:$B,MATCH($C${r},${MATL}!$A:$A,0)),` +
    `IF($E${r}="labour",IFERROR(INDEX(${LABR}!$B:$B,MATCH($C${r},${LABR}!$A:$A,0)),` +
    `"labour category "&$C${r}&" — from the machine tab"),""))),` +
    `"NOT FOUND — check the code"))`;
  mapRows.push([id, what, '', fx(echo, ''), category]);
});
add('Mapping', mapRows, [24, 46, 14, 50, 12]);

// ── 5. Builtin — what the tool ships with, so a blank mapping keeps working ──
const builtinRows: unknown[][] = [['id', 'v1', 'v2']];
for (const m of LIB.materials) builtinRows.push([m.id, m.pricePerKg, m.scrapRecoveryPricePerKg]);
for (const m of LIB.machines) builtinRows.push([m.id, m.computedRatePerHr, '']);
for (const l of LIB.labour) builtinRows.push([l.id, l.fullyLoadedRatePerHr, '']);
add('Builtin', builtinRows, [24, 14, 14]);

// ── 6. Materials — the tool's upload format, filled by formula ───────────────
const matRows: unknown[][] = [[
  'id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3',
  'region', 'effectiveDate', 'sourceNote', 'confidence',
  // Helper columns. The upload ignores anything it does not recognise — checked —
  // so they stay where the person filling this in can watch the lookup work.
  'JLR code', 'rows matched', 'MATERIAL_RATE', 'MATERIAL_RECLAIM', 'scrap £/kg', 'CO2 (reference only)',
]];
LIB.materials.forEach((m, i) => {
  const r = i + 2;
  const [K, L, M, N, O] = [`$K${r}`, `$L${r}`, `$M${r}`, `$N${r}`, `$O${r}`];
  matRows.push([
    m.id, m.grade, m.category,
    fx(orBuiltin(M, m.pricePerKg), m.pricePerKg),
    fx(orBuiltin(O, m.scrapRecoveryPricePerKg), m.scrapRecoveryPricePerKg),
    m.densityKgPerM3, m.region,
    fx(`IF(${M}>0,${pickText(L, K, MATL, 'A', 'D', q(m.effectiveDate))},${q(m.effectiveDate)})`, m.effectiveDate),
    fx(`IF(${M}>0,"JLR rate card — material code "&${K},${q(m.sourceNote)})`, m.sourceNote),
    m.confidence,
    fx(code(r), ''),
    fx(matches(K, MATL, 'A', 'C', 'D'), 0),
    fx(pick(L, K, MATL, 'A', 'E', 'C', 'D'), 0),
    fx(pick(L, K, MATL, 'A', 'F', 'C', 'D'), 0),
    // Percentage of the rate, or already £/kg — set once on Settings. Guessing
    // here would be a 40x error in either direction.
    fx(`IF(${N}=0,0,IF(Settings!$B$5="percent",${M}*${N}/100,${N}))`, 0),
    fx(pick(L, K, MATL, 'A', 'G', 'C', 'D'), 0),
  ]);
});
add('Materials', matRows, [22, 24, 16, 12, 22, 14, 10, 14, 40, 12, 12, 12, 14, 16, 12, 18]);

/**
 * Machines. `computedRatePerHr` is derived by the tool and ignored from the
 * file, so JLR's £/hr elements are annualised on the way in and divided back
 * out on the way through: element x hours x utilisation, then / (hours x
 * utilisation). Hours and utilisation are the tool's own and cancel exactly —
 * they are a scale factor here, not a claim about JLR's shift pattern.
 */
const machRows: unknown[][] = [[
  'id', 'machineClass', 'region', 'annualDepreciation', 'maintenance', 'energy', 'floorSpace',
  'indirectSupport', 'financeCost', 'annualAvailableHours', 'machineUtilization',
  'effectiveDate', 'sourceNote', 'confidence',
  'JLR code', 'rows matched', 'DEPRECIATION', 'FLOORSPACE', 'MRO', 'INSURANCE', 'INTEREST',
  'UTILITIES', 'CONSUMABLES', 'TOTAL_MACHINE_RATE', 'elements add to', 'rebuilt £/hr − JLR total',
]];
LIB.machines.forEach((m, i) => {
  const r = i + 2;
  const b = m.buildup;
  const scale = b.annualAvailableHours * b.machineUtilization;
  const [O, P, Q, R, S, T, U, V, W, X, Y] =
    ['O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'].map(c => `$${c}${r}`);
  // X > 0 is the switch: JLR published a rate for this machine. Y > 0 says they
  // also published the elements it is made of.
  const annual = (element: string, builtin: number) =>
    fx(`IF(${X}>0,IF(${Y}>0,${element}*${scale},0),${builtin})`, builtin);
  machRows.push([
    m.id, m.machineClass, m.region,
    // Depreciation carries the rounding residual (X − Y, at most a penny an
    // hour) so the rebuilt rate lands on JLR's published total exactly; MAX
    // keeps it off the negative the upload would reject.
    fx(`IF(${X}>0,IF(${Y}>0,MAX(0,${Q}+${X}-${Y})*${scale},${X}*${scale}),${b.annualDepreciation})`,
       b.annualDepreciation),
    annual(S, b.maintenance),        // MRO        → maintenance
    annual(V, b.energy),             // UTILITIES  → energy
    annual(R, b.floorSpace),         // FLOORSPACE → floorSpace
    fx(`IF(${X}>0,IF(${Y}>0,(${T}+${W})*${scale},0),${b.indirectSupport})`, b.indirectSupport),
    annual(U, b.financeCost),        // INTEREST   → financeCost
    b.annualAvailableHours, b.machineUtilization,
    fx(`IF(${X}>0,${pickText(P, O, MACH, 'A', 'D', q(m.effectiveDate))},${q(m.effectiveDate)})`, m.effectiveDate),
    // Say plainly which of the two happened, so nobody reads a back-solved
    // lump as a real depreciation figure.
    fx(`IF(${X}>0,IF(${Y}>0,"JLR machine "&${O}&" at "&TEXT(${X},"0.00")&" per hr — build-up as supplied",` +
       `"JLR machine "&${O}&" at "&TEXT(${X},"0.00")&" per hr — build-up not supplied"),${q(m.sourceNote ?? '')})`,
       m.sourceNote ?? ''),
    m.confidence,
    fx(code(r), ''),
    fx(matches(O, MACH, 'A', 'C', 'D'), 0),
    fx(pick(P, O, MACH, 'A', 'G', 'C', 'D'), 0),   // DEPRECIATION
    fx(pick(P, O, MACH, 'A', 'H', 'C', 'D'), 0),   // FLOORSPACE
    fx(pick(P, O, MACH, 'A', 'I', 'C', 'D'), 0),   // MRO
    fx(pick(P, O, MACH, 'A', 'J', 'C', 'D'), 0),   // INSURANCE
    fx(pick(P, O, MACH, 'A', 'K', 'C', 'D'), 0),   // INTEREST
    fx(pick(P, O, MACH, 'A', 'L', 'C', 'D'), 0),   // UTILITIES
    fx(pick(P, O, MACH, 'A', 'M', 'C', 'D'), 0),   // CONSUMABLES
    fx(pick(P, O, MACH, 'A', 'N', 'C', 'D'), 0),   // TOTAL_MACHINE_RATE
    fx(`${Q}+${R}+${S}+${T}+${U}+${V}+${W}`, 0),
    // The self-proof: put the six upload columns back through the tool's own
    // division and see whether JLR's total comes out. Counted on Check.
    fx(`IF(${X}<=0,0,ROUND((D${r}+E${r}+F${r}+G${r}+H${r}+I${r})/${scale}-${X},4))`, 0),
  ]);
});
add('Machines', machRows, [22, 28, 10, 18, 14, 12, 12, 16, 14, 20, 18, 14, 52, 12,
                           12, 12, 14, 12, 10, 11, 10, 11, 13, 20, 14, 22]);

// ── 7. Labour — from its own tab if there is one, else out of the machines ───
const labRows: unknown[][] = [[
  'id', 'region', 'skillLevel', 'fullyLoadedRatePerHr', 'effectiveDate', 'sourceNote',
  'confidence', 'JLR code', 'rows matched', 'from JLR Labour', 'from JLR Machines', 'rate used',
]];
LIB.labour.forEach((l, i) => {
  const r = i + 2;
  const [H, I, J, K, L] = [`$H${r}`, `$I${r}`, `$J${r}`, `$K${r}`, `$L${r}`];
  labRows.push([
    l.id, l.region, l.skillLevel,
    fx(orBuiltin(L, l.fullyLoadedRatePerHr), l.fullyLoadedRatePerHr),
    l.effectiveDate,
    fx(`IF(${L}>0,"JLR rate card — labour category "&${H},${q(l.sourceNote)})`, l.sourceNote),
    l.confidence,
    fx(code(r), ''),
    fx(matches(H, LABR, 'A', 'C', 'D'), 0),
    fx(pick(I, H, LABR, 'A', 'E', 'C', 'D'), 0),
    // The fallback. Every machine on a category carries the same
    // TOTAL_LABOUR_RATE, so an average over them is that rate — and unlike the
    // machine lookup there is no single row to insist on.
    fx(`IF(${H}="",0,IFERROR(AVERAGEIFS(${MACH}!$F:$F,${MACH}!$E:$E,${H},${filt(MACH, 'C', 'D')}),0))`, 0),
    fx(`IF(${J}>0,${J},${K})`, 0),
  ]);
});
add('Labour', labRows, [22, 12, 26, 20, 14, 44, 12, 12, 12, 16, 18, 12]);

// Energy, FX and overhead are not on the three JLR exports, so they are carried
// through as values. Edit in place if they need to move.
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

// ── 8. Check — did it pick anything up, and does it add up ───────────────────
const nMat = LIB.materials.length, nMach = LIB.machines.length, nLab = LIB.labour.length;
const mapEnd = 1 + seeds.length;
const R = 5000;   // how far down the paste tabs the integrity check looks
const elems = ['G', 'H', 'I', 'J', 'K', 'L', 'M'].map(c => `${MACH}!$${c}$2:$${c}$${R}`).join('+');
add('Check', [
  ['Check before you upload'],
  [],
  ['What', 'Count', 'Should be'],
  ['Codes you have filled in on Mapping',
   fx(`COUNTIFS(Mapping!C2:C${mapEnd},"<>")`, 0), 'however many you have'],
  ['…of those, codes not found on any JLR tab',
   fx(`COUNTIF(Mapping!D2:D${mapEnd},"NOT FOUND*")`, 0), '0 — the code is wrong'],
  [],
  ['Materials taking a JLR price',
   fx(`COUNTIF(Materials!L2:L${nMat + 1},1)`, 0), ''],
  ['Machines taking a JLR rate',
   fx(`COUNTIF(Machines!P2:P${nMach + 1},1)`, 0), ''],
  ['Labour grades taking a JLR rate',
   fx(`COUNTIF(Labour!L2:L${nLab + 1},">0")`, 0), ''],
  [],
  ['Codes matching MORE than one pasted row (country/period not narrowed)',
   fx(`COUNTIF(Materials!L2:L${nMat + 1},">1")+COUNTIF(Machines!P2:P${nMach + 1},">1")`, 0),
   '0 — set Country and Period on Settings'],
  ['Machines whose rebuilt £/hr does not equal JLR’s TOTAL_MACHINE_RATE',
   fx(`COUNTIF(Machines!Z2:Z${nMach + 1},"<>0")`, 0), '0'],
  ['Pasted machine rows whose 7 elements do not add up to TOTAL_MACHINE_RATE',
   // Rows carrying only a total are a case the sheet handles on purpose, so
   // they are not counted here — this is looking for a card that disagrees
   // with itself, not for one that is less detailed than it could be.
   fx(`SUMPRODUCT((${MACH}!$A$2:$A$${R}<>"")*` +
      `((${elems})>0)*` +
      `(ABS((${elems})-${MACH}!$N$2:$N$${R})>0.02))`, 0),
   '0 — otherwise ask about the export'],
  [],
  ['Settings in force'],
  ['Country', fx('IF(Settings!$B$2="","(any)",Settings!$B$2)', '(any)'), ''],
  ['Machine period', fx('IF(Settings!$B$3="","(any)",Settings!$B$3)', '(any)'), ''],
  ['Material period', fx('IF(Settings!$B$4="","(any)",Settings!$B$4)', '(any)'), ''],
  ['MATERIAL_RECLAIM read as', fx('Settings!$B$5', 'percent'), 'confirm this with your rates team'],
  [],
  ['Everything you did not map keeps the value the tool ships with. That is fine.'],
], [62, 16, 40]);

writeFileSync(OUT, XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
console.log(`${OUT}`);
console.log(`  Mapping rows : ${nMat} materials, ${nMach} machines, ${nLab} labour`);
console.log(`  tabs         : ${wb.SheetNames.join(', ')}`);
