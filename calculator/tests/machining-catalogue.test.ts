/**
 * Machining cutting time on PUBLISHED production cutting data (report standard round, 3 Nov 2026).
 *
 * The time base was aluminium rates × a metal "time factor" applied to the cutting AND to the fixed approach
 * allowances, none of it sourced; reviewers judged the stub axle's 24 HMC minutes 2–3× a production cell. These tests
 * pin: every catalogue value is the value in data.json (the 3 CORRECTED rows as corrected), the times are the makers'
 * formulas on the measured geometry, the allowances are not scaled by the metal, a 4.2×D through hole is drilled
 * (no ream, no peck), tool change 2.2 s and pallet change 7.1 s are sourced, and every basis names its sources and
 * labels its assumptions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CATALOGUE, CUTTING_SOURCES, catalogueFor, drillFeed, boreFeed, tapFeed, faceCutter, familyForTimeFactor, sourceName,
  millRoughEffective, turnRoughEffective,
} from '../src/engine/cutting-catalogue.js';
import { featureMinutesEach, featureTime, nearNetHoleMinutes, deepHolePeckPremiumMin, ALLOWANCE_MIN, costedOperation }
  from '../src/engine/feature-machining.js';
import { TOOL_CHANGE_SEC, nearNetMachiningTime, nearNetTurningTime, CUTTING_DATA, fromSolidMillingTime } from '../src/engine/machining-time.js';
import { PALLET_CHANGE_SEC } from '../src/engine/routing-optimiser.js';
import type { FeatureRow } from '../src/engine/feature-ops.js';

const DATA = JSON.parse(readFileSync(new URL('../scripts/research/2026-11-report-standard/machining/data.json', import.meta.url), 'utf8')) as
  Array<{ value: number | string; conditions: string; quote: string }>;
const VERIFY = JSON.parse(readFileSync(new URL('../scripts/research/2026-11-report-standard/verify.json', import.meta.url), 'utf8')) as
  Array<{ set: string; rowIndex: number; verdict: string }>;
const hole = (d: number, L: number, through: boolean | null = true): FeatureRow => ({ kind: 'hole', diaMm: d, depthMm: L, through, count: 1 });

describe('every catalogue figure is the published one', () => {
  it('face milling vc / fz (WSX445 #0, #3 at the first-recommended MC5020 grade; TungAlu #13)', () => {
    expect(CATALOGUE.steel.face.vc).toBe(DATA[0].value);                     // 220
    expect(DATA[0].conditions).toContain('finish fz 0.15');
    // ductile < 800 MPa: the row's 160 is the VP15TF grade; MC5020 (first recommended) is 200 — verify.md point 2
    expect(DATA[3].conditions).toContain('MC5020 200 also listed');
    expect(CATALOGUE['cast iron'].face.vc).toBe(200);
    expect(CATALOGUE.aluminium.face).toMatchObject({ vc: 1000, fz: 0.2 });
    expect(DATA[13].quote).toContain('Vc = 1000 m/min, fz = 0.2 mm/t');
  });
  it('shoulder milling: steel 160 / 0.25 (#7); ductile 190 / 0.25 — the row\'s 0.30 was CORRECTED to 0.25 (#9)', () => {
    expect(CATALOGUE.steel.shoulder).toMatchObject({ vc: DATA[7].value, fz: 0.25 });
    expect(CATALOGUE['cast iron'].shoulder).toMatchObject({ vc: DATA[9].value, fz: 0.25 });
    expect(VERIFY.find(v => v.set === 'machining' && v.rowIndex === 9)!.verdict).toBe('CORRECTED');
  });
  it('drilling n and f at Ø12 / Ø16 (MVE #19–26): n × f is the row\'s value', () => {
    const rows: Array<[keyof typeof CATALOGUE, number, number]> = [['steel', 19, 20], ['cast iron', 23, 24], ['aluminium', 25, 26]];
    for (const [fam, a, b] of rows) {
      const [p12, p16] = CATALOGUE[fam].drill.pts;
      expect(Math.round(p12.n * p12.f)).toBe(DATA[a].value);
      expect(Math.round(p16.n * p16.f)).toBe(DATA[b].value);
    }
  });
  it('boring f 0.2 only (T515 #55, verify point 5 — there is no f 0.1 source); iron vc 201', () => {
    expect(DATA[55].value).toMatch(/201 m\/min.*0\.20 mm\/rev/);
    for (const fam of ['steel', 'cast iron', 'aluminium'] as const) expect(CATALOGUE[fam].bore.f).toBe(0.2);
    expect(CATALOGUE['cast iron'].bore.vc).toBe(201);
  });
  it('turning: Sandvik GC4015 485 @ 0.1 / 350 @ 0.4 (#47), GC3005 09.2 260 @ 0.1 / 215 @ 0.3 (#52), SVJD 400 (#57)', () => {
    expect(DATA[47].value).toBe('485 / 350 / 255');
    expect(CATALOGUE.steel.turnFinish).toMatchObject({ vc: 485, fn: 0.1 });
    expect(CATALOGUE.steel.turnRough).toMatchObject({ vc: 350, fn: 0.4 });
    expect(DATA[52].value).toBe('260 / 215 / 160');
    expect(CATALOGUE['cast iron'].turnFinish).toMatchObject({ vc: 260, fn: 0.1 });
    expect(CATALOGUE.aluminium.turnFinish.vc).toBe(400);
    expect(DATA[57].quote).toContain('HTi10 400 0.05 ─ 0.3 0.2 ─ 3.0');
  });
  it('tapping 15 m/min: the low end of OSG\'s S45C advisable band (#58); inside the "possible" band for FCD / AC (#60, #61)', () => {
    expect(DATA[58].value).toContain('advisable 15-50');
    expect(DATA[61].value).toContain('possible 5-50');
    for (const fam of ['steel', 'cast iron', 'aluminium'] as const) expect(CATALOGUE[fam].tap.vc).toBe(15);
  });
  it('tool change 2.2 s chip-to-chip (Okuma 2.15 ISO 10791-9, DMG 2.2); pallet change 7.1 s ISO 10791-9 (CORRECTED #64)', () => {
    expect(TOOL_CHANGE_SEC).toBe(2.2);                                       // was 6
    expect(DATA[63].value).toBe(2.15);
    expect(String(DATA[69].value)).toMatch(/^2\.2/);
    expect(PALLET_CHANGE_SEC).toBe(7.1);                                      // was 10 ("maker figures 7–12 s", unsupported)
    expect(VERIFY.find(v => v.set === 'machining' && v.rowIndex === 64)!.verdict).toBe('CORRECTED');
  });
  it('every source id names a data.json row range', () => {
    for (const s of Object.values(CUTTING_SOURCES)) expect(s.rows).toMatch(/^#\d/);
  });
});

describe('times are the makers\' formulas on the measured geometry', () => {
  it('drilling at the hole\'s own Ø: the stub axle\'s Ø14 × 59 in ductile iron is 0.26 min (it was 1.11 with a ream)', () => {
    // MVE ductile Ø12 n 1900 f 0.31, Ø16 n 1400 f 0.33; at Ø14: vc = (71.63 + 70.37)/2 = 71.00 m/min, f 0.32;
    // n = 1000 × 71.00 / (π × 14) = 1,614 rev/min; vf = 516.6 mm/min; 59 ÷ 516.6 cutting + 2 mm R-plane fed in (PKG-2:
    // the 0.15 min approach allowance is gone — the operation pays the tool change and the rapids)
    const vc = (Math.PI * 12 * 1900 + Math.PI * 16 * 1400) / 2 / 1000;
    const vf = 1000 * vc / (Math.PI * 14) * 0.32;
    expect(drillFeed('cast iron', 14).vf).toBeCloseTo(vf, 6);
    expect(featureMinutesEach(hole(14, 59), 'cast iron')).toBeCloseTo((59 + 2) / vf, 6);
    expect(featureMinutesEach(hole(14, 59), 'cast iron')).toBeLessThan(0.3);
  });
  it('a Ø6 and a Ø20 drill no longer share a feed', () => {
    expect(drillFeed('steel', 20).vf).toBeLessThan(drillFeed('steel', 12).vf);
    expect(drillFeed('steel', 20).vf).toBeCloseTo(1000 * (Math.PI * 16 * 1700 / 1000) / (Math.PI * 20) * 0.33, 6);
  });
  it('a cored bore with no stated stock is one boring pass at n·f, f 0.2: Ø45 in ductile iron (45 + 2) ÷ 284 mm/min', () => {
    const vf = 1000 * 201 / (Math.PI * 45) * 0.2;
    expect(boreFeed('cast iron', 45).vf).toBeCloseTo(vf, 6);
    expect(nearNetHoleMinutes(hole(45, 45, false), 20, 'cast iron')).toBeCloseTo((45 + 2) / vf, 6);
  });
  it('tapping feed = n × pitch (ISO 261): M10 at 15 m/min = 477.5 × 1.5 = 716 mm/min', () => {
    const t = tapFeed('steel', 'M10');
    expect(t.pitch).toBe(1.5);
    expect(t.vf).toBeCloseTo(1000 * 15 / (Math.PI * 10) * 1.5, 6);
  });
  it('face milling by passes over face length + cutter Ø: the knuckle\'s 4,385 mm² face in steel 0.24 min (it was 1.50)', () => {
    // √4385 = 66.2 mm ≤ 0.7 × 100 → the Ø100 body, z 7 ASSUMED; n = 1000 × 220 / (π × 100) = 700.3; vf = 700.3 × 7 × 0.15
    // = 735.4 mm/min; (66.2 + 100) ÷ 735.4 cutting + 2 × 5 mm clearance at feed = 0.24 min (PKG-2: no 0.20 positioning)
    const c = faceCutter('steel', Math.sqrt(4385));
    expect(c.body).toEqual({ dc: 100, z: 7 });
    const vf = 1000 * 220 / (Math.PI * 100) * 7 * 0.15;
    const face: FeatureRow = { kind: 'face', diaMm: 0, depthMm: 0, through: null, count: 1, areaMm2: 4385 };
    expect(featureMinutesEach(face, 'steel')).toBeCloseTo((Math.sqrt(4385) + 100 + 10) / vf, 6);
    expect(featureTime(face, 'steel').cutMin).toBeCloseTo((Math.sqrt(4385) + 100) / vf, 6);
  });
  it('roughing: the catalogue in-cut rate + 25 % air moves (labelled); turning vc × fn × 3 mm', () => {
    // steel: 0.7 × 100 × 3 × (700.3 × 7 × 0.2 = 980.4) / 1000 = 205.9 cm³/min ÷ 1.25 = 164.7
    expect(millRoughEffective('steel')).toBe(164.7);
    expect(CUTTING_DATA.steel.millRoughCm3PerMin).toBe(164.7);               // was 35
    expect(turnRoughEffective('steel')).toBe(336);                           // 350 × 0.4 × 3 ÷ 1.25; was 80
    expect(turnRoughEffective('cast iron')).toBe(154.8);                     // 215 × 0.3 × 3 ÷ 1.25; was 100
  });
});

describe('no fixed allowance; the metal changes the cutting and the feed the R-plane is fed in at', () => {
  it('a hole in steel and in aluminium: (depth + 2 mm R-plane) at each metal\'s own feed — no allowance (PKG-2)', () => {
    const st = featureMinutesEach(hole(10, 30), 'steel');
    const al = featureMinutesEach(hole(10, 30), 'aluminium');
    expect(ALLOWANCE_MIN.drill).toBe(0);
    expect(st).toBeCloseTo(32 / drillFeed('steel', 10).vf, 9);
    expect(al).toBeCloseTo(32 / drillFeed('aluminium', 10).vf, 9);
  });
  it('a metal with no catalogue row takes the nearest row × the machinability ratio, and says so', () => {
    const ti = catalogueFor('titanium');
    expect(ti).toMatchObject({ fam: 'steel', scale: 2 });
    expect(ti.note).toMatch(/no catalogue row read for titanium.*engineering-typical, not sourced/);
    expect(featureMinutesEach(hole(10, 30), 'titanium')).toBeCloseTo(2 * 32 / drillFeed('steel', 10).vf, 9);
  });
  it('the legacy time factor reads as the family it stands for', () => {
    expect(familyForTimeFactor(2)).toBe('steel');
    expect(familyForTimeFactor(1.6)).toBe('cast iron');
    expect(familyForTimeFactor(1)).toBe('aluminium');
  });
});

describe('a 4.2×D hole is standard reach; clearance holes are not reamed', () => {
  it('Ø14 × 59 through: drilled only — no ream pass, no peck (DIN 338 Ø14.5 reaches 92 mm, data.json #43)', () => {
    const t = featureTime(hole(14, 59), 'cast iron');
    expect(t.text).not.toMatch(/bore|peck/);
    expect(costedOperation(hole(14, 59))).toBe('Drilling (through — clearance, not reamed)');
    expect(deepHolePeckPremiumMin(hole(14, 59), 'cast iron')).toBe(0);
  });
  it('beyond 5×D it pecks, and the premium is exactly the costing\'s extra time', () => {
    const d = hole(8, 60);
    expect(featureMinutesEach(d, 'steel')).toBeCloseTo((60 * 1.5 + 2) / drillFeed('steel', 8).vf, 9);
    expect(featureTime(d, 'steel').cutMin).toBeCloseTo(60 / drillFeed('steel', 8).vf, 9);   // the peck retracts are non-cutting
    expect(deepHolePeckPremiumMin(d, 'steel')).toBeCloseTo(0.5 * 60 / drillFeed('steel', 8).vf, 9);
  });
  it('a blind Ø13–26 hole is a locating bore: drilled + one boring pass', () => {
    const t = featureTime(hole(16, 30, false), 'steel');
    expect(t.min).toBeCloseTo(32 / drillFeed('steel', 16).vf + 32 / boreFeed('steel', 16).vf, 9);
    expect(t.visits.map(v => v.tool)).toEqual(['drill Ø16.0', 'bore Ø16.0']);
  });
});

describe('every basis names its sources and labels its assumptions', () => {
  const rows: FeatureRow[] = [
    { kind: 'face', diaMm: 0, depthMm: 0, through: null, count: 2, areaMm2: 3000 }, hole(14, 59), hole(40, 45, false), hole(8.5, 31),
  ];
  it('near-net facing / drilling / boring / tapping', () => {
    const b = nearNetMachiningTime(rows, 'cast iron', 'sand').basis;
    for (const id of ['MMC-WSX445', 'MMC-MVE', 'TUNGALOY-T515', 'OSG-ATAP', 'OKUMA-MA4000H', 'DMG-NHX4000'] as const) expect(b).toContain(sourceName(id));
    expect(b).toMatch(/ASSUMED/);                                             // the WSX445 teeth
    expect(b).toMatch(/clearance at feed non-cutting, engineering-typical, not sourced/);
    expect(b).toMatch(/approach \/ retract 25 mm rapid plane \+ 2 mm fed in \(engineering-typical, not sourced\)/);
    expect(b).toMatch(/datum probing 12 s \(engineering estimate, not sourced\)/);
    expect(b).not.toMatch(/×1\.6 on aluminium/);
  });
  it('turning and from-solid', () => {
    expect(nearNetTurningTime(100, 'steel', 2, 80).basis).toContain(sourceName('SANDVIK-TURN'));
    const fs = fromSolidMillingTime({ family: 'steel', partCm3: 100, stockCm3: 300, totalAreaCm2: 200, planarAreaCm2: 150,
      areaByTypeCm2: { PLANE: 150, BSPLINE: 50 }, rows: [hole(10, 20)] });
    expect(fs.basis).toContain(sourceName('MMC-APX4000'));
    expect(fs.basis).toContain(sourceName('SANDVIK-K'));
    expect(fs.basis).toMatch(/25% air moves and step-downs \(non-cutting, engineering-typical, not sourced\)/);
    expect(fs.basis).toMatch(/no catalogue row read, engineering-typical, not sourced/);   // ball-nose surfacing
  });
});
