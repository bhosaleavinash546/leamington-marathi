/**
 * The PCB pickers follow the selected manufacturing country (pcb-market.ts).
 * They used to be independent: the photo-costing picker defaulted to China and
 * the PCB fab form to the UK whatever country was selected for the costing.
 */
import { pcbMarketFor, pcbFabRegionFor } from '../engine/pcb-market.js';
import { REGIONAL_DATA, type ManufacturingRegion } from '../engine/regional-rates.js';

/** The PCB-market note for a country — '' when the country has its own EMS data. */
export function pcbMarketNote(region: ManufacturingRegion): string {
  const m = pcbMarketFor(region);
  return m.own ? '' : `${REGIONAL_DATA[region]?.name ?? region}: no EMS price data — priced in the ${m.basis}.`;
}

/** Point every PCB picker on the page at the country's market; show why when it is not the country's own. */
export function syncPcbPickers(region: ManufacturingRegion, doc: Document = document): void {
  const mkt = pcbMarketFor(region);
  const pcb = doc.getElementById('pcb-mfg-country') as HTMLSelectElement | null;
  if (pcb && Array.from(pcb.options).some(o => o.value === mkt.id)) pcb.value = mkt.id;
  const note = doc.getElementById('pcb-market-note');
  if (note) note.textContent = pcbMarketNote(region);
  const fab = pcbFabRegionFor(region);
  const fabSel = doc.getElementById('pcbf-region') as HTMLSelectElement | null;
  if (fabSel) fabSel.value = fab.region;
  const fabNote = doc.getElementById('pcbf-region-note');
  if (fabNote) fabNote.textContent = fab.basis ? `${REGIONAL_DATA[region]?.name ?? region}: ${fab.basis}.` : '';
}
