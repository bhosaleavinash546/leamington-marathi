// Builds "CostVision — Global Cost Engineering KPI Dashboard: feature report" (PDF) from the live screenshots in
// shots/ (e2e/kpi-dashboard-tour.ts), the exports in exports/ and the audit record in ../dashboard-audit/.
//   node docs/dashboard-report/build-report.mjs   (run inside calculator/)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIR = path.resolve('docs/dashboard-report');
const SHOTS = path.join(DIR, 'shots');
const EXP = path.join(DIR, 'exports');
const cap = JSON.parse(fs.readFileSync(path.join(SHOTS, 'manifest.json'), 'utf8'));
const xl = JSON.parse(fs.readFileSync(path.join(EXP, 'xlsx-extract.json'), 'utf8'));
const FONT = path.resolve('node_modules/@fontsource/inter/files');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

let fig = 0;
const img = (name, opts = {}) => {
  fig++;
  const f = path.join(SHOTS, `${name}.jpg`);
  return `<figure class="${opts.cls ?? ''}"${opts.style ? ` style="${opts.style}"` : ''}><div class="frame"><img src="file://${f}" style="${opts.img ?? ''}"></div>
    <figcaption><b>Figure ${fig}.</b> ${esc(opts.caption ?? cap[name] ?? '')}</figcaption></figure>`;
};
const expImg = (file, caption) => { fig++; return `<figure><div class="frame"><img src="file://${path.join(EXP, file)}"></div><figcaption><b>Figure ${fig}.</b> ${esc(caption)}</figcaption></figure>`; };
const table = (head, rows, cls = '') => `<table class="${cls}"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? '' : ' class="k"'}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const xlTable = (rows, n = 99) => `<table class="xl"><tbody>${rows.slice(0, n).map((r, i) => `<tr>${r.map(c => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(typeof c === 'number' ? (Math.abs(c) < 1 && c !== 0 && !Number.isInteger(c) ? c.toFixed(4) : c.toLocaleString('en-GB', { maximumFractionDigits: 4 })) : c)}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
for (const r of xl['Reconciliation']) if (typeof r[0] === 'string' && r[0].includes('%')) for (let i = 1; i < 3; i++) if (typeof r[i] === 'number') r[i] = (r[i] * 100).toFixed(2) + '%';
const csvHead = fs.readFileSync(path.join(EXP, 'records.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/)[0].split(',');

const html = `<!doctype html><html><head><meta charset="utf-8"><title>CostVision KPI Dashboard — feature report</title><style>
@font-face { font-family: Inter; font-weight: 400; src: url(file://${FONT}/inter-latin-400-normal.woff2) format('woff2'); }
@font-face { font-family: Inter; font-weight: 600; src: url(file://${FONT}/inter-latin-600-normal.woff2) format('woff2'); }
@font-face { font-family: Inter; font-weight: 700; src: url(file://${FONT}/inter-latin-700-normal.woff2) format('woff2'); }
:root { --navy: #16325c; --blue: #2563eb; --ink: #1b2333; --muted: #5b6678; --line: #d9dfea; --soft: #f3f6fb; --good: #15803d; --bad: #b42318; --warn: #b45309; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, 'DejaVu Sans', Arial, sans-serif; color: var(--ink); font-size: 9.6pt; line-height: 1.5; }
.cover { height: 267mm; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
.cover .band { background: var(--navy); color: #fff; padding: 22mm 16mm 14mm; border-radius: 0 0 6mm 6mm; }
.cover .eyebrow { letter-spacing: .14em; text-transform: uppercase; font-size: 9pt; color: #9db8e8; font-weight: 600; }
.cover h1 { font-size: 27pt; line-height: 1.15; margin: 4mm 0 3mm; font-weight: 700; }
.cover .sub { font-size: 12pt; color: #d7e3f8; max-width: 150mm; }
.cover .hero { margin: 8mm 0 0; padding: 0 6mm; } .cover .hero img { width: 100%; border-radius: 3mm; border: 1px solid var(--line); box-shadow: 0 3mm 8mm rgba(10,30,60,.18); }
.cover .meta { padding: 0 6mm 4mm; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; font-size: 8.4pt; color: var(--muted); }
.cover .meta b { display: block; color: var(--ink); font-size: 9.4pt; }
h2 { font-size: 16pt; color: var(--navy); margin: 0 0 2mm; padding-top: 1mm; page-break-after: avoid; }
h2 .n { color: var(--blue); margin-right: 3mm; }
h3 { font-size: 11pt; color: var(--navy); margin: 5mm 0 1.5mm; page-break-after: avoid; }
section { page-break-before: always; }
p { margin: 0 0 2.4mm; } .lead { font-size: 10.4pt; color: #2b3445; }
ul { margin: 0 0 3mm; padding-left: 5mm; } li { margin: 0 0 1mm; }
figure { margin: 3mm 0 4mm; page-break-inside: avoid; }
.frame { border: 1px solid var(--line); border-radius: 2mm; overflow: hidden; background: #fff; }
figure img { display: block; width: 100%; }
figcaption { font-size: 8.2pt; color: var(--muted); margin-top: 1.4mm; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; align-items: start; } .two figure { margin-top: 0; }
.three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; align-items: start; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.4pt; page-break-inside: auto; }
th { text-align: left; background: var(--soft); color: var(--navy); font-weight: 600; padding: 1.6mm 2mm; border-bottom: 1px solid var(--line); }
td { padding: 1.5mm 2mm; border-bottom: 1px solid var(--line); vertical-align: top; } td.k { font-weight: 600; white-space: nowrap; }
tr { page-break-inside: avoid; }
table.xl { font-size: 7.6pt; page-break-inside: avoid; } table.xl td, table.xl th { padding: 1.1mm 1.6mm; }
.note { background: var(--soft); border-left: 3px solid var(--blue); padding: 2.4mm 3.2mm; margin: 2mm 0 4mm; font-size: 8.8pt; border-radius: 0 2mm 2mm 0; }
.note.warn { border-left-color: var(--warn); }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 3mm 0 4mm; }
.kpis div { border: 1px solid var(--line); border-radius: 2mm; padding: 2.6mm 3mm; } .kpis b { display: block; font-size: 15pt; color: var(--navy); } .kpis span { font-size: 8pt; color: var(--muted); }
.toc { columns: 2; column-gap: 10mm; font-size: 10pt; } .toc div { margin-bottom: 1.6mm; break-inside: avoid; } .toc b { color: var(--blue); display: inline-block; width: 9mm; }
code { font-family: 'DejaVu Sans Mono', monospace; font-size: 8pt; background: var(--soft); padding: 0 1mm; border-radius: 1mm; }
.pill { display: inline-block; padding: 0 2mm; border-radius: 3mm; font-size: 7.6pt; font-weight: 600; border: 1px solid var(--line); }
.ok { color: var(--good); } .no { color: var(--bad); } .pt { color: var(--warn); }
.crop22 { overflow: hidden; } .crop22 img { width: 118%; margin-left: -16.4%; }
.phone img { max-height: 120mm; width: auto; margin: 0 auto; }
</style></head><body>

<div class="cover">
  <div class="band">
    <div class="eyebrow">CostVision · Feature report</div>
    <h1>Global Cost Engineering<br>KPI Dashboard</h1>
    <div class="sub">What the dashboard covers, every option and feature, and how each one behaves — shown with live screenshots of the running application.</div>
  </div>
  <div class="hero"><img src="file://${path.join(SHOTS, '01-overview-light.jpg')}"></div>
  <div class="meta">
    <div><b>${today}</b>Report date</div>
    <div><b>dashboard-audit-fixes</b>Branch (local)</div>
    <div><b>41 live screenshots</b>Real server + Chromium</div>
    <div><b>Demo data only</b>Test fixture — not JLR data</div>
  </div>
</div>

<section style="page-break-before: avoid">
<h2>Contents</h2>
<div class="toc">
${['Summary', 'Where it lives and who sees what', 'A tour of the page', 'Filters and reporting period', 'KPI cards', 'Where to act and insights', 'Analysis charts', 'Drill-down', 'Costing records table', 'The record panel', 'Currencies and FX', 'Data quality and the counting rules', 'Exports: PDF, Excel, CSV', 'Administration', 'Getting data in', 'Themes, screens and states', 'Quality evidence', 'Limits and open items'].map((t, i) => `<div><b>${i + 1}</b>${t}</div>`).join('')}
</div>
<div class="note"><b>About the screenshots.</b> Every picture is the real application: a production build served by the real server
(AI switched off, no key), driven by Chromium. The data is the existing automated-test fixture — nine saved costings by three demo
users (Alice Able, Bob Baker, Ada Admin), two rows imported as if from CSS System and CPSC II, and an approved FX table for this month.
Part numbers such as <code>LR-KNK-100</code> are invented. The only things simulated are a slow response (loading picture) and a
server error (error picture). Script: <code>calculator/e2e/kpi-dashboard-tour.ts</code>.</div>

<h2 style="margin-top:6mm"><span class="n">1</span>Summary</h2>
<p class="lead">The KPI dashboard is a shared, read-only view of every costing saved to it — by every signed-in user — consolidated in GBP.
It answers four questions for management: what the costing covers, what filters are on, how big the potential opportunity is, and where
to act. Engineers use the same page to find, check and open individual costing records.</p>
<div class="kpis">
  <div><b>£6.98</b><span>Potential unit cost opportunity — 3 records above should-cost</span></div>
  <div><b>+3.9%</b><span>Weighted cost gap — 5 eligible records</span></div>
  <div><b>−£4.03</b><span>Unfavourable gaps — 2 records below should-cost</span></div>
  <div><b>£264.0k</b><span>Annualised — 1 record with an admin-validated volume</span></div>
</div>
<p>(Figures from the demo data in the screenshots.) Five rules make the numbers trustworthy:</p>
<ul>
<li><b>No figure is computed on the screen.</b> One reporting model on the server produces every KPI, chart, table, insight and export.</li>
<li><b>Each costing counts once.</b> A part is identified by its part number; the same part on the same programme, model year and powertrain is one "application", and only its newest costing counts in the money KPIs. Older revisions and other users' duplicate costings are kept, labelled, for activity.</li>
<li><b>Money is converted honestly.</b> Each value is converted to GBP at its own frozen exchange rate; a missing cost is never treated as zero; current and should-cost are only compared on the same delivery terms; different currencies are never added together.</li>
<li><b>A gap is not a saving.</b> The opportunity is a sum of per-piece gaps; it becomes an annual figure only where an admin has validated the annual volume. Validated and implemented savings are tracked separately.</li>
<li><b>Everything is traceable.</b> Original values, the FX snapshot, the source tool and owner stay on every record; every change is in the audit log; the Excel export re-adds the KPIs with live formulas.</li>
</ul>
</section>

<section>
<h2><span class="n">2</span>Where it lives and who sees what</h2>
<p>The dashboard is the <b>KPIs</b> item in CostVision's left navigation (gauge icon). It loads on first open and keeps its filters
for each person between visits.</p>
${table(['Who', 'Can do'], [
  ['Every signed-in user', 'See every eligible costing record from every user (read-only), all filters, charts, drill-down, records, the record panel and all three exports.'],
  ['The record owner', 'Edit their own record: part number, programme, model year, powertrain, current cost, annual volume, notes, status draft / completed; delete it.'],
  ['An administrator', 'Everything above on any record, plus: mark reviewed / approved, validate an annual volume, set a saving status, mark test records; load approved FX rates, choose the FX policy and run a controlled recalculation; import CSS System / CPSC II records; read the audit log; see excluded records.'],
  ['Not signed in', 'Nothing — every dashboard request needs a session (HTTP 401).'],
])}
<div class="note">Who may see what was decided when the dashboard was built: all signed-in users see all eligible records. It assumes
sign-up is limited to JLR accounts (planned in the Phase 1 readiness build).</div>
${img('70-save-entry', { style: 'max-width:120mm', caption: 'How records arrive from CostVision: on any costing result, More → Save → "Save to KPI Dashboard" (details in section 15).' })}
</section>

<section>
<h2><span class="n">3</span>A tour of the page</h2>
<p>From top to bottom, in order of business importance:</p>
<div style="display:grid;grid-template-columns:1.55fr 1fr;gap:5mm;align-items:start"><div>${table(['#', 'Zone', 'What it is for'], [
  ['1', 'Header', 'Title, last refresh time, Refresh, the currency switch (consolidated GBP / original currency) and Export.'],
  ['2', 'Filters', 'Reporting period and nine multi-select filters, with chips showing what is on.'],
  ['3', 'FX and data-quality lines', 'Which FX policy and rates apply; how many records could be compared in GBP and why the others could not.'],
  ['4', 'Financial position', 'Opportunity, weighted gap, unfavourable gaps, validated and implemented savings.'],
  ['5', 'Coverage and workflow', 'Records, unique components, completed costings, commodities, programmes, awaiting review.'],
  ['6', 'Where to act', 'Opportunity by commodity and the commodity × programme coverage map.'],
  ['7', 'Management insights', 'Short statements the data supports, each with "Filter to this".'],
  ['8', 'Analysis', 'Nine further charts.'],
  ['9', 'Drill-down', 'Commodity → programme → powertrain → model year → component → record.'],
  ['10', 'Costing records', 'Searchable, sortable, paged table; opens the record panel.'],
  ['11', 'Data quality', 'The full check table.'],
])}</div>
${img('02-full-page-light', { caption: 'The whole page (light theme, 1440 px wide).', img: 'max-height:205mm;width:auto;margin:0 auto' })}</div>
${img('10-header')}
<p>The refresh time updates on every load. The page refreshes itself every five minutes while it is on screen, and when you come back to the
browser tab after more than a minute away. "Refresh" reloads at once.</p>
</section>

<section>
<h2><span class="n">4</span>Filters and reporting period</h2>
<p>Every filter works with every other, and every card, chart, insight, the drill-down, the records table and all exports follow them.
Filter options are read from the data — never a fixed list — and each option shows how many records it would leave given the other filters.</p>
${table(['Filter', 'Options'], [
  ['Reporting period', 'Last 7 days · 30 days · 90 days · <b>12 months (default)</b> · year to date · all time · custom from / to'],
  ['Commodity', 'From the data (e.g. Casting, Machining, Forging, PCBA, Pressed sheet metal, Rubber)'],
  ['Programme', 'From the data; the standard programmes L460, L461, L663, EMA, JEA are listed first'],
  ['Model year', 'From the data, newest first (shown as MY2027 …)'],
  ['Powertrain', 'From the data; MHEV, Petrol PHEV, Diesel PHEV, Petrol, BEV listed first'],
  ['Costing tool', 'CostVision, CSS System, CPSC II and any other tool that records were imported from'],
  ['Country / market', 'The manufacturing country of the costing'],
  ['Currency', 'Original currency of either the current cost or the should-cost'],
  ['Status', 'Draft · Completed · Reviewed · Approved'],
  ['Created by', 'The person who did the costing'],
])}
<div class="two">${img('11-filter-popover')}${img('13-date-custom')}</div>
${img('12-filters-applied')}
<ul>
<li>Each popover has a search box, ticks, "Clear" and "Done"; Escape closes it from anywhere and keyboard focus stays on the option you picked.</li>
<li>Chips: one per selected value with its own ×; "Clear all" returns to the default (all data, last 12 months).</li>
<li>When nothing matches, the page says so and offers "Clear all filters" (no empty charts).</li>
<li>On phones and narrow tablets the controls fold behind one "Filters (n)" button (section 16).</li>
</ul>
</section>

<section>
<h2><span class="n">5</span>KPI cards</h2>
<h3>Financial position (GBP · current records · per piece)</h3>
${img('20-financial-band')}
${table(['Card', 'What it is', 'Shown here'], [
  ['Potential unit cost opportunity', 'Sum of per-piece gaps (GBP current − GBP should-cost) where the current cost is ABOVE should-cost. Not programme spend, not an annual saving. Includes the annualised line: gap × annual volume, only where an admin validated the volume.', '£6.98 over 3 records; annualised £264.0k over 1'],
  ['Weighted cost gap', 'Σ gap ÷ Σ GBP current cost over financially eligible records — weighted by cost, never an average of percentages. Positive = current above should-cost.', '+3.9% over 5 eligible'],
  ['Unfavourable gaps', 'Sum of per-piece gaps where the current cost is BELOW should-cost, shown apart — never netted against the opportunity.', '−£4.03 over 2 records'],
  ['Validated savings', 'Per-piece savings an admin has marked validated. "Not tracked" when none — a gap is never shown as a saving.', 'Not tracked'],
  ['Implemented savings', 'Per-piece savings an admin has marked implemented (in the price paid).', 'Not tracked'],
])}
${img('22-card-explanation', { cls: 'crop22' })}
<h3>Coverage and workflow</h3>
${img('21-coverage-tiles')}
${table(['Tile', 'What it counts'], [
  ['Costing records', 'Every eligible save in the view, older revisions included (9 = 7 current + 2 older / duplicates). Click to list all saves.'],
  ['Unique components', 'Distinct part numbers among current records; names never merge parts.'],
  ['Completed costings', 'Current records completed, reviewed or approved (drafts excluded). Click to filter.'],
  ['Commodities / programmes covered', 'Distinct values among current records.'],
  ['Awaiting review / approval', 'Completed (to review) + reviewed (to approve). Click to filter to them.'],
])}
</section>

<section>
<h2><span class="n">6</span>Where to act and insights</h2>
<p>Directly under the KPIs, the two charts that answer "where is the money, and where is coverage missing".</p>
${img('30-where-to-act')}
<ul>
<li><b>Potential cost opportunity by commodity</b> — ranked bars of the per-piece opportunity. Click a bar to filter to that commodity.</li>
<li><b>Commodity × programme</b> — a coverage map: each cell is the number of current costings, darker = more; hover shows the opportunity; click a cell to filter to both.</li>
</ul>
${img('31-insights')}
<p>Insights are written only from what the data shows: most activity, largest opportunity, programme and powertrain coverage, commodities with
fewer than 3 current costings, applications with a gap of 15% or more, records awaiting review and the last 30 days of activity. The thresholds
are printed on the page. "Filter to this" applies the matching filter.</p>
</section>

<section>
<h2><span class="n">7</span>Analysis charts</h2>
${img('40-analysis-charts')}
${table(['Chart', 'Question it answers', 'Click does'], [
  ['Costing activity over time', 'Is costing activity rising or falling? (every save, by day / week / month)', 'Sets the period to that bucket'],
  ['Costing records by commodity', 'Where is the costing effort going?', 'Filters commodity'],
  ['Current cost v should-cost by commodity', 'Where is the price above should-cost? (GBP; hover and table add the weighted gap %)', 'Filters commodity'],
  ['Potential cost opportunity by commodity', '(in "Where to act")', 'Filters commodity'],
  ['Programme distribution', 'Which programmes are covered?', 'Filters programme'],
  ['Powertrain distribution', 'Coverage by powertrain (donut; a powertrain keeps its colour when others are filtered out)', 'Filters powertrain'],
  ['Model year analysis', 'Coverage by model year', 'Filters model year'],
  ['Costing tool contribution', 'Which tools feed the view (CostVision, CSS System, CPSC II)', 'Filters tool'],
  ['Commodity × programme', '(in "Where to act")', 'Filters both'],
  ['Cost opportunity by powertrain', 'Where is the money by powertrain?', 'Filters powertrain'],
  ['Costing status', 'How much is waiting for review? (ordered blue scale draft → approved)', 'Filters status'],
])}
<div class="two">${img('41-chart-tooltip')}${img('42-chart-table')}</div>
<p>Every chart has a <b>Table</b> button showing the same figures as a table (useful for exact values, screen readers and keyboard use), an
empty-state message when the view has no data, and a caption saying what it counts. Colours come from a palette checked for colour-blind
separation in both themes.</p>
</section>

<section>
<h2><span class="n">8</span>Drill-down</h2>
<p>A table that steps down one level per click: <b>commodity → programme → powertrain → model year → component → costing record</b>. Each level shows
current records, eligible records, GBP current, GBP should-cost, GBP gap and opportunity. Breadcrumbs step back up. Active filters stay applied
throughout, and the records table below follows the drill path.</p>
${img('50-drill-commodity')}
${img('51-drill-component')}
${img('52-drill-chip')}
<p>The path is also shown as a chip, "Drill-down (table and exports)", with its own × to leave it. Exports apply the commodity, programme,
powertrain and model-year levels; a component level is shown on screen only (the export says so) so that the workbook's reconciliation always
compares the same set of records.</p>
</section>

<section>
<h2><span class="n">9</span>Costing records table</h2>
${img('60-records-current')}
<p>Columns, most-used first (none removed): <b>Part number</b> (opens the record; pinned when the table scrolls sideways) · Component · Commodity ·
Programme · <b>GBP gap</b> · <b>Gap %</b> · <b>GBP current</b> · <b>GBP should-cost</b> · Status · Model year · Powertrain · Country · Current cost
(original currency) · Should-cost (original currency) · Tool · Created by · Created · Last updated · Costing ID. A GBP figure converted at the
built-in reference rate carries a small <span class="pill pt">ref</span> mark; a record that cannot be compared shows why ("No current cost",
"Different cost basis") instead of a number.</p>
<div class="two">${img('61-records-all')}${img('62-records-search-sort')}</div>
<ul>
<li><b>Which records:</b> current records (one per application, default) · all saves including revisions · excluded records (admins only).</li>
<li><b>Search</b> part number, component, owner, ID, commodity, programme; <b>sort</b> on any column heading (▲ / ▼); <b>paging</b> 10 / 25 / 50 / 100 rows.</li>
<li>The table scrolls inside its own box so the column header stays visible; long component names are shortened with the full name on hover.</li>
</ul>
</section>

<section>
<h2><span class="n">10</span>The record panel</h2>
<div class="two">${img('63-record-panel')}<div>${img('64-copy-link')}${img('66-pasted-link')}</div></div>
<ul>
<li><b>Classification:</b> commodity, programme, model year, powertrain, country, owner, costing date, last update, original record id, annual volume (and whether it is validated).</li>
<li><b>Cost:</b> current cost and should-cost each in the original currency, delivery terms, GBP value and the frozen FX snapshot (rate, source, effective date, method, when frozen, approved or reference); the gap and gap % or the reason it is not compared.</li>
<li><b>Other costings of this application:</b> older revisions and other users' duplicate costings, each one click away.</li>
<li><b>Original costing analysis:</b> the saved CostVision costing (8-bucket breakdown and operations) read-only; for imported records, the tool and its record id.</li>
<li><b>Copy link:</b> a link (…/calculator/#kpi-record=&lt;id&gt;) that opens CostVision straight on this record.</li>
<li><b>FX history:</b> every earlier snapshot an admin recalculation replaced (owner and admins).</li>
</ul>
${img('65-edit-admin')}
</section>

<section>
<h2><span class="n">11</span>Currencies and FX</h2>
<p>GBP is the reporting currency. Each value keeps its original amount and currency; its GBP equivalent is that amount × the GBP-per-unit rate frozen
on the record when it was saved. The current cost and the should-cost are converted independently, then the gap is worked out.</p>
${table(['Topic', 'How it works'], [
  ['Currencies', 'Any ISO 4217 code the platform knows (not a fixed list). A code that is not ISO 4217 makes the record invalid (excluded, listed for admins).'],
  ['Default policy', 'Approved monthly rate for the costing month (decided 11 Nov 2026). Alternatives an admin can choose: rate in force on the costing date, or the latest loaded rate.'],
  ['Approved rates', 'Loaded by an admin from a CSV / Excel file (GBP per unit, or units per £1 converted automatically), each with its source.'],
  ['Before rates are loaded', 'The built-in rate-book reference rates are used and labelled "reference, not approved" everywhere (cards line, table "ref" mark, record panel, exports).'],
  ['Never 1:1', 'A currency with no rate is "No FX rate" and left out of the money KPIs — never converted 1:1.'],
  ['Frozen', 'Loading new rates or changing the policy changes nothing until an admin previews and applies a recalculation; the previous snapshot is kept in the record\'s FX history.'],
  ['Guard', 'A rate more than 10 times away from the reference is refused (almost always an inverted rate), naming the row and column.'],
])}
${img('24-original-currency')}
<p>The <b>Original currency</b> switch replaces the GBP financial position with one row per currency — records and sums of current cost and
should-cost, and the gap where both are in the same currency and terms. Currencies are never added together; charts stay in GBP.</p>
</section>

<section>
<h2><span class="n">12</span>Data quality and the counting rules</h2>
${img('25-data-quality')}
${table(['Rule', 'Effect'], [
  ['Excluded', 'Deleted, test or invalid records (bad currency code, negative cost, no name or date) are in no KPI or chart; counted here and listed for admins.'],
  ['Identity', 'A component is its part number (upper case, spaces removed). An application = part number × programme × model year × powertrain. Names never merge records; a record without a part number stands alone and is flagged.'],
  ['Current record', 'The newest non-draft costing of an application (the newest draft if all are drafts).'],
  ['Older revision', 'A costing its own owner has since revised — kept for activity, not in money KPIs.'],
  ['Duplicate candidate', 'Another user\'s costing of the same application — kept, labelled, not in money KPIs.'],
  ['Financially eligible', 'A current record with both costs, both converted to GBP, on the same delivery terms (DAP / EXW).'],
  ['Missing values', 'Never treated as zero; counted under their reason (missing current cost, should-cost, FX, different basis).'],
  ['Order of work', 'These rules run on all records BEFORE filters, so a filter can never turn an old revision into the current one.'],
])}
<p>The one-line summary at the top of the page ("5 of 7 current records compared in GBP · 1 without a current cost · 1 on a different delivery
basis · 1 duplicate candidate") links to this table.</p>
</section>

<section>
<h2><span class="n">13</span>Exports: PDF, Excel, CSV</h2>
${img('73-export-menu', { style: 'max-width:105mm' })}
<p>All three follow the active filters (and the drill-down levels above component). Nothing is recomputed in an export — they print the same
server figures as the screen.</p>
<h3>PDF dashboard report (landscape A4, 8 pages here)</h3>
<p>Filters and period, the FX note, the KPI table with each figure's basis, the insights, every chart (redrawn in the light theme), analysis tables by
commodity, programme, powertrain, model year, status and tool, original-currency totals, data quality, and the current records (up to 400 —
the Excel and CSV hold all). Every page carries "GBP at frozen FX; opportunity = per-piece gaps summed, not an annual saving".</p>
<div class="two">${expImg('exp-pdf-1.jpg', 'Exported PDF, page 1: filters, KPIs with their basis, insights.')}${expImg('exp-pdf-2.jpg', 'Exported PDF, page 2: charts.')}</div>
<h3>Excel report (11 sheets)</h3>
<p>${xl.sheets.map(s => `<span class="pill">${esc(s)}</span>`).join(' ')}</p>
<p>"Costing records" holds the current records only (so a GBP column can be summed); older revisions and duplicates are on their own sheet. The
<b>Reconciliation</b> sheet re-adds every money KPI from the exported records with live spreadsheet formulas. The values below are the file
exported in this run, recalculated by LibreOffice:</p>
${xlTable(xl['Reconciliation'], 8)}
<h3>Executive summary sheet (first rows)</h3>
${xlTable(xl['Executive summary'].filter(r => r.length >= 1), 22)}
<h3>CSV of the records table</h3>
<p>One row per record in the table's "Which records" choice, ${csvHead.length} columns: ${csvHead.map(h => esc(h)).join(' · ')}. A cell that would
start a spreadsheet formula is made safe; the file opens in Excel with the £ and currency symbols intact.</p>
</section>

<section>
<h2><span class="n">14</span>Administration</h2>
<p>The <b>Admin</b> button (administrators only) opens three tabs.</p>
<div class="two">${img('80-admin-fx-refused')}${img('81-admin-fx-preview')}</div>
<div class="two">${img('82-admin-import')}${img('83-admin-audit')}</div>
${table(['Tab', 'What it does'], [
  ['FX rates & policy', 'Choose the default FX policy; load approved rates (CSV / Excel: currency, period YYYY-MM or YYYY-MM-DD, gbp_per_unit or units_per_gbp, source) — the whole file is refused on any error, naming row and column; list loaded rates; preview a recalculation (what would change, old v new GBP and rate source) and apply it (the old snapshot is kept on each record).'],
  ['Import records', 'Load costing records from CSS System, CPSC II or any other tool with the documented template (download link in the tab). Required: source tool, source record id, owner, component, status, costing date. Re-importing the same tool + id updates the record. Refused on any error, naming row and column.'],
  ['Audit log', 'The last 200 changes: save, edit, delete, FX load, policy change, recalculation, import — with who and when.'],
])}
</section>

<section>
<h2><span class="n">15</span>Getting data in</h2>
<p><b>From CostVision.</b> Cost a part with any commodity tool or CAD to COST, then More → Save → <b>Save to KPI Dashboard</b>. The details step
shows the should-cost from the costing (read-only, with its delivery terms and country) and asks for what the costing does not hold:</p>
${img('71-save-dialog', { style: 'max-width:135mm' })}
<ul>
<li><b>Part number</b> (required — it identifies the component and links revisions), component name, programme, model year, powertrain;</li>
<li><b>status</b> draft or completed (reviewed / approved are set by an admin);</li>
<li>an optional <b>current cost</b> per piece in its own currency, with its delivery terms and source (quote, purchase order, contract);</li>
<li>annual volume (counts in the annualised figure only after an admin validates it) and notes.</li>
</ul>
<p>Saving again for the same part, programme, model year and powertrain makes a new revision; the newest becomes current automatically.</p>
<p><b>From CSS System and CPSC II.</b> Their data structures are not available to CostVision, so records arrive through the admin import
(section 14). The template's column list is the interface; once JLR supplies each tool's export columns they can be mapped to it.</p>
</section>

<section>
<h2><span class="n">16</span>Themes, screens and states</h2>
<div class="two">${img('03-overview-dark')}${img('32-where-to-act-dark')}</div>
<p>The dashboard follows CostVision's light and dark (black + green) themes using the app's own colour tokens, buttons and selects. The theme
choice is kept after reload.</p>
<div class="three phone">${img('93-tablet', { img: 'max-height:115mm' })}${img('94-phone', { img: 'max-height:115mm' })}${img('95-phone-filters', { img: 'max-height:115mm' })}</div>
<p>Checked at 1920, 1440, 1366, 1024, 768 and 390 px in both themes: no sideways page scroll, nothing clipped. Wide tables (drill-down below
1024 px, the coverage map on a phone) scroll inside their own box.</p>
<div class="two">${img('90-empty')}${img('91-loading')}</div><div class="two">${img('92-error')}<div></div></div>
</section>

<section>
<h2><span class="n">17</span>Quality evidence</h2>
${table(['Check', 'Result', 'Where'], [
  ['Automated tests (whole application)', '<b class="ok">368 files, 5,998 passed, 0 failed</b> (baseline before the audit fixes: 5,993 passed)', '<code>docs/dashboard-audit/evidence/after-npm-test.log</code>'],
  ['Type checks', '<b class="ok">exit 0</b> (build config and full config)', '<code>after-typecheck*.log</code>'],
  ['Live dashboard check, real server + browser', '<b class="ok">59 / 59 PASS</b> — save from the machining screen, three users, admin FX + import through the screen, every card v the server, filters, drill, records, panel, exports, accessibility', '<code>npm run test:e2e:kpi</code>'],
  ['Independent re-add of the exported workbook', '<b class="ok">matches to the penny</b>', 'live check'],
  ['KPIs reconciled by hand (original × frozen rate)', '<b class="ok">opportunity 6.978441, weighted gap 3.937847 %, unfavourable −4.030518 — all match</b>', '<code>evidence/kpi-reconciliation.md</code>'],
  ['Excel Reconciliation sheet recalculated in LibreOffice', '<b class="ok">7 / 7 ✓</b>', 'section 13'],
  ['Accessibility (axe-core WCAG 2.1 A/AA rules)', '<b class="ok">0 failures</b> at all 6 widths × 2 themes; 60 keyboard stops, each with a visible focus mark', '<code>evidence/after-metrics.json</code>'],
  ['Responsive', '<b class="ok">0 px sideways page scroll</b> at all 12 views', 'same'],
  ['Rest of CostVision', 'Home, Portfolio, KPIs, News, Negotiation, 3D Viewer and the machining, casting, sheet-metal, forging, plastics, PCB-photo and CAD to COST tools open with no errors', '<code>regressionSmoke</code>'],
  ['Server / engine / database', 'No server, engine, schema or shared-CSS file changed by the audit fixes', '<code>git diff</code>'],
  ['Performance (engine)', '50,000 records → full dashboard in 0.39 s', '<code>tests/kpi-dashboard-perf.test.ts</code>'],
])}
<h3>Design audit (11 Nov 2026)</h3>
<p>The dashboard was audited against its specification and an enterprise-SaaS standard: 28 findings (0 P0 · 7 P1 · 12 P2 · 9 P3). The P1 and P2
items were approved and <b>18 are fixed, 1 is partly fixed (F-02)</b>. A separate reviewer checked the changes and caught five problems, which
were fixed and re-tested. Capturing this report found one more (the first card's explanation opened under the navigation) — fixed before these
screenshots. Details: <code>calculator/docs/dashboard-audit/report.md</code> and <code>findings.md</code>.</p>
</section>

<section>
<h2><span class="n">18</span>Limits and open items</h2>
${table(['Item', 'Status'], [
  ['"Where to act" in the first screen (F-02)', '<span class="pt">Partly</span> — at 1440 px the heading and chart titles are in the first screen, the charts just below; at 1366 and 1024 px the section is below it. A layout choice is needed (smaller header / cards, or coverage tiles below the charts).'],
  ['Record link pasted into an already-open CostVision tab', '<span class="pt">Open</span> — opens the record only after a fresh load or once on the dashboard; needs a small navigation change.'],
  ['PDF export size', '<span class="pt">Observed while building this report</span> — the exported dashboard PDF is 10.9 MB for 8 pages because its chart images are stored uncompressed (pdfimages: 1.0–1.4 MB each). Compressing them is a small change in the export code; not done yet.'],
  ['CSS System and CPSC II', 'Through the import template only; no live connection (their data structures are not available).'],
  ['FX', 'No live FX feed (Phase 1 runs with no internet): rates come from an admin-loaded table.'],
  ['Original costing', 'Shown read-only in the record panel; it does not reload the calculator form.'],
  ['Roles', 'Two roles (user, admin): review and approval are admin actions until a reviewer role is wanted.'],
  ['Same part, two countries', 'Counted as one application (a duplicate candidate) by design of the identity rule.'],
  ['"Save to KPI Dashboard" placement', 'Kept inside the costing results "More" menu (decision 11 Nov 2026).'],
  ['P3 polish', 'Axis titles, the eligible count on the opportunity card, literal shadow colours, an 8 px seam under the sticky filters, the "Created" column label, an empty "Original costing analysis" heading for imports, smooth scroll under reduced motion, internal user ids in list rows, Export button weight — listed, not done.'],
  ['Negative amounts in exports', '<span class="pt">Observed while building this report</span> — the PDF and Excel exports print a negative amount as "£-4.03" where the screen shows "−£4.03". Formatting only; the figure is right.'],
  ['Accuracy', 'The dashboard reports CostVision\'s should-costs; how close they are to prices JLR pays is not yet measured.'],
  ['Screenshots', 'Demo data (9 records). Behaviour with realistic volumes in the browser was not tested; the engine is tested at 50,000 records.'],
])}
</section>
</body></html>`;

fs.writeFileSync(path.join(DIR, 'report.html'), html);
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto('file://' + path.join(DIR, 'report.html'), { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: path.join(DIR, 'CostVision-KPI-Dashboard-Feature-Report.pdf'), format: 'A4', printBackground: true,
  margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' }, displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%;font-size:7.5pt;color:#7a8597;padding:0 14mm;display:flex;justify-content:space-between;font-family:Arial"><span>CostVision · Global Cost Engineering KPI Dashboard · feature report · demo data</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
});
await browser.close();
console.log('written', path.join(DIR, 'CostVision-KPI-Dashboard-Feature-Report.pdf'), fig, 'figures');
