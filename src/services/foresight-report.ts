// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark Horizon — Technology Foresight Report (PDF).
//
// Renders the deterministic foresight result (+ optional grounded analyst
// briefing and panel critique) as a branded A4 report. Same discipline as
// export-service.ts: deepPdfSafe once up front (WinAnsi), measured truncation,
// explicit pagination via ensure(), logo on cover + every footer. Verify any
// change with the pdf-qa harness (scripts/pdf-qa/README.md).
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf';
import { pdfSafe, deepPdfSafe } from './pdf-safe.mjs';
import { LOGO_PNG } from './brainspark-logo-png';

export interface ForesightReportAnchor { id: string; name: string; year: number; region: string; effect: string; }
export interface ForesightReportCard {
  id: string; name: string; commodity: string; powertrains: string[]; replaces: string;
  trl: number; adoptionPct: number; firstProduction?: string; drivers: string[];
  costTrend: string; players: string[]; note: string;
  phase: string; horizon: 'H1' | 'H2' | 'H3'; regPulled: boolean; momentum: number;
  confidence: string; regAnchorDetail: ForesightReportAnchor | null;
  projection: { basis: string; adoption: Record<string, number>; costIndex: Record<string, number> };
}
export interface ForesightReportData {
  query: string; commodity: string | null; powertrain: string | null; count: number;
  windows: Record<'H1' | 'H2' | 'H3', { label: string }>;
  horizons: Record<'H1' | 'H2' | 'H3', ForesightReportCard[]>;
  anchors: ForesightReportAnchor[];
  narrative: { briefing: string; signals: Array<{ techId: string; watch: string }> } | null;
  note?: string;
}
export interface ForesightReportPanel {
  panel: Array<{ persona: string; focus: string; critiques: Array<{ techId: string; stance: string; note: string }> }>;
  note: string;
}

const NAVY_RGB  = [13, 31, 51] as const;
const GOLD_RGB  = [245, 158, 11] as const;
const WHITE_RGB = [255, 255, 255] as const;
const GRAY_RGB  = [100, 116, 139] as const;
const TEAL_RGB  = [13, 148, 136] as const;

const CONF_RGB: Record<string, readonly [number, number, number]> = {
  committed: GOLD_RGB, probable: TEAL_RGB, speculative: GRAY_RGB,
};
const STANCE_RGB: Record<string, readonly [number, number, number]> = {
  agree: [22, 163, 74], caution: [217, 119, 6], challenge: [220, 38, 38],
};

function setFill(doc: jsPDF, rgb: readonly [number, number, number]) { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
function setColor(doc: jsPDF, rgb: readonly [number, number, number]) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }

function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-');
}

const HORIZON_TITLE: Record<'H1' | 'H2' | 'H3', string> = {
  H1: 'Horizon 1 — adopt/quote now',
  H2: 'Horizon 2 — plan the transition',
  H3: 'Horizon 3 — track, don’t commit',
};

export function exportForesightPdf(data: ForesightReportData, panelIn?: ForesightReportPanel | null): void {
  const result: ForesightReportData = deepPdfSafe(data);
  const panel: ForesightReportPanel | null = panelIn ? deepPdfSafe(panelIn) : null;
  const subject = pdfSafe(result.query || result.commodity || 'Technology landscape') + (result.powertrain ? ` (${result.powertrain})` : '');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, ML = 14, MR = 14;
  const CW = PW - ML - MR;
  const today = new Date().toISOString().split('T')[0];
  let page = 1;
  let y = 0;

  function addPageNumber() {
    doc.addImage(LOGO_PNG, 'PNG', ML, PH - 10.2, 5.5, 5.5);
    setColor(doc, GRAY_RGB);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`BrainSpark Horizon  |  ${fitText(doc, subject, 90)}  |  Page ${page}`, PW / 2, PH - 6, { align: 'center' });
  }

  function newPage() {
    doc.addPage();
    page++;
    addPageNumber();
    y = 18;
  }

  function ensure(height: number) {
    if (y + height > PH - 14) newPage();
  }

  function sectionHeader(title: string) {
    ensure(16);
    setFill(doc, NAVY_RGB);
    doc.roundedRect(ML, y, CW, 9, 1.5, 1.5, 'F');
    setFill(doc, GOLD_RGB);
    doc.rect(ML, y, 1.6, 9, 'F');
    setColor(doc, WHITE_RGB);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, ML + 5, y + 6.2);
    y += 13;
  }

  function wrapped(text: string, size: number, rgb: readonly [number, number, number], width = CW, lineH = 4.2, style: 'normal' | 'bold' | 'italic' = 'normal') {
    doc.setFontSize(size);
    doc.setFont('helvetica', style);
    const lines: string[] = doc.splitTextToSize(text, width);
    for (const line of lines) {
      ensure(lineH + 2);
      setColor(doc, rgb);
      doc.setFontSize(size);
      doc.setFont('helvetica', style);
      doc.text(line, ML, y);
      y += lineH;
    }
  }

  // ── Cover ──────────────────────────────────────────────────────────────────
  setFill(doc, NAVY_RGB);
  doc.rect(0, 0, PW, 128, 'F');
  setFill(doc, GOLD_RGB);
  doc.rect(0, 128, PW, 1.2, 'F');

  doc.addImage(LOGO_PNG, 'PNG', ML, 20, 13, 13);
  setColor(doc, GOLD_RGB);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('BrainSpark', ML + 16, 30);

  setColor(doc, WHITE_RGB);
  doc.setFontSize(18);
  doc.text('Horizon — Technology Foresight Report', ML, 46);

  setColor(doc, [148, 163, 184]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(fitText(doc, subject, CW), ML, 57);

  setColor(doc, [203, 213, 225]);
  doc.setFontSize(10);
  doc.text(`Generated: ${today}`, ML, 68);
  doc.text('Scope: ICE / MHEV / PHEV / BEV', ML, 74);

  const metrics = [
    { label: 'Technologies', value: String(result.count), rgb: [59, 130, 246] as const },
    { label: result.windows.H1.label, value: String(result.horizons.H1.length), rgb: [34, 197, 94] as const },
    { label: result.windows.H2.label, value: String(result.horizons.H2.length), rgb: GOLD_RGB },
    { label: result.windows.H3.label, value: String(result.horizons.H3.length), rgb: [139, 92, 246] as const },
  ];
  const boxW = (CW - 9) / 4;
  metrics.forEach((m, i) => {
    const bx = ML + i * (boxW + 3);
    const by = 92;
    setFill(doc, [30, 41, 59]);
    doc.roundedRect(bx, by, boxW, 22, 2, 2, 'F');
    setFill(doc, m.rgb);
    doc.rect(bx, by, boxW, 1.5, 'F');
    setColor(doc, m.rgb);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(m.value, bx + boxW / 2, by + 13, { align: 'center' });
    setColor(doc, [148, 163, 184]);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(fitText(doc, m.label, boxW - 4), bx + boxW / 2, by + 19, { align: 'center' });
  });

  y = 142;
  wrapped('How to read this report', 12, NAVY_RGB, CW, 5.5, 'bold');
  y += 1;
  wrapped('Every position in this report is deterministic: technologies come from a curated register carrying an automotive TRL (1-9), a current adoption share of the applicable segment, named production evidence and dated regulations. Horizon lanes, S-curve phases, momentum scores and confidence tiers are computed from that register by fixed rules.', 9.5, [51, 65, 85]);
  y += 2;
  wrapped('Adoption and cost projections are MODELS (Bass diffusion, Wright’s law) seeded from the curated data — they are labelled as modelled and are not measurements. Where an AI layer contributes (analyst briefing, panel critique), it is grounded in the deterministic cards and clearly marked; it never invents a number.', 9.5, [51, 65, 85]);
  y += 2;
  wrapped('Confidence tiers — COMMITTED: anchored to a dated regulation or a named production programme. PROBABLE: production-ready maturity (TRL >= 7) without a hard anchor. SPECULATIVE: earlier than that; treat with care.', 9.5, [51, 65, 85]);
  addPageNumber();

  // ── Regulatory anchors ─────────────────────────────────────────────────────
  if (result.anchors.length) {
    newPage();
    sectionHeader('Regulatory anchors in play (dated commitments, not predictions)');
    for (const a of result.anchors) {
      ensure(14);
      setColor(doc, NAVY_RGB);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(fitText(doc, `${a.name} — ${a.year} · ${a.region}`, CW), ML, y);
      y += 4.6;
      wrapped(a.effect, 9, [71, 85, 105]);
      y += 2.5;
    }
  }

  // ── Analyst briefing ───────────────────────────────────────────────────────
  if (result.narrative?.briefing) {
    ensure(40);
    sectionHeader('Analyst briefing (AI-written, grounded in the technology cards)');
    wrapped(result.narrative.briefing, 9.5, [51, 65, 85]);
    y += 3;
  }

  // ── Panel summary ──────────────────────────────────────────────────────────
  if (panel?.panel.some(p => p.critiques.length)) {
    ensure(30);
    sectionHeader('Expert panel (AI critique on soft axes — positions unchanged)');
    for (const p of panel.panel) {
      ensure(6);
      setColor(doc, [88, 28, 135]);
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.text(fitText(doc, `${p.persona} — ${p.focus} (${p.critiques.length} views)`, CW), ML, y);
      y += 4.8;
    }
    wrapped(panel.note, 8, GRAY_RGB);
    y += 3;
  }

  // ── Horizon lanes ──────────────────────────────────────────────────────────
  const signalFor = (id: string) => result.narrative?.signals.find(s => s.techId === id)?.watch;
  const critiquesFor = (id: string) =>
    panel?.panel.flatMap(p => p.critiques.filter(c => c.techId === id).map(c => ({ persona: p.persona, ...c }))) ?? [];

  for (const key of ['H1', 'H2', 'H3'] as const) {
    const cards = result.horizons[key];
    newPage();
    sectionHeader(`${HORIZON_TITLE[key]} (${result.windows[key].label} · ${cards.length} technologies)`);
    if (!cards.length) {
      wrapped('Nothing in this window for this selection.', 9, GRAY_RGB);
      continue;
    }
    for (const c of cards) {
      ensure(46);

      // Title + confidence chip
      setColor(doc, NAVY_RGB);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(fitText(doc, c.name, CW - 34), ML, y);
      const conf = CONF_RGB[c.confidence] ?? GRAY_RGB;
      setColor(doc, conf);
      doc.setFontSize(8);
      doc.text(c.confidence.toUpperCase(), PW - MR, y, { align: 'right' });
      y += 4.8;

      // Badge line
      setColor(doc, [71, 85, 105]);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text(fitText(doc, `TRL ${c.trl}  ·  ${c.phase}  ·  adoption ${c.adoptionPct}%  ·  momentum ${c.momentum}/100  ·  cost trend ${c.costTrend}  ·  ${c.powertrains.join('/')}`, CW), ML, y);
      y += 4.6;

      wrapped(c.note, 9, [51, 65, 85]);
      wrapped(`Replaces: ${c.replaces}`, 8.5, GRAY_RGB);
      if (c.firstProduction) wrapped(`Production evidence: ${c.firstProduction}`, 8.5, [22, 101, 82]);
      if (c.regAnchorDetail) wrapped(`Regulation: ${c.regAnchorDetail.name} (${c.regAnchorDetail.year}, ${c.regAnchorDetail.region})${c.regPulled ? ' — pulls this technology forward' : ''}`, 8.5, [161, 98, 7]);
      wrapped(`Players: ${c.players.join(', ')}`, 8.5, GRAY_RGB);

      // Projection mini-table (modelled)
      ensure(18);
      const cols = [46, 22, 22, 22, 22];
      const px = cols.map((_, i) => ML + cols.slice(0, i).reduce((a, b) => a + b, 0));
      setFill(doc, [241, 245, 249]);
      doc.roundedRect(ML, y - 3, cols.reduce((a, b) => a + b, 0) + 4, 14.5, 1, 1, 'F');
      doc.setFontSize(7.5);
      setColor(doc, GRAY_RGB);
      doc.setFont('helvetica', 'bold');
      ['Modelled projection', 'Now', '+3y', '+5y', '+8y'].forEach((h, i) => doc.text(h, px[i] + 2, y + 0.5));
      doc.setFont('helvetica', 'normal');
      setColor(doc, [51, 65, 85]);
      const adoption = ['Adoption %', String(c.projection.adoption.now), String(c.projection.adoption.in3), String(c.projection.adoption.in5), String(c.projection.adoption.in8)];
      const cost = ['Cost index', c.projection.costIndex.now.toFixed(2), c.projection.costIndex.in3.toFixed(2), c.projection.costIndex.in5.toFixed(2), c.projection.costIndex.in8.toFixed(2)];
      adoption.forEach((v, i) => doc.text(v, px[i] + 2, y + 4.6));
      cost.forEach((v, i) => doc.text(v, px[i] + 2, y + 8.7));
      y += 14.5;

      const sig = signalFor(c.id);
      if (sig) wrapped(`Signal to watch: ${sig}`, 8.5, TEAL_RGB);
      for (const cr of critiquesFor(c.id)) {
        wrapped(`${cr.persona} [${cr.stance}]: ${cr.note}`, 8.5, STANCE_RGB[cr.stance] ?? GRAY_RGB);
      }

      y += 4;
      setFill(doc, [226, 232, 240]);
      doc.rect(ML, y - 2, CW, 0.3, 'F');
      y += 3;
    }
  }

  // ── Methodology & honesty ──────────────────────────────────────────────────
  newPage();
  sectionHeader('Methodology & honesty');
  const method = [
    'Register: curated technology entries with automotive TRL (APC 1-9), current adoption share of the applicable segment, named production programmes, drivers, cost-trend direction, leading players and dated regulatory anchors. Integrity is test-enforced: adoption claims of 15%+ require production or regulatory evidence; TRL <= 5 entries cannot claim meaningful adoption.',
    'Horizon lanes: base position from maturity (TRL/adoption); a dated regulation can pull a technology at most one horizon earlier, and never earlier than the regulation’s own bite-year window.',
    'Adoption projection: Bass diffusion (p=0.03, q=0.38, 90% segment ceiling) seeded from the curated current share. Cost index: Wright’s law with learning rates mapped from the curated cost-trend direction. Both are models, not measurements.',
    'Momentum (0-100): maturity + adoption + cost trajectory + breadth of drivers + regulatory pull + production evidence. Deterministic.',
    'AI layers (clearly marked): the analyst briefing and signals-to-watch are grounded only in the deterministic cards; the expert panel critiques soft axes (timing, supplier readiness, regulatory risk) without changing any position; deep research findings must cite retrieved sources, and uncited claims are dropped automatically.',
    'This report supports sourcing and platform conversations. Validate against detailed programme studies before commercial commitments.',
  ];
  for (const m of method) {
    wrapped(`•  ${m}`, 9, [51, 65, 85]);
    y += 2;
  }
  if (result.note) {
    y += 2;
    wrapped(result.note, 8, GRAY_RGB);
  }

  doc.save(safeFilename(`BrainSpark_Horizon_${subject}_${today}.pdf`));
}
