/**
 * Record what the deterministic path does to the real production parts.
 *
 *   npx tsx scripts/real-parts-baseline.ts            # show the drift
 *   npx tsx scripts/real-parts-baseline.ts --update   # accept it
 *
 * WHY THIS EXISTS. A steering knuckle costed at £5.43 — an order of magnitude
 * out — while 2,185 tests passed. Not because the tests were weak, but because
 * every test that costs a part costs a *synthetic* one: clean prismatic blocks
 * with no fillets. The bug only fired on real CAD, where fillets were misread
 * as press-brake bends and four production parts routed to laser cutting. It
 * was found by running real parts by hand, once. This makes that permanent.
 *
 * The baseline stores, per part in `cad-audit/parts/`:
 *
 *   - the measured geometry, so the costing can be replayed without OCP
 *   - the answers a person gave, as stated assumptions rather than derivations
 *   - what the rules did with it: route, open questions, guards, cost
 *
 * The recorded geometry is what makes this run in ordinary CI, where there is
 * no geometry kernel. `tests/real-parts-baseline.test.ts` replays it through
 * `costMeasuredPart` — the product's own chain, not a copy — and separately
 * re-measures the parts where OCP *is* installed, so a Python-side regression
 * is caught too.
 *
 * WHAT IT IS NOT. It is not accuracy. Nothing here has been compared against a
 * price JLR paid; these numbers are what the tool says today, not what is
 * right. What it protects is the thing we can protect: that a change nobody
 * intended to make does not silently move a real part.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeGeometry, type OCCTGeometry } from '../server/utils/geometry-bridge.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { geometryPool } from '../server/utils/geometry-pool.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import type { BulkPartResult } from '../server/services/bulk-run.js';

process.env.AIR_GAPPED = '1';   // no model may contribute to a baseline

export const PARTS_DIR = resolve(import.meta.dirname, '..', '..', 'cad-audit', 'parts');
export const BASELINE = resolve(import.meta.dirname, '..', 'tests', 'fixtures', 'real-parts-baseline.json');

/**
 * The answers a person gives each part, and why.
 *
 * These are engineering judgements, not measurements — the tool asks precisely
 * because the geometry does not settle them. They are written down here so the
 * baseline is reproducible and so a reviewer can disagree with one: if the
 * knuckle is actually forged rather than cast-and-machined, change it here and
 * the recorded cost changes with it. `annualVolume` is fixed at 50,000 so a
 * volume change is never mistaken for a routing change.
 */
export const ANSWERS: Record<string, {
  note: string;
  answers: Record<string, string>;
  /** Set where the route is stated rather than inferred — the CSV's commodity column. */
  commodity?: string;
}> = {
  'steering_knuckle_RH.stp': {
    note: 'Suspension upright — safety-critical, so forged in production. 9.0 mm bulk wall, 6% fill.',
    answers: { 'material.family': 'steel', 'commodity.route': 'machining' },
  },
  'Casting_Braket.stp': {
    note: 'Named as a casting; 10.2 mm bulk wall, 16% fill, 10 blind holes and threads to finish. '
        + 'A mounting bracket seals nothing, so not pressure-tight.',
    answers: { 'material.family': 'steel', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
               'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' },
  },
  'PRCR002.stp': {
    note: '277 mm envelope at 9% fill, 15.1 mm bulk wall — a substantial cast housing. '
        + 'Assumed not pressure-tight; if it carries fluid, change this and the cost rises.',
    answers: { 'material.family': 'aluminium', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
               'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' },
  },
  'Seat_Locking_Bracket.stp': {
    note: 'The one genuine pressing: 1.55 mm wall throughout, 15 measured bends, 4% fill.',
    answers: { 'material.family': 'steel', 'commodity.route': 'sheet_metal' },
  },
  'Part1.stp': {
    note: '274 mm, 23% fill, 10.4 mm bulk wall. Machined from billet at this volume.',
    answers: { 'material.family': 'aluminium', 'commodity.route': 'machining' },
  },
  'test-gear-m3-z38.step': {
    // No commodity stated: `looksLikeGear` routes this off the counted teeth.
    // It used to need stating, because the gear test lived inline in cad.ts and
    // `inferCommodity` had no gear branch — the browser costed this part and the
    // bulk run refused it. The two now share one predicate, and this entry is
    // what proves the bulk path reaches the gear commodity on its own.
    note: 'Module 3, 38 teeth counted off the tip circle — routed by metrology, '
        + 'not by a stated commodity. ISO class 8, case-hardening steel.',
    answers: { 'material.family': 'steel', 'gear.helix': 'spur',
               'gear.qualityClass': '8', 'gear.materialClass': 'case_hardening_steel' },
  },
};

export interface PartBaseline {
  part: string;
  sha256: string;
  note: string;
  answers: Record<string, string>;
  /** Present when the route was stated rather than inferred. */
  commodity?: string;
  geometry: OCCTGeometry;
  outcome: {
    status: BulkPartResult['status'];
    commodity?: string;
    code?: string;
    total?: number;
    breakdown?: Record<string, number>;
    questions?: string[];
    warnings?: string[];
  };
}

export function stepFiles(): string[] {
  if (!existsSync(PARTS_DIR)) return [];
  return readdirSync(PARTS_DIR).filter(f => /\.(stp|step)$/i.test(f)).sort();
}

/** Round money and geometry so float noise is not mistaken for a change. */
const p2 = (n: number) => Math.round(n * 100) / 100;

/** Replay one already-measured part through the product's own costing chain. */
export async function outcomeFor(
  file: string, geo: OCCTGeometry, answers: Record<string, string>, commodity?: string,
): Promise<PartBaseline['outcome']> {
  const name = basename(file);
  const r = await costMeasuredPart(
    geo, name,
    { partNumber: name, file, annualVolume: 50_000, ...(commodity ? { commodity } : {}) },
    answers, 'UK',
    { annualVolume: 50_000 },
    recomputeMachineRates(DEFAULT_RATE_LIBRARY),
    { partNumber: name, file, status: 'error' },
  );
  return {
    status: r.status,
    ...(r.commodity ? { commodity: r.commodity } : {}),
    ...(r.code ? { code: r.code } : {}),
    ...(r.total != null ? { total: p2(r.total) } : {}),
    ...(r.breakdown ? {
      breakdown: Object.fromEntries(Object.entries(r.breakdown).map(([k, v]) => [k, p2(v as number)])),
    } : {}),
    ...(r.questions?.length ? { questions: r.questions.map(q => q.id).sort() } : {}),
    ...(r.warnings?.length ? { warnings: r.warnings.map(w => w.code).sort() } : {}),
  };
}

async function build(): Promise<PartBaseline[]> {
  const out: PartBaseline[] = [];
  for (const f of stepFiles()) {
    const path = join(PARTS_DIR, f);
    const bytes = readFileSync(path);
    const spec = ANSWERS[f];
    if (!spec) {
      console.log(`  ${f.padEnd(28)} SKIPPED — no answers recorded in ANSWERS`);
      continue;
    }
    const geo = await analyzeGeometry(bytes, f, 300_000);
    if (geo.status !== 'success') {
      console.log(`  ${f.padEnd(28)} geometry failed: ${geo.error}`);
      continue;
    }
    const outcome = await outcomeFor(path, geo, spec.answers, spec.commodity);
    out.push({
      part: f,
      sha256: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
      note: spec.note,
      answers: spec.answers,
      ...(spec.commodity ? { commodity: spec.commodity } : {}),
      geometry: geo,
      outcome,
    });
    const money = outcome.total != null ? `£${outcome.total.toFixed(2)}` : outcome.code ?? '';
    console.log(`  ${f.padEnd(28)} ${String(outcome.commodity ?? '-').padEnd(18)} ${outcome.status.padEnd(13)} ${money}`);
  }
  return out;
}

if (import.meta.filename === process.argv[1]) {
  // The pool keeps a warm Python worker, which keeps the event loop alive. The
  // CLI shuts it down for the same reason; without this the script finishes its
  // work and then hangs forever.
  const finish = (code: number): never => { geometryPool().shutdown(); process.exit(code); };
  const update = process.argv.includes('--update');
  console.log(`\n  Measuring ${stepFiles().length} real part(s) from cad-audit/parts\n`);
  const fresh = await build();
  if (!fresh.length) {
    console.error('\n  Nothing measured — is the geometry kernel installed? (pip install -r requirements.txt)\n');
    finish(1);
  }
  if (update) {
    writeFileSync(BASELINE, `${JSON.stringify(fresh, null, 2)}\n`);
    console.log(`\n  Written: ${BASELINE}\n  Review the diff — this file is the record of what the tool does.\n`);
    finish(0);
  } else if (existsSync(BASELINE)) {
    const old = JSON.parse(readFileSync(BASELINE, 'utf8')) as PartBaseline[];
    const byPart = new Map(old.map(b => [b.part, b]));
    let drift = 0;
    for (const now of fresh) {
      const was = byPart.get(now.part);
      if (!was) { console.log(`  + ${now.part} is new`); drift++; continue; }
      if (JSON.stringify(was.outcome) !== JSON.stringify(now.outcome)) {
        console.log(`\n  ! ${now.part}`);
        console.log(`      was: ${JSON.stringify(was.outcome)}`);
        console.log(`      now: ${JSON.stringify(now.outcome)}`);
        drift++;
      }
    }
    console.log(drift
      ? `\n  ${drift} part(s) moved. If that is intended: --update\n`
      : '\n  No drift.\n');
    finish(drift ? 1 : 0);
  } else {
    console.log('\n  No baseline yet — run with --update to write one.\n');
    finish(1);
  }
}
