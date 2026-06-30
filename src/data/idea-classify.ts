// ─────────────────────────────────────────────────────────────────────────────
// Idea classifier — derive powertrain (ICE/MHEV/PHEV/BEV) and voltage (400V/800V)
// from an idea's text, so the Marketplace can facet 1,200+ ideas without needing a
// structured field on every legacy record. New idea packs encode these explicitly
// (e.g. "[BEV]", "Powertrain: …", "800-V"); legacy ideas are matched by keyword.
// ─────────────────────────────────────────────────────────────────────────────

export type Powertrain = 'ICE' | 'MHEV' | 'PHEV' | 'BEV';
export type Voltage = '400V' | '800V';

export const POWERTRAINS: Powertrain[] = ['ICE', 'MHEV', 'PHEV', 'BEV'];
export const VOLTAGES: Voltage[] = ['400V', '800V'];

export interface IdeaClassification {
  powertrains: Powertrain[];
  voltages: Voltage[];
}

/**
 * Classify a piece of idea text. Returns the powertrains and voltages it
 * explicitly references (empty arrays when none are mentioned).
 */
export function classifyIdeaText(haystack: string): IdeaClassification {
  const h = (haystack || '').toUpperCase();
  const pts = new Set<Powertrain>();

  if (/\bMHEV\b|MILD[\s-]?HYBRID|\b48\s?V\b/.test(h)) pts.add('MHEV');
  if (/\bPHEV\b|PLUG[\s-]?IN\s?HYBRID|PLUG[\s-]?IN\b/.test(h)) pts.add('PHEV');
  if (/\bBEV\b|BATTERY[\s-]?ELECTRIC|\bSKATEBOARD\b|CELL[\s-]?TO[\s-]?(PACK|BODY)|800[\s-]?V|\bE[\s-]?AXLE\b|STEER[\s-]?BY[\s-]?WIRE|BRAKE[\s-]?BY[\s-]?WIRE/.test(h)) pts.add('BEV');
  if (/\bICE\b|INTERNAL\s?COMBUSTION|\bCOMBUSTION\b|\bEXHAUST\b/.test(h)) pts.add('ICE');

  const vs = new Set<Voltage>();
  if (/800[\s-]?V\b|800[\s-]?VOLT/.test(h)) vs.add('800V');
  if (/400[\s-]?V\b|400[\s-]?VOLT/.test(h)) vs.add('400V');

  return { powertrains: [...pts], voltages: [...vs] };
}

/**
 * Build the haystack from a marketplace idea (flat fields + optional parsed
 * ideaData) and classify it.
 */
export function classifyIdea(idea: {
  title?: string;
  description?: string;
  ideaData?: string | null;
}): IdeaClassification {
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
