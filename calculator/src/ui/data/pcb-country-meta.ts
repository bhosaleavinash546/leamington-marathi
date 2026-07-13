// PCB manufacturing-country metadata: cost trend, NRE and supply-chain risk
// dimensions per country, plus the client-side risk-profile calculation.

// ─── Client-side country metadata (trend / NRE / risk) — Features 5,6,7 ─────
interface PCBCountryMeta {
  trend: { direction: 'rising' | 'stable' | 'falling'; pctChange6m: number; note: string };
  nre: { ppapGBP: number; fmeaGBP: number; dvprGBP: number; firstArticleGBP: number; iatfAuditGBP: number; totalGBP: number };
  risk: { geopolitical: number; logisticsReliability: number; qualityConsistency: number; leadTimeVariance: number };
}
function mkMeta(
  dir: 'rising' | 'stable' | 'falling', pct: number, note: string,
  ppap: number, fmea: number, dvpr: number, fai: number, iatf: number,
  geo: number, log: number, qual: number, lead: number,
): PCBCountryMeta {
  return {
    trend: { direction: dir, pctChange6m: pct, note },
    nre: { ppapGBP: ppap, fmeaGBP: fmea, dvprGBP: dvpr, firstArticleGBP: fai, iatfAuditGBP: iatf, totalGBP: ppap + fmea + dvpr + fai + iatf },
    risk: { geopolitical: geo, logisticsReliability: log, qualityConsistency: qual, leadTimeVariance: lead },
  };
}
export const PCB_COUNTRY_META: Record<string, PCBCountryMeta> = {
  cn: mkMeta('rising', 4, 'Copper CCL price increase and CNY appreciation pushing fab cost up', 3500, 2800, 4200, 1800, 2500, 0.55, 0.80, 0.78, 0.80),
  vn: mkMeta('stable', 1, 'Strong EMS investment offsetting wage growth', 3800, 3000, 4500, 1900, 2800, 0.72, 0.76, 0.75, 0.74),
  in: mkMeta('rising', 3, 'PLI-driven capacity ramp but rising skilled-labour wages', 3600, 2900, 4300, 1850, 2700, 0.70, 0.70, 0.72, 0.68),
  th: mkMeta('stable', 1, 'Mature automotive EMS cluster keeps pricing flat', 4200, 3400, 5000, 2100, 3000, 0.74, 0.82, 0.84, 0.80),
  my: mkMeta('rising', 3, 'Semiconductor demand and MYR firming lift assembly rates', 4400, 3500, 5200, 2200, 3100, 0.80, 0.84, 0.85, 0.82),
  tw: mkMeta('rising', 3, 'High demand for HDI/substrate capacity constrains supply', 5000, 4000, 6000, 2500, 3300, 0.48, 0.88, 0.93, 0.86),
  kr: mkMeta('stable', 2, 'Premium HDI stable; KRW softness offsetting wage rises', 5200, 4200, 6200, 2600, 3400, 0.68, 0.90, 0.93, 0.88),
  mx: mkMeta('rising', 5, 'Nearshoring surge tightening EMS capacity and labour', 4600, 3700, 5400, 2300, 3000, 0.74, 0.78, 0.82, 0.76),
  cz: mkMeta('stable', 1, 'EU automotive demand steady; energy costs normalising', 5500, 4400, 6400, 2700, 3400, 0.92, 0.91, 0.90, 0.90),
  pl: mkMeta('falling', -2, 'EU investment and improved yields lowering effective cost', 5000, 4000, 5900, 2500, 3200, 0.90, 0.90, 0.89, 0.89),
  de: mkMeta('rising', 6, 'Energy costs and IG-Metall wage agreements raising rates', 7500, 6000, 8500, 3500, 4500, 0.96, 0.97, 0.97, 0.96),
  gb: mkMeta('stable', 2, 'Domestic capacity stable; modest inflation pass-through', 5500, 4500, 6500, 2800, 3500, 0.95, 0.97, 0.96, 0.97),
  us: mkMeta('rising', 5, 'Reshoring incentives raising demand faster than capacity', 7000, 5600, 8000, 3300, 4300, 0.90, 0.93, 0.95, 0.92),
  jp: mkMeta('stable', 1, 'Weak JPY offsetting premium fab cost inflation', 7800, 6300, 8800, 3600, 4600, 0.88, 0.95, 0.99, 0.95),
};

export function computeClientRiskProfile(countryId: string, autoCount: number): { overall: number; label: string; dims: PCBCountryMeta['risk']; singleSource: number } {
  const dims = PCB_COUNTRY_META[countryId]?.risk ?? { geopolitical: 0.7, logisticsReliability: 0.8, qualityConsistency: 0.8, leadTimeVariance: 0.8 };
  const singleSource = Math.max(0.3, 1 - Math.min(autoCount, 12) * 0.05);
  const overall = dims.geopolitical * 0.25 + dims.logisticsReliability * 0.20 + dims.qualityConsistency * 0.25 + singleSource * 0.15 + dims.leadTimeVariance * 0.15;
  const label = overall >= 0.85 ? 'Low Risk' : overall >= 0.68 ? 'Medium Risk' : 'High Risk';
  return { overall, label, dims, singleSource };
}
