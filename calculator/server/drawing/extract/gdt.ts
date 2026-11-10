/**
 * Geometric tolerances: feature-control frames in vector sheets. A frame is a row of text cells on one baseline with
 * line-work dividers between them: [characteristic] [tolerance, with Ø and modifiers] [datum] [datum] …
 *
 * Symbols are mapped two ways (both documented here, nothing else is guessed):
 *  - Unicode: the ISO 1101 / ASME Y14.5 characters (U+23E4 ⏤ … U+2330 ⌰, circled modifiers U+24BB … U+24CA).
 *  - Symbol fonts that follow the ASME Y14.5 lower-case letter convention, recognised by font name:
 *    AutoCAD "GDT" / "AMGDT", Autodesk Inventor "AIGDT", SolidWorks "SWGDT", and fonts named "Y14.5…".
 *    (pdf-vector.ts turns their letters into the Unicode characters, so frames read the same either way.)
 * CATIA and NX usually draw the characteristic symbol as geometry, not text: the frame is then found and reported
 * with its tolerance and datums, the characteristic left unrecognised, status needs-validation.
 */
import type { DraftParameter, ExtractContext, TextLine } from '../types.js';
import { separatorsFor, hasSeparator, countSeparators } from '../text-lines.js';
import { draft, normText, num, unitOfLines } from './common.js';
import { drawingUnit } from './dimensions.js';

export { GDT_FONT_MAP, GDT_FONT_NAME } from '../symbol-fonts.js';

export const CHARACTERISTIC: Record<string, string> = {
  '⏤': 'straightness', '⏥': 'flatness', '○': 'circularity', '⌭': 'cylindricity', '⌒': 'profile of a line', '⌓': 'profile of a surface',
  '⟂': 'perpendicularity', '⊥': 'perpendicularity', '∥': 'parallelism', '∠': 'angularity', '⌖': 'position', '◎': 'concentricity',
  '⌯': 'symmetry', '↗': 'circular run-out', '⌰': 'total run-out', '//': 'parallelism',
};
const MODIFIER: Record<string, string> = { 'Ⓜ': 'M', 'Ⓛ': 'L', 'Ⓟ': 'P', 'Ⓕ': 'F', 'Ⓢ': 'S', 'Ⓣ': 'T', 'Ⓤ': 'U' };

export interface FrameRead {
  characteristic: string | null; symbol?: string;
  tolerance: number; diameterZone?: boolean; modifiers: string[]; projected?: number; maximum?: number;
  datums: string[]; cells: string[];
}

const TOL_CELL = /^(S?Ø)?\s?(\d+(?:[.,]\d+)?|[.,]\d+)\s?((?:(?:[ⓂⓁⓅⒻⓈⓉⓊ]|\([MLPFSTU]\)|\bST\b|\b[MLPFSTU]\b)\s?)*)(?:(\d+(?:[.,]\d+)?|[.,]\d+))?\s?((?:(?:[ⓂⓁⓅⒻⓈⓉⓊ]|\([MLPFSTU]\))\s?)*)$/;
const TOL_CELL_GLUED = /^(S?Ø)?\s?(\d+(?:[.,]\d+)?|[.,]\d+)([MLPFSTU])\s?(\d+(?:[.,]\d+)?|[.,]\d+)?$/;
const DATUM_CELL = /^([A-Z]{1,2}(?:\s?-\s?[A-Z]{1,2})?)\s?([ⓂⓁⓈ]|\([MLS]\))?$/;

/** Read the cells of one candidate frame. Returns undefined when they are not a feature-control frame. */
export function readFrame(cellsIn: string[]): FrameRead | undefined {
  // a divider that was not found leaves a datum letter in the tolerance cell (".030 A"): take the letters out
  const cells = cellsIn.map(c => c.trim()).filter(Boolean).flatMap(c => {
    const m = /^((?:S?Ø)?\s?(?:\d+[.,]\d+|[.,]\d+)(?:\s?[ⓂⓁⓅⒻⓈⓉⓊ])*)((?:\s[A-Z])+)$/.exec(c);
    if (m) return [m[1], ...m[2].trim().split(/\s+/)];
    const mx = /^((?:S?Ø)?\s?(?:\d+[.,]\d+|[.,]\d+)\s?MAX)\s?([A-Z])$/.exec(c);
    return mx ? [mx[1], mx[2]] : [c];
  });
  if (cells.length < 2) return undefined;
  let i = 0;
  let symbol: string | undefined;
  // a characteristic may be its own cell or lead the tolerance cell
  const lead = /^(\/\/|[⏤⏥○⌭⌒⌓⟂⊥∥∠⌖◎⌯↗⌰])\s?(.*)$/.exec(cells[0]);
  let tolText: string;
  if (lead && lead[2]) { symbol = lead[1]; tolText = lead[2]; i = 1; }
  else if (lead) { symbol = lead[1]; tolText = cells[1] ?? ''; i = 2; }
  else { tolText = cells[0]; i = 1; }
  const m = TOL_CELL.exec(tolText) ?? TOL_CELL_GLUED.exec(tolText);
  if (!m) return undefined;
  const modsRaw = `${m[3] ?? ''} ${m[5] ?? ''}`;
  const modifiers = [...modsRaw.matchAll(/[ⓂⓁⓅⒻⓈⓉⓊ]|\(([MLPFSTU])\)|\b(ST)\b|\b([MLPFSTU])\b/g)].map(x => MODIFIER[x[0]] ?? x[1] ?? x[2] ?? x[3]).filter(Boolean);
  const datums: string[] = [];
  // a second tolerance cell that caps the bonus ("Ø.045 MAX")
  let maximum: number | undefined;
  const mx = /^(?:S?Ø)?\s?(\d+(?:[.,]\d+)?|[.,]\d+)\s?MAX$/.exec(cells[i] ?? '');
  if (mx) { maximum = num(mx[1]); i++; }
  for (; i < cells.length; i++) {
    // datum letters in one cell without a divider ("A B C")
    const parts = /^[A-Z](?:\s[A-Z]){1,3}$/.test(cells[i]) ? cells[i].split(/\s+/) : [cells[i]];
    for (const p of parts) {
      const d = DATUM_CELL.exec(p);
      if (!d) return undefined;
      datums.push(d[1].replace(/\s/g, '') + (d[2] ? ` ${d[2].replace(/[()]/g, '')}`.replace('Ⓜ', 'M').replace('Ⓛ', 'L').replace('Ⓢ', 'S') : ''));
    }
  }
  if (!symbol && !datums.length) return undefined;                 // a boxed number alone is a basic dimension
  const projected = m[4] !== undefined ? num(m[4]) : undefined;
  return {
    characteristic: symbol ? CHARACTERISTIC[symbol] ?? null : null, ...(symbol ? { symbol } : {}),
    // with the symbol drawn as geometry the Ø may be geometry too: its absence is then unknown, not "no"
    tolerance: num(m[2]), ...(m[1] || symbol ? { diameterZone: !!m[1] } : {}), modifiers, ...(projected !== undefined ? { projected } : {}),
    ...(maximum !== undefined ? { maximum } : {}), datums, cells,
  };
}

/** Rows of text cells joined by dividers, per sheet. Returns each candidate frame's cells and lines. */
export interface FoundFrame { lines: TextLine[]; cells: string[]; read?: FrameRead; loneTolerance?: number }

export function findFrames(ctx: ExtractContext): FoundFrame[] {
  const out: FoundFrame[] = [];
  for (const sheet of ctx.sheets) {
    const lines = ctx.lines.filter(l => l.sheet === sheet.info.sheet && l.method !== 'ocr' && l.region !== 'title-block' && l.region !== 'revision-table');
    const byRot = new Map<number, TextLine[]>();
    for (const l of lines) { const g = byRot.get(l.rotation); if (g) g.push(l); else byRot.set(l.rotation, [l]); }
    for (const [rot, group] of byRot) {
      const seps = separatorsFor(rot, sheet.hSegs, sheet.vSegs, sheet.oSegs);
      if (!seps.length) continue;
      const sorted = [...group].sort((a, b) => a.v - b.v || a.u0 - b.u0);
      const usedIds = new Set<number>();
      for (const start of sorted) {
        if (usedIds.has(start.id)) continue;
        // grow a row to the right along the baseline
        const row: TextLine[] = [start];
        const dividers: boolean[] = [];
        for (;;) {
          const last = row[row.length - 1];
          const s = Math.max(last.size, start.size);
          const next = sorted.filter(o => !usedIds.has(o.id) && !row.includes(o) && Math.abs(o.v - start.v) <= 0.45 * s && o.u0 >= last.u1 - 0.3 * s && o.u0 - last.u1 <= 2.2 * s)
            .sort((a, b) => a.u0 - b.u0)[0];
          if (!next) break;
          dividers.push(hasSeparator(seps, last.u1, next.u0, (last.v + next.v) / 2, Math.min(last.size, next.size)));
          row.push(next);
        }
        if (row.length < 2 || !dividers.some(Boolean)) continue;
        // cells: runs between dividers
        const cells: string[] = []; let cur = normText(row[0].text);
        const cellEnd: number[] = [];                              // index of the last row line of each cell
        for (let k = 1; k < row.length; k++) {
          if (dividers[k - 1]) { cells.push(cur); cellEnd.push(k - 1); cur = normText(row[k].text); } else cur = `${cur} ${normText(row[k].text)}`;
        }
        cells.push(cur); cellEnd.push(row.length - 1);
        let read = readFrame(cells);
        if (read) { row.forEach(r => usedIds.add(r.id)); out.push({ lines: row, cells, read }); continue; }
        // text may run on after the frame on the same baseline ("… | C APPLIES TO ALL …"): the longest leading part that reads
        let done = false;
        for (let k = cells.length - 1; k >= 2 && !done; k--) {
          read = readFrame(cells.slice(0, k));
          if (read && read.datums.length) {
            const part = row.slice(0, cellEnd[k - 1] + 1);
            part.forEach(r => usedIds.add(r.id)); out.push({ lines: part, cells: cells.slice(0, k), read }); done = true;
          }
        }
        if (done) continue;
        // divided cells that hold a tolerance-like figure but do not read as a frame: reported, not interpreted
        if (cells.length <= 7 && cells.some(c => /^(?:S?Ø)?\s?(?:\d+[.,]\d+|[.,]\d+)/.test(c)) && start.region !== 'table') {
          row.forEach(r => usedIds.add(r.id)); out.push({ lines: row, cells });
        }
      }
      // a lone boxed figure with a second box on its left: a frame whose symbol is drawn as geometry and has no datum
      for (const l of sorted) {
        if (usedIds.has(l.id)) continue;
        const t = normText(l.text);
        // "0.05", "Ø0.1 Ⓜ", or a per-unit tolerance ".01 / Ø1.00"
        if (!/^(?:S?Ø)?\s?(?:\d+[.,]\d+|[.,]\d+)(?:\s?[ⓂⓁⓅⒻⓈⓉⓊ])*(?:\s?\/\s?Ø?\s?(?:\d+(?:[.,]\d+)?|[.,]\d+))?$/.test(t)) continue;
        const s = l.size;
        const left = countSeparators(seps, l.u0 - 3.2 * s, l.u0 + 0.1 * s, l.v, s), right = countSeparators(seps, l.u1 - 0.1 * s, l.u1 + 1.2 * s, l.v, s);
        if (left >= 2 && right >= 1) { usedIds.add(l.id); out.push({ lines: [l], cells: [t], loneTolerance: num(t.replace(/^S?Ø\s?/, '').replace(/\s?\/.*$/, '').replace(/[ⓂⓁⓅⒻⓈⓉⓊ]/g, '').trim()) }); }
      }
    }
  }
  return out;
}

export function extractGdt(ctx: ExtractContext): { parameters: DraftParameter[]; frameLineIds: Set<number> } {
  const frames = findFrames(ctx);
  const du = drawingUnit(ctx);
  const parameters: DraftParameter[] = [];
  const frameLineIds = new Set<number>();
  const datumUse = new Map<string, { n: number; lines: TextLine[] }>();
  for (const f of frames) {
    f.lines.forEach(l => frameLineIds.add(l.id));
    const u = unitOfLines(f.lines, 'free');
    if (!f.read) {
      const lone = f.loneTolerance !== undefined;
      parameters.push(draft('gdt.frame', lone ? { characteristic: null, tolerance: f.loneTolerance!, ...(/^S?Ø/.test(f.cells[0]) ? { diameterZone: true } : {}), modifiers: [], datums: [] } : { characteristic: null, cells: f.cells }, u, {
        ...(lone ? { unit: du.unit } : {}), raw: `${lone ? '[symbol not text] | ' : ''}${f.cells.join(' | ')}`, bbox: u.bbox, status: 'needs-validation',
        note: lone
          ? 'A boxed figure with a second box on its left: a feature-control frame whose symbol is drawn as geometry and which names no datum. The characteristic must be confirmed from the drawing.'
          : 'A row of boxed cells that holds a tolerance-like figure but does not read as a feature-control frame: reported as written, not interpreted.',
      }));
      continue;
    }
    const { cells, symbol: _symbol, ...value } = f.read;
    const known = f.read.characteristic !== null;
    parameters.push(draft('gdt.frame', value as unknown as Record<string, unknown>, u, {
      unit: du.unit, raw: `${known ? '' : '[symbol not text] | '}${cells.join(' | ')}`, bbox: u.bbox,
      ...(known ? {} : { status: 'needs-validation' as const }),
      note: known ? undefined : 'A feature-control frame was found (cells divided by line work), but its characteristic symbol is drawn as geometry, not text: the tolerance and datums are read, the characteristic must be confirmed from the drawing.',
    }));
    for (const d of f.read.datums) {
      for (const letter of d.replace(/\s[MLS]$/, '').split('-')) {
        const e = datumUse.get(letter) ?? { n: 0, lines: f.lines };
        e.n++; datumUse.set(letter, e);
      }
    }
  }
  for (const [letter, e] of [...datumUse.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const u = unitOfLines(e.lines, 'free');
    parameters.push(draft('gdt.datum', letter, u, { raw: `datum ${letter}`, bbox: u.bbox, note: `Referenced by ${e.n} feature-control frame${e.n === 1 ? '' : 's'}. The datum feature itself is not located.` }));
  }
  return { parameters, frameLineIds };
}
