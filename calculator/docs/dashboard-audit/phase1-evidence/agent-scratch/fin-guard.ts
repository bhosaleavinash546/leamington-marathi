import { builtInFxReference } from '../../../../server/data/kpi-store.js';
import { parseFxRows } from '../../../../server/utils/kpi-import.js';
const ref = builtInFxReference();
const missed: string[] = [], caught: string[] = [];
for (const [c, r] of Object.entries(ref.rates)) {
  const inv = 1 / r;
  const res = parseFxRows([{ currency: c, period: '2026-11', gbp_per_unit: inv, source: 'test' }], ['currency','period','gbp_per_unit','source'], ref, '2026-11-11T00:00:00Z');
  (res.errors.length ? caught : missed).push(`${c} ref ${r.toPrecision(4)} inverted ${inv.toPrecision(4)} (x${(inv/r).toFixed(2)})`);
}
console.log('MISSED inverted (accepted):', missed.length); missed.forEach(m => console.log('  ', m));
console.log('CAUGHT:', caught.length, caught.map(x => x.split(' ')[0]).join(','));
// currency with no reference
const r2 = parseFxRows([{ currency: 'CHF', period: '2026-11', gbp_per_unit: 1000, source: 'x' }, { currency: 'ARS', period: '2026-11', gbp_per_unit: 5000, source: 'x' }], ['currency','period','gbp_per_unit','source'], ref, 'now');
console.log('No-reference ccy CHF/ARS at absurd rates:', r2.errors.length ? r2.errors : 'ACCEPTED', 'refs:', ref.rates.CHF, ref.rates.ARS);
// legit historical TRY
if (ref.rates.TRY) { const t2015 = 1/4.2; const r3 = parseFxRows([{ currency: 'TRY', period: '2015-06', gbp_per_unit: t2015, source: 'BoE' }], ['currency','period','gbp_per_unit','source'], ref, 'now'); console.log('TRY 2015 legit rate', t2015.toFixed(4), 'ref', ref.rates.TRY.toFixed(5), r3.errors.length ? 'REJECTED' : 'accepted'); }
// re-upload same key: what's kept? (store side, code only)
console.log('ref currencies', Object.keys(ref.rates).sort().join(','));
