// Board coverage: of the parts each ECU's key-IC rows NAME, how many resolve to a distributor-priced catalogue entry.
// Usage: npx tsx scripts/pcb-research/2026-10-09-ev/coverage.mts [catalogue.json]
import { readFileSync } from 'node:fs';
const libPath = new URL('../../../server/data/pcb-ecu-library.json', import.meta.url);
const catPath = process.argv[2] ?? new URL('../../../server/data/pcb-component-catalogue.json', import.meta.url).pathname;
const lib = JSON.parse(readFileSync(libPath, 'utf8'));
const cat = JSON.parse(readFileSync(catPath, 'utf8'));
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const keys = new Map<string, string>();
for (const e of cat.parts) for (const k of [e.mpn, e.family, ...(e.aliases ?? [])]) if (k && norm(k).length >= 5) {
  const n = norm(k); if (!keys.has(n) || e.confidence === 'distributor') keys.set(n, e.confidence);
}
const resolves = (tok: string) => { const t = norm(tok); if (t.length < 5) return null;
  if (keys.has(t)) return keys.get(t)!;
  for (const [k, c] of keys) if (k.length >= 6 && (t.startsWith(k) || k.startsWith(t))) return c;
  return null; };
const ids = (process.env.ECUS ?? 'BMS_CMU,BMS_BMU,BMS48,IBS,OBC,DCDC_HV,DCDC48,CCU,TINV,PCU,BSG_INV,EBOOST,ECOMP,PTC,TMS,VCU,EPS,ESC,ACU,BCM,GW,SEAT,DOOR,HVAC,HEADLAMP,CLUSTER,IVI,TEL,ECM,TCM,IGN,FPC,GPCU,NOX,DCU').split(',');
let named = 0, priced = 0, est = 0;
const rows: string[] = [];
for (const id of ids) {
  const e = lib.ecus.find((x: { ecu: string }) => x.ecu === id);
  const toks = new Set<string>();
  for (const k of e.keyIcs) for (const ex of k.examples) for (const t of String(ex).split(/[\s,;/()]+/)) if (/[A-Z]/i.test(t) && /\d/.test(t) && t.length >= 5) toks.add(norm(t));
  let p = 0, s = 0;
  for (const t of toks) { const c = resolves(t); if (c === 'distributor') p++; else if (c) s++; }
  named += toks.size; priced += p; est += s;
  rows.push(`${id.padEnd(9)} named ${String(toks.size).padStart(3)}  distributor ${String(p).padStart(3)}  estimate ${s}`);
}
console.log(rows.join('\n'));
console.log(`TOTAL named ${named}  distributor-priced ${priced} (${Math.round(100 * priced / named)} %)  estimate ${est}`);
