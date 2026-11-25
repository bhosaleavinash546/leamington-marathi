/**
 * Bare-board selling prices per m² from the market — data, every figure with its source (EDU control board audit,
 * Nov 2026, gaps G-06 / C; research scripts/edu-ctrl-2026-11-25/xcheck/bare-pcb.json, pages read 25 Nov 2026).
 *
 * The country table priced a China automotive board as its standard build-up + IATF 18 % + laminate 40 % × 35 %
 * + a class-3 microsection and coupons per panel: £44.25 a board (£521/m²) on the 6-layer EDU board — about twice
 * what Chinese automotive fabs sell 8-layer-and-up HDI boards for. A fab's average selling price per m² SOLD already
 * holds its panel yield, normal drilling, finish mix, testing and, for an automotive fab, the automotive grade.
 *
 * So for an automotive board built in a country listed here the bare board is priced at that country's sourced ASP
 * for the board's layer class: level from the market, shape within the class from the country table (a 6-layer
 * board sits above a 4-layer one by the table's own layer adder), plus the class-3 extras a fab lists separately.
 * Only what an ASP cannot hold is added on top: holes above the drilling allowance, blind / micro vias, HDI, heavy
 * copper and the one-off tooling set-up. Countries without a sourced ASP keep the table + premium method.
 */

export interface MarketAspClass {
  /** Layer counts the ASP covers (inclusive). */
  minLayers: number;
  maxLayers: number;
  /** The layer count the class average is anchored at (the table's shape scales from it). */
  anchorLayers: number;
  /** Selling price per m² in the base year, local currency, as reported. */
  aspLocalPerM2: number;
  baseYear: number;
  source: string;
  url: string;
  quote: string;
}

export interface MarketFabEvidence {
  currency: string;
  /** The price rise from the base year to the costing year applied to every class (mid of the reported band). */
  rise: { lo: number; hi: number; used: number; source: string; url: string };
  /** Class-3 extras a fab prices separately, local currency per m². */
  class3ExtrasPerM2: { value: number; parts: string; source: string; url: string };
  classes: MarketAspClass[];
  asOf: string;
}

export const PCB_FAB_MARKET: Record<string, MarketFabEvidence> = {
  cn: {
    currency: 'CNY',
    asOf: '2026-11-25',
    rise: {
      lo: 0.12, hi: 0.17, used: 0.145,
      source: 'Sina Tech (Electronic Products World), 17 Sep 2026: "截至2026年第一季度，汽车电子PCB已上涨12%-17%" — the mid of the band is used (taking the top was a v2 judgement the audit rejected)',
      url: 'https://finance.sina.com.cn/tech/roll/2026-09-17/doc-inisayan9407392.shtml',
    },
    class3ExtrasPerM2: {
      value: 105, parts: '25 µm hole copper ¥25/m² (+ ¥100 a design, one-off) + 4-wire via test ¥80/m²',
      source: 'PCBasic (Shenzhen) standard-PCB process page', url: 'https://www.pcbasic.com/standard_pcb.html',
    },
    classes: [
      { minLayers: 3, maxLayers: 7, anchorLayers: 5, aspLocalPerM2: 995.31, baseYear: 2024,
        source: 'Chaoying Electronics (超颖) prospectus: 4–6-layer boards, mainly automotive (68.6 % automotive revenue; IATF 16949; customers Continental, Valeo, Bosch); revenue ¥1,610.98 m ÷ 161.86 万 m² sold, 2024',
        url: 'https://pdf.dfcfw.com/pdf/H2_AN202503311649612309_1.pdf', quote: 'p.1-1-229: "四、六层板 995.31 -0.06% 995.92 -0.93% 1,005.22"; p.1-1-235: "报告期，公司四、六层板主要应用于汽车电子、显示及储存等领域"' },
      { minLayers: 8, maxLayers: 99, anchorLayers: 8, aspLocalPerM2: 2362.21, baseYear: 2024,
        source: 'Chaoying Electronics (超颖) prospectus: 8-layer-and-up boards including HDI, 2024 (an HDI-inclusive average — high for a plain 8-layer board; the anchor at 8 layers keeps it on the high side)',
        url: 'https://pdf.dfcfw.com/pdf/H2_AN202503311649612309_1.pdf', quote: '"八层及以上板 2,362.21 6.51% 2,217.87 -4.56% 2,323.92"' },
    ],
  },
};

/** The ASP class for a layer count in a country, or null (no market evidence: use the table + premium). */
export function marketAspClass(countryId: string, layers: number): { ev: MarketFabEvidence; cls: MarketAspClass } | null {
  const ev = PCB_FAB_MARKET[countryId];
  if (!ev) return null;
  const cls = ev.classes.find(c => layers >= c.minLayers && layers <= c.maxLayers);
  return cls ? { ev, cls } : null;
}
