/* ============================================================================
 * ai.js — AI insights & idea generation for the PCB should-cost model — v2.
 *
 * Engines:
 *  1. localInsights()   — deterministic offline advisor (no key, no network).
 *  2. claudeReview()    — streaming should-cost review via the Claude API
 *                         (bring-your-own key, direct browser call).
 *  3. claudeOptimize()  — AGENTIC optimizer: Claude gets computePcb() as a
 *                         tool and runs its own verified what-if loop.
 *  4. claudeChat()      — follow-up conversation grounded in the design.
 *
 * v2 review fixes: immersion-silver (not tin) for automotive downgrades [B5];
 * AbortController + timeout + typed HTTP errors [B4]; ideas returned as a
 * machine-readable JSON block so the UI can render one-click Apply buttons.
 * ==========================================================================*/

const AI_TIMEOUT_MS = 120000;

/* Parameters Claude / Apply-buttons are allowed to change, with validation. */
const AI_PARAM_TABLES = {
  pcbType: () => PCB_TYPES, material: () => MATERIALS, copperInner: () => COPPER_WEIGHTS,
  copperOuter: () => COPPER_WEIGHTS, copperFoil: () => COPPER_FOILS, fabProcess: () => FAB_PROCESSES,
  trace: () => TRACE_CLASSES, via: () => VIA_TYPES, finish: () => FINISHES,
  maskColor: () => MASK_COLORS, quality: () => QUALITY_LEVELS, region: () => REGIONS,
};
const AI_NUM_PARAMS = ["boardW","boardH","layerCount","boardThickness","panelW","panelH",
  "utilization","holeDensity","orderQty","overheadPct","marginPct","marketSurcharge",
  "goldPrice","dutyPct","freightPerBoard","smtCount","thtCount","sides","bomCost"];
const AI_BOOL_PARAMS = ["impedance","backdrill","viafill","silkscreen","assemblyOn"];

function sanitizeChanges(changes) {
  const out = {};
  if (!changes || typeof changes !== "object") return out;
  for (const [k, v] of Object.entries(changes)) {
    if (AI_PARAM_TABLES[k]) {
      if (AI_PARAM_TABLES[k]().some((x) => x.id === v)) out[k] = v;
    } else if (AI_NUM_PARAMS.includes(k)) {
      const n = Number(v);
      if (isFinite(n) && n >= 0) out[k] = n;
    } else if (AI_BOOL_PARAMS.includes(k)) {
      out[k] = !!v;
    }
  }
  return out;
}

/* ---------- 1. Deterministic insight / idea engine ---------- */
function localInsights(input, r) {
  const ideas = [];
  // Each idea carries optional `changes` so the UI can render an Apply button.
  const add = (title, body, saving, changes) => ideas.push({ title, body, saving, changes });
  const money = (v) => "$" + v.toFixed(2);
  const total = r.totalCost;
  const cats = [...r.components].sort((a, b) => b.value - a.value);

  if (r.L >= 6) {
    const test = computePcb({ ...input, layerCount: r.L - 2 });
    const save = total - test.totalCost;
    if (save > 0.05) add(
      `Cut ${r.L}→${r.L - 2} layers if routing allows`,
      `Each layer pair removes imaging, etch, AOI, a share of lamination/drilling and compounds yield. Consider higher-density routing (finer lines or HDI) to collapse two signal layers into one.`,
      save, { layerCount: r.L - 2 });
  }
  if (r.L >= 8 && input.via === "through") {
    add(`Evaluate blind/buried or HDI vias`,
      `An ${r.L}-layer through-via stack wastes routing channels and forces large drills. Blind/buried vias or a 1+N+1 HDI build can reduce layer count — trading extra lamination cost for fewer layers overall.`,
      null, { via: "buried" });
  }
  const finish = byId(FINISHES, input.finish);
  if (finish.goldFrac >= 0.5 && input.quality !== "aerospace") {
    // Automotive downgrade target is immersion SILVER (ImSn tin-whisker risk
    // makes immersion tin a poor automotive suggestion). [review B5]
    const cheaper = input.quality === "automotive" ? "imag" : "osp";
    const test = computePcb({ ...input, finish: cheaper });
    const save = total - test.totalCost;
    if (save > 0.02) add(
      `Finish: ${finish.label} → ${byId(FINISHES, cheaper).label}`,
      `Gold-bearing finishes are exposed to 2026 gold (~70% of ENIG cost is metal). If assembly, fine-pitch and reliability requirements permit, a gold-free finish removes that exposure. Verify wire-bond, shelf-life and connector-wear needs first.`,
      save, { finish: cheaper });
  }
  if (input.utilization < 82) {
    const target = Math.min(85, input.utilization + 10);
    const test = computePcb({ ...input, utilization: target });
    const save = total - test.totalCost;
    if (save > 0.02) add(
      `Improve panel utilisation ${input.utilization}%→${target}%`,
      `Re-pitch the array, rotate the board, or pick a panel size that nests more up. Material and panel-area processing scale directly with the board's true panel share — one of the cheapest wins available.`,
      save, { utilization: target });
  }
  if (byId(MATERIALS, input.material).family === "rf" && r.L > 2) {
    add(`Hybrid RF stack-up`,
      `Full-board ${byId(MATERIALS, input.material).label} is expensive (PTFE laminate is 10–20× FR-4). Place RF laminate only on the layers carrying high-frequency nets and FR-4 High-Tg elsewhere — typically 40–60% material saving with equal electrical performance.`, null, null);
  }
  if (["3mil", "2mil", "1mil"].includes(input.trace) && input.quality !== "consumer") {
    const test = computePcb({ ...input, trace: "4mil" });
    const save = total - test.totalCost;
    if (save > 0.02) add(
      `Relax min trace to 4 mil where signal integrity allows`,
      `Sub-4-mil lines push imaging toward advanced LDI/mSAP and depress yield. Keep fine lines only on the layers/nets that truly need them.`,
      save, { trace: "4mil" });
  }
  if (input.orderQty < 2000) {
    const test = computePcb({ ...input, orderQty: input.orderQty * 3 });
    const save = total - test.totalCost;
    if (save > 0.02) add(
      `Consolidate volume (${input.orderQty.toLocaleString()} → ${(input.orderQty * 3).toLocaleString()})`,
      `You are at ${r.lot.toFixed(2)}× on the lot-size curve. Combining releases or panel-sharing moves you toward volume pricing and amortises tooling/NRE (photo tools, drill program, fixtures) over more boards.`,
      save, { orderQty: input.orderQty * 3 });
  }
  if ((input.dutyPct || 0) >= 15) {
    const alt = input.region === "china" ? "vietnam" : "mexico";
    const lane = DUTY_LANES[input.destMarket];
    const altDuty = lane && lane.rates[alt] != null ? lane.rates[alt] : 0;
    const test = computePcb({ ...input, region: alt, dutyPct: altDuty });
    if (test.landed && r.landed) {
      const save = r.landed.total - test.landed.total;
      if (save > 0.05) add(
        `Re-source ${byId(REGIONS, input.region).label} → ${byId(REGIONS, alt).label} for this duty lane`,
        `At ${input.dutyPct}% duty the landed cost dominates the fab-cost difference. Weigh qualification, logistics and lead time — but the duty math favours the move.`,
        save, { region: alt, dutyPct: altDuty });
    }
  }
  if (input.region !== "china" && input.region !== "vietnam" && (input.dutyPct || 0) === 0) {
    const test = computePcb({ ...input, region: "china" });
    const save = total - test.totalCost;
    if (save > 0.05) add(
      `Regional sourcing trade-off`,
      `Moving fabrication to a lower-cost region cuts processing and overhead, but weigh logistics, tariffs (set the duty lane in Landed Cost), IP and automotive qualification of the fab before switching.`,
      save, { region: "china" });
  }

  ideas.sort((a, b) => (b.saving || 0) - (a.saving || 0));

  const drivers = cats.slice(0, 3).map((c) => `${c.label} (${((c.value / total) * 100).toFixed(0)}%)`).join(", ");
  const narrative =
    `This ${r.L}-layer ${r.type.label.split(" (")[0]} board costs ~${money(total)} to fabricate ` +
    `(quoted ~${money(r.price)}${r.landed ? `, landed ~${money(r.landed.total)}` : ""}${r.pcbaCost != null ? `; assembled PCBA ~${money(r.pcbaCost)}` : ""}). ` +
    `Cost is led by ${drivers}. ` +
    (r.lot > 1.2 ? `Lot-size premium is ${r.lot.toFixed(2)}× — volume is the fastest lever. ` : "") +
    (r.yld < 0.8 ? `Yield is low (${(r.yld * 100).toFixed(0)}%) — design-for-yield is the biggest hidden lever. ` : "") +
    (r.nrePerBoard > total * 0.15 ? `NRE dominates at this volume (${money(r.nrePerBoard)}/board). ` : "") +
    `Total realistic saving from the ideas below: up to ${money(ideas.reduce((s, i) => s + (i.saving || 0), 0))}/board.`;

  return { ideas, narrative };
}

function renderLocalInsights(input, r) {
  const { ideas, narrative } = localInsights(input, r);
  let html = `<h4>Cost narrative</h4><p>${narrative}</p><h4>Cost-reduction ideas (ranked)</h4><ul>`;
  ideas.forEach((i, n) => {
    const s = i.saving ? ` <strong>save ~$${i.saving.toFixed(2)}/bd</strong>` : "";
    const btn = i.changes ? ` <button class="btn-apply" data-idea="${n}" type="button">Apply</button>` : "";
    html += `<li><strong>${i.title}.</strong>${s} ${i.body}${btn}</li>`;
  });
  html += "</ul>";
  return { html, ideas };
}

/* ---------- Shared Claude plumbing ---------- */
function describeHttpError(status, apiMsg) {
  if (status === 401) return "Invalid API key (401). Check the key in the field above.";
  if (status === 403) return "Key lacks permission (403).";
  if (status === 429) return "Rate limited (429) — wait a moment and retry.";
  if (status === 529) return "Anthropic API overloaded (529) — retry shortly.";
  if (status >= 500) return `Anthropic server error (${status}) — retry shortly.`;
  return apiMsg || `HTTP ${status}`;
}

async function anthropicRequest(apiKey, body, signal) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    let apiMsg = "";
    try { const j = await resp.json(); apiMsg = j.error?.message || ""; } catch (e) {}
    throw new Error(describeHttpError(resp.status, apiMsg));
  }
  return resp;
}

/* Streaming call: emits text deltas via onText, resolves with full text. */
async function claudeStreamText({ apiKey, model, system, messages, maxTokens = 2000, onText, signal }) {
  const resp = await anthropicRequest(apiKey, {
    model, max_tokens: maxTokens, system, messages, stream: true,
  }, signal);
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "", stopReason = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      let ev; try { ev = JSON.parse(payload); } catch (e) { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        full += ev.delta.text;
        if (onText) onText(ev.delta.text, full);
      } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
        stopReason = ev.delta.stop_reason;
      } else if (ev.type === "error") {
        throw new Error(ev.error?.message || "stream error");
      }
    }
  }
  if (stopReason === "refusal") throw new Error("The model declined this request (refusal).");
  return full;
}

/* Non-streaming call returning the full message (for the tool-use loop). */
async function claudeComplete({ apiKey, model, system, messages, tools, maxTokens = 2000, signal }) {
  const body = { model, max_tokens: maxTokens, system, messages };
  if (tools) body.tools = tools;
  const resp = await anthropicRequest(apiKey, body, signal);
  return resp.json();
}

/* ---------- Context builders ---------- */
function buildDesignContext(input, r) {
  const b = r.components.map((c) => `- ${c.label}: $${c.value.toFixed(3)}/bd (${((c.value / r.totalCost) * 100).toFixed(0)}%)`).join("\n");
  return `DESIGN:
- Type: ${r.type.label} · ${r.L} layers · ${input.boardW}×${input.boardH} mm (${r.area.toFixed(2)} dm²)
- Material: ${byId(MATERIALS, input.material).label}; foil ${byId(COPPER_FOILS, input.copperFoil).label}
- Copper: ${byId(COPPER_WEIGHTS, input.copperOuter).label} outer / ${byId(COPPER_WEIGHTS, input.copperInner).label} inner
- Vias: ${byId(VIA_TYPES, input.via).label}; process ${byId(FAB_PROCESSES, input.fabProcess).label}; trace ${byId(TRACE_CLASSES, input.trace).label}
- Options: ${input.impedance ? "impedance " : ""}${input.backdrill ? "back-drill " : ""}${input.viafill ? "via-fill " : ""}
- Finish: ${byId(FINISHES, input.finish).label} @ gold $${input.goldPrice}/oz
- Quality: ${byId(QUALITY_LEVELS, input.quality).label}; region ${byId(REGIONS, input.region).label}; qty ${input.orderQty}
- Panel utilisation ${input.utilization}% (waste ×${r.waste.toFixed(2)}); lot factor ×${r.lot.toFixed(2)}; yield ${(r.yld * 100).toFixed(0)}%
${r.landed ? `- Landed: duty ${input.dutyPct}% + freight $${input.freightPerBoard} → $${r.landed.total.toFixed(2)}/bd\n` : ""}${r.pcbaCost != null ? `- PCBA: BOM $${input.bomCost} + assembly → $${r.pcbaCost.toFixed(2)}/bd\n` : ""}${r.configIssues.length ? "- CONFIG ISSUES: " + r.configIssues.join(" | ") + "\n" : ""}
COMPUTED COST STACK (fab cost $${r.totalCost.toFixed(2)}/bd, quoted $${r.price.toFixed(2)}/bd):
${b}`;
}

const IDEAS_JSON_INSTRUCTION = `
After the Markdown review, output a fenced \`\`\`json code block containing an array of directly applicable ideas:
[{"title": "...", "changes": {"<param>": <value>}, "note": "one line"}]
Allowed params and values: layerCount/boardW/boardH/utilization/orderQty/holeDensity/dutyPct (numbers);
via one of through|buried|micro1|micro2|micro3; trace one of 8mil|5mil|4mil|3mil|2mil|1mil;
finish one of hasl|lfhasl|osp|imag|isn|enig|enepig|epig|hardgold; material/region/quality/fabProcess/copperFoil by their ids;
impedance/backdrill/viafill (booleans). Only include changes you verified or strongly expect to save cost.`;

const REVIEW_SYSTEM = "You are a senior Tier-1 automotive PCB should-cost engineer. Be concise, numeric, and practical. Output clean Markdown. Do not invent exact supplier prices; use realistic 2025-2026 ranges.";

function buildReviewMessages(input, r) {
  return [{
    role: "user",
    content: `${buildDesignContext(input, r)}

TASK: Give an engineering-grade should-cost review with exactly these sections:
## Cost drivers — the 3 biggest levers and why.
## Design-for-cost ideas — 4-6 concrete, quantified-where-possible changes (stack-up / layer count / via technology first).
## Risks & missing processes — anything a fab would flag or that's under-specified.
## Alternative concepts — 1-2 different stack-up or technology approaches worth quoting.
${IDEAS_JSON_INSTRUCTION}`,
  }];
}

/* ---------- 2. Streaming review ---------- */
async function claudeReview({ apiKey, model, input, r, onText, signal }) {
  return claudeStreamText({
    apiKey, model, system: REVIEW_SYSTEM,
    messages: buildReviewMessages(input, r),
    maxTokens: 2200, onText, signal,
  });
}

/* ---------- 3. Agentic optimizer (tool-use loop) ---------- */
const OPTIMIZER_TOOL = {
  name: "evaluate_pcb_cost",
  description: "Recompute the PCB should-cost with parameter overrides applied to the current design. Returns fab cost, price, yield, top cost components, and any config issues. Use it to numerically verify every idea before recommending it.",
  input_schema: {
    type: "object",
    properties: {
      changes: {
        type: "object",
        description: "Partial input overrides, e.g. {\"layerCount\": 8, \"via\": \"micro1\", \"utilization\": 88}",
      },
      label: { type: "string", description: "Short name for this what-if" },
    },
    required: ["changes"],
  },
};

function runOptimizerTool(baseInput, rawChanges) {
  const changes = sanitizeChanges(rawChanges);
  const merged = { ...baseInput, ...changes };
  const r = computePcb(merged);
  const top = [...r.components].sort((a, b) => b.value - a.value).slice(0, 3)
    .map((c) => `${c.key} $${c.value.toFixed(2)}`).join(", ");
  return JSON.stringify({
    applied: changes,
    fabCost: +r.totalCost.toFixed(3),
    price: +r.price.toFixed(3),
    landed: r.landed ? +r.landed.total.toFixed(3) : null,
    pcbaCost: r.pcbaCost != null ? +r.pcbaCost.toFixed(3) : null,
    yieldPct: +(r.yld * 100).toFixed(1),
    lotFactor: +r.lot.toFixed(2),
    topComponents: top,
    configIssues: r.configIssues,
  });
}

async function claudeOptimize({ apiKey, model, input, r, onStatus, signal, maxIters = 8 }) {
  const messages = [{
    role: "user",
    content: `${buildDesignContext(input, r)}

TASK: Act as a cost optimizer. Use the evaluate_pcb_cost tool to test design/sourcing changes against the live cost model — try layer/via/stack-up moves first, then finish, utilisation, lot size, and region/duty. Test at least 4 distinct what-ifs, including at least one combination. Only recommend changes the tool confirmed. Then write a Markdown summary: baseline vs best variants (table), the recommended package of changes with verified total saving, and what to double-check with engineering.
${IDEAS_JSON_INSTRUCTION}`,
  }];
  let baselineNote = `Baseline: fab $${r.totalCost.toFixed(2)}, price $${r.price.toFixed(2)}.`;
  if (onStatus) onStatus("Optimizer running — Claude is testing what-ifs against the cost engine…");

  for (let i = 0; i < maxIters; i++) {
    const resp = await claudeComplete({
      apiKey, model, system: REVIEW_SYSTEM + " You have a cost-evaluation tool; use it before recommending anything. " + baselineNote,
      messages, tools: [OPTIMIZER_TOOL], maxTokens: 2400, signal,
    });
    if (resp.stop_reason === "refusal") throw new Error("The model declined this request (refusal).");
    if (resp.stop_reason !== "tool_use") {
      const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      return text || "(no text returned)";
    }
    messages.push({ role: "assistant", content: resp.content });
    const results = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      if (onStatus) onStatus(`Testing: ${block.input?.label || JSON.stringify(block.input?.changes || {}).slice(0, 60)}…`);
      let out;
      try { out = runOptimizerTool(input, block.input?.changes); }
      catch (e) { out = JSON.stringify({ error: String(e.message || e) }); }
      results.push({ type: "tool_result", tool_use_id: block.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Optimizer exceeded the iteration cap without a final answer.");
}

/* ---------- 4. Follow-up chat ---------- */
function newChatThread(input, r) {
  return [{
    role: "user",
    content: `${buildDesignContext(input, r)}

You are my PCB cost engineer for this design. Answer follow-up questions concisely and numerically; refer to the cost stack above. Reply "Ready." now.`,
  }, { role: "assistant", content: "Ready." }];
}
async function claudeChat({ apiKey, model, thread, question, onText, signal }) {
  thread.push({ role: "user", content: question });
  const answer = await claudeStreamText({
    apiKey, model, system: REVIEW_SYSTEM, messages: thread, maxTokens: 1200, onText, signal,
  });
  thread.push({ role: "assistant", content: answer });
  return answer;
}

/* ---------- Ideas JSON extraction + Markdown rendering ---------- */
function extractIdeasJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m) return { ideas: [], stripped: text };
  let ideas = [];
  try {
    const raw = JSON.parse(m[1]);
    if (Array.isArray(raw)) {
      ideas = raw.map((i) => ({
        title: String(i.title || "Idea").slice(0, 120),
        note: String(i.note || "").slice(0, 200),
        changes: sanitizeChanges(i.changes),
      })).filter((i) => Object.keys(i.changes).length > 0);
    }
  } catch (e) { /* malformed block — ignore */ }
  return { ideas, stripped: text.replace(m[0], "").trim() };
}

/* Minimal, safe Markdown → HTML (escapes first, then inline formatting). */
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  let html = "", inList = false, inTable = false;
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  const closeAll = () => { if (inList) { html += "</ul>"; inList = false; } if (inTable) { html += "</table>"; inTable = false; } };
  for (let raw of lines) {
    const line = raw.trimEnd();
    if (/^\|.*\|$/.test(line.trim())) {
      if (/^\|[\s:|-]+\|$/.test(line.trim())) continue;         // separator row
      if (inList) { html += "</ul>"; inList = false; }
      if (!inTable) { html += '<table class="ai-table">'; inTable = true; }
      const cells = line.trim().slice(1, -1).split("|").map((c) => inline(c.trim()));
      html += "<tr><td>" + cells.join("</td><td>") + "</td></tr>";
    } else if (/^#{1,6}\s/.test(line)) {
      closeAll();
      html += `<h4>${inline(line.replace(/^#{1,6}\s/, ""))}</h4>`;
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (inTable) { html += "</table>"; inTable = false; }
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`;
    } else if (/^\s*\d+\.\s+/.test(line)) {
      if (inTable) { html += "</table>"; inTable = false; }
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`;
    } else if (line === "") {
      closeAll();
    } else {
      closeAll();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeAll();
  return html;
}
