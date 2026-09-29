/**
 * Rate refresh — move the built-in rates from one dated index basis to the next.
 *
 *   npx tsx scripts/rate-refresh.ts scripts/rate-refresh/2026-09.json          # dry run: prints every change
 *   npx tsx scripts/rate-refresh.ts scripts/rate-refresh/2026-09.json --write  # rewrites the rate files
 *
 * WHY A SCRIPT. The rates are literals in rate-library.ts and regional-rates.ts,
 * so they read as plain numbers and every test and export sees the same value.
 * But a literal carries no trail of how it moved. The config file named on the
 * command line is that trail: every index at the old anchor and now, with its
 * source, and every rule that turns an index move into a rate move. Run it
 * again on the same config and nothing changes (the old values are asserted).
 *
 * THE RULES (one line each, so they can be argued with):
 *  - Material £/kg moves by what the material CONTAINS: Σ (kg of commodity per
 *    kg of material) × (change in that commodity's £/kg, FX included). Mill,
 *    conversion, alloy and small-lot premiums are held — they are not indexed
 *    and three months is too short to claim they moved. Scrap recovery moves by
 *    the same £/kg change times its own ratio to price (scrap is metal value).
 *    A material with no published index move is held, and says so.
 *  - Labour £/hr = old × local wage growth over the period × (old FX ÷ new FX).
 *  - Machine £/hr is rebuilt from its build-up: depreciation × machinery PPI,
 *    maintenance × ½PPI+½wages, energy × electricity tariff, floor × rent,
 *    indirect support × wages, finance × cost of capital.
 *  - IDs are never touched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Ccy = string;
/** oldFx: the FX the old anchor was converted at when the library was built
 *  (1 GBP = X). Defaults to the market rate on the old date (fx.june). */
interface IndexDef { unit: string; ccy: Ccy; perKgDivisor: number; old: number; now: number; source: string; note?: string; oldFx?: number; held?: boolean }
/** drivers: [index, kg of that commodity per kg of material]. pct: an index
 *  published only as a % move (e.g. a coatings maker's price increase) — the
 *  whole price moves by it. */
/** floor (default true): never price below the commodity the material contains. */
interface MaterialRule { match: string; drivers: [string, number][]; pct?: string; note?: string; floor?: boolean }
interface Config {
  asOf: string; version: string; label: string;
  /** 1 GBP = X. file: the value the rate files hold now (asserted); june: the
   *  market rate on the old anchor date; now: the market rate today. */
  fx: Record<Ccy, { file: number; june: number; now: number; source: string }>;
  indices: Record<string, IndexDef>;
  materialRules: MaterialRule[];                                            // first match wins; id regex
  labour: { ukGrowth: number; ukSource: string; regions: Record<string, { growth: number; source: string; grades?: Record<string, number> }> };
  energy: Record<string, { electricityPerKwh?: number; gasPerKwh?: number; source: string }>;
  machines: { ppi: number; wages: number; electricity: number; rent: number; capital: number; source: string };
}

const ROOT = resolve(import.meta.dirname, '..');
const LIB = resolve(ROOT, 'src/engine/rate-library.ts');
const REG = resolve(ROOT, 'src/engine/regional-rates.ts');
const INS = resolve(ROOT, 'src/engine/insights.ts');

const cfgPath = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!cfgPath) { console.error('usage: rate-refresh.ts <config.json> [--write]'); process.exit(2); }
const cfg = JSON.parse(readFileSync(resolve(process.cwd(), cfgPath), 'utf8')) as Config;

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2));

/** £/kg of an index at the old anchor and now (FX of each date). */
function perKgGBP(key: string): { old: number; now: number } {
  const d = cfg.indices[key];
  if (!d) throw new Error(`index "${key}" is used by a rule but not defined`);
  const fx = d.ccy === 'GBP' ? { june: 1, now: 1 } : cfg.fx[d.ccy];
  if (!fx) throw new Error(`index "${key}" is in ${d.ccy}, which has no FX entry`);
  return { old: d.old / d.perKgDivisor / (d.oldFx ?? fx.june), now: d.now / d.perKgDivisor / fx.now };
}

/** Find the object literal `{ ... id: '<id>' ... }` in `src` and return its span. */
function objectSpan(src: string, id: string): [number, number] {
  const at = src.indexOf(`id: '${id}'`);
  if (at < 0) throw new Error(`id ${id} not found`);
  let open = at, depth = 0;
  for (; open >= 0; open--) { const c = src[open]; if (c === '}') depth++; else if (c === '{') { if (depth === 0) break; depth--; } }
  let close = at; depth = 0;
  for (; close < src.length; close++) { const c = src[close]; if (c === '{') depth++; else if (c === '}') { if (depth === 0) break; depth--; } }
  return [open, close + 1];
}

function setNum(obj: string, field: string, value: number, digits = 2): string {
  const re = new RegExp(`(\\b${field}:\\s*)(-?[0-9.]+)`);
  if (!re.test(obj)) throw new Error(`field ${field} missing`);
  return obj.replace(re, `$1${value.toFixed(digits)}`);
}
function getNum(obj: string, field: string): number {
  const m = obj.match(new RegExp(`\\b${field}:\\s*(-?[0-9.]+)`));
  if (!m) throw new Error(`field ${field} missing`);
  return Number(m[1]);
}
function stamp(obj: string, note: string, date: string): string {
  let out = obj.replace(/(effectiveDate:\s*)'[^']*'/, `$1'${date}'`);
  out = out.replace(/(sourceNote:\s*)'((?:[^'\\]|\\.)*)'/, (_m, p, s: string) => {
    const kept = s.replace(/ \| Refresh \d{4}-\d{2}:.*$/, '');
    return `${p}'${kept} | Refresh ${cfg.label}: ${note.replace(/'/g, '’')}'`;
  });
  return out;
}

const log: string[] = [];
const warnings: string[] = [];
let lib = readFileSync(LIB, 'utf8');

// ── Materials ────────────────────────────────────────────────────────────────
const matIds = [...lib.matchAll(/id: '(mat-[a-z0-9-]+)'/g)].map(m => m[1]);
const matSummary = { moved: 0, held: 0 };
const deltaById: Record<string, number> = {};
for (const id of matIds) {
  const rule = cfg.materialRules.find(r => new RegExp(r.match).test(id));
  if (!rule) throw new Error(`no material rule matches ${id} — add one (use drivers [] to hold it)`);
  const [a, b] = objectSpan(lib, id);
  let obj = lib.slice(a, b);
  const price = getNum(obj, 'pricePerKg');
  const scrap = getNum(obj, 'scrapRecoveryPricePerKg');
  if (id === 'mat-virtual') continue; // placeholder: not a priced material
  if (!rule.drivers.length && !rule.pct) {
    matSummary.held++;
    deltaById[id] = 0;
    obj = stamp(obj, rule.note ?? 'no published index move — held', cfg.asOf.slice(0, 7));
    lib = lib.slice(0, a) + obj + lib.slice(b);
    continue;
  }
  let delta = 0; const parts: string[] = [];
  if (rule.pct) {
    const d = cfg.indices[rule.pct];
    if (!d) throw new Error(`index "${rule.pct}" is used by a rule but not defined`);
    delta += price * (d.now / d.old - 1);
    parts.push(`${rule.pct} ${((d.now / d.old - 1) * 100).toFixed(1)}%`);
  }
  for (const [key, kg] of rule.drivers) {
    const p = perKgGBP(key);
    delta += kg * (p.now - p.old);
    parts.push(`${kg}kg ${key} £${p.old.toFixed(3)}→£${p.now.toFixed(3)}/kg`);
  }
  // A material cannot cost less than the commodity it is made of. Where the old
  // level was so stale that it would, it is floored at that content and flagged.
  const content = rule.drivers.filter(([key]) => !cfg.indices[key].held).reduce((t, [key, kg]) => t + kg * perKgGBP(key).now, 0);
  if (rule.floor !== false && price + delta < content - 0.005) {
    warnings.push(`${id}: indexed £${(price + delta).toFixed(2)}/kg is below its own commodity content £${content.toFixed(2)}/kg — floored at content; confirm with a supplier quote`);
    parts.push(`floored at commodity content £${content.toFixed(2)}/kg (previous level was below the metal it contains)`);
    delta = Math.ceil(content * 100) / 100 - price;
  }
  deltaById[id] = delta;
  const newPrice = Math.max(0.01, r2(price + delta));
  const newScrap = price > 0 ? Math.max(0, r2(scrap * (newPrice / price))) : scrap;
  obj = setNum(obj, 'pricePerKg', newPrice);
  obj = setNum(obj, 'scrapRecoveryPricePerKg', newScrap);
  obj = stamp(obj, `${delta >= 0 ? '+' : '−'}£${Math.abs(delta).toFixed(3)}/kg from ${parts.join(', ')}; premiums held`, cfg.asOf.slice(0, 7));
  lib = lib.slice(0, a) + obj + lib.slice(b);
  matSummary.moved++;
  if (Math.abs(newPrice - price) >= 0.005) log.push(`material ${id}: £${fmt(price)} → £${fmt(newPrice)}`);
}

// ── Machines: rebuild each build-up component ─────────────────────────────────
const M = cfg.machines;
const machFactors: Record<string, number> = {
  annualDepreciation: M.ppi,
  maintenance: 0.5 * M.ppi + 0.5 * M.wages,
  energy: M.electricity,
  floorSpace: M.rent,
  indirectSupport: M.wages,
  financeCost: M.capital,
};
{
  const start = lib.indexOf('  machines: [');
  const end = lib.indexOf('\n  ],', start);
  let sec = lib.slice(start, end);
  let n = 0;
  for (const [field, f] of Object.entries(machFactors)) {
    sec = sec.replace(new RegExp(`\\b(${field}:\\s*)([0-9.]+)`, 'g'), (_m, p, v) => { n++; return `${p}${Math.round(Number(v) * f)}`; });
  }
  sec = sec.replace(/effectiveDate: '2026-06-14'/, `effectiveDate: '${cfg.asOf}'`); // makeMachine default is set below
  lib = lib.slice(0, start) + sec + lib.slice(end);
  log.push(`machines: ${n / 6} build-ups rebuilt (depreciation ×${M.ppi.toFixed(4)}, maintenance ×${machFactors.maintenance.toFixed(4)}, energy ×${M.electricity.toFixed(4)}, floor ×${M.rent.toFixed(4)}, indirect ×${M.wages.toFixed(4)}, finance ×${M.capital.toFixed(4)})`);
}
lib = lib.replace(/(function makeMachine[\s\S]*?effectiveDate: )'[^']*'/, `$1'${cfg.asOf}'`);

// ── Library labour (lab-<region>-<grade>) ────────────────────────────────────
const regionOfLab: Record<string, string> = { uk: 'UK', in: 'IN', cn: 'CN', mx: 'MX', pl: 'PL', de: 'DE', tr: 'TR', vn: 'VN', th: 'TH', br: 'BR', kr: 'KR', cz: 'CZ', ro: 'RO', hu: 'HU', us: 'US', fr: 'FR', it: 'IT', es: 'ES', se: 'SE', nl: 'NL' };
const ccyOf: Record<string, string> = { UK: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', PL: 'PLN', CZ: 'CZK', RO: 'RON', HU: 'HUF', SE: 'SEK', TR: 'TRY', CN: 'CNY', IN: 'INR', MX: 'MXN', US: 'USD', TH: 'THB', VN: 'VND', BR: 'BRL', KR: 'KRW' };
function labourFactor(region: string, grade?: string): { f: number; why: string } {
  const g = region === 'UK' ? { growth: cfg.labour.ukGrowth, source: cfg.labour.ukSource } : cfg.labour.regions[region];
  if (!g) throw new Error(`no labour growth for ${region}`);
  const growth = (grade && cfg.labour.regions[region]?.grades?.[grade]) ?? g.growth;
  const ccy = ccyOf[region];
  const fx = ccy === 'GBP' ? { june: 1, now: 1 } : cfg.fx[ccy];
  const f = (1 + growth) * (fx.june / fx.now);
  return { f, why: `local wages ${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(2)}% (${g.source})${ccy === 'GBP' ? '' : `; ${ccy} ${fx.june}→${fx.now} per £`}` };
}
for (const m of lib.matchAll(/id: '(lab-([a-z]+)-([a-z]+))'/g)) {
  const [, id, rc, grade] = m;
  const region = regionOfLab[rc];
  if (!region) throw new Error(`labour ${id}: unknown region code ${rc}`);
  const [a, b] = objectSpan(lib, id);
  let obj = lib.slice(a, b);
  const old = getNum(obj, 'fullyLoadedRatePerHr');
  const { f, why } = labourFactor(region, grade);
  const now = r2(old * f);
  obj = setNum(obj, 'fullyLoadedRatePerHr', now);
  obj = stamp(obj, why, cfg.asOf);
  lib = lib.slice(0, a) + obj + lib.slice(b);
  log.push(`labour ${id}: £${fmt(old)} → £${fmt(now)} (${why})`);
}

// ── Library energy + fx lists ─────────────────────────────────────────────────
for (const [key, e] of Object.entries(cfg.energy)) {
  const id = `energy-${key.toLowerCase()}`;
  if (!lib.includes(`id: '${id}'`)) continue;
  const [a, b] = objectSpan(lib, id);
  let obj = lib.slice(a, b);
  if (e.electricityPerKwh !== undefined) obj = setNum(obj, 'electricityPerKwh', e.electricityPerKwh, 3);
  if (e.gasPerKwh !== undefined) obj = setNum(obj, 'gasPerKwh', e.gasPerKwh, 3);
  obj = stamp(obj, e.source, cfg.asOf);
  lib = lib.slice(0, a) + obj + lib.slice(b);
}
for (const [ccy, fx] of Object.entries(cfg.fx)) {
  const id = `fx-gbp-${ccy.toLowerCase()}`;
  if (!lib.includes(`id: '${id}'`)) continue;
  const [a, b] = objectSpan(lib, id);
  let obj = lib.slice(a, b);
  if (getNum(obj, 'rate') !== fx.file) throw new Error(`${id}: library rate ${getNum(obj, 'rate')} is not the config's file value ${fx.file}`);
  obj = obj.replace(/(\brate:\s*)[0-9.]+/, `$1${fx.now}`).replace(/(effectiveDate:\s*)'[^']*'/, `$1'${cfg.asOf}'`)
    .replace(/(sourceNote:\s*)'[^']*'/, `$1'${fx.source}'`);
  lib = lib.slice(0, a) + obj + lib.slice(b);
}
lib = lib.replace(/export const RATE_BASIS = '[^']*';/, `export const RATE_BASIS = '${cfg.asOf.slice(0, 7)}';`);
lib = lib.replace(/(DEFAULT_RATE_LIBRARY: RateLibrary = \{\s*version: )'[^']*'(,\s*lastModified: )'[^']*'/, `$1'${cfg.version}'$2'${cfg.asOf}'`);

// ── Regional data ────────────────────────────────────────────────────────────
let reg = readFileSync(REG, 'utf8');
for (const [region, ccy] of Object.entries(ccyOf)) {
  const start = reg.indexOf(`\n  ${region}: {`, reg.indexOf('export const REGIONAL_DATA'));
  const end = reg.indexOf('\n  },', start);
  let block = reg.slice(start, end);
  // Labour: every grade × local growth × FX move.
  block = block.replace(/labour: \{([^}]*)\}/, (_m, body: string) => 'labour: {' + body.replace(/(\w+): ([0-9.]+)/g, (_x, g, v) => {
    const { f } = labourFactor(region, g);
    return `${g}: ${(r2(Number(v) * f)).toFixed(2)}`;
  }) + '}');
  if (ccy !== 'GBP') {
    const fx = cfg.fx[ccy];
    const cur = Number(block.match(/fxToGBP: ([0-9.]+)/)![1]);
    if (cur !== fx.file) throw new Error(`${region} fxToGBP ${cur} is not the config's file value ${fx.file}`);
    block = block.replace(/fxToGBP: [0-9.]+/, `fxToGBP: ${fx.now}`);
  }
  const e = cfg.energy[region];
  if (e?.electricityPerKwh !== undefined) block = block.replace(/electricityPerKwh: [0-9.]+/, `electricityPerKwh: ${e.electricityPerKwh}`);
  if (e?.gasPerKwh !== undefined) block = block.replace(/gasPerKwh: [0-9.]+/, `gasPerKwh: ${e.gasPerKwh}`);
  reg = reg.slice(0, start) + block + reg.slice(end);
}
// Country-specific extrusion / thermoforming prices: the resin they contain is
// the same traded commodity, so they move by the same £/kg as the UK grade.
for (const table of ['EXTRUSION_COUNTRY_PRICES', 'THERMOFORMING_COUNTRY_PRICES']) {
  const start = reg.indexOf(`export const ${table}`);
  const end = reg.indexOf('\n};', start);
  const sec = reg.slice(start, end).replace(/'(mat-[a-z0-9-]+)':(\s*)\{([^}]*)\}/g, (_m, id: string, sp: string, body: string) => {
    const d = deltaById[id];
    if (d === undefined) throw new Error(`${table}: ${id} is not a moved material — give it a rule`);
    return `'${id}':${sp}{` + body.replace(/([A-Z]{2}): ([0-9.]+)/g, (_x, rc, v) => `${rc}: ${Math.max(0.01, r2(Number(v) + d)).toFixed(2)}`) + '}';
  });
  reg = reg.slice(0, start) + sec + reg.slice(end);
}
if (cfg.energy.UK?.electricityPerKwh !== undefined) {
  // Machine build-ups carry energy as £ at the UK tariff; the regional re-tariff
  // backs kWh out with this basis, so it must move with the UK tariff.
  reg = reg.replace(/const UK_ELECTRICITY_BASIS_PER_KWH = [0-9.]+;/, `const UK_ELECTRICITY_BASIS_PER_KWH = ${cfg.energy.UK.electricityPerKwh};`);
}
reg = reg.replace(/2026 Q2/g, cfg.label);

// ── insights.ts FX table (price of 1 unit in GBP) ────────────────────────────
let ins = readFileSync(INS, 'utf8');
for (const [ccy, fx] of Object.entries(cfg.fx)) {
  ins = ins.replace(new RegExp(`(\\b${ccy}: )[0-9.]+`), `$1${(1 / fx.now).toPrecision(4)}`);
}
ins = ins.replace(/Jun 2026 BOE rates\./, `${cfg.label} rates (${cfg.fx.EUR.source}).`);

console.log(log.join('\n'));
console.log(`\nmaterials: ${matSummary.moved} mapped to an index, ${matSummary.held} with no index (held)`);
if (warnings.length) console.log(`\nLEVEL WARNINGS (${warnings.length}):\n  ` + warnings.join('\n  '));
if (WRITE) {
  writeFileSync(LIB, lib); writeFileSync(REG, reg); writeFileSync(INS, ins);
  console.log('written.');
} else console.log('dry run — pass --write to apply.');
