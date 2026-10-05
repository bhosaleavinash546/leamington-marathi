/**
 * PCB Image → BOM → Cost scorecard: the same adversarial case through ANY version of the
 * code, scored on fixed pass/fail checks (PCB review, Oct 2026 — docs/pcb/pcb-review-2026-10.md §8).
 *
 *   npx tsx e2e/pcb-scorecard.ts <calculator dir> <label> [--client=before|after]
 *
 * The case is the radar board as the real model read it on 2026-09-29, plus planted model
 * faults: an invented part number at the model's own price, a part listed twice from two
 * photos, wrong quantities, a wrong memory variant, a "read off the chip" claim no OCR
 * marking supports, and 50 sub-penny resistors. A stand-in model answers every call and
 * logs what each call received (how many photos, the prompt), so the photo checks measure
 * the requests the server really sent. The version's own server runs from its own
 * directory; the screen's follow-up calls (re-analyze, what-if) are sent as THAT
 * version's screen sends them (`--client`).
 *
 * Photo-reading accuracy (does the model read a real board right?) is NOT scored here: it
 * needs labelled boards (tests/fixtures/pcb-boards/), and a stand-in model reads nothing.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { createServer as httpServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const DIR = resolve(process.argv[2] ?? '.');
const LABEL = process.argv[3] ?? 'run';
const CLIENT = (process.argv.find(a => a.startsWith('--client='))?.split('=')[1] ?? 'after') as 'before' | 'after';
const OUT = process.env.CV_SCORE_OUT ?? tmpdir();
const R = JSON.parse(readFileSync(join(resolve('.'), 'e2e/fixtures/pcb-radar-replies.json'), 'utf8'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVQIW2NkYGD4DwABBAEAX+XJ2QAAAABJRU5ErkJggg==', 'base64');
const LABELS = ['Top side', 'Bottom side', 'Additional 1', 'Additional 2', 'Additional 3', 'Additional 4', 'Additional 5', 'Additional 6'];
const QTY = 250_000;

const freePort = () => new Promise<number>((res, rej) => { const s = netServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

// ── The case: the real radar reading + planted model faults ─────────────────
const analysis = JSON.parse(JSON.stringify(R.analysis));
const u2 = analysis.bom.find((l: { refDes: string }) => l.refDes === 'U2');
analysis.bom.push(
  // Invented part number, model's own price, confident.
  { refDes: 'U20', partNumber: 'XYZ9921', componentType: 'ic_qfn', description: 'Automotive buck regulator', pkg: 'QFN-16', value: '', voltage: '', qty: 1, unitPriceGBP: 9.5, moq: 1, automotive: true, highCost: false, lineConf: 0.8, ocrExtracted: false },
  // The same transceiver again, seen in a close-up.
  { ...u2, description: `${u2.description} (seen again in close-up 2)` },
  // Designators say 10, qty says 12.
  { refDes: 'R101-R110', partNumber: '', componentType: 'passive_0402', description: 'Resistor 0402 10k', pkg: '0402', value: '10k', voltage: '', qty: 12, unitPriceGBP: 0.002, moq: 1, automotive: true, highCost: false, lineConf: 0.7, ocrExtracted: false },
  // A non-whole quantity.
  { refDes: 'L20', partNumber: '', componentType: 'inductor_smd', description: 'Power inductor', pkg: '0806', value: '4.7uH', voltage: '', qty: 1.5, unitPriceGBP: 0.08, moq: 1, automotive: true, highCost: false, lineConf: 0.7, ocrExtracted: false },
  // A 32 Gb LPDDR4 the catalogue only has as an 8 Gb family entry.
  { refDes: 'U21', partNumber: 'MT53E1G32D2FW', componentType: 'ic_bga', description: 'LPDDR4 32Gb DRAM', pkg: 'BGA-200', value: '', voltage: '', qty: 1, unitPriceGBP: 9, moq: 1, automotive: true, highCost: true, lineConf: 0.9, ocrExtracted: false },
  // "Read off the chip" — but no OCR marking says so.
  { refDes: 'U22', partNumber: 'ABC1234X', componentType: 'ic_soic', description: 'Sensor interface IC', pkg: 'SOIC-8', value: '', voltage: '', qty: 1, unitPriceGBP: 4, moq: 1, automotive: true, highCost: false, lineConf: 1, ocrExtracted: true },
  // 50 sub-penny resistors, one line each (a BOM file splits "R1,R2,…" like this).
  ...Array.from({ length: 50 }, (_, i) => ({ refDes: `R${201 + i}`, partNumber: '', componentType: 'passive_0402', description: 'Resistor 0402', pkg: '0402', value: '1k', voltage: '', qty: 1, unitPriceGBP: 0.003, moq: 1, automotive: true, highCost: false, lineConf: 0.7, ocrExtracted: false })),
);
// As structured output returns it: the schema (pcb-analysis-schema.ts, additionalProperties
// false) has no stage1Classification / ocrExtraction — the 2026-09-29 recording predates it and
// still carries the model's echo of them.
delete analysis.stage1Classification; delete analysis.ocrExtraction;
const REPLIES = { ...R, analysis };

// ── Stand-in model that logs what each call received ─────────────────────────
interface CallLog { kind: string; images: number; text: string }
const calls: CallLog[] = [];
function standIn(port: number): Server {
  return httpServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let j: Record<string, unknown> = {};
      try { j = JSON.parse(body); } catch { /* not JSON */ }
      const sys = typeof j.system === 'string' ? j.system : JSON.stringify(j.system ?? '');
      const msgs = JSON.stringify(j.messages ?? '');
      const images = (msgs.match(/"type":"image"/g) ?? []).length;
      const userText = ((j.messages as Array<{ content: unknown }> | undefined) ?? []).map(m => typeof m.content === 'string' ? m.content
        : (m.content as Array<{ type: string; text?: string }>).filter(b => b.type === 'text').map(b => b.text).join('\n')).join('\n');
      let kind: string; let out: unknown;
      if (/classification expert/i.test(sys)) { kind = 'stage1'; out = REPLIES.stage1; }
      else if (/reading (PCB )?text|reading text from PCB|reading PCB text/i.test(sys)) { kind = 'ocr'; out = REPLIES.ocr; }
      else if (/SECOND-PASS/.test(userText)) { kind = 'stage3b'; out = [{ refDes: 'U9', markingRead: '', identifiedPartNumber: '', lineConf: 0.3, unitPriceGBP: 40 }]; }
      else if (/asilLevel/.test(msgs.slice(-4000)) || (/ASIL/i.test(sys.slice(0, 300)) && !/cost engineer/i.test(sys))) { kind = 'asil'; out = REPLIES.asil; }
      else { kind = 'bom'; out = REPLIES.analysis; }
      calls.push({ kind, images, text: `${sys}\n${userText}` });
      const outText = JSON.stringify(out);
      if (j.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const ev = (type: string, data: Record<string, unknown>) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
        ev('message_start', { message: { id: 'm', type: 'message', role: 'assistant', model: j.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } });
        ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        for (let i = 0; i < outText.length; i += 2000) ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: outText.slice(i, i + 2000) } });
        ev('content_block_stop', { index: 0 });
        ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } });
        ev('message_stop', {});
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: j.model, stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: outText }], usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  }).listen(port, '127.0.0.1');
}

type Rec = Record<string, unknown>;
const num = (v: unknown) => Number(v) || 0;
interface Check { group: string; id: string; name: string; pass: boolean; detail: string }
const checks: Check[] = [];
const check = (group: string, id: string, name: string, pass: boolean, detail: string) => checks.push({ group, id, name, pass, detail });

async function main(): Promise<void> {
  const [port, aiPort] = [await freePort(), await freePort()];
  const ai = standIn(aiPort);
  const dir = mkdtempSync(join(tmpdir(), 'cv-score-'));
  const secret = 'score-' + Math.random().toString(36).slice(2);
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, AIR_GAPPED: '0',
    ANTHROPIC_API_KEY: 'sk-stand-in', ANTHROPIC_BASE_URL: `http://127.0.0.1:${aiPort}`, CV_DATA_DIR: dir,
    OCTOPART_API_KEY: '', RS_API_KEY: '', NEXAR_CLIENT_ID: '', NEXAR_CLIENT_SECRET: '' };
  const server: ChildProcess = spawn(join(DIR, 'node_modules/.bin/tsx'), ['server/index.ts'], { cwd: DIR, env, detached: true, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ } if (i > 240) throw new Error('server did not start'); await new Promise(r => setTimeout(r, 250)); }
    const db = new Database(join(dir, 'should-cost.db'));
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_verified, created_at) VALUES ('s', 's@test', 'x', 'Scorer', 1, ?)`).run(new Date().toISOString());
    db.close();
    const auth = { Authorization: `Bearer ${jwt.sign({ userId: 's', email: 's@test', emailVerified: true }, secret, { expiresIn: '1h' })}` };

    const stream = async (extra?: (fd: FormData) => void): Promise<Rec> => {
      const fd = new FormData();
      for (let i = 0; i < 8; i++) fd.append('pcbImages', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), `${i}.png`);
      fd.append('pcbImageLabels', JSON.stringify(LABELS)); fd.append('orderQty', String(QTY)); fd.append('country', 'cn');
      extra?.(fd);
      const r = await fetch(`${base}/api/pcb/analyze-image-stream`, { method: 'POST', headers: auth, body: fd });
      const text = await r.text();
      const evs = text.split('\n\n').map(b => b.replace(/^data: /, '')).filter(Boolean).map(b => { try { return JSON.parse(b) as Rec; } catch { return null; } }).filter(Boolean) as Rec[];
      const done = evs.find(e => e.type === 'complete');
      if (!done) throw new Error(`no complete event: ${JSON.stringify(evs.find(e => e.type === 'error'))}`);
      return done;
    };

    // ── The analysis, as the screen runs it ─────────────────────────────────
    const p = await stream();
    const a = p.analysis as Rec;
    const bom = a.bom as Rec[];
    const bd = p.selectedCountryBreakdown as Rec & { breakdown: Rec };
    const ce = a.costEstimates as Rec;
    const headline = num(bd.totalPerBoard);
    const line = (ref: string) => bom.find(l => String(l.refDes) === ref || String(l.refDes).split(/[,\s]+/).includes(ref));

    // A. Golden rule and honest labels
    const modelOnly = bom.filter(l => !['catalogue', 'known-range', 'function-range', 'class-range', 'not-fitted', 'user'].includes(String(l.priceSource)));
    check('A', 'A1', 'No line in the total is priced by the model alone', modelOnly.length === 0, `${modelOnly.length} line(s) with priceSource ${[...new Set(modelOnly.map(l => String(l.priceSource)))].join(', ') || '—'}`);
    const x = line('U20');
    check('A', 'A2', 'Invented part number (XYZ9921, model £9.50) is not kept at the model\'s price as "confirmed"',
      !!x && !(x.priceSource === 'ai-estimate' && x.needsVerification !== true), x ? `£${num(x.unitPriceGBP).toFixed(4)}, ${x.priceSource}, to verify: ${x.needsVerification === true}` : 'line missing');
    const liveNoKey = bom.filter(l => l.livePriced === true);
    check('A', 'A3', '"LIVE" only when a distributor was called (none here)', liveNoKey.length === 0, `${liveNoKey.length} line(s) badged live with no distributor key`);
    const claim = line('U22');
    check('A', 'A4', 'A "read off the chip" claim no OCR marking supports is not shown as read', !!claim && claim.ocrExtracted !== true, claim ? `ocrExtracted ${String(claim.ocrExtracted)}` : 'line missing');
    const mem = line('U21');
    check('A', 'A5', 'A 32 Gb memory is not priced as the catalogue\'s 8 Gb family entry', !!mem && mem.priceSource !== 'catalogue', mem ? `${mem.priceSource} £${num(mem.unitPriceGBP).toFixed(2)}` : 'line missing');
    check('A', 'A6', '"Priced" + "to verify" = BOM total (to the penny)', Math.abs(num(ce.confirmedBOMCostGBP) + num(ce.unverifiedBOMCostGBP) - num(ce.totalBOMCostGBP)) < 0.005,
      `${num(ce.confirmedBOMCostGBP)} + ${num(ce.unverifiedBOMCostGBP)} vs ${num(ce.totalBOMCostGBP)}`);

    // B. Reading the 8 photos
    const imgs = (k: string) => Math.max(0, ...calls.filter(c => c.kind === k).map(c => c.images));
    check('B', 'B1', 'Board-type classification sees all 8 photos', imgs('stage1') === 8, `${imgs('stage1')} photo(s)`);
    check('B', 'B2', 'Chip-marking (OCR) stage sees all 8 photos', imgs('ocr') === 8, `${imgs('ocr')} photo(s)`);
    check('B', 'B3', 'BOM stage sees all 8 photos', imgs('bom') === 8, `${imgs('bom')} photo(s)`);
    check('B', 'B4', 'Second look at unidentified chips runs on the screen\'s route', calls.some(c => c.kind === 'stage3b'), `${calls.filter(c => c.kind === 'stage3b').length} call(s)`);
    const bomPrompt = calls.filter(c => c.kind === 'bom').map(c => c.text).join('\n');
    const invite = ['best-guess part number', 'empty bom array is not acceptable', 'ALWAYS has at least one'].filter(t => bomPrompt.toLowerCase().includes(t.toLowerCase()));
    check('B', 'B5', 'Prompts do not invite invented part numbers', invite.length === 0, invite.length ? `contains: ${invite.join(' | ')}` : 'none found');
    const ocrPrompt = calls.filter(c => c.kind === 'ocr').map(c => c.text).join('\n');
    check('B', 'B6', 'OCR prompt carries no real part numbers that could leak (TJA1044 / AURIX)', !/TJA1044|AURIX/.test(ocrPrompt), /TJA1044|AURIX/.test(ocrPrompt) ? 'example part numbers present' : 'neutral');

    // C. BOM integrity
    const u2s = bom.filter(l => String(l.refDes).split(/[,\s]+/).includes('U2'));
    check('C', 'C1', 'A part seen in two photos is counted once (U2)', u2s.length === 1, `${u2s.length} line(s) for U2`);
    const r101 = line('R101') ?? bom.find(l => String(l.refDes).startsWith('R101'));
    check('C', 'C2', 'Quantity follows the designators (R101-R110 = 10, model said 12)', num(r101?.qty) === 10, `qty ${String(r101?.qty)}`);
    const l20 = line('L20');
    check('C', 'C3', 'Quantities are whole numbers (model said 1.5)', !!l20 && Number.isInteger(num(l20.qty)), `qty ${String(l20?.qty)}`);
    const tiny = bom.filter(l => /^R2\d\d$/.test(String(l.refDes)));
    const tinySum = tiny.reduce((t, l) => t + num(l.lineTotalGBP), 0);
    check('C', 'C4', '50 sub-penny resistors are not rounded away', tinySum > 0.05, `Σ £${tinySum.toFixed(4)} over ${tiny.length} line(s)`);
    const flagged = bom.filter(l => l.needsVerification === true).length;
    check('C', 'C5', '"To verify" count = the lines flagged', num(p.needsVerificationCount) === flagged, `count ${num(p.needsVerificationCount)}, flagged ${flagged}`);
    const placed = bom.filter(l => !(l.notFitted === true || l.priceSource === 'not-fitted') && !['through_hole', 'manual_solder', 'mechanical'].includes(String(l.componentType))).reduce((t, l) => t + num(l.qty), 0);
    check('C', 'C6', 'SMT placements = the placed parts on the BOM', num((a.assembly as Rec).smtPlacements) === placed, `${num((a.assembly as Rec).smtPlacements)} vs ${placed}`);
    const pf = await stream(fd => fd.append('bomFile', new Blob(['RefDes,PartNumber,Description,Qty\nJ9,ABC123,connector,1.5\n'], { type: 'text/csv' }), 'bom.csv'));
    const j9 = ((pf.analysis as Rec).bom as Rec[]).find(l => String(l.refDes) === 'J9');
    check('C', 'C7', 'BOM file quantity "1.5" is read as 2, not 15', num(j9?.qty) === 2, `qty ${String(j9?.qty)}`);

    // D. Arithmetic consistency
    const b = bd.breakdown;
    const parts = num(bd.pcbFabPerBoard) + num(bd.assemblyPerBoard) + num(bd.bomCostPerBoard) + num(bd.logisticsPerBoard) + num(b.energy) + num(b.packaging) + num(b.yieldLoss);
    check('D', 'D1', 'Headline = sum of its parts', Math.abs(parts - headline) < 0.06, `${parts.toFixed(2)} vs ${headline.toFixed(2)}`);
    const cn = (p.countryComparison as Rec[]).find(c => c.countryId === 'cn');
    check('D', 'D2', 'Selected country row = headline', Math.abs(num(cn?.totalPerBoard) - headline) < 0.005, `${num(cn?.totalPerBoard)} vs ${headline}`);
    const curve = ((p.volumeCurves as Record<string, Rec[]>) ?? {}).cn ?? [];
    const at = curve.find(pt => num(pt.qty) === QTY);
    check('D', 'D3', 'Volume curve passes through the headline at the analysed quantity', !!at && Math.abs(num(at.totalPerBoard) - headline) < 0.005, at ? `£${num(at.totalPerBoard)} at ${QTY}` : `no point at ${QTY} (points: ${curve.map(c => c.qty).join(', ')})`);
    const npi = p.npiBreakdown as Rec | null;
    check('D', 'D4', 'NPI "production" figure = headline', !!npi && Math.abs(num(npi.unitCostProd) - headline) < 0.005, npi ? `£${num(npi.unitCostProd)} vs £${headline}` : 'no NPI');
    // What-if with nothing changed, as THIS version's screen sends it.
    const bs = a.boardSpec as Rec, as = a.assembly as Rec;
    const domainSeen = CLIENT === 'after' ? (p.stage1Classification as Rec | undefined)?.domain : (a.stage1Classification as Rec | undefined)?.domain;
    const scn: Rec = { widthMm: bs.widthMm, heightMm: bs.heightMm, layers: bs.estimatedLayers, surfaceFinish: bs.surfaceFinish, throughVias: bs.throughVias, blindVias: bs.blindVias, microVias: bs.microVias,
      hdiStructure: bs.hdiStructure, impedanceControlled: bs.impedanceControlRequired, smtPlacements: as.smtPlacements, throughHoleJoints: as.throughHoleJoints, manualJoints: as.manualJoints,
      bgaCount: as.bgaCount, aoiRequired: as.aoiRequired, ictTimeSec: as.ictTimeSec, conformalCoatAreaCm2: 0, totalBOMCostGBP: ce.totalBOMCostGBP, orderQuantity: Math.min(QTY, CLIENT === 'before' ? 25000 : QTY), country: 'cn' };
    if (CLIENT === 'after') Object.assign(scn, { conformalCoatAreaCm2: num(p.conformalCoatingCost) > 0 ? num(bs.widthMm) * num(bs.heightMm) / 100 : 0,
      bomLines: bom.map(l => ({ qty: l.qty, lineTotalGBP: l.lineTotalGBP, userCorrected: l.userCorrected })), analysedQty: p.orderQty ?? QTY,
      domain: domainSeen ?? 'general', asilLevel: p.asilLevel, boardSpec: bs, assembly: as });
    const sr = await (await fetch(`${base}/api/pcb/scenario`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(scn) })).json() as { breakdown?: Rec };
    const sTotal = num(sr.breakdown?.totalPerBoard);
    check('D', 'D5', 'What-if with nothing changed shows £0 change', Math.abs(sTotal - headline) < 0.005, `scenario £${sTotal.toFixed(2)} vs headline £${headline.toFixed(2)} (Δ ${(sTotal - headline).toFixed(2)}/board)`);
    // Re-analyze, as THIS version's screen sends it.
    const fd = new FormData();
    for (let i = 0; i < 8; i++) fd.append('pcbImages', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), `${i}.png`);
    fd.append('pcbImageLabels', JSON.stringify(LABELS));
    fd.append('correctedSpec', JSON.stringify(bs)); fd.append('correctedBOM', JSON.stringify([])); fd.append('correctedAssembly', JSON.stringify(as));
    const ocrSeen = CLIENT === 'after' ? (p.ocrExtraction as Rec | undefined) : (a.ocrExtraction as Rec | undefined);
    fd.append('domain', String(domainSeen ?? 'general'));
    fd.append('ocrMarkings', JSON.stringify(ocrSeen?.icMarkings ?? []));
    if (CLIENT === 'after') fd.append('ocrQuality', String(ocrSeen?.extractionQuality ?? ''));
    fd.append('country', 'cn'); fd.append('orderQty', String(QTY)); fd.append('asilLevel', String(p.asilLevel ?? ''));
    const ra = await (await fetch(`${base}/api/pcb/reanalyze`, { method: 'POST', headers: auth, body: fd })).json() as Rec;
    const raBd = ra.selectedCountryBreakdown as Rec | undefined;
    check('D', 'D6', 'Re-analyze keeps the automotive grade in the headline', !!raBd?.automotiveGrade, raBd ? `${raBd.automotiveGrade ? 'graded' : 'NOT graded'}, £${num(raBd.totalPerBoard).toFixed(2)}` : String(ra.error ?? 'no result'));

    const groups: Record<string, string> = { A: 'Golden rule & honest labels', B: 'Reading the 8 photos', C: 'BOM integrity', D: 'Arithmetic consistency' };
    const summary = Object.entries(groups).map(([g, name]) => { const c = checks.filter(k => k.group === g); return { group: g, name, pass: c.filter(k => k.pass).length, of: c.length }; });
    const total = { pass: checks.filter(k => k.pass).length, of: checks.length };
    writeFileSync(join(OUT, `pcb-scorecard-${LABEL}.json`), JSON.stringify({ label: LABEL, dir: DIR, client: CLIENT, headline, summary, total, checks }, null, 1));
    console.log(`\n${LABEL}: ${total.pass}/${total.of} (${Math.round(100 * total.pass / total.of)}%)  headline £${headline.toFixed(2)}`);
    for (const s of summary) console.log(`  ${s.group} ${s.name.padEnd(30)} ${s.pass}/${s.of}`);
    for (const k of checks) console.log(`  ${k.pass ? 'PASS' : 'FAIL'} ${k.id} ${k.name} — ${k.detail}`);
  } finally {
    try { if (server.pid) process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ }
    ai.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
