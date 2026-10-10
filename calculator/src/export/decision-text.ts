import type { UniversalStackInput } from '../engine/types.js';

/** An answer, OPEN, or what the costing used for an unanswered advisory (casting 360 X29: "engine default" hid the grade). */
export function decisionAnswerText(d: { severity: 'blocking' | 'advisory'; answer: string | null; used?: string | null }): string {
  if (d.answer) return d.answer;
  if (d.severity === 'blocking') return 'OPEN';
  return d.used ? `not answered - costed as ${d.used}` : 'not answered - the rules\u2019 value (see the basis)';
}

/** Why the tooling is spread over this many parts — the knuckle's 100,000 was one year because no programme life was entered. */
export function toolingAmortisationBasis(input: UniversalStackInput): string {
  const vol = input.tooling.amortizationVolume;
  const ann = input.annualVolume ?? 0;
  const yrs = input.programmeYears ?? 0;
  if (yrs > 0 && ann > 0 && Math.abs(vol - ann * yrs) <= 0.5) return `the programme: ${yrs} years × ${ann.toLocaleString('en-GB')} a year`;
  if (ann > 0 && Math.abs(vol - ann) <= 0.5) return 'ONE year\u2019s volume: no programme life was entered. Enter it to spread the tooling over the programme '
    + '(tooling per part falls in proportion).';
  return 'the amortisation volume typed on the form';
}
