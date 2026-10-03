/**
 * Evidence for the process and material questions, short of a decision.
 *
 * The geometry alone narrows the process to two or three routes and says
 * nothing at all about the material (derive/commodity.ts, derive/material.ts).
 * Two further kinds of evidence were sitting in every upload unread:
 *
 *  1. **What the part is called.** The upload name, the STEP product name, the
 *     path recorded in the STEP header and its description. A designer who saves
 *     "Casting Bracket" in a folder called "CASTING-01", or names the model
 *     "STEERING_KNUCKLE_PATTERN" (a pattern is what a foundry moulds from), has
 *     told us the route. The material, likewise, is often in a name or declared
 *     as a property of the part.
 *
 *  2. **How the surface is built.** A part machined from billet is planes and
 *     cylinders: on the synthetic machined fixtures not one face is free-form or
 *     toroidal. A casting or a forging is blended — draft, fillets, sculpted
 *     transitions — and the real cast and forged parts in cad-audit measure
 *     21–42% of their faces as B-spline or toroidal. Neither number is a law; the
 *     gap between them is wide enough to lean on.
 *
 * Both feed a LEANING on the question, stated with its source, never a silent
 * answer: the same blended shape is cast at one volume and forged at another,
 * and a name can be stale. The engineer confirms with one click.
 */
import type { OCCTGeometry } from '../../ai-analysis.js';
import { familyFromFilename, type MaterialFamily } from '../../material-family.js';

export interface NameSource { text: string; where: string }

/** Every name the part goes by, with where it came from. */
export function partNames(filename: string, geo: Pick<OCCTGeometry, 'cadMetadata'>): NameSource[] {
  const meta = geo.cadMetadata;
  const out: NameSource[] = [];
  if (filename) out.push({ text: filename, where: 'the uploaded file name' });
  for (const p of meta?.productNames ?? []) out.push({ text: p, where: 'the STEP product name' });
  if (meta?.headerFileName) out.push({ text: meta.headerFileName, where: 'the file path recorded in the STEP header' });
  if (meta?.description) out.push({ text: meta.description, where: 'the STEP file description' });
  return out;
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/[_\-.\\/()[\],]+/g, ' ').replace(/\s+/g, ' ')} `;

/** Process words, most specific first. Each maps to a commodity the rules know. */
const PROCESS_WORDS: Array<{ re: RegExp; route: string; label: string }> = [
  { re: / (hpdc|die ?cast(ing|ings)?|pressure ?die ?cast(ing)?) /, route: 'casting', label: 'die casting' },
  { re: / (sand ?cast(ing)?|gravity ?cast(ing)?|investment ?cast(ing)?|lost ?wax|foundry) /, route: 'casting', label: 'casting' },
  { re: / (castings?|cast) /, route: 'casting', label: 'casting' },
  // A pattern is what a foundry moulds from — but a "hole pattern" or "bolt pattern" is not.
  { re: /(?<!(hole|bolt|drill|pcd) )patterns? /, route: 'casting', label: 'a casting pattern' },
  { re: / (forg(e|ed|ing|ings)|drop ?forg(ed|ing)) /, route: 'forging', label: 'forging' },
  { re: / (stamp(ed|ing|ings)?|pressed|pressings?|press ?part|sheet ?metal|blanked) /, route: 'sheet_metal', label: 'pressing' },
  { re: / (inj(ection)? ?mou?ld(ed|ing)?|mou?lded|mou?ldings?) /, route: 'injection_moulding', label: 'moulding' },
  { re: / (machined|billet|cnc) /, route: 'machining', label: 'machining' },
  { re: / (extru(ded|sion|sions)) /, route: 'extrusion', label: 'extrusion' },
  // Rubber (rubber review): the compound or an unambiguous rubber part. Not
  // "seal", "mount" or "bush" alone — metal parts carry those names too.
  { re: / (epdm|nbr|hnbr|fkm|viton|silicone|rubber|elastomer|grommets?|gaskets?|o ?rings?|weather ?strip|anti ?vibration) /, route: 'rubber', label: 'rubber' },
];

export interface ProcessNameEvidence {
  /** The route the names point to, when they agree; null when none or several. */
  route: string | null;
  /** Every hit, for the basis line. */
  hits: Array<{ route: string; label: string; text: string; where: string }>;
}

export function processFromNames(names: NameSource[]): ProcessNameEvidence {
  const hits: ProcessNameEvidence['hits'] = [];
  for (const n of names) {
    const t = norm(n.text);
    for (const w of PROCESS_WORDS) {
      if (w.re.test(t)) {
        if (!hits.some(h => h.route === w.route && h.where === n.where)) hits.push({ route: w.route, label: w.label, text: n.text, where: n.where });
        break;
      }
    }
  }
  const routes = [...new Set(hits.map(h => h.route))];
  return { route: routes.length === 1 ? routes[0] : null, hits };
}

export interface NetShapeSignal {
  kind: 'net-shape' | 'machined' | null;
  /** Free-form + toroidal faces ÷ all faces. */
  share: number;
  basis: string;
}

/** Is the surface blended like a casting or forging, or prismatic like a part cut from billet? */
export function netShapeSignal(geo: Pick<OCCTGeometry, 'faces'>): NetShapeSignal {
  const by = (geo.faces?.byType ?? {}) as Record<string, number>;
  const total = geo.faces?.total ?? Object.values(by).reduce((a, b) => a + b, 0);
  if (!total || total < 6) return { kind: null, share: 0, basis: 'too few faces to read' };
  const blended = (by.BSPLINE ?? 0) + (by.BEZIER ?? 0) + (by.TORUS ?? 0) + (by.OFFSET ?? 0);
  const share = blended / total;
  const pct = `${Math.round(share * 100)}%`;
  if (share >= 0.15) {
    return { kind: 'net-shape', share, basis: `${pct} of the ${total} faces are free-form or blended (B-spline, toroidal) — the surface of a casting or forging, not of a part cut from billet` };
  }
  if (share <= 0.03 && (by.BSPLINE ?? 0) === 0) {
    return { kind: 'machined', share, basis: `${pct} of the ${total} faces are free-form or blended — prismatic planes and cylinders, the surface of a part machined from solid` };
  }
  return { kind: null, share, basis: `${pct} of the ${total} faces are free-form or blended — between the prismatic and the net-shape range, so the surface does not say` };
}

/** Holes or threads were measured — the finish machining a cast or forged part carries. */
export function hasMachinedFeatures(geo: Pick<OCCTGeometry, 'featureTable' | 'features'>): boolean {
  const holes = (geo.featureTable ?? []).filter(r => r.kind === 'hole').reduce((n, r) => n + r.count, 0);
  return holes > 0 || (geo.features?.estimatedHoleCount ?? 0) > 0;
}

export interface MaterialNameEvidence {
  family: MaterialFamily;
  text: string;
  where: string;
  /** True when the file DECLARES the material (a property), not merely names it. */
  declared: boolean;
}

/** The material the file declares, else the one a name implies. */
export function materialFromFile(filename: string, geo: Pick<OCCTGeometry, 'cadMetadata'>): MaterialNameEvidence | null {
  for (const m of geo.cadMetadata?.materialDesignations ?? []) {
    const fam = familyFromFilename(m);
    if (fam) return { family: fam, text: m, where: 'the material property declared in the STEP file', declared: true };
  }
  for (const n of partNames(filename, geo)) {
    const fam = familyFromFilename(n.text);
    if (fam) return { family: fam, text: n.text, where: n.where, declared: false };
  }
  return null;
}
