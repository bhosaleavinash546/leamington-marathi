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
import { developBlankFromCad } from '../server/services/blank-development.js';
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
    note: 'Suspension upright — safety-critical, so forged in production. 9.0 mm bulk wall, 6% fill. '
        + 'Standard as-forged tolerance: the bearing bore and mounting faces are finish-machined after, '
        + 'which the forging route carries as secondary machining.',
    answers: { 'material.family': 'steel', 'commodity.route': 'forging',
               'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' },
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
  // ── Injection mouldings (moulding review, 2 Oct 2026) ─────────────────────
  // NOT customer parts: modelled in OCP to production moulding design rules by
  // cad-audit/parts/IM_modelled_parts.py (drafted walls, fillets, bosses, ribs,
  // snap windows) because the audit set held no plastic part at all, and the
  // synthetic test fixtures had hidden a 59 mm "wall" on a 2.5 mm cover. Replace
  // with real mouldings and their quotes when JLR can supply them.
  'IM_ECU_Cover.stp': {
    note: 'MODELLED: 180 x 120 x 40 mm ECU cover, 2.5 mm wall, 1.5° draft, 4 screw bosses, rib grid, '
        + '4 snap-fit windows. PA66-GF30, the usual under-bonnet cover grade.',
    answers: { 'material.resin': 'mat-pa66gf30', 'commodity.route': 'injection_moulding',
               'commodity.thinWallRoute': 'injection_moulding' },
  },
  'IM_Cable_Clip.stp': {
    note: 'MODELLED: 40 x 25 x 12 mm cable clip, 2.0 mm wall, latch window. PA66-GF30.',
    answers: { 'material.resin': 'mat-pa66gf30', 'commodity.route': 'injection_moulding',
               'commodity.thinWallRoute': 'injection_moulding' },
  },
  'IM_Storage_Tray.stp': {
    note: 'MODELLED: 600 x 400 x 60 mm tray, 3.0 mm wall, 2° draft, R5 fillets, 2 ribs. Impact PP.',
    answers: { 'material.resin': 'mat-pp-impact', 'commodity.route': 'injection_moulding',
               'commodity.thinWallRoute': 'injection_moulding' },
  },
  // ── BIW pressings (sheet-metal review, 2 Oct 2026) ────────────────────────
  // NOT customer parts: modelled in OCP by cad-audit/parts/BIW_modelled_parts.py
  // because the audit set held one pressing (the seat bracket) and no drawn
  // panel, so the transfer and tandem routes had never seen real geometry.
  'BIW_Floor_Reinforcement.stp': {
    note: 'MODELLED: 450 x 300 x 70 mm drawn pan, 1.2 mm, 4° draft, R15/R8, 25 mm flange, 2 holes. Mild steel.',
    answers: { 'material.family': 'steel', 'commodity.route': 'sheet_metal', 'commodity.thinWallRoute': 'sheet_metal' },
  },
  'BIW_Inner_Panel.stp': {
    note: 'MODELLED: 1100 x 700 x 120 mm drawn inner panel, 0.9 mm, 5° draft, R40/R15, 30 mm flange. Mild steel.',
    answers: { 'material.family': 'steel', 'commodity.route': 'sheet_metal', 'commodity.thinWallRoute': 'sheet_metal' },
  },
  'BIW_Reinf_Channel.stp': {
    note: 'MODELLED: 240 mm U-channel reinforcement, 60 x 40 mm section, 2.0 mm, R3 bends, 3 holes. Mild steel.',
    answers: { 'material.family': 'steel', 'commodity.route': 'sheet_metal', 'commodity.thinWallRoute': 'sheet_metal' },
  },
  // ── Machined from solid (machining review, 2 Oct 2026) ────────────────────
  // NOT customer parts: modelled in OCP by cad-audit/parts/MACH_modelled_parts.py
  // because nothing in the audit set is unambiguously cut from bar or plate
  // (Part1's own STEP header calls it CASTING-01), and no turned part existed.
  'MACH_Hydraulic_Manifold.stp': {
    note: 'MODELLED: 120 x 80 x 60 mm 6082 manifold — R5 pocket, 4 x Ø11 through, 3 x Ø18 x 40 ports, '
        + '2 x Ø8 cross galleries, 4 x Ø5 tapping holes. Cut from plate.',
    answers: { 'material.family': 'aluminium', 'commodity.route': 'machining' },
  },
  'MACH_Stepped_Shaft.stp': {
    note: 'MODELLED: Ø40 x 190 mm stepped shaft — Ø25 journals, Ø30 body with an 8 mm keyway, '
        + 'Ø20 spigot with a Ø6 cross hole. Turned from steel bar.',
    answers: { 'material.family': 'steel', 'commodity.route': 'machining' },
  },
  // ── Forgings (forging review, 2 Oct 2026) ─────────────────────────────────
  // NOT customer parts: modelled in OCP by cad-audit/parts/FORGE_modelled_parts.py
  // because the audit set held one forging (the knuckle).
  'FORGE_Control_Arm_Yoke.stp': {
    note: 'MODELLED: control-arm yoke, two Ø50 eyes 200 mm apart, I-section arm, Ø22 bores. '
        + 'Closed-die steel, safety-critical (suspension).',
    answers: { 'material.family': 'steel', 'commodity.route': 'forging',
               'service.toleranceClass': 'standard', 'service.safetyCritical': 'yes' },
  },
  'FORGE_Hub_Flange.stp': {
    note: 'MODELLED: Ø140 flange, Ø80 hub, Ø60 bore, 6 × Ø14 bolt holes. Steel, not safety-critical.',
    answers: { 'material.family': 'steel', 'commodity.route': 'forging',
               'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' },
  },
  // ── Rubber (rubber review, 2 Oct 2026) ────────────────────────────────────
  // NOT customer parts: modelled in OCP by cad-audit/parts/RUB_modelled_parts.py
  // because the audit set held no rubber part.
  'RUB_Grommet.stp': {
    note: 'MODELLED: Ø40 flange, Ø26 body, Ø12 bore EPDM grommet — the commonest moulded rubber part.',
    answers: { 'material.elastomer': 'mat-epdm', 'commodity.route': 'rubber' },
  },
  'RUB_AV_Mount.stp': {
    note: 'MODELLED: 60 × 60 × 35 mm natural-rubber mount block, Ø10 bore — the thick-section cure case.',
    answers: { 'material.elastomer': 'mat-nr', 'commodity.route': 'rubber' },
  },
  'RUB_Door_Seal.stp': {
    note: 'MODELLED: 1 m EPDM door-seal profile (hollow bulb on a foot) — an extrusion.',
    answers: { 'material.elastomer': 'mat-epdm', 'commodity.route': 'rubber' },
  },
  // ── Blow moulding (blow-moulding review, 3 Oct 2026) ─────────────────────
  // NOT customer parts: modelled in OCP by cad-audit/parts/BM_modelled_parts.py.
  // The real fuel tank's STEP is not in the repo; its measured geometry is
  // pinned in tests/blow-moulding-review.test.ts instead.
  'BM_Washer_Reservoir.stp': {
    note: 'MODELLED: 220 × 160 × 130 mm HDPE washer reservoir, 2.5 mm wall, Ø40 filler neck (~3.8 L).',
    answers: { 'material.family': 'plastic', 'material.resin': 'mat-hdpe',
               'commodity.route': 'blow_moulding', 'blow.capacityL': '2_20' },
  },
  'BM_Air_Duct.stp': {
    note: 'MODELLED: Ø70 × 2 mm PP air duct with a 90° elbow, open both ends (2.5 L inside).',
    answers: { 'material.family': 'plastic', 'material.resin': 'mat-pp-homo',
               'commodity.route': 'blow_moulding', 'blow.capacityL': 'exact', 'blow.capacityExactL': '2.5' },
  },
  // ── Rotational moulding (rotational-moulding review, 3 Oct 2026) ─────────
  // NOT customer parts: modelled in OCP by cad-audit/parts/ROTO_modelled_parts.py.
  // Recorded at the baseline's 50,000/yr; the review test pins them at 5,000.
  'ROTO_Coolant_Tank.stp': {
    note: 'MODELLED: 450 × 320 × 260 mm LLDPE coolant / AdBlue tank, 5 mm wall, Ø60 filler neck (~30 L).',
    answers: { 'material.family': 'plastic', 'material.resin': 'mat-lldpe-roto', 'commodity.route': 'rotational_moulding' },
  },
  'ROTO_Header_Tank.stp': {
    note: 'MODELLED: 240 × 160 × 140 mm LLDPE header tank, 4 mm wall, Ø40 neck (~4 L) — shares an arm.',
    answers: { 'material.family': 'plastic', 'material.resin': 'mat-lldpe-roto', 'commodity.route': 'rotational_moulding' },
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
    let geo = await analyzeGeometry(bytes, f, 300_000);
    if (geo.status !== 'success') {
      console.log(`  ${f.padEnd(28)} geometry failed: ${geo.error}`);
      continue;
    }
    // A sheet part is costed on its developed blank, the way the route does it.
    const dev = await developBlankFromCad(bytes, f, geo);
    if (dev && 'blank' in dev) geo = { ...geo, blank: dev.blank };
    else if (dev && 'error' in dev) console.log(`  ${f.padEnd(28)} blank unfold failed: ${dev.error}`);
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
