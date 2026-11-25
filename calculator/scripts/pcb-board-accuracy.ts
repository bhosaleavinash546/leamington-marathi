/**
 * PCB board set — the tool's figure against what was paid (EDU v6, Nov 2026).
 *
 *   npx tsx scripts/pcb-board-accuracy.ts [--json out.json]        (npm run accuracy:pcb)
 *
 * Every `tests/fixtures/pcb-boards/<board>.board.json` is run through Stage 4 on its STORED analysis (no model, no
 * network — the same deterministic pipeline the screen's Calculate uses), at its own country, volume and engineer's edits.
 * The tool's figure is taken on the basis the price paid states (delivered UK, or ex-works = delivered less freight and
 * duty), and the error is reported per board and over every board that has a price paid: mean absolute % error and bias.
 * A board with a `<board>.truth.json` (the real BOM) is also scored for counting: part-count error, designator recall /
 * precision and part-number accuracy (server/utils/pcb-vision-accuracy.ts).
 *
 * A `reference` (a manual should-cost) is printed beside the tool but NEVER counts as accuracy. Fewer than five prices
 * paid is "insufficient" — one board cannot claim accuracy, and nothing is ever tuned to one.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStage4 } from '../server/routes/pcb.js';
import { cleanBomImageRows } from '../server/utils/pcb-bom-image.js';
import { scoreBom, type BomItem } from '../server/utils/pcb-vision-accuracy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests/fixtures/pcb-boards');

export type PriceBasis = 'delivered-uk' | 'ex-works';
export interface BoardFile {
  board: string;
  analysis: { file: string; kind: 'replies' | 'analysis'; useBomImage?: boolean };
  country: string; annualVolume: number; domain: string; asil?: string;
  pricePaid: { gbp: number; basis: PriceBasis; date: string; source: string } | null;
  reference?: { gbp: number; basis: PriceBasis; kind: string; source: string };
  /** Board-spec fields set as the engineer would on the PCB form (e.g. componentMarket 'local'). */
  boardSpecPatch?: Record<string, unknown>;
  notes?: string;
}
export interface BoardResult {
  id: string; board: string; country: string; annualVolume: number;
  toolDelivered: number; toolExWorks: number;
  pricePaid: BoardFile['pricePaid']; toolOnBasis: number | null; errorPct: number | null;
  reference: BoardFile['reference'] | null; referenceGapPct: number | null;
  parts: number; counting: ReturnType<typeof scoreBom> | null;
}

export function loadBoards(dir = DIR): Array<{ id: string; b: BoardFile }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.board.json')).sort()
    .map(f => ({ id: f.replace(/\.board\.json$/, ''), b: JSON.parse(readFileSync(join(dir, f), 'utf8')) as BoardFile }));
}

export async function gradeBoard(id: string, b: BoardFile, dir = DIR): Promise<BoardResult> {
  const src = JSON.parse(readFileSync(join(ROOT, b.analysis.file), 'utf8'));
  const analysis = JSON.parse(JSON.stringify(src.analysis));
  if (b.boardSpecPatch) analysis.boardSpec = { ...(analysis.boardSpec ?? {}), ...b.boardSpecPatch };
  const ocr = src.ocr ?? { icMarkings: src.ocrMarkings ?? analysis.ocrExtraction?.icMarkings ?? [] };
  const parsedBOM = b.analysis.useBomImage && src.bomImage ? cleanBomImageRows(src.bomImage.rows).lines : undefined;
  const s4 = await runStage4({
    analysis, domain: b.domain, asilLevel: (b.asil ?? 'Unknown') as never, asilRationale: '', asilSafetyFunctions: [],
    ocrResult: { icMarkings: ocr.icMarkings ?? [], refDesGroups: [], connectors: ocr.connectors ?? [], boardText: ocr.boardText ?? [],
      extractionQuality: ocr.extractionQuality ?? 'medium' } as never,
    country: b.country, orderQty: b.annualVolume, ...(parsedBOM ? { parsedBOM } : {}), tag: '/board-set',
  });
  const bd = s4.selectedCountryBreakdown!;
  const delivered = bd.totalPerBoard, exWorks = Math.round((bd.totalPerBoard - bd.logisticsPerBoard) * 100) / 100;
  const on = (basis: PriceBasis) => basis === 'ex-works' ? exWorks : delivered;
  const toolOnBasis = b.pricePaid ? on(b.pricePaid.basis) : null;
  const truthPath = join(dir, `${id}.truth.json`);
  const counting = existsSync(truthPath)
    ? scoreBom(analysis.bom as BomItem[], (JSON.parse(readFileSync(truthPath, 'utf8')) as { bom: BomItem[] }).bom ?? []) : null;
  return {
    id, board: b.board, country: b.country, annualVolume: b.annualVolume, toolDelivered: delivered, toolExWorks: exWorks,
    pricePaid: b.pricePaid, toolOnBasis, errorPct: b.pricePaid && toolOnBasis != null ? (toolOnBasis / b.pricePaid.gbp - 1) * 100 : null,
    reference: b.reference ?? null, referenceGapPct: b.reference ? (on(b.reference.basis) / b.reference.gbp - 1) * 100 : null,
    parts: (analysis.bom as Array<{ qty?: number }>).reduce((t, l) => t + (Number(l.qty) || 0), 0), counting,
  };
}

export function summarise(rs: BoardResult[]): { n: number; mapePct: number | null; biasPct: number | null; verdict: string } {
  const e = rs.map(r => r.errorPct).filter((v): v is number => v != null);
  const n = e.length;
  const mape = n ? e.reduce((t, v) => t + Math.abs(v), 0) / n : null;
  const bias = n ? e.reduce((t, v) => t + v, 0) / n : null;
  return { n, mapePct: mape, biasPct: bias,
    verdict: n === 0 ? 'UNMEASURED — no board has a price paid' : n < 5 ? `insufficient — ${n} price${n === 1 ? '' : 's'} paid (five or more are needed before any accuracy is claimed)` : 'measured' };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rs: BoardResult[] = [];
  for (const { id, b } of loadBoards()) rs.push(await gradeBoard(id, b));
  const pc = (v: number | null) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`;
  console.log('\nPCB board set — tool v price paid');
  for (const r of rs) {
    console.log(`\n${r.id}: ${r.board}\n  ${r.country.toUpperCase()} ${r.annualVolume.toLocaleString('en-GB')}/yr · ${r.parts.toLocaleString('en-GB')} parts · tool £${r.toolExWorks.toFixed(2)} ex-works, £${r.toolDelivered.toFixed(2)} delivered UK`);
    if (r.pricePaid) console.log(`  price paid £${r.pricePaid.gbp.toFixed(2)} (${r.pricePaid.basis}) → tool ${pc(r.errorPct)}`);
    else console.log('  no price paid');
    if (r.reference) console.log(`  reference (not an actual): ${r.reference.kind} £${r.reference.gbp.toFixed(2)} ${r.reference.basis} → tool ${pc(r.referenceGapPct)}`);
    if (r.counting) console.log(`  counting v the real BOM: parts ${pc(r.counting.partsCountError * 100)}, designator recall ${(r.counting.componentRecall * 100).toFixed(0)} %, part numbers ${(r.counting.partNumberAccuracy * 100).toFixed(0)} %`);
  }
  const s = summarise(rs);
  console.log(`\n${s.verdict}${s.n ? ` · MAPE ${s.mapePct!.toFixed(1)} % · bias ${pc(s.biasPct)}` : ''}\n`);
  const out = process.argv.indexOf('--json');
  if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify({ boards: rs, summary: s }, null, 1));
}
