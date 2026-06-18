/* ============================================================================
 * app.js — UI controller for the 360° PCB should-cost model.
 * ==========================================================================*/

const $ = (id) => document.getElementById(id);
const NUM_FIELDS = ["boardW","boardH","orderQty","layerCount","boardThickness",
  "panelW","panelH","utilization","holeDensity","overheadPct","marginPct"];
const SEL_FIELDS = ["pcbType","material","copperInner","copperOuter","via","trace","finish","maskColor","quality","region"];
const CHK_FIELDS = ["impedance","silkscreen"];

let scenarios = [];

const fmtUSD = (v, dp = 2) => isFinite(v) ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "$—";
const fmtNum = (v, dp = 0) => isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: dp }) : "—";
const fmtPct = (v, dp = 1) => isFinite(v) ? (v * 100).toFixed(dp) + "%" : "—";

function readInputs() {
  const p = {};
  NUM_FIELDS.forEach((f) => { p[f] = parseFloat($(f).value) || 0; });
  SEL_FIELDS.forEach((f) => { p[f] = $(f).value; });
  CHK_FIELDS.forEach((f) => { p[f] = $(f).checked; });
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
  fillSelect("via", VIA_TYPES);
  fillSelect("trace", TRACE_CLASSES);
  fillSelect("finish", FINISHES);
  fillSelect("maskColor", MASK_COLORS);
  fillSelect("quality", QUALITY_LEVELS);
  fillSelect("region", REGIONS);
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

/* ---------- render ---------- */
function render() {
  const input = readInputs();
  const r = computePcb(input);

  $("outCost").textContent = fmtUSD(r.totalCost);
  $("outCostSub").textContent = `${r.L}-layer ${r.type.label.split(" (")[0]} · yield ${fmtPct(r.yld,0)}`;
  $("outPrice").textContent = fmtUSD(r.price);
  $("outPriceSub").textContent = `at ${input.marginPct}% margin`;
  $("outPerArea").textContent = fmtUSD(r.totalCost / Math.max(1e-9, r.area), 2);

  $("metricsStrip").innerHTML = [
    ["Board area", fmtNum(r.area, 2) + " dm²"],
    ["Boards / panel", fmtNum(r.bpp)],
    ["Lamination cycles", fmtNum(r.lamCycles)],
    ["Yield", fmtPct(r.yld, 0)],
    ["Aspect ratio", fmtNum(r.aspect, 1) + ":1"],
    ["Hole count", fmtNum(r.holeCount, 0)],
    ["NRE / board", fmtUSD(r.nrePerBoard, 3)],
    ["Total NRE", fmtUSD(r.nre, 0)],
  ].map(([l, v]) => `<div class="metric"><div class="m-label">${l}</div><div class="m-value">${v}</div></div>`).join("");

  const total = r.components.reduce((s, c) => s + Math.max(0, c.value), 0) || 1;
  $("stackBar").innerHTML = r.components.map((c) =>
    `<div class="seg" style="width:${(Math.max(0,c.value)/total)*100}%;background:${c.color}" title="${c.label}: ${fmtUSD(c.value,3)}"></div>`).join("");
  $("stackLegend").innerHTML = r.components.map((c) =>
    `<span class="li"><span class="sw" style="background:${c.color}"></span>${c.label} <b>${fmtUSD(c.value,2)}</b></span>`).join("");

  const tbody = document.querySelector("#breakdownTable tbody");
  tbody.innerHTML = r.components.map((c) =>
    `<tr><td><span class="swatch" style="background:${c.color}"></span>${c.label}</td>
      <td class="num">${fmtUSD(c.value,3)}</td><td class="num">${((Math.max(0,c.value)/total)*100).toFixed(1)}%</td></tr>`).join("");
  document.querySelector("#breakdownTable tfoot").innerHTML =
    `<tr><td>Total fab cost</td><td class="num">${fmtUSD(r.totalCost,3)}</td><td class="num">100%</td></tr>`;

  // benchmark band (price vs market price band)
  const b = r.benchmark;
  const axMin = b.lo * 0.6, axMax = b.hi * 1.15, span = axMax - axMin || 1;
  const zL = ((b.lo - axMin) / span) * 100, zW = ((b.hi - b.lo) / span) * 100;
  const mk = Math.max(0, Math.min(100, ((r.price - axMin) / span) * 100));
  $("bandZone").style.left = zL + "%"; $("bandZone").style.width = zW + "%";
  $("bandMark").style.left = mk + "%";
  $("bandLabels").innerHTML = `<span>${fmtUSD(axMin)}</span><span>band ${fmtUSD(b.lo)}–${fmtUSD(b.hi)}</span><span>${fmtUSD(axMax)}</span>`;
  const inBand = r.price >= b.lo && r.price <= b.hi;
  $("bandVerdict").className = "band-verdict " + (inBand ? "in" : "out");
  $("bandVerdict").textContent = inBand
    ? `✓ Price ${fmtUSD(r.price)} sits within the independent market band — model looks sane.`
    : `▲ Price ${fmtUSD(r.price)} is ${r.price > b.hi ? "above" : "below"} the typical band (${fmtUSD(b.lo)}–${fmtUSD(b.hi)}). Review the flagged drivers.`;

  // tornado
  const sens = pcbSensitivity(input, 15);
  const maxSwing = Math.max(...sens.map((s) => s.swing), 1);
  $("tornado").innerHTML = sens.map((s) =>
    `<div class="row"><span>${s.label}</span><div class="bar-wrap"><div class="bar" style="width:${(s.swing/maxSwing)*100}%"></div></div>
      <span class="pct">±${s.swing.toFixed(1)}%</span></div>`).join("");

  // DfC
  $("dfc").innerHTML = r.dfc.map((d) => {
    const tag = { high: "HIGH", med: "MED", low: "TIP", ok: "OK" }[d.sev];
    return `<div class="rec ${d.sev}"><span class="tag">${tag}</span><span>${d.text}</span></div>`;
  }).join("");

  // routing
  $("routingTitle").textContent = `Process routing — ${r.L}-layer ${r.type.label}`;
  $("routingList").innerHTML = r.routing.map((s, i) =>
    `<div class="step"><span class="n">${i+1}</span><span>${s.name}</span><span class="mc">${s.machine}</span></div>`).join("");

  $("accuracyNote").innerHTML =
    `<b>Accuracy:</b> calibrated to industry $/dm² fab-price ranges; flagship examples land inside the
     independent market band. Treat outputs as a should-cost <b>envelope</b> (±15–20%), not a quote.
     The model is intentionally slightly conservative on the very simplest boards.`;
}

/* ---------- scenarios ---------- */
function saveScenario() {
  const input = readInputs();
  const r = computePcb(input);
  const name = `${r.L}L ${r.type.label.split(" (")[0]} · ${r.area.toFixed(2)}dm² · ${(input.orderQty/1000)}k`;
  scenarios.push({ name, input, r: lite(r) });
  persist(); renderScenarios(); switchTab("scenarios");
}
function lite(r) {
  return { L: r.L, typeLabel: r.type.label.split(" (")[0], area: r.area, bpp: r.bpp,
    lamCycles: r.lamCycles, yld: r.yld, material: r.material, processing: r.processing,
    testInspect: r.testInspect, nrePerBoard: r.nrePerBoard, overhead: r.overhead,
    totalCost: r.totalCost, price: r.price };
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
    { l: "Boards/panel", g: (s) => s.r.bpp },
    { l: "Lam cycles", g: (s) => s.r.lamCycles },
    { l: "Yield", g: (s) => fmtPct(s.r.yld, 0) },
    { l: "Material $", g: (s) => fmtUSD(s.r.material) },
    { l: "Processing $", g: (s) => fmtUSD(s.r.processing) },
    { l: "Test $", g: (s) => fmtUSD(s.r.testInspect) },
    { l: "NRE/board $", g: (s) => fmtUSD(s.r.nrePerBoard, 3) },
    { l: "Overhead $", g: (s) => fmtUSD(s.r.overhead) },
    { l: "Fab cost $", head: true, g: (s) => fmtUSD(s.r.totalCost) },
    { l: "Price $", g: (s) => fmtUSD(s.r.price) },
  ];
  let h = "<thead><tr><th>Metric</th>" + scenarios.map((s, i) => `<th>#${i+1}</th>`).join("") + "</tr></thead><tbody>";
  rows.forEach((row) => { h += `<tr class="${row.head ? "row-head" : ""}"><td>${row.l}</td>` + scenarios.map((s, i) => `<td>${row.g(s, i)}</td>`).join("") + "</tr>"; });
  t.innerHTML = h + "</tbody>";
  t.querySelectorAll(".del").forEach((d) => d.addEventListener("click", () => { scenarios.splice(parseInt(d.dataset.i), 1); persist(); renderScenarios(); }));
}
function persist() { try { localStorage.setItem("pcb_scenarios", JSON.stringify(scenarios)); } catch (e) {} }
function loadScen() { try { const s = localStorage.getItem("pcb_scenarios"); if (s) scenarios = JSON.parse(s); } catch (e) {} }

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

function init() {
  buildSelects();
  buildExamplePresets();
  resetDefaults();
  loadScen(); renderScenarios();
  buildMethodology();
  NUM_FIELDS.forEach((f) => $(f).addEventListener("input", render));
  SEL_FIELDS.forEach((f) => $(f).addEventListener("change", render));
  CHK_FIELDS.forEach((f) => $(f).addEventListener("change", render));
  $("btnReset").addEventListener("click", resetDefaults);
  $("btnSaveScenario").addEventListener("click", saveScenario);
  $("btnClearScenarios").addEventListener("click", () => { scenarios = []; persist(); renderScenarios(); });
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  initTooltips();
  render();
}
document.addEventListener("DOMContentLoaded", init);
