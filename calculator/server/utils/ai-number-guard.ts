/**
 * The last gate between a CAD specialist reply and the screen, the form and the reports.
 *
 * AI never sets a price, and a number the model wrote is not a figure the tool computed. After the rules have
 * written every value they derive over the reply (`applyRuleDecisions`) and cleared the fields a blocked rule owns
 * (`suppressAIForUndecided`), the reply still carried model numbers no rule touched (AI-number leak audit, Oct 2026):
 *
 *  - `costInputSuggestions.costRange` — the model's own £ low / mid / high, shown on screen as "Optimistic / Most
 *    Likely / Conservative", added to the kernel tooling estimate as "AI ballpark/part", printed in the CAD
 *    analysis PDF §7. A model price.
 *  - the casting / forging / sheet-metal / moulding sub-objects the prompt asked for on EVERY part ("so the front
 *    end can switch commodity"): a machined part's report printed the model's die cost, mould cost and cavities as
 *    "Process-Specific Parameters".
 *  - cycle time, set-up time and an operation list on every commodity whose rules do not plan operations (moulding,
 *    sheet metal, extrusion, rubber …): printed as "Cycle Time", "Setup Time", "Operations Detail".
 *  - the model's echo of the geometry (bounding box, volume, area) where the kernel had measured it: the screen
 *    reads the bounding box for an extrusion length and a packaging envelope.
 *  - a drawing-read tensile strength written into the coating form unbounded.
 *  - £ amounts in the model's prose (explanation, DFM impact, risks).
 *
 * The rule: on the AI path the analysis keeps a model NUMBER only where a rule wrote it, where it is a bounded read
 * that a deterministic check consumes (listed in `BOUNDED_READS` with the check that bounds it), or where it is the
 * model's confidence in a classification. Everything else is removed and listed, so the payload says what the model
 * said and that it was not used. The deterministic path never meets this function — it has no model numbers.
 */
import type { OCCTGeometry } from '../../src/engine/ai-analysis.js';

/** One model number removed from (or replaced in) the analysis, with the reason. */
export interface AIUnruledNumber {
  field: string;
  aiValue: unknown;
  /** What replaced it: a measured value, or nothing (`undefined`). */
  replacedWith?: number;
  reason: string;
}

/**
 * Model numbers kept although no rule writes them, each with the deterministic check that bounds it before it can
 * reach a figure. A path here is matched exactly or as a prefix (`fieldConfidences` keeps every key under it).
 */
export const BOUNDED_READS: Record<string, string> = {
  netWeightKg: 'snapped to the measured volume × density beyond ±5 % (normalizeCADAnalysis)',
  fieldConfidences: "the model's confidence per field — a classification score, never a cost input",
  stage1Selection: "the classifier's confidence — routing evidence, never a cost input",
  'surfaceTreatment.thicknessUm': 'used only inside the route\'s published deposit range (boundDrawingCoating)',
  'surfaceTreatment.maskedFeatureCount': 'used only up to the measured holes + bosses (boundDrawingCoating)',
  'surfaceTreatment.saltSprayHours': 'quoted in a warning as the drawing\'s requirement; never costed',
  'gear.drawingTeeth': 'cross-checked against the measured tooth count (gear_teeth_mismatch); never costed',
  'gear.helixAngleDeg': 'a drawing read held as a blocking confirm with the read as the leaning (withAIGearAnswers)',
  'gear.qualityClass': 'a drawing read held as a blocking confirm, 1–11 only (withAIGearAnswers)',
  'gear.effectiveCaseDepthMm': 'a drawing read held as a blocking confirm, 0–5 mm only (withAIGearAnswers)',
};

const isUnder = (path: string, prefix: string): boolean =>
  path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);

/** Every numeric leaf under `obj`, by dotted path (arrays as `[i]`). */
function numericLeaves(obj: unknown, path: string, out: Array<{ path: string; value: number }>): void {
  if (typeof obj === 'number') { out.push({ path, value: obj }); return; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => numericLeaves(v, `${path}[${i}]`, out)); return; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) numericLeaves(v, path ? `${path}.${k}` : k, out);
  }
}

/** Delete the leaf at a dotted path ("a.b[2].c"); the containing array element itself is kept. */
function deletePath(root: Record<string, unknown>, path: string): void {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur || typeof cur !== 'object') return;
    cur = (cur as Record<string, unknown>)[parts[i]];
  }
  if (cur && typeof cur === 'object') delete (cur as Record<string, unknown>)[parts[parts.length - 1]];
}

/** A currency amount in prose: £12.50, $3, €1,200, GBP 4.20, 12.5 GBP. */
const MONEY_RE = /(?:[£$€₹¥]\s?|\b(?:GBP|USD|EUR|INR|CNY|RMB)\s?)\d[\d,]*(?:\.\d+)?\s*(?:k|m|bn)?\b|\b\d[\d,]*(?:\.\d+)?\s?(?:GBP|USD|EUR|INR|CNY|RMB)\b|\b\d[\d,]*(?:\.\d+)?\s?p\/(?:part|piece|pc|unit)\b/gi;

export const MODEL_MONEY_PLACEHOLDER = '[model £ figure removed]';

/** Remove currency amounts from a model's prose; returns the cleaned text and what was removed. */
export function stripModelMoney(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const out = text.replace(MONEY_RE, m => { removed.push(m.trim()); return MODEL_MONEY_PLACEHOLDER; });
  return { text: out, removed };
}

export interface UnruledOptions {
  /** `costInputSuggestions` paths a rule wrote (`applyRuleDecisions(...).overridden[].field`). */
  ruleWritten: string[];
  /** The measured geometry (the AI path only runs on a measured part — a failed measurement is a 422). */
  geo: OCCTGeometry;
}

/**
 * Remove every model number on the CAD analysis that no rule wrote and no check bounds. Mutates `analysis` in
 * place (like the other normalisers in the pipeline) and returns what it removed or replaced; the route puts the
 * list on the payload (`aiUnruled`) and one line in `analysisLimitations`, so the screen and the PDF say so.
 */
export function dropUnruledAINumbers(analysis: Record<string, unknown>, opts: UnruledOptions): AIUnruledNumber[] {
  const out: AIUnruledNumber[] = [];
  const geo = opts.geo;
  const ok = geo?.status === 'success';

  // 1. The model's echo of the geometry → the measurement.
  const g = (analysis.geometry && typeof analysis.geometry === 'object' ? analysis.geometry : null) as Record<string, unknown> | null;
  if (g && ok) {
    const snap = (field: string, holder: Record<string, unknown>, key: string, measured: number | undefined) => {
      if (typeof measured !== 'number' || !Number.isFinite(measured)) return;
      const was = holder[key];
      if (typeof was === 'number' && Math.abs(was - measured) <= 1e-9 * Math.max(1, Math.abs(measured))) return;
      holder[key] = measured;
      out.push({ field, aiValue: was, replacedWith: measured, reason: 'the model\'s echo of the geometry — replaced by the measured value' });
    };
    const bb = (g.boundingBoxMm && typeof g.boundingBoxMm === 'object' ? g.boundingBoxMm : (g.boundingBoxMm = {})) as Record<string, unknown>;
    snap('geometry.boundingBoxMm.x', bb, 'x', geo.boundingBox?.xMm);
    snap('geometry.boundingBoxMm.y', bb, 'y', geo.boundingBox?.yMm);
    snap('geometry.boundingBoxMm.z', bb, 'z', geo.boundingBox?.zMm);
    snap('geometry.estimatedVolumeCm3', g, 'estimatedVolumeCm3', geo.volume?.cm3);
    snap('geometry.estimatedSurfaceAreaCm2', g, 'estimatedSurfaceAreaCm2', geo.surfaceArea?.cm2);
  }

  // 2. The manufacturability score: the kernel's where it has one (the deterministic path's source); else the
  //    model's opinion, kept and SAID to be the model's.
  if (ok && typeof geo.manufacturabilityScore === 'number') {
    const was = analysis.manufacturabilityScore;
    if (was !== geo.manufacturabilityScore) {
      analysis.manufacturabilityScore = geo.manufacturabilityScore;
      out.push({ field: 'manufacturabilityScore', aiValue: was, replacedWith: geo.manufacturabilityScore,
        reason: "the model's score — replaced by the geometry kernel's" });
    }
  } else if (typeof analysis.manufacturabilityScore === 'number') {
    out.push({ field: 'manufacturabilityScore', aiValue: analysis.manufacturabilityScore,
      reason: "the model's opinion — kept, no kernel score for this geometry (a mesh); not used in any cost" });
  }

  // 2b. Detected features: the kernel's feature table where it has one (counts are measured, as on the deterministic
  //     path); a feature kind the kernel does not table (a rib, an undercut) stays, marked as the model's read.
  const rows = ok ? (geo.featureTable ?? []) : [];
  if (!rows.length && Array.isArray(analysis.detectedFeatures)) {
    analysis.detectedFeatures = (analysis.detectedFeatures as Array<{ description?: string }>)
      .map(f => ({ ...f, description: `AI read, not measured — ${f.description ?? ''}`.trim() }));
  } else if (rows.length && Array.isArray(analysis.detectedFeatures)) {
    const measuredKinds = new Set(rows.map(r => r.kind.toLowerCase()));
    const model = analysis.detectedFeatures as Array<{ type?: string; count?: number; description?: string; significance?: string }>;
    const replaced = model.filter(f => measuredKinds.has(String(f.type ?? '').toLowerCase()));
    const kept = model.filter(f => !measuredKinds.has(String(f.type ?? '').toLowerCase()))
      .map(f => ({ ...f, description: `AI read, not measured — ${f.description ?? ''}`.trim() }));
    analysis.detectedFeatures = [
      ...rows.map(r => ({
        type: r.kind,
        description: `${r.count}× Ø${r.diaMm.toFixed(1)} × ${r.depthMm.toFixed(0)} mm`
          + (r.through === true ? ' through' : r.through === false ? ' blind' : '') + ' (measured)',
        count: r.count,
        significance: r.count >= 8 ? 'High' : r.count >= 3 ? 'Medium' : 'Low',
      })),
      ...kept,
    ];
    if (replaced.length) {
      out.push({ field: 'detectedFeatures', aiValue: replaced.map(f => `${f.type} ×${f.count}`).join(', '),
        reason: "the model's feature counts — replaced by the kernel's measured feature table" });
    }
  }

  // 3. Cycle times on the process recommendations: the model's, printed in the report's process table.
  if (Array.isArray(analysis.processRecommendations)) {
    (analysis.processRecommendations as Array<Record<string, unknown>>).forEach((p, i) => {
      if (p && typeof p.estimatedCycleTimeHr === 'number') {
        out.push({ field: `processRecommendations[${i}].estimatedCycleTimeHr`, aiValue: p.estimatedCycleTimeHr,
          reason: "the model's cycle time — the costed cycle is the rules' / the module's" });
        delete p.estimatedCycleTimeHr;
      }
    });
  }

  // 4. costInputSuggestions: a model number survives only where a rule wrote it or a check bounds it.
  const ci = (analysis.costInputSuggestions && typeof analysis.costInputSuggestions === 'object'
    ? analysis.costInputSuggestions : null) as Record<string, unknown> | null;
  if (ci) {
    if (ci.costRange !== undefined) {
      out.push({ field: 'costInputSuggestions.costRange', aiValue: ci.costRange,
        reason: "the model's price range — AI never sets a price; the engine's band is on the costing" });
      delete ci.costRange;
    }
    // A drawing-read tensile strength used to go straight into the coating form; it is the engineer's to enter.
    const st = ci.surfaceTreatment as Record<string, unknown> | undefined;
    if (st && typeof st.tensileStrengthMPa === 'number') {
      out.push({ field: 'costInputSuggestions.surfaceTreatment.tensileStrengthMPa', aiValue: st.tensileStrengthMPa,
        reason: `a drawing read of the substrate strength (${st.tensileStrengthMPa} MPa) — not applied; enter it in `
          + 'Tensile Strength to run the de-embrittlement check' });
      delete st.tensileStrengthMPa;
    }

    const kept = (path: string): boolean =>
      opts.ruleWritten.some(w => isUnder(path, w)) || Object.keys(BOUNDED_READS).some(k => isUnder(path, k));
    const leaves: Array<{ path: string; value: number }> = [];
    numericLeaves(ci, '', leaves);
    const arraysCleared = new Set<string>();
    for (const leaf of leaves) {
      if (kept(leaf.path)) continue;
      // An array of objects (the operation list) is dropped whole: half an operation is not one.
      const arr = /^([^[]+)\[\d+\]/.exec(leaf.path)?.[1];
      if (arr && !opts.ruleWritten.some(w => isUnder(arr, w))) {
        if (!arraysCleared.has(arr)) {
          arraysCleared.add(arr);
          const holderPath = arr.split('.');
          let holder: Record<string, unknown> = ci;
          for (const p of holderPath.slice(0, -1)) holder = (holder[p] ?? {}) as Record<string, unknown>;
          const last = holderPath[holderPath.length - 1];
          out.push({ field: `costInputSuggestions.${arr}`, aiValue: holder[last],
            reason: 'the model\'s list — no rule plans it, so none of its numbers is costed' });
          holder[last] = [];
        }
        continue;
      }
      out.push({ field: `costInputSuggestions.${leaf.path}`, aiValue: leaf.value,
        reason: 'a model number no rule derives and no check bounds — not used' });
      deletePath(ci, leaf.path);
    }
  }

  // 5. Money in the model's prose. Words stay (they are labelled the model's); a £ amount is a price.
  const prose = (holder: Record<string, unknown> | undefined, key: string, field: string) => {
    if (!holder || typeof holder[key] !== 'string') return;
    const { text, removed } = stripModelMoney(holder[key] as string);
    if (removed.length) {
      holder[key] = text;
      out.push({ field, aiValue: removed.join(', '), reason: 'a £ amount in the model\'s text — AI never sets a price' });
    }
  };
  prose(analysis, 'aiExplanation', 'aiExplanation');
  for (const [listKey, keys] of [
    ['manufacturabilityRisks', ['description', 'suggestion']],
    ['processRecommendations', ['reasoning']],
  ] as const) {
    const list = analysis[listKey];
    if (Array.isArray(list)) list.forEach((r, i) => keys.forEach(k => prose(r as Record<string, unknown>, k, `${listKey}[${i}].${k}`)));
  }
  const dfm = ci?.dfmIssues;
  if (Array.isArray(dfm)) {
    dfm.forEach((d, i) => ['description', 'impact', 'fix'].forEach(k =>
      prose(d as Record<string, unknown>, k, `costInputSuggestions.dfmIssues[${i}].${k}`)));
  }
  return out;
}

/** One line for `analysisLimitations` (screen and CAD analysis PDF §9) naming what was dropped. */
export function unruledLimitation(dropped: AIUnruledNumber[]): string | null {
  const removed = dropped.filter(d => d.replacedWith === undefined && !/kept/.test(d.reason));
  const replaced = dropped.filter(d => d.replacedWith !== undefined);
  if (!removed.length && !replaced.length) return null;
  const parts: string[] = [];
  if (removed.length) {
    parts.push(`${removed.length} model figure(s) no rule derives were not used (${removed.slice(0, 6).map(d => d.field.replace(/^costInputSuggestions\./, '')).join(', ')}`
      + `${removed.length > 6 ? ', …' : ''})`);
  }
  if (replaced.length) parts.push(`${replaced.length} replaced by the measurement`);
  const tensile = dropped.find(d => /tensileStrengthMPa$/.test(d.field));
  return `AI numbers: ${parts.join('; ')}. AI never sets a price — the costing uses the rules and the measured geometry.`
    + (tensile ? ` The drawing states ${String(tensile.aiValue)} MPa substrate strength (an AI read) — enter it in Tensile Strength to run the de-embrittlement check.` : '');
}
