/**
 * Material-family inference — shared by the server (CAD prompt prior) and the
 * client (ambiguity flag). CAD geometry fixes the shape, not the material; these
 * helpers name the family implied by a filename or a density so a wrong material
 * class (e.g. an "Aluminium…" file costed as plastic) can be caught. Pure, no deps.
 */

/** Zinc (Zamak die castings) and nickel alloys (superalloy castings and forgings) were
 *  added in the casting & forging materials review (Oct 2026): their grades were in the
 *  library but no family reached them, so a CAD part could not be costed in either. */
export type MaterialFamily = 'plastic' | 'aluminium' | 'magnesium' | 'titanium' | 'cast iron' | 'steel' | 'copper alloy'
  | 'zinc' | 'nickel alloy';

/** The family named in a CAD filename, or null. Separators ('_' '-' '.') are
 *  normalised to spaces first — '_' is a regex word char, so "steel_axle" would
 *  otherwise defeat a \bsteel\b anchor. */
export function familyFromFilename(filename: string): MaterialFamily | null {
  const n = (filename || '').toLowerCase().replace(/[_\-.]+/g, ' ');
  if (!n.trim()) return null;
  if (/nylon|\bpa6|pa66|\babs|polycarb|\bpc\b|polyprop|\bpp\b|\bpeek|\bpom|acetal|delrin|plastic|resin|glass ?filled/.test(n)) return 'plastic';
  // Wrought (6061, 6082, 5083, 5754, 7075), cast (LM25/LM6, A356/A357/A380, ADC12, AlSi…, EN AC-4xxxx) and trade names.
  if (/alumini|\balu\b|\bal ?si ?\d|6061|7075|6082|\b5083|\b5754|\blm ?(25|6|24)\b|adc ?12|\ba3[5-8]\d|\ben ?ac ?4\d{4}|silafont|aural|castasil/.test(n)) return 'aluminium';
  if (/magnesium|az91|am60/.test(n)) return 'magnesium';
  if (/zamak|\bzinc|\bza ?(8|12|27)\b|zl0?4\d\d/.test(n)) return 'zinc';
  if (/inconel|\bin ?7(13|18)\b|waspaloy|hastelloy|monel|nimonic|superalloy|nickel alloy/.test(n)) return 'nickel alloy';
  if (/titanium|ti ?6al|grade ?5/.test(n)) return 'titanium';
  if (/cast ?iron|ductile|\bgjl|\bgjs|sg ?iron|nodular/.test(n)) return 'cast iron';
  if (/\bsteel|\b1045|\b4140|\bc45|s45c|\ben8|42crmo|scm440|16mncr|20mncr|stainless|\b316|\b304|17 ?4ph|\bhss\b|\bhsla|\bdp[0-9]{3}|\bdc0[1-9]/.test(n)) return 'steel';
  if (/brass|bronze|copper|cuzn|phosphor/.test(n)) return 'copper alloy';
  return null;
}

/** Coarse material family from a density (kg/m³), or 'other' when unknown. */
export function familyFromDensity(dens?: number): MaterialFamily | 'other' {
  if (!dens) return 'other';
  if (dens < 2000) return 'plastic';
  if (dens < 2100) return 'magnesium';
  if (dens < 3400) return 'aluminium';
  if (dens < 5200) return 'titanium';
  if (dens < 7400) return 'cast iron';
  if (dens < 8200) return 'steel';
  return 'copper alloy';
}

/** "a plastic" / "a copper alloy" / else the family word — for prose sentences. */
export function proseFamily(fam: MaterialFamily): string {
  return fam === 'plastic' ? 'a plastic' : fam === 'copper alloy' ? 'a copper alloy' : fam === 'nickel alloy' ? 'a nickel alloy' : fam;
}

/**
 * Resolve whatever arrived in `costInputSuggestions.materialId` to an id the
 * form can actually select, or null if it cannot be resolved at all.
 *
 * The live audit (cad-audit/FINDINGS.md F1/F8) found three shapes arriving:
 *   - a real library id            → returned unchanged
 *   - a family token ('steel')     → what the metal rules emit (apply.ts maps
 *     `machining.materialId` from a FAMILY decision)
 *   - an invented id ('mat-hss')   → the model's habit, which the prompt itself
 *     used to teach
 * The old path passed all three to setMaterial(), which silently kept the DOM
 * default when the id matched no option — so a steel flange was costed as the
 * form's default aluminium at the steel weight, and a ductile-iron casting as
 * LM25. The headless mapper has resolved these since the A/B
 * (to-cost-params.ts::resolveMaterialId); this is the browser's equivalent.
 */
export function resolveFormMaterialId(
  materialId: string,
  commodity: string,
  knownIds: ReadonlySet<string>,
): string | null {
  if (!materialId) return null;
  if (knownIds.has(materialId)) return materialId;

  // A family token, or an invented id that still names its family.
  const fam = (['plastic', 'aluminium', 'magnesium', 'titanium', 'cast iron', 'steel', 'copper alloy', 'zinc', 'nickel alloy']
    .includes(materialId) ? materialId : familyFromFilename(materialId)) as MaterialFamily | null;
  if (!fam) return null;

  const cast = /cast|forg/.test(commodity);
  const rep: Record<MaterialFamily, string> = cast
    ? { aluminium: 'mat-lm25', magnesium: 'mat-mag-am60', titanium: '', 'cast iron': 'mat-gjs500', steel: 'mat-steel1045', 'copper alloy': '', plastic: '', zinc: 'mat-zamak3', 'nickel alloy': 'mat-inconel718-cast' }
    : { aluminium: 'mat-al6061', magnesium: 'mat-mag-am60', titanium: 'mat-ti6al4v', 'cast iron': 'mat-gjs500', steel: 'mat-steel1045', 'copper alloy': 'mat-brass-cz121', plastic: 'mat-pa6', zinc: '', 'nickel alloy': '' };
  const id = rep[fam] || '';
  return id && knownIds.has(id) ? id : null;
}

export interface MaterialSuggestion { materialId: string; name: string; confidencePct: number; reasoning?: string; [k: string]: unknown; }

/**
 * Guard against a confidence inversion: the model returned "PA6-GF 55%" as the
 * primary material with "Aluminium 6061 65%" merely as an alternative — a
 * higher-confidence suggestion must never rank below the primary. Returns the
 * (possibly swapped) primary + alternatives and whether a promotion happened.
 */
export function promoteHighestConfidence(
  primary: MaterialSuggestion,
  alternatives: MaterialSuggestion[],
): { primary: MaterialSuggestion; alternatives: MaterialSuggestion[]; promoted: boolean } {
  let bestIdx = -1;
  let bestConf = primary.confidencePct ?? 0;
  alternatives.forEach((a, i) => { const c = a.confidencePct ?? 0; if (c > bestConf) { bestConf = c; bestIdx = i; } });
  if (bestIdx < 0) return { primary, alternatives, promoted: false };
  const promotedSug = alternatives[bestIdx];
  const newAlts = alternatives.slice();
  newAlts[bestIdx] = primary;
  return {
    primary: {
      ...promotedSug,
      reasoning: promotedSug.reasoning || `Promoted over "${primary.name}" (${primary.confidencePct ?? 0}%) — a higher-confidence alternative should not rank below the primary.`,
    },
    alternatives: newAlts,
    promoted: true,
  };
}
