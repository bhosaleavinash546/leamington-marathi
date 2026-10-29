/** Feasibility screen on every baseline part: npx tsx scripts/route-compare-review/screen.mts */
import { readFileSync } from 'node:fs';
import { screenRoutes, materialFamilyOf } from '../../src/engine/route-feasibility.js';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';

const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string };
}>;
for (const p of parts) {
  const current = p.outcome.commodity ?? 'machining';
  const fam = materialFamilyOf(p.answers, DEFAULT_RATE_LIBRARY);
  const s = screenRoutes(current, { geo: p.geometry as never, filename: p.part, family: fam.family, annualVolume: 100_000 });
  const ok = s.filter(x => x.feasible).map(x => x.route);
  console.log(`\n== ${p.part} (${current}; ${fam.basis})\n   FEASIBLE: ${ok.join(', ')}`);
  for (const x of s) {
    if (x.route === current && x.caveats.length) console.log(`   * ${x.route} caveats: ${x.caveats.join(' | ')}`);
    if (!x.feasible) console.log(`   - ${x.route.padEnd(20)} ${x.checks.filter(c => !c.pass).map(c => `${c.label}: ${c.measured} v ${c.limit}`).join(' | ')}`);
    else if (x.route !== current && x.caveats.length) console.log(`   + ${x.route.padEnd(20)} caveat: ${x.caveats.join(' | ')}`);
  }
}
