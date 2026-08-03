/**
 * Capture a byte-exact baseline of every per-commodity cost-input rule block.
 *
 *   npx tsx scripts/snapshot-commodity-rules.ts          # write baselines
 *   npx tsx scripts/snapshot-commodity-rules.ts --check   # fail if they moved
 *
 * Why this exists: the rules in `buildCommodityRules` are being moved out of a
 * prompt string and into typed code under `src/engine/cost-input-rules/`. That
 * move must change NOTHING about what the model is told. These snapshots are
 * the proof — capture them before the refactor, and require the rendered
 * output to match afterwards.
 *
 * Two geometry contexts are rendered per commodity because almost every rule
 * line is a ternary on "did OCCT give us this?":
 *   full     — a complete OCCT measurement (the STEP/IGES path)
 *   degraded — every optional measurement null (the STL / text-parse path)
 * Both branches must survive the refactor, and the degraded one is the branch
 * that historically breaks.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildCommodityRules } from '../server/routes/cad.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const OUT_DIR = 'tests/fixtures/commodity-rules-prompt';
const check = process.argv.includes('--check');

/** Every commodity with an explicit `case` in buildCommodityRules, plus the default. */
const COMMODITIES = [
  'machining', 'casting', 'cast_and_machine', 'forging',
  'sheet_metal', 'sheet_metal_fab', 'injection_moulding', 'blow_moulding',
  'thermoforming', 'rotational_moulding', 'rubber', 'composites',
  '__default__',
] as const;

/** A representative measured part: ~2.8 kg aluminium housing, 3 mm walls. */
const FULL_TOOLING = {
  hpdcDieCostGBP: 118_000, gravityMouldCostGBP: 26_400, sandPatternCostGBP: 7_250,
  imMouldCostGBP: 41_500, forgeDieCostGBP: 63_800, progressiveDieCostGBP: 92_300,
} as OCCTGeometry['toolingCostEstimates'];

const FULL_PROCESS = {
  sandCycleTimeHr: 0.262, sandCycleTimeHrFerrous: 0.447, forgeStrokes: 6,
  investWaxCostGBP: 1.83, investShellCostGBP: 5.49,
} as OCCTGeometry['processSpecificEstimates'];

/** Only the fields buildCommodityRules actually reads are populated. */
const FULL_GEO = {
  volume: { mm3: 1_037_000, cm3: 1037 },
  surfaceArea: { mm2: 122_000, cm2: 1220 },
  boundingBox: { xMm: 320, yMm: 240, zMm: 96 },
  fillRatio: 0.141,
  weights: {
    aluminiumKg: 2.8, steelKg: 8.14, plasticKg: 1.089,
    castIronKg: 7.415, copperKg: 9.292, titaniumKg: 4.594,
  },
} as unknown as OCCTGeometry;

const DEGRADED_GEO = {
  volume: { mm3: 1_037_000, cm3: 1037 },
  surfaceArea: { mm2: 122_000, cm2: 1220 },
  boundingBox: { xMm: 320, yMm: 240, zMm: 96 },
  weights: FULL_GEO.weights,
} as unknown as OCCTGeometry;

interface Ctx {
  name: string;
  geo: OCCTGeometry;
  tc: OCCTGeometry['toolingCostEstimates'];
  ps: OCCTGeometry['processSpecificEstimates'];
  wallMean: number | null;
  wallMin: number | null;
  bbDimsSorted: number[] | null;
  bb: { xMm: number; yMm: number; zMm: number } | null;
  cncHrs: number | null;
  setupCount: number | null;
  undercuts: number;
  mfgScore: number | null;
}

const CONTEXTS: Ctx[] = [
  {
    name: 'full', geo: FULL_GEO, tc: FULL_TOOLING, ps: FULL_PROCESS,
    wallMean: 3.0, wallMin: 2.4, bbDimsSorted: [320, 240, 96],
    bb: { xMm: 320, yMm: 240, zMm: 96 }, cncHrs: 0.268, setupCount: 3,
    undercuts: 2, mfgScore: 78,
  },
  {
    name: 'degraded', geo: DEGRADED_GEO, tc: null, ps: null,
    wallMean: null, wallMin: null, bbDimsSorted: null,
    bb: null, cncHrs: null, setupCount: null,
    undercuts: 0, mfgScore: null,
  },
];

function render(commodity: string, c: Ctx): string {
  return buildCommodityRules(
    commodity === '__default__' ? 'not_a_real_commodity' : commodity,
    c.geo, c.tc, c.ps, c.wallMean, c.wallMin, c.bbDimsSorted, c.bb,
    c.cncHrs, c.setupCount, c.undercuts, c.mfgScore,
  );
}

mkdirSync(OUT_DIR, { recursive: true });

let written = 0, matched = 0;
const drifted: string[] = [];

for (const commodity of COMMODITIES) {
  const blocks = CONTEXTS.map(c => `### context: ${c.name}\n${render(commodity, c)}`);
  const body = `# ${commodity}\n# Baseline of buildCommodityRules — DO NOT hand-edit.\n# Regenerate: npx tsx scripts/snapshot-commodity-rules.ts\n\n${blocks.join('\n\n')}\n`;
  const path = join(OUT_DIR, `${commodity}.txt`);

  if (check) {
    if (!existsSync(path)) { drifted.push(`${commodity}: no baseline captured`); continue; }
    const prev = readFileSync(path, 'utf8');
    if (prev === body) matched++;
    else drifted.push(commodity);
  } else {
    writeFileSync(path, body);
    written++;
  }
}

if (check) {
  if (drifted.length) {
    console.error(`\n  ${drifted.length} commodity rule block(s) CHANGED:\n`);
    for (const d of drifted) console.error(`    - ${d}`);
    console.error('\n  If the change is intended, re-run without --check, review the diff,');
    console.error('  and bump CAD_PROMPT_VERSION in server/routes/cad.ts.\n');
    process.exitCode = 1;
  } else {
    console.log(`  All ${matched} commodity rule block(s) unchanged.`);
  }
} else {
  console.log(`  Wrote ${written} baseline(s) to ${OUT_DIR}/`);
}
