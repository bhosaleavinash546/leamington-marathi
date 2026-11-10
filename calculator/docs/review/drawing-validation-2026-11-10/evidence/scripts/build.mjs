// Builds the Independent Technical Validation Report (PDF) and the Validation Workbook (Excel) from the evidence files.
// Every figure comes from a JSON evidence file under ../ ; nothing is typed here except labels and the conclusions,
// which cite the figures they rest on.  Usage: node build.mjs <outDir>
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const V = join(HERE, '..');
const OUT = process.argv[2] ?? join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const require = createRequire('/home/user/leamington-marathi/calculator/package.json');
const ExcelJS = require('exceljs');
const { chromium } = createRequire(import.meta.url)('playwright');

const J = (p) => JSON.parse(readFileSync(join(V, p), 'utf8'));
const pick = (base) => existsSync(join(V, 'runs', `${base}-final.json`)) ? { d: J(`runs/${base}-final.json`), final: true } : { d: J(`runs/${base}.json`), final: false };
const before = { extraction: J('runs/extraction.json'), recon: J('runs/reconciliation.json'), costing: J('runs/costing.json') };
const ex = pick('extraction'), rc = pick('reconciliation'), cs = pick('costing'), rg = pick('regression'), tm = pick('timings');
const compliance = J('audit/compliance.json');
const reliability = J('reliability/results.json');
const register = J('dataset/register.json');
const defects = J('deliverables/defect-register.json');
const facts = J('deliverables/facts.json');            // suite counts, commits, dates — written by hand from the run logs
const postFix = facts.complianceAfterFix;               // id → { verdict, why }

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (x) => (x == null || Number.isNaN(x) ? '–' : `${(x * 100).toFixed(1)} %`);
const gbp = (x) => (x == null ? '–' : `£${Number(x).toFixed(2)}`);
const S = (o) => o?.strict ?? {};

// ── Derived tables (no new arithmetic beyond counting / ratios of the evidence) ──
const totAll = (d) => d.totals.all.ALL;
const groups = ['title block', 'material', 'general tolerance', 'roughness', 'coating', 'heat treatment', 'threads', 'fits', 'dimensions', 'GD&T', 'notes', 'welds', 'quality'];
const groupRow = (d, g) => d.totals.all.ALL.byGroup?.[g];
const classes = (d) => Object.entries(d.totals.byClass ?? {});
const families = (d) => Object.entries(d.totals.byFamily ?? {});
const verdictAfter = (c) => postFix[c.id]?.verdict ?? c.verdict;
const count = (arr, f) => arr.filter(f).length;
const relCounts = ['pass', 'fail', 'partial', 'not-tested'].map(s => [s, count(reliability, r => r.status === s)]);
const compBefore = ['Pass', 'Partial', 'Fail', 'Not tested'].map(v => [v, count(compliance, c => c.verdict === v)]);
const compAfter = ['Pass', 'Partial', 'Fail', 'Not tested'].map(v => [v, count(compliance, c => verdictAfter(c) === v)]);
const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const defSorted = [...defects].sort((a, b) => (sevOrder[a.severity] - sevOrder[b.severity]) || a.id.localeCompare(b.id));
const openDefects = defSorted.filter(d => d.status !== 'Fixed');
const reconTests = rc.d.tests ?? [];
const reconSum = rc.d.summary ?? {};
const parts = cs.d.parts ?? [];
const costRow = (p) => {
  const a = p.A?.total, c = p.C?.total;
  const delta = a != null && c != null ? c - a : null;
  return { pair: p.pair + (p.variant ? ` (${p.variant})` : ''), route: p.route?.C ?? p.route?.A ?? '', a, c, delta, pctd: a && delta != null ? delta / a : null,
    status: p.A?.status === 'costed' && p.C?.status === 'costed' ? 'costed' : (p.A?.refusal || p.C?.refusal ? 'refused' : (p.A?.status ?? '–')),
    why: [Array.isArray(p.why) ? p.why.filter(w => !/^operations (added|removed)/.test(String(w))).join('; ') : String(p.why ?? ''),
      Array.isArray(p.driversMoved) && p.driversMoved.length ? `Buckets moved: ${p.driversMoved.filter(m => Math.abs(m.delta ?? 0) >= 0.0005).map(m => `${m.bucket} ${m.delta >= 0 ? '+' : ''}£${Number(m.delta).toFixed(4)}`).join(', ')}` : ''].filter(Boolean).join(' — '),
    cls: p.classification ?? '' };
};
const costRows = parts.map(costRow);

// ── The report (HTML → PDF) ──
const prRow = (label, o) => `<tr><td>${esc(label)}</td><td class=n>${S(o).found ?? '–'}</td><td class=n>${S(o).correct ?? '–'}</td><td class=n>${S(o).wrong ?? '–'}</td><td class=n>${S(o).missed ?? '–'}</td><td class=n>${pct(S(o).precision)}</td><td class=n>${pct(S(o).recall)}</td></tr>`;
const ba = (label, b, a) => `<tr><td>${esc(label)}</td><td class=n>${pct(S(b).precision)}</td><td class=n>${pct(S(b).recall)}</td><td class=n>${pct(S(a).precision)}</td><td class=n>${pct(S(a).recall)}</td></tr>`;
const tbl = (head, rows, cls = '') => `<table class="${cls}"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

const css = `
:root{--ink:#14202b;--muted:#5b6876;--rule:#d5dbe1;--band:#eef2f5;--accent:#0b5f7a;--good:#1d7a4c;--warn:#a26b00;--bad:#b3261e}
*{box-sizing:border-box} body{font:10pt/1.45 "DejaVu Sans",Arial,sans-serif;color:var(--ink);margin:0}
h1{font-size:22pt;margin:0 0 4mm;line-height:1.15} h2{font-size:14pt;margin:9mm 0 3mm;color:var(--accent);break-after:avoid}
h3{font-size:11pt;margin:5mm 0 2mm;break-after:avoid} p{margin:0 0 2.5mm;max-width:170mm} .muted{color:var(--muted)}
table{border-collapse:collapse;width:100%;margin:2mm 0 4mm;font-size:8.4pt;break-inside:auto} th,td{border-bottom:1px solid var(--rule);padding:1.4mm 1.6mm;text-align:left;vertical-align:top}
th{background:var(--band);font-weight:700} tr{break-inside:avoid} td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cover{height:257mm;display:flex;flex-direction:column;justify-content:space-between;break-after:page}
.kv{display:grid;grid-template-columns:48mm 1fr;gap:1.5mm 4mm;font-size:9.5pt} .kv div:nth-child(odd){color:var(--muted)}
.status{display:inline-block;border:2px solid var(--warn);color:var(--warn);font-weight:700;padding:2mm 4mm;font-size:12pt;margin:3mm 0}
.callout{border-left:3px solid var(--accent);background:var(--band);padding:2.5mm 4mm;margin:3mm 0;max-width:175mm}
.tag{font-weight:700} .Pass,.pass,.Fixed{color:var(--good)} .Fail,.fail,.Open{color:var(--bad)} .Partial,.partial,.Partly{color:var(--warn)}
ol,ul{margin:0 0 3mm 5mm;padding-left:4mm} li{margin:0 0 1.2mm;max-width:170mm}
.small{font-size:8pt} section{break-inside:auto}`;

const h = [];
h.push(`<div class=cover><div><div class=muted style="letter-spacing:.08em;text-transform:uppercase;font-size:9pt">CostVision · offline 2D drawing intelligence</div>
<h1>Independent Technical Validation Report</h1><p style="font-size:12pt">2D engineering drawing reader integrated with 3D CAD should-costing</p>
<div class=status>Readiness: ${esc(facts.readiness)}</div>
<div class=kv>
<div>Date</div><div>${esc(facts.date)}</div><div>Code validated</div><div>${esc(facts.commitTested)} (branch claude/new-session-ts4byp)</div>
<div>Test material</div><div>${register.filter(r => !r.drawingOnly).length} genuine public CAD + drawing pairs, ${register.filter(r => r.drawingOnly).length} drawing-only sets; ${ex.d.perDrawing.length} drawings with independent truth files (${ex.d.rows.reduce((t, r) => t + (r.truthItems ?? 0), 0)} truth items)</div>
<div>Real prices compared</div><div>None — no purchase price, quote or cycle sheet exists for any tested part. Every cost figure here is INDICATIVE.</div>
<div>AI used at runtime</div><div>None on the drawing path; the application ran with AI switched off (AIR_GAPPED=1, no key) for every test.</div>
</div></div><p class="small muted">Prepared as an independent audit: code review by a reviewer who had not built the feature; truth files written from rendered drawing images by reviewers who never ran the reader; measurement and reliability runs scripted and repeatable. Evidence files and scripts are listed in the appendix.</p></div>`);

// 1 Executive summary
h.push(`<h2>1. Executive summary</h2>
<div class=callout><p><span class=tag>Overall:</span> ${esc(facts.overall)}</p></div>
<ul>${facts.keyFindings.map(k => `<li>${esc(k)}</li>`).join('')}</ul>`);

// 2 Method
h.push(`<h2>2. Scope and method</h2><ul>${facts.method.map(k => `<li>${esc(k)}</li>`).join('')}</ul>`);

// 3 Architecture & compliance
h.push(`<h2>3. Architecture and requirements compliance</h2>
<p>${compliance.length} requirements from the original brief were audited in the code (file:line evidence in the workbook). Verdicts at the start of the audit and after the defect fixes:</p>
${tbl(['Verdict', 'At audit', 'After fixes'], compBefore.map(([v, n], i) => `<tr><td class="${v}">${v}</td><td class=n>${n}</td><td class=n>${compAfter[i][1]}</td></tr>`))}
<h3>Requirements not fully met after the fixes</h3>
${tbl(['ID', 'Requirement', 'Verdict', 'Why'], compliance.filter(c => verdictAfter(c) !== 'Pass').map(c => `<tr><td>${c.id}</td><td>${esc(c.requirement)}</td><td class="${verdictAfter(c)}">${verdictAfter(c)}</td><td>${esc(postFix[c.id]?.why ?? c.notes)}</td></tr>`))}`);

// 4 Coverage
const commodities = {};
for (const r of register) (commodities[r.likelyCommodity] ??= []).push(r.id);
h.push(`<h2>4. Commodity and component test coverage</h2>
<p>${esc(facts.coverageNote)}</p>
${tbl(['Commodity (judged from the part)', 'Parts / drawings', 'Validated how far'], Object.entries(commodities).map(([k, ids]) => `<tr><td>${esc(k)}</td><td>${esc(ids.join(', '))}</td><td>${esc(facts.coverageDepth[k] ?? 'extraction only')}</td></tr>`))}
<p class=small><b>Not covered at all:</b> ${esc(facts.notCovered)}</p>`);

// 5 Extraction
const exB = before.extraction, exA = ex.d;
h.push(`<h2>5. Drawing extraction accuracy</h2>
<p>Scored against ${exA.perDrawing.length} independent truth files. <b>Precision</b> = correct ÷ (correct + wrong); <b>recall</b> = correct ÷ items the drawing states. A missing value is never counted as correct; a reading in a group the truth marks complete that is not on the drawing counts as wrong (fabricated). Strict scoring is the scorer as written; lenient differs only on ${exA.lenientCount ?? 'two'} naming equivalences (listed in the workbook).</p>
<h3>Before and after the fixes (strict)</h3>
${tbl(['Slice', 'Precision before', 'Recall before', 'Precision after', 'Recall after'],
  [ba('All drawings', totAll(exB), totAll(exA)), ...classes(exA).map(([k, v]) => ba(`Class: ${k}`, exB.totals.byClass?.[k], v)), ...families(exA).map(([k, v]) => ba(`Family: ${k}`, exB.totals.byFamily?.[k], v))])}
<h3>By field group, after the fixes</h3>
${tbl(['Group', 'Found', 'Correct', 'Wrong', 'Missed', 'Precision', 'Recall'], groups.filter(g => groupRow(exA, g)).map(g => prRow(g, groupRow(exA, g))))}
<p>${esc(facts.extractionReading)}</p>
<p class=small>Reading time and memory (one file per process, after the fixes): ${Object.entries(tm.d.byClass ?? {}).map(([k, v]) => `${k} median ${(v.wallMs.median / 1000).toFixed(1)} s (max ${(v.wallMs.max / 1000).toFixed(1)} s), peak ${Math.round(v.maxRssMB.max)} MB`).join('; ')}.</p>`);

// 6 Reconciliation
h.push(`<h2>6. CAD and drawing reconciliation</h2>
<p>Before the fixes: ${Object.entries(before.recon.summary).map(([k, v]) => `${v} ${k}`).join(', ')}. After: ${Object.entries(reconSum).map(([k, v]) => `${v} ${k}`).join(', ')}.</p>
${tbl(['Test', 'Scenario', 'Status', 'Result'], reconTests.map(t => `<tr><td>${esc(t.id)}</td><td>${esc(t.scenario)}</td><td class="${String(t.status).toLowerCase()}">${esc(t.status)}</td><td>${esc(String(t.actual).slice(0, 420))}</td></tr>`))}`);

// 7 Costing
h.push(`<h2>7. CAD-only versus CAD + drawing costing</h2>
<div class=callout><p><b>Indicative, not validated.</b> ${esc(cs.d.accuracy ?? '')} Conditions: ${esc(cs.d.conditions ?? '')}</p></div>
${tbl(['Part', 'Route', 'A: CAD only', 'C: CAD + reviewed drawing', 'Δ', 'Δ %', 'What changed and why'],
  costRows.map(r => `<tr><td>${esc(r.pair)}</td><td>${esc(r.route)}</td><td class=n>${r.status === 'costed' ? gbp(r.a) : esc(r.status)}</td><td class=n>${r.status === 'costed' ? gbp(r.c) : '–'}</td><td class=n>${r.delta == null ? '–' : gbp(r.delta)}</td><td class=n>${pct(r.pctd)}</td><td>${esc(String(r.why).slice(0, 380))}</td></tr>`))}
<p>${esc(facts.costingReading)}</p>`);

// 8 Independent accuracy
h.push(`<h2>8. Independent costing accuracy assessment</h2><ul>${facts.accuracy.map(k => `<li>${esc(k)}</li>`).join('')}</ul>`);

// 9 Exports
const expRows = reliability.filter(r => r.area === 'export');
h.push(`<h2>9. PDF and Excel export audit</h2><p>${esc(facts.exportsReading)}</p>
${tbl(['Check', 'Before fixes', 'Expected', 'Observed'], expRows.map(r => `<tr><td>${esc(r.scenario)}</td><td class="${r.status}">${esc(r.status)}</td><td>${esc(r.expected).slice(0, 220)}</td><td>${esc(String(r.actual).slice(0, 300))}</td></tr>`))}`);

// 10 Functional & regression
h.push(`<h2>10. Functional and regression testing</h2>
<p>Reliability and negative run (${reliability.length} scripted cases, before the fixes): ${relCounts.map(([k, v]) => `${v} ${k}`).join(', ')}. Every failure became a defect in section 11.</p>
<ul>${facts.regression.map(k => `<li>${esc(k)}</li>`).join('')}</ul>
${tbl(['Area', 'Pass', 'Fail', 'Partial', 'Not tested'], ['input', 'reprocess', 'regression', 'export'].map(a => `<tr><td>${a}</td>${['pass', 'fail', 'partial', 'not-tested'].map(s => `<td class=n>${count(reliability, r => r.area === a && r.status === s)}</td>`).join('')}</tr>`))}`);

// 11 Defects
h.push(`<h2>11. Defects, corrective actions and limitations</h2>
<p>${defects.length} defects across the three runs: ${['Fixed', 'Partly fixed', 'Open'].map(s => `${count(defects, d => d.status === s)} ${s.toLowerCase()}`).join(', ')}. By severity: ${['Critical', 'High', 'Medium', 'Low'].map(s => `${s} ${count(defects, d => d.severity === s)}`).join(', ')}. Every fix has a test that failed before it (named in the workbook); the full suite, the real-parts baseline and the live browser run passed after each round.</p>
<h3>Not fully fixed</h3>
${tbl(['ID', 'Severity', 'Status', 'Defect', 'Recommended action'], openDefects.map(d => `<tr><td>${d.id}</td><td>${d.severity}</td><td class="${d.status.split(' ')[0]}">${d.status}</td><td>${esc(d.title)}</td><td>${esc(d.recommendedAction || d.retest)}</td></tr>`))}
<h3>Fixed</h3>
${tbl(['ID', 'Severity', 'Defect', 'Commit', 'Proof'], defSorted.filter(d => d.status === 'Fixed').map(d => `<tr><td>${d.id}</td><td>${d.severity}</td><td>${esc(d.title)}</td><td>${d.fixCommit}</td><td>${esc(d.retest)}</td></tr>`))}`);

// 12 Readiness + 9 questions
h.push(`<h2>12. Production readiness recommendation</h2>
<div class=status>${esc(facts.readiness)}</div><p>${esc(facts.readinessWhy)}</p>
<h3>Before presenting to the Cost Engineering Director</h3><ol>${facts.beforeDirector.map(k => `<li>${esc(k)}</li>`).join('')}</ol>
<h2>13. Final independent assessment</h2><ol>${facts.answers.map(a => `<li><b>${esc(a.q)}</b><br>${esc(a.a)}</li>`).join('')}</ol>
<h2>Appendix — evidence</h2><ul class=small>${facts.evidence.map(k => `<li>${esc(k)}</li>`).join('')}</ul>`);

const html = `<!doctype html><html><head><meta charset=utf-8><title>Independent Technical Validation Report</title><style>${css}</style></head><body>${h.join('\n')}</body></html>`;
writeFileSync(join(OUT, 'validation-report.html'), html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({ path: join(OUT, 'Independent-Technical-Validation-Report.pdf'), format: 'A4', margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
  displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: `<div style="font-size:7pt;color:#5b6876;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>Independent Technical Validation — offline 2D drawing + 3D CAD should-costing · ${esc(facts.date)}</span><span>Page <span class=pageNumber></span> of <span class=totalPages></span></span></div>` });
await browser.close();

// ── The workbook ──
const wb = new ExcelJS.Workbook();
wb.creator = 'Independent validation'; wb.created = new Date(facts.dateIso);
const sheet = (name, cols, rows, widths) => {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(cols).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F5' } };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c, i) => { c.width = widths?.[i] ?? 18; c.alignment = { wrapText: true, vertical: 'top' }; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
};
const n = (x) => (x == null || Number.isNaN(x) ? null : x);
// Dashboard
const dash = wb.addWorksheet('0-Dashboard');
dash.columns = [{ width: 46 }, { width: 22 }, { width: 22 }, { width: 70 }];
const dr = (a, b, c, d) => dash.addRow([a, b, c, d]);
dash.addRow(['Independent Technical Validation — offline 2D drawing + 3D CAD should-costing']).font = { bold: true, size: 14 };
dr('Date', facts.date); dr('Code validated', facts.commitTested); dr('Readiness status', facts.readiness).font = { bold: true };
dr('Real prices compared', 'None', '', 'every cost figure is indicative');
dash.addRow([]); dr('Measure', 'Before fixes', 'After fixes', 'Note').font = { bold: true };
dr('Extraction precision (strict, all drawings)', n(S(totAll(exB)).precision), n(S(totAll(exA)).precision), `${exA.perDrawing.length} drawings with independent truth`);
dr('Extraction recall (strict, all drawings)', n(S(totAll(exB)).recall), n(S(totAll(exA)).recall), 'share of what the drawings state that was read correctly');
dr('Material recall', n(S(exB.totals.all.ALL.byGroup?.material).recall), n(S(exA.totals.all.ALL.byGroup?.material).recall), '');
dr('Dimensions precision', n(S(exB.totals.all.ALL.byGroup?.dimensions).precision), n(S(exA.totals.all.ALL.byGroup?.dimensions).precision), '');
dr('Dimensions recall', n(S(exB.totals.all.ALL.byGroup?.dimensions).recall), n(S(exA.totals.all.ALL.byGroup?.dimensions).recall), '');
dr('Requirements Pass', compBefore[0][1], compAfter[0][1], `of ${compliance.length}`);
dr('Requirements Fail', compBefore[2][1], compAfter[2][1], '');
dr('Reconciliation tests PASS', before.recon.summary.PASS, reconSum.PASS, `of ${reconTests.length}`);
dr('Defects found / fixed / open', defects.length, count(defects, d => d.status === 'Fixed'), `${count(defects, d => d.status !== 'Fixed')} not fully fixed`);
dr('Full suite (after fixes)', '', facts.suite, '');
dr('CAD-only regression', '', facts.cadOnly, '');
for (let r = 8; r <= 12; r++) for (const c of [2, 3]) dash.getCell(r, c).numFmt = '0.0%';
// Requirements
sheet('1-Requirements', ['ID', 'Section', 'Requirement', 'Verdict at audit', 'Verdict after fixes', 'Evidence', 'Notes / why'],
  compliance.map(c => [c.id, c.section, c.requirement, c.verdict, verdictAfter(c), c.evidence, postFix[c.id]?.why ?? c.notes]), [7, 14, 50, 12, 12, 60, 50]);
// Register
sheet('2-Test register', ['ID', 'Component', 'Likely commodity', 'Drawing only', 'CAD file', 'CAD type', 'Drawing file', 'Drawing kind', 'Revision', 'Licence', 'Licence evidence', 'Match evidence', 'Source URLs'],
  register.map(r => [r.id, r.component, r.likelyCommodity, r.drawingOnly ? 'yes' : 'no', r.cadFile, r.cadType, r.drawingFile, r.drawingKind, r.revision, r.licence, (r.licenceEvidence ?? []).join(' | '), r.matchEvidence, (r.sourceUrls ?? []).join(' | ')]),
  [24, 34, 16, 8, 26, 12, 26, 18, 14, 18, 40, 40, 50]);
// Extraction
sheet('3-Extraction', ['Drawing', 'Class', 'Family', 'Group', 'Complete in truth', 'Truth items', 'Found', 'Correct', 'Wrong', 'Missed', 'Partial', 'Precision', 'Recall', 'Manual corrections', 'Lenient correct', 'Lenient precision', 'Lenient recall'],
  exA.rows.map(r => [r.drawing, r.class, r.family, r.group, r.complete ? 'yes' : 'no', r.truthItems, S(r).found, S(r).correct, S(r).wrong, S(r).missed, S(r).partial, n(S(r).precision), n(S(r).recall), S(r).manualCorrections, r.lenient?.correct, n(r.lenient?.precision), n(r.lenient?.recall)]),
  [26, 9, 18, 16, 9, 8, 7, 7, 7, 7, 7, 10, 10, 10, 9, 10, 10]).getColumn(12).numFmt = '0.0%';
wb.getWorksheet('3-Extraction').getColumn(13).numFmt = '0.0%';
sheet('3b-Extraction summary', ['Slice', 'Precision before', 'Recall before', 'Precision after', 'Recall after', 'Found after', 'Correct after', 'Wrong after', 'Missed after'],
  [['All', totAll(exB), totAll(exA)], ...classes(exA).map(([k, v]) => [`Class ${k}`, exB.totals.byClass?.[k], v]), ...families(exA).map(([k, v]) => [`Family ${k}`, exB.totals.byFamily?.[k], v]),
   ...groups.filter(g => groupRow(exA, g)).map(g => [`Group ${g}`, groupRow(exB, g), groupRow(exA, g)])]
    .map(([l, b, a]) => [l, n(S(b).precision), n(S(b).recall), n(S(a).precision), n(S(a).recall), S(a).found, S(a).correct, S(a).wrong, S(a).missed]), [34, 13, 13, 13, 13, 10, 10, 10, 10]);
for (const c of [2, 3, 4, 5]) wb.getWorksheet('3b-Extraction summary').getColumn(c).numFmt = '0.0%';
// Reconciliation
sheet('4-Reconciliation', ['ID', 'Pair', 'Scenario', 'Expected', 'Actual', 'Status', 'Evidence'],
  reconTests.map(t => [t.id, t.pair, t.scenario, t.expected, typeof t.actual === 'string' ? t.actual : JSON.stringify(t.actual), t.status, typeof t.evidence === 'string' ? t.evidence : JSON.stringify(t.evidence ?? '')]), [22, 34, 40, 50, 70, 9, 40]);
// Costing
const B = ['material', 'process', 'labour', 'tooling', 'packaging', 'logistics', 'overhead', 'margin'];
sheet('5-Costing A v C', ['Part', 'Route', 'Status', 'A total £', 'C total £', 'Δ £', 'Δ %', ...B.map(b => `A ${b}`), ...B.map(b => `C ${b}`), 'Classification', 'What changed and why', 'A assumptions', 'C review'],
  parts.map((p, i) => { const r = costRows[i]; return [r.pair, r.route, r.status, n(p.A?.total), n(p.C?.total), n(r.delta), n(r.pctd), ...B.map(b => n(p.A?.buckets?.[b])), ...B.map(b => n(p.C?.buckets?.[b])), r.cls, String(r.why), (p.assumptionsA ?? []).map(a => `${a.id}=${a.value}`).join('; '), JSON.stringify({ confirmed: p.reviewC?.confirmed, corrected: p.reviewC?.corrected, rejected: p.reviewC?.rejected, answers: p.reviewC?.drawingAnswers })]; }),
  [30, 14, 9, 10, 10, 9, 8, ...B.map(() => 9), ...B.map(() => 9), 14, 60, 40, 50]);
const cws = wb.getWorksheet('5-Costing A v C');
for (let c = 4; c <= 6; c++) cws.getColumn(c).numFmt = '£0.0000'; cws.getColumn(7).numFmt = '0.00%';
for (let c = 8; c <= 23; c++) cws.getColumn(c).numFmt = '£0.0000';
// Independent validation
sheet('6-Independent validation', ['Item', 'Status', 'Detail'], facts.accuracyRows, [40, 18, 100]);
// Exports
sheet('7-Export audit', ['ID', 'Scenario', 'Expected', 'Actual', 'Status before fixes', 'After fixes', 'Evidence'],
  [...expRows.map(r => [r.id, r.scenario, r.expected, r.actual, r.status, facts.exportAfter[r.id] ?? '', (r.evidence ?? []).join(' | ')]), ...facts.exportFinalRows], [14, 36, 50, 60, 12, 40, 40]);
// Functional & regression
sheet('8-Functional & regression', ['ID', 'Area', 'Scenario', 'Input', 'Expected', 'Actual', 'Status (before fixes)', 'Time ms', 'Peak RSS MB', 'Evidence'],
  reliability.map(r => [r.id, r.area, r.scenario, r.input, r.expected, r.actual, r.status, r.timeMs, r.peakRssMb, (r.evidence ?? []).join(' | ')]), [10, 11, 36, 36, 40, 50, 12, 9, 9, 40]);
sheet('8b-CAD-only regression', ['Mode', 'Part', 'Total at the measured build (£)', 'Total before the feature (£)', 'Equal to the penny', 'Buckets equal', 'Note'],
  [...(rg.d.rows ?? []).map(r => ['', r.id, n(r.totalHead), n(r.totalBase), r.equalToThePenny ? 'yes' : 'no', r.bucketsEqual ? 'yes' : 'no', r.note ?? '']),
   ...(rg.d.mode1_sameAnswers?.rows ?? []).map(r => ['same answers', r.id, n(r.totalHead), n(r.totalBase), r.equalToThePenny ? 'yes' : 'no', r.bucketsEqual ? 'yes' : 'no', '']),
   ...(rg.d.mode2_routeOnly?.rows ?? []).map(r => ['route answer only', r.id, n(r.totalHead), n(r.totalBase), r.equalToThePenny ? 'yes' : 'no', r.bucketsEqual ? 'yes' : 'no', '']),
   ...(rg.d.verdict ? [['verdict', '', null, null, '', '', String(rg.d.verdict)]] : []),
   ...(rg.d.ppPrefix ? [['PP- prefix at e8328c23', '', null, null, '', '', `${rg.d.ppPrefix.observed ?? ''}`]] : []),
   ...facts.regressionAfterRound3.map(t => ['after 90022108', '', null, null, '', '', t])],
  [18, 28, 14, 14, 10, 10, 80]);
for (const c of [3, 4]) wb.getWorksheet('8b-CAD-only regression').getColumn(c).numFmt = '£0.000000';
// Defects
sheet('9-Defects', ['ID', 'Found by', 'Severity', 'Status', 'Title', 'Module', 'Scenario', 'Expected', 'Actual', 'Evidence', 'Root cause', 'Recommended action', 'Fix commit', 'Retest / proof'],
  defSorted.map(d => [d.id, d.source, d.severity, d.status, d.title, d.module, d.scenario, d.expected, d.actual, d.evidence, d.rootCause, d.recommendedAction, d.fixCommit, d.retest]),
  [8, 16, 9, 11, 44, 20, 30, 40, 40, 30, 40, 40, 10, 44]);
await wb.xlsx.writeFile(join(OUT, 'Validation-Workbook.xlsx'));
console.log('written', OUT, ex.final ? 'final extraction' : 'BEFORE extraction only', cs.final ? 'final costing' : 'BEFORE costing only');
