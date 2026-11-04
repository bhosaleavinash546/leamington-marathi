/**
 * The UK / China live run of 15 parts (4 Nov 2026, 200,000 a year, 5 years, ex-works): what its reports printed wrong,
 * each pinned so it cannot come back. No cost moves — these are what a report PRINTS.
 *
 *  1. Equations that did not re-add at their printed figures — a China report converts every £ in the text, and the
 *     converter did not read "a × (b × m + c)", "1 in N × a" or "÷ (1 − p%)", while the £ text itself was built from
 *     rounded parts. The live run's two checks (station_eq.py and pdf_basis2.py — basis-check.py's check_text, here with
 *     brackets read as groups) are ported below and run over fresh UK and China costings of the 15 parts.
 *  2–3. Route comparison: casting and cast + machine rows that are the same costing — or not costed for the same reason —
 *     are one row, whatever their process field.
 *  4. Core report: "Not included until answered" is never drawn at a page foot without its list.
 *  5. Route specification: an answer a route does not ask prints its label, never the stored value.
 *  6. Uncosted features are counted by kind and size ("5 pockets"), not one entry a table row.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { compareRoutes, foldSameScopeRows, sameCosting, sameUncosted, type RouteRow } from '../server/services/route-compare.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { REGIONAL_DATA } from '../src/engine/regional-rates.js';
import { localiseGbpText, reportNoteText } from '../src/export/money-text.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { featureCountsText } from '../src/export/executive-summary.js';
import { BASELINE, ANSWERS } from '../scripts/real-parts-baseline.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import type { UniversalStackInput } from '../src/engine/types.js';

process.env.AIR_GAPPED = '1';
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const fixtures = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string };
}>;
/** The live run's 15 parts (scratchpad parts15-200k.json). */
const LIVE_PARTS = ['FORGE_Hub_Flange.stp', 'PRCR002.stp', 'IM_ECU_Cover.stp', 'Seat_Locking_Bracket.stp', 'AL_Battery_Rail.stp',
  'BM_Air_Duct.stp', 'ROTO_Header_Tank.stp', 'TF_Trim_Cover.stp', 'COMP_Hat_Stiffener.stp', 'EXT_Vent_Pipe.stp', 'RUB_Grommet.stp',
  'test-gear-m3-z38.step', 'MACH_Hydraulic_Manifold.stp', 'Casting_Braket.stp', 'steering_knuckle_RH.stp'];
const CN_FX = REGIONAL_DATA.CN.fxToGBP;

// ─── The live run's checks, ported ────────────────────────────────────────────────────────────────────────────────────

/** station_eq.py: the NDT / NDI station shapes, each re-done from its printed figures. */
const C = '[£¥]', N = String.raw`([\d,]+(?:\.\d+)?)`;
const STATION_SHAPES: Array<[string, RegExp]> = [
  ['station', new RegExp(String.raw`(\d+) s a part × \(inspector ${C}${N}/h × ([\d.]+) \+ (?:bench|cabinet) ${C}${N}/h\) = ${C}${N}`, 'g')],
  ['xray', new RegExp(String.raw`1 in (\d+) radiographed × ${C}${N} = ${C}${N}`, 'g')],
  ['perhr', new RegExp(String.raw`${C}${N}/h \(inspector ${C}${N}/h × ([\d.]+) \+ cell ${C}${N}/h\)`, 'g')],
];
const f2 = (s: string) => Number(s.replace(/,/g, ''));
const dpOf = (s: string) => (s.replace(/[^\d.]/g, '').split('.')[1] ?? '').length;
function stationFailures(text: string): { matched: number; bad: string[] } {
  let matched = 0;
  const bad: string[] = [];
  for (const [name, rx] of STATION_SHAPES) {
    rx.lastIndex = 0;
    for (let m = rx.exec(text); m; m = rx.exec(text)) {
      matched++;
      const g = m.slice(1);
      const [calc, printed, dp] = name === 'station' ? [Number(g[0]) / 3600 * (f2(g[1]) * f2(g[2]) + f2(g[3])), f2(g[4]), dpOf(g[4])]
        : name === 'xray' ? [f2(g[1]) / Number(g[0]), f2(g[2]), dpOf(g[2])]
          : [f2(g[1]) * f2(g[2]) + f2(g[3]), f2(g[0]), dpOf(g[0])];
      if (Math.abs(calc - printed) > 0.5 * 10 ** -dp + 1e-9) bad.push(`${name}: re-done ${calc.toFixed(4)}, printed ${printed} | ${m[0]}`);
    }
  }
  return { matched, bad };
}

/**
 * basis-check.py's check_text (pdf_basis2.py ran it over the PDFs), with brackets read as groups: "× (a × 1 + b)" and
 * "÷ (1 − 2% reject)" are operands, a bracket written straight after a number restates it ("5.546 h (layup 0.346 + …)"),
 * "1 in N" is 1 ÷ N, and "N s × (… £/h …)" may be read in hours. Everything else as the script reads it.
 */
const NUM = String.raw`[£$€₹¥]?-?\d[\d,]*(?:\.\d+)?%?`;
const LEX = new RegExp(String.raw`(\b1 in (\d[\d,]*))|(${NUM})|(\s[×x*÷/+−-]\s|[×÷+−])|(->|[;|:=→≈])|([()])`, 'g');
const val = (t: string) => { const pct = t.endsWith('%'); const v = Number(t.replace(/[£$€₹¥%,]/g, '')); return pct ? v / 100 : v; };
type Tok = { k: 'n'; v: number; sec: boolean; one: boolean } | { k: 'o'; o: string } | { k: '(' | ')' | 's' };
function lex(s: string): Tok[] {
  const out: Tok[] = [];
  LEX.lastIndex = 0;
  for (let m = LEX.exec(s); m; m = LEX.exec(s)) {
    if (m[1]) out.push({ k: 'n', v: 1 / val(m[2]), sec: false, one: true });
    else if (m[3]) out.push({ k: 'n', v: val(m[3]), sec: /^\s+s\b/.test(s.slice(m.index + m[3].length)), one: false });
    else if (m[4]) out.push({ k: 'o', o: ({ x: '*', '×': '*', '÷': '/', '−': '-' } as Record<string, string>)[m[4].trim()] ?? m[4].trim() });
    else if (m[5]) out.push({ k: 's' });
    else out.push({ k: m[6] as '(' | ')' });
  }
  return out;
}
function runBack(t: Tok[], end: number, hours: boolean): { expr: string; leaves: number } | null {
  const parts: string[] = [];
  let leaves = 0, k = end - 1, want: 'n' | 'o' = 'n', lastGroup = false;
  while (k >= 0) {
    const x = t[k];
    if (want === 'n') {
      if (x.k === 'n') { parts.push(String(x.v / (hours && x.sec ? 3600 : 1))); leaves++; k--; lastGroup = false; if (x.one) break; want = 'o'; continue; }
      if (x.k === ')') {
        let d = 0, j = k;
        for (; j >= 0; j--) { if (t[j].k === ')') d++; else if (t[j].k === '(' && --d === 0) break; }
        if (j < 0) break;
        const inner = runBack(t.slice(j + 1, k), k - j - 1, hours);
        if (!inner) break;
        parts.push(`(${inner.expr})`); leaves += inner.leaves; k = j - 1; want = 'o'; lastGroup = true; continue;
      }
      break;
    }
    if (x.k === 'o') { parts.push(x.o); k--; want = 'n'; lastGroup = false; continue; }
    if (x.k === 'n' && !x.one && lastGroup) { parts[parts.length - 1] = String(x.v / (hours && x.sec ? 3600 : 1)); k--; lastGroup = false; continue; }
    break;
  }
  if (parts.length && /^[-+*/]$/.test(parts[parts.length - 1])) parts.pop();
  return parts.length ? { expr: parts.reverse().join(' '), leaves } : null;
}
const evalExpr = (e: string): number | null => { try { const v = Function(`return (${e})`)() as number; return Number.isFinite(v) ? v : null; } catch { return null; } };
function failingEquations(text: string): string[] {
  const bad: string[] = [];
  const re = new RegExp(`(=|→|≈)\\s*(${NUM})`, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const t = lex(text.slice(0, m.index));
    const shown = m[2], want = val(shown);
    const tol = 0.5 * 10 ** -dpOf(shown.replace('%', '')) * (shown.endsWith('%') ? 0.01 : 1);
    const ok = (g: number | null) => g != null && (Math.abs(g - want) <= Math.max(tol * 1.0001, Math.abs(want) * 1e-6)
      || (m![1] === '→' && Math.abs(want - Math.ceil(g - 1e-9)) < 1e-9) || (m![1] === '≈' && Math.abs(g - want) <= Math.max(Math.abs(want) * 0.05, tol)));
    const r = runBack(t, t.length, false);
    if (!r || r.leaves < 2 || ok(evalExpr(r.expr))) continue;
    const h = runBack(t, t.length, true);
    if (h && ok(evalExpr(h.expr))) continue;
    bad.push(`${r.expr} = ${evalExpr(r.expr)?.toPrecision(8)}, printed ${shown}`);
  }
  return bad;
}

// ─── Fresh costings: the 15 parts, UK and China, 200k / 5 yr / EXW — the texts a report prints ────────────────────────

interface Text { part: string; where: string; gbp: string; amount?: number }
async function textsOf(region: 'UK' | 'CN'): Promise<Text[]> {
  const out: Text[] = [];
  for (const part of LIVE_PARTS) {
    const p = base.find(x => x.part === part)!;
    const spec = ANSWERS[part];
    const r = await costMeasuredPart(p.geometry, part,
      { partNumber: part, file: part, annualVolume: 200_000, ...(spec.commodity ? { commodity: spec.commodity } : {}) } as never,
      { ...spec.answers }, region, { annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' } as never, book,
      { partNumber: part, file: part, status: 'error' } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = r as any;
    for (const [k, v] of Object.entries(j.provenance ?? {}) as Array<[string, { basis?: string }]>) out.push({ part, where: k, gbp: String(v.basis ?? '') });
    for (const t of j.trace?.traceability ?? []) out.push({ part, where: `trace ${t.field}`, gbp: String(t.rateSource ?? '') });
    for (const a of j.assumed ?? []) out.push({ part, where: 'assumed', gbp: String(a) });
    for (const w of j.warnings ?? []) out.push({ part, where: `warning ${w.code}`, gbp: String(w.message ?? '') });
    for (const it of j.trace?.drivers?.tooling?.items ?? []) out.push({ part, where: 'tooling', gbp: String(it.label ?? ''), amount: it.gbp });
    for (const it of j.trace?.stackInput?.rawMaterial?.consumablesItems ?? []) out.push({ part, where: 'consumable', gbp: String(it.label ?? '') });
  }
  return out;
}
/** As a report prints it: the rate-book note cleaned, every £ in the report's currency. */
const printed = (t: Text, region: 'UK' | 'CN') => (region === 'UK' ? reportNoteText(t.gbp) : localiseGbpText(reportNoteText(t.gbp), CN_FX, '¥'));
/** The texts of the defects' families: NDT / NDI stations, composite tools, gear perishable tooling. */
const FAMILY = /^(cam-ndt|cast-ndt|forge-ndt|comp-ndi|comp-tools)$|^tooling$/;

describe('1. Every equation of the NDT / NDI / tools / gear-tooling family re-adds at its printed figures, UK and China', () => {
  let uk: Text[] = [], cn: Text[] = [];
  beforeAll(async () => { uk = await textsOf('UK'); cn = await textsOf('CN'); }, 300_000);
  it('station_eq.py: 0 failing in either country (and the shapes are there to check)', () => {
    for (const [region, list] of [['UK', uk], ['CN', cn]] as const) {
      let matched = 0;
      const bad: string[] = [];
      for (const t of list) { const r = stationFailures(printed(t, region)); matched += r.matched; bad.push(...r.bad.map(b => `${t.part} ${t.where}: ${b}`)); }
      expect(matched, region).toBeGreaterThanOrEqual(3);   // the stub axle's station + X-ray, the knuckle's MPI
      expect(bad, region).toEqual([]);
    }
  });
  it('pdf_basis2.py / basis-check.py: 0 failing equations in the family texts in either country', () => {
    for (const [region, list] of [['UK', uk], ['CN', cn]] as const) {
      const fam = list.filter(t => FAMILY.test(t.where));
      expect(fam.map(t => t.where), region).toEqual(expect.arrayContaining(['cam-ndt', 'forge-ndt', 'comp-ndi', 'comp-tools', 'tooling']));
      const bad = fam.flatMap(t => failingEquations(printed(t, region)).map(b => `${t.part} ${t.where}: ${b} | ${printed(t, region)}`));
      expect(bad, region).toEqual([]);
    }
  });
  it('converting to ¥ never breaks an equation the £ text holds — on every text of every part', () => {
    const broken = cn.flatMap(t => {
      const g = reportNoteText(t.gbp), y = printed(t, 'CN');
      return failingEquations(y).length > failingEquations(g).length ? [`${t.part} ${t.where}: ${failingEquations(y).join('; ')} | ${y}`] : [];
    });
    expect(broken).toEqual([]);
  });
  it('a gear tool-wear row re-adds to its own column: the label\'s division × the volume = the £ / ¥ printed beside it', () => {
    for (const [region, list, fx] of [['UK', uk, 1], ['CN', cn, CN_FX]] as const) {
      const rows = list.filter(t => t.part === 'test-gear-m3-z38.step' && t.where === 'tooling' && /× [\d,]+ parts$/.test(t.gbp));
      expect(rows.length, region).toBe(2);   // hob and grinding wheel
      for (const t of rows) {
        const text = printed(t, region);
        const tail = text.slice(Math.max(text.lastIndexOf(';'), text.lastIndexOf(':')) + 1);
        const toks = lex(tail);
        const r = runBack(toks, toks.length, false)!;
        // "£3560 ÷ 15,600 ÷ (1 − 2% reject) × 1,000,000 parts" = £232,862 — the column, to the whole unit
        expect(Math.abs(evalExpr(r.expr)! - t.amount! * fx), `${region} ${text}`).toBeLessThanOrEqual(0.5);
      }
    }
  });
  it('the UK station lines that already re-added are unchanged; the China ones print the costed rates', () => {
    const ukNdt = uk.find(t => t.part === 'PRCR002.stp' && t.where === 'cam-ndt')!;
    expect(ukNdt.gbp).toMatch(/75 s a part × \(inspector £28\.03\/h × 1 \+ bench £4\.00\/h\) = £0\.667 \+ 1 in 50 radiographed × £5\.00 = £0\.100 = £0\.7673/);
    const ukForge = uk.find(t => t.part === 'steering_knuckle_RH.stp' && t.where === 'forge-ndt')!;
    expect(ukForge.gbp).toMatch(/75 s a part × \(inspector £28\.03\/h × 1 \+ bench £4\.00\/h\) = £0\.67 a part/);
    // China: the bench is UK £4/h × the inspection factor 0.3369 = £1.3476 (¥11.97/h) — the live report printed ¥11.99
    // (£1.35 × 8.88), and "= ¥0.888" (£0.100 × 8.88) where the costing held ¥0.891
    const cnNdt = printed(cn.find(t => t.part === 'PRCR002.stp' && t.where === 'cam-ndt')!, 'CN');
    expect(cnNdt).toMatch(/bench ¥11\.966\d\/h\) = ¥0\.891 \+ 1 in 50 radiographed × ¥[\d.]+ = ¥0\.\d{3}/);
    expect(cnNdt).not.toMatch(/→/);
  });
  it('the hat stiffener: the tools a year from the hours used, the C-scan hours to the digits the line needs', () => {
    const tools = uk.find(t => t.part === 'COMP_Hat_Stiffener.stp' && t.where === 'comp-tools')!.gbp;
    expect(tools).toMatch(/200,000\/yr × 5\.546 h a tool is tied up \(layup 0\.346 \+ cure 4\.7 \+ turnaround 0\.5\) ÷ \(4000 h × 0\.8 OEE\) = 346\.63 → 347 tools/);
    const ndi = uk.find(t => t.part === 'COMP_Hat_Stiffener.stp' && t.where === 'comp-ndi')!.gbp;
    expect(ndi).toMatch(/= 0\.019907 h; inspector £28\.03\/h × 1 \+ cell £15\.00\/h = £43\.03\/h; 0\.019907 h × £43\.03\/h = £0\.8566/);
    expect(printed(cn.find(t => t.part === 'COMP_Hat_Stiffener.stp' && t.where === 'comp-ndi')!, 'CN'))
      .toMatch(/inspector ¥30\.8198\/h × 1 \+ cell ¥44\.8751\/h = ¥75\.6949\/h; 0\.019907 h × ¥75\.6949\/h = ¥1\.5069/);
  });
});

describe('1b. The converter reads brackets, "1 in N", seconds and "÷ (1 − p%)"', () => {
  it('a station line converted from rounded £ parts prints the arithmetic, not £ × fx', () => {
    const t = '75 s a part × (inspector £3.4707/h × 1 + bench £1.3476/h) = £0.100 + 1 in 50 radiographed × £1.68 = £0.034';
    const y = localiseGbpText(t, 8.88, '¥');
    expect(y).toBe('75 s a part × (inspector ¥30.8198/h × 1 + bench ¥11.9667/h) = ¥0.891 + 1 in 50 radiographed × ¥14.92 = ¥0.298');
    expect(stationFailures(y).bad).toEqual([]);
  });
  it('a £ text whose arithmetic does not hold is left to its owner — the converter never invents a figure', () => {
    expect(localiseGbpText('75 s a part × (inspector £3/h × 1 + bench £1/h) = £5.00', 8.88, '¥')).toBe('75 s a part × (inspector ¥26.64/h × 1 + bench ¥8.88/h) = ¥44.40');
  });
  it('a bracketed reject uplift is one operand', () => {
    expect(failingEquations('200,000/yr ÷ (1 − 3% reject) = 206,186 moulded')).toEqual([]);
    expect(failingEquations(localiseGbpText('£0.2282 ÷ (1 − 2% reject) × 1,000 = £232.86', 8.88, '¥'))).toEqual([]);
  });
});

// ─── 2–3. Route comparison folds ──────────────────────────────────────────────────────────────────────────────────────

const row = (route: string, process: string | null, total: number | null, over: Partial<RouteRow> = {}): RouteRow => ({
  route, process, label: process ? `${route.replace(/_/g, ' ')} — ${process} casting` : route.replace(/_/g, ' '), commodity: route,
  status: total == null ? 'needs_answer' : 'costed', total,
  toolingPerPart: total == null ? null : 0.1,
  breakdown: total == null ? null : { rawMaterial: total - 1, process: 0.5, labour: 0.5, tooling: 0, packaging: 0, logistics: 0, overhead: 0, margin: 0 },
  reconciles: total == null ? null : true, audit: null, spec: [], material: null,
  tooling: total == null ? null : { investment: 20_000, amortisedOver: 1_000_000, items: [] },
  operations: total == null ? null : [{ name: 'Sand Casting — Moulding', machine: 'sand line', cycleMin: 1, processCost: 0.5, labourCost: 0.5, bench: false }],
  band: null, consumables: [], credible: true, notCredible: [], checks: [], caveats: [], assumed: [], openQuestions: [], notes: [], refusal: null,
  byVolume: total == null ? [] : [{ volume: 200_000, total, p10: null, p90: null, note: null }], programme: null, ...over,
} as RouteRow);
const fixtureInput = (name: string, answers?: Record<string, string>) => {
  const p = fixtures.find(x => x.part === name)!;
  return { geo: p.geometry as never, filename: p.part, current: p.outcome.commodity ?? 'machining', answers: answers ?? { ...p.answers }, region: 'UK' as const,
    annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' as const, baseBook: book, ladder: false, bands: false };
};

describe('2. Casting and cast + machine rows that are the same costing are one row — with no process too', () => {
  it('two identical rows with process null fold into one "Casting + machining" row (sameCosting kept)', () => {
    const ref = row('forging', null, 12.52), cast = row('casting', null, 8.6877), cam = row('cast_and_machine', null, 8.6877);
    expect(sameCosting(cast, cam)).toBe(true);
    const out = foldSameScopeRows([ref, cast, cam], ref);
    expect(out).toEqual([ref, cam]);
    expect(cam.label).toBe('Casting + machining');
    expect(cam.alsoRoutes).toEqual(['casting']);
    // a penny apart: both kept
    expect(foldSameScopeRows([ref, row('casting', null, 8.6877), row('cast_and_machine', null, 8.6977)], ref)).toHaveLength(3);
    // a null-process casting row never folds into a cast + machine row that names a process
    expect(foldSameScopeRows([ref, row('casting', null, 8.6877), row('cast_and_machine', 'sand', 8.6877)], ref)).toHaveLength(3);
  });
  it('the hub flange as the live run costed it (no material family): one row (£9.39 since the review round), not two', async () => {
    const answers = { ...fixtures.find(x => x.part === 'FORGE_Hub_Flange.stp')!.answers };
    delete answers['material.family'];
    const cmp = await compareRoutes(fixtureInput('FORGE_Hub_Flange.stp', answers));
    const castLike = cmp.rows.filter(r => r.route === 'casting' || r.route === 'cast_and_machine');
    expect(castLike).toHaveLength(1);
    expect(castLike[0].process).toBeNull();
    expect(castLike[0].label).toBe('Casting + machining');
    expect(castLike[0].alsoRoutes).toEqual(['casting']);
    // Review round (4 Nov 2026): 8.6877 → 9.3923 — the foundry indirect lines, the impressions limits and the CNC lathe's
    // UK award capex (the spindle is turned)
    expect(castLike[0].total!).toBeCloseTo(9.3923, 3);
  }, 120_000);
});

describe('3. Identical "needs an answer" pairs print their reason once', () => {
  it('casting and cast + machine for the same process, open on the same question: one row; a different reason keeps both', () => {
    const ref = row('machining', null, 15.07);
    const q = { openQuestions: ['What tolerance class does the drawing call for?'], assumed: ['Does this part have to hold pressure? → Yes'] };
    const a = row('casting', 'sand', null, q), b = row('cast_and_machine', 'sand', null, q);
    expect(sameUncosted(a, b)).toBe(true);
    expect(foldSameScopeRows([ref, a, b], ref)).toEqual([ref, b]);
    expect(b.label).toBe('Sand casting + machining');
    const c = row('casting', 'gravity', null, q), d = row('cast_and_machine', 'gravity', null, { ...q, openQuestions: ['Which grade?'] });
    expect(foldSameScopeRows([ref, c, d], ref)).toHaveLength(3);
  });
  it('the manifold: each casting process\'s open question is printed once', async () => {
    const cmp = await compareRoutes(fixtureInput('MACH_Hydraulic_Manifold.stp'));
    const open = cmp.rows.filter(r => r.status === 'needs_answer' && (r.route === 'casting' || r.route === 'cast_and_machine'));
    expect(open.length).toBeGreaterThan(0);
    const keys = open.map(r => `${r.process}|${r.openQuestions.join(';')}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(open.map(r => r.label)).toEqual(expect.arrayContaining(['Sand casting + machining', 'Gravity die casting + machining']));
  }, 120_000);
});

// ─── 4. Core report: the "Not included" heading stays with its list ───────────────────────────────────────────────────

describe('4. "Not included until answered" never sits at a page foot without its list', () => {
  it('whatever page 1 holds, the heading\'s page carries list rows, and a list that runs on is followed by section 2 on that page', async () => {
    const { renderCoreReport } = await import('../src/export/core-report-pdf.js');
    const { buildCoreReport } = await import('../src/export/executive-summary.js');
    const lib = DEFAULT_RATE_LIBRARY;
    const inp = {
      partName: 'Knuckle (test)', rawMaterial: { materialId: 'mat-steel-38mnvs6', netWeightKg: 3.3, materialUtilization: 0.68 },
      operations: [{ operationName: 'Forging', machineId: 'mach-haas-vf2', labourId: 'lab-uk-skilled', cycleTimeHr: 0.01, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.01, labourEfficiency: 0.92 }],
      tooling: { totalToolingCost: 10_000, amortizationVolume: 1_000_000, mode: 'amortized' },
      packagingPerPart: 0.2, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW',
    } as unknown as UniversalStackInput;
    const result = computeUniversalStack(inp, lib);
    const base0 = buildCoreReport({ result, input: inp, library: lib, commodity: 'forging', region: 'UK', cadMeta: {} as never, baseLibrary: lib, regionalRows: [], fx: 1, sym: '£' } as never);
    const items = ['Freight to your plant — the price is ex-works (EXW)', 'Import duty, customs and cross-border shipping',
      'PPAP / initial samples and first-article inspection', 'Gauges and check fixtures / CMM programme', 'Grain-flow / macro-etch or ultrasonic testing, if specified',
      'Shot peening', 'Part marking / traceability', 'Rust protection or coating', 'Machining of features left as-forged'].map((s, k) => `Scope ${k + 1} ${s}`);
    const pageOps = (doc: jsPDF, p: number) => ((doc as unknown as { internal: { pages: string[][] } }).internal.pages[p] ?? []).join('\n');
    let headAlone = 0, ranOnWithoutSection2 = 0, ranOn = 0;
    for (let n = 0; n <= 70; n++) {
      const m = { ...base0, notIncluded: items, notModelled: [],
        alerts: [{ kind: 'scope', title: 'Padding to move the list down the page', lines: Array.from({ length: n }, (_, k) => `Padding line ${k + 1}`) }] } as typeof base0;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      renderCoreReport(doc, m, { money: g => `£${g.toFixed(2)}`, fx: 1, sym: '£', currency: 'GBP', dateStr: '04 Nov 2026' });
      const pages = doc.getNumberOfPages();
      let headPage = 0, lastItemPage = 0, alertPage = 0;
      for (let p = 1; p <= pages; p++) {
        const ops = pageOps(doc, p);
        if (/Not included until answered/.test(ops)) headPage = p;
        if (/Scope \d/.test(ops)) lastItemPage = p;
        if (!alertPage && /Padding to move/.test(ops)) alertPage = p;
      }
      if (!/Scope \d/.test(pageOps(doc, headPage))) headAlone++;
      // the list ran on past the page section 1's content reached: section 2 must follow it there
      if (headPage > alertPage || lastItemPage > headPage) {
        ranOn++;
        if (!/Cost build-up/.test(pageOps(doc, lastItemPage))) ranOnWithoutSection2++;
      }
    }
    expect(headAlone).toBe(0);
    expect(ranOn).toBeGreaterThan(0);              // the sweep did push the list over a page
    expect(ranOnWithoutSection2).toBe(0);
  });
});

// ─── 5. The route specification prints labels ─────────────────────────────────────────────────────────────────────────

describe('5. An answer a route does not ask prints its label, never the stored value', () => {
  it('casting bracket and hub flange: no "standard" / "no" / "steel" in any row\'s specification', async () => {
    for (const part of ['Casting_Braket.stp', 'FORGE_Hub_Flange.stp']) {
      const answers = { ...fixtures.find(x => x.part === part)!.answers };
      if (part === 'FORGE_Hub_Flange.stp') delete answers['material.family'];   // the live run's rubber / composites rows
      const cmp = await compareRoutes(fixtureInput(part, answers));
      const notAsked = cmp.rows.flatMap(r => r.spec.filter(s => s.source === 'not asked').map(s => ({ route: r.label, ...s })));
      expect(notAsked.length, part).toBeGreaterThan(0);
      for (const r of cmp.rows) {
        for (const s of r.spec) {
          expect(s.value, `${part} ${r.label} ${s.id}`).not.toBe(String(answers[s.id] ?? '\u0000'));
          expect(s.value, `${part} ${r.label} ${s.id}`).not.toMatch(/^(standard|no|yes|steel|aluminium)$/);
        }
      }
    }
  }, 180_000);
});

// ─── 6. Features counted by kind and size ─────────────────────────────────────────────────────────────────────────────

describe('6. Uncosted features are counted, not listed one table row each', () => {
  it('"5 pockets", holes grouped by diameter', () => {
    const pocket = { kind: 'pocket', count: 1, diaMm: 0 };
    expect(featureCountsText([pocket, pocket, pocket, pocket, pocket])).toBe('5 pockets');
    expect(featureCountsText([{ kind: 'hole', count: 2, diaMm: 10 }, { kind: 'hole', count: 2, diaMm: 10 }, { kind: 'hole', count: 1, diaMm: 12.5 },
      { kind: 'boss', count: 1, diaMm: 20 }, { kind: 'boss', count: 2, diaMm: 20 }, { kind: 'slot', count: 1, diaMm: 0 }]))
      .toBe('4 holes Ø10.0, 1 hole Ø12.5, 3 bosses Ø20.0, 1 slot');
  });
  it('the core report\'s uncosted-scope alert prints the counts', async () => {
    const { buildCoreReport } = await import('../src/export/executive-summary.js');
    const lib = DEFAULT_RATE_LIBRARY;
    const inp = {
      partName: 'Knuckle (test)', rawMaterial: { materialId: 'mat-steel-38mnvs6', netWeightKg: 3.3, materialUtilization: 0.68 },
      operations: [{ operationName: 'Finish boring — 4 cored bore(s)', machineId: 'mach-haas-vf2', labourId: 'lab-uk-skilled', cycleTimeHr: 0.01, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.01, labourEfficiency: 0.92 }],
      tooling: { totalToolingCost: 10_000, amortizationVolume: 1_000_000, mode: 'amortized' },
      packagingPerPart: 0.2, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW',
    } as unknown as UniversalStackInput;
    const result = computeUniversalStack(inp, lib);
    const pocket = { kind: 'pocket', diaMm: 0, depthMm: 5, areaMm2: 200, through: false, count: 1, operation: 'Milling', minutesEach: 0.83, totalMinutes: 0.83, volumeCm3: 1, included: false, autoIncluded: false };
    const m = buildCoreReport({ result, input: inp, library: lib, commodity: 'forging', region: 'UK', baseLibrary: lib, regionalRows: [], fx: 1, sym: '£',
      cadMeta: { featureLinesInCost: true, featureMachineRatePerHr: 10.87, featureMachineOee: 0.8, featureLines: [pocket, pocket, pocket, pocket, pocket] } } as never);
    const scope = m.alerts.find(a => /Uncosted scope/.test(a.title));
    expect(scope).toBeTruthy();
    expect(scope!.lines.join(' ')).toMatch(/Features: 5 pockets\./);
    expect(scope!.lines.join(' ')).not.toMatch(/1× pocket/);
  });
});
