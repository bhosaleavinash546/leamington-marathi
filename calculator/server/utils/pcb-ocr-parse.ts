/**
 * Stage 2 (chip-marking OCR) reply → result. A dense board's reply can hit max_tokens mid-JSON: the parse then failed
 * and EVERY marking was lost ("OCR failed"). Complete strings in each array are kept instead, and the result says
 * it is partial (PCB 360 review, Oct 2026). The model's words are still only markings — nothing here is a price.
 */
export interface OcrReply { icMarkings: string[]; refDesGroups: string[]; connectors: string[]; boardText: string[]; extractionQuality: string }

const strs = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Complete JSON strings of `"key": [ … ` up to the closing bracket or the cut. */
function salvageArray(raw: string, key: string): string[] {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(raw);
  if (!m) return [];
  const out: string[] = [];
  const re = /\s*,?\s*"((?:[^"\\]|\\.)*)"/y;
  re.lastIndex = m.index + m[0].length;
  for (let hit = re.exec(raw); hit; hit = re.exec(raw)) {
    try { out.push(JSON.parse(`"${hit[1]}"`) as string); } catch { break; }
  }
  return out;
}

/** `json` is the extracted JSON text; `raw` the whole reply. Throws only when nothing at all can be read. */
export function parseOcrReply(json: string, raw: string, stopReason?: string | null): OcrReply {
  try {
    const p = JSON.parse(json) as Record<string, unknown>;
    return { icMarkings: strs(p.icMarkings), refDesGroups: strs(p.refDesGroups), connectors: strs(p.connectors),
      boardText: strs(p.boardText), extractionQuality: typeof p.extractionQuality === 'string' ? p.extractionQuality : 'low' };
  } catch (err) {
    const icMarkings = salvageArray(raw, 'icMarkings');
    if (icMarkings.length === 0) throw err;
    return { icMarkings, refDesGroups: salvageArray(raw, 'refDesGroups'), connectors: salvageArray(raw, 'connectors'),
      boardText: salvageArray(raw, 'boardText'), extractionQuality: stopReason === 'max_tokens' ? 'truncated' : 'partial' };
  }
}
