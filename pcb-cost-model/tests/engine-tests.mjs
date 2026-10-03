#!/usr/bin/env node
/* ============================================================================
 * engine-tests.mjs — golden + invariant test suite for the PCB cost engine.
 *   node pcb-cost-model/tests/engine-tests.mjs
 * No framework; exits non-zero on failure. Update GOLDEN values deliberately
 * whenever coefficients are re-calibrated (and say so in the commit message).
 * ==========================================================================*/
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = ["data.js", "model.js", "ai.js", "import.js"]
  .map((f) => readFileSync(join(root, f), "utf8")).join("\n");
const g = {};
new Function(
  "g",
  src + `
  Object.assign(g, { computePcb, pcbSensitivity, mcSimulate, lotFactor, sanitizeChanges,
    localInsights, extractIdeasJson, mdToHtml, GerberImport, DEFAULTS, EXAMPLES, REGIONS,
    FINISHES, DUTY_LANES, byId });`
)(g);

let pass = 0, fail = 0;
const t = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ " + name + (detail ? " — " + detail : "")); }
};
const near = (a, b, relTol) => Math.abs(a - b) <= Math.abs(b) * relTol;

console.log("— reconciliation & goldens —");
{
  const r = g.computePcb(g.DEFAULTS);
  const sum = r.components.reduce((s, c) => s + c.value, 0);
  t("breakdown sums to total cost", near(sum, r.totalCost, 1e-9), `${sum} vs ${r.totalCost}`);
  // GOLDEN: 2026 v2 calibration anchor (procCal 0.90). Update deliberately.
  t("golden: default 4L automotive fab cost ≈ $6.80", near(r.totalCost, 6.80, 0.02), `$${r.totalCost.toFixed(3)}`);
}
for (const ex of g.EXAMPLES) {
  const r = g.computePcb(ex.input);
  t(`in-band: ${ex.name}`, r.price >= r.benchmark.lo && r.price <= r.benchmark.hi,
    `price $${r.price.toFixed(2)} vs band $${r.benchmark.lo.toFixed(2)}–$${r.benchmark.hi.toFixed(2)}`);
}

console.log("— utilisation (review B1) —");
{
  const c70 = g.computePcb({ ...g.DEFAULTS, utilization: 70 }).totalCost;
  const c80 = g.computePcb({ ...g.DEFAULTS, utilization: 80 }).totalCost;
  const c90 = g.computePcb({ ...g.DEFAULTS, utilization: 90 }).totalCost;
  t("utilisation is a live cost driver (70% > 80% > 90%)", c70 > c80 && c80 > c90, `${c70}, ${c80}, ${c90}`);
  const sens = g.pcbSensitivity(g.DEFAULTS, 15);
  const util = sens.find((s) => s.label === "Panel utilisation");
  t("utilisation shows non-zero sensitivity", util && util.swing > 5, util && `±${util.swing.toFixed(1)}%`);
}

console.log("— lot-size curve —");
{
  t("proto ≈3.7× at qty 10", near(g.lotFactor(10), 3.71, 0.02), g.lotFactor(10).toFixed(2));
  t("volume ≈1.0× at qty 3000+", g.lotFactor(3000) < 1.01, g.lotFactor(3000).toFixed(3));
  const q = [10, 100, 1000, 10000].map((n) => g.computePcb({ ...g.DEFAULTS, orderQty: n }).totalCost);
  t("cost strictly decreases with quantity", q[0] > q[1] && q[1] > q[2] && q[2] > q[3], q.map((x) => x.toFixed(2)).join(" > "));
}

console.log("— gold sensitivity —");
{
  const a = g.computePcb({ ...g.DEFAULTS, finish: "enig", goldPrice: 4100 }).surfaceFin;
  const b = g.computePcb({ ...g.DEFAULTS, finish: "enig", goldPrice: 4510 }).surfaceFin;
  const gain = (b / a - 1) * 100;
  t("+10% gold → ENIG +6.5–7.5% (research: 6.8%)", gain > 6.5 && gain < 7.5, gain.toFixed(2) + "%");
  const osp = g.computePcb({ ...g.DEFAULTS, finish: "osp", goldPrice: 8000 }).surfaceFin;
  const osp2 = g.computePcb({ ...g.DEFAULTS, finish: "osp", goldPrice: 2000 }).surfaceFin;
  t("gold-free finish immune to gold price", near(osp, osp2, 1e-9));
}

console.log("— config validation (review B2) —");
t("any-layer + through-vias flagged", g.computePcb({ ...g.DEFAULTS, pcbType: "anylayer", via: "through" }).configIssues.length === 1);
t("flex + FR-4 flagged", g.computePcb({ ...g.DEFAULTS, pcbType: "flex", material: "fr4_std" }).configIssues.length >= 1);
t("2-layer + buried vias flagged", g.computePcb({ ...g.DEFAULTS, layerCount: 2, via: "buried" }).configIssues.length >= 1);
t("clean config has no issues", g.computePcb(g.DEFAULTS).configIssues.length === 0);

console.log("— landed cost & assembly —");
{
  const r = g.computePcb({ ...g.DEFAULTS, destMarket: "us", dutyPct: 38, freightPerBoard: 0.15 });
  t("landed = price × 1.38 + freight", near(r.landed.total, r.price * 1.38 + 0.15, 1e-9), r.landed.total.toFixed(3));
  const a = g.computePcb({ ...g.DEFAULTS, assemblyOn: true, smtCount: 250, thtCount: 10, sides: 2, bomCost: 18 });
  t("PCBA = board + BOM + assembly", near(a.pcbaCost, a.totalCost + 18 + a.assembly.assyProc + a.assembly.assyNre, 1e-9));
  t("assembly routing steps appear", a.routing.some((s) => s.name.startsWith("SMT placement")));
}

console.log("— Monte Carlo —");
{
  const mc = g.mcSimulate(g.DEFAULTS, 300);
  const base = g.computePcb(g.DEFAULTS).totalCost;
  t("P10 < P50 < P90", mc.p10 < mc.p50 && mc.p50 < mc.p90, `${mc.p10.toFixed(2)} / ${mc.p50.toFixed(2)} / ${mc.p90.toFixed(2)}`);
  t("P50 within 5% of point estimate", near(mc.p50, base, 0.05));
}

console.log("— AI layer —");
{
  const changes = g.sanitizeChanges({ layerCount: "8", via: "micro1", finish: "nope", evil: "x", impedance: 1, boardW: -5 });
  t("sanitizeChanges keeps valid, drops invalid",
    changes.layerCount === 8 && changes.via === "micro1" && changes.impedance === true &&
    !("finish" in changes) && !("evil" in changes) && !("boardW" in changes), JSON.stringify(changes));
  const auto = { ...g.DEFAULTS, finish: "enig", quality: "automotive" };
  const li = g.localInsights(auto, g.computePcb(auto));
  const finishIdea = li.ideas.find((i) => i.title.startsWith("Finish:"));
  t("automotive finish downgrade suggests immersion SILVER, not tin (B5)",
    finishIdea && finishIdea.changes.finish === "imag", finishIdea && JSON.stringify(finishIdea.changes));
  const utilIdea = g.localInsights({ ...g.DEFAULTS, utilization: 70 }, g.computePcb({ ...g.DEFAULTS, utilization: 70 }))
    .ideas.find((i) => i.title.includes("utilisation"));
  t("utilisation idea now fires with a real saving (B1)", utilIdea && utilIdea.saving > 0.05, utilIdea && `$${utilIdea.saving.toFixed(2)}`);
  const ex = g.extractIdeasJson('text\n```json\n[{"title":"t","changes":{"layerCount":8,"bogus":1}}]\n```\nrest');
  t("extractIdeasJson parses + sanitizes + strips", ex.ideas.length === 1 && ex.ideas[0].changes.layerCount === 8 &&
    !("bogus" in ex.ideas[0].changes) && !ex.stripped.includes("```"));
  t("mdToHtml escapes HTML", !g.mdToHtml("<script>alert(1)</script>").includes("<script>"));
}

console.log("— import parsers —");
{
  const gerber = "%FSLAX34Y34*%\n%MOMM*%\nX0Y0D02*\nX1000000Y800000D01*\nX0Y800000D01*\n";
  const ext = g.GerberImport.parseGerberExtents(gerber);
  t("Gerber extents 100×80 mm from 3.4 format", ext && near(ext.w, 100, 0.01) && near(ext.h, 80, 0.01), JSON.stringify(ext));
  const drl = "M48\nMETRIC\nT01C0.300\nT02C1.100\n%\nT01\nX10000Y10000\nX20000Y10000\nT02\nX30000Y20000\nM30\n";
  const d = g.GerberImport.parseExcellon(drl);
  t("Excellon: 3 holes, min tool 0.3 mm", d && d.holes === 3 && near(d.minToolMm, 0.3, 0.01), JSON.stringify(d));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
