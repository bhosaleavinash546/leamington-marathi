/**
 * Fab specification options the costing did not take (EDU audit G-17, Nov 2026): board thickness, laminate Tg / CTI,
 * via fill, ENIG gold thickness and impedance tolerance. Inner copper is wired into the existing per-layer copper rule
 * (copperLayersFromSpec → heavy copper in pcb-country-rates.ts).
 *
 * Rule (the audit's): an option is COSTED only with a published adder; the rest are LISTED as not costed. Research read
 * 25 Nov 2026: scripts/pcb-research/2026-11-26-g17-g07/raw/fab-adders-cn.json (Chinese fabs) and fab-adders-xcheck.json
 * (an independent cross-check). Every adder found is a fab's SAMPLE or small-batch list (none is a volume price), so each
 * is an upper bound at automotive volume — said on every basis line.
 */

export interface FabOptions {
  /** Finished board thickness, mm (standard 0.8–1.6). */
  thicknessMm?: number;
  /** Laminate: Tg 130 (standard FR-4), 150, 170, or high CTI (≥ 600, PLC 0). */
  laminate?: 'tg130' | 'tg150' | 'tg170' | 'cti600';
  /** Via fill: tented / none, solder-mask plugged, resin filled, via-in-pad plated over (POFV). */
  viaFill?: 'none' | 'mask' | 'resin' | 'pofv';
  /** ENIG gold thickness, µ" (1 standard). */
  enigGoldUin?: number;
  /** Impedance tolerance, ± % (10 standard). */
  impedanceTolPct?: number;
}

export interface FabOptionEvidence { value: number; unit: string; source: string; url: string; quote: string }

const GZX = 'Shenzhen Guanzhongxin (冠众鑫) price guide, "factors in the PCB sample price" (undated, © 2020) — a sample price, an upper bound at volume';
const GZX_URL = 'http://www.gzxpcb.com/index.php?m=content&c=index&a=lists&catid=125';
const WE = 'Würth Elektronik CBT cost webinar (4-layer, 1.6 mm = 100 %, 2020 / 2023) — a European fab\'s relative price';
const WE_URL = 'https://www.we-online.com/files/pdf1/webinar-video-center-layout-affect-costs-cbt-en.pdf';

export const FAB_OPTION_EVIDENCE = {
  /** PCBasic: 0.8–1.6 mm is the standard range; outside it is quoted (no figure). */
  thicknessStandard: { value: 0, unit: '0.8–1.6 mm, no extra', source: 'PCBasic (Shenzhen) standard-PCB page', url: 'https://www.pcbasic.com/standard_pcb.html',
    quote: 'The factory considers 0.8–1.6mm as the standard thickness range.' },
  thickness3_2: { value: 37, unit: '% of the board at 3.2 mm', source: WE, url: WE_URL, quote: 'Price indicator 137 % [3.20 mm] against 100 % [1.60 mm]' },
  thickness0_5: { value: 7, unit: '% of the board at 0.5 mm', source: WE, url: WE_URL, quote: 'Price indicator 107 % [0.50 mm]' },
  tg150: { value: 8, unit: '% of the board', source: GZX, url: GZX_URL, quote: '常规PCBTG值为130，中TG为150，高TG170，对应的提高成本分别为8%和15%' },
  tg170: { value: 15, unit: '% of the board', source: GZX, url: GZX_URL, quote: '常规PCBTG值为130，中TG为150，高TG170，对应的提高成本分别为8%和15%' },
  viaInPad: { value: 500, unit: 'CNY/m²', source: GZX, url: GZX_URL, quote: '盘中孔 — 也叫树脂塞孔或孔铜填孔，较正常工序增填孔工艺，成本增加500元/平米' },
  viaInPadFree6L: { value: 0, unit: 'free on 6+ layers', source: 'JLC (jlc.com) and JLCPCB: via-in-pad / resin fill free on 6–32 (JLC) and 6–20 (JLCPCB) layers',
    url: 'https://www.jlc.com/portal/q7i51734.html', quote: '针对6-32层PCB，嘉立创免费开放盘中孔工艺' },
  maskPlugFree4L: { value: 0, unit: 'free on 4-layer and up', source: 'PCBasic (Shenzhen) standard-PCB page', url: 'https://www.pcbasic.com/standard_pcb.html',
    quote: 'For 4-layer boards, via covering is upgraded to via filling at no additional cost.' },
  enigGoldStep: { value: 100, unit: 'CNY/m² a µ" above 1 µ"', source: `${GZX}; JLC's ≤ 4-layer list has the same 1U → 2U step (¥140 → ¥240/m²; ¥100 → ¥140 on 6+ layers)`, url: GZX_URL,
    quote: '表面处理沉金时，1U加价100元/㎡，2U加价200元/㎡，3U加价300元/㎡' },
} satisfies Record<string, FabOptionEvidence>;

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : NaN; };

/** The options the ENGINEER set on the PCB form (board-spec keys). Anything invalid is ignored. */
export function fabOptionsFromSpec(spec: Record<string, unknown> | undefined): FabOptions | undefined {
  if (!spec) return undefined;
  const o: FabOptions = {};
  const t = n(spec.boardThicknessMm); if (t >= 0.2 && t <= 6.5) o.thicknessMm = t;
  const lam = String(spec.laminateTg ?? '').toLowerCase().replace(/\s+/g, '');
  if (lam === '130' || lam === 'tg130') o.laminate = 'tg130';
  else if (lam === '150' || lam === 'tg150') o.laminate = 'tg150';
  else if (lam === '170' || lam === 'tg170') o.laminate = 'tg170';
  else if (lam === 'cti600' || lam === 'cti') o.laminate = 'cti600';
  const vf = String(spec.viaFill ?? '').toLowerCase(); if (['none', 'mask', 'resin', 'pofv'].includes(vf)) o.viaFill = vf as FabOptions['viaFill'];
  const g = n(spec.enigGoldUin); if ([1, 2, 3].includes(g)) o.enigGoldUin = g;
  const tol = n(spec.impedanceTolPct); if (tol >= 3 && tol <= 20) o.impedanceTolPct = tol;
  return Object.keys(o).length ? o : undefined;
}

export interface FabOptionLine { item: string; gbp: number; formula: string; source: string }
export interface FabOptionsResult { lines: FabOptionLine[]; included: string[]; notCosted: string[]; total: number }

/**
 * The options' £ a board.
 *  coreGBP     the board price the % adders act on (table: base + layers with panel waste; market: the market board)
 *  gbpPerCnyM2 £ that ¥1/m² costs on this board (area × panel waste × the country's price level ÷ CNY per £)
 *  basis       'market': the price is an automotive market ASP — the laminate is inside it and not added
 */
export function fabOptionsCost(o: FabOptions | undefined, ctx: { coreGBP: number; gbpPerCnyM2: number; layers: number; finish: string; basis: 'table' | 'market' }): FabOptionsResult {
  const res: FabOptionsResult = { lines: [], included: [], notCosted: [], total: 0 };
  if (!o) return res;
  const f = (v: number) => `£${v.toFixed(4)}`;
  const E = FAB_OPTION_EVIDENCE;
  const tag = (e: FabOptionEvidence) => `${e.source} — ${e.url}`;
  const t = o.thicknessMm;
  if (t !== undefined) {
    if (t >= 0.8 && t <= 1.6) res.included.push(`thickness ${t} mm: in the standard 0.8–1.6 mm range, no extra (${E.thicknessStandard.source})`);
    else {
      const thick = t > 1.6;
      const span = thick ? 3.2 - 1.6 : 0.8 - 0.5, pctEnd = thick ? E.thickness3_2.value : E.thickness0_5.value;
      const dist = thick ? Math.min(t, 3.2) - 1.6 : 0.8 - Math.max(t, 0.5);
      const pct = pctEnd * dist / span;
      const g = ctx.coreGBP * pct / 100;
      res.lines.push({ item: `Bare board — thickness ${t} mm`, gbp: g, source: `${tag(thick ? E.thickness3_2 : E.thickness0_5)}; linear from the standard ${thick ? '1.6' : '0.8'} mm (PCBasic) to Würth's ${thick ? '3.2' : '0.5'} mm point${(thick && t > 3.2) || (!thick && t < 0.5) ? ` — held at that point (no figure beyond it)` : ''}`,
        formula: `board ${f(ctx.coreGBP)} × ${pctEnd} % × ${dist.toFixed(2)} ÷ ${span.toFixed(1)} mm = ${pct.toFixed(2)} % → ${f(g)}` });
    }
  }
  if (o.laminate === 'tg150' || o.laminate === 'tg170') {
    const e = o.laminate === 'tg150' ? E.tg150 : E.tg170;
    if (ctx.basis === 'market') res.included.push(`laminate ${o.laminate === 'tg150' ? 'Tg150' : 'Tg170'}: inside the automotive market price a m² (an automotive board average) — not added`);
    else {
      const g = ctx.coreGBP * e.value / 100;
      res.lines.push({ item: `Bare board — laminate ${o.laminate === 'tg150' ? 'Tg150' : 'Tg170'}`, gbp: g, source: tag(e), formula: `board ${f(ctx.coreGBP)} × ${e.value} % = ${f(g)}` });
    }
  } else if (o.laminate === 'cti600') res.notCosted.push('high-CTI laminate (≥ 600): no fab publishes a price — ask the fab');
  if (o.viaFill === 'resin' || o.viaFill === 'pofv') {
    if (ctx.layers >= 6) res.included.push(`via fill (${o.viaFill === 'pofv' ? 'via-in-pad, plated over' : 'resin'}): free on 6+ layers (${E.viaInPadFree6L.source})`);
    else {
      const g = E.viaInPad.value * ctx.gbpPerCnyM2;
      res.lines.push({ item: `Bare board — via fill (${o.viaFill === 'pofv' ? 'via-in-pad, plated over' : 'resin'})`, gbp: g, source: tag(E.viaInPad), formula: `¥${E.viaInPad.value}/m² × £${ctx.gbpPerCnyM2.toFixed(6)} a ¥/m² = ${f(g)}` });
    }
  } else if (o.viaFill === 'mask') {
    if (ctx.layers >= 4) res.included.push(`solder-mask plugged vias: free on 4+ layers (${E.maskPlugFree4L.source})`);
    else res.notCosted.push('solder-mask plugged vias on a 1–2-layer board: no fab publishes a price');
  }
  if (o.enigGoldUin !== undefined && o.enigGoldUin > 1) {
    if (!/enig|enepig/i.test(ctx.finish)) res.notCosted.push(`ENIG gold ${o.enigGoldUin} µ": the board's surface finish is not ENIG — ignored`);
    else {
      const g = (o.enigGoldUin - 1) * E.enigGoldStep.value * ctx.gbpPerCnyM2;
      res.lines.push({ item: `Bare board — ENIG gold ${o.enigGoldUin} µ"`, gbp: g, source: tag(E.enigGoldStep), formula: `(${o.enigGoldUin} − 1) µ" × ¥${E.enigGoldStep.value}/m² × £${ctx.gbpPerCnyM2.toFixed(6)} a ¥/m² = ${f(g)}` });
    }
  }
  if (o.impedanceTolPct !== undefined && o.impedanceTolPct < 10) res.notCosted.push(`impedance tolerance ±${o.impedanceTolPct} %: no fab publishes a price (JLCPCB: ±5 % "upon special request"; NextPCB: a non-standard stack-up from $80)`);
  res.total = res.lines.reduce((s, l) => s + l.gbp, 0);
  return res;
}
