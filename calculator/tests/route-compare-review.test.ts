/**
 * Compare routes review (Oct 2026, docs/cad/compare-routes-review-2026-10.md): only feasible routes, in the part's own
 * material family, to the finished scope; every row's arithmetic checkable; break-even from real re-costs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compareRoutes, candidateRoutes, screenCandidates, crossovers, samePolymerGrade, VOLUME_LADDER, type RouteRow } from '../server/services/route-compare.js';
import { screenRoutes, materialFamilyOf, familyOfCategory, ROUTE_FAMILIES, COMPARABLE_ROUTES, largestForgePressTonnes } from '../src/engine/route-feasibility.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { specForCommodity } from '../src/engine/cost-input-rules/index.js';
import { routeCompareHtml, routeComparisonExport } from '../src/ui/cad-workspace.js';

const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string; total?: number };
}>;
const part = (name: string) => parts.find(p => p.part === name)!;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const input = (name: string, extra: Partial<Parameters<typeof compareRoutes>[0]> = {}) => {
  const p = part(name);
  return { geo: p.geometry as never, filename: p.part, current: p.outcome.commodity ?? 'machining', answers: p.answers, region: 'UK' as const,
    annualVolume: 100_000, programmeYears: 5, baseBook: book, ...extra };
};

describe('1. The material family is read off whichever material answer the route took', () => {
  it('alloy, resin, compound, laminate and grade all resolve', () => {
    expect(materialFamilyOf({ 'material.alAlloy': '6063' }, book).family).toBe('aluminium');
    expect(materialFamilyOf({ 'material.resin': 'mat-pa66gf30' }, book).family).toBe('plastic');
    expect(materialFamilyOf({ 'material.elastomer': 'mat-epdm' }, book).family).toBe('rubber');
    expect(materialFamilyOf({ 'material.laminate': 'prepreg-cf' }, book).family).toBe('composite');
    expect(materialFamilyOf({ 'material.grade': 'mat-al2014-forge' }, book).family).toBe('aluminium');
    expect(materialFamilyOf({ 'material.family': 'cast iron' }, book).family).toBe('cast iron');
    expect(materialFamilyOf({}, book).family).toBeNull();
    expect(familyOfCategory('Ductile Cast Iron')).toBe('cast iron');
    expect(familyOfCategory('Aluminium Extrusion Billet')).toBe('aluminium');
    expect(familyOfCategory('Thermoforming Sheet')).toBe('plastic');
  });
  it('every route with rules has a family list; every comparable route has rules', () => {
    for (const r of COMPARABLE_ROUTES) {
      expect(specForCommodity(r), r).not.toBeNull();
      expect(ROUTE_FAMILIES[r], r).toBeDefined();
    }
  });
});

describe('2. The screen on every real part: same family, the shape, the equipment, the finished scope', () => {
  it('never offers a route in another material family (the aluminium rail was offered polymer extrusion and rubber)', () => {
    for (const p of parts) {
      const current = p.outcome.commodity ?? 'machining';
      const fam = materialFamilyOf(p.answers, book).family;
      const screens = screenRoutes(current, { geo: p.geometry as never, filename: p.part, family: fam, annualVolume: 100_000 });
      for (const s of screens) {
        if (s.route === current || !s.feasible || !fam) continue;
        expect(ROUTE_FAMILIES[s.route], `${p.part}: ${s.route}`).toContain(fam);
      }
      // The costing's own route is always kept.
      expect(screens[0].route).toBe(current);
      expect(screens[0].feasible).toBe(true);
    }
  });
  it('every refusal names the check, what was measured, the limit and a source', () => {
    for (const p of parts) {
      const screens = screenCandidates(input(p.part));
      for (const s of screens) for (const c of s.checks) {
        expect(c.label.length, `${p.part} ${s.route} ${c.id}`).toBeGreaterThan(0);
        expect(c.measured.length).toBeGreaterThan(0);
        expect(c.limit.length).toBeGreaterThan(0);
        expect(c.source.length).toBeGreaterThan(20);
        if (!s.feasible) expect(s.checks.some(x => !x.pass)).toBe(true);
      }
    }
  });
  it('the knuckle: forging, cast + machine and machining; as-cast refused (12 machined bores); sheet metal refused on gauge', () => {
    const routes = candidateRoutes(input('steering_knuckle_RH.stp'));
    expect(routes).toEqual(['forging', 'cast_and_machine', 'machining']);
    const s = screenCandidates(input('steering_knuckle_RH.stp'));
    expect(s.find(x => x.route === 'casting')!.checks.find(c => c.id === 'as_cast_scope')!.pass).toBe(false);
    expect(s.find(x => x.route === 'sheet_metal')!.checks.find(c => c.id === 'gauge')!.measured).toMatch(/9\.02 mm/);
  });
  it('the 1.8 m aluminium rail: no forging (constant section; 10,776 t against the 8,000 t press), no plastics, no rubber', () => {
    const s = screenCandidates(input('AL_Battery_Rail.stp'));
    const forge = s.find(x => x.route === 'forging')!;
    expect(forge.feasible).toBe(false);
    expect(forge.checks.find(c => c.id === 'forge_press')!.limit).toContain(largestForgePressTonnes().toLocaleString('en-GB'));
    expect(forge.checks.find(c => c.id === 'constant_section')!.pass).toBe(false);
    for (const r of ['extrusion', 'rubber', 'injection_moulding', 'blow_moulding', 'composites']) expect(s.find(x => x.route === r)!.feasible, r).toBe(false);
    // Machining from solid is refused as the costing chain would refuse it: a 2.5 mm shell at 16% fill, 1.8 m long.
    expect(s.find(x => x.route === 'machining')!.checks.find(c => c.id === 'thin_shell')!.pass).toBe(false);
    expect(candidateRoutes(input('AL_Battery_Rail.stp'))).toEqual(['aluminium_extrusion', 'sheet_metal', 'sheet_metal_fab']);
  });
  it('a closed tank is only a hollow route; a gear is only the gear route; a CFRP panel is only composites', () => {
    expect(candidateRoutes(input('ROTO_Coolant_Tank.stp'))).toEqual(['rotational_moulding', 'blow_moulding']);
    expect(candidateRoutes(input('test-gear-m3-z38.step'))).toEqual(['gear']);
    expect(candidateRoutes(input('COMP_Roof_Panel.stp'))).toEqual(['composites']);
    expect(candidateRoutes(input('RUB_Door_Seal.stp'))).toEqual(['rubber']);
  });
  it('a thermoforming cannot carry the ECU cover\'s bosses; a drawn can is pressed, not laser-cut and bent', () => {
    const s = screenCandidates(input('IM_ECU_Cover.stp'));
    expect(s.find(x => x.route === 'thermoforming')!.checks.find(c => c.id === 'tf_bosses')!.pass).toBe(false);
    const can = screenCandidates(input('AL_Battery_Can.stp'));
    expect(can.find(x => x.route === 'sheet_metal')!.feasible).toBe(true);
    expect(can.find(x => x.route === 'sheet_metal_fab')!.checks.find(c => c.id === 'drawn_form')!.pass).toBe(false);
  });
});

describe('3. The arithmetic on a row', () => {
  it('the knuckle: buckets add up on every costed row; the machining row buys 50.9 kg of plate for a 2.85 kg part; tooling investment ÷ amortisation = tooling a part', async () => {
    const cmp = await compareRoutes(input('steering_knuckle_RH.stp'), undefined);
    expect([...new Set(cmp.rows.map(r => r.route))]).toEqual(['forging', 'cast_and_machine', 'machining']);
    expect(cmp.rows[0].label).toBe('forging — closed-die forging');
    for (const r of cmp.rows) {
      expect(r.status, r.route).toBe('costed');
      expect(r.reconciles, r.route).toBe(true);
      const sum = Object.values(r.breakdown!).reduce((s, v) => s + v, 0);
      expect(Math.abs(sum - r.total!)).toBeLessThan(0.005);
      expect(Math.abs(r.tooling!.investment / r.tooling!.amortisedOver - r.toolingPerPart!), r.route).toBeLessThan(0.0005);
      expect(r.operations!.length).toBeGreaterThan(0);
      for (const op of r.operations!) expect(op.machine).not.toMatch(/^(mach|press|forge|hpdc|lab)-/);
    }
    const ref = cmp.rows[0];
    expect(ref.total).toBe(22.7563);   // pilot rule pack (30 Oct 2026): the knuckle's secondary machining on the twin-pallet cell (was 24.0215)
    expect(ref.tooling!.investment).toBe(440949.69);   // one hydraulic tombstone fixture (£12,000) in place of three dedicated ones
    expect(ref.tooling!.amortisedOver).toBe(500_000);
    expect(ref.material).toMatchObject({ netKg: 3.321, boughtKg: 4.918 });
    const mach = cmp.rows.find(r => r.route === 'machining')!;
    expect(mach.material!.netKg).toBe(2.852);
    expect(mach.material!.boughtKg).toBeCloseTo(50.929, 2);
    expect(mach.caveats.join(' ')).toMatch(/buy-to-fly/);
    // The ladder: every costed row at every volume, the costing's own volume on it.
    expect(cmp.ladder).toEqual([...VOLUME_LADDER]);
    for (const r of cmp.rows) {
      expect(r.byVolume.map(v => v.volume)).toEqual(cmp.ladder);
      expect(r.byVolume.find(v => v.volume === 100_000)!.total).toBe(r.total);
      // Tooling spread over more parts: the part never gets dearer as the volume rises on these routes.
      for (let k = 1; k < r.byVolume.length; k++) expect(r.byVolume[k].total!).toBeLessThanOrEqual(r.byVolume[k - 1].total! + 0.0001);
    }
    expect([...new Set(cmp.crossovers.map(c => c.route))]).toEqual(['forging', 'cast_and_machine', 'machining']);
    for (const c of cmp.crossovers) { expect(c.atVolume).toBeNull(); expect(c.text).toMatch(/dearer than the costed route at every volume/); }
  }, 60_000);
  it('a volume not on the ladder is added to it', async () => {
    const cmp = await compareRoutes(input('IM_Cable_Clip.stp', { annualVolume: 60_000 }));
    expect(cmp.ladder).toContain(60_000);
    expect(cmp.rows[0].byVolume.find(v => v.volume === 60_000)!.total).toBe(cmp.rows[0].total);
  }, 60_000);
  it('a crossover is interpolated between the two re-costs either side of the sign change, never beyond the ladder', () => {
    const pt = (volume: number, total: number) => ({ volume, total, p10: null, p90: null, note: null });
    const ref = { route: 'a', process: null, label: 'a', total: 10, byVolume: [5_000, 10_000, 25_000].map(v => pt(v, 10)) } as unknown as RouteRow;
    const alt = { route: 'b', process: null, label: 'b', total: 9, byVolume: [pt(5_000, 12), pt(10_000, 11), pt(25_000, 8)] } as unknown as RouteRow;
    const [x] = crossovers([ref, alt], ref, [5_000, 10_000, 25_000], 10_000);
    expect(x.atVolume).toBe(15_000);     // 10 + (25 − 10) × 1 / 3
    expect(x.cheaperAbove).toBe(true);
    expect(x.text).toMatch(/cheaper than the costed route above ~15,000 a year on the central estimate \(interpolated between re-costs at 10,000 and 25,000\)/);
    const never = { route: 'c', process: null, label: 'c', total: 20, byVolume: [5_000, 10_000, 25_000].map(v => pt(v, 20)) } as unknown as RouteRow;
    expect(crossovers([ref, never], ref, [5_000, 10_000, 25_000], 10_000)[0]).toMatchObject({ atVolume: null, text: expect.stringMatching(/dearer .* every volume from 5,000 to 25,000/) });
  });
});

describe('4. Like for like across plastics routes', () => {
  it('a thermoforming sheet compared as a moulding is costed in the moulding\'s grade of the same polymer, and says so', async () => {
    expect(samePolymerGrade('mat-abs-tf', 'injection_moulding', book)).toMatchObject({ polymer: 'ABS' });
    expect(samePolymerGrade('mat-abs-tf', 'forging', book)).toBeNull();
    const cmp = await compareRoutes(input('TF_Trim_Cover.stp'));
    const im = cmp.rows.find(r => r.route === 'injection_moulding')!;
    expect(im.status).toBe('costed');
    expect(im.notes.join(' ')).toMatch(/resin assumed: ABS — the same polymer \(ABS\)/);
    expect(im.material!.label).toBe('ABS');
    const x = cmp.crossovers.find(c => c.route === 'injection_moulding')!;
    expect(x.atVolume).toBeGreaterThan(VOLUME_LADDER[0]);
    expect(x.cheaperAbove).toBe(true);
  }, 60_000);
  it('an answered family travels to every route (the rail no longer asks machining "what is this part made of?")', async () => {
    const cmp = await compareRoutes(input('AL_Battery_Rail.stp'), undefined);
    for (const r of cmp.rows) {
      expect(r.status, r.route).toBe('costed');
      expect(r.openQuestions.join(' ')).not.toMatch(/made of/);
    }
    expect(cmp.rows.find(r => r.route === 'sheet_metal')!.material!.label).toMatch(/Sheet/);
  }, 60_000);
});

describe('5. The screen', () => {
  it('prints the principle, the build-up per row, the ladder, the crossover and the refused routes with sources; nothing unescaped', async () => {
    const cmp = await compareRoutes(input('TF_Trim_Cover.stp'));
    const x = routeComparisonExport(cmp, { current: 'thermoforming', headline: cmp.rows[0].total, labels: { thermoforming: 'Thermoforming', injection_moulding: 'Injection Moulding' } });
    const html = routeCompareHtml(x, { fmt: n => `£${n.toFixed(2)}` });
    expect(html).toContain('same material family');
    expect(html).toContain('How this row is built');
    expect(html).toContain('re-add closes');
    expect(html).toContain('all close');
    expect(html).toContain('Not feasible for this part');
    expect(html).toContain('cheaper than the costed route above');
    expect(html).toContain('5,000 / yr');
    expect(html).toContain('Tooling investment');
    expect(html).not.toMatch(/mat-[a-z0-9-]+</);   // no library id as a label
    expect(html).toContain('Boothroyd');
  }, 60_000);
});

describe('6. Second round — processes, the independent re-add, the specification, bands and payback', () => {
  it('a casting or forging route is split into its feasible processes, each refused by the advisor\'s own rules', async () => {
    const cmp = await compareRoutes(input('FORGE_Hub_Flange.stp'), undefined);
    const labels = cmp.rows.map(r => r.label);
    expect(labels[0]).toBe('forging — closed-die forging');            // the reference names the advisor's choice
    expect(cmp.rows[0].notes.join(' ')).toMatch(/closed-die forging is the process the advisor chose/);
    expect(labels).toContain('forging — precision forging');
    expect(labels).toContain('cast and machine — sand casting');
    expect(labels).toContain('cast and machine — investment casting');
    const ex = cmp.excluded.map(e => e.label);
    expect(ex).toContain('forging — cold forming');
    expect(ex).toContain('cast and machine — high-pressure die casting');
    expect(cmp.excluded.find(e => e.label === 'cast and machine — high-pressure die casting')!.reasons[0].measured).toMatch(/not die cast/);
    expect(cmp.excluded.find(e => e.label === 'forging — cold forming')!.reasons[0].measured).toMatch(/slug/);
    // A process the rules price with the same operations and tooling says so — the difference is yield, not process.
    const precision = cmp.rows.find(r => r.label === 'forging — precision forging')!;
    expect(precision.caveats.join(' ')).toMatch(/same operations and tooling/);
  }, 120_000);
  it('every costed row re-adds independently to the penny on three parts, and the re-add is not the engine', async () => {
    for (const name of ['steering_knuckle_RH.stp', 'PRCR002.stp', 'TF_Trim_Cover.stp']) {
      const cmp = await compareRoutes(input(name, { ladder: false, bands: false }), undefined);
      for (const r of cmp.rows.filter(r => r.status === 'costed')) {
        expect(r.audit, `${name} ${r.label}`).not.toBeNull();
        expect(r.audit!.closes, `${name} ${r.label}: ${r.audit!.lines.filter(l => !l.closes).map(l => `${l.line} ${l.recomputed} v ${l.reported}`).join('; ')}`).toBe(true);
        expect(r.audit!.lines.map(l => l.line)).toEqual(['Process (machines)', 'Labour', 'Material', 'Tooling', 'Packaging', 'Logistics', 'Overhead', 'Margin', 'Total']);
        for (const l of r.audit!.lines) expect(l.how.length).toBeGreaterThan(10);
      }
    }
  }, 120_000);
  it('the specification states each answer\'s source; an answer a route never reads is marked, an assumed one too', async () => {
    const cmp = await compareRoutes(input('steering_knuckle_RH.stp', { ladder: false, bands: false }), undefined);
    const ref = cmp.rows[0];
    expect(ref.spec.find(s => s.id === 'service.safetyCritical')).toMatchObject({ value: 'yes', source: 'answered' });
    const cam = cmp.rows.find(r => r.route === 'cast_and_machine' && r.process === 'sand')!;
    expect(cam.spec.find(s => s.id === 'service.pressureTight')).toMatchObject({ source: 'assumed' });
    expect(cam.spec.find(s => s.id === 'casting.processChoice')).toMatchObject({ value: 'sand casting', source: 'comparison' });
    const mach = cmp.rows.find(r => r.route === 'machining')!;
    expect(mach.spec.find(s => s.id === 'service.safetyCritical')).toMatchObject({ source: 'not asked' });
  }, 120_000);
  it('each row carries its Monte-Carlo band, the ladder its band at every point, and the crossover says where bands overlap and what the tooling payback is', async () => {
    const cmp = await compareRoutes(input('TF_Trim_Cover.stp'), undefined);
    for (const r of cmp.rows.filter(r => r.status === 'costed')) {
      expect(r.band).not.toBeNull();
      expect(r.band!.p10).toBeLessThan(r.total!);
      expect(r.band!.p90).toBeGreaterThan(r.total!);
      for (const p of r.byVolume) { expect(p.p10).not.toBeNull(); expect(p.p90!).toBeGreaterThan(p.p10!); }
    }
    const x = cmp.crossovers.find(c => c.route === 'injection_moulding')!;
    expect(x.indistinguishable).not.toBeNull();
    expect(x.text).toMatch(/bands overlap/);
    expect(x.payback).not.toBeNull();
    expect(x.payback!.extraTooling).toBeGreaterThan(0);
    expect(x.payback!.parts).toBe(Math.round(x.payback!.extraTooling / x.payback!.pieceSaving));
    expect(x.text).toMatch(/paid back/);
    // Programme spend = piece (ex tooling) × parts + tooling investment.
    const im = cmp.rows.find(r => r.route === 'injection_moulding')!;
    expect(im.programme!.total).toBeCloseTo(im.programme!.pieceExTooling * im.programme!.parts + im.tooling!.investment, 1);
    expect(im.programme!.parts).toBe(500_000);
  }, 120_000);
  it('the screen prints the process rows, the re-add verdict, the spec sources, the band and the programme spend', async () => {
    const cmp = await compareRoutes(input('FORGE_Hub_Flange.stp'), undefined);
    const x = routeComparisonExport(cmp, { current: 'forging', headline: cmp.rows[0].total, labels: { forging: 'Forging', cast_and_machine: 'Cast + Machine', machining: 'Machining' } });
    const html = routeCompareHtml(x, { fmt: n => `£${n.toFixed(2)}` });
    expect(html).toContain('Forging — closed-die forging');
    expect(html).toContain('Cast + Machine — sand casting');
    expect(html).toContain('re-add closes');
    expect(html).toContain('Specification costed');
    expect(html).toContain('Programme spend');
    expect(html).toContain('P10 £');
    expect(html).toContain('data-cost-process="sand"');
    expect(html).not.toMatch(/mat-[a-z0-9-]+</);
  }, 120_000);
});
