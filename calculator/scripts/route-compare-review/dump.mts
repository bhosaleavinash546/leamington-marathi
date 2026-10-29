import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../../server/services/bulk-run.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';
const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json','utf8'));
const k = parts.find((p:any)=>p.part==='steering_knuckle_RH.stp');
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
for (const route of ['forging','casting','cast_and_machine','machining']) {
  const a = {...k.answers}; delete a['commodity.route']; if (route!=='forging') a['service.pressureTight']='no';
  const r = await costMeasuredPart(k.geometry, 'k.stp', {partNumber:'k',file:'k',commodity:route,annualVolume:100000}, a, 'UK', {annualVolume:100000, programmeYears:5}, book, {partNumber:'k',file:'k',status:'error'});
  console.log('\n###', route, r.status, r.total, JSON.stringify(r.breakdown));
  console.log('provenance keys:', Object.keys(r.provenance??{}).join(', '));
  const prov = r.provenance ?? {};
  for (const [k2,v] of Object.entries(prov)) if (/kg|weight|mass|stock|billet|util|tool|die|mould|pattern|cycle|press|machine|hr$/i.test(k2)) console.log('  ', k2, '=', JSON.stringify(v.value), '|', String(v.basis).slice(0,90));
  console.log('trace:', JSON.stringify(r.trace).slice(0,1500));
  console.log('assumed:', r.assumed);
}
