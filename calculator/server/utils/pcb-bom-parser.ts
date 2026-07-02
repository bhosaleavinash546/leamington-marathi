/**
 * BOM / Netlist file parser.
 * Supports: generic CSV, KiCad BOM CSV, Altium BOM CSV, Altium BOM XML.
 * Never throws — returns an empty array if the file cannot be parsed.
 */

export interface ParsedBOMLine {
  refDes: string;
  partNumber: string;
  description: string;
  value: string;
  pkg: string;
  qty: number;
  manufacturer?: string;
}

// ─── Column header synonyms (lower-case) ───────────────────────────────────
const HEADER_SYNONYMS: Record<keyof Omit<ParsedBOMLine, never>, string[]> = {
  refDes:       ['refdes', 'ref', 'reference', 'references', 'designator', 'designators'],
  partNumber:   ['mpn', 'part_number', 'part number', 'partnumber', 'manufacturer part number', 'manufacturer_part_number', 'manufacturerpartnumber'],
  description:  ['description', 'desc', 'comment'],
  value:        ['value', 'val'],
  pkg:          ['footprint', 'package', 'pkg', 'case'],
  qty:          ['quantity', 'qty', 'count', 'quantity per pcb'],
  manufacturer: ['manufacturer', 'mfr', 'mfg', 'brand', 'supplier'],
};

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return /\b(ref|reference|designator|part|mpn|desc|comment|value|footprint|package|quantity|qty)\b/.test(joined);
}

/** Split a single CSV line respecting quoted fields. */
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(c => c.trim());
}

function detectDelimiter(headerLine: string): RegExp {
  const counts = {
    ',': (headerLine.match(/,/g) || []).length,
    ';': (headerLine.match(/;/g) || []).length,
    '\t': (headerLine.match(/\t/g) || []).length,
  };
  // splitCSVLine handles all three, so this is informational only.
  void counts;
  return /[,;\t]/;
}

/** Map header cells to field indices. */
function mapHeaders(headerCells: string[]): Partial<Record<keyof ParsedBOMLine, number>> {
  const map: Partial<Record<keyof ParsedBOMLine, number>> = {};
  headerCells.forEach((raw, idx) => {
    const h = raw.toLowerCase().trim();
    for (const field of Object.keys(HEADER_SYNONYMS) as (keyof ParsedBOMLine)[]) {
      if (map[field] !== undefined) continue;
      if (HEADER_SYNONYMS[field].includes(h)) { map[field] = idx; break; }
    }
  });
  return map;
}

function cleanPN(pn: string): string {
  return pn.replace(/\s+/g, '').trim();
}

/** Expand a comma/space separated refdes list into individual designators. */
function expandRefDes(refDes: string): string[] {
  return refDes
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function emitLine(
  refDesRaw: string,
  partNumber: string,
  description: string,
  value: string,
  pkg: string,
  qtyRaw: string,
  manufacturer: string,
  out: ParsedBOMLine[],
): void {
  const refs = expandRefDes(refDesRaw);
  const parsedQty = parseInt(qtyRaw.replace(/[^\d]/g, ''), 10);
  const pn = cleanPN(partNumber);
  const mfr = manufacturer.trim() || undefined;

  if (refs.length > 1) {
    // One line per refdes, qty 1 each
    for (const r of refs) {
      out.push({ refDes: r, partNumber: pn, description: description.trim(), value: value.trim(), pkg: pkg.trim(), qty: 1, manufacturer: mfr });
    }
  } else {
    const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
    out.push({ refDes: (refs[0] ?? refDesRaw).trim(), partNumber: pn, description: description.trim(), value: value.trim(), pkg: pkg.trim(), qty, manufacturer: mfr });
  }
}

// ─── CSV parser ─────────────────────────────────────────────────────────────
function parseCSV(content: string): ParsedBOMLine[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];

  detectDelimiter(lines[0]);
  const firstCells = splitCSVLine(lines[0]);
  const hasHeader = looksLikeHeader(firstCells);

  let headerMap: Partial<Record<keyof ParsedBOMLine, number>> = {};
  let dataStart = 0;
  if (hasHeader) {
    headerMap = mapHeaders(firstCells);
    dataStart = 1;
  } else {
    // Best-effort positional fallback: refdes, value, footprint, qty, mpn
    headerMap = { refDes: 0, value: 1, pkg: 2, qty: 3, partNumber: 4 };
  }

  const out: ParsedBOMLine[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    if (cells.every(c => c === '')) continue;
    const get = (field: keyof ParsedBOMLine): string => {
      const idx = headerMap[field];
      return idx !== undefined && idx < cells.length ? cells[idx] : '';
    };
    const refDes = get('refDes');
    const partNumber = get('partNumber');
    const description = get('description');
    const value = get('value');
    const pkg = get('pkg');
    const qty = get('qty');
    const manufacturer = get('manufacturer');
    // Skip empty rows that have no identifying info
    if (!refDes && !partNumber && !value && !description) continue;
    emitLine(refDes, partNumber, description, value, pkg, qty, manufacturer, out);
  }
  return out;
}

// ─── Altium XML parser ────────────────────────────────────────────────────
function getXmlAttr(rowXml: string, names: string[]): string {
  for (const name of names) {
    // attribute form: Name="..."
    const attr = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(rowXml);
    if (attr) return attr[1];
    // element form: <Name>...</Name>
    const elm = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(rowXml);
    if (elm) return elm[1].replace(/<[^>]+>/g, '').trim();
  }
  return '';
}

function parseAltiumXML(content: string): ParsedBOMLine[] {
  const out: ParsedBOMLine[] = [];
  const rowRegex = /<Row\b[\s\S]*?(?:\/>|<\/Row>)/gi;
  const rows = content.match(rowRegex);
  if (!rows) return [];
  for (const row of rows) {
    const refDes = getXmlAttr(row, ['Designator', 'Designators', 'RefDes', 'Reference']);
    const partNumber = getXmlAttr(row, ['ManufacturerPartNumber', 'ManufacturerPartNumber1', 'MPN', 'PartNumber']);
    const description = getXmlAttr(row, ['Comment', 'Description']);
    const value = getXmlAttr(row, ['Value']);
    const pkg = getXmlAttr(row, ['Footprint', 'Package', 'PCBLibRef']);
    const qty = getXmlAttr(row, ['Quantity', 'Qty']);
    const manufacturer = getXmlAttr(row, ['Manufacturer', 'Manufacturer1']);
    if (!refDes && !partNumber && !value && !description) continue;
    emitLine(refDes, partNumber, description, value, pkg, qty, manufacturer, out);
  }
  return out;
}

// ─── Entry point ──────────────────────────────────────────────────────────
export function parseBOMFile(content: string, filename: string): ParsedBOMLine[] {
  try {
    if (!content || !content.trim()) return [];
    const lower = (filename || '').toLowerCase();
    const trimmed = content.trimStart();
    const isXML = lower.endsWith('.xml') || trimmed.startsWith('<?xml') || /<Row\b/i.test(trimmed.slice(0, 2000));
    if (isXML) {
      const xmlResult = parseAltiumXML(content);
      if (xmlResult.length) return xmlResult;
      // fall through to CSV attempt if XML produced nothing
    }
    return parseCSV(content);
  } catch {
    return [];
  }
}
