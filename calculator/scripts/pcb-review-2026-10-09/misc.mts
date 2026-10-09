import { consolidateBom } from '/home/user/leamington-marathi/calculator/server/utils/pcb-bom-consolidate.ts';
import { expandRefDes } from '/home/user/leamington-marathi/calculator/server/utils/pcb-vision-accuracy.ts';
import { verifyOcrClaims } from '/home/user/leamington-marathi/calculator/server/utils/pcb-ocr-reconcile.ts';
import { capUnconfirmedPrices } from '/home/user/leamington-marathi/calculator/server/utils/pcb-bom-grounding.ts';
import { knownRangeAtVolume, icKnownRange } from '/home/user/leamington-marathi/calculator/server/routes/pcb.ts';
import { cataloguePriceAt } from '/home/user/leamington-marathi/calculator/server/utils/pcb-price-catalogue.ts';
const L = console.log; console.log = () => {}; console.warn = () => {};
for (const r of ['C1-C90', 'C1–C90', 'C1 - C90', 'C1..C90', 'C1~C90', 'C1-90', 'C1, C2', 'R1-R10, R12', 'C47', 'U1 (x2)', 'C1/C2/C3']) L(JSON.stringify(r), '->', expandRefDes(r).length);
L('consolidate single ref qty 90:', JSON.stringify(consolidateBom([{ refDes: 'C47', qty: 90, description: 'MLCC' }]).bom.map(l => l.qty)));
L('consolidate dup no-ref:', consolidateBom([{ refDes: '', qty: 90, partNumber: '', description: 'MLCC 100nF 0402' }, { refDes: '', qty: 90, description: 'MLCC 100nF 0402' }]).bom.length);
L('consolidate same PN two lines:', consolidateBom([{ refDes: 'U3', qty: 1, partNumber: 'TJA1044GT' }, { refDes: 'U8', qty: 1, partNumber: 'TJA1044GT' }]).bom.length);
// verifyOcrClaims: loose agreement
const marks = ['NXP FS32R294KCMJD 0P68C QMR2445D', 'TI 1044AV 4AB ARYS', '2437'];
for (const pn of ['S32R294', 'TCAN1044AVDRQ1', 'TJA1044', 'S32R2', 'LM2437', 'XX2437YY', 'R294', 'FS32']) {
  const r = verifyOcrClaims([{ refDes: 'U1', partNumber: pn, ocrExtracted: true, lineConf: 1 }], marks);
  L('verifyOcrClaims', pn.padEnd(16), r.revoked.length ? 'REVOKED' : 'kept as OCR-confirmed');
}
// known-range regex hazards for a BOM-file line (identity "confirmed" by the file)
for (const [pn, desc] of [['IPD50N04S4L-08', 'N-MOSFET 40V DPAK'], ['TLS205B0', 'LDO'], ['MAX4', ''], ['ROHM RB751', 'Schottky diode SOD-323'], ['BD9V100MUF-C', ''], ['SK4BL', 'Schottky']]) {
  const kr = icKnownRange({ partNumber: pn, description: desc });
  const out = capUnconfirmedPrices([{ refDes: 'Q1', partNumber: pn, description: desc, componentType: 'ic_soic', qty: 1, unitPriceGBP: 0, bomSource: 'file' }], knownRangeAtVolume(1), { automotive: true }).bom[0];
  L('BOM-file', pn.padEnd(16), desc.padEnd(26), 'range', kr ? `${kr.label} £${kr.lo}-${kr.hi}` : '-', '-> £', out.unitPriceGBP, out.priceSource);
}
// cataloguePriceAt continuity around breaks
for (const q of [999, 1000, 9999, 10000, 99999, 100000, 199999, 200000, 299999, 300000, 1e6]) L('S32R294 @', q, cataloguePriceAt('S32R294', q));
