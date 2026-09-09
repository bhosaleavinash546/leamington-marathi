/**
 * The bulk run — a basket in, a defensible record out.
 *
 * Two halves. The first needs no geometry kernel and pins the behaviour that has
 * to hold on any machine: a non-UK region is refused rather than costed at UK
 * rates, an unreadable file fails its own row instead of the run, and the record
 * carries the versions that produced the numbers. The second half needs OCP and
 * skips without it, exactly as the other CAD suites do — that is expected on the
 * Alpine image, not a failure.
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
  it('refuses a non-UK region instead of quietly costing it at UK rates', async () => {
    // executeCalculateCost takes no region and always uses the UK book. Costing a
    // Poland part on it would be wrong in a way a spreadsheet never shows.
    const rec = await runBulkCosting([
      { partNumber: 'P-PL', file: someStep, commodity: 'machining', region: 'Poland' },
    ]);
    expect(rec.parts[0].status).toBe('refused');
    expect(rec.parts[0].code).toBe('region_unsupported');
    expect(rec.parts[0].total).toBeUndefined();
    expect(rec.summary.basketTotalGBP).toBe(0);
  });

  it.each(['UK', 'uk', 'United Kingdom', ''])('accepts %j as the UK', async region => {
    const rec = await runBulkCosting([
      { partNumber: 'P-UK', file: someStep, commodity: 'machining', region },
    ]);
    expect(rec.parts[0].code).not.toBe('region_unsupported');
  });

  it('fails one unreadable row without taking the run down', async () => {
    const rec = await runBulkCosting([
      { partNumber: 'GONE', file: join(DIR, 'no-such-part.step'), commodity: 'machining' },
      { partNumber: 'P-PL', file: someStep, commodity: 'machining', region: 'Poland' },
    ]);
    expect(rec.parts).toHaveLength(2);
    expect(rec.parts[0]).toMatchObject({ status: 'error', code: 'unreadable' });
    expect(rec.parts[1].status).toBe('refused');
    expect(rec.summary.errored).toBe(1);
  });

  it('carries the versions the numbers came from, and says AI was not used', async () => {
    const rec = await runBulkCosting([
      { partNumber: 'P1', file: someStep, commodity: 'machining', region: 'Poland' },
    ]);
    expect(rec.engine.ruleEngineVersion).toBe(RULE_ENGINE_VERSION);
    expect(rec.engine.rateLibraryVersion).toBe(DEFAULT_RATE_LIBRARY.version);
    expect(rec.engine.aiUsed).toBe(false);
    expect(rec.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(rec.startedAt)).not.toBeNaN();
  });

  it('hashes the inputs, not the order they were listed in', async () => {
    const a: BulkPartInput = { partNumber: 'A', file: someStep, region: 'Poland' };
    const b: BulkPartInput = { partNumber: 'B', file: someStep, region: 'Poland' };
    const one = await runBulkCosting([a, b]);
    const two = await runBulkCosting([b, a]);
    expect(one.inputHash).toBe(two.inputHash);

    // …but a different answer is a different run, and must hash differently.
    const three = await runBulkCosting([a, b], { answers: { 'material.family': 'steel' } });
    expect(three.inputHash).not.toBe(one.inputHash);
  });

  it('keeps results in list order however the workers finish', async () => {
    const parts: BulkPartInput[] = ['A', 'B', 'C', 'D'].map(n => ({
      partNumber: n, file: someStep, region: 'Poland',
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
