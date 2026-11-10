/**
 * What every extractor shares: the pieces of text it scans ("units": a title-block cell, a note, a free line), text
 * normalisation, number parsing and the one way a parameter is built — so method, reliability, status and location
 * are filled the same way everywhere.
 *
 * Status rule: exact text (PDF text, DXF entity) is `extracted`; anything read by OCR is `needs-validation`, always.
 */
import type { DrawingLocation, ParameterKind, ParameterStatus, ParameterValue } from '../../../src/engine/engineering-data/model.js';
import type { BBox, DraftParameter, ExtractContext, Region, TextLine, TextMethod } from '../types.js';
import { roundBox, unionAll } from '../geom.js';

export interface TextUnit {
  text: string;
  lines: TextLine[];
  sheet: number;
  bbox: BBox;
  region: Region;
  /** `title:<field>` for a title-block cell, `note` for a numbered note, `free` for any other line. */
  context: string;
  noteNo?: string;
  method: TextMethod;
  reliability?: number;
  zone?: string;
}

/** Symbols written several ways are brought to one spelling before any grammar runs. The raw text is kept apart. */
export function normText(s: string, method: TextMethod = 'pdf-text'): string {
  let t = s.replace(/[⌀∅ø]/g, 'Ø').replace(/[−‒–—]/g, '-').replace(/[μ]/g, 'µ')
    .replace(/[×✕]/g, 'x').replace(/[≤]/g, '≤').replace(/[≥]/g, '≥').replace(/ /g, ' ').replace(/[“”„]/g, '"').replace(/[‘’]/g, "'");
  if (method === 'ocr') {
    // Tesseract's standard models have no Ø: it comes out as one of these before a number.
    t = t.replace(/(^|[\s(x])[@¢®©]\s?(?=\d)/g, '$1Ø').replace(/\+\s?\/\s?-/g, '±')
      // ± is often read as a pound sign, µm as "pm" / "um" / "pum", and "1 OF 1" as "10F1"
      .replace(/£(?=\s?[\d.,])/g, '±').replace(/(\d)\s?(?:pum|pm|um|ym)\b/g, '$1 µm').replace(/\b(\d)\s?0F\s?(\d)\b/g, '$1 OF $2');
  }
  return t.replace(/\s+/g, ' ').trim();
}

/** "12,5" or "12.5" or ".25" → number. */
export function num(s: string): number { return Number(s.replace(',', '.').replace(/^([+-]?)\./, '$10.')); }

export const NUM = String.raw`\d+(?:[.,]\d+)?|[.,]\d+`;

function lineReliability(lines: TextLine[]): number | undefined {
  let sum = 0, n = 0;
  for (const l of lines) if (l.reliability !== undefined) { sum += l.reliability * l.text.length; n += l.text.length; }
  return n ? Math.round(sum / n * 100) / 100 : undefined;
}

export function unitOfLines(lines: TextLine[], context: string, text?: string, noteNo?: string): TextUnit {
  const first = lines[0];
  const method: TextMethod = lines.some(l => l.method === 'ocr') ? 'ocr' : first.method;
  const rel = lineReliability(lines);
  return {
    text: normText(text ?? lines.map(l => l.text).join(' '), method), lines, sheet: first.sheet, bbox: roundBox(unionAll(lines.map(l => l.bbox))),
    region: first.region ?? 'other', context, method, ...(noteNo ? { noteNo } : {}), ...(rel !== undefined ? { reliability: rel } : {}),
    ...(first.zone ? { zone: first.zone } : {}),
  };
}

/** Every piece of text an extractor may scan, most specific first: title-block cells, notes, then free lines. */
export function buildUnits(ctx: ExtractContext): TextUnit[] {
  const byId = new Map(ctx.lines.map(l => [l.id, l]));
  const units: TextUnit[] = [];
  const inNote = new Set<number>();
  for (const lay of ctx.layouts) {
    if (lay.titleBlock) {
      for (const [key, f] of Object.entries(lay.titleBlock.fields)) {
        const ls = f.lineIds.map(id => byId.get(id)).filter((l): l is TextLine => !!l);
        if (!ls.length) continue;
        // a cell's lines are scanned once, as the cell — not again as free lines
        ls.forEach(l => inNote.add(l.id));
        inNote.add(f.labelLineId);
        units.push(unitOfLines(ls, `title:${key}`, f.value));
      }
    }
    for (const nb of lay.notes) for (const e of nb.entries) {
      const ls = e.lineIds.map(id => byId.get(id)).filter((l): l is TextLine => !!l);
      if (!ls.length) continue;
      ls.forEach(l => inNote.add(l.id));
      units.push(unitOfLines(ls, 'note', e.text, e.no));
    }
  }
  // A callout beside a view is often two or three short lines under each other ("1/4-20 UNC-2B" / "HELICOIL INSERT"):
  // left-aligned lines of one size, directly stacked, are one unit. A stack of bare numbers (limits) is not.
  const free = ctx.lines.filter(l => !inNote.has(l.id));
  const taken = new Set<number>();
  const bare = (t: string): boolean => /^[\s\d.,+\-±()Ø°xX/]*$/.test(t);
  for (const l of free) {
    if (taken.has(l.id)) continue;
    const group = [l];
    if ((l.region === 'view' || l.region === 'other') && !bare(l.text)) {
      for (;;) {
        const last = group[group.length - 1];
        const next = free.find(o => !taken.has(o.id) && !group.includes(o) && o.sheet === l.sheet && o.rotation === l.rotation && o.region === l.region
          && Math.abs(o.size - l.size) <= 0.1 * l.size && Math.abs(o.u0 - last.u0) <= 0.6 * l.size && o.v - last.v >= 0.9 * l.size && o.v - last.v <= 1.9 * l.size && !bare(o.text));
        if (!next || group.length >= 6) break;
        group.push(next);
      }
    }
    group.forEach(g => taken.add(g.id));
    units.push(unitOfLines(group, 'free'));
  }
  return units;
}

export interface DraftOptions {
  unit?: string;
  raw?: string;
  kind?: ParameterKind;
  status?: ParameterStatus;
  note?: string;
  appliesTo?: DraftParameter['appliesTo'];
  /** Narrow the location to the line of the unit that holds this text. */
  at?: string;
  bbox?: BBox;
}

/** The line of a unit that holds a piece of text (so a parameter from a long note points at its own line). */
function lineHolding(u: TextUnit, piece: string | undefined): TextLine | undefined {
  if (!piece || u.lines.length < 2) return undefined;
  const key = piece.replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!key) return undefined;
  return u.lines.find(l => normText(l.text, l.method).includes(key));
}

export function locationOf(u: TextUnit, o: DraftOptions = {}): DrawingLocation {
  const l = lineHolding(u, o.at ?? o.raw);
  const zone = l?.zone ?? u.zone;
  return { sheet: u.sheet, ...(zone ? { zone } : {}), bbox: roundBox(o.bbox ?? l?.bbox ?? u.bbox), region: u.region };
}

/** Build one parameter from a unit. */
export function draft(name: string, value: ParameterValue, u: TextUnit, o: DraftOptions = {}): DraftParameter {
  const ocr = u.method === 'ocr';
  const status: ParameterStatus = ocr ? 'needs-validation' : (o.status ?? 'extracted');
  const notes: string[] = [];
  if (o.note) notes.push(o.note);
  if (ocr) notes.push(`Read by OCR${u.reliability !== undefined ? ` (engine confidence ${Math.round(u.reliability * 100)} %)` : ''}: check against the drawing.`);
  const appliesTo = o.appliesTo ?? (u.noteNo && /^\d+$/.test(u.noteNo) ? { description: `note ${u.noteNo}` } : undefined);
  return {
    name, value,
    ...(o.unit ? { unit: o.unit } : {}),
    rawText: o.raw ?? u.text,
    location: locationOf(u, o),
    method: u.method,
    kind: o.kind ?? 'extracted',
    status,
    ...(u.method === 'ocr' ? (u.reliability !== undefined ? { reliability: u.reliability } : {}) : { reliability: 1 }),
    ...(appliesTo ? { appliesTo } : {}),
    ...(notes.length ? { note: notes.join(' ') } : {}),
  };
}

/** Split a unit into sentence-like clauses, so a keyword and its value are looked for together. */
export function clauses(text: string): string[] {
  return text.split(/(?<=[.;])\s+(?=[A-ZÄÖÜ(])|\s*;\s*/).map(s => s.trim()).filter(Boolean);
}

export function uniqueBy<T>(list: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter(t => { const k = key(t); if (seen.has(k)) return false; seen.add(k); return true; });
}
