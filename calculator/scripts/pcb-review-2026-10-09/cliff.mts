import { run } from './stage4.mts';
const L = (globalThis as any).__log ?? console.log;
const out: string[] = [];
for (const q of [9_999, 10_000, 10_001, 49_999, 50_001, 99_999, 100_000, 100_001, 150_000, 200_000, 250_000, 300_000, 1_000_000]) {
  const { bd, a } = await run(q);
  out.push(`${String(q).padStart(9)} boards: headline £${bd.totalPerBoard.toFixed(2)}  BOM(raw) £${a.costEstimates.totalBOMCostGBP}  burden ${bd.breakdown.materialBurdenPct}  asm £${bd.assemblyPerBoard}`);
}
process.stdout.write(out.join('\n') + '\n');
