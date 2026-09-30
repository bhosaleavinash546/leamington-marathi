/**
 * The PCB cost overview every report prints.
 *
 * The master report and the PCB PDF used to print `costEstimates` — the AI's
 * first-pass fab/assembly guess plus the 100K BOM — as "Total Estimate". On the
 * 2026-09-29 radar run that read £101.34 while the same report's country table
 * said China £77.75 and the screen headline said £77.75. The headline is the
 * selected country's deterministic breakdown; this builds the rows from it, so
 * the reports cannot disagree with the screen again.
 */
import type { PCBImageAnalysis } from './types.js';

export interface PCBCostOverviewRow { label: string; value: number; note?: string }

export interface PCBCostOverview {
  /** True when built from the selected country's breakdown (the headline). */
  fromCountry: boolean;
  /** "China (Shenzhen / Suzhou) · 250,000 boards/yr" or the AI first-pass label. */
  basis: string;
  rows: PCBCostOverviewRow[];
  total: number;
  low: number | null;
  high: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function pcbCostOverview(r: PCBImageAnalysis, pageQty?: number): PCBCostOverview {
  const bd = r._selectedCountryBreakdown;
  const qty = r._programPricing?.annualProgramVolume || pageQty || 0;
  const band = r._confidenceBand;
  if (bd && bd.totalPerBoard > 0) {
    const four = bd.pcbFabPerBoard + bd.assemblyPerBoard + bd.bomCostPerBoard + bd.logisticsPerBoard;
    const other = r2(bd.totalPerBoard - four);
    const ag = bd.automotiveGrade;
    const rows: PCBCostOverviewRow[] = [
      { label: 'Components (BOM)', value: bd.bomCostPerBoard, note: 'sourced in-country' },
      { label: 'Bare board (fab)', value: bd.pcbFabPerBoard, note: ag ? `incl. £${ag.fabPremiumGBP.toFixed(2)} automotive grade` : undefined },
      { label: 'Assembly & test', value: bd.assemblyPerBoard, note: ag ? `incl. £${ag.assemblyPremiumGBP.toFixed(2)} IATF / class 3 / ${ag.asil}` : undefined },
      { label: 'Logistics & import duty', value: bd.logisticsPerBoard },
    ];
    if (Math.abs(other) >= 0.005) rows.push({ label: 'Energy, packaging & yield loss', value: other });
    const bandOk = band && band.totalLow > 0 && band.totalHigh >= band.totalLow;
    return {
      fromCountry: true,
      basis: `${bd.countryName}${qty > 0 ? ` · ${qty.toLocaleString('en-GB')} boards/yr` : ''}${ag ? ` · automotive grade (${ag.asil})` : ''}`,
      rows,
      total: bd.totalPerBoard,
      low: bandOk ? band!.totalLow : null,
      high: bandOk ? band!.totalHigh : null,
    };
  }
  const co = r.costEstimates;
  return {
    fromCountry: false,
    basis: 'AI first-pass estimate (no country costing returned)',
    rows: [
      { label: 'Components (BOM)', value: co.totalBOMCostGBP },
      { label: 'Bare board (fab)', value: co.pcbFabGBP.mid },
      { label: 'Assembly', value: co.smtAssemblyCostGBP },
    ],
    total: r2(co.totalBOMCostGBP + co.pcbFabGBP.mid + co.smtAssemblyCostGBP),
    low: r2(co.totalBOMCostGBP + co.pcbFabGBP.min + co.smtAssemblyCostGBP),
    high: r2(co.totalBOMCostGBP + co.pcbFabGBP.max + co.smtAssemblyCostGBP),
  };
}
