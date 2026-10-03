#!/usr/bin/env node
/* ============================================================================
 * build.mjs — regenerates the single-file bundles for both tools so they can
 * never silently drift from the source files (review B11).
 *
 *   node build.mjs          # rebuild soc-cost-model.html + pcb-cost-model.html
 *   node build.mjs --check  # exit 1 if bundles are stale (for CI)
 * ==========================================================================*/
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TOOLS = [
  { dir: "soc-cost-model", out: "soc-cost-model.html", scripts: ["data.js", "model.js", "methodology.js", "app.js"] },
  { dir: "pcb-cost-model", out: "pcb-cost-model.html", scripts: ["data.js", "model.js", "ai.js", "import.js", "methodology.js", "app.js"] },
];

const check = process.argv.includes("--check");
let stale = false;

for (const t of TOOLS) {
  const html = readFileSync(join(t.dir, "index.html"), "utf8");
  const css = readFileSync(join(t.dir, "style.css"), "utf8");
  const js = t.scripts.map((f) => readFileSync(join(t.dir, f), "utf8")).join("\n");

  const scriptBlock = t.scripts.map((f) => `  <script src="${f}"></script>`).join("\n");
  let out = html.replace('  <link rel="stylesheet" href="style.css" />', "  <style>\n" + css + "\n  </style>");
  if (!out.includes("<style>")) throw new Error(`${t.dir}: stylesheet link not found — build aborted`);
  out = out.replace(scriptBlock, "  <script>\n" + js + "\n  </script>");
  if (out.includes('src="data.js"')) throw new Error(`${t.dir}: script block not fully inlined — check the tag list in build.mjs`);

  const dest = join(t.dir, t.out);
  const current = (() => { try { return readFileSync(dest, "utf8"); } catch { return null; } })();
  if (check) {
    if (current !== out) { console.error(`STALE: ${dest} — run 'node build.mjs'`); stale = true; }
    else console.log(`ok: ${dest}`);
  } else {
    writeFileSync(dest, out);
    console.log(`built: ${dest} (${out.length.toLocaleString()} bytes)`);
  }
}
if (check && stale) process.exit(1);
