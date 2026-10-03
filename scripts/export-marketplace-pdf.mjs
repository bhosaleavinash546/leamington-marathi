#!/usr/bin/env node
// Export the whole Idea Marketplace to one professional, light-theme PDF,
// segregated by commodity, carrying every detail the marketplace holds.
//
//   node scripts/export-marketplace-pdf.mjs [out.pdf]
//
// The ideas come from a REAL server boot on a throwaway database, so the PDF
// holds exactly what the marketplace shows: every seed pack, upserts applied,
// reviewed-out ideas retired (status != 'approved' is excluded).
// Two render passes: the first finds the page each commodity and each idea
// lands on (pdftotext), the second prints the contents and the idea index with
// those page numbers. Requires Chromium (Playwright) and poppler's pdftotext.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { chromium } from 'playwright-core';
import { inferCommodityKey } from '../src/data/commodity-classify.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'exports', 'BrainSpark-Marketplace-Idea-Library.pdf'));
const CHROME = process.env.CHROME_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 1. The marketplace, as the app serves it ─────────────────────────────────
async function loadIdeas() {
  const dataDir = mkdtempSync(join(tmpdir(), 'bs-export-'));
  const port = 19000 + Math.floor(Math.random() * 900);
  const srv = spawn('node', ['server.mjs'], { cwd: ROOT, env: { ...process.env, DATA_DIR: dataDir, JWT_SECRET: 'export', PORT: String(port), BRAINSPARK_BACKUPS: '0' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 180; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch {} await sleep(1000); }
    await sleep(1500);
  } finally { srv.kill(); }
  await sleep(500);
  const db = new Database(join(dataDir, 'brainspark.db'), { readonly: true });
  const rows = db.prepare("SELECT m.*, (SELECT COUNT(*) FROM idea_votes v WHERE v.ideaId = m.id) AS votes FROM marketplace_ideas m WHERE m.status = 'approved'").all();
  db.close();
  return rows.map(r => {
    let d = null; try { d = r.ideaData ? JSON.parse(r.ideaData) : null; } catch { d = null; }
    return { ...r, d };
  });
}

// ── 2. Grouping ──────────────────────────────────────────────────────────────
const COMMODITIES = [
  { key: 'Battery', label: 'Battery & BMS', color: '#2563eb', blurb: 'Cells, modules and packs, pack structure and thermal management, BMS, HV safety, 48 V batteries.' },
  { key: 'EDU', label: 'Electric Drive Unit (EDU)', color: '#7c3aed', blurb: 'E-motors (stator, rotor), inverters and power electronics, reduction gearboxes, EDU housings and cooling.' },
  { key: 'Powertrain', label: 'Powertrain (ICE / Hybrid)', color: '#be123c', blurb: 'Combustion engines, 48 V mild-hybrid systems, aftertreatment, fuel and fluid systems.' },
  { key: 'Driveline', label: 'Driveline', color: '#0f766e', blurb: 'Transmissions, transfer cases, differentials and lockers, axles, prop and half shafts.' },
  { key: 'Chassis', label: 'Chassis', color: '#15803d', blurb: 'Suspension and air suspension, steering, brakes, wheels and tyres, subframes, off-road hardware.' },
  { key: 'BIW', label: 'BIW / Body Structure', color: '#c2410c', blurb: 'Body-in-white architecture, castings and stampings, joining, closures structure, underbody protection.' },
  { key: 'Exterior', label: 'Exterior', color: '#0369a1', blurb: 'Closures, bumpers and fascias, lighting, glazing and sealing, aero, paint and exterior trim.' },
  { key: 'Interior', label: 'Interior', color: '#a16207', blurb: 'Seating, cockpit and trim, HVAC module, NVH and acoustics, restraints, infotainment hardware.' },
  { key: 'Electrical', label: 'Electrical & Electronics', color: '#4338ca', blurb: 'E/E architecture, wiring harness, ADAS and sensing, vehicle thermal management, LV power.' },
  { key: 'Other', label: 'Cross-commodity & Unclassified', color: '#475569', blurb: 'Ideas whose system does not map to a single commodity (plant, paint shop, restraints and other cross-cutting systems).' },
];
const LEVEL_ORDER = { assembly: 0, subassembly: 1, part: 2, system: 3 };
const levelOf = x => String(x.level || x.d?.systemLevel || '').toLowerCase() || null;

function group(ideas) {
  const by = new Map(COMMODITIES.map(c => [c.key, []]));
  for (const x of ideas) by.get(inferCommodityKey(x.system) ?? 'Other').push(x);
  for (const arr of by.values()) arr.sort((a, b) =>
    String(a.system).localeCompare(String(b.system)) || ((LEVEL_ORDER[levelOf(a)] ?? 9) - (LEVEL_ORDER[levelOf(b)] ?? 9)) || String(a.title).localeCompare(String(b.title)));
  return COMMODITIES.map(c => ({ ...c, ideas: by.get(c.key) })).filter(c => c.ideas.length);
}

// ── 3. HTML ──────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const has = v => v != null && String(v).trim() !== '' && String(v).trim() !== 'null';
const eur = n => Number.isFinite(n) ? `${n < 0 ? '−' : ''}€${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: Math.abs(n) < 100 ? 2 : 0, maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 })}` : '—';
const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());
const counts = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const ptOf = x => x.d?.powertrain || (() => { const t = `${x.title} ${x.description}`; const p = []; if (/\b48\s?V\b|MHEV|mild.hybrid/i.test(t)) p.push('MHEV'); if (/\bBEV\b|800\s?V|battery.electric/i.test(t)) p.push('BEV'); if (/\bPHEV\b|plug-in/i.test(t)) p.push('PHEV'); return p.join(' / ') || '—'; })();

function section(label, body, cls = '') {
  return has(body) ? `<div class="sec ${cls}"><div class="sec-h">${esc(label)}</div><div class="sec-b">${body}</div></div>` : '';
}
const para = s => has(s) ? `<p>${esc(s)}</p>` : '';

function ideaCard(x, c) {
  const d = x.d || {};
  const cp = d.costSavingPotential || {};
  const lvl = levelOf(x);
  const chips = [
    lvl && `<span class="chip lvl">${esc(cap(lvl))}</span>`,
    `<span class="chip">${esc(x.system)}</span>`,
    has(d.powertrain) && `<span class="chip">${esc(d.powertrain)}</span>`,
    d.offRoad && `<span class="chip">Off-road</span>`,
    has(d.architectureAssumed) && `<span class="chip">48 V: ${esc(d.architectureAssumed)}</span>`,
    has(x.difficulty || d.implementationDifficulty) && `<span class="chip diff-${esc(x.difficulty || d.implementationDifficulty)}">${esc(x.difficulty || d.implementationDifficulty)} difficulty</span>`,
    `<span class="chip">${x.verified ? 'Verified by review' : 'Unverified'}</span>`,
    has(d.confidenceLevel) && `<span class="chip">${esc(cap(d.confidenceLevel))}</span>`,
    x.origin && `<span class="chip">${esc(cap(x.origin))}</span>`,
    Array.isArray(d.reviewOpenPoints) && d.reviewOpenPoints.length && `<span class="chip warn">${d.reviewOpenPoints.length} open review point${d.reviewOpenPoints.length === 1 ? '' : 's'}</span>`,
  ].filter(Boolean).join('');

  const kpis = [
    ['Annual saving', cp.annualValue || x.annualSaving],
    ['Per vehicle', cp.perVehicle],
    ['Saving range', cp.percentage],
    ['Time to implement', x.timeToImplement || d.timeToImplement],
    d.investment && ['Payback', `${d.investment.paybackMonths} months`],
  ].filter(k => k && has(k[1]));

  const eng = d.engineering || {};
  const engHtml = ['mechanism', 'specDeltas', 'validationPlan', 'dfmImplications', 'costBridge'].some(k => has(eng[k]))
    ? `<div class="eng">${[['mechanism', 'Why it works'], ['specDeltas', 'Drawing & specification changes'], ['validationPlan', 'Validation plan'], ['dfmImplications', 'Manufacturing implications'], ['costBridge', 'Cost walk']]
      .filter(([k]) => has(eng[k])).map(([k, l]) => `<div class="eng-i"><div class="eng-l">${l}</div><p>${esc(eng[k])}</p></div>`).join('')}</div>` : '';

  const lines = Array.isArray(d.costBridgeLines) ? d.costBridgeLines : [];
  const bridge = lines.length ? (() => {
    const tb = lines.reduce((a, l) => a + l.baselineEur, 0), tp = lines.reduce((a, l) => a + l.proposedEur, 0);
    return `<table class="tbl"><thead><tr><th>Cost line (per vehicle)</th><th class="n">Baseline</th><th class="n">Proposed</th><th class="n">Saving</th></tr></thead><tbody>${
      lines.map(l => `<tr><td>${esc(l.item)}${has(l.basis) ? `<div class="sub">${esc(l.basis)}</div>` : ''}</td><td class="n">${eur(l.baselineEur)}</td><td class="n">${eur(l.proposedEur)}</td><td class="n">${eur(l.baselineEur - l.proposedEur)}</td></tr>`).join('')
    }<tr class="tot"><td>Net per vehicle</td><td class="n">${eur(tb)}</td><td class="n">${eur(tp)}</td><td class="n">${eur(tb - tp)}</td></tr></tbody></table>${
      d.investment ? `<div class="inv"><span>Tooling <b>${eur(d.investment.toolingEur)}</b></span><span>Capex <b>${eur(d.investment.capexEur)}</b></span><span>Validation <b>${eur(d.investment.validationEur)}</b></span><span>Payback <b>${esc(d.investment.paybackMonths)} months</b></span></div>` : ''}`;
  })() : '';

  const anchor = d.benchmarkAnchor;
  const bench = anchor && has(anchor.platform)
    ? `<p><b>${esc(anchor.platform)}</b></p><p><span class="lbl">What it does:</span> ${esc(anchor.borrowedFeature)}</p><p><span class="lbl">How this idea differs:</span> ${esc(anchor.difference)}</p>`
    : para(d.benchmarkReference);

  const src = Array.isArray(d.evidenceSources) && d.evidenceSources.length
    ? `<ol class="src">${d.evidenceSources.map(s => `<li><b>${esc(s.title)}</b>${s.year ? ` (${esc(s.year)})` : ''}${has(s.type) ? ` · ${esc(String(s.type).replace(/_/g, ' '))}` : ''}${has(s.supports) ? `<div class="sub">Supports: ${esc(s.supports)}</div>` : ''}${has(s.url) ? `<div class="url"><a href="${esc(s.url)}">${esc(s.url)}</a></div>` : ''}</li>`).join('')}</ol>${d.evidenceUnverified !== false ? '<div class="note">Sources were found by AI research and have not been reviewed by a person; they support the benchmark fact named, never the saving.</div>' : ''}` : '';

  const types = Array.isArray(d.costSavingTypes) && d.costSavingTypes.length ? d.costSavingTypes.map(cap).join(', ') : x.costSavingType;
  const facts = [
    ['Cost-saving type', types],
    ['Material grade', d.materialGrade],
    ['Process route', d.manufacturingProcess],
    ['Focus area', d.focusArea],
    ['DFMA principles', Array.isArray(d.dfmaPrinciples) && d.dfmaPrinciples.length ? d.dfmaPrinciples.join('; ') : null],
    ['Submitted by', x.submittedBy],
    ['Community votes', x.votes ? String(x.votes) : null],
  ].filter(([, v]) => has(v));

  return `<article class="idea" id="i-${esc(x.id)}">
  <header class="ih" style="--c:${c.color}">
    <div class="ih-top"><span class="ref">REF ${esc(x.id)}</span><span class="cm">${esc(c.label)}</span></div>
    <h3>${esc(x.title)}</h3>
    <div class="chips">${chips}</div>
  </header>
  ${kpis.length ? `<div class="kpis">${kpis.map(([l, v]) => `<div class="kpi"><div class="kl">${esc(l)}</div><div class="kv">${esc(v)}</div></div>`).join('')}</div>` : ''}
  ${facts.length ? `<table class="facts">${facts.map(([l, v]) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}
  ${section('Technical description', para(d.technicalDescription) || para(x.description))}
  ${section('Where the saving comes from', para(d.costReductionMechanism))}
  ${section('Manufacturing & assembly impact', para(d.manufacturingImpact))}
  ${section('DFM / DFA', para(d.dfmDfa))}
  ${section('Engineering detail', engHtml)}
  ${section('Cost bridge & investment', bridge)}
  ${section('Saving calculation', [para(cp.qualitative), para(cp.calculationBasis), has(d.volumeBasis) ? `<div class="note">${esc(d.volumeBasis)}</div>` : ''].join(''))}
  ${section('Risks & validation', para(d.riskNotes))}
  ${section('Benchmark', bench)}
  ${section('Regulatory context', para(d.regulatoryContext))}
  ${section('Evidence sources', src)}
</article>`;
}

function html({ groups, total, pages }) {
  const all = groups.flatMap(g => g.ideas);
  const lv = counts(all, x => cap(levelOf(x) || 'Unspecified'));
  const pt = counts(all, x => { const p = ptOf(x); return /MHEV & 800V|MHEV \/ BEV/.test(p) ? 'MHEV & BEV (shared)' : /800V|BEV/.test(p) ? 'BEV' : /MHEV/.test(p) ? 'MHEV' : /PHEV/.test(p) ? 'PHEV' : 'Not powertrain-specific'; });
  const withDetail = all.filter(x => x.d).length;
  const deep = all.filter(x => x.d?.engineering).length;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const pg = (k) => pages?.[k] ?? '';
  const fontUrl = f => pathToFileURL(join(ROOT, 'public', 'fonts', f)).href;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BrainSpark Marketplace Idea Library</title><style>
@font-face{font-family:Plex;src:url('${fontUrl('plex-sans-400-latin.woff2')}') format('woff2');font-weight:400}
@font-face{font-family:Plex;src:url('${fontUrl('plex-sans-500-latin.woff2')}') format('woff2');font-weight:500}
@font-face{font-family:Plex;src:url('${fontUrl('plex-sans-600-latin.woff2')}') format('woff2');font-weight:600}
@font-face{font-family:PlexMono;src:url('${fontUrl('plex-mono-400-latin.woff2')}') format('woff2');font-weight:400}
@page{size:A4;margin:22mm 16mm 18mm 16mm}
:root{--ink:#0f1b2d;--mute:#5b6676;--line:#dfe3e8;--tint:#f5f7fa;--teal:#0f766e;--gold:#a16207}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Plex,Helvetica,Arial,sans-serif;color:var(--ink);font-size:8.6pt;line-height:1.45;background:#fff}
h1,h2,h3{margin:0;font-weight:600;letter-spacing:-.01em}
p{margin:0 0 4pt}
a{color:var(--teal);text-decoration:none}
.page{page-break-after:always}
/* cover */
.cover{height:253mm;display:flex;flex-direction:column;justify-content:space-between;padding:6mm 2mm}
.brand{font-size:11pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.cover h1{font-size:34pt;line-height:1.08;margin-top:46mm}
.cover .lead{font-size:12.5pt;color:var(--mute);margin-top:6mm;max-width:150mm}
.cover .stats{display:flex;gap:10mm;border-top:1.2pt solid var(--ink);padding-top:5mm}
.cover .stat .v{font-size:22pt;font-weight:600}.cover .stat .l{font-size:8pt;color:var(--mute);text-transform:uppercase;letter-spacing:.08em}
.cover .meta{font-size:8.5pt;color:var(--mute)}
/* generic */
.kicker{font-size:7.5pt;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:2mm}
h2{font-size:18pt;margin-bottom:5mm}
.prose p{font-size:9.5pt;max-width:165mm;margin-bottom:6pt}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
table.sum{width:100%;border-collapse:collapse;font-size:9pt}
table.sum th,table.sum td{text-align:left;padding:2.2mm 2mm;border-bottom:.6pt solid var(--line)}
table.sum th{font-size:7.5pt;text-transform:uppercase;letter-spacing:.08em;color:var(--mute);font-weight:600}
table.sum td.n,table.sum th.n{text-align:right;font-family:PlexMono,monospace}
.sw{display:inline-block;width:8pt;height:8pt;border-radius:2pt;margin-right:5pt;vertical-align:-1pt}
.toc{width:100%;border-collapse:collapse;font-size:10.5pt}
.toc td{padding:2.4mm 0;border-bottom:.6pt solid var(--line)}
.toc td.pg{text-align:right;font-family:PlexMono,monospace;width:20mm}
.toc .ct{color:var(--mute);font-size:8.5pt;font-family:PlexMono,monospace;width:28mm;text-align:right;padding-right:6mm}
.legend dt{font-weight:600;margin-top:3mm}.legend dd{margin:0;color:var(--mute)}
/* commodity opener */
.opener .band{height:3mm;background:var(--c);border-radius:1.5mm;margin-bottom:8mm;width:40mm}
.opener h2{font-size:26pt}
.opener .blurb{font-size:11pt;color:var(--mute);margin-bottom:8mm;max-width:160mm}
.opener .marker{font-size:1pt;color:#fff}
/* idea */
.idea{border:.7pt solid var(--line);border-radius:2.5mm;padding:4.5mm 5mm;margin:0 0 5mm;page-break-inside:auto}
.ih{border-left:2.4pt solid var(--c);padding-left:3.5mm;margin-bottom:3mm;page-break-inside:avoid;page-break-after:avoid}
.ih-top{display:flex;justify-content:space-between;font-size:6.8pt;color:var(--mute);letter-spacing:.06em;text-transform:uppercase}
.ref{font-family:PlexMono,monospace}
.idea h3{font-size:11.5pt;line-height:1.25;margin:1mm 0 2mm}
.chips{display:flex;flex-wrap:wrap;gap:1.2mm}
.chip{font-size:6.8pt;padding:.5mm 2mm;border-radius:10mm;background:var(--tint);border:.5pt solid var(--line);color:#334155}
.chip.lvl{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}
.chip.warn{background:#fffbeb;border-color:#fcd34d;color:#92400e}
.chip.diff-High{background:#fef2f2;border-color:#fecaca;color:#991b1b}.chip.diff-Medium{background:#fffbeb;border-color:#fde68a;color:#92400e}.chip.diff-Low{background:#f0fdf4;border-color:#bbf7d0;color:#166534}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:0;border:.6pt solid var(--line);border-radius:1.8mm;margin-bottom:3mm;page-break-inside:avoid;background:var(--tint)}
.kpi{padding:2mm 2.5mm;border-right:.6pt solid var(--line)}.kpi:last-child{border-right:0}
.kl{font-size:6.3pt;text-transform:uppercase;letter-spacing:.08em;color:var(--mute)}
.kv{font-size:8.4pt;font-weight:600;color:var(--teal)}
table.facts{width:100%;border-collapse:collapse;margin-bottom:2.5mm;font-size:7.8pt}
table.facts th{width:30mm;text-align:left;font-weight:600;color:var(--mute);vertical-align:top;padding:.8mm 2mm .8mm 0}
table.facts td{padding:.8mm 0;vertical-align:top}
.sec{margin-top:2.5mm}
.sec-h{font-size:6.8pt;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:var(--teal);margin-bottom:1mm;page-break-after:avoid}
.sec-b p{text-align:left}
.lbl{color:var(--mute);font-weight:600}
.eng{border:.6pt solid var(--line);border-radius:1.8mm;padding:2.5mm 3mm;background:#fbfcfd}
.eng-i{margin-bottom:2mm}.eng-i:last-child{margin-bottom:0}
.eng-l{font-size:7pt;font-weight:600;color:var(--ink);margin-bottom:.5mm}
table.tbl{width:100%;border-collapse:collapse;font-size:7.6pt;page-break-inside:auto}
table.tbl th{font-size:6.5pt;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);text-align:left;border-bottom:.8pt solid var(--ink);padding:1mm 1.5mm}
table.tbl td{border-bottom:.5pt solid var(--line);padding:1mm 1.5mm;vertical-align:top}
table.tbl .n{text-align:right;font-family:PlexMono,monospace;white-space:nowrap}
table.tbl tr.tot td{font-weight:600;border-top:.8pt solid var(--ink)}
.sub{font-size:6.8pt;color:var(--mute)}
.inv{display:flex;gap:6mm;font-size:7.6pt;margin-top:1.5mm;color:var(--mute)}.inv b{color:var(--ink);font-family:PlexMono,monospace;font-weight:400}
ol.src{margin:0;padding-left:4.5mm}ol.src li{margin-bottom:1.2mm}
.url{font-family:PlexMono,monospace;font-size:6.4pt;word-break:break-all}
.note{font-size:6.8pt;color:var(--mute);font-style:italic;margin-top:1mm}
/* index */
.idx{columns:2;column-gap:8mm;font-size:7pt}
.idx h4{font-size:8pt;margin:3mm 0 1mm;break-after:avoid;color:var(--ink)}
.idx .r{display:flex;gap:2mm;break-inside:avoid;line-height:1.35;margin-bottom:.6mm}
.idx .t{flex:1}.idx .p{font-family:PlexMono,monospace;color:var(--mute);white-space:nowrap}
</style></head><body>

<section class="page cover">
  <div>
    <div class="brand">BrainSpark · Cost Engineering</div>
    <h1>Idea Marketplace<br>Library Report</h1>
    <div class="lead">Every cost-saving idea in the BrainSpark marketplace with all its detail, grouped by commodity, with benchmarks, engineering, cost bridges, risks and sources.</div>
  </div>
  <div>
    <div class="stats">
      <div class="stat"><div class="v">${total.toLocaleString('en-GB')}</div><div class="l">Ideas</div></div>
      <div class="stat"><div class="v">${groups.length}</div><div class="l">Commodities</div></div>
      <div class="stat"><div class="v">${withDetail.toLocaleString('en-GB')}</div><div class="l">With full detail</div></div>
      <div class="stat"><div class="v">${deep.toLocaleString('en-GB')}</div><div class="l">With engineering block</div></div>
    </div>
    <div class="meta" style="margin-top:5mm">Generated ${esc(date)} from the live marketplace (approved ideas only; retired ideas excluded). Each idea's figures are shown in the currency it was written in (€ for the researched packs, £ for older library entries); cost-bridge tables are in €.</div>
  </div>
</section>

<section class="page">
  <div class="kicker">Contents</div><h2>Contents</h2>
  <table class="toc">
    <tr><td>How to read this report</td><td class="ct"></td><td class="pg">${pg('read')}</td></tr>
    <tr><td>Library summary</td><td class="ct"></td><td class="pg">${pg('summary')}</td></tr>
    ${groups.map((g, i) => `<tr><td><span class="sw" style="background:${g.color}"></span>${i + 1}. ${esc(g.label)}</td><td class="ct">${g.ideas.length} ideas</td><td class="pg">${pg('c:' + g.key)}</td></tr>`).join('')}
    <tr><td>Index of ideas</td><td class="ct"></td><td class="pg">${pg('index')}</td></tr>
  </table>
</section>

<section class="page prose">
  <div class="kicker">Guide</div><h2>How to read this report<span class="marker" style="font-size:1pt;color:#fff"> §§READ§§</span></h2>
  <p>Each idea is presented as a card. The header gives its reference, commodity, title and tags: level (assembly, subassembly or part), system, powertrain, off-road relevance, the 48 V architecture it assumes, difficulty, review status, confidence and origin. Below it, the key figures (annual saving, per-vehicle saving, saving range, time to implement and payback) are followed by every section the idea carries.</p>
  <dl class="legend">
    <dt>Savings are estimates</dt><dd>Every saving is an engineering estimate with its arithmetic shown in “Saving calculation”. Ideas that apply to one powertrain or an option state whether the per-vehicle figure is per affected vehicle or a fleet average. Scale by your own volume and mix.</dd>
    <dt>Savings are not additive</dt><dd>Several ideas are alternatives to each other or assume different architectures. Add savings only after checking the ideas are compatible.</dd>
    <dt>Unverified vs verified</dt><dd>“Verified by review” is set only when a person reviewed and approved the idea. Library packs are seeded unverified.</dd>
    <dt>Evidence sources</dt><dd>Sources were found by AI research and support the benchmark fact they name, never the saving. They have not been reviewed by a person unless stated.</dd>
    <dt>Open review points</dt><dd>Findings from the engineering review that need an engineer’s judgement are listed under “Risks &amp; validation” and flagged on the card.</dd>
    <dt>Engineering detail & cost bridge</dt><dd>Where present: the governing physics, drawing and specification changes, validation plan, manufacturing implications, a line-by-line cost walk per vehicle that nets to the saving, and the tooling, capex, validation spend and payback.</dd>
  </dl>
</section>

<section class="page">
  <div class="kicker">Overview</div><h2>Library summary<span class="marker" style="font-size:1pt;color:#fff"> §§SUMMARY§§</span></h2>
  <table class="sum"><thead><tr><th>Commodity</th><th class="n">Ideas</th><th class="n">Assembly</th><th class="n">Subassembly</th><th class="n">Part</th><th class="n">System / other</th><th class="n">With engineering block</th></tr></thead><tbody>
  ${groups.map(g => { const l = counts(g.ideas, x => levelOf(x) || '-'); return `<tr><td><span class="sw" style="background:${g.color}"></span>${esc(g.label)}</td><td class="n">${g.ideas.length}</td><td class="n">${l.assembly || 0}</td><td class="n">${l.subassembly || 0}</td><td class="n">${l.part || 0}</td><td class="n">${g.ideas.length - (l.assembly || 0) - (l.subassembly || 0) - (l.part || 0)}</td><td class="n">${g.ideas.filter(x => x.d?.engineering).length}</td></tr>`; }).join('')}
  <tr><td><b>Total</b></td><td class="n"><b>${total}</b></td><td class="n">${lv.Assembly || 0}</td><td class="n">${lv.Subassembly || 0}</td><td class="n">${lv.Part || 0}</td><td class="n">${total - (lv.Assembly || 0) - (lv.Subassembly || 0) - (lv.Part || 0)}</td><td class="n">${deep}</td></tr>
  </tbody></table>
  <div class="grid2" style="margin-top:8mm">
    <div><div class="kicker">By level</div><table class="sum">${Object.entries(lv).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join('')}</table></div>
    <div><div class="kicker">By powertrain</div><table class="sum">${Object.entries(pt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join('')}</table></div>
  </div>
</section>

${groups.map((g, gi) => `
<section class="page opener" style="--c:${g.color}">
  <div class="band"></div>
  <div class="kicker">Commodity ${gi + 1} of ${groups.length}</div>
  <h2>${esc(g.label)}<span class="marker"> §§C:${esc(g.key)}§§</span></h2>
  <div class="blurb">${esc(g.blurb)} ${g.ideas.length} ideas.</div>
  <table class="sum"><thead><tr><th>System</th><th class="n">Ideas</th><th class="n">Assembly</th><th class="n">Subassembly</th><th class="n">Part</th><th class="n">System / other</th></tr></thead><tbody>
  ${Object.entries(counts(g.ideas, x => x.system)).sort((a, b) => b[1] - a[1]).map(([s, n]) => { const l = counts(g.ideas.filter(x => x.system === s), x => levelOf(x) || '-'); const other = n - (l.assembly || 0) - (l.subassembly || 0) - (l.part || 0); return `<tr><td>${esc(s)}</td><td class="n">${n}</td><td class="n">${l.assembly || ''}</td><td class="n">${l.subassembly || ''}</td><td class="n">${l.part || ''}</td><td class="n">${other || ''}</td></tr>`; }).join('')}
  </tbody></table>
</section>
<section class="page">${g.ideas.map(x => ideaCard(x, g)).join('\n')}</section>`).join('\n')}

<section>
  <div class="kicker">Index</div><h2>Index of ideas<span class="marker" style="font-size:1pt;color:#fff"> §§INDEX§§</span></h2>
  <div class="idx">${groups.map(g => `<h4><span class="sw" style="background:${g.color}"></span>${esc(g.label)}</h4>${g.ideas.map(x => `<div class="r"><span class="t">${esc(x.title)}</span><span class="p">${pages?.['i:' + x.id] ?? '·'}</span></div>`).join('')}`).join('')}</div>
</section>
</body></html>`;
}

// ── 4. Render (two passes) ───────────────────────────────────────────────────
async function render(browser, htmlText, file) {
  const tmpHtml = file.replace(/\.pdf$/, '.html');
  writeFileSync(tmpHtml, htmlText);
  const page = await browser.newPage();
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'load', timeout: 0 });
  await page.evaluate(() => document.fonts.ready);
  const stamp = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  await page.pdf({
    path: file, format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: 0,
    displayHeaderFooter: true,
    headerTemplate: `<div style="width:100%;font-family:Helvetica,Arial;font-size:7px;color:#8a94a3;padding:0 16mm;display:flex;justify-content:space-between"><span>BrainSpark · Idea Marketplace Library Report</span><span>${stamp}</span></div>`,
    footerTemplate: `<div style="width:100%;font-family:Helvetica,Arial;font-size:7px;color:#8a94a3;padding:0 16mm;display:flex;justify-content:space-between"><span>Estimates — savings are not additive across ideas</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  });
  await page.close();
}

function locate(pdf, groups) {
  const pages = execFileSync('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { maxBuffer: 1 << 30 }).toString('utf8').split('\f');
  const out = {};
  const find = (needle) => { const i = pages.findIndex(p => p.includes(needle)); return i >= 0 ? i + 1 : null; };
  out.read = find('§§READ§§'); out.summary = find('§§SUMMARY§§'); out.index = find('§§INDEX§§');
  for (const g of groups) out['c:' + g.key] = find(`§§C:${g.key}§§`);
  // Idea refs: scan pages once, in order.
  const want = new Set(groups.flatMap(g => g.ideas.map(x => x.id)));
  pages.forEach((p, i) => { for (const m of p.matchAll(/REF\s+([a-z0-9-]+)/gi)) { const id = m[1].toLowerCase(); if (want.has(id) && !out['i:' + id]) out['i:' + id] = i + 1; } });
  return { pages: out, count: pages.length - (pages.at(-1).trim() ? 0 : 1) };
}

const ideas = await loadIdeas();
const groups = group(ideas);
console.log(`ideas ${ideas.length} in ${groups.length} commodities: ${groups.map(g => `${g.key} ${g.ideas.length}`).join(', ')}`);
mkdirSync(dirname(OUT), { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const pass1 = OUT.replace(/\.pdf$/, '.pass1.pdf');
  await render(browser, html({ groups, total: ideas.length, pages: null }), pass1);
  const { pages, count } = locate(pass1, groups);
  const missing = groups.flatMap(g => g.ideas).filter(x => !pages['i:' + x.id]).length;
  console.log(`pass 1: ${count} pages; ${missing} ideas not located`);
  await render(browser, html({ groups, total: ideas.length, pages }), OUT);
  const check = locate(OUT, groups);
  const moved = Object.keys(pages).filter(k => pages[k] !== check.pages[k]).length;
  console.log(`pass 2: ${check.count} pages → ${OUT}${moved ? ` (${moved} anchors moved between passes)` : ''}`);
  // Keep only the final PDF.
  for (const f of [pass1, pass1.replace(/\.pdf$/, '.html'), OUT.replace(/\.pdf$/, '.html')]) { try { (await import('node:fs')).unlinkSync(f); } catch { /* already gone */ } }
} finally { await browser.close(); }
