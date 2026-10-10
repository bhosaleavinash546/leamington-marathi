/**
 * Casting 360 review (10 Oct 2026): one real STEP through the SAME chain the server's deterministic path uses —
 * kernel measurement → rules (route, grade, decisions, every input with its basis) → guards → toCostParams →
 * the engine — in a chosen country, and dump every intermediate value for a hand check.
 *
 *   npx tsx scripts/casting-review-2026-10-10/trace.mts <part.stp> <region> <annualVolume> '<answers json>' > out.json
 */
import { readFileSync } from 'node:fs';
import { analyzeGeometry } from '../../server/utils/geometry-bridge.ts';
import { buildDeterministicAnalysis } from '../../src/engine/cost-input-rules/deterministic.ts';
import { specForCommodity } from '../../src/engine/cost-input-rules/index.ts';
import { materialFacts } from '../../src/engine/cost-input-rules/derive/material.ts';
import { toCostParams, SHOP_DEFAULTS } from '../../src/engine/cost-input-rules/to-cost-params.ts';
import { runAllGuards, statedFromAnswers } from '../../server/routes/cad.ts';
import { executeCalculateCost } from '../../server/services/cost-executor.ts';
import { withRates } from '../../src/engine/rate-context.ts';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.ts';
import { buildRegionalLibrary, regionalShopDefaults } from '../../src/engine/regional-rates.ts';

const [file, region = 'IN', vol = '100000', ans = '{}'] = process.argv.slice(2);
const answers = JSON.parse(ans);
const annualVolume = Number(vol);
const log = console.log; console.log = () => {}; console.warn = () => {};
const buf = readFileSync(file);
const geo: any = await analyzeGeometry(buf, file.split('/').pop()!);
const book = region === 'UK' ? recomputeMachineRates(DEFAULT_RATE_LIBRARY) : buildRegionalLibrary(recomputeMachineRates(DEFAULT_RATE_LIBRARY), region as any);
const commodity = String(answers['commodity.route'] ?? 'cast_and_machine');
const ctx: any = { geo, geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume, filename: file.split('/').pop(), answers, rates: book };
const spec = specForCommodity(commodity)!;
const { analysis, result } = buildDeterministicAnalysis(spec, ctx, geo.partName || file);
const warnings = runAllGuards(analysis as any, geo, geo.volume?.cm3 ?? null, statedFromAnswers(answers));
const mapped: any = withRates(book, () => toCostParams(commodity, (analysis as any).costInputSuggestions, annualVolume, materialFacts(ctx).family, geo));
const shop = regionalShopDefaults(region as any, { packagingPerPart: mapped.packagingPerPart, logisticsPerPart: mapped.logisticsPerPart });
const cost: any = executeCalculateCost({ commodity: mapped.commodity, params: mapped.params, partName: geo.partName || file, rateLibrary: book,
  overheadPct: shop.overheadPct, marginPct: SHOP_DEFAULTS.marginPct, packagingPerPart: shop.packagingPerPart, logisticsPerPart: shop.logisticsPerPart });
log(JSON.stringify({
  geo: { volume: geo.volume, surfaceArea: geo.surfaceArea, boundingBox: geo.boundingBox, wall: geo.wallThickness, faces: geo.faces,
    holes: geo.features?.holes ?? geo.holes, cadMetadata: geo.cadMetadata, turning: geo.turning, projectedArea: geo.projectedArea,
    draft: geo.draftAnalysis, keys: Object.keys(geo) },
  decisions: result.decisions.map((d: any) => ({ id: d.id, severity: d.severity, question: d.question, chosen: answers[d.id], options: d.options.map((o: any) => o.value) })),
  provenance: result.provenance,
  costInputSuggestions: (analysis as any).costInputSuggestions,
  warnings,
  mapped: { commodity: mapped.commodity, params: mapped.params, assumed: mapped.assumed, packagingPerPart: mapped.packagingPerPart, logisticsPerPart: mapped.logisticsPerPart },
  shop,
  cost: { total: cost.total, breakdown: cost.breakdown, trace: cost.trace, drivers: cost.drivers ?? cost.trace?.drivers },
}, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v), 1));
