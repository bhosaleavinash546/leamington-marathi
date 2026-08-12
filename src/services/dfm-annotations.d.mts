export const ANNOTATION_CAP: number;

export interface FindingAnnotation {
  id: string;
  ruleId: string;
  anchorXYZ: [number, number, number];
  faceIds: number[];
  label: string;
  value: string;
  severity: 'high' | 'medium' | 'low';
  /** The rule's measure, so a caller need not re-derive it from the title. */
  measure: string;
  /** Which instance this marker sits on — "worst of 34", "the pocket". */
  note: string;
}

export interface UnlocatedFinding {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
}

export function selectFindingAnnotations(
  analysis: unknown,
  opts?: { max?: number },
): {
  annotations: FindingAnnotation[];
  notLocated: UnlocatedFinding[];
  droppedByCap: number;
  totalFailing: number;
};

/**
 * One finding's place on the model, resolved on demand and WITHOUT the figure
 * cap. Either it is located, or it carries the reason it is not — there is no
 * third shape, so a caller cannot accidentally render an empty highlight as a
 * successful one.
 */
export type FindingLocation =
  | {
      located: true;
      xyz: [number, number, number];
      faceIds: number[];
      /**
       * The TRUE number of faces when `faceIds` is a truncation of a larger set
       * (the kernel caps some id lists at 40). Null when nothing was dropped —
       * so a caller can say "40 of 67" exactly when that is the case, and never
       * imply a count it does not have.
       */
      faceTotal: number | null;
      note: string;
    }
  | { located: false; reason: string };

export function locateFinding(analysis: unknown, finding: unknown): FindingLocation;

/** Why a finding has no place on the model, in the reader's words. */
export function unlocatableReason(finding: unknown): string;

export function chooseSecondView(
  missing: string[],
  byView: Record<string, string[]>,
): { view: string; reveals: string[] } | null;

/** The one marked finding whose evidence is under the surface, or null. */
export function sectionCandidate(
  annotations: FindingAnnotation[],
): FindingAnnotation | null;
