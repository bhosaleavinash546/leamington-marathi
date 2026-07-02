// ─────────────────────────────────────────────────────────────────────────────
// Idea classifier — derive powertrain (ICE/MHEV/PHEV/BEV) and voltage (400V/800V)
// from an idea's text, so the Marketplace can facet 1,200+ ideas without needing a
// structured field on every legacy record. New idea packs encode these explicitly
// (e.g. "[BEV]", "Powertrain: …", "800-V"); legacy ideas are matched by keyword.
// Pure & dependency-free so it can be unit-tested in isolation.
// ─────────────────────────────────────────────────────────────────────────────

export const POWERTRAINS = ['ICE', 'MHEV', 'PHEV', 'BEV'];
export const VOLTAGES = ['400V', '800V'];

/**
 * Classify a piece of idea text. Returns the powertrains and voltages it
 * explicitly references (empty arrays when none are mentioned).
 */
export function classifyIdeaText(haystack) {
  const h = (haystack || '').toUpperCase();
  const pts = new Set();

  // Voltage tokens use a left digit-boundary (?<![\d.]) so "1400V"/"4800V"/"800VA"
  // don't false-match 400V/800V.
  const has800 = /(?<![\d.])800[\s-]?V\b|(?<![\d.])800[\s-]?VOLT/.test(h);
  const has400 = /(?<![\d.])400[\s-]?V\b|(?<![\d.])400[\s-]?VOLT/.test(h);

  if (/\bMHEV\b|MILD[\s-]?HYBRID|\b48\s?V\b/.test(h)) pts.add('MHEV');
  if (/\bPHEV\b|PLUG[\s-]?IN\s?HYBRID|PLUG[\s-]?IN\b/.test(h)) pts.add('PHEV');
  if (has800 || /\bBEV\b|BATTERY[\s-]?ELECTRIC|\bSKATEBOARD\b|CELL[\s-]?TO[\s-]?(PACK|BODY)|\bE[\s-]?AXLE\b|STEER[\s-]?BY[\s-]?WIRE|BRAKE[\s-]?BY[\s-]?WIRE/.test(h)) pts.add('BEV');
  if (/\bICE\b|INTERNAL\s?COMBUSTION|\bCOMBUSTION\b|\bEXHAUST\b/.test(h)) pts.add('ICE');

  const vs = new Set();
  if (has800) vs.add('800V');
  if (has400) vs.add('400V');

  return { powertrains: [...pts], voltages: [...vs] };
}

/**
 * Build the haystack from a marketplace idea (flat fields + optional parsed
 * ideaData) and classify it.
 */
export function classifyIdea(idea) {
  let extra = '';
  if (idea.ideaData) {
    try {
      const d = JSON.parse(idea.ideaData);
      extra = [d.technicalDescription, d.materialGrade, d.manufacturingImpact, d.benchmarkReference, d.riskNotes]
        .filter(Boolean)
        .join(' ');
    } catch { /* ignore malformed ideaData */ }
  }
  return classifyIdeaText(`${idea.title || ''} ${idea.description || ''} ${extra}`);
}
