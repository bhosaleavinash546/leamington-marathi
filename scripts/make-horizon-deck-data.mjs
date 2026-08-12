// The Horizon deck's figures, COUNTED from the register rather than typed.
//
//   node scripts/make-horizon-deck-data.mjs
//
// The deck reads deck-assets/horizon-deck-data.json, and that file was written
// by hand once in July. By August the register had grown from 139 technologies
// to 180 and the deck was still saying 139 — the exact failure the DFM deck
// avoids by importing its counts. This regenerates the countable half of the
// file from the live register and leaves the rest alone.
//
// What it does NOT touch: the `bev` block (a live query's own output, captured
// from a real run) and the `lenses` examples (curated wording). Those are
// evidence of a run, not a count, and rewriting them from the register would
// turn a recorded result into a claim.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  FORESIGHT_REGISTER, REG_ANCHORS, BENCHMARK_VEHICLES, SEGMENT_TAG_IDS,
} from '../src/data/tech-foresight-register.mjs';

const path = new URL('deck-assets/horizon-deck-data.json', import.meta.url);
const data = JSON.parse(readFileSync(path, 'utf8'));

const byCommodity = {};
for (const t of FORESIGHT_REGISTER) {
  byCommodity[t.commodity] = (byCommodity[t.commodity] ?? 0) + 1;
}

const before = { size: data.registerSize, anchors: data.anchorCount };
data.registerSize = FORESIGHT_REGISTER.length;
data.byCommodity = byCommodity;
data.anchorCount = REG_ANCHORS.length;
data.benchmarkCount = BENCHMARK_VEHICLES.length;

// Segment lens counts, where the lens still exists in the register. The example
// names stay as curated — only the number is recounted.
for (const [key, lens] of Object.entries(data.lenses ?? {})) {
  const tag = key === 'offroad' ? 'off-road' : key;
  const ids = SEGMENT_TAG_IDS?.[tag];
  if (Array.isArray(ids)) lens.count = ids.length;
}

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log(`register ${before.size} -> ${data.registerSize} · anchors ${before.anchors} -> ${data.anchorCount}`
  + ` · benchmarks ${data.benchmarkCount}`);
for (const [k, v] of Object.entries(data.lenses ?? {})) console.log(`  lens ${k}: ${v.count}`);
