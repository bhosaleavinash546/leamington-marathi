// ─── Offline automotive component price catalogue ───────────────────────────
// Purpose: catalogue-ground BOM prices WITHOUT any external distributor API.
// Live grounding (Octopart/Nexar, RS) needs API keys + open network — unavailable
// in air-gapped / on-prem deployments, which is exactly where this tool is pitched.
// This curated table lets confirmed lines snap to real market prices offline, and
// gives a class-median cap so an unreadable high-value part can't balloon the BOM
// on a conservative AI guess.
//
// Prices are indicative GBP unit prices at a ~10k automotive (AEC-Q) break, from
// public distributor references (LCSC / DigiKey / Arrow, early 2026). They are a
// grounding ANCHOR, not a quote — a real Octopart/RS hit, when available, wins.

/** Normalise an MPN for matching: uppercase, drop packaging/grade/rev suffixes. */
export function normaliseMPN(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .replace(/\([^)]*\)/g, '')                 // strip "(est. …)" notes
    .replace(/[✓✔⚠★]/g, '')
    .replace(/\s+/g, '')
    .replace(/[,;].*$/, '')                     // first token only
    .trim();
}

// Exact MPN → GBP unit @ ~10k, AEC-Q grade. Keyed by normalised MPN.
const EXACT: Record<string, number> = {
  // MCUs / SoCs
  'SAK-TC275TP': 16.50, 'TC275': 16.50, 'SAK-TC234L': 11.00, 'TC234L': 11.00,
  'TC297': 24.00, 'TC224': 9.50, 'STM32H735IGK6': 6.20, 'STM32H730': 4.80,
  'AWR1843AOP': 27.00, 'AWR1843': 27.00, 'AWR1642': 18.00,
  // System-basis / CAN-LIN / transceivers
  'TJA1145': 2.80, 'TJA1044': 0.95, 'TJA1044GT': 0.95, 'TJA1462': 1.85,
  'SJA1124': 3.60, 'TLE9263': 3.80, 'TLE9261': 3.40, 'ATA6570': 1.40,
  'TLE9180': 3.00, 'DRV8305': 2.50, 'DRV8323RS': 2.40, 'MC33879': 3.20,
  // Power / PMIC / LDO
  'TLF35584': 5.20, 'TPS7B82': 0.90, 'TPS7A82': 1.10, 'TPS62150': 1.80,
  'TLV75833': 0.55, 'LP2951A': 1.20, 'LM74700': 1.00, 'FS8500': 3.20,
  // Sense / buffer / misc IC
  'INA240A2': 1.90, 'INA240': 1.90, 'PCA9517D': 0.70, 'S25FL256S': 2.20,
  'S25FL128S': 1.80, 'PCA9517': 0.70,
  // Passives / protection
  'PRTR5V0U2X': 0.22, 'PRTR5V0U4X': 0.28,
  // Timing
  'SG-8018': 1.60, 'TG-5032': 1.80, 'NX3225SA': 0.60,
};
// NB: connectors (FAKRA-Z, OBD-II DE9, MX150-class …) are deliberately NOT in the
// catalogue — they're form-factors, not orderable MPNs — so they stay flagged and
// get the connector class-median cap instead of a catalogue price.

// Family prefix → GBP unit. Used when the exact MPN misses but a recognisable
// series is present (e.g. "TJA1044GT/3" → TJA1044). Longest prefix wins.
const FAMILY: Array<[string, number]> = [
  ['STM32H7', 5.00], ['AWR184', 26.00], ['AWR164', 18.00], ['SAK-TC27', 16.00],
  ['SAK-TC23', 11.00], ['TC27', 16.00], ['TC23', 11.00],
  ['TJA114', 2.80], ['TJA104', 0.95], ['TLE926', 3.60], ['TLE918', 3.00],
  ['DRV83', 2.50], ['TLF355', 5.20], ['TPS7', 1.00], ['TPS62', 1.60],
  ['TLV758', 0.55], ['INA24', 1.90], ['S25FL', 2.00], ['PRTR5V0', 0.25],
  ['SG-80', 1.60], ['TG-50', 1.80],
];

/**
 * Look up an offline catalogue price for an MPN. Returns null if the string
 * is not a plausible orderable part (a description like "OBD-II DE9" or a family
 * like "MX150-class" returns null → the line stays flagged for verification).
 */
export function cataloguePrice(mpn: string): number | null {
  if (!mpn) return null;
  // A guessed/hallucinated or family label ("(est. …)", "MX150-class", "OBD-II DE9")
  // is not an orderable MPN → no catalogue price (line stays flagged for review).
  if (/\b(CLASS|EST|UNKNOWN|GENERIC)\b/i.test(mpn)) return null;
  // Build candidate tokens: the whole string AND each whitespace/comma token, so
  // "NXP TJA1145" and "TJA1044GT/3" both resolve to the manufacturer part.
  const cands = new Set<string>([normaliseMPN(mpn)]);
  for (const tok of mpn.toUpperCase().split(/[\s,;/]+/)) {
    const t = normaliseMPN(tok);
    if (t.length >= 4) cands.add(t);
  }
  for (const c of cands) if (c && EXACT[c] !== undefined) return EXACT[c];
  let best: number | null = null; let bestLen = 0;
  for (const c of cands) {
    for (const [pre, price] of FAMILY) {
      if (c.startsWith(pre) && pre.length > bestLen) { best = price; bestLen = pre.length; }
    }
  }
  return best;
}

// Category median caps (GBP) — the most an UNCONFIRMED part of this class may
// contribute per unit. Stops a conservative AI guess (e.g. "automotive MCU BGA")
// from entering the BOM at 3–4× market when the exact part can't be read.
const CLASS_MEDIAN: Record<string, number> = {
  ic_bga: 18.00, ic_tqfp: 6.00, ic_qfp: 6.00, ic_qfn: 4.00, ic_soic: 3.50,
  ic_sot: 1.20, ic: 4.00,
  connector_smt: 6.00, through_hole: 3.50, connector: 6.00,
  crystal_osc: 2.00, fuse_tvs: 0.60,
  passive_0402: 0.03, passive_0805: 0.08, passive_1206: 0.12, passive: 0.06,
};

/**
 * Cap the unit price of an UNCONFIRMED part to its class median. Returns the
 * (possibly reduced) unit price; never raises a price. `componentType` is the
 * BOM line's category; unknown categories fall back to a generic IC cap.
 */
export function classMedianCap(componentType: string, unitPriceGBP: number): number {
  const key = (componentType || '').toLowerCase();
  let cap = CLASS_MEDIAN[key];
  if (cap === undefined) {
    // fuzzy: pick the closest category family
    if (key.includes('bga')) cap = CLASS_MEDIAN.ic_bga;
    else if (key.includes('qfn')) cap = CLASS_MEDIAN.ic_qfn;
    else if (key.includes('qfp') || key.includes('tqfp')) cap = CLASS_MEDIAN.ic_tqfp;
    else if (key.includes('soic') || key.includes('sot')) cap = CLASS_MEDIAN.ic_soic;
    else if (key.includes('connector') || key.includes('header')) cap = CLASS_MEDIAN.connector_smt;
    else if (key.includes('crystal') || key.includes('osc') || key.includes('tcxo')) cap = CLASS_MEDIAN.crystal_osc;
    else if (key.includes('tvs') || key.includes('fuse') || key.includes('diode')) cap = CLASS_MEDIAN.fuse_tvs;
    else if (key.includes('passive') || key.includes('0402')) cap = CLASS_MEDIAN.passive_0402;
    else if (key.includes('0805') || key.includes('1206')) cap = CLASS_MEDIAN.passive_0805;
    else cap = CLASS_MEDIAN.ic;
  }
  return Math.min(unitPriceGBP, cap);
}
