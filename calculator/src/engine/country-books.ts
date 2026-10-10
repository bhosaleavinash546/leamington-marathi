/**
 * Country rate books — a country's OWN rates, where it has evidence, in place of "UK × a factor".
 *
 * The regional library scaled the UK book: every machine × one capex multiplier, every material × one family factor.
 * The India review (Oct 2026, docs/rates/india-rate-book-2026-10.md) found that UK capital, UK hours and UK labour
 * levels carried straight into India: a 3-axis VMC whose depreciation implied a ~₹3.7 crore machine against ~₹35 lakh
 * domestic, machinists at ₹654/h against ~₹160–200/h. A country book holds what that country's evidence gives:
 *
 *  - materials: £/kg per library id (an India mill / producer / market price, or anchor + a stated grade extra);
 *  - machines: the country's operating model (hours, shift-pattern depreciation, finance, rent, tariff, support staff
 *    at its wages) on every machine; the country's CAPEX where a group has evidence (a reference machine, sized within
 *    the group by the book's own relative capital), the held regional capital otherwise — labelled;
 *  - labour: process grades the regional table has no category for.
 *
 * The data is GENERATED (`scripts/country-book.ts` from a dated config in `scripts/rate-refresh/`) — never edited by
 * hand. What a book does not cover falls back to the regional scaling and says so.
 */
import type { MachineRate, MachineRateBuildup, MaterialRate, Confidence } from './types.js';
import { computeMachineRatePerHr } from './rate-library-merge.js';
import { INDIA_BOOK } from './country-books/in.js';

export interface CountryMaterialPrice { gbpPerKg: number; scrapGbpPerKg?: number; basis: string; source: string; confidence: Confidence }
export interface CountryMachineGroup {
  id: string;
  /** Machine ids in the group (regex on the library id). */
  match: string;
  /** The machine the capex evidence is for, and its installed capex in the country, £. */
  refId: string;
  refCapexGbp: number;
  basis: string;
  source: string;
  confidence: Confidence;
}
export interface CountryMachineModel {
  hoursPerYear: number;
  /** Schedule II-style uplift on a held (2-shift) capital charge at this country's shift pattern. */
  shiftDepreciationFactor: number;
  /** Life for a machine whose capex is the country's own (a group). */
  lifeYears: number;
  financeRate: number;
  /** The rate the book's finance line was built at (to re-rate a held finance line). */
  ukFinanceRate: number;
  maintenancePctOfCapex: number;
  rentGbpPerM2Yr: number;
  /** The UK basis the book's floor £ is read back to m² with. */
  ukRentGbpPerM2Yr: number;
  ukElectricityGbpPerKwh: number;
  /** Support staff: this country's skilled rate ÷ the UK's (the book's indirect line is people). */
  labourRatio: number;
  /** The capital a machine with no group keeps: the regional scaling it had (UK × this). */
  capitalHeldFactor: number;
  basis: string;
  heldBasis: string;
  groups: CountryMachineGroup[];
}
export interface CountryBook {
  region: string;
  asOf: string;
  fxToGBP: number;
  /** Labour grades by suffix (lab-uk-<suffix>) the regional categories do not hold, £/h fully loaded. */
  labourGrades: Record<string, { gbpPerHr: number; basis: string; source: string; confidence: Confidence }>;
  machines: CountryMachineModel;
  materials: Record<string, CountryMaterialPrice>;
}

export const COUNTRY_BOOKS: Record<string, CountryBook | undefined> = { IN: INDIA_BOOK };

const r0 = (n: number) => Math.round(n);

/** The group a machine falls in, or null (the machine keeps the regional scaling). */
export function machineGroupOf(book: CountryBook, id: string): CountryMachineGroup | null {
  return book.machines.groups.find(g => new RegExp(g.match).test(id)) ?? null;
}

/**
 * A machine in the country's book. Every machine runs the country's OPERATING model: its hours, rent, tariff, finance
 * and support staff at its wages (kWh per running hour, m² and the support line are read back from the book's own
 * figures). Its CAPITAL is the country's where a group has capex evidence — the group's reference capex × this
 * machine's book capital ÷ the reference's (the book's relative size, the country's level), over `lifeYears` — and
 * otherwise the capital it had (UK × `capitalHeldFactor`) with the shift-pattern depreciation uplift, labelled HELD.
 */
export function countryMachine(book: CountryBook, ukMachine: MachineRate, ukLibraryMachines: readonly MachineRate[],
  electricityGbpPerKwh: number, regionName: string): MachineRate | null {
  const M = book.machines;
  if (!(M.hoursPerYear > 0)) return null;
  const b = ukMachine.buildup;
  const hr = M.hoursPerYear / b.annualAvailableHours;
  const kwh = b.energy / M.ukElectricityGbpPerKwh;
  const m2 = b.floorSpace / M.ukRentGbpPerM2Yr;
  const g = machineGroupOf(book, ukMachine.id);
  const ref = g ? ukLibraryMachines.find(m => m.id === g.refId) : undefined;
  let capital: Pick<MachineRateBuildup, 'annualDepreciation' | 'maintenance' | 'financeCost'>;
  let what: string;
  let confidence: Confidence;
  if (g && ref && ref.buildup.annualDepreciation > 0) {
    const size = b.annualDepreciation / ref.buildup.annualDepreciation;
    const capex = g.refCapexGbp * size;
    capital = { annualDepreciation: r0(capex / M.lifeYears), maintenance: r0(capex * M.maintenancePctOfCapex), financeCost: r0(capex / 2 * M.financeRate) };
    what = `capex £${r0(capex).toLocaleString('en-GB')} (${g.id}: ${g.refId} £${r0(g.refCapexGbp).toLocaleString('en-GB')}`
      + `${Math.abs(size - 1) > 1e-9 ? ` × book size ${size.toFixed(3)}` : ''} — ${g.basis}), ${M.lifeYears}-yr life, `
      + `maintenance ${(M.maintenancePctOfCapex * 100).toFixed(1)}% of capex, finance ${(M.financeRate * 100).toFixed(2)}% on half the capex`;
    confidence = g.confidence;
  } else {
    const f = M.capitalHeldFactor;
    capital = {
      annualDepreciation: r0(b.annualDepreciation * f * M.shiftDepreciationFactor),
      maintenance: r0(b.maintenance * f * hr),
      financeCost: r0(b.financeCost * f * M.financeRate / M.ukFinanceRate),
    };
    what = `capital HELD at the book's UK × ${f} (${M.heldBasis}): depreciation × ${M.shiftDepreciationFactor.toFixed(3)} (shift pattern), `
      + `maintenance per running hour held, finance re-rated ${(M.ukFinanceRate * 100).toFixed(0)}% → ${(M.financeRate * 100).toFixed(2)}%`;
    confidence = 'Low';
  }
  const buildup: MachineRateBuildup = {
    ...capital,
    energy: r0(kwh * hr * electricityGbpPerKwh),
    floorSpace: r0(m2 * M.rentGbpPerM2Yr),
    indirectSupport: r0(b.indirectSupport * M.labourRatio),
    annualAvailableHours: M.hoursPerYear,
    machineUtilization: b.machineUtilization,
  };
  return {
    ...ukMachine,
    buildup,
    computedRatePerHr: computeMachineRatePerHr(buildup),
    region: regionName,
    sourceNote: `${regionName} book ${book.asOf}: ${what}; ${r0(m2)} m² at £${M.rentGbpPerM2Yr.toFixed(2)}/m²/yr, `
      + `${r0(kwh * hr).toLocaleString('en-GB')} kWh at £${electricityGbpPerKwh}/kWh, support at ${M.labourRatio.toFixed(4)} of UK wages, `
      + `${M.hoursPerYear.toLocaleString('en-GB')} h × ${b.machineUtilization} (${M.basis})`,
    confidence,
  };
}

/** A material at the country's own price, or null (the regional factor applies). */
export function countryMaterial(book: CountryBook, m: MaterialRate, regionName: string): MaterialRate | null {
  const p = book.materials[m.id];
  if (!p) return null;
  const scrap = p.scrapGbpPerKg ?? (m.pricePerKg > 0 ? m.scrapRecoveryPricePerKg * (p.gbpPerKg / m.pricePerKg) : m.scrapRecoveryPricePerKg);
  return {
    ...m,
    pricePerKg: p.gbpPerKg,
    scrapRecoveryPricePerKg: Math.min(scrap, p.gbpPerKg),
    region: regionName,
    effectiveDate: book.asOf,
    sourceNote: `${regionName} book ${book.asOf}: ₹${(p.gbpPerKg * book.fxToGBP).toFixed(2)}/kg — ${p.basis} (${p.source})`,
    confidence: p.confidence,
  };
}
