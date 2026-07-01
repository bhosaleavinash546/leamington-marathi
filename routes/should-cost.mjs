// ─────────────────────────────────────────────────────────────────────────────
// Should-cost routes: catalogue, deterministic estimate, and the proprietary
// quote corpus + learned calibration. Extracted from server.mjs (de-monolith).
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { computeShouldCost, simulateShouldCost, volumeSensitivity } from '../costing-engine.mjs';
import { resolveMaterial, resolveProcess } from '../material-process-resolve.mjs';
import { getFxRates, FX_FALLBACK, FX_SYMBOLS, FX_CURRENCIES } from '../fx-rates.mjs';
import { fitCalibration } from '../calibration.mjs';
import { getActiveLibrary, getActiveMeta } from '../active-library.mjs';

export function registerShouldCostRoutes(app, { db, requireAuth, rateLimit, makeAnthropic }) {
// ─── SHOULD-COST ──────────────────────────────────────────────────────────────

// Catalogue endpoint so the UI populates dropdowns from the engine (single source of truth)
app.get('/api/should-cost/catalogue', (_req, res) => {
  const lib = getActiveLibrary();   // built-in defaults merged with any admin custom library
  res.json({
    materials: Object.keys(lib.MATERIALS),
    processes: Object.keys(lib.PROCESSES),
    regions: Object.keys(lib.REGIONS),
    // compatibility map: process -> allowed material families, and material -> family
    materialFamilies: Object.fromEntries(Object.entries(lib.MATERIALS).map(([k, v]) => [k, v.family])),
    processFamilies: Object.fromEntries(Object.entries(lib.PROCESSES).map(([k, v]) => [k, v.families])),
    library: getActiveMeta(),
  });
});

// Per-user learned calibration, fitted from their proprietary quote corpus and
// cached in-process. Invalidated when the user adds a quote.
const calCache = new Map();
function getUserCalibration(userId) {
  if (calCache.has(userId)) return calCache.get(userId);
  const rows = db.prepare('SELECT process, modelledEur, actualPriceEur FROM cost_quotes WHERE userId = ?').all(userId);
  const cal = fitCalibration(rows.map(r => ({ process: r.process, modelled: r.modelledEur, actual: r.actualPriceEur })));
  calCache.set(userId, cal);
  return cal;
}

// Add a real supplier quote to the user's corpus; the engine learns from it.
app.post('/api/should-cost/quotes', requireAuth, rateLimit(120, 60 * 60 * 1000), async (req, res) => {
  const { partName, material, process, weightKg, annualVolume, region, actualPrice } = req.body;
  if (!material || !process || !weightKg || !annualVolume || !actualPrice) {
    return res.status(400).json({ error: 'Missing required fields: material, process, weightKg, annualVolume, actualPrice.' });
  }
  const currency = String(req.body.currency || 'EUR').toUpperCase();
  if (!FX_CURRENCIES.includes(currency)) return res.status(400).json({ error: `Unsupported currency "${currency}".` });
  const lib = getActiveLibrary();
  const matRes = resolveMaterial(material, lib.MATERIALS);
  const procRes = resolveProcess(process, lib.PROCESSES);
  if (!matRes || !procRes) return res.status(400).json({ error: 'Material or process not recognised.' });

  let modelledEur;
  try {
    modelledEur = computeShouldCost({ material: matRes.key, process: procRes.key, weightKg: Number(weightKg), annualVolume: Number(annualVolume), region: region || 'Germany' }, {}, null, lib).totalShouldCost;
  } catch (e) { return res.status(400).json({ error: e.message || 'Invalid parameters.' }); }

  // Convert the user's quoted price to EUR (rates are EUR-based: units per 1 EUR).
  const fx = currency === 'EUR' ? { rates: FX_FALLBACK } : await getFxRates();
  const rate = fx.rates[currency] ?? 1;
  const actualPriceEur = Number(actualPrice) / rate;
  if (!(actualPriceEur > 0)) return res.status(400).json({ error: 'actualPrice must be > 0.' });

  db.prepare(`INSERT INTO cost_quotes (id, userId, partName, material, process, weightKg, annualVolume, region, actualPriceEur, modelledEur, createdAt)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    crypto.randomUUID(), req.user.id, String(partName || '').slice(0, 200), matRes.key, procRes.key,
    Number(weightKg), Number(annualVolume), region || 'Germany', actualPriceEur, modelledEur, new Date().toISOString());
  calCache.delete(req.user.id);   // refit on next estimate

  const cal = getUserCalibration(req.user.id);
  res.json({ ok: true, quotes: cal.n, calibration: { global: cal.global, process: cal.process } });
});

// List the user's quotes + current learned calibration.
app.get('/api/should-cost/quotes', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, partName, material, process, weightKg, annualVolume, region, actualPriceEur, modelledEur, createdAt FROM cost_quotes WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id);
  const cal = getUserCalibration(req.user.id);
  res.json({ quotes: rows, count: rows.length, calibration: { global: cal.global, process: cal.process, n: cal.n } });
});

app.post('/api/should-cost', requireAuth, rateLimit(60, 60 * 60 * 1000), async (req, res) => {
  const { partName, material, process, weightKg, annualVolume, quotedCost, region, apiKey } = req.body;
  if (!partName || !material || !process || !weightKg || !annualVolume) {
    return res.status(400).json({ error: 'Missing required fields: partName, material, process, weightKg, annualVolume.' });
  }
  // Currency must be one we can actually convert — otherwise we'd emit raw EUR
  // numbers under a foreign label (rate would silently fall back to 1).
  const currency = String(req.body.currency || 'EUR').toUpperCase();
  if (!FX_CURRENCIES.includes(currency)) {
    return res.status(400).json({ error: `Unsupported currency "${currency}". Supported: ${FX_CURRENCIES.join(', ')}.` });
  }

  // Resolve free-text material/process against the ACTIVE library (built-in
  // defaults merged with the admin's custom rates). Exact dropdown keys pass
  // straight through; free text is fuzzy-matched — no client matcher to drift.
  const lib = getActiveLibrary();
  const matRes = resolveMaterial(material, lib.MATERIALS);
  const procRes = resolveProcess(process, lib.PROCESSES);
  if (!matRes || !procRes) {
    const missing = [];
    if (!matRes) missing.push(`a material the cost library recognises — “${material}” isn’t in it (try "Aluminium 6061", "Cast iron", "DP780 steel")`);
    if (!procRes) missing.push(`a process the cost library recognises — “${process}” isn’t in it (try "HPDC", "CNC machining", "Sand casting", "Forging")`);
    return res.status(400).json({ error: `Needs ${missing.join(' and ')}.` });
  }

  // ── 1. Deterministic bottom-up cost (NO LLM — real rate × time / mass × price) ─
  // Uses the active rate library and the user's learned calibration (from quotes).
  const userCal = getUserCalibration(req.user.id);
  let calc, sim, volumeCurve;
  try {
    const engineInput = { material: matRes.key, process: procRes.key, weightKg: Number(weightKg), annualVolume: Number(annualVolume), region: region || 'Germany' };
    calc = computeShouldCost(engineInput, {}, userCal, lib);
    sim  = simulateShouldCost(engineInput, 2000, 12345, userCal, lib);
    volumeCurve = volumeSensitivity(engineInput, undefined, userCal, lib);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Invalid costing parameters.' });
  }

  const b = calc.breakdown;

  // ── FX: the deterministic engine is EUR-denominated. Convert every monetary
  //    figure to the requested currency and label it with the proper symbol so
  //    the UI never shows a EUR value under a GBP/USD/CNY heading. ────────────
  // EUR is the base — no conversion and no network dependency needed for it.
  const fx = currency === 'EUR' ? { rates: FX_FALLBACK, live: false, date: null, stale: false, source: 'base' } : await getFxRates();
  const rate = fx.rates[currency] ?? 1;
  const sym  = FX_SYMBOLS[currency] || `${currency} `;
  const cv   = (n) => Number(n) * rate;                       // EUR → target currency
  const fmt  = (n) => `${sym}${cv(n).toFixed(2)}`;            // EUR value → labelled string
  const total = calc.totalShouldCost;
  const processCost = b.machine.value + b.labour.value + b.setup.value + b.tooling.value;

  // Converted copies of the raw figures the frontend renders directly, so those
  // numbers stay consistent with the labelled strings above.
  const breakdownCv = {};
  for (const [k, v] of Object.entries(b)) breakdownCv[k] = { ...v, value: Number(cv(v.value).toFixed(4)) };
  const d = calc.drivers;
  const driversCv = {
    ...d,
    pricePerKg:   Number(cv(d.pricePerKg).toFixed(2)),
    machineRate:  Number(cv(d.machineRate).toFixed(2)),
    labourRate:   Number(cv(d.labourRate).toFixed(2)),
    toolingTotal: Number(cv(d.toolingTotal).toFixed(0)),
  };

  // Gap vs supplier quote — the quote is entered by the user already in the
  // selected currency, so compare it against the converted should-cost.
  let gapVsQuote;
  if (quotedCost && Number(quotedCost) > 0) {
    const q = Number(quotedCost);
    const totalCv = cv(total);
    const delta = q - totalCv;
    const pct = totalCv > 0 ? (delta / totalCv) * 100 : 0;
    gapVsQuote = `${delta >= 0 ? '+' : ''}${sym}${delta.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs should-cost)`;
  }

  const result = {
    engine: 'deterministic',
    currency,
    symbol: sym,
    resolvedMaterial: matRes.key,
    resolvedProcess: procRes.key,
    // true when we fuzzy-matched free text rather than an exact catalogue pick.
    materialApprox: matRes.approx,
    processApprox: procRes.approx,
    // Learned-calibration status: whether the user's own quotes adjusted this estimate.
    calibration: { applied: calc.calibration.applied, factor: calc.calibration.factor, quotes: userCal.n },
    // Which rate library produced this estimate (built-in vs the admin's custom data).
    library: getActiveMeta(),
    fx: currency === 'EUR' ? null : { base: 'EUR', rate: Number(rate.toFixed(4)), asOf: fx.live ? fx.date : null, source: fx.source, stale: !!fx.stale },
    materialCost: fmt(b.material.value),
    processCost: fmt(processCost),
    overheadCost: fmt(b.overhead.value + b.sgaProfit.value),
    totalShouldCost: fmt(total),
    totalValue: Number(cv(total).toFixed(2)),
    gapVsQuote,
    breakdown: breakdownCv,
    drivers: driversCv,
    simulation: { p10: fmt(sim.p10), p50: fmt(sim.p50), p90: fmt(sim.p90), p10Value: Number(cv(sim.p10).toFixed(2)), p50Value: Number(cv(sim.p50).toFixed(2)), p90Value: Number(cv(sim.p90).toFixed(2)), stdev: Number(cv(sim.stdev).toFixed(2)) },
    volumeCurve: volumeCurve.map(p => ({ volume: p.volume, unitCost: Number(cv(p.unitCost).toFixed(4)), unitCostLabel: fmt(p.unitCost) })),
    assumptions: [
      `Material ${matRes.key} @ ${sym}${driversCv.pricePerKg}/kg, buy-to-fly input mass ${d.inputMassKg} kg (process utilisation ${(d.utilisation * 100).toFixed(0)}%).`,
      `${procRes.key}: cycle ${d.cycleSecPerPart}s/part, machine rate ${sym}${driversCv.machineRate}/hr, ${d.operators} operator(s) @ ${sym}${driversCv.labourRate}/hr (${region}).`,
      `Tooling ${sym}${driversCv.toolingTotal.toLocaleString()} amortised over ${d.amortVolume.toLocaleString()} parts; scrap ${d.scrapPct}%.`,
      `Overhead and SG&A/profit applied per ${region} factory norms.`,
    ],
    explanation: `Bottom-up should-cost for ${partName} is ${fmt(total)} per unit at ${Number(annualVolume).toLocaleString()}/yr. Material is ${b.material.pct}% of cost, conversion (machine+labour+setup) ${(b.machine.pct + b.labour.pct + b.setup.pct).toFixed(1)}%, tooling ${b.tooling.pct}%, overhead+SG&A ${(b.overhead.pct + b.sgaProfit.pct).toFixed(1)}%. Monte-Carlo P10–P90 range: ${fmt(sim.p10)}–${fmt(sim.p90)}.`,
    negotiationLeverage: quotedCost && Number(quotedCost) > 0
      ? (Number(quotedCost) > cv(total)
          ? `Quote sits ${sym}${(Number(quotedCost) - cv(total)).toFixed(2)} above should-cost (above the P90 of ${fmt(sim.p90)}${Number(quotedCost) > cv(sim.p90) ? ' — outside the modelled range' : ''}). Challenge conversion and overhead; target ${fmt(sim.p50)}.`
          : `Quote is at or below should-cost (${fmt(total)}) — competitive; protect it with a long-term agreement and verify margin sustainability.`)
      : `Benchmark target ${fmt(sim.p50)} (P50). Material at ${b.material.pct}% is the largest lever — focus resourcing and design-to-cost there first.`,
  };

  // ── 2. Optional LLM enrichment (qualitative only — numbers stay deterministic) ─
  if (apiKey) {
    try {
      const client = makeAnthropic(apiKey);
      const prompt = `You are a 20-year automotive cost engineer. A DETERMINISTIC should-cost model has produced these figures for "${partName}" (${matRes.key}, ${procRes.key}, ${weightKg}kg, ${Number(annualVolume).toLocaleString()}/yr, ${region}):
- Total should-cost: ${fmt(total)} (Monte-Carlo P10–P90 ${fmt(sim.p10)}–${fmt(sim.p90)})
- Material ${fmt(b.material.value)} | Machine ${fmt(b.machine.value)} | Labour ${fmt(b.labour.value)} | Tooling ${fmt(b.tooling.value)} | Overhead+SG&A ${fmt(b.overhead.value + b.sgaProfit.value)}
${quotedCost ? `- Supplier quote: ${sym}${quotedCost} (gap ${gapVsQuote})` : ''}

Do NOT change any number. Return ONLY JSON: {"explanation":"2-3 sentences interpreting these figures","negotiationLeverage":"1-2 sentence negotiation strategy","assumptions":["3-5 short engineering caveats specific to this part/process"]}`;
      const msg = await client.messages.create({ model: 'claude-opus-4-8', max_tokens: 700, messages: [{ role: 'user', content: prompt }] });
      const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}';
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const llm = JSON.parse(clean);
      if (typeof llm.explanation === 'string' && llm.explanation.trim()) result.explanation = llm.explanation.trim();
      if (typeof llm.negotiationLeverage === 'string' && llm.negotiationLeverage.trim()) result.negotiationLeverage = llm.negotiationLeverage.trim();
      if (Array.isArray(llm.assumptions) && llm.assumptions.length) result.assumptions = llm.assumptions.filter(a => typeof a === 'string').slice(0, 6);
      result.engine = 'deterministic+ai-narrative';
    } catch {
      // LLM enrichment is best-effort; deterministic numbers already populated.
    }
  }

  res.json(result);
});
}
