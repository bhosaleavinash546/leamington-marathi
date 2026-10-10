/**
 * OEM-direct chips (ADAS round 2, 9 Oct 2026, docs/pcb/adas-component-research-2026-10.md §8): parts no distributor
 * sells take a LABELLED ESTIMATE from public cost evidence — a maker's own disclosed average selling price — never a
 * distributor price. Unit-level figures (a whole camera, LiDAR or controller) go to the ECU library's board-cost
 * evidence, not the catalogue.
 *
 *   npx tsx scripts/pcb-oem-evidence-merge.ts <evidence.json> [--write]
 *
 * Rules:
 *  1. Only a figure the chip's MAKER states per chip (company disclosure: annual report, earnings call) prices an
 *     entry. Analyst figures, list prices of modules and ranges wider than 2× stay in the evidence file only.
 *  2. The figure is a programme-volume average selling price, so the entry is FLAT across 1k–300k — no volume
 *     curve is applied to a number that already is a volume price. confidence 'estimate', always.
 *  3. Every claim behind an entry is written into its source with publisher, context and URL.
 *  4. A distributor-priced entry is never overwritten; an estimate of the same key is replaced (aliases kept).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { FX_TO_GBP_TABLE as FX_TO_GBP } from '../src/engine/insights.js'; // the snapshot the catalogue was priced at

type Claim = { part: string; value: number; currency: string; unit: string; quantityContext: string; year: number; type: string;
  publisher: string; url: string; dateRead: string; confidence: string };
type Evidence = { researched: string; groups: Array<{ group: string; claims: Claim[] }> };

/** The reviewed selection: which claim prices which entry, and why it represents the chip. */
export const OEM_ESTIMATES: Array<{ mpn: string; family: string; mfr: string; desc: string; category: string; pkg: string;
  aecq: boolean; claimPart: string; priceUrl: string; why: string }> = [
  { mpn: 'EYEQ4', family: 'EyeQ4', mfr: 'Mobileye', desc: 'EyeQ4 vision SoC (front camera ADAS), sold with Mobileye software',
    category: 'ic_bga', pkg: 'FCBGA', aecq: true, claimPart: 'EYEQ4',
    priceUrl: 'https://www.nasdaq.com/articles/mobileye-eyes-higher-asps-surround-adas-volkswagen-programs-ramp',
    why: 'Mobileye\'s base ADAS price per system (one EyeQ + its software, which is what a Tier 1 buys per camera); the blended quarterly figures ($49–51) include SuperVision' },
  { mpn: 'EYEQ6L', family: 'EyeQ6L', mfr: 'Mobileye', desc: 'EyeQ6 Lite vision SoC (front camera ADAS), sold with Mobileye software',
    category: 'ic_bga', pkg: 'FCBGA', aecq: true, claimPart: 'EYEQ4',
    priceUrl: 'https://www.nasdaq.com/articles/mobileye-eyes-higher-asps-surround-adas-volkswagen-programs-ramp',
    why: 'the base ADAS price covers EyeQ4 and its successor EyeQ6L in the same front-camera product; no EyeQ6L-only figure is published' },
  { mpn: 'EYEQ6H', family: 'EyeQ6H', mfr: 'Mobileye', desc: 'EyeQ6 High vision SoC (Surround ADAS), sold with Mobileye software',
    category: 'ic_bga', pkg: 'FCBGA', aecq: true, claimPart: 'EYEQ6H',
    priceUrl: 'https://www.nasdaq.com/articles/mobileye-eyes-higher-asps-surround-adas-volkswagen-programs-ramp',
    why: 'Mobileye\'s Surround ADAS price (one EyeQ6H + software; the ECU hardware is the Tier 1\'s); the company also gave $100–150, an analyst $150–200' },
  { mpn: 'CV2AQ', family: 'CV2AQ', mfr: 'Ambarella', desc: 'CV2AQ automotive vision SoC (CV2 family)',
    category: 'ic_bga', pkg: 'FCBGA', aecq: true, claimPart: 'CV2AQ',
    priceUrl: 'https://www.fool.com/earnings/call-transcripts/2023/08/29/ambarella-amba-q2-2024-earnings-call-transcript/',
    why: 'Ambarella\'s CV2-family average across automotive and IoT (Aug 2023); individual parts run from under $10 to over $50, so the automotive CV2AQ may sit above it' },
];

/** Unit-level figures for the ECU library's board-cost evidence (whole modules, not chips). */
export const UNIT_EVIDENCE_PARTS = ['HESAI-ALL', 'HESAI-ATX', 'VALEO-SCALA', 'AUDI-ZFAS', 'LG-ADAS-FRONT-CAM'];

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const sym = (c: string) => ({ USD: '$', GBP: '£', EUR: '€', CNY: '¥' }[c] ?? `${c} `);

export function oemEntries(ev: Evidence) {
  const claims = ev.groups.flatMap(g => g.claims);
  return OEM_ESTIMATES.map(s => {
    const mine = claims.filter(c => c.part === s.claimPart);
    const main = mine.find(c => c.url === s.priceUrl);
    if (!main || main.type !== 'company disclosure' || main.unit !== 'per chip') throw new Error(`${s.mpn}: the pricing claim must be a per-chip company disclosure`);
    const fx = FX_TO_GBP[main.currency.toUpperCase()];
    if (fx == null) throw new Error(`${s.mpn}: no FX for ${main.currency}`);
    const gbp = r4(main.value * fx);
    const list = mine.map(c => `${c.publisher} (${c.type}, ${c.confidence} confidence): ${sym(c.currency)}${c.value} ${c.unit} — ${c.quantityContext} <${c.url}>`).join('; ');
    return {
      mpn: s.mpn, family: s.family, mfr: s.mfr, desc: s.desc, category: s.category, pkg: s.pkg, aecq: s.aecq,
      gbp: { q1k: gbp, q10k: gbp, q100k: gbp, q200k: gbp, q300k: gbp },
      confidence: 'estimate' as const,
      source: `OEM-direct part: not sold through distributors. Estimate from public cost evidence, NOT a distributor price or a quote. `
        + `Priced at ${sym(main.currency)}${main.value} (${main.publisher}, ${main.year}) = £${gbp} at the engine's FX, flat across volumes: `
        + `it is a programme-volume average selling price, so no volume curve is applied. Why this figure: ${s.why}. Evidence: ${list}. Read through web search on ${main.dateRead}.`,
      asOf: main.dateRead,
    };
  });
}

export function unitEvidence(ev: Evidence) {
  return ev.groups.flatMap(g => g.claims).filter(c => UNIT_EVIDENCE_PARTS.includes(c.part)).map(c => ({
    claim: `${c.publisher} (${c.type}, ${c.confidence} confidence): ${sym(c.currency)}${c.value} ${c.unit} — ${c.quantityContext}.`,
    url: c.url,
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const evFile = process.argv[2];
  if (!evFile) { console.error('usage: pcb-oem-evidence-merge.ts <evidence.json> [--write]'); process.exit(1); }
  const ev: Evidence = JSON.parse(readFileSync(evFile, 'utf8'));
  const catFile = new URL('../server/data/pcb-component-catalogue.json', import.meta.url);
  const libFile = new URL('../server/data/pcb-ecu-library.json', import.meta.url);
  const cat = JSON.parse(readFileSync(catFile, 'utf8'));
  const lib = JSON.parse(readFileSync(libFile, 'utf8'));
  const report: string[] = [];
  for (const e of oemEntries(ev)) {
    const i = cat.parts.findIndex((p: { mpn: string }) => p.mpn === e.mpn);
    if (i < 0) { cat.parts.push(e); report.push(`added ${e.mpn} £${e.gbp.q1k}`); continue; }
    if (cat.parts[i].confidence === 'distributor') { report.push(`kept ${e.mpn}: distributor-priced`); continue; }
    cat.parts[i] = { ...e, aliases: cat.parts[i].aliases };
    report.push(`replaced estimate ${e.mpn} £${e.gbp.q1k}`);
  }
  const have = new Set((lib.boardCostEvidence ?? []).map((x: { claim: string; url: string }) => `${x.url}|${x.claim}`));
  for (const u of unitEvidence(ev)) if (!have.has(`${u.url}|${u.claim}`)) { (lib.boardCostEvidence ??= []).push(u); report.push(`board evidence: ${u.claim.slice(0, 70)}`); }
  console.log(report.join('\n'));
  if (process.argv.includes('--write')) {
    writeFileSync(catFile, JSON.stringify(cat, null, 1).replace(/^ +/gm, '') + '\n');
    writeFileSync(libFile, JSON.stringify(lib, null, 2) + '\n');
    console.log('written');
  }
}
