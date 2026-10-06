/**
 * Family → Standard → Grade for a commodity's material picker (casting and forging, Oct 2026).
 * A taxonomy is data only — no prices: where each library grade belongs, the grade a family opens
 * on, and (optionally) a route check. The grade text is the library's own (`material.grade`).
 * A grade the table does not know (a company rate book's own) is filed by its category under
 * "Other / company grades", never dropped.
 */

export const OTHER_STANDARD = 'Other / company grades';

export interface GradeInfo { family: string; standard: string; known: boolean; order: number; use?: string }

export interface MaterialTaxonomy {
  families: Array<{ id: string; label: string; processes: string }>;
  /** Standards per family, in display order (common first). */
  standards: Record<string, string[]>;
  info(m: { id: string; category: string }): GradeInfo;
  /** The grade a family opens on when the engineer picks the family. */
  defaultGrade(family: string, subtype?: string): string;
  /** The middle step's name: 'Standard' for metals (EN 1563…), 'Polymer' for resins (PA66, PP…). */
  levelLabel?: string;
  /** The info line under the grade; without it the line shows family · standard · density · usual routes. */
  describe?(id: string, densityKgPerM3: number): string | null;
  /** A warning when the family cannot be made on the chosen route, else null. */
  routeWarning?(family: string, subtype?: string): string | null;
}

/** Builds `info` from a [id, family, standard] table and a category → family fallback. */
export function gradeInfoFrom(
  grades: Array<[string, string, string]>, familyOfCategory: (category: string) => string,
  use?: (category: string) => string | undefined,
): MaterialTaxonomy['info'] {
  const byId = new Map(grades.map(([id, family, standard], i) => [id, { family, standard, order: i }]));
  return m => {
    const k = byId.get(m.id);
    const u = use?.(m.category);
    if (k) return { ...k, known: true, use: u };
    return { family: familyOfCategory(m.category), standard: OTHER_STANDARD, known: false, order: 1e6, use: u };
  };
}

export interface GradeGroup<M> { family: string; standard: string; grades: M[] }

/** The grades grouped family → standard, in display order (families and standards with no grade are left out). */
export function groupGrades<M extends { id: string; category: string }>(tax: MaterialTaxonomy, materials: M[]): GradeGroup<M>[] {
  const out: GradeGroup<M>[] = [];
  for (const fam of tax.families) {
    const inFam = materials.filter(m => tax.info(m).family === fam.id);
    for (const std of [...(tax.standards[fam.id] ?? []), OTHER_STANDARD]) {
      const grades = inFam.filter(m => tax.info(m).standard === std).sort((a, b) => tax.info(a).order - tax.info(b).order);
      if (grades.length) out.push({ family: fam.id, standard: std, grades });
    }
  }
  return out;
}

export const familyLabelOf = (tax: MaterialTaxonomy, f: string): string => tax.families.find(x => x.id === f)?.label ?? f;
