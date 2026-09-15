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

/**
 * How far down the paste tabs every lookup reads.
 *
 * Whole-column references (`'JLR Machines'!$A:$A`) came to seventeen thousand
 * of them across the workbook, each nominally a million rows. Excel usually
 * narrows that to the used range, but "usually" is not what you want on a
 * locked-down laptop with a recalculation in front of somebody. Bounded, and
 * the Check tab counts what was pasted so a card longer than this says so
 * rather than losing rows in silence.
 */
const PASTE_ROWS = 20_000;

/** Rows on Mapping — one per rate the JLR card can fill. */
const MAP_ROWS = DEFAULT_RATE_LIBRARY.materials.length + DEFAULT_RATE_LIBRARY.machines.length
               + DEFAULT_RATE_LIBRARY.labour.length;

/** The three tabs JLR's export is pasted into, named as they are referenced. */
const MACH = `'JLR Machines'`;
const MATL = `'JLR Materials'`;
const LABR = `'JLR Labour'`;

/** One bounded column of a paste tab, header excluded. */
const rng = (tab: string, c: string) => `${tab}!$${c}$2:$${c}$${PASTE_ROWS + 1}`;
/** One bounded column of the Mapping tab. */
const mapRng = (c: string) => `Mapping!$${c}$2:$${c}$${MAP_ROWS + 1}`;

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
  return `${rng(tab, countryCol)},${CTRY},${rng(tab, periodCol)},${period}`;
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
  `IFERROR(INDEX(${mapRng('C')},MATCH($A${row},${mapRng('A')},0)),"")`;

/**
 * How many pasted rows this code matches under the current filter.
 *
 * Every value below is taken only when this is exactly 1. Two matches means the
 * paste covers two countries or two periods and the Settings filter has not
 * narrowed it — averaging them would invent a rate nobody published, so the row
 * keeps the tool's own value and Check counts it.
 */
const matches = (codeCell: string, tab: string, keyCol: string, countryCol: string, periodCol: string) =>
  `IF(${codeCell}="",0,COUNTIFS(${rng(tab, keyCol)},${codeCell},${filt(tab, countryCol, periodCol)}))`;

/** One column of the matched row, or 0 when it is not a clean single match. */
const pick = (countCell: string, codeCell: string, tab: string, keyCol: string,
              valueCol: string, countryCol: string, periodCol: string) =>
  `IF(${countCell}<>1,0,SUMIFS(${rng(tab, valueCol)},${rng(tab, keyCol)},${codeCell},${filt(tab, countryCol, periodCol)}))`;

/** A text column of the first row carrying this code (SUMIFS cannot return text). */
const pickText = (countCell: string, codeCell: string, tab: string, keyCol: string,
                  valueCol: string, fallback: string) =>
  `IF(${countCell}<>1,${fallback},IFERROR(INDEX(${rng(tab, valueCol)},MATCH(${codeCell},${rng(tab, keyCol)},0)),${fallback}))`;

/** Take the JLR value when there is one, else keep ours. */
const orBuiltin = (helper: string, builtin: number): string => `IF(${helper}>0,${helper},${builtin})`;

/**
 * A text literal inside a formula.
 *
 * NOT JSON.stringify, which was the bug here: it escapes a quote as \" and
 * Excel wants "". Two rows in the library carry a quoted phrase in their source
 * note — Xiaomi's "Titan Metal", a "die-casting cluster" — and both came out as
 * #VALUE! in the generated file.
 *
 * Short strings only. Excel caps a string literal inside a formula at 255
 * characters and three source notes are longer than that, so anything that
 * might be long goes in a helper cell and the formula points at it.
 */
const q = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;

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
  ['Start here. Seven steps. About ten minutes the first time, two minutes every quarter after.'],
  [],
  ['WHAT THIS DOES'],
  ['', 'JLR give you a rate card in JLR’s layout, with JLR’s codes. The tool needs its own ids,'],
  ['', 'because those ids are what the costing formulas ask for. This workbook joins the two.'],
  ['', 'You paste your export in; it fills in the tool’s upload for you. Nothing is renamed,'],
  ['', 'nothing is coded. It is ordinary Excel formulas, so there are no macros to enable.'],
  [],
  ['BEFORE YOU START'],
  ['', 'Have your machine rate card and your material rate card open.'],
  ['', 'If labour comes as its own file, have that too — if it does not, you do not need one.'],
  ['', 'Know the country you are costing in, and the period stamped on each file.'],
  [],
  ['────────────────────────────────────────────────────────────────────────────────────────'],
  ['STEP 1', 'Paste the machine rates.'],
  ['', 'a. Go to the tab named  JLR Machines.'],
  ['', 'b. Row 2 is an example row. Click the row 2 number, right-click, Delete Row.'],
  ['', 'c. In your machine export, select all the data rows — NOT the header row.'],
  ['', 'd. Come back here, click cell  A2 , and paste. Paste Special → Values if you have it.'],
  ['', 'e. Check that MACHINE_CODE landed in column A and TOTAL_MACHINE_RATE in column N.'],
  ['', ''],
  ['', 'Row 1 already carries your own 14 headers. Leave row 1 exactly as it is.'],
  ['', 'If your export has extra columns, or has them in a different order, delete or reorder'],
  ['', 'them in your copy first so the 14 columns line up with row 1 here. Paste as many rows'],
  ['', 'as you like — all countries, all machines. Step 4 is what picks the ones you want.'],
  [],
  ['STEP 2', 'Paste the material rates.'],
  ['', 'Same again on the tab named  JLR Materials : delete the example row 2, then paste'],
  ['', 'your data rows into cell  A2 . CODE in column A, CO2 in column G.'],
  [],
  ['STEP 3', 'Paste the labour rates — only if you have a separate labour file.'],
  ['', 'If your labour rates sit INSIDE the machine export, as TOTAL_LABOUR_RATE against a'],
  ['', 'LABOUR_CATEGORY, you can skip this step entirely. Go to the  JLR Labour  tab, delete'],
  ['', 'the two example rows, and leave it empty — the sheet will read labour out of the'],
  ['', 'machine tab by category instead.'],
  ['', ''],
  ['', 'If you do have a separate file, delete the example rows and paste into  A2  as before.'],
  [],
  ['STEP 4', 'Tell it which country and which period to take.'],
  ['', 'Go to the tab named  Settings  and fill in these four cells in column B:'],
  ['', ''],
  ['', '   B2  Country           e.g.  United Kingdom'],
  ['', '   B3  Machine period    e.g.  04042025        (copy it from PERIOD_CODE)'],
  ['', '   B4  Material period   e.g.  04-04-2025      (copy it from PERIOD)'],
  ['', '   B5  MATERIAL_RECLAIM  percent  or  per kg'],
  ['', ''],
  ['', 'Type each one EXACTLY as it appears in your file, spaces and dashes and all. There are'],
  ['', 'two period cells on purpose: the two exports stamp the same quarter differently.'],
  ['', 'Leave a cell blank only if you have already cut that export down to one country and'],
  ['', 'one period before pasting it.'],
  ['', ''],
  ['', 'On B5: if MATERIAL_RECLAIM is a percentage of the material rate, leave it as percent.'],
  ['', 'If it is already a price in £/kg, type per kg. Please confirm which with whoever owns'],
  ['', 'the rate card — getting it the wrong way round changes the scrap credit enormously.'],
  [],
  ['STEP 5', 'Say which JLR code is which tool rate. You only do this once.'],
  ['', 'Go to the tab named  Mapping . It already lists every rate the tool uses, with a plain'],
  ['', 'description of each in column B — "1045 / C45 (Medium-Carbon Steel)", and so on.'],
  ['', ''],
  ['', 'In column C, type the JLR CODE for the ones you have. Leave everything else blank.'],
  ['', 'Column D then shows you the name JLR hold against that code. Read it. If it is not the'],
  ['', 'thing you meant, the code is wrong. If it says NOT FOUND, the code is not on your'],
  ['', 'pasted data at all.'],
  ['', ''],
  ['', 'For labour, the code is the LABOUR_CATEGORY — CB, for example — not a machine number.'],
  ['', ''],
  ['', 'Every description ends with the region that rate belongs to — "— UK", "— CN". Put a'],
  ['', 'UK rate card against the UK rows. A UK number mapped onto a Chinese row will load'],
  ['', 'perfectly happily and be wrong, and nothing downstream can tell.'],
  ['', ''],
  ['', 'You do NOT have to fill in all of them. Map the twenty materials you actually buy and'],
  ['', 'the other three hundred keep the values the tool ships with. That is a normal way to'],
  ['', 'use this and nothing breaks.'],
  [],
  ['STEP 6', 'Recalculate and save.'],
  ['', 'Press F9. (Saving does it too.) Then File → Save As and give it a name with the'],
  ['', 'quarter in it, e.g. CostVision-rates-2025-Q2.xlsx. Keep it as .xlsx.'],
  [],
  ['STEP 7', 'Check it, then upload it.'],
  ['', 'Go to the tab named  Check . Every line that says "should be 0" must read 0. It also'],
  ['', 'tells you how many materials, machines and labour grades picked up a JLR rate — if'],
  ['', 'that is 0 across the board, something in step 4 or step 5 has not matched.'],
  ['', ''],
  ['', 'When it looks right: open CostVision, sign in as an admin, and go to Edit Rates.'],
  ['', 'Choose Upload company rates, and pick the file you just saved. The tool tells you'],
  ['', 'how many rows it read. From then on, every costing uses your rates.'],
  ['────────────────────────────────────────────────────────────────────────────────────────'],
  [],
  ['A WORKED EXAMPLE, END TO END'],
  ['', 'Your machine card has this row:'],
  ['', '   712008 | 100t Hydraulic Injection Moulding MC | United Kingdom | 04042025 | CB |'],
  ['', '   40.97 | 1.75 | 1.06 | 1.97 | 0.18 | 0.64 | 4.45 | 0.00 | 10.06'],
  ['', ''],
  ['', 'You paste it into JLR Machines. On Settings you put United Kingdom and 04042025.'],
  ['', 'On Mapping you find imm-100t ("100T Injection Moulding Machine") and type 712008'],
  ['', 'next to it; column D comes back with "100t Hydraulic Injection Moulding MC", so you'],
  ['', 'know it is the right row.'],
  ['', ''],
  ['', 'Press F9. The Machines tab now costs imm-100t at 10.06 per hour — exactly the'],
  ['', 'TOTAL_MACHINE_RATE on your card — split the way you supplied it:'],
  ['', '   maintenance 1.97/hr, energy 4.45/hr, floor space 1.06/hr, finance 0.64/hr,'],
  ['', '   indirect 0.18/hr, depreciation 1.76/hr.'],
  ['', ''],
  ['', 'And because CB is on that row at 40.97, mapping lab-uk-skilled to CB gives you the'],
  ['', 'labour rate too, without a separate labour file.'],
  [],
  ['HOW THE MACHINE RATE IS CARRIED ACROSS'],
  ['', 'JLR give a machine rate as seven elements in £/hr that add up to TOTAL_MACHINE_RATE.'],
  ['', 'The tool holds the same build-up as annual figures and divides by hours × utilisation.'],
  ['', 'So each element is multiplied by that machine’s hours × utilisation and the tool'],
  ['', 'divides it straight back out — the rate comes out on JLR’s number, and the report'],
  ['', 'shows a real breakdown rather than one lump. Depreciation takes the penny of'],
  ['', 'rounding so the rebuilt rate matches TOTAL_MACHINE_RATE exactly.'],
  ['', ''],
  ['', '   DEPRECIATION → annualDepreciation       MRO        → maintenance'],
  ['', '   UTILITIES    → energy                   FLOORSPACE → floorSpace'],
  ['', '   INTEREST     → financeCost              INSURANCE + CONSUMABLES → indirectSupport'],
  ['', ''],
  ['', 'If a row has only TOTAL_MACHINE_RATE and no elements, the total goes on one line and'],
  ['', 'the source note says the build-up was not supplied, so nobody reads it as real.'],
  [],
  ['NEXT QUARTER'],
  ['', 'Open this same file. Delete the old rows on the JLR tabs, paste the new ones,'],
  ['', 'change the two period cells on Settings, press F9, save, upload. Your mapping in'],
  ['', 'column C of the Mapping tab is still there — codes do not change quarter to quarter.'],
  [],
  ['IF SOMETHING LOOKS WRONG'],
  ['', 'Nothing picked up a rate         Country or period on Settings does not match the'],
  ['', '                                 file exactly. Copy and paste the value out of your'],
  ['', '                                 export rather than typing it.'],
  ['', ''],
  ['', 'Mapping column D says NOT FOUND   That code is not in the data you pasted. Check the'],
  ['', '                                 code, and check the paste reached the tab.'],
  ['', ''],
  ['', 'Check says a code matched more    Your paste has the same code twice — two countries,'],
  ['', 'than one row                     or two periods. Narrow it on Settings. Until you do,'],
  ['', '                                 that row keeps the tool’s own value on purpose.'],
  ['', ''],
  ['', 'A rate looks far too big or       Check B5 on Settings. percent and per kg are very'],
  ['', 'far too small                    different answers for the same number.'],
  ['', ''],
  ['', 'The tool rejects the upload       It names the sheet and the row. Usually a number'],
  ['', '                                 pasted as text, or a stray character in a cell.'],
  [],
  ['RULES THAT MATTER'],
  ['•', 'Do not change column A on the Materials, Machines or Labour tabs. Those ids are what'],
  ['', 'the costing formulas ask for. Rename one and every costing using it stops with'],
  ['', '"not found in rate library".'],
  ['•', 'Do not type numbers straight into the Materials, Machines or Labour tabs. They are'],
  ['', 'filled by formula and your typing would be overwritten on the next recalculation.'],
  ['', 'Everything you change goes on the three JLR tabs, Settings, and Mapping.'],
  ['•', 'Do not insert or delete columns on the JLR tabs. Rows, as many as you like.'],
  ['•', 'Anything you do not map keeps the value the tool ships with. A partial card is fine.'],
  ['•', 'CO2 is brought across for reference only. The upload has no carbon field, so the'],
  ['', 'tool will ignore that column.'],
  ['•', 'The sheet reads the first 20,000 rows of each JLR tab. That is far more than a'],
  ['', 'rate card, but if you ever paste more, the Check tab tells you — it does not'],
  ['', 'quietly ignore them.'],
  ['•', 'Energy, FX and overhead are not on the JLR exports, so they are not on Mapping.'],
  ['', 'They sit on their own tabs as plain numbers — edit them there if they need to move.'],
  ['•', 'The last columns on the Materials, Machines and Labour tabs hold the tool’s own'],
  ['', 'source notes. They are there for the formulas to fall back on. Leave them alone.'],
  [],
  ['WHAT EACH TAB IS FOR'],
  ['', 'Read me         this page'],
  ['', 'Settings        country, period, and what MATERIAL_RECLAIM means'],
  ['', 'JLR Machines    paste your machine rate card here'],
  ['', 'JLR Materials   paste your material rate card here'],
  ['', 'JLR Labour      paste your labour rate card here, or leave empty'],
  ['', 'Mapping         your JLR code against each tool rate — filled in once'],
  ['', 'Materials       ┐'],
  ['', 'Machines        │'],
  ['', 'Labour          ├ the tool’s upload format, filled in for you.'],
  ['', 'Energy          │ This is what gets read when you upload the file.'],
  ['', 'FX              │ Do not type into these.'],
  ['', 'Overhead        ┘'],
  ['', 'Check           read this before you upload'],
  [],
  [`Built from the tool's library version ${LIB.version}. Generated ${new Date().toISOString().slice(0, 10)}.`],
], [9, 92, 8]);

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
  // A code no export will contain, so that a row left behind by mistake cannot
  // collide with a real machine and quietly become a second match for it.
  ['EXAMPLE', 'EXAMPLE ROW, DELETE IT — your machine export goes here, from cell A2 down',
   'United Kingdom', '04042025', 'CB', 40.97, 1.75, 1.06, 1.97, 0.18, 0.64, 4.45, 0, 10.06],
], [14, 56, 16, 14, 16, 18, 14, 12, 10, 11, 10, 11, 13, 20]);

add('JLR Materials', [
  ['CODE', 'MATERIAL', 'COUNTRY', 'PERIOD', 'MATERIAL_RATE', 'MATERIAL_RECLAIM', 'CO2'],
  ['EXAMPLE', 'EXAMPLE ROW, DELETE IT — your material export goes here, from cell A2 down',
   'United Kingdom', '04-04-2025', 0.72, 40.48, 2.19],
], [16, 56, 16, 14, 14, 18, 10]);

add('JLR Labour', [
  ['LABOUR_CATEGORY', 'DESCRIPTION', 'COUNTRY_NAME', 'PERIOD_CODE', 'TOTAL_LABOUR_RATE'],
  ['EXAMPLE', 'EXAMPLE ROW, DELETE IT — or leave this whole tab empty and the sheet will',
   'United Kingdom', '04042025', 40.97],
  ['', 'read TOTAL_LABOUR_RATE out of the JLR Machines tab by LABOUR_CATEGORY instead.'],
], [18, 72, 16, 14, 18]);

// ── 4. Mapping — every id the tool uses, waiting for a JLR code ──────────────
const mapRows: unknown[][] = [['tool id', 'what it is (do not edit)', 'JLR code', 'JLR name for that code', 'category']];
type MapSeed = [id: string, what: string, category: string];
/**
 * Materials, machines and labour only.
 *
 * Energy, FX and overhead used to be listed here too, which was 43 rows
 * inviting somebody to type a code that nothing would ever read — the JLR
 * exports do not carry those rates. They are carried through as values on their
 * own tabs, where they can be edited directly.
 *
 * The region is on every description because the rate card is per country, and
 * mapping a UK rate onto the library's Chinese row would be a silent error —
 * the number would load, against the wrong row.
 */
const seeds: MapSeed[] = [
  ...LIB.materials.map(m =>
    [m.id, `${m.grade}${m.category ? ` — ${m.category}` : ''} — ${m.region}`, 'material'] as MapSeed),
  ...LIB.machines.map(m => [m.id, `${m.machineClass} — ${m.region}`, 'machine'] as MapSeed),
  ...LIB.labour.map(l => [l.id, `${l.skillLevel} — ${l.region}`, 'labour'] as MapSeed),
];
seeds.forEach(([id, what, category], i) => {
  const r = i + 2;
  // Echo JLR's own name back. Looked up on code alone, ignoring the country and
  // period filter — this is here to confirm the code is right, not to price
  // anything, and it should still answer when the filter excludes every row.
  const echo =
    `IF($C${r}="","",IFERROR(` +
    `IF($E${r}="machine",INDEX(${rng(MACH, 'B')},MATCH($C${r},${rng(MACH, 'A')},0)),` +
    `IF($E${r}="material",INDEX(${rng(MATL, 'B')},MATCH($C${r},${rng(MATL, 'A')},0)),` +
    `IF($E${r}="labour",IFERROR(INDEX(${rng(LABR, 'B')},MATCH($C${r},${rng(LABR, 'A')},0)),` +
    `"labour category "&$C${r}&" — from the machine tab"),""))),` +
    `"NOT FOUND — check the code"))`;
  mapRows.push([id, what, '', fx(echo, ''), category]);
});
add('Mapping', mapRows, [24, 46, 14, 50, 12]);

// ── 5. Materials — the tool's upload format, filled by formula ───────────────
const matRows: unknown[][] = [[
  'id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3',
  'region', 'effectiveDate', 'sourceNote', 'confidence',
  // Helper columns. The upload ignores anything it does not recognise — checked —
  // so they stay where the person filling this in can watch the lookup work.
  'JLR code', 'rows matched', 'MATERIAL_RATE', 'MATERIAL_RECLAIM', 'scrap £/kg', 'CO2 (reference only)',
  // The fall-backs live in cells rather than inside the formulas: Excel caps a
  // string literal in a formula at 255 characters and some of these notes are
  // longer than that.
  'built-in source note', 'built-in effective date',
]];
LIB.materials.forEach((m, i) => {
  const r = i + 2;
  const [K, L, M, N, O] = [`$K${r}`, `$L${r}`, `$M${r}`, `$N${r}`, `$O${r}`];
  matRows.push([
    m.id, m.grade, m.category,
    fx(orBuiltin(M, m.pricePerKg), m.pricePerKg),
    fx(orBuiltin(O, m.scrapRecoveryPricePerKg), m.scrapRecoveryPricePerKg),
    m.densityKgPerM3, m.region,
    fx(`IF(${M}>0,${pickText(L, K, MATL, 'A', 'D', `$R${r}`)},$R${r})`, m.effectiveDate),
    fx(`IF(${M}>0,"JLR rate card — material code "&${K},$Q${r})`, m.sourceNote),
    m.confidence,
    fx(code(r), ''),
    fx(matches(K, MATL, 'A', 'C', 'D'), 0),
    fx(pick(L, K, MATL, 'A', 'E', 'C', 'D'), 0),
    fx(pick(L, K, MATL, 'A', 'F', 'C', 'D'), 0),
    // Percentage of the rate, or already £/kg — set once on Settings. Guessing
    // here would be a 40x error in either direction.
    fx(`IF(${N}=0,0,IF(Settings!$B$5="percent",${M}*${N}/100,${N}))`, 0),
    fx(pick(L, K, MATL, 'A', 'G', 'C', 'D'), 0),
    m.sourceNote, m.effectiveDate,
  ]);
});
add('Materials', matRows, [22, 24, 16, 12, 22, 14, 10, 14, 40, 12, 12, 12, 14, 16, 12, 18, 40, 16]);

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
  'built-in source note', 'built-in effective date',
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
    fx(`IF(${X}>0,${pickText(P, O, MACH, 'A', 'D', `$AB${r}`)},$AB${r})`, m.effectiveDate),
    // Say plainly which of the two happened, so nobody reads a back-solved
    // lump as a real depreciation figure.
    fx(`IF(${X}>0,IF(${Y}>0,"JLR machine "&${O}&" at "&TEXT(${X},"0.00")&" per hr — build-up as supplied",` +
       `"JLR machine "&${O}&" at "&TEXT(${X},"0.00")&" per hr — build-up not supplied"),$AA${r})`,
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
    m.sourceNote ?? '', m.effectiveDate,
  ]);
});
add('Machines', machRows, [22, 28, 10, 18, 14, 12, 12, 16, 14, 20, 18, 14, 52, 12,
                           12, 12, 14, 12, 10, 11, 10, 11, 13, 20, 14, 22, 40, 16]);

// ── 6. Labour — from its own tab if there is one, else out of the machines ───
const labRows: unknown[][] = [[
  'id', 'region', 'skillLevel', 'fullyLoadedRatePerHr', 'effectiveDate', 'sourceNote',
  'confidence', 'JLR code', 'rows matched', 'from JLR Labour', 'from JLR Machines', 'rate used',
  'built-in source note',
]];
LIB.labour.forEach((l, i) => {
  const r = i + 2;
  const [H, I, J, K, L] = [`$H${r}`, `$I${r}`, `$J${r}`, `$K${r}`, `$L${r}`];
  labRows.push([
    l.id, l.region, l.skillLevel,
    fx(orBuiltin(L, l.fullyLoadedRatePerHr), l.fullyLoadedRatePerHr),
    l.effectiveDate,
    fx(`IF(${L}>0,"JLR rate card — labour category "&${H},$M${r})`, l.sourceNote),
    l.confidence,
    fx(code(r), ''),
    fx(matches(H, LABR, 'A', 'C', 'D'), 0),
    fx(pick(I, H, LABR, 'A', 'E', 'C', 'D'), 0),
    // The fallback. Every machine on a category carries the same
    // TOTAL_LABOUR_RATE, so an average over them is that rate — and unlike the
    // machine lookup there is no single row to insist on.
    fx(`IF(${H}="",0,IFERROR(AVERAGEIFS(${rng(MACH, 'F')},${rng(MACH, 'E')},${H},${filt(MACH, 'C', 'D')}),0))`, 0),
    fx(`IF(${J}>0,${J},${K})`, 0),
    l.sourceNote,
  ]);
});
add('Labour', labRows, [22, 12, 26, 20, 14, 44, 12, 12, 12, 16, 18, 12, 40]);

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

// ── 7. Check — did it pick anything up, and does it add up ───────────────────
const nMat = LIB.materials.length, nMach = LIB.machines.length, nLab = LIB.labour.length;
const mapEnd = 1 + seeds.length;
const elems = ['G', 'H', 'I', 'J', 'K', 'L', 'M'].map(c => rng(MACH, c)).join('+');
add('Check', [
  ['Check before you upload'],
  [],
  ['What', 'Count', 'Should be'],
  ['Codes you have filled in on Mapping',
   fx(`COUNTIFS(Mapping!C2:C${mapEnd},"<>")`, 0), 'however many you have'],
  ['…of those, codes not found on any JLR tab',
   fx(`COUNTIF(Mapping!D2:D${mapEnd},"NOT FOUND*")`, 0), '0 — the code is wrong'],
  [],
  // Counting matches rather than values was misleading: a code that found its
  // row but whose rate cell was blank counted as "taken" while the row quietly
  // kept the tool's own number. These count the rate that actually arrived.
  ['Materials taking a JLR price',
   fx(`COUNTIF(Materials!M2:M${nMat + 1},">0")`, 0), ''],
  ['Machines taking a JLR rate',
   fx(`COUNTIF(Machines!X2:X${nMach + 1},">0")`, 0), ''],
  ['Labour grades taking a JLR rate',
   fx(`COUNTIF(Labour!L2:L${nLab + 1},">0")`, 0), ''],
  ['Codes that found their row but the rate on it was blank or zero',
   fx(`COUNTIF(Materials!L2:L${nMat + 1},1)-COUNTIF(Materials!M2:M${nMat + 1},">0")` +
      `+COUNTIF(Machines!P2:P${nMach + 1},1)-COUNTIF(Machines!X2:X${nMach + 1},">0")`, 0),
   '0 — otherwise those rows kept our value'],
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
   fx(`SUMPRODUCT((${rng(MACH, 'A')}<>"")*` +
      `((${elems})>0)*` +
      `(ABS((${elems})-${rng(MACH, 'N')})>0.02))`, 0),
   '0 — otherwise ask about the export'],
  ['Pasted rows beyond the ' + PASTE_ROWS.toLocaleString('en-GB') + ' this sheet reads',
   fx(`MAX(0,COUNTA(${MACH}!$A:$A)-1-${PASTE_ROWS})+MAX(0,COUNTA(${MATL}!$A:$A)-1-${PASTE_ROWS})` +
      `+MAX(0,COUNTA(${LABR}!$A:$A)-1-${PASTE_ROWS})`, 0),
   '0 — rows past it are not read'],
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
