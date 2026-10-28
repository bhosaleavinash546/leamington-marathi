/**
 * CAD to COST — the one path from an upload to a cost (CAD to COST 360 review, Oct 2026).
 *
 * Every button that ends in a cost — Calculate on the CAD screen, Analyze & Calculate, Apply, Apply & Calculate, Pin &
 * Recalculate, an alternative process — used to have its own idea of "ready". Analyze & Calculate filled a Machining form
 * (the server's fallback route) while the route question was still open; Apply & Calculate filled a form whose weight and
 * cycle times were still waiting on an answer; Calculate on the CAD screen threw into a hidden pane. None of them said
 * why nothing was costed.
 *
 * This module decides the next step from the state alone, so every caller takes the same path:
 *   no file → upload · no analysis → analyse · a blocking question without an answer → ask it ·
 *   answered questions the rules have not seen → re-analyse · nothing open → apply (and calculate).
 * Pure: main.ts owns the state and the DOM.
 */

export interface FlowDecision {
  id: string;
  severity: 'blocking' | 'advisory';
  question: string;
}

export type CostStep =
  | { kind: 'upload' }
  | { kind: 'analyse' }
  | { kind: 'answer'; missing: FlowDecision[] }
  | { kind: 'reanalyse' }
  | { kind: 'apply' };

export interface FlowState {
  hasFile: boolean;
  hasAnalysis: boolean;
  /** The questions the last analysis left open (the server's list — it drops a question once its answer is applied). */
  decisions: readonly FlowDecision[];
  /** The engineer's answers, as recorded from the panel. */
  answers: Readonly<Record<string, unknown>>;
  /**
   * The answers the last analysis was run with. An ADVISORY answer (finish, grade) changed since then is not in the
   * analysis yet: applying it would fill the form from the older run (CAD to COST phase 2 live run — zinc plate
   * answered last, Get cost pressed, the bracket costed bare at £1.25 against £1.77 coated).
   */
  appliedAnswers?: Readonly<Record<string, unknown>>;
}

/** Answers that differ from the ones the analysis was run with (blank and absent are the same). */
export function answersChangedSince(now: Readonly<Record<string, unknown>>, applied: Readonly<Record<string, unknown>>): string[] {
  const norm = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
  return [...new Set([...Object.keys(now), ...Object.keys(applied)])].filter(k => norm(now[k]) !== norm(applied[k]));
}

/** The blocking questions still open after the last analysis. */
export function blockingQuestions(decisions: readonly FlowDecision[]): FlowDecision[] {
  return decisions.filter(d => d.severity === 'blocking');
}

const answered = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== '';

/**
 * The next step towards a cost.
 *
 * A blocking question the server still lists has not been applied yet, even when the panel has an answer for it: the
 * rules must re-run with it (its answer can change the route, the grade and the questions that follow). Only when the
 * last analysis lists no blocking question is the analysis applied to a form.
 */
export function nextCostStep(s: FlowState): CostStep {
  if (!s.hasFile) return { kind: 'upload' };
  if (!s.hasAnalysis) return { kind: 'analyse' };
  const open = blockingQuestions(s.decisions);
  if (!open.length) {
    return s.appliedAnswers && answersChangedSince(s.answers, s.appliedAnswers).length ? { kind: 'reanalyse' } : { kind: 'apply' };
  }
  const missing = open.filter(d => !answered(s.answers[d.id]));
  return missing.length ? { kind: 'answer', missing } : { kind: 'reanalyse' };
}

/** One line for the screen: what stands between the engineer and the cost. */
export function costStepMessage(step: CostStep): string {
  switch (step.kind) {
    case 'upload': return 'Upload a STEP, IGES or STL file to cost it.';
    case 'analyse': return 'Measuring the part…';
    case 'answer': return step.missing.length === 1
      ? 'One question before the cost: the geometry cannot settle it.'
      : `${step.missing.length} questions before the cost: the geometry cannot settle them.`;
    case 'reanalyse': return 'Applying your answers…';
    case 'apply': return 'Costing…';
  }
}
