// Flatten every marketplace idea (every field) into rows for the Excel export.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const REPO = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const { marketplaceCommodityOf } = await import(`${REPO}/src/data/commodity-classify.mjs`);
const { classifyIdea } = await import(`${REPO}/src/data/idea-classify.mjs`);
const { findMoney, parseMoneyRange } = await import(`${REPO}/idea-arith.mjs`);
const OUT = process.argv[2];

const files = readdirSync(REPO).filter(f => /^marketplace-.*\.json$/.test(f) && f !== 'marketplace-retired-ideas.json').sort();
const retired = new Set(JSON.parse(readFileSync(`${REPO}/marketplace-retired-ideas.json`, 'utf8')).map(r => r.id));
const PACK = {
  'marketplace-legacy-seed-ideas.json': 'Legacy curated library',
  'marketplace-extra-ideas.json': 'OEM-benchmarked ideas',
  'marketplace-suv-ideas.json': 'Premium-SUV Chassis & BIW',
  'marketplace-bev-cooling-ideas.json': 'BEV 800V cooling',
  'marketplace-driveline-ideas.json': 'Premium-SUV driveline',
  'marketplace-deep-library-ideas.json': 'Deep assembly/subassembly/part library',
  'marketplace-offroad-luxury-ideas.json': 'Off-road luxury',
  'marketplace-domain-expansion-ideas.json': 'Domain expansion (GD&T / joining / E-E)',
  'marketplace-battery-800v-ideas.json': '800V battery benchmark-anchored',
  'marketplace-missing-commodity-ideas.json': 'Missing-commodity coverage',
  'marketplace-luxury-suv-mhev-bev-ideas.json': 'Luxury-SUV MHEV / 800V BEV researched',
  'marketplace-mhev-48v-ideas.json': '48 V MHEV researched',
  'marketplace-mhev-48v-deep-ideas.json': '48 V MHEV deep',
  'marketplace-interior-exterior-biw-chassis-ideas.json': 'Interior / Exterior / BIW / Chassis researched',
  'marketplace-offroad-features-ideas.json': 'Off-Road Features researched',
  'marketplace-study-edu-function-analysis.json': 'Study: EDU Function Analysis',
  'marketplace-study-48v-mhev-should-cost.json': 'Study: 48V MHEV Should-Cost v1.8',
  'marketplace-study-hs26-half-shafts.json': 'Study: Half-Shaft 2026',
  'marketplace-study-dif26-differentials.json': 'Study: Differential 2026',
  'marketplace-study-ps26-prop-shafts.json': 'Study: Prop-Shaft 2026',
  'marketplace-study-tc26-transfer-case.json': 'Study: Transfer-Case 2026',
  'marketplace-study-ix3-gen6-battery-benchmark.json': 'Study: BMW iX3 Gen6 Battery Benchmark',
};
const s = (v) => (v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v));
const ccyOf = (t) => (/£/.test(t) ? 'GBP' : /€/.test(t) ? 'EUR' : /\$/.test(t) ? 'USD' : '');
const monthsMin = (t) => { const m = String(t || '').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };

const rows = [], sources = [], bridges = [];
const unmappedKeys = {};
for (const f of files) for (const x of JSON.parse(readFileSync(`${REPO}/${f}`, 'utf8'))) {
  if (retired.has(x.id)) continue;
  const d = typeof x.ideaData === 'string' ? JSON.parse(x.ideaData) : (x.ideaData || {});
  const used = new Set(['commodity']);
  const g = (k) => { used.add(k); return d[k]; };
  const csp = g('costSavingPotential') || {};
  const cl = classifyIdea({ ...x, ideaData: JSON.stringify(d) });
  const statedPt = g('powertrain');
  const pts = new Set(cl.powertrains); const volts = new Set(cl.voltages);
  if (statedPt) { if (/MHEV/.test(statedPt)) pts.add('MHEV'); if (/BEV/.test(statedPt)) pts.add('BEV'); if (/800V/.test(statedPt)) volts.add('800V'); }
  const annualText = x.annualSaving || csp.annualValue || '';
  // Study imports carry their signed numbers (a negative low case is a cost increase); the text parser drops signs.
  const num2 = (a, b) => (Number.isFinite(d[a]) && Number.isFinite(d[b]) ? { lo: g(a), hi: g(b) } : null);
  const ann = num2('annualSavingLowGBP', 'annualSavingHighGBP') || parseMoneyRange(annualText);
  const pvText = csp.perVehicle || '';
  const pv = num2('savingPerUnitLowGBP', 'savingPerUnitHighGBP') || (pvText ? parseMoneyRange(pvText) : null);
  const ec = g('engineCheck');
  const ba = g('benchmarkAnchor') || {};
  const inv = g('investment') || {};
  const eng = g('engineering') || {};
  const evid = g('evidenceSources') || [];
  const bl = g('costBridgeLines') || [];
  const offRoadV = g('offRoad');
  const conf = g('confidenceLevel');
  const time = x.timeToImplement || g('timeToImplement') || '';
  const diff = x.difficulty || g('implementationDifficulty') || '';
  const level = x.level || '';
  const levelLabel = level ? level[0].toUpperCase() + level.slice(1) : (g('systemLevel') ? String(d.systemLevel) : 'Not stated');
  g('systemLevel'); g('implementationDifficulty'); g('timeToImplement'); g('id'); g('title');
  const row = {
    'Idea ID': x.id,
    'Title': x.title,
    'Commodity': ({ OffRoad: 'Off-Road Features' })[marketplaceCommodityOf({ system: x.system, ideaData: d })] || marketplaceCommodityOf({ system: x.system, ideaData: d }) || 'Other',
    'Sub-system': x.system || '',
    'Focus area / assembly': s(g('focusArea')),
    'Level': levelLabel,
    'System level (as stored)': s(d.systemLevel),
    'Powertrain (as stated)': statedPt || '',
    'Propulsion tags (derived)': [...['ICE', 'MHEV', 'PHEV', 'BEV'].filter(p => pts.has(p)), ...[...volts].map(v => `${v}`)].join(', ') || 'Powertrain-agnostic',
    ICE: pts.has('ICE') ? 1 : 0, MHEV: pts.has('MHEV') ? 1 : 0, PHEV: pts.has('PHEV') ? 1 : 0, BEV: pts.has('BEV') ? 1 : 0, '800V': volts.has('800V') ? 1 : 0,
    'Off-road': offRoadV === true ? 'Yes' : offRoadV === false ? 'No' : 'Not stated',
    'Saving type': x.costSavingType || '',
    'Saving types (detail)': s(g('costSavingTypes')),
    'Annual saving (as stated)': annualText,
    'Stated currency': ccyOf(annualText),
    'Annual saving low (stated ccy)': ann ? ann.lo : null,
    'Annual saving high (stated ccy)': ann ? ann.hi : null,
    'Per-vehicle saving (as stated)': pvText,
    'Per-vehicle low (stated ccy)': pv ? pv.lo : null,
    'Per-vehicle high (stated ccy)': pv ? pv.hi : null,
    'Saving % (as stated)': s(csp.percentage),
    'Saving rationale': [s(csp.qualitative), csp.qualitature && csp.qualitature !== csp.qualitative ? s(csp.qualitature) : ''].filter(Boolean).join(' | '),
    'Calculation basis': [s(csp.calculationBasis), s(csp.calculationBasis_note)].filter(Boolean).join(' | '),
    'Volume basis': s(g('volumeBasis')),
    'Difficulty': diff,
    'Time to implement': time,
    'Time min (months)': monthsMin(time),
    'Quick win': diff === 'Low' && monthsMin(time) != null && monthsMin(time) <= 12 ? 'Yes' : 'No',
    'Confidence': conf || 'Not stated',
    'Verified': x.verified ? 'Yes' : 'No',
    'Stars': x.stars ?? 0,
    'Sources flagged unreviewed': g('evidenceUnverified') === true ? 'Yes' : d.evidenceUnverified === false ? 'No' : '',
    'Engine check': ec ? (ec.direction === 'confirmed' ? 'Confirmed' : ec.direction === 'contradicted' ? 'Contradicted' : s(ec.direction)) : 'Not engine-checked',
    'Engine saving %': ec && Number.isFinite(Number(ec.savingPct)) ? Number(ec.savingPct) / 100 : null,
    'Engine reference case': ec ? s(ec.referenceCase) : '',
    'Engine check basis': ec ? [s(ec.basis), s(ec.note), ec.baselinePerPart != null ? `baseline €${ec.baselinePerPart}/part → €${ec.proposedPerPart}/part` : ec.baselineEur != null ? `baseline €${ec.baselineEur} → €${ec.proposedEur}` : ''].filter(Boolean).join(' | ') : '',
    'Description': x.description || '',
    'Technical description': s(g('technicalDescription')),
    'Cost-reduction mechanism': s(g('costReductionMechanism')),
    'Manufacturing impact': s(g('manufacturingImpact')),
    'DFM / DFA': s(g('dfmDfa')),
    'DFMA principles': s(g('dfmaPrinciples')),
    'Risk notes': s(g('riskNotes')),
    'Regulatory context': s(g('regulatoryContext')),
    'Material grade': s(g('materialGrade')),
    'Material alternatives': s(g('materialAlternatives')),
    'Manufacturing process': s(g('manufacturingProcess')),
    'Process alternatives': s(g('processAlternatives')),
    'Benchmark reference': s(g('benchmarkReference')),
    'Benchmark vehicle': s(ba.platform),
    'Borrowed feature': s(ba.borrowedFeature),
    'How this differs': s(ba.difference),
    'Target vehicle': s(g('targetVehicle')),
    'Architecture assumed': s(g('architectureAssumed')),
    'Eng: mechanism': s(eng.mechanism), 'Eng: spec deltas': s(eng.specDeltas), 'Eng: validation plan': s(eng.validationPlan),
    'Eng: DFM implications': s(eng.dfmImplications), 'Eng: cost bridge': s(eng.costBridge),
    'Cost bridge lines': bl.map(l => `${l.item}: €${l.baselineEur} → €${l.proposedEur}${Object.keys(l).filter(k => !['item','baselineEur','proposedEur'].includes(k)).map(k => ` (${k === 'note' ? '' : k + ': '}${typeof l[k] === 'string' ? l[k] : JSON.stringify(l[k])})`).join('')}`).join('; '),
    'Tooling (€)': Number.isFinite(inv.toolingEur) ? inv.toolingEur : null,
    'Capex (€)': Number.isFinite(inv.capexEur) ? inv.capexEur : null,
    'Validation (€)': Number.isFinite(inv.validationEur) ? inv.validationEur : null,
    'Payback (months)': Number.isFinite(inv.paybackMonths) ? inv.paybackMonths : (Number.isFinite(Number(csp.paybackMonths)) ? Number(csp.paybackMonths) : null),
    'Review open points': s(g('reviewOpenPoints')),
    'Evidence sources (count)': evid.length,
    'Evidence sources': evid.map(e => `${e.title || ''}${e.year ? ` (${e.year})` : ''}${e.type ? ` [${e.type}` : ''}${e.confidence ? `${e.type ? ', ' : ' ['}confidence ${e.confidence}]` : e.type ? ']' : ''}${e.url ? ` <${e.url}>` : ''}${e.supports ? ` — supports: ${e.supports}` : ''}${Object.keys(e).filter(k => !['title','year','type','confidence','url','supports'].includes(k)).map(k => ` ${k}: ${typeof e[k] === 'string' ? e[k] : JSON.stringify(e[k])}`).join('')}`).join('\n'),
    // ── User-supplied study fields (verbatim from the study files) ──
    'Study': s(g('study')),
    'Study code': s(g('studyCode')),
    'Study original ID': s(g('originalId')),
    'Study status': s(g('studyStatus')) || 'Library idea',
    'Study decision reason': s(g('studyDecisionReason')),
    'Study cost effect': s(g('studyCostEffect')),
    'Idea class / novelty': s(g('ideaClass')),
    'Lever': s(g('lever')),
    'Maturity': s(g('maturity')),
    'Depth': s(g('depth')),
    'Groups': s(g('groups')),
    'Target functions': s(g('targetFunctions')),
    'Function class': s(g('functionClass')),
    'Value index': Number.isFinite(d.valueIndex) ? g('valueIndex') : (g('valueIndex'), null),
    'Function value gap (£)': Number.isFinite(d.functionValueGapGBP) ? g('functionValueGapGBP') : (g('functionValueGapGBP'), null),
    'Components affected': s(g('componentsAffected')),
    'Affected cost (£)': Number.isFinite(d.affectedCostGBP) ? g('affectedCostGBP') : (g('affectedCostGBP'), null),
    'Weighted score': Number.isFinite(d.weightedScore) ? g('weightedScore') : (g('weightedScore'), null),
    'P(success)': Number.isFinite(d.pSuccess) ? g('pSuccess') : (g('pSuccess'), null),
    'Risk-adjusted low (£/unit)': Number.isFinite(d.riskAdjustedLowGBP) ? g('riskAdjustedLowGBP') : (g('riskAdjustedLowGBP'), null),
    'Risk-adjusted high (£/unit)': Number.isFinite(d.riskAdjustedHighGBP) ? g('riskAdjustedHighGBP') : (g('riskAdjustedHighGBP'), null),
    'NRE (£)': Number.isFinite(d.nreGBP) ? g('nreGBP') : (g('nreGBP'), null),
    'NRE shared': s(g('nreShared')),
    'NRE note': s(g('nreNote')),
    'Study payback (years)': Number.isFinite(d.paybackYears) ? g('paybackYears') : (g('paybackYears'), null),
    'Conflicts with': s(g('conflictsWith')),
    'Validation required': s(g('validationRequired')),
    'Investment (study text)': s(g('investmentText')),
    'Practice note': s(g('practiceNote')),
    'Saving basis (study)': s(g('savingBasis')),
    'Evidence pointer (study)': s(g('evidencePointer')),
    'Combined capture (study)': s(g('studyCombinedCapture')),
    'Development pack slides': s(g('developmentPackSlides')),
    'Study deck slides': s(g('studyDeckSlides')),
    'Study PDF pages': s(g('studyPdfPages')),
    'Development pack notes': s(g('developmentPackNotes')),
    'Source file': s(g('sourceFile')),
    'Source pointer': s(g('sourcePointer')),
    'Possible duplicate of': s(g('possibleDuplicateOf')),
    'Review severity (study import)': s(g('reviewSeverity')),
    'Review correction': (() => { const c = g('reviewCorrection'); g('reviewCorrectionStatus'); return c ? `${c.summary} [confidence: ${c.confidence}]` : ''; })(),
    'Study original saving (as claimed)': (() => { const o = g('studyOriginal'); return o ? s(o.annualSaving) : ''; })(),
    'Correction derivation': (() => { const c = d.reviewCorrection; return c ? (c.derivation || []).map(l => `${l.line}: ${l.lowGBP}${l.highGBP !== l.lowGBP ? '…' + l.highGBP : ''} (${l.source})`).join(' ¶ ') + (c.systemTradeNote ? ` ¶ System trade (not booked): ${c.systemTradeNote}` : '') + (c.openQuestions?.length ? ` ¶ Open questions: ${c.openQuestions.join('; ')}` : '') : ''; })(),
    'Study effort (verbatim)': s(g('studyEffort')),
    'Study level (verbatim)': s(g('studyLevel')),
    'Study deck mentions (slides)': s(g('studyDeckMentions')),
    'Submitted by': x.submittedBy || '',
    'Library pack': PACK[f] || f,
  };
  // Every ideaData key must land somewhere. Unmapped ones go to "Other details".
  const other = {};
  for (const k of Object.keys(d)) if (!used.has(k)) other[k] = d[k];
  for (const k of Object.keys(csp)) if (!['qualitative', 'qualitature', 'percentage', 'annualValue', 'calculationBasis', 'calculationBasis_note', 'perVehicle', 'paybackMonths'].includes(k)) other[`costSavingPotential.${k}`] = csp[k];
  if (d.title && d.title !== x.title) other['ideaData.title (differs from headline title)'] = d.title;
  for (const k of Object.keys(other)) unmappedKeys[k] = (unmappedKeys[k] || 0) + 1;
  row['Other details'] = Object.keys(other).length ? JSON.stringify(other) : '';
  rows.push(row);
  for (const e of evid) sources.push({ 'Idea ID': x.id, 'Idea title': x.title, Commodity: row.Commodity, 'Source title': s(e.title), Type: s(e.type), Year: e.year ?? '', Confidence: s(e.confidence), URL: s(e.url), Supports: s(e.supports) });
  for (const l of bl) bridges.push({ 'Idea ID': x.id, 'Idea title': x.title, Commodity: row.Commodity, Item: s(l.item), 'Baseline (€)': l.baselineEur, 'Proposed (€)': l.proposedEur, 'Saving (€)': (Number(l.baselineEur) || 0) - (Number(l.proposedEur) || 0), Note: [s(l.note), ...Object.keys(l).filter(k => !['item','baselineEur','proposedEur','note'].includes(k)).map(k => `${k}: ${s(l[k])}`)].filter(Boolean).join(' | ') });
}
writeFileSync(OUT, JSON.stringify({ rows, sources, bridges, unmappedKeys, files }));
console.log('rows', rows.length, 'sources', sources.length, 'bridge lines', bridges.length, 'unmapped keys', unmappedKeys);
