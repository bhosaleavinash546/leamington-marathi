/**
 * Range Rover L460 PHEV — an INDEPENDENT recomputation of the software costing (president review, 14 Oct 2026).
 *
 * The engine is not called for any arithmetic here. This script reads only the published INPUT tables (module
 * catalogue, hub salaries, the rate library's factors, the stated constants), recomputes every module bucket by hand,
 * and then compares each figure with the engine's own result (`computeSWProgram`) — module by module, bucket by bucket,
 * for every software hub. A difference above 1p is printed as a FAIL.
 *
 *   npx tsx scripts/sw-review/rr-phev-trace.ts <out-dir> [volume=200000] [life=6] [liveJson]
 * Writes <out-dir>/rr-phev-trace.json and rr-phev-trace.md (the step-by-step trace).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SW_MODULES, computeSWProgram, CYBER_UPLIFT_BY_CAL, SW_TOOL_SEAT_GBP, SW_MAINT_FULL_YEARS, SW_MAINT_TAIL,
  SW_POST_EOP_YEARS, SW_POST_EOP_SHARE, SW_DEFAULT_SUBSCRIPTION_YEARS, SW_DEFAULT_SERVICE_YEARS, SW_CLOUD_REFERENCE_FLEET,
  SW_HOMOLOGATION, type SWProgramInputs, type SWRegion,
} from '../../src/engine/sw-should-cost.js';
import { DEFAULT_SW_RATE_LIBRARY as L } from '../../src/engine/sw-rate-library.js';
import { SW_HUB_RATES } from '../../src/engine/sw-country-rates.js';
import { SW_VEHICLE_DEMOS, buildVehicleInputs } from '../../src/ui/panels/sw-should-cost-ui.js';

const OUT = process.argv[2] ?? '.';
const VOLUME = Number(process.argv[3] ?? 200_000);
const LIFE = Number(process.argv[4] ?? 6);
const LIVE = process.argv[5];
mkdirSync(OUT, { recursive: true });

// The demo as the screen builds it, then the programme the review asked for.
const demo = SW_VEHICLE_DEMOS.find(d => d.id === 'rr_l460')!;
const base: SWProgramInputs = { ...buildVehicleInputs(demo), annualProductionVolume: VOLUME, programLifeYears: LIFE };

// ── The published input tables (data only) ──────────────────────────────────────────────────────────────────────────
const v = <T extends string>(o: Record<T, { value: number }>) => Object.fromEntries(Object.entries(o).map(([k, e]) => [k, (e as { value: number }).value])) as Record<T, number>;
const ASIL = v(L.asilDevMultipliers), CPLX = v(L.complexityMultipliers), REUSE = v(L.reuseFactors), EFF = v(L.devSourceMultipliers);
const MARGIN = L.supplierMargin!.value;
// Stated in the engine's source (not exported): the reuse floor on the 15 % safety slice, the implementation share of the
// complexity delta, and the test sub-bucket shares — copied here as constants, each with its line in the trace.
const SAFETY_REUSE_FLOOR: Record<string, number> = { QM: 0, A: 0, B: 0.40, C: 0.50, D: 0.60 };
const IMPL_W = 0.15;

function hand(region: SWRegion) {
  const p = { ...base, region };
  // The hub's book £ / PM (the library's hubRates) and, from the raw salaries, a hand re-derivation of it.
  const hub = L.hubRates[region];
  const raw = SW_HUB_RATES[region];
  const pmOf = (salary: number) => salary * (raw.onCostInSalary ? 1 : 1 + raw.employerOnCostPctAtMid / 100) / raw.productiveHours * 152 / raw.fxToGBP;
  // Employer on-cost is progressive / capped (UK NIC over a threshold; DE / CA / US contributions capped), so the book
  // applies it at EACH salary: the senior figure is checked against the book's own local senior £ / PM ÷ FX.
  const midDerived = pmOf(raw.midAnnualSalary), seniorDerived = raw.seniorPerPMLocal / raw.fxToGBP;
  const seniorOnCostPct = (raw.seniorPerPMLocal * raw.productiveHours / 152 / raw.seniorAnnualSalary - 1) * 100;
  const s = p.teamSeniorFraction;
  const blended = s * hub.senior.value + (1 - s) * hub.mid.value;
  const sourceFactor = p.devSource === 'OEM_Internal' ? EFF.OEM_Internal : EFF[p.devSource] / (1 - MARGIN);
  const b = p.burden!;
  const burden = (1 + b.employmentPct / 100) * (1 + b.companyPct / 100) * (1 + b.capitalPct / 100);
  const rate = blended * sourceFactor * burden;
  const life = p.programLifeYears, vol = p.annualProductionVolume;
  const N = p.subscriptionYears ?? SW_DEFAULT_SUBSCRIPTION_YEARS, S = p.connectedServiceYears ?? SW_DEFAULT_SERVICE_YEARS;
  const post = p.postProductionSupportYears ?? SW_POST_EOP_YEARS, share = p.postProductionSupportShare ?? SW_POST_EOP_SHARE;
  // Maintenance weights: full for the first years, then the tail; then the post-production support after the last build.
  const weights = [...Array.from({ length: life }, (_, i) => (i < SW_MAINT_FULL_YEARS ? 1 : SW_MAINT_TAIL)), ...Array.from({ length: post }, () => SW_MAINT_TAIL * share)];
  const wSum = weights.reduce((a, x) => a + x, 0);
  const rows = p.modules.filter(m => m.enabled).map(m => {
    const d = SW_MODULES.find(x => x.id === m.moduleId)!;
    const reuse = REUSE[m.reuse], asil = ASIL[m.asil], cx = CPLX[m.complexity];
    const devPM = d.basePersonMonths * reuse * asil;
    const safetyScale = Math.max(reuse, SAFETY_REUSE_FLOOR[m.asil]) / reuse;
    const bucketPM = devPM * (0.12 + 0.14 + 0.22 * cx + 0.37 * (1 + (cx - 1) * IMPL_W) + 0.15 * safetyScale);
    const dev = bucketPM * rate;
    const test = dev * d.testingFractionBase;                       // ASIL test multipliers are all 1.00 (neutral)
    const integ = dev * d.integrationFractionBase;
    const cal = m.cal ?? d.defaultCal ?? (d.hasCybersecRequirement ? 'CAL2' : 'none');
    const cyber = dev * CYBER_UPLIFT_BY_CAL[cal];
    const calib = dev * d.calibrationFractionBase;
    const engYears = (dev + test + integ + cyber + calib) / rate / 12;
    const tools = engYears * SW_TOOL_SEAT_GBP;                      // 0 % discount: paid over the window, undiscounted
    const maint = (dev + test + integ) * d.maintenancePctPerYear / 100 * wSum;
    const ip = d.annualIPLicenceGBP * life;
    const royalty = vol * life * (d.perVehicleRoyaltyGBP ?? 0) + vol * life * N * (d.perVehiclePerYearGBP ?? 0);
    const cloud = d.annualCloudCostGBP / SW_CLOUD_REFERENCE_FLEET * vol * life * S;
    const total = dev + test + integ + cyber + calib + tools + maint + ip + royalty + cloud;
    return { id: d.id, name: d.name, cat: d.category, asil: m.asil, complexity: m.complexity, reuse: m.reuse, cal,
      basePM: d.basePersonMonths, devPM, bucketPM, dev, test, integ, cyber, calib, tools, maint, ip, royalty, cloud, total };
  });
  const sum = (k: keyof typeof rows[number]) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const H = SW_HOMOLOGATION;
  const homolog = H.typeApprovalGBP + (rows.some(r => r.asil === 'D') ? H.assessorASILD : H.assessorOther) + (H.csmsGBP + H.sumsGBP) / Math.max(1, p.csmsTypesSharing ?? 1);
  const nre = sum('dev') + sum('test') + sum('integ') + sum('cyber') + sum('calib') + sum('tools') + homolog;
  const lifecycle = sum('maint') + sum('ip') + sum('royalty') + sum('cloud');
  const total = nre + lifecycle;
  return { region, hubLabel: raw.label ?? region, mid: hub.mid.value, senior: hub.senior.value, midDerived, seniorDerived, seniorOnCostPct, raw, blended, sourceFactor, burden, rate, weights, wSum,
    rows, homolog, nre, lifecycle, total, perVehicle: total / (vol * life), sums: Object.fromEntries((['dev', 'test', 'integ', 'cyber', 'calib', 'tools', 'maint', 'ip', 'royalty', 'cloud'] as const).map(k => [k, sum(k)])) };
}

// ── Reconcile with the engine, every hub ────────────────────────────────────────────────────────────────────────────
const hubs = Object.keys(SW_HUB_RATES) as SWRegion[];
const results = hubs.map(region => {
  const h = hand(region);
  const e = computeSWProgram({ ...base, region });
  const fails: string[] = [];
  // A non-finite figure is a failure (NaN slipped through a plain |a − b| test once).
  const near = (a: number, b: number, what: string) => { if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 0.01) fails.push(`${what}: hand ${a.toFixed(2)} v tool ${b.toFixed(2)}`); };
  for (const r of h.rows) {
    const m = e.modules.find(x => x.moduleId === r.id);
    if (!m) { fails.push(`${r.id}: missing in the tool`); continue; }
    near(r.dev, m.development.total, `${r.id} development`); near(r.test, m.testing.total, `${r.id} testing`);
    near(r.integ, m.integrationCost, `${r.id} integration`); near(r.cyber, m.cybersecCost, `${r.id} cyber`);
    near(r.calib, m.calibrationCost, `${r.id} calibration`); near(r.tools, m.toolchainCost, `${r.id} tools`);
    near(r.maint, m.maintenanceCost, `${r.id} maintenance`); near(r.ip + r.royalty, m.licensingCost, `${r.id} licences + royalties`);
    near(r.cloud, m.cloudCost, `${r.id} cloud`); near(r.total, m.grandTotal, `${r.id} total`);
  }
  if (e.modules.length !== h.rows.length) fails.push(`module count: hand ${h.rows.length} v tool ${e.modules.length}`);
  near(h.homolog, e.summary.totalHomologation, 'homologation');
  near(h.nre, e.summary.nreTotal, 'NRE'); near(h.total, e.summary.grandTotal, 'programme total');
  near(h.perVehicle, e.summary.perVehicle, 'per vehicle');
  // The book's £ / PM must be the salary build-up (salary + statutory on-cost ÷ productive hours × 152 h ÷ FX), to 1 £.
  if (Math.abs(h.midDerived - h.mid) > 1 || Math.abs(h.seniorDerived - h.senior) > 1 || !(h.seniorOnCostPct >= 0 && h.seniorOnCostPct < 60)) fails.push(`hub rate build-up: mid ${h.midDerived.toFixed(0)} v book ${h.mid}, senior ${h.seniorDerived.toFixed(0)} v ${h.senior}`);
  return { h, tool: { total: e.summary.grandTotal, nre: e.summary.nreTotal, perVehicle: e.summary.perVehicle }, fails };
});

// ── Against the live run (rounded screen figures) ───────────────────────────────────────────────────────────────────
const liveRows: Array<{ hub: string; total: string; perVehicle: string; nre: string }> = LIVE && existsSync(LIVE) ? JSON.parse(readFileSync(LIVE, 'utf8')).perHub : [];
const money = (n: number) => `£${(n / 1e6).toFixed(1)}M`;
const liveCheck = liveRows.map(l => {
  const r = results.find(x => x.h.region === l.hub)!;
  const ok = l.total === money(r.h.total) && l.nre === money(r.h.nre) && l.perVehicle === `£${Math.round(r.h.perVehicle)}`;
  return { hub: l.hub, screenTotal: l.total, handTotal: money(r.h.total), screenNRE: l.nre, handNRE: money(r.h.nre), screenPV: l.perVehicle, handPV: `£${Math.round(r.h.perVehicle)}`, ok };
});

writeFileSync(join(OUT, 'rr-phev-trace.json'), JSON.stringify({ volume: VOLUME, life: LIFE, results: results.map(r => ({ region: r.h.region, total: r.h.total, nre: r.h.nre, lifecycle: r.h.lifecycle, perVehicle: r.h.perVehicle, rate: r.h.rate, fails: r.fails })), liveCheck }, null, 1));

// ── The step-by-step trace (UK hub) ─────────────────────────────────────────────────────────────────────────────────
const uk = results.find(r => r.h.region === 'UK')!.h;
const f0 = (n: number) => Math.round(n).toLocaleString('en-GB');
const f2 = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lines: string[] = [];
lines.push(`# Range Rover L460 PHEV — independent trace of the software costing`, '',
  `Programme: ${f0(VOLUME)} vehicles a year × ${LIFE} years = ${f0(VOLUME * LIFE)} vehicles · PHEV · ${base.devSource} · ${uk.rows.length} modules · 0 % discount.`,
  `Every figure below is recomputed by hand from the published tables and reconciled with the tool's own result.`, '',
  `## Step 1 — Engineering rate (UK hub)`, '',
  `- Hub book: mid £${f0(uk.mid)} / senior £${f0(uk.senior)} per person-month (152 h). Build-up from the salaries: mid ${uk.raw.currency} ${f0(uk.raw.midAnnualSalary)} × (1 + ${uk.raw.employerOnCostPctAtMid} % employer on-cost) ÷ ${f0(uk.raw.productiveHours)} productive h × 152 h ÷ FX ${uk.raw.fxToGBP} = £${f0(uk.midDerived)}; senior ${f0(uk.raw.seniorAnnualSalary)} × (1 + ${uk.seniorOnCostPct.toFixed(2)} % on-cost at that salary) → £${f0(uk.seniorDerived)}.`,
  `- Senior share ${base.teamSeniorFraction}: ${base.teamSeniorFraction} × ${f0(uk.senior)} + ${(1 - base.teamSeniorFraction).toFixed(2)} × ${f0(uk.mid)} = **£${f2(uk.blended)}**.`,
  `- Development source ${base.devSource}: efficiency ${EFF[base.devSource]} ÷ (1 − margin ${MARGIN}) = × ${uk.sourceFactor.toFixed(4)}.`,
  `- Burden: (1 + ${base.burden!.employmentPct} %) × (1 + ${base.burden!.companyPct} %) × (1 + ${base.burden!.capitalPct} %) = × ${uk.burden.toFixed(3)}.`,
  `- Loaded rate = ${f2(uk.blended)} × ${uk.sourceFactor.toFixed(4)} × ${uk.burden.toFixed(3)} = **£${f2(uk.rate)} per person-month**.`, '',
  `## Step 2 — Effort per module`, '',
  `development PM = catalogue PM × reuse × ASIL factor; costed PM = development PM × (0.12 requirements + 0.14 architecture + 0.22 × complexity algorithms + 0.37 × (1 + (complexity − 1) × 0.15) implementation + 0.15 × safety-reuse scale).`,
  `Reuse ${JSON.stringify(REUSE)}; ASIL ${JSON.stringify(ASIL)}; complexity ${JSON.stringify(CPLX)}; safety reuse floor ${JSON.stringify(SAFETY_REUSE_FLOOR)}.`, '',
  `## Step 3 — Verification, integration, cyber, calibration (fractions of development £)`, '',
  `testing = development × the module's test fraction; integration = × its integration fraction; cybersecurity = × the CAL uplift ${JSON.stringify(CYBER_UPLIFT_BY_CAL)}; calibration = × its calibration fraction.`, '',
  `## Step 4 — Tools`, '', `engineer-years = (development + testing + integration + cyber + calibration) ÷ loaded rate ÷ 12; tools = engineer-years × £${f0(SW_TOOL_SEAT_GBP)} per seat-year.`, '',
  `## Step 5 — Maintenance`, '', `(development + testing + integration) × the module's % a year × Σ weights. Weights: ${uk.weights.map(w => w.toFixed(3)).join(', ')} → Σ = ${uk.wSum.toFixed(3)} (production years: full ${SW_MAINT_FULL_YEARS}, then ${SW_MAINT_TAIL}; then ${SW_POST_EOP_YEARS} years of security support at ${SW_MAINT_TAIL} × ${SW_POST_EOP_SHARE}).`, '',
  `## Step 6 — Licences, royalties, cloud`, '',
  `IP licences = module £ / yr × ${LIFE}. Royalties = ${f0(VOLUME)} × ${LIFE} × £ per vehicle built + ${f0(VOLUME)} × ${LIFE} × ${SW_DEFAULT_SUBSCRIPTION_YEARS} subscription years × £ per vehicle-year. Cloud = module £ / yr ÷ ${f0(SW_CLOUD_REFERENCE_FLEET)} × ${f0(VOLUME)} × ${LIFE} × ${SW_DEFAULT_SERVICE_YEARS} service years.`, '',
  `## Step 7 — Every module (UK hub, £)`, '',
  `| Module | Cat | ASIL | Cplx | Reuse | CAL | Base PM | Dev PM | Development | Testing | Integration | Cyber | Calibration | Tools | Maintenance | IP licences | Royalties | Cloud | Total |`,
  `|---|---|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|`,
  ...uk.rows.map(r => `| ${r.name} | ${r.cat} | ${r.asil} | ${r.complexity} | ${r.reuse} | ${r.cal} | ${r.basePM} | ${r.devPM.toFixed(1)} | ${f0(r.dev)} | ${f0(r.test)} | ${f0(r.integ)} | ${f0(r.cyber)} | ${f0(r.calib)} | ${f0(r.tools)} | ${f0(r.maint)} | ${f0(r.ip)} | ${f0(r.royalty)} | ${f0(r.cloud)} | ${f0(r.total)} |`),
  `| **Sum** | | | | | | | | ${f0(uk.sums.dev)} | ${f0(uk.sums.test)} | ${f0(uk.sums.integ)} | ${f0(uk.sums.cyber)} | ${f0(uk.sums.calib)} | ${f0(uk.sums.tools)} | ${f0(uk.sums.maint)} | ${f0(uk.sums.ip)} | ${f0(uk.sums.royalty)} | ${f0(uk.sums.cloud)} | ${f0(uk.total - uk.homolog)} |`, '',
  `## Step 8 — Programme`, '',
  `- Homologation: type approval £${f0(SW_HOMOLOGATION.typeApprovalGBP)} + ISO 26262 assessor (ASIL-D present) £${f0(SW_HOMOLOGATION.assessorASILD)} + CSMS £${f0(SW_HOMOLOGATION.csmsGBP)} + SUMS £${f0(SW_HOMOLOGATION.sumsGBP)} = **£${f0(uk.homolog)}**.`,
  `- NRE = development + testing + integration + cyber + calibration + tools + homologation = **£${f0(uk.nre)}**.`,
  `- Lifecycle = maintenance + IP licences + royalties + cloud = **£${f0(uk.lifecycle)}**.`,
  `- Programme total = **£${f0(uk.total)}**; per vehicle = ÷ ${f0(VOLUME * LIFE)} = **£${f2(uk.perVehicle)}**.`, '',
  `## Reconciliation with the tool — every hub`, '',
  `| Hub | Loaded £/PM | NRE | Total | Per vehicle | Module-by-module check |`, `|---|--:|--:|--:|--:|---|`,
  ...results.map(r => `| ${r.h.region} | ${f0(r.h.rate)} | ${money(r.h.nre)} | ${money(r.h.total)} | £${Math.round(r.h.perVehicle)} | ${r.fails.length ? `**FAIL** ${r.fails.length}: ${r.fails.slice(0, 2).join('; ')}` : `PASS (${r.h.rows.length} modules × 10 buckets to 1p)`} |`), '',
  ...(liveCheck.length ? [`## Against the live screen (rounded figures captured in the browser)`, '', `| Hub | Screen total | Hand total | Screen NRE | Hand NRE | Screen £/veh | Hand £/veh | Match |`, `|---|--:|--:|--:|--:|--:|--:|---|`,
    ...liveCheck.map(c => `| ${c.hub} | ${c.screenTotal} | ${c.handTotal} | ${c.screenNRE} | ${c.handNRE} | ${c.screenPV} | ${c.handPV} | ${c.ok ? 'yes' : '**NO**'} |`)] : []),
);
writeFileSync(join(OUT, 'rr-phev-trace.md'), lines.join('\n') + '\n');
const failing = results.filter(r => r.fails.length);
console.log(`hubs ${results.length}; failing ${failing.length}; live rows ${liveCheck.length}, mismatched ${liveCheck.filter(c => !c.ok).length}`);
for (const f of failing) console.log(f.h.region, f.fails.slice(0, 5));
process.exitCode = failing.length || liveCheck.some(c => !c.ok) ? 1 : 0;
