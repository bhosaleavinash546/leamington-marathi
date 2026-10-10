/**
 * UK rate book — rewrites the BASE library's UK rates from a dated config (October 2026).
 *
 *   npx tsx scripts/uk-book.ts scripts/rate-refresh/2026-10-uk.json          # dry run: the register, nothing written
 *   npx tsx scripts/uk-book.ts scripts/rate-refresh/2026-10-uk.json --write  # writes the UK literals and the register
 *
 * The config is assembled from sourced research by `scripts/rate-refresh/uk-2026-10/build-config.py` (every figure
 * with its URL and date). The UK book is the base every other country is scaled from, so this writes the base
 * literals themselves (the India book, scripts/country-book.ts, is an overlay; the UK has none):
 *   - rate-library.ts — material £/kg (+ note, confidence, date) for the grades in a family; the build-up of every
 *     UK machine (capex groups rebuilt from the evidence; every other machine's energy re-priced at the new tariff,
 *     its capital HELD and said so); the lab-uk-* grades; the energy-uk entry;
 *   - regional-rates.ts — REGIONAL_DATA.UK labour and energy;
 *   - uk-energy.ts — the tariff the build-ups are expressed in (regional re-tariffing reads it);
 *   - server/data/pcb-country-rates.ts — the PCB table's gb £/kWh;
 *   - scripts/rate-refresh/uk-2026-10/register.csv — every rate, current v new, decision and basis.
 * "Current" is the frozen snapshot taken before this book (uk-2026-10/current-uk-book.json), so a re-run is
 * idempotent and never reports new-as-current.
 *
 * Methods (build-config.py): direct = the research figure; ladder = anchor × (book grade ÷ book base), floored at the
 * anchor where the family says so; floor = the book price raised to the metal it contains; else HELD.
 * Machines in a capex group: capex = reference capex × (this machine's book depreciation ÷ the reference's) — the
 * book's own relative sizing, the evidence's level; kW likewise scaled from the reference's sourced draw; then
 * depreciation = capex ÷ life, maintenance and indirect support a % of capex, finance on half the capex, floor,
 * hours and utilisation held.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMachineRateFromBuildup } from '../src/engine/rate-library.js';
import type { MachineRateBuildup } from '../src/engine/types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!cfgPath) { console.error('usage: uk-book.ts <config.json> [--write]'); process.exit(2); }
const cfg = JSON.parse(readFileSync(resolve(process.cwd(), cfgPath), 'utf8'));
const DATE: string = cfg.asOf;
const TAG = `UK book ${DATE}`;
const MONTH = DATE.slice(0, 7);   // materials carry the library's month convention (RATE_BASIS / UK_BOOK_BASIS)
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const q = (s: string) => s.replace(/\\/g, '').replace(/'/g, '’').replace(/\s+/g, ' ').trim();

type Snap = {
  regional: { labour: Record<string, number>; energy: { electricityPerKwh: number; gasPerKwh: number } };
  labour: Array<{ id: string; role: string; gbpPerHr: number }>;
  machines: Array<{ id: string; class: string; gbpPerHr: number; region: string; buildup: MachineRateBuildup | null; source: string }>;
  materials: Array<{ id: string; grade: string; category: string; gbpPerKg: number; scrapGbpPerKg: number; source: string }>;
};
const SNAP = JSON.parse(readFileSync(resolve(ROOT, 'scripts/rate-refresh/uk-2026-10/current-uk-book.json'), 'utf8')) as Snap;
const OLD_ELEC = SNAP.regional.energy.electricityPerKwh;
const ELEC: number = cfg.energy.electricityGbpPerKwh, GAS: number = cfg.energy.gasGbpPerKwh;

type Row = { kind: string; id: string; name: string; current: number | null; next: number | null; unit: string; decision: string; basis: string; source: string };
const register: Row[] = [];
const LIB = resolve(ROOT, 'src/engine/rate-library.ts');
let lib = readFileSync(LIB, 'utf8');

/** The span of the object literal holding `id: '<id>'`. */
function objectSpan(src: string, id: string): [number, number] {
  const at = src.indexOf(`id: '${id}'`);
  if (at < 0) throw new Error(`id ${id} not found`);
  let open = at, depth = 0;
  for (; open >= 0; open--) { const c = src[open]; if (c === '}') depth++; else if (c === '{') { if (depth === 0) break; depth--; } }
  let close = at; depth = 0;
  for (; close < src.length; close++) { const c = src[close]; if (c === '{') depth++; else if (c === '}') { if (depth === 0) break; depth--; } }
  return [open, close + 1];
}
function setField(obj: string, field: string, literal: string): string {
  const re = new RegExp(`(\\b${field}:\\s*)(-?[0-9.]+|'(?:[^'\\\\]|\\\\.)*'(?:\\s*\\+\\s*'(?:[^'\\\\]|\\\\.)*')*)`);
  if (!re.test(obj)) throw new Error(`field ${field} missing in ${obj.slice(0, 80)}`);
  return obj.replace(re, (_m, p) => `${p}${literal}`);
}

// ── materials ────────────────────────────────────────────────────────────────
const snapMat = new Map(SNAP.materials.map(m => [m.id, m]));
for (const f of cfg.materialFamilies) {
  const srcText = (f.sources as Array<{ source: string; date?: string }>).map(s => `${s.source}${s.date ? ` (${s.date})` : ''}`).join(' ; ');
  for (const id of f.members as string[]) {
    const cur = snapMat.get(id);
    if (!cur) throw new Error(`material ${id} is not in the snapshot`);
    let price: number, how: string;
    if (f.method === 'direct') { price = f.anchorGbpPerKg; how = 'direct'; }
    else if (f.method === 'ladder') {
      const proxy = (f.proxies ?? {})[id] ? snapMat.get(f.proxies[id]) : undefined;
      const ratio = (proxy ?? cur).gbpPerKg / f.base;
      const r = f.floorAtAnchor ? Math.max(1, ratio) : ratio;
      price = f.anchorGbpPerKg * r;
      how = `ladder ×${r.toFixed(3)} (book grade £${(proxy ?? cur).gbpPerKg} ÷ book base £${f.base})`;
    } else if (f.method === 'ladder-add') {
      // alloy content is an absolute £/kg: the anchor + the book's own premium over its base
      const add = cur.gbpPerKg - f.base;
      price = f.anchorGbpPerKg + add;
      how = `ladder +£${add.toFixed(3)}/kg (book grade £${cur.gbpPerKg} − book base £${f.base})`;
    } else if (f.method === 'floor') {
      price = Math.max(cur.gbpPerKg, f.anchorGbpPerKg);
      how = cur.gbpPerKg >= f.anchorGbpPerKg ? 'held (already at or above the content)' : 'floor (raised to the content)';
    } else throw new Error(`method ${f.method}`);
    price = r3(price);
    const held = how.startsWith('held') || Math.abs(price - cur.gbpPerKg) < 0.005 * cur.gbpPerKg;
    const scrap = f.scrapGbpPerKg != null ? Math.min(cur.scrapGbpPerKg, f.scrapGbpPerKg) : cur.scrapGbpPerKg;
    if (!held && scrap >= price) throw new Error(`${id}: scrap credit £${scrap} would be ≥ the new price £${price} — set the family's scrap`);
    register.push({ kind: 'material', id, name: cur.grade, current: cur.gbpPerKg, next: held ? cur.gbpPerKg : price, unit: '£/kg',
      decision: held ? 'held (evidence agrees)' : 'updated', basis: `${f.family} — ${f.anchorBasis}; ${how}${scrap !== cur.scrapGbpPerKg ? `; scrap credit £${cur.scrapGbpPerKg} → £${scrap} (${f.scrapBasis})` : ''}`, source: srcText });
    if (held) continue;
    const [a, b] = objectSpan(lib, id);
    let obj = lib.slice(a, b);
    obj = setField(obj, 'pricePerKg', price.toFixed(3));
    if (scrap !== cur.scrapGbpPerKg) obj = setField(obj, 'scrapRecoveryPricePerKg', scrap.toFixed(3));
    obj = setField(obj, 'effectiveDate', `'${MONTH}'`);
    // the grade's own description stays (applications, trade names) under "Earlier note" — its old pricing claims
    // are history, the price basis is the first sentence
    const live = /sourceNote:\s*'((?:[^'\\]|\\.)*)'/.exec(obj)![1];
    const earlier = (live.startsWith('UK book') ? live.replace(/^.*?Earlier note: /, '') : live).replace(/ \| Refresh \d{4}-\d{2}:.*$/, '');
    obj = setField(obj, 'sourceNote', `'${q(`${TAG}: ${f.family} — ${f.anchorBasis}; ${how}. Was £${cur.gbpPerKg}/kg. Source: ${srcText}. Earlier note: ${earlier}`)}'`);
    obj = setField(obj, 'confidence', `'${f.confidence}'`);
    lib = lib.slice(0, a) + obj + lib.slice(b);
  }
}
const pricedMat = new Set(register.map(r => r.id));
for (const m of SNAP.materials) {
  if (pricedMat.has(m.id)) continue;
  const why = Object.entries(cfg.held as Record<string, string>).find(([k]) => k.toLowerCase().split(/[,/ ]+/).some(w => w.length > 3 && m.category.toLowerCase().includes(w)));
  register.push({ kind: 'material', id: m.id, name: m.grade, current: m.gbpPerKg, next: m.gbpPerKg, unit: '£/kg',
    decision: 'held (no contradicting evidence this round)', basis: why ? `${why[0]}: ${why[1]}` : `${m.category} — not researched this round`, source: '' });
}

// ── labour ───────────────────────────────────────────────────────────────────
const L = cfg.labour;
const labourCat = L.categories as Record<string, { gbpPerHr: number; basis: string; source: string }>;
const labourGrade = L.grades as Record<string, { gbpPerHr: number; basis: string; source: string }>;
const labourFor: Record<string, { gbpPerHr: number; basis: string; source: string }> = { ...labourCat, ...labourGrade };
for (const l of SNAP.labour.filter(x => x.id.startsWith('lab-uk-'))) {
  const key = l.id.slice('lab-uk-'.length);
  const v = labourFor[key];
  if (!v) { register.push({ kind: 'labour', id: l.id, name: l.role, current: l.gbpPerHr, next: l.gbpPerHr, unit: '£/h fully loaded', decision: 'held (no evidence)', basis: '', source: '' }); continue; }
  register.push({ kind: 'labour', id: l.id, name: l.role, current: l.gbpPerHr, next: v.gbpPerHr, unit: '£/h fully loaded', decision: 'updated', basis: v.basis, source: v.source });
  const [a, b] = objectSpan(lib, l.id);
  let obj = lib.slice(a, b);
  obj = setField(obj, 'fullyLoadedRatePerHr', v.gbpPerHr.toFixed(2));
  obj = setField(obj, 'effectiveDate', `'${DATE}'`);
  obj = setField(obj, 'sourceNote', `'${q(`${TAG}: ${v.basis}. Loading: ${L.loadingIncluded}. Source: ${v.source}. Was £${l.gbpPerHr}/h`)}'`);
  obj = setField(obj, 'confidence', `'${key === 'skilled' ? 'Low' : 'Medium'}'`);
  lib = lib.slice(0, a) + obj + lib.slice(b);
}

// ── energy ───────────────────────────────────────────────────────────────────
const E = cfg.energy;
const eSrc = (E.sources as Array<{ source: string; date?: string }>).map(s => `${s.source} (${s.date})`).join(' ; ');
register.push({ kind: 'energy', id: 'electricity', name: 'UK industrial electricity', current: OLD_ELEC, next: ELEC, unit: '£/kWh', decision: 'updated', basis: E.basis, source: eSrc });
register.push({ kind: 'energy', id: 'gas', name: 'UK industrial gas', current: SNAP.regional.energy.gasPerKwh, next: GAS, unit: '£/kWh', decision: 'updated', basis: E.basis, source: eSrc });
{
  const [a, b] = objectSpan(lib, 'energy-uk');
  let obj = lib.slice(a, b);
  obj = setField(obj, 'electricityPerKwh', ELEC.toFixed(3));
  obj = setField(obj, 'gasPerKwh', GAS.toFixed(3));
  obj = setField(obj, 'effectiveDate', `'${DATE}'`);
  obj = setField(obj, 'sourceNote', `'${q(`${TAG}: ${E.basis}. Was £${OLD_ELEC} / £${SNAP.regional.energy.gasPerKwh} per kWh (Ofgem Q1 + a wholesale pass-through). Source: ${eSrc}`)}'`);
  obj = setField(obj, 'confidence', `'Medium'`);
  lib = lib.slice(0, a) + obj + lib.slice(b);
}

// ── machines ─────────────────────────────────────────────────────────────────
const M = cfg.machines;
type Group = { id: string; match: string; refId: string; refCapexGbp: number; refKw: number | null; kwBasis: string; basis: string; source: string; confidence: string };
const groups = M.groups as Group[];
const snapMach = new Map(SNAP.machines.map(m => [m.id, m]));
const impliedKw = (b: MachineRateBuildup) => b.energy / (b.annualAvailableHours * b.machineUtilization * OLD_ELEC);

/** Every literal `makeMachine('<id>', '<class>', { … }, '<region>', <note>)` call — id → [start, end) of the call. */
function machineCalls(src: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const re = /makeMachine\(\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + 'makeMachine('.length, depth = 1, inStr = false;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (inStr) { if (c === '\\') i++; else if (c === "'") inStr = false; continue; }
      if (c === "'") inStr = true; else if (c === '(') depth++; else if (c === ')') depth--;
    }
    out.set(m[1], [m.index, i]);
  }
  return out;
}

const NUM = (o: string, f: string) => Number(new RegExp(`\\b${f}:\\s*([0-9.]+)`).exec(o)![1]);
let rebuilt = 0, retariffed = 0;
for (const s of SNAP.machines) {
  if (s.region !== 'UK' || !s.buildup) continue;
  const calls = machineCalls(lib);
  const span = calls.get(s.id);
  const g = groups.find(x => new RegExp(x.match).test(s.id));
  if (!span) {
    // built from capex by alBuildup / evBuildup — its energy follows UK_ELECTRICITY_GBP_PER_KWH
    const b = s.buildup;
    const nb = { ...b, energy: Math.round(b.energy * ELEC / OLD_ELEC) };
    register.push({ kind: 'machine', id: s.id, name: s.class, current: s.gbpPerHr, next: r2(computeMachineRateFromBuildup(nb)), unit: '£/h machine only',
      decision: 'updated (energy re-priced; capital from its own capex build-up)', basis: 'line build-up from capex (al-extrusion-data.ts / ev-data.ts) at the new tariff', source: '' });
    continue;
  }
  let call = lib.slice(span[0], span[1]);
  const bo = /\{[^{}]*annualDepreciation[^{}]*\}/.exec(call);
  if (!bo) throw new Error(`${s.id}: build-up object not found`);
  const b = s.buildup;
  let nb: MachineRateBuildup, note: string, decision: string, source = '';
  if (g) {
    const ref = snapMach.get(g.refId)!.buildup!;
    const capex = g.refCapexGbp * b.annualDepreciation / ref.annualDepreciation;
    const kw = g.refKw != null ? g.refKw * impliedKw(b) / impliedKw(ref) : impliedKw(b);
    nb = {
      annualDepreciation: Math.round(capex / M.lifeYears),
      maintenance: Math.round(capex * M.maintenancePctOfCapex),
      energy: Math.round(kw * b.annualAvailableHours * b.machineUtilization * ELEC),
      floorSpace: b.floorSpace,
      indirectSupport: Math.round(capex * M.indirectPctOfCapex),
      financeCost: Math.round(capex / 2 * M.financeRate),
      annualAvailableHours: b.annualAvailableHours,
      machineUtilization: b.machineUtilization,
    };
    note = `${TAG}: machine only (the operator, overhead and margin are added by the costing). Capex £${Math.round(capex).toLocaleString('en-GB')}`
      + `${s.id === g.refId ? ` = ${g.basis}` : ` = ${g.refId} £${g.refCapexGbp.toLocaleString('en-GB')} (${g.basis}) × this machine's book size (depreciation ratio ${(b.annualDepreciation / ref.annualDepreciation).toFixed(3)})`}; `
      + `${kw.toFixed(1)} kW (${g.kwBasis}); ${M.lifeYears}-yr life (${M.lifeBasis}); maintenance ${M.maintenancePctOfCapex * 100}% (${M.maintenanceBasis}); `
      + `indirect ${M.indirectPctOfCapex * 100}% (${M.indirectBasis}); finance ${M.financeRate * 100}% on half (${M.financeBasis}); floor, hours, utilisation held; £${ELEC}/kWh. `
      + `Was £${s.gbpPerHr}/h (a build-up tuned to a shop rate). ${s.source.replace(/\s*Target [~£0-9./a-z ]+\.?/i, ' ').replace(/ \| UK book.*$/, '')}`;
    decision = `updated (capex rebuilt: ${g.id})`; source = g.source; rebuilt++;
  } else {
    nb = { ...b, energy: Math.round(b.energy * ELEC / OLD_ELEC) };
    note = `${s.source.replace(/ \| UK book.*$/, '')} | ${TAG}: energy re-priced at £${ELEC}/kWh (DESNZ manufacturing Q2 2026 + CCL); capital, maintenance, support HELD — capex not sourced this round`
      + `${/Target/.test(s.source) ? ' (this build-up was tuned to a target shop rate; it may include operator / overhead the costing also adds)' : ''}`;
    decision = 'updated (energy re-priced; capital HELD — capex not sourced)'; retariffed++;
  }
  const lit = `{ annualDepreciation: ${nb.annualDepreciation}, maintenance: ${nb.maintenance}, energy: ${nb.energy}, floorSpace: ${nb.floorSpace}, `
    + `indirectSupport: ${nb.indirectSupport}, financeCost: ${nb.financeCost}, annualAvailableHours: ${nb.annualAvailableHours}, machineUtilization: ${NUM(bo[0], 'machineUtilization').toFixed(2)} }`;
  call = call.slice(0, bo.index) + lit + call.slice(bo.index + bo[0].length);
  // the note is the call's last argument: one string, or strings joined by +
  const tail = /('UK'\s*,\s*)((?:'(?:[^'\\]|\\.)*'|`[^`]*`)(?:\s*\+\s*(?:'(?:[^'\\]|\\.)*'|`[^`]*`))*)(\s*,?\s*\)\s*)$/.exec(call);
  if (!tail) throw new Error(`${s.id}: note not found`);
  call = call.slice(0, tail.index) + tail[1] + `'${q(note)}'` + tail[3];
  lib = lib.slice(0, span[0]) + call + lib.slice(span[1]);
  register.push({ kind: 'machine', id: s.id, name: s.class, current: s.gbpPerHr, next: r2(computeMachineRateFromBuildup(nb)), unit: '£/h machine only', decision, basis: q(note), source });
}
// Country benchmark machines (…-cn, …-in): every build-up energy line in the library is read on the UK basis (a
// regional library backs the kWh out with UK_ELECTRICITY_GBP_PER_KWH), so restate theirs on the new basis — the kWh
// a regional library sees is unchanged. Nothing else moves.
for (const s of SNAP.machines.filter(x => x.region !== 'UK')) {
  const span = machineCalls(lib).get(s.id);
  if (!span || !s.buildup) throw new Error(`${s.id}: country benchmark call not found`);
  let call = lib.slice(span[0], span[1]);
  const nb = { ...s.buildup, energy: Math.round(s.buildup.energy * ELEC / OLD_ELEC) };
  call = call.replace(/(\benergy:\s*)[0-9.]+/, `$1${nb.energy}`);
  lib = lib.slice(0, span[0]) + call + lib.slice(span[1]);
  register.push({ kind: 'machine', id: s.id, name: s.class, current: s.gbpPerHr, next: r2(computeMachineRateFromBuildup(nb)), unit: '£/h (country benchmark)',
    decision: 'held (a country benchmark; energy line restated on the new UK basis, kWh unchanged)', basis: s.source, source: '' });
}

// ── report ───────────────────────────────────────────────────────────────────
const n = (k: string, d: string) => register.filter(r => r.kind === k && r.decision.startsWith(d)).length;
console.log(`${TAG}: materials ${n('material', 'updated')} updated / ${n('material', 'held')} held; labour ${n('labour', 'updated')} updated; `
  + `machines ${rebuilt} rebuilt on sourced capex, ${retariffed} energy only, ${n('machine', 'updated (energy re-priced; capital from')} line build-ups; energy £${OLD_ELEC} → £${ELEC}/kWh, gas £${SNAP.regional.energy.gasPerKwh} → £${GAS}`);
for (const r of register.filter(x => x.kind === 'machine' && x.decision.includes('capex rebuilt'))) console.log(`  ${r.id.padEnd(22)} £${r.current} → £${r.next}/h`);
const csv = ['kind,id,name,current,new,change %,unit,decision,basis,source',
  ...register.map(r => [r.kind, r.id, r.name, r.current ?? '', r.next ?? '', r.current && r.next != null ? r2((r.next / r.current - 1) * 100) : '', r.unit, r.decision, r.basis, r.source]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
if (!WRITE) { console.log('dry run — nothing written (add --write)'); process.exit(0); }

writeFileSync(resolve(ROOT, 'scripts/rate-refresh/uk-2026-10/register.csv'), csv + '\n');
if (/export const UK_BOOK_BASIS = /.test(lib)) lib = lib.replace(/export const UK_BOOK_BASIS = '[^']*';/, `export const UK_BOOK_BASIS = '${MONTH}';`);
else lib = lib.replace(/(export const RATE_BASIS = '[^']*';\n)/, `$1/** The month of the UK rate book (scripts/uk-book.ts) — the grades it re-priced carry it; the rest stay on RATE_BASIS. */\nexport const UK_BOOK_BASIS = '${MONTH}';\n`);
writeFileSync(LIB, lib);

const REG = resolve(ROOT, 'src/engine/regional-rates.ts');
let reg = readFileSync(REG, 'utf8');
const ukRe = /(  UK: \{\n    name: 'United Kingdom',[\s\S]*?)labour: \{[^}]*\},\n    energy: \{[^}]*\},/;
if (!ukRe.test(reg)) throw new Error('REGIONAL_DATA.UK not found');
const C = labourCat;
reg = reg.replace(ukRe, `$1labour: { skilled: ${C.skilled.gbpPerHr}, semiskilled: ${C.semiskilled.gbpPerHr}, engineer: ${C.engineer.gbpPerHr}, foundry: ${C.foundry.gbpPerHr}, `
  + `electronics: ${C.electronics.gbpPerHr}, inspector: ${C.inspector.gbpPerHr}, technician: ${C.technician.gbpPerHr}, supervisor: ${C.supervisor.gbpPerHr} },\n`
  + `    energy: { electricityPerKwh: ${ELEC}, gasPerKwh: ${GAS} },`);
writeFileSync(REG, reg);

const UKE = resolve(ROOT, 'src/engine/uk-energy.ts');
writeFileSync(UKE, readFileSync(UKE, 'utf8')
  .replace(/UK_ELECTRICITY_GBP_PER_KWH = [0-9.]+;/, `UK_ELECTRICITY_GBP_PER_KWH = ${ELEC};`)
  .replace(/UK_GAS_GBP_PER_KWH = [0-9.]+;/, `UK_GAS_GBP_PER_KWH = ${GAS};`));

const PCB = resolve(ROOT, 'server/data/pcb-country-rates.ts');
const pcb = readFileSync(PCB, 'utf8');
if (!/  gb: \{ kwh: [0-9.]+,/.test(pcb)) throw new Error('PCB gb tariff not found');
writeFileSync(PCB, pcb.replace(/  gb: \{ kwh: [0-9.]+,/, `  gb: { kwh: ${ELEC},`));
console.log('written: rate-library.ts, regional-rates.ts (UK), uk-energy.ts, pcb-country-rates.ts (gb), uk-2026-10/register.csv');
