/**
 * How well does the tool identify a part's process and material?
 *
 *   npx tsx scripts/process-material-eval.ts            # deterministic evidence only
 *   ANTHROPIC_API_KEY=… npx tsx scripts/process-material-eval.ts --ai [--deep]
 *
 * Runs every labelled part in cad-audit/parts (the labels are the stated
 * answers in scripts/real-parts-baseline.ts ANSWERS) through:
 *   1. the deterministic rules — the suggested process on the question, and the
 *      material if the file settles it;
 *   2. with --ai, the identification step (server/utils/cad-identify.ts) on the
 *      measured geometry and the file's own names. No renders or photos here —
 *      those come from the browser — so this arm is the floor of what the model
 *      sees, not the ceiling.
 * Prints a table and the hit rates. The labels are engineering judgements and
 * can be wrong; where the file's own evidence contradicts a label, the row says
 * so rather than counting it silently.
 *
 * Add a part: drop the STEP in cad-audit/parts, add its answers to ANSWERS,
 * and — the useful case — a photo as cad-audit/parts/<name>.jpg, which the --ai
 * arm sends as the part photo.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ANSWERS, PARTS_DIR, BASELINE } from './real-parts-baseline.js';
import { readCadMetadata } from '../server/utils/cad-metadata.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { materialFacts } from '../src/engine/cost-input-rules/derive/material.js';
import { processFromNames, partNames } from '../src/engine/cost-input-rules/derive/part-evidence.js';
import { identifyPart } from '../server/utils/cad-identify.js';
import { createAnthropic } from '../server/utils/ai-client.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const useAI = process.argv.includes('--ai');
const deep = process.argv.includes('--deep');

interface Row { part: string; truthRoute: string; truthMaterial: string; detRoute: string; detMaterial: string; aiRoute?: string; aiMaterial?: string; note?: string }

/** The route a label means, for comparison: a gear is its own commodity. */
const routeOf = (answers: Record<string, string>, part: string) => answers['commodity.route'] ?? (/gear/i.test(part) ? 'gear' : '?');

async function main(): Promise<void> {
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }> : [];
  const anthropic = useAI ? createAnthropic(process.env.ANTHROPIC_API_KEY ?? '') : null;
  const rows: Row[] = [];
  for (const [part, spec] of Object.entries(ANSWERS)) {
    const path = join(PARTS_DIR, part);
    const rec = baseline.find(b => b.part === part);
    if (!rec || !existsSync(path)) { console.log(`  ${part}: no recorded geometry or file — skipped`); continue; }
    const geo: OCCTGeometry = { ...rec.geometry, cadMetadata: readCadMetadata(readFileSync(path), part) };
    const ctx = { geo, geometryQuality: 'occt' as const, commodity: 'machining', annualVolume: 50_000, filename: part, answers: {} };
    const v = inferCommodity(ctx);
    const detRoute = v.commodity ?? v.decision?.options.find(o => o.leaning)?.value ?? '(asked, no lean)';
    const m = materialFacts({ ...ctx, commodity: v.commodity ?? (detRoute.startsWith('(') ? 'machining' : detRoute) });
    const row: Row = {
      part, truthRoute: routeOf(spec.answers, part), truthMaterial: spec.answers['material.family'] ?? '?',
      detRoute, detMaterial: m.family ?? '(asked)',
    };
    const named = processFromNames(partNames(part, geo));
    if (named.route && named.route !== row.truthRoute && !(named.route === 'casting' && row.truthRoute === 'cast_and_machine')) {
      row.note = `the file calls it ${named.hits[0].label} ("${named.hits[0].text}") but the label says ${row.truthRoute}`;
    }
    if (anthropic) {
      const photoPath = path.replace(/\.(stp|step)$/i, '.jpg');
      const ident = await identifyPart(anthropic, {
        geo, filename: part, deep,
        partPhoto: existsSync(photoPath) ? { data: readFileSync(photoPath).toString('base64'), mediaType: 'image/jpeg' } : null,
      });
      row.aiRoute = ident?.process ?? '(no answer)';
      row.aiMaterial = ident ? `${ident.materialFamily} (${ident.materialSource})` : '(no answer)';
    }
    rows.push(row);
  }

  const hit = (a: string, b: string) => a === b || (a === 'cast_and_machine' && b === 'casting') || (a === 'casting' && b === 'cast_and_machine');
  console.log('\n  part                        label route        rules suggest       ' + (useAI ? 'AI identifies       ' : '') + 'label mat   rules mat    ' + (useAI ? 'AI mat' : ''));
  for (const r of rows) {
    console.log(`  ${basename(r.part).padEnd(27)} ${r.truthRoute.padEnd(18)} ${(hit(r.detRoute, r.truthRoute) ? '✓ ' : '✗ ') + r.detRoute.padEnd(18)} `
      + (useAI ? `${(hit(r.aiRoute!, r.truthRoute) ? '✓ ' : '✗ ') + r.aiRoute!.padEnd(18)} ` : '')
      + `${r.truthMaterial.padEnd(11)} ${r.detMaterial.padEnd(12)} ${useAI ? r.aiMaterial : ''}`);
    if (r.note) console.log(`      ↳ ${r.note}`);
  }
  const n = rows.length;
  const rate = (k: (r: Row) => boolean) => `${rows.filter(k).length}/${n}`;
  console.log(`\n  Process — rules suggest the labelled route: ${rate(r => hit(r.detRoute, r.truthRoute))}`
    + (useAI ? `; AI identifies it: ${rate(r => hit(r.aiRoute!, r.truthRoute))}` : ''));
  console.log(`  Material — rules settle it from the file: ${rate(r => r.detMaterial === r.truthMaterial)} (asked on ${rate(r => r.detMaterial === '(asked)')})`
    + (useAI ? `; AI reads it: ${rate(r => (r.aiMaterial ?? '').startsWith(r.truthMaterial))}` : ''));
  console.log(`  Labels the file itself contradicts: ${rows.filter(r => r.note).length}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
