import { run } from './stage4.mts';
const out: string[] = [];
const strip = (a: any, flag: boolean) => a.bom.forEach((l: any) => { l.description = String(l.description).replace(/automotive|AEC-?Q\d*/gi, '').trim(); l.automotive = flag; });
for (const [name, dom, flag] of [['general, lines automotive=false', 'general', false], ['general, lines automotive=true', 'general', true], ['automotive_adas, lines automotive=true', 'automotive_adas', true]] as const) {
  const { bd, a } = await run(200_000, x => strip(x, flag), { domain: dom });
  const cls = a.bom.filter((l: any) => l.priceSource === 'class-range').reduce((t: number, l: any) => t + l.lineTotalGBP, 0);
  out.push(`${name.padEnd(42)} headline £${bd.totalPerBoard.toFixed(2)}  class-range lines £${cls.toFixed(2)}`);
}
// Stage 1 confidence gate: same board, domain from classifier 'automotive_adas' conf 0.69 -> general (simulated as domain general)
process.stdout.write(out.join('\n') + '\n');
