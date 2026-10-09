import { readFileSync } from 'node:fs';
import { icKnownRange } from '/home/user/leamington-marathi/calculator/server/routes/pcb.ts';
const L = console.log; console.log = () => {}; console.warn = () => {};
const CAT = JSON.parse(readFileSync('/home/user/leamington-marathi/calculator/server/data/pcb-component-catalogue.json', 'utf8'));
let n = 0, out = 0; const rows: string[] = [];
for (const e of CAT.parts) {
  const kr = icKnownRange({ partNumber: e.mpn, description: e.desc });
  if (!kr) continue; n++;
  const p = e.gbp.q100k;
  if (p < kr.lo * 0.5 || p > kr.hi * 2) { out++; rows.push(`${e.mpn.padEnd(26)} ${e.category?.padEnd(14) ?? ''} catalogue £${p} (${e.confidence})  vs named range "${kr.label}" £${kr.lo}-${kr.hi}`); }
}
L(`${n} catalogue parts hit a named range; ${out} have a catalogue 100k price outside [0.5×lo, 2×hi]`);
rows.slice(0, 40).forEach(r => L('  ' + r));
// real-world part numbers NOT in the catalogue that collide
for (const pn of ['MCR03EZPFX1002 ROHM', 'RB751S40 ROHM', 'BSS84 ROHM', 'KMR241G', 'SK4B', 'IPD90N04S4', 'IPDQ60R010S7', 'TLS4120', 'MAX40200', 'MAX3232', 'MAX4995', 'TLV9002', 'TLV7031', 'K4A8G165WC', 'K4B4G1646E', 'STM32L431', 'TLE4252', 'TLE7250', 'TLE7368'])
  { const kr = icKnownRange({ partNumber: pn, description: '' }); L(pn.padEnd(22), kr ? `${kr.label} £${kr.lo}-${kr.hi}` : '-'); }
