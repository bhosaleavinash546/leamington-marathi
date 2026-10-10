/** An answer, OPEN, or what the costing used for an unanswered advisory (casting 360 X29: "engine default" hid the grade). */
export function decisionAnswerText(d: { severity: 'blocking' | 'advisory'; answer: string | null; used?: string | null }): string {
  if (d.answer) return d.answer;
  if (d.severity === 'blocking') return 'OPEN';
  return d.used ? `not answered - costed as ${d.used}` : 'not answered - the rules\u2019 value (see the basis)';
}
