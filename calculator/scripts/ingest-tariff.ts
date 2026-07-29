/**
 * UK Trade Tariff ingestion client.
 *
 * Pulls third-country duty rates and associated measures from the OFFICIAL
 * service and writes a dated snapshot the engine can load.
 *
 *   npx tsx scripts/ingest-tariff.ts                 # all codes the engine uses
 *   npx tsx scripts/ingest-tariff.ts 8708999790      # specific codes
 *   npx tsx scripts/ingest-tariff.ts --out data/tariff-snapshot.json
 *
 * ── IMPORTANT, READ BEFORE FIRST RUN ────────────────────────────────────────
 * The API is public, free and unauthenticated, but it was UNREACHABLE from the
 * environment this client was written in (every gov.uk host returns 403 through
 * that proxy). The response mapping below is therefore written from the
 * documented JSON:API shape and has NOT been validated against a live response.
 *
 * The client is deliberately STRICT: if the payload does not look like what it
 * expects, it records a failure for that code rather than guessing a rate.
 * A wrong rate is far more dangerous than a missing one.
 *
 * On the first supervised run, use --inspect to dump the raw payload for one
 * code and confirm the field mapping before trusting a full snapshot.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { HS_CANDIDATES } from '../src/engine/landed-cost-data.js';
import type { SnapshotRate, TariffSnapshot } from '../src/engine/tariff-snapshot.js';

const API = 'https://www.trade-tariff.service.gov.uk/api/v2/commodities';
const PAGE = 'https://www.trade-tariff.service.gov.uk/commodities';

const argv = process.argv.slice(2);
const inspect = argv.includes('--inspect');
const outIdx = argv.indexOf('--out');
const outPath = outIdx >= 0 ? argv[outIdx + 1] : 'data/tariff-snapshot.json';
const explicit = argv.filter(a => /^\d{8,10}$/.test(a));

/** Every commodity code the engine can use. */
function allEngineCodes(): string[] {
  const set = new Set<string>();
  for (const lines of Object.values(HS_CANDIDATES)) for (const l of lines) set.add(l.hsCode);
  return [...set].sort();
}

/**
 * Extract the third-country (erga omnes) duty from a JSON:API commodity payload.
 *
 * Returns null when it cannot be determined with confidence — never a guess.
 */
function extractThirdCountryDuty(payload: any): { pct: number | null; measures: SnapshotRate['measures']; why: string } {
  const included: any[] = Array.isArray(payload?.included) ? payload.included : [];
  if (included.length === 0) {
    return { pct: null, measures: [], why: 'payload has no `included` array — unexpected shape' };
  }

  const measureTypes = new Map<string, any>();
  const dutyExpressions = new Map<string, any>();
  const geoAreas = new Map<string, any>();
  for (const inc of included) {
    if (inc?.type === 'measure_type') measureTypes.set(inc.id, inc);
    if (inc?.type === 'duty_expression') dutyExpressions.set(inc.id, inc);
    if (inc?.type === 'geographical_area') geoAreas.set(inc.id, inc);
  }

  const measures = included.filter(i => i?.type === 'measure');
  if (measures.length === 0) {
    return { pct: null, measures: [], why: 'no measures found on this commodity' };
  }

  const parsePct = (s: unknown): number | null => {
    if (typeof s !== 'string') return null;
    // Duty expressions look like "4.50 %" or "10.00 % + 20.00 EUR / 100 kg"
    const m = /^\s*([\d.]+)\s*%\s*$/.exec(s);
    return m ? parseFloat(m[1]) : null;
  };

  let third: number | null = null;
  const found: NonNullable<SnapshotRate['measures']> = [];

  for (const m of measures) {
    const mtId = m?.relationships?.measure_type?.data?.id;
    const mt = mtId ? measureTypes.get(mtId) : undefined;
    const mtDesc: string = mt?.attributes?.description ?? '';
    const deId = m?.relationships?.duty_expression?.data?.id;
    const de = deId ? dutyExpressions.get(deId) : undefined;
    const pct = parsePct(de?.attributes?.base ?? de?.attributes?.formatted_base);

    const gaId = m?.relationships?.geographical_area?.data?.id;
    const ga = gaId ? geoAreas.get(gaId) : undefined;
    const gaId2: string = ga?.attributes?.id ?? gaId ?? '';

    // Third-country duty is the erga omnes ("1011"/"all countries") measure.
    if (/third country duty/i.test(mtDesc) && (gaId2 === '1011' || /erga omnes|all countries/i.test(ga?.attributes?.description ?? ''))) {
      if (pct !== null) third = pct;
    }
    if (/anti-dumping|countervailing|definitive/i.test(mtDesc)) {
      found.push({
        type: mtDesc,
        dutyPct: pct ?? undefined,
        originRegions: gaId2 ? [gaId2] : undefined,
        expires: m?.attributes?.effective_end_date ?? undefined,
      });
    }
  }

  return {
    pct: third,
    measures: found,
    why: third === null ? 'no erga-omnes third-country duty measure with a simple % rate' : 'ok',
  };
}

async function fetchCode(code: string): Promise<{ rate?: SnapshotRate; failure?: { hsCode: string; reason: string } }> {
  const url = `${API}/${code}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.uktt.v2' } });
    if (!res.ok) return { failure: { hsCode: code, reason: `HTTP ${res.status}` } };
    const payload = await res.json();

    if (inspect) {
      console.error(`\n─── RAW PAYLOAD ${code} ───`);
      console.error(JSON.stringify(payload, null, 2).slice(0, 4000));
      console.error('─── END ───\n');
    }

    const { pct, measures, why } = extractThirdCountryDuty(payload);
    if (pct === null) return { failure: { hsCode: code, reason: why } };

    return {
      rate: {
        hsCode: code,
        mfnDutyPct: pct,
        description: payload?.data?.attributes?.description ?? undefined,
        fetchedAt: new Date().toISOString(),
        sourceUrl: `${PAGE}/${code}`,
        status: 'verified',
        measures: measures && measures.length ? measures : undefined,
      },
    };
  } catch (e) {
    return { failure: { hsCode: code, reason: `fetch failed: ${(e as Error).message}` } };
  }
}

async function main() {
  const codes = explicit.length ? explicit : allEngineCodes();
  console.error(`Ingesting ${codes.length} commodity code(s) from ${API}`);

  const rates: SnapshotRate[] = [];
  const failures: Array<{ hsCode: string; reason: string }> = [];

  for (const code of codes) {
    const { rate, failure } = await fetchCode(code);
    if (rate) { rates.push(rate); console.error(`  ok    ${code}  ${rate.mfnDutyPct}%`); }
    if (failure) { failures.push(failure); console.error(`  FAIL  ${code}  ${failure.reason}`); }
    await new Promise(r => setTimeout(r, 250));   // be polite to a public service
  }

  const snapshot: TariffSnapshot = {
    snapshotId: new Date().toISOString(),
    source: 'UK Integrated Online Tariff (trade-tariff.service.gov.uk) API v2',
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    rates,
    failures: failures.length ? failures : undefined,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n');

  console.error(`\nWrote ${rates.length} verified rate(s) to ${outPath}`);
  if (failures.length) {
    console.error(`${failures.length} code(s) FAILED and were NOT written — they stay unverified rather than guessed.`);
    process.exitCode = 1;
  }
}

main();
