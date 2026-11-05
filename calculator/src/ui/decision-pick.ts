/**
 * What counts as the engineer ANSWERING a CAD question (Part1 review, Nov 2026).
 *
 * The questions panel records an advisory answer only when the engineer touches it — a pre-ticked default must not pin a
 * grade the rules later move away from (uploaded-parts review, Oct 2026). But the touch was read off `change` / `input`
 * events, and clicking the option that is already ticked fires neither: an engineer who picked "LM25 / A356 (costed
 * until you choose)" was recorded as not answering, and every report printed "not answered — costed as LM25".
 */

/** A click that picks an option: on a radio of a question block (a label click is delivered to its radio too). */
export function isDecisionPickClick(target: EventTarget | null): boolean {
  const t = target as { matches?: (sel: string) => boolean; closest?: (sel: string) => unknown } | null;
  return !!t && typeof t.matches === 'function' && t.matches('input[type=radio]') && !!t.closest?.('.cad-decision');
}

/**
 * A grade pinned on the CAD panel IS the answer to the grade question (the request sends it as the material, and the
 * rules take it as `material.grade` — answersFromContext): the reports print it answered, never "not answered".
 */
export function pinnedGradeAnswer(id: string, pinnedMaterialId: string, materials: ReadonlyArray<{ id: string; grade: string }>): string | null {
  if (id !== 'material.grade' || !pinnedMaterialId) return null;
  const m = materials.find(x => x.id === pinnedMaterialId);
  return m ? `${m.grade} (pinned on the CAD panel)` : null;
}
