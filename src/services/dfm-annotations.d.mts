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

export function chooseSecondView(
  missing: string[],
  byView: Record<string, string[]>,
): { view: string; reveals: string[] } | null;

/** The one marked finding whose evidence is under the surface, or null. */
export function sectionCandidate(
  annotations: FindingAnnotation[],
): FindingAnnotation | null;
