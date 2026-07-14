/**
 * Country rate-library Excel export — the "don't take my word for it" artifact.
 *
 * Dumps the ACTIVE rate library (every labour, machine, material and energy
 * rate, with its full source-note audit trail) plus the complete multi-country
 * reference database and the adjustment methodology. Generated straight from
 * the engine's data structures, so it can never drift from what the
 * calculator actually uses.
 */

import type { RateLibrary } from '../engine/types.js';
import {
  REGIONAL_DATA,
  classifyMaterialFamily,
  type ManufacturingRegion,
} from '../engine/regional-rates.js';
import { buildWorkbook, downloadWorkbook } from './xlsx-util.js';

const FAMILY_LABEL: Record<string, string> = {
  commodity: 'Commodity resin (regional feedstock index)',
  engineering: 'Engineering resin (blended regional index)',
  highPerformance: 'High-performance resin (globally traded — ~flat)',
  exchangeMetal: 'Exchange-traded metal (LME global — ~flat)',
  rubber: 'Gum rubber (globally traded — ~flat)',
  millSteel: 'Mill steel (conversion-cost regional index)',
  other: 'Other (regional index)',
};

export async function exportActiveRates(library: RateLibrary, region: ManufacturingRegion): Promise<void> {
  const rd = REGIONAL_DATA[region];
  const today = new Date().toISOString().slice(0, 10);

  // ── Sheet 1: methodology ──
  const methodology: unknown[][] = [
    [`ACTIVE COUNTRY RATE LIBRARY — ${rd.name} (${region})`],
    [`Exported ${today} · library version ${library.version}`],
    [],
    ['HOW COUNTRY COSTING WORKS — 3-TIER DATA MODEL'],
    [],
    ['Tier 1 — ABSOLUTE COUNTRY RATES (replaced, not multiplied)'],
    ['· Labour', '8 fully-loaded rates per country (skilled/semi-skilled/engineer/foundry/electronics/inspector/technician/supervisor), £/hr equivalent'],
    ['· Energy', 'Actual industrial electricity & gas tariffs (£/kWh); machine-rate energy component re-tariffed at the country price'],
    ['· Currency & FX', 'Per-country currency with FX to GBP'],
    ['· Authentic material prices', 'Extrusion & thermoforming resin grades carry real per-country £/kg prices used directly'],
    [],
    ['Tier 2 — ECONOMICALLY-STRUCTURED FACTORS'],
    ['· Materials', 'Family-aware: commodity resins widest spread; engineering resins moderate; high-performance resins, LME metals & gum rubber held ~flat (global markets); mill steel regional'],
    ['· Machine rates', 'Capex/maintenance/floorspace/finance scaled by country index; energy recomputed from actual kWh × country tariff; £/hr rebuilt from the build-up'],
    ['· Overheads / packaging / logistics', 'Per-country indices + cross-region shipping premium'],
    [],
    ['Tier 3 — POLICY PERCENTAGES'],
    ['· SGA & profit', 'Percentages (commercial policy, not geography) applied to the country-adjusted cost base — absolute SGA&P therefore differs by country'],
    [],
    ['AUDIT TRAIL', 'Every rate below carries its source note describing exactly how it was derived. Regional benchmarks are marked confidence=Low — they are estimates, not quotes.'],
    [],
    ['ACTIVE COUNTRY PARAMETERS'],
    ['Country', rd.name],
    ['Currency', `${rd.currency} (1 GBP = ${rd.fxToGBP} ${rd.currency})`],
    ['Electricity £/kWh', rd.energy.electricityPerKwh],
    ['Gas £/kWh', rd.energy.gasPerKwh],
    ['Material factor — commodity resin', rd.materialFactors.commodityResin],
    ['Material factor — engineering resin', rd.materialFactors.engineeringResin],
    ['Material factor — high-perf resin / LME metals', rd.materialFactors.highPerfResin],
    ['Material factor — mill steel & other', rd.materialMultiplier],
    ['Machine capex index', rd.machineRateMultiplier],
    ['Overhead index', rd.overheadMultiplier],
    ['Packaging index', rd.packagingMultiplier],
    ['Logistics index', rd.logisticsMultiplier],
  ];

  // ── Sheet 2: labour ──
  const labour: unknown[][] = [
    ['ID', 'Skill level', 'Region', 'Fully-loaded £/hr', 'Effective', 'Confidence', 'Source / audit trail'],
    ...library.labour.map(l => [l.id, l.skillLevel, l.region, l.fullyLoadedRatePerHr, l.effectiveDate, l.confidence, l.sourceNote]),
  ];

  // ── Sheet 3: machines (with full build-up so the £/hr is reproducible) ──
  const machines: unknown[][] = [
    ['ID', 'Machine class', 'Region', '£/hr (computed)', 'Depreciation £/yr', 'Maintenance £/yr', 'Energy £/yr', 'Floorspace £/yr', 'Indirect £/yr', 'Finance £/yr', 'Available hrs/yr', 'Utilization', 'Confidence', 'Source / audit trail'],
    ...library.machines.map(m => [
      m.id, m.machineClass, m.region, m.computedRatePerHr,
      m.buildup?.annualDepreciation ?? '', m.buildup?.maintenance ?? '', m.buildup?.energy ?? '',
      m.buildup?.floorSpace ?? '', m.buildup?.indirectSupport ?? '', m.buildup?.financeCost ?? '',
      m.buildup?.annualAvailableHours ?? '', m.buildup?.machineUtilization ?? '',
      m.confidence, m.sourceNote,
    ]),
  ];

  // ── Sheet 4: materials ──
  const materials: unknown[][] = [
    ['ID', 'Grade', 'Category', 'Pricing family', 'Region', '£/kg', 'Scrap recovery £/kg', 'Density kg/m³', 'Confidence', 'Source / audit trail'],
    ...library.materials.map(m => [
      m.id, m.grade, m.category, FAMILY_LABEL[classifyMaterialFamily(m)] ?? 'Other',
      m.region, m.pricePerKg, m.scrapRecoveryPricePerKg, m.densityKgPerM3, m.confidence, m.sourceNote,
    ]),
  ];

  // ── Sheet 5: energy ──
  const energy: unknown[][] = [
    ['ID', 'Region', 'Electricity £/kWh', 'Gas £/kWh', 'Effective', 'Confidence', 'Source / audit trail'],
    ...library.energy.map(e => [e.id, e.region, e.electricityPerKwh, e.gasPerKwh, e.effectiveDate, e.confidence, e.sourceNote]),
  ];

  // ── Sheet 6: the full multi-country reference database ──
  const regions = Object.entries(REGIONAL_DATA) as Array<[ManufacturingRegion, typeof rd]>;
  const countryDb: unknown[][] = [
    ['THE COUNTRY DATABASE — all values held per country (2026 Q2 benchmarks, £-equivalent)'],
    [],
    ['Country', 'Code', 'Currency', 'FX to GBP',
      'Labour: skilled £/hr', 'semi-skilled', 'engineer', 'foundry', 'electronics', 'inspector', 'technician', 'supervisor',
      'Electricity £/kWh', 'Gas £/kWh',
      'Factor: commodity resin', 'engineering resin', 'high-perf/LME', 'mill steel & other',
      'Machine capex idx', 'Overhead idx', 'Packaging idx', 'Logistics idx'],
    ...regions.map(([code, d]) => [
      d.name, code, d.currency, d.fxToGBP,
      d.labour.skilled, d.labour.semiskilled, d.labour.engineer, d.labour.foundry,
      d.labour.electronics, d.labour.inspector, d.labour.technician, d.labour.supervisor,
      d.energy.electricityPerKwh, d.energy.gasPerKwh,
      d.materialFactors.commodityResin, d.materialFactors.engineeringResin, d.materialFactors.highPerfResin, d.materialMultiplier,
      d.machineRateMultiplier, d.overheadMultiplier, d.packagingMultiplier, d.logisticsMultiplier,
    ]),
  ];

  const wb = await buildWorkbook([
    { name: 'Methodology', rows: methodology, cols: [38, 100] },
    { name: 'Labour Rates', rows: labour, cols: [22, 16, 16, 16, 12, 11, 80] },
    { name: 'Machine Rates', rows: machines, cols: [24, 26, 16, 13, 14, 14, 12, 13, 12, 12, 14, 11, 11, 80] },
    { name: 'Material Prices', rows: materials, cols: [20, 26, 16, 40, 16, 10, 16, 13, 11, 80] },
    { name: 'Energy Tariffs', rows: energy, cols: [18, 16, 16, 12, 12, 11, 60] },
    { name: 'Country Database', rows: countryDb, cols: [18, 6, 9, 9, ...Array(8).fill(12), 13, 10, ...Array(4).fill(14), 13, 11, 12, 11] },
  ]);
  await downloadWorkbook(wb, `costvision-rates-${region}-${today}.xlsx`);
}
