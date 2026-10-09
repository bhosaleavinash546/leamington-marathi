import { groundAndSplit, offlineCataloguePrices } from '/home/user/leamington-marathi/calculator/server/utils/pcb-bom-grounding.ts';
import { knownRangeAtVolume } from '/home/user/leamington-marathi/calculator/server/routes/pcb.ts';
const L = console.log; console.log = () => {}; console.warn = () => {};
const cases = [
  { refDes: 'U1', partNumber: 'AR0233AT', description: 'Image sensor', componentType: 'ic_bga', unitPriceGBP: 20, ocrExtracted: true, lineConf: 1 },
  { refDes: 'U1', partNumber: 'AR0233AT', description: 'sensor', componentType: 'ic_qfn', unitPriceGBP: 20, ocrExtracted: true, lineConf: 1 },
  { refDes: 'U1', partNumber: 'AR0233AT', description: 'sensor', componentType: 'ic_soic', unitPriceGBP: 20, ocrExtracted: true, lineConf: 1 },
  { refDes: 'U1', partNumber: 'IMX390', description: 'CMOS image sensor', componentType: 'ic_bga', unitPriceGBP: 30, ocrExtracted: true, lineConf: 1 },
  { refDes: 'U1', partNumber: 'OX03C10', description: 'CMOS image sensor', componentType: 'ic_bga', unitPriceGBP: 30, ocrExtracted: true, lineConf: 1 },
  { refDes: 'U1', partNumber: '', description: 'CMOS image sensor 2MP', componentType: 'ic_bga', unitPriceGBP: 30, ocrExtracted: false, lineConf: 0.7 },
  { refDes: 'U1', partNumber: '', description: 'camera chip, 2MP, CSP', componentType: 'ic_bga', unitPriceGBP: 30, ocrExtracted: false, lineConf: 0.7 },
];
for (const c of cases) {
  const prices = c.partNumber ? offlineCataloguePrices([c.partNumber], 200000) : [];
  const g = groundAndSplit([{ ...c, qty: 1, volumeMultiplier: 0.88 }], prices, knownRangeAtVolume(0.88), { automotive: true, volumeMultiplier: 0.88 });
  const l = g.bom[0];
  L(`${(c.partNumber || '(none)').padEnd(10)} ct=${c.componentType.padEnd(8)} desc="${c.description}" -> £${l.unitPriceGBP} ${l.priceSource} ${l.priceBasis ?? ''} ${String(l.priceNote).slice(0, 90)}`);
}
