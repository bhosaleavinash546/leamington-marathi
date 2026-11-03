/**
 * Arithmetic audit, step 0 (30 Oct 2026): replay every real part through the product's own headless chain
 * (`costMeasuredPart`, the baseline's answers, UK, 50,000 a year, 5-year programme) and write everything a
 * reviewer needs to recompute it by hand: the rule provenance (value + basis), the module inputs (params), the
 * module output (drivers), the stack input, every operation as costed, and the 8 buckets.
 *
 *   npx tsx scripts/arith-audit/dump.ts <outDir>
 * Country, volume and delivery terms (7-country review, 3 Nov 2026): CV_DUMP_REGION (UK), CV_DUMP_ANNUAL (50000),
 * CV_DUMP_TERMS (DAP | EXW) — the costing runs in that country's own book, as the screen does.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { ANSWERS, BASELINE } from '../real-parts-baseline.js';
import type { OCCTGeometry } from '../../server/utils/geometry-bridge.js';

process.env.AIR_GAPPED = '1';
const out = process.argv[2] ?? 'arith-dump';
mkdirSync(out, { recursive: true });
const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const index: Array<Record<string, unknown>> = [];
const REGION = (process.env.CV_DUMP_REGION ?? 'UK') as 'UK';
const ANNUAL = Number(process.env.CV_DUMP_ANNUAL ?? 50_000);
const TERMS = (process.env.CV_DUMP_TERMS === 'EXW' ? 'EXW' : 'DAP') as 'DAP' | 'EXW';
for (const p of base) {
  const spec = ANSWERS[p.part];
  if (!spec) continue;
  const r = await costMeasuredPart(p.geometry, p.part,
    { partNumber: p.part, file: p.part, annualVolume: ANNUAL, ...(spec.commodity ? { commodity: spec.commodity } : {}) },
    spec.answers, REGION, { annualVolume: ANNUAL, programmeYears: 5, deliveryTerms: TERMS }, book, { partNumber: p.part, file: p.part, status: 'error' });
  const file = join(out, `${p.part.replace(/\.(stp|step)$/i, '')}.json`);
  writeFileSync(file, JSON.stringify({ part: p.part, answers: spec.answers, region: REGION, annual: ANNUAL, terms: TERMS, ...r }, null, 1));
  index.push({ part: p.part, status: r.status, commodity: r.commodity, total: r.total, file });
  console.log(`${p.part.padEnd(30)} ${String(r.status).padEnd(12)} ${String(r.commodity ?? '').padEnd(20)} ${r.total?.toFixed(4) ?? r.code ?? ''}`);
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1));
