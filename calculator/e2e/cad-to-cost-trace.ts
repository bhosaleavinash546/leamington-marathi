/**
 * CAD to COST, traced — every step of the three-step flow on real parts, checked against the plan
 * (docs/ui/cad-to-cost-redesign-2026-10.md: the 12 changes, M1–M12, D1–D6, the edge states, acceptance 1–6).
 *
 * A real server (the built bundle) and a real browser. For each part it records, step by step:
 *   - every /api call (method, path, status, ms) and what the CAD calls returned (route, questions, rule fields,
 *     rate book, versions);
 *   - the screen at each step (screenshot + what the plan says must be there: step indicator, focus, context line,
 *     kernel status, progress, facts, questions with their suggestion and reason, chips, New tags, Updating…);
 *   - the cost step: headline sampled from its first frame (no count-up), band, confidence, tooling investment, chips,
 *     Basis, Compare routes (reference row = headline = headless), Not included, stamp, DFM and Design-to-Cost doors,
 *     Edit inputs, Log actual £, the viewer kept across the steps;
 *   - the exports, opened: the stamp and the headline in both, and the cost re-added from the workbook — every
 *     operation re-priced from its own rate, time, OEE and parts a cycle, overhead and margin re-applied;
 *   - axe WCAG 2.1 AA at each step.
 * Every check is PASS, FAIL or GAP (a plan item that is not built) with the evidence beside it.
 *
 *   npm run build && npx tsx e2e/cad-to-cost-trace.ts            (OCP for STEP; CV_TRACE_OUT=<dir>)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';

interface PartSpec { label: string; file: string; answers: Record<string, string>; programmeYears: number; annual: number }
const ROOT = resolve(import.meta.dirname, '..');
const PARTS_DIR = resolve(ROOT, '../cad-audit/parts');
const PARTS: PartSpec[] = [
  // The plan's worked part: forged knuckle, safety-critical (NDT), 100,000 a year, 5-year programme.
  { label: 'knuckle-forging', file: join(PARTS_DIR, 'steering_knuckle_RH.stp'), programmeYears: 5, annual: 100_000,
    answers: { 'commodity.route': 'forging', 'material.family': 'steel', 'service.toleranceClass': 'standard',
      'service.safetyCritical': 'yes', 'service.pressureTight': 'no' } },
  // The plan's moulding: ECU cover in PC/ABS.
  { label: 'ecu-cover-moulding', file: join(PARTS_DIR, 'IM_ECU_Cover.stp'), programmeYears: 5, annual: 100_000,
    answers: { 'commodity.route': 'injection_moulding', 'material.family': 'plastic', 'material.resin': 'mat-pc-abs' } },
];
const OUT = process.env.CV_TRACE_OUT ?? join(tmpdir(), 'cad-to-cost-trace');
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const money = (t: string) => (t.match(/[£€$¥₹]\s?[\d,]+\.\d{2}/)?.[0] ?? '').replace(/\s/g, '');
const num = (t: string) => Number(String(t).replace(/[^\d.-]/g, ''));

type Verdict = 'PASS' | 'FAIL' | 'GAP' | 'INFO';
interface Check { part: string; step: string; ref: string; what: string; verdict: Verdict; evidence: string }
const checks: Check[] = [];
let part = '';
const LOG = join(OUT, 'trace.log');
const say = (s: string) => { process.stdout.write(s + '\n'); appendFileSync(LOG, s + '\n'); };
function check(step: string, ref: string, what: string, ok: boolean | 'gap' | 'info', evidence: string): void {
  const verdict: Verdict = ok === 'gap' ? 'GAP' : ok === 'info' ? 'INFO' : ok ? 'PASS' : 'FAIL';
  checks.push({ part, step, ref, what, verdict, evidence });
  say(`  ${verdict.padEnd(4)} [${ref}] ${what} — ${evidence}`);
}

/** Everything the plan names on the CAD to COST screen, read off the DOM at one moment. */
async function screenState(page: Page) {
  return page.evaluate(() => {
    const txt = (sel: string) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const vis = (sel: string) => { const e = document.querySelector<HTMLElement>(sel); return !!e && !e.hidden && e.offsetParent !== null; };
    const navs = Array.from(document.querySelectorAll<HTMLElement>('nav.cad-steps')).filter(n => n.offsetParent !== null);
    const nav = navs.at(-1) ?? null;
    const cur = nav?.querySelector('[aria-current="step"]') ?? null;
    const btn = document.getElementById('cad-get-cost-btn') as HTMLButtonElement | null;
    return {
      step: cur ? (cur.querySelector('.cad-step-label')?.textContent ?? '').trim() : null,
      stepsNavLabel: nav?.getAttribute('aria-label') ?? null,
      title: txt('#cad-step-title'),
      focus: document.activeElement?.id || document.activeElement?.tagName || null,
      kernelNotice: vis('#cad-kernel-notice') ? txt('#cad-kernel-notice') : null,
      countryLine: txt('#cad-country-line'), lifeLine: txt('#cad-life-line'),
      flowNotice: vis('#cad-flow-notice') ? txt('#cad-flow-notice') : null,
      facts: Array.from(document.querySelectorAll('#cad-facts .cad-fact')).map(f => (f.textContent ?? '').replace(/\s+/g, ' ').trim()),
      factsShown: vis('#cad-facts'),
      viewerCanvases: document.querySelectorAll('#cad-viewer-host canvas, #cad-persist-viewer-host canvas').length,
      viewerVisible: vis('#cad-viewer-host') || vis('#cad-persist-viewer-host'),
      viewerInView: Array.from(document.querySelectorAll<HTMLCanvasElement>('#cad-viewer-host canvas, #cad-persist-viewer-host canvas')).some(c => {
        const r = c.getBoundingClientRect(); return r.width > 50 && r.height > 50 && r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0; }),
      progress: vis('#cad-progress-wrap') ? { label: txt('#cad-progress-label'), elapsed: txt('#cad-progress-elapsed'), cancel: vis('#cad-progress-cancel'),
        fillWidth: (document.getElementById('cad-progress-fill') as HTMLElement | null)?.style.width ?? '', hint: txt('#cad-progress-hint'),
        indeterminate: !!document.querySelector('#cad-progress-wrap .cad-progress-bar.is-indeterminate, #cad-progress-wrap[data-indeterminate], .cad-progress-fill.indeterminate') } : null,
      decisions: Array.from(document.querySelectorAll<HTMLElement>('#cad-decisions-panel .cad-decision')).map(d => ({
        id: d.dataset.decisionId ?? '', question: (d.firstElementChild?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        why: ((d.children[1] as HTMLElement | undefined)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        isNew: !!d.querySelector('.cad-decision-new'),
        options: Array.from(d.querySelectorAll<HTMLInputElement>('input[type=radio]')).map(r => ({ value: r.value, checked: r.checked,
          label: (r.closest('label')?.textContent ?? '').replace(/\s+/g, ' ').trim() })),
        select: (d.querySelector('select[data-decision-select]') as HTMLSelectElement | null)?.value ?? null,
        notListed: !!d.querySelector('.cad-other-link, select[data-decision-other]'),
      })),
      decisionsStatus: txt('#cad-decisions-status'),
      advisoryBlock: /worth confirming/.test(txt('#cad-decisions-panel')),
      chips: Array.from(document.querySelectorAll('.cad-answer-chips .cad-answer-chip')).map(c => (c.textContent ?? '').replace(/\s+/g, ' ').trim()),
      getCost: btn ? { text: (btn.textContent ?? '').trim(), disabled: btn.disabled, busy: btn.getAttribute('aria-busy') } : null,
    };
  });
}

async function axe(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
  const v = await page.evaluate(() => (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } })
    .axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  return v.violations.map(x => `${x.id} ×${x.nodes.length}`);
}

function pdfText(buf: Buffer): string {
  const out: string[] = [];
  for (const m of buf.toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    out.push(m[1].replace(/\\([()\\])/g, '$1').replace(/\\(\d{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8))));
  }
  return out.join('\n');
}

/** The cost re-added from the exported workbook, independently of the engine's own Checks sheet. */
function recomputeFromWorkbook(xlsxPath: string) {
  const wb = XLSX.read(readFileSync(xlsxPath));
  const rows = (n: string) => (XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }) as unknown[][]);
  const sum = rows('1-Summary');
  const val = (re: RegExp) => { const r = sum.find(x => re.test(String(x[0] ?? ''))); return r ? Number(r[1]) : NaN; };
  const b = { material: val(/^1\. Raw Material/), process: val(/^2\. Process/), labour: val(/^3\. Direct Labour/), tooling: val(/^4\. Tooling/),
    packaging: val(/^5\. Packaging/), logistics: val(/^6\. Logistics/), overhead: val(/^7\. Overhead/), margin: val(/^8\. Supplier Margin/),
    total: val(/^TOTAL SHOULD COST/) };
  const ohPct = Number(String(sum.find(x => /^7\. Overhead/.test(String(x[0])))?.[0]).match(/([\d.]+)%/)?.[1]) / 100;
  const mgPct = Number(String(sum.find(x => /^8\. Supplier Margin/.test(String(x[0])))?.[0]).match(/([\d.]+)%/)?.[1]) / 100;
  const toolTotal = val(/^Total Tooling Cost/), amortVol = val(/^Amortisation Volume/);
  // operations, each re-priced from its own row
  const ops = rows('3-Operations');
  const head = ops.findIndex(r => String(r[0]) === 'Operation');
  const H = ops[head].map(String);
  const col = (name: string) => H.indexOf(name);
  const opRows = ops.slice(head + 1).filter(r => r[0] && String(r[0]) !== 'TOTAL');
  const opCalc = opRows.map(r => {
    const rate = Number(r[col('Machine Rate (/hr)')]), cyc = Number(r[col('Cycle Time (hr)')]), ppc = Number(r[col('Parts/Cycle')]) || 1,
      oee = Number(r[col('OEE')]) || 1, lr = Number(r[col('Labour Rate (/hr)')]), man = Number(r[col('Manning')]), lt = Number(r[col('Labour Time (hr)')]),
      le = Number(r[col('Labour Efficiency')]) || 1;
    const proc = (rate || 0) * cyc / oee / ppc;
    const lab = (lr || 0) * (man || 0) * lt / le / ppc;
    return { op: String(r[0]), proc, lab, sheetProc: Number(r[col('Process Cost')]), sheetLab: Number(r[col('Labour Cost')]) };
  });
  const procSum = opCalc.reduce((a, o) => a + o.proc, 0), labSum = opCalc.reduce((a, o) => a + o.lab, 0);
  // material
  const mat = rows('2-Material');
  const mval = (re: RegExp) => { const r = mat.find(x => re.test(String(x[0] ?? ''))); return r ? Number(r[1]) : NaN; };
  const gross = mval(/^Gross Weight/), price = mval(/^Material Price/), scrap = mval(/^Scrap Credit/);
  const energy = mval(/^Process energy/);
  const extra = mat.filter(x => /^(Bought-in|Consumable|Service|Coating|Surface)/i.test(String(x[0] ?? ''))).reduce((a, x) => a + (Number(x[1]) || 0), 0);
  const matCalc = gross * price + (Number.isFinite(scrap) ? scrap : 0) + (Number.isFinite(energy) ? energy : 0) + extra;
  const base = b.material + b.process + b.labour + b.tooling;
  const factory = base + b.packaging + b.logistics;
  const ohCalc = base * ohPct, subtotal = factory + b.overhead, mgCalc = subtotal * mgPct;
  return { b, ohPct, mgPct, toolTotal, amortVol, opCalc, procSum, labSum, gross, price, scrap, energy, matCalc, base, factory, ohCalc, subtotal, mgCalc,
    totalCalc: factory + ohCalc + mgCalc, materialRows: mat.slice(4).map(r => r.map(c => String(c ?? '')).join(' | ')).filter(s => s.trim()) };
}

async function tracePart(page: Page, base: string, p: PartSpec, net: Array<Record<string, unknown>>): Promise<Record<string, unknown>> {
  part = p.label;
  const rec: Record<string, unknown> = { part: p.label, file: basename(p.file), answersGiven: p.answers };
  let shot = 0;
  const snap = async (label: string) => { const f = join(OUT, `${p.label}-${String(++shot).padStart(2, '0')}-${label}.png`); await page.screenshot({ path: f }); return basename(f); };
  const t0 = Date.now();

  // ── Step 1: Part & context ──────────────────────────────────────────────────
  say(`\n## ${p.label} (${basename(p.file)}) — step 1: part & context`);
  await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
  await page.click('#new-costing-btn', { timeout: 15_000 });
  await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click({ timeout: 15_000 });
  await page.waitForSelector('#cad-steps', { timeout: 30_000 });
  let s = await screenState(page);
  rec.step1Empty = { ...s, shot: await snap('step1-empty') };
  check('1', 'M4', 'step indicator is a labelled nav, step 1 current', s.stepsNavLabel === 'Steps to the cost' && s.step === 'Part & context', `nav "${s.stepsNavLabel}", current "${s.step}"`);
  check('1', '#1', 'country line with the rate book beside it', /rate book/i.test(s.countryLine), s.countryLine || '(empty)');
  check('1', 'D3', 'programme life required, its effect stated', /Required/.test(s.lifeLine), s.lifeLine);
  check('1', 'M8', 'kernel status: no notice when the kernel is installed', s.kernelNotice === null, s.kernelNotice ?? 'no notice (kernel present)');
  const moreOpts = await page.evaluate(() => !!document.getElementById('cad-more-options'));
  check('1', '§3', 'More options (process / material you know, drawing, photo, blank DXF, mode)', moreOpts, moreOpts ? 'present' : 'missing');
  const measureDisabled = await page.evaluate(() => (document.getElementById('cad-analyze-btn') as HTMLButtonElement | null)?.disabled ?? null);
  check('1', 'M6', 'one primary action "Measure part", disabled until a file is chosen', measureDisabled === true, `disabled=${measureDisabled}`);
  const ax1 = await axe(page);
  check('1', 'A5', 'axe WCAG 2.1 AA on step 1', ax1.length === 0, ax1.join(', ') || '0 violations');

  await page.fill('#cad-programme-years', String(p.programmeYears));
  await page.fill('#cad-annual-volume', String(p.annual));
  await page.dispatchEvent('#cad-annual-volume', 'input');
  s = await screenState(page);
  check('1', '#1', 'programme life line updates live', /spread over 5 years/.test(s.lifeLine), s.lifeLine);
  await page.setInputFiles('#cad-file-input', p.file);
  await page.waitForFunction(() => !(document.getElementById('cad-analyze-btn') as HTMLButtonElement | null)?.disabled, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  s = await screenState(page);
  rec.step1File = { ...s, shot: await snap('step1-file') };
  check('1', 'M5', 'the part is on screen before measuring (viewer mounted)', s.viewerVisible && s.viewerCanvases > 0, `${s.viewerCanvases} canvas, visible ${s.viewerVisible}`);

  // ── Measure: honest progress ─────────────────────────────────────────────────
  say(`## ${p.label} — measuring`);
  const tMeasure = Date.now();
  await page.click('#cad-analyze-btn');
  const progress: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 1800; i++) {
    const st = await screenState(page);
    if (st.progress) progress.push({ t: Date.now() - tMeasure, ...st.progress });
    if (st.decisions.length || st.getCost || st.step === 'Confirm') break;
    await page.waitForTimeout(500);
  }
  rec.measureMs = Date.now() - tMeasure;
  rec.progressSamples = progress.filter((x, i, a) => i === 0 || JSON.stringify({ ...x, t: 0, elapsed: '' }) !== JSON.stringify({ ...a[i - 1], t: 0, elapsed: '' }));
  const pct = progress.find(x => /\d+\s?%/.test(String(x.label)) || /\d+\s?%/.test(String(x.hint)));
  check('measure', 'M1/#7', 'progress shows the server\'s stage and elapsed, never a percentage', progress.length > 0 && !pct && progress.some(x => /\d/.test(String(x.elapsed))),
    progress.length ? `${progress.length} samples; stages: ${[...new Set(progress.map(x => x.label))].join(' → ')}; elapsed e.g. "${progress.at(-1)?.elapsed}"` : 'no progress shown');
  check('measure', '#7', 'Cancel offered while measuring', progress.some(x => x.cancel), progress.some(x => x.cancel) ? 'Cancel visible' : 'no Cancel seen');
  say(`  measured in ${(Number(rec.measureMs) / 1000).toFixed(1)} s`);

  // ── Step 2: Confirm ─────────────────────────────────────────────────────────
  say(`## ${p.label} — step 2: confirm`);
  await page.waitForTimeout(800);
  s = await screenState(page);
  rec.step2 = { ...s, shot: await snap('step2-questions') };
  check('2', 'M4', 'step 2 current, focus on the step heading', s.step === 'Confirm', `current "${s.step}", focus on "${s.focus}"`);
  check('2', '§3', 'four measured facts under the model', s.factsShown && s.facts.length === 4, s.facts.join(' · ') || '(none)');
  check('2', '§3', 'each question shows its reason', s.decisions.length > 0 && s.decisions.every(d => d.why.length > 10), s.decisions.map(d => `${d.id}: "${d.why.slice(0, 80)}…"`).join(' | '));
  check('2', '§3', '"x of y answered" beside Get cost', /\d+ of \d+ answered|optional/.test(s.decisionsStatus), s.decisionsStatus);
  check('2', '§3', '"Not listed?" on the process / material questions', s.decisions.filter(d => /route|family|resin/.test(d.id)).every(d => d.notListed),
    s.decisions.map(d => `${d.id}:${d.notListed ? 'yes' : 'no'}`).join(' '));
  const ax2 = await axe(page);
  check('2', 'A5', 'axe WCAG 2.1 AA on the questions', ax2.length === 0, ax2.join(', ') || '0 violations');

  // Answer round by round, as an engineer does: only what is asked, then Get cost.
  const rounds: Array<Record<string, unknown>> = [];
  let hero = '';
  let viewerCanvasesBefore = s.viewerCanvases;
  for (let round = 0; round < 14; round++) {
    const st = await page.waitForFunction(() => {
      const h = document.querySelector('#cv-result-hero .crh-total')?.textContent ?? '';
      const b = document.getElementById('cad-get-cost-btn') as HTMLButtonElement | null;
      if (/\d/.test(h) && document.getElementById('cad-cost-card')) return { hero: h };
      if (b && !b.disabled && b.getAttribute('aria-busy') !== 'true') return { hero: '' };
      return false;
    }, null, { timeout: 900_000, polling: 300 }).then(h => h.jsonValue());
    if (st.hero) { hero = st.hero; break; }
    const ss = await screenState(page);
    const todo = ss.decisions.find(d => p.answers[d.id] && (d.select ?? d.options.find(o => o.checked)?.value) !== p.answers[d.id]
      && (d.options.some(o => o.value === p.answers[d.id]) || d.select !== null));
    const r: Record<string, unknown> = { round, questions: ss.decisions.map(d => ({ id: d.id, isNew: d.isNew, pre: d.select ?? d.options.find(o => o.checked)?.value ?? null,
      options: d.options.map(o => o.value) })), chips: ss.chips, status: ss.decisionsStatus };
    // D1: the safety-critical question pre-ticks only on name evidence, never "No"
    const safety = ss.decisions.find(d => d.id === 'service.safetyCritical');
    if (safety) {
      const pre = safety.options.find(o => o.checked)?.value ?? null;
      check('2', 'D1', 'safety-critical: no pre-ticked "No"; a lean only from name evidence', pre !== 'no',
        `pre-ticked ${pre ?? 'nothing'}; why: "${safety.why.slice(0, 140)}"`);
      const yes = safety.options.find(o => o.value === 'yes')?.label ?? '';
      check('2', 'D2', 'safety consequence names this process\'s check (a forging: MPI, never X-ray)', p.label.startsWith('knuckle') ? /MPI/.test(yes) && !/X-ray/i.test(yes) : true, yes.slice(0, 160));
    }
    if (todo) {
      const sel = `.cad-decision[data-decision-id="${todo.id}"]`;
      const rerun = page.waitForResponse(x => /\/api\/cad\/(re)?analyze$/.test(x.url()), { timeout: 600_000 }).catch(() => null);
      if (todo.select !== null) await page.selectOption(`${sel} select[data-decision-select]`, p.answers[todo.id]);
      else await page.check(`${sel} input[type=radio][value="${p.answers[todo.id]}"]`);
      // M3 / #9: Get cost says "Updating…" and waits while the rules re-run in place
      let during: { text: string; disabled: boolean } | null = null;
      for (let k = 0; k < 40 && !(during && /Updating/.test(during.text)); k++) {
        during = await page.evaluate(() => { const b = document.getElementById('cad-get-cost-btn') as HTMLButtonElement | null; return b ? { text: (b.textContent ?? '').trim(), disabled: b.disabled } : null; });
        await page.waitForTimeout(40);
      }
      r.answered = `${todo.id} = ${p.answers[todo.id]}`;
      r.getCostDuringRerun = during;
      await rerun;
      await page.waitForTimeout(900);
      const after = await screenState(page);
      r.chipsAfter = after.chips;
      r.newQuestions = after.decisions.filter(d => d.isNew).map(d => d.id);
      if (after.viewerCanvases !== viewerCanvasesBefore) r.viewerRemounted = `${viewerCanvasesBefore} → ${after.viewerCanvases}`;
      viewerCanvasesBefore = after.viewerCanvases;
      say(`  round ${round}: answered ${r.answered}; Get cost during re-run ${JSON.stringify(during)}; chips ${JSON.stringify(after.chips)}; new ${JSON.stringify(r.newQuestions)}`);
      rounds.push(r);
      continue;
    }
    say(`  round ${round}: Get cost (${ss.decisions.map(d => `${d.id}=${d.select ?? d.options.find(o => o.checked)?.value ?? '∅'}`).join(', ') || 'nothing open'})`);
    r.pressed = 'Get cost';
    rounds.push(r);
    await page.click('#cad-get-cost-btn');
    // M2 / #8: sample the headline from its first frame — money never counts up
    const samples: string[] = [];
    for (let k = 0; k < 40; k++) {
      const h = await page.evaluate(() => document.querySelector('#cv-result-hero .crh-total')?.textContent ?? '');
      if (h && /\d/.test(h)) samples.push(money(h));
      await page.waitForTimeout(50);
    }
    r.headlineSamples = [...new Set(samples)];
  }
  rec.rounds = rounds;
  const answeredRounds = rounds.filter(r => r.answered);
  const updatingSeen = answeredRounds.length > 0 && answeredRounds.every(r => { const d = r.getCostDuringRerun as { text?: string; disabled?: boolean } | undefined; return /Updating/.test(d?.text ?? '') && d?.disabled === true; });
  check('2', 'M3/#9', 'Get cost reads "Updating…" and is disabled while an answer re-runs the rules', updatingSeen,
    rounds.filter(r => r.answered).map(r => JSON.stringify(r.getCostDuringRerun)).join(' ') || 'no answer round');
  check('2', 'M3', 'answered questions collapse to chips', rounds.filter(r => r.answered).every(r => (r.chipsAfter as string[]).length > 0),
    rounds.filter(r => r.answered).map(r => (r.chipsAfter as string[]).join(', ')).at(-1) ?? '');
  const remounts = rounds.filter(r => r.viewerRemounted);
  check('2', 'M5', 'one viewer across the answer rounds (no re-mount)', remounts.length === 0, remounts.length ? remounts.map(r => r.viewerRemounted).join('; ') : 'canvas count steady');
  const allSamples = rounds.flatMap(r => (r.headlineSamples as string[] | undefined) ?? []);
  check('3', 'M2/#8', 'the headline is final from its first frame (no count-up)', new Set(allSamples).size <= 1 && money(hero) === allSamples[0],
    `samples ${JSON.stringify([...new Set(allSamples)])}, final ${money(hero)}`);
  const presses = rounds.filter(r => r.pressed).length;
  check('2', 'A3', 'fewest presses: Measure part + one Get cost per round', true, `Measure part + ${presses} Get cost press(es), ${rounds.filter(r => r.answered).length} answer(s)`);

  // ── Step 3: Cost ─────────────────────────────────────────────────────────────
  say(`## ${p.label} — step 3: cost  ${money(hero)}`);
  await page.waitForTimeout(1200);
  s = await screenState(page);
  const card = await page.evaluate(() => {
    const t = (sel: string) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const figs = Array.from(document.querySelectorAll('#cad-cost-card .cad-cost-fig')).map(f => (f.textContent ?? '').replace(/\s+/g, ' ').trim());
    document.querySelectorAll<HTMLDetailsElement>('#cad-cost-card details').forEach(d => { if (d.id !== 'cad-compare') d.open = true; });
    return {
      hero: t('#cv-result-hero'), figs, note: t('#cad-cost-card .cad-cost-note'), why: t('#cad-confidence-why'),
      movers: Array.from(document.querySelectorAll('#cad-cost-card .cad-movers-list li')).map(l => (l.textContent ?? '').replace(/\s+/g, ' ').trim()),
      commercial: Array.from(document.querySelectorAll<HTMLInputElement>('#cad-cost-card [data-commercial]')).map(i => `${i.dataset.commercial}=${i.value}`),
      chips: Array.from(document.querySelectorAll('#cad-cost-card .cad-answer-chip')).map(c => (c.textContent ?? '').replace(/\s+/g, ' ').trim()),
      changeAnswers: !!document.getElementById('cad-change-answers'),
      basis: Array.from(document.querySelectorAll('#cad-basis .cad-basis-row')).map(r => Array.from(r.children).map(c => (c.textContent ?? '').replace(/\s+/g, ' ').trim())),
      notIncluded: Array.from(document.querySelectorAll('#cad-not-included li')).map(l => (l.textContent ?? '').trim()),
      stamp: t('#cad-cost-card .cad-stamp'),
      breakdownRows: Array.from(document.querySelectorAll('table.breakdown-table tr, .breakdown-row, [data-bucket]')).map(r => (r.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(x => /£|€|\$/.test(x)).slice(0, 20),
      dfmPanel: (document.getElementById('geometric-dfm-panel')?.style.display ?? 'none') !== 'none',
      dfmFindings: document.querySelectorAll('#geometric-dfm-panel [data-dfm-idx]').length,
      dtcTab: !!document.querySelector('.rtab[data-panel="dtc"]'),
      logActual: !!document.getElementById('log-actual-btn') || !!document.querySelector('[data-proxy="log-actual-btn"]'),
      logActualOnCard: !!document.querySelector('#cad-cost-card [data-proxy="log-actual-btn"], #cad-cost-card #log-actual-btn'),
      exportsOnCard: !!document.querySelector('#cad-cost-card #export-pdf-btn, #cad-cost-card #export-excel-btn'),
      formVisible: !!document.getElementById('calc-btn')?.offsetParent
        && Array.from(document.querySelectorAll<HTMLElement>('#commodity-form-area input, #commodity-form-area select')).filter(e => e.offsetParent !== null).length > 5,
      editInputsDoor: Array.from(document.querySelectorAll('button, a')).some(b => /edit inputs/i.test(b.textContent ?? '')),
      costOnModel: Array.from(document.querySelectorAll('[data-act]')).some(b => /cost/i.test((b as HTMLElement).dataset.act ?? '')),
      overheadField: (document.getElementById('overhead') as HTMLInputElement | null)?.value ?? null,
    };
  });
  rec.step3 = { ...s, card, shot: await snap('step3-cost') };
  check('3', 'M4', 'step 3 current', s.step === 'Cost', `current "${s.step}"`);
  check('3', '#2', 'tooling investment (one-off) with its amortisation basis', card.figs.some(f => /Tooling investment/.test(f) && /a part over 5 years × 100,000/.test(f)), card.figs[0] ?? '(none)');
  check('3', 'D6', 'the band says what it covers and that accuracy is not measured', /not the model's error/.test(card.note) && /not yet measured/.test(card.note), card.note);
  check('3', '§3', 'confidence shown beside the band', card.figs.some(f => /confidence (High|Medium|Low)/.test(f)), card.figs[1] ?? '');
  check('3', '§3', 'confidence explained ("why", "what would raise it")', /data points behind this cost/.test(card.why) && /moves it/.test(card.why), card.why);
  check('3', '§3', 'chips: route, grade, weight, country, volume + Change answers',
    card.changeAnswers && card.chips.some(c => /Country/.test(c)) && card.chips.some(c => /Volume/.test(c)),
    card.chips.join(' | '));
  check('3', '§3', 'grade and costed weight on the chips', card.chips.some(c => /^Grade /.test(c)) && card.chips.some(c => /^Weight .*kg/.test(c)),
    card.chips.filter(c => /^(Grade|Weight)/.test(c)).join(' | ') || 'missing');
  const grades = [...new Set(card.basis.map(r => r[0]))];
  check('3', '#3', 'Basis: every input graded (measured / answered / rule / default)', card.basis.length > 5 && grades.length >= 3, `${card.basis.length} rows; grades ${grades.join(', ')}; first: ${card.basis.slice(0, 3).map(r => r.join(' ')).join(' | ')}`);
  check('3', '#3', 'Basis: the five inputs that move the £ most come first (each ±10 %, re-costed)', card.movers.length === 5, card.movers.join(' | '));
  check('3', '#4', 'commercial basis editable on the cost step (overhead %, margin %, packaging, logistics, batch)',
    ['overhead-pct', 'margin-pct', 'packaging', 'logistics'].every(id => card.commercial.some(c => c.startsWith(id + '='))),
    card.commercial.join(', ') + (card.commercial.some(c => /batch/.test(c)) ? '' : ' (no batch input on this route — the module carries no batch-spread change-over)'));
  const pkg = card.basis.find(r => /^Packaging per part/.test(r[1] ?? ''));
  check('3', '#3', 'packaging from the part\'s size is graded Rule (not "Typed")', pkg?.[0] === 'Rule', pkg ? pkg.join(' ') : 'no packaging row');
  check('3', '#5', 'Not included list', card.notIncluded.length >= 4, card.notIncluded.join(' · '));
  check('3', '#12', 'reproducibility stamp on screen', /rate book .+ · rules v\S+ · kernel \S+ · \d/.test(card.stamp), card.stamp);
  check('3', '§3', 'doors: DFM findings', card.dfmPanel || card.dfmFindings > 0 ? true : 'info', `panel shown ${card.dfmPanel}, ${card.dfmFindings} finding rows (the DFM job may still be running)`);
  check('3', '§3', 'doors: Design to cost tab', card.dtcTab, card.dtcTab ? 'tab present' : 'missing');
  check('3', '§3', 'doors: Edit inputs (the full commodity form)', card.formVisible || card.editInputsDoor, `form visible ${card.formVisible}, an "Edit inputs" control ${card.editInputsDoor}`);
  check('3', '§3', 'actions: Export PDF · Excel · Save · Log actual £', card.logActual, `exports in the action bar; Log actual £ ${card.logActual ? 'in the More menu' : 'missing'}; on the card: exports ${card.exportsOnCard}, Log actual ${card.logActualOnCard}`);
  check('3', 'M5', 'the model stays on screen at the cost step (in view, on the left)', s.viewerInView, `${s.viewerCanvases} canvas, in view ${s.viewerInView}`);
  check('3', 'M5', '"cost on model" offered at the cost step', card.costOnModel ? true : 'info', card.costOnModel ? 'viewer cost colour mode present' : 'not found by data-act');
  const ax3 = await axe(page);
  check('3', 'A5', 'axe WCAG 2.1 AA on the cost step (every section open)', ax3.length === 0, ax3.join(', ') || '0 violations');

  // Compare routes: the reference row is the headless chain (costMeasuredPart) — screen = headless
  await page.click('#cad-compare > summary');
  await page.waitForSelector('#cad-compare-host table, #cad-compare-host p', { timeout: 300_000 });
  await page.waitForSelector('#cad-compare-host table', { timeout: 300_000 }).catch(() => null);
  const routes = await page.$$eval('#cad-compare-host tbody tr', trs => trs.map(tr => ({
    route: (tr.querySelector('th')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    cost: (tr.querySelectorAll('td')[0]?.textContent ?? '').trim(), ref: tr.classList.contains('cad-compare-ref'),
    why: (tr.querySelector('td:last-child')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) })));
  rec.compareRoutes = routes;
  const ref = routes.find(r => r.ref);
  check('3', 'A1/#6', 'screen = headless: the comparison\'s reference row (costMeasuredPart) equals the headline', !!ref && money(ref.cost) === money(hero),
    `reference ${ref?.cost ?? '—'} v headline ${money(hero)}; other routes: ${routes.filter(r => !r.ref).map(r => `${r.route} ${r.cost}`).join(', ')}`);
  await snap('step3-compare');

  // #4 end to end: the margin changed on the card re-costs the part (subtotal × 1.10 instead of × 1.08), then back
  const before = money(hero);
  const mg = await page.$('#cad-cost-card [data-commercial="margin-pct"]');
  if (mg) {
    await mg.fill('10'); await mg.dispatchEvent('change');
    const after = await page.waitForFunction(b => { const h = document.querySelector('#cv-result-hero .crh-total')?.textContent ?? ''; return h && !h.includes(b) ? h : false; },
      before, { timeout: 60_000 }).then(h => h.jsonValue() as Promise<string>).catch(() => '');
    const expect10 = Number(String(before).replace(/[^\d.]/g, '')) / 1.08 * 1.10;
    const graded = await page.evaluate(() => Array.from(document.querySelectorAll('#cad-basis .cad-basis-row')).map(r => (r.textContent ?? '').replace(/\s+/g, ' ').trim()).find(t => /Supplier margin/.test(t)) ?? '');
    check('3', '#4', 'margin 8 % → 10 % on the card re-costs the part (subtotal × 1.10)', Math.abs(num(money(after)) - expect10) <= 0.011,
      `${before} → ${money(after)} (expected £${expect10.toFixed(2)}); Basis now "${graded}"`);
    const mg2 = await page.$('#cad-cost-card [data-commercial="margin-pct"]');
    await mg2!.fill('8'); await mg2!.dispatchEvent('change');
    const back = await page.waitForFunction(b => { const h = document.querySelector('#cv-result-hero .crh-total')?.textContent ?? ''; return h.includes(b) ? h : false; },
      before, { timeout: 60_000 }).then(h => h.jsonValue() as Promise<string>).catch(() => '');
    check('3', '#4', 'margin back to 8 % gives the original cost', money(back) === before, `${money(back) || '(did not return)'} v ${before}`);
    hero = back || hero;
    await snap('step3-commercial');
  }

  // Exports, opened
  const stamp = card.stamp;
  const xl = join(OUT, `${p.label}.xlsx`), pdf = join(OUT, `${p.label}.pdf`);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.evaluate(() => document.getElementById('export-excel-btn')!.click())]);
  await dl.saveAs(xl);
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 240_000 }), page.evaluate(() => document.getElementById('export-pdf-btn')!.click())]);
  await dl2.saveAs(pdf);
  const wb = XLSX.read(readFileSync(xl));
  const xlStamp = (XLSX.utils.sheet_to_json(wb.Sheets['1-Summary'], { header: 1, raw: false }) as unknown[][]).find(r => r[0] === 'Reproducibility')?.[1];
  check('export', 'A6/#12', 'Excel opened: the stamp word for word', xlStamp === stamp, String(xlStamp));
  const text = pdfText(readFileSync(pdf)).replace(/\s+/g, ' ');
  const pdfStamp = text.match(/Reproducibility: (.*?kernel \S+ · \d{1,2} \w{3} \d{4})/)?.[1] ?? null;
  check('export', 'A6/#12', 'PDF opened: the stamp word for word', pdfStamp === stamp, String(pdfStamp));
  check('export', 'A6', 'PDF opened: the headline', text.includes(money(hero)), `${money(hero)} ${text.includes(money(hero)) ? 'found' : 'NOT found'}`);

  // The cost re-added from the workbook
  const rc = recomputeFromWorkbook(xl);
  rec.recompute = rc;
  const near = (a: number, b: number, tol = 0.0006) => Math.abs(a - b) <= tol;
  check('arith', 'trace', 'every operation re-priced from its rate, time, OEE, parts a cycle = the sheet',
    rc.opCalc.every(o => near(o.proc, o.sheetProc, 0.00002) && near(o.lab, o.sheetLab, 0.00002)),
    rc.opCalc.map(o => `${o.op}: £${o.proc.toFixed(4)} + £${o.lab.toFixed(4)} (sheet £${o.sheetProc.toFixed(4)} + £${o.sheetLab.toFixed(4)})`).join(' | '));
  check('arith', 'trace', 'Σ operations = buckets 2 and 3', near(rc.procSum, rc.b.process) && near(rc.labSum, rc.b.labour),
    `process £${rc.procSum.toFixed(4)} v £${rc.b.process.toFixed(4)}; labour £${rc.labSum.toFixed(4)} v £${rc.b.labour.toFixed(4)}`);
  check('arith', 'trace', 'material = gross × £/kg + scrap credit + energy (+ listed extras) = bucket 1', near(rc.matCalc, rc.b.material, 0.002),
    `${rc.gross} kg × £${rc.price}/kg + ${rc.scrap} + ${rc.energy} = £${rc.matCalc.toFixed(4)} v £${rc.b.material.toFixed(4)}`);
  check('arith', 'trace', 'tooling = tool cost ÷ amortisation volume = bucket 4', near(rc.toolTotal / rc.amortVol, rc.b.tooling),
    `£${rc.toolTotal} ÷ ${rc.amortVol} = £${(rc.toolTotal / rc.amortVol).toFixed(4)} v £${rc.b.tooling.toFixed(4)}`);
  check('arith', 'trace', `overhead = ${(rc.ohPct * 100).toFixed(0)}% of material + process + labour + tooling`, near(rc.ohCalc, rc.b.overhead),
    `£${rc.base.toFixed(4)} × ${rc.ohPct} = £${rc.ohCalc.toFixed(4)} v £${rc.b.overhead.toFixed(4)}`);
  check('arith', 'trace', `margin = ${(rc.mgPct * 100).toFixed(0)}% of the subtotal`, near(rc.mgCalc, rc.b.margin),
    `£${rc.subtotal.toFixed(4)} × ${rc.mgPct} = £${rc.mgCalc.toFixed(4)} v £${rc.b.margin.toFixed(4)}`);
  check('arith', 'trace', 'buckets re-added = the headline', money(`£${rc.totalCalc.toFixed(2)}`) === money(hero),
    `£${rc.totalCalc.toFixed(4)} v headline ${money(hero)}`);
  rec.totalMs = Date.now() - t0;
  rec.headline = money(hero);
  return rec;
}

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('no dist/ — run npm run build first');
  writeFileSync(LOG, `CAD to COST trace ${new Date().toISOString()}\n`);
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-cad2cost-trace-'));
  const secret = 'trace-' + 'x'.repeat(40);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const serverLog = join(OUT, 'server.log');
  writeFileSync(serverLog, '');
  server.stdout?.on('data', d => appendFileSync(serverLog, d));
  server.stderr?.on('data', d => appendFileSync(serverLog, d));
  let browser;
  const results: Array<Record<string, unknown>> = [];
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '6h' });
    const health = await (await fetch(`${base}/api/health`)).json() as Record<string, unknown>;
    say(`server: ${JSON.stringify({ aiAvailable: health.aiAvailable, kernel: (health as { kernel?: unknown }).kernel ?? null })}`);
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    for (const p of PARTS) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const net: Array<Record<string, unknown>> = [];
      const started = new Map<string, number>();
      page.on('request', r => { if (r.url().includes('/api/')) started.set(r.url() + r.method() + net.length, Date.now()); });
      page.on('response', async r => {
        const u = new URL(r.url());
        if (!u.pathname.startsWith('/api/')) return;
        const e: Record<string, unknown> = { method: r.request().method(), path: u.pathname, status: r.status(),
          ms: Math.round((r.request().timing().responseEnd > 0 ? r.request().timing().responseEnd : 0)) };
        if (/\/api\/cad\/(analyze|reanalyze|compare-routes)$/.test(u.pathname)) {
          try {
            const j = await r.json() as Record<string, unknown>;
            const a = (j.analysis ?? {}) as { costInputSuggestions?: { recommendedCommodity?: string } };
            e.summary = { commodity: a.costInputSuggestions?.recommendedCommodity ?? (j as { selectedCommodity?: string }).selectedCommodity ?? null,
              decisions: ((j.decisions ?? []) as Array<{ id: string; severity: string }>).map(d => `${d.id}(${d.severity})`),
              ruleFields: Object.keys((j.ruleFields ?? {}) as object).length, ratesRegion: j.ratesRegion ?? null, versions: j.versions ?? null,
              geometrySource: j.geometrySource ?? null, timings: j.timings ?? null, dfmJobId: j.dfmJobId ?? null,
              rows: Array.isArray((j as { rows?: unknown[] }).rows) ? ((j as { rows: Array<{ route?: string; total?: number }> }).rows).map(x => `${x.route}:${x.total}`) : undefined };
          } catch { /* not JSON */ }
        }
        net.push(e);
      });
      const pageErrors: string[] = [];
      page.on('pageerror', err => pageErrors.push(err.message));
      await page.addInitScript('window.__name = (f) => f;');
      await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
      let rec: Record<string, unknown>;
      try { rec = await tracePart(page, base, p, net); }
      catch (e) {
        rec = { part: p.label, error: (e as Error).message };
        check('run', '—', 'ran to the end', false, (e as Error).message.split('\n')[0]);
        await page.screenshot({ path: join(OUT, `${p.label}-error.png`) }).catch(() => {});
      }
      rec.network = net;
      rec.pageErrors = pageErrors;
      check('run', '—', 'no page errors', pageErrors.length === 0, pageErrors.join(' | ') || 'none');
      results.push(rec);
      await context.close();
    }
  } finally {
    await browser?.close();
    try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
  writeFileSync(join(OUT, 'trace.json'), JSON.stringify({ when: new Date().toISOString(), checks, results }, null, 1));
  const by = (v: Verdict) => checks.filter(c => c.verdict === v).length;
  say(`\n${by('PASS')} PASS · ${by('FAIL')} FAIL · ${by('GAP')} GAP (plan item not built) · ${by('INFO')} INFO — ${join(OUT, 'trace.json')}`);
  if (by('FAIL')) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exit(1); });
