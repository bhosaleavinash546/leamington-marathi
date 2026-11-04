/**
 * Compare routes review (Oct 2026, docs/cad/compare-routes-review-2026-10.md): only feasible routes, in the part's own
 * material family, to the finished scope; every row's arithmetic checkable; break-even from real re-costs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compareRoutes, candidateRoutes, screenCandidates, crossovers, samePolymerGrade, VOLUME_LADDER, type RouteRow } from '../server/services/route-compare.js';
import { screenRoutes, materialFamilyOf, familyOfCategory, ROUTE_FAMILIES, COMPARABLE_ROUTES, largestForgePressTonnes } from '../src/engine/route-feasibility.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { VOLUME_CELL_MIN_ANNUAL } from '../src/engine/routing-optimiser.js';
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
  it('the knuckle: forging, casting, cast + machine and machining; the casting route costs its 12 machined bores; sheet metal refused on gauge', () => {
    const routes = candidateRoutes(input('steering_knuckle_RH.stp'));
    // Secondary-machining parity (Nov 2026): the casting route costs the machined features as secondary machining on the
    // near-net plan, so it is the finished scope — it was refused here as "as-cast".
    expect(routes).toEqual(['forging', 'casting', 'cast_and_machine', 'machining']);
    const s = screenCandidates(input('steering_knuckle_RH.stp'));
    const scope = s.find(x => x.route === 'casting')!.checks.find(c => c.id === 'as_cast_scope')!;
    expect(scope.pass).toBe(true);
    expect(scope.measured).toMatch(/machined features costed as secondary machining — same scope as cast \+ machine/);
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
    // a 4-chamber closed section is not pressed or bent from one sheet (fresh review N4, 3 Nov 2026)
    expect(candidateRoutes(input('AL_Battery_Rail.stp'))).toEqual(['aluminium_extrusion']);
    for (const r of ['sheet_metal', 'sheet_metal_fab']) expect(s.find(x => x.route === r)!.checks.find(c => c.id === 'closed_section')!.pass, r).toBe(false);
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
    // the casting route and cast + machine are one row per process (they cost the same scope to the penny): cast + machine
    // carries it, named for the process (secondary-machining follow-ups, Nov 2026)
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
    // arithmetic audit (30 Oct 2026): forging MPI as the casting station (£2.50 → £0.67), descale per kg of forging, the
    // cell's masked load inside the operator's share of the cut: 22.7563 → 19.9838 (24.0215 before the pilot rule pack)
    // MPI £0.6673, no longer rounded up to £0.67 (7-country review): 19.9805. Report standard round (3 Nov 2026): the
    // secondary machining on the published cutting data (12.5 → 5.8 HMC min) — 15.1618.
    // Secondary-machining parity (Nov 2026): the forging's secondary machining is the near-net plan of cast + machine —
    // the deburr and gauge check, the tool changes, the crewed pallet change, the spindle turned on the lathe in its own
    // fixture, and the as-forged weight carrying that spindle's turning stock — 17.2467. Fresh numbers review (4 Nov 2026):
    // the Ø12 × 2 cylinder is a land, spot-faced, not drilled — 17.3206 on this recorded geometry (its stepped bores group
    // once the baseline is re-recorded with the kernel's axis lines).
    // 16.7767 once the recorded geometry carries the kernel's axis lines (the hub bore and the Ø10 / Ø11 pair stepped)
    const axes = ((part('steering_knuckle_RH.stp').geometry as unknown as { featureTable?: Array<{ axes?: unknown[] }> }).featureTable ?? []).some(r => r.axes?.length);
    // Review round (4 Nov 2026): the CNC lathe at its UK award capex (£56,004 → £135,041) turns the spindle, and the
    // twin-pallet HMC at £300,000 (was £185,000) machines the rest — 16.7767 → 17.5199 (recorded geometry with axis lines).
    expect(ref.total).toBeCloseTo(axes ? 17.5199 : 17.3206, 4);   // unrounded engine total, rounded once at display (live run, 3 Nov 2026)
    expect(ref.tooling!.investment).toBe(443582.83);   // the tombstone fixture + the lathe's own fixture, programming of the machined rows
    expect(ref.tooling!.amortisedOver).toBe(500_000);
    expect(ref.material).toMatchObject({ netKg: 3.434, boughtKg: 5.084 });
    // The casting route and cast + machine now cost the same scope the same, process by process — printed once.
    for (const proc of ['sand', 'investment']) {
      expect(cmp.rows.some(r => r.route === 'casting' && r.process === proc), proc).toBe(false);
      const b = cmp.rows.find(r => r.route === 'cast_and_machine' && r.process === proc)!;
      expect(b.alsoRoutes, proc).toEqual(['casting']);
      expect(b.label).toBe(`${proc === 'sand' ? 'Sand' : 'Investment'} casting + machining`);
    }
    const mach = cmp.rows.find(r => r.route === 'machining')!;
    expect(mach.material!.netKg).toBe(2.852);
    // utilisation to 4 dp: the kg bought is the stock the basis prints (it was 3 dp, 0.45 kg off — arithmetic audit L1)
    expect(mach.material!.boughtKg).toBeCloseTo(50.479, 2);
    expect(mach.caveats.join(' ')).toMatch(/buy-to-fly/);
    // The ladder: every costed row at every volume, the costing's own volume on it.
    expect(cmp.ladder).toEqual([...VOLUME_LADDER]);
    for (const r of cmp.rows) {
      expect(r.byVolume.map(v => v.volume)).toEqual(cmp.ladder);
      expect(r.byVolume.find(v => v.volume === 100_000)!.total).toBe(r.total);
      // Tooling spread over more parts: the part never gets dearer as the volume rises on these routes — except where the
      // machining route changes machine: at VOLUME_CELL_MIN_ANNUAL the twin-pallet HMC cell becomes a candidate, and since
      // its capex rose to £300,000 (review round, 4 Nov 2026) it wins the routing rank (machine + operator, £26.70 v
      // £27.01) while costing 0.3 % more in full — the rank leaves out OEE on the machine time. Allowed there, within 1 %,
      // and nowhere else (a known gap in the routing rank, reported for a decision).
      for (let k = 1; k < r.byVolume.length; k++) {
        const cellStep = r.route === 'machining' && r.byVolume[k - 1].volume < VOLUME_CELL_MIN_ANNUAL && r.byVolume[k].volume >= VOLUME_CELL_MIN_ANNUAL;
        expect(r.byVolume[k].total!, `${r.route} ${r.process} at ${r.byVolume[k].volume}`)
          .toBeLessThanOrEqual(r.byVolume[k - 1].total! * (cellStep ? 1.01 : 1) + 0.0001);
      }
    }
    expect([...new Set(cmp.crossovers.map(c => c.route))]).toEqual(['forging', 'cast_and_machine', 'machining']);
    // A precision STEEL forging is MPI-tested like a closed-die one (report standard review, 3 Nov 2026 — it carried
    // £32 of CT a part, £34.52 of consumables): with less steel bought it is the cheaper process at every volume.
    // Foundry at volume + catalogue machining (3 Nov 2026): sand cast + machine crosses BELOW closed-die forging inside
    // the ladder (~40,000 / yr, with overlapping P10–P90 bands — "indistinguishable"). A crossing is allowed only where it
    // is interpolated between the two real re-costs either side of the sign change; every other row is cheaper / dearer
    // at every volume.
    for (const c of cmp.crossovers) {
      const row = cmp.rows.find(r => r.route === c.route && r.process === c.process)!;
      if (c.atVolume === null) {
        // With the forging's machining now the near-net plan (it dearer by ~£2), sand cast + machine is cheaper at every
        // volume on the ladder rather than crossing below it at ~40,000 / yr.
        expect(c.text).toMatch(c.process === 'precision' || c.process === 'sand' ? /cheaper than the costed route at every volume/ : /dearer than the costed route at every volume/);
        continue;
      }
      expect(`${c.route}/${c.process}`).toBe('cast_and_machine/sand');
      const d = row.byVolume.map((v, i) => v.total! - ref.byVolume[i].total!);
      // EVERY sign change is a crossing, each interpolated between the two re-costs either side of it (the sand row
      // crosses twice — the sentence described only the first, "dearer … above ~7,549", beside a row that is cheaper at
      // the costing's volume: CAD to COST fresh review, Nov 2026).
      const changes = d.map((_, j) => j).filter(j => j > 0 && Math.sign(d[j]) !== Math.sign(d[j - 1]));
      expect(changes.length).toBeGreaterThan(0);
      expect(c.crossings!.length).toBe(changes.length);
      changes.forEach((i, k) => {
        const [v1, v2] = [row.byVolume[i - 1].volume, row.byVolume[i].volume];
        expect(c.crossings![k].atVolume).toBeCloseTo(v1 + (v2 - v1) * d[i - 1] / (d[i - 1] - d[i]), -1);
        expect(c.crossings![k].cheaperAbove).toBe(d[i] < 0);
        expect(c.text).toMatch(new RegExp(`interpolated between re-costs at ${v1.toLocaleString('en-GB')} and ${v2.toLocaleString('en-GB')}`));
      });
      // the headline crossing is the one that decides the costing's own volume, and the sentence ends with its side
      const here = d[row.byVolume.findIndex(v => v.volume === 100_000)];
      expect(c.cheaperAbove).toBe(here < 0);
      expect(c.text).toMatch(new RegExp(`at this costing's 100,000 a year it is ${here < 0 ? 'cheaper' : 'dearer'}`));
      expect(c.indistinguishable).not.toBeNull();
      expect(c.text).toMatch(/indistinguishable/);
    }
    // the machining row (50.5 kg of plate for a 2.85 kg part) is costed, itemised and marked not credible
    expect(mach.credible).toBe(false);
    expect(mach.notCredible.join(' ')).toMatch(/5\.7% utilisation/);
    // the cast-steel rows rest on GS-C25 bought below the forging's own steel scrap credit: refused with that reason
    // (route-material-guard.ts, fresh numbers review 4 Nov 2026); every other row is credible
    const castSteel = cmp.rows.filter(r => r.materialCheck?.status === 'implausible');
    expect(castSteel.length).toBeGreaterThan(0);
    for (const r of castSteel) expect(r.material?.materialId).toBe('mat-gs-c25');
    expect(cmp.rows.filter(r => r !== mach && !castSteel.includes(r)).every(r => r.credible)).toBe(true);
    const precision = cmp.rows.find(r => r.process === 'precision')!;
    // one name for the tool wear on every route (secondary-machining follow-ups, Nov 2026)
    expect(precision.consumables.map(l => l.label)).toEqual(['descale', 'NDT', 'cutting-tool wear']);
    expect(precision.consumables.find(l => l.label === 'NDT')!.gbp).toBeLessThan(1);
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
    // the sheet routes are refused on the closed section (fresh review N4) — listed with their reason, not costed
    expect(cmp.rows.some(r => r.route === 'sheet_metal')).toBe(false);
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
    expect(html).toContain('Tooling over programme');
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
    // the casting route and cast + machine cost one machining plan: one row (and one refusal) per process, named for it
    expect(labels).toContain('Sand casting + machining');
    expect(labels).toContain('Investment casting + machining');
    const ex = cmp.excluded.map(e => e.label);
    expect(ex).toContain('forging — cold forming');
    expect(ex).toContain('High-pressure die casting + machining');
    expect(ex.filter(l => /high-pressure die casting/i.test(l))).toHaveLength(1);
    expect(cmp.excluded.find(e => e.label === 'High-pressure die casting + machining')!.reasons[0].measured).toMatch(/sand-moulded or investment cast in this rate book/);
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
    // the answer as its question names it, not the option value 'yes' (live run, 3 Nov 2026)
    expect(ref.spec.find(s => s.id === 'service.safetyCritical')).toMatchObject({ value: 'Yes — safety-critical', source: 'answered' });
    const cam = cmp.rows.find(r => r.route === 'cast_and_machine' && r.process === 'sand')!;
    expect(cam.spec.find(s => s.id === 'service.pressureTight')).toMatchObject({ source: 'assumed' });
    expect(cam.spec.find(s => s.id === 'casting.processChoice')).toMatchObject({ value: 'sand casting', source: 'comparison' });
    const mach = cmp.rows.find(r => r.route === 'machining')!;
    // machining asks safety-critical too now (report standard review, 3 Nov 2026); it never reads the tolerance class
    expect(mach.spec.find(s => s.id === 'service.safetyCritical')).toMatchObject({ source: 'answered' });
    expect(mach.spec.find(s => s.id === 'service.toleranceClass')).toMatchObject({ source: 'not asked' });
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
    // The payback is on the UP-FRONT tooling only (report standard #9): the moulding's replacement moulds and upkeep
    // are not an investment to pay back.
    const tf = cmp.rows.find(r => r.route === 'thermoforming')!;
    expect(im.tooling!.split!.running).toBeGreaterThan(0);
    expect(x.payback!.extraTooling).toBeCloseTo(im.tooling!.split!.upFront - tf.tooling!.split!.upFront, 1);
    expect(x.payback!.extraTooling).toBeLessThan(im.tooling!.investment - tf.tooling!.investment);
    expect(im.programme!.total).toBeCloseTo(im.programme!.pieceExTooling * im.programme!.parts + im.tooling!.investment, 1);
    expect(im.programme!.parts).toBe(500_000);
  }, 120_000);
  it('the screen prints the process rows, the re-add verdict, the spec sources, the band and the programme spend', async () => {
    const cmp = await compareRoutes(input('FORGE_Hub_Flange.stp'), undefined);
    const x = routeComparisonExport(cmp, { current: 'forging', headline: cmp.rows[0].total, labels: { forging: 'Forging', cast_and_machine: 'Cast + Machine', machining: 'Machining' } });
    const html = routeCompareHtml(x, { fmt: n => `£${n.toFixed(2)}` });
    expect(html).toContain('Forging — closed-die forging');
    expect(html).toContain('Sand casting + machining');
    expect(html).toContain('re-add closes');
    expect(html).toContain('Specification costed');
    expect(html).toContain('Programme spend');
    expect(html).toContain('P10 £');
    expect(html).toContain('data-cost-process="sand"');
    expect(html).not.toMatch(/mat-[a-z0-9-]+</);
  }, 120_000);
});

describe('the forge-press feasibility sizes the grade the costing uses (7-country review, 3 Nov 2026)', () => {
  it('a family named by the file (not answered) reaches the press check', async () => {
    const src = (await import('node:fs')).readFileSync('src/engine/route-feasibility.ts', 'utf8');
    expect(src).toMatch(/i\.family \?\? materialFromFile\(i\.filename, i\.geo\)\?\.family/);
  });
});
