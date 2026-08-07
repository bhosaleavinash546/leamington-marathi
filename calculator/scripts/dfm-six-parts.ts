/**
 * The acceptance test for geometric DFM: the six real parts.
 *
 * `docs/cad-to-cost-learnings.md` documents six parts with INDEPENDENT manual
 * bottom-up costs. They are the only parts in this repo whose right answer is
 * known from outside the tool, which makes them the only honest place to ask
 * whether the new rule packs say anything a manufacturing engineer would agree
 * with.
 *
 * This produces a REVIEW SHEET, not a score. Each finding gets a blank column
 * for the manufacturing head to mark TRUE / FALSE / MISSED. A rule survives on
 * his mark, not on my test suite — a false positive costs more trust than a
 * missed finding, so the count that matters is the FALSE column.
 *
 *   npx tsx scripts/dfm-six-parts.ts
 */
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';
import { analyseGeometricDFM, GEOMETRIC_DFM_COMMODITIES } from '../src/engine/dfm-geometry/index.js';
import { REVIEW_PARTS as PARTS } from './dfm-review-parts.js';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const TIMEOUT_MS = Number(process.env.CV_DFM_TIMEOUT_MS ?? 600_000);

async function main() {
  const rows: string[] = [];
  const summary: Array<{ part: string; commodity: string; pack: boolean;
    features: number; findings: number; instances: number; cost: number; limitations: number; ms: number; note: string }> = [];

  rows.push('# Geometric DFM — review sheet, six real parts');
  rows.push('');
  rows.push('Every finding below was produced by measuring the CAD file, with no costing result');
  rows.push('and no AI involved. Each names the B-rep faces that triggered it and cites the');
  rows.push('published source of its threshold.');
  rows.push('');
  rows.push('**Please mark each finding T (true — real and worth raising), F (false — wrong or');
  rows.push('not a real issue), or N (noise — true but not worth an engineer\'s time).**');
  rows.push('');
  rows.push('A false positive costs more trust than a missed finding, so any rule that collects');
  rows.push('an F is a candidate for deletion rather than tuning. Please also note anything the');
  rows.push('tool should have caught and did not — that is the MISSED list at the end of each part.');
  rows.push('');

  for (const p of PARTS) {
    const path = p.file;
    const t0 = Date.now();
    process.stdout.write(`[dfm] ${p.name} (${p.commodity}) … `);

    let geo;
    try {
      geo = await analyzeGeometry(await readFile(path), basename(path), TIMEOUT_MS,
                                  { CV_EXTRACT_FEATURES: '1' });
    } catch (e) {
      console.log(`FILE ERROR: ${(e as Error).message}`);
      summary.push({ part: p.name, commodity: p.commodity, pack: false, features: 0,
        findings: 0, instances: 0, cost: 0, limitations: 0, ms: Date.now() - t0, note: 'file unreadable' });
      continue;
    }
    const ms = Date.now() - t0;

    if (geo.status !== 'success') {
      console.log(`KERNEL ERROR (${(ms / 1000).toFixed(0)}s): ${geo.error}`);
      summary.push({ part: p.name, commodity: p.commodity, pack: false, features: 0,
        findings: 0, instances: 0, cost: 0, limitations: 0, ms, note: `kernel: ${geo.error}`.slice(0, 60) });
      rows.push(`## ${p.name} — kernel error`, '', `\`${geo.error}\``, '');
      continue;
    }

    const mf = geo.manufacturingFeatures;
    const r = analyseGeometricDFM({
      commodity: p.commodity,
      featureSet: mf ?? { available: false, features: [], note: 'no feature set emitted' },
      bboxMm: geo.boundingBox
        ? { x: geo.boundingBox.xMm, y: geo.boundingBox.yMm, z: geo.boundingBox.zMm } : undefined,
      medianWallMm: mf?.medianThicknessMm ?? geo.wallThickness?.meanMm ?? null,
      materialFamily: p.materialFamily,
      process: p.process,
      // Reference rates so the sheet shows money. A real run resolves these
      // from the regional library; these are the library's UK defaults.
      cost: { annualVolume: 50_000, machineRatePerHr: 60, labourRatePerHr: 25 },
    });

    console.log(`${(ms / 1000).toFixed(0)}s · ${mf?.features.length ?? 0} features · `
      + `${r.grouped.length} issues (${r.findings.length} instances) · pack=${r.packAvailable}`);

    summary.push({
      part: p.name, commodity: p.commodity, pack: r.packAvailable,
      features: mf?.features.length ?? 0, findings: r.grouped.length, instances: r.findings.length,
      cost: r.totalAddressableGBP ?? 0,
      limitations: r.limitations.length, ms,
      note: mf?.note?.slice(0, 60) ?? '',
    });

    // ── Review sheet block ────────────────────────────────────────────────
    rows.push(`## ${p.name}`);
    rows.push('');
    rows.push(`| | |`);
    rows.push(`|---|---|`);
    rows.push(`| File | \`${basename(p.file)}\` |`);
    rows.push(`| True commodity | ${p.commodity}${p.process ? ` (${p.process})` : ''} |`);
    rows.push(`| Independent manual cost | ${p.manualCost} |`);
    rows.push(`| Bounding box | ${geo.boundingBox
      ? `${geo.boundingBox.xMm.toFixed(0)} × ${geo.boundingBox.yMm.toFixed(0)} × ${geo.boundingBox.zMm.toFixed(0)} mm` : '—'} |`);
    rows.push(`| Faces measured | ${mf?.faceCount ?? '—'} |`);
    rows.push(`| Features extracted | ${mf?.features.length ?? 0} |`);
    rows.push(`| Wall analysis valid | ${mf?.wallAnalysisValid === true ? 'yes'
      : mf?.wallAnalysisValid === false ? `no — ${mf.note ?? ''}` : 'unknown'} |`);
    rows.push(`| Kernel time | ${(ms / 1000).toFixed(0)} s |`);
    rows.push('');

    if (!r.packAvailable) {
      rows.push(`> **No geometric rule pack for \`${p.commodity}\`.** No geometry-based checks ran.`);
      rows.push('> This is stated rather than silently returning zero findings.');
      rows.push('');
      continue;
    }

    if (r.findings.length === 0) {
      rows.push('_No rule in the pack fired. Read this with the limitations below — it means the');
      rows.push('checks that RAN found nothing, not that the part is clean._');
      rows.push('');
    } else {
      // Grouped: one row per RULE. Sixty faces at zero draft is ONE issue with
      // sixty instances, not sixty issues — reviewing it as sixty rows is how a
      // DFM tool gets dismissed as noise.
      rows.push('| # | Sev | £/part | Issue | Instances | Measured range | Threshold | Source | T/F/N |');
      rows.push('|---|---|---|---|---|---|---|---|---|---|');
      r.grouped.forEach((g, i) => {
        const range = g.count === 1
          ? `${g.range.min}${g.range.unit}`
          : `${g.range.min} … ${g.range.max}${g.range.unit}`;
        const money = (g.totalCostGBP ?? 0) > 0 ? `**£${g.totalCostGBP.toFixed(2)}**` : '—';
        rows.push(`| ${i + 1} | ${g.severity} | ${money} | ${g.title} | ${g.count} `
          + `| ${g.worst.measured.field} ${range} `
          + `| ${g.threshold.comparator} ${g.threshold.value}${g.threshold.unit} `
          + `| ${esc(g.source.standard.slice(0, 55))} |   |`);
      });
      rows.push('');
      r.grouped.forEach((g, i) => {
        rows.push(`**${i + 1}. ${g.title}** — ${g.count} instance(s)`
          + ((g.totalCostGBP ?? 0) > 0 ? ` — **£${g.totalCostGBP.toFixed(2)}/part**` : ''));
        rows.push('');
        const inst = g.instances?.[0];
        if (inst?.costImpact) rows.push(`- Cost basis: ${esc(inst.costImpact.basis)}`);
        else if (inst?.costNotModelled) rows.push(`- Not priced: ${esc(inst.costNotModelled)}`);
        rows.push(`- Worst case: ${esc(g.worst.detail)}`);
        const shown = g.faceIds.slice(0, 24).join(', ');
        rows.push(`- Faces: ${shown}${g.faceIds.length > 24 ? ` … (${g.faceIds.length} total)` : ''}`);
        rows.push(`- Fix: ${esc(g.recommendation)}`);
        rows.push(`- Source: ${esc(g.source.standard)}${g.source.clause ? ` — ${esc(g.source.clause)}` : ''}`);
        if (g.source.note) rows.push(`- Note: ${esc(g.source.note)}`);
        rows.push('');
      });
    }

    if (r.dfa.available) {
      rows.push(`**DFA (Boothroyd, geometric half):** handling ${r.dfa.handlingTimeSec}s + `
        + `insertion ${r.dfa.insertionTimeSec}s = **${r.dfa.totalTimeSec}s**, `
        + `${r.dfa.vsIdealRatio}× the 3 s ideal part.`);
      rows.push('');
      for (const pen of r.dfa.penalties) rows.push(`- +${pen.addedSec}s — ${pen.reason} _(${esc(pen.measured)})_`);
      rows.push('');
    }

    rows.push('**What was NOT checked:**');
    rows.push('');
    for (const l of r.limitations) rows.push(`- ${esc(l)}`);
    rows.push('');
    rows.push('**MISSED — what should this have caught and did not?**');
    rows.push('');
    rows.push('1. ');
    rows.push('2. ');
    rows.push('3. ');
    rows.push('');
  }

  // ── Summary table, first so it reads top-down ───────────────────────────
  const head: string[] = [];
  head.push('## Summary', '');
  head.push('| Part | Commodity | Pack? | Features | Issues | Instances | £/part | Not-checked | Kernel |');
  head.push('|---|---|---|---|---|---|---|---|---|');
  for (const s of summary) {
    head.push(`| ${s.part} | ${s.commodity} | ${s.pack ? 'yes' : '**no**'} | ${s.features} `
      + `| ${s.findings} | ${s.instances} | ${s.cost > 0 ? '£' + s.cost.toFixed(2) : '—'} `
      + `| ${s.limitations} | ${(s.ms / 1000).toFixed(0)}s |`);
  }
  head.push('');
  const noPack = summary.filter(s => !s.pack).map(s => s.commodity);
  if (noPack.length) {
    head.push(`> **${noPack.length} of ${summary.length} parts have no geometric pack** `
      + `(${[...new Set(noPack)].join(', ')}). Those commodities are not covered yet, and the `
      + 'tool says so rather than returning an empty clean bill.');
    head.push('');
  }

  const out = [rows[0], '', ...rows.slice(1, 12), ...head, ...rows.slice(12)].join('\n');
  await writeFile('/tmp/dfm-six-parts-review.md', out);
  console.log('\nreview sheet → /tmp/dfm-six-parts-review.md');
  console.table(summary.map(s => ({ part: s.part, pack: s.pack, feat: s.features,
    find: s.findings, sec: Math.round(s.ms / 1000) })));
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

main().catch(e => { console.error(e); process.exit(1); });
