/**
 * OCR marking → BOM line reconciliation.
 *
 * Stage 2 reads part numbers off the chips; Stage 3 writes the BOM. On the
 * 2026-09-29 radar run the two did not meet: OCR found 7 markings (TEF8105,
 * MAX20431A, TCAN1044, W25Q32 …) yet the BOM named only the S32R294 and
 * described the rest generically — "77/79GHz radar transceiver MMIC" at £4.00
 * instead of a TEF8105 at £9–22, a CAN transceiver priced as an "op-amp/LDO".
 *
 * Deterministic backstop: every marking the tool can name (it has a price range
 * for it) and that no BOM line mentions is attached to the one unnamed line whose
 * description has the same FUNCTION (radar RF, MCU, CAN/Ethernet, memory, power).
 * The line keeps its description, gains the part number, and is flagged as matched
 * by function so a reviewer sees it was not the model that made the link.
 * Markings with no plausible line are returned as `missing` for a sanity warning.
 */

export type BomLine = Record<string, unknown>;

interface FunctionClass {
  key: string;
  /** Matches the tool's label for the marking (from its price-hint table). */
  label: RegExp;
  /** Matches a BOM line description of that function. */
  line: RegExp;
  exclude?: RegExp;
}

// Order matters: radar RF before CAN/PHY ("transceiver" is in both labels).
const FUNCTION_CLASSES: FunctionClass[] = [
  { key: 'radar_rf', label: /radar (transceiver|frontend|front-end)|77\s*GHz|MMIC/i,
    line: /MMIC|radar (transceiver|front)|77\s*(\/\s*79)?\s*GHz|RF (transceiver|front)/i,
    exclude: /\bMCU\b|processor|microcontroller|\bSoC\b/i },
  { key: 'mcu', label: /\bMCU\b|processor|\bSoC\b|microcontroller/i,
    line: /\bMCU\b|processor|\bSoC\b|microcontroller/i },
  { key: 'can_phy', label: /\bCAN\b|\bLIN\b|Ethernet|\bPHY\b/i,
    line: /\bCAN\b|\bLIN\b|Ethernet|\bPHY\b|interface|transceiver/i,
    exclude: /radar|77\s*GHz|MMIC/i },
  { key: 'memory', label: /flash|memory|SDRAM|DRAM|eMMC|NAND|\bNOR\b/i,
    line: /flash|memory|EEPROM|\bNOR\b|NAND|SDRAM|DRAM|eMMC|\bMbit\b/i },
  { key: 'power', label: /PMIC|\bSBC\b|System Basis|regulator|\bLDO\b|power|buck/i,
    line: /PMIC|regulator|\bLDO\b|power|supervisor|\bSBC\b|buck|converter/i },
];

function classOf(label: string): FunctionClass | null {
  return FUNCTION_CLASSES.find(c => c.label.test(label)) ?? null;
}

/** Uppercase alphanumerics only — "TEF 8105 / A1" → "TEF8105A1". */
function squash(s: string): string { return s.toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/** The core of a marking worth matching on: its longest alphanumeric token. */
function coreToken(marking: string): string {
  const toks = marking.toUpperCase().split(/[^A-Z0-9-]+/).map(t => t.replace(/-/g, '')).filter(t => /[A-Z]/.test(t) && /[0-9]/.test(t));
  return toks.sort((a, b) => b.length - a.length)[0] ?? squash(marking);
}

function words(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter(w => !['the', 'and', 'with', 'for'].includes(w)));
}

function isIcLine(l: BomLine): boolean {
  const ct = String(l.componentType ?? '').toLowerCase();
  return ct.startsWith('ic') || /\bIC\b|MMIC|MCU|transceiver|PMIC|flash|regulator/i.test(String(l.description ?? ''));
}

export interface OcrReconcileResult {
  bom: BomLine[];
  attached: Array<{ marking: string; refDes: string; label: string }>;
  /** Nameable markings that no BOM line mentions and none could take. */
  missing: string[];
}

/**
 * @param labelOf the tool's label for a marking it can name (null = not nameable,
 *                e.g. a date code or a silkscreen number — those are ignored).
 * @param lineIsNamed true when a line already resolves to a named part (its own
 *                part number / description hits the price table) — it is not a candidate.
 */
export function reconcileOcrMarkings(
  bom: BomLine[],
  markings: string[],
  labelOf: (text: string) => string | null,
  lineIsNamed: (line: BomLine) => boolean,
): OcrReconcileResult {
  const out = bom.map(l => ({ ...l }));
  const attached: OcrReconcileResult['attached'] = [];
  const missing: string[] = [];
  const taken = new Set<number>();
  const seen = new Set<string>();

  for (const marking of markings) {
    const label = labelOf(marking);
    if (!label) continue;
    // The part token of the marking, without maker name and lot/date codes:
    // "TEF8105 TR7YC228 sKN2437" → "TEF8105", "TI 1044AV 4AB ARYS" → "1044AV".
    const partTok = marking.trim().split(/\s+/).find(t => /[0-9]/.test(t) && labelOf(t) === label) ?? marking.trim();
    const core = coreToken(partTok);
    if (core.length < 4 || seen.has(core)) continue;
    seen.add(core);
    // Already in the BOM (part number or description mentions it) — nothing to do.
    const stem = core.slice(0, Math.max(4, core.length - 2));
    // "FS32R294KCMJD" is already there when a line says "S32R294": same part family.
    if (out.some(l => {
      const text = `${l.partNumber ?? ''} ${l.description ?? ''}`;
      return squash(text).includes(stem) || labelOf(text) === label;
    })) continue;

    const cls = classOf(label);
    let best = -1; let bestScore = 0;
    if (cls) {
      out.forEach((l, i) => {
        if (taken.has(i) || !isIcLine(l) || lineIsNamed(l)) return;
        const d = String(l.description ?? '');
        if (!cls.line.test(d) || cls.exclude?.test(d)) return;
        // Prefer the line sharing most words with the tool's label for the part
        // ("PMIC" beats "LDO" for a MAX20431A), then lines the model itself said
        // it could not identify.
        const shared = [...words(label)].filter(w => words(d).has(w)).length;
        const score = 1 + shared + (/unidentified|unknown|likely|unmarked|generic/i.test(d) ? 1 : 0);
        if (score > bestScore) { best = i; bestScore = score; }
      });
    }
    if (best < 0) { missing.push(marking); continue; }
    taken.add(best);
    const l = out[best];
    l.partNumber = partTok;
    l.ocrExtracted = true;
    l.lineConf = Math.max(Number(l.lineConf) || 0, 0.95);
    l.ocrMatchedByFunction = true;
    l.priceNote = `Chip marking "${marking.trim()}" (${label}) matched to this line by function — confirm the RefDes`;
    attached.push({ marking: partTok, refDes: String(l.refDes ?? ''), label });
  }
  return { bom: out, attached, missing };
}

/**
 * `ocrExtracted` is the model's claim that it read a part number off the chip, and
 * it was trusted as such: it raised confidence to "identity confirmed" (a named
 * price range) and showed "OCR extracted ✓" on screen. The model set it on its own
 * word, and the second-look stage set it for any part number it returned (PCB review,
 * Oct 2026). The claim now stands only when the part number agrees with a marking
 * the OCR stage actually read; otherwise it is withdrawn (kept as `ocrClaimed`).
 */
export function verifyOcrClaims(bom: BomLine[], markings: string[]): { bom: BomLine[]; revoked: string[] } {
  const marks = markings.map(m => squash(m)).filter(m => m.length >= 4);
  const revoked: string[] = [];
  const out = bom.map(l => {
    if (l.ocrExtracted !== true) return l;
    const pn = squash(String(l.partNumber ?? ''));
    const core = coreToken(String(l.partNumber ?? ''));
    const agrees = pn.length >= 4 && marks.some(m => m.includes(core.length >= 4 ? core : pn) || (m.length >= 5 && pn.includes(m)));
    if (agrees) return l;
    revoked.push(String(l.refDes ?? l.partNumber ?? '?'));
    return { ...l, ocrExtracted: false, ocrClaimed: true, lineConf: Math.min(Number(l.lineConf) || 0, 0.8) };
  });
  return { bom: out, revoked };
}
