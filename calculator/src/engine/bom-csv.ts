import type { ComponentType } from './modules/pcba.js';

export interface BOMRow {
  refDes: string;
  componentType: ComponentType;
  description: string;
  qty: number;
  unitPriceGBP: number;
  moq: number;
}

export const VALID_COMPONENT_TYPES: readonly ComponentType[] = [
  'passive_0402', 'passive_0603', 'passive_0805',
  'ic_soic', 'ic_qfn', 'ic_bga', 'ic_tqfp',
  'connector_smt', 'through_hole', 'manual_solder',
] as const;

export function parseBOMCSV(csvText: string): { rows: BOMRow[]; skipped: number } {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  const startIdx = lines[0]?.toLowerCase().includes('refdes') ? 1 : 0;
  const rows: BOMRow[] = [];
  let skipped = 0;

  for (const line of lines.slice(startIdx)) {
    const parts = line.split(',');
    if (parts.length < 6) { skipped++; continue; }

    const rawType = parts[1].trim();
    const componentType: ComponentType = (VALID_COMPONENT_TYPES as readonly string[]).includes(rawType)
      ? (rawType as ComponentType)
      : 'passive_0402';

    rows.push({
      refDes: parts[0].trim(),
      componentType,
      description: parts[2].trim(),
      qty: parseInt(parts[3]) || 1,
      unitPriceGBP: parseFloat(parts[4]) || 0,
      moq: parseInt(parts[5]) || 1,
    });
  }

  return { rows, skipped };
}
