// Workbook QA — the Excel equivalent of scan.py.
//
// scan.py catches text drawn past a PDF margin. Nothing did the same job for
// the workbook, and the failure modes there are just as real and just as
// invisible from the code: a sheet whose header row has more columns than
// `colWidths` declares, a sheet that renders with a header and no body (which
// reads as "we checked and found nothing"), or — the one that prompted this —
// a whole SHEET that never appears because the fixture driving the harness
// lacks the data it is built from.
//
//   node scripts/pdf-qa/xlsx-inspect.mjs [path.xlsx]
//
// Prints every sheet with its dimensions and first rows, and FAILS on a sheet
// that has a header and no data rows.
const path = process.argv[2] || new URL('./dfm-fixture.xlsx', import.meta.url).pathname;
const ExcelJS = (await import('exceljs')).default;
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path);

const flat = (v) => (v == null ? '' : (typeof v === 'object'
  ? (v.richText ? v.richText.map(t => t.text).join('') : (v.text ?? JSON.stringify(v)))
  : String(v)));

let problems = 0;
console.log(`${path}\n${wb.worksheets.length} sheets`);
for (const ws of wb.worksheets) {
  // Rows 1-3 are the branded title band; the header row and the body follow.
  const body = Math.max(0, ws.rowCount - 4);
  console.log(`\n=== ${ws.name}  (${body} data row${body === 1 ? '' : 's'})`);
  let n = 0;
  ws.eachRow((row, i) => {
    if (n++ > 5 || i < 4) return;
    const vals = row.values.slice(1).map(flat);
    console.log(`  ${String(i).padStart(2)}| ` + vals.map(v => (v.length > 24 ? v.slice(0, 24) + '…' : v)).join(' | ').slice(0, 180));
  });
  if (body === 0) {
    console.log('  !! HEADER WITH NO BODY — an empty sheet reads as "checked, nothing found"');
    problems++;
  }
}
console.log(`\nworkbook issues: ${problems}`);
process.exit(problems ? 1 : 0);
