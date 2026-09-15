/**
 * Build the rate-card converter workbook.
 *
 *   npx tsx scripts/build-rate-converter-xlsx.ts [out.xlsx]
 *
 * THE PROBLEM IT SOLVES. The JLR rate card arrives as JLR's export, in JLR's
 * columns, keyed by JLR's codes. The tool's upload wants the tool's ids —
 * `mat-steel1045`, `mach-vmc3`, `lab-uk-skilled` — because those ids are what
 * the costing formulas ask for, and renaming one stops every costing that uses
 * it. Nobody is retyping 328 materials, 178 machines and 42 labour grades every
 * quarter, and a human retyping 548 numbers will make mistakes.
 *
 * HOW IT WORKS. Paste the three exports into the three tabs that carry JLR's
 * exact headers. Say which country and period you want on Settings. Put the JLR
 * code against each tool id on Mapping, once. Everything else fills itself in
 * and the file is ready to upload.
 *
 * WRITTEN WITH EXCELJS, NOT SHEETJS. SheetJS cannot write cell formatting at
 * all — no fills, fonts, borders, frozen panes, validation or conditional
 * formats — so the workbook looked like a data dump of something that people
 * are meant to work in. ExcelJS writes the same formulas with the formatting
 * that makes an input cell look like an input cell.
 *
 * THE MACHINE BUILD-UP SURVIVES. The JLR machine rate is already a build-up in
 * £/hr, and its seven elements sum to TOTAL_MACHINE_RATE (verified against the
 * supplied card, to a penny of rounding). The tool's build-up is the same shape
 * annualised, so each element maps across and is multiplied by that row's own
 * hours x utilisation — which the tool then divides straight back out. The rate
 * lands on the published number and the report shows a real breakdown.
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
 * block .xlsm. Every row falls back to the tool's own value when nothing is
 * mapped, so a partial card is fine. Next quarter is paste, refresh, upload.
 *
 * WHAT IT REFUSES TO GUESS. A code that matches more than one pasted row keeps
 * the tool's own value and is counted on Check. A wrong rate is worse than an
 * unchanged one.
 *
 * EVERY ANCHOR IS FIXED. Headers sit in row 1 on every tab the parser or a
 * formula reads, Settings answers live in B2:B5, and the Check tab is read by
 * the label in column A. Tests pin all three — the instructions name cells, and
 * instructions that name cells go stale silently.
 */
import ExcelJS from 'exceljs';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';

const LIB = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const OUT = process.argv[2] ?? 'CostVision-JLR-Rate-Converter.xlsx';

// ─── House style ─────────────────────────────────────────────────────────────
// One palette, used the same way everywhere: navy says "heading", amber says
// "you type here", grey says "this fills itself in".
const INK = 'FF1F2A44';       // headings and header bands
const PAPER = 'FFF4F6F8';     // calculated cells
const INPUT = 'FFFFF6DE';     // cells a person fills in
const INPUT_EDGE = 'FFD9B441';
const WORKING = 'FFEDEFF3';   // helper columns — visible, plainly secondary
const BAND = 'FFEEF2F7';      // section headings on the guide tabs
const GOOD = 'FF1E7F4B';
const BAD = 'FFB3261E';
const MUTED = 'FF6B7686';
const LINE = 'FFD5DAE2';

const FONT = 'Calibri';
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const edge = (argb = LINE): Partial<ExcelJS.Borders> => ({
  top: { style: 'thin', color: { argb } }, left: { style: 'thin', color: { argb } },
  bottom: { style: 'thin', color: { argb } }, right: { style: 'thin', color: { argb } },
});

// ─── Lookup formulas ─────────────────────────────────────────────────────────

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
const MAP_ROWS = LIB.materials.length + LIB.machines.length + LIB.labour.length;

/** The three tabs the export is pasted into, named as formulas reference them. */
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
 *
 * There are two period cells because the same quarter is stamped differently on
 * the two exports — the machine card carries PERIOD_CODE 04042025 and the
 * material card carries PERIOD 04-04-2025. One filter could not match both, and
 * a filter that silently fails to match is the worst outcome here.
 */
const CTRY = `IF(Settings!$B$2="","<>",Settings!$B$2)`;
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
 * + EuroMap290 Inj Unit" can. Mapping echoes the name back beside it so the
 * person filling it in can see they picked the right row.
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
 * NOT JSON.stringify, which was a bug here: it escapes a quote as \" and Excel
 * wants "". Two rows in the library quote a phrase in their source note and
 * both came out as #VALUE!.
 *
 * Short strings only. Excel caps a string literal inside a formula at 255
 * characters and three source notes are longer than that, so anything that
 * might be long goes in a helper cell and the formula points at it.
 */
const q = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;

/**
 * The conversion rules, collected as they are built.
 *
 * The "How it converts" tab is rendered from this — the real formula string off
 * the real row, not a description of it written separately. A description
 * written separately drifts from the sheet and nobody notices until somebody
 * trusts it.
 */
interface Rule { group: string; from: string; to: string; plain: string; formula: string; }
const RULES: Rule[] = [];
const rule = (group: string, from: string, to: string, plain: string, formula: string) => {
  // Registered from the first row only. The formula is the same shape all the
  // way down, and 2,970 identical entries is not documentation.
  if (!RULES.some(x => x.group === group && x.to === to)) RULES.push({ group, from, to, plain, formula });
  return formula;
};

// ─── Sheet furniture ─────────────────────────────────────────────────────────

const wb = new ExcelJS.Workbook();
wb.creator = 'CostVision';
wb.created = new Date();

type Kind = 'guide' | 'input' | 'output' | 'check';
const TAB_COLOUR: Record<Kind, string> = {
  guide: INK, input: 'FFD9B441', output: 'FF8A94A6', check: 'FF1E7F4B',
};

function sheet(name: string, kind: Kind, gridlines = true): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: TAB_COLOUR[kind] }, defaultRowHeight: 15 },
    views: [{ showGridLines: gridlines }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins:
      { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });
  ws.properties.defaultColWidth = 12;
  return ws;
}

/** The banner every guide tab opens with. */
function banner(ws: ExcelJS.Worksheet, title: string, subtitle: string, lastCol: string) {
  ws.mergeCells(`A1:${lastCol}1`);
  const t = ws.getCell('A1');
  t.value = title;
  t.font = { name: FONT, size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  t.fill = fill(INK);
  t.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 36;

  ws.mergeCells(`A2:${lastCol}2`);
  const s = ws.getCell('A2');
  s.value = subtitle;
  s.font = { name: FONT, size: 10, color: { argb: MUTED }, italic: true };
  s.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 20;
}

/** A row of header cells across row 1 of a data tab: navy band, frozen, filterable. */
function headers(ws: ExcelJS.Worksheet, names: string[], widths: number[], firstHelper = -1) {
  ws.columns = widths.map(width => ({ width }));
  const row = ws.getRow(1);
  names.forEach((name, i) => {
    const c = row.getCell(i + 1);
    c.value = name;
    const helper = firstHelper >= 0 && i >= firstHelper;
    c.font = { name: FONT, size: 10, bold: true, color: { argb: helper ? MUTED : 'FFFFFFFF' } };
    c.fill = fill(helper ? WORKING : INK);
    c.alignment = { vertical: 'middle', wrapText: true, horizontal: helper ? 'center' : 'left', indent: helper ? 0 : 1 };
    c.border = edge(helper ? LINE : INK);
  });
  row.height = 30;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1, showGridLines: true }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: names.length } };
  ws.pageSetup.printTitlesRow = '1:1';
}

/** Write a guide line: a marker in A, the words in B. */
let guideRow = 3;
function say(ws: ExcelJS.Worksheet, marker: string, text: string,
             opts: { head?: boolean; mono?: boolean; strong?: boolean } = {}) {
  const r = ++guideRow;
  const a = ws.getCell(`A${r}`), b = ws.getCell(`B${r}`);
  a.value = marker || null;
  b.value = text || null;
  if (opts.head) {
    ws.mergeCells(`A${r}:C${r}`);
    a.value = marker;
    a.font = { name: FONT, size: 12, bold: true, color: { argb: INK } };
    a.fill = fill(BAND);
    a.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(r).height = 24;
    return r;
  }
  a.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
  a.alignment = { vertical: 'top', horizontal: 'left' };
  b.font = { name: FONT, size: 11, bold: !!opts.strong,
             color: { argb: opts.mono ? MUTED : 'FF333A45' } };
  if (opts.mono) b.font = { name: 'Consolas', size: 10, color: { argb: INK } };
  b.alignment = { vertical: 'top', wrapText: false, indent: 1 };
  return r;
}
const gap = (ws: ExcelJS.Worksheet) => { guideRow++; };

// ─── 1. Start here ───────────────────────────────────────────────────────────
{
  const ws = sheet('Start here', 'guide', false);
  ws.columns = [{ width: 10 }, { width: 104 }, { width: 10 }];
  banner(ws, 'CostVision rate card converter',
    'Put your own rates into CostVision without retyping them. Seven steps, about ten minutes the first time.',
    'C');
  guideRow = 3;

  say(ws, 'WHAT THIS IS FOR', '', { head: true });
  say(ws, '', 'You get a rate card in your own layout, with your own codes. CostVision needs its own ids,');
  say(ws, '', 'because those ids are what its costing formulas look for. This workbook joins the two.');
  say(ws, '', 'You paste your rates in. It fills in the file CostVision reads. Nothing is renamed, and');
  say(ws, '', 'there is no code to change. It is ordinary Excel formulas, so there are no macros to allow.');
  gap(ws);

  say(ws, 'BEFORE YOU START', '', { head: true });
  say(ws, '', 'Have your machine rate card and your material rate card open.');
  say(ws, '', 'If labour comes as its own file, have that too. If it does not, you will not need one.');
  say(ws, '', 'Know the country you are costing in, and the period stamped on each file.');
  gap(ws);

  say(ws, 'THE SEVEN STEPS', '', { head: true });
  say(ws, 'STEP 1', 'Paste the machine rates.', { strong: true });
  say(ws, '', 'a.  Go to the tab called  JLR Machines.');
  say(ws, '', 'b.  Row 2 is an example. Click the row 2 number, right-click, and choose Delete Row.');
  say(ws, '', 'c.  In your machine file, select all the rows of data. Not the header row.');
  say(ws, '', 'd.  Come back here, click cell  A2 , and paste. Use Paste Special → Values if you have it.');
  say(ws, '', 'e.  Look across: MACHINE_CODE should be in column A, TOTAL_MACHINE_RATE in column N.');
  say(ws, '', 'Row 1 already has your 14 headers on it, in the shaded band. Leave that row alone.');
  say(ws, '', 'If your file has extra columns, or has them in a different order, tidy your copy first so');
  say(ws, '', 'the columns line up with row 1 here. Paste as many rows as you like, all countries');
  say(ws, '', 'included. Step 4 is what picks out the ones you want.');
  gap(ws);

  say(ws, 'STEP 2', 'Paste the material rates.', { strong: true });
  say(ws, '', 'Same again on the  JLR Materials  tab. Delete the example on row 2, then paste your');
  say(ws, '', 'rows into cell  A2 . CODE goes in column A, CO2 in column G.');
  gap(ws);

  say(ws, 'STEP 3', 'Paste the labour rates, if you have them separately.', { strong: true });
  say(ws, '', 'On the card we have seen, labour is already inside the machine file, as');
  say(ws, '', 'TOTAL_LABOUR_RATE next to a LABOUR_CATEGORY. If that is true for you, skip this step.');
  say(ws, '', 'Go to  JLR Labour , delete the example rows, and leave the tab empty. The sheet will');
  say(ws, '', 'find labour on the machine tab instead.');
  say(ws, '', 'If you do have a separate labour file, delete the examples and paste into  A2  as before.');
  gap(ws);

  say(ws, 'STEP 4', 'Say which country and which period you want.', { strong: true });
  say(ws, '', 'Go to the  Settings  tab and fill in the four shaded cells in column B:');
  say(ws, '', '   B2   Country            for example   United Kingdom');
  say(ws, '', '   B3   Machine period     for example   04042025        (copy it from PERIOD_CODE)');
  say(ws, '', '   B4   Material period    for example   04-04-2025      (copy it from PERIOD)');
  say(ws, '', '   B5   MATERIAL_RECLAIM   choose        percent  or  per kg');
  say(ws, '', 'Type each one exactly as it appears in your file, spaces and dashes and all. Copying it');
  say(ws, '', 'straight out of the file is safer than typing it.');
  say(ws, '', 'There are two period boxes on purpose. The two files write the same quarter differently.');
  say(ws, '', 'Leave a box empty only if you have already cut that file down to one country and one period.');
  say(ws, '', 'About B5: if MATERIAL_RECLAIM is a percentage of the material rate, leave it on percent.');
  say(ws, '', 'If it is already a price per kilo, choose per kg. Please check which one it is with whoever');
  say(ws, '', 'looks after the rate card. Getting it the wrong way round changes the scrap credit a lot.');
  gap(ws);

  say(ws, 'STEP 5', 'Say which of your codes is which CostVision rate. You only do this once.', { strong: true });
  say(ws, '', 'Go to the  Mapping  tab. It lists every rate CostVision uses, with a plain description of');
  say(ws, '', 'each one in column B, such as "1045 / C45 (Medium-Carbon Steel) — UK".');
  say(ws, '', 'In column C, type your own CODE next to the ones you have. Leave the rest empty.');
  say(ws, '', 'Column D then shows the name you hold against that code. Read it. If it is not the thing');
  say(ws, '', 'you meant, the code is wrong. If it turns red and says NOT FOUND, that code is not in the');
  say(ws, '', 'data you pasted.');
  say(ws, '', 'For labour, the code is the LABOUR_CATEGORY, such as CB. It is not a machine number.');
  say(ws, '', 'Every description ends with the region it belongs to, such as "— UK" or "— CN". Put a UK');
  say(ws, '', 'rate card against the UK rows. A UK rate put on a Chinese row will load quite happily and');
  say(ws, '', 'be wrong, and nothing further down can tell.');
  say(ws, '', 'You do not have to fill in all of them. Map the twenty materials you actually buy and the');
  say(ws, '', 'other three hundred keep the values CostVision ships with. That is a normal way to use this.');
  gap(ws);

  say(ws, 'STEP 6', 'Recalculate and save.', { strong: true });
  say(ws, '', 'Press F9. Saving does it too. Then use File → Save As and put the quarter in the name,');
  say(ws, '', 'such as CostVision-rates-2025-Q2.xlsx. Keep it as .xlsx.');
  gap(ws);

  say(ws, 'STEP 7', 'Check it, then upload it.', { strong: true });
  say(ws, '', 'Go to the  Check  tab. Every line that should be zero turns green when it is, and red when');
  say(ws, '', 'it is not. It also tells you how many rates were picked up. If that is zero all the way');
  say(ws, '', 'down, something in step 4 or step 5 has not matched.');
  say(ws, '', 'When it looks right: open CostVision, sign in as an admin, and go to Edit Rates.');
  say(ws, '', 'Choose Upload company rates, and pick the file you just saved. It will tell you how many');
  say(ws, '', 'rows it read. From then on, every costing uses your rates.');
  gap(ws);

  say(ws, 'AN EXAMPLE, ALL THE WAY THROUGH', '', { head: true });
  say(ws, '', 'Say your machine card has this row on it:');
  say(ws, '', '712008 | 100t Hydraulic Injection Moulding MC | United Kingdom | 04042025 | CB |', { mono: true });
  say(ws, '', '40.97 | 1.75 | 1.06 | 1.97 | 0.18 | 0.64 | 4.45 | 0.00 | 10.06', { mono: true });
  say(ws, '', 'You paste it into JLR Machines. On Settings you put United Kingdom and 04042025.');
  say(ws, '', 'On Mapping you find imm-100t, "100T Injection Moulding Machine — UK", and type 712008');
  say(ws, '', 'next to it. Column D comes back with "100t Hydraulic Injection Moulding MC", so you know');
  say(ws, '', 'you picked the right row.');
  say(ws, '', 'Press F9. CostVision now costs that machine at 10.06 an hour, which is exactly the');
  say(ws, '', 'TOTAL_MACHINE_RATE on your card, and it keeps the split you gave it:');
  say(ws, '', 'maintenance 1.97/hr, energy 4.45/hr, floor space 1.06/hr, finance 0.64/hr,', { mono: true });
  say(ws, '', 'indirect 0.18/hr, depreciation 1.76/hr.', { mono: true });
  say(ws, '', 'And because CB sits on that row at 40.97, mapping lab-uk-skilled to CB gives you the');
  say(ws, '', 'labour rate as well, with no separate labour file.');
  say(ws, '', 'The tab called How it converts shows every formula behind this, line by line.');
  gap(ws);

  say(ws, 'NEXT QUARTER', '', { head: true });
  say(ws, '', 'Open this same file. Delete the old rows on the JLR tabs and paste the new ones. Change');
  say(ws, '', 'the two period boxes on Settings. Press F9, save, upload. Your column C on the Mapping');
  say(ws, '', 'tab is still filled in, because codes do not change from quarter to quarter.');
  gap(ws);

  say(ws, 'IF SOMETHING LOOKS WRONG', '', { head: true });
  say(ws, '', 'Nothing was picked up at all.');
  say(ws, '', '   The country or the period on Settings does not match the file exactly. Copy the value');
  say(ws, '', '   out of your export and paste it in, rather than typing it.');
  say(ws, '', 'Column D on Mapping says NOT FOUND.');
  say(ws, '', '   That code is not in the data you pasted. Check the code, and check the paste landed.');
  say(ws, '', 'Check says a code matched more than one row.');
  say(ws, '', '   Your paste has the same code twice, usually two countries or two periods. Narrow it on');
  say(ws, '', '   Settings. Until you do, that row keeps the CostVision value on purpose.');
  say(ws, '', 'A rate looks far too big or far too small.');
  say(ws, '', '   Look at B5 on Settings. percent and per kg give very different answers.');
  say(ws, '', 'CostVision would not accept the file.');
  say(ws, '', '   It will name the tab and the row. It is usually a number that pasted in as text.');
  gap(ws);

  say(ws, 'A FEW RULES THAT MATTER', '', { head: true });
  say(ws, '•', 'Do not change column A on the Materials, Machines or Labour tabs. Those ids are what the');
  say(ws, '', 'costing formulas look for. Rename one and every costing using it stops.');
  say(ws, '•', 'Do not type numbers into the Materials, Machines or Labour tabs. They fill themselves in,');
  say(ws, '', 'and your typing would be wiped the next time the sheet recalculates. Everything you');
  say(ws, '', 'change goes on the JLR tabs, on Settings, and on Mapping. Those are the shaded cells.');
  say(ws, '•', 'Do not add or remove columns on the JLR tabs. Rows, as many as you like.');
  say(ws, '•', 'Anything you do not map keeps the value CostVision ships with. A part-filled card is fine.');
  say(ws, '•', 'Energy, FX and overhead are not on the JLR exports, so they are not on Mapping. They sit');
  say(ws, '', 'on their own tabs as plain numbers. Edit them there if they need to move.');
  say(ws, '•', 'The grey columns on the right of each tab are the sheet working. Leave them be.');
  say(ws, '•', 'The sheet reads the first 20,000 rows of each JLR tab. That is far more than a rate card,');
  say(ws, '', 'and if you ever paste more, the Check tab says so rather than quietly ignoring them.');
  gap(ws);

  say(ws, 'WHAT EACH TAB IS FOR', '', { head: true });
  const tabs: [string, string][] = [
    ['Start here', 'this page'],
    ['How it converts', 'every formula, in plain words. Read this if you want to check the working.'],
    ['Settings', 'country, period, and what MATERIAL_RECLAIM means'],
    ['JLR Machines', 'paste your machine rate card here'],
    ['JLR Materials', 'paste your material rate card here'],
    ['JLR Labour', 'paste your labour rate card here, or leave it empty'],
    ['Mapping', 'your code against each CostVision rate. Filled in once.'],
    ['Materials', 'what CostVision reads. Fills itself in. Do not type here.'],
    ['Machines', 'what CostVision reads. Fills itself in. Do not type here.'],
    ['Labour', 'what CostVision reads. Fills itself in. Do not type here.'],
    ['Energy', 'not on the JLR card. Plain numbers, edit if you need to.'],
    ['FX', 'not on the JLR card. Plain numbers, edit if you need to.'],
    ['Overhead', 'not on the JLR card. Plain numbers, edit if you need to.'],
    ['Check', 'read this before you upload'],
  ];
  for (const [name, what] of tabs) {
    const r = say(ws, '', `${name.padEnd(18)}${what}`, { mono: true });
    ws.getCell(`B${r}`).font = { name: 'Consolas', size: 10, color: { argb: 'FF333A45' } };
  }
  gap(ws);
  const last = say(ws, '', `Built from CostVision rate library ${LIB.version}. Generated ${new Date().toISOString().slice(0, 10)}.`);
  ws.getCell(`B${last}`).font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };
}

/**
 * Created here so it sits second in the tab strip, where somebody looking for
 * the working will find it. It is filled in at the end, once the tabs below
 * have registered what they do.
 */
const HOW = sheet('How it converts', 'guide', false);

// ─── 2. Settings ─────────────────────────────────────────────────────────────
{
  const ws = sheet('Settings', 'input', false);
  headers(ws, ['Setting', 'Value', 'What it does'], [26, 22, 96]);
  ws.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
  const rows: [string, string | number, string][] = [
    ['Country', '', 'Type it exactly as your file writes it, e.g. United Kingdom. Leave empty to take any.'],
    ['Machine period', '', 'The PERIOD_CODE on your machine and labour files, e.g. 04042025.'],
    ['Material period', '', 'The PERIOD on your material file, e.g. 04-04-2025. The two files write it differently.'],
    ['MATERIAL_RECLAIM is', 'percent', 'Is it a percentage of the material rate, or already a price per kilo? Please check.'],
  ];
  rows.forEach(([label, value, what], i) => {
    const r = i + 2;
    const a = ws.getCell(`A${r}`), b = ws.getCell(`B${r}`), c = ws.getCell(`C${r}`);
    a.value = label; a.font = { name: FONT, size: 11, bold: true, color: { argb: INK } };
    a.alignment = { vertical: 'middle', indent: 1 };
    b.value = value;
    b.font = { name: FONT, size: 11, bold: true, color: { argb: INK } };
    b.fill = fill(INPUT); b.border = edge(INPUT_EDGE);
    b.alignment = { vertical: 'middle', horizontal: 'center' };
    c.value = what; c.font = { name: FONT, size: 10, color: { argb: MUTED } };
    c.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(r).height = 22;
  });
  // A list, so nobody has to guess the spelling of the one setting with only
  // two right answers.
  ws.getCell('B5').dataValidation = {
    type: 'list', allowBlank: false, formulae: ['"percent,per kg"'],
    showErrorMessage: true, errorTitle: 'Choose one',
    error: 'Type percent, or per kg. Nothing else will be understood.',
  };
  guideRow = 6;
  gap(ws);
  say(ws, '', 'The shaded boxes are the only things to fill in on this tab.');
  say(ws, '', 'Leave a box empty only if you have already cut that file down to one country and one period.');
  say(ws, '', 'If a code ends up matching two rows, the Check tab will tell you, and CostVision keeps its');
  say(ws, '', 'own value for that row rather than guessing which of the two you meant.');
}

// ─── 3. The three tabs the rate card is pasted into ──────────────────────────
function pasteTab(name: string, cols: string[], widths: number[], money: number[],
                  example: (string | number)[]) {
  const ws = sheet(name, 'input');
  headers(ws, cols, widths);
  const row = ws.getRow(2);
  example.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v;
    c.font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
    c.fill = fill('FFFDF3F2');
  });
  row.getCell(2).font = { name: FONT, size: 10, bold: true, italic: true, color: { argb: BAD } };
  for (const i of money) ws.getColumn(i).numFmt = '#,##0.00';
  // Nothing is written at the bottom of the paste range. A marker down there
  // stretched the used area to 20,000 empty rows: the file grew, Ctrl+End
  // landed in the middle of nowhere, and the "rows beyond what is read" count
  // on Check was one out because COUNTA saw the marker as a row of data.
  return ws;
}

pasteTab('JLR Machines',
  ['MACHINE_CODE', 'MACHINE_NAME', 'COUNTRY_NAME', 'PERIOD_CODE', 'LABOUR_CATEGORY',
   'TOTAL_LABOUR_RATE', 'DEPRECIATION', 'FLOORSPACE', 'MRO', 'INSURANCE', 'INTEREST',
   'UTILITIES', 'CONSUMABLES', 'TOTAL_MACHINE_RATE'],
  [16, 56, 18, 15, 17, 15, 14, 13, 11, 12, 11, 12, 14, 17],
  [6, 7, 8, 9, 10, 11, 12, 13, 14],
  // A code no export will contain, so a row left behind by mistake cannot
  // collide with a real machine and quietly become a second match for it.
  ['EXAMPLE', 'EXAMPLE ROW, DELETE IT — your machine export goes here, from cell A2 down',
   'United Kingdom', '04042025', 'CB', 40.97, 1.75, 1.06, 1.97, 0.18, 0.64, 4.45, 0, 10.06]);

pasteTab('JLR Materials',
  ['CODE', 'MATERIAL', 'COUNTRY', 'PERIOD', 'MATERIAL_RATE', 'MATERIAL_RECLAIM', 'CO2'],
  [18, 56, 18, 15, 15, 18, 11], [5, 6, 7],
  ['EXAMPLE', 'EXAMPLE ROW, DELETE IT — your material export goes here, from cell A2 down',
   'United Kingdom', '04-04-2025', 0.72, 40.48, 2.19]);

pasteTab('JLR Labour',
  ['LABOUR_CATEGORY', 'DESCRIPTION', 'COUNTRY_NAME', 'PERIOD_CODE', 'TOTAL_LABOUR_RATE'],
  [18, 72, 18, 15, 18], [5],
  ['EXAMPLE', 'EXAMPLE ROW, DELETE IT — or leave this whole tab empty, and the sheet will read '
   + 'TOTAL_LABOUR_RATE off the JLR Machines tab by LABOUR_CATEGORY instead',
   'United Kingdom', '04042025', 40.97]);

// ─── 4. Mapping ──────────────────────────────────────────────────────────────
type MapSeed = [id: string, what: string, category: string];
/**
 * Materials, machines and labour only.
 *
 * Energy, FX and overhead used to be listed here too, which was 43 rows
 * inviting somebody to type a code that nothing would ever read — the exports
 * do not carry those rates. They are carried through as values on their own
 * tabs, where they can be edited directly.
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
{
  const ws = sheet('Mapping', 'input');
  headers(ws, ['tool id', 'what it is (do not edit)', 'JLR code', 'JLR name for that code', 'category'],
          [24, 52, 16, 56, 12]);
  seeds.forEach(([id, what, category], i) => {
    const r = i + 2;
    // Echo the name back. Looked up on code alone, ignoring the country and
    // period filter — this is here to confirm the code is right, not to price
    // anything, and it should still answer when the filter excludes every row.
    const echo =
      `IF($C${r}="","",IFERROR(` +
      `IF($E${r}="machine",INDEX(${rng(MACH, 'B')},MATCH($C${r},${rng(MACH, 'A')},0)),` +
      `IF($E${r}="material",INDEX(${rng(MATL, 'B')},MATCH($C${r},${rng(MATL, 'A')},0)),` +
      `IF($E${r}="labour",IFERROR(INDEX(${rng(LABR, 'B')},MATCH($C${r},${rng(LABR, 'A')},0)),` +
      `"labour category "&$C${r}&" — from the machine tab"),""))),` +
      `"NOT FOUND — check the code"))`;
    ws.getCell(`A${r}`).value = id;
    ws.getCell(`B${r}`).value = what;
    ws.getCell(`C${r}`).value = null;
    ws.getCell(`D${r}`).value = { formula: echo, result: '' };
    ws.getCell(`E${r}`).value = category;
    for (const col of ['A', 'B', 'E']) {
      const c = ws.getCell(`${col}${r}`);
      c.font = { name: FONT, size: 10, color: { argb: col === 'A' ? INK : 'FF333A45' } };
      c.alignment = { indent: 1 };
    }
    ws.getCell(`E${r}`).font = { name: FONT, size: 9, color: { argb: MUTED } };
    const c = ws.getCell(`C${r}`);
    c.fill = fill(INPUT); c.border = edge(INPUT_EDGE);
    c.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    c.alignment = { horizontal: 'center' };
    const d = ws.getCell(`D${r}`);
    d.font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
    d.alignment = { indent: 1 };
  });
  // Red, the moment a code does not exist. Nobody reads a column of grey text
  // looking for the one line that changed.
  ws.addConditionalFormatting({
    ref: `D2:D${seeds.length + 1}`,
    rules: [{
      type: 'containsText', operator: 'containsText', text: 'NOT FOUND', priority: 1,
      style: { font: { bold: true, color: { argb: BAD } }, fill: fill('FFFCE9E7') },
    } as ExcelJS.ConditionalFormattingRule],
  });
}

// ─── 5. The tabs CostVision reads, filled in by formula ──────────────────────

type Cell = string | number | null | { formula: string; result: number | string };
const F = (formula: string, result: number | string) => ({ formula, result });

/** Write one row of an output tab, styling by what the cell is rather than where. */
function writeRow(ws: ExcelJS.Worksheet, r: number, cells: Cell[], firstHelper: number,
                  numFmt: Record<number, string> = {}) {
  cells.forEach((v, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = v as ExcelJS.CellValue;
    const helper = i >= firstHelper;
    const calc = typeof v === 'object' && v !== null;
    c.font = { name: FONT, size: 10, color: { argb: helper ? MUTED : (i === 0 ? INK : 'FF333A45') } };
    if (i === 0) c.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    if (helper) c.fill = fill(WORKING);
    else if (calc) c.fill = fill(PAPER);
    c.alignment = { indent: 1, horizontal: typeof v === 'number' || calc ? 'right' : 'left' };
    if (numFmt[i]) c.numFmt = numFmt[i];
  });
}

// Materials ------------------------------------------------------------------
{
  const ws = sheet('Materials', 'output');
  headers(ws, ['id', 'grade', 'category', 'pricePerKg', 'scrapRecoveryPricePerKg', 'densityKgPerM3',
    'region', 'effectiveDate', 'sourceNote', 'confidence',
    'JLR code', 'rows matched', 'MATERIAL_RATE', 'MATERIAL_RECLAIM', 'scrap £/kg', 'CO2 (not used)',
    'built-in source note', 'built-in date'],
    [24, 26, 17, 13, 22, 15, 10, 14, 44, 12, 13, 13, 15, 17, 13, 14, 44, 14], 10);
  const fmt = { 3: '#,##0.0000', 4: '#,##0.0000', 5: '#,##0', 12: '#,##0.0000',
                13: '#,##0.00', 14: '#,##0.0000', 15: '#,##0.00' };
  LIB.materials.forEach((m, i) => {
    const r = i + 2;
    const [K, L, M, N, O] = [`$K${r}`, `$L${r}`, `$M${r}`, `$N${r}`, `$O${r}`];
    writeRow(ws, r, [
      m.id, m.grade, m.category,
      F(rule('Materials', 'MATERIAL_RATE', 'pricePerKg',
             'Your price per kilo, or ours when you have not mapped this one.',
             orBuiltin(M, m.pricePerKg)), m.pricePerKg),
      F(rule('Materials', 'MATERIAL_RECLAIM', 'scrapRecoveryPricePerKg',
             'The scrap credit, worked out in column O from whichever basis Settings says.',
             orBuiltin(O, m.scrapRecoveryPricePerKg)), m.scrapRecoveryPricePerKg),
      m.densityKgPerM3, m.region,
      F(`IF(${M}>0,${pickText(L, K, MATL, 'A', 'D', `$R${r}`)},$R${r})`, m.effectiveDate),
      F(`IF(${M}>0,"JLR rate card — material code "&${K},$Q${r})`, m.sourceNote),
      m.confidence,
      F(rule('Materials', 'Mapping column C', 'working: JLR code',
             'The code you typed on Mapping for this row.', code(r)), ''),
      F(rule('Materials', 'CODE + COUNTRY + PERIOD', 'working: rows matched',
             'How many pasted rows this code matches. Anything but 1 and we keep our own value.',
             matches(K, MATL, 'A', 'C', 'D')), 0),
      F(pick(L, K, MATL, 'A', 'E', 'C', 'D'), 0),
      F(pick(L, K, MATL, 'A', 'F', 'C', 'D'), 0),
      // Percentage of the rate, or already £/kg — set once on Settings.
      // Guessing here would be a 40x error in either direction.
      F(rule('Materials', 'MATERIAL_RECLAIM', 'working: scrap £/kg',
             'Percent of the rate, or a price per kilo already. Settings B5 decides.',
             `IF(${N}=0,0,IF(Settings!$B$5="percent",${M}*${N}/100,${N}))`), 0),
      F(pick(L, K, MATL, 'A', 'G', 'C', 'D'), 0),
      m.sourceNote, m.effectiveDate,
    ], 10, fmt);
  });
}

// Machines -------------------------------------------------------------------
/**
 * `computedRatePerHr` is derived by CostVision and ignored from the file, so the
 * £/hr elements are annualised on the way in and divided back out on the way
 * through: element x hours x utilisation, then / (hours x utilisation). Hours
 * and utilisation are CostVision's own and cancel exactly — they are a scale
 * factor here, not a claim about anybody's shift pattern.
 */
{
  const ws = sheet('Machines', 'output');
  headers(ws, ['id', 'machineClass', 'region', 'annualDepreciation', 'maintenance', 'energy',
    'floorSpace', 'indirectSupport', 'financeCost', 'annualAvailableHours', 'machineUtilization',
    'effectiveDate', 'sourceNote', 'confidence',
    'JLR code', 'rows matched', 'DEPRECIATION', 'FLOORSPACE', 'MRO', 'INSURANCE', 'INTEREST',
    'UTILITIES', 'CONSUMABLES', 'TOTAL_MACHINE_RATE', 'elements add to', 'rebuilt £/hr − total',
    'built-in source note', 'built-in date'],
    [24, 30, 10, 18, 15, 13, 13, 17, 15, 20, 18, 14, 52, 12,
     13, 13, 14, 13, 11, 12, 11, 12, 14, 18, 15, 18, 44, 14], 14);
  const fmt: Record<number, string> = { 3: '#,##0', 4: '#,##0', 5: '#,##0', 6: '#,##0', 7: '#,##0',
    8: '#,##0', 9: '#,##0', 10: '0%', 16: '#,##0.00', 17: '#,##0.00', 18: '#,##0.00', 19: '#,##0.00',
    20: '#,##0.00', 21: '#,##0.00', 22: '#,##0.00', 23: '#,##0.00', 24: '#,##0.00', 25: '#,##0.0000' };
  LIB.machines.forEach((m, i) => {
    const r = i + 2;
    const b = m.buildup;
    const scale = b.annualAvailableHours * b.machineUtilization;
    const [O, P, Q, R2, S, T, U, V, W, X, Y] =
      ['O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'].map(c => `$${c}${r}`);
    // X > 0 is the switch: a rate was published for this machine. Y > 0 says the
    // elements it is made of were published too.
    const annual = (element: string, builtin: number, from: string, to: string, plain: string) =>
      F(rule('Machines', from, to, plain,
             `IF(${X}>0,IF(${Y}>0,${element}*${scale},0),${builtin})`), builtin);
    writeRow(ws, r, [
      m.id, m.machineClass, m.region,
      // Depreciation carries the rounding residual (X − Y, at most a penny an
      // hour) so the rebuilt rate lands on the published total exactly; MAX
      // keeps it off the negative CostVision would reject.
      F(rule('Machines', 'DEPRECIATION', 'annualDepreciation',
             'Depreciation x hours x utilisation, plus the penny the seven elements round by, '
             + 'so the rebuilt rate equals TOTAL_MACHINE_RATE exactly.',
             `IF(${X}>0,IF(${Y}>0,MAX(0,${Q}+${X}-${Y})*${scale},${X}*${scale}),${b.annualDepreciation})`),
        b.annualDepreciation),
      annual(S, b.maintenance, 'MRO', 'maintenance', 'MRO x hours x utilisation.'),
      annual(V, b.energy, 'UTILITIES', 'energy', 'Utilities x hours x utilisation.'),
      annual(R2, b.floorSpace, 'FLOORSPACE', 'floorSpace', 'Floorspace x hours x utilisation.'),
      F(rule('Machines', 'INSURANCE + CONSUMABLES', 'indirectSupport',
             'Insurance and consumables together — CostVision has one line where the card has two.',
             `IF(${X}>0,IF(${Y}>0,(${T}+${W})*${scale},0),${b.indirectSupport})`), b.indirectSupport),
      annual(U, b.financeCost, 'INTEREST', 'financeCost', 'Interest x hours x utilisation.'),
      b.annualAvailableHours, b.machineUtilization,
      F(`IF(${X}>0,${pickText(P, O, MACH, 'A', 'D', `$AB${r}`)},$AB${r})`, m.effectiveDate),
      // Say plainly which of the two happened, so nobody reads a back-solved
      // lump as a real depreciation figure.
      F(`IF(${X}>0,IF(${Y}>0,"JLR machine "&${O}&" at "&TEXT(${X},"0.00")&" per hr — build-up as supplied",` +
        `"JLR machine "&${O}&" at "&TEXT(${X},"0.00")&" per hr — build-up not supplied"),$AA${r})`,
        m.sourceNote ?? ''),
      m.confidence,
      F(code(r), ''),
      F(matches(O, MACH, 'A', 'C', 'D'), 0),
      F(pick(P, O, MACH, 'A', 'G', 'C', 'D'), 0),   // DEPRECIATION
      F(pick(P, O, MACH, 'A', 'H', 'C', 'D'), 0),   // FLOORSPACE
      F(pick(P, O, MACH, 'A', 'I', 'C', 'D'), 0),   // MRO
      F(pick(P, O, MACH, 'A', 'J', 'C', 'D'), 0),   // INSURANCE
      F(pick(P, O, MACH, 'A', 'K', 'C', 'D'), 0),   // INTEREST
      F(pick(P, O, MACH, 'A', 'L', 'C', 'D'), 0),   // UTILITIES
      F(pick(P, O, MACH, 'A', 'M', 'C', 'D'), 0),   // CONSUMABLES
      F(pick(P, O, MACH, 'A', 'N', 'C', 'D'), 0),   // TOTAL_MACHINE_RATE
      F(`${Q}+${R2}+${S}+${T}+${U}+${V}+${W}`, 0),
      // The self-proof: put the six columns back through CostVision's own
      // division and see whether the published total comes out.
      F(rule('Machines', 'TOTAL_MACHINE_RATE', 'working: the check',
             'The six columns divided back out, less the published total. Should be nought.',
             `IF(${X}<=0,0,ROUND((D${r}+E${r}+F${r}+G${r}+H${r}+I${r})/${scale}-${X},4))`), 0),
      m.sourceNote ?? '', m.effectiveDate,
    ], 14, fmt);
  });
}

// Labour ---------------------------------------------------------------------
{
  const ws = sheet('Labour', 'output');
  headers(ws, ['id', 'region', 'skillLevel', 'fullyLoadedRatePerHr', 'effectiveDate', 'sourceNote',
    'confidence', 'JLR code', 'rows matched', 'from JLR Labour', 'from JLR Machines', 'rate used',
    'built-in source note'],
    [24, 12, 28, 21, 14, 46, 12, 13, 13, 17, 19, 13, 44], 7);
  const fmt = { 3: '#,##0.00', 9: '#,##0.00', 10: '#,##0.00', 11: '#,##0.00' };
  LIB.labour.forEach((l, i) => {
    const r = i + 2;
    const [H, I2, J, K, L] = [`$H${r}`, `$I${r}`, `$J${r}`, `$K${r}`, `$L${r}`];
    writeRow(ws, r, [
      l.id, l.region, l.skillLevel,
      F(rule('Labour', 'TOTAL_LABOUR_RATE', 'fullyLoadedRatePerHr',
             'Your hourly rate for that labour category, or ours when it is not mapped.',
             orBuiltin(L, l.fullyLoadedRatePerHr)), l.fullyLoadedRatePerHr),
      l.effectiveDate,
      F(`IF(${L}>0,"JLR rate card — labour category "&${H},$M${r})`, l.sourceNote),
      l.confidence,
      F(code(r), ''),
      F(matches(H, LABR, 'A', 'C', 'D'), 0),
      F(pick(I2, H, LABR, 'A', 'E', 'C', 'D'), 0),
      // The fallback. Every machine on a category carries the same
      // TOTAL_LABOUR_RATE, so an average over them is that rate — and unlike the
      // machine lookup there is no single row to insist on.
      F(rule('Labour', 'TOTAL_LABOUR_RATE on JLR Machines', 'working: from the machine tab',
             'If there is no separate labour file, read the category off the machine rows instead.',
             `IF(${H}="",0,IFERROR(AVERAGEIFS(${rng(MACH, 'F')},${rng(MACH, 'E')},${H},${filt(MACH, 'C', 'D')}),0))`), 0),
      F(`IF(${J}>0,${J},${K})`, 0),
      l.sourceNote,
    ], 7, fmt);
  });
}

// Energy, FX and overhead are not on the exports, so they are carried through
// as values. Edit in place if they need to move.
{
  const ws = sheet('Energy', 'output');
  headers(ws, ['id', 'region', 'electricityPerKwh', 'gasPerKwh', 'effectiveDate', 'sourceNote', 'confidence'],
          [24, 12, 19, 15, 14, 40, 12], 99);
  LIB.energy.forEach((e, i) => writeRow(ws, i + 2,
    [e.id, e.region, e.electricityPerKwh, e.gasPerKwh, e.effectiveDate, e.sourceNote, e.confidence],
    99, { 2: '#,##0.0000', 3: '#,##0.0000' }));
}
{
  const ws = sheet('FX', 'output');
  headers(ws, ['id', 'fromCurrency', 'toCurrency', 'rate', 'effectiveDate', 'sourceNote'],
          [18, 15, 13, 13, 14, 40], 99);
  LIB.fx.forEach((f, i) => writeRow(ws, i + 2,
    [f.id, f.fromCurrency, f.toCurrency, f.rate, f.effectiveDate, f.sourceNote], 99, { 3: '#,##0.0000' }));
}
{
  const ws = sheet('Overhead', 'output');
  headers(ws, ['id', 'commodityType', 'supplierTier', 'overheadPct', 'marginPct', 'sourceNote'],
          [24, 22, 17, 13, 13, 40], 99);
  LIB.overheadDefaults.forEach((o, i) => writeRow(ws, i + 2,
    [o.id, o.commodityType, o.supplierTier, o.overheadPct, o.marginPct, o.sourceNote],
    99, { 3: '0.0%', 4: '0.0%' }));
}

// ─── 6. How it converts ──────────────────────────────────────────────────────
/**
 * The conversion, written down.
 *
 * Rendered from the RULES collected while the tabs above were built, so the
 * formula printed here is the formula in the cell — not a description of it
 * kept alongside, which drifts and is then trusted.
 */
{
  const ws = HOW;
  ws.columns = [{ width: 4 }, { width: 30 }, { width: 28 }, { width: 62 }, { width: 104 }];
  banner(ws, 'How it converts',
    'Every rule this workbook applies, in plain words, with the formula that does it. '
    + 'Nothing here is hidden in code.', 'E');

  let r = 3;
  const section = (title: string, blurb: string, withTable = true) => {
    r += 1;
    ws.mergeCells(`A${r}:E${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = title;
    c.font = { name: FONT, size: 12, bold: true, color: { argb: INK } };
    c.fill = fill(BAND);
    c.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(r).height = 24;
    if (blurb) {
      r += 1;
      ws.mergeCells(`A${r}:E${r}`);
      const b = ws.getCell(`A${r}`);
      b.value = blurb;
      b.font = { name: FONT, size: 10, color: { argb: MUTED } };
      b.alignment = { vertical: 'middle', indent: 1 };
      ws.getRow(r).height = 18;
    }
    if (!withTable) return;
    r += 1;
    ['', 'From your file', 'Becomes, in CostVision', 'What happens to it', 'The formula, as it is in the sheet']
      .forEach((h, i) => {
        const c2 = ws.getCell(r, i + 1);
        c2.value = h || null;
        c2.font = { name: FONT, size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        c2.fill = fill(INK);
        c2.alignment = { vertical: 'middle', indent: 1 };
      });
    ws.getRow(r).height = 20;
  };
  const line = (from: string, to: string, plain: string, formula: string) => {
    r += 1;
    const cells = [null, from, to, plain, formula];
    cells.forEach((v, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = v;
      c.border = edge();
      c.alignment = { vertical: 'top', wrapText: true, indent: 1 };
      c.font = i === 4
        ? { name: 'Consolas', size: 9, color: { argb: INK } }
        : { name: FONT, size: 10, bold: i === 1 || i === 2, color: { argb: i === 3 ? 'FF333A45' : INK } };
      if (i === 4) c.fill = fill(PAPER);
    });
    // Tall enough for whichever of the two wrapping columns needs more. Sized
    // on the formula alone, the explanation ran into the row below it.
    ws.getRow(r).height = Math.max(16, Math.ceil(formula.length / 62) * 11 + 5,
                                   Math.ceil(plain.length / 56) * 13 + 5);
  };
  const of = (group: string, to: string) => RULES.find(x => x.group === group && x.to === to)!;

  section('The short version', '', false);
  for (const t of [
    'Your rate card and CostVision hold the same numbers in different shapes.',
    'A machine rate on your card is seven costs per hour that add up to TOTAL_MACHINE_RATE.',
    'CostVision holds the same seven as yearly costs, and divides by hours x utilisation to get back to an hourly rate.',
    'So this sheet multiplies each of your hourly figures by that machine’s hours x utilisation. CostVision divides it straight back out.',
    'The rate lands on your published number, and the split survives, so a report can still show what the rate is made of.',
    'Materials and labour are simpler: the price and the hourly rate go straight across.',
  ]) {
    r += 1;
    ws.mergeCells(`B${r}:E${r}`);
    const c = ws.getCell(`B${r}`);
    c.value = t;
    c.font = { name: FONT, size: 11, color: { argb: 'FF333A45' } };
    c.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(r).height = 17;
  }
  r += 1;

  section('The machine rate, line by line',
    'Each of your seven hourly figures becomes one yearly figure. 3,200 in the formula below is that '
    + 'machine’s own 4,000 hours x 80% utilisation — the same number CostVision divides by afterwards, so it cancels.');
  for (const to of ['annualDepreciation', 'maintenance', 'energy', 'floorSpace', 'indirectSupport', 'financeCost']) {
    const x = of('Machines', to);
    line(x.from, x.to, x.plain, x.formula);
  }
  line('TOTAL_MACHINE_RATE', 'nothing directly',
    'Used as the switch — if there is a rate for this machine, take your figures; if not, keep ours. '
    + 'Also used to check the answer.', of('Machines', 'working: the check').formula);
  r += 1;
  ws.mergeCells(`B${r}:E${r}`);
  ws.getCell(`B${r}`).value = 'If a row has only a TOTAL_MACHINE_RATE and no breakdown, the whole total goes on '
    + 'the depreciation line and the source note says so, rather than pretending to be a breakdown.';
  ws.getCell(`B${r}`).font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
  ws.getCell(`B${r}`).alignment = { indent: 1 };
  r += 2;

  section('Materials', '');
  for (const to of ['pricePerKg', 'scrapRecoveryPricePerKg', 'working: scrap £/kg']) {
    const x = of('Materials', to);
    line(x.from, x.to, x.plain, x.formula);
  }
  line('CO2', 'nothing', 'Brought onto the Materials tab so you can see it. CostVision has no carbon '
    + 'field in this file, so it is ignored on upload.', '(no formula — the column is carried across only)');
  r += 2;

  section('Labour', '');
  for (const to of ['fullyLoadedRatePerHr', 'working: from the machine tab']) {
    const x = of('Labour', to);
    line(x.from, x.to, x.plain, x.formula);
  }
  r += 2;

  section('The three rules underneath all of it', '');
  line('Mapping column C', 'which code to use',
    'Finds the code you typed on the Mapping tab for this row. Empty means "not mapped", and the row keeps our value.',
    of('Materials', 'working: JLR code').formula);
  line('COUNTRY + PERIOD', 'how many rows match',
    'Counts the pasted rows with this code, in the country and period you asked for on Settings. '
    + 'Only a count of exactly 1 is used. Two means the filter has not narrowed it, and a made-up average '
    + 'would be a rate nobody published.',
    of('Materials', 'working: rows matched').formula);
  line('the matched row', 'the number itself',
    'Reads one column off that single matching row. Zero when there is no clean single match, which '
    + 'every formula above reads as "keep what CostVision already had".',
    pick('$L2', '$K2', MATL, 'A', 'E', 'C', 'D'));
  r += 2;

  section('Where to find the working in the sheet', '');
  for (const [tab, cols] of [
    ['Materials', 'K to P are the working columns. Q and R hold our own note and date, for when yours is not used.'],
    ['Machines', 'O to Z are the working columns. AA and AB hold our own note and date.'],
    ['Labour', 'H to L are the working columns. M holds our own note.'],
    ['Mapping', 'C is yours to fill in. D is the sheet reading your code back to you.'],
  ] as [string, string][]) {
    r += 1;
    ws.getCell(`B${r}`).value = tab;
    ws.getCell(`B${r}`).font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    ws.getCell(`B${r}`).alignment = { indent: 1 };
    ws.mergeCells(`C${r}:E${r}`);
    ws.getCell(`C${r}`).value = cols;
    ws.getCell(`C${r}`).font = { name: FONT, size: 10, color: { argb: 'FF333A45' } };
    ws.getCell(`C${r}`).alignment = { indent: 1 };
  }
}

// ─── 7. Check ────────────────────────────────────────────────────────────────
/**
 * Read by the label in column A, not by cell address — the tab gains lines, and
 * a test that has to be renumbered every time is a test that stops being read.
 */
{
  const nMat = LIB.materials.length, nMach = LIB.machines.length, nLab = LIB.labour.length;
  const mapEnd = 1 + seeds.length;
  const elems = ['G', 'H', 'I', 'J', 'K', 'L', 'M'].map(c => rng(MACH, c)).join('+');

  const ws = sheet('Check', 'check', false);
  ws.columns = [{ width: 66 }, { width: 14 }, { width: 46 }];
  banner(ws, 'Check before you upload',
    'Every line marked "should be 0" turns green when it is. Red means have a look.', 'C');

  type Line = { label: string; formula?: string; want0?: boolean; should?: string; note?: string };
  const lines: Line[] = [
    { label: 'Codes you have filled in on Mapping', formula: `COUNTIFS(Mapping!C2:C${mapEnd},"<>")`,
      should: 'however many you have' },
    { label: '…of those, codes not found on any JLR tab', formula: `COUNTIF(Mapping!D2:D${mapEnd},"NOT FOUND*")`,
      want0: true, should: 'should be 0 — the code is wrong' },
    { label: '' },
    // Counting matches rather than values was misleading: a code that found its
    // row but whose rate cell was blank counted as "taken" while the row quietly
    // kept CostVision's own number. These count the rate that actually arrived.
    { label: 'Materials taking a JLR price', formula: `COUNTIF(Materials!M2:M${nMat + 1},">0")` },
    { label: 'Machines taking a JLR rate', formula: `COUNTIF(Machines!X2:X${nMach + 1},">0")` },
    { label: 'Labour grades taking a JLR rate', formula: `COUNTIF(Labour!L2:L${nLab + 1},">0")` },
    { label: 'Codes that found their row but the rate on it was blank or zero',
      formula: `COUNTIF(Materials!L2:L${nMat + 1},1)-COUNTIF(Materials!M2:M${nMat + 1},">0")`
             + `+COUNTIF(Machines!P2:P${nMach + 1},1)-COUNTIF(Machines!X2:X${nMach + 1},">0")`,
      want0: true, should: 'should be 0 — otherwise those rows kept our value' },
    { label: '' },
    { label: 'Codes matching MORE than one pasted row (country/period not narrowed)',
      formula: `COUNTIF(Materials!L2:L${nMat + 1},">1")+COUNTIF(Machines!P2:P${nMach + 1},">1")`,
      want0: true, should: 'should be 0 — set Country and Period on Settings' },
    { label: 'Machines whose rebuilt £/hr does not equal your TOTAL_MACHINE_RATE',
      formula: `COUNTIF(Machines!Z2:Z${nMach + 1},"<>0")`, want0: true, should: 'should be 0' },
    { label: 'Pasted machine rows whose 7 elements do not add up to TOTAL_MACHINE_RATE',
      // Rows carrying only a total are a case the sheet handles on purpose, so
      // they are not counted here — this is looking for a card that disagrees
      // with itself, not one that is less detailed than it could be.
      formula: `SUMPRODUCT((${rng(MACH, 'A')}<>"")*((${elems})>0)*(ABS((${elems})-${rng(MACH, 'N')})>0.02))`,
      want0: true, should: 'should be 0 — otherwise ask about the export' },
    { label: `Pasted rows beyond the ${PASTE_ROWS.toLocaleString('en-GB')} this sheet reads`,
      formula: `MAX(0,COUNTA(${MACH}!$A:$A)-1-${PASTE_ROWS})+MAX(0,COUNTA(${MATL}!$A:$A)-1-${PASTE_ROWS})`
             + `+MAX(0,COUNTA(${LABR}!$A:$A)-1-${PASTE_ROWS})`,
      want0: true, should: 'should be 0 — rows past it are not read' },
    { label: '' },
    { label: 'Settings in force', note: 'head' },
    { label: 'Country', formula: 'IF(Settings!$B$2="","(any)",Settings!$B$2)', should: '' },
    { label: 'Machine period', formula: 'IF(Settings!$B$3="","(any)",Settings!$B$3)', should: '' },
    { label: 'Material period', formula: 'IF(Settings!$B$4="","(any)",Settings!$B$4)', should: '' },
    { label: 'MATERIAL_RECLAIM read as', formula: 'Settings!$B$5', should: 'please confirm this with your rates team' },
    { label: '' },
    { label: 'Anything you did not map keeps the value CostVision ships with. That is fine.', note: 'foot' },
  ];

  let r = 3;
  const zeroRows: number[] = [];
  for (const l of lines) {
    r += 1;
    if (!l.label) { ws.getRow(r).height = 8; continue; }
    const a = ws.getCell(`A${r}`), b = ws.getCell(`B${r}`), c = ws.getCell(`C${r}`);
    if (l.note === 'head') {
      ws.mergeCells(`A${r}:C${r}`);
      a.value = l.label;
      a.font = { name: FONT, size: 12, bold: true, color: { argb: INK } };
      a.fill = fill(BAND); a.alignment = { vertical: 'middle', indent: 1 };
      ws.getRow(r).height = 24;
      continue;
    }
    if (l.note === 'foot') {
      ws.mergeCells(`A${r}:C${r}`);
      a.value = l.label;
      a.font = { name: FONT, size: 10, italic: true, color: { argb: MUTED } };
      a.alignment = { vertical: 'middle', indent: 1 };
      continue;
    }
    a.value = l.label;
    a.font = { name: FONT, size: 11, color: { argb: 'FF333A45' } };
    a.alignment = { vertical: 'middle', indent: 1 };
    b.value = { formula: l.formula!, result: l.formula!.startsWith('IF(Settings') ? '(any)'
                : l.formula === 'Settings!$B$5' ? 'percent' : 0 } as ExcelJS.CellValue;
    b.font = { name: FONT, size: 12, bold: true, color: { argb: INK } };
    b.alignment = { vertical: 'middle', horizontal: 'center' };
    b.border = edge();
    c.value = l.should ?? null;
    c.font = { name: FONT, size: 10, color: { argb: MUTED } };
    c.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(r).height = 20;
    if (l.want0) zeroRows.push(r);
  }

  // Green when it is nought, red when it is not. Nobody scans a column of
  // numbers hunting for the one that is not zero.
  for (const row of zeroRows) {
    ws.addConditionalFormatting({
      ref: `B${row}`,
      rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['0'], priority: 1,
          style: { font: { bold: true, color: { argb: GOOD } }, fill: fill('FFE7F5EC') } },
        { type: 'cellIs', operator: 'notEqual', formulae: ['0'], priority: 2,
          style: { font: { bold: true, color: { argb: BAD } }, fill: fill('FFFCE9E7') } },
      ] as ExcelJS.ConditionalFormattingRule[],
    });
  }
}

await wb.xlsx.writeFile(OUT);
console.log(OUT);
console.log(`  mapping rows : ${LIB.materials.length} materials, ${LIB.machines.length} machines, ${LIB.labour.length} labour`);
console.log(`  rules shown  : ${RULES.length} on the "How it converts" tab`);
console.log(`  tabs         : ${wb.worksheets.map(w => w.name).join(', ')}`);
