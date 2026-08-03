/**
 * A record of what every per-commodity cost-input rule block tells the model.
 *
 *   npx tsx scripts/snapshot-commodity-rules.ts          # write baselines
 *   npx tsx scripts/snapshot-commodity-rules.ts --check   # fail if they moved
 *
 * **This file's job changed, and the change is worth explaining.** It was
 * written in Stage 0 to prove that moving the rules out of a prompt string and
 * into `src/engine/cost-input-rules/` changed *nothing* about what the model is
 * told. That was the right test for a pure refactor. It stopped being the right
 * test the moment the move started correcting things: the casting yield that
 * under-charged investment castings ~2x, the forging yield sitting outside its
 * own documented band, the flat die life that ignored the alloy, the sheet gauge
 * read off a bend radius, the projected area that undersized a bumper press.
 * Each correction has a test of its own in `tests/cost-input-rules-*.test.ts`.
 *
 * So byte-identity is no longer the goal. These baselines are now a **changelog**:
 * when a rule changes, regenerate, read the diff, and satisfy yourself that
 * every moved line is a fix you can name. A diff you cannot account for is a
 * bug, not a baseline update — and `--check` still fails the build until someone
 * looks.
 *
 * Two geometry contexts per commodity, because the degraded branch (STL uploads,
 * text-parsed STEP) is the one that historically breaks:
 *   full     — a complete OCCT measurement
 *   degraded — every optional measurement absent
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildCommodityRules, ruleContextFor } from '../server/routes/cad.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const OUT_DIR = 'tests/fixtures/commodity-rules-prompt';
const check = process.argv.includes('--check');

/** Every commodity with a rule spec, plus the no-spec fallback. */
const COMMODITIES = [
  'machining', 'casting', 'cast_and_machine', 'forging',
  'sheet_metal', 'sheet_metal_fab', 'injection_moulding', 'blow_moulding',
  'thermoforming', 'rotational_moulding', 'rubber', 'composites',
  '__default__',
] as const;

/**
 * A representative measured part: ~1,037 cm³, 3 mm walls, a handful of holes.
 *
 * Deliberately one geometry for every commodity. The blocks are not meant to be
 * individually plausible — a bumper is not 1 L of solid — they are meant to be
 * comparable, so a diff on the casting block cannot be confused with a diff on
 * the geometry it was rendered from.
 */
const FULL_GEO = {
  status: 'success',
  partName: 'reference part',
  volume: { mm3: 1_037_000, cm3: 1037 },
  surfaceArea: { mm2: 122_000, cm2: 1220 },
  boundingBox: { xMm: 320, yMm: 240, zMm: 96 },
  fillRatio: 0.141,
  wallThickness: {
    minMm: 2.4, maxMm: 4.1, meanMm: 3.0, stdDevMm: 0.4,
    sampleCount: 400, method: 'ray_cast', uniformity: 'good',
  },
  draftAnalysis: {
    undercutFaceCount: 2, zeroDraftFaceCount: 4,
    adequateDraftFaceCount: 80, analyzedFaceCount: 86,
  },
  setupAnalysis: {
    estimatedSetupCount: 3,
    principalDirections: [
      { directionLabel: '+Z', faceCount: 40 },
      { directionLabel: '-Z', faceCount: 30 },
      { directionLabel: '+X', faceCount: 20 },
    ],
  },
  cncCycleTimeEstimate: {
    setupTimeMins: 135, planarMillingTimeMins: 12, drillBoreTimeMins: 4,
    estimatedTotalMins: 16.1, estimatedTotalHrs: 0.268,
    assumedFeedRateMm2PerMin: 3000, assumedDrillBoreMinPerFeature: 0.4,
    assumedSetupTimeMinsPerSetup: 45,
  },
  faces: { total: 120, byType: {} },
  features: { freeFormFaceCount: 4, planarFaceCount: 60, estimatedHoleCount: 10 },
  featureTable: [{ kind: 'hole', diaMm: 10, depthMm: 24, through: true, count: 10 }],
  sheetMetal: { bendCount: 4, totalBendLengthMm: 640, thicknessMm: 2.4 },
  topology: { available: true, openShell: false, enclosesSealedVoid: true, voidCount: 1 },
  weights: {
    aluminiumKg: 2.8, steelKg: 8.14, plasticKg: 1.089,
    castIronKg: 7.415, copperKg: 9.292, titaniumKg: 4.594,
  },
  toolingCostEstimates: {
    hpdcDieCostGBP: 118_000, gravityMouldCostGBP: 26_400, sandPatternCostGBP: 7_250,
    imMouldCostGBP: 41_500, forgeDieCostGBP: 63_800, progressiveDieCostGBP: 92_300,
  },
  processSpecificEstimates: {
    sandCycleTimeHr: 0.262, sandCycleTimeHrFerrous: 0.447, forgeStrokes: 6,
    investWaxCostGBP: 1.83, investShellCostGBP: 5.49,
  },
  manufacturabilityScore: 78,
} as unknown as OCCTGeometry;

/** The STL / text-parse path: a volume and a box, and nothing else. */
const DEGRADED_GEO = {
  status: 'text_parsed',
  volume: { mm3: 1_037_000, cm3: 1037 },
  surfaceArea: { mm2: 122_000, cm2: 1220 },
  boundingBox: { xMm: 320, yMm: 240, zMm: 96 },
  weights: FULL_GEO.weights,
} as unknown as OCCTGeometry;

/**
 * The answers an `/analyze` call can supply.
 *
 * `full` names the material in the filename, which is the prior the AI path
 * uses. `degraded` names nothing, so every material-dependent line renders
 * UNDECIDED — which is the honest output and the branch worth capturing.
 */
const CONTEXTS: Array<{ name: string; geo: OCCTGeometry; filename: string }> = [
  { name: 'full', geo: FULL_GEO, filename: 'reference-part-aluminium.step' },
  { name: 'degraded', geo: DEGRADED_GEO, filename: 'reference-part.stl' },
];

/**
 * Render through `ruleContextFor` — the same assembly `/analyze` uses — so the
 * baseline is what the model is actually sent, not a hand-built approximation
 * of it. Getting that wrong is how a snapshot ends up passing while the live
 * prompt says something else.
 */
function render(commodity: string, c: (typeof CONTEXTS)[number]): string {
  return buildCommodityRules(ruleContextFor(
    commodity === '__default__' ? 'not_a_real_commodity' : commodity,
    c.geo,
    c.filename,
    { annualVolume: 100_000, forcedCommodity: commodity, forcedMaterial: '' },
  ));
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
    console.error('\n  Regenerate without --check, then READ THE DIFF: every moved line must be');
    console.error('  a fix you can name and point at a test. Bump CAD_PROMPT_VERSION when it is.\n');
    process.exitCode = 1;
  } else {
    console.log(`  All ${matched} commodity rule block(s) unchanged.`);
  }
} else {
  console.log(`  Wrote ${written} baseline(s) to ${OUT_DIR}/`);
}
