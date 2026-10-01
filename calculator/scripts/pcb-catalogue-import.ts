/**
 * Component catalogue import — keeps server/data/pcb-component-catalogue.json
 * current without a paid pricing API.
 *
 *   npx tsx scripts/pcb-catalogue-import.ts quote.csv --source "Digi-Key quote 2026-10-01" [--write]
 *   npx tsx scripts/pcb-catalogue-import.ts --nexar part1 part2 … [--write]       (needs OCTOPART_CLIENT_ID/SECRET)
 *
 * CSV: a distributor cart / quote / "my list" export (Digi-Key, Mouser, Farnell,
 * RS, Arrow all export one). Columns are found by name: a part-number column
 * (Manufacturer Part Number / MPN / Part Number), a unit-price column (Unit Price
 * / Price), optionally Quantity, Currency, Manufacturer, Description. Prices in
 * USD or EUR are converted with the FX in the catalogue header. Every imported
 * line becomes a `distributor` entry (replacing an `estimate` of the same MPN)
 * with the source and today's date, so the screen can say where a price came from.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'server/data/pcb-component-catalogue.json');

interface Entry { mpn: string; family: string; mfr: string; desc: string; category: string; pkg: string; aecq: boolean;
  gbp: { q1k: number; q10k: number; q100k: number }; confidence: 'distributor' | 'estimate'; source: string; asOf: string }
interface Catalogue { asOf: string; fxUsdToGbp: number; fxEurToGbp?: number; currency: string; basis: string; provenance: Record<string, string>; parts: Entry[] }

const args = process.argv.slice(2);
const write = args.includes('--write');
const srcIdx = args.indexOf('--source');
const sourceLabel = srcIdx >= 0 ? args[srcIdx + 1] : 'distributor export';
const cat: Catalogue = JSON.parse(readFileSync(FILE, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '');

/** Breaks from one observed price: the franchise curve (10k = 1k × 0.85, 100k = 1k × 0.72). */
function breaksFrom(unitGBP: number, qty: number): Entry['gbp'] {
  // Bring the observed price to the 1k level first.
  const to1k = qty >= 100000 ? unitGBP / 0.72 : qty >= 10000 ? unitGBP / 0.85 : qty >= 1000 ? unitGBP : qty >= 100 ? unitGBP * 0.85 : unitGBP * 0.6;
  return { q1k: r4(to1k), q10k: r4(to1k * 0.85), q100k: r4(to1k * 0.72) };
}

function upsert(e: Omit<Entry, 'asOf' | 'confidence'>): 'added' | 'replaced' {
  const i = cat.parts.findIndex(p => norm(p.mpn) === norm(e.mpn));
  const entry: Entry = { ...e, confidence: 'distributor', asOf: today };
  if (i >= 0) { cat.parts[i] = { ...cat.parts[i], ...entry }; return 'replaced'; }
  cat.parts.push(entry); return 'added';
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const col = (hdr: string[], ...names: RegExp[]) => hdr.findIndex(h => names.some(n => n.test(h.trim())));

async function importCSV(file: string): Promise<void> {
  const rows = parseCSV(readFileSync(resolve(process.cwd(), file), 'utf8'));
  const hdr = rows[0].map(h => h.toLowerCase());
  const cMpn = col(hdr, /manufacturer part|mfr.? part|\bmpn\b|^part ?(number|no|#)?$/);
  const cPrice = col(hdr, /unit price|^price$|price \(|unit cost/);
  const cQty = col(hdr, /^quantity$|^qty$|order qty|quantity ordered/);
  const cCur = col(hdr, /currency/);
  const cMfr = col(hdr, /^manufacturer$|^mfr$|brand/);
  const cDesc = col(hdr, /description/);
  if (cMpn < 0 || cPrice < 0) throw new Error(`no part-number / unit-price columns in: ${rows[0].join(' | ')}`);
  let added = 0, replaced = 0;
  for (const r of rows.slice(1)) {
    const mpn = (r[cMpn] ?? '').trim();
    const price = Number(String(r[cPrice] ?? '').replace(/[^0-9.]/g, ''));
    if (!mpn || !(price > 0)) continue;
    const qty = cQty >= 0 ? Number(String(r[cQty]).replace(/[^0-9]/g, '')) || 1 : 1;
    const cur = (cCur >= 0 ? r[cCur] : (String(r[cPrice]).includes('$') ? 'USD' : String(r[cPrice]).includes('€') ? 'EUR' : 'GBP')).toUpperCase().trim();
    const gbp = cur.startsWith('USD') || cur === '$' ? price * cat.fxUsdToGbp : cur.startsWith('EUR') || cur === '€' ? price * (cat.fxEurToGbp ?? cat.fxUsdToGbp * 1.17) : price;
    const existing = cat.parts.find(p => norm(p.mpn) === norm(mpn));
    const res = upsert({
      mpn, family: existing?.family ?? mpn.replace(/[-/,].*$/, ''), mfr: (cMfr >= 0 ? r[cMfr] : existing?.mfr) ?? '', desc: (cDesc >= 0 ? r[cDesc] : existing?.desc) ?? '',
      category: existing?.category ?? 'ic_soic', pkg: existing?.pkg ?? '', aecq: existing?.aecq ?? /AEC|Q1\b|-Q1/i.test(`${mpn} ${r[cDesc] ?? ''}`),
      gbp: breaksFrom(gbp, qty), source: `${sourceLabel}: ${cur} ${price} @${qty}`,
    });
    if (res === 'added') added++; else replaced++;
  }
  console.log(`${added} added, ${replaced} replaced from ${file}`);
}

async function importNexar(parts: string[]): Promise<void> {
  const { fetchLivePrices, resolveNexarAccessToken } = await import('../server/utils/pcb-live-pricing.js');
  const key = await resolveNexarAccessToken();
  if (!key) throw new Error('OCTOPART_CLIENT_ID / OCTOPART_CLIENT_SECRET not set');
  const hits = await fetchLivePrices(parts, 'octopart', key, 1000);
  for (const h of hits) {
    const existing = cat.parts.find(p => norm(p.mpn) === norm(h.mpn));
    upsert({ mpn: h.mpn, family: existing?.family ?? h.mpn.replace(/[-/,].*$/, ''), mfr: h.manufacturer || existing?.mfr || '', desc: h.description || existing?.desc || '',
      category: existing?.category ?? 'ic_soic', pkg: existing?.pkg ?? '', aecq: h.automotiveGrade || existing?.aecq || false,
      gbp: breaksFrom(h.unitPriceGBP, h.priceBreakQty), source: `Nexar (${h.provider}) ${h.rawCurrency} ${h.rawUnitPrice} @${h.priceBreakQty}` });
  }
  console.log(`${hits.length} of ${parts.length} parts priced from Nexar`);
}

(async () => {
  if (args.includes('--nexar')) await importNexar(args.filter(a => !a.startsWith('--') && a !== sourceLabel));
  else {
    const file = args.find(a => !a.startsWith('--') && a !== sourceLabel);
    if (!file) { console.error('usage: pcb-catalogue-import.ts <export.csv> --source "label" [--write] | --nexar MPN… [--write]'); process.exit(2); }
    await importCSV(file);
  }
  cat.asOf = today;
  if (write) { writeFileSync(FILE, JSON.stringify(cat, null, 0)); console.log(`written: ${cat.parts.length} parts`); }
  else console.log('dry run — pass --write');
})().catch(e => { console.error(e.message); process.exit(1); });
