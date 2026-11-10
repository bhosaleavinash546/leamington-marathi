/**
 * Material: the designation as written, recognised by the grammar of the standard it follows — never by a list of
 * "known" grades, so a grade nobody listed is still read. The standard is read separately; company specification
 * codes are read and never interpreted (their meaning is the customer's lookup table).
 *
 * A grammar marked `weak` is only a material where the drawing says it is one (the title block's material cell, or
 * text after "MATERIAL:" / "WERKSTOFF:"): "C45", "S355" or "PP" alone in a note prove nothing.
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, draft, type TextUnit } from './common.js';

export interface Grammar { family: string; re: RegExp; weak?: boolean }

const TEMPER = String.raw`(?:T\d{1,5}|H\d{2,3}|O|F)`;
const POLYMER = String.raw`PA\s?6[./]6|PA\s?66|PA\s?6\/66|PA\s?6T|PA\s?9T|PA\s?46|PA\s?12|PA\s?11|PA\s?6|PPA|PPSU|PPS|PPE|PPO|PP[+/]EPDM|PP|PE-HD|PE-LD|PE-UHMW|HDPE|LDPE|UHMWPE|PE|PC\s?[+/]\s?ABS|PC\s?[+/]\s?PBT|PC|ABS|ASA|SAN|PBT\s?[+/]\s?ASA|PBT|PET|POM-[CH]|POM|PMMA|PEEK|PEI|PSU|PES|PS|PVC-[UP]|PVC|TPE-[EUVSOA]|TPE|TPU|TPV|TPO|TPC|LCP|PTFE|PVDF|PUR`;
const FILLER = String.raw`(?:GF|GB|CF|MF|MD|TD|LGF|GM|GK|NF|T|M|K)\s?\d{1,2}`;
const ELASTOMER_STRONG = String.raw`EPDM|HNBR|NBR|FFKM|FKM|FPM|FVMQ|VMQ|MVQ|ACM|AEM|CSM|IIR|SBR|LSR`;
const ELASTOMER_WEAK = String.raw`ECO|HCR|CR|NR|BR|IR|AU|EU|SILICONE|SILIKON`;
const HARDNESS = String.raw`\d{2,3}\s?(?:[±+]\s?-?\s?\d{1,2}\s?)?(?:°\s?)?(?:SHORE\s?-?\s?[AD]|SH\.?\s?[AD]|IRHD)`;

/** The designation grammars, most specific first. Sources: the standards named beside each group. */
export const MATERIAL_GRAMMARS: Grammar[] = [
  // Cast irons — EN 1560 (EN-GJS / GJL / GJV / GJM), DIN 1691 / 1693 (GG / GGG), ASTM A536, SAE J434, JIS G 5501 / 5502
  { family: 'ductile iron', re: /\bEN[-\s]?GJS[-\s]?(?:HB\s?)?\d{3,4}(?:[-\s]\d{1,2})?(?:[-\s]?(?:LT|RT|U|S|C))?\b/i },
  { family: 'grey iron', re: /\bEN[-\s]?GJL[-\s]?(?:HB\s?)?\d{3}\b/i },
  { family: 'compacted graphite iron', re: /\bEN[-\s]?GJV[-\s]?\d{3}\b/i },
  { family: 'malleable iron', re: /\bEN[-\s]?GJM[WB][-\s]?\d{3}-\d{1,2}\b/i },
  { family: 'cast iron', re: /\bEN[-\s]?J[SLVM]\d{4}\b/i },
  { family: 'ductile iron', re: /\bGJS[-\s]?\d{3,4}(?:-\d{1,2})?\b/ },
  { family: 'grey iron', re: /\bGJL[-\s]?\d{3}\b/ },
  { family: 'compacted graphite iron', re: /\bGJV[-\s]?\d{3}\b/ },
  { family: 'ductile iron', re: /\bGGG[-\s]?\d{2}(?:\.\d)?\b/ },
  { family: 'grey iron', re: /\bGG[-\s]?\d{2}\b/ },
  { family: 'ductile iron', re: /\b(?:ASTM\s?)?A\s?536\s?(?:GR(?:ADE)?\.?\s?)?\d{2,3}-\d{2}-\d{2}\b/i },
  { family: 'ductile iron', re: /\bSAE\s?J434\s?D\d{4}\b/i },
  { family: 'ductile iron', re: /\bFCD\s?\d{3}\b/ },
  { family: 'grey iron', re: /\bFC\s?\d{3}\b/ },
  // Aluminium — EN 573 (EN AW), EN 1780 / 1706 (EN AC), Aluminum Association 4-digit + temper, BS 1490 (LM), JIS H 5302
  { family: 'aluminium (wrought)', re: new RegExp(String.raw`\bEN[-\s]?AW[-\s]?\d{4}[A-Z]?(?:\s?\[?Al\s?[A-Za-z\d,.()]+\]?)?(?:[-\s]?${TEMPER}\b)?`, 'i') },
  { family: 'aluminium (cast)', re: new RegExp(String.raw`\bEN[-\s]?AC[-\s]?(?:\d{5}|Al\s?Si[\w,.()]*)(?:[-\s]?[DKSL]{1,2}\b)?(?:[-\s]?${TEMPER}\b)?`, 'i') },
  { family: 'aluminium (cast)', re: /\bAl\s?Si\d[\w,.]*(?:\([A-Za-z]+\))?(?:[-\s]?(?:T\d{1,3}|F)\b)?/ },
  { family: 'aluminium (wrought)', re: /\bAl\s?(?:Mg|Cu|Zn|Mn)\d?[\w,.]*(?:[-\s]?(?:T\d{1,4}|H\d{2,3}|F|O)\b)?/ },
  { family: 'aluminium (wrought)', re: new RegExp(String.raw`\b(?:AA|ALU|ALLOY|ALUMINIUM|ALUMINUM|AL)[\s-]?[1-8]\d{3}[A-Z]?(?:[-\s]?${TEMPER}\b)?`, 'i') },
  { family: 'aluminium (wrought)', re: /\b[1-8]\d{3}[A-Z]?-(?:T\d{1,5}|H\d{2,3}|O|F)\b/ },
  { family: 'aluminium (cast)', re: /\b[AB]3(?:19|55|56|57|60|80|83|84|90)(?:\.\d)?(?:[-\s]T\d{1,2})?\b/ },
  { family: 'aluminium (cast)', re: /\bLM\s?\d{1,2}(?:[-\s]?(?:TF|TE|TB7?|TS|M|T\d))?\b/ },
  { family: 'aluminium (cast)', re: /\bADC\s?\d{1,2}\b/ },
  { family: 'aluminium (cast)', re: /\bAC\d[A-Z](?:-T\d)?\b/ },
  // Steels — EN 10027-1 names, EN 10027-2 numbers, VDA 239-100 sheet, SAE J403 / J404 / AISI, JIS G, BS 970
  { family: 'steel', re: /\bX\d{1,3}(?:Cr|Ni|Mo|Ti|Mn|Nb|Al|Cu|Co|Si|N|V|W|S){1,6}\d[\d-]*\b/ },
  { family: 'steel', re: /\b\d{2,3}(?:Cr|Mn|Ni|Mo|Si|Al|Pb|Ti|V|S|B|W){1,5}\d{1,2}(?:-\d{1,2})*(?:\+(?:QT|N|A|C|AC|SH|S|U|HH|HL|FP))?\b/ },
  { family: 'steel', re: /\b[SE]\d{3}(?:J[R02]|K2|NL?|ML?|MC|NC)(?:G\d|\+N|\+AR|\+M|\+Z\d+)*\b/ },
  { family: 'steel', re: /\bD[CDX]\d{2}D?(?:\+(?:ZE|ZF|ZA|ZM|AS|AZ|Z)\d*(?:[-/]\d+)*(?:-[A-Z]{1,2}\b)?)?/ },
  { family: 'steel', re: /\bH[CX]\d{3}(?:LAD|LA|XD|X|BD|B|YD|Y|PD|P|CD|C|TD|T|I)?(?:\+(?:ZE|ZF|ZA|ZM|AS|Z)\d*(?:[-/]\d+)*)?\b/ },
  { family: 'steel', re: /\bCR\d{1,3}(?:LA|IF|BH|Y\d{3,4}T)(?:-[A-Z]{2})?(?:-(?:UC|EG|GI|GA|ZM)\d*(?:\/\d+)?)?(?:-[UE])?\b/ },
  { family: 'steel', re: /\b(?:W\.?\s?-?\s?Nr\.?|WNR\.?|Werkstoff-?\s?Nr\.?|Mat\.?\s?-?\s?N[ro]\.?)\s*:?\s*[1-3]\.\d{4}\b/i },
  { family: 'steel', re: /\b(?:SAE|AISI)\s?(?:J\d{3,4}\s?)?(?:\d{4}[HL]?|30[1-9]L?|31[0-9]L?|32[1-9]|4[0-4]\d[A-F]?|17-4\s?PH|15-5\s?PH|12L14)\b/i },
  { family: 'steel', re: /\b(?:S\d{2}C|SCM\s?\d{3}H?|SNCM\s?\d{3}|SCr\s?\d{3}H?|SS\s?400|SUS\s?\d{3}[A-Z]?\d?|SP[CH][CDEFG]|SEC[CDE]|SUJ\s?2|SKD\s?\d{1,2}|S[45]5C)\b/ },
  { family: 'steel', re: /\b(?:BS\s?970[\s:-]*(?:PT\.?\s?\d\s?)?)?\d{3}[AMH]\d{2}\b/ },
  { family: 'steel', re: /\bC[k]?\d{2}[ER]?(?:\+(?:QT|N|A|C|SH|S|U))?\b/, weak: true },
  { family: 'steel', re: /\b[SE](?:235|275|295|335|355|360|420|460|500|550|600|650|700|890|960)\b/, weak: true },
  { family: 'steel', re: /\b[1-3]\.\d{4}\b/, weak: true },
  { family: 'steel', re: /\b(?:4140|4340|4130|8620|1045|1018|1020|52100|1215|4150|9310)\b/, weak: true },
  { family: 'steel', re: /\bEN\s?(?:1A|3B|8[A-DM]?|9|16T?|19T?|24T?|31|32[A-C]?|36[A-C]?|40B|43[A-D]?|45|47|57|58[A-J]?)\b/, weak: true },
  // Magnesium (EN 1753, ASTM B94), zinc (EN 1774 / 12844), copper (EN 1412 CW / CC numbers, EN 1982), titanium, nickel
  { family: 'magnesium', re: /\b(?:AZ91[A-E]?|AM[56]0[AB]?|AE44|AZ31B?|AS[24]1|WE43|ZK60A?|EN[-\s]?M[CB][-\s]?(?:\d{5}|Mg\w+)|MgAl\d(?:Zn\d?|Mn\d?)?)\b/ },
  { family: 'zinc', re: /\b(?:ZAMAK\s?-?\s?[2357]|ZA[-\s]?(?:8|12|27)|ZP\s?\d{1,4}|ZL\s?\d{1,4}|ZnAl4(?:Cu\d)?)\b/i },
  { family: 'copper alloy', re: /\bCu(?:Zn|Sn|Al|Ni|Be|Cr|Pb|Ag|Te|Fe|Mn|Si)\d[\w-]*/ },
  { family: 'copper alloy', re: /\bC[WC]\d{3}[A-Z]\b/ },
  { family: 'copper', re: /\b(?:Cu-(?:ETP|OFE|OF|DHP|DLP|HCP|PHC)|(?:E|SE|SF|OF)-Cu\s?\d{0,2})\b/ },
  { family: 'titanium', re: /\b(?:Ti[-\s]?6Al[-\s]?4V(?:\s?ELI)?|TiAl6V4|Ti(?:tanium)?\s?Gr(?:ade)?\.?\s?\d{1,2})\b/i },
  { family: 'nickel alloy', re: /\b(?:(?:INCONEL|INCOLOY|HASTELLOY|MONEL|NIMONIC)\s?[A-Z]?-?\d{2,3}[A-Z]?|IN\s?(?:718|625|713)[A-Z]{0,2})\b/i },
  // Plastics — ISO 1043-1 base polymer, ISO 1043-2 filler (GF30, T20 …), ISO 11469 marking >…<
  { family: 'thermoplastic', re: new RegExp(String.raw`>\s?(?:${POLYMER})(?:\s?[-+]\s?(?:\(?(?:${FILLER})\)?)){0,3}\s?<`) },
  { family: 'thermoplastic', re: new RegExp(String.raw`\b(?:${POLYMER})(?:\s?[-\s+]\s?\(?(?:${FILLER})\)?){1,3}(?![A-Za-z0-9])`) },
  { family: 'thermoplastic', re: new RegExp(String.raw`\b(?:${POLYMER})\b(?![-+/]?[A-Za-z0-9])`), weak: true },
  // Elastomers — ISO 1629 symbol with a hardness (ISO 48 IRHD / Shore)
  { family: 'elastomer', re: new RegExp(String.raw`\b(?:${ELASTOMER_STRONG}|${ELASTOMER_WEAK})\s?-?\s?${HARDNESS}`, 'i') },
  { family: 'elastomer', re: new RegExp(String.raw`\b(?:${ELASTOMER_STRONG})\b`) },
  { family: 'elastomer', re: new RegExp(String.raw`\b(?:${ELASTOMER_WEAK})\b`), weak: true },
  // Composites — named, not graded
  { family: 'composite', re: /\b(?:CFRP|GFRP|CFK|GFK|SMC|BMC|GMT|CARBON\s?FIB(?:RE|ER)[\w\s/-]{0,30}?(?:PREPREG|EPOXY|LAMINATE)|PREPREG)\b/i, weak: true },
];

/** A standard written beside a material ("EN 1563", "DIN EN 10083-3", "ASTM A536", "ISO 1043"). */
export const STANDARD_RE = /\b(?:DIN\s?EN\s?ISO|DIN\s?EN|DIN\s?ISO|EN\s?ISO|BS\s?EN\s?ISO|BS\s?EN|ISO|EN|DIN|ASTM|SAE|JIS|BS|VDA|AMS|GB\/T)\s?[A-Z]?\s?\d{2,6}(?:[-/]\d{1,3}){0,2}(?::\s?\d{4})?\b/g;

/** Company specification codes — read as written, never interpreted. One pattern per code family seen in automotive drawings. */
export const SPEC_CODE_RES: RegExp[] = [
  /\b(?:STJLR|TPJLR)[.\s-]?\d{2}[.\s]\d{4}\b/g,
  /\bWS[SDKEB]-M\d{1,2}[A-Z]\d{2,4}-[A-Z]\d{0,2}\b/g,
  /\bES[A-Z0-9]{1,3}-M\d{1,2}[A-Z]\d{1,4}-[A-Z]\d{0,2}\b/g,
  /\bGMW\s?\d{3,5}(?:-[A-Z0-9]+)*\b/g,
  /\b(?:TL|PV)\s?\d{3,5}(?:-[A-Z0-9]+)?\b/g,
  /\bVW\s?\d{5}(?:-\d+)?\b/g,
  /\bGS\s?9\d{4}(?:-\d{1,2})?\b/g,
  /\bDBL\s?\d{4}(?:\.\d{2})?\b/g,
  /\bMBN\s?\d{4,5}(?:-\d{1,2})?\b/g,
  /\b(?:STD|VCS)\s?\d{3,4}[,.]\d{1,4}\b/g,
  /\bMS[-.\s]?[A-Z]{2}\d{1,4}(?:-\d{1,2})?\b/g,
  /\bTSM\d{4}G\b/g,
  /\bNES\s?M\d{4}\b/g,
  /\bHES\s?[A-Z]\s?\d{3,4}(?:-\d{2})?\b/g,
];

export interface DesignationHit { designation: string; family: string; index: number; weak: boolean }

/** Every designation in a piece of text. Overlapping matches keep the longest; `allowWeak` admits the weak grammars. */
export function findDesignations(text: string, allowWeak: boolean): DesignationHit[] {
  const hits: DesignationHit[] = [];
  for (const g of MATERIAL_GRAMMARS) {
    if (g.weak && !allowWeak) continue;
    const re = new RegExp(g.re.source, g.re.flags.includes('g') ? g.re.flags : g.re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (!m[0]) { re.lastIndex++; continue; }
      const d = m[0].trim().replace(/[\s,;.]+$/, '');
      hits.push({ designation: d, family: g.family, index: m.index, weak: !!g.weak });
    }
  }
  // drop a hit that lies inside a longer one, and exact repeats
  const kept: DesignationHit[] = [];
  for (const h of hits.sort((a, b) => a.index - b.index || b.designation.length - a.designation.length)) {
    const end = h.index + h.designation.length;
    const cover = kept.find(k => h.index >= k.index && end <= k.index + k.designation.length);
    if (cover) continue;
    const swallowed = kept.findIndex(k => k.index >= h.index && k.index + k.designation.length <= end);
    if (swallowed >= 0) kept.splice(swallowed, 1);
    kept.push(h);
  }
  return kept.sort((a, b) => Number(a.weak) - Number(b.weak) || a.index - b.index);
}

/** The temper or delivery condition a designation carries ("6082-T6" → T6, "42CrMo4+QT" → +QT). */
export function conditionOf(designation: string): string | undefined {
  const t = /(?:^|[-\s])(T\d{1,5}|H\d{2,3})$/.exec(designation);
  if (t) return t[1];
  const s = /(\+(?:QT|N|A|C|AC|SH|S|U|AR|M))\b/.exec(designation);
  if (s) return s[1];
  const lm = /^LM\s?\d{1,2}[-\s]?(TF|TE|TB7?|TS|M)$/.exec(designation);
  return lm ? lm[1] : undefined;
}

const MATERIAL_LABEL = /\b(?:MATERIAL|MAT'?L|WERKSTOFF|HALBZEUG)\b\.?\s*(?:SPEC(?:IFICATION)?\s*)?[:=-]?\s*/i;
const SEE_NOTE = /\b(?:SEE|SIEHE|S\.)\s*(?:NOTE|ANMERKUNG|HINWEIS)\s*(\d{1,2})\b/i;
const key = (d: string): string => d.toUpperCase().replace(/[\s-]/g, '');

export function extractMaterial(ctx: ExtractContext): DraftParameter[] {
  const units = buildUnits(ctx);
  const out: DraftParameter[] = [];
  interface Cand { hit: DesignationHit; unit: TextUnit; rank: number }
  const cands: Cand[] = [];
  const cell = units.filter(u => u.context === 'title:material');
  const scan = (u: TextUnit, text: string, rank: number, allowWeak: boolean): void => {
    for (const h of findDesignations(text, allowWeak)) cands.push({ hit: h, unit: u, rank });
  };
  for (const u of cell) {
    scan(u, u.text, 0, true);
    const ref = SEE_NOTE.exec(u.text);
    if (ref) for (const n of units.filter(x => x.context === 'note' && x.noteNo === ref[1])) scan(n, n.text, 0, true);
  }
  for (const u of units) {
    if (u.context === 'title:material') continue;
    const lab = MATERIAL_LABEL.exec(u.text);
    if (lab && !/^title:/.test(u.context)) scan(u, u.text.slice(lab.index + lab[0].length), 1, true);
    else if (u.context === 'note') scan(u, u.text, 2, false);
    else if (u.context === 'free' && u.region !== 'title-block') scan(u, u.text, 3, false);
    else if (u.context === 'free' && u.region === 'title-block') scan(u, u.text, 2, false);
  }
  cands.sort((a, b) => a.rank - b.rank || Number(a.hit.weak) - Number(b.hit.weak) || a.unit.sheet - b.unit.sheet || a.unit.bbox[1] - b.unit.bbox[1] || a.hit.index - b.hit.index);

  const best = cands[0];
  if (best) {
    const others = [...new Set(cands.filter(c => key(c.hit.designation) !== key(best.hit.designation)).map(c => c.hit.designation))];
    const sameRank = cands.some(c => c.rank === best.rank && key(c.hit.designation) !== key(best.hit.designation) && c.hit.family !== best.hit.family);
    const where = best.rank === 0 ? 'the title block\'s material cell' : best.rank === 1 ? 'text labelled as the material' : best.rank === 2 ? 'a note' : 'free text on the sheet';
    const note = [`Found in ${where}.`, others.length ? `Other designations on the drawing: ${others.slice(0, 6).join('; ')}.` : ''].filter(Boolean).join(' ');
    const status = sameRank || best.rank === 3 ? 'needs-validation' as const : undefined;
    out.push(draft('material.designation', best.hit.designation, best.unit, { raw: best.unit.text, at: best.hit.designation, note, ...(status ? { status } : {}) }));
    out.push(draft('material.family', best.hit.family, best.unit, {
      raw: best.hit.designation, at: best.hit.designation, kind: 'interpreted', ...(status ? { status } : {}),
      note: `From the form of the designation "${best.hit.designation}" (designation grammar), not from a grade list.`,
    }));
    const cond = conditionOf(best.hit.designation);
    if (cond) out.push(draft('material.condition', cond, best.unit, { raw: best.hit.designation, at: best.hit.designation, ...(status ? { status } : {}) }));
    STANDARD_RE.lastIndex = 0;
    const stds = best.unit.text.match(STANDARD_RE) ?? [];
    // a standard that is part of the designation itself ("ASTM A536 65-45-12") is not a second fact
    const std = stds.find(s => !key(best.hit.designation).includes(key(s)) || /^(?:ASTM|SAE|JIS|BS)/i.test(s));
    if (std) out.push(draft('material.standard', std.replace(/\s+/g, ' '), best.unit, { raw: best.unit.text, at: std, ...(status ? { status } : {}) }));
  } else if (cell.length) {
    const u = cell[0];
    if (u.text && !/^[-–—/.\s]*$/.test(u.text)) {
      out.push(draft('material.designation', u.text, u, {
        status: 'needs-validation',
        note: 'The title block\'s material cell holds text that matches no designation grammar: read as written, not interpreted.',
      }));
    }
  }
  // stock / sheet thickness: its own title-block cell, or "t = 1.5" beside the material
  const thk = units.find(u => u.context === 'title:thickness');
  if (thk) {
    const m = /(\d+(?:[.,]\d+)?)\s?(mm|MM)?/.exec(thk.text);
    if (m) out.push(draft('material.stockThickness', Number(m[1].replace(',', '.')), thk, { unit: 'mm', raw: thk.text, ...(m[2] ? {} : { status: 'needs-validation' as const, note: 'The thickness cell gives a number with no unit: millimetres not confirmed.' }) }));
  } else {
    for (const u of [...cell, ...units.filter(x => MATERIAL_LABEL.test(x.text) && !x.context.startsWith('title:'))]) {
      const m = /\b(?:t|THK\.?|THICKNESS|BLECHDICKE|DICKE|s)\s?[=:]\s?(\d+(?:[.,]\d+)?)\s?(?:mm|MM)?\b/.exec(u.text);
      if (m) { out.push(draft('material.stockThickness', Number(m[1].replace(',', '.')), u, { unit: 'mm', raw: u.text, at: m[0] })); break; }
    }
  }
  // company specification codes, wherever they are written
  const seen = new Set<string>();
  for (const u of units) {
    if (u.context.startsWith('title:') && !/title:(material|finish|heatTreatment|generalTolerance|roughness)/.test(u.context)) continue;
    for (const re of SPEC_CODE_RES) {
      re.lastIndex = 0;
      for (const m of u.text.match(re) ?? []) {
        const code = m.replace(/\s+/g, ' ');
        const k = `${u.sheet}|${code}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(draft('material.specCode', code, u, { raw: u.text, at: m, note: 'Company specification code: read as written. Its meaning comes from the customer\'s specification table, never from this reader.' }));
      }
    }
  }
  return out;
}
