/* ============================================================================
 * app.js — UI controller: wiring inputs, rendering results, scenarios, tabs.
 * ==========================================================================*/

const $ = (id) => document.getElementById(id);
const NUM_FIELDS = [
  "waferDiameter","waferCost","edgeExclusion","scribe","dieArea","asilOverhead",
  "defectDensity","clustering","systematicYield","ballCount","packageCost",
  "assemblyCost","testTime","testerRate","burnInCost","assemblyYield","testYield",
  "ipRoyalty","ipUpfront","maskCost","designNRE","qualNRE","annualVolume",
  "programYears","overheadPct","grossMargin",
];

let scenarios = [];

/* ---------- formatting ---------- */
const fmtUSD = (v, dp = 2) =>
  isFinite(v) ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "$—";
const fmtUSDc = (v) => isFinite(v) ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "$—";
const fmtNum = (v, dp = 0) => isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: dp }) : "—";
const fmtPct = (v, dp = 1) => isFinite(v) ? (v * 100).toFixed(dp) + "%" : "—";

/* ---------- read inputs ---------- */
function readInputs() {
  const p = {};
  NUM_FIELDS.forEach((f) => { p[f] = parseFloat($(f).value) || 0; });
  p.packageType = $("packageType").value;
  p.burnIn = $("burnIn").checked;
  return p;
}

/* ---------- populate selects / presets ---------- */
function buildPackageOptions() {
  const sel = $("packageType");
  sel.innerHTML = PACKAGES.map((pk) => `<option value="${pk.id}">${pk.label}</option>`).join("");
}

function buildNodePresets() {
  const wrap = $("nodePresets");
  wrap.innerHTML = NODES.map((n) =>
    `<button class="node-chip" type="button" data-node="${n.id}">${n.label}<span class="tier">${n.tier}</span></button>`
  ).join("");
  wrap.querySelectorAll(".node-chip").forEach((chip) => {
    chip.addEventListener("click", () => applyNode(chip.dataset.node));
  });
}

function applyNode(id) {
  const n = NODES.find((x) => x.id === id);
  if (!n) return;
  $("waferCost").value = n.waferCost;
  $("maskCost").value = n.mask;
  $("defectDensity").value = n.d0;
  $("dieArea").value = n.dieArea;
  document.querySelectorAll(".node-chip").forEach((c) => c.classList.toggle("active", c.dataset.node === id));
  $("presetHint").textContent =
    `${n.label} (${n.tier}${n.euv ? ", EUV" : ""}) — benchmark wafer $${n.waferLo.toLocaleString()}–$${n.waferHi.toLocaleString()}, mask set $${(n.mask/1e6).toFixed(1)}M, D₀ ${n.d0}/cm². All editable.`;
  render();
}

function applyPackage() {
  const pk = PACKAGES.find((x) => x.id === $("packageType").value);
  if (!pk) return;
  const balls = parseFloat($("ballCount").value) || pk.balls;
  $("packageCost").value = (pk.base + pk.perBall * balls).toFixed(2);
  $("assemblyCost").value = pk.assembly.toFixed(2);
  render();
}

/* ---------- main render ---------- */
function render() {
  const input = readInputs();
  const r = computeCost(input);

  $("outSilicon").textContent = fmtUSD(r.siliconPerGoodDie, 2);
  $("outSiliconSub").textContent = `per good die · ${fmtUSD(r.packagedTestedCost,2)} packaged+tested`;
  $("outTotal").textContent = fmtUSD(r.totalCost, 2);
  $("outASP").textContent = fmtUSD(r.asp, 2);
  $("outASPsub").textContent = `at ${input.grossMargin}% gross margin`;

  // metrics strip
  $("metricsStrip").innerHTML = [
    ["Gross dies / wafer", fmtNum(r.dpw)],
    ["Die yield", fmtPct(r.yieldTotal)],
    ["Good dies / wafer", fmtNum(r.goodDPW, 0)],
    ["Eff. die area", fmtNum(r.effDieArea, 1) + " mm²"],
    ["Lifetime volume", fmtNum(r.lifetimeVolume) + " u"],
    ["NRE / unit", fmtUSD(r.nrePerUnit, 3)],
    ["IP / unit", fmtUSD(r.ipPerUnit, 2)],
    ["Total NRE pool", fmtUSDc(r.nreTotal)],
  ].map(([l, v]) => `<div class="metric"><div class="m-label">${l}</div><div class="m-value">${v}</div></div>`).join("");

  // stack bar
  const total = r.components.reduce((s, c) => s + Math.max(0, c.value), 0) || 1;
  $("stackBar").innerHTML = r.components.map((c) =>
    `<div class="seg" style="width:${(Math.max(0,c.value)/total)*100}%;background:${c.color}" title="${c.label}: ${fmtUSD(c.value,3)}"></div>`
  ).join("");
  $("stackLegend").innerHTML = r.components.map((c) =>
    `<span class="li"><span class="sw" style="background:${c.color}"></span>${c.label} <b>${fmtUSD(c.value,2)}</b></span>`
  ).join("");

  // breakdown table
  const tbody = document.querySelector("#breakdownTable tbody");
  tbody.innerHTML = r.components.map((c) =>
    `<tr><td><span class="swatch" style="background:${c.color}"></span>${c.label}</td>
      <td class="num">${fmtUSD(c.value,3)}</td>
      <td class="num">${((Math.max(0,c.value)/total)*100).toFixed(1)}%</td></tr>`
  ).join("");
  document.querySelector("#breakdownTable tfoot").innerHTML =
    `<tr><td>Total product cost</td><td class="num">${fmtUSD(r.totalCost,3)}</td><td class="num">100%</td></tr>`;

  // tornado sensitivity (single aligned row per driver: label · bar · percent)
  const sens = sensitivity(input, 10);
  const maxSwing = Math.max(...sens.map((s) => Math.max(Math.abs(s.hi), Math.abs(s.lo))), 1);
  $("tornado").innerHTML = sens.map((s) => {
    const mag = Math.max(Math.abs(s.hi), Math.abs(s.lo));
    return `<div class="row"><span>${s.label}</span>
      <div class="bar-wrap"><div class="bar" style="width:${(mag / maxSwing) * 100}%"></div></div>
      <span class="pct">±${mag.toFixed(1)}%</span></div>`;
  }).join("");

  // accuracy note
  $("accuracyNote").innerHTML =
    `<b>Accuracy band:</b> this is a parametric model on public benchmark ranges — expect a <b>±15–25%</b>
     envelope out of the box. The <b>90–95%</b> target is reachable only once wafer price, defect density,
     package and IP terms are calibrated to your negotiated program data. Largest residual uncertainties:
     wafer price negotiation (±10–15%), achieved yield during ramp, and IP royalty terms. Treat outputs as
     a <b>cost envelope</b>, not a quote.`;
}

/* ---------- scenarios ---------- */
function saveScenario() {
  const input = readInputs();
  const r = computeCost(input);
  const node = document.querySelector(".node-chip.active");
  const name = (node ? node.dataset.node + "nm · " : "") + Math.round(r.effDieArea) + "mm² · " + (input.annualVolume/1e6) + "M/yr";
  scenarios.push({ name, input, r });
  persistScenarios();
  renderScenarios();
  switchTab("scenarios");
}

function renderScenarios() {
  const t = $("scenarioTable");
  if (scenarios.length === 0) {
    t.innerHTML = `<tbody><tr><td class="scenario-empty">No scenarios saved yet.</td></tr></tbody>`;
    return;
  }
  const rows = [
    { label: "", get: (s, i) => `<span class="del" data-i="${i}" title="Delete">✕</span>` },
    { label: "Node / die / volume", head: true, get: (s) => s.name },
    { label: "Wafer cost", get: (s) => fmtUSDc(s.input.waferCost) },
    { label: "Design die area", get: (s) => fmtNum(s.input.dieArea) + " mm²" },
    { label: "Gross dies/wafer", get: (s) => fmtNum(s.r.dpw) },
    { label: "Die yield", get: (s) => fmtPct(s.r.yieldTotal) },
    { label: "Silicon $/good die", get: (s) => fmtUSD(s.r.siliconPerGoodDie) },
    { label: "Packaged+tested", get: (s) => fmtUSD(s.r.packagedTestedCost) },
    { label: "IP / unit", get: (s) => fmtUSD(s.r.ipPerUnit) },
    { label: "NRE / unit", get: (s) => fmtUSD(s.r.nrePerUnit, 3) },
    { label: "Overhead / unit", get: (s) => fmtUSD(s.r.overhead) },
    { label: "Total product cost", head: true, get: (s) => fmtUSD(s.r.totalCost) },
    { label: "Indicative ASP", get: (s) => fmtUSD(s.r.asp) },
  ];
  let html = "<thead><tr><th>Metric</th>" + scenarios.map((s, i) => `<th>#${i+1}</th>`).join("") + "</tr></thead><tbody>";
  rows.forEach((row) => {
    html += `<tr class="${row.head ? "row-head" : ""}"><td>${row.label}</td>` +
      scenarios.map((s, i) => `<td>${row.get(s, i)}</td>`).join("") + "</tr>";
  });
  html += "</tbody>";
  t.innerHTML = html;
  t.querySelectorAll(".del").forEach((d) => d.addEventListener("click", () => {
    scenarios.splice(parseInt(d.dataset.i), 1); persistScenarios(); renderScenarios();
  }));
}

function persistScenarios() {
  try { localStorage.setItem("soc_scenarios", JSON.stringify(scenarios)); } catch (e) {}
}
function loadScenarios() {
  try { const s = localStorage.getItem("soc_scenarios"); if (s) scenarios = JSON.parse(s); } catch (e) {}
}

/* ---------- tabs ---------- */
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}

/* ---------- tooltips ---------- */
function initTooltips() {
  const tip = $("tooltip");
  document.body.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return;
    tip.textContent = el.dataset.tip;
    tip.classList.add("show");
    const move = (ev) => {
      tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 300) + "px";
      tip.style.top = (ev.clientY + 16) + "px";
    };
    move(e);
    el._move = move;
    el.addEventListener("mousemove", move);
  });
  document.body.addEventListener("mouseout", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return;
    tip.classList.remove("show");
    if (el._move) el.removeEventListener("mousemove", el._move);
  });
}

/* ---------- reset ---------- */
function resetDefaults() {
  Object.entries(DEFAULTS).forEach(([k, v]) => {
    const el = $(k);
    if (!el) return;
    if (el.type === "checkbox") el.checked = v; else el.value = v;
  });
  document.querySelectorAll(".node-chip").forEach((c) => c.classList.remove("active"));
  render();
}

/* ---------- init ---------- */
function init() {
  buildPackageOptions();
  buildNodePresets();
  resetDefaults();
  loadScenarios();
  renderScenarios();
  buildMethodology();

  NUM_FIELDS.forEach((f) => $(f).addEventListener("input", render));
  $("burnIn").addEventListener("change", render);
  $("packageType").addEventListener("change", applyPackage);
  $("ballCount").addEventListener("input", () => { /* keep manual package cost unless repicked */ render(); });

  $("btnReset").addEventListener("click", resetDefaults);
  $("btnSaveScenario").addEventListener("click", saveScenario);
  $("btnClearScenarios").addEventListener("click", () => { scenarios = []; persistScenarios(); renderScenarios(); });
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  initTooltips();
  render();
}

document.addEventListener("DOMContentLoaded", init);
