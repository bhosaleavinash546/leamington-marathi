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

/** A `"key": { … }` object that closes before the cut, parsed; null when cut or malformed. */
function completeObject(raw: string, key: string): Record<string, unknown> | null {
  const m = new RegExp(`"${key}"\\s*:\\s*\\{`).exec(raw);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { const o = JSON.parse(raw.slice(start, i + 1)); return o && typeof o === 'object' ? o as Record<string, unknown> : null; }
      catch { return null; }
    }
  }
  return null;
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
  // The board spec too, when it was written out in full before the cut — it was dropped and the
  // normaliser's 100 × 80 mm, 4-layer defaults priced the fab silently (360 review, Oct 2026).
  const boardSpec = completeObject(raw, 'boardSpec');

  return {
    partName,
    bom,
    ...(boardSpec ? { boardSpec } : { _boardSpecLost: true }),
    confidenceLevel: 'Low',
    // A partial list prices a partial board: never cached, and said on screen (runStage4).
    _salvaged: true,
    analysisLimitations: [
      `The AI response was truncated before the whole board could be listed — showing the ${bom.length} component${bom.length === 1 ? '' : 's'} recovered before the cutoff. For the complete BOM, attach a BOM file or run again; close-ups of dense areas help more than whole-board photos.`,
    ],
  };
}
