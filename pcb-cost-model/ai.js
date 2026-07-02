/* ============================================================================
 * ai.js — AI insights & idea generation for the PCB should-cost model.
 *
 * Two engines:
 *  1. localInsights()  — deterministic, always-on "AI advisor". Generates
 *     cost-reduction ideas, alternative-design ideas, quantified savings and a
 *     narrative from the computed result. No network, no key.
 *  2. claudeGenerate()  — optional live generation via the Claude API, called
 *     directly from the browser with the user's own API key
 *     (anthropic-dangerous-direct-browser-access). Model is user-selectable
 *     (defaults to claude-opus-4-8).
 * ==========================================================================*/

/* ---------- 1. Deterministic insight / idea engine ---------- */
function localInsights(input, r) {
  const ideas = [];
  const add = (title, body, saving) => ideas.push({ title, body, saving });
  const money = (v) => "$" + v.toFixed(2);

  const total = r.totalCost;
  // Rank cost categories to target the biggest levers first.
  const cats = [...r.components].sort((a, b) => b.value - a.value);
  const top = cats[0];

  // Idea: layer reduction (biggest structural lever)
  if (r.L >= 6) {
    const test = computePcb({ ...input, layerCount: r.L - 2 });
    const save = total - test.totalCost;
    if (save > 0.05) add(
      `Cut ${r.L}→${r.L - 2} layers if routing allows`,
      `Each layer pair removes imaging, etch, AOI, a share of lamination/drilling and compounds yield. Consider higher-density routing (finer lines or HDI) to collapse two signal layers into one.`,
      save);
  }
  // Idea: HDI vs through for high layer counts
  if (r.L >= 8 && input.via === "through") {
    add(`Evaluate blind/buried or HDI vias`,
      `An ${r.L}-layer through-via stack wastes routing channels and forces large drills. Blind/buried vias or a 1+N+1 HDI build can reduce layer count — trading extra lamination cost for fewer layers overall.`, null);
  }
  // Idea: finish downgrade
  const finish = byId(FINISHES, input.finish);
  if (finish.costDm2 >= 0.4 && input.quality !== "aerospace") {
    const cheaper = input.quality === "automotive" ? "isn" : "osp";
    const test = computePcb({ ...input, finish: cheaper });
    const save = total - test.totalCost;
    if (save > 0.02) add(
      `Finish: ${finish.label} → ${byId(FINISHES, cheaper).label}`,
      `Surface finish is a pure adder. If the assembly and reliability requirements permit, a lower-cost finish keeps solderability at less cost. Verify fine-pitch, wire-bond and shelf-life needs first.`,
      save);
  }
  // Idea: panel utilisation
  if (input.utilization < 82) {
    const test = computePcb({ ...input, utilization: Math.min(85, input.utilization + 10) });
    const save = total - test.totalCost;
    if (save > 0.02) add(
      `Improve panel utilisation ${input.utilization}%→${Math.min(85, input.utilization + 10)}%`,
      `Re-pitch the array, rotate the board, or pick a panel size that nests more up. Material and per-board processing scale directly with utilisation — one of the cheapest wins available.`,
      save);
  }
  // Idea: material hybrid for RF
  if (byId(MATERIALS, input.material).family === "rf" && r.L > 2) {
    add(`Hybrid RF stack-up`,
      `Full-board ${byId(MATERIALS, input.material).label} is expensive. Place RF laminate only on the layers carrying high-frequency nets and FR-4 High-Tg elsewhere — typically 40–60% material saving with equal electrical performance.`, null);
  }
  // Idea: trace relaxation
  if (["3mil", "2mil"].includes(input.trace) && input.quality !== "consumer") {
    const test = computePcb({ ...input, trace: "4mil" });
    const save = total - test.totalCost;
    if (save > 0.02) add(
      `Relax min trace to 4 mil where signal integrity allows`,
      `Sub-4-mil lines push imaging to advanced LDI/mSAP and depress yield. Keep fine lines only on the layers/nets that truly need them.`,
      save);
  }
  // Idea: volume consolidation
  if (input.orderQty < 10000) {
    const test = computePcb({ ...input, orderQty: input.orderQty * 3 });
    const save = total - test.totalCost;
    if (save > 0.02) add(
      `Consolidate volume (${input.orderQty.toLocaleString()} → ${(input.orderQty * 3).toLocaleString()})`,
      `Tooling/NRE (photo tools, drill program, test fixture, any HDI laser program) amortise over the order. Combining releases or panel-sharing across products lowers NRE per board.`,
      save);
  }
  // Idea: region
  if (input.region !== "china" && input.region !== "vietnam") {
    const test = computePcb({ ...input, region: "china" });
    const save = total - test.totalCost;
    if (save > 0.05) add(
      `Regional sourcing trade-off`,
      `Moving fabrication to a lower-labour region cuts processing and overhead, but weigh logistics, lead time, IP, tariffs and automotive-qualification of the fab before switching.`,
      save);
  }

  ideas.sort((a, b) => (b.saving || 0) - (a.saving || 0));

  // Narrative
  const drivers = cats.slice(0, 3).map((c) => `${c.label} (${((c.value / total) * 100).toFixed(0)}%)`).join(", ");
  const narrative =
    `This ${r.L}-layer ${r.type.label.split(" (")[0]} board costs ~${money(total)} to fabricate ` +
    `(quoted ~${money(r.price)}). Cost is led by ${drivers}. ` +
    (r.yld < 0.8 ? `Yield is low (${(r.yld * 100).toFixed(0)}%) — the biggest hidden lever is design-for-yield. ` : "") +
    (r.nrePerBoard > total * 0.15 ? `NRE dominates at this volume (${money(r.nrePerBoard)}/board) — amortising over more units is the fastest reduction. ` : "") +
    `Total realistic saving from the ideas below: up to ${money(ideas.reduce((s, i) => s + (i.saving || 0), 0))}/board.`;

  return { ideas, narrative, topDriver: top };
}

/* Render local insights to HTML. */
function renderLocalInsights(input, r) {
  const { ideas, narrative } = localInsights(input, r);
  let html = `<h4>Cost narrative</h4><p>${narrative}</p><h4>Cost-reduction ideas (ranked)</h4><ul>`;
  ideas.forEach((i) => {
    const s = i.saving ? ` <strong>save ~$${i.saving.toFixed(2)}/bd</strong>` : "";
    html += `<li><strong>${i.title}.</strong>${s} ${i.body}</li>`;
  });
  html += "</ul>";
  return html;
}

/* ---------- 2. Live Claude generation (bring-your-own-key) ---------- */
function buildClaudePrompt(input, r) {
  const b = r.components.map((c) => `- ${c.label}: $${c.value.toFixed(3)}/bd (${((c.value / r.totalCost) * 100).toFixed(0)}%)`).join("\n");
  return `You are a Tier-1 automotive PCB cost engineer performing a should-cost review.

DESIGN:
- Type: ${r.type.label}
- Layers: ${r.L}
- Board: ${input.boardW}×${input.boardH} mm (${r.area.toFixed(2)} dm²)
- Material: ${byId(MATERIALS, input.material).label}
- Copper: ${byId(COPPER_WEIGHTS, input.copperOuter).label} outer / ${byId(COPPER_WEIGHTS, input.copperInner).label} inner
- Vias: ${byId(VIA_TYPES, input.via).label}
- Min trace/space: ${byId(TRACE_CLASSES, input.trace).label}
- Fine-line process: ${byId(FAB_PROCESSES, input.fabProcess).label}
- Impedance controlled: ${input.impedance ? "yes" : "no"}${input.backdrill ? ", back-drilled" : ""}${input.viafill ? ", via-fill/cap" : ""}
- Surface finish: ${byId(FINISHES, input.finish).label}
- Quality class: ${byId(QUALITY_LEVELS, input.quality).label}
- Region: ${byId(REGIONS, input.region).label}
- Order qty: ${input.orderQty}
- Panel utilisation: ${input.utilization}%
- Computed yield: ${(r.yld * 100).toFixed(0)}%

COMPUTED COST STACK (fab cost ~$${r.totalCost.toFixed(2)}/bd, quoted ~$${r.price.toFixed(2)}/bd):
${b}

TASK: Give an engineering-grade should-cost review. Respond in Markdown with exactly these sections:
## Cost drivers — the 3 biggest levers and why.
## Design-for-cost ideas — 4-6 concrete, quantified-where-possible changes (call out stack-up / layer-count / via technology first).
## Risks & missing processes — anything a fab would flag or that's under-specified (back-drill, via-fill, IST/CAF coupons, PPAP, etc.).
## Alternative concepts — 1-2 different stack-up or technology approaches worth quoting.
Be specific and numeric. Assume 2025-2026 pricing. Do not invent exact supplier prices; use realistic ranges.`;
}

async function claudeGenerate({ apiKey, model, input, r, onChunk }) {
  const body = {
    model: model || "claude-opus-4-8",
    max_tokens: 1800,
    system: "You are a senior Tier-1 automotive PCB should-cost engineer. Be concise, numeric, and practical. Output clean Markdown.",
    messages: [{ role: "user", content: buildClaudePrompt(input, r) }],
  };
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { const j = await resp.json(); msg = j.error?.message || msg; } catch (e) {}
    throw new Error(msg);
  }
  const data = await resp.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return text || "(no text returned)";
}

/* Minimal, safe Markdown → HTML for the AI output panel. */
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  let html = "", inList = false;
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  for (let raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h4>${inline(line.replace(/^#{1,6}\s/, ""))}</h4>`;
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`;
    } else if (/^\s*\d+\.\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`;
    } else if (line === "") {
      if (inList) { html += "</ul>"; inList = false; }
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html;
}
