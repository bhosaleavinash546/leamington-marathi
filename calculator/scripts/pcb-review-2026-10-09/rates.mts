import { PCB_COUNTRY_RATES } from '/home/user/leamington-marathi/calculator/server/data/pcb-country-rates.ts';
import { countryFactor } from '/home/user/leamington-marathi/calculator/src/engine/regional-services.ts';
for (const [id, r] of Object.entries(PCB_COUNTRY_RATES)) {
  console.log(id, 'duty', r.logistics.importDutyFraction, 'lab', r.assembly.labourRatePerHr, 'smt/h', r.assembly.smtLineRatePerHr, 'aoi', r.assembly.aoiPerBoard, 'xray', r.assembly.xrayPerBoard, 'ict', r.assembly.ictPerBoard, 'base2L', r.pcbFab.baseCostPerDm2_2L, 'layer', r.pcbFab.layerAdderPerDm2, 'dppm', r.assembly.dppm);
}
const code = (id: string) => (id === 'gb' ? 'UK' : id.toUpperCase());
console.log('CN insp', countryFactor('inspection', 'CN' as any), 'proc', countryFactor('process', 'CN' as any), 'eng', countryFactor('engineer', 'CN' as any));
