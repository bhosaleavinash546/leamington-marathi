/**
 * Rate trace — every built-in rate, before and after a refresh, for every country.
 *
 *   git archive <before-commit> calculator/src | tar -x -C /tmp/before
 *   npx tsx scripts/rate-trace.ts /tmp/before/calculator/src scripts/rate-refresh/2026-09.json out.xlsx [other-tables.json]
 *
 * Reads the OLD engine (the before snapshot) and the CURRENT engine side by side and
 * writes one workbook: UK materials/machines/labour, the same for all 20 countries as
 * the tool actually builds them (buildRegionalLibrary), energy, FX, country factors,
 * the index sources, and a Reconciliation sheet that fails loudly if any rate is
 * missing, added, or changed without a reason. Nothing here recomputes a cost — both
 * sides come from the engine's own functions.
 */
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as NEWLIB from '../src/engine/rate-library.js';
import * as NEWREG from '../src/engine/regional-rates.js';
import * as NEWINS from '../src/engine/insights.js';

const [oldSrc, cfgPath, out, otherPath] = process.argv.slice(2);
if (!oldSrc || !cfgPath || !out) { console.error('usage: rate-trace.ts <old src dir> <config.json> <out.xlsx> [other-tables.json]'); process.exit(2); }
const OLDLIB = await import(resolve(oldSrc, 'engine/rate-library.ts')) as typeof NEWLIB;
const OLDREG = await import(resolve(oldSrc, 'engine/regional-rates.ts')) as typeof NEWREG;
const OLDINS = await import(resolve(oldSrc, 'engine/insights.ts')) as typeof NEWINS;
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const other: { file: string; table: string; prices: string; perCountry: string; status: string; reason: string }[] =
  otherPath ? JSON.parse(readFileSync(otherPath, 'utf8')) : [];

const L0 = OLDLIB.DEFAULT_RATE_LIBRARY, L1 = NEWLIB.DEFAULT_RATE_LIBRARY;
const R0 = OLDREG.REGIONAL_DATA, R1 = NEWREG.REGIONAL_DATA;
const REGIONS = Object.keys(R1) as (keyof typeof R1)[];
const pct = (a: number, b: number) => (a === 0 ? (b === 0 ? 0 : null) : b / a - 1);
const problems: string[] = [];

const wb = new ExcelJS.Workbook();
wb.creator = 'CostVision rate trace';
const NAVY = 'FF1F3864', GREY = 'FFF2F2F2';
function sheet(name: string, cols: { header: string; key: string; width?: number; fmt?: string }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width ?? 14, style: c.fmt ? { numFmt: c.fmt } : {} }));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  h.alignment = { vertical: 'middle', wrapText: true };
  h.height = 30;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}
const GBP = '£#,##0.00', GBP3 = '£#,##0.000', PCT = '+0.0%;-0.0%;0.0%';

/** Status of one material in the refresh, from the note the refresh wrote. */
function materialStatus(note: string, before: number, after: number, id: string): string {
  if (id === 'mat-virtual') return 'Placeholder (not priced)';
  if (/floored at commodity content/.test(note)) return 'Updated — floored at metal content';
  if (/Refresh [\d-]+: SPECIALTY/.test(note)) return 'Unchanged — specialty, no public index';
  if (/Refresh [\d-]+: INDEX FLAT/.test(note)) return 'Unchanged — index flat (sourced)';
  if (/Refresh [\d-]+: NOT SOURCED/.test(note)) return 'Unchanged — index not sourced';
  if (before !== after) return 'Updated by index';
  if (/Refresh [\d-]+:/.test(note)) return 'Updated by index (net zero)';
  return 'NOT TOUCHED';
}
const refreshNote = (note: string) => (note.match(/\| Refresh [\d-]+: (.*)$/)?.[1] ?? '');

// ── Summary (filled last) ──────────────────────────────────────────────────
const summary = wb.addWorksheet('Summary');

// ── Index sources ──────────────────────────────────────────────────────────
{
  const ws = sheet('Index sources', [
    { header: 'Index', key: 'k', width: 14 }, { header: 'Currency', key: 'ccy', width: 9 },
    { header: 'Old (anchor)', key: 'old', width: 12 }, { header: 'Now (Sep 2026)', key: 'now', width: 12 },
    { header: 'Unit', key: 'unit', width: 9 }, { header: 'Change', key: 'chg', width: 9, fmt: PCT },
    { header: 'Status', key: 'st', width: 16 }, { header: 'Source', key: 'src', width: 120 },
  ]);
  for (const [k, v] of Object.entries<any>(cfg.indices)) {
    ws.addRow({ k, ccy: v.ccy, old: v.old, now: v.now, unit: v.unit, chg: v.held ? 0 : pct(v.old / (v.oldFx ?? 1), v.now / (v.oldFx ?? 1)), st: v.held ? 'Held (not sourced)' : 'Used', src: v.source });
  }
  for (const [ccy, v] of Object.entries<any>(cfg.fx)) ws.addRow({ k: `FX GBP/${ccy}`, ccy, old: v.june, now: v.now, unit: 'per £', chg: pct(v.june, v.now), st: `Stored ${v.file} → ${v.now}`, src: v.source });
  ws.addRow({ k: 'Machine drivers', src: cfg.machines.source });
  for (const [r, list] of Object.entries<any>(cfg.regionalFactors ?? {})) for (const f of list) ws.addRow({ k: `${r} ${f.field}`, now: f.multiply, unit: '×', st: 'Country index', src: f.source });
}

// ── Materials — UK base ─────────────────────────────────────────────────────
const matStatusCount: Record<string, number> = {};
{
  const ws = sheet('Materials UK', [
    { header: 'ID', key: 'id', width: 24 }, { header: 'Grade', key: 'grade', width: 34 }, { header: 'Category', key: 'cat', width: 24 },
    { header: 'Before £/kg', key: 'b', fmt: GBP }, { header: 'After £/kg', key: 'a', fmt: GBP }, { header: 'Change £/kg', key: 'd', fmt: GBP3 },
    { header: 'Change %', key: 'p', fmt: PCT, width: 10 }, { header: 'Scrap before', key: 'sb', fmt: GBP }, { header: 'Scrap after', key: 'sa', fmt: GBP },
    { header: 'Status', key: 'st', width: 26 }, { header: 'Date before', key: 'db', width: 11 }, { header: 'Date after', key: 'da', width: 11 },
    { header: 'How it moved (from the refresh)', key: 'why', width: 110 },
  ]);
  const ids0 = new Set(L0.materials.map(m => m.id));
  for (const m1 of L1.materials) {
    const m0 = L0.materials.find(m => m.id === m1.id);
    if (!m0) { problems.push(`material ${m1.id} is new — not in the June library`); continue; }
    ids0.delete(m1.id);
    const st = materialStatus(m1.sourceNote ?? '', m0.pricePerKg, m1.pricePerKg, m1.id);
    matStatusCount[st] = (matStatusCount[st] ?? 0) + 1;
    if (st === 'NOT TOUCHED') problems.push(`material ${m1.id} was not processed by the refresh`);
    ws.addRow({ id: m1.id, grade: m1.grade, cat: m1.category, b: m0.pricePerKg, a: m1.pricePerKg, d: m1.pricePerKg - m0.pricePerKg,
      p: pct(m0.pricePerKg, m1.pricePerKg), sb: m0.scrapRecoveryPricePerKg, sa: m1.scrapRecoveryPricePerKg, st,
      db: m0.effectiveDate, da: m1.effectiveDate, why: refreshNote(m1.sourceNote ?? '') });
  }
  for (const id of ids0) problems.push(`material ${id} was in June and is missing now`);
}

// ── Materials by country (as the tool builds them) ─────────────────────────
{
  const ws = sheet('Materials by country', [
    { header: 'ID', key: 'id', width: 24 }, { header: 'Grade', key: 'grade', width: 30 }, { header: 'Category', key: 'cat', width: 22 },
    { header: 'Country', key: 'c', width: 16 }, { header: 'Before £/kg', key: 'b', fmt: GBP }, { header: 'After £/kg', key: 'a', fmt: GBP },
    { header: 'Change %', key: 'p', fmt: PCT, width: 10 }, { header: 'Family', key: 'fam', width: 14 },
  ]);
  for (const r of REGIONS) {
    const b = OLDREG.buildRegionalLibrary(L0, r as any), a = NEWREG.buildRegionalLibrary(L1, r);
    if (b.materials.length !== a.materials.length) problems.push(`${r}: material count ${b.materials.length} → ${a.materials.length}`);
    for (const m1 of a.materials) {
      const m0 = b.materials.find(m => m.id === m1.id)!;
      ws.addRow({ id: m1.id, grade: m1.grade, cat: m1.category, c: R1[r].name, b: m0.pricePerKg, a: m1.pricePerKg, p: pct(m0.pricePerKg, m1.pricePerKg), fam: NEWREG.classifyMaterialFamily(m1) });
    }
  }
}

// ── Machines — UK build-ups ─────────────────────────────────────────────────
const F = ['annualDepreciation', 'maintenance', 'energy', 'floorSpace', 'indirectSupport', 'financeCost'] as const;
{
  const cols: any[] = [{ header: 'ID', key: 'id', width: 26 }, { header: 'Machine', key: 'cls', width: 34 },
    { header: 'Before £/hr', key: 'b', fmt: GBP }, { header: 'After £/hr', key: 'a', fmt: GBP }, { header: 'Change %', key: 'p', fmt: PCT, width: 10 }];
  for (const f of F) cols.push({ header: `${f} before £/yr`, key: `${f}0`, fmt: '£#,##0' }, { header: `${f} after £/yr`, key: `${f}1`, fmt: '£#,##0' });
  cols.push({ header: 'Hours/yr', key: 'h', width: 9 }, { header: 'Utilisation', key: 'u', width: 10 });
  const ws = sheet('Machines UK', cols);
  for (const m1 of L1.machines) {
    const m0 = L0.machines.find(m => m.id === m1.id);
    if (!m0) { problems.push(`machine ${m1.id} is new`); continue; }
    const row: any = { id: m1.id, cls: m1.machineClass, b: m0.computedRatePerHr, a: m1.computedRatePerHr, p: pct(m0.computedRatePerHr, m1.computedRatePerHr), h: m1.buildup?.annualAvailableHours, u: m1.buildup?.machineUtilization };
    for (const f of F) { row[`${f}0`] = m0.buildup?.[f]; row[`${f}1`] = m1.buildup?.[f]; }
    if (m0.computedRatePerHr === m1.computedRatePerHr) problems.push(`machine ${m1.id} rate did not move`);
    if (m0.buildup?.annualAvailableHours !== m1.buildup?.annualAvailableHours || m0.buildup?.machineUtilization !== m1.buildup?.machineUtilization) problems.push(`machine ${m1.id}: hours or utilisation changed (must not)`);
    ws.addRow(row);
  }
  if (L0.machines.length !== L1.machines.length) problems.push(`machine count ${L0.machines.length} → ${L1.machines.length}`);
}

// ── Machines by country ─────────────────────────────────────────────────────
{
  const ws = sheet('Machines by country', [
    { header: 'ID', key: 'id', width: 26 }, { header: 'Machine', key: 'cls', width: 32 }, { header: 'Country', key: 'c', width: 16 },
    { header: 'Before £/hr', key: 'b', fmt: GBP }, { header: 'After £/hr', key: 'a', fmt: GBP }, { header: 'Change %', key: 'p', fmt: PCT, width: 10 },
  ]);
  for (const r of REGIONS) {
    const b = OLDREG.buildRegionalLibrary(L0, r as any), a = NEWREG.buildRegionalLibrary(L1, r);
    for (const m1 of a.machines) {
      const m0 = b.machines.find(m => m.id === m1.id)!;
      ws.addRow({ id: m1.id, cls: m1.machineClass, c: R1[r].name, b: m0.computedRatePerHr, a: m1.computedRatePerHr, p: pct(m0.computedRatePerHr, m1.computedRatePerHr) });
    }
  }
}

// ── Labour ──────────────────────────────────────────────────────────────────
{
  const ws = sheet('Labour library', [
    { header: 'ID', key: 'id', width: 24 }, { header: 'Grade', key: 'g', width: 28 }, { header: 'Region', key: 'r', width: 12 },
    { header: 'Before £/hr', key: 'b', fmt: GBP }, { header: 'After £/hr', key: 'a', fmt: GBP }, { header: 'Change %', key: 'p', fmt: PCT, width: 10 },
    { header: 'How it moved', key: 'why', width: 110 },
  ]);
  for (const l1 of L1.labour) {
    const l0 = L0.labour.find(l => l.id === l1.id);
    if (!l0) { problems.push(`labour ${l1.id} is new`); continue; }
    if (l0.fullyLoadedRatePerHr === l1.fullyLoadedRatePerHr) problems.push(`labour ${l1.id} did not move`);
    ws.addRow({ id: l1.id, g: (l1 as any).skillLevel, r: l1.region, b: l0.fullyLoadedRatePerHr, a: l1.fullyLoadedRatePerHr, p: pct(l0.fullyLoadedRatePerHr, l1.fullyLoadedRatePerHr), why: refreshNote(l1.sourceNote ?? '') });
  }
  if (L0.labour.length !== L1.labour.length) problems.push(`labour count ${L0.labour.length} → ${L1.labour.length}`);

  const w2 = sheet('Labour by country', [
    { header: 'Country', key: 'c', width: 16 }, { header: 'Category', key: 'k', width: 14 },
    { header: 'Before £/hr', key: 'b', fmt: GBP }, { header: 'After £/hr', key: 'a', fmt: GBP }, { header: 'Change %', key: 'p', fmt: PCT, width: 10 },
    { header: 'Local wage growth used', key: 'g', fmt: PCT, width: 12 }, { header: 'FX £→local June', key: 'fj', width: 12 }, { header: 'FX now', key: 'fn', width: 12 },
    { header: 'Wage source', key: 'src', width: 90 },
  ]);
  for (const r of REGIONS) {
    const g = r === 'UK' ? { growth: cfg.labour.ukGrowth, source: cfg.labour.ukSource } : cfg.labour.regions[r];
    const ccy = R1[r].currency, fx = cfg.fx[ccy];
    for (const k of Object.keys(R1[r].labour) as (keyof typeof R1.UK.labour)[]) {
      const b = R0[r].labour[k], a = R1[r].labour[k];
      if (b === a) problems.push(`labour ${r}/${k} did not move`);
      w2.addRow({ c: R1[r].name, k, b, a, p: pct(b, a), g: g?.growth, fj: fx?.june ?? 1, fn: fx?.now ?? 1, src: g?.source });
    }
  }
}

// ── Energy, FX, country factors ────────────────────────────────────────────
{
  const ws = sheet('Energy by country', [
    { header: 'Country', key: 'c', width: 16 }, { header: 'Electricity before £/kWh', key: 'eb', fmt: GBP3 }, { header: 'Electricity after', key: 'ea', fmt: GBP3 },
    { header: 'Gas before £/kWh', key: 'gb', fmt: GBP3 }, { header: 'Gas after', key: 'ga', fmt: GBP3 }, { header: 'Basis', key: 'src', width: 120 },
  ]);
  for (const r of REGIONS) ws.addRow({ c: R1[r].name, eb: R0[r].energy.electricityPerKwh, ea: R1[r].energy.electricityPerKwh, gb: R0[r].energy.gasPerKwh, ga: R1[r].energy.gasPerKwh, src: cfg.energy[r]?.source });
  for (const e1 of (L1 as any).energy) {
    const e0 = (L0 as any).energy.find((e: any) => e.id === e1.id);
    ws.addRow({ c: `library ${e1.id}`, eb: e0.electricityPerKwh, ea: e1.electricityPerKwh, gb: e0.gasPerKwh, ga: e1.gasPerKwh, src: refreshNote(e1.sourceNote ?? '') || e1.sourceNote });
  }
  const fxs = sheet('FX', [
    { header: 'Currency', key: 'c', width: 10 }, { header: 'Where', key: 'w', width: 30 },
    { header: 'Before (1 £ = )', key: 'b', width: 14 }, { header: 'After (1 £ = )', key: 'a', width: 14 }, { header: 'Market 30 Jun', key: 'j', width: 14 }, { header: 'Source', key: 's', width: 80 },
  ]);
  for (const r of REGIONS) if (R1[r].currency !== 'GBP') fxs.addRow({ c: R1[r].currency, w: `REGIONAL_DATA ${r}`, b: R0[r].fxToGBP, a: R1[r].fxToGBP, j: cfg.fx[R1[r].currency].june, s: cfg.fx[R1[r].currency].source });
  for (const f1 of (L1 as any).fx) { const f0 = (L0 as any).fx.find((f: any) => f.id === f1.id); fxs.addRow({ c: f1.toCurrency, w: `library ${f1.id}`, b: f0.rate, a: f1.rate, s: f1.sourceNote }); }
  for (const [c, v] of Object.entries(NEWINS.FX_TO_GBP)) fxs.addRow({ c, w: 'insights FX_TO_GBP (display)', b: +(1 / (OLDINS.FX_TO_GBP as any)[c]).toPrecision(5), a: +(1 / v).toPrecision(5) });

  const fs = sheet('Country factors', [
    { header: 'Country', key: 'c', width: 16 }, { header: 'Factor', key: 'f', width: 26 },
    { header: 'Before', key: 'b', width: 10 }, { header: 'After', key: 'a', width: 10 }, { header: 'Why', key: 'w', width: 110 },
  ]);
  for (const r of REGIONS) {
    const pairs: [string, number, number][] = [
      ['materialMultiplier (steel & other)', R0[r].materialMultiplier, R1[r].materialMultiplier],
      ['commodityResin', R0[r].materialFactors.commodityResin, R1[r].materialFactors.commodityResin],
      ['engineeringResin', R0[r].materialFactors.engineeringResin, R1[r].materialFactors.engineeringResin],
      ['highPerfResin (and exchange metals, rubber)', R0[r].materialFactors.highPerfResin, R1[r].materialFactors.highPerfResin],
      ['machineRateMultiplier', R0[r].machineRateMultiplier, R1[r].machineRateMultiplier],
      ['overheadMultiplier', R0[r].overheadMultiplier, R1[r].overheadMultiplier],
      ['packagingMultiplier', R0[r].packagingMultiplier, R1[r].packagingMultiplier],
      ['logisticsMultiplier', R0[r].logisticsMultiplier, R1[r].logisticsMultiplier],
    ];
    for (const [f, b, a] of pairs) {
      const moved = (cfg.regionalFactors?.[r] ?? []).find((x: any) => f.startsWith(x.field));
      fs.addRow({ c: R1[r].name, f, b, a, w: moved ? moved.source : 'Relative factor vs the UK — unchanged: the UK base carries the index move, and the country follows it' });
    }
  }
  const ct = sheet('Country price tables', [
    { header: 'Table', key: 't', width: 16 }, { header: 'ID', key: 'id', width: 22 }, { header: 'Country', key: 'c', width: 8 },
    { header: 'Before £/kg', key: 'b', fmt: GBP }, { header: 'After £/kg', key: 'a', fmt: GBP }, { header: 'Change %', key: 'p', fmt: PCT },
  ]);
  for (const [name, T0, T1] of [['Extrusion', OLDREG.EXTRUSION_COUNTRY_PRICES, NEWREG.EXTRUSION_COUNTRY_PRICES], ['Thermoforming', OLDREG.THERMOFORMING_COUNTRY_PRICES, NEWREG.THERMOFORMING_COUNTRY_PRICES]] as const) {
    for (const [id, byC] of Object.entries(T1)) for (const [c, a] of Object.entries(byC as Record<string, number>)) {
      const b = (T0 as any)[id]?.[c];
      ct.addRow({ t: name, id, c, b, a, p: pct(b, a) });
    }
  }
}

// ── PCB country rates (server/data/pcb-country-rates.ts) ────────────────────
{
  const OLDPCB = await import(resolve(oldSrc, '../server/data/pcb-country-rates.ts')) as any;
  const NEWPCB = await import('../server/data/pcb-country-rates.js') as any;
  const ws = sheet('PCB country rates', [
    { header: 'Country', key: 'c', width: 16 }, { header: 'Group', key: 'g', width: 12 }, { header: 'Rate', key: 'f', width: 24 },
    { header: 'Before £', key: 'b', width: 12 }, { header: 'After £', key: 'a', width: 12 }, { header: 'Change %', key: 'p', fmt: PCT, width: 10 },
  ]);
  const O = OLDPCB.PCB_COUNTRY_RATES, N = NEWPCB.PCB_COUNTRY_RATES;
  for (const id of Object.keys(N)) {
    for (const g of ['pcbFab', 'assembly', 'logistics']) {
      for (const [f, a] of Object.entries(N[id][g] ?? {})) {
        if (typeof a !== 'number') continue;
        const b = O[id][g][f] as number;
        ws.addRow({ c: N[id].shortName, g, f, b, a, p: pct(b, a) });
      }
    }
    ws.addRow({ c: N[id].shortName, g: 'fx', f: `fxToGBP (${N[id].currency}, label)`, b: O[id].fxToGBP, a: N[id].fxToGBP });
  }
  const oc = OLDPCB.computeAllCountryCosts ? null : null; void oc;
}

// ── Shop and process tables outside the library ────────────────────────────
{
  const ws = sheet('Process & tooling tables', [
    { header: 'Table', key: 't', width: 28 }, { header: 'Item', key: 'i', width: 26 },
    { header: 'Before', key: 'b', width: 12 }, { header: 'After', key: 'a', width: 12 }, { header: 'Change %', key: 'p', fmt: PCT, width: 10 }, { header: 'Basis', key: 'w', width: 90 },
  ]);
  const OT = await import(resolve(oldSrc, 'engine/toolmaking.ts')) as any;
  const NT = await import('../src/engine/toolmaking.js') as any;
  for (const [k, a] of Object.entries(NT.TOOLROOM_RATES)) ws.addRow({ t: 'TOOLROOM_RATES £/hr', i: k, b: OT.TOOLROOM_RATES[k], a, p: pct(OT.TOOLROOM_RATES[k], a as number), w: 'UK manufacturing wages, one quarter (ONS AWE +2.9% y/y)' });
  for (const [k, a] of Object.entries(NT.TOOL_MATERIAL_GBP_PER_KG)) ws.addRow({ t: 'TOOL_MATERIAL £/kg', i: k, b: OT.TOOL_MATERIAL_GBP_PER_KG[k], a, p: pct(OT.TOOL_MATERIAL_GBP_PER_KG[k], a as number), w: 'Held — no public tool-steel index; refresh by supplier quote' });
  for (const [k, a] of Object.entries(NT.BOUGHT_OUT_GBP)) ws.addRow({ t: 'BOUGHT_OUT £ each', i: k, b: OT.BOUGHT_OUT_GBP[k], a, p: pct(OT.BOUGHT_OUT_GBP[k], a as number), w: 'Held — catalogue prices, no index' });
  const OS = await import(resolve(oldSrc, 'engine/surface-treatment-data.ts')) as any;
  const NS = await import('../src/engine/surface-treatment-data.js') as any;
  for (const [k, v] of Object.entries<any>(NS.SURFACE_METAL_PRICES)) ws.addRow({ t: 'SURFACE_METAL_PRICES £/kg', i: k, b: OS.SURFACE_METAL_PRICES[k].value, a: v.value, p: pct(OS.SURFACE_METAL_PRICES[k].value, v.value), w: v.note ?? v.source ?? '' });
  for (const [k, v] of Object.entries<any>(NS.SURFACE_STAGES)) {
    const b0 = OS.SURFACE_STAGES[k]?.chemistryGBPPerUnit?.value, a0 = v.chemistryGBPPerUnit?.value;
    if (typeof a0 === 'number') ws.addRow({ t: 'SURFACE_STAGES chemistry £/unit', i: k, b: b0, a: a0, p: pct(b0, a0), w: 'Aug 2026 workbook (USD) re-converted at 29 Sep 2026 USD/GBP 1.3238 (was 1.33)' });
  }
}

// ── Other rate tables ──────────────────────────────────────────────────────
if (other.length) {
  const ws = sheet('Other rate tables', [
    { header: 'File', key: 'file', width: 40 }, { header: 'Table', key: 'table', width: 30 }, { header: 'What it prices', key: 'prices', width: 40 },
    { header: 'Per country?', key: 'perCountry', width: 12 }, { header: 'Status', key: 'status', width: 22 }, { header: 'Reason / basis', key: 'reason', width: 90 },
  ]);
  for (const o of other) ws.addRow(o);
}

// ── Reconciliation ─────────────────────────────────────────────────────────
{
  const ws = sheet('Reconciliation', [{ header: 'Check', key: 'k', width: 70 }, { header: 'Before', key: 'b', width: 12 }, { header: 'After', key: 'a', width: 12 }, { header: 'Result', key: 'r', width: 60 }]);
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  const add = (k: string, b: any, a: any, ok: boolean, note = '') => ws.addRow({ k, b, a, r: ok ? `OK ${note}` : `FAIL ${note}` });
  add('Material IDs identical (same set, same order)', L0.materials.length, L1.materials.length, same(L0.materials.map(m => m.id), L1.materials.map(m => m.id)));
  add('Machine IDs identical', L0.machines.length, L1.machines.length, same(L0.machines.map(m => m.id), L1.machines.map(m => m.id)));
  add('Labour IDs identical', L0.labour.length, L1.labour.length, same(L0.labour.map(m => m.id), L1.labour.map(m => m.id)));
  add('Countries identical', Object.keys(R0).length, REGIONS.length, same(Object.keys(R0), REGIONS as string[]));
  add('Every material processed by the refresh (none untouched)', '', matStatusCount['NOT TOUCHED'] ?? 0, !matStatusCount['NOT TOUCHED']);
  for (const [st, n] of Object.entries(matStatusCount)) add(`Materials — ${st}`, '', n, true);
  add('Every machine rate moved', L0.machines.length, L1.machines.filter((m, i) => m.computedRatePerHr !== L0.machines[i].computedRatePerHr).length, !problems.some(p => p.includes('rate did not move')));
  add('Every labour rate moved (library + 20 countries × 8)', '', '', !problems.some(p => p.includes('did not move') && p.startsWith('labour')));
  add('Library version', L0.version, L1.version, L0.version !== L1.version);
  add('Library date', L0.lastModified, L1.lastModified, L0.lastModified !== L1.lastModified);
  ws.addRow({});
  ws.addRow({ k: problems.length ? `PROBLEMS (${problems.length})` : 'No problems found' });
  for (const p of problems) ws.addRow({ k: p, r: 'FAIL' });
}

// ── Summary text ───────────────────────────────────────────────────────────
{
  const ws = summary;
  ws.getColumn(1).width = 34; ws.getColumn(2).width = 100;
  const title = ws.addRow(['CostVision rate library — before and after']); title.font = { bold: true, size: 16, color: { argb: NAVY } };
  const rows: [string, string][] = [
    ['Before', `Library ${L0.version}, ${L0.lastModified}`],
    ['After', `Library ${L1.version}, ${L1.lastModified} (rates as of ${cfg.asOf})`],
    ['Materials (UK base)', `${L1.materials.length} grades — ${Object.entries(matStatusCount).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ')}`],
    ['Materials by country', `${L1.materials.length} × ${REGIONS.length} countries = ${L1.materials.length * REGIONS.length} rows, as the tool builds them`],
    ['Machines', `${L1.machines.length} build-ups, every one rebuilt; × ${REGIONS.length} countries = ${L1.machines.length * REGIONS.length} rows`],
    ['Labour', `${L1.labour.length} library grades + ${REGIONS.length} countries × 8 categories`],
    ['Energy / FX', `${REGIONS.length} countries; 15 currencies at 30 Jun and 29 Sep 2026 market rates`],
    ['Method — materials', 'Each price moves by what it contains: kg of commodity per kg × change in that commodity\'s £/kg. Premiums held. Nothing below its own metal content.'],
    ['Method — labour', 'One quarter of local wage growth × the exchange-rate move since 30 June 2026.'],
    ['Method — machines', 'Build-up rebuilt: depreciation × machinery PPI, maintenance × ½PPI+½wages, energy × tariff, floor × rent, support × wages, finance × capital.'],
    ['Method — countries', 'Countries are relative to the UK base; China and India steel/plastics also follow their own market index (see Country factors).'],
    ['Reconciliation', problems.length ? `${problems.length} problem(s) — see Reconciliation` : 'All checks pass — see Reconciliation'],
    ['Caveat', 'Index figures were read from cited search summaries (source pages blocked from the build environment); FX from dated daily snapshots. Held items are listed with their reason.'],
  ];
  for (const [k, v] of rows) { const r = ws.addRow([k, v]); r.getCell(1).font = { bold: true }; r.getCell(2).alignment = { wrapText: true, vertical: 'top' }; r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } }; }
}

await wb.xlsx.writeFile(out);
console.log(`wrote ${out}`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n  ${problems.slice(0, 40).join('\n  ')}` : 'reconciliation: no problems');
console.log(matStatusCount);
