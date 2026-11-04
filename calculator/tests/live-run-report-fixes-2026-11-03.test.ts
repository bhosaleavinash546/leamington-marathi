/**
 * The UK / China live run of 15 parts (3 Nov 2026): the defects its reports showed, each pinned here so it cannot come
 * back. No cost moves — these are what a report PRINTS (and the route comparison's precision).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { compareRoutes } from '../server/services/route-compare.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { LAMINATE_SYSTEMS } from '../src/engine/cost-input-rules/derive/laminate.js';
import { sourceName, sourcesLine, CUTTING_SOURCES } from '../src/engine/cutting-catalogue.js';
import { PALLET_CHANGE_SOURCE } from '../src/engine/routing-optimiser.js';
import { localiseGbpText, reportNoteText, directMaterialBasis } from '../src/export/money-text.js';
import { clipAtClause } from '../src/export/pdf.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { analyseGeometricDFM } from '../src/engine/dfm-geometry/index.js';
import { materialSplit } from '../src/export/executive-summary.js';
import { materialTraceEvidence } from '../e2e/trace-checks.js';
import type { UniversalStackInput } from '../src/engine/types.js';

process.env.AIR_GAPPED = '1';
const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string };
}>;
const part = (name: string) => parts.find(p => p.part === name)!;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const input = (name: string) => {
  const p = part(name);
  return { geo: p.geometry as never, filename: p.part, current: p.outcome.commodity ?? 'machining', answers: { ...p.answers }, region: 'UK' as const,
    annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' as const, baseBook: book, ladder: false, bands: false };
};

// ─── basis-check.py's check_text, ported: every "<numbers and operators> = <number>" must hold at the printed precision ──
const NUM = String.raw`[£$€₹¥]?-?\d[\d,]*(?:\.\d+)?%?`;
const TOK = new RegExp(`(${NUM})|(\\s[×x*÷/+−-]\\s|[×÷+−])`, 'g');
const val = (t: string) => { const pct = t.endsWith('%'); const v = Number(t.replace(/[£$€₹¥%,]/g, '')); return pct ? v / 100 : v; };
const dec = (t: string) => (t.replace(/[£$€₹¥%,]/g, '').split('.')[1] ?? '').length;
function evaluate(left: string): number | null {
  const toks: Array<[string, string]> = [];
  TOK.lastIndex = 0;
  for (let m = TOK.exec(left); m; m = TOK.exec(left)) toks.push(m[1] ? ['n', m[1]] : ['o', m[2].trim()]);
  const seq: Array<[string, string]> = [];
  for (let k = toks.length - 1; k >= 0; k--) {
    const t = toks[k];
    if (!seq.length) { if (t[0] === 'n') seq.push(t); continue; }
    if (seq[seq.length - 1][0] !== t[0]) seq.push(t); else break;
  }
  seq.reverse();
  if (seq.length && seq[0][0] === 'o') seq.shift();
  if (seq.length < 3) return null;
  const expr = seq.map(([k, x]) => (k === 'n' ? String(val(x)) : ({ x: '*', '×': '*', '÷': '/', '−': '-' } as Record<string, string>)[x] ?? x)).join('');
  try { return Function(`return (${expr})`)() as number; } catch { return null; }
}
function failingEquations(text: string): string[] {
  const bad: string[] = [];
  const re = new RegExp(`(=|→|≈)\\s*(${NUM})`, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let start = Math.max(...[';', '|', ':', '('].map(c => text.lastIndexOf(c, m!.index - 1)));
    start = Math.max(start, text.lastIndexOf('=', m.index - 1), text.lastIndexOf('→', m.index - 1)) + 1;
    const got = evaluate(text.slice(start, m.index));
    if (got == null) continue;
    const shown = m[2], want = val(shown);
    const tol = 0.5 * 10 ** -dec(shown) * (shown.endsWith('%') ? 0.01 : 1);
    let ok = Math.abs(got - want) <= Math.max(tol * 1.0001, Math.abs(want) * 1e-6);
    if (!ok && m[1] === '→' && Math.abs(want - Math.ceil(got - 1e-9)) < 1e-9) ok = true;
    if (!ok) bad.push(`${text.slice(start, m.index + m[0].length).trim()} (re-adds to ${got.toPrecision(8)})`);
  }
  return bad;
}

describe('1. The route comparison carries the costing\'s own figure — rounded once, at display', () => {
  it('the reference row total and buckets are the headline costing\'s, unrounded', async () => {
    const i = input('RUB_Grommet.stp');
    const cmp = await compareRoutes(i, [i.current]);
    const ref = cmp.rows[0];
    const head = await costMeasuredPart(i.geo, i.filename, { partNumber: i.filename, file: i.filename, commodity: i.current, annualVolume: i.annualVolume },
      { ...i.answers }, 'UK', { annualVolume: i.annualVolume, programmeYears: 5, deliveryTerms: 'EXW', acknowledge: [] }, book,
      { partNumber: i.filename, file: i.filename, status: 'error' } as never);
    // the screen's headline is the stack's unrounded total; a row read off the executor's 4-dp copy (62.044959 → 62.045)
    // displayed £62.05 beside a £62.04 headline
    const stack = (head.trace as unknown as { result: { total: number; breakdown: Record<string, number> } }).result;
    expect(ref.total).toBe(stack.total);
    expect(ref.total).not.toBe(Math.round(stack.total * 1e4) / 1e4);   // this part's total has more than 4 dp
    expect(ref.toolingPerPart).toBe(stack.breakdown.tooling);
    for (const k of Object.keys(head.breakdown!)) expect(ref.breakdown![k], k).toBe(stack.breakdown[k]);
    expect(ref.byVolume.find(v => v.volume === i.annualVolume)?.total ?? ref.total).toBe(stack.total);
    expect(ref.reconciles).toBe(true);
    expect(ref.audit!.closes).toBe(true);
  });
  it('a 4-dp round before the 2-dp display moves the penny — the case the live run printed', () => {
    const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
    expect(r4(62.044959).toFixed(2)).not.toBe((62.044959).toFixed(2));
  });
});

describe('2. The specification prints each answer as its question names it', () => {
  it('the laminate prints its option label, not "prepreg-cf"', async () => {
    const i = input('COMP_Hat_Stiffener.stp');
    const cmp = await compareRoutes(i, [i.current]);
    const lam = cmp.rows[0].spec.find(s => s.id === 'material.laminate')!;
    expect(lam.value).toBe(LAMINATE_SYSTEMS.find(l => l.value === 'prepreg-cf')!.label);
    expect(lam.value).not.toMatch(/prepreg-cf/);
  });
  it('a family / service answer prints its option label too (generic, not just the laminate)', async () => {
    const i = input('steering_knuckle_RH.stp');
    const cmp = await compareRoutes(i, [i.current]);
    const spec = cmp.rows[0].spec;
    for (const s of spec) expect(s.value, s.id).not.toMatch(/^(steel|yes|no|standard)$/);
  });
});

describe('3. No research-file reference in printed text', () => {
  it('a cutting-data source prints the maker and catalogue; the row ids stay in the code', () => {
    expect(sourceName('SANDVIK-TURN')).toBe('Sandvik Coromant Small Part Machining catalogue, turning cutting data (2002–04)');
    expect(CUTTING_SOURCES['SANDVIK-TURN'].rows).toBe('#47–53');
    for (const fam of ['steel', 'aluminium', 'cast iron'] as const) {
      expect(sourcesLine(fam, ['face', 'rough', 'side', 'drill', 'bore', 'tap', 'turn'])).not.toMatch(/data\.json|#\d/);
    }
    expect(PALLET_CHANGE_SOURCE).not.toMatch(/data\.json|#\d/);
    expect(PALLET_CHANGE_SOURCE).toMatch(/Okuma MA-4000H brochure/);
  });
});

describe('4. "as above" names the grade or machine', () => {
  it('a library id inside the prose is printed by its name', () => {
    expect(reportNoteText('as above (mat-gs-c25)')).not.toMatch(/mat-gs-c25/);
    expect(reportNoteText('as above (mach-hmc-400)')).toMatch(/^as above \(Horizontal machining centre/);
    const pdf = readFileSync('src/export/pdf.ts', 'utf8');
    expect(pdf).toMatch(/`as above \(\$\{reportNoteText\(role\) \|\| 'same source'\}\)`/);
  });
});

describe('5. What the reader needs, not the code\'s internals', () => {
  const comp = {
    partName: 'Hat stiffener (test)',
    rawMaterial: { materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1, directCost: 12.6,
      lines: [{ ref: 'Prepreg', description: 'carbon prepreg', qty: 1, unitCost: 11 }, { ref: 'NDI', description: 'ultrasonic', qty: 1, unitCost: 1.6 }] },
    operations: [], tooling: { totalToolingCost: 0, amortizationVolume: 1 }, packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08,
  } as unknown as UniversalStackInput;
  it('the direct-cost material says it is the sum of its lines, named', () => {
    const lib = { ...DEFAULT_RATE_LIBRARY, materials: [...DEFAULT_RATE_LIBRARY.materials, { ...DEFAULT_RATE_LIBRARY.materials[0], id: 'mat-virtual' }] };
    const res = computeUniversalStack(comp, lib);
    const t = res.traceability.find(x => x.field === 'rawMaterial.directCost')!;
    expect(t.rateSource).toBe('Direct cost: the sum of the material lines (Prepreg + NDI), not weight × price per kg');
    expect(directMaterialBasis(comp.rawMaterial.lines)).toBe('the sum of the material lines (Prepreg + NDI), not weight × price per kg');
    const split = materialSplit(res, comp, lib);
    expect(split.lines[0].label).toBe('Material: Prepreg + NDI build-up (see the material lines)');
    for (const s of [t.rateSource, split.lines[0].label]) expect(s).not.toMatch(/commodity module|Pre-computed/);
  });
  it('a process with no geometric DFM says the checks are not available, not "no rule pack"', () => {
    const r = analyseGeometricDFM({ commodity: 'rubber', featureSet: { available: false, features: [] } } as never);
    expect(r.limitations[0]).toMatch(/^Geometric DFM checks are not available for rubber/);
    expect(r.limitations.join(' ')).not.toMatch(/rule pack/);
  });
});

describe('6. A §12 note is stopped at a clause, never inside a number or with an ellipsis', () => {
  it('the live notes', () => {
    const notes = [
      'Held capital: depreciation of the UK build-up over 1,773.4 productive hours a year at the book rate, per running hour ÷ 1773.4 productive hours',
      'capital AT PAR — no China capex was sourced for this machine, so its capital is the book\'s own (×1, the same traded machine at its market price)',
    ];
    for (const n of notes) {
      const out = clipAtClause(n, 140);
      expect(out).not.toMatch(/…/);
      expect(n.startsWith(out)).toBe(true);
      // the cut is at a clause boundary: what follows starts a new clause
      if (out.length < n.length) expect(n.slice(out.length)).toMatch(/^(; | — | – |, )/);
      // a number is never cut: no digit on both sides of the cut
      expect(/\d$/.test(out) && /^[\d.,]/.test(n.slice(out.length))).toBe(false);
    }
    expect(clipAtClause(notes[0], 140)).toBe('Held capital: depreciation of the UK build-up over 1,773.4 productive hours a year at the book rate');
  });
  it('the PDF prints words, not "..." or "(the derivation is in §6)"', () => {
    const pdf = readFileSync('src/export/pdf.ts', 'utf8');
    expect(pdf).not.toMatch(/\.\.\. \(\$\{gr\.faceIds\.length\} total\)/);
    expect(pdf).toMatch(/more faces — full list in the workbook's 9-DFM sheet/);
    expect(pdf).toMatch(/clipAtClause\(reportNoteText[^\n]*\(derivation in §6\)/);
  });
});

describe('7. A converted equation re-adds at the figures it prints', () => {
  const CN = 8.88;
  // the China costings' own £ text (headless dump at HEAD e0d77d38, CN 200k / 5 yr EXW), as the live reports converted it
  const LIVE = [
    'Die: porthole (spider) hollow die: UK £2,200 + £34/mm × 161.6 mm circle = £7,694.40; £7,694.40 × 1.3 multi-void × China die factor 0.4733 = £4,734.29 → £4,734 a die',
    'pipe die + calibration at 32 mm, simple — die: £4,000 + 32 mm × £22 = £4,704; £4,704 × 0.75 simple = £3,528.00; calibration: £3,000 + 32 mm × £30 = £3,960; set: £3,528.00 + £3,960 = £7,488.00 UK; £7,488.00 × China toolroom 0.3416 = £2,557.90 → £2,558 — parametric die-maker figures, engineering-typical, not sourced',
    '32-cavity transfer mould tool in p20, simple — base: UK £6,000 × 1 steel × China toolroom 0.3416 = £2,050; a cavity: £900 + 5.70 cm² × £35 = £1,099.50 UK; £1,099.50 × 1 steel × 0.8 simple × China toolroom 0.3416 = £300.47 a cavity; 32 cavities: £300.47 × 32^0.9 gives £6,799;',
    'Hob wear: £1,400 tool + 12 regrinds × £62.514 = £2,150 over',
    'nitrided every 40 t at UK £180 × China heat-treat 0.4704 = £84.67',
    'cnc-al tool, simple: UK £6,000 base + 382.4 cm² × £18.00/cm² × 0.75 simple + 2 vents × £250 + £500 insulation = £12,162.40; £12,162.40 × China toolroom 0.3416 = £4,154.68 → £4,155 a mould — build rates engineering-typical, not sourced',
    'vacuum holes: 600.2 cm² × £0.25 × 4 = £600; tool: £22,693.36 + £600 = £23,293.36 UK; £23,293.36 × China toolroom 0.3416 = £7,957.01 → £7,957;',
    'cost-ranked 4 cavitation(s) at 200,000/yr: 4-up £0.0134/part (50T Injection Moulding Machine £1.57/hr, 12.5 s shot, production tool £8,778 × 1.15 with maintenance ÷ 1,000,000 parts → £0.0101/part NRE) vs 2-up £0.0148/part (50T Injection Moulding Machine £1.57/hr, 12.5 s shot, production tool £7,117 × 1.15 with maintenance ÷ 1,000,000 parts → £0.0082/part NRE)',
    'floor (raised to the content) — corrected 30 Oct 2026 on a page re-check (businessanalytiq Europe September 2026 is US$1.57/kg on the page × 0.7394 = £1.161/kg). Source: https://polymerupdate.com/News/Details/1485733',
  ];
  it('every equation that holds in £ holds in ¥ at its printed figures', () => {
    for (const t of LIVE) {
      expect(failingEquations(t), t).toEqual([]);
      expect(failingEquations(localiseGbpText(t, CN, '¥')), t).toEqual([]);
    }
  });
  it('the inputs carry the decimals the arithmetic needs; a rounded £ result prints the arithmetic', () => {
    expect(localiseGbpText(LIVE[0], CN, '¥')).toBe('Die: porthole (spider) hollow die: UK ¥19,536 + ¥301.92/mm × 161.6 mm circle = ¥68,326.27; '
      + '¥68,326.27 × 1.3 multi-void × China die factor 0.4733 = ¥42,040.50 → ¥42,037.92 a die');
    // The £ result is a display rounding (£2,150.168 printed £2,150): the arithmetic on the printed ¥ inputs rounds to the
    // same £ figure, so it IS the costed figure at that precision — no "→ ¥19,092" after it (that was £2,150 × 8.88, not
    // what was costed; 4 Nov 2026 live run).
    expect(localiseGbpText(LIVE[3], CN, '¥')).toBe('Hob wear: ¥12,432 tool + 12 regrinds × ¥555.124 = ¥19,093 over');
    expect(localiseGbpText(LIVE[4], CN, '¥')).toBe('nitrided every 40 t at UK ¥1,598.40 × China heat-treat 0.4704 = ¥751.89');
    expect(localiseGbpText(LIVE[2], CN, '¥')).toMatch(/^32-cavity transfer mould tool in p20, simple — base: UK ¥53,280 × 1 steel × China toolroom 0\.3416 = ¥18,200;/);
    // a stated conversion INTO £ stays in GBP, the report currency beside it
    expect(localiseGbpText(LIVE[8], CN, '¥')).toMatch(/× 0\.7394 = GBP 1\.161\/kg \(¥10\.310\/kg\)\)\. Source/);
    // an arithmetic "→ £x" result is the arithmetic on the printed inputs: ¥77,948.64 × 1.15 ÷ 1,000,000 = ¥0.0896
    expect(localiseGbpText(LIVE[7], CN, '¥')).toMatch(/production tool ¥77,948\.64 × 1\.15 with maintenance ÷ 1,000,000 parts → ¥0\.0896\/part NRE/);
  });
  it('a rounding arrow never reads as rounding the wrong way', () => {
    for (const t of LIVE) {
      const out = localiseGbpText(t, CN, '¥');
      for (const m of out.matchAll(/¥([\d,]+\.\d+) → ¥([\d,]+(?:\.\d+)?)/g)) {
        const a = Number(m[1].replace(/,/g, '')), b = Number(m[2].replace(/,/g, ''));
        const dpB = (m[2].split('.')[1] ?? '').length;
        // either B is A rounded at B's precision, or B is printed exact (to the penny / fen)
        expect(Math.abs(a - b) <= 0.5 * 10 ** -dpB + 1e-9 || dpB >= 2, `${m[0]} in ${out}`).toBe(true);
      }
    }
    expect(localiseGbpText(LIVE[5], CN, '¥')).toMatch(/= ¥36,893\.52 → ¥36,896\.40 a mould/);
  });
  it('a £ report is unchanged; converting twice changes nothing', () => {
    for (const t of LIVE) {
      expect(localiseGbpText(t, 1, '£')).toBe(t);
      const once = localiseGbpText(t, CN, '¥');
      expect(localiseGbpText(once, CN, '¥')).toBe(once);
    }
  });
  it('other currencies hold too', () => {
    for (const [fx, sym] of [[1.1965, '€'], [5.096, 'zł'], [127.2, '₹'], [437.75, 'Ft']] as const) {
      for (const t of LIVE) expect(failingEquations(localiseGbpText(t, fx, sym).replace(/zł|Ft/g, '')), `${sym} ${t}`).toEqual([]);
    }
  });
});

describe('8. "Not in the cost model" never takes a page of its own in the core report', () => {
  it('rendered with the page-1 list growing, the block is on page 1 or under section 2', async () => {
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
    const base = buildCoreReport({ result, input: inp, library: lib, commodity: 'forging', region: 'UK', cadMeta: {} as never, baseLibrary: lib, regionalRows: [], fx: 1, sym: '£' } as never);
    let pagesOfItsOwn = 0;
    for (let n = 0; n <= 60; n++) {
      const m = { ...base, notIncluded: [...base.notIncluded, ...Array.from({ length: n }, (_, k) => `Scope item ${k + 1} of the test list`)],
        notModelled: ['Billet shear / saw and the induction heater: their machine time and capital are not in the rate book, so not in this price — a supplier will charge them (a gap in the cost model, not an item you can exclude; ask for them on the quotation).'] };
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      renderCoreReport(doc, m, { money: g => `£${g.toFixed(2)}`, fx: 1, sym: '£', currency: 'GBP', dateStr: '03 Nov 2026' });
      const pages = (doc as unknown as { internal: { pages: unknown[] } }).internal.pages.length - 1;
      // the page the block is drawn on holds something else of section 1 or section 2 — never the block alone
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        const ops = ((doc as unknown as { internal: { pages: string[][] } }).internal.pages[p] ?? []).join('\n');
        if (/Not in the cost model/.test(ops) && !/Not included until answered|Cost build-up|Scope item/.test(ops)) pagesOfItsOwn++;
      }
    }
    expect(pagesOfItsOwn).toBe(0);
  });
});

describe('9. A rate note prints the true quotient before its rounding', () => {
  it('US$245,000 / 1.3344 = £183,603, rounded to £185,000', () => {
    const hmc = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'mach-hmc-400')!;
    expect(hmc.sourceNote).toMatch(/US\$245,000 \/ 1\.3344 = £183,603, rounded to £185,000/);
    expect(Math.round(245_000 / 1.3344)).toBe(183_603);
    expect(failingEquations(reportNoteText(hmc.sourceNote))).toEqual([]);
  });
});

describe('10. The harness says a build-up material has no gross kg', () => {
  it('no "NaN kg × NaN/kg"', () => {
    const t = materialTraceEvidence({ gross: NaN, price: NaN, scrap: NaN, energy: 0, matCalc: 112.287, material: 112.287 });
    expect(t).toBe('n/a — material is a build-up (no gross kg × price a kg): 112.2870 v 112.2870');
    expect(t).not.toMatch(/NaN/);
    expect(materialTraceEvidence({ gross: 4.918, price: 0.4905, scrap: -0.14, energy: 0.12, matCalc: 2.39, material: 2.39 })).toBe('4.918 kg × 0.4905/kg + -0.14 + 0.12 = 2.3900 v 2.3900');
  });
});
