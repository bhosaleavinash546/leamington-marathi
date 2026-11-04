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

/**
 * The operations of a machining plan that are not the cutting of its features: the amortised set-up / change-over, the
 * handling (load / clamp / unload, the pallet change, the load on the second pallet), the turning of a spindle on the
 * lathe (its own operation, its features not in the feature table's costed rows) and the bench deburr and gauge check.
 * Both naming schemes: the near-net plan's ("Machining Setup (amortised)", "Load / clamp / unload — 1 fixturing(s)",
 * "Pallet change — 1 fixturing(s)", "Turning — spindle on the CNC lathe …", "Deburr and gauge check (bench)") and the
 * feature table's ("Machining change-over, amortised (…)", "Pallet change (1 fixturing(s) × 7.1 s)", "Machining load /
 * unload …"). Everything else on a machining machine cuts features: "Finish machining — +X side", "Drilling — 10 holes
 * (…)", "Finish boring — 4 cored bore(s) (…)", "CNC Machining — 18 features (…)", "Mill / drill after turning".
 */
const NOT_FEATURE_CUT = /^(?:machining setup\b|machining change-over\b|machining load\b|load \/|pallet change\b|turning\b|deburr\b)/i;

/** True when the operation cuts the part's features (see NOT_FEATURE_CUT for what it is not). */
export function isFeatureCutOperation(name: string): boolean {
  return !!name && !NOT_FEATURE_CUT.test(name.trim());
}

/** The fixturings a machining plan charges, read off its handling operation's name ("Load / clamp / unload — 2
 *  fixturing(s)", "Pallet change — 1 fixturing(s)", the feature table's "Pallet change (1 fixturing(s) × 7.1 s)"); the
 *  lathe's own fixture ("— lathe fixture, 1 fixturing") is not one of the routing's. Null when no operation says. */
export function chargedFixturings(names: string[]): number | null {
  for (const n of names) {
    const m = /^(?:Load \/ clamp \/ unload|Pallet change)\s*(?:[—-]\s*|\()(\d+)\s+fixturing/i.exec(n.trim());
    if (m) return Number(m[1]);
  }
  return null;
}
