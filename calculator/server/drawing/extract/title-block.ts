/**
 * Title block: the cells the layout matched to labels become identity parameters. Values are read as written; the
 * scale, sheet, date, units, projection and mass are checked against the form they must have, and a cell that does
 * not have that form is reported as written with status needs-validation rather than dropped or "fixed".
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, draft, num, type TextUnit } from './common.js';
import { drawingUnit } from './dimensions.js';

const DATE_RE = /\b(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|\d{1,2}[-\s](?:JAN|FEB|MAR|M[ÄA]R|APR|MAY|MAI|JUN|JUL|AUG|SEP|OCT|OKT|NOV|DEC|DEZ)[A-Z]*\.?[-\s]\d{2,4})\b/i;
const SCALE_RE = /\b(\d+(?:[.,]\d+)?\s?:\s?\d+(?:[.,]\d+)?|NTS|NOT\s+TO\s+SCALE|NONE|FULL|OHNE)\b/i;
const SHEET_RE = /\b(\d{1,3})\s?(?:\/|OF|VON|v\.)\s?(\d{1,3})\b|^\s?(\d{1,3})\s?$/i;

export function extractTitleBlock(ctx: ExtractContext): DraftParameter[] {
  const out: DraftParameter[] = [];
  const units = buildUnits(ctx);
  const cell = (key: string): TextUnit | undefined => units.find(u => u.context === `title:${key}`);
  const plain: Array<[string, string]> = [['partNumber', 'title.partNumber'], ['partName', 'title.partName'], ['drawingNumber', 'title.drawingNumber'], ['company', 'title.company']];
  for (const [key, name] of plain) {
    const u = cell(key);
    if (u && u.text && !/^[-–—/.\s]*$/.test(u.text)) out.push(draft(name, u.text, u));
  }
  let u = cell('revision');
  if (u) {
    const ok = /^[A-Z0-9]{1,3}(?:[.\-][A-Z0-9]{1,3})?$/i.test(u.text);
    out.push(draft('title.revision', u.text, u, ok ? {} : { status: 'needs-validation', note: 'The revision cell does not hold a short revision code: reported as written.' }));
  }
  u = cell('date');
  if (u) {
    const m = DATE_RE.exec(u.text);
    out.push(draft('title.date', m ? m[1] : u.text, u, m ? { at: m[1] } : { status: 'needs-validation', note: 'The date cell does not hold a recognisable date: reported as written.' }));
  }
  u = cell('scale');
  if (u) {
    const m = SCALE_RE.exec(u.text);
    out.push(draft('title.scale', m ? m[1].replace(/\s/g, '') : u.text, u, m ? { at: m[1] } : { status: 'needs-validation', note: 'The scale cell does not hold a ratio: reported as written.' }));
  }
  u = cell('sheet');
  if (u) {
    const m = SHEET_RE.exec(u.text);
    out.push(draft('title.sheet', m ? (m[1] ? `${m[1]}/${m[2]}` : m[3]) : u.text, u, m ? {} : { status: 'needs-validation', note: 'The sheet cell does not hold a sheet number: reported as written.' }));
  }
  const du = drawingUnit(ctx);
  if (du.stated) {
    const uu = cell('units') ?? (du.line ? units.find(x => x.lines.some(l => l.id === du.line!.id)) : undefined);
    if (uu) out.push(draft('title.units', du.unit, uu, { kind: 'interpreted', note: `Units ${du.basis}.` }));
  }
  u = cell('projection');
  const projText = u?.text ?? '';
  const anyProj = units.find(x => /\b(?:FIRST|1ST|THIRD|3RD)\s?-?\s?ANGLE\b|\bPROJEKTIONSMETHODE\s?[13E A]\b|\bISO\s?-?\s?[EA]\b(?=.*PROJ)/i.test(x.text));
  const pu = u ?? anyProj;
  if (pu) {
    const t = `${projText} ${pu.text}`;
    const first = /\b(?:FIRST|1ST)\s?-?\s?ANGLE\b|PROJEKTIONSMETHODE\s?(?:1|E)\b|\bMETHOD\s?E\b|\bISO\s?-?\s?E\b/i.test(t);
    const third = /\b(?:THIRD|3RD)\s?-?\s?ANGLE\b|PROJEKTIONSMETHODE\s?(?:3|A)\b|\bMETHOD\s?A\b|\bISO\s?-?\s?A\b/i.test(t);
    if (first !== third) out.push(draft('title.projection', first ? 'first angle' : 'third angle', pu, { kind: 'interpreted', note: 'From the words on the drawing. The projection SYMBOL is a graphic and is not read.' }));
  }
  u = cell('mass');
  if (u) {
    const m = /(\d+(?:[.,]\d+)?)\s?(kg|g|lbs?|t)?\b/i.exec(u.text);
    if (m) {
      const v = num(m[1]); const unit = (m[2] ?? '').toLowerCase();
      const labelSaysKg = /KG/i.test(ctx.layouts.map(l => l.titleBlock?.fields.mass?.label ?? '').join(' '));
      if (unit === 'kg' || (!unit && labelSaysKg)) out.push(draft('part.mass', v, u, { unit: 'kg', raw: u.text }));
      else if (unit === 'g') out.push(draft('part.mass', Math.round(v) / 1000, u, { unit: 'kg', raw: u.text, kind: 'interpreted', note: `${m[1]} g ÷ 1000.` }));
      else if (unit.startsWith('lb')) out.push(draft('part.mass', Math.round(v * 0.45359237 * 10000) / 10000, u, { unit: 'kg', raw: u.text, kind: 'interpreted', note: `${m[1]} lb × 0.45359237.` }));
      else out.push(draft('part.mass', v, u, { raw: u.text, status: 'needs-validation', note: 'The mass cell gives a number with no unit: reported as written, unit not assumed.' }));
    }
  }
  return out;
}
