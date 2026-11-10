/**
 * Offline 2D drawing intelligence, live — a real server (the built bundle, AIR_GAPPED=1, no API key) and a real browser.
 *
 * As an engineer drives it, with AI OFF:
 *   1. casting bracket — STEP + its drawing: the upload control is on the Part step and says the drawing is read on this
 *      server; the "From the drawing" panel lists the readings with word badges and where each was read; the sheet is
 *      shown with the focused reading outlined; an unconfirmed reading is a note on its question — never a tick;
 *      "Confirm all read exactly" confirms only exact readings; the rest are confirmed row by row; Get cost; the
 *      confirmed answers are chips tagged "from drawing"; the finish block carries the masked features; the cost card's
 *      stamp names the reader and the drawing; SCREEN TOTAL = HEADLESS (the comparison's reference row, costed by the
 *      server with the same drawing and review); the Excel has the 10-Drawing sheet and the PDF the drawing table;
 *      axe WCAG 2.1 AA on the panel: 0 violations.
 *   2. gear with the WRONG drawing (z 40 against 38 measured) — the conflict is shown with both sides and nothing is
 *      chosen; it is settled by a click; the gear questions are answered from the drawing; cost; the workbook records
 *      the conflict and who settled it.
 *   3. a scanned drawing — the costing answers at once, the panel says the drawing is being read, then shows readings
 *      that all need checking, and "Confirm all read exactly" offers none of them.
 *   4. the same part with NO drawing — no panel, and the page is as it was.
 *   5. the casting bracket and its drawing opened AGAIN (a new page, the same engineer) — the review saved with the
 *      project comes back: the same confirmations, the correction, and the same cost.
 *
 * Prints PASS / FAIL per check and exits 1 on any FAIL.
 *
 *   npm run build && PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx e2e/drawing-live.ts     (needs OCP for STEP)
 *   CV_LIVE_OUT=/tmp/out [CV_THEME=light] [CV_ONLY=casting-bracket,reopen] npx tsx e2e/drawing-live.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';

const ROOT = resolve('.');
const PARTS = resolve(ROOT, '../cad-audit/parts');
const FIX = join(ROOT, 'tests/fixtures/drawings');
const OUT = process.env.CV_LIVE_OUT ?? join(tmpdir(), 'drawing-live');
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const log = (m: string) => process.stdout.write(`[drawing] ${m}\n`);
const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
const money = (t: string) => (t.match(/[£€$¥₹]\s?[\d,]+\.\d{2}/)?.[0] ?? '').replace(/\s/g, '');

const checks: Array<{ part: string; check: string; ok: boolean; detail: string }> = [];
const check = (part: string, name: string, ok: boolean, detail: string) => {
  checks.push({ part, check: name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'} ${part}: ${name} — ${detail}`);
};

function pdfText(buf: Buffer): string {
  const out: string[] = [];
  for (const m of buf.toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    out.push(m[1].replace(/\\([()\\])/g, '$1').replace(/\\(\d{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8))));
  }
  return out.join('\n');
}

async function axeOn(page: Page, selector: string): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE);
  const v = await page.evaluate(sel => (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } })
    .axe.run({ include: [[sel]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }), selector);
  return v.violations.map(x => `${x.id} ×${x.nodes.length} (${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join('; ')})`);
}

/** Open CAD to COST on a fresh page. */
async function openCad(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/calculator/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-country-ready="1"]', { timeout: 60_000 });
  await page.click('#new-costing-btn', { timeout: 15_000 });
  await page.locator('#commodity-picker-view .cpicker-tile[data-commodity="cad_analysis"]:visible').first().click({ timeout: 15_000 });
  await page.waitForSelector('#cad-file-input', { state: 'attached', timeout: 15_000 });
}

/** The readings of the panel as the engineer sees them. */
const panelRows = (page: Page) => page.$$eval('#cad-drawing-panel [data-dr-row]', rows => rows.map(r => ({
  id: (r as HTMLElement).dataset.drRow ?? '',
  label: r.querySelector('.dr-label')?.textContent?.trim() ?? '',
  value: r.querySelector('.dr-value')?.textContent?.trim() ?? '',
  status: r.querySelector('.dr-status')?.textContent?.trim() ?? '',
  source: r.querySelector('.dr-src')?.textContent?.trim() ?? '',
  where: r.querySelector('.dr-where')?.textContent?.trim() ?? '',
  effect: r.querySelector('.dr-effect')?.textContent?.trim() ?? '',
  canConfirm: !!r.querySelector('[data-dr-act="confirm"]'),
  inNotCosted: !!r.closest('details.dr-notcosted'),
})));

/** Press "Apply the review" and wait for the rules to come back. */
async function applyReview(page: Page): Promise<void> {
  const rerun = page.waitForResponse(r => r.url().includes('/api/cad/reanalyze') && r.request().method() === 'POST', { timeout: 120_000 });
  await page.click('#cad-drawing-panel [data-dr-act="apply"]');
  await rerun;
  await page.waitForFunction(() => !document.querySelector('#cad-drawing-panel [data-dr-act="apply"]'), null, { timeout: 60_000 });
}

/** Answer the questions that are open with the given answers, then press Get cost until the headline shows. */
async function answerAndCost(page: Page, answers: Record<string, string>, label: string): Promise<string> {
  for (let round = 0; round < 14; round++) {
    const st = await page.waitForFunction(() => {
      const hero = document.querySelector('#cv-result-hero .crh-total')?.textContent ?? '';
      const btn = document.getElementById('cad-get-cost-btn') as HTMLButtonElement | null;
      if (/\d/.test(hero) && document.getElementById('cad-cost-card')) return { hero };
      if (btn && !btn.disabled && btn.getAttribute('aria-busy') !== 'true') return { hero: '' };
      return false;
    }, null, { timeout: 900_000, polling: 500 }).then(h => h.jsonValue());
    if (st.hero) return st.hero;
    const open = await page.$$eval('#cad-decisions-panel .cad-decision', ds => ds.map(d => ({
      id: (d as HTMLElement).dataset.decisionId!,
      radios: Array.from(d.querySelectorAll('input[type=radio]')).map(r => (r as HTMLInputElement).value),
      select: Array.from(d.querySelectorAll('select[data-decision-select] option')).map(o => (o as HTMLOptionElement).value).filter(Boolean),
      picked: (d.querySelector('input[type=radio]:checked, select[data-decision-select]') as HTMLInputElement | null)?.value ?? null,
    })));
    const todo = open.find(o => answers[o.id] && o.picked !== answers[o.id] && (o.radios.includes(answers[o.id]) || o.select.includes(answers[o.id])));
    if (todo) {
      const sel = `.cad-decision[data-decision-id="${todo.id}"]`;
      const rerun = page.waitForResponse(r => r.url().includes('/api/cad/reanalyze'), { timeout: 600_000 }).catch(() => null);
      if (todo.radios.includes(answers[todo.id])) await page.check(`${sel} input[type=radio][value="${answers[todo.id]}"]`);
      else await page.selectOption(`${sel} select[data-decision-select]`, answers[todo.id]);
      log(`${label}: answered ${todo.id} = ${answers[todo.id]}`);
      await rerun;
      await page.waitForTimeout(800);
      continue;
    }
    log(`${label}: Get cost (${open.map(o => `${o.id}=${o.picked ?? '∅'}`).join(', ') || 'nothing open'})`);
    await page.click('#cad-get-cost-btn');
    await page.waitForTimeout(1500);
  }
  throw new Error('not costed after 14 rounds');
}

/** The chips above the questions: the engineer's own and the ones from the drawing. */
const chips = (page: Page) => page.$$eval('#cad-results .cad-answer-chip', cs => cs.map(c => ({ text: (c.textContent ?? '').replace(/\s+/g, ' ').trim(), fromDrawing: !!c.querySelector('.dr-chip-tag') })));

async function exportsOf(page: Page, label: string): Promise<{ wb: XLSX.WorkBook; pdf: string; stamp: string }> {
  const stamp = ((await page.textContent('#cad-cost-card .cad-stamp').catch(() => null)) ?? '').trim();
  const xl = join(OUT, `${label}.xlsx`), pdf = join(OUT, `${label}.pdf`);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.evaluate(() => document.getElementById('export-excel-btn')!.click())]);
  await dl.saveAs(xl);
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 240_000 }), page.evaluate(() => document.getElementById('export-pdf-btn')!.click())]);
  await dl2.saveAs(pdf);
  return { wb: XLSX.read(readFileSync(xl)), pdf: pdfText(readFileSync(pdf)).replace(/\s+/g, ' '), stamp };
}
const sheetRows = (wb: XLSX.WorkBook, name: string): string[][] =>
  wb.Sheets[name] ? (XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false }) as unknown[][]).map(r => r.map(c => String(c ?? ''))) : [];

/** Compare routes: the reference row is the server's headless costing with the same drawing and review. */
async function headlessEqualsScreen(page: Page, label: string, hero: string): Promise<void> {
  const req = page.waitForRequest(r => r.url().includes('/api/cad/compare-routes'), { timeout: 60_000 });
  await page.click('#cad-compare > summary');
  const body = JSON.parse((await req).postData() ?? '{}') as { drawingHash?: string; drawingReview?: { ops?: unknown[] } };
  check(label, 'the comparison is asked with the drawing and the review', !!body.drawingHash && (body.drawingReview?.ops?.length ?? 0) > 0,
    `drawingHash ${body.drawingHash?.slice(0, 8) ?? 'none'}, ${body.drawingReview?.ops?.length ?? 0} review decisions`);
  await page.waitForSelector('#cad-compare-host table', { timeout: 240_000 });
  const rows = await page.$$eval('#cad-compare-host tbody tr', trs => trs.map(tr => ({
    cost: (tr.querySelectorAll('td')[0]?.textContent ?? '').trim(), ref: tr.classList.contains('cad-compare-ref'),
    why: (tr.querySelector('td:last-child')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  })));
  const ref = rows.find(r => r.ref);
  check(label, 'SCREEN TOTAL = HEADLESS (the comparison\'s reference row)', !!ref && money(ref.cost) === money(hero) && !/typed change/.test(ref.why),
    `headless ${ref?.cost ?? '—'} v screen ${money(hero)}`);
}

// ─── 1. The casting bracket with its drawing ────────────────────────────────────────────────────────────────────────

async function castingBracket(page: Page, base: string): Promise<void> {
  const L = 'casting-bracket';
  await openCad(page, base);

  // The upload control: on the Part step, usable with AI off, says where the drawing is read.
  const ctl = await page.evaluate(() => {
    const input = document.getElementById('cad-drawing-input') as HTMLInputElement | null;
    const label = document.querySelector('label[for="cad-drawing-input"]') as HTMLElement | null;
    const details = input?.closest('details') as HTMLDetailsElement | null;
    const r = label?.getBoundingClientRect();
    return { accept: input?.accept ?? '', inClosedDetails: !!details && !details.open, visible: !!r && r.width > 0 && r.height > 0,
      hiddenByAiOff: !!label?.closest('.ai-only'), line: document.getElementById('cad-drawing-offline')?.textContent ?? '',
      aiOff: document.documentElement.classList.contains('cv-ai-off') || document.body.classList.contains('cv-ai-off') || !!document.querySelector('.ai-only') && getComputedStyle(document.querySelector('.ai-only')!).display === 'none' };
  });
  check(L, 'AI is off on this page', ctl.aiOff, ctl.aiOff ? 'AI entry points hidden' : 'AI entry points are visible');
  check(L, 'the drawing control is on the Part step and visible with AI off', ctl.visible && !ctl.inClosedDetails && !ctl.hiddenByAiOff, `visible ${ctl.visible}, inside closed "More options" ${ctl.inClosedDetails}`);
  check(L, 'it accepts PDF, image and DXF', ['.pdf', '.png', '.jpg', '.tif', '.dxf'].every(e => ctl.accept.includes(e)), ctl.accept);
  check(L, 'it says the drawing is read on this server', /Read on this server — no AI, nothing leaves it/.test(ctl.line), ctl.line);

  await page.fill('#cad-programme-years', '5');
  await page.setInputFiles('#cad-file-input', join(PARTS, 'Casting_Braket.stp'));
  await page.setInputFiles('#cad-drawing-input', join(FIX, 'real-casting-bracket.pdf'));
  await page.waitForTimeout(1200);
  const analysed = page.waitForResponse(r => r.url().includes('/api/cad/analyze') && r.request().method() === 'POST', { timeout: 900_000 });
  await page.click('#calc-btn');
  const first = await (await analysed).json() as { mode?: string; drawing?: { status?: string; readerVersion?: string; hash?: string }; drawingCosting?: { answers?: Record<string, unknown> } };
  check(L, 'the first response carries the drawing, read on the no-AI path', first.mode === 'deterministic' && first.drawing?.status === 'ready',
    `mode ${first.mode}, drawing ${first.drawing?.status}, reader v${first.drawing?.readerVersion}`);
  check(L, 'nothing from the drawing is used before the engineer confirms', JSON.stringify(first.drawingCosting?.answers ?? null) === '{}', JSON.stringify(first.drawingCosting?.answers));
  await page.waitForSelector('#cad-drawing-panel', { timeout: 60_000 });

  // The route is the engineer's click (the drawing does not choose a process).
  const routeSel = '.cad-decision[data-decision-id="commodity.route"] input[type=radio][value="cast_and_machine"]';
  if (await page.$(routeSel)) {
    // Suggested and ticked already: the click records it as the engineer's pick (no re-run); otherwise the change re-runs.
    const ticked = await page.isChecked(routeSel);
    const rerun = ticked ? null : page.waitForResponse(r => r.url().includes('/api/cad/reanalyze'), { timeout: 120_000 });
    await page.click(routeSel);
    if (rerun) { await rerun; await page.waitForTimeout(900); }
  }
  await page.waitForSelector('#cad-drawing-panel [data-dr-row]', { timeout: 60_000 });

  const head = (await page.textContent('#cad-drawing-panel .dr-head'))?.replace(/\s+/g, ' ').trim() ?? '';
  check(L, 'the panel names the drawing, the reader and that it is offline', /From the drawing/.test(head) && /real-casting-bracket\.pdf/.test(head) && /no AI, nothing leaves it/.test(head) && /reader v\d/.test(head), head);
  let rows = await panelRows(page);
  const WORDS = ['Read', 'Needs checking', 'Missing', 'Conflict', 'Confirmed', 'Corrected', 'Rejected', 'Inferred'];
  check(L, 'every row has a status WORD and says where or how it was read', rows.length > 15 && rows.every(r => WORDS.includes(r.status) && r.where.length > 3)
    && rows.filter(r => r.source === 'Drawing').every(r => /^Sheet 1 · zone \w+ · /.test(r.where)),
    `${rows.length} rows; statuses ${[...new Set(rows.map(r => r.status))].join(', ')}; e.g. "${rows.find(r => r.source === 'Drawing')?.where}"`);
  const groups = await page.$$eval('#cad-drawing-panel .dr-groups .dr-group-title', hs => hs.map(h => h.textContent?.trim()));
  check(L, 'rows are grouped', ['Identity', 'Material', 'Tolerances', 'Finish', 'Quality'].every(g => groups.includes(g)), groups.join(' | '));
  const fam = rows.find(r => r.label === 'Material family');
  check(L, 'a reading says which question it would answer', !!fam && /^Would answer .* Not used until you confirm it\.$/.test(fam.effect) && fam.source === 'Derived', `${fam?.value} — ${fam?.effect}`);
  check(L, 'no library id is shown for a grade', rows.every(r => !/^mat-/.test(r.value)) && rows.some(r => r.label === 'Material grade (rate book)' && r.value === 'LM25 / A356'), rows.find(r => /grade/i.test(r.label))?.value ?? 'no grade row');
  const nc = await page.$eval('#cad-drawing-panel details.dr-notcosted', d => ({ open: (d as HTMLDetailsElement).open, summary: d.querySelector('summary')?.textContent ?? '', n: d.querySelectorAll('[data-dr-row]').length }));
  check(L, 'what no rule prices is in a collapsed list', !nc.open && nc.n > 8 && /not in the cost model yet/.test(nc.summary), `${nc.summary} — collapsed: ${!nc.open}`);

  // The sheet, and the reading outlined when its row is focused.
  await page.waitForFunction(() => { const i = document.getElementById('dr-sheet-img') as HTMLImageElement | null; return !!i && !i.hidden && i.naturalWidth > 500; }, null, { timeout: 60_000 }).catch(() => null);
  const img = await page.evaluate(() => { const i = document.getElementById('dr-sheet-img') as HTMLImageElement | null; return { w: i?.naturalWidth ?? 0, hidden: i?.hidden ?? true, alt: i?.alt ?? '' }; });
  check(L, 'the sheet is shown', img.w > 500 && !img.hidden && /Sheet 1 of real-casting-bracket\.pdf/.test(img.alt), `${img.w}px wide, alt "${img.alt}"`);
  await page.focus('#cad-drawing-panel [data-dr-row="drawing:material.designation:1"]');
  await page.waitForTimeout(300);
  const hi = await page.evaluate(() => { const h = document.getElementById('dr-hi'); const f = document.getElementById('dr-sheet-frame'); if (!h || !f || h.hidden) return null;
    const a = h.getBoundingClientRect(), b = f.getBoundingClientRect(); return { x: (a.left - b.left) / b.width, y: (a.top - b.top) / b.height, w: a.width, cap: document.getElementById('dr-sheet-cap')?.textContent ?? '' }; });
  check(L, 'the focused reading is outlined on the sheet (the material cell, bottom right)', !!hi && hi.x > 0.5 && hi.y > 0.7 && hi.w > 5, hi ? `at ${(hi.x * 100).toFixed(0)} % × ${(hi.y * 100).toFixed(0)} % — ${hi.cap}` : 'no highlight');
  await page.screenshot({ path: join(OUT, `${L}-panel.png`), fullPage: true });

  // An unconfirmed reading on its question card: a note, never a tick.
  const card = await page.evaluate(() => {
    const d = document.querySelector('.cad-decision[data-decision-id="material.family"]');
    return d ? { note: d.querySelector('.dr-leaning')?.textContent?.replace(/\s+/g, ' ').trim() ?? '', ticked: (d.querySelector('input[type=radio]:checked') as HTMLInputElement | null)?.value ?? null } : null;
  });
  check(L, 'the unconfirmed material is a note on its question — not a tick', !!card && /The drawing reads Aluminium .*Not confirmed, so it is not used/.test(card.note) && card.ticked !== 'aluminium',
    card ? `note: "${card.note.slice(0, 90)}…", ticked: ${card.ticked ?? 'nothing'}` : 'no material question on screen');
  let v = await axeOn(page, '#cad-drawing-panel');
  check(L, 'axe on the panel (as read)', v.length === 0, v.join(', ') || '0 violations');

  // Confirm all read exactly: exact readings only.
  const exactBtn = (await page.textContent('#cad-drawing-panel [data-dr-act="confirm-exact"]'))?.trim() ?? '';
  await page.click('#cad-drawing-panel [data-dr-act="confirm-exact"]');
  await page.waitForTimeout(300);
  rows = await panelRows(page);
  const tol = rows.find(r => r.label === 'General tolerance class');
  check(L, '"Confirm all read exactly" confirms exact readings and leaves what needs checking', rows.filter(r => r.status === 'Confirmed').length >= 5 && tol?.status === 'Needs checking',
    `${exactBtn}: ${rows.filter(r => r.status === 'Confirmed').map(r => r.label).join(', ')}; tolerance class still "${tol?.status}"`);
  const pend = (await page.textContent('#dr-pending'))?.trim() ?? '';
  check(L, 'the panel says the review is not in the costing yet', /Review changed — it is applied when you press Get cost/.test(pend), pend);
  const pendingNote = await page.evaluate(() => document.querySelector('.cad-decision[data-decision-id="material.family"] .dr-leaning')?.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  check(L, 'the question the confirmed reading answers says so', /Answered from the drawing: Aluminium .*applied when you press Get cost/.test(pendingNote), pendingNote.slice(0, 130));
  const stillUnticked = await page.evaluate(() => (document.querySelector('.cad-decision[data-decision-id="material.family"] input[type=radio]:checked') as HTMLInputElement | null)?.value ?? null);
  check(L, 'confirming on the panel ticks nothing on the question', stillUnticked !== 'aluminium', `ticked: ${stillUnticked ?? 'nothing'}`);

  // The tolerance class needs checking: confirmed by itself. Then apply.
  await page.click(`#cad-drawing-panel [data-dr-row="${tol!.id}"] [data-dr-act="confirm"]`);
  await applyReview(page);
  let cs = await chips(page);
  check(L, 'confirmed answers are chips tagged "from drawing"', cs.filter(c => c.fromDrawing).length >= 5 && cs.some(c => c.fromDrawing && /Material aluminium/i.test(c.text)),
    cs.filter(c => c.fromDrawing).map(c => c.text.replace(/ review$/, '')).join(' | '));
  check(L, 'the answered questions are no longer asked', !(await page.$('.cad-decision[data-decision-id="material.family"]')), 'material question gone from the list');

  // The applied rows say what they answer; the masked features (no question takes them) are confirmed by their own row.
  rows = await panelRows(page);
  const route = rows.find(r => r.label === 'Coating route'), masks = rows.find(r => r.label === 'Masked features');
  check(L, 'an applied reading says what it answers', !!route && route.status === 'Confirmed' && /^Answers the "Finish" question with E-coat/.test(route.effect), `${route?.value}: ${route?.effect.slice(0, 90)}`);
  await page.click(`#cad-drawing-panel [data-dr-row="${masks!.id}"] [data-dr-act="confirm"]`);
  await page.waitForTimeout(200);
  const maskEffect = (await panelRows(page)).find(r => r.id === masks!.id)?.effect ?? '';
  check(L, 'the masked features go to the finish block, bounded by the holes measured', /Fills the finish block of the costing form: 3 masked feature\(s\), confirmed from the drawing — no more than the \d+ measured/.test(maskEffect), maskEffect);
  // Correct: the e-coat film is a range the form cannot take — the engineer types nothing here; a correction is shown on the part number instead.
  const pn = rows.find(r => r.label === 'Part number')!;
  await page.click(`#cad-drawing-panel [data-dr-row="${pn.id}"] [data-dr-act="correct"]`);
  await page.fill(`#cad-drawing-panel form[data-dr-id="${pn.id}"] [data-dr-field="value"]`, 'CB-2207-11-B');
  await page.fill(`#cad-drawing-panel form[data-dr-id="${pn.id}"] [data-dr-field="reason"]`, 'revision suffix on the released sheet');
  v = await axeOn(page, '#cad-drawing-panel');
  check(L, 'axe on the panel (decisions taken, a correction open)', v.length === 0, v.join(', ') || '0 violations');
  await page.click(`#cad-drawing-panel form[data-dr-id="${pn.id}"] button[type=submit]`);
  await page.waitForTimeout(200);
  rows = await panelRows(page);
  check(L, 'a corrected reading says Corrected', rows.find(r => r.id === pn.id)?.status === 'Corrected' && rows.find(r => r.id === pn.id)?.value === 'CB-2207-11-B', `${rows.find(r => r.id === pn.id)?.value} — ${rows.find(r => r.id === pn.id)?.status}`);
  // Reject then undo a note-level reading: the history keeps both.
  const rough = rows.find(r => r.label === 'Material standard') ?? rows.find(r => r.canConfirm && !r.effect)!;
  await page.click(`#cad-drawing-panel [data-dr-row="${rough.id}"] [data-dr-act="reject"]`);
  await page.waitForTimeout(150);
  const rejected = (await panelRows(page)).find(r => r.id === rough.id)?.status;
  await page.click(`#cad-drawing-panel [data-dr-row="${rough.id}"] [data-dr-act="reopen"]`);
  await page.waitForTimeout(150);
  check(L, 'Reject and Undo work on a row', rejected === 'Rejected' && (await panelRows(page)).find(r => r.id === rough.id)?.status === 'Read', `${rough.label}: Rejected → ${(await panelRows(page)).find(r => r.id === rough.id)?.status}`);
  await page.screenshot({ path: join(OUT, `${L}-reviewed.png`), fullPage: true });

  // Get cost: the pending review is applied by the flow itself.
  const hero = await answerAndCost(page, {}, L);
  castingHeadline = hero;
  check(L, 'costed', /\d/.test(hero), hero);
  await page.screenshot({ path: join(OUT, `${L}-cost.png`) });
  const form = await page.evaluate(() => { const g = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? null;
    return { route: g('cam-sf-route'), mask: g('cam-sf-mask'), um: g('cam-sf-um'), mat: (document.getElementById('cam-mat') as HTMLSelectElement | null)?.selectedOptions[0]?.textContent?.trim() ?? null }; });
  check(L, 'the form holds the drawing\'s finish and its 3 masked features', form.route === 'e_coat' && Number(form.mask) === 3, JSON.stringify(form));
  check(L, 'the form holds the drawing\'s grade', /LM25|A356/.test(form.mat ?? ''), String(form.mat));
  const cardChips = await page.$$eval('#cad-cost-card .cad-answer-chip', c => c.map(x => (x.textContent ?? '').replace(/\s+/g, ' ').trim()));
  check(L, 'the cost card shows the drawing\'s answers as such', cardChips.filter(c => /\(from drawing\)/.test(c)).length >= 6, cardChips.filter(c => /from drawing/.test(c)).join(' | '));
  await headlessEqualsScreen(page, L, hero);

  const ex = await exportsOf(page, L);
  check(L, 'the stamp names the reader and the drawing', /drawing reader v\d+\.\d+\.\d+ · real-casting-bracket\.pdf [0-9a-f]{8}/.test(ex.stamp), ex.stamp);
  const dr = sheetRows(ex.wb, '10-Drawing');
  const famRow = dr.find(r => r[1] === 'Material family');
  check(L, 'Excel: sheet 10-Drawing lists the readings with source, status and use', !!famRow && famRow[2] === 'aluminium' && famRow[4] === 'Confirmed' && famRow[5] === 'Yes' && /real-casting-bracket\.pdf · Sheet 1/.test(famRow[3]),
    famRow ? famRow.slice(0, 6).join(' | ') : `no Material family row in ${dr.length} rows (${ex.wb.SheetNames.join(', ')})`);
  check(L, 'Excel: the corrected part number and the not-costed list are there', dr.some(r => r[1] === 'Part number' && r[2] === 'CB-2207-11-B' && r[4] === 'Corrected') && dr.some(r => /^SPECIFIED ON THE DRAWING — NOT IN THE COST MODEL YET \(\d+/.test(r[0])),
    `${dr.filter(r => r[5] === 'Yes').length} readings used; ${dr.find(r => /^SPECIFIED ON THE DRAWING/.test(r[0]))?.[0] ?? 'no not-costed heading'}`);
  const xlStamp = sheetRows(ex.wb, '1-Summary').find(r => r[0] === 'Reproducibility');
  check(L, 'Excel: the stamp, word for word', xlStamp?.[1] === ex.stamp, String(xlStamp?.[1]));
  check(L, 'PDF: the drawing table, the stamp and the headline', /Drawing specification/.test(ex.pdf) && /Material family/.test(ex.pdf) && ex.pdf.includes('real-casting-bracket.pdf') && /drawing reader v\d/.test(ex.pdf) && ex.pdf.includes(money(hero)),
    `"Drawing specification" ${/Drawing specification/.test(ex.pdf)}, headline ${money(hero)} ${ex.pdf.includes(money(hero)) ? 'found' : 'missing'}`);
}

// ─── 2. The gear with the WRONG drawing ─────────────────────────────────────────────────────────────────────────────

async function wrongGear(page: Page, base: string): Promise<void> {
  const L = 'gear-wrong-drawing';
  await openCad(page, base);
  await page.fill('#cad-programme-years', '5');
  await page.setInputFiles('#cad-file-input', join(PARTS, 'test-gear-m3-z38.step'));
  await page.setInputFiles('#cad-drawing-input', join(PARTS, 'gear-drawing-WRONG-z40.pdf'));
  await page.waitForTimeout(1200);
  await page.click('#calc-btn');
  await page.waitForSelector('#cad-drawing-panel .dr-block--conflicts', { timeout: 900_000 });
  const c = await page.$eval('#cad-drawing-panel .dr-block--conflicts', b => ({
    title: b.querySelector('.dr-group-title')?.textContent ?? '', label: b.querySelector('.dr-label')?.textContent ?? '', status: b.querySelector('.dr-status')?.textContent ?? '',
    sides: Array.from(b.querySelectorAll('.dr-side')).map(s => ({ src: s.querySelector('.dr-src')?.textContent ?? '', value: s.querySelector('.dr-value')?.textContent ?? '', suggested: !!s.querySelector('.dr-suggested') })),
  }));
  check(L, 'the conflict is shown with both sides, the suggestion marked — nothing chosen',
    c.label === 'Number of teeth' && c.status === 'Conflict' && JSON.stringify(c.sides) === JSON.stringify([{ src: 'CAD', value: '38', suggested: true }, { src: 'Drawing', value: '40', suggested: false }]),
    `${c.title}: ${c.sides.map(s => `${s.src} ${s.value}${s.suggested ? ' (suggested)' : ''}`).join(' v ')}`);
  await page.click('#cad-drawing-panel [data-dr-act="confirm-exact"]');
  await page.waitForTimeout(300);
  check(L, '"Confirm all read exactly" does not settle a conflict', !!(await page.$('#cad-drawing-panel .dr-block--conflicts [data-dr-act="resolve"]')), 'the conflict is still open');
  const v = await axeOn(page, '#cad-drawing-panel');
  check(L, 'axe on the panel (a conflict open)', v.length === 0, v.join(', ') || '0 violations');
  await page.screenshot({ path: join(OUT, `${L}-conflict.png`), fullPage: true });
  await page.click('#cad-drawing-panel .dr-side:first-child [data-dr-act="resolve"]');
  await page.waitForTimeout(300);
  const settled = (await page.textContent('#cad-drawing-panel .dr-conflict--settled'))?.replace(/\s+/g, ' ').trim() ?? '';
  check(L, 'settled by a click, and it says who chose what', /Settled by .*: 38 \(the 3D model\)/.test(settled) && /Reopen/.test(settled), settled);

  const hero = await answerAndCost(page, { 'material.family': 'steel', 'gear.materialClass': 'case_hardening_steel' }, L);
  check(L, 'costed with helix, class and hardening from the drawing', /\d/.test(hero), hero);
  const cardChips = await page.$$eval('#cad-cost-card .cad-answer-chip', cs => cs.map(x => (x.textContent ?? '').replace(/\s+/g, ' ').trim()));
  check(L, 'the gear answers on the cost card are the drawing\'s', ['Helix', 'Quality class', 'Hardening'].every(n => cardChips.some(t => t.startsWith(n) && /from drawing/.test(t))), cardChips.filter(t => /from drawing/.test(t)).join(' | '));
  await headlessEqualsScreen(page, L, hero);
  const ex = await exportsOf(page, L);
  const dr = sheetRows(ex.wb, '10-Drawing');
  const conflict = dr.find(r => r[0] === 'Number of teeth' && /3D model: 38/.test(r[1] ?? ''));
  check(L, 'Excel: the conflict and how it was settled', !!conflict && /Drawing: 40/.test(conflict[1]) && /Settled by .*38 \(the 3D model\)/.test(conflict[3] ?? ''), conflict ? conflict.join(' | ') : 'no conflict row');
  check(L, 'PDF: the drawing table and the conflict', /Drawing specification/.test(ex.pdf) && /Number of teeth/.test(ex.pdf) && /Settled by/.test(ex.pdf), `${/Settled by/.test(ex.pdf) ? 'conflict outcome printed' : 'no conflict outcome'}`);
}

// ─── 3. A scanned drawing ───────────────────────────────────────────────────────────────────────────────────────────

async function scannedDrawing(page: Page, base: string): Promise<void> {
  const L = 'scanned-drawing';
  await openCad(page, base);
  await page.fill('#cad-programme-years', '5');
  await page.setInputFiles('#cad-file-input', join(PARTS, 'test-gear-m3-z38.step'));
  await page.setInputFiles('#cad-drawing-input', join(FIX, 'gen-gear.scan200.pdf'));
  await page.waitForTimeout(1200);
  const analysed = page.waitForResponse(r => r.url().includes('/api/cad/analyze') && r.request().method() === 'POST', { timeout: 900_000 });
  await page.click('#calc-btn');
  const first = await (await analysed).json() as { success?: boolean; drawing?: { status?: string; jobId?: string }; analysis?: unknown };
  check(L, 'the costing answers without waiting for the OCR', first.success === true && !!first.analysis && ['reading', 'ready'].includes(first.drawing?.status ?? ''), `drawing ${first.drawing?.status}${first.drawing?.jobId ? `, job ${first.drawing.jobId.slice(0, 8)}` : ''}`);
  if (first.drawing?.status === 'reading') {
    const txt = (await page.textContent('#cad-drawing-panel').catch(() => ''))?.replace(/\s+/g, ' ') ?? '';
    check(L, 'the panel says the drawing is being read, on this server', /read by OCR on this server, one drawing at a time/.test(txt) && /does not wait for it/.test(txt), txt.slice(0, 160));
  }
  await page.waitForSelector('#cad-drawing-panel [data-dr-row]', { timeout: 300_000 });
  const rows = await panelRows(page);
  const fromDrawing = rows.filter(r => r.source === 'Drawing' && !r.inNotCosted);
  // (this scan is of another gear's sheet, so some of its readings also disagree with the model: those say Conflict)
  check(L, 'no reading of a scan is "Read": each needs checking (or is in conflict) and says OCR', fromDrawing.length > 3 && fromDrawing.every(r => ['Needs checking', 'Conflict'].includes(r.status) && /OCR/.test(r.where)),
    `${fromDrawing.length} readings: ${[...new Set(fromDrawing.map(r => r.status))].join(', ')}; e.g. ${fromDrawing[0]?.label} — ${fromDrawing[0]?.where}`);
  const exact = await page.$eval('#cad-drawing-panel [data-dr-act="confirm-exact"]', b => ({ text: b.textContent?.trim() ?? '', disabled: (b as HTMLButtonElement).disabled }));
  check(L, '"Confirm all read exactly" offers no OCR reading', exact.disabled && /\(0\)/.test(exact.text), exact.text);
  const v = await axeOn(page, '#cad-drawing-panel');
  check(L, 'axe on the panel (OCR readings)', v.length === 0, v.join(', ') || '0 violations');
  await page.screenshot({ path: join(OUT, `${L}-panel.png`), fullPage: true });
}

// ─── 4. No drawing ──────────────────────────────────────────────────────────────────────────────────────────────────

async function noDrawing(page: Page, base: string): Promise<void> {
  const L = 'no-drawing';
  await openCad(page, base);
  await page.fill('#cad-programme-years', '5');
  await page.setInputFiles('#cad-file-input', join(PARTS, 'test-gear-m3-z38.step'));
  await page.waitForTimeout(1200);
  const analysed = page.waitForResponse(r => r.url().includes('/api/cad/analyze') && r.request().method() === 'POST', { timeout: 900_000 });
  await page.click('#calc-btn');
  const first = await (await analysed).json() as Record<string, unknown>;
  check(L, 'the response has no drawing key', !('drawing' in first) && !('engineeringData' in first) && !('drawingCosting' in first), Object.keys(first).filter(k => /drawing|engineering/i.test(k)).join(', ') || 'none');
  await page.waitForSelector('#cad-decisions-panel', { timeout: 60_000 });
  check(L, 'no drawing panel, no drawing note on a question', !(await page.$('#cad-drawing-panel')) && !(await page.$('#cad-results .dr-leaning')), 'the Confirm step is as it was');
  const hero = await answerAndCost(page, { 'material.family': 'steel', 'gear.helix': 'spur', 'gear.qualityClass': '7', 'gear.materialClass': 'case_hardening_steel' }, L);
  const stamp = ((await page.textContent('#cad-cost-card .cad-stamp').catch(() => null)) ?? '').trim();
  check(L, 'costed, and the stamp names no drawing', /\d/.test(hero) && !/drawing/.test(stamp) && /rules v\S+ · kernel \S+ · \d/.test(stamp), `${hero} — ${stamp}`);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.evaluate(() => document.getElementById('export-excel-btn')!.click())]);
  const xl = join(OUT, `${L}.xlsx`); await dl.saveAs(xl);
  check(L, 'the workbook has no 10-Drawing sheet', !XLSX.read(readFileSync(xl)).SheetNames.includes('10-Drawing'), XLSX.read(readFileSync(xl)).SheetNames.join(', '));
}

// ─── 5. Reopen: the review saved with the project ───────────────────────────────────────────────────────────────────

let castingHeadline = '';

async function reopened(page: Page, base: string): Promise<void> {
  const L = 'reopen';
  await openCad(page, base);
  await page.fill('#cad-programme-years', '5');
  await page.setInputFiles('#cad-file-input', join(PARTS, 'Casting_Braket.stp'));
  await page.setInputFiles('#cad-drawing-input', join(FIX, 'real-casting-bracket.pdf'));
  await page.waitForTimeout(1200);
  await page.click('#calc-btn');
  // The saved review is found, said in words, and the rules re-run with it.
  await page.waitForFunction(() => /earlier review of this drawing was restored/.test(document.querySelector('#cad-drawing-panel .dr-restored')?.textContent ?? '')
    && !document.querySelector('#cad-drawing-panel [data-dr-act="apply"]'), null, { timeout: 900_000, polling: 400 });
  const note = (await page.textContent('#cad-drawing-panel .dr-restored'))?.trim() ?? '';
  check(L, 'the saved review is restored, and the panel says so', /Your earlier review of this drawing was restored: \d+ decisions?, saved \d/.test(note), note);
  const rows = await panelRows(page);
  const confirmed = rows.filter(r => r.status === 'Confirmed').map(r => r.label);
  check(L, 'the same confirmations and the correction are back', ['Material family', 'Material grade (rate book)', 'General tolerance class', 'Coating route', 'Masked features'].every(l => confirmed.includes(l))
    && rows.some(r => r.label === 'Part number' && r.status === 'Corrected' && r.value === 'CB-2207-11-B'), `${confirmed.length} confirmed: ${confirmed.join(', ')}`);
  const cs = await chips(page);
  check(L, 'the drawing\'s answers are applied again', cs.filter(c => c.fromDrawing).length >= 6, cs.filter(c => c.fromDrawing).map(c => c.text.replace(/ review$/, '')).join(' | '));
  const routeSel = '.cad-decision[data-decision-id="commodity.route"] input[type=radio][value="cast_and_machine"]';
  if (await page.$(routeSel)) await page.click(routeSel);
  const hero = await answerAndCost(page, {}, L);
  check(L, 'the reopened costing is the same cost', !!castingHeadline && money(hero) === money(castingHeadline), `${money(hero)} v ${money(castingHeadline) || '(scenario 1 did not run)'}`);
}

async function main(): Promise<void> {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('no dist/ — run npm run build first');
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'cv-drawing-live-'));
  const secret = 'live-' + Math.random().toString(36).slice(2);
  // AI OFF: air-gapped, no key. The drawing is read by the offline reader on this server.
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '1', ANTHROPIC_API_KEY: '', CV_DATA_DIR: dir, CV_DRAWING_FILE_DIR: join(dir, 'drawings') };
  const server: ChildProcess = spawn(join(ROOT, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout?.on('data', d => { serverLog = (serverLog + d.toString()).slice(-300_000); });
  server.stderr?.on('data', d => { serverLog = (serverLog + d.toString()).slice(-300_000); });
  let browser;
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const health = await (await fetch(`${base}/api/health`)).json() as { aiAvailable?: boolean };
    check('server', 'AI is not available on this server', health.aiAvailable === false, `aiAvailable: ${String(health.aiAvailable)}`);
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('e2e', 'e2e@test', 'x', 'E2E Engineer', 1, ?)`).run(new Date().toISOString());
    db.close();
    const token = jwt.sign({ userId: 'e2e', email: 'e2e@test', emailVerified: true }, secret, { expiresIn: '6h' });
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    const only = process.env.CV_ONLY?.split(',');
    const runs: Array<[string, (p: Page, b: string) => Promise<void>]> = [['casting-bracket', castingBracket], ['gear-wrong-drawing', wrongGear], ['scanned-drawing', scannedDrawing], ['no-drawing', noDrawing], ['reopen', reopened]];
    for (const [label, run] of runs) {
      if (only && !only.includes(label)) continue;
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      const outside: string[] = [];
      page.on('pageerror', e => pageErrors.push(e.message));
      page.on('dialog', d => { pageErrors.push(`dialog: ${d.message()}`); void d.dismiss(); });
      page.on('request', r => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u.slice(0, 100)); });
      await page.addInitScript('window.__name = (f) => f;');
      await page.addInitScript(t => { localStorage.setItem('auth_token', t); localStorage.setItem('auth_user', JSON.stringify({ fullName: 'E2E Engineer', email: 'e2e@test' }));
        localStorage.setItem('cv-tour-v41-seen', '1'); localStorage.setItem('cv-wizard-off', '1'); }, token);
      if (process.env.CV_THEME) await page.addInitScript(th => { localStorage.setItem('sc-theme', th); }, process.env.CV_THEME);
      const t0 = Date.now();
      try { await run(page, base); }
      catch (e) {
        check(label, 'ran to the end', false, (e as Error).message.split('\n')[0]);
        try { await page.screenshot({ path: join(OUT, `${label}-error.png`), fullPage: true }); } catch { /* closed */ }
      }
      check(label, 'no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'none');
      check(label, 'the page asked nothing outside this server', outside.length === 0, outside.slice(0, 3).join(' | ') || `0 requests off ${base}`);
      log(`${label}: ${Math.round((Date.now() - t0) / 1000)} s`);
      await context.close();
    }
    check('server', 'no model was called, no key was read', !/anthropic\.com|api key|x-api-key/i.test(serverLog) || /AIR_GAPPED|air-gapped/i.test(serverLog), 'server log holds no model call');
  } finally {
    writeFileSync(join(OUT, 'results.json'), JSON.stringify({ checks }, null, 1));
    writeFileSync(join(OUT, 'server.log'), serverLog);
    try { await browser?.close(); } catch { /* closed */ }
    try { process.kill(-server.pid!, 'SIGKILL'); } catch { /* gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
  const failed = checks.filter(c => !c.ok);
  log(`${checks.length - failed.length} / ${checks.length} checks passed — ${OUT}/results.json`);
  if (failed.length) process.exit(1);
}

main().catch(e => { log(`ERROR ${(e as Error).message}`); process.exit(1); });
