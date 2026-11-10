/**
 * Quality and service requirements written in notes: leak / pressure test (with its pressure, medium and rate),
 * impregnation, non-destructive testing (method, standard, class), cleanliness, safety / critical-characteristic
 * markings, part marking, inspection requirements and edge condition. Each is kept as written.
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, clauses, draft, type TextUnit } from './common.js';

const LEAK = /\b(?:LEAK\s?-?\s?(?:TEST\w*|TIGHT\w*|RATE|CHECK\w*|PROOF)|PRESSURE\s?-?\s?(?:TEST\w*|TIGHT\w*)|HELIUM\s+(?:LEAK|TEST)\w*|DICHTHEIT\w*|DRUCKDICHT\w*|DRUCKPR[ÜU]F\w*|DICHT(?:IGKEIT)?SPR[ÜU]F\w*|LECK(?:RATE|TEST|PR[ÜU]F)\w*|GAS\s?-?\s?TIGHT|WATER\s?-?\s?TIGHT|PRESSURE\s+DECAY)\b/i;
const IMPREG = /\b(?:IMPREGNAT\w*|IMPR[ÄA]GNIER\w*|VACUUM\s+SEAL\w*|RESINOL)\b/i;
const NDT: Array<{ method: string; re: RegExp }> = [
  { method: 'radiographic', re: /\b(?:X\s?-?\s?RAY\w*|RADIOGRAPH\w*|R[ÖO]NTGEN\w*|DURCHSTRAHLUNGSPR\w*|ASTM\s?E\s?(?:155|505|446|186|280)|VDG\s?P\s?20[12]|COMPUTED\s+TOMOGRAPHY|CT\s?-?\s?SCAN\w*)\b/i },
  { method: 'magnetic particle', re: /\b(?:MAGNETIC\s+PARTICLE\w*|MPI\b|MAGNAFLUX\w*|MAGNETPULVER\w*|(?:EN\s?)?ISO\s?9934(?:-\d)?|ASTM\s?E\s?(?:1444|709))\b/i },
  { method: 'penetrant', re: /\b(?:(?:DYE|LIQUID|FLUORESCENT)\s+PENETRANT\w*|PENETRANT\s+(?:TEST\w*|INSPECT\w*)|FPI\b|LPI\b|FARBEINDRING\w*|EINDRINGPR[ÜU]F\w*|(?:EN\s?)?ISO\s?3452(?:-\d)?|ASTM\s?E\s?(?:1417|165))\b/i },
  { method: 'ultrasonic', re: /\b(?:ULTRASONIC\w*|ULTRASCHALL\w*|UT\s+(?:TEST\w*|INSPECT\w*)|(?:EN\s?)?ISO\s?16810|EN\s?10228-[34]|EN\s?12680(?:-\d)?)\b/i },
  { method: 'eddy current', re: /\b(?:EDDY\s?-?\s?CURRENT\w*|WIRBELSTROM\w*)\b/i },
  { method: 'crack test', re: /\b(?:CRACK\s?-?\s?(?:TEST\w*|DETECT\w*|INSPECT\w*|CHECK\w*)|RISSPR[ÜU]F\w*|100\s?%\s+CRACK\w*)\b/i },
];
const CLEAN = /\b(?:VDA\s?19(?:\.[12])?|ISO\s?16232(?:-\d{1,2})?|(?:TECHNICAL\s+|COMPONENT\s+)?CLEANLINESS\w*|SAUBERKEIT\w*|RESTSCHMUTZ\w*|RESIDUAL\s+(?:DIRT|CONTAMINATION)\w*|PARTICLE\s+SIZE\s+(?:MAX|≤|<))\b/i;
const SAFETY_WORDS = /\b(?:SAFETY\s?-?\s?CRITICAL|SAFETY\s?-?\s?RELEVANT|SAFETY\s+(?:PART|CHARACTERISTIC|ITEM)|SICHERHEITSRELEVANT\w*|SICHERHEITSTEIL\w*|SICHERHEITSBAUTEIL\w*|CRITICAL\s+CHARACTERISTIC\w*|SIGNIFICANT\s+CHARACTERISTIC\w*|KEY\s+(?:PRODUCT\s+)?CHARACTERISTIC\w*|DOKUMENTATIONSPFLICHT\w*|D\s?-?\s?TEIL\b|TLD\b|FMVSS\s?\d{3})/i;
/** Marking tokens that stand alone beside a characteristic: <S>, <CC>, (SC), [CC], an inverted delta. */
const SAFETY_TOKEN = /^(?:<\s?(?:S|CC|SC|D|KC)\s?>|\((?:CC|SC|KC|KPC|KCC)\)|\[(?:CC|SC|KC)\]|CC|SC|KPC|KCC|[▽∇⛛])$/;
const MARKING = /\b(?:PART\s+MARK\w*|MARK(?:ED|ING)?\s+(?:WITH|PART|TO|PER|ACC\w*)|IDENTIFICATION\s+MARK\w*|KENNZEICHN\w*|BESCHRIFT\w*|DATE\s?-?\s?(?:CLOCK|STAMP|CODE)|LASER\s?-?\s?(?:MARK\w*|ENGRAV\w*)|DATA\s?-?\s?MATRIX|DMC\b|VDA\s?260|ISO\s?11469|CAVITY\s+(?:NO\.?|NUMBER|IDENT\w*)|FORMNEST\w*|RECYCLING\s+(?:CODE|SYMBOL)|SUPPLIER\s+(?:LOGO|CODE|IDENT\w*)|EMBOSS\w*|PART\s+NUMBER\s+(?:TO\s+BE\s+)?(?:CAST|MOULDED|MOLDED|STAMPED|ENGRAVED))/i;
const INSPECT = /\b(?:100\s?%\s+(?:INSPECT\w*|CHECK\w*|TEST\w*|PR[ÜU]F\w*)|CMM\b|PPAP\b|FIRST\s+ARTICLE\w*|INITIAL\s+SAMPLE\w*|ERSTMUSTER\w*|SPC\b|C[Pp][Kk]\s?[≥>=]+\s?\d[.,]\d+|AQL\s?\d|ISO\s?2859(?:-\d)?|GAUGE\s+R\s?&\s?R|MEASUREMENT\s+REPORT|PR[ÜU]FPLAN\w*|INSPECTION\s+PLAN\w*|CONTROL\s+PLAN\w*)/i;
const EDGES = /\b(?:DEBURR\w*|BREAK\s+(?:ALL\s+)?(?:SHARP\s+)?EDGES?|REMOVE\s+(?:ALL\s+)?BURRS?|BURR\s?-?\s?FREE|SHARP\s+EDGES\s+(?:BROKEN|REMOVED)|ENTGRAT\w*|GRATFREI\w*|KANTEN\s+(?:GEBROCHEN|BRECHEN)|SCHARFE\s+KANTEN\w*|(?:DIN\s?)?(?:EN\s?)?ISO\s?13715|EDGES?\s+(?:TO\s+BE\s+)?(?:BROKEN|ROUNDED|CHAMFERED))\b/i;

export function extractQuality(ctx: ExtractContext): DraftParameter[] {
  const units = buildUnits(ctx);
  const out: DraftParameter[] = [];
  const seen = new Set<string>();
  const once = (name: string, text: string, u: TextUnit): boolean => {
    const k = `${name}|${u.sheet}|${text}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  };
  let leak = false, clean = false, impreg = false, marking = false, safety = false;
  const tokens: TextUnit[] = [];
  for (const u of units) {
    if (u.context.startsWith('title:')) continue;
    if (u.context === 'free' && SAFETY_TOKEN.test(u.text) && u.region !== 'title-block' && u.region !== 'revision-table') { tokens.push(u); continue; }
    if (u.context === 'free' && u.region === 'view' && u.text.length < 8) continue;
    for (const clause of clauses(u.text)) {
      if (LEAK.test(clause) && once('leak', clause, u)) {
        const p = /(\d+(?:[.,]\d+)?)\s?(bar|mbar|kPa|MPa|psi|Pa)\b/i.exec(clause);
        const medium = /\b(AIR|LUFT|HELIUM|WATER|WASSER|OIL|[ÖO]L|NITROGEN|STICKSTOFF|N2)\b/i.exec(clause);
        const rate = /(?:≤|<|MAX\.?)?\s?\d+(?:[.,]\d+)?\s?(?:cm³|cm3|ccm|ml|mbar\s?[·*x.]?\s?l)\s?\/\s?(?:min|s)\b/i.exec(clause);
        if (!leak) {
          leak = true;
          out.push(draft('quality.pressureTight', true, u, { raw: clause, at: clause.slice(0, 24), kind: 'interpreted', note: 'A leak or pressure test is written on the drawing.' }));
          out.push(draft('quality.leakTestSpec', clause, u, {
            raw: clause, at: clause.slice(0, 24),
            note: [p ? `Pressure ${p[1]} ${p[2]}.` : '', medium ? `Medium ${medium[1].toLowerCase()}.` : '', rate ? `Rate ${rate[0].trim()}.` : ''].filter(Boolean).join(' ') || undefined,
          }));
        }
      }
      if (IMPREG.test(clause) && !impreg && once('impreg', clause, u)) { impreg = true; out.push(draft('quality.impregnation', clause, u, { raw: clause, at: clause.slice(0, 24) })); }
      const methods = NDT.filter(n => n.re.test(clause)).map(n => n.method);
      if (methods.length && once('ndt', clause, u)) out.push(draft('quality.ndt', clause, u, { raw: clause, at: clause.slice(0, 24), note: `Method: ${methods.join(', ')}.` }));
      if (CLEAN.test(clause) && !clean && once('clean', clause, u)) { clean = true; out.push(draft('quality.cleanliness', clause, u, { raw: clause, at: clause.slice(0, 24) })); }
      if (SAFETY_WORDS.test(clause) && !safety && once('safety', clause, u)) {
        safety = true;
        out.push(draft('quality.safetyCritical', true, u, { raw: clause, at: clause.slice(0, 24), kind: 'interpreted', note: 'A safety / critical-characteristic statement is written on the drawing.' }));
      }
      if (MARKING.test(clause) && !marking && once('mark', clause, u)) { marking = true; out.push(draft('quality.marking', clause, u, { raw: clause, at: clause.slice(0, 24) })); }
      if (INSPECT.test(clause) && once('insp', clause, u)) out.push(draft('quality.inspection', clause, u, { raw: clause, at: clause.slice(0, 24) }));
      if (EDGES.test(clause) && once('edge', clause, u)) out.push(draft('finish.edges', clause, u, { raw: clause, at: clause.slice(0, 24) }));
    }
  }
  if (!safety && tokens.length) {
    const kinds = [...new Set(tokens.map(t => t.text))];
    out.push(draft('quality.safetyCritical', true, tokens[0], {
      raw: kinds.join(' '), kind: 'interpreted', status: 'needs-validation',
      note: `Characteristic marking ${kinds.join(', ')} found ${tokens.length} time${tokens.length === 1 ? '' : 's'} beside the views. What the marking means is the drawing owner's convention: confirm.`,
    }));
  }
  return out;
}
