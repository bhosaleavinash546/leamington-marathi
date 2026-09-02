// ─────────────────────────────────────────────────────────────────────────────
// Technical-depth rubric for generated ideas.
//
// WHY THIS EXISTS. The validator's qualityScore was completeness-only: 100 minus
// eight per missing field. Measured on 63 live Prism ideas across four parts,
// every single idea scored 100 — a shallow "use higher-strength steel" and a
// fully worked DP780 downgauge with springback compensation were identical to
// the ranking, the badges and the tournament. Nothing in the pipeline could
// tell depth from prose.
//
// This module scores what the validator can actually CHECK, not what it can
// only read. Five criteria, each a deterministic pattern test:
//
//   grade       a specific designation is named (DP780, EN AW-6082 T6, NO30,
//               GJS-450, PA66-GF30, M250-35A, N42UH …) — not a family
//   mechanism   at least two quantities with engineering units AND a change
//               marker (from → to, reduce, vs …): the idea says what moves
//   validation  a named validation activity for the risk (DV/PV, CAE, rig,
//               PPAP, CMM, peel test …)
//   dfm         a DFM/DFA principle from the catalogue vocabulary, or a written
//               DFM-implications section
//   evidence    every cited evidence ref resolves to a line that exists in the
//               dossier (Prism), or a dated, titled source is given (ordinary)
//
// plus one section criterion: the five ENGINEERING sections the prompt now
// demands (mechanism, specDeltas, validationPlan, dfmImplications, costBridge),
// each substantive. 5 × 16 + 20 = 100. 100 is unreachable without all six.
//
// House rule: math for numbers, LLM for judgment. This rubric is the math half
// — it says whether the idea CONTAINS the ingredients of a deep idea. Whether
// they are RIGHT is for the engine check (cost direction), the arithmetic
// check (the model's own sums) and the critique panel (discipline review).
// Pure, dependency-free, fixture-tested.
// ─────────────────────────────────────────────────────────────────────────────

export const DEPTH_WEIGHTS = Object.freeze({ grade: 16, mechanism: 16, validation: 16, dfm: 16, evidence: 16, sections: 20 });
export const ENGINEERING_SECTIONS = Object.freeze(['mechanism', 'specDeltas', 'validationPlan', 'dfmImplications', 'costBridge']);
const MIN_SECTION_CHARS = 40;

// Designation patterns. Each names a SPECIFIC grade or standard, never a
// family. Kept as data so a missing pattern is a one-line addition.
const GRADE_PATTERNS = [
  // Steels — sheet, AHSS, PHS, engineering, stainless
  /\b(?:DP|CP|TRIP|MS|HX|HC|CR|HR|DC|DD|DX)\s?-?\d{2,4}(?:\s?[A-Z]{1,3})?\b/,
  /\bS\d{3}\s?(?:MC|JR|J0|J2|K2|N|NL|ML)?\b/,
  /\b(?:22MnB5|20MnB5|34MnB5|42CrMo4|34CrNiMo6|16MnCr5|20MnCr5|18CrNiMo7-6|C45E?|C70S6|CF53|38MnVS6|46MnVS6|100Cr6|X5CrNi18-10|X2CrNiMo17-12-2|1\.4301|1\.4404|1\.4310|SAE\s?\d{4}|AISI\s?\d{3,4}[A-Z]?|SUS\s?\d{3})\b/,
  /\b(?:HSLA|SPFH|SPFC|SAPH|SPCC|SPCE|JSC|JAC)\s?\d{3}[A-Z]?\b/,
  /\b(?:Usibor|Ductibor|Docol|Fortiform|MartINsite|Strenx|Domex|Hardox)\s?\d{3,4}\b/i,
  /\bQP\d{3,4}\b|\bPHS\s?\d{4}\b/,
  // Aluminium — wrought and cast
  /\bEN\s?AW-?\s?\d{4}(?:\s?-?\s?[TOH]\d{1,3})?\b/,
  /\b(?:AA|AW)?\s?[2567]\d{3}\s?-\s?[TOH]\d{1,3}\b/,
  /\bA\d{3}(?:\.\d)?(?:\s?-\s?T\d)?\b/,
  /\bEN\s?AC-?\s?\d{5}\b|\bAC-?\d{5}\b/,
  /\bAlSi\d{1,2}(?:Cu|Mg|Mn)?\d?(?:Mg|Cu|Mn|Zr|Mo)?[\d.]*\b/,
  /\b(?:ADC|LM)\s?\d{1,2}\b|\bSilafont-?\d{2}\b|\bCastasil-?\d{2}\b|\bC355\b|\bA?356(?:\.\d)?-?T6\b/i,
  // Cast irons, magnesium, copper, zinc, titanium
  /\b(?:EN-)?GJ[SLV]-?\s?\d{3}(?:-\d{1,2})?\b|\bGGG-?\d{2}\b|\bADI\s?\d{3,4}\b|\bSiMo\d{2}\b/,
  /\bA[ZME]\s?\d{2}[A-Z]?\b/,
  /\bCu-?(?:ETP|OF|OFE|DHP|HCP)\b|\bCuZn\d{2}(?:Pb\d)?\b|\bCuSn\d{1,2}\b|\bCuCrZr\b|\bC1\d{4}\b|\bC\d{5}\b/,
  /\bZAMAK\s?\d\b|\bZP\d{4}\b|\bZA-?\d{1,2}\b/i,
  /\bTi-?6Al-?4V\b|\bTA\d{1,2}\b|\bGrade\s?[2359]\s?Ti\b/i,
  // Polymers and composites
  /\b(?:PA6|PA66|PA12|PA46|PA6T|PPA|PBT|PET|PPS|PEEK|PPSU|PEI|POM|PC|ABS|PP|LCP|TPU|TPV|EPDM|FKM|HNBR|NBR|VMQ|PPE|PMMA)\s?-?\s?(?:GF|CF|LGF|T|MD|TD)\s?\d{2}\b/,
  /\bPP-?EPDM\b|\bPC\/ABS\b|\bPOM-?[CH]\b|\bSMC\b|\bBMC\b|\bGMT\b|\bLFT-?D\b/,
  // Electrical steel and magnets
  /\bM\d{3}-\d{2}A\b|\bNO\s?\d{2}\b|\b\d{2}(?:JN|JNE|JNH|CS|HXT|PN)\d{2,4}\b|\b\d{2}[A-Z]{2,3}\d{3,4}\b/,
  /\bN\d{2}(?:M|H|SH|UH|EH|AH)\b|\bY\d{2}[A-Z]{1,2}\b|\bSmCo\b|\bNd(?:Fe)?B\b/,
  // Standards and specs that pin a requirement
  /\b(?:EN|ISO|DIN|IEC|SAE|ASTM|AMS|JIS|GB\/T|VDA|BS|UL|LV)\s?[A-Z]?\d{2,5}(?:-\d{1,3})?\b/,
  /\bIATF\s?16949\b|\bISO\s?26262\b|\bPPAP\b|\bAIAG\b/,
  // Fastener/thread and coating designations
  /\bM\d{1,2}(?:x\d(?:\.\d)?)?\s?(?:x|×)\s?\d{1,3}\b|\b(?:8\.8|10\.9|12\.9)\b|\bDacromet\b|\bGeomet\s?\d{3}\b|\bZnNi\b|\bKTL\b/,
];

// Quantities with engineering units. Deliberately excludes currency, which is
// the cost bridge's business, and bare percentages, which every idea has.
const QUANTITY_RE = /(?<![€£$¥])\b\d+(?:[.,]\d+)?\s?(?:mm|µm|um|μm|cm|m\b|kg|g\b|mg|t\b|tonnes?|MPa|GPa|kN|N\b|N·?m|Nm|°C|°|K\b|s\b|sec|ms|min\b|h\b|hr|kW|W\b|W\/mK|V\b|A\b|mΩ|µΩ|Hz|kHz|rpm|spm|strokes?|shots?|cycles?|dB|bar|l\/min|L\/min|ppm|Cpk|Ra|Rz|HRC|HB|HV|J\b|kJ|Wh|kWh|Ah|T\b|mT|µs)\b/g;
const CHANGE_RE = /→|->|\bfrom\b.{1,40}\bto\b|\bvs\.?\b|\bversus\b|\binstead of\b|\breplac|\breduc|\bcut\b|\bcuts\b|\bdrop|\blift|\brais|\bincreas|\bdecreas|\bdown-?gaug|\bup-?gaug|\bthinn|\bthick|\bshorten|\blengthen|\bhalv|\bdoubl|\belimin|\bdelet|\bconsolidat|\bmerge/i;

const VALIDATION_RE = /\bvalidat|\btest(?:ed|ing|s)?\b|\btrial|\bDV\b|\bPV\b|\bDVP&?R?\b|\bPPAP\b|\bPSW\b|\bCAE\b|\bFEA\b|\bCFD\b|\bLS-DYNA\b|\bAbaqus\b|\bNastran\b|\brig\b|\bCMM\b|\bfirst[- ]article\b|\bcoupon|\bprototype|\b[ABC]-sample|\bdyno|\bdurability\b|\bfatigue\b|\bsalt[- ]spray\b|\bthermal[- ]cycl|\bHALT\b|\bEOL\b|\bSPC\b|\bCpk\b|\bgauge R&R\b|\bpeel\b|\bchisel\b|\bpull-?out\b|\btorque audit|\bEMC\b|\bhipot\b|\bhi-pot\b|\bdielectric\b|\bleak[- ]test|\bburst\b|\bmodal\b|\bcorrelat|\bbench\b|\bsled\b|\bcrash test|\bNCAP\b|\bhomologat|\bsign-?off|\bDFMEA\b|\bPFMEA\b|\bMSA\b|\bcapability study/i;

const DFM_VOCAB_RE = /consolidat|eliminat|standardi[sz]|self-?locat|self-?align|symmetr|near-?net|toleranc|draft|wall|rib|undercut|fastener|weld|joint|access|orient|poka|modular|common|part count|minimi[sz]|simplif|net shape|nest|scrap|yield|cycle|tooling|design for|\bdfa\b|\bdfm\b|snap|insert|handling|feed|assembl|one[- ]piece|integral|reduce|combine|mistake|fixtur|datum|grip|reach|robust/i;

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const substantive = (s, min = MIN_SECTION_CHARS) => text(s).trim().length >= min;

/** Find the first designation in a text; null when none. Exported for the grade-dictionary validator. */
export function findGrade(s) {
  const t = text(s);
  for (const re of GRADE_PATTERNS) {
    const m = re.exec(t);
    if (m) return m[0].trim();
  }
  return null;
}

/** Distinct quantities-with-units in a text (deduplicated by value+unit). */
export function findQuantities(s) {
  const out = new Set();
  const t = text(s);
  QUANTITY_RE.lastIndex = 0;
  let m;
  while ((m = QUANTITY_RE.exec(t))) out.add(m[0].replace(/\s+/g, ' ').trim());
  return [...out];
}

/**
 * Score one idea. ctx:
 *   evidenceIds  Set|array of dossier line ids ([E1]…[W9]) — when given, the
 *                evidence criterion checks that refs RESOLVE; when absent the
 *                idea is judged on its evidenceSources instead (and says so)
 * Returns { score, criteria: { <name>: { met, weight, detail } }, missing: [names] }.
 */
export function scoreDepth(idea, ctx = {}) {
  const i = idea && typeof idea === 'object' ? idea : {};
  const eng = i.engineering && typeof i.engineering === 'object' ? i.engineering : null;
  const body = [i.title, i.technicalDescription, i.manufacturingImpact, i.materialGrade, eng?.mechanism, eng?.specDeltas].map(text).join('\n');
  const criteria = {};

  // grade
  const grade = findGrade(body);
  criteria.grade = { met: !!grade, weight: DEPTH_WEIGHTS.grade, detail: grade ? `names ${grade}` : 'no specific grade, standard or designation named — families ("high-strength steel") do not count' };

  // mechanism
  const qty = findQuantities(body);
  const change = CHANGE_RE.test(body);
  const mechMet = qty.length >= 2 && change;
  criteria.mechanism = {
    met: mechMet, weight: DEPTH_WEIGHTS.mechanism,
    detail: mechMet ? `${qty.length} quantities with units and a stated change (${qty.slice(0, 4).join(', ')})`
      : qty.length < 2 ? `only ${qty.length} quantity with an engineering unit — say what dimension, gauge, time or property moves`
      : 'quantities present but no change stated (from → to, reduce, vs)',
  };

  // validation
  const valText = [i.riskNotes, eng?.validationPlan].map(text).join('\n');
  const valMet = VALIDATION_RE.test(valText);
  criteria.validation = { met: valMet, weight: DEPTH_WEIGHTS.validation, detail: valMet ? 'names a validation activity for the risk' : 'risk stated without saying what validates it (DV/PV, CAE, rig, PPAP, CMM …)' };

  // dfm
  const principles = Array.isArray(i.dfmaPrinciples) ? i.dfmaPrinciples.filter(p => typeof p === 'string') : [];
  const dfmFromList = principles.some(p => DFM_VOCAB_RE.test(p));
  const dfmFromSection = substantive(eng?.dfmImplications);
  criteria.dfm = { met: dfmFromList || dfmFromSection, weight: DEPTH_WEIGHTS.dfm, detail: dfmFromList ? `DFM principle: ${principles.find(p => DFM_VOCAB_RE.test(p))}` : dfmFromSection ? 'DFM implications section written' : 'no recognisable DFM/DFA principle or implications section' };

  // evidence
  const ids = ctx.evidenceIds ? new Set(Array.isArray(ctx.evidenceIds) ? ctx.evidenceIds : [...ctx.evidenceIds]) : null;
  const refs = Array.isArray(i.evidenceRefs) ? i.evidenceRefs.filter(r => typeof r === 'string') : [];
  if (ids) {
    const unresolved = refs.filter(r => !ids.has(r));
    const met = refs.length > 0 && unresolved.length === 0;
    criteria.evidence = { met, weight: DEPTH_WEIGHTS.evidence, detail: met ? `${refs.length} evidence ref${refs.length === 1 ? '' : 's'} resolve to dossier lines` : refs.length === 0 ? 'cites no dossier evidence line' : `refs do not exist in the dossier: ${unresolved.join(', ')}` };
  } else {
    const srcs = Array.isArray(i.evidenceSources) ? i.evidenceSources : [];
    const good = srcs.some(s => s && typeof s === 'object' && text(s.title).trim().length >= 8 && Number.isFinite(Number(s.year)));
    criteria.evidence = { met: good, weight: DEPTH_WEIGHTS.evidence, detail: good ? 'dated, titled source given (no dossier — judged on evidenceSources)' : 'no dated, titled evidence source' };
  }

  // sections
  const present = eng ? ENGINEERING_SECTIONS.filter(k => substantive(eng[k])) : [];
  const secMet = present.length === ENGINEERING_SECTIONS.length;
  criteria.sections = { met: secMet, weight: DEPTH_WEIGHTS.sections, detail: secMet ? 'all five engineering sections substantive' : eng ? `engineering sections missing or thin: ${ENGINEERING_SECTIONS.filter(k => !present.includes(k)).join(', ')}` : 'no engineering sections (mechanism, specDeltas, validationPlan, dfmImplications, costBridge)' };

  const score = Object.values(criteria).reduce((s, c) => s + (c.met ? c.weight : 0), 0);
  const missing = Object.entries(criteria).filter(([, c]) => !c.met).map(([k]) => k);
  return { score, criteria, missing };
}

/** Batch view for the eval: distribution of scores and per-criterion hit rates. */
export function depthSummary(ideas) {
  const list = (Array.isArray(ideas) ? ideas : []).map(i => i?.depth).filter(d => d && typeof d.score === 'number');
  if (!list.length) return { n: 0, min: null, median: null, max: null, spread: null, criteriaHitPct: {} };
  const scores = list.map(d => d.score).sort((a, b) => a - b);
  const median = scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2;
  const criteriaHitPct = {};
  for (const k of Object.keys(DEPTH_WEIGHTS)) {
    criteriaHitPct[k] = Math.round(100 * list.filter(d => d.criteria?.[k]?.met).length / list.length);
  }
  return { n: list.length, min: scores[0], median, max: scores[scores.length - 1], spread: scores[scores.length - 1] - scores[0], criteriaHitPct };
}
