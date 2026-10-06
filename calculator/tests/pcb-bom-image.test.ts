/** A BOM supplied as a picture (server/utils/pcb-bom-image.ts, Oct 2026). The reader transcribes; it never prices. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isBomImage, cleanBomImageRows, readBomImage, BOM_IMAGE_JSON_SCHEMA, BOM_IMAGE_PROMPT } from '../server/utils/pcb-bom-image.js';
import { bomFromFile } from '../server/utils/pcb-bom-truth.js';

const row = (o: Record<string, unknown>) => ({ refDes: '', qty: 1, partNumber: '', manufacturer: '', description: '', value: '', pkg: '', ...o });
/** A stand-in client: streams back one text block, or rejects structured output once. */
function fakeClient(reply: unknown, rejectFormat = false) {
  const calls: Array<Record<string, unknown>> = [];
  return { calls, messages: { stream(p: Record<string, unknown>) {
    calls.push(p);
    return { finalMessage: async () => {
      if (rejectFormat && p.output_config) throw Object.assign(new Error('output_config: unknown parameter'), { status: 400 });
      return { content: [{ type: 'text', text: JSON.stringify(reply) }] };
    } };
  } } } as never;
}

describe('BOM image: what is accepted', () => {
  it('PNG / JPEG / WebP pictures are BOM images; CSV / XML are not', () => {
    expect(isBomImage({ originalname: 'bom.png', mimetype: 'image/png' })).toBe(true);
    expect(isBomImage({ originalname: 'BOM scan.JPG', mimetype: 'application/octet-stream' })).toBe(true);
    expect(isBomImage({ originalname: 'bom.csv', mimetype: 'text/csv' })).toBe(false);
  });
  it('the route accepts a BOM image under bomFile, and the screen offers it', () => {
    const route = readFileSync('server/routes/pcb.ts', 'utf8');
    expect(route).toMatch(/isBomImage\(file\)\) cb\(null, true\)/);
    expect(readFileSync('src/ui/main.ts', 'utf8')).toMatch(/id="pcb-bom-input" accept="[^"]*\.png/);
  });
});

describe('BOM image: the golden rule', () => {
  it('the schema has no price or cost field, and the prompt tells the reader to ignore price columns', () => {
    const fields = Object.keys(BOM_IMAGE_JSON_SCHEMA.properties.rows.items.properties);
    expect(fields.some(f => /price|cost|gbp|usd|total/i.test(f))).toBe(false);
    expect(BOM_IMAGE_PROMPT).toMatch(/Ignore any price, cost, total or currency column/);
  });
});

describe('BOM image: deterministic clean-up of the transcription', () => {
  it('drops header and total rows and rows naming no part; qty follows the designators when missing or not whole', () => {
    const r = cleanBomImageRows([
      row({ refDes: 'Designator', partNumber: 'MPN', qty: 0 }),
      row({ refDes: 'R1-R4', value: '10k', pkg: '0402', qty: NaN }),
      row({ refDes: 'U1', partNumber: 'TJA1044GT/3Z', qty: 1 }),
      row({ refDes: 'C1, C2, C3', value: '100nF', qty: 1.5 }),
      row({ refDes: 'J9', qty: 1 }),
      row({ refDes: 'TOTAL', description: 'Total', qty: 9 }),
    ]);
    expect(r.lines.map(l => [l.refDes, l.qty])).toEqual([['R1-R4', 4], ['U1', 1], ['C1, C2, C3', 3]]);
    expect(r.lines.every(l => l.fromImage)).toBe(true);
    expect(r.dropped.length).toBe(3);
    expect(r.qtyFixed.length).toBe(2);
  });
});

describe('BOM image: the reader', () => {
  it('transcribes with structured output and returns BOM-file-shaped lines marked fromImage', async () => {
    const c = fakeClient({ isBomTable: true, unreadable: [], rows: [row({ refDes: 'U1', partNumber: 'S32K144HAT0MLLT', qty: 1 }), row({ refDes: 'R1-R10', value: '10k', qty: 10 })] });
    const r = await readBomImage(c, { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'bom.png' }, 'claude-sonnet-5-5');
    expect(r.isBomTable).toBe(true);
    expect(r.lines).toHaveLength(2);
    expect((c as unknown as { calls: Array<Record<string, unknown>> }).calls[0].output_config).toBeTruthy();
  });
  it('falls back to a plain call when structured output is refused', async () => {
    const c = fakeClient({ isBomTable: true, unreadable: [], rows: [row({ refDes: 'U1', partNumber: 'X', qty: 1 })] }, true);
    const r = await readBomImage(c, { buffer: Buffer.from('x'), mimetype: 'image/jpeg' }, 'm');
    expect(r.lines).toHaveLength(1);
  });
  it('a picture that is not a BOM table yields no lines', async () => {
    const r = await readBomImage(fakeClient({ isBomTable: false, rows: [], unreadable: [] }), { buffer: Buffer.from('x'), mimetype: 'image/png' }, 'm');
    expect(r.isBomTable).toBe(false);
    expect(r.lines).toHaveLength(0);
  });
});

describe('BOM image: the BOM it gives', () => {
  it('lines are the BOM (identity and quantity), marked "image" and one notch less certain than a file', () => {
    const lines = cleanBomImageRows([row({ refDes: 'U1', partNumber: 'TJA1044GT/3Z', description: 'CAN transceiver', pkg: 'SOIC-8', qty: 1 })]).lines;
    const t = bomFromFile(lines, [{ refDes: 'U1', partNumber: 'TJA1044', unitPriceGBP: 99, qty: 3 }], true);
    expect(t.bom[0].bomSource).toBe('image');
    expect(t.bom[0].qty).toBe(1);                          // the BOM picture's quantity, not the photo's
    expect(Number(t.bom[0].lineConf)).toBeCloseTo(0.85, 6); // 0.95 for a file part number, −0.1 for a transcription
  });
});
