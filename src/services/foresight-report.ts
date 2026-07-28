// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark Horizon — Technology Foresight Report (PDF).
//
// The tool's own design language on paper, in two skins: LIGHT (default —
// print-friendly white canvas, navy ink, deep gold) and DARK (the Horizon
// screen: navy pages, starfield, gold horizon grid). Both share the FUI
// furniture — corner brackets, mono instrument labels, status-dot regulatory
// chips, momentum bars, MODELLED-NOT-MEASURED on every footer.
// Same discipline as export-service.ts: deepPdfSafe once up front (WinAnsi),
// measured truncation, explicit pagination via ensure(). Verify any change
// with the pdf-qa harness (scripts/pdf-qa/README.md) — BOTH themes.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from 'jspdf';
import { pdfSafe, deepPdfSafe } from './pdf-safe.mjs';
import { LOGO_PNG } from './brainspark-logo-png';

export type ReportTheme = 'light' | 'dark';

export interface ForesightReportAnchor { id: string; name: string; year: number; region: string; status?: string; effect: string; }
export interface ForesightReportCard {
  id: string; name: string; commodity: string; powertrains: string[]; replaces: string;
  trl: number; adoptionPct: number; firstProduction?: string; drivers: string[];
  costTrend: string; players: string[]; note: string;
  phase: string; horizon: 'H1' | 'H2' | 'H3'; regPulled: boolean; momentum: number;
  confidence: string; regAnchorDetail: ForesightReportAnchor | null;
  projection: { basis: string; adoption: Record<string, number>; costIndex: Record<string, number>; crossings?: { cross25: number | 'passed' | null; cross50: number | 'passed' | null; band25?: [number | null, number | null] | null; band50?: [number | null, number | null] | null } };
}
export interface ForesightReportBenchmark {
  vehicle: string; brand: string; year: number; powertrains: string[]; signature: string[]; watch: string;
}
export interface ForesightReportData {
  query: string; commodity: string | null; powertrain: string | null; count: number;
  segment?: string | null;
  benchmarks?: ForesightReportBenchmark[];
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

type RGB = readonly [number, number, number];

// One Horizon identity, two skins.
function palette(theme: ReportTheme) {
  const GOLD: RGB = theme === 'dark' ? [245, 158, 11] : [217, 119, 6];
  const TEAL: RGB = theme === 'dark' ? [45, 212, 191] : [13, 148, 136];
  const VIOLET: RGB = theme === 'dark' ? [167, 139, 250] : [109, 40, 217];
  return theme === 'dark'
    ? {
        theme, GOLD, TEAL, VIOLET,
        PAGE: [13, 31, 51] as RGB,        // navy canvas
        INK: [255, 255, 255] as RGB,      // headings
        BODY: [203, 213, 225] as RGB,     // body text
        MUT: [148, 163, 184] as RGB,
        DIM: [100, 116, 139] as RGB,
        PANEL: [21, 48, 79] as RGB,       // table/metric fills
        RULE: [42, 68, 99] as RGB,
        EVID: [110, 231, 183] as RGB,     // production-evidence green
        REG: [252, 211, 77] as RGB,       // regulation line
        STAR1: [200, 212, 228] as RGB, STAR2: GOLD, STAR3: TEAL, starCount: 42,
      }
    : {
        theme, GOLD, TEAL, VIOLET,
        PAGE: [255, 255, 255] as RGB,
        INK: [13, 31, 51] as RGB,
        BODY: [51, 65, 85] as RGB,
        MUT: [100, 116, 139] as RGB,
        DIM: [148, 163, 184] as RGB,
        PANEL: [242, 246, 251] as RGB,
        RULE: [215, 224, 236] as RGB,
        EVID: [4, 120, 87] as RGB,
        REG: [161, 98, 7] as RGB,
        STAR1: [203, 213, 225] as RGB, STAR2: [252, 211, 77] as RGB, STAR3: [153, 246, 228] as RGB, starCount: 26,
      };
}
type Palette = ReturnType<typeof palette>;

const STANCE_RGB: Record<string, RGB> = { agree: [22, 163, 74], caution: [217, 119, 6], challenge: [220, 38, 38] };
const STATUS_LABEL: Record<string, string> = { 'in-force': 'IN FORCE', adopted: 'ADOPTED', proposed: 'PROPOSED', 'under-revision': 'UNDER REVISION' };

function setFill(doc: jsPDF, rgb: RGB) { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
function setColor(doc: jsPDF, rgb: RGB) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }
function setDraw(doc: jsPDF, rgb: RGB, w = 0.3) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); doc.setLineWidth(w); }

function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}
function safeFilename(name: string): string { return name.replace(/[\\/:*?"<>|]/g, '-'); }

const HORIZON_TITLE: Record<'H1' | 'H2' | 'H3', string> = {
  H1: 'HORIZON 1 — ADOPT / QUOTE NOW',
  H2: 'HORIZON 2 — PLAN THE TRANSITION',
  H3: 'HORIZON 3 — TRACK, DON’T COMMIT',
};

export function exportForesightPdf(data: ForesightReportData, panelIn?: ForesightReportPanel | null, theme: ReportTheme = 'light'): void {
  const P = palette(theme);
  const result: ForesightReportData = deepPdfSafe(data);
  const panel: ForesightReportPanel | null = panelIn ? deepPdfSafe(panelIn) : null;
  const segmentLabel = result.segment === 'off-road' ? 'Off-Road Features & Technologies' : result.segment === 'luxury' ? 'Luxury / Premium SUV' : result.segment === 'software' ? 'SDV / ADAS & Software' : '';
  const subject = pdfSafe(result.query || result.commodity || segmentLabel || 'Technology landscape') + (result.powertrain ? ` (${result.powertrain})` : '');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, ML = 14, MR = 14;
  const CW = PW - ML - MR;
  const today = new Date().toISOString().split('T')[0];
  let page = 1;
  let y = 0;

  const mono = (s = 8, b = false) => { doc.setFont('courier', b ? 'bold' : 'normal'); doc.setFontSize(s); };
  const sans = (s = 9, style: 'normal' | 'bold' | 'italic' = 'normal') => { doc.setFont('helvetica', style); doc.setFontSize(s); };

  // FUI corner brackets — the signature of every Horizon surface.
  function brackets(x: number, by: number, w: number, h: number, rgb: RGB, len = 3, lw = 0.4) {
    setDraw(doc, rgb, lw);
    doc.line(x, by, x + len, by); doc.line(x, by, x, by + len);
    doc.line(x + w - len, by + h, x + w, by + h); doc.line(x + w, by + h - len, x + w, by + h);
  }
  // Subtle deterministic starfield — dense on dark, whisper-light on white.
  function starfield() {
    let seed = 97 + page * 13;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < P.starCount; i++) {
      const sx = rnd() * PW, sy = rnd() * PH, r = rnd() * 0.3 + 0.1;
      const c = rnd() < 0.14 ? P.STAR2 : rnd() < 0.24 ? P.STAR3 : P.STAR1;
      setFill(doc, c); doc.circle(sx, sy, r, 'F');
    }
  }
  // The literal horizon: perspective grid vanishing at yH.
  function horizonArt(yH: number, strong = false) {
    const cx = PW / 2;
    const gridCol: RGB = theme === 'dark'
      ? (strong ? [163, 108, 16] : [92, 66, 26])
      : (strong ? [240, 197, 122] : [247, 223, 178]);
    setDraw(doc, gridCol, 0.28);
    for (let i = 0; i <= 12; i++) {
      const xT = cx + (i - 6) * 9, xB = cx + (i - 6) * 42;
      doc.line(xT, yH, xB, PH);
    }
    [4, 10, 18, 29, 44].forEach((d) => { if (yH + d < PH) doc.line(0, yH + d, PW, yH + d); });
    setDraw(doc, P.GOLD, strong ? 0.55 : 0.4);
    doc.line(0, yH, PW, yH);
  }
  function paintPage(withGrid = false) {
    setFill(doc, P.PAGE); doc.rect(0, 0, PW, PH, 'F');
    starfield();
    if (withGrid) horizonArt(262);
  }
  function footer() {
    mono(7); setColor(doc, P.DIM);
    doc.text(`BRAINSPARK HORIZON  ·  ${fitText(doc, subject.toUpperCase(), 78)}  ·  ${String(page).padStart(2, '0')}`, ML, PH - 7);
    setColor(doc, P.GOLD);
    doc.text('MODELLED, NOT MEASURED', PW - MR, PH - 7, { align: 'right' });
  }
  function newPage() {
    doc.addPage(); page++; paintPage(); footer(); y = 20;
  }
  function ensure(height: number) { if (y + height > PH - 16) newPage(); }

  function sectionTitle(kicker: string, title: string) {
    ensure(18);
    mono(8, true); setColor(doc, P.GOLD);
    doc.text(kicker.toUpperCase(), ML, y);
    y += 5.5;
    sans(15, 'bold'); setColor(doc, P.INK);
    doc.text(fitText(doc, title, CW), ML, y);
    setDraw(doc, P.RULE, 0.3); doc.line(ML, y + 2.4, PW - MR, y + 2.4);
    y += 8;
  }
  function wrapped(text: string, size: number, rgb: RGB, width = CW, lineH = 4.2, style: 'normal' | 'bold' | 'italic' = 'normal', x = ML) {
    sans(size, style);
    const lines: string[] = doc.splitTextToSize(text, width);
    for (const line of lines) {
      ensure(lineH + 2);
      setColor(doc, rgb); sans(size, style);
      doc.text(line, x, y);
      y += lineH;
    }
  }
  const confColor = (c: string): RGB => c === 'committed' ? P.GOLD : c === 'probable' ? P.TEAL : P.MUT;
  const statusColor = (s?: string): RGB => s === 'in-force' ? P.TEAL : s === 'adopted' ? P.GOLD : s === 'under-revision' ? [248, 113, 113] : P.MUT;

  // ═══ COVER ═════════════════════════════════════════════════════════════════
  paintPage();
  horizonArt(212, true);
  // orbit + logo tile
  setDraw(doc, P.TEAL, 0.4); doc.circle(PW / 2, 48, 22);
  setDraw(doc, P.RULE, 0.3); doc.circle(PW / 2, 48, 28);
  setFill(doc, P.TEAL); doc.circle(PW / 2 + 22, 48, 0.9, 'F');
  setFill(doc, P.GOLD); doc.circle(PW / 2 - 19.5, 29, 0.8, 'F');
  setFill(doc, P.PANEL); doc.roundedRect(PW / 2 - 12, 36, 24, 24, 3.5, 3.5, 'F');
  brackets(PW / 2 - 12, 36, 24, 24, P.GOLD, 2.8, 0.5);
  doc.addImage(LOGO_PNG, 'PNG', PW / 2 - 8.5, 39.5, 17, 17);
  mono(9.5, true); setColor(doc, P.TEAL);
  doc.text('B R A I N S P A R K', PW / 2, 78, { align: 'center' });
  sans(38, 'bold'); setColor(doc, P.INK);
  doc.text('HORIZON', PW / 2, 92, { align: 'center' });
  sans(13.5); setColor(doc, P.GOLD);
  doc.text('Technology Foresight Report', PW / 2, 101, { align: 'center' });
  sans(12); setColor(doc, P.BODY);
  doc.text(fitText(doc, subject, CW - 20), PW / 2, 111, { align: 'center' });
  mono(8.5); setColor(doc, P.MUT);
  doc.text(`GENERATED ${today.toUpperCase()}  ·  ICE / MHEV / PHEV / BEV  ·  ENGINE-COMPUTED`, PW / 2, 118, { align: 'center' });

  // metric tiles (solid fills read well on both canvases)
  const metrics: Array<{ label: string; value: string; rgb: RGB }> = [
    { label: 'TECHNOLOGIES', value: String(result.count), rgb: theme === 'dark' ? P.PANEL : P.INK },
    { label: result.windows.H1.label.toUpperCase(), value: String(result.horizons.H1.length), rgb: [180, 121, 10] },
    { label: result.windows.H2.label.toUpperCase(), value: String(result.horizons.H2.length), rgb: [15, 118, 110] },
    { label: result.windows.H3.label.toUpperCase(), value: String(result.horizons.H3.length), rgb: [91, 33, 182] },
  ];
  const boxW = (CW - 9) / 4;
  metrics.forEach((m, i) => {
    const bx = ML + i * (boxW + 3), by = 128;
    setFill(doc, m.rgb); doc.roundedRect(bx, by, boxW, 22, 1.8, 1.8, 'F');
    brackets(bx + 1, by + 1, boxW - 2, 20, theme === 'dark' ? P.GOLD : [255, 255, 255], 2.2, 0.35);
    sans(17, 'bold'); setColor(doc, [255, 255, 255]);
    doc.text(m.value, bx + boxW / 2, by + 11.5, { align: 'center' });
    mono(6); setColor(doc, [226, 232, 240]);
    doc.text(fitText(doc, m.label, boxW - 5), bx + boxW / 2, by + 18, { align: 'center' });
  });

  y = 162;
  wrapped('How to read this report', 12, P.INK, CW, 5.5, 'bold');
  y += 1;
  wrapped('Every position is deterministic: technologies come from a curated register carrying an automotive TRL (1-9), a current adoption share, named production evidence and dated regulations. Lanes, S-curve phases, momentum and confidence tiers are computed by fixed rules.', 9, P.BODY);
  y += 1.5;
  wrapped('Adoption and cost projections are MODELS (Bass diffusion, Wright’s law) — labelled as modelled, never measurements. AI layers (briefing, panel) are grounded in the computed cards and clearly marked; they never invent a number.', 9, P.BODY);
  y += 1.5;
  mono(7.5, true); setColor(doc, P.GOLD); doc.text('CONFIDENCE', ML, y);
  sans(9); setColor(doc, P.BODY);
  doc.text('COMMITTED = regulation or named programme   ·   PROBABLE = TRL >= 7   ·   SPECULATIVE = earlier', ML + 26, y);
  y += 5;
  mono(7.5, true); setColor(doc, P.GOLD); doc.text('REG STATUS', ML, y);
  sans(9); setColor(doc, P.BODY);
  doc.text('teal IN FORCE  ·  gold ADOPTED  ·  grey PROPOSED  ·  red UNDER REVISION — only law can pull a lane', ML + 26, y);
  footer();

  // ═══ REGULATORY ANCHORS ════════════════════════════════════════════════════
  if (result.anchors.length) {
    newPage();
    sectionTitle('Regulatory radar', 'Dated obligations shaping this landscape');
    for (const a of result.anchors) {
      ensure(15);
      setFill(doc, statusColor(a.status)); doc.circle(ML + 1.4, y - 1.2, 1.15, 'F');
      sans(10.5, 'bold'); setColor(doc, P.INK);
      doc.text(fitText(doc, `${a.name} — ${a.year} · ${a.region}`, CW - 34), ML + 5, y);
      mono(6.5, true); setColor(doc, statusColor(a.status));
      doc.text(STATUS_LABEL[a.status ?? ''] ?? '', PW - MR, y, { align: 'right' });
      y += 4.6;
      wrapped(a.effect, 8.8, P.MUT, CW - 5, 4, 'normal', ML + 5);
      y += 2.5;
    }
  }

  // ═══ BENCHMARKS ════════════════════════════════════════════════════════════
  if (result.benchmarks?.length) {
    newPage();
    sectionTitle('Segment benchmarks', segmentLabel || 'The vehicles setting the technology bar');
    wrapped('Curated competitor evidence: signature production technology and the announced move to watch. Benchmark data, not prediction.', 8.5, P.MUT);
    y += 2;
    for (const b of result.benchmarks) {
      ensure(24);
      const cardTop = y - 4;
      sans(10.5, 'bold'); setColor(doc, P.INK);
      doc.text(fitText(doc, `${b.vehicle} — ${b.brand} (${b.year}, ${b.powertrains.join('/')})`, CW - 6), ML + 3, y);
      y += 4.8;
      for (const s of b.signature) wrapped(`•  ${s}`, 8.5, P.BODY, CW - 6, 4, 'normal', ML + 3);
      wrapped(`WATCH: ${b.watch}`, 8, P.TEAL, CW - 6, 4, 'italic', ML + 3);
      brackets(ML, cardTop, CW, y - cardTop + 1.5, P.RULE, 2.6, 0.35);
      y += 4.5;
    }
  }

  // ═══ BRIEFING / PANEL ══════════════════════════════════════════════════════
  if (result.narrative?.briefing) {
    ensure(42);
    sectionTitle('Analyst briefing', 'AI-written, grounded in the cards below');
    const bTop = y - 4;
    wrapped(result.narrative.briefing, 9.3, P.BODY, CW - 6, 4.4, 'normal', ML + 3);
    brackets(ML, bTop, CW, y - bTop + 1.5, P.TEAL, 2.8, 0.4);
    y += 5;
  }
  if (panel?.panel.some(p => p.critiques.length)) {
    ensure(26);
    sectionTitle('Expert panel', 'AI critique on soft axes — positions unchanged');
    for (const p of panel.panel) {
      ensure(6);
      mono(8, true); setColor(doc, P.VIOLET);
      doc.text(fitText(doc, `${p.persona.toUpperCase()} — ${p.focus} (${p.critiques.length} views)`, CW), ML, y);
      y += 5;
    }
    wrapped(panel.note, 8, P.MUT);
    y += 2;
  }

  // ═══ HORIZON LANES ═════════════════════════════════════════════════════════
  const signalFor = (id: string) => result.narrative?.signals.find(s => s.techId === id)?.watch;
  const critiquesFor = (id: string) =>
    panel?.panel.flatMap(p => p.critiques.filter(c => c.techId === id).map(c => ({ persona: p.persona, ...c }))) ?? [];

  for (const key of ['H1', 'H2', 'H3'] as const) {
    const cards = result.horizons[key];
    newPage();
    sectionTitle(`${result.windows[key].label} · ${cards.length} technologies`, HORIZON_TITLE[key]);
    if (!cards.length) { wrapped('Nothing in this window for this selection.', 9, P.MUT); continue; }
    for (const c of cards) {
      ensure(50);
      const cardTop = y - 4;
      const cc = confColor(c.confidence);

      sans(11.5, 'bold'); setColor(doc, P.INK);
      doc.text(fitText(doc, c.name, CW - 40), ML + 3, y);
      mono(7, true); setColor(doc, cc);
      doc.text(c.confidence.toUpperCase(), PW - MR - 3, y, { align: 'right' });
      y += 4.8;

      mono(7); setColor(doc, P.MUT);
      doc.text(fitText(doc, `TRL ${c.trl}  ·  ${c.phase.toUpperCase()}  ·  ADOPTION ${c.adoptionPct}%  ·  ${c.horizon}${c.regPulled ? ' <-REG' : ''}  ·  ${c.costTrend.toUpperCase()}  ·  ${c.powertrains.join('/')}`, CW - 40), ML + 3, y);
      y += 4;
      // momentum bar
      setFill(doc, P.PANEL); doc.rect(ML + 3, y - 1.4, 60, 1.7, 'F');
      setFill(doc, P.GOLD); doc.rect(ML + 3, y - 1.4, 60 * (c.momentum / 100), 1.7, 'F');
      mono(6.5); setColor(doc, P.DIM);
      doc.text(`MOMENTUM ${c.momentum}/100`, ML + 66, y);
      y += 4.4;

      wrapped(c.note, 9, P.BODY, CW - 6, 4.1, 'normal', ML + 3);
      wrapped(`Replaces: ${c.replaces}`, 8.3, P.MUT, CW - 6, 3.9, 'normal', ML + 3);
      if (c.firstProduction) wrapped(`Production evidence: ${c.firstProduction}`, 8.3, P.EVID, CW - 6, 3.9, 'normal', ML + 3);
      if (c.regAnchorDetail) wrapped(`Regulation: ${c.regAnchorDetail.name} (${c.regAnchorDetail.year}, ${c.regAnchorDetail.region})${c.regPulled ? ' — pulls this technology forward' : ''}`, 8.3, P.REG, CW - 6, 3.9, 'normal', ML + 3);
      wrapped(`Players: ${c.players.join(', ')}`, 8.3, P.MUT, CW - 6, 3.9, 'normal', ML + 3);

      // projection mini-table
      ensure(19);
      const cols = [46, 22, 22, 22, 22];
      const px = cols.map((_, i) => ML + 3 + cols.slice(0, i).reduce((a2, b2) => a2 + b2, 0));
      setFill(doc, P.PANEL);
      doc.roundedRect(ML + 3, y - 3, cols.reduce((a2, b2) => a2 + b2, 0) + 4, 14.5, 1, 1, 'F');
      mono(6.8, true); setColor(doc, P.DIM);
      ['MODELLED PROJECTION', 'NOW', '+3Y', '+5Y', '+8Y'].forEach((h, i) => doc.text(h, px[i] + 2, y + 0.5));
      mono(7.2); setColor(doc, P.BODY);
      const adoption = ['ADOPTION %', String(c.projection.adoption.now), String(c.projection.adoption.in3), String(c.projection.adoption.in5), String(c.projection.adoption.in8)];
      const cost = ['COST INDEX', c.projection.costIndex.now.toFixed(2), c.projection.costIndex.in3.toFixed(2), c.projection.costIndex.in5.toFixed(2), c.projection.costIndex.in8.toFixed(2)];
      adoption.forEach((v, i) => doc.text(v, px[i] + 2, y + 4.6));
      cost.forEach((v, i) => doc.text(v, px[i] + 2, y + 8.7));
      y += 15;

      if (c.projection.crossings) {
        const lbl = (v: number | 'passed' | null, band?: [number | null, number | null] | null) => {
          if (v === 'passed') return 'ALREADY PASSED';
          if (v === null) return 'NOT IN 15Y';
          return `~${v}${band ? ` ('${String(band[0] ?? '..').slice(2)}-'${String(band[1] ?? '..').slice(2)})` : ''}`;
        };
        mono(7.4, true); setColor(doc, P.TEAL);
        ensure(6);
        doc.text(fitText(doc, `CROSSES 25% ${lbl(c.projection.crossings.cross25, c.projection.crossings.band25)}   ·   50% ${lbl(c.projection.crossings.cross50, c.projection.crossings.band50)}`, CW - 6), ML + 3, y);
        y += 4.6;
      }

      const sig = signalFor(c.id);
      if (sig) {
        ensure(5.5);
        setFill(doc, P.TEAL); doc.circle(ML + 4.2, y - 1.1, 0.9, 'F');
        wrapped(`Watch: ${sig}`, 8.3, P.TEAL, CW - 10, 3.9, 'normal', ML + 7);
      }
      for (const cr of critiquesFor(c.id)) {
        wrapped(`${cr.persona} [${cr.stance.toUpperCase()}]: ${cr.note}`, 8.3, STANCE_RGB[cr.stance] ?? P.MUT, CW - 6, 3.9, 'normal', ML + 3);
      }

      brackets(ML, cardTop, CW, y - cardTop + 1.5, cc, 3, 0.42);
      y += 6.5;
    }
  }

  // ═══ METHODOLOGY ═══════════════════════════════════════════════════════════
  newPage();
  sectionTitle('Provenance', 'Methodology & honesty');
  const method = [
    'Register: curated technology entries with automotive TRL (APC 1-9), current adoption share, named production programmes, drivers, cost-trend direction, players and dated regulatory anchors. Integrity is CI-enforced — adoption claims of 15%+ require evidence; TRL <= 5 entries cannot claim meaningful adoption.',
    'Horizon lanes: base position from maturity; only in-force/adopted law can pull a technology one horizon earlier, never past the regulation’s own bite-year window.',
    'Adoption: Bass diffusion (p=0.03, q=0.38) with per-technology segment ceilings. Cost index: Wright’s law with learning rates mapped from cost-trend direction. Crossing years carry a q+/-25% uncertainty band. All models, not measurements.',
    'Momentum (0-100): maturity + adoption + cost trajectory + drivers + regulatory pull + production evidence. Deterministic.',
    'AI layers (clearly marked): briefing and signals grounded only in the computed cards; the expert panel critiques timing without changing any position; research findings must cite retrieved sources or are dropped in code.',
    'This report supports sourcing and platform conversations. Validate against detailed programme studies before commercial commitments.',
  ];
  for (const m of method) { wrapped(`•  ${m}`, 9, P.BODY); y += 2; }
  if (result.note) { y += 2; wrapped(result.note, 8, P.MUT); }
  ensure(30);
  horizonArt(Math.max(y + 12, 240));

  doc.save(safeFilename(`BrainSpark_Horizon_${subject}_${today}_${theme}.pdf`));
}
