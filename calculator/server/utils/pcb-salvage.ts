// Truncation-tolerant BOM recovery for the PCB Image→BOM pipeline.
//
// A large board (e.g. an automotive ECU with hundreds of components, priced at
// automotive grade) can make Stage 3 emit a BOM that exceeds the model's output
// token budget. The JSON is then cut off mid-array, JSON.parse throws, and the
// analysis previously surfaced as an EMPTY BOM ("even after a retry"). This
// module scans the raw (possibly truncated) response text for the `bom` array
// and collects every COMPLETE `{...}` line object before the cutoff, so a
// mostly-there response still yields a usable BOM instead of nothing.

/** Extract every complete `{...}` object from the `"bom": [ … ` array in a raw
 *  (possibly truncated) Stage-3 response. Returns the parsed line objects, or
 *  null if none could be recovered. String-based on purpose — it does NOT
 *  require the surrounding JSON to be valid. */
export function salvageBomFromRaw(raw: string): Array<Record<string, unknown>> | null {
  if (!raw) return null;
  const keyIdx = raw.search(/"bom"\s*:\s*\[/);
  if (keyIdx === -1) return null;
  const arrStart = raw.indexOf('[', keyIdx);
  if (arrStart === -1) return null;

  const lines: Array<Record<string, unknown>> = [];
  const n = raw.length;
  let i = arrStart + 1;

  while (i < n) {
    // Skip separators / whitespace between line objects.
    while (i < n && (raw[i] === ',' || raw[i] === ' ' || raw[i] === '\n' || raw[i] === '\r' || raw[i] === '\t')) i++;
    if (i >= n) break;
    if (raw[i] === ']') break;   // reached the (present) end of the array
    if (raw[i] !== '{') break;   // not a line object — stop scanning

    // Walk one brace-balanced object, respecting strings and escapes.
    const objStart = i;
    let depth = 0, inStr = false, esc = false, complete = false;
    for (; i < n; i++) {
      const c = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') {
        inStr = true;
      } else if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) { i++; complete = true; break; }
      }
    }
    if (!complete) break;        // object was cut off by truncation — stop here

    try {
      lines.push(JSON.parse(raw.slice(objStart, i)) as Record<string, unknown>);
    } catch {
      // A single malformed object shouldn't sink the rest — skip it and continue.
    }
  }

  return lines.length > 0 ? lines : null;
}

/** Build a minimal, renderable analysis object from a truncated/malformed raw
 *  Stage-3 response by salvaging its BOM lines. Returns null when nothing
 *  usable can be recovered (caller then falls back to repair/retry). The
 *  normalizer fills every other field; the analysisLimitations note tells the
 *  user the list is partial and how to get the full one. */
export function salvageAnalysisFromRaw(raw: string): Record<string, unknown> | null {
  const bom = salvageBomFromRaw(raw);
  if (!bom) return null;

  const pn = raw.match(/"partName"\s*:\s*"([^"]{1,120})"/);
  const partName = pn ? pn[1] : 'PCB Assembly (partial — response truncated)';

  return {
    partName,
    bom,
    confidenceLevel: 'Low',
    analysisLimitations: [
      `The AI response was truncated before the whole board could be listed — showing the ${bom.length} component${bom.length === 1 ? '' : 's'} recovered before the cutoff. For the complete BOM, attach a BOM file, reduce to 1–2 photos, or turn off Deep analysis.`,
    ],
  };
}
