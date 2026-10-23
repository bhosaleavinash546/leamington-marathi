/**
 * Software should-cost PDF report — the 360° report (plan docs/plans/sw-report-360-plan-2026-10-14.md, Oct 2026).
 *
 * Draws a REPORT MODEL (src/engine/sw-report-model.ts) top-down: vehicle → E/E architecture (the vehicle skeleton with
 * every component carrying software, numbered) → how the cost is built (the seven-step storyboard) → cost build-up →
 * one spread per domain → every module, line by line, with its arithmetic → lifecycle, spend, rates, hubs, risk,
 * evidence, make or buy, scope. Focused profiles (executive, domain, module, supplier, hubs) print the model's sections.
 *
 * Nothing is computed here: every figure is the model's (the engine's result or the engine re-run). Pictures arrive as
 * PNGs rasterised from src/export/sw-report-skeleton.ts (a browser canvas on screen, headless Chromium in scripts); a
 * missing picture prints a labelled placeholder. Brand light theme (src/brand/brand.json); chart colours validated for
 * colour-vision deficiency, every series also named in text.
 */
import type { jsPDF } from 'jspdf';
import { swRateBasis, SW_DEV_SOURCE_LABEL, SW_MC_RANGE_BY_GRADE, SW_CLOUD_BASIS, SW_SERVICE_BASIS, type SWEvidenceGrade } from '../engine/sw-should-cost.js';
import { SW_REPORT_PROFILES, type SWReportModel, type SWReportModule, type SWReportDomain, type SWReportSectionId } from '../engine/sw-report-model.js';
import { SKELETON_W, SKELETON_H, SKELETON_H_NO_LEGEND } from './sw-report-skeleton.js';
import type { RasterImage } from './svg-raster.js';
import { localiseReportText } from './money-text.js';
import { hardenPdfText } from './pdf.js';
import { SW_DEV_SOURCE_PHRASE } from '../engine/sw-report-model.js';

export { swAssumptionRows, swYourFigures, swExcludedModules } from '../engine/sw-report-model.js';
export { SW_CATALOGUE_GAPS } from '../engine/sw-cockpit.js';

type AutoTable = (doc: jsPDF, opts: Record<string, unknown>) => void;
type RGB = [number, number, number];
type Cell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };

// ── Brand (src/brand/brand.json, light) ─────────────────────────────────────────────────────────────────────────────
const NAVY: RGB = [22, 50, 92], BLUE: RGB = [29, 111, 184], SLATE: RGB = [58, 67, 86], MUTED: RGB = [104, 111, 125];
const LINE: RGB = [220, 227, 238], PAGE: RGB = [244, 247, 251], BLUE_TINT: RGB = [232, 241, 250], WHITE: RGB = [255, 255, 255];
const TEAL: RGB = [13, 125, 113], GREEN: RGB = [42, 127, 80], AMBER: RGB = [153, 101, 26], RED: RGB = [176, 58, 46];
/** Two series — engineering (NRE) and lifecycle: brand blue and amber (validated: CVD ΔE 22.5, normal 24.6). */
const NRE_C: RGB = BLUE, LIFE_C: RGB = AMBER;
/** Five series (spend by year): blue, orange, violet, teal, red — validated in this order (worst CVD ΔE 14.0). */
const SERIES: RGB[] = [[29, 111, 184], [217, 130, 43], [107, 63, 160], [42, 157, 143], [176, 58, 46]];
const GRADE_C: Record<SWEvidenceGrade, RGB> = { entered: TEAL, calibrated: BLUE, sourced: GREEN, estimate: AMBER, unsourced: RED };
const W = 210, H = 297, MG = 16, TOP = 22, BOTTOM = 277, CW = W - 2 * MG;

const GRADE_SHORT: Record<string, string> = { entered: 'Yours', calibrated: 'Calibrated', sourced: 'Sourced', estimate: 'Estimate', unsourced: 'Unsourced' };
const GRADE_NAME: Record<string, string> = { entered: 'Your figure', calibrated: 'Calibrated', sourced: 'Published source', estimate: 'Labelled estimate', unsourced: 'Unsourced catalogue' };
export const gradeName = (g: string): string => GRADE_NAME[g] ?? g;

export { hubMedianNote } from './sw-report-request.js';

/**
 * Draw the report. `images` holds the skeleton PNGs by key (reportImageSpecs); any missing one prints a placeholder.
 */
export function renderSWReportPdf(doc: jsPDF, autoTable: AutoTable, model: SWReportModel, images: Map<string, RasterImage> = new Map()): void {
  const md = model, req = md.request, r = md.result, s = r.summary, p = r.inputs, f = req.fmt;
  // In a non-£ report every £ in TEXT (rule bases, rate sources, notes) is converted at the report's FX (review H6), through
  // hardenPdfText so drawing, wrapping AND width measurement all see the same converted text (autoTable sizes columns with
  // getTextWidth). The doc is the report's own: the patch stays on it.
  if (req.currency.sym !== '£' || req.currency.perGbp !== 1) hardenPdfText(doc, { fx: req.currency.perGbp, sym: req.currency.sym, localise: localiseReportText });
  const M = f.moneyM, money = f.money, num = f.number;
  const share = (x: number, of: number) => `${of > 0 ? (x / of * 100).toFixed(1) : '0.0'} %`;
  const kUnit = `${req.currency.sym}k`;
  const K = (gbp: number) => Math.round(gbp * req.currency.perGbp / 1000).toLocaleString('en-GB');
  const toc: Array<[string, number, number]> = [];
  let y = TOP;

  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const page = () => (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  const newPage = () => { doc.addPage(); y = TOP; };
  const ensure = (need: number) => { if (y + need > BOTTOM) newPage(); };
  const font = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', c: RGB = SLATE) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...c); };
  const lines = (text: string, width: number) => doc.splitTextToSize(text, width) as string[];
  const para = (text: string, size = 8.5, c: RGB = SLATE, gap = 2.5, x = MG, width = CW) => {
    font(size, 'normal', c);
    const lh = size * 0.42;
    for (const line of lines(text, width)) { ensure(lh + 1); doc.text(line, x, y); y += lh; }
    y += gap;
  };
  const bullets = (items: string[], size = 8.5) => {
    font(size, 'normal', SLATE);
    const lh = size * 0.42;
    for (const it of items) {
      const ls = lines(it, CW - 5);
      ensure(lh * ls.length + 1);
      doc.setFillColor(...BLUE); doc.circle(MG + 1.2, y - 1.1, 0.75, 'F');
      ls.forEach((l, i) => doc.text(l, MG + 5, y + i * lh));
      y += lh * ls.length + 1.4;
    }
    y += 1.5;
  };
  const section = (id: SWReportSectionId, title?: string, lead?: string) => {
    const sec = md.sections.find(x => x.id === id);
    const no = sec?.no ?? 0, t = title ?? sec?.title ?? '';
    if (y > TOP + 2 || page() === tocPage) newPage();
    toc.push([t, page(), no]);
    doc.setFillColor(...NAVY); doc.roundedRect(MG, y - 6, 10, 9, 1.6, 1.6, 'F');
    font(11, 'bold', WHITE); doc.text(String(no), MG + 5, y + 0.2, { align: 'center' });
    font(16, 'bold', NAVY); doc.text(t, MG + 14, y + 0.5); y += 7;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(MG, y, W - MG, y); y += 6;
    if (lead) para(lead, 9, MUTED, 3);
  };
  const sub = (title: string, need = 16) => { ensure(need); font(10.5, 'bold', NAVY); doc.text(title, MG, y); y += 5; };
  const SMALL = { fontSize: 6.8, textColor: SLATE, cellPadding: { top: 1.3, bottom: 1.3, left: 1.6, right: 1.6 }, lineColor: LINE, lineWidth: { bottom: 0.1 } };
  const table = (head: string[] | null, body: Cell[][], cols: Record<number, Record<string, unknown>> = {}, opts: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: y, head: head ? [head] : undefined, body, theme: 'plain', showHead: head ? 'everyPage' : 'never',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.4, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 } },
      bodyStyles: { fontSize: 7.4, textColor: SLATE, cellPadding: { top: 1.7, bottom: 1.7, left: 2, right: 2 }, lineColor: LINE, lineWidth: { bottom: 0.1 } },
      alternateRowStyles: { fillColor: PAGE },
      columnStyles: cols, margin: { left: MG, right: MG, top: TOP, bottom: H - BOTTOM }, ...opts,
    });
    y = finalY() + 5;
  };
  const strong = (t: string): Cell => ({ content: t, styles: { fontStyle: 'bold', textColor: NAVY } });
  const band = (t: string, n: number): Cell[] => [{ content: t, colSpan: n, styles: { fontStyle: 'bold', textColor: NAVY, fillColor: BLUE_TINT } }];
  const gradeCell = (g?: string, short = false): Cell => (g ? { content: short ? (GRADE_SHORT[g] ?? g) : gradeName(g), styles: { textColor: GRADE_C[g as SWEvidenceGrade] ?? SLATE, fontStyle: 'bold' } } : '');
  const R = { halign: 'right' };

  /** A skeleton picture at width `w` (mm); a placeholder when it was not rendered. */
  const picture = (key: string, w = CW, x = MG, legend = true): number => {
    const ih = legend ? SKELETON_H : SKELETON_H_NO_LEGEND;
    const h = w * ih / SKELETON_W;
    const img = images.get(key);
    if (img) doc.addImage(img.dataUrl, 'PNG', x, y, w, h, `sk-${key}`, 'FAST');
    else {
      doc.setDrawColor(...LINE); doc.setFillColor(...PAGE); doc.roundedRect(x, y, w, h, 2, 2, 'FD');
      font(8, 'italic', MUTED); doc.text('Vehicle skeleton picture not rendered in this export.', x + w / 2, y + h / 2, { align: 'center' });
    }
    return h;
  };
  const figure = (key: string, caption: string, w = CW, legend = true) => {
    const h = w * (legend ? SKELETON_H : SKELETON_H_NO_LEGEND) / SKELETON_W;
    ensure(h + 8);
    picture(key, w, MG + (CW - w) / 2, legend); y += h + 1.5;
    font(7.5, 'italic', MUTED); doc.text(lines(caption, CW), MG, y + 2); y += 4 + 4 * (lines(caption, CW).length - 1) + 3;
  };
  /** Horizontal bars, NRE + lifecycle stacked; value at the end. */
  const bars = (rows: Array<{ label: string; a: number; b?: number; note?: string; bold?: boolean }>, max: number, labelW = 56) => {
    const barW = CW - labelW - 24, rowH = 5.4;
    for (const row of rows) {
      ensure(rowH + 1);
      font(7.4, row.bold ? 'bold' : 'normal', row.bold ? NAVY : SLATE);
      const lab = lines(row.label, labelW - 2)[0];
      doc.text(lab + (lines(row.label, labelW - 2).length > 1 ? '…' : ''), MG, y + 3);
      const x0 = MG + labelW;
      const wa = max > 0 ? barW * row.a / max : 0, wb = max > 0 && row.b ? barW * row.b / max : 0;
      doc.setFillColor(...NRE_C); doc.rect(x0, y + 0.6, Math.max(0.3, wa), 3.4, 'F');
      if (wb) { doc.setFillColor(...LIFE_C); doc.rect(x0 + wa + 0.4, y + 0.6, wb, 3.4, 'F'); }
      font(7.4, row.bold ? 'bold' : 'normal', NAVY);
      doc.text(row.note ?? M(row.a + (row.b ?? 0)), x0 + wa + wb + 2, y + 3);
      y += rowH;
    }
    y += 1.5;
  };
  const legend = (items: Array<[RGB, string]>) => {
    ensure(6); let x = MG;
    font(7.4, 'normal', MUTED);
    for (const [c, l] of items) { doc.setFillColor(...c); doc.rect(x, y - 2.5, 3, 3, 'F'); doc.text(l, x + 4.5, y); x += doc.getTextWidth(l) + 11; }
    y += 6;
  };
  const tiles = (items: Array<[string, string, string]>, dark = false, ty = y) => {
    const n = items.length, gap = 4, tw = (CW - (n - 1) * gap) / n;
    items.forEach(([k, v, note], i) => {
      const x = MG + i * (tw + gap);
      if (dark) doc.setFillColor(31, 62, 107); else doc.setFillColor(...PAGE);
      doc.roundedRect(x, ty, tw, 25, 2, 2, 'F');
      font(6.6, 'bold', dark ? [176, 196, 222] : MUTED); doc.text(k.toUpperCase(), x + 3.5, ty + 6);
      font(14, 'bold', dark ? WHITE : NAVY); doc.text(v, x + 3.5, ty + 14.5);
      font(6.6, 'normal', dark ? [176, 196, 222] : MUTED); doc.text(lines(note, tw - 7).slice(0, 2), x + 3.5, ty + 19.5);
    });
    if (!dark) y = ty + 31;
  };
  const ASILS = ['QM', 'A', 'B', 'C', 'D'] as const;
  const modsByDomain = (d: SWReportDomain) => d.moduleIds.map(id => md.modules.find(m => m.id === id)).filter((m): m is SWReportModule => !!m);
  const compNames = (nos: number[]) => nos.map(n => `${n} ${md.components.find(c => c.no === n)?.label ?? ''}`).join(' · ');

  // ── Cover ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const cover = () => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 112, 'F');
    font(9, 'bold', [176, 196, 222]); doc.text(`COSTVISION  ·  SOFTWARE SHOULD-COST  ·  ${SW_REPORT_PROFILES[md.profile].label.toUpperCase()}`, MG, 22);
    doc.setFillColor(...BLUE); doc.rect(MG, 26, 22, 1.2, 'F');
    font(24, 'bold', WHITE);
    const tl = lines(req.title, CW);
    tl.slice(0, 2).forEach((l, i) => doc.text(l, MG, 40 + i * 9.5));
    let cy = 40 + Math.min(2, tl.length) * 9.5;
    font(10.5, 'normal', [214, 226, 240]);
    const scopeLine = md.slice.isWhole ? `Whole-vehicle software · ${p.powertrain ?? 'drivetrain as configured'} · ${r.modules.length} modules in ${md.headline.domains} domains`
      : `${md.modules.length} of ${r.modules.length} modules · ${md.domains.map(d => d.label).join(', ')}`;
    doc.text(lines(scopeLine, CW)[0], MG, cy); cy += 6.5;
    font(9, 'normal', [176, 196, 222]);
    doc.text(`${req.hubLabel} engineering hub  ·  ${SW_DEV_SOURCE_LABEL[p.devSource]}  ·  ${p.annualProductionVolume.toLocaleString('en-GB')} vehicles a year × ${p.programLifeYears} years`, MG, cy); cy += 5;
    const meta = req.meta ?? {};
    const prep = [`Prepared ${req.generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, meta.preparedBy ? `by ${meta.preparedBy}` : '', meta.preparedFor ? `for ${meta.preparedFor}` : '', meta.reference ? `ref. ${meta.reference}` : ''].filter(Boolean).join('  ·  ');
    doc.text(prep, MG, cy);
    const t = md.slice.isWhole
      ? [['Programme total', M(s.grandTotal), `about P${Math.round(r.monteCarlo.headlinePercentile)} of the simulated range`],
        ['Per vehicle', money(s.perVehicle, 0), `over ${md.headline.vehiclesBuilt.toLocaleString('en-GB')} vehicles built`],
        ['Engineering (NRE)', M(s.nreTotal), `${num(s.totalEffortPersonMonths, 0)} person-months`],
        ['Lifecycle', M(md.headline.lifecycle), `over ${s.horizonYears} years from SOP`]] as Array<[string, string, string]>
      : [['This report', M(md.slice.total), `${share(md.slice.total, s.grandTotal)} of the vehicle`],
        ['Engineering (NRE)', M(md.slice.nre), 'modules in this report'],
        ['Lifecycle', M(md.slice.lifecycle), 'modules in this report'],
        ['Vehicle total', M(s.grandTotal), 'the costing this is a slice of']] as Array<[string, string, string]>;
    tiles(t, true, 80);
    y = 118;
    const h = picture('cover', CW, MG, false);
    y += h + 2;
    font(7.3, 'italic', MUTED);
    doc.text(`Where the software runs: ${md.slice.components} vehicle components carry the software costed here, coloured by the highest ASIL among their modules. Schematic top view, not to scale.`, MG, y + 2, { maxWidth: CW });
    y += 12;
    font(10, 'bold', NAVY); doc.text('Read this first', MG, y); y += 5;
    bullets([
      'A deterministic should-cost model: every figure comes from the module catalogue, the hub rate book and stated constants — no AI sets a price. Every total in this report is checked against the level above.',
      `${(md.slice.unsourcedShare * 100).toFixed(1)} % of ${md.slice.isWhole ? 'the total' : 'this report\'s total'} rests on unsourced catalogue figures${md.sections.some(x => x.id === 'modules') ? ' (graded line by line in this report)' : md.sections.some(x => x.id === 'evidence') ? ' (see Evidence and sources)' : ''}. Accuracy against real programme costs has not been measured.`,
      req.facts?.length && md.sections.some(x => x.id === 'definition') ? `The vehicle facts behind the scope were checked against the manufacturer's and press pages (section ${md.sections.find(x => x.id === 'definition')!.no}). Volume and programme life are the user's inputs.`
        : req.facts?.length ? 'The vehicle facts behind the scope were checked against the manufacturer\'s and press pages (printed in the Vehicle report). Volume and programme life are the user\'s inputs.'
        : 'Volume, programme life and scope are the user\'s inputs; no checked vehicle facts were supplied.',
    ], 8.2);
  };

  // ── Contents ──────────────────────────────────────────────────────────────────────────────────────────────────────
  // Drawn at the end, once the page numbers are known.
  let tocPage = 0;

  // ── 1 Summary ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const summary = () => {
    const sl = md.slice;
    section('summary', undefined, sl.isWhole
      ? `${req.title}: ${r.modules.length} software modules, ${p.annualProductionVolume.toLocaleString('en-GB')} vehicles a year for ${p.programLifeYears} years, engineered at the ${req.hubLabel} hub ${SW_DEV_SOURCE_PHRASE[p.devSource]}.`
      : `A slice of the ${req.title} vehicle costing: ${md.modules.length} modules. Every module figure is the vehicle costing's; programme-level items stay with the vehicle.`);
    if (sl.isWhole) {
      const u = md.unit, mc = r.monteCarlo, hl = md.headline;
      table(['Figure', 'Value', 'What it covers'], [
        [strong('Programme total'), strong(M(s.grandTotal)), `all engineering and every lifecycle cost to programme year ${s.horizonYears}`],
        ['Per vehicle, all-in', money(s.perVehicle, 0), `total ÷ ${hl.vehiclesBuilt.toLocaleString('en-GB')} vehicles built`],
        ['Engineering (NRE)', M(s.nreTotal), `${share(s.nreTotal, s.grandTotal)} — development, verification, integration, cyber, calibration, tools, homologation`],
        ['Lifecycle', M(hl.lifecycle), `${share(hl.lifecycle, s.grandTotal)} — maintenance, licences and royalties, cloud`],
        ['Royalty per vehicle built', money(u.perVehicleBuilt, 2), 'paid on every vehicle, in the piece price'],
        ['Running cost per vehicle in service', u.subscriptionYears < u.serviceYears && u.subscriptionPerYear > 0 ? `${money(u.perVehicleYear, 2)} / ${money(u.cloudPerYear, 2)}` : money(u.perVehicleYear, 2),
          u.subscriptionYears < u.serviceYears && u.subscriptionPerYear > 0 ? `a year: map data + cloud in years 1–${u.subscriptionYears}, then cloud only to year ${u.serviceYears} of each vehicle` : `a year: map data (${u.subscriptionYears} yr) + cloud (${u.serviceYears} yr)`],
        ['Simulated range', `${M(mc.p10)} – ${M(mc.p90)}`, `P10–P90; P50 ${M(mc.p50)}; the headline sits at about P${Math.round(mc.headlinePercentile)}`],
        ...(hl.hubMin && hl.hubMax ? [['Hub range (same scope)', `${M(hl.hubMin.total)} – ${M(hl.hubMax.total)}`, `${hl.hubMin.label} to ${hl.hubMax.label}`] as Cell[]] : []),
      ], { 0: { cellWidth: 46 }, 1: { cellWidth: 34, halign: 'right' } });
    } else {
      table(['Figure', 'This report', 'Vehicle'], [
        [strong('Total'), strong(M(sl.total)), M(s.grandTotal)],
        ['Engineering (NRE)', M(sl.nre), M(s.nreTotal)],
        ['Lifecycle', M(sl.lifecycle), M(md.headline.lifecycle)],
        ['Share of the vehicle', share(sl.total, s.grandTotal), '100 %'],
        ['Modules', String(md.modules.length), String(r.modules.length)],
      ], { 1: { ...R, cellWidth: 36 }, 2: { ...R, cellWidth: 36 } });
    }
    sub('What the figures say');
    bullets(md.findings);
    if (md.domains.length > 1) {
      sub(md.slice.isWhole ? 'By software domain' : 'Domains in this report');
      bars(md.domains.map(d => ({ label: d.label, a: d.nre, b: d.lifecycle })), Math.max(...md.domains.map(d => d.total)));
      legend([[NRE_C, 'Engineering (NRE)'], [LIFE_C, 'Lifecycle']]);
    }
    if (md.programmeItems.length && !md.slice.isWhole) {
      sub('Programme-level items (not in this slice)');
      table(['Item', 'Vehicle £', 'Rule'], md.programmeItems.map(x => [x.label, M(x.amount), x.rule]), { 1: { ...R, cellWidth: 24 }, 2: { cellWidth: 100 } });
    }
  };

  // ── 2 Definition ──────────────────────────────────────────────────────────────────────────────────────────────────
  const definition = () => {
    section('definition', undefined, 'Every input the costing used, the user\'s metadata as typed, and the vehicle facts the scope rests on.');
    table(['Item', 'Value'], md.definition.map(([k, v]) => [k, v]), { 0: { cellWidth: 54, fontStyle: 'bold', textColor: NAVY } });
    sub('Programme inputs');
    table(['Input', 'Value', 'Basis'], [
      ['Senior engineer share', `${Math.round(p.teamSeniorFraction * 100)} %`, 'blends the hub\'s mid and senior rates'],
      ['Engineering burden', p.burden ? `employment +${p.burden.employmentPct} %, company +${p.burden.companyPct} %, capital +${p.burden.capitalPct} %` : `× ${p.overheadMultiplier}`, 'section on rates'],
      ['Reuse', [...new Set(p.modules.filter(m => m.enabled).map(m => m.reuse))].join(', '), 'per module; Medium = × 0.60 (unsourced)'],
      ['Security support after the last build', `${md.postSupportYears} years`, 'UN R155 post-production duty; share assumed'],
      ['Homologation', (p.includeHomologation ?? true) ? 'included' : 'excluded', 'R155 / R156 / ISO 26262'],
      ['Effort calibration', p.effortCalibration && p.effortCalibration !== 1 ? `× ${p.effortCalibration}` : 'none (uncalibrated)', 'your logged actuals'],
    ], { 0: { cellWidth: 52 }, 1: { cellWidth: 56 } });
    if (req.vehicleDesc) { sub(req.facts?.length ? 'The vehicle' : 'The vehicle (demo description — not checked against sources)'); para(req.vehicleDesc, 8.5); }
    if (req.facts?.length) {
      sub('Product facts the scope rests on (each checked on the page given)');
      table(['Fact', 'Checked on'], req.facts.map(([a, b]) => [a, b]), { 0: { cellWidth: 80 }, 1: { cellWidth: 98, fontSize: 6.3, textColor: MUTED } });
    }
  };

  // ── 3 Architecture ────────────────────────────────────────────────────────────────────────────────────────────────
  const architecture = () => {
    section('architecture', undefined, `The vehicle's electrical / electronic architecture as the costing sees it: ${md.components.length} components carry the software in scope. Each is numbered; the table lists what runs on it. A module running on several components counts at each — the picture never splits money by component. The picture is a generic zonal E/E template placed by vehicle zone, not this vehicle's own architecture.`);
    figure('architecture', md.profile === 'executive' ? 'Coloured by the highest ASIL among the modules on each component. The full component table is in the Vehicle report.' : 'Coloured by the highest ASIL among the modules on each component. Numbers refer to the table below.');
    if (md.profile === 'executive') return;
    table(['No.', 'Component', 'Highest ASIL', 'Modules running on it', 'What it is'], md.components.map(c => [
      strong(String(c.no)), c.label, c.offVehicle ? '— (off-vehicle)' : c.highestAsil === 'QM' ? 'QM' : `ASIL ${c.highestAsil}`, `${c.modules.length}: ${c.modules.join(', ')}`, c.what]),
      { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 36 }, 2: { cellWidth: 17 }, 3: { cellWidth: 70, fontSize: 6.3 }, 4: { cellWidth: 46, fontSize: 6.3, textColor: MUTED } },
      { bodyStyles: SMALL });
    if (md.profile === 'vehicle') figure('architecture-count', 'The same components coloured by the number of software modules running on each — where integration and verification concentrate.');
  };

  // ── 4 Steps ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const steps = () => {
    section('steps', undefined, 'The seven steps of the costing, frozen from the tool\'s animation: each picture lights the parts its step concerns.');
    const colW = (CW - 6) / 2, ph = colW * SKELETON_H_NO_LEGEND / SKELETON_W;
    md.steps.forEach((st, i) => {
      const col = i % 2;
      if (col === 0) ensure(ph + 26);
      const x = MG + col * (colW + 6), y0 = y;
      doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.roundedRect(x, y0, colW, ph + 23, 2, 2, 'S');
      doc.setFillColor(...NAVY); doc.circle(x + 5, y0 + 5, 3, 'F'); font(8, 'bold', WHITE); doc.text(String(i + 1), x + 5, y0 + 6.1, { align: 'center' });
      font(9, 'bold', NAVY); doc.text(st.title, x + 10, y0 + 6.2);
      font(9, 'bold', BLUE); doc.text(st.value, x + colW - 3, y0 + 6.2, { align: 'right' });
      const yy = y; y = y0 + 9; picture(`step-${i + 1}`, colW - 4, x + 2, false); y = yy;
      font(6.6, 'normal', SLATE); doc.text(lines(st.detail, colW - 6).slice(0, 4), x + 3, y0 + 10 + ph + 2.5);
      if (col === 1 || i === md.steps.length - 1) y = y0 + ph + 27;
    });
    sub('Formulas');
    bullets([
      'Loaded rate = hub rate (mid / senior blend) × development-source price × engineering burden.',
      'Development person-months = nominal × calibration × reuse × ASIL factor; split requirements 12 %, architecture 14 %, algorithms 22 % × complexity, implementation 37 % × (1 + 0.15 × (complexity − 1)), safety 15 % (reuse floored by ASIL; the model keeps the 15 % safety bucket at QM too — a CostVision model choice).',
      'Verification, integration, cybersecurity (by the ISO/SAE 21434 CAL) and calibration are fractions of development; tools = engineer-years × the seat price.',
      'Maintenance = (development + verification + integration) × the module\'s % a year — in full for 3 years after SOP, then 50 %, then the security-support share after the last build.',
      'Royalties = vehicles × the royalty per vehicle built + vehicle-years × the subscription; cloud = connected vehicle-years × the cloud rate.',
    ], 8);
  };

  // ── 5 Build-up (waterfall) ────────────────────────────────────────────────────────────────────────────────────────
  const buildup = () => {
    section('buildup', undefined, 'From each cost element to the engineering subtotal, the lifecycle and the programme total.');
    const nre = md.buildUp.nre.filter(([, v]) => v > 0), life = md.buildUp.lifecycle.filter(([, v]) => v > 0);
    const steps: Array<{ label: string; from: number; to: number; c: RGB; total?: boolean }> = [];
    let acc = 0;
    for (const [k, v] of nre) { steps.push({ label: k, from: acc, to: acc + v, c: NRE_C }); acc += v; }
    steps.push({ label: 'Engineering (NRE)', from: 0, to: acc, c: NAVY, total: true });
    for (const [k, v] of life) { steps.push({ label: k, from: acc, to: acc + v, c: LIFE_C }); acc += v; }
    steps.push({ label: 'Programme total', from: 0, to: acc, c: NAVY, total: true });
    const labelW = 50, barW = CW - labelW - 24, rowH = 6.4, max = acc;
    ensure(steps.length * rowH + 10);
    const x0 = MG + labelW;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
    for (let g = 0; g <= 4; g++) { const gx = x0 + barW * g / 4; doc.line(gx, y - 2, gx, y + steps.length * rowH); }
    for (const st of steps) {
      font(7.6, st.total ? 'bold' : 'normal', st.total ? NAVY : SLATE); doc.text(st.label, MG, y + 3.4);
      const xa = x0 + barW * st.from / max, wb = Math.max(0.4, barW * (st.to - st.from) / max);
      doc.setFillColor(...st.c); doc.rect(xa, y + 0.8, wb, 4, 'F');
      font(7.4, st.total ? 'bold' : 'normal', NAVY); doc.text(M(st.to - st.from), xa + wb + 2, y + 3.4);
      y += rowH;
    }
    y += 2;
    legend([[NRE_C, 'Engineering element'], [LIFE_C, 'Lifecycle element'], [NAVY, 'Subtotal / total']]);
    const nreSum = nre.reduce((a, [, v]) => a + v, 0), lifeSum = life.reduce((a, [, v]) => a + v, 0);
    table(['Cost element', req.currency.sym + 'M', 'Share'], [
      ...nre.map(([k, v]) => [k, M(v), share(v, s.grandTotal)]),
      [strong('Engineering (NRE) subtotal'), strong(M(nreSum)), strong(share(nreSum, s.grandTotal))],
      ...life.map(([k, v]) => [k, M(v), share(v, s.grandTotal)]),
      [strong('Lifecycle subtotal'), strong(M(lifeSum)), strong(share(lifeSum, s.grandTotal))],
      [strong('Programme total'), strong(M(s.grandTotal)), strong('100.0 %')],
    ], { 1: { ...R, cellWidth: 34 }, 2: { ...R, cellWidth: 24 } });
    para(`Check, exact: NRE ${money(nreSum, 0)} + lifecycle ${money(lifeSum, 0)} = ${money(nreSum + lifeSum, 0)}; programme total ${money(s.grandTotal, 0)} (${Math.abs(nreSum + lifeSum - s.grandTotal) < 1 ? 'they agree' : 'DIFFERENCE — investigate'}).`, 7.8, MUTED);
  };

  // ── 6 Domains ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const domainSpread = (d: SWReportDomain, idx: number) => {
    if (y > TOP + 2) newPage();
    const secNo = md.sections.find(x => x.id === 'domains')?.no ?? 0;
    toc.push([`${secNo}.${idx + 1}  ${d.label}`, page(), -1]);
    doc.setFillColor(...BLUE_TINT); doc.roundedRect(MG, y - 6, CW, 12, 2, 2, 'F');
    font(13, 'bold', NAVY); doc.text(`${secNo}.${idx + 1}  ${d.label}`, MG + 4, y + 1.6);
    font(11, 'bold', BLUE); doc.text(M(d.total), W - MG - 4, y + 1.6, { align: 'right' });
    y += 12;
    const mods = modsByDomain(d);
    tiles([
      ['Domain total', M(d.total), `${share(d.total, s.grandTotal)} of the vehicle`],
      ['Engineering', M(d.nre), `${num(d.effortPM, 0)} person-months`],
      ['Lifecycle', M(d.lifecycle), 'maintenance, licences, royalties, cloud'],
      ['Modules', String(mods.length), `${d.components.length} components lit`],
    ]);
    figure(`domain-${d.category}`, `${d.label}: the components its modules run on, by highest ASIL. Unlit parts carry no software of this domain.`, CW * 0.86);
    sub('Modules');
    bars(mods.map(m => ({ label: m.name, a: m.result.totalNonRecurring, b: m.result.totalLifecycle })), Math.max(...mods.map(m => m.result.grandTotal)), 62);
    legend([[NRE_C, 'Engineering (NRE)'], [LIFE_C, 'Lifecycle']]);
    table(['Module', 'ASIL', 'Complexity', 'Reuse', 'CAL', 'PM', 'NRE', 'Lifecycle', 'Total', 'Of domain'], [
      ...mods.map(m => [m.name + (m.custom ? ' (your module)' : ''), m.result.asilUsed, m.result.complexityUsed, m.result.reuseUsed, m.result.calUsed === 'none' ? '—' : m.result.calUsed,
        num(m.result.effortPersonMonths, 0), M(m.result.totalNonRecurring), M(m.result.totalLifecycle), M(m.result.grandTotal), share(m.result.grandTotal, d.total)]),
      [strong('Domain'), '', '', '', '', strong(num(d.effortPM, 0)), strong(M(d.nre)), strong(M(d.lifecycle)), strong(M(d.total)), strong('100.0 %')],
    ], { 0: { cellWidth: 49 }, 1: { cellWidth: 10 }, 2: { cellWidth: 20 }, 3: { cellWidth: 14 }, 4: { cellWidth: 11 }, 5: { ...R, cellWidth: 11 },
      6: { ...R, cellWidth: 16 }, 7: { ...R, cellWidth: 16 }, 8: { ...R, cellWidth: 15 }, 9: { ...R, cellWidth: 16 } }, { bodyStyles: SMALL, headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.8, cellPadding: 1.6 } });
    sub('What drives it', 12);
    const asil = ASILS.filter(a => d.asilMix[a]).map(a => `${d.asilMix[a]} × ${a === 'QM' ? 'QM' : 'ASIL ' + a}`).join(', ');
    const reuse = Object.entries(d.reuseMix).map(([k, v]) => `${v} × ${k}`).join(', ');
    bullets([
      `Largest: ${d.largest.map(x => `${x.name} ${M(x.total)} (${share(x.total, d.total)})`).join('; ')}.`,
      `Safety level: ${asil}. Reuse: ${reuse}.`,
      `Runs on: ${compNames(d.components)}.`,
      ...(d.excluded.length ? [`Not in scope in this domain: ${d.excluded.map(e => `${e.name} — ${e.reason}`).join('; ')}.`] : []),
    ], 7.8);
  };
  const domains = () => {
    section('domains', undefined, md.slice.isWhole
      ? `The ${md.domains.length} software domains, largest first in each table. Domain totals are module totals; programme-level items (${md.programmeItems.map(x => x.label).join('; ') || 'none'}) sit outside the domains.`
      : 'The domains in this report, each a slice of the vehicle costing.');
    if (md.profile === 'executive') {
      table(['Domain', 'Modules', 'NRE', 'Lifecycle', 'Total', 'Share'], [...md.domains.map(d => [d.label, String(d.moduleIds.length), M(d.nre), M(d.lifecycle), M(d.total), share(d.total, s.grandTotal)]),
        ...md.programmeItems.map(x => [x.label, '—', x.kind === 'cloudFixed' ? '—' : M(x.amount), x.kind === 'cloudFixed' ? M(x.amount) : '—', M(x.amount), share(x.amount, s.grandTotal)]),
        [strong('Programme total'), '', strong(M(s.nreTotal)), strong(M(md.headline.lifecycle)), strong(M(s.grandTotal)), strong('100.0 %')]] as Cell[][],
        { 1: { ...R, cellWidth: 16 }, 2: { ...R, cellWidth: 24 }, 3: { ...R, cellWidth: 24 }, 4: { ...R, cellWidth: 24 }, 5: { ...R, cellWidth: 18 } });
      return;
    }
    table(['Domain', 'Modules', 'NRE', 'Lifecycle', 'Total', 'Share of vehicle'], [
      ...md.domains.map(d => [d.label, String(d.moduleIds.length), M(d.nre), M(d.lifecycle), M(d.total), share(d.total, s.grandTotal)]),
      ...(md.slice.isWhole ? md.programmeItems.map(x => x.kind === 'cloudFixed' ? [x.label, '—', '—', M(x.amount), M(x.amount), share(x.amount, s.grandTotal)] : [x.label, '—', M(x.amount), '—', M(x.amount), share(x.amount, s.grandTotal)]) : []),
      [strong(md.slice.isWhole ? 'Programme total' : 'This report'), strong(String(md.modules.length)), strong(M(md.slice.nre)), strong(M(md.slice.lifecycle)), strong(M(md.slice.total)), strong(share(md.slice.total, s.grandTotal))],
    ], { 1: { ...R, cellWidth: 16 }, 2: { ...R, cellWidth: 24 }, 3: { ...R, cellWidth: 24 }, 4: { ...R, cellWidth: 24 }, 5: { ...R, cellWidth: 24 } });
    md.domains.forEach((d, i) => domainSpread(d, i));
  };

  // ── 7 Modules ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const moduleBlock = (m: SWReportModule) => {
    const x = m.result, c = x.chain;
    // One sheet per module: modules() starts each on its own page.
    // Header
    doc.setFillColor(...NAVY); doc.roundedRect(MG, y - 5, CW, 10, 1.6, 1.6, 'F');
    font(10, 'bold', WHITE); doc.text(lines(m.name + (m.custom ? '  (your module)' : ''), CW - 40)[0], MG + 3, y + 1.3);
    font(10, 'bold', WHITE); doc.text(M(x.grandTotal), W - MG - 3, y + 1.3, { align: 'right' });
    toc.push([`   ${m.name}`, page(), -2]);
    y += 8;
    // Picture left, facts right
    const pw = 70, ph = pw * SKELETON_H_NO_LEGEND / SKELETON_W, y0 = y;
    picture(`module-${m.id}`, pw, MG, false);
    const fx = MG + pw + 5, fw = CW - pw - 5;
    const facts: Array<[string, string]> = [
      ['Domain', m.categoryLabel], ['ASIL · complexity · reuse', `${x.asilUsed === 'QM' ? 'QM' : 'ASIL ' + x.asilUsed} · ${x.complexityUsed} · ${x.reuseUsed}`],
      ['Cyber (ISO/SAE 21434)', x.calUsed === 'none' ? 'no CAL' : x.calUsed], ['Effort', `${num(x.personMonths, 1)} PM development · ${num(x.effortPersonMonths, 1)} PM all engineering`],
      ['Engineering · lifecycle', `${M(x.totalNonRecurring)} · ${M(x.totalLifecycle)}`], ['Share of vehicle', share(x.grandTotal, s.grandTotal) + (c.share < 1 ? ` (platform share ${num(c.share, 3)})` : '')],
      ['Runs on', m.components.length ? m.components.join(', ') : '—'],
    ];
    let fy = y0 + 2.5;
    for (const [k, v] of facts) {
      font(6.8, 'bold', MUTED); doc.text(k, fx, fy);
      font(7.2, 'normal', SLATE); const vl = lines(v, fw - 38); doc.text(vl, fx + 38, fy); fy += 3.6 * vl.length + 0.6;
    }
    y = Math.max(y0 + ph, fy) + 2;
    if (m.description) { para(m.description, 7.4, MUTED, 1.5); }
    // Lines
    const fmtV = (l: SWReportModule['lines'][number]) => l.unit === 'PM' ? `${num(l.value, 1)} PM` : l.unit === 'factor' ? `× ${num(l.value, 3)}` : l.group === 'effort' ? `${money(l.value, 0)} / PM` : money(l.value, 0);
    const body: Cell[][] = [];
    const groups: Array<[string, string]> = [['effort', 'Effort and rate'], ['development', 'Development'], ['verification', 'Verification'], ['engineering', 'Other engineering'], ['lifecycle', 'Lifecycle']];
    for (const [g, title] of groups) {
      const ls = m.lines.filter(l => l.group === g);
      if (!ls.length) continue;
      body.push(band(title, 4));
      if (g === 'verification') {
        // One line: the verification total, its split in the arithmetic.
        const tot = ls[0], parts = ls.slice(1).map(l => `${l.label.replace('Software-in-the-loop', 'SIL').replace('Model-in-the-loop', 'MIL').replace('Hardware-in-the-loop', 'HIL').replace('Penetration test', 'pen test').replace('Scenario simulation', 'scenarios')} ${l.expr.replace(' of verification', '')} ${money(l.value, 0)}`);
        body.push([tot.label, `${tot.expr}; split ${parts.join(' · ')}`, { content: fmtV(tot), styles: { halign: 'right' } }, gradeCell(tot.grade, true)]);
        continue;
      }
      for (const l of ls) body.push([l.label, l.expr, { content: fmtV(l), styles: { halign: 'right' } }, gradeCell(l.grade, true)]);
      if (g === 'engineering') { const t = m.lines.find(l => l.label === 'Engineering (NRE)')!; body.push([strong(t.label), { content: t.expr, styles: { textColor: MUTED } }, { content: money(t.value, 0), styles: { halign: 'right', fontStyle: 'bold', textColor: NAVY } }, '']); }
    }
    for (const l of m.lines.filter(l => l.group === 'total' && l.label !== 'Engineering (NRE)')) body.push([strong(l.label), { content: l.expr, styles: { textColor: MUTED } }, { content: money(l.value, 0), styles: { halign: 'right', fontStyle: 'bold', textColor: NAVY } }, '']);
    table(['Line', 'Arithmetic', 'Amount', 'Evidence'], body, { 0: { cellWidth: 40 }, 1: { cellWidth: 100, fontSize: 6.2 }, 2: { cellWidth: 22 }, 3: { cellWidth: 16, fontSize: 6.2 } },
      { bodyStyles: { ...SMALL, cellPadding: { top: 1, bottom: 1, left: 1.6, right: 1.6 } } });
    // Lifecycle by year
    const yrs = m.yearlyTotal, last = yrs.reduce((a, v, i) => (v > 0.5 ? i : a), -1);
    if (last >= 0) {
      const n = last + 1, perRow = 16;
      const rows: Cell[][] = [];
      for (let i = 0; i < n; i += perRow) {
        const idx = Array.from({ length: Math.min(perRow, n - i) }, (_, k) => i + k);
        rows.push([strong('Year'), ...idx.map(k => strong(String(k + 1)))]);
        rows.push([`${kUnit}`, ...idx.map(k => K(yrs[k]))]);
      }
      ensure(14);
      font(7, 'bold', MUTED); doc.text('Lifecycle spend by programme year after SOP, nominal (maintenance + licences + royalties + cloud)', MG, y); y += 1.5;
      table(null, rows, Object.fromEntries(Array.from({ length: 17 }, (_, k) => [k, k === 0 ? { cellWidth: 10 } : { halign: 'right', cellWidth: 10.5 }])), { bodyStyles: { ...SMALL, fontSize: 6.2 }, alternateRowStyles: {} });
    }
    const notes = [m.royaltyBasis ? `Royalty basis: ${m.royaltyBasis}` : '', m.estimateBasis ? `Estimate: ${m.estimateBasis}` : '', m.quoted.length ? `Priced with your quotes: ${m.quoted.join(', ')}.` : ''].filter(Boolean);
    for (const n of notes) para(n, 6.8, MUTED, 1);
    y += 3;
  };
  const modules = () => {
    section('modules', undefined, `Every module in this report, by domain: the effort chain from the nominal person-months to the costed figure, each development, verification and engineering line with its arithmetic, and each lifecycle line with its evidence grade. ${p.discountRatePct ? `Lifecycle amounts are present values at ${p.discountRatePct} %; the yearly table is nominal.` : 'Money is nominal (no discounting).'}`);
    let first = true;
    for (const d of md.domains) {
      modsByDomain(d).forEach((m, i) => {
        if (!first) newPage();
        first = false;
        font(9, 'bold', BLUE); doc.text(`${d.label}${i ? '' : ''} · module ${i + 1} of ${d.moduleIds.length}`, MG, y); y += 7;
        moduleBlock(m);
      });
    }
  };

  // ── 8 Lifecycle & unit economics ──────────────────────────────────────────────────────────────────────────────────
  const lifecycle = () => {
    section('lifecycle', undefined, 'The figures purchasing compares, and every per-vehicle charge with the basis it was priced on.');
    const u = md.unit;
    table(['Figure', 'Value', 'Volume', 'Programme'], [
      ['Engineering, one-off (NRE)', M(u.nre), '—', M(u.nre)],
      ['Royalty per vehicle built', money(u.perVehicleBuilt, 2), `${u.vehiclesBuilt.toLocaleString('en-GB')} vehicles`, M(u.perVehicleBuilt * u.vehiclesBuilt)],
      ['Map data per vehicle-year', money(u.subscriptionPerYear, 2), `${u.subscriptionVehicleYears.toLocaleString('en-GB')} vehicle-years (${u.subscriptionYears} yr each)`, M(u.subscriptionPerYear * u.subscriptionVehicleYears)],
      ['Cloud per connected vehicle-year', money(u.cloudPerYear, 2), `${u.serviceVehicleYears.toLocaleString('en-GB')} vehicle-years (${u.serviceYears} yr each)`, M(u.cloudPerYear * u.serviceVehicleYears)],
      // The fixed £ split at the last build (review): what falls in the production years, and what is paid after it.
      ['Fixed per production year (maintenance, IP licences, platform) — average', M(md.fixedSplit.production / p.programLifeYears), `× ${p.programLifeYears} years`, M(md.fixedSplit.production)],
      ...(md.fixedSplit.afterLastBuild > 0.5 ? [[`After the last build: ${[md.fixedSplit.postSupport > 0.5 ? `security support (${md.postSupportYears} years)` : '', md.fixedSplit.platformAfter > 0.5 ? 'cloud platform while vehicles are served' : ''].filter(Boolean).join(' + ')}`,
        M(md.fixedSplit.afterLastBuild), 'service years after the last build', M(md.fixedSplit.afterLastBuild)]] : []),
      [strong('Programme total'), '', '', strong(M(u.total))],
    ], { 0: { cellWidth: 64 }, 1: { ...R, cellWidth: 26 }, 2: { cellWidth: 56 }, 3: { ...R, cellWidth: 32 } });
    const nameOf = (l: { moduleId?: string; label: string }) => r.modules.find(m => m.moduleId === l.moduleId)?.moduleName ?? l.label;
    const by = (kind: string) => md.evidenceLines.filter(l => l.kind === kind && l.amount > 0.5).sort((a, b) => b.amount - a.amount);
    const roy = by('royalties');
    if (roy.length) {
      sub('Royalties — each priced on its own basis');
      table(['Module', 'Programme', 'Evidence', 'Basis'], roy.map(l => [nameOf(l), M(l.amount), gradeCell(l.grade), l.basis]),
        { 0: { cellWidth: 40 }, 1: { ...R, cellWidth: 20 }, 2: { cellWidth: 22 }, 3: { cellWidth: 96, fontSize: 6.3 } }, { bodyStyles: SMALL });
    }
    // Two modules a row; small amounts print in full (an IP licence of £48k is not "£0.0M").
    const amt = (n: number) => (Math.abs(n) >= 1e6 ? M(n) : money(n, 0));
    const two = (ls: typeof roy) => Array.from({ length: Math.ceil(ls.length / 2) }, (_, i) => [nameOf(ls[2 * i]), amt(ls[2 * i].amount), ls[2 * i + 1] ? nameOf(ls[2 * i + 1]) : '', ls[2 * i + 1] ? amt(ls[2 * i + 1].amount) : '']);
    const ip = by('licences');
    if (ip.length) {
      sub('Embedded IP licences (a year per module, over the production years)');
      table(['Module', 'Programme', 'Module', 'Programme'], two(ip), { 0: { cellWidth: 64 }, 1: { ...R, cellWidth: 25 }, 2: { cellWidth: 64 }, 3: { ...R, cellWidth: 25 } }, { bodyStyles: SMALL });
    }
    const cl = by('cloud');
    if (cl.length) {
      sub('Cloud per module');
      table(['Module', 'Programme', 'Module', 'Programme'], two(cl), { 0: { cellWidth: 64 }, 1: { ...R, cellWidth: 25 }, 2: { cellWidth: 64 }, 3: { ...R, cellWidth: 25 } }, { bodyStyles: SMALL });
      para(`Basis (every module): ${p.quotes?.cloudPerVehicleYear ? `your quote — ${p.quotes.cloudPerVehicleYear.source}.` : SW_CLOUD_BASIS} ${SW_SERVICE_BASIS}`, 7.2, MUTED);
    }
  };

  // ── 9 Spend by year (stacked columns) ─────────────────────────────────────────────────────────────────────────────
  const spend = () => {
    section('spend', undefined, md.spend.note);
    const yrs = md.spend.years;
    const keys: Array<['engineering' | 'maintenance' | 'licences' | 'royalties' | 'cloud', string]> = [['engineering', 'Engineering'], ['maintenance', 'Maintenance'], ['licences', 'Licences'], ['royalties', 'Royalties'], ['cloud', 'Cloud']];
    // Round ticks in the REPORT currency (review: a £ step printed in € was not round), each printed with the decimals
    // its step needs ("€2.5M", "€250k").
    const fxr = req.currency.perGbp || 1, csym = req.currency.sym;
    const rawD = Math.max(...yrs.map(x => x.total)) * fxr / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rawD || 1))), stepD = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= rawD) ?? rawD;
    const [unitDiv, unitSfx] = stepD >= 1e6 ? [1e6, 'M'] : stepD >= 1e3 ? [1e3, 'k'] : [1, ''];
    const tickDp = Math.max(0, -Math.floor(Math.log10(stepD / unitDiv) + 1e-9)) + (String(stepD / unitDiv).includes('.5') ? 1 : 0);
    const tick = (vD: number) => `${csym}${(vD / unitDiv).toLocaleString('en-GB', { minimumFractionDigits: Math.min(tickDp, 2), maximumFractionDigits: Math.min(tickDp, 2) })}${unitSfx}`;
    const max = stepD * 4 / fxr, chH = 62, x0 = MG + 14, cw = (CW - 14) / yrs.length;
    ensure(chH + 22);
    const base = y + chH;
    font(6.6, 'normal', MUTED); doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
    for (let g = 0; g <= 4; g++) { const gy = base - chH * g / 4; doc.line(x0, gy, W - MG, gy); doc.text(tick(stepD * g), x0 - 1.5, gy + 1, { align: 'right' }); }
    yrs.forEach((yy, i) => {
      let top = base;
      keys.forEach(([k], j) => {
        const v = yy[k]; if (v <= 0) return;
        const h = chH * v / max;
        doc.setFillColor(...SERIES[j]); doc.rect(x0 + i * cw + cw * 0.18, top - h, cw * 0.64, Math.max(0.2, h - 0.3), 'F');
        top -= h;
      });
      font(5.6, 'normal', MUTED); doc.text(yy.label.replace('Service ', 'S').replace('Year ', 'Y').replace('Dev ', 'D'), x0 + i * cw + cw / 2, base + 3.5, { align: 'center' });
    });
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.4); const sop = x0 + md.spend.sopIndex * cw; doc.line(sop, y - 2, sop, base);
    font(6.6, 'bold', NAVY); doc.text('SOP', sop + 1, y + 1);
    y = base + 8;
    legend(keys.map(([, l], j) => [SERIES[j], l]));
    para('Axis: D = development year, Y = production year, S = service year after the last build.', 7, MUTED);
    table(['Year', 'Engineering', 'Maintenance', 'Licences', 'Royalties', 'Cloud', 'Total', 'Cumulative'],
      [...yrs.map(yy => [yy.label, M(yy.engineering), M(yy.maintenance), M(yy.licences), M(yy.royalties), M(yy.cloud), M(yy.total), M(yy.cumulative)]),
        [strong('Total'), ...(['engineering', 'maintenance', 'licences', 'royalties', 'cloud', 'total'] as const).map(k => strong(M(yrs.reduce((a, x) => a + x[k], 0)))), '']],
      Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(i => [i, R])), { bodyStyles: SMALL });
  };

  // ── 10 Rates ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const rates = () => {
    section('rates', `Engineering rate — ${req.hubLabel}`, `From salary to the loaded ${req.currency.sym} per person-month every engineering line uses.`);
    const rc = md.rateCheck, c0 = r.modules[0]?.chain;
    if (c0) {
      table(['Step', 'Value', 'How'], [
        ['Hub rate (mid / senior blend)', money(c0.engineerRate, 0) + ' / PM', p.baseRateGBP ? 'your typed rate for this hub' : `${Math.round(p.teamSeniorFraction * 100)} % senior; book ${req.bookVersion}`],
        ['× development-source price', `× ${num(c0.devSourceMult, 3)}`, SW_DEV_SOURCE_LABEL[p.devSource] + (p.devSource === 'OEM_Internal' ? '' : ' — efficiency ÷ (1 − supplier margin)')],
        ['× engineering burden', `× ${num(c0.overhead, 3)}`, p.burden ? `employment +${p.burden.employmentPct} %, company +${p.burden.companyPct} %, capital +${p.burden.capitalPct} %` : 'single overhead saved with this configuration'],
        [strong('Loaded rate'), strong(money(c0.loadedRate, 0) + ' / PM'), `${money(rc.perHour, 2)} an hour · ${money(rc.perDay, 0)} a day (152 h a month)`],
      ], { 0: { cellWidth: 52 }, 1: { ...R, cellWidth: 32 } });
    }
    bullets(rc.lines, 8);
    if (req.hubRate) {
      sub('Hub rate build-up');
      para(req.hubRate.build, 8);
      if (req.hubRate.median) para(req.hubRate.median, 8);
      para(`Rate confidence: ${req.hubRate.confidence}.`, 8, MUTED);
      table(['Figure', 'Source', 'Page'], req.hubRate.sources.map(([a, b, c]) => [a, b, c]),
        { 0: { cellWidth: 28 }, 1: { cellWidth: 82 }, 2: { cellWidth: 68, fontSize: 6, textColor: MUTED } }, { bodyStyles: SMALL });
    }
    sub('Rate basis — what these figures were priced on');
    table(null, swRateBasis(p), { 0: { cellWidth: 50, fontStyle: 'bold', textColor: NAVY }, 1: { cellWidth: 128, fontSize: 6.6 } });
  };

  // ── 11 Hubs & countries ───────────────────────────────────────────────────────────────────────────────────────────
  const hubs = () => {
    section('hubs', undefined, `The same ${r.modules.length}-module scope re-costed at each of the ${md.hubs.length} hubs in the rate book, each at its own salaries, employer on-costs and hours. Only engineering and its maintenance move with the hub.`);
    bars(md.hubs.map(h => ({ label: `${h.label}${h.selected ? '  (this report)' : ''}`, a: h.nre, b: h.lifecycle, bold: h.selected })), Math.max(...md.hubs.map(h => h.total)), 52);
    legend([[NRE_C, 'Engineering (NRE)'], [LIFE_C, 'Lifecycle']]);
    table(['Hub', 'Confidence', 'Loaded / PM', 'NRE', 'Lifecycle', 'Total', 'Per vehicle', 'v this report'], md.hubs.map(h => [
      h.selected ? strong(h.label) : h.label, h.confidence, money(h.loadedRatePerPM, 0), M(h.nre), M(h.lifecycle), h.selected ? strong(M(h.total)) : M(h.total), money(h.perVehicle, 0),
      h.selected ? '—' : `${h.deltaTotal >= 0 ? '+' : '−'}${M(Math.abs(h.deltaTotal))}`]),
      { 0: { cellWidth: 40 }, 1: { cellWidth: 18 }, 2: { ...R, cellWidth: 20 }, 3: { ...R, cellWidth: 19 }, 4: { ...R, cellWidth: 19 }, 5: { ...R, cellWidth: 19 }, 6: { ...R, cellWidth: 18 }, 7: { ...R, cellWidth: 25 } }, { bodyStyles: SMALL });
    if (md.countries.length && md.profile !== 'executive') {
      sub(`Every manufacturing country and its software hub (${md.countries.length})`);
      para('Software is costed where it is engineered. A country with its own assessed hub uses it; any other uses the nearest assessed hub, for the reason given.', 7.8, MUTED);
      const hubTotal = new Map(md.hubs.map(h => [h.hub as string, h.total]));
      table(['Country', 'Software hub', 'Programme total at that hub', 'Why this hub'], [...md.countries].sort((a, b) => a.label.localeCompare(b.label)).map(c => [c.label, c.hubLabel, M(hubTotal.get(c.hub) ?? NaN), c.basis || 'its own assessed hub']),
        { 0: { cellWidth: 34 }, 1: { cellWidth: 34 }, 2: { ...R, cellWidth: 30 }, 3: { cellWidth: 80, fontSize: 6.2 } }, { bodyStyles: SMALL });
    }
  };

  // ── 12 Risk (histogram + tornado) ─────────────────────────────────────────────────────────────────────────────────
  const risk = () => {
    const mc = r.monteCarlo;
    section('risk', md.profile === 'executive' ? 'Risk' : undefined, `${mc.iterations.toLocaleString('en-GB')} seeded trials; each costed line is drawn from a triangular range set by its evidence grade, with a 55 % programme-wide correlation. The headline adds each line's most likely value and sits at about P${Math.round(mc.headlinePercentile)} — not the median.`);
    const hist = mc.histogram;
    if (hist.length) {
      const chH = 46, x0 = MG + 4, cw = (CW - 8) / hist.length, maxC = Math.max(...hist.map(b => b.count));
      ensure(chH + 34);
      const labTop = y; y += 14;
      const base = y + chH, lo = hist[0].lo, hi = hist[hist.length - 1].hi;
      const X = (v: number) => x0 + (CW - 8) * (v - lo) / (hi - lo);
      hist.forEach((b, i) => { const h = chH * b.count / maxC; doc.setFillColor(...BLUE); doc.rect(x0 + i * cw + 0.3, base - h, cw - 0.6, h, 'F'); });
      doc.setDrawColor(...LINE); doc.line(x0, base, x0 + CW - 8, base);
      const mark = (v: number, label: string, c: RGB, row: number) => {
        const xv = X(v), ly = labTop + 1 + row * 3.3; doc.setDrawColor(...c); doc.setLineWidth(0.5); doc.line(xv, ly + 0.8, xv, base);
        font(6.6, 'bold', c); doc.text(`${label} ${M(v)}`, xv + 0.8, ly);
      };
      mark(mc.p10, 'P10', SLATE, 0); mark(mc.p50, 'P50', NAVY, 1); mark(mc.p90, 'P90', SLATE, 2); mark(s.grandTotal, 'Headline', AMBER, 3);
      font(6.4, 'normal', MUTED); doc.text(M(lo), x0, base + 3.5); doc.text(M(hi), x0 + CW - 8, base + 3.5, { align: 'right' });
      y = base + 8;
      para('Bars: the number of trials whose programme total falls in each band.', 7, MUTED);
    }
    table(['Measure', 'Programme total', 'Per vehicle'], [
      ['P10', M(mc.p10), money(mc.p10PerVehicle, 0)], [strong('P50 (median)'), strong(M(mc.p50)), strong(money(mc.p50PerVehicle, 0))], ['P90', M(mc.p90), money(mc.p90PerVehicle, 0)],
      [`Headline (about P${Math.round(mc.headlinePercentile)})`, M(s.grandTotal), money(s.perVehicle, 0)],
    ], { 1: { ...R, cellWidth: 40 }, 2: { ...R, cellWidth: 34 } });
    if (md.profile === 'executive') return;
    sub('What moves the total — one driver at a time, everything else held');
    // Rows priced per vehicle (production volume) are not programme £M: their own table, outside the tornado.
    const sens = r.sensitivity.filter(x => x.unit === '£M').sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low));
    const perVeh = r.sensitivity.filter(x => x.unit !== '£M');
    const labelW = 70, half = (CW - labelW - 4) / 2, cx = MG + labelW + half, rowH = 6;
    const span = Math.max(...sens.map(x => Math.max(Math.abs(x.low - x.base), Math.abs(x.high - x.base)))) || 1;
    ensure(sens.length * rowH + 8);
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.3); doc.line(cx, y - 1, cx, y + sens.length * rowH);
    for (const x of sens) {
      font(6.8, 'normal', SLATE); doc.text(lines(x.parameter, labelW - 2)[0], MG, y + 3.4);
      for (const [v, c] of [[x.low, BLUE], [x.high, AMBER]] as Array<[number, RGB]>) {
        const d = v - x.base, w = (half - 14) * Math.abs(d) / span;
        doc.setFillColor(...c); doc.rect(d < 0 ? cx - w : cx, y + 0.9, Math.max(0.3, w), 3.8, 'F');
        font(6.2, 'normal', NAVY); doc.text(`${d >= 0 ? '+' : '−'}${M(Math.abs(d))}`, d < 0 ? cx - w - 1 : cx + w + 1, y + 3.6, { align: d < 0 ? 'right' : 'left' });
      }
      y += rowH;
    }
    y += 2;
    legend([[BLUE, 'Low case'], [AMBER, 'High case']]);
    table(['Driver (low case vs high case)', 'Low', 'Base', 'High', 'Swing'], sens.map(x => [x.parameter, M(x.low), M(x.base), M(x.high), M(Math.abs(x.high - x.low))]),
      { 0: { cellWidth: 78 }, 1: R, 2: R, 3: R, 4: R }, { bodyStyles: SMALL });
    if (perVeh.length) {
      sub('Per vehicle — what volume does to each vehicle\'s share', 12);
      table(['Driver', 'Low case', 'Base', 'High case'], perVeh.map(x => [x.parameter, money(x.low, 0), money(x.base, 0), money(x.high, 0)]), { 0: { cellWidth: 90 }, 1: R, 2: R, 3: R }, { bodyStyles: SMALL });
    }
  };

  // ── 13 Evidence ───────────────────────────────────────────────────────────────────────────────────────────────────
  const evidence = () => {
    const short = md.profile === 'supplier' || md.profile === 'module';
    section('evidence', undefined, short ? 'How well each part of this report is supported, and the figures you entered.' : 'How well each part of the total is supported, the figures you entered, which modules to calibrate first, and every stated assumption.');
    const ev = md.evidence;
    const evLines = md.evidenceLines;
    const byG = { entered: 0, calibrated: 0, sourced: 0, estimate: 0, unsourced: 0 } as Record<SWEvidenceGrade, number>;
    for (const l of evLines) byG[l.grade] += l.amount;
    const tot = Object.values(byG).reduce((a, b) => a + b, 0);
    const gs = ['entered', 'calibrated', 'sourced', 'estimate', 'unsourced'] as const;
    // One stacked bar of the grades.
    ensure(14);
    let bx = MG;
    for (const g of gs) { const w = tot > 0 ? CW * byG[g] / tot : 0; if (w > 0) { doc.setFillColor(...GRADE_C[g]); doc.rect(bx, y, w, 5, 'F'); bx += w; } }
    y += 9;
    table(['Evidence grade', 'In this report', 'Share', 'Simulated range (low · high)'], gs.map(g => [gradeCell(g), M(byG[g]), share(byG[g], tot), `× ${SW_MC_RANGE_BY_GRADE[g][0]} · × ${SW_MC_RANGE_BY_GRADE[g][2]}`]),
      { 1: { ...R, cellWidth: 30 }, 2: { ...R, cellWidth: 20 } });
    if (md.slice.isWhole) {
      sub('Largest unsourced amounts — replace these first');
      table(['What', 'In the total'], ev.topUnsourced.slice(0, 8).map(t => [t.label, M(t.amount)]), { 1: { ...R, cellWidth: 36 } });
    }
    sub('Your figures — quotes and modules you entered, with their sources');
    if (md.yourFigures.length) table(['Line', 'Value', 'Source'], md.yourFigures.map(x => [x.line, x.value, x.source]), { 0: { cellWidth: 70 }, 1: { cellWidth: 40 }, 2: { cellWidth: 68, fontSize: 6.6 } });
    else para('None yet. Supplier quotes and modules of your own, each with its source, replace unsourced catalogue figures.', 8, MUTED);
    if (short) return;
    sub('Calibration — which modules to measure first');
    const cal = md.calibration, rows = cal.rows;
    para(p.effortCalibration && p.effortCalibration !== 1 ? `This costing is calibrated: effort × ${p.effortCalibration} from your logged actuals.`
      : `This costing is uncalibrated: ${M(cal.total)} of engineering effort${md.slice.isWhole ? '' : ' in this report'} rests on the catalogue's person-months. Log what the top modules actually took (Calibrate to your actuals, in the tool).`, 8);
    table(['Module', 'Person-months', 'Engineering effort (excl. tools)', 'Share', 'Cumulative'], rows.slice(0, 12).map(x => [x.name, num(x.personMonths, 0), M(x.amount), share(x.amount, cal.total), `${(x.cumulative * 100).toFixed(1)} %`]),
      { 0: { cellWidth: 72 }, 1: R, 2: R, 3: R, 4: R }, { bodyStyles: SMALL });
    sub('Stated assumptions and their basis');
    table(['Assumption', 'Basis'], md.assumptions, { 0: { cellWidth: 46, fontStyle: 'bold', textColor: NAVY }, 1: { cellWidth: 132, fontSize: 6.6 } }, { bodyStyles: SMALL });
  };

  // ── 14 Make or buy ────────────────────────────────────────────────────────────────────────────────────────────────
  const makebuy = () => {
    section('makebuy', undefined, `Each domain's engineering re-costed with each development source at this hub. ${md.makeBuy.basis}`);
    table(['Domain', 'OEM in-house', 'Tier-1 supplier', 'Start-up'], md.makeBuy.rows.map(x => [x.label, M(x.make), M(x.tier1), M(x.startup)]), { 1: R, 2: R, 3: R });
    para(`A bought source pays only when its effort is below ${(md.makeBuy.breakEvenEffortShare * 100).toFixed(1)} % of the in-house effort. The efficiency factors behind it are unsourced — set your supplier's own.`, 8, MUTED);
    const q = md.quote;
    const qRows = [q.nre, q.perVehicle, q.perVehicleYear, q.fixedPerYear, ...q.byCategory].filter(Boolean) as NonNullable<typeof q.nre>[];
    sub('Supplier quote check');
    if (qRows.length) {
      table(['Line', 'Should-cost', 'Quote', 'Gap'], qRows.map(x => {
        const ff = (n: number) => (x.unit === 'perVehicle' ? money(n, 2) : M(n));
        return [x.label, ff(x.should), ff(x.quoted), `${x.gap >= 0 ? '+' : '−'}${ff(Math.abs(x.gap))} (${x.gapPct >= 0 ? '+' : ''}${x.gapPct.toFixed(0)} %)`];
      }), { 1: R, 2: R, 3: R });
    } else {
      if (md.quoteNote) para(md.quoteNote, 8.5);
    }
    // The target split into what a supplier delivers and what stays with the OEM (review M9).
    const effort = q.target.nre - s.totalToolchain - s.totalHomologation;
    para(`Negotiation target for a Tier-1 supplier: engineering effort ${M(effort)} (${num(s.totalEffortPersonMonths, 0)} person-months at ${money(q.target.ratePerPM, 0)} per person-month, ${q.target.basis}) + development tools ${M(s.totalToolchain)} = ${M(effort + s.totalToolchain)}.`
      + (s.totalHomologation ? ` Homologation ${M(s.totalHomologation)} (type approval, CSMS / SUMS) stays with the OEM.` : ''), 8.5);
  };

  // ── 15 Scope ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const scope = () => {
    section('scope');
    if (md.slice.isWhole) {
      figure('excluded', 'Hatched: the parts that catalogue software out of this scope would run on (it is not costed). The table names each module and why it is out.', CW * 0.86);
      sub('Catalogue modules not in this programme');
      table(['Module', 'Domain', 'Why not'], md.excluded, { 0: { cellWidth: 70 }, 1: { cellWidth: 50 } });
    } else {
      sub('Modules in the vehicle costing but not in this report');
      const inSlice = new Set(md.scopeIds);
      table(['Module', 'Domain', 'Vehicle £'], r.modules.filter(m => !inSlice.has(m.moduleId)).map(m => [m.moduleName, m.categoryLabel, M(m.grandTotal)]), { 2: { ...R, cellWidth: 26 } }, { bodyStyles: SMALL });
    }
    sub('Vehicle software the catalogue has no module for (review judgement)');
    const mine = (p.customModules ?? []).filter(c => p.modules.find(m => m.moduleId === c.id)?.enabled);
    para(`These functions are normally supplier ECUs whose software is priced in the hardware piece price. They are not in this total${mine.length ? ` — except what you added as your own modules, which are costed here: ${mine.map(c => `${c.name} (${c.nominalPersonMonths} nominal PM)`).join(', ')}` : ' unless added as your own modules'}. Confirm against the electrical bill of materials.`, 8, MUTED);
    bullets([...md.gaps]);
    sub('Limitations');
    bullets([
      'Accuracy has not been measured: no real programme cost has been logged against the model. The checks in this report prove the arithmetic, not the inputs.',
      'Sourced figures (hub salaries, supplier margins, licence prices, OEM service terms) were read from search results of the cited pages and re-checked by an independent search.',
      'Published "programme software cost" figures for other vehicles are not printed: none could be verified.',
      'Vehicle volume and programme life are user inputs.',
      'The vehicle skeleton is a generic zonal E/E template: parts are placed by vehicle zone, not taken from this vehicle\'s architecture.',
      ...(md.mlExcluded ? ['ML training data, annotation and retraining are not costed (switched off for this programme); ML modules carry their engineering only.'] : []),
    ]);
  };

  // ── 16 Appendix: module × cost element ────────────────────────────────────────────────────────────────────────────
  const appendix = () => {
    section('appendix', undefined, `Every module (rows) by cost element (columns), in ${kUnit}. Rows add to the module total; with the programme-level items the columns add to the cost build-up and the total.`);
    const cols: Array<[string, (m: SWReportModule) => number]> = [
      ['Dev', m => m.result.development.total], ['Verif.', m => m.result.testing.total], ['Integ.', m => m.result.integrationCost], ['Cyber', m => m.result.cybersecCost],
      ['Calib.', m => m.result.calibrationCost + m.result.mlDataCost], ['Tools', m => m.result.toolchainCost], ['Maint.', m => m.result.maintenanceCost],
      ['Lic. + roy.', m => m.result.licensingCost], ['Cloud', m => m.result.cloudCost], ['Total', m => m.result.grandTotal],
    ];
    const body: Cell[][] = [];
    for (const d of md.domains) {
      body.push(band(d.label, cols.length + 1));
      for (const m of modsByDomain(d)) body.push([m.name, ...cols.map(([, g]) => K(g(m)))]);
    }
    body.push([strong('All modules'), ...cols.map(([, g]) => strong(K(md.modules.reduce((a, m) => a + g(m), 0))))]);
    if (md.slice.isWhole) {
      for (const it of md.programmeItems) body.push([it.label, ...cols.map(([h]) => (h === 'Total' || (h === 'Cloud' && it.kind === 'cloudFixed') ? K(it.amount) : ''))]);
      body.push([strong('Programme total'), ...cols.map(([h, g]) => strong(h === 'Total' ? K(s.grandTotal) : h === 'Cloud' ? K(md.modules.reduce((a, m) => a + g(m), 0) + (md.programmeItems.find(x => x.kind === 'cloudFixed')?.amount ?? 0)) : ''))]);
    }
    table(['Module', ...cols.map(([h]) => h)], body, { 0: { cellWidth: 48 }, ...Object.fromEntries(cols.map((_, i) => [i + 1, { halign: 'right', cellWidth: 13 }])) },
      { bodyStyles: { ...SMALL, fontSize: 6.1 }, headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.4, halign: 'right' } });
    const failed = md.checks.filter(c => !c.ok);
    para(`Reconciliation: ${md.checks.length} checks run on this report's figures (module buckets, the effort chain × rate, evidence lines, domains, the build-up${p.discountRatePct ? '' : ', spend by year'}) — ${failed.length ? `${failed.length} FAILED: ${failed.map(c => c.label).join('; ')}` : 'all agree to within 1p'}.`, 7.6, failed.length ? RED : MUTED);
  };

  // ── Assemble ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const render: Partial<Record<SWReportSectionId, () => void>> = { summary, definition, architecture, steps, buildup, domains, modules, lifecycle, spend, rates, hubs, risk, evidence, makebuy, scope, appendix };
  cover();
  doc.addPage(); tocPage = page(); doc.addPage(); y = TOP;
  for (const sec of md.sections) if (sec.id !== 'cover') render[sec.id]?.();

  // Contents + report details.
  doc.setPage(tocPage); y = TOP;
  font(16, 'bold', NAVY); doc.text('Contents', MG, y); y += 3; doc.setDrawColor(...LINE); doc.line(MG, y, W - MG, y); y += 7;
  const main = toc.filter(t => t[2] >= 0), subs = toc.filter(t => t[2] === -1);
  for (const [t, pg, no] of main) {
    font(9.5, 'bold', NAVY); doc.text(`${no}`, MG, y); doc.text(t, MG + 8, y);
    font(9.5, 'normal', SLATE); doc.text(String(pg), W - MG, y, { align: 'right' });
    y += 5.6;
    if (t === (md.sections.find(x => x.id === 'domains')?.title)) for (const [st, spg] of subs) { font(8, 'normal', SLATE); doc.text(st, MG + 8, y); doc.text(String(spg), W - MG, y, { align: 'right' }); y += 4.4; }
  }
  y += 4;
  font(10.5, 'bold', NAVY); doc.text('Report details', MG, y); y += 4;
  const meta = req.meta ?? {};
  table(null, [
    ['Report', `${SW_REPORT_PROFILES[md.profile].label} — ${SW_REPORT_PROFILES[md.profile].what}`],
    ['Programme', req.title],
    ['Scope', md.slice.isWhole ? `${r.modules.length} modules in ${md.headline.domains} domains` : `${md.modules.length} of ${r.modules.length} modules (${md.domains.map(d => d.label).join(', ')})`],
    ['Engineering hub', `${req.hubLabel}${md.hubs.length ? ` — every hub in the rate book re-costed` : ''}`],
    ['Currency', `${req.currency.code} (${req.currency.sym}) — the engine prices in £; figures converted at ${req.currency.perGbp} per £`],
    ...(meta.preparedBy ? [['Prepared by', meta.preparedBy]] : []), ...(meta.preparedFor ? [['Prepared for', meta.preparedFor]] : []),
    ...(meta.reference ? [['Reference', meta.reference]] : []), ...(meta.confidentiality ? [['Confidentiality', meta.confidentiality]] : []),
    ['Generated', `${req.generatedAt.toLocaleString('en-GB')} · rate book ${req.bookVersion || '—'}`],
  ] as Cell[][], { 0: { cellWidth: 36, fontStyle: 'bold', textColor: NAVY } });

  // Header and footer on every page.
  const total = page();
  for (let pg = 1; pg <= total; pg++) {
    doc.setPage(pg);
    if (pg > 1) {
      font(7, 'normal', MUTED); doc.text(`${req.title} — software should-cost · ${SW_REPORT_PROFILES[md.profile].label}`, MG, 12);
      doc.text(`${req.hubLabel} hub · ${p.annualProductionVolume.toLocaleString('en-GB')} / yr × ${p.programLifeYears} yr`, W - MG, 12, { align: 'right' });
      doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(MG, 14, W - MG, 14);
    }
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(MG, 284, W - MG, 284);
    font(7, 'normal', MUTED);
    doc.text(`CostVision · deterministic should-cost model${meta.confidentiality ? ` · ${meta.confidentiality}` : ''}${meta.reference ? ` · ${meta.reference}` : ''}`, MG, 289);
    doc.text(`Page ${pg} of ${total}`, W - MG, 289, { align: 'right' });
  }
}
