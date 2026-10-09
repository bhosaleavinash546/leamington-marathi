import { readFileSync } from 'node:fs';
import { catalogueEntry, normaliseMPN } from '/home/user/leamington-marathi/calculator/server/utils/pcb-price-catalogue.ts';
const CAT = JSON.parse(readFileSync('/home/user/leamington-marathi/calculator/server/data/pcb-component-catalogue.json','utf8'));
const parts = CAT.parts as any[];
const keys = new Set<string>();
for (const e of parts) for (const k of [e.mpn, e.family, ...(e.aliases??[])]) keys.add(normaliseMPN(k));
const res: Record<string, string[]> = { letterAfterFamily: [], digitChangedFamily: [], lastCharMpn: [], digitChangedMpn: [] };
const counts: Record<string, [number, number]> = {};
function test(cat: string, probe: string, src: any) {
  if (keys.has(probe)) return;          // a real catalogued key — not a mutation
  counts[cat] = counts[cat] ?? [0,0]; counts[cat][0]++;
  const e = catalogueEntry(probe);
  if (e) { counts[cat][1]++; res[cat].push(`${probe} -> ${e.mpn} (fam ${e.family}, ${e.confidence}, q100k £${e.gbp.q100k}) [from ${src.mpn}]`); }
}
for (const e of parts) {
  const fam = normaliseMPN(e.family), mpn = normaliseMPN(e.mpn);
  // 1. a variant letter straight after the family stem
  for (const L of 'ABCDEFGHJKLMNPRSTVWXYZ') test('letterAfterFamily', fam + L, e);
  // 2. change one digit in the family stem (a different part number in the same series)
  const m = /^(.*?)(\d)(\D*)$/.exec(fam);
  if (m) for (const d of '0123456789') if (d !== m[2]) test('digitChangedFamily', m[1] + d + m[3], e);
  // 3. last char of the full orderable changed
  if (mpn.length > 5) for (const c of 'AB19') { const p = mpn.slice(0, -1) + c; if (p !== mpn) test('lastCharMpn', p, e); }
  // 4. a digit in the middle of the orderable changed (value / density code)
  const mm = /^([A-Z]+\d{2,})(\d)(.+)$/.exec(mpn);
  if (mm) { const d = mm[2] === '1' ? '2' : '1'; test('digitChangedMpn', mm[1] + d + mm[3], e); }
}
for (const [k,[n,h]] of Object.entries(counts)) console.log(`${k}: ${h} of ${n} mutated codes resolve to a catalogue entry`);
for (const [k, arr] of Object.entries(res)) { console.log(`\n== ${k} (${arr.length}) sample`); for (const s of arr.slice(0, 25)) console.log('  ' + s); }
// letter-after-family where a SIBLING with a different letter exists at a different price
console.log('\n== variant letter resolves to entry X while catalogue has sibling family X+other letter at a different price');
const byFam = new Map<string, any[]>();
for (const e of parts) { const f = normaliseMPN(e.family); (byFam.get(f) ?? byFam.set(f, []).get(f)!).push(e); }
let n=0;
for (const s of res.letterAfterFamily) {
  const [probe, rest] = s.split(' -> ');
  const tgt = rest.split(' ')[0];
  const base = probe.slice(0, -1);
  const sibs = parts.filter(p => { const f = normaliseMPN(p.family); return f.startsWith(base) && f.length === base.length + 1 && /[A-Z]/.test(f.slice(-1)) && f !== probe; });
  const e = catalogueEntry(probe)!;
  const diff = sibs.filter(x => Math.abs(x.gbp.q100k - e.gbp.q100k) / e.gbp.q100k > 0.15);
  if (diff.length) { n++; if (n <= 25) console.log(`  ${probe} -> ${e.mpn} £${e.gbp.q100k}; siblings ${diff.map(x => `${x.family} £${x.gbp.q100k}`).join(', ')}`); }
}
console.log('  total', n);
