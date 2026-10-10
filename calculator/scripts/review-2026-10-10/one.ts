/** Headless costing of one recorded part in one country, with its breakdown and operations. npx tsx one.ts <part> <CC> [volume] */
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../../src/engine/rate-library.js';
const [name, region, vol] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<any>;
const p = fixture.find(f => f.part === name)!;
const log = console.log; console.log = () => {}; console.warn = () => {};
const V = Number(vol ?? 100000);
const r = await costMeasuredPart(structuredClone(p.geometry), name, { partNumber: name, file: name, annualVolume: V, commodity: p.outcome.commodity } as never,
  { ...p.answers, ...(JSON.parse(process.env.ANS ?? '{}')) }, region as never, { annualVolume: V } as never, recomputeMachineRates(DEFAULT_RATE_LIBRARY), { partNumber: name, file: name, status: 'error' } as never) as any;
log(JSON.stringify({ total: r.total, breakdown: r.breakdown, ops: r.trace?.operations?.map((o: any) => ({ n: o.operationName, m: o.machineId, ct: o.cycleTimeHr, ppc: o.partsPerCycle, oee: o.oee, pc: o.processCost, lc: o.labourCost, mr: o.machineRateUsed })),
  drivers: r.trace?.drivers, mat: r.trace?.traceability?.filter((t: any) => /^(material|rawMaterial|tooling)/.test(t.field)).map((t: any) => [t.field, t.value]) }, null, 1));
process.exit(0);
