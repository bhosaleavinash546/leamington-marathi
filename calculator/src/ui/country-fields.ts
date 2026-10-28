/**
 * The shop fields a country switch sets — overhead %, packaging and logistics —
 * from the same engine function headless costing uses (`regionalShopDefaults`),
 * so a part costs the same in China on the screen and in a bulk run.
 *
 * Packaging and logistics keep a UK-basis figure: the size-aware estimate the CAD
 * path computed, or what the engineer typed while in the UK. A switch shows that
 * basis × the country's multiplier. Before this, the switch wrote to field ids
 * that do not exist (`packaging-cost`, `logistics-cost`), so packaging and
 * logistics never followed the country at all; and its flat £0.15 / £0.25 would
 * have replaced the size-aware estimate if it had.
 */
import { regionalShopDefaults, REGIONAL_DATA, type ManufacturingRegion } from '../engine/regional-rates.js';

const basis: { packagingPerPart?: number; logisticsPerPart?: number } = {};

/** Where each figure came from — the cost card's Basis grades it by this (it read a size estimate as "Typed"). */
export type ShopFigureSource = 'default' | 'size' | 'typed';
const source: Record<'packaging' | 'logistics', ShopFigureSource> = { packaging: 'default', logistics: 'default' };
export function shopFigureSource(field: 'packaging' | 'logistics'): ShopFigureSource { return source[field]; }

/** Record the UK-basis packaging / logistics (the CAD estimate, or a figure typed in the UK). */
export function setShopBasisUK(b: { packagingPerPart?: number; logisticsPerPart?: number }): void {
  if (b.packagingPerPart !== undefined) { basis.packagingPerPart = b.packagingPerPart; source.packaging = 'size'; }
  if (b.logisticsPerPart !== undefined) { basis.logisticsPerPart = b.logisticsPerPart; source.logistics = 'size'; }
}

/** A figure typed into a field while `region` is active, taken back to its UK basis. */
export function shopBasisFromTyped(region: ManufacturingRegion, field: 'packaging' | 'logistics', value: number, byPerson = true): void {
  const rd = REGIONAL_DATA[region] ?? REGIONAL_DATA.UK;
  const m = field === 'packaging' ? rd.packagingMultiplier : rd.logisticsMultiplier;
  if (!(value >= 0) || !(m > 0)) return;
  if (field === 'packaging') basis.packagingPerPart = value / m; else basis.logisticsPerPart = value / m;
  // a figure a person typed; the programmatic input events that follow a fill or a country switch are not
  if (byPerson) source[field] = 'typed';
}

/** The packaging and logistics a region shows for the current basis. */
export function shopFieldsFor(region: ManufacturingRegion): { overheadPct: number; packagingPerPart: number; logisticsPerPart: number } {
  return regionalShopDefaults(region, basis);
}

/** Write overhead, packaging and logistics for `region` into the form. Returns the overhead % set. */
export function applyCountryShopFields(region: ManufacturingRegion, doc: Document = document): { overheadPct: number; changedOverhead: boolean } {
  const f = shopFieldsFor(region);
  const set = (id: string, v: number) => {
    const e = doc.getElementById(id) as HTMLInputElement | null;
    if (!e) return false;
    const prev = Number(e.value);
    e.value = String(v);
    return Math.abs(prev - v) > 1e-9;
  };
  const ohPct = Math.round(f.overheadPct * 1000) / 10;
  const changedOverhead = set('overhead-pct', ohPct);
  set('packaging', Math.round(f.packagingPerPart * 10_000) / 10_000);
  set('logistics', Math.round(f.logisticsPerPart * 10_000) / 10_000);
  return { overheadPct: ohPct, changedOverhead };
}
