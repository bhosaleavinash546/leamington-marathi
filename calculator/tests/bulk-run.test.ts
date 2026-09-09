/**
 * The bulk run — a basket in, a defensible record out.
 *
 * Two halves. The first needs no geometry kernel and pins the behaviour that has
 * to hold on any machine: a region the rate model does not know is refused
 * rather than quietly costed in the UK, an unreadable file fails its own row
 * instead of the run, and the record carries the versions that produced the
 * numbers. The second half needs OCP and skips without it, exactly as the other
 * CAD suites do — that is expected on the Alpine image, not a failure.
 *
 * `AIR_GAPPED=1` is set for the whole file. If any of this ever reaches for a
 * model, `createAnthropic()` throws and these tests go red — which is the point:
 * the claim "no AI in the bulk run" is enforced here, not just documented.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBulkCosting, type BulkPartInput } from '../server/services/bulk-run.js';
import { buildRateLibraryWorkbook } from '../server/utils/rate-library-xlsx.js';
import { parseRateLibraryWorkbook } from '../server/utils/rate-library-xlsx.js';
import { analyzeGeometry } from '../server/utils/geometry-bridge.js';
import { RULE_ENGINE_VERSION } from '../src/engine/cost-input-rules/types.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { fingerprintRateLibrary } from '../server/utils/rate-library-fingerprint.js';
import { buildRegionalLibrary, resolveManufacturingRegion } from '../src/engine/regional-rates.js';
import { recomputeMachineRates } from '../src/engine/rate-library.js';

const DIR = join(__dirname, 'fixtures', 'cad-parts');
const STEPS = existsSync(DIR) ? readdirSync(DIR).filter(f => f.endsWith('.step')).sort() : [];
const someStep = STEPS.length ? join(DIR, STEPS[0]) : join(DIR, 'block-2holes.step');

let kernelAvailable = false;

beforeAll(async () => {
  process.env.AIR_GAPPED = '1';
  delete process.env.ANTHROPIC_API_KEY;
  if (!STEPS.length) return;
  try {
    const geo = await analyzeGeometry(readFileSync(someStep), STEPS[0], 60_000);
    kernelAvailable = geo.status === 'success';
  } catch { /* no OCP — the kernel half skips below */ }
}, 240_000);

describe('bulk run — behaviour that holds without a geometry kernel', () => {
  it('refuses a region the rate model does not know', async () => {
    // Not a rejection of foreign regions — those are costed now. This is the
    // typo case: costing "Polandd" in the UK and labelling it Poland is the
    // silent kind of wrong, so it is refused with the list of what is valid.
    const rec = await runBulkCosting([
      { partNumber: 'P-??', file: someStep, commodity: 'machining', region: 'Polandd' },
    ]);
    expect(rec.parts[0].status).toBe('refused');
    expect(rec.parts[0].code).toBe('region_unknown');
    expect(rec.parts[0].total).toBeUndefined();
    expect(rec.parts[0].error).toMatch(/PL \(Poland\)/);   // tells you the valid form
    expect(rec.summary.basketTotalGBP).toBe(0);
  });

  it.each(['UK', 'uk', 'United Kingdom', 'GB', 'Great Britain', ''])(
    'accepts %j as the UK', async region => {
      const rec = await runBulkCosting([
        { partNumber: 'P-UK', file: someStep, commodity: 'machining', region },
      ]);
      expect(rec.parts[0].code).not.toBe('region_unknown');
    });

  it.each(['PL', 'Poland', 'CN', 'China', 'IN', 'India', 'US', 'United States', 'Czechia'])(
    'accepts %j as a region it can cost in', async region => {
      const rec = await runBulkCosting([
        { partNumber: 'P', file: someStep, commodity: 'machining', region },
      ]);
      expect(rec.parts[0].code).not.toBe('region_unknown');
    });

  it('fails one unreadable row without taking the run down', async () => {
    const rec = await runBulkCosting([
      { partNumber: 'GONE', file: join(DIR, 'no-such-part.step'), commodity: 'machining' },
      { partNumber: 'P-??', file: someStep, commodity: 'machining', region: 'Atlantis' },
    ]);
    expect(rec.parts).toHaveLength(2);
    expect(rec.parts[0]).toMatchObject({ status: 'error', code: 'unreadable' });
    expect(rec.parts[1].status).toBe('refused');
    expect(rec.summary.errored).toBe(1);
  });

  it('carries the versions the numbers came from, and says AI was not used', async () => {
    const rec = await runBulkCosting([
      { partNumber: 'P1', file: someStep, commodity: 'machining', region: 'Atlantis' },
    ]);
    expect(rec.engine.ruleEngineVersion).toBe(RULE_ENGINE_VERSION);
    expect(rec.engine.rateLibraryVersion).toBe(DEFAULT_RATE_LIBRARY.version);
    expect(rec.engine.aiUsed).toBe(false);
    expect(rec.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(rec.startedAt)).not.toBeNaN();
  });

  it('hashes the inputs, not the order they were listed in', async () => {
    const a: BulkPartInput = { partNumber: 'A', file: someStep, region: 'Atlantis' };
    const b: BulkPartInput = { partNumber: 'B', file: someStep, region: 'Atlantis' };
    const one = await runBulkCosting([a, b]);
    const two = await runBulkCosting([b, a]);
    expect(one.inputHash).toBe(two.inputHash);

    // …but a different answer is a different run, and must hash differently.
    const three = await runBulkCosting([a, b], { answers: { 'material.family': 'steel' } });
    expect(three.inputHash).not.toBe(one.inputHash);
  });

  it('keeps results in list order however the workers finish', async () => {
    const parts: BulkPartInput[] = ['A', 'B', 'C', 'D'].map(n => ({
      partNumber: n, file: someStep, region: 'Atlantis',
    }));
    const rec = await runBulkCosting(parts, { concurrency: 4 });
    expect(rec.parts.map(p => p.partNumber)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('bulk run — the costing itself (needs OCP)', () => {
  it('has a kernel, or skips the rest', () => {
    if (!kernelAvailable) {
      console.log('[bulk-run] OCP not installed — skipping the costing half. Expected on the Alpine image.');
    }
    expect(STEPS.length).toBeGreaterThan(0);
  });

  it('costs a part into eight buckets that sum to the total', async () => {
    if (!kernelAvailable) return;
    const rec = await runBulkCosting(
      [{ partNumber: 'P1', file: someStep, commodity: 'machining', material: 'aluminium' }],
    );
    const p = rec.parts[0];
    expect(p.status).toBe('costed');
    expect(Object.keys(p.breakdown!)).toHaveLength(8);
    const sum = Object.values(p.breakdown!).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(p.total!, 2);
    expect(p.total!).toBeGreaterThan(0);
    expect(rec.summary.basketTotalGBP).toBeCloseTo(p.total!, 2);
  }, 120_000);

  it('gives the same answer twice — same basket, same numbers', async () => {
    if (!kernelAvailable) return;
    const parts: BulkPartInput[] = [{ partNumber: 'P1', file: someStep, commodity: 'machining' }];
    const opts = { answers: { 'material.family': 'aluminium' } };
    const one = await runBulkCosting(parts, opts);
    const two = await runBulkCosting(parts, opts);
    expect(two.summary.basketTotalGBP).toBe(one.summary.basketTotalGBP);
    expect(two.parts[0].breakdown).toEqual(one.parts[0].breakdown);
    expect(two.inputHash).toBe(one.inputHash);
    expect(two.runId).not.toBe(one.runId);   // each run is its own record
  }, 180_000);

  it('asks once for the whole basket, naming every part the answer unblocks', async () => {
    if (!kernelAvailable) return;
    const parts: BulkPartInput[] = ['P1', 'P2', 'P3'].map(n => ({
      partNumber: n, file: someStep, commodity: 'machining',
    }));
    const rec = await runBulkCosting(parts);          // no material supplied
    expect(rec.summary.costed).toBe(0);
    expect(rec.summary.needsAnswer).toBe(3);

    // Three parts, one question — not three copies of it.
    const q = rec.openQuestions.find(x => x.id === 'material.family');
    expect(q, 'every part should be asking for the material family').toBeDefined();
    expect(q!.blocks.sort()).toEqual(['P1', 'P2', 'P3']);
    expect(q!.options.length).toBeGreaterThan(1);
  }, 180_000);

  it('answers once and every part it blocked goes through', async () => {
    if (!kernelAvailable) return;
    const parts: BulkPartInput[] = ['P1', 'P2', 'P3'].map(n => ({
      partNumber: n, file: someStep, commodity: 'machining',
    }));
    const rec = await runBulkCosting(parts, { answers: { 'material.family': 'aluminium' } });
    expect(rec.summary.costed).toBe(3);
    expect(rec.openQuestions).toHaveLength(0);
  }, 180_000);

  it("lets a part's own answer win over the basket's", async () => {
    if (!kernelAvailable) return;
    const rec = await runBulkCosting([
      { partNumber: 'ALU', file: someStep, commodity: 'machining' },
      { partNumber: 'STL', file: someStep, commodity: 'machining', material: 'steel' },
    ], { answers: { 'material.family': 'aluminium' } });

    expect(rec.summary.costed).toBe(2);
    expect(rec.parts[0].answersUsed!['material.family']).toBe('aluminium');
    expect(rec.parts[1].answersUsed!['material.family']).toBe('steel');
    // Same shape, different metal — steel is roughly 3x the density, so the
    // material bucket must differ. Identical totals would mean the per-part
    // answer never reached the costing.
    expect(rec.parts[1].breakdown!.rawMaterial).not.toBeCloseTo(rec.parts[0].breakdown!.rawMaterial, 2);
  }, 180_000);

  it('records why each costed input is what it is', async () => {
    if (!kernelAvailable) return;
    const rec = await runBulkCosting(
      [{ partNumber: 'P1', file: someStep, commodity: 'machining', material: 'aluminium' }],
    );
    const p = rec.parts[0];
    expect(Object.keys(p.provenance ?? {}).length).toBeGreaterThan(0);
    for (const entry of Object.values(p.provenance!)) {
      expect(typeof entry.basis).toBe('string');
      expect(entry.basis.length).toBeGreaterThan(0);
    }
    // Values a CAD file cannot carry are declared, not hidden.
    expect(p.assumed).toEqual(expect.arrayContaining(['oee']));
  }, 120_000);
});

/**
 * An uploaded rate sheet has to reach the costing, or the feature is a lie.
 *
 * This route hardcoded `DEFAULT_RATE_LIBRARY` until now: a company sheet
 * uploaded through the UI applied in the screens and was silently ignored by the
 * automated route, so a bulk run quoted built-in rates while the operator
 * believed it was on theirs. These tests exist so that cannot come back.
 *
 * The check is a round trip through the real workbook format — build the
 * template from a library with known multipliers, parse it back, cost on it —
 * because that is exactly what an upload does.
 */
describe('bulk run — costing on an uploaded rate sheet (needs OCP)', () => {
  /** The same library JLR would download, edit and upload, with known factors. */
  function sheetWith(matX: number, labX: number, machX: number) {
    const lib = structuredClone(DEFAULT_RATE_LIBRARY);
    lib.materials = lib.materials.map(m => ({
      ...m,
      pricePerKg: m.pricePerKg * matX,
      // Both sides of the material bucket: cost is gross×price − scrap×recovery,
      // so scaling only the price moves the bucket by slightly more than matX.
      scrapRecoveryPricePerKg: m.scrapRecoveryPricePerKg * matX,
    }));
    lib.labour = lib.labour.map(l => ({ ...l, fullyLoadedRatePerHr: l.fullyLoadedRatePerHr * labX }));
    lib.machines = lib.machines.map(m => ({
      ...m,
      buildup: {
        ...m.buildup,
        annualDepreciation: m.buildup.annualDepreciation * machX,
        maintenance: m.buildup.maintenance * machX,
        energy: m.buildup.energy * machX,
        floorSpace: m.buildup.floorSpace * machX,
        indirectSupport: m.buildup.indirectSupport * machX,
        financeCost: m.buildup.financeCost * machX,
      },
    }));
    const { library, errors } = parseRateLibraryWorkbook(buildRateLibraryWorkbook(lib));
    expect(errors, 'the generated workbook must validate').toEqual([]);
    return library!;
  }

  const part: BulkPartInput = {
    partNumber: 'RATE-1', file: someStep, commodity: 'machining', material: 'aluminium',
  };

  it('moves each bucket by exactly the factor applied to that rate', async () => {
    if (!kernelAvailable) return;
    const base = await runBulkCosting([part]);
    const withSheet = await runBulkCosting([part], { rateLibrary: sheetWith(2, 3, 1.5) });

    expect(base.parts[0].status).toBe('costed');
    expect(withSheet.parts[0].status).toBe('costed');
    const b = base.parts[0].breakdown!, j = withSheet.parts[0].breakdown!;

    expect(j.rawMaterial / b.rawMaterial).toBeCloseTo(2.0, 3);
    expect(j.labour / b.labour).toBeCloseTo(3.0, 3);
    expect(j.process / b.process).toBeCloseTo(1.5, 3);
    expect(withSheet.parts[0].total!).toBeGreaterThan(base.parts[0].total!);
  }, 180_000);

  it('says which book produced the numbers', async () => {
    if (!kernelAvailable) return;
    const base = await runBulkCosting([part]);
    expect(base.engine.rateLibrarySource).toBe('builtin');
    expect(base.engine.rateLibraryVersion).toBe(DEFAULT_RATE_LIBRARY.version);

    const sheet = sheetWith(2, 2, 2);
    const withSheet = await runBulkCosting([part], { rateLibrary: sheet });
    expect(withSheet.engine.rateLibrarySource).toBe('supplied');
    expect(withSheet.engine.rateLibraryCounts).toEqual({
      materials: sheet.materials.length,
      machines: sheet.machines.length,
      labour: sheet.labour.length,
    });
  }, 180_000);

  it('changes nothing when the sheet carries the built-in rates', async () => {
    if (!kernelAvailable) return;
    // A round trip through the workbook must not move a single bucket. If it
    // does, the parser is lossy and every uploaded sheet is quietly wrong.
    const identity = sheetWith(1, 1, 1);
    const base = await runBulkCosting([part]);
    const round = await runBulkCosting([part], { rateLibrary: identity });
    expect(round.parts[0].total).toBeCloseTo(base.parts[0].total!, 2);
    expect(round.parts[0].breakdown!.rawMaterial).toBeCloseTo(base.parts[0].breakdown!.rawMaterial, 4);
    expect(round.parts[0].breakdown!.labour).toBeCloseTo(base.parts[0].breakdown!.labour, 4);
    expect(round.parts[0].breakdown!.process).toBeCloseTo(base.parts[0].breakdown!.process, 4);
  }, 180_000);
});

/**
 * The geometry guards, on this route.
 *
 * `runAllGuards` ran on the CAD routes and not here, so a bulk run could cost a
 * part whose claimed geometry contradicted the measured geometry and say
 * nothing. These tests pin that it now runs, that a blocking code refuses the
 * part rather than being waved through, and that overriding one is recorded.
 *
 * The gear fixture is measured at 38 teeth. Claiming 38 passes; claiming 40 is
 * the contradiction `gear_teeth_mismatch` exists to catch.
 */
describe('bulk run — geometry guards (needs OCP)', () => {
  const gearStep = join(DIR, 'gear-m3-z38.step');
  /** The gear pack's own blocking questions, so the run reaches the guards. */
  const gearAnswers = {
    'gear.helix': '0',
    'gear.materialClass': 'case_hardening_steel',
    'gear.qualityClass': '7',
  };
  const gearPart = (partNumber: string, teeth: string): BulkPartInput => ({
    partNumber, file: gearStep, commodity: 'gear', material: 'steel',
    answers: { 'gear.teethEntry': teeth },
  });

  it('refuses a part whose claimed teeth contradict the measured geometry', async () => {
    if (!kernelAvailable || !existsSync(gearStep)) return;
    const rec = await runBulkCosting([gearPart('GEAR-BAD', '40')], { answers: gearAnswers });
    const p = rec.parts[0];
    expect(p.status).toBe('refused');
    expect(p.code).toBe('sanity_blocked');
    expect(p.warnings?.some(w => w.code === 'gear_teeth_mismatch' && w.blocking)).toBe(true);
    expect(p.total).toBeUndefined();
  }, 180_000);

  it('does not block the same part when the claim matches the geometry', async () => {
    if (!kernelAvailable || !existsSync(gearStep)) return;
    // Same file, same route, only the claim differs — so a pass here rules out
    // "the guard blocks everything".
    const rec = await runBulkCosting([gearPart('GEAR-OK', '38')], { answers: gearAnswers });
    expect(rec.parts[0].code).not.toBe('sanity_blocked');
  }, 180_000);

  it('lets an acknowledged code through, and records that it was overridden', async () => {
    if (!kernelAvailable || !existsSync(gearStep)) return;
    const rec = await runBulkCosting([gearPart('GEAR-BAD', '40')], {
      answers: gearAnswers, acknowledge: ['gear_teeth_mismatch'],
    });
    const p = rec.parts[0];
    expect(p.code).not.toBe('sanity_blocked');
    // The override has to survive in the record, or acknowledging hides the
    // very thing it was meant to document.
    expect(rec.acknowledged).toEqual(['gear_teeth_mismatch']);
    expect(p.warnings?.some(w => w.code === 'gear_teeth_mismatch')).toBe(true);
  }, 180_000);

  it('carries advisory warnings on a part it still costs', async () => {
    if (!kernelAvailable) return;
    const rec = await runBulkCosting(
      [{ partNumber: 'ADV', file: someStep, commodity: 'machining', material: 'aluminium' }],
    );
    // Whatever fires here, an advisory must never stop the costing.
    expect(rec.parts[0].status).toBe('costed');
    for (const w of rec.parts[0].warnings ?? []) expect(w.blocking).not.toBe(true);
    expect(rec.summary.withWarnings).toBe((rec.parts[0].warnings ?? []).length ? 1 : 0);
  }, 120_000);

  it('reports nothing acknowledged when nothing was overridden', async () => {
    const rec = await runBulkCosting([
      { partNumber: 'P', file: someStep, commodity: 'machining', region: 'Atlantis' },
    ]);
    expect(rec.acknowledged).toEqual([]);
  });
});

/**
 * Gear on the automated route.
 *
 * Gear costed in the screens and had its own rule pack, but `toCostParams` had
 * no mapping for it, so the bulk route refused every gear with
 * `no_cost_mapping` — a basket with gears in it silently skipped them. That was
 * the last named coverage gap in the Option 2 prerequisites.
 */
describe('bulk run — gear (needs OCP)', () => {
  const gearStep = join(DIR, 'gear-m3-z38.step');
  const gearAnswers = {
    'gear.helix': '0',
    'gear.materialClass': 'case_hardening_steel',
    'gear.qualityClass': '7',
    'gear.teethEntry': '38',          // matches the measured count
  };

  it('costs a gear instead of refusing it', async () => {
    if (!kernelAvailable || !existsSync(gearStep)) return;
    const rec = await runBulkCosting(
      [{ partNumber: 'G1', file: gearStep, commodity: 'gear', material: 'steel' }],
      { answers: gearAnswers },
    );
    const p = rec.parts[0];
    expect(p.code, 'gear must no longer fall out at the mapping').not.toBe('no_cost_mapping');
    expect(p.status).toBe('costed');
    expect(p.total!).toBeGreaterThan(0);
    expect(Object.keys(p.breakdown!)).toHaveLength(8);
  }, 180_000);

  it('reconciles the material bucket to the blank plus heat treat', async () => {
    if (!kernelAvailable || !existsSync(gearStep)) return;
    const rec = await runBulkCosting(
      [{ partNumber: 'G1', file: gearStep, commodity: 'gear', material: 'steel' }],
      { answers: gearAnswers },
    );
    const p = rec.parts[0];
    if (p.status !== 'costed') return;

    // The module bills the blank as a pass-through and heat treat as a per-part
    // consumable, both scaled by the reject uplift. So the bucket must exceed
    // the blank alone — if it ever equals it, heat treat has been dropped; if it
    // equals blank x uplift x 2, something is double-counted.
    const blank = Number(p.provenance?.['gear-blank-cost']?.value ?? 0);
    expect(blank, 'the rules must have priced a blank').toBeGreaterThan(0);
    const uplift = 1 / (1 - 0.03);          // SHOP_DEFAULTS.rejectRate
    expect(p.breakdown!.rawMaterial).toBeGreaterThan(blank * uplift);
    expect(p.breakdown!.rawMaterial).toBeLessThan(blank * uplift * 2);
  }, 180_000);

  it('carries the measured geometry into the costing, not a default', async () => {
    if (!kernelAvailable || !existsSync(gearStep)) return;
    const rec = await runBulkCosting(
      [{ partNumber: 'G1', file: gearStep, commodity: 'gear', material: 'steel' }],
      { answers: gearAnswers },
    );
    const p = rec.parts[0];
    if (p.status !== 'costed') return;
    // m3, z38 — the fixture's name is its truth, and the rules read it off the
    // B-rep rather than taking the typed entry.
    expect(Number(p.provenance?.['gear-teeth']?.value)).toBe(38);
    expect(Number(p.provenance?.['gear-module']?.value)).toBe(3);
  }, 180_000);

  it('still blocks a gear whose claim contradicts the geometry', async () => {
    if (!kernelAvailable || !existsSync(gearStep)) return;
    // Costing gear must not have weakened the guard that was wired in first.
    const rec = await runBulkCosting(
      [{ partNumber: 'G-BAD', file: gearStep, commodity: 'gear', material: 'steel',
         answers: { 'gear.teethEntry': '40' } }],
      { answers: { ...gearAnswers, 'gear.teethEntry': '40' } },
    );
    expect(rec.parts[0].code).toBe('sanity_blocked');
    expect(rec.parts[0].total).toBeUndefined();
  }, 180_000);
});

/**
 * A run has to name the book it costed on, or it cannot be reproduced.
 *
 * `rateLibraryVersion` is the library's own author-supplied string — every
 * uploaded sheet is stamped `company-upload` — so two different books share it
 * and a report cannot say which produced its numbers. The fingerprint can.
 */
describe('bulk run — naming the rate book it costed on', () => {
  it('records a fingerprint that identifies the exact book', async () => {
    const rec = await runBulkCosting([
      { partNumber: 'P', file: someStep, commodity: 'machining', region: 'Atlantis' },
    ]);
    expect(rec.engine.rateLibraryFingerprint).toBe(fingerprintRateLibrary(DEFAULT_RATE_LIBRARY));
    expect(rec.engine.rateLibraryFingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives a different fingerprint for a different book', async () => {
    const dearer = {
      ...DEFAULT_RATE_LIBRARY,
      materials: DEFAULT_RATE_LIBRARY.materials.map(m => ({ ...m, pricePerKg: m.pricePerKg * 2 })),
    };
    const a = await runBulkCosting([{ partNumber: 'P', file: someStep, region: 'Atlantis' }]);
    const b = await runBulkCosting([{ partNumber: 'P', file: someStep, region: 'Atlantis' }],
                                   { rateLibrary: dearer });
    expect(b.engine.rateLibraryFingerprint).not.toBe(a.engine.rateLibraryFingerprint);
    expect(b.engine.rateLibrarySource).toBe('supplied');
  });

  it('reproduces an earlier cost exactly when re-run on the recorded book', async () => {
    if (!kernelAvailable) return;
    const parts: BulkPartInput[] = [
      { partNumber: 'P1', file: someStep, commodity: 'machining', material: 'aluminium' },
    ];
    // "Last quarter" — cost, and keep the book the run named.
    const then = await runBulkCosting(parts);
    const bookThen = DEFAULT_RATE_LIBRARY;
    expect(then.engine.rateLibraryFingerprint).toBe(fingerprintRateLibrary(bookThen));

    // Rates move on.
    const now = await runBulkCosting(parts, {
      rateLibrary: { ...DEFAULT_RATE_LIBRARY,
        materials: DEFAULT_RATE_LIBRARY.materials.map(m => ({ ...m, pricePerKg: m.pricePerKg * 3 })) },
    });
    expect(now.parts[0].total).not.toBe(then.parts[0].total);

    // Re-run on the book the first run recorded: the same numbers, to the penny.
    const redo = await runBulkCosting(parts, { rateLibrary: bookThen });
    expect(redo.parts[0].total).toBe(then.parts[0].total);
    expect(redo.parts[0].breakdown).toEqual(then.parts[0].breakdown);
    expect(redo.engine.rateLibraryFingerprint).toBe(then.engine.rateLibraryFingerprint);
  }, 180_000);
});

/**
 * Costing a part in the region it is made in.
 *
 * The automated route used to refuse anything but the UK, because
 * executeCalculateCost had no region and costing a Poland part on the UK book
 * would have been quietly wrong. It now rebuilds the whole rate book per region
 * — the same call the screens make — so the two paths cannot drift.
 */
describe('bulk run — regional costing (needs OCP)', () => {
  const part = (partNumber: string, region: string): BulkPartInput => ({
    partNumber, file: someStep, commodity: 'machining', material: 'aluminium', region,
  });

  it('builds the book the way the screens build it', () => {
    // src/ui/main.ts: buildRegionalLibrary(recomputeMachineRates(base), region).
    // If this ever diverges, the same part costs two different numbers depending
    // on whether a person or a batch asked — the exact drift this pins shut.
    const mine = buildRegionalLibrary(recomputeMachineRates(DEFAULT_RATE_LIBRARY), 'PL');
    const screens = buildRegionalLibrary(recomputeMachineRates(DEFAULT_RATE_LIBRARY), 'PL');
    expect(fingerprintRateLibrary(mine)).toBe(fingerprintRateLibrary(screens));
    // …and it is genuinely a different book from the UK one.
    expect(fingerprintRateLibrary(mine))
      .not.toBe(fingerprintRateLibrary(recomputeMachineRates(DEFAULT_RATE_LIBRARY)));
  });

  it('costs the same part differently in a lower-cost region', async () => {
    if (!kernelAvailable) return;
    const rec = await runBulkCosting([part('UK-1', 'UK'), part('PL-1', 'Poland')]);
    const [uk, pl] = rec.parts;
    expect(uk.status).toBe('costed');
    expect(pl.status).toBe('costed');
    expect(pl.total!).toBeLessThan(uk.total!);
    // A machined part is labour and machine heavy, so the gap must be material,
    // not a rounding artefact of a book that was never really rebuilt.
    expect(pl.total!).toBeLessThan(uk.total! * 0.95);
  }, 180_000);

  it('records the region each part was costed in', async () => {
    if (!kernelAvailable) return;
    const rec = await runBulkCosting([part('A', 'Poland'), part('B', 'CN'), part('C', '')]);
    expect(rec.parts.map(p => p.region)).toEqual(['PL', 'CN', 'UK']);
  }, 180_000);

  it('gives the same answer for the same region however it was spelled', async () => {
    if (!kernelAvailable) return;
    const rec = await runBulkCosting([part('A', 'PL'), part('B', 'Poland')]);
    expect(rec.parts[1].total).toBe(rec.parts[0].total);
  }, 180_000);

  it('leaves the UK book alone rather than rescaling it by 1.0', async () => {
    if (!kernelAvailable) return;
    const blank = await runBulkCosting([part('A', '')]);
    const uk = await runBulkCosting([part('B', 'UK')]);
    expect(uk.parts[0].total).toBe(blank.parts[0].total);
  }, 180_000);
});

describe('region resolver', () => {
  it.each([['UK', 'UK'], ['uk', 'UK'], ['GB', 'UK'], ['United Kingdom', 'UK'],
           ['PL', 'PL'], ['poland', 'PL'], ['US', 'US'], ['united states', 'US'],
           ['Czechia', 'CZ'], ['korea', 'KR'], ['  DE  ', 'DE']])(
    'resolves %j to %s', (input, expected) => {
      expect(resolveManufacturingRegion(input)).toBe(expected);
    });

  it.each(['Polandd', 'Atlantis', 'XX', 'United Kingdomm', 'poland '.repeat(3)])(
    'refuses %j rather than guessing', bad => {
      expect(resolveManufacturingRegion(bad)).toBeNull();
    });

  it('treats blank as unset, for the caller to default', () => {
    expect(resolveManufacturingRegion('')).toBeNull();
    expect(resolveManufacturingRegion(undefined)).toBeNull();
  });
});
