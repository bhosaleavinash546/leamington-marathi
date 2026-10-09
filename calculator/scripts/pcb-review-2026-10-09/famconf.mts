import { groundAndSplit, offlineCataloguePrices } from '/home/user/leamington-marathi/calculator/server/utils/pcb-bom-grounding.ts';
const L = console.log; console.log = () => {};
for (const pn of ['TDA4VEN', 'S32K144W', 'SJA1110C', 'TCAN1042A', 'L9963E']) {
  const g = groundAndSplit([{ refDes: 'U1', partNumber: pn, componentType: 'ic_bga', description: 'SoC', qty: 1, unitPriceGBP: 10, lineConf: 1, ocrExtracted: true }], offlineCataloguePrices([pn], 200000), undefined, { automotive: true });
  const l = g.bom[0];
  L(pn.padEnd(10), '->', l.catalogueMpn, '£' + l.unitPriceGBP, 'exact=' + l.catalogueExact, 'needsVerification=' + l.needsVerification, 'confirmedTotal £' + g.confirmedTotal);
}
