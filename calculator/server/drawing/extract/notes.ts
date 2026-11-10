/**
 * Notes: every note of every notes block, kept verbatim, so nothing the drawing says is lost. A note that states a
 * manufacturing requirement (process, treatment, test, tolerance, finish) is `note.manufacturing`, the rest
 * `note.general`.
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, draft } from './common.js';

const MANUFACTURING = /\b(?:CAST\w*|FORG\w*|MACHIN\w*|MOULD\w*|MOLD\w*|WELD\w*|HEAT\s?-?\s?TREAT\w*|HARDEN\w*|TEMPER\w*|ANNEAL\w*|NITRID\w*|CARBURI\w*|COAT\w*|PLAT\w*|PAINT\w*|ANODI\w*|PASSIVAT\w*|PHOSPHAT\w*|GALVANI\w*|DEBURR\w*|BURRS?|EDGES?|RADI(?:US|I)|DRAFT\s+ANGLE|PARTING\s+LINE|GATE\w*|EJECTOR\w*|FLASH\w*|POROSITY|SHRINK\w*|TOLERANC\w*|ROUGHNESS|SURFACE\s+FINISH|R[az]\s?\d|LEAK\w*|PRESSURE\s+TEST\w*|IMPREGNAT\w*|X-?RAY|CRACK\w*|CLEANLINESS|INSPECT\w*|TEST(?:ED|ING)?|THREAD\w*|TAP(?:PED)?|DRILL\w*|REAM\w*|GRIND\w*|HONE\w*|POLISH\w*|SHOT\s?-?\s?(?:BLAST|PEEN)\w*|BLAST\w*|WASH\w*|MARK(?:ED|ING)?|STAMP\w*|BEND\w*|GRAIN\s+DIRECTION|FIBRE\w*|LAMINAT\w*|CURE\w*|VULCANI\w*|GEGOSSEN|GUSS\w*|GESCHMIEDET|SCHMIED\w*|BEARBEIT\w*|SCHWEI\w*|GEH[ÄA]RTET|H[ÄA]RT\w*|VERG[ÜU]T\w*|BESCHICHT\w*|LACKIER\w*|VERZINK\w*|ELOX\w*|ENTGRAT\w*|KANTEN|TOLERANZ\w*|RAUHEIT|DICHT\w*|PR[ÜU]F\w*|GEWINDE\w*|ENTFORMUNGSSCHR[ÄA]G\w*|TRENNEBENE|ANGUSS\w*|AUSWERFER\w*|GRAT\w*|POROSIT[ÄA]T|ISO\s?\d{3,5}|DIN\s?\d{3,5}|ASTM\s?[A-Z]\s?\d+)\b/i;

export function extractNotes(ctx: ExtractContext): DraftParameter[] {
  const out: DraftParameter[] = [];
  for (const u of buildUnits(ctx)) {
    if (u.context !== 'note') continue;
    const numbered = u.noteNo !== undefined && /^\d+$/.test(u.noteNo);
    out.push(draft(MANUFACTURING.test(u.text) ? 'note.manufacturing' : 'note.general', u.text, u, {
      raw: numbered ? `${u.noteNo}. ${u.text}` : u.text, bbox: u.bbox,
      ...(numbered ? { appliesTo: { description: `note ${u.noteNo}` } } : {}),
    }));
  }
  return out;
}
