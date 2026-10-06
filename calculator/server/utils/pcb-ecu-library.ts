/**
 * The vehicle-electronics library (Oct 2026 research — docs/pcb/component-database-2026-10.md):
 * which ECUs each powertrain carries (ICE, MHEV, HEV, PHEV, BEV 400 V / 800 V), their typical
 * board, and the key ICs by role, each with its source or "engineering judgement".
 *
 * Each example chip that names a catalogue part is linked to its catalogue price at the
 * requested annual volume (the same lookup a BOM line uses); an example that names no
 * catalogue part stays text — it is never priced by guesswork.
 */
import { readFileSync } from 'node:fs';
import { catalogueEntry, cataloguePriceAt } from './pcb-price-catalogue.js';

interface KeyIc { role: string; examples: string[]; source?: string }
interface Ecu { ecu: string; name: string; function: string; powertrains: string[]; pcb?: Record<string, string>; placements?: Record<string, string>; keyIcs: KeyIc[] }
interface Library { researched: string; powertrains: Array<Record<string, unknown>>; ecus: Ecu[]; sources: string[] }

const LIB: Library = JSON.parse(readFileSync(new URL('../data/pcb-ecu-library.json', import.meta.url), 'utf8'));

export interface LinkedPart { example: string; mpn: string; mfr: string; desc: string; confidence: string; asOf: string; unitGBP: number | null }

/** Catalogue parts named in an example ("NXP S32K344" → S32K344…, "TI AWR2944 (4 Tx)" → AWR2944…). */
export function linkExample(example: string, volume: number): LinkedPart[] {
  const out: LinkedPart[] = [];
  const seen = new Set<string>();
  for (const tok of example.split(/[\s,;()/·×]+/)) {
    if (tok.length < 4 || !/\d/.test(tok) || !/[A-Za-z]/.test(tok)) continue;
    const e = catalogueEntry(tok);
    if (!e || seen.has(e.mpn)) continue;
    seen.add(e.mpn);
    out.push({ example, mpn: e.mpn, mfr: e.mfr, desc: e.desc, confidence: e.confidence, asOf: e.asOf, unitGBP: cataloguePriceAt(e.mpn, volume) });
  }
  return out;
}

export function ecuLibrary(volume = 100_000) {
  return {
    researched: LIB.researched, volume, sources: LIB.sources, powertrains: LIB.powertrains,
    ecus: LIB.ecus.map(e => ({ ...e, keyIcs: e.keyIcs.map(k => ({ ...k, parts: k.examples.flatMap(x => linkExample(x, volume)) })) })),
  };
}
