/**
 * Merge an ECU board-research file into the vehicle-electronics library (server/data/pcb-ecu-library.json).
 *
 *   npx tsx scripts/pcb-ecu-library-merge.ts scripts/pcb-research/2026-10-09-adas/ecu-map-adas-boards.json [--write]
 *
 * Rules: an ECU already in the library keeps its key ICs; new key-IC rows are added (same role + examples once).
 * Its board facts (`pcb`) and placements are replaced by the research's when the research states a basis.
 * A new ECU is added and listed under every powertrain it names. A key-IC row with no source ("no source
 * found") is dropped — every claim must carry a URL or "engineering judgement". Teardown links and the
 * board-cost evidence ADD to what the library holds (the same link / claim once) — a later round never wipes an earlier
 * round's evidence. Nothing is invented here: the research file is the source.
 */
import { readFileSync, writeFileSync } from 'node:fs';

type KeyIc = { role: string; examples: string[]; source: string };
type Ecu = { ecu: string; name: string; function: string; powertrains: string[]; pcb?: Record<string, string>;
  placements?: Record<string, string>; keyIcs: KeyIc[]; teardowns?: Array<{ title: string; url: string; finding: string }> };

const FILE = new URL('../server/data/pcb-ecu-library.json', import.meta.url);
const sourced = (s: string) => /^https?:\/\/|engineering judgement/i.test(String(s ?? ''));

export function mergeEcuResearch(lib: { ecus: Ecu[]; powertrains: Array<Record<string, unknown>>; notes?: string[]; sources?: string[]; [k: string]: unknown },
                                 research: { domain?: string; researched: string; ecus: Ecu[]; boardCostEvidence?: Array<{ claim: string; url: string }>; notes?: string[] }) {
  const report = { updated: [] as string[], added: [] as string[], droppedKeyIcs: [] as string[] };
  for (const r of research.ecus) {
    const keyIcs = r.keyIcs.filter(k => {
      if (sourced(k.source)) return true;
      report.droppedKeyIcs.push(`${r.ecu} ${k.role}: ${k.source}`); return false;
    });
    const placements = r.placements && sourced(r.placements.basis) ? r.placements : undefined;
    const pcb = r.pcb && sourced(r.pcb.basis) ? r.pcb : undefined;
    const have = lib.ecus.find(e => e.ecu === r.ecu);
    if (have) {
      const sig = (k: KeyIc) => `${k.role}|${k.examples.join(',')}`;
      const seen = new Set(have.keyIcs.map(sig));
      have.keyIcs.push(...keyIcs.filter(k => !seen.has(sig(k))));
      if (pcb) have.pcb = pcb;
      if (placements) have.placements = placements;
      if (r.teardowns?.length) {
        const urls = new Set((have.teardowns ?? []).map(t => t.url));
        have.teardowns = [...(have.teardowns ?? []), ...r.teardowns.filter(t => !urls.has(t.url))];
      }
      have.name = r.name || have.name;
      report.updated.push(r.ecu);
    } else {
      lib.ecus.push({ ecu: r.ecu, name: r.name, function: r.function, powertrains: r.powertrains,
        ...(pcb ? { pcb } : {}), ...(placements ? { placements } : {}), keyIcs, ...(r.teardowns?.length ? { teardowns: r.teardowns } : {}) });
      for (const pt of lib.powertrains) {
        if (!r.powertrains.includes(String(pt.id))) continue;
        const list = pt.ecus as string[] | undefined;
        if (Array.isArray(list) && !list.includes(r.ecu)) list.push(r.ecu);
      }
      report.added.push(r.ecu);
    }
  }
  if (research.boardCostEvidence?.length) {
    const have = (lib.boardCostEvidence ?? []) as Array<{ claim: string; url: string }>;
    const seen = new Set(have.map(x => `${x.url}|${x.claim}`));
    lib.boardCostEvidence = [...have, ...research.boardCostEvidence.filter(x => !seen.has(`${x.url}|${x.claim}`))];
  }
  const label = research.domain ?? 'board research';
  lib.notes = [...(lib.notes ?? []), ...(research.notes ?? []).map(n => `${label} (${research.researched}): ${n}`)];
  const urls = research.ecus.flatMap(e => [...e.keyIcs.map(k => k.source), ...(e.teardowns ?? []).map(t => t.url)]).filter(u => /^https?:\/\//.test(u));
  lib.sources = [...new Set([...(lib.sources ?? []), ...urls])];
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const research = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const lib = JSON.parse(readFileSync(FILE, 'utf8'));
  const report = mergeEcuResearch(lib, research);
  console.log(JSON.stringify(report, null, 1), `\n${lib.ecus.length} ECUs`);
  if (process.argv.includes('--write')) { writeFileSync(FILE, JSON.stringify(lib, null, 2) + '\n'); console.log('written'); }
}
