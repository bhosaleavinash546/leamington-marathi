/* ============================================================================
 * app.js — UI controller for the 360° PCB should-cost model — v2.
 * Adds: landed cost + PCBA wiring, Monte Carlo display, config alerts,
 * quote-calibration tab, batch CSV costing, share links, JSON/CSV export,
 * Gerber/Excellon import, AI review/optimizer/chat with Apply-idea buttons.
 * ==========================================================================*/

const $ = (id) => document.getElementById(id);
const NUM_FIELDS = ["boardW","boardH","orderQty","layerCount","boardThickness",
  "panelW","panelH","utilization","holeDensity","overheadPct","marginPct",
  "goldPrice","marketSurcharge","dutyPct","freightPerBoard","smtCount","thtCount","bomCost"];
const SEL_FIELDS = ["pcbType","material","copperInner","copperOuter","copperFoil","fabProcess",
  "via","trace","finish","maskColor","quality","region","destMarket"];
const CHK_FIELDS = ["impedance","backdrill","viafill","silkscreen","assemblyOn"];

let scenarios = [];
let calQuotes = [];
let batchResults = null;
let aiAbort = null;
let aiChatThread = null;
let aiIdeaStore = [];      // ideas currently rendered with Apply buttons

const fmtUSD = (v, dp = 2) => isFinite(v) ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "$—";
const fmtNum = (v, dp = 0) => isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: dp }) : "—";
const fmtPct = (v, dp = 1) => isFinite(v) ? (v * 100).toFixed(dp) + "%" : "—";

/* ---------- inputs ---------- */
function readInputs() {
  const p = {};
  NUM_FIELDS.forEach((f) => { p[f] = parseFloat($(f).value) || 0; });
  SEL_FIELDS.forEach((f) => { p[f] = $(f).value; });
  CHK_FIELDS.forEach((f) => { p[f] = $(f).checked; });
  p.sides = parseInt($("sides").value) || 1;
  return p;
}
function fillSelect(id, arr, valKey = "id", labelKey = "label") {
  $(id).innerHTML = arr.map((o) => `<option value="${o[valKey]}">${o[labelKey]}</option>`).join("");
}
function buildSelects() {
  fillSelect("pcbType", PCB_TYPES);
  fillSelect("material", MATERIALS);
  fillSelect("copperInner", COPPER_WEIGHTS);
  fillSelect("copperOuter", COPPER_WEIGHTS);
  fillSelect("copperFoil", COPPER_FOILS);
  fillSelect("fabProcess", FAB_PROCESSES);
  fillSelect("via", VIA_TYPES);
  fillSelect("trace", TRACE_CLASSES);
  fillSelect("finish", FINISHES);
  fillSelect("maskColor", MASK_COLORS);
  fillSelect("quality", QUALITY_LEVELS);
  fillSelect("region", REGIONS);
  $("destMarket").innerHTML = Object.entries(DUTY_LANES)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
}
function buildExamplePresets() {
  $("examplePresets").innerHTML = EXAMPLES.map((ex, i) =>
    `<button class="ex-chip" type="button" data-i="${i}">${ex.name}<span>${ex.note}</span></button>`).join("");
  $("examplePresets").querySelectorAll(".ex-chip").forEach((b) =>
    b.addEventListener("click", () => loadState(EXAMPLES[parseInt(b.dataset.i)].input)));
}
function loadState(state) {
  Object.entries(state).forEach(([k, v]) => {
    const el = $(k); if (!el) return;
    if (el.type === "checkbox") el.checked = v; else el.value = v;
  });
  render();
}

/* Linked defaults: snap obviously-incompatible selections when TYPE changes.
 * Remaining contradictions are flagged HIGH by validateConfig in the engine. [B2] */
function snapCompatible() {
  const t = $("pcbType").value;
  const via = $("via").value;
  const matFam = byId(MATERIALS, $("material").value).family;
  if ((t === "hdi" || t === "anylayer") && !byId(VIA_TYPES, via).microvia)
    $("via").value = t === "anylayer" ? "micro3" : "micro1";
  if ((t === "flex" || t === "rigidflex") && matFam !== "flex")
    $("material").value = "polyimide";
}

/* Duty lane auto-fill: destination or fab-region change refreshes the
 * indicative duty rate (still editable). */
function autofillDuty() {
  const lane = DUTY_LANES[$("destMarket").value];
  const rate = lane && lane.rates[$("region").value];
  $("dutyPct").value = rate != null ? rate : 0;
}

/* ---------- calibration (quote learning) ---------- */
function calFactorFor(region) {
  if (!calQuotes.length) return null;
  const ratios = (list) => list.map((q) => q.actual / q.model).sort((a, b) => a - b);
  const median = (xs) => xs.length ? xs[Math.floor(xs.length / 2)] : null;
  const regional = calQuotes.filter((q) => q.region === region);
  const f = median(ratios(regional.length >= 2 ? regional : calQuotes));
  return f && isFinite(f) ? f : null;
}
function calStatsHtml() {
  if (!calQuotes.length) return `<p class="hint">No quotes logged yet — the model is running purely on its 2026 calibration.</p>`;
  const errs = calQuotes.map((q) => Math.abs(q.actual - q.model) / q.actual * 100);
  const mape = errs.reduce((s, e) => s + e, 0) / errs.length;
  const within = calQuotes.filter((q) => Math.abs(q.actual - q.model) / q.actual <= 0.15).length;
  const perRegion = {};
  calQuotes.forEach((q) => { (perRegion[q.region] = perRegion[q.region] || []).push(q.actual / q.model); });
  const regionBits = Object.entries(perRegion).map(([r, xs]) => {
    xs.sort((a, b) => a - b);
    return `${byId(REGIONS, r).label} ×${xs[Math.floor(xs.length / 2)].toFixed(2)} (n=${xs.length})`;
  }).join(" · ");
  return `<div class="metrics-strip" style="margin:10px 0">
    <div class="metric"><div class="m-label">Quotes logged</div><div class="m-value">${calQuotes.length}</div></div>
    <div class="metric"><div class="m-label">Model MAPE</div><div class="m-value">${mape.toFixed(1)}%</div></div>
    <div class="metric"><div class="m-label">Within ±15%</div><div class="m-value">${within}/${calQuotes.length}</div></div>
    <div class="metric"><div class="m-label">Correction factors</div><div class="m-value" style="font-size:.8rem">${regionBits}</div></div>
  </div>`;
}
function renderCalibration() {
  $("calStats").innerHTML = calStatsHtml();
  const t = $("calTable");
  if (!calQuotes.length) { t.innerHTML = `<tbody><tr><td class="scenario-empty">No quotes yet. Configure a board, get a real quote, log it here.</td></tr></tbody>`; return; }
  let h = "<thead><tr><th>Config</th><th>Supplier</th><th>Region</th><th>Qty</th><th>Model $</th><th>Actual $</th><th>Δ%</th><th></th></tr></thead><tbody>";
  calQuotes.forEach((q, i) => {
    const d = (q.actual - q.model) / q.actual * 100;
    h += `<tr><td>${q.name}</td><td>${q.supplier || "—"}</td><td>${byId(REGIONS, q.region).label}</td><td>${fmtNum(q.qty)}</td>
      <td>${fmtUSD(q.model)}</td><td>${fmtUSD(q.actual)}</td><td>${d >= 0 ? "+" : ""}${d.toFixed(1)}%</td>
      <td><span class="del" data-i="${i}">✕</span></td></tr>`;
  });
  t.innerHTML = h + "</tbody>";
  t.querySelectorAll(".del").forEach((d) => d.addEventListener("click", () => {
    calQuotes.splice(parseInt(d.dataset.i), 1); persistCal(); renderCalibration(); render();
  }));
}
function addCalQuote() {
  const actual = parseFloat($("calActual").value);
  if (!isFinite(actual) || actual <= 0) { $("calStats").innerHTML = `<p class="hint" style="color:var(--neon-red)">Enter the actual quoted $/board first.</p>` + calStatsHtml(); return; }
  const input = readInputs();
  const r = computePcb(input);
  calQuotes.push({
    name: `${r.L}L ${r.type.label.split(" (")[0]} ${input.boardW}×${input.boardH}`,
    supplier: $("calSupplier").value.trim(),
    region: input.region, qty: input.orderQty,
    model: +r.price.toFixed(3), actual: +actual.toFixed(3),
    when: new Date().toISOString().slice(0, 10),
  });
  persistCal(); renderCalibration(); render();
  $("calActual").value = "";
}
function persistCal() { try { localStorage.setItem("pcb_cal_quotes", JSON.stringify(calQuotes)); } catch (e) {} }
function loadCal() {
  try { const s = localStorage.getItem("pcb_cal_quotes"); if (s) calQuotes = JSON.parse(s); } catch (e) {}
  try { $("calApply").checked = localStorage.getItem("pcb_cal_apply") === "1"; } catch (e) {}
}

/* ---------- main render ---------- */
function render() {
  const input = readInputs();
  const r = computePcb(input);

  // calibration correction (display-level, clearly disclosed)
  const applyCal = $("calApply").checked;
  const calF = applyCal ? calFactorFor(input.region) : null;
  const adj = (v) => (calF ? v * calF : v);

  // config alerts
  $("configAlerts").innerHTML = r.configIssues.map((t) =>
    `<div class="rec high config-alert"><span class="tag">CONFIG</span><span>${t}</span></div>`).join("");

  $("outCost").textContent = fmtUSD(adj(r.totalCost));
  $("outCostSub").textContent = `${r.L}-layer ${r.type.label.split(" (")[0]} · yield ${fmtPct(r.yld, 0)} · lot ×${r.lot.toFixed(2)}${calF ? ` · calibrated ×${calF.toFixed(2)}` : ""}`;
  $("outPrice").textContent = fmtUSD(adj(r.price));
  $("outPriceSub").textContent = `at ${input.marginPct}% margin${calF ? " · calibrated" : ""}`;

  // Monte Carlo band
  const mc = mcSimulate(input, 400);
  $("outMC").textContent = `${fmtUSD(adj(mc.p10))} – ${fmtUSD(adj(mc.p90))}`;
  $("outMCsub").textContent = `P50 ${fmtUSD(adj(mc.p50))} · 400 samples on calibration σ`;

  // extra cards (landed / PCBA / $/dm²)
  const showExtra = r.landed || r.pcbaCost != null;
  $("extraCards").style.display = "grid";
  $("outLanded").textContent = r.landed ? fmtUSD(adj(r.landed.total)) : "—";
  $("outLandedSub").textContent = r.landed
    ? `price + ${input.dutyPct}% duty (${fmtUSD(adj(r.landed.duty))}) + freight ${fmtUSD(r.landed.freight)}`
    : "set a destination market / duty";
  $("outPcba").textContent = r.pcbaCost != null ? fmtUSD(adj(r.pcbaCost)) : "—";
  $("outPcbaSub").textContent = r.pcbaCost != null
    ? `board + BOM ${fmtUSD(input.bomCost)} + assembly ${fmtUSD(r.assembly.assyProc + r.assembly.assyNre)}`
    : "enable assembly in section 7";
  $("outPerArea").textContent = fmtUSD(adj(r.totalCost) / Math.max(1e-9, r.area));

  $("metricsStrip").innerHTML = [
    ["Board area", fmtNum(r.area, 2) + " dm²"],
    ["Boards / panel", fmtNum(r.bpp)],
    ["Lamination cycles", fmtNum(r.lamCycles)],
    ["Yield", fmtPct(r.yld, 0)],
    ["Waste factor", "×" + r.waste.toFixed(2)],
    ["Lot factor", "×" + r.lot.toFixed(2)],
    ["Hole count", fmtNum(r.holeCount, 0)],
    ["NRE / board", fmtUSD(r.nrePerBoard, 3)],
  ].map(([l, v]) => `<div class="metric"><div class="m-label">${l}</div><div class="m-value">${v}</div></div>`).join("");

  const total = r.components.reduce((s, c) => s + Math.max(0, c.value), 0) || 1;
  $("stackBar").innerHTML = r.components.map((c) =>
    `<div class="seg" style="width:${(Math.max(0, c.value) / total) * 100}%;background:${c.color}" title="${c.label}: ${fmtUSD(c.value, 3)}"></div>`).join("");
  $("stackLegend").innerHTML = r.components.map((c) =>
    `<span class="li"><span class="sw" style="background:${c.color}"></span>${c.label} <b>${fmtUSD(adj(c.value), 2)}</b></span>`).join("");

  document.querySelector("#breakdownTable tbody").innerHTML = r.components.map((c) =>
    `<tr><td><span class="swatch" style="background:${c.color}"></span>${c.label}</td>
      <td class="num">${fmtUSD(adj(c.value), 3)}</td><td class="num">${((Math.max(0, c.value) / total) * 100).toFixed(1)}%</td></tr>`).join("");
  document.querySelector("#breakdownTable tfoot").innerHTML =
    `<tr><td>Total fab cost${calF ? " (calibrated)" : ""}</td><td class="num">${fmtUSD(adj(r.totalCost), 3)}</td><td class="num">100%</td></tr>`;

  // benchmark band (compare uncalibrated price against the independent band)
  const b = r.benchmark;
  const axMin = b.lo * 0.6, axMax = b.hi * 1.15, span = axMax - axMin || 1;
  $("bandZone").style.left = ((b.lo - axMin) / span) * 100 + "%";
  $("bandZone").style.width = ((b.hi - b.lo) / span) * 100 + "%";
  $("bandMark").style.left = Math.max(0, Math.min(100, ((r.price - axMin) / span) * 100)) + "%";
  $("bandLabels").innerHTML = `<span>${fmtUSD(axMin)}</span><span>band ${fmtUSD(b.lo)}–${fmtUSD(b.hi)}</span><span>${fmtUSD(axMax)}</span>`;
  const inBand = r.price >= b.lo && r.price <= b.hi;
  $("bandVerdict").className = "band-verdict " + (inBand ? "in" : "out");
  $("bandVerdict").textContent = inBand
    ? `✓ Price ${fmtUSD(r.price)} sits within the independent market band.`
    : `▲ Price ${fmtUSD(r.price)} is ${r.price > b.hi ? "above" : "below"} the typical band (${fmtUSD(b.lo)}–${fmtUSD(b.hi)}). Review the flagged drivers.`;

  // tornado
  const sens = pcbSensitivity(input, 15);
  const maxSwing = Math.max(...sens.map((s) => s.swing), 1);
  $("tornado").innerHTML = sens.map((s) =>
    `<div class="row"><span>${s.label}</span><div class="bar-wrap"><div class="bar" style="width:${(s.swing / maxSwing) * 100}%"></div></div>
      <span class="pct">±${s.swing.toFixed(1)}%</span></div>`).join("");

  // DfC
  $("dfc").innerHTML = r.dfc.map((d) => {
    const tag = { high: "HIGH", med: "MED", low: "TIP", ok: "OK" }[d.sev];
    return `<div class="rec ${d.sev}"><span class="tag">${tag}</span><span>${d.text}</span></div>`;
  }).join("");

  // routing
  $("routingTitle").textContent = `Process routing — ${r.L}-layer ${r.type.label}${input.assemblyOn ? " + PCBA" : ""}`;
  $("routingList").innerHTML = r.routing.map((s, i) =>
    `<div class="step"><span class="n">${i + 1}</span><span class="nm">${s.name}</span><span class="mc">${s.machine}</span></div>`).join("");

  $("accuracyNote").innerHTML =
    `<b>Accuracy:</b> calibrated to 2026 $/dm² ladders, labour/region indices, gold sensitivity and CCL inflation; ` +
    `Monte Carlo band reflects calibration σ. ` +
    (calQuotes.length
      ? `<b>${calQuotes.length} real quote${calQuotes.length > 1 ? "s" : ""} logged</b> (see Calibration tab)${calF ? `; correction ×${calF.toFixed(2)} applied` : "; correction available but not applied"}. `
      : `No real quotes logged yet — use the Calibration tab to measure and correct the model against your suppliers. `) +
    `Treat outputs as a should-cost <b>envelope</b>, not a quote.`;
}

/* ---------- AI advisor ---------- */
function setAiBusy(busy, statusHtml) {
  $("btnAiStop").style.display = busy ? "inline-flex" : "none";
  ["btnLocalAI", "btnClaudeAI", "btnOptimize", "btnAiChat"].forEach((id) => { $(id).disabled = busy; });
  if (statusHtml != null) $("aiStatus").innerHTML = statusHtml;
}
function renderIdeaButtons(ideas, sourceLabel) {
  aiIdeaStore = ideas.filter((i) => i.changes && Object.keys(i.changes).length);
  if (!aiIdeaStore.length) { $("aiIdeas").innerHTML = ""; return; }
  const base = computePcb(readInputs()).totalCost;
  $("aiIdeas").innerHTML = `<h4>Applicable ideas (${sourceLabel}) — verified against the engine</h4>` +
    aiIdeaStore.map((idea, n) => {
      const test = computePcb({ ...readInputs(), ...idea.changes });
      const save = base - test.totalCost;
      const chg = Object.entries(idea.changes).map(([k, v]) => `${k}→${v}`).join(", ");
      return `<div class="rec ${save > 0 ? "ok" : "med"}"><span class="tag">${save > 0 ? "−" + fmtUSD(save) : "±" + fmtUSD(Math.abs(save))}</span>
        <span><strong>${idea.title}</strong> <code>${chg}</code>${idea.note ? " — " + idea.note : ""}
        <button class="btn-apply" data-apply="${n}" type="button">Apply</button></span></div>`;
    }).join("");
  $("aiIdeas").querySelectorAll("[data-apply]").forEach((btn) =>
    btn.addEventListener("click", () => {
      loadState({ ...readInputs(), ...aiIdeaStore[parseInt(btn.dataset.apply)].changes });
      switchTab("model");
    }));
}
function runLocalAI() {
  const input = readInputs();
  const r = computePcb(input);
  const { html, ideas } = renderLocalInsights(input, r);
  $("aiStatus").className = "ai-status";
  $("aiStatus").textContent = "Built-in advisor · generated locally, no data left your browser.";
  $("aiOutput").innerHTML = html;
  $("aiOutput").querySelectorAll(".btn-apply").forEach((btn) =>
    btn.addEventListener("click", () => {
      const idea = ideas[parseInt(btn.dataset.idea)];
      if (idea && idea.changes) { loadState({ ...readInputs(), ...idea.changes }); switchTab("model"); }
    }));
  $("aiIdeas").innerHTML = "";
  $("aiChatWrap").style.display = "none";
  switchTab("ai");
}
function getAiCreds() {
  const apiKey = $("aiKey").value.trim();
  if (!apiKey) {
    $("aiStatus").className = "ai-status err";
    $("aiStatus").textContent = "Enter your Anthropic API key for Claude features (the built-in advisor needs no key).";
    switchTab("ai");
    return null;
  }
  if ($("aiSaveKey").checked) { try { localStorage.setItem("pcb_ai_key", apiKey); } catch (e) {} }
  return { apiKey, model: $("aiModel").value };
}
function aiFail(e) {
  $("aiStatus").className = "ai-status err";
  let hint = e && e.name === "AbortError" ? "Stopped." : (e.message || String(e));
  if (/Failed to fetch|NetworkError|CORS/i.test(hint)) hint += " — the browser may be blocking the direct call (network/CORS). The built-in advisor still works offline.";
  $("aiStatus").textContent = hint;
}
function startAbort() {
  aiAbort = new AbortController();
  const t = setTimeout(() => aiAbort.abort(), AI_TIMEOUT_MS);
  aiAbort.signal.addEventListener("abort", () => clearTimeout(t));
  return aiAbort.signal;
}
async function runClaudeReview() {
  const creds = getAiCreds(); if (!creds) return;
  const input = readInputs(), r = computePcb(input);
  const signal = startAbort();
  setAiBusy(true, `<span class="ai-spinner"></span>Streaming should-cost review from ${creds.model}…`);
  $("aiOutput").textContent = ""; $("aiIdeas").innerHTML = "";
  switchTab("ai");
  try {
    const text = await claudeReview({
      ...creds, input, r, signal,
      onText: (_d, full) => { $("aiOutput").innerHTML = mdToHtml(full); },
    });
    const { ideas, stripped } = extractIdeasJson(text);
    $("aiOutput").innerHTML = mdToHtml(stripped);
    renderIdeaButtons(ideas, "Claude review");
    aiChatThread = newChatThread(input, r);
    aiChatThread.push({ role: "user", content: "Here is your review for reference:\n" + text }, { role: "assistant", content: "Noted — ask me anything about it." });
    $("aiChatWrap").style.display = "block";
    setAiBusy(false, `Review generated by ${creds.model}. Ask follow-ups below.`);
  } catch (e) { setAiBusy(false); aiFail(e); }
}
async function runClaudeOptimize() {
  const creds = getAiCreds(); if (!creds) return;
  const input = readInputs(), r = computePcb(input);
  const signal = startAbort();
  setAiBusy(true, `<span class="ai-spinner"></span>Optimizer starting…`);
  $("aiOutput").innerHTML = `<p class="hint">Claude is running verified what-ifs against the live cost engine…</p>`;
  $("aiIdeas").innerHTML = "";
  switchTab("ai");
  try {
    const text = await claudeOptimize({
      ...creds, input, r, signal,
      onStatus: (s) => { $("aiStatus").innerHTML = `<span class="ai-spinner"></span>${s}`; },
    });
    const { ideas, stripped } = extractIdeasJson(text);
    $("aiOutput").innerHTML = mdToHtml(stripped);
    renderIdeaButtons(ideas, "optimizer — numerically verified");
    aiChatThread = newChatThread(input, r);
    aiChatThread.push({ role: "user", content: "Here is your optimization report for reference:\n" + text }, { role: "assistant", content: "Noted — ask me anything about it." });
    $("aiChatWrap").style.display = "block";
    setAiBusy(false, `Optimization complete (${creds.model}).`);
  } catch (e) { setAiBusy(false); aiFail(e); }
}
async function runChat() {
  const creds = getAiCreds(); if (!creds) return;
  const q = $("aiChatInput").value.trim(); if (!q) return;
  if (!aiChatThread) { const input = readInputs(); aiChatThread = newChatThread(input, computePcb(input)); }
  const signal = startAbort();
  setAiBusy(true, `<span class="ai-spinner"></span>Answering…`);
  const prior = $("aiOutput").innerHTML;
  $("aiOutput").innerHTML = prior + `<h4>You</h4><p>${q.replace(/</g, "&lt;")}</p><h4>Claude</h4><p id="aiChatLive">…</p>`;
  $("aiChatInput").value = "";
  try {
    await claudeChat({
      ...creds, thread: aiChatThread, question: q, signal,
      onText: (_d, full) => { const el = $("aiChatLive"); if (el) el.outerHTML = `<div id="aiChatLive">${mdToHtml(full)}</div>`; },
    });
    setAiBusy(false, "Answered. Ask another follow-up, or re-run a review after changing inputs.");
  } catch (e) { setAiBusy(false); aiFail(e); }
}

/* ---------- scenarios ---------- */
function saveScenario() {
  const input = readInputs();
  const r = computePcb(input);
  const name = `${r.L}L ${r.type.label.split(" (")[0]} · ${r.area.toFixed(2)}dm² · ${(input.orderQty / 1000)}k · ${byId(REGIONS, input.region).label}`;
  scenarios.push({ name, input, r: lite(r) });
  persist(); renderScenarios(); switchTab("scenarios");
}
function lite(r) {
  return { L: r.L, typeLabel: r.type.label.split(" (")[0], area: r.area, bpp: r.bpp,
    lamCycles: r.lamCycles, yld: r.yld, lot: r.lot, material: r.material, processing: r.processing,
    testInspect: r.testInspect, nrePerBoard: r.nrePerBoard, overhead: r.overhead,
    totalCost: r.totalCost, price: r.price,
    landed: r.landed ? r.landed.total : null, pcba: r.pcbaCost };
}
function renderScenarios() {
  const t = $("scenarioTable");
  if (!scenarios.length) { t.innerHTML = `<tbody><tr><td class="scenario-empty">No scenarios saved yet.</td></tr></tbody>`; return; }
  const rows = [
    { l: "", g: (s, i) => `<span class="del" data-i="${i}" title="Delete">✕</span>` },
    { l: "Config", head: true, g: (s) => s.name },
    { l: "Layers", g: (s) => s.r.L },
    { l: "Type", g: (s) => s.r.typeLabel },
    { l: "Area (dm²)", g: (s) => s.r.area.toFixed(2) },
    { l: "Lot factor", g: (s) => "×" + (s.r.lot || 1).toFixed(2) },
    { l: "Yield", g: (s) => fmtPct(s.r.yld, 0) },
    { l: "Material $", g: (s) => fmtUSD(s.r.material) },
    { l: "Processing $", g: (s) => fmtUSD(s.r.processing) },
    { l: "Test $", g: (s) => fmtUSD(s.r.testInspect) },
    { l: "NRE/board $", g: (s) => fmtUSD(s.r.nrePerBoard, 3) },
    { l: "Fab cost $", head: true, g: (s) => fmtUSD(s.r.totalCost) },
    { l: "Price $", g: (s) => fmtUSD(s.r.price) },
    { l: "Landed $", g: (s) => s.r.landed != null ? fmtUSD(s.r.landed) : "—" },
    { l: "PCBA $", g: (s) => s.r.pcba != null ? fmtUSD(s.r.pcba) : "—" },
  ];
  let h = "<thead><tr><th>Metric</th>" + scenarios.map((s, i) => `<th>#${i + 1}</th>`).join("") + "</tr></thead><tbody>";
  rows.forEach((row) => { h += `<tr class="${row.head ? "row-head" : ""}"><td>${row.l}</td>` + scenarios.map((s, i) => `<td>${row.g(s, i)}</td>`).join("") + "</tr>"; });
  t.innerHTML = h + "</tbody>";
  t.querySelectorAll(".del").forEach((d) => d.addEventListener("click", () => { scenarios.splice(parseInt(d.dataset.i), 1); persist(); renderScenarios(); }));
}
function persist() { try { localStorage.setItem("pcb_scenarios", JSON.stringify(scenarios)); } catch (e) {} }
function loadScen() { try { const s = localStorage.getItem("pcb_scenarios"); if (s) scenarios = JSON.parse(s); } catch (e) {} }

/* ---------- batch CSV ---------- */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (cell !== "" || row.length) { row.push(cell); rows.push(row); row = []; cell = ""; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
async function runBatch(file) {
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) { $("batchTable").innerHTML = `<tbody><tr><td class="scenario-empty">CSV needs a header row + at least one data row.</td></tr></tbody>`; return; }
  const header = rows[0].map((h) => h.trim());
  const base = readInputs();
  batchResults = rows.slice(1).map((cells, idx) => {
    const over = {};
    let name = `row ${idx + 1}`;
    header.forEach((h, i) => {
      const v = (cells[i] || "").trim();
      if (v === "") return;
      if (h === "name") { name = v; return; }
      const clean = sanitizeChanges({ [h]: isNaN(Number(v)) ? (v === "true" ? true : v === "false" ? false : v) : Number(v) });
      Object.assign(over, clean);
    });
    const r = computePcb({ ...base, ...over });
    return { name, over, cost: r.totalCost, price: r.price, yld: r.yld, L: r.L, issues: r.configIssues.length };
  });
  let h = "<thead><tr><th>Name</th><th>Overrides</th><th>Layers</th><th>Yield</th><th>Fab cost $</th><th>Price $</th><th>Config issues</th></tr></thead><tbody>";
  batchResults.forEach((b) => {
    h += `<tr><td>${b.name}</td><td style="white-space:normal;font-size:.72rem">${Object.entries(b.over).map(([k, v]) => k + "=" + v).join(" ") || "(current config)"}</td>
      <td>${b.L}</td><td>${fmtPct(b.yld, 0)}</td><td>${fmtUSD(b.cost)}</td><td>${fmtUSD(b.price)}</td><td>${b.issues || ""}</td></tr>`;
  });
  $("batchTable").innerHTML = h + "</tbody>";
  $("btnBatchExport").style.display = "inline-flex";
}
function downloadText(name, text, mime = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function batchTemplate() {
  downloadText("pcb-batch-template.csv",
    "name,layerCount,boardW,boardH,pcbType,material,via,trace,finish,quality,region,orderQty\n" +
    "Control module,4,100,80,rigid,fr4_hightg,through,5mil,enig,automotive,china,50000\n" +
    "Domain controller,8,160,120,highspeed,lowloss_mid,buried,4mil,enig,automotive,china,20000\n", "text/csv");
}
function exportBatch() {
  if (!batchResults) return;
  downloadText("pcb-batch-results.csv",
    "name,layers,yield,fabCost,price,configIssues\n" +
    batchResults.map((b) => `"${b.name}",${b.L},${(b.yld * 100).toFixed(1)}%,${b.cost.toFixed(3)},${b.price.toFixed(3)},${b.issues}`).join("\n"), "text/csv");
}

/* ---------- share / export ---------- */
function shareLink() {
  const state = readInputs();
  const enc = btoa(encodeURIComponent(JSON.stringify(state)));
  const url = location.origin === "null" || location.protocol === "file:"
    ? `${location.href.split("#")[0]}#cfg=${enc}`
    : `${location.href.split("#")[0]}#cfg=${enc}`;
  history.replaceState(null, "", `#cfg=${enc}`);
  const done = () => { $("btnShare").textContent = "✓ Copied"; setTimeout(() => { $("btnShare").textContent = "⧉ Share link"; }, 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, done); else done();
}
function loadFromHash() {
  const m = location.hash.match(/#cfg=(.+)/);
  if (!m) return false;
  try {
    const state = JSON.parse(decodeURIComponent(atob(m[1])));
    loadState({ ...DEFAULTS, ...state });
    return true;
  } catch (e) { return false; }
}
function exportJson() {
  downloadText("pcb-config.json", JSON.stringify(readInputs(), null, 2), "application/json");
}
function exportCsv() {
  const r = computePcb(readInputs());
  let csv = "element,usd_per_board,share\n";
  const total = r.components.reduce((s, c) => s + c.value, 0) || 1;
  r.components.forEach((c) => { csv += `"${c.label}",${c.value.toFixed(4)},${(c.value / total * 100).toFixed(1)}%\n`; });
  csv += `"TOTAL fab cost",${r.totalCost.toFixed(4)},100%\n"Quoted price",${r.price.toFixed(4)},\n`;
  if (r.landed) csv += `"Landed cost",${r.landed.total.toFixed(4)},\n`;
  if (r.pcbaCost != null) csv += `"PCBA cost",${r.pcbaCost.toFixed(4)},\n`;
  downloadText("pcb-cost-breakdown.csv", csv, "text/csv");
}

/* ---------- design-file import ---------- */
async function handleImport(files) {
  $("importReport").innerHTML = `<span class="ai-spinner"></span> parsing…`;
  const rep = await GerberImport.importFiles(files);
  if (Object.keys(rep.suggested).length) loadState({ ...readInputs(), ...rep.suggested });
  $("importReport").innerHTML = rep.notes.map((n) => `<div>▹ ${n}</div>`).join("");
}

/* ---------- tabs / tooltips / reset ---------- */
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}
function initTooltips() {
  const tip = $("tooltip");
  document.body.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]"); if (!el) return;
    tip.textContent = el.dataset.tip; tip.classList.add("show");
    const move = (ev) => { tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 310) + "px"; tip.style.top = (ev.clientY + 16) + "px"; };
    move(e); el._move = move; el.addEventListener("mousemove", move);
  });
  document.body.addEventListener("mouseout", (e) => {
    const el = e.target.closest("[data-tip]"); if (!el) return;
    tip.classList.remove("show"); if (el._move) el.removeEventListener("mousemove", el._move);
  });
}
function resetDefaults() { loadState(DEFAULTS); }

/* ---------- init ---------- */
function init() {
  buildSelects();
  buildExamplePresets();
  resetDefaults();
  loadScen(); renderScenarios();
  loadCal(); renderCalibration();
  buildMethodology();

  NUM_FIELDS.forEach((f) => $(f).addEventListener("input", render));
  SEL_FIELDS.forEach((f) => $(f).addEventListener("change", render));
  CHK_FIELDS.forEach((f) => $(f).addEventListener("change", render));
  $("sides").addEventListener("change", render);
  $("pcbType").addEventListener("change", () => { snapCompatible(); render(); });
  $("destMarket").addEventListener("change", () => { autofillDuty(); render(); });
  $("region").addEventListener("change", () => { autofillDuty(); render(); });

  $("btnReset").addEventListener("click", resetDefaults);
  $("btnSaveScenario").addEventListener("click", saveScenario);
  $("btnClearScenarios").addEventListener("click", () => { scenarios = []; persist(); renderScenarios(); });
  $("btnShare").addEventListener("click", shareLink);
  $("btnExportJson").addEventListener("click", exportJson);
  $("btnExportCsv").addEventListener("click", exportCsv);

  // AI
  $("btnLocalAI").addEventListener("click", runLocalAI);
  $("btnClaudeAI").addEventListener("click", runClaudeReview);
  $("btnOptimize").addEventListener("click", runClaudeOptimize);
  $("btnAiChat").addEventListener("click", runChat);
  $("aiChatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") runChat(); });
  $("btnAiStop").addEventListener("click", () => { if (aiAbort) aiAbort.abort(); });
  // Remember-key opt-in AND opt-out (unticking removes the stored key). [B3]
  $("aiSaveKey").addEventListener("change", () => {
    try {
      if ($("aiSaveKey").checked) { const k = $("aiKey").value.trim(); if (k) localStorage.setItem("pcb_ai_key", k); }
      else localStorage.removeItem("pcb_ai_key");
    } catch (e) {}
  });
  try { const k = localStorage.getItem("pcb_ai_key"); if (k) { $("aiKey").value = k; $("aiSaveKey").checked = true; } } catch (e) {}

  // calibration
  $("btnCalAdd").addEventListener("click", addCalQuote);
  $("calApply").addEventListener("change", () => {
    try { localStorage.setItem("pcb_cal_apply", $("calApply").checked ? "1" : "0"); } catch (e) {}
    render();
  });
  $("btnCalClear").addEventListener("click", () => { calQuotes = []; persistCal(); renderCalibration(); render(); });
  $("btnCalExport").addEventListener("click", () => {
    downloadText("pcb-quotes.csv", "config,supplier,region,qty,model,actual,date\n" +
      calQuotes.map((q) => `"${q.name}","${q.supplier}",${q.region},${q.qty},${q.model},${q.actual},${q.when}`).join("\n"), "text/csv");
  });

  // batch
  $("batchFile").addEventListener("change", (e) => { if (e.target.files.length) runBatch(e.target.files[0]); });
  $("btnBatchTemplate").addEventListener("click", batchTemplate);
  $("btnBatchExport").addEventListener("click", exportBatch);

  // import
  $("importFiles").addEventListener("change", (e) => handleImport(e.target.files));

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  initTooltips();

  if (!loadFromHash()) render();
}
document.addEventListener("DOMContentLoaded", init);
