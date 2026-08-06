/**
 * Extract the DFM/DFA rule library, the geometry advisors and the idea levers
 * straight from the engine source, so the reference document is generated from
 * the code rather than transcribed from it.
 *
 * Transcription rots. This reads the same files the engine runs, captures each
 * rule's guard condition, severity, category, title, saving and recommendation,
 * and writes JSON for the PDF builder. Re-run it after any rule change and the
 * document is current again.
 *
 *   npx tsx scripts/extract-rule-library.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ENGINE = 'src/engine';

export interface Rule {
  /** Sequence within its source file — the rules have no ids in code. */
  n: number;
  kind: 'dfm' | 'dfa' | 'optimisation' | 'lever' | 'advisor';
  source: string;
  line: number;
  /** The `if (...)` that gates this rule — the actual threshold. */
  condition: string;
  /** Nearest preceding `//` comment: the engineering reason. */
  note: string;
  severity?: string;
  category?: string;
  title: string;
  description?: string;
  recommendation?: string;
  savingPct?: string;
  risk?: string;
  /** Commodity gate, when the rule sits inside one. */
  commodity?: string;
  /** Idea levers only: who owns it, when it lands, and the engineering case. */
  lever?: string;
  timeframe?: string;
  justification?: string;
}

/** An expression-valued field, e.g. `expectedSavingPct: Math.min(8, 3 + x)`. */
function exprField(block: string, name: string): string | undefined {
  const at = new RegExp(`\\b${name}\\s*:\\s*`).exec(block);
  if (!at) return undefined;
  let i = at.index + at[0].length;
  let depth = 0;
  const start = i;
  // Stop at the comma or newline that ends the property, but only at depth 0 —
  // a naive scan cut `Math.min(8, 3 + x)` in half at its internal comma.
  for (; i < block.length; i++) {
    const ch = block[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') { if (depth === 0) break; depth--; }
    else if ((ch === ',' || ch === '\n') && depth === 0) break;
  }
  return block.slice(start, i).replace(/\s+/g, ' ').trim() || undefined;
}

/** Field out of an object literal. Handles '…', "…" and `…` (template) values. */
function field(block: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*:\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"|\`((?:[^\`\\\\]|\\\\.)*)\`|([0-9.]+))`, 's');
  const m = re.exec(block);
  if (!m) return undefined;
  const v = m[1] ?? m[2] ?? m[3] ?? m[4];
  return v?.replace(/\s+/g, ' ').trim();
}

/** Collect the object literal that starts at `openIdx` (the char after `push(`). */
function literalAt(src: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx, openIdx + 2000);
}

/** Walk backwards for the guard condition and the comment explaining it. */
function contextBefore(lines: string[], lineIdx: number): { condition: string; note: string } {
  let condition = '';
  let note = '';
  for (let i = lineIdx; i >= 0 && i > lineIdx - 14; i--) {
    const t = lines[i].trim();
    if (!condition) {
      const m = /^(?:\}\s*)?(?:else\s+)?if\s*\((.*)/.exec(t);
      if (m) {
        // A condition can wrap over several lines; take until the trailing `) {`.
        let cond = m[1];
        let j = i;
        while (!/\)\s*\{\s*$/.test(lines[j]) && j < lineIdx) { j++; cond += ' ' + lines[j].trim(); }
        condition = cond.replace(/\)\s*\{\s*$/, '').replace(/\s+/g, ' ').trim();
      }
    }
    if (!note) {
      const c = /^\/\/\s?(.*)/.exec(t);
      const isDivider = (t: string) => /^[─═\-=\s]*$/.test(t) || /^[─═]{3}/.test(t.trim());
      if (c && !/eslint|@ts-|prettier/.test(c[1]) && !isDivider(c[1])) {
        // Gather a contiguous comment block upward.
        const parts = [c[1]];
        for (let k = i - 1; k >= 0; k--) {
          const p = /^\/\/\s?(.*)/.exec(lines[k].trim());
          if (!p) break;
          if (isDivider(p[1])) break;
          parts.unshift(p[1]);
        }
        note = parts.join(' ').replace(/[─═]{2,}/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    if (condition && note) break;
  }
  return { condition, note };
}

/** Commodity names mentioned in one condition string. */
function commoditiesIn(condition: string): string[] {
  const names = new Set<string>();
  for (const m of condition.matchAll(/commodity\s*===\s*'(\w+)'/g)) names.add(m[1]);
  for (const m of condition.matchAll(/\[([^\]]*)\]\s*\.includes\(commodity\)/g)) {
    for (const q of m[1].matchAll(/'(\w+)'/g)) names.add(q[1]);
  }
  for (const m of condition.matchAll(/\b([A-Z][A-Z0-9_]+)\.includes\(commodity\)/g)) names.add(m[1]);
  return [...names];
}

/**
 * Which commodities each LINE of a file is gated to, by tracking brace depth.
 *
 * Two earlier attempts were both wrong. Scanning backwards for any
 * `commodity === '...'` found an unrelated gate further up and labelled an
 * all-commodity DFA rule as painting-specific. Reading only the rule's own
 * condition then reported no commodity for any of the 41 DFM rules — but the
 * rules ARE grouped, under enclosing `if (commodity === ...)` blocks, so that
 * lost real information. Only a scope walk gets it right: push a gate when its
 * block opens, pop it when the braces close.
 */
function gateMap(src: string): Map<number, string> {
  const lines = src.split('\n');
  const stack: Array<{ depth: number; names: string[] }> = [];
  const out = new Map<number, string>();
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opensHere = /^\s*(?:\}\s*)?(?:else\s+)?if\s*\(/.test(line) ? commoditiesIn(line) : [];
    let pending = opensHere.length > 0;
    // Record the gate in force BEFORE this line's own braces are counted.
    if (stack.length) out.set(i + 1, [...new Set(stack.flatMap(s => s.names))].join(', '));
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        // Copy: pushing the array itself and clearing it afterwards emptied
        // every gate on the stack, since they all aliased one array.
        if (pending) { stack.push({ depth, names: [...opensHere] }); pending = false; }
      } else if (ch === '}') {
        while (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
        depth--;
      }
    }
  }
  return out;
}

function harvest(relPath: string, pushName: string, kind: Rule['kind']): Rule[] {
  const src = readFileSync(relPath, 'utf8');
  const lines = src.split('\n');
  const gates = gateMap(src);
  const out: Rule[] = [];
  const needle = `${pushName}.push(`;
  let idx = 0;
  let n = 0;
  while ((idx = src.indexOf(needle, idx)) !== -1) {
    const braceIdx = src.indexOf('{', idx);
    if (braceIdx === -1) break;
    const block = literalAt(src, braceIdx);
    const line = src.slice(0, idx).split('\n').length;
    const { condition, note } = contextBefore(lines, line - 1);
    out.push({
      n: ++n, kind, source: relPath, line, condition, note,
      severity: field(block, 'severity'),
      category: field(block, 'category'),
      title: field(block, 'title') ?? '(untitled)',
      description: field(block, 'description'),
      recommendation: field(block, 'recommendation') ?? field(block, 'action'),
      savingPct: field(block, 'savingPct') ?? exprField(block, 'expectedSavingPct'),
      lever: field(block, 'lever'),
      timeframe: field(block, 'timeframe'),
      justification: field(block, 'technicalJustification'),
      risk: field(block, 'risk'),
      commodity: [...new Set([...commoditiesIn(condition), ...(gates.get(line) ?? '').split(', ')])]
        .filter(Boolean).join(', ') || undefined,
    });
    idx = braceIdx + block.length;
  }
  return out;
}

// ─── DFM / DFA / optimisations ───────────────────────────────────────────────
const dfmFile = join(ENGINE, 'dfm-dfa.ts');
const dfm = harvest(dfmFile, 'dfmIssues', 'dfm');
const dfa = harvest(dfmFile, 'dfaIssues', 'dfa');
const opts = harvest(dfmFile, 'costOptimisations', 'optimisation');

// ─── Idea levers ─────────────────────────────────────────────────────────────
const levers = harvest(join(ENGINE, 'idea-levers.ts'), 'out', 'lever');

// ─── Geometry advisors ───────────────────────────────────────────────────────
const advisorFiles = readdirSync(join(ENGINE, 'modules'))
  .filter(f => /-advisor\.ts$/.test(f))
  .sort();

const advisors = advisorFiles.map((f) => {
  const rel = join(ENGINE, 'modules', f);
  const src = readFileSync(rel, 'utf8');
  const fn = /export function (analyse\w*DFM)/.exec(src)?.[1] ?? '(none)';
  const checks = harvest(rel, 'issues', 'advisor');
  // Reference tables are the advisor's own process knowledge — worth naming.
  const tables = [...src.matchAll(/export const ([A-Z][A-Z0-9_]+)\s*[:=]/g)].map(m => m[1]);
  return {
    file: f,
    module: f.replace('-advisor.ts', ''),
    entry: fn,
    checkCount: checks.length,
    checks,
    tables,
    exports: [...src.matchAll(/export function (\w+)/g)].map(m => m[1]),
  };
});

const payload = {
  generatedFrom: 'CostVision engine source',
  counts: {
    dfm: dfm.length,
    dfa: dfa.length,
    optimisations: opts.length,
    levers: levers.length,
    advisors: advisors.length,
    advisorChecks: advisors.reduce((a, x) => a + x.checkCount, 0),
  },
  dfm, dfa, opts, levers, advisors,
};

writeFileSync('/tmp/rule-library.json', JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload.counts, null, 2));
for (const a of advisors) console.log(`  ${a.module.padEnd(16)} ${a.entry.padEnd(26)} ${a.checkCount} checks`);
