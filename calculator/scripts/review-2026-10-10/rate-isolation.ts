/**
 * Rate isolation check (demo review, 10 Oct 2026): cost the six review parts headless in CN / IN / UK and test every
 * rate the costing used against THAT country's book — material £/kg and scrap, each operation's machine and labour
 * £/h — and flag any figure that equals the UK book where the country book differs (a leak).
 *   npx tsx scripts/review-2026-10-10/rate-isolation.ts > out.json
 */
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
import { buildRegionalLibrary } from '../../src/engine/regional-rates.js';

const PARTS = ['PRCR002.stp', 'Casting_Braket.stp', 'IM_ECU_Cover.stp', 'IM_Storage_Tray.stp', 'Seat_Locking_Bracket.stp', 'BIW_Inner_Panel.stp'];
const fixture = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; answers: Record<string, string>; geometry: never; outcome: { commodity?: string } }>;
const UK = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const log = console.log; console.log = () => {}; console.warn = () => {};
const out: unknown[] = [];
for (const region of ['CN', 'IN', 'UK'] as const) {
  const book = buildRegionalLibrary(UK, region);
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  for (const name of PARTS) {
    const p = fixture.find(f => f.part === name)!;
    const r = await costMeasuredPart(structuredClone(p.geometry), name, { partNumber: name, file: name, annualVolume: 100_000, commodity: p.outcome.commodity } as never,
      p.answers, region, { annualVolume: 100_000 } as never, UK, { partNumber: name, file: name, status: 'error' } as never) as any;
    const issues: string[] = [];
    const ops = r.trace?.operations ?? [];
    for (const o of ops) {
      const m = book.machines.find(x => x.id === o.machineId), u = UK.machines.find(x => x.id === o.machineId);
      if (o.machineId && m && o.machineRateUsed !== undefined && !close(o.machineRateUsed, m.computedRatePerHr)) issues.push(`op ${o.operationName}: machine ${o.machineId} £${o.machineRateUsed} ≠ book £${m.computedRatePerHr}${u && close(o.machineRateUsed, u.computedRatePerHr) ? ' (= UK!)' : ''}`);
      const l = book.labour.find(x => x.id === o.labourId), lu = UK.labour.find(x => x.id === o.labourId);
      if (o.labourId && l && o.labourRateUsed !== undefined && !close(o.labourRateUsed, l.fullyLoadedRatePerHr)) issues.push(`op ${o.operationName}: labour ${o.labourId} £${o.labourRateUsed} ≠ book £${l.fullyLoadedRatePerHr}${lu && close(o.labourRateUsed, lu.fullyLoadedRatePerHr) ? ' (= UK!)' : ''}`);
    }
    const mid = (r.trace?.traceability ?? []).find((t: any) => t.field === 'material.pricePerKg');
    if (mid) {
      const bm = book.materials.find(x => x.id === mid.rateId), um = UK.materials.find(x => x.id === mid.rateId);
      if (bm && !close(mid.value, bm.pricePerKg)) issues.push(`material ${mid.rateId} £${mid.value} ≠ book £${bm.pricePerKg}${um && close(mid.value, um.pricePerKg) ? ' (= UK!)' : ''}`);
      if (region !== 'UK' && /^(UK |Index-anchored|UK book)/.test(mid.rateSource)) issues.push(`material note reads UK: ${mid.rateSource.slice(0, 80)}`);
    }
    for (const t of (r.trace?.traceability ?? []) as any[]) if (region !== 'UK' && /£/.test(t.unit ?? '') && typeof t.rateSource === 'string' && /^UK /.test(t.rateSource)) issues.push(`trace ${t.field} note starts "UK": ${t.rateSource.slice(0, 70)}`);
    out.push({ region, part: name, status: r.status, commodity: r.commodity, total: r.total, opKeys: ops[0] ? Object.keys(ops[0]) : [],
      traceKeys: r.trace ? Object.keys(r.trace) : [], traceability: (r.trace?.traceability ?? []).slice(0, 40), ops: ops.map((o: any) => ({ n: o.operationName, m: o.machineId, mr: o.machineRateUsed, l: o.labourId, lr: o.labourRateUsed })), issues });
  }
}
log(JSON.stringify(out, null, 1));
process.exit(0);
