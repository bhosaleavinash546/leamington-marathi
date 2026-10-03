#!/usr/bin/env node
// Duplicate check for a candidate marketplace-idea batch against the whole
// seeded library (every marketplace-*.json) and, optionally, sibling batches.
//
//   node scripts/check-idea-dupes.mjs <candidates.json> [--against dir-of-other-batches]
//
// Two signals, because a renamed idea is still the same idea:
//   • TITLE  — Jaccard of title words (>3 letters); ≥ 0.5 is flagged
//   • CONCEPT — cosine of title+description term vectors (stop-worded,
//     words >3 letters); ≥ 0.50 is flagged for review (real duplicates in the library measure 0.6+; shared vocabulary alone sits near 0.38)
// Exit 1 when anything is flagged, listing each candidate with its nearest
// library idea so the author can rewrite or drop it.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STOP = new Set('with from into that this than then their there which while where when using used uses based each more less over under also only same such cost costs part parts design replace replaces replacing instead lower reduce reduces reduced reduction saving savings vehicle vehicles system systems suv luxury premium proposed baseline current'.split(' '));
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 3 && !STOP.has(w));
const titleSet = (s) => new Set(words(s));
const jac = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / Math.max(1, a.size + b.size - i); };
const vec = (s) => { const m = new Map(); for (const w of words(s)) m.set(w, (m.get(w) || 0) + 1); return m; };
function cos(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  for (const [k, v] of a) { const u = b.get(k); if (u) dot += u * v; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
const text = (x) => `${x.title} ${x.title} ${x.ideaData?.technicalDescription ?? x.technicalDescription ?? x.description ?? ''}`.slice(0, 1600);

export function loadLibrary(extraDir = null, exclude = null) {
  const lib = [];
  for (const f of readdirSync(ROOT).filter(f => /^marketplace-.*\.json$/.test(f))) {
    for (const x of JSON.parse(readFileSync(join(ROOT, f), 'utf8'))) lib.push({ src: f, title: x.title, t: titleSet(x.title), v: vec(text(x)) });
  }
  if (extraDir) {
    for (const f of readdirSync(extraDir).filter(f => f.endsWith('.json'))) {
      if (exclude && resolve(extraDir, f) === resolve(exclude)) continue;
      let arr; try { arr = JSON.parse(readFileSync(join(extraDir, f), 'utf8')); } catch { continue; }
      for (const x of Array.isArray(arr) ? arr : []) lib.push({ src: f, title: x.title, t: titleSet(x.title), v: vec(text(x)) });
    }
  }
  return lib;
}

export function checkAgainst(cands, lib, { titleMax = 0.5, conceptMax = 0.50 } = {}) {
  return cands.map(c => {
    const t = titleSet(c.title), v = vec(text(c));
    let bt = { s: 0 }, bc = { s: 0 };
    for (const y of lib) {
      const a = jac(t, y.t); if (a > bt.s) bt = { s: a, y };
      const b = cos(v, y.v); if (b > bc.s) bc = { s: b, y };
    }
    return { title: c.title, titleSim: +bt.s.toFixed(2), titleNearest: bt.y?.title, conceptSim: +bc.s.toFixed(2), conceptNearest: bc.y?.title, conceptSrc: bc.y?.src,
      flagged: bt.s >= titleMax || bc.s >= conceptMax };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: check-idea-dupes.mjs <candidates.json> [--against dir]'); process.exit(2); }
  const ai = process.argv.indexOf('--against');
  const cands = JSON.parse(readFileSync(file, 'utf8'));
  // Inside the batch too.
  const self = [];
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    const s = cos(vec(text(cands[i])), vec(text(cands[j])));
    if (s >= 0.50 || jac(titleSet(cands[i].title), titleSet(cands[j].title)) >= 0.5) self.push(`  #${i + 1} "${cands[i].title}"  ~  #${j + 1} "${cands[j].title}" (${s.toFixed(2)})`);
  }
  const res = checkAgainst(cands, loadLibrary(ai > 0 ? process.argv[ai + 1] : null, file));
  const bad = res.filter(r => r.flagged);
  for (const r of res) console.log(`${r.flagged ? 'DUP?' : 'ok  '} t=${r.titleSim} c=${r.conceptSim}  ${r.title}${r.flagged ? `\n      nearest: "${r.conceptSim >= 0.50 ? r.conceptNearest : r.titleNearest}" [${r.conceptSrc}]` : ''}`);
  if (self.length) console.log(`\nNear-duplicates INSIDE this batch:\n${self.join('\n')}`);
  console.log(`\n${cands.length} candidates, ${bad.length} flagged against the library, ${self.length} pairs flagged inside the batch.`);
  process.exit(bad.length || self.length ? 1 : 0);
}
