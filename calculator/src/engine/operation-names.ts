/**
 * Operation names for people (CAD2C five-part report audit, Oct 2026).
 *
 * The rules name a measured operation with its whole feature list — "CNC Machining — 20 features (1×Ø10.0×12,
 * 1×Ø11.0×21, … 1× face 956mm²) [geometry-measured]" — because the prompt, the fixtures and the feature audit (§4C)
 * read that list. Printed as a name it ran to four lines in every table, the sensitivity, the levers and the inputs to
 * confirm of the knuckle's report. The engine keeps the full name; every screen and report prints this one.
 */

/** "CNC Machining — 20 features (…) [geometry-measured]" → "CNC Machining — 20 features". */
export function shortOperationName(name: string): string {
  if (!name) return name;
  return name
    .replace(/\s*\[geometry-measured\]/g, '')
    .replace(/^((?:CNC Machining|Drilling|Finish boring|Drilling \(clearance\)|Turning)\s+—\s+\d+\s+(?:features?|holes?|cored bores?|bores?)(?:\(s\))?)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/, '$1')
    .trim();
}

/** The feature list the full name carries, or null — printed once, where the features are audited. */
export function operationFeatureList(name: string): string | null {
  const m = name.match(/—\s+\d+\s+(?:features?|holes?|cored bores?|bores?)(?:\(s\))?\s*\(([^[]*)\)\s*(?:\[geometry-measured\])?$/);
  return m ? m[1].trim() : null;
}
