/**
 * Rates flow R2 (Nov 2026): every rate comes from one stated place, and a company row changes ONLY the country it names.
 *
 *  1. A country book is rebuilt from the BUILT-IN UK basis — a company UK row (machine build-up, material £/kg, process
 *     labour grade, energy-uk, alias, cell override) never moves another country: not through a held / at-par capital,
 *     a "book size" ratio, a material at par or a scrap ratio (the perturbation review's China leaks).
 *  2. Per-country rows: a Materials / Machines row with a country is that country's (and only its); lab-<cc>-* and
 *     energy-<cc> name their country in the id; Overhead and Services rows carry a country.
 *  3. The Overhead sheet sets overhead and margin per commodity and country, screen and headless; the built-in reproduces
 *     the 12 % / 8 % every costing used.
 *  4. Services & toolroom: every £ service / toolroom / tool constant is a book row read through the active book; the
 *     built-in values are the old literals; a country row is that country's figure.
 *  5. No FX sheet: an old workbook's FX sheet is ignored with a warning.
 *
 * Every expected Δ is re-added here from the trace's stack input — never by calling the engine for the answer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { resolveActiveLibrary, companyDelta, builtInUkBasis } from '../src/engine/rate-library-merge.js';
import { buildRegionalLibrary, regionalShopDefaults, shopRowFor, REGIONAL_DATA, type ManufacturingRegion } from '../src/engine/regional-rates.js';
import { withRates } from '../src/engine/rate-context.js';
import { countryFactor } from '../src/engine/regional-services.js';
import { SERVICE_RATES } from '../src/engine/service-rates-data.js';
import { serviceUk, parseServiceBasis } from '../src/engine/service-rates.js';
import { TOOLROOM_RATES, TOOL_MATERIAL_GBP_PER_KG } from '../src/engine/toolmaking.js';
import { fixtureCostGBP, toolWearPerPart } from '../src/engine/machining-time.js';
import { ndtStationCostPerPart, estimateCastingSecondaryAdders } from '../src/engine/modules/casting-advisor.js';
import { estimateForgingSecondaryAdders } from '../src/engine/modules/forging-advisor.js';
import { BUILT_IN_SHOP_ROW } from '../src/engine/shop-defaults-data.js';
import { buildRateLibraryWorkbook, parseRateLibraryWorkbook, bookFromWorkbook } from '../server/utils/rate-library-xlsx.js';
import { fingerprintRateLibrary } from '../server/utils/rate-library-fingerprint.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import type { RateLibrary, UniversalStackInput } from '../src/engine/types.js';

const LIB = DEFAULT_RATE_LIBRARY;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const BASELINE = (JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as Array<{
  part: string; answers: Record<string, string>; commodity?: string; geometry: OCCTGeometry; outcome: { status: string; total?: number } }>)
  .filter(p => p.outcome.status === 'costed');
const COLS = ['annualDepreciation', 'maintenance', 'energy', 'floorSpace', 'indirectSupport', 'financeCost'] as const;

/** A company book (as resolveActiveLibrary makes it) from rows. */
function company(rows: Partial<RateLibrary>): RateLibrary {
  const c = { materials: [], machines: [], labour: [], energy: [], fx: [], overheadDefaults: [], services: [], version: 'c', lastModified: '2026-11-05', ...rows } as RateLibrary;
  return resolveActiveLibrary({ builtIn: LIB, company: c, source: 'company' }).library;
}
const machine = (id: string, k: number) => { const m = clone(LIB.machines.find(x => x.id === id)!); for (const c of COLS) m.buildup[c] *= k; return m; };
const material = (id: string, k: number) => { const m = clone(LIB.materials.find(x => x.id === id)!); m.pricePerKg *= k; return m; };
const service = (id: string, k: number, country?: string) => ({ ...clone(SERVICE_RATES.find(x => x.id === id)!), value: SERVICE_RATES.find(x => x.id === id)!.value * k, ...(country ? { country } : {}) });

/** Every UK base row a company could plausibly move, ×1.1 — machines, materials, labour, energy-uk, every service, overhead. */
const UK_EVERYTHING = company({
  machines: LIB.machines.filter(m => m.region === 'UK').map(m => machine(m.id, 1.1)),
  materials: LIB.materials.map(m => material(m.id, 1.1)),
  labour: LIB.labour.filter(l => /^lab-uk-/.test(l.id)).map(l => ({ ...clone(l), fullyLoadedRatePerHr: l.fullyLoadedRatePerHr * 1.1 })),
  energy: [{ ...clone(LIB.energy.find(e => e.id === 'energy-uk')!), electricityPerKwh: 0.2002, gasPerKwh: 0.0506 }],
  services: SERVICE_RATES.map(s => service(s.id, 1.1)),
  overheadDefaults: [{ ...BUILT_IN_SHOP_ROW, overheadPct: 0.15, marginPct: 0.1 }],
});

async function cost(p: typeof BASELINE[number], region: ManufacturingRegion, book: RateLibrary, volume = 50_000) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await costMeasuredPart(p.geometry, p.part, { partNumber: p.part, file: p.part, annualVolume: volume, ...(p.commodity ? { commodity: p.commodity } : {}) } as never,
    p.answers, region, { annualVolume: volume, programmeYears: 5 } as never, recomputeMachineRates(book), { partNumber: p.part, file: p.part, status: 'error' } as never);
  // the exact stack total (the record's `total` is rounded for display)
  return { ...r, total: r.trace?.result?.total ?? r.total } as { status: string; total: number; trace?: { stackInput: UniversalStackInput; result: { total: number; breakdown: Record<string, number> } } };
}

/** The 8-bucket stack re-added from its input and a book — written from the formulas, never calling the engine. */
function readd(si: UniversalStackInput, book: RateLibrary): number {
  const rm = si.rawMaterial;
  const rate = (b: { annualDepreciation: number; maintenance: number; energy: number; floorSpace: number; indirectSupport: number; financeCost: number; annualAvailableHours: number; machineUtilization: number }, ef: number) =>
    (b.annualDepreciation + b.maintenance + b.energy * ef + b.floorSpace + b.indirectSupport + b.financeCost) / (b.annualAvailableHours * b.machineUtilization);
  const tariff = book.energy.find(e => e.id === `energy-${(book.regional?.code ?? 'UK').toLowerCase()}`)!;
  const ef = book.regional ? 1 : tariff.electricityPerKwh / 0.182;
  let mat = 0;
  if (rm.directCost !== undefined) mat = rm.directCost;
  else {
    const m = book.materials.find(x => x.id === rm.materialId)!;
    const gross = rm.netWeightKg / rm.materialUtilization;
    mat = gross * m.pricePerKg - (rm.lossIsNotScrap ? 0 : (gross - rm.netWeightKg) * (rm.scrapRecoveryPricePerKgOverride ?? m.scrapRecoveryPricePerKg));
  }
  mat += rm.consumablesCostPerPart ?? 0;
  if (rm.energyKwh) mat += (rm.energyKwh.gas ?? 0) * tariff.gasPerKwh + (rm.energyKwh.electricity ?? 0) * tariff.electricityPerKwh;
  const bi = Math.max(0, rm.boughtIn?.cost ?? 0);
  mat += bi;
  let proc = 0, lab = 0;
  for (const op of si.operations) {
    const m = book.machines.find(x => x.id === op.machineId)!, l = book.labour.find(x => x.id === op.labourId)!;
    proc += rate(m.buildup, ef) * op.cycleTimeHr / op.partsPerCycle / op.oee;
    lab += l.fullyLoadedRatePerHr * op.manning * op.labourTimeHr / op.partsPerCycle / op.labourEfficiency;
  }
  const tool = si.tooling.mode === 'amortized' ? si.tooling.totalToolingCost / si.tooling.amortizationVolume : 0;
  const base = mat + proc + lab + tool;
  const overhead = si.overheadPct * (base - bi) + bi * Math.max(0, rm.boughtIn?.handlingPct ?? 0);
  const subtotal = base + si.packagingPerPart + si.logisticsPerPart + overhead;
  return subtotal + si.marginPct * (subtotal - bi);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('1 · a country book is rebuilt from the BUILT-IN UK basis', () => {
  const strip = (x: RateLibrary) => fingerprintRateLibrary({ ...x, lastModified: '', overheadDefaults: [], services: [] });
  it('every UK base row changed ×1.1 leaves every other country\'s book identical (all 38)', () => {
    expect(UK_EVERYTHING.ukBuiltInBasis!.machines.length).toBeGreaterThan(150);
    for (const cc of (Object.keys(REGIONAL_DATA) as ManufacturingRegion[]).filter(c => c !== 'UK')) {
      expect(strip(buildRegionalLibrary(recomputeMachineRates(UK_EVERYTHING), cc)), cc).toBe(strip(buildRegionalLibrary(recomputeMachineRates(LIB), cc)));
    }
  });
  it('the leaks the perturbation harness found are closed (held / at-par capital, book size, imm-400t, gravity die, at-par materials, scrap ratio)', () => {
    const ids = ['mach-hmc-400', 'sand-auto-vertical-line', 'forge-press-1600t', 'press-400t', 'al-ext-press-2500t', 'mach-haas-vf2', 'imm-200t', 'imm-400t', 'grav-die-cast-std'];
    const co = company({ machines: ids.map(id => machine(id, 1.1)),
      materials: ['mat-al6082-bar', 'mat-pc-abs', 'mat-epdm', 'mat-cfrp-prepreg-t700', 'mat-steel-20mncr5', 'mat-steel-38mnvs6'].map(id => material(id, 1.1)) });
    const cn0 = buildRegionalLibrary(recomputeMachineRates(LIB), 'CN'), cn1 = buildRegionalLibrary(recomputeMachineRates(co), 'CN');
    for (const id of ids) expect(cn1.machines.find(m => m.id === id)!.computedRatePerHr, id).toBe(cn0.machines.find(m => m.id === id)!.computedRatePerHr);
    for (const id of ['mat-al6082-bar', 'mat-pc-abs', 'mat-epdm', 'mat-cfrp-prepreg-t700', 'mat-steel-20mncr5', 'mat-steel-38mnvs6']) {
      const a = cn0.materials.find(m => m.id === id)!, b = cn1.materials.find(m => m.id === id)!;
      expect([b.pricePerKg, b.scrapRecoveryPricePerKg], id).toEqual([a.pricePerKg, a.scrapRecoveryPricePerKg]);
    }
    // and the UK book itself does move
    expect(recomputeMachineRates(co).machines.find(m => m.id === 'mach-hmc-400')!.computedRatePerHr)
      .toBeCloseTo(recomputeMachineRates(LIB).machines.find(m => m.id === 'mach-hmc-400')!.computedRatePerHr * 1.1, 9);
  });
  it('an alias and a cell override are UK rows too; a company-added UK id does not exist in another country', () => {
    const co = resolveActiveLibrary({ builtIn: LIB, source: 'company',
      company: { materials: [], machines: [{ ...clone(LIB.machines.find(m => m.id === 'mach-hmc-400')!), id: 'PLANT-HMC-07' }], labour: [], energy: [], fx: [], overheadDefaults: [],
        aliases: [{ kind: 'machine', slot: 'mach-haas-vf2', useId: 'PLANT-HMC-07' }], version: 'c', lastModified: '' } as RateLibrary,
      overrides: [{ table: 'machines', id: 'mach-hmc-400', field: 'buildup.annualDepreciation', value: 40_000 }] }).library;
    expect(co.ukBuiltInBasis!.added).toEqual(['machines:PLANT-HMC-07']);
    const basis = builtInUkBasis(co);
    expect(basis.machines.find(m => m.id === 'mach-haas-vf2')).toBe(LIB.machines.find(m => m.id === 'mach-haas-vf2'));
    expect(basis.machines.find(m => m.id === 'mach-hmc-400')!.buildup.annualDepreciation).toBe(LIB.machines.find(m => m.id === 'mach-hmc-400')!.buildup.annualDepreciation);
    const cn = buildRegionalLibrary(recomputeMachineRates(co), 'CN');
    expect(cn.machines.some(m => m.id === 'PLANT-HMC-07')).toBe(false);
    expect(fingerprintRateLibrary({ ...cn, lastModified: '' })).toBe(fingerprintRateLibrary({ ...buildRegionalLibrary(recomputeMachineRates(LIB), 'CN'), lastModified: '' }));
  });
});

describe('2 · per-country rows: an id + country pair overrides that country only', () => {
  const B = recomputeMachineRates(LIB);
  const cnBook = buildRegionalLibrary(B, 'CN');
  const cnHmc = cnBook.machines.find(m => m.id === 'mach-hmc-400')!;
  const own = { ...clone(cnHmc), buildup: { ...cnHmc.buildup, annualDepreciation: cnHmc.buildup.annualDepreciation + 5_000 }, sourceNote: 'Company audit, CN plant 2' };
  const co = company({ countryRows: { CN: { machines: [own], materials: [{ ...clone(cnBook.materials.find(m => m.id === 'mat-steel-20mncr5')!), pricePerKg: 0.5 }] } } });
  it('a CN machine row replaces the CN book row, its £/h from its build-up; UK and India do not move', () => {
    const cn = buildRegionalLibrary(recomputeMachineRates(co), 'CN');
    const m = cn.machines.find(x => x.id === 'mach-hmc-400')!;
    const b = own.buildup;
    expect(m.computedRatePerHr).toBeCloseTo((b.annualDepreciation + b.maintenance + b.energy + b.floorSpace + b.indirectSupport + b.financeCost) / (b.annualAvailableHours * b.machineUtilization), 9);
    expect(m.computedRatePerHr - cnHmc.computedRatePerHr).toBeCloseTo(5_000 / (b.annualAvailableHours * b.machineUtilization), 9);
    expect(m.sourceNote).toBe('Company audit, CN plant 2');
    expect(cn.materials.find(x => x.id === 'mat-steel-20mncr5')!.pricePerKg).toBe(0.5);
    expect(recomputeMachineRates(co).machines.find(x => x.id === 'mach-hmc-400')!.computedRatePerHr).toBe(B.machines.find(x => x.id === 'mach-hmc-400')!.computedRatePerHr);
    const strip = (x: RateLibrary) => fingerprintRateLibrary({ ...x, lastModified: '', overheadDefaults: [], services: [] });
    expect(strip(buildRegionalLibrary(recomputeMachineRates(co), 'IN'))).toBe(strip(buildRegionalLibrary(B, 'IN')));
  });
  it('labour and energy name their country in the id: lab-cn-* / energy-cn are China\'s only', () => {
    const c2 = company({ labour: [{ ...clone(LIB.labour.find(l => l.id === 'lab-cn-skilled')!), fullyLoadedRatePerHr: 9.99 }],
      energy: [{ ...clone(LIB.energy.find(e => e.id === 'energy-cn')!), electricityPerKwh: 0.0555 }] });
    expect(buildRegionalLibrary(recomputeMachineRates(c2), 'CN').labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr).toBe(9.99);
    expect(buildRegionalLibrary(recomputeMachineRates(c2), 'CN').energy[0].electricityPerKwh).toBe(0.0555);
    expect(recomputeMachineRates(c2).labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr).toBe(LIB.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr);
    expect(buildRegionalLibrary(recomputeMachineRates(c2), 'IN').labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr)
      .toBe(buildRegionalLibrary(B, 'IN').labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr);
  });
  it('companyDelta keeps a country row only when it differs from that country\'s built-in book', () => {
    const same = { ...clone(cnHmc) };
    const d = companyDelta(LIB, { ...clone(LIB), countryRows: { CN: { machines: [same, own] } } }, cc => buildRegionalLibrary(B, cc as ManufacturingRegion));
    expect(d.countryRows!.CN.machines!.map(m => m.buildup.annualDepreciation)).toEqual([own.buildup.annualDepreciation]);
  });
});

describe('3 · the Overhead sheet sets overhead and margin per commodity and country', () => {
  it('the built-in reproduces today\'s 12 % / 8 % in every country and commodity (no drift)', () => {
    expect(BUILT_IN_SHOP_ROW).toMatchObject({ id: 'oh-default', commodityType: '*', overheadPct: 0.12, marginPct: 0.08 });
    for (const cc of ['UK', 'CN', 'IN', 'DE', 'HU', 'US'] as ManufacturingRegion[]) {
      for (const c of ['casting', 'machining', 'injection_moulding', undefined]) {
        const s = regionalShopDefaults(cc, {}, 'DAP', { commodity: c, library: LIB });
        expect([s.overheadPct, s.marginPct, s.shopSource], `${cc} ${c}`).toEqual([0.12, 0.08, 'built-in']);
      }
    }
  });
  it('precedence: country + commodity row > country * row > built-in; a UK row never reaches China', () => {
    const co = company({ overheadDefaults: [
      { ...BUILT_IN_SHOP_ROW, overheadPct: 0.15, marginPct: 0.1 },
      { id: 'oh-casting', commodityType: 'casting', overheadPct: 0.11, marginPct: 0.09, sourceNote: 'co' },
      { id: 'oh-default', country: 'CN', commodityType: '*', overheadPct: 0.07, marginPct: 0.05, sourceNote: 'co' },
      { id: 'oh-cn-forging', country: 'CN', commodityType: 'forging', overheadPct: 0.06, marginPct: 0.04, sourceNote: 'co' },
    ] });
    const at = (cc: ManufacturingRegion, c: string) => { const s = shopRowFor(co, cc, c); return [s.overheadPct, s.marginPct]; };
    expect(at('UK', 'machining')).toEqual([0.15, 0.1]);
    expect(at('UK', 'casting')).toEqual([0.11, 0.09]);
    expect(at('CN', 'casting')).toEqual([0.07, 0.05]);
    expect(at('CN', 'forging')).toEqual([0.06, 0.04]);
    expect(at('IN', 'casting')).toEqual([0.12, 0.08]);
    // the CN book keeps every row and finds CN's by country
    expect(shopRowFor(buildRegionalLibrary(recomputeMachineRates(co), 'CN'), 'CN', 'forging').overheadPct).toBe(0.06);
  });
  it('headless: the stack carries the row and the total re-adds by hand (UK and CN rows, other countries unmoved)', async () => {
    const p = BASELINE.find(x => x.part === 'Casting_Braket.stp')!;
    const co = company({ overheadDefaults: [
      { id: 'oh-uk-cm', commodityType: 'cast_and_machine', overheadPct: 0.17, marginPct: 0.11, sourceNote: 'co' },
      { id: 'oh-default', country: 'CN', commodityType: '*', overheadPct: 0.09, marginPct: 0.06, sourceNote: 'co' },
    ] });
    for (const [cc, oh, mg] of [['UK', 0.17, 0.11], ['CN', 0.09, 0.06], ['IN', 0.12, 0.08]] as const) {
      const a = await cost(p, cc, LIB), b = await cost(p, cc, co);
      expect(b.status).toBe('costed');
      const si = b.trace!.stackInput;
      expect([si.overheadPct, si.marginPct], cc).toEqual([oh, mg]);
      // only overhead and margin moved: the rest of the stack input is the built-in costing's
      expect({ ...si, overheadPct: 0, marginPct: 0 }).toEqual({ ...a.trace!.stackInput, overheadPct: 0, marginPct: 0 });
      const book = cc === 'UK' ? recomputeMachineRates(co) : buildRegionalLibrary(recomputeMachineRates(co), cc);
      expect(b.total, cc).toBeCloseTo(readd(si, book), 6);
      const bd = a.trace!.result.breakdown;
      const base = bd.rawMaterial + bd.process + bd.labour + bd.tooling;   // no bought-in on this part
      const sub = base + bd.packaging + bd.logistics + oh * base;
      expect(b.total, `${cc} by hand`).toBeCloseTo(sub * (1 + mg), 6);
      if (cc === 'IN') expect(b.total).toBe(a.total);
    }
  }, 120_000);
});

describe('4 · Services & toolroom: the book\'s rows, read through the active book', () => {
  it('every row is read by the code (no dead row) and the built-in values are the old literals', () => {
    const src = (dir: string): string => readdirSync(dir, { withFileTypes: true })
      .map(d => d.isDirectory() ? src(join(dir, d.name)) : d.name.endsWith('.ts') && d.name !== 'service-rates-data.ts' ? readFileSync(join(dir, d.name), 'utf8') : '').join('\n');
    const code = src('src/engine');
    for (const r of SERVICE_RATES) expect(code.includes(`'${r.id}'`), r.id).toBe(true);
    const v = (id: string) => SERVICE_RATES.find(r => r.id === id)!.value;
    expect([v('toolroom.cnc'), v('fixture.dedicated'), v('tool-wear.steel'), v('ndt.mpi-bench'), v('hip.superalloy'), v('foundry.new-sand')])
      .toEqual([52.37, 2500, 0.12, 4, 9.0, 88 / 1.1965]);
    expect(v('heat-treat.al-furnace-set')).toBe(37_470);
  });
  it('a UK row moves the UK; China takes the BUILT-IN figure × its factor; a CN row is China\'s figure exactly', () => {
    for (const r of SERVICE_RATES) {
      const uk = company({ services: [service(r.id, 1.1)] });
      expect(withRates(recomputeMachineRates(uk), () => serviceUk(r.id)), r.id).toBeCloseTo(r.value * 1.1, 12);
      expect(withRates(buildRegionalLibrary(recomputeMachineRates(uk), 'CN'), () => serviceUk(r.id)), r.id).toBe(r.value);
      const V = r.value * 0.37;
      const cnBook = buildRegionalLibrary(recomputeMachineRates(company({ services: [{ ...service(r.id, 1), value: V, country: 'CN' }] })), 'CN');
      const f = countryFactor(parseServiceBasis(r.basis), 'CN');
      withRates(cnBook, () => expect(serviceUk(r.id) * f, r.id).toBeCloseTo(V, 12));
      // and India does not see China's row
      expect(withRates(buildRegionalLibrary(recomputeMachineRates(company({ services: [{ ...service(r.id, 1), value: V, country: 'CN' }] })), 'IN'), () => serviceUk(r.id))).toBe(r.value);
    }
  }, 300_000);
  it('the sites price with them: Δ = Δ£ × usage (toolroom h, fixtures, tool wear, NDT bench, heat treat, HIP, impregnation)', () => {
    const uk = recomputeMachineRates(company({ services: ['toolroom.cnc', 'fixture.dedicated', 'fixture.soft-jaws', 'tool-wear.steel', 'ndt.mpi-bench',
      'heat-treat.forging-quench-temper', 'hip.ductile-iron', 'casting.impregnation', 'tool-steel.h13', 'forging.coining'].map(id => service(id, 1.1)) }));
    const B = recomputeMachineRates(LIB);
    const d = (id: string) => SERVICE_RATES.find(r => r.id === id)!.value * 0.1;
    const both = <T>(fn: () => T): [T, T] => [withRates(B, fn), withRates(uk, fn)];
    const [t0, t1] = both(() => TOOLROOM_RATES.cnc);
    expect(t1).toBe(Math.round(52.37 * 1.1 * 100) / 100); expect(t0).toBe(52.37);
    const [f0, f1] = both(() => fixtureCostGBP(3, 2, 200_000).gbp);
    expect(f1 - f0).toBe(Math.round(3 * 2500 * 1.1 + 2 * 300 * 1.1) - Math.round(3 * 2500 + 2 * 300));
    const [w0, w1] = both(() => toolWearPerPart(12.5, 'steel'));
    expect(w1 - w0).toBeCloseTo(12.5 * d('tool-wear.steel'), 4);
    const [n0, n1] = both(() => ndtStationCostPerPart('mpi').gbp);
    expect(n1 - n0).toBeCloseTo(75 / 3600 * d('ndt.mpi-bench'), 4);
    const fg = { partWeightKg: 3.2, heatTreat: 'quench-temper', coining: true } as never;
    const [g0, g1] = both(() => estimateForgingSecondaryAdders(fg).totalPerPartGbp);
    expect(g1 - g0).toBeCloseTo(3.2 * d('heat-treat.forging-quench-temper') + d('forging.coining'), 4);
    const cs = { partWeightKg: 2, alloyFamily: 'ductile-iron', hip: true, impregnation: true } as never;
    const [c0, c1] = both(() => estimateCastingSecondaryAdders(cs).totalPerPartGbp);
    expect(c1 - c0).toBeCloseTo(2 * d('hip.ductile-iron') + d('casting.impregnation'), 4);
    expect(both(() => TOOL_MATERIAL_GBP_PER_KG.h13)).toEqual([9.5, 9.5 * 1.1]);
  });
  it('every service ×1.1 in the UK moves UK parts and no part in China or India', async () => {
    const co = company({ services: SERVICE_RATES.map(s => service(s.id, 1.1)) });
    let movedUk = 0;
    for (const p of BASELINE) {
      const [a, b] = [await cost(p, 'UK', LIB), await cost(p, 'UK', co)];
      if (a.status === 'costed' && Math.abs(b.total - a.total) > 1e-9) movedUk++;
      for (const cc of ['CN', 'IN'] as ManufacturingRegion[]) {
        const [x, y] = [await cost(p, cc, LIB), await cost(p, cc, co)];
        expect(y.total, `${p.part} ${cc}`).toBe(x.total);
      }
    }
    expect(movedUk).toBeGreaterThan(15);
  }, 600_000);
});

describe('5 · a UK company book moves 0 parts in other countries; a CN row moves only China', () => {
  it('every UK base row ×1.1: every real part costs the same in CN, IN, DE, HU, US', async () => {
    for (const p of BASELINE) {
      for (const cc of ['CN', 'IN', 'DE', 'HU', 'US'] as ManufacturingRegion[]) {
        const [a, b] = [await cost(p, cc, LIB), await cost(p, cc, UK_EVERYTHING)];
        expect(b.status, `${p.part} ${cc}`).toBe(a.status);
        if (a.status === 'costed') expect(b.total, `${p.part} ${cc}`).toBe(a.total);
      }
    }
  }, 900_000);
  it('a CN machine row moves the China costing by Δ£/h × its hours (re-added), and nothing in the UK or India', async () => {
    const p = BASELINE.find(x => x.part === 'Casting_Braket.stp')!;
    const B = recomputeMachineRates(LIB);
    const cnBook = buildRegionalLibrary(B, 'CN');
    const id = 'fettle-robot-cell';
    const m0 = cnBook.machines.find(m => m.id === id)!;
    const own = { ...clone(m0), buildup: { ...m0.buildup, annualDepreciation: m0.buildup.annualDepreciation + 3_000 } };
    const co = company({ countryRows: { CN: { machines: [own] } } });
    const a = await cost(p, 'CN', LIB), b = await cost(p, 'CN', co);
    const hrs = a.trace!.stackInput.operations.filter(o => o.machineId === id).reduce((t, o) => t + o.cycleTimeHr / o.partsPerCycle / o.oee, 0);
    expect(hrs).toBeGreaterThan(0);
    const dRate = 3_000 / (m0.buildup.annualAvailableHours * m0.buildup.machineUtilization);
    const si = a.trace!.stackInput;
    expect(b.total - a.total).toBeCloseTo(dRate * hrs * (1 + si.overheadPct) * (1 + si.marginPct), 6);
    expect(b.total).toBeCloseTo(readd(b.trace!.stackInput, buildRegionalLibrary(recomputeMachineRates(co), 'CN')), 6);
    for (const cc of ['UK', 'IN'] as ManufacturingRegion[]) expect((await cost(p, cc, co)).total, cc).toBe((await cost(p, cc, LIB)).total);
  }, 120_000);
});

/** Append a row to a sheet by its header names (a key the header lacks becomes a new column). */
function addRow(ws: XLSX.WorkSheet, row: Record<string, unknown>): void {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const head = aoa[0] as string[];
  for (const k of Object.keys(row)) if (!head.includes(k)) { head.push(k); }
  XLSX.utils.sheet_add_aoa(ws, [head], { origin: 'A1' });
  XLSX.utils.sheet_add_aoa(ws, [head.map(h => (h in row ? row[h] : ''))], { origin: -1 });
}

describe('6 · the workbook: country columns, Services and Overhead sheets, no FX', () => {
  const tpl = buildRateLibraryWorkbook(LIB, { template: true });
  const wb0 = XLSX.read(tpl, { type: 'buffer' });
  it('the template has Services & toolroom and Overhead with a country column, and no FX sheet', () => {
    expect(wb0.SheetNames).toEqual(['Instructions', 'Materials', 'Machines', 'Labour', 'Energy', 'Overhead', 'Services & toolroom', 'Aliases']);
    expect((XLSX.utils.sheet_to_json(wb0.Sheets.Machines, { header: 1 })[0] as string[])).toContain('country');
    expect((XLSX.utils.sheet_to_json(wb0.Sheets.Materials, { header: 1 })[0] as string[])).toContain('country');
    expect(XLSX.utils.sheet_to_json(wb0.Sheets['Services & toolroom']).length).toBe(SERVICE_RATES.length);
    const ins = JSON.stringify(XLSX.utils.sheet_to_json(wb0.Sheets.Instructions, { header: 1 }));
    expect(ins).toMatch(/A row applies to its country ONLY/);
    expect(ins).toMatch(/lab-cn-skilled and energy-cn are China/);
    expect(ins).toMatch(/no FX sheet/);
  });
  it('an untouched template stores nothing and costs as the built-in (identity, UK and CN)', async () => {
    const r = bookFromWorkbook(tpl);
    expect(r.errors).toEqual([]);
    expect(r.report!.changed).toEqual([]);
    expect(fingerprintRateLibrary(r.library!)).toBe(fingerprintRateLibrary(resolveActiveLibrary({ builtIn: LIB, source: 'builtin' }).library));
    const p = BASELINE.find(x => x.part === 'steering_knuckle_RH.stp')!;
    for (const cc of ['UK', 'CN'] as ManufacturingRegion[]) expect((await cost(p, cc, r.library!)).total).toBe((await cost(p, cc, LIB)).total);
  }, 60_000);
  it('an old workbook\'s FX sheet is ignored with a warning, not refused', () => {
    const wb = XLSX.read(tpl, { type: 'buffer' });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['id', 'fromCurrency', 'toCurrency', 'rate'], ['fx-gbp-usd', 'GBP', 'USD', 9.99]]), 'FX');
    const r = parseRateLibraryWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some(w => /^FX: sheet ignored/.test(w))).toBe(true);
    expect(r.delta!.fx).toEqual([]);
    expect(bookFromWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer).library!.fx).toEqual(LIB.fx);
  });
  it('country rows round-trip; a country that is not one, a duplicate id + country, an unknown service id are refused', () => {
    const wb = XLSX.read(tpl, { type: 'buffer' });
    const add = (sheet: string, row: Record<string, unknown>) => addRow(wb.Sheets[sheet], row);
    const cnRow = buildRegionalLibrary(recomputeMachineRates(LIB), 'CN').machines.find(m => m.id === 'mach-hmc-400')!;
    const machRow = (country: string, dep: number) => ({ id: 'mach-hmc-400', country, machineClass: cnRow.machineClass, region: 'China', annualDepreciation: dep,
      maintenance: cnRow.buildup.maintenance, energy: cnRow.buildup.energy, floorSpace: cnRow.buildup.floorSpace, indirectSupport: cnRow.buildup.indirectSupport,
      financeCost: cnRow.buildup.financeCost, annualAvailableHours: cnRow.buildup.annualAvailableHours, machineUtilization: cnRow.buildup.machineUtilization, currency: 'GBP' });
    add('Machines', machRow('CN', cnRow.buildup.annualDepreciation + 1000));
    add('Overhead', { id: 'oh-default', country: 'CN', commodityType: '*', overheadPct: 0.09, marginPct: 0.06 });
    add('Services & toolroom', { id: 'toolroom.cnc', country: 'CN', value: 20, currency: 'GBP' });
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    const r = parseRateLibraryWorkbook(buf);
    expect(r.errors).toEqual([]);
    expect(r.delta!.countryRows!.CN.machines![0].buildup.annualDepreciation).toBe(cnRow.buildup.annualDepreciation + 1000);
    expect(r.report!.changed.find(x => x.country === 'CN' && x.id === 'mach-hmc-400')!.fields).toEqual(['buildup.annualDepreciation']);
    const book = bookFromWorkbook(buf).library!;
    const back = parseRateLibraryWorkbook(buildRateLibraryWorkbook(book));
    expect(back.errors).toEqual([]);
    expect(back.delta!.countryRows).toEqual(r.delta!.countryRows);
    expect(back.delta!.services).toEqual(r.delta!.services);
    // refused
    const bad = (sheet: string, row: Record<string, unknown>) => { const w = XLSX.read(tpl, { type: 'buffer' }); addRow(w.Sheets[sheet], row); return parseRateLibraryWorkbook(XLSX.write(w, { bookType: 'xlsx', type: 'buffer' }) as Buffer).errors; };
    expect(bad('Machines', machRow('Atlantis', 1))[0]).toMatch(/column country: 'Atlantis' is not a country/);
    expect(bad('Services & toolroom', { id: 'toolroom.nope', value: 1, currency: 'GBP' })[0]).toMatch(/unknown id 'toolroom.nope'/);
    expect(bad('Services & toolroom', { id: 'toolroom.cnc', value: 5237, currency: 'GBP' }).join(' ')).toMatch(/duplicate id 'toolroom.cnc'/);
    expect(bad('Overhead', { id: 'oh-x', country: 'CN', commodityType: 'casting', overheadPct: 12, marginPct: 0.08 })[0]).toMatch(/overheadPct: 12 looks like a percentage/);
    expect(bad('Labour', { id: 'lab-cn-skilled', country: 'IN', skillLevel: 'x', fullyLoadedRatePerHr: 3, currency: 'GBP' }).join(' ')).toMatch(/the id names the country/);
  });
});
