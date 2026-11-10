/**
 * Vocabulary alignment — a source's own words for a value the cost engine's questions take (Layer 3).
 *
 * Three dictionary names hold, in this layer, a value in the ENGINE's vocabulary, because an existing question takes
 * exactly that value: `material.family` (the engine's nine families), `tolerance.generalClass` (loose / standard /
 * tight) and `finish.coatingRoute` (a finish route). A source may fill the same name in its OWN words: the drawing
 * reader writes the family as "ductile iron", the general class as the ISO 2768 letter "m", the coating as "e-coat".
 * That is a correct reading in another vocabulary — like a length in inches.
 *
 * So, as a unit is converted, such a value is re-stated in the engine's vocabulary THROUGH THE SAME TABLES the
 * interpretation uses (interpret-tables.ts), from the text the source read. The source's word is kept in the note and
 * `rawText` is untouched. Where the tables do not carry the word (a hard anodise, a wet paint, an elastomer), or where
 * another reading of the same drawing already settles the question differently (a casting grade beside an ISO 2768
 * class), the value is LEFT as the source wrote it and marked: it is then neither compared with engine-vocabulary
 * values nor passed to the costing.
 *
 * No cost formula.
 */
import { familyFromFilename, type MaterialFamily } from '../material-family.js';
import { SURFACE_FINISH_ROUTES } from '../surface-finish-routes.js';
import { toleranceClassDecision } from '../cost-input-rules/derive/service-context.js';
import type { EngineeringParameter, ParameterStatus } from './model.js';
import { coatingRouteOf, toleranceClassOf } from './interpret.js';
import type { Certainty } from './interpret-tables.js';

/** The engine's material families, typed against its union so a family added there fails the build here. */
const ENGINE_FAMILIES = {
  plastic: true, aluminium: true, magnesium: true, titanium: true, 'cast iron': true, steel: true, 'copper alloy': true, zinc: true, 'nickel alloy': true,
} as const satisfies Record<MaterialFamily, true>;

/**
 * A family WORD (not a designation) → the engine's family. Used only for a word the engine's own reader
 * (`familyFromFilename`) does not know: "grey iron", "thermoplastic", "copper". Elastomers and composites have no
 * engine family — their routes ask the compound or the laminate, not a family.
 */
const FAMILY_WORDS: ReadonlyArray<[RegExp, MaterialFamily]> = [
  [/iron/i, 'cast iron'], [/steel/i, 'steel'], [/alumin/i, 'aluminium'], [/magnes/i, 'magnesium'], [/titan/i, 'titanium'],
  [/copper|brass|bronze/i, 'copper alloy'], [/zinc|zamak/i, 'zinc'], [/nickel|superalloy/i, 'nickel alloy'],
  [/thermoplastic|plastic|polymer/i, 'plastic'],
];

/** The names this layer holds in the engine's vocabulary. */
export const ENGINE_VOCABULARY_NAMES: ReadonlySet<string> = new Set(['material.family', 'tolerance.generalClass', 'finish.coatingRoute']);

/** Is the value already one the engine's question takes? */
export function inEngineVocabulary(name: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  if (name === 'material.family') return v in ENGINE_FAMILIES;
  if (name === 'tolerance.generalClass') return toleranceClassDecision().options.some(o => String(o.value) === v);
  if (name === 'finish.coatingRoute') return v === 'none' || (v !== '' && SURFACE_FINISH_ROUTES[v] !== undefined);
  return true;
}

type Restated = { value: string; basis: string; certainty: Certainty } | { why: string };

function restate(p: EngineeringParameter): Restated {
  const word = String(p.value).trim();
  const raw = (p.rawText ?? '').trim();
  if (p.name === 'material.family') {
    const fam = familyFromFilename(word) ?? FAMILY_WORDS.find(([re]) => re.test(word))?.[1] ?? (raw ? familyFromFilename(raw) : null);
    return fam ? { value: fam, basis: `"${word}" is the engine's "${fam}" family`, certainty: 'by-name' }
      : { why: `"${word}" is not one of the engine's material families (${Object.keys(ENGINE_FAMILIES).join(', ')})` };
  }
  if (p.name === 'tolerance.generalClass') {
    const r = (raw ? toleranceClassOf(raw) : null) ?? (/^(f|m|c|v)$/i.test(word) ? toleranceClassOf(`ISO 2768-${word.toLowerCase()}`) : null);
    if (r && 'value' in r) return { value: r.value, basis: `${r.written} → ${r.value}. ${r.basis}`, certainty: r.certainty };
    return { why: r && 'unmapped' in r ? r.unmapped : `"${word}" is a class of its standard, and no row of the tolerance mapping table reads it into loose / standard / tight` };
  }
  // finish.coatingRoute: the clause it was read from, else the reader's own route words
  const fromText = raw ? coatingRouteOf(raw) : null;
  if (fromText && 'route' in fromText) return { value: fromText.route, basis: fromText.basis, certainty: fromText.certainty };
  const words = word.split(/\s*\+\s*/).map(w => coatingRouteOf(w.replace(/-/g, ' ')));
  const routes = [...new Set(words.flatMap(w => (w && 'route' in w ? [w.route] : [])))];
  if (routes.length === 1) {
    const hit = words.find(w => w && 'route' in w) as { route: string; basis: string; certainty: Certainty };
    return { value: hit.route, basis: hit.basis, certainty: hit.certainty };
  }
  if (routes.length > 1) return { why: `"${word}" names more than one finish and the finish question takes ONE route` };
  const not = (fromText && 'unmapped' in fromText ? fromText.unmapped : undefined) ?? words.flatMap(w => (w && 'unmapped' in w ? [w.unmapped] : []))[0];
  return { why: not ?? `"${word}" is not a finish the finish question offers` };
}

/**
 * Re-state, in place, every non-derived parameter whose name is held in the engine's vocabulary and whose value is not
 * in it. `settledElsewhere(p, value)` says whether an interpretation of the SAME source already gives this name a
 * different value (then the source's word is left as written). Returns the ids left in the source's own vocabulary.
 */
export function alignVocabulary(params: EngineeringParameter[], settledElsewhere: (p: EngineeringParameter, value: string) => string | null): Set<string> {
  const foreign = new Set<string>();
  const frozen: ReadonlySet<ParameterStatus> = new Set(['confirmed', 'corrected', 'rejected', 'missing']);
  for (const p of params) {
    if (p.source === 'derived' || !ENGINE_VOCABULARY_NAMES.has(p.name) || inEngineVocabulary(p.name, p.value)) continue;
    const said = typeof p.value === 'string' ? p.value : JSON.stringify(p.value);
    const leave = (why: string) => {
      foreign.add(p.id);
      p.note = [p.note, `kept as written ("${said}"), not in the costing's vocabulary: ${why}. It is neither compared nor passed to the costing`].filter(Boolean).join('; ');
    };
    if (typeof p.value !== 'string' || frozen.has(p.status)) { if (!frozen.has(p.status)) leave('not a text value'); else foreign.add(p.id); continue; }
    const r = restate(p);
    if ('why' in r) { leave(r.why); continue; }
    const other = settledElsewhere(p, r.value);
    if (other) { leave(`it would read as "${r.value}", but ${other}`); continue; }
    p.value = r.value;
    p.kind = 'interpreted';
    if (r.certainty === 'judgement' && p.status === 'extracted') p.status = 'needs-validation';
    p.note = [p.note, `the source wrote "${said}"; held in the costing's vocabulary as "${r.value}" — ${r.basis}`].filter(Boolean).join('; ');
  }
  return foreign;
}
