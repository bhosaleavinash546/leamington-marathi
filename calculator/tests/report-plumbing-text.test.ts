/**
 * No internal plumbing in report text (President / Cost Engineering Director review, Nov 2026). The route comparison
 * (PDF §9b, Excel 8-Routes) printed "(src/engine/material-scope.ts, COMMODITY_FAMILIES)" and "server/utils/cad-sanity.ts"
 * as the Source of a check ~250 times; rule notes printed "imm-400t", "press-400t", "mat-dc04"; rate notes printed the
 * research bookkeeping ("CORRECTED … ferrous.anchor.crc 3.239 → 3.195", "Earlier note: …", "(machine added …)",
 * "(imm-domestic: imm-200t …"); the China gear report printed "buy 0.4272 GBP/kg" beside ¥ figures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  screenRoutes, materialFamilyOf, COMPARABLE_ROUTES, CASTING_PROCESS_LADDER_SOURCE, FORGING_PROCESS_LADDER_SOURCE,
} from '../src/engine/route-feasibility.js';
import { castingProcessRefusal } from '../src/engine/modules/casting-advisor.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { COUNTRY_BOOKS } from '../src/engine/country-books.js';
import { reportNoteText, localiseGbpText } from '../src/export/money-text.js';
import { optimiseCavitation } from '../src/engine/cavitation-optimiser.js';
import { mouldManning, pressName } from '../src/engine/cost-input-rules/commodities/injection-moulding.js';
import { computeHeatTreatRate } from '../src/engine/gear-heat-treat-rate.js';
import { ACCESS_SOURCE } from '../src/engine/dfm-geometry/commodities/machining-access.js';

/** A file, a code path or a CONSTANT_NAME in reader-facing text. */
const PLUMBING = /\.(ts|js)\b|[A-Z]{3,}_[A-Z_]+|src\/|server\//;

const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string };
}>;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);

describe('M1 — a feasibility source is the reader-facing source, never a file or a constant', () => {
  it('no source or caveat on any route of any real part names a file, a path or a constant', () => {
    let seen = 0;
    for (const p of parts) {
      const fam = materialFamilyOf(p.answers, book).family;
      // every route as the costing's own too, so its failing checks become caveats and are read
      for (const current of [p.outcome.commodity ?? 'machining', ...COMPARABLE_ROUTES]) {
        for (const s of screenRoutes(current, { geo: p.geometry as never, filename: p.part, family: fam, annualVolume: 100_000 })) {
          for (const c of s.checks) {
            seen++;
            expect(c.source, `${p.part} ${s.route} ${c.id}`).not.toMatch(PLUMBING);
            expect(c.measured, `${p.part} ${s.route} ${c.id}`).not.toMatch(PLUMBING);
            expect(c.limit, `${p.part} ${s.route} ${c.id}`).not.toMatch(PLUMBING);
          }
          for (const cv of s.caveats) expect(cv, `${p.part} ${s.route}`).not.toMatch(PLUMBING);
        }
      }
    }
    expect(seen).toBeGreaterThan(500);
  }, 120_000);
  it('the casting and forging process ladders state their limits in words', () => {
    for (const t of [CASTING_PROCESS_LADDER_SOURCE, FORGING_PROCESS_LADDER_SOURCE]) expect(t).not.toMatch(PLUMBING);
    expect(CASTING_PROCESS_LADDER_SOURCE).toMatch(/6 mm/);
    expect(FORGING_PROCESS_LADDER_SOURCE).toMatch(/Ø50 mm slug/);
    expect(castingProcessRefusal('hpdc', 'aluminium', 9)).not.toMatch(PLUMBING);
    expect(castingProcessRefusal('hpdc', 'aluminium', 9)).toMatch(/CostVision engineering rule/);
  });
  it('the moulding tool basis names no source file', () => {
    expect(readFileSync('src/engine/cost-input-rules/commodities/injection-moulding.ts', 'utf8')).not.toContain('toolmaking.ts)');
  });
});

describe('M2 — rule notes and the cavitation detail print the machine class and the grade name', () => {
  it('cavitation alternatives name the press by its class', () => {
    const r = optimiseCavitation({ areaPerCavityCm2: 46, cavityPressureMPa: 30, shotSeconds: 25.25, sideActionsLifters: 0, annualVolume: 200_000 });
    for (const c of r.alternatives) {
      expect(c.detail).not.toMatch(/\bimm-\d/);
      expect(c.detail).toMatch(/Injection Moulding Machine/);
    }
    expect(r.basis).not.toMatch(/\bimm-\d/);
  });
  it('the moulding crew, eject, change and purge notes name the press', () => {
    expect(pressName('imm-400t')).toBe('400T Injection Moulding Machine');
    expect(mouldManning('imm-400t').basis).toMatch(/^400T Injection Moulding Machine:/);
    expect(mouldManning('imm-1200t').basis).not.toMatch(/imm-/);
    const src = readFileSync('src/engine/cost-input-rules/commodities/injection-moulding.ts', 'utf8');
    expect(src).not.toMatch(/`[^`]*\$\{r\.advice\.pressId\}[^`]*`/);
    expect(src).not.toContain('was a flat 2 s');
    const sm = readFileSync('src/engine/cost-input-rules/commodities/sheet-metal.ts', 'utf8');
    expect(sm).not.toMatch(/\$\{(plan\.)?pressId\}/);
    expect(sm).not.toMatch(/→ \$\{id \?\? mat\.family\}/);
    const cast = readFileSync('src/engine/cost-input-rules/commodities/casting.ts', 'utf8');
    expect(cast).not.toMatch(/→ \$\{g\.id\}|`\$\{mat\.gradeId\}:/);
  });
});

describe('M2 / M4 — a rate-book note as a report prints it', () => {
  it('any library machine id is named, whatever its prefix', () => {
    const p = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'press-400t')!;
    const t = reportNoteText(p.sourceNote);
    expect(t).toContain('new servo transfer line: use Schuler 400T Stamping Press');
    expect(reportNoteText('mould change on a imm-400t, then rotomould-biaxial')).toBe(
      'mould change on a 400T Injection Moulding Machine, then '
      + DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'rotomould-biaxial')!.machineClass);
    // a longer id is not read as a shorter one plus a suffix
    expect(reportNoteText('imm-200t-cn')).toBe('Injection Moulding 200T (China)');
    // an ordinary hyphenated word is left alone
    expect(reportNoteText('a hot-runner tool on a die-cast part')).toBe('a hot-runner tool on a die-cast part');
  });
  it('a country book\'s machine-group key is dropped and its reference machine named', () => {
    expect(reportNoteText('China book 2026-10-10: capex ¥389,091 (imm-domestic: imm-200t ¥214,000 × book size 1.818 — local quote)'))
      .toBe('China book 2026-10-10: capex ¥389,091 (200T Injection Moulding Machine ¥214,000 × book size 1.818 — local quote)');
    const vmc = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'mach-vmc3')!.machineClass;
    expect(reportNoteText('capex ¥146,532 (cnc-vmc-domestic: mach-vmc3 ¥287,817 × book size 0.509 — Haas)'))
      .toBe(`capex ¥146,532 (${vmc} ¥287,817 × book size 0.509 — Haas)`);
    // a bracket that is not a group key is kept
    expect(reportNoteText('(two-shift: 16 h a day)')).toBe('(two-shift: 16 h a day)');
  });
  it('a page re-check keeps the fact and its reason, not the research key and the old → new figures', () => {
    expect(reportNoteText('the anchor grade itself — CORRECTED 30 Oct 2026 on a page re-check: ferrous.anchor.fesimg_eu_import_unit_value 1.907 → 1.8985 (the page now shows €2.21/kg)'))
      .toBe('the anchor grade itself — corrected 30 Oct 2026 on a page re-check (the page now shows €2.21/kg)');
    expect(reportNoteText('CORRECTED 30 Oct 2026 on a page re-check: ferrous.charge.GJS-500-7 2.69 → 2.67 (the same mix on the updated inputs)'))
      .toBe('corrected 30 Oct 2026 on a page re-check (the same mix on the updated inputs)');
    expect(reportNoteText('CORRECTED 30 Oct 2026 on a page re-check (was 0.172): BDEW Strompreisanalyse'))
      .toBe('corrected 30 Oct 2026 on a page re-check: BDEW Strompreisanalyse');
  });
  it('the superseded note, the date a machine was added and research provenance are dropped', () => {
    const dc01 = DEFAULT_RATE_LIBRARY.materials.find(m => m.id === 'mat-dc01')!.sourceNote;
    expect(dc01).toContain('Earlier note:');
    expect(reportNoteText(dc01)).not.toMatch(/Earlier note|Index-anchored: CRC/);
    expect(reportNoteText(dc01)).toMatch(/Source: https:\/\/gmk\.center\/.*\(2026-07-10\)\.$/);
    const hmc = DEFAULT_RATE_LIBRARY.machines.find(m => m.id === 'mach-hmc-400')!.sourceNote;
    expect(reportNoteText(hmc)).toMatch(/^UK book 2026-10-10 method: machine only/);
    expect(reportNoteText('Major past 4×D. Quoted from the search engine’s extract of the publisher’s page (the page itself could not be opened here) — verify against the live URL.'))
      .toBe('Major past 4×D.');
    expect(reportNoteText('Off-axis holes. Quoted from the search engine’s extract of the page (the page itself was not opened in this session) — verify against the live URL. A bore whose axis'))
      .toBe('Off-axis holes. A bore whose axis');
    expect(reportNoteText('ratio is 2. Quoted from the search engine’s extracts of the publishers’ pages — verify against the live URLs.'))
      .toBe('ratio is 2.');
    expect(reportNoteText('Read from a supplier-hosted copy of the NADCA table via the search engine’s extract — verify against the current NADCA edition.'))
      .toBe('Read from a supplier-hosted copy of the NADCA table — verify against the current NADCA edition.');
    const access = reportNoteText(ACCESS_SOURCE.note);
    expect(access).not.toMatch(/Search-engine|Fictiv|withdrawn|Protolabs/);
    // Nov 2026: the prototype-shop citation is gone; the rule is labelled the tool's own and says it is judged against
    // the costed machine
    expect(access).toMatch(/^Each direction a tool must come from is a re-fixturing on a 3-axis machine/);
    expect(access).toMatch(/Judged only when the costing routes the milling on a 3-axis machine/);
  });
  it('every note in the UK book and every country book prints clean', () => {
    const libs = [DEFAULT_RATE_LIBRARY, ...Object.keys(COUNTRY_BOOKS).map(r => buildRegionalLibrary(DEFAULT_RATE_LIBRARY, r as never))];
    const ids = new Set(DEFAULT_RATE_LIBRARY.machines.map(m => m.id));
    let n = 0;
    for (const lib of libs) {
      for (const e of [...lib.materials, ...lib.machines, ...lib.labour]) {
        const t = reportNoteText(e.sourceNote);
        n++;
        expect(t, e.id).not.toMatch(/CORRECTED|Earlier note|machine added|search engine|[a-z]+\.(anchor|charge|foundry)\.[A-Za-z0-9_]/);
        expect(t, e.id).not.toMatch(/\([a-z0-9]+(?:-[a-z0-9]+)+: /);
        for (const w of t.match(/(?<![\w-])[a-z0-9]+(?:-[a-z0-9]+)+(?![\w-])/g) ?? []) expect(ids.has(w), `${e.id}: ${w}`).toBe(false);
      }
    }
    expect(n).toBeGreaterThan(5_000);
  }, 120_000);
});

describe('M11 — the heat-treat derivation carries £ so a report converts it', () => {
  it('no bare GBP figure; every amount is a £ the report converts', () => {
    const r = computeHeatTreatRate('gas_carburise', 'CN');
    expect(r.basis).not.toMatch(/GBP/);
    expect(r.basis).toContain(`= buy £${r.ratePerKg.toFixed(4)}/kg`);
    const cny = localiseGbpText(r.basis, 9, '¥');
    expect(cny).not.toMatch(/£/);
    expect(cny).toContain(`= buy ¥${(Number(r.ratePerKg.toFixed(4)) * 9).toFixed(4)}/kg`);
    // the throughput and the load are not money
    expect(cny).toMatch(/kg\/load/);
    expect(computeHeatTreatRate('gas_carburise', 'UK', { sourcing: 'captive' }).basis).toMatch(/\/kg \(captive/);
  });
});
