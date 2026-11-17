/** Wording for the KPI record-edit rules (A-05). Pure: no database, no request. */

/** The record panel's own label for each field the A-05 reset rule watches. */
const FIELD_LABEL: Record<string, string> = {
  partNumber: 'the part number', programme: 'the programme', modelYear: 'the model year', powertrain: 'the powertrain',
  annualVolume: 'the annual volume', currentCost: 'the current cost', currentCcy: 'the current-cost currency',
  currentTerms: 'the delivery terms',
};

const list = (xs: string[]): string => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** The 400 sent when a change that returns a reviewed / approved costing to Completed also asks to keep it
 *  reviewed / approved (Stop 1 decision: the re-approval is a separate save). */
export function resetRefusal(fields: readonly string[], status: string): string {
  const what = list(fields.map(f => FIELD_LABEL[f] ?? f));
  const article = /^[aeiou]/i.test(status) ? 'an' : 'a';
  return `Changing ${what} returns ${article} ${status} costing to Completed. Set the status to Completed and save; an admin then approves it again as a separate save.`;
}
