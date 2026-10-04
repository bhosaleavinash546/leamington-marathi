/**
 * Country expansion, October 2026 — writes the countries in
 * `scripts/rate-refresh/2026-10-countries.json` into the regional tables.
 *
 *   npx tsx scripts/region-expand.ts          # rewrite the generated blocks
 *   npx tsx scripts/region-expand.ts --check  # exit 1 if the files are not what the config gives
 *
 * WHY A SCRIPT. Every number comes from the config, where each one carries its
 * source; the arithmetic is here, once, so a reviewer can re-run it instead of
 * trusting typed literals. The blocks it writes sit between `⟪region-expand⟫`
 * markers and are plain literals afterwards, so `scripts/rate-refresh.ts` moves
 * them like any other country (it needs their wage growth and FX in its config —
 * it throws for a country it has no growth for, which is the point).
 *
 * Labour: the new country's eight categories = the ANALOGUE's 2026-09 categories
 * × (wage measure new ÷ analogue). Both sides of the ratio come from the same
 * source and the same measure, converted to £ at the same FX snapshot, so the
 * ratio carries no mixing of bases. The skill mix (skilled vs semi-skilled vs
 * engineer) is the analogue's — an assumption the doc states.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(readFileSync(resolve(ROOT, 'scripts/rate-refresh/2026-10-countries.json'), 'utf8'));
const REG = resolve(ROOT, 'src/engine/regional-rates.ts');
const AL = resolve(ROOT, 'src/engine/al-extrusion-data.ts');
const check = process.argv.includes('--check');

const { REGIONAL_DATA } = await import('../src/engine/regional-rates.js');
type RD = (typeof REGIONAL_DATA)[keyof typeof REGIONAL_DATA];

const fx = (ccy: string): number => {
  if (ccy === 'GBP') return 1;
  const v = CFG.fx[ccy];
  if (!v) throw new Error(`no FX for ${ccy}`);
  return v;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const sig4 = (n: number) => Number(n.toPrecision(4));

interface Country {
  code: string; name: string; group: string; currency: string; analogue: string;
  labour: { measure: string; value: number; analogueValue: number; unit: string; valueCcy?: string; analogueCcy?: string };
  electricity: { source: string; value: number; unit: string };
  gas: { source?: string; value?: number; unit?: string; heldFrom?: string; note?: string };
  billet: { usdPerT: number; sourced: boolean; basis: string };
  surface: { effluent: number; chemical: number };
  spellings: string[];
}

/** £ per unit of the energy figure as published. */
function energyGbp(value: number, unit: string): number {
  if (unit === 'EUR c/kWh') return value / 100 / fx('EUR');
  if (unit === 'USD/kWh') return value / fx('USD');
  const m = unit.match(/^([A-Z]{3})\/kWh$/);
  if (m) return value / fx(m[1]);
  throw new Error(`energy unit ${unit}`);
}

export function labourRatio(c: Country): number {
  const l = c.labour;
  // Same currency on both sides (EUR or USD measures) → the ratio is direct.
  const a = l.valueCcy ? l.value / fx(l.valueCcy) : l.value;
  const b = l.analogueCcy ? l.analogueValue / fx(l.analogueCcy) : l.analogueValue;
  return a / b;
}

const countries: Country[] = CFG.countries;
const entries: string[] = [], names: string[] = [], surf: string[] = [], billet: string[] = [], spell: string[] = [];
for (const c of countries) {
  const an = REGIONAL_DATA[c.analogue as keyof typeof REGIONAL_DATA] as RD;
  if (!an) throw new Error(`${c.code}: analogue ${c.analogue} is not a region`);
  // Multipliers from a better-matched country where the labour analogue's would contradict the country (Singapore).
  const mx = REGIONAL_DATA[(c.multipliersFrom ?? c.analogue) as keyof typeof REGIONAL_DATA] as RD;
  const k = labourRatio(c);
  const lab = Object.fromEntries(Object.entries(an.labour).map(([g, v]) => [g, r2((v as number) * k)]));
  const elec = r3(energyGbp(c.electricity.value, c.electricity.unit));
  const gas = c.gas.heldFrom
    ? (REGIONAL_DATA[c.gas.heldFrom as keyof typeof REGIONAL_DATA] as RD).energy.gasPerKwh
    : r3(energyGbp(c.gas.value!, c.gas.unit!));
  const l = c.labour;
  const shown = (v: number, ccy?: string) => ccy ? `${ccy} ${v}` : `${v} ${l.unit}`;
  const lines = [
    `  // ${c.name}: labour = ${c.analogue} × ${k.toFixed(4)} (${shown(l.value, l.valueCcy)} ÷ ${shown(l.analogueValue, l.analogueCcy)}, ${l.measure}); `
      + `electricity ${c.electricity.value} ${c.electricity.unit} (${c.electricity.source}); `
      + (c.gas.heldFrom ? `gas held from ${c.gas.heldFrom} (not sourced); ` : `gas ${c.gas.value} ${c.gas.unit} (${c.gas.source}${c.gas.note ? ', ' + c.gas.note : ''}); `)
      + `multipliers held from ${c.multipliersFrom ?? c.analogue} (estimate). scripts/rate-refresh/2026-10-countries.json`,
    `  ${c.code}: {`,
    `    name: '${c.name}',`,
    `    currency: '${c.currency}',`,
    `    fxToGBP: ${sig4(fx(c.currency))},`,
    `    labour: { ${Object.entries(lab).map(([g, v]) => `${g}: ${(v as number).toFixed(2)}`).join(', ')} },`,
    `    energy: { electricityPerKwh: ${elec}, gasPerKwh: ${gas} },`,
    `    materialFactors: { commodityResin: ${mx.materialFactors.commodityResin.toFixed(3)}, engineeringResin: ${mx.materialFactors.engineeringResin.toFixed(2)}, highPerfResin: ${mx.materialFactors.highPerfResin.toFixed(3)} },`,
    `    materialMultiplier: ${mx.materialMultiplier},`,
    `    machineRateMultiplier: ${mx.machineRateMultiplier},`,
    `    overheadMultiplier: ${mx.overheadMultiplier},`,
    `    packagingMultiplier: ${mx.packagingMultiplier},`,
    `    logisticsMultiplier: ${mx.logisticsMultiplier},`,
    `  },`,
  ];
  entries.push(lines.join('\n'));
  names.push(`  ${c.code}: '${c.name}',`);
  surf.push(`  ${c.code}: { effluent: ${c.surface.effluent.toFixed(2)}, chemical: ${c.surface.chemical.toFixed(2)} },`);
  billet.push(`  ${c.code}: { usdPerT: ${c.billet.usdPerT}, sourced: ${c.billet.sourced}, basis: '${c.billet.basis.replace(/'/g, '’')}' },`);
  if (c.spellings.length) spell.push(`  ${c.code}: [${c.spellings.map(s => `'${s}'`).join(', ')}],`);
}

const OPEN = '// ⟪region-expand 2026-10 — generated by scripts/region-expand.ts; edit the config, not these lines⟫';
const CLOSE = '// ⟪/region-expand⟫';
/** Replace (or insert) the generated block inside the object literal `export const <name>`. */
function writeBlock(src: string, name: string, body: string[]): string {
  const at = src.search(new RegExp(`(export )?const ${name}\\b`));
  if (at < 0) throw new Error(`${name} not found`);
  const end = src.indexOf('\n};', at);
  let sec = src.slice(at, end);
  const block = `\n  ${OPEN}\n${body.join('\n')}\n  ${CLOSE}`;
  const o = sec.indexOf(`\n  ${OPEN}`);
  if (o >= 0) sec = sec.slice(0, o) + block + sec.slice(sec.indexOf(CLOSE, o) + CLOSE.length);
  else sec = sec + block;
  return src.slice(0, at) + sec + src.slice(end);
}

let reg = readFileSync(REG, 'utf8');
const before = reg;
const codes = countries.map(c => `'${c.code}'`).join(' | ');
reg = reg.replace(/(\n  \| 'TR' \| 'CN' \| 'IN' \| 'MX' \| 'US' \| 'TH' \| 'VN' \| 'BR' \| 'KR')(\n  \| [^;]*)?;/, `$1\n  | ${codes};`);
reg = writeBlock(reg, 'REGION_NAMES', names);
reg = writeBlock(reg, 'REGIONAL_DATA', entries);
reg = writeBlock(reg, 'SURFACE_REGIONAL_FACTORS', surf);
reg = writeBlock(reg, 'REGION_SPELLINGS', spell);
let al = readFileSync(AL, 'utf8');
const alBefore = al;
al = writeBlock(al, 'BILLET_PREMIUM_USD_PER_T', billet);

if (check) {
  const stale = [reg !== before && 'regional-rates.ts', al !== alBefore && 'al-extrusion-data.ts'].filter(Boolean);
  if (stale.length) { console.error(`out of date: ${stale.join(', ')} — run npx tsx scripts/region-expand.ts`); process.exit(1); }
  console.log(`${countries.length} countries — generated blocks match the config`);
} else {
  writeFileSync(REG, reg);
  writeFileSync(AL, al);
  for (const c of countries) console.log(`${c.code} ${c.name.padEnd(13)} labour ×${labourRatio(c).toFixed(4)} vs ${c.analogue}`);
}
