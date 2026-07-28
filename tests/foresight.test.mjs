// BrainSpark Horizon — deterministic foresight cores + register integrity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGISTER_VINTAGE, horizonWindows, sCurvePhase, horizonFor,
  bassAdoption, bassTimeFor, projectAdoption,
  wrightCostIndex, TREND_LEARNING, costOutlook,
  momentumScore, confidenceTier, resolveParts, foresightFor, patentTrend,
  inflectionYears,
} from '../foresight.mjs';
import { FORESIGHT_REGISTER, REG_ANCHORS, MIN_PER_COMMODITY, SEGMENTS, SEGMENT_TAG_IDS, BENCHMARK_VEHICLES, ADOPTION_CEILING_IDS } from '../src/data/tech-foresight-register.mjs';
import { COMMODITY_KEYS } from '../src/data/commodity-classify.mjs';

// ── Register integrity — the curation rules, enforced ────────────────────────

test('register: ids are unique and kebab-case', () => {
  const ids = FORESIGHT_REGISTER.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9][a-z0-9-]*$/, id);
});

test('register: every entry is structurally valid', () => {
  const anchorIds = new Set(REG_ANCHORS.map((a) => a.id));
  const powertrains = new Set(['ICE', 'MHEV', 'PHEV', 'BEV']);
  const trends = new Set(['falling-fast', 'falling', 'flat', 'rising']);
  const drivers = new Set(['cost', 'regulation', 'performance', 'weight', 'software', 'sustainability']);
  for (const t of FORESIGHT_REGISTER) {
    assert.ok(COMMODITY_KEYS.includes(t.commodity), `${t.id}: bad commodity ${t.commodity}`);
    assert.ok(Number.isInteger(t.trl) && t.trl >= 1 && t.trl <= 9, `${t.id}: trl ${t.trl}`);
    assert.ok(t.adoptionPct >= 0 && t.adoptionPct <= 100, `${t.id}: adoptionPct`);
    assert.ok(t.powertrains.length >= 1 && t.powertrains.every((p) => powertrains.has(p)), `${t.id}: powertrains`);
    assert.ok(trends.has(t.costTrend), `${t.id}: costTrend`);
    assert.ok(t.drivers.length >= 1 && t.drivers.every((d) => drivers.has(d)), `${t.id}: drivers`);
    assert.ok(t.matchTerms.length >= 1, `${t.id}: matchTerms empty`);
    for (const term of t.matchTerms) assert.equal(term, term.toLowerCase(), `${t.id}: matchTerm not lowercase`);
    assert.ok(t.players.length >= 1, `${t.id}: players empty`);
    assert.ok(t.name && t.replaces && t.note, `${t.id}: missing prose fields`);
    if (t.regAnchor) assert.ok(anchorIds.has(t.regAnchor), `${t.id}: unknown regAnchor ${t.regAnchor}`);
  }
});

test('register: reg anchors are unique, dated, statused and cover every referenced id', () => {
  const ids = REG_ANCHORS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  const statuses = new Set(['in-force', 'adopted', 'proposed', 'under-revision']);
  for (const a of REG_ANCHORS) {
    assert.ok(a.year >= 2024 && a.year <= 2040, `${a.id}: implausible year ${a.year}`);
    assert.ok(a.name && a.region && a.effect, `${a.id}: missing fields`);
    assert.ok(statuses.has(a.status), `${a.id}: missing/invalid status`);
  }
});

test('audit: ceilings are curated for niche techs and respected by the model', () => {
  const byId = new Map(FORESIGHT_REGISTER.map((t) => [t.id, t]));
  for (const id of ADOPTION_CEILING_IDS) {
    const t = byId.get(id);
    assert.ok(t, `ceiling for unknown id ${id}`);
    assert.ok(t.ceiling >= 1 && t.ceiling <= 90, `${id}: ceiling ${t.ceiling}`);
    assert.ok(t.adoptionPct <= t.ceiling, `${id}: adoption ${t.adoptionPct} above its own ceiling ${t.ceiling}`);
  }
  // A hard-capped tech saturates at its ceiling; its milestones are measured
  // against that ceiling (2026 fix), so even a 5%-ceiling tech gets an honest
  // timeline instead of a permanent "not in range".
  const r = foresightFor({ query: 'float' });
  const float = [...r.horizons.H1, ...r.horizons.H2, ...r.horizons.H3].find((c) => c.id === 'float-mode');
  assert.ok(float);
  assert.ok(float.projection.adoption.in8 <= 5, `float-mode in8=${float.projection.adoption.in8} above 5% ceiling`);
  assert.equal(float.projection.crossings.ceiling, 5);
  assert.equal(float.projection.crossings.share50, 2.5);
  const f50 = float.projection.crossings.cross50;
  assert.ok(f50 === 'passed' || f50 === null || (typeof f50 === 'number' && f50 >= 2026), `float cross50=${f50}`);
  assert.match(float.projection.basis, /ceiling ~5%/);
});

test('audit: proposed/under-revision anchors give context but never pull a horizon', () => {
  const fakeTech = {
    id: 'fake-pfas-tech', name: 'X', commodity: 'Electrical', powertrains: ['BEV'], replaces: 'y',
    trl: 6, adoptionPct: 1, drivers: ['regulation'], costTrend: 'flat', players: ['Z'],
    note: 'n', matchTerms: ['zzz'], regAnchor: 'pfas',
  };
  const proposed = { id: 'pfas', name: 'PFAS', year: 2027, region: 'EU', status: 'proposed', effect: 'e' };
  const rP = foresightFor({}, { register: [fakeTech], anchors: [proposed] });
  const cP = rP.horizons.H2[0];
  assert.ok(cP && cP.regPulled === false, 'proposed anchor must not pull');
  // Same anchor, adopted → pulls one horizon earlier.
  const rA = foresightFor({}, { register: [fakeTech], anchors: [{ ...proposed, status: 'adopted' }] });
  const cA = rA.horizons.H1[0];
  assert.ok(cA && cA.regPulled === true, 'adopted anchor should pull');
});

test('audit: crossing bands are ordered and only present on real crossings', () => {
  const r = foresightFor({ commodity: 'EDU' });
  for (const c of [...r.horizons.H1, ...r.horizons.H2, ...r.horizons.H3]) {
    const { cross50, band50 } = c.projection.crossings;
    if (typeof cross50 === 'number' && band50) {
      if (typeof band50[0] === 'number') assert.ok(band50[0] <= cross50, `${c.id}: early band after point`);
      if (typeof band50[1] === 'number') assert.ok(band50[1] >= cross50, `${c.id}: late band before point`);
    }
    if (cross50 === 'passed' || cross50 === null) assert.equal(band50, null, `${c.id}: band on non-crossing`);
  }
});

test('register: full-vehicle scale after the 2026 re-curation', () => {
  assert.ok(FORESIGHT_REGISTER.length >= 110, `only ${FORESIGHT_REGISTER.length} entries`);
});

// The queries a cost engineer actually types — EVERY one must resolve to at
// least one technology (via matchTerms or the commodity-classifier net).
// This is the coverage contract: no dead-end searches across ICE/MHEV/PHEV/BEV.
const COVERAGE_QUERIES = [
  // Powertrain / ICE
  'turbocharger', 'exhaust system', 'fuel injector', 'engine water pump', 'cylinder head',
  'catalytic converter', 'range extender', '48v starter generator',
  // Battery
  'hv battery pack', 'battery module', 'bms', 'battery enclosure', 'cell contacting system',
  'fast charging', 'sodium ion cell',
  // EDU / Driveline
  'stator winding', 'rotor magnets', 'inverter power module', 'onboard charger', 'reduction gearbox',
  'transmission', 'halfshaft', 'differential', 'e-axle',
  // Chassis
  'brake disc', 'brake caliper', 'air suspension', 'damper', 'steering rack', 'tyre', 'anti-roll bar',
  // BIW / Exterior
  'underbody casting', 'b-pillar', 'rocker sill', 'door handle', 'tailgate', 'headlamp',
  'grille', 'door mirror', 'windscreen glazing', 'aero wheel',
  // Interior
  'seats', 'airbag', 'headliner', 'instrument cluster display', 'hud', 'audio speakers', 'steering wheel',
  // Electrical / Thermal
  'wiring harness', 'ecu', 'lidar sensor', 'heat pump', 'hvac compressor', 'refrigerant system',
  'charge port', 'digital key',
  // Off-road & luxury SUV
  'locking differential', 'transfer case', 'low range gearbox', 'wading', 'terrain response',
  'tank turn', 'skid plate', 'satellite connectivity', 'air purification', 'suspension preview', 'diff lock',
  // SDV / ADAS / software / safety
  'self driving software', 'driver monitoring', 'v2x', 'parking assist', 'ai compute soc',
  'virtual ecu', 'ota subscription', 'digital twin simulation', 'aeb emergency braking', 'imaging radar',
  // 2026 full-BOM sweep additions (each was a dead-end before F10)
  'pistons', 'timing chain', 'intercooler', 'muffler', 'spark plug', 'cvt', 'dc-dc converter', 'eps',
  'evaporator', 'ptc heater', 'radiator', 'condenser', 'cooling fan', 'relay', 'antenna', 'amplifier',
  'fuel cell stack', 'pyro fuse', '12v battery', 'window regulator', 'door module', 'sun visor', 'washer system',
  '48v mhev battery', 'stator rotor lamination', 'electrical steel',
];

test('coverage: every realistic part query resolves to technologies', () => {
  const dead = [];
  for (const q of COVERAGE_QUERIES) {
    const r = foresightFor({ query: q });
    if (r.count === 0) dead.push(q);
  }
  assert.deepEqual(dead, [], `dead-end queries: ${dead.join(', ')}`);
});

test('coverage: every powertrain type has technologies in every horizon-relevant commodity', () => {
  for (const pt of ['ICE', 'MHEV', 'PHEV', 'BEV']) {
    const r = foresightFor({ powertrain: pt });
    assert.ok(r.count >= 15, `${pt}: only ${r.count} technologies`);
  }
});

// ── Off-Road & Luxury SUV segment lens ───────────────────────────────────────

test('segments: tag map ids all resolve and tags land on entries', () => {
  assert.deepEqual(SEGMENTS.sort(), ['luxury', 'off-road', 'software']);
  const ids = new Set(FORESIGHT_REGISTER.map((t) => t.id));
  for (const [seg, tagIds] of Object.entries(SEGMENT_TAG_IDS)) {
    for (const id of tagIds) assert.ok(ids.has(id), `${seg}: unknown id ${id}`);
    assert.equal(new Set(tagIds).size, tagIds.length, `${seg}: duplicate ids`);
  }
  for (const t of FORESIGHT_REGISTER) {
    for (const s of t.segments ?? []) assert.ok(SEGMENTS.includes(s), `${t.id}: bad segment ${s}`);
  }
});

test('segments: the off-road and luxury lenses are substantive', () => {
  const offroad = foresightFor({ segment: 'off-road' });
  assert.ok(offroad.count >= 15, `off-road: only ${offroad.count}`);
  const luxury = foresightFor({ segment: 'luxury' });
  assert.ok(luxury.count >= 15, `luxury: only ${luxury.count}`);
  const software = foresightFor({ segment: 'software' });
  assert.ok(software.count >= 20, `software: only ${software.count}`);
  for (const c of [...offroad.horizons.H1, ...offroad.horizons.H2, ...offroad.horizons.H3]) {
    assert.ok(c.segments?.includes('off-road'), `${c.id} leaked into off-road lens`);
  }
  // Lens composes with query and powertrain.
  const q = foresightFor({ query: 'suspension', segment: 'off-road' });
  assert.ok(q.count >= 2 && q.count < offroad.count);
  const bev = foresightFor({ segment: 'off-road', powertrain: 'BEV' });
  assert.ok(bev.count >= 8);
});

test('benchmarks: curated vehicle set is complete and plausible', () => {
  assert.ok(BENCHMARK_VEHICLES.length >= 10);
  const names = BENCHMARK_VEHICLES.map((b) => `${b.brand} ${b.vehicle}`);
  assert.equal(new Set(names).size, names.length, 'duplicate vehicles');
  const powertrains = new Set(['ICE', 'MHEV', 'PHEV', 'BEV']);
  for (const b of BENCHMARK_VEHICLES) {
    assert.ok(b.year >= 2010 && b.year <= 2026, `${b.vehicle}: year ${b.year}`);
    assert.ok(b.signature.length >= 2, `${b.vehicle}: thin signature list`);
    assert.ok(b.watch.length > 10, `${b.vehicle}: missing watch item`);
    assert.ok(b.powertrains.length >= 1 && b.powertrains.every((p) => powertrains.has(p)), `${b.vehicle}: powertrains`);
  }
  // The disruptors that pressure the segment must be represented.
  for (const brand of ['JLR', 'Mercedes-Benz', 'BYD', 'Rivian']) {
    assert.ok(BENCHMARK_VEHICLES.some((b) => b.brand === brand), `missing ${brand}`);
  }
});

test('register: every commodity has at least MIN_PER_COMMODITY entries', () => {
  const byCommodity = {};
  for (const t of FORESIGHT_REGISTER) byCommodity[t.commodity] = (byCommodity[t.commodity] ?? 0) + 1;
  for (const key of COMMODITY_KEYS) {
    assert.ok((byCommodity[key] ?? 0) >= MIN_PER_COMMODITY, `${key}: only ${byCommodity[key] ?? 0} entries`);
  }
});

test('register: honesty rules — committed claims need evidence, speculative stay low-adoption', () => {
  for (const t of FORESIGHT_REGISTER) {
    // High adoption claims must carry production evidence or a forcing regulation.
    if (t.adoptionPct >= 15) assert.ok(t.firstProduction || t.regAnchor, `${t.id}: ${t.adoptionPct}% adoption with no evidence`);
    // A tech that isn't production-ready cannot claim meaningful adoption.
    if (t.trl <= 5) assert.ok(t.adoptionPct <= 1, `${t.id}: trl ${t.trl} but ${t.adoptionPct}% adoption`);
  }
});

// ── Analyze-catalog parity: Horizon must answer for everything Analyze offers ─
import { readFileSync } from 'node:fs';

test('parity: every Analyze system & subassembly resolves in Horizon', () => {
  // Read the ACTUAL Analyze catalog so the two tools can never drift apart:
  // add a subassembly to Analyze and this test forces Horizon to cover it.
  const src = readFileSync(new URL('../src/data/automotive-catalog.ts', import.meta.url), 'utf8');
  const systems = [...src.matchAll(/^\s{4}name:\s*'([^']+)'/gm)].map((m) => m[1]);
  const subs = [...src.matchAll(/^\s{6,8}\{\s*id:\s*'[^']+',\s*name:\s*'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(systems.length >= 13 && subs.length >= 52, `extraction broke: ${systems.length}/${subs.length}`);
  const dead = [...systems, ...subs].filter((n) => foresightFor({ query: n }).count === 0);
  assert.deepEqual(dead, [], `Analyze names with no Horizon answer: ${dead.join(' | ')}`);
  // The in-Horizon mirror must match the Analyze catalog EXACTLY.
  assert.deepEqual(Object.keys(ANALYZE_SYSTEMS), systems, 'ANALYZE_SYSTEMS systems drifted from automotive-catalog.ts');
  assert.deepEqual(Object.values(ANALYZE_SYSTEMS).flat(), subs, 'ANALYZE_SYSTEMS subassemblies drifted from automotive-catalog.ts');
});

// ── Full-vehicle BOM taxonomy: nothing may dead-end ──────────────────────────
import { BOM_TREE, flattenBom, ANALYZE_SYSTEMS } from '../src/data/vehicle-bom.mjs';

test('BOM: covers the whole vehicle and EVERY component resolves to technologies', () => {
  const leaves = flattenBom();
  assert.ok(leaves.length >= 270, `only ${leaves.length} BOM leaves`);
  assert.deepEqual(Object.keys(BOM_TREE).sort(), [...COMMODITY_KEYS].sort(), 'BOM must span every commodity');
  const dead = leaves.filter(({ part }) => foresightFor({ query: part }).count === 0);
  assert.deepEqual(dead.map((d) => d.part), [], `dead BOM components: ${dead.map((d) => d.part).join(', ')}`);
});

// ── Register self-audit (the tool finds its own weak spots) ──────────────────
import { auditRegister, auditQueryPrecision } from '../foresight-audit.mjs';

test('self-audit: audits every entry with known flags, worst-first inbox', () => {
  const a = auditRegister();
  assert.equal(a.total, FORESIGHT_REGISTER.length);
  const known = new Set(['no-evidence', 'few-players', 'no-china-frontier', 'stale-evidence', 'thin-matchterms', 'short-note']);
  for (const e of a.inbox) for (const f of e.flags) assert.ok(known.has(f), f);
  for (let i = 1; i < a.inbox.length; i++) assert.ok(a.inbox[i - 1].flags.length >= a.inbox[i].flags.length);
});

test('self-audit regression gates: the register can only get healthier', () => {
  const a = auditRegister();
  // Re-baselined at audit #2 (July 2026): the China-marker heuristic was
  // HARDENED to named entities only (generic "Chinese …" no longer clears the
  // flag — that is how the gate got gamed), so the measured baseline moved.
  // Future edits must not regress from here.
  assert.ok(a.chinaCoveragePct >= 51, `China-frontier coverage fell to ${a.chinaCoveragePct}%`);
  assert.ok(a.flaggedCount <= 129, `curation debt grew to ${a.flaggedCount}`);
  assert.ok((a.byFlag['no-evidence'] ?? 0) <= 23, 'evidence debt grew');
});

test('self-audit: every coverage query resolves via specific terms, not generic ties', () => {
  const q = auditQueryPrecision(COVERAGE_QUERIES);
  assert.deepEqual(q.weak, [], `weak queries: ${JSON.stringify(q.weak)}`);
});

// ── S-curve + horizons ───────────────────────────────────────────────────────

test('sCurvePhase maps maturity to phases', () => {
  assert.equal(sCurvePhase(3, 0), 'research');
  assert.equal(sCurvePhase(5, 0), 'demonstration');
  assert.equal(sCurvePhase(8, 3), 'takeoff');
  assert.equal(sCurvePhase(9, 20), 'growth');
  assert.equal(sCurvePhase(9, 60), 'mainstream');
});

test('horizonWindows spans H1 now–2027 / H2 2028–2031 / H3 2032+ at vintage 2025', () => {
  const w = horizonWindows(2025);
  assert.equal(w.H1.to, 2027);
  assert.equal(w.H2.from, 2028);
  assert.equal(w.H2.to, 2031);
  assert.equal(w.H3.from, 2032);
  assert.equal(w.H3.to, null);
});

test('horizonFor: maturity sets the base bucket', () => {
  assert.deepEqual(horizonFor(9, 20), { horizon: 'H1', regPulled: false });
  assert.deepEqual(horizonFor(6, 1), { horizon: 'H2', regPulled: false });
  assert.deepEqual(horizonFor(4, 0), { horizon: 'H3', regPulled: false });
});

test('horizonFor: a near-term regulation pulls at most one horizon earlier', () => {
  // TRL 6 (base H2) + regulation biting 2027 (H1 window) → pulled into H1.
  assert.deepEqual(horizonFor(6, 1, 2027, 2025), { horizon: 'H1', regPulled: true });
  // TRL 4 (base H3) + 2027 regulation → only pulled to H2, never two steps.
  assert.deepEqual(horizonFor(4, 0, 2027, 2025), { horizon: 'H2', regPulled: true });
  // Regulation biting later than the base bucket does not pull.
  assert.deepEqual(horizonFor(9, 20, 2035, 2025), { horizon: 'H1', regPulled: false });
});

// ── Bass diffusion ───────────────────────────────────────────────────────────

test('bassAdoption is 0 at launch, monotonic, and saturates below 1', () => {
  assert.equal(bassAdoption(0), 0);
  let prev = 0;
  for (let t = 1; t <= 30; t++) {
    const f = bassAdoption(t);
    assert.ok(f > prev, `t=${t} not monotonic`);
    prev = f;
  }
  assert.ok(prev > 0.99 && prev < 1);
});

test('bassTimeFor inverts bassAdoption', () => {
  for (const F of [0.05, 0.2, 0.5, 0.8]) {
    const t = bassTimeFor(F);
    assert.ok(Math.abs(bassAdoption(t) - F) < 1e-9, `F=${F}`);
  }
});

test('projectAdoption grows from the curated share and clamps at the ceiling', () => {
  const in5 = projectAdoption(10, 5);
  assert.ok(in5 > 10 && in5 <= 90, `in5=${in5}`);
  assert.ok(projectAdoption(10, 8) > in5);
  assert.equal(projectAdoption(88, 40), 90);   // saturation, never 100
  assert.ok(projectAdoption(0, 5) > 0);        // 0% seeds rather than dividing by zero
});

test('inflectionYears: crossing years are honest and ordered', () => {
  // Low-adoption tech: quarter-ceiling crossing comes before half-ceiling.
  const low = inflectionYears(2, { now: 2026 });
  assert.ok(typeof low.cross25 === 'number' && low.cross25 > 2026);
  assert.ok(typeof low.cross50 === 'number' && low.cross50 > low.cross25);
  assert.equal(low.share25, 22.5);        // default 90% ceiling → milestones at 22.5 / 45
  assert.equal(low.share50, 45);
  // Already past a threshold → 'passed', never a fake future date.
  const mid = inflectionYears(30, { now: 2026 });
  assert.equal(mid.cross25, 'passed');
  assert.ok(typeof mid.cross50 === 'number');
  const high = inflectionYears(60, { now: 2026 });
  assert.equal(high.cross25, 'passed');
  assert.equal(high.cross50, 'passed');
  assert.equal(high.band25, null);
  assert.equal(high.band50, null);
  assert.equal(high.peakGrowth, 'passed');   // past the Bass inflection already
  // Higher current adoption never crosses LATER than lower adoption.
  const lower = inflectionYears(1, { now: 2026 });
  assert.ok(low.cross50 <= lower.cross50);
});

test('horizonFor: the lane follows the decision year, not raw maturity (2026 fix)', () => {
  // A production-proven technology sitting at 2% adoption is NOT an "adopt now"
  // decision — this was the bug that made 51 of 130 H1 entries read as today.
  assert.equal(horizonFor(9, 2, null, 2026, { decisionYear: 2031, ceilingPct: 40 }).horizon, 'H2');
  assert.equal(horizonFor(9, 2, null, 2026, { decisionYear: 2035, ceilingPct: 40 }).horizon, 'H3');
  // Already at scale → H1 whatever the curve says next.
  assert.equal(horizonFor(9, 45, null, 2026, { decisionYear: 2033, ceilingPct: 90 }).horizon, 'H1');
  assert.equal(horizonFor(9, 60, null, 2026, { decisionYear: 'passed', ceilingPct: 90 }).horizon, 'H1');
  // Maturity cap: a steep curve cannot drag lab-stage work into a near lane.
  assert.equal(horizonFor(3, 0, null, 2026, { decisionYear: 2027, ceilingPct: 10 }).horizon, 'H3');
  assert.equal(horizonFor(5, 0, null, 2026, { decisionYear: 2027, ceilingPct: 10 }).horizon, 'H2');
  // Beyond planning range → H3, never a fake near lane.
  assert.equal(horizonFor(8, 1, null, 2026, { decisionYear: null, ceilingPct: 20 }).horizon, 'H1');   // no model supplied → legacy rule
  // Regulation still pulls at most one lane, and never before its own bucket.
  const pulled = horizonFor(7, 2, 2027, 2026, { decisionYear: 2034, ceilingPct: 50 });
  assert.equal(pulled.horizon, 'H2');
  assert.equal(pulled.regPulled, true);
});

test('register lanes: the future is actually populated (2026 fix)', () => {
  // The regression this guards: every technology filed as "now" because TRL>=8.
  const lanes = { H1: 0, H2: 0, H3: 0 };
  for (const c of ['Battery', 'EDU', 'Chassis', 'BIW', 'Interior', 'Exterior', 'Electrical', 'Powertrain', 'Driveline']) {
    const r = foresightFor({ commodity: c });
    lanes.H1 += r.horizons.H1.length; lanes.H2 += r.horizons.H2.length; lanes.H3 += r.horizons.H3.length;
  }
  const future = lanes.H2 + lanes.H3;
  assert.ok(future >= lanes.H1 * 0.5, `future lanes starved: H1=${lanes.H1} H2=${lanes.H2} H3=${lanes.H3}`);
  assert.ok(lanes.H3 >= 5, `H3 nearly empty (${lanes.H3}) — the tool must still see past 2032`);
});

test('inflectionYears: ceiling-capped techs get real milestone years (2026 fix)', () => {
  // Old model: ceiling 20 could never cross 25% of segment → permanent null.
  // New model: milestones at 5% and 10% absolute share — honest, reachable.
  const capped = inflectionYears(2, { now: 2026, ceilingPct: 20 });
  assert.equal(capped.share25, 5);
  assert.equal(capped.share50, 10);
  assert.ok(typeof capped.cross25 === 'number' && capped.cross25 > 2026, `cross25=${capped.cross25}`);
  assert.ok(typeof capped.cross50 === 'number' && capped.cross50 > capped.cross25, `cross50=${capped.cross50}`);
  // Peak growth is a year, 'passed', or null — and ordered after cross25 when numeric.
  const pg = capped.peakGrowth;
  assert.ok(pg === 'passed' || pg === null || (typeof pg === 'number' && pg >= 2026), `peakGrowth=${pg}`);
});

test('techCard projection carries the crossing years', () => {
  const r = foresightFor({ commodity: 'Battery' });
  const all = [...r.horizons.H1, ...r.horizons.H2, ...r.horizons.H3];
  for (const c of all) {
    assert.ok('cross25' in c.projection.crossings && 'cross50' in c.projection.crossings, c.id);
    const v = c.projection.crossings.cross50;
    assert.ok(v === null || v === 'passed' || (typeof v === 'number' && v >= REGISTER_VINTAGE), c.id);
  }
});

// ── Wright's law ─────────────────────────────────────────────────────────────

test('wrightCostIndex: one doubling at 20% learning costs 0.80', () => {
  assert.equal(wrightCostIndex(2, 0.2), 0.8);
  assert.equal(wrightCostIndex(4, 0.2), 0.64);
  assert.equal(wrightCostIndex(1, 0.2), 1);          // no growth → no learning
  assert.ok(wrightCostIndex(4, -0.05) > 1);          // rising trend → index above 1
});

test('costOutlook: falling trends produce sub-1 indices, rising above 1', () => {
  const falling = { adoptionPct: 5, costTrend: 'falling-fast' };
  const rising = { adoptionPct: 5, costTrend: 'rising' };
  assert.ok(costOutlook(falling, 5) < 1);
  assert.ok(costOutlook(rising, 5) >= 1);
  assert.ok(TREND_LEARNING['falling-fast'] > TREND_LEARNING.falling);
});

// ── Patent-velocity trend ────────────────────────────────────────────────────

const series = (...counts) => counts.map((count, i) => ({ year: 2021 + i, count }));

test('patentTrend classifies acceleration, decline and steady with a deadband', () => {
  assert.equal(patentTrend(series(10, 12, 20, 30, 40)), 'accelerating');
  assert.equal(patentTrend(series(40, 38, 30, 12, 10)), 'declining');
  assert.equal(patentTrend(series(20, 21, 20, 22, 21)), 'steady');
});

test('patentTrend refuses to see a trend in noise or thin data', () => {
  assert.equal(patentTrend(series(0, 0, 0, 1, 1)), null, 'a handful of hits is not a signal');
  assert.equal(patentTrend(series(10, 20, 30)), null, 'needs at least 4 years');
  assert.equal(patentTrend([]), null);
  assert.equal(patentTrend(null), null);
  assert.equal(patentTrend(series(0, 0, 0, 0, 0)), null);
});

// ── Momentum + confidence ────────────────────────────────────────────────────

test('momentumScore is bounded 0–100 and rewards maturity, trend and evidence', () => {
  for (const t of FORESIGHT_REGISTER) {
    const m = momentumScore(t);
    assert.ok(m >= 0 && m <= 100, `${t.id}: ${m}`);
  }
  const hot = momentumScore({ trl: 9, adoptionPct: 40, costTrend: 'falling-fast', drivers: ['cost', 'weight'], firstProduction: 'x', regAnchor: null });
  const cold = momentumScore({ trl: 3, adoptionPct: 0, costTrend: 'rising', drivers: ['performance'], firstProduction: null, regAnchor: null });
  assert.ok(hot > cold + 40);
});

test('confidenceTier follows the honesty rules', () => {
  assert.equal(confidenceTier({ regAnchor: 'euro7', firstProduction: null, trl: 5 }), 'committed');
  assert.equal(confidenceTier({ regAnchor: null, firstProduction: 'Tesla (2020)', trl: 6 }), 'committed');
  assert.equal(confidenceTier({ regAnchor: null, firstProduction: null, trl: 8 }), 'probable');
  assert.equal(confidenceTier({ regAnchor: null, firstProduction: null, trl: 5 }), 'speculative');
});

// ── Part resolution + assembler ──────────────────────────────────────────────

test('resolveParts matches the phrases a cost engineer actually types', () => {
  const stator = resolveParts('EDU stator assembly');
  assert.ok(stator.length > 0);
  assert.equal(stator[0].tech.id, 'hairpin-xpin');

  const battery = resolveParts('BEV HV battery pack');
  assert.ok(battery.some((m) => m.tech.id === 'ctp-ctb'));
  assert.ok(battery.some((m) => m.tech.id === '800v-pack'));

  assert.deepEqual(resolveParts(''), []);
  assert.deepEqual(resolveParts('completely unrelated zzz'), []);
});

test('foresightFor: commodity + powertrain filters and horizon lanes', () => {
  const r = foresightFor({ commodity: 'Battery', powertrain: 'BEV' });
  assert.equal(r.commodity, 'Battery');
  assert.ok(r.count >= MIN_PER_COMMODITY);
  const all = [...r.horizons.H1, ...r.horizons.H2, ...r.horizons.H3];
  assert.equal(all.length, r.count);
  for (const c of all) {
    assert.equal(c.commodity, 'Battery');
    assert.ok(c.powertrains.includes('BEV'));
    assert.ok(['committed', 'probable', 'speculative'].includes(c.confidence));
    assert.ok(c.projection.adoption.in5 >= c.adoptionPct);
    assert.ok(c.projection.basis.includes('modelled'));
  }
  // Lanes are sorted by momentum descending.
  for (const lane of ['H1', 'H2', 'H3']) {
    const ms = r.horizons[lane].map((c) => c.momentum);
    assert.deepEqual(ms, [...ms].sort((a, b) => b - a));
  }
  // Referenced anchors are returned with details.
  for (const a of r.anchors) assert.ok(REG_ANCHORS.some((x) => x.id === a.id));
});

test('foresightFor: free-text query resolves via matchTerms, falls back to the commodity classifier', () => {
  const q = foresightFor({ query: 'inverter' });
  assert.ok(q.matchedByTerms);
  assert.ok([...q.horizons.H1, ...q.horizons.H2, ...q.horizons.H3].some((c) => c.id === 'sic-mainstream'));

  // No matchTerm hit, but the classifier knows where a "wishbone" lives.
  const fb = foresightFor({ query: 'front lower wishbone' });
  assert.equal(fb.matchedByTerms, false);
  assert.equal(fb.commodity, 'Chassis');
  assert.ok(fb.count >= MIN_PER_COMMODITY);
});

test('foresightFor: an unresolvable query returns nothing, not the whole register', () => {
  const r = foresightFor({ query: 'zzz nonsense widget' });
  assert.equal(r.count, 0);
  assert.equal(r.matchedByTerms, false);
  // ...but an explicit commodity keeps its pool even if the free text misses.
  const withCommodity = foresightFor({ query: 'zzz nonsense widget', commodity: 'Battery' });
  assert.ok(withCommodity.count >= MIN_PER_COMMODITY);
});

test('foresightFor: term-matched queries rank by relevance before momentum', () => {
  // "48V MHEV battery" must lead each lane with the 48V-specific technologies,
  // not a high-momentum HV-pack tech that merely shares the word "battery".
  // (Lanes follow decision timing since the 2026 fix, so the 48V next-gen pack
  // at 5% adoption leads H2 while 48V-as-ICE-floor at 30% leads H1 — relevance
  // is asserted WITHIN a lane, which is how the report is read.)
  const r = foresightFor({ query: '48V MHEV battery' });
  assert.equal(r.horizons.H1[0].id, '48v-mhev-decontent', `H1 top was ${r.horizons.H1[0].id}`);
  assert.equal(r.horizons.H2[0].id, '48v-battery-nextgen', `H2 top was ${r.horizons.H2[0].id}`);
  // Lamination query leads with the lamination technology, not brake rotors.
  const lam = foresightFor({ query: 'stator and rotor lamination' });
  assert.equal(lam.horizons.H1[0].id, 'thin-gauge-lamination', `top hit was ${lam.horizons.H1[0].id}`);
  // Commodity-only queries (no term match) still rank purely by momentum.
  const c = foresightFor({ commodity: 'EDU' });
  const ms = c.horizons.H1.map((x) => x.momentum);
  assert.deepEqual(ms, [...ms].sort((a, b) => b - a));
});

test('foresightFor: deterministic — same inputs, same output', () => {
  const a = foresightFor({ query: 'battery pack', powertrain: 'BEV' });
  const b = foresightFor({ query: 'battery pack', powertrain: 'BEV' });
  assert.deepEqual(a, b);
});

// ── Forward research (foresight-research.mjs) ────────────────────────────────
// All DI'd: a fake search + fake LLM client, so these run offline with no key.

import { shouldResearch, buildResearchPlan, positionCandidates, researchFutureTechnologies } from '../foresight-research.mjs';

test('shouldResearch: fires exactly on the shapes users read as "not predicting"', () => {
  const rich = { count: 9, horizons: { H1: [1, 2, 3, 4, 5, 6], H2: [1, 2], H3: [1] } };
  assert.equal(shouldResearch(rich).research, false);
  // Thin coverage.
  assert.equal(shouldResearch({ count: 3, horizons: { H1: [1, 2, 3], H2: [], H3: [] } }).research, true);
  // Plenty of cards but nothing in a future lane.
  const noFuture = { count: 8, horizons: { H1: [1, 2, 3, 4, 5, 6, 7, 8], H2: [], H3: [] } };
  assert.equal(shouldResearch(noFuture).research, true);
  assert.equal(shouldResearch(noFuture).reason, 'no-future-lane');
  assert.equal(shouldResearch({ count: 0, horizons: { H1: [], H2: [], H3: [] } }).reason, 'no-register-match');
});

test('buildResearchPlan: queries target what is coming, not what exists', () => {
  const plan = buildResearchPlan('air suspension', { year: 2026 });
  assert.ok(plan.length >= 3);
  assert.ok(plan.every((q) => q.includes('air suspension')));
  const blob = plan.join(' ').toLowerCase();
  for (const forward of ['roadmap', 'emerging', 'prototype', 'future']) assert.ok(blob.includes(forward), `plan lacks forward term ${forward}`);
  assert.deepEqual(buildResearchPlan(''), []);
});

test('positionCandidates: same deterministic cores, inputs marked as estimates', () => {
  const [c] = positionCandidates([{
    name: 'Test tech', whatItIs: 'mechanism', replaces: 'incumbent', trlEstimate: 5,
    adoptionEstimatePct: 2, ceilingEstimatePct: 30, earliestProduction: 'none cited',
    players: ['A', 'B'], whyItMatters: 'cost', sourceUrl: 'https://x.example/1',
  }], { now: 2026 });
  assert.equal(c.researched, true);
  assert.equal(c.evidenceUnverified, true);
  assert.equal(c.projection.estimatedInputs, true);
  assert.match(c.projection.basis, /ESTIMATED/);
  assert.ok(['H1', 'H2', 'H3'].includes(c.horizon));
  assert.equal(c.phase, sCurvePhase(5, 2));
  // A TRL-5 candidate can never be sold as a near-term decision.
  assert.notEqual(c.horizon, 'H1');
  // Adoption claims are capped — an AI "already mainstream" claim is the least
  // trustworthy thing it can say.
  const [wild] = positionCandidates([{ name: 'x', trlEstimate: 99, adoptionEstimatePct: 95, ceilingEstimatePct: 200, players: [], sourceUrl: 'u' }]);
  assert.ok(wild.trl <= 9 && wild.adoptionPct <= 40);
});

test('researchFutureTechnologies: cite-or-drop is enforced in code, not the prompt', async () => {
  const performSearch = async () => [{ title: 'Real source', url: 'https://real.example/a', snippet: 'evidence', source: 'x' }];
  const searchPatents = async () => ({ patents: [] });
  const fakeJson = async () => ({
    candidates: [
      { name: 'Cited tech', whatItIs: 'w', replaces: 'r', trlEstimate: 4, adoptionEstimatePct: 0, ceilingEstimatePct: 20, earliestProduction: 'none cited', players: ['P'], whyItMatters: 'm', sourceUrl: 'https://real.example/a' },
      { name: 'Hallucinated tech', whatItIs: 'w', replaces: 'r', trlEstimate: 6, adoptionEstimatePct: 5, ceilingEstimatePct: 40, earliestProduction: 'x', players: ['P'], whyItMatters: 'm', sourceUrl: 'https://invented.example/z' },
    ],
    landscapeNote: 'note', evidenceGaps: 'gaps',
  });
  const out = await researchFutureTechnologies('air suspension', { performSearch, searchPatents, client: {}, messagesJson: fakeJson, model: 'm' });
  assert.equal(out.candidates.length, 1, 'uncited candidate survived');
  assert.equal(out.candidates[0].name, 'Cited tech');
  assert.equal(out.dropped, 1);
  assert.match(out.note, /NOT CURATED/);
});

test('researchFutureTechnologies: no evidence → nothing synthesised', async () => {
  let llmCalled = false;
  const out = await researchFutureTechnologies('obscure part', {
    performSearch: async () => [], searchPatents: async () => ({ patents: [] }),
    client: {}, messagesJson: async () => { llmCalled = true; return { candidates: [] }; }, model: 'm',
  });
  assert.equal(out.candidates.length, 0);
  assert.equal(llmCalled, false, 'called the LLM with no evidence to ground it');
  assert.match(out.note, /without sources would be invention/);
});
