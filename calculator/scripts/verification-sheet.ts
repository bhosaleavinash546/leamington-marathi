/**
 * Customs verification sign-off sheet.
 * Emits a markdown document listing every unverified assumption in the
 * landed-cost module, with official URLs and sign-off columns.
 *
 * Run:  npx tsx scripts/verification-sheet.ts > ../CUSTOMS-VERIFICATION-SHEET.md
 */
import { HS_CANDIDATES, TRADE_REMEDIES, CBAM_SCHEMES, ORIGIN_PREFERENCES, UK_STEEL_MEASURE, ORIGIN_CARBON_PRICE_GBP_PER_TONNE } from '../src/engine/landed-cost-data.js';
import { ORIGIN_RULES } from '../src/engine/rules-of-origin.js';

const L: string[] = [];
const p = (s = '') => L.push(s);

p('# CostVision — Customs Verification Sign-Off Sheet');
p();
p('**Purpose.** Every rate below is used by the CostVision landed-cost engine but has *not* been');
p('confirmed against an authoritative source. Until each line is signed, no landed-cost figure from');
p('the tool should be quoted to a supplier or used for duty budgeting.');
p();
p('**Status key** — `verified` read from the official tariff service · `corroborated` consistent across');
p('independent secondary sources · `estimate` engineering judgement, must be confirmed.');
p();
p(`**Generated** ${new Date().toISOString().slice(0, 10)} · **Reviewer** ______________________ · **Date** ____________`);
p();
p('---');
p();

// 1. Commodity codes
p('## 1. Commodity codes and MFN duty rates');
p();
p('Confirm the code is correct for the part described, and that the third-country duty rate matches.');
p();
p('| # | Commodity | HS code | Description | Rate used | Status | Official page | ✔ Code | ✔ Rate | Corrected rate |');
p('|---|---|---|---|---|---|---|---|---|---|');
let n = 1;
for (const [commodity, lines] of Object.entries(HS_CANDIDATES)) {
  for (const l of lines) {
    p(`| ${n++} | \`${commodity}\` | ${l.hsCode} | ${l.description} | **${l.mfnDutyPct}%** | ${l.status} | [tariff](${l.verifyUrl}) | ☐ | ☐ | ________ |`);
  }
}
p();
p('> **Classification question for the reviewer:** parts "solely or principally" for motor vehicles');
p('> normally classify in heading 8708 rather than by material. Where both routes are listed, confirm');
p('> which applies — the rates differ (e.g. 8708 at 4.5% vs aluminium 7616 at 6.0%).');
p();

// 2. Trade remedies
p('## 2. Trade remedies (anti-dumping / countervailing)');
p();
p('⚠️ **The register below is NOT exhaustive.** It holds only automotive-relevant measures known to the');
p('tool. The reviewer must confirm whether any *further* measure applies to the codes in section 1.');
p();
p('| # | Measure | Product | Origins | Rate | Expires | Official page | ✔ Still in force | ✔ Rate |');
p('|---|---|---|---|---|---|---|---|---|');
TRADE_REMEDIES.forEach((m, i) => {
  p(`| ${i + 1} | ${m.measureType} | ${m.productDescription} | ${m.originRegions.join(', ')} | **${m.dutyPct}%** | ${m.expires ?? 'n/a'} | [TRA case](${m.verifyUrl}) | ☐ | ☐ |`);
});
p();
p('**Reviewer action:** search the live register for every code in section 1 against every origin in');
p('section 3. Record any additional measures here:');
p();
p('| Code | Origin | Measure type | Rate | Source |');
p('|---|---|---|---|---|');
p('| ________ | ______ | ____________ | _____ | ______ |');
p('| ________ | ______ | ____________ | _____ | ______ |');
p();

// 3. Origins and preferences
p('## 3. Origin preferences');
p();
p('| Origin | Agreement | Pref. rate | Status | ✔ In force | ✔ Applies to these codes | Notes |');
p('|---|---|---|---|---|---|---|');
for (const o of ORIGIN_PREFERENCES) {
  p(`| ${o.region} ${o.country} | ${o.agreement ?? '— none —'} | ${o.preferentialDutyPct !== undefined ? o.preferentialDutyPct + '%' : 'MFN'} | ${o.status} | ☐ | ☐ | |`);
}
p();

// 4. Rules of origin
p('## 4. Product-specific rules of origin');
p();
p('The engine applies a MaxNOM (maximum non-originating material) test. Confirm the **product-specific');
p('rule** for the actual commodity codes — PSRs vary by tariff line and may allow a CTC alternative.');
p();
p('| Agreement | Product | MaxNOM used | Local content | In force from | Status | ✔ PSR confirmed | Correct MaxNOM |');
p('|---|---|---|---|---|---|---|---|');
for (const r of ORIGIN_RULES) {
  p(`| ${r.agreement} | ${r.productType} | **${r.maxNonOriginatingPct}%** | ${r.minLocalContentPct}% | ${r.from}${r.until ? ` → ${r.until}` : ''} | ${r.status} | ☐ | ________ |`);
}
p();
p('> **Critical date:** the UK-EU EV and battery rules tighten on **1 January 2027** and are then fixed');
p('> until 2032. Confirm the thresholds above and whether any JLR part is affected.');
p();

// 5. CBAM
p('## 5. CBAM');
p();
p('| Scheme | Live from | Sectors | Price used | Status | ✔ Date | ✔ Price | ✔ Sectors |');
p('|---|---|---|---|---|---|---|---|');
for (const c of Object.values(CBAM_SCHEMES)) {
  p(`| ${c.scheme} | **${c.liveFrom}** | ${c.sectorsInScope.join(', ')} | £${c.certificatePriceGbpPerTonne}/t | ${c.status} | ☐ | ☐ | ☐ |`);
}
p();
p('**Also confirm:**');
p();
p('- ☐ The free-allocation phase-out schedule (engine uses an indicative straight line, 90% in 2027 → 0% by 2036). Statutory factors are set in secondary legislation.');
p('- ☐ Deductible origin carbon prices used by the engine (£/tonne): ' +
  Object.entries(ORIGIN_CARBON_PRICE_GBP_PER_TONNE).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', '));
p('- ☐ The £50,000 registration threshold and whether JLR volumes exceed it.');
p('- ☐ That embedded-emissions values must come from verified supplier data, not the tool\'s estimate.');
p();

// 6. Other measures
p('## 6. Other measures and assumptions');
p();
p('| Item | Value used | ✔ | Notes |');
p('|---|---|---|---|');
p(`| UK steel trade measure | from ${UK_STEEL_MEASURE.liveFrom}, ${UK_STEEL_MEASURE.overQuotaDutyPct}% over quota | ☐ | Applies to steel MILL products, not finished 8708 parts — confirm scope |`);
p('| Import VAT | 20%, treated as RECOVERABLE and excluded from cost | ☐ | Confirm JLR reclaims in full |');
p('| Customs valuation basis | ex-works + freight + insurance + assists | ☐ | Confirm assists treatment for buyer-supplied tooling |');
p('| Currency conversion | not modelled | ☐ | Customs values convert at HMRC\'s published monthly rate |');
p('| Northern Ireland | not modelled | ☐ | Confirm no GB→NI movements in scope |');
p();

// 7. Sign-off
p('## 7. Sign-off');
p();
p('I confirm the rates and rules above have been checked against authoritative sources on the date shown.');
p();
p('| | Name | Role | Signature | Date |');
p('|---|---|---|---|---|');
p('| Prepared by | | | | |');
p('| Reviewed by | | Customs / trade compliance | | |');
p('| Approved by | | Procurement / cost engineering | | |');
p();
p('**Until this sheet is signed, CostVision landed-cost outputs are indicative only and must not be**');
p('**used in supplier negotiations, duty budgeting, or customs declarations.**');

console.log(L.join('\n'));
