import type { UniversalStackInput } from '../engine/types.js';

/** An answer, OPEN, or what the costing used for an unanswered advisory (casting 360 X29: "engine default" hid the grade). */
export function decisionAnswerText(d: { severity: 'blocking' | 'advisory'; answer: string | null; used?: string | null }): string {
  if (d.answer) return d.answer;
  if (d.severity === 'blocking') return 'OPEN';
  return d.used ? `not answered \u2014 costed as ${d.used}` : 'not answered \u2014 the rules\u2019 value (see the basis)';
}

/**
 * An answer as a person reads it (CAD2C five-part report audit, Oct 2026): a route id becomes its name, a material id
 * its grade, yes / no and the tolerance classes are capitalised. Anything else is printed as given.
 */
export function decisionAnswerLabel(id: string, value: string | null, o: { routeLabels: Record<string, string>; grades: Array<{ id: string; grade: string }> }): string | null {
  if (!value) return value;
  if (/^commodity\./.test(id) || id === 'commodity') return o.routeLabels[value] ?? value.replace(/_/g, ' ');
  const m = o.grades.find(g => g.id === value);
  if (m) return m.grade;
  if (/^(yes|no|standard|tight|loose|steel|aluminium|plastic|magnesium|titanium|zinc|copper alloy|nickel alloy|cast iron)$/.test(value)) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
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
