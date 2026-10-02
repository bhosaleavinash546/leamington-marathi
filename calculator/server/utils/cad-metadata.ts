/**
 * What a CAD file says about itself, read from its text — no kernel, no model.
 *
 * A STEP file carries more than shape. Its header names the file it was saved
 * as (often a full path, folders included), the authoring system and a
 * description; its PRODUCT entities name the part; and AP214/AP242 exports, and
 * CATIA, NX, Creo and SolidWorks with material properties switched on, carry the
 * material as a `MATERIAL_DESIGNATION` or a descriptive property. The rules used
 * to read none of it — only the name the file happened to be uploaded under —
 * so a part saved as "Casting Bracket" in a folder called "CASTING-01" reached
 * the process question with nothing to go on.
 *
 * This is evidence, not a decision: the rules use it as a stated leaning, and a
 * material designation as the material (it is the designer's own property). It
 * is attached to the geometry at the measurement boundary (`analyzeGeometry`),
 * so the route, re-analysis, the bulk run and the real-parts baseline all see
 * the same thing.
 */
import type { CadMetadata } from '../../src/engine/ai-analysis.js';
export type { CadMetadata };

const MAX_SCAN = 4 * 1024 * 1024;   // metadata sits in the header and the first entities

/** STEP strings escape a quote by doubling it and may carry \X2\…\X0\ unicode. */
function unstep(s: string): string {
  return s.replace(/''/g, "'").replace(/\\\\/g, '\\')
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, hex: string) =>
      (hex.match(/.{4}/g) ?? []).map(h => String.fromCharCode(parseInt(h, 16))).join(''))
    .trim();
}

const PLACEHOLDER = /^(|none|not specified|unknown|n\/a|part\d*|body\d*|default|open cascade.*)$/i;

function pushUnique(list: string[], v: string): void {
  const s = unstep(v);
  if (!s || PLACEHOLDER.test(s) || s.length > 200) return;
  if (!list.some(x => x.toLowerCase() === s.toLowerCase())) list.push(s);
}

/** Read the metadata of a STEP or IGES file. Never throws; returns empty lists on anything else. */
export function readCadMetadata(buffer: Buffer | string, filename = ''): CadMetadata {
  const text = typeof buffer === 'string' ? buffer.slice(0, MAX_SCAN) : buffer.subarray(0, MAX_SCAN).toString('latin1');
  const out: CadMetadata = { productNames: [], materialDesignations: [] };
  const ext = filename.toLowerCase().split('.').pop() ?? '';

  if (ext === 'igs' || ext === 'iges') {
    // IGES global section: parameter 4 is the file name, 5 the native system.
    const g = text.split(/\r?\n/).filter(l => l.length >= 73 && l[72] === 'G').map(l => l.slice(0, 72)).join('');
    const hs = [...g.matchAll(/(\d+)H/g)].map(m => {
      const n = Number(m[1]); const start = (m.index ?? 0) + m[0].length;
      return g.slice(start, start + n);
    });
    const system = hs.find(h => /catia|nx|unigraphics|creo|pro\/?e|solid ?works|inventor|solid ?edge|parasolid|acis|open cascade/i.test(h));
    const file = hs.find(h => /\.(igs|iges)\s*$/i.test(h));
    if (system) out.authoringSystem = system.trim();
    if (file) out.headerFileName = file.trim();
    return out;
  }

  const header = text.match(/HEADER;([\s\S]*?)ENDSEC/)?.[1] ?? '';
  const fn = header.match(/FILE_NAME\s*\(\s*'((?:[^']|'')*)'/);
  if (fn) {
    const v = unstep(fn[1]);
    if (v && !PLACEHOLDER.test(v)) out.headerFileName = v;
  }
  // FILE_NAME(name, time, (author), (org), preprocessor, originating_system, auth)
  const fnFull = header.match(/FILE_NAME\s*\(([\s\S]*?)\)\s*;/)?.[1] ?? '';
  const quoted = [...fnFull.matchAll(/'((?:[^']|'')*)'/g)].map(m => unstep(m[1]));
  const system = quoted.slice(2).find(s => /catia|nx|unigraphics|creo|pro\/?e|solid ?works|inventor|fusion|solid ?edge|parasolid|acis|freecad|onshape|open cascade/i.test(s));
  if (system) out.authoringSystem = system;
  const fd = header.match(/FILE_DESCRIPTION\s*\(\s*\(\s*'((?:[^']|'')*)'/);
  if (fd) {
    const v = unstep(fd[1]);
    if (v && !/step exchange|open cascade model|^\s*$/i.test(v)) out.description = v;
  }

  for (const m of text.matchAll(/=\s*PRODUCT\s*\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'/g)) {
    pushUnique(out.productNames, m[1]);
    pushUnique(out.productNames, m[2]);
    if (m[3] && !/not specified/i.test(m[3])) pushUnique(out.productNames, m[3]);
  }

  // Material, three ways exporters write it:
  //   MATERIAL_DESIGNATION('Steel S355', (#…))              — AP214 / AP242
  //   DESCRIPTIVE_REPRESENTATION_ITEM('material name','…')  — property sets (CATIA, NX, SolidWorks)
  //   …('Material', …, 'Aluminium 6061')                    — user-defined attributes
  for (const m of text.matchAll(/MATERIAL_DESIGNATION\s*\(\s*'((?:[^']|'')*)'/g)) pushUnique(out.materialDesignations, m[1]);
  for (const m of text.matchAll(/DESCRIPTIVE_REPRESENTATION_ITEM\s*\(\s*'([^']*material[^']*)'\s*,\s*'((?:[^']|'')*)'/gi)) {
    if (!/density|mass/i.test(m[1])) pushUnique(out.materialDesignations, m[2]);
  }
  for (const m of text.matchAll(/'(?:MATERIAL|Material|material|WERKSTOFF|Werkstoff)'\s*,\s*(?:'[^']*'\s*,\s*)?'((?:[^']|'')+)'/g)) {
    pushUnique(out.materialDesignations, m[1]);
  }
  const legacy = text.match(/\bMATERIAL\s*\(\s*'((?:[^']|'')+)'/);
  if (legacy) pushUnique(out.materialDesignations, legacy[1]);
  return out;
}

/** Every name a part goes by, for matching: upload name, product names, header path, description. */
export function namesOf(filename: string, meta?: CadMetadata | null): Array<{ text: string; where: string }> {
  const out: Array<{ text: string; where: string }> = [];
  if (filename) out.push({ text: filename, where: 'the uploaded file name' });
  for (const p of meta?.productNames ?? []) out.push({ text: p, where: 'the STEP product name' });
  if (meta?.headerFileName) out.push({ text: meta.headerFileName, where: 'the file path recorded in the STEP header' });
  if (meta?.description) out.push({ text: meta.description, where: 'the STEP file description' });
  return out;
}
