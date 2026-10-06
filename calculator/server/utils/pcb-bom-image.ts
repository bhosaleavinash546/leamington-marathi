/**
 * A BOM supplied as a picture — a screenshot or photo of a BOM table, or a scanned page
 * (PNG / JPEG / WebP). Requested Oct 2026: engineers often have the BOM only as an image.
 *
 * The model TRANSCRIBES the table and nothing else: designators, quantity, part number,
 * manufacturer, description, value, package. The schema has no price field, and a price
 * column in the picture is ignored (the golden rule: AI never sets a price). The rows
 * then go through deterministic checks here and leave as ParsedBOMLine — the same shape
 * a .csv / .xml BOM file produces — so pricing, grounding and Stage 4 are identical for
 * both. Every line is marked `fromImage`, and the screen says "BOM image" rather than
 * "BOM file": a transcription can misread a character, so the lines are shown for checking.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import type { ParsedBOMLine } from './pcb-bom-parser.js';
import { expandRefDes } from './pcb-vision-accuracy.js';

/** The BOM file input also takes a picture of a BOM. */
export function isBomImage(file: { originalname?: string; mimetype?: string }): boolean {
  return /^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype ?? '') || /\.(png|jpe?g|webp)$/i.test(file.originalname ?? '');
}

const str = { type: 'string' } as const;
/** What the model may return: a transcription. No price, no cost. */
export const BOM_IMAGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    isBomTable: { type: 'boolean' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          refDes: str, qty: { type: 'number' }, partNumber: str, manufacturer: str,
          description: str, value: str, pkg: str,
        },
        required: ['refDes', 'qty', 'partNumber', 'manufacturer', 'description', 'value', 'pkg'],
        additionalProperties: false,
      },
    },
    unreadable: { type: 'array', items: str },
  },
  required: ['isBomTable', 'rows', 'unreadable'],
  additionalProperties: false,
} as const;

export const BOM_IMAGE_PROMPT = `This image is a bill of materials (BOM) for a printed circuit board — a table, a spreadsheet screenshot or a scanned page.
Transcribe EVERY component row, top to bottom, exactly as written. Do not summarise, merge, skip or invent rows.
For each row give:
- refDes: the reference designators exactly as written (e.g. "R1, R2, R5" or "C1-C10"); "" if the table has none.
- qty: the quantity per board as written; if there is no quantity column, the number of designators.
- partNumber: the manufacturer part number (MPN) exactly, character for character; "" if none.
- manufacturer, description, value (e.g. 10k, 100nF), pkg (footprint / package, e.g. 0402, SOIC-8): "" when not shown.
Ignore any price, cost, total or currency column completely — do not report prices.
Ignore header rows, sub-total / total rows and notes. If a cell is unreadable, transcribe what you can and add the row's designators or line number to "unreadable".
If the image is not a BOM table, set isBomTable to false and return no rows.`;

type RawRow = { refDes?: unknown; qty?: unknown; partNumber?: unknown; manufacturer?: unknown; description?: unknown; value?: unknown; pkg?: unknown };

/**
 * Deterministic clean-up of the transcription:
 *  - header, total and empty rows are dropped;
 *  - qty is a whole number ≥ 1; when it is missing or not whole, the designator count is used;
 *  - a row must name its part somehow (part number, description or value).
 */
export function cleanBomImageRows(rows: RawRow[]): { lines: (ParsedBOMLine & { fromImage: true })[]; dropped: string[]; qtyFixed: string[] } {
  const lines: (ParsedBOMLine & { fromImage: true })[] = [];
  const dropped: string[] = [];
  const qtyFixed: string[] = [];
  const s = (v: unknown) => String(v ?? '').trim();
  for (const r of rows ?? []) {
    const refDes = s(r.refDes), partNumber = s(r.partNumber), description = s(r.description), value = s(r.value);
    const text = `${refDes} ${partNumber} ${description} ${value}`.trim();
    if (!text) continue;
    if (/^(ref(erence)?s?|designators?|qty|quantity|part ?(number|no\.?)|mpn|description|value|item)$/i.test(refDes || partNumber || description)) { dropped.push(`header "${text.slice(0, 30)}"`); continue; }
    if (/^(sub-?)?total\b|^grand total/i.test(refDes || description || partNumber)) { dropped.push(`total "${text.slice(0, 30)}"`); continue; }
    if (!partNumber && !description && !value) { dropped.push(`"${refDes}" (no part named)`); continue; }
    const refs = expandRefDes(refDes);
    let qty = Number(r.qty);
    if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
      const was = s(r.qty) || 'none';
      qty = refs.length > 0 ? refs.length : Math.max(1, Math.round(Number.isFinite(qty) && qty > 0 ? qty : 1));
      qtyFixed.push(`${refDes || partNumber || description} (${was} → ${qty})`);
    }
    lines.push({ refDes, partNumber, description, value, pkg: s(r.pkg), qty, manufacturer: s(r.manufacturer) || undefined, fromImage: true });
  }
  return { lines, dropped, qtyFixed };
}

function firstJson(text: string): unknown {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON in the reply');
  return JSON.parse(text.slice(a, b + 1));
}

export interface BomImageRead { lines: (ParsedBOMLine & { fromImage: true })[]; notes: string[]; isBomTable: boolean }

/** Transcribe a BOM picture (one vision call) and clean it. Never prices anything. */
export async function readBomImage(anthropic: Anthropic, image: { buffer: Buffer; mimetype: string; originalname?: string }, model: string): Promise<BomImageRead> {
  const media = /png/i.test(image.mimetype) || /\.png$/i.test(image.originalname ?? '') ? 'image/png'
    : /webp/i.test(image.mimetype) || /\.webp$/i.test(image.originalname ?? '') ? 'image/webp' : 'image/jpeg';
  const params = {
    model, max_tokens: 16000,
    system: 'You transcribe bill-of-materials tables from images, exactly and completely. You never report prices.',
    messages: [{ role: 'user' as const, content: [
      { type: 'image' as const, source: { type: 'base64' as const, media_type: media as 'image/png' | 'image/jpeg' | 'image/webp', data: image.buffer.toString('base64') } },
      { type: 'text' as const, text: BOM_IMAGE_PROMPT },
    ] }],
  };
  let msg: Anthropic.Message;
  try {
    msg = await anthropic.messages.stream({ ...params, output_config: { format: jsonSchemaOutputFormat(BOM_IMAGE_JSON_SCHEMA) } } as never).finalMessage();
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e?.status !== 400 || !/output_config|format|schema/i.test(e.message ?? '')) throw err;
    msg = await anthropic.messages.stream(params).finalMessage();   // a model / proxy without structured output
  }
  const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n');
  const parsed = firstJson(text) as { isBomTable?: boolean; rows?: RawRow[]; unreadable?: string[] };
  const { lines, dropped, qtyFixed } = cleanBomImageRows(parsed.rows ?? []);
  const notes: string[] = [];
  if (dropped.length) notes.push(`rows not used: ${dropped.slice(0, 6).join('; ')}${dropped.length > 6 ? '; …' : ''}`);
  if (qtyFixed.length) notes.push(`quantity taken from the designators: ${qtyFixed.slice(0, 6).join('; ')}${qtyFixed.length > 6 ? '; …' : ''}`);
  if (parsed.unreadable?.length) notes.push(`cells the reader could not make out: ${parsed.unreadable.slice(0, 8).join(', ')}`);
  return { lines, notes, isBomTable: parsed.isBomTable !== false && lines.length > 0 };
}
