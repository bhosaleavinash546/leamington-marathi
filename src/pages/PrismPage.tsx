// Prism — one part in, the whole cost truth out: ideas that close
// MEASURED gaps. Staged wizard: (1) part + files, (2) engine measurement,
// (3) supplier quote + forensics, (4) evidence dossier → multi-lens grounded
// generation through the standard /api/analyze pipeline → ResultsPage.
//
// House rule everywhere on this page: math for numbers, LLM for judgment.
// Every figure shown is engine output recomputed server-side; the only AI
// steps are the optional quote-PDF prefill (confirm-before-use) and the final
// idea generation, which must cite the dossier's [E#]/[W#] evidence lines.
//
// The look and motion are the DFM Studio's metrology language (dfm.css +
// useDfmMotion): glass panels on squared paper, a travelling step rail, bars
// and count-ups that can only land on engine-measured values, and full
// reduced-motion discipline. No second motion vocabulary is invented here.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, Layers, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, AlertTriangle, Plus, Trash2, FileSearch, Sparkles,
  ShieldCheck, Gauge, Box, Ruler, Scale,
} from 'lucide-react';
import PrismIcon from '../components/icons/PrismIcon';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../hooks/useToast';
import { generateCostReductionIdeas, saveFullResult, ProgressEvent } from '../services/claude-service';
import { AnalysisConfig, AnalysisResult, PlantRegion } from '../types';
import { CURRENCIES, CURRENCY_SYMBOLS } from '../constants/costing';
import { useDfmMotion } from '../lib/motion';
import { useSpotlight } from '../components/dfm/useSpotlight';
import StepRail, { RailStep } from '../components/dfm/StepRail';
import TickNumber from '../components/dfm/TickNumber';
import ScoreRing from '../components/dfm/ScoreRing';
import './dfm.css';

// ── Types mirrored from the server contracts ─────────────────────────────────

type QuoteKind = 'material' | 'conversion' | 'tooling' | 'logistics' | 'overhead' | 'margin' | 'other';
const QUOTE_KINDS: QuoteKind[] = ['material', 'conversion', 'tooling', 'logistics', 'overhead', 'margin', 'other'];

interface QuoteLine { label: string; kind: QuoteKind; amount: string; note?: string }

interface WaterfallStep {
  id: string; name: string; fromEur: number; toEur: number; deltaEur: number;
  basis: string; skipped?: boolean; reason?: string;
  /** Present only when the step MEASURED a carbon change (process switch). */
  co2DeltaKg?: number; co2Basis?: string | null;
}
interface Waterfall {
  steps: WaterfallStep[]; entitlementEur: number; quoteEur: number | null;
  totalGapEur: number | null; basis: string; caution: string;
}
interface ForensicsRow {
  label: string; kind: string; quoteEur: number; engineEur: number | null;
  ratio: number | null; verdict: string; basis: string;
}
interface Teardown {
  id: string; title: string; reference?: string | null; partName?: string | null;
  material?: string | null; process?: string | null; joining?: string | null;
  massKg?: number | null; notes?: string | null; createdAt: string;
}
interface BatchRow {
  file: string; massKg?: number; massSource?: string; engineEur?: number | null;
  entitlementEur?: number; gapEur?: number | null; gapPct?: number | null;
  annualGapEur?: number | null; topLever?: string; co2DeltaKg?: number | null; error?: string;
}

interface BomRow {
  index?: number; name: string; subassembly: string; material: string | null; process: string | null;
  qty: number; volumeMm3?: number | null; massKg?: number | null; suggestedMassKg?: number | null;
  boughtPart?: boolean; boughtPriceEur?: number | null; suggestionBasis?: string;
  costEur?: number | null; massBasis?: string; uncostedReason?: string;
}
interface RollUp {
  totalEur: number; totalMassKg: number; partCount: number; costedPct: number;
  subassemblies: Array<{ subassembly: string; eur: number; massKg: number; parts: number; sharePct: number | null; rows: Array<{ name: string; unitEur: number; extEur: number; qty: number; source: string }> }>;
  uncosted: Array<{ name: string; subassembly: string; qty: number; reason: string }>;
  caveat: string;
}
interface AssemblyDossier {
  assemblyName: string; rollUp: RollUp; rows: BomRow[];
  dossier: { sections: Array<{ id: string; title: string; lines: Array<{ ref: string; text: string }> }>; evidenceCount: number };
  lensBlocks: Array<{ lensId: string; name: string; level: string; text: string }>;
  basis: string;
}

interface CounterRow { label: string; kind: string; quotedEur: number; targetEur: number | null; askEur: number | null; argument: string }

interface DossierResponse {
  runId?: string | null;
  anomalies?: Array<{ id: string; message: string }>;
  counter?: { rows: CounterRow[]; totalAskEur: number; caveat: string } | null;
  dossier: { sections: Array<{ id: string; title: string; present: boolean; reason?: string; lines: Array<{ ref: string; text: string }> }>; evidenceCount: number; absent: string[] };
  promptBlock: string;
  lensBlocks: Array<{ lensId: string; name: string; text: string }>;
  lenses: Array<{ id: string; name: string }>;
  waterfall: Waterfall;
  forensics: { rows: ForensicsRow[]; totals: { linesSumEur: number; engineTotalEur: number; ratio: number | null } | null; caveat: string | null } | null;
  gap: { gap: number; gapPct: number; allocations: Array<{ bucket: string; target: number }> } | null;
  spec: { toleranceClass: string; surfaceFinish: string; criticalCharacteristics: number; inferredBasis: string };
  engineTotalEur: number;
}

interface DfmProcessResult {
  process: string; processName: string; score: number | null;
  passed: number; notEvaluated: number; evaluatedCount: number; ruleCount: number;
  findings: Array<{ title: string; severity: 'high' | 'medium' | 'low'; cost?: { priced: boolean; deltaEur?: number } }>;
  impact?: { pricedCount: number; unpricedCount: number; perPartEur: number; annualEur: number; caveat?: string };
}
interface DfmResponse {
  geometry?: Record<string, unknown>;
  results: DfmProcessResult[];
  measuredProcess?: string;
}

const REGIONS = ['Germany', 'UK', 'Czech Republic', 'Spain', 'Mexico', 'USA', 'China', 'India', 'Korea'];
const REGION_TO_PLANT: Record<string, PlantRegion> = {
  Germany: 'germany', UK: 'uk', 'Czech Republic': 'czech', Spain: 'spain',
  Mexico: 'mexico', USA: 'usa', China: 'china', India: 'india', Korea: 'korea',
};

// Default lens selection: the four highest-yield angles. All six remain a click away.
const DEFAULT_LENSES = new Set(['vave', 'process', 'spec', 'commercial']);

const eur = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : `€${n.toFixed(2)}`);

// The DFM engines weigh the measured volume in six stock materials
// (geometry.weights). Map the chosen catalogue material onto the right one so
// the wizard can OFFER the measured mass — a suggestion with a stated basis,
// never a silent overwrite. No match ⇒ no suggestion (absent is not default).
function measuredMassKg(geometry: Record<string, unknown> | undefined, material: string): number | null {
  const w = (geometry as { weights?: Record<string, number> } | undefined)?.weights;
  if (!w) return null;
  const m = material.toLowerCase();
  const key =
    /alumin/.test(m) ? 'aluminiumKg'
    : /titanium/.test(m) ? 'titaniumKg'
    : /copper|brass|bronze/.test(m) ? 'copperKg'
    : /cast iron/.test(m) ? 'castIronKg'
    : /steel/.test(m) ? 'steelKg'
    : /plastic|abs\b|nylon|polyam|polyprop|polycarb|peek|pom/.test(m) ? 'plasticKg'
    : null;
  const v = key ? w[key] : undefined;
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : null;
}

async function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(f);
  });
}

// A measurement-log line: spinner while it is the newest line and work is
// still running, a snapped-in tick once superseded or finished.
function LogLine({ text, active }: { text: string; active: boolean }) {
  const warn = /failed|error|could not/i.test(text);
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="mt-0.5 shrink-0">
        {active ? (
          <Loader2 size={11} className="animate-spin text-gold-400" />
        ) : warn ? (
          <AlertTriangle size={11} className="text-amber-400 dfm-tick-in" />
        ) : (
          <CheckCircle2 size={11} className="text-emerald-400 dfm-tick-in" />
        )}
      </span>
      <span className={warn ? 'text-amber-300/90' : active ? 'text-slate-200' : 'text-slate-400'}>{text}</span>
    </div>
  );
}

export default function Part360Page() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const apiKey = localStorage.getItem('brainspark_api_key') || '';
  const m = useDfmMotion();
  const spot = useSpotlight();

  // ── Wizard position ────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);

  // ── Step 1: part + files ───────────────────────────────────────────────────
  const [catalogue, setCatalogue] = useState<{ materials: string[]; processes: string[] } | null>(null);
  const [partName, setPartName] = useState('');
  const [partContext, setPartContext] = useState('');
  const [material, setMaterial] = useState('');
  const [processName, setProcessName] = useState('');
  const [region, setRegion] = useState('Germany');
  const [weightKg, setWeightKg] = useState('');
  const [annualVolume, setAnnualVolume] = useState('80000');
  const [cadFile, setCadFile] = useState<File | null>(null);
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const cadInputRef = useRef<HTMLInputElement>(null);
  const drawingInputRef = useRef<HTMLInputElement>(null);

  // ── Step 2: measurement state ──────────────────────────────────────────────
  const [measuring, setMeasuring] = useState(false);
  const [measureLog, setMeasureLog] = useState<string[]>([]);
  const [shouldCost, setShouldCost] = useState<{ totalShouldCost: string; totalValue: number; symbol: string } | null>(null);
  const [dfmResult, setDfmResult] = useState<DfmResponse | null>(null);
  const [dfmFailed, setDfmFailed] = useState(false);
  const [drawingRead, setDrawingRead] = useState<{ dims: number; toleranced: number } | null>(null);
  // Drawing-derived spec inputs — PREFILL the user can overrule (absent stays absent).
  const [tightestTolMm, setTightestTolMm] = useState('');
  const [roughnessRaUm, setRoughnessRaUm] = useState('');
  const [measureError, setMeasureError] = useState('');

  // ── Step 3: quote ──────────────────────────────────────────────────────────
  const [supplier, setSupplier] = useState('');
  const [quoteCurrency, setQuoteCurrency] = useState('EUR');
  const [quoteTotal, setQuoteTotal] = useState('');
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState('');
  const [saveToCalibration, setSaveToCalibration] = useState(true);
  const quotePdfRef = useRef<HTMLInputElement>(null);

  // ── Step 4: dossier + generation ──────────────────────────────────────────
  const [building, setBuilding] = useState(false);
  const [dossier, setDossier] = useState<DossierResponse | null>(null);
  const [selectedLenses, setSelectedLenses] = useState<Set<string>>(new Set(DEFAULT_LENSES));
  // Deliberation level. 'critique' (panel + small-model repair on every
  // batch) is the default: measured on four live runs the panel had never
  // once been used because it sat behind an off-by-default toggle.
  const [deepMode, setDeepMode] = useState<'critique' | 'full' | 'off'>('critique');
  const [generating, setGenerating] = useState(false);
  const [genLog, setGenLog] = useState<string[]>([]);
  const [error, setError] = useState('');

  // ── Teardown library (the private evidence base) ──────────────────────────
  const [teardowns, setTeardowns] = useState<Teardown[]>([]);
  const [tdOpen, setTdOpen] = useState(false);
  const [tdForm, setTdForm] = useState({ title: '', reference: '', partName: '', material: '', process: '', joining: '', massKg: '', notes: '' });
  const [tdSaving, setTdSaving] = useState(false);

  // ── Batch triage (zero-touch mode) ────────────────────────────────────────
  const [batchMode, setBatchMode] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchRow[] | null>(null);
  const [batchBasis, setBatchBasis] = useState('');
  const [batchProgress, setBatchProgress] = useState('');
  const batchInputRef = useRef<HTMLInputElement>(null);

  // ── Assembly mode: product tree → confirmed BOM → three-level generation ──
  const [asmMode, setAsmMode] = useState(false);
  const [asmName, setAsmName] = useState('');
  const [asmContext, setAsmContext] = useState('');
  const [asmRows, setAsmRows] = useState<BomRow[]>([]);
  const [asmBusy, setAsmBusy] = useState('');
  const [asmDossier, setAsmDossier] = useState<AssemblyDossier | null>(null);
  const [asmLenses, setAsmLenses] = useState<Set<string>>(new Set(['assembly-architecture', 'subassembly-block', 'part-line']));
  const [asmGenerating, setAsmGenerating] = useState(false);
  const [asmGenLog, setAsmGenLog] = useState<string[]>([]);
  const asmInputRef = useRef<HTMLInputElement>(null);

  // ── What-if cockpit (live engine re-runs on the dossier) ──────────────────
  const [wiVolume, setWiVolume] = useState('');
  const [wiRegion, setWiRegion] = useState('');
  const [wiTol, setWiTol] = useState('standard');
  const [wiFin, setWiFin] = useState('standard');
  const [wiTotal, setWiTotal] = useState<number | null>(null);
  const [wiBusy, setWiBusy] = useState(false);
  const wiSeq = useRef(0);

  // Each stage starts at its top — otherwise a mid-page scroll position from
  // the previous stage leaves the new panel's heading under the sticky rail.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: m.reduced ? 'auto' : 'smooth' });
  }, [step]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) return;
    fetch('/api/part360/teardowns', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setTeardowns(d.teardowns ?? [])).catch(() => {});
  }, [token]);

  useEffect(() => {
    fetch('/api/should-cost/catalogue')
      .then(r => r.json())
      .then(d => {
        setCatalogue({ materials: d.materials ?? [], processes: d.processes ?? [] });
        if (d.materials?.length) setMaterial((mm: string) => mm || d.materials[0]);
        if (d.processes?.length) setProcessName((p: string) => p || d.processes[0]);
      })
      .catch(() => setCatalogue({ materials: [], processes: [] }));
  }, []);

  const inputsValid = Boolean(material && processName && Number(weightKg) > 0 && Number(annualVolume) > 0);

  // CAD-measured mass for the chosen material — the wizard's offer, not its decision.
  const cadMassKg = dfmResult ? measuredMassKg(dfmResult.geometry, material) : null;
  const typedMass = Number(weightKg);
  const massDiverges = cadMassKg != null && typedMass > 0
    && Math.abs(typedMass - cadMassKg) / cadMassKg > 0.25;
  // Closed-solid heuristic: a hollow part (tank, housing) exported as a solid
  // measures the ENCLOSED volume, not the shell — a live 31 MB fuel tank
  // "measured" 83 kg this way. When the offer dwarfs the typed mass, the
  // offer itself is suspect and says so; it never overwrites anything.
  const massLooksSolid = cadMassKg != null && typedMass > 0 && cadMassKg > typedMass * 5;

  // ── Step 2: run every measurement the inputs allow ────────────────────────
  async function runMeasurements() {
    setMeasuring(true); setMeasureError(''); setMeasureLog([]);
    const log = (msg: string) => setMeasureLog(prev => [...prev, msg]);
    try {
      // Drawing extract first — its tolerances feed the costed specification.
      if (drawingFile && !drawingRead) {
        log('Reading the 2D drawing…');
        const base64 = await fileToBase64(drawingFile);
        const mime = drawingFile.type === 'application/pdf' || /\.pdf$/i.test(drawingFile.name) ? 'application/pdf' : drawingFile.type || 'image/png';
        const r = await fetch('/api/dfm/drawing-extract', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64, mimeType: mime, fileName: drawingFile.name }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Drawing extraction failed');
        const dims: Array<{ toleranced: boolean; bandMm?: number }> = d.drawing?.dimensions ?? [];
        const toleranced = dims.filter(x => x.toleranced && Number.isFinite(Number(x.bandMm)));
        const tightest = toleranced.length ? Math.min(...toleranced.map(x => Number(x.bandMm))) : null;
        const ras: number[] = (d.drawing?.roughness ?? []).map((x: { raUm?: number }) => Number(x.raUm)).filter((n: number) => Number.isFinite(n) && n > 0);
        setDrawingRead({ dims: dims.length, toleranced: toleranced.length });
        if (tightest != null) setTightestTolMm(String(tightest));
        if (ras.length) setRoughnessRaUm(String(Math.min(...ras)));
        log(`Drawing read: ${dims.length} dimensions, ${toleranced.length} toleranced${tightest != null ? `, tightest band ${tightest} mm` : ''}. Confirm the spec fields below.`);
      }

      // Deterministic should-cost — no AI, no key.
      log('Running the should-cost engine…');
      const sc = await fetch('/api/should-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partName, material, process: processName, weightKg: Number(weightKg), annualVolume: Number(annualVolume), region, currency: 'EUR' }),
      });
      const scd = await sc.json();
      if (!sc.ok) throw new Error(scd.error || 'Should-cost failed');
      setShouldCost(scd);
      // totalShouldCost arrives server-formatted with its symbol already on it.
      log(`Engine should-cost: ${scd.totalShouldCost} / unit.`);

      // DFM geometry measurement — only when a 3D model was supplied. A DFM
      // failure (huge file, unsupported kernel case, timeout) must NOT sink
      // the run: everything downstream degrades honestly — the waterfall's
      // process step will state "geometry absent" instead of pretending.
      if (cadFile && !dfmResult) {
        log('Measuring the 3D model (DFM engines)…');
        setDfmFailed(false);
        try {
          const fd = new FormData();
          fd.append('cadFile', cadFile);
          fd.append('material', material);
          fd.append('costProcess', processName);
          fd.append('region', region);
          fd.append('annualVolume', String(Number(annualVolume)));
          const r = await fetch('/api/dfm/analyze', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            body: fd,
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error((d as { error?: string }).error || `DFM analysis failed (${r.status})`);
          }
          let result: DfmResponse | null = null;
          // Some proxies strip the Accept header and the endpoint answers with
          // plain JSON instead of an SSE stream — handle both shapes.
          if ((r.headers.get('content-type') || '').includes('application/json')) {
            result = await r.json();
          } else if (r.body) {
            const reader = r.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                let ev: { type: string; label?: string; result?: DfmResponse; error?: string };
                try { ev = JSON.parse(line.slice(6)); } catch { continue; }
                if (ev.type === 'stage' && ev.label) log(`· ${ev.label}`);
                else if (ev.type === 'result' && ev.result) result = ev.result;
                else if (ev.type === 'error') throw new Error(ev.error || 'DFM analysis failed');
              }
            }
          }
          if (!result) throw new Error('DFM analysis returned no result');
          setDfmResult(result);
          const best = result.results?.[0];
          log(`DFM measured: ${best ? `${best.processName} score ${best.score ?? 'n/a'}, ${best.findings.length} findings` : 'no rateable process'}.`);
          const mk = measuredMassKg(result.geometry, material);
          if (mk != null) log(`Measured mass for ${material}: ${mk.toFixed(3)} kg — offered as a prefill below.`);
        } catch (dfmErr) {
          setDfmFailed(true);
          log(`3D measurement failed (${dfmErr instanceof Error ? dfmErr.message : 'unknown error'}) — continuing without geometry. The waterfall will state "geometry absent" for the process step.`);
        }
      }
      log('Measurement complete.');
    } catch (e) {
      setMeasureError(e instanceof Error ? e.message : 'Measurement failed');
    } finally {
      setMeasuring(false);
    }
  }

  // ── Step 3: quote PDF assist (prefill only — everything stays editable) ───
  async function extractQuote(f: File) {
    if (!apiKey) { toast('Add your Anthropic API key in Settings to use PDF assist.', 'error'); return; }
    setExtracting(true); setExtractNote('');
    try {
      const base64 = await fileToBase64(f);
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const r = await fetch('/api/part360/quote-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(isPdf
          ? { pdfBase64: base64, apiKey }
          : { imageBase64: base64, mimeType: f.type || 'image/png', apiKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Quote could not be read');
      if (d.supplier) setSupplier(d.supplier);
      if (d.currency) setQuoteCurrency(d.currency);
      if (d.total != null) setQuoteTotal(String(d.total));
      if (Array.isArray(d.lineItems) && d.lineItems.length) {
        setQuoteLines(d.lineItems.map((l: { label: string; kind: QuoteKind; amount: number; note?: string }) => ({
          label: l.label, kind: l.kind, amount: String(l.amount), note: l.note,
        })));
      }
      setExtractNote(d.caution || 'Extracted by AI — confirm every value before continuing.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Extraction failed', 'error');
    } finally {
      setExtracting(false);
    }
  }

  // ── Step 3→4: build the dossier (all engine math, server-side) ────────────
  async function buildDossier() {
    setBuilding(true); setError('');
    try {
      const hasQuote = Number(quoteTotal) > 0;
      // Optionally teach the calibration corpus first, breakdown included.
      if (hasQuote && saveToCalibration) {
        try {
          await fetch('/api/should-cost/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              partName, material, process: processName, weightKg: Number(weightKg),
              annualVolume: Number(annualVolume), region, currency: quoteCurrency,
              actualPrice: Number(quoteTotal),
              breakdown: quoteLines.filter(l => Number(l.amount) > 0).map(l => ({ label: l.label, kind: l.kind, amount: Number(l.amount) })),
            }),
          });
        } catch { /* calibration is best-effort — the dossier must still build */ }
      }

      const best = dfmResult?.results?.[0];
      const body = {
        partName, material, process: processName, weightKg: Number(weightKg),
        annualVolume: Number(annualVolume), region,
        partContext: partContext.trim() || undefined,
        drawing: (Number(tightestTolMm) > 0 || Number(roughnessRaUm) > 0) ? {
          tightestToleranceMm: Number(tightestTolMm) > 0 ? Number(tightestTolMm) : undefined,
          roughnessRaUm: Number(roughnessRaUm) > 0 ? Number(roughnessRaUm) : undefined,
        } : undefined,
        quote: hasQuote ? {
          total: Number(quoteTotal), currency: quoteCurrency, supplier: supplier || undefined,
          lines: quoteLines.filter(l => Number(l.amount) > 0).map(l => ({ label: l.label, kind: l.kind, amount: Number(l.amount) })),
        } : undefined,
        geo: dfmResult?.geometry ?? undefined,
        // Human-readable geometry section for the dossier, derived from the
        // SAME measured object that feeds compareRoutes above.
        geometrySummary: dfmResult?.geometry ? (() => {
          const g = dfmResult.geometry as Record<string, any>;
          const bb = g.boundingBox;
          return {
            bbox: bb ? `${bb.xMm}×${bb.yMm}×${bb.zMm} mm` : undefined,
            solidity: typeof g.fillRatio === 'number' ? g.fillRatio : undefined,
            charThicknessMm: g.wallThickness?.characteristicMm,
            featureNote: [
              Array.isArray(g.featureTable) && g.featureTable.length
                ? g.featureTable.slice(0, 6).map((f: any) => `${f.count ?? 1}× ${f.kind}${f.diaMm ? ` ⌀${f.diaMm}` : ''}`).join(', ')
                : null,
              massLooksSolid ? 'CAUTION: model appears to be a closed solid — measured volume/mass unreliable for a hollow part' : null,
            ].filter(Boolean).join('; ') || undefined,
          };
        })() : undefined,
        dfmSummary: best?.impact ? {
          ...best.impact,
          topFindings: best.findings.slice(0, 8).map(f => ({ severity: f.severity, title: f.title, deltaEur: f.cost?.deltaEur ?? null })),
        } : undefined,
      };
      const r = await fetch('/api/part360/dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'The dossier could not be computed');
      setDossier(d);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dossier failed');
    } finally {
      setBuilding(false);
    }
  }

  // ── Step 4: multi-lens grounded generation → ResultsPage ─────────────────
  async function generate() {
    if (!dossier) return;
    if (!apiKey) { toast('Add your Anthropic API key in Settings to generate ideas.', 'error'); return; }
    const blocks = dossier.lensBlocks
      .filter(b => selectedLenses.has(b.lensId))
      .map(b => ({ lensId: b.lensId, text: b.text }));
    if (!blocks.length) { toast('Pick at least one evidence lens.', 'error'); return; }
    setGenerating(true); setGenLog([]); setError('');
    try {
      const config: AnalysisConfig = {
        systemId: 'part360', subassemblyId: 'part360',
        vehicleType: 'Platform-agnostic component',
        annualVolume: Number(annualVolume),
        plantRegion: REGION_TO_PLANT[region] ?? 'germany',
        currency: 'EUR',
        additionalContext: `Prism review of "${partName || 'the part'}" (${material}, ${processName}, ${weightKg} kg, ${Number(annualVolume).toLocaleString()}/yr, ${region}).${partContext.trim() ? ` Part function as stated by the user: ${partContext.trim().slice(0, 500)}` : ''}`,
        deepMode,
        apiKey,
      };
      const sysName = 'Prism';
      const subName = material;
      const { ideas, sources, resultId, validation } = await generateCostReductionIdeas(
        config, sysName, subName, partName || 'Part', false, undefined,
        (ev: ProgressEvent) => { if (ev.message) setGenLog(prev => [...prev.slice(-14), ev.message as string]); },
        { partEvidence: { blocks }, prismRunId: dossier.runId ?? undefined },
      );
      const result: AnalysisResult = {
        id: resultId,
        config: { ...config, apiKey: '' },
        ideas,
        sources: sources ?? [],
        validation,
        summary: {
          totalIdeas: ideas.length,
          quickWins: ideas.filter(i => i.implementationDifficulty === 'Low').length,
          strategicItems: ideas.filter(i => i.implementationDifficulty === 'High').length,
          searchesPerformed: 0,
        },
        generatedAt: new Date().toLocaleString(),
      };
      sessionStorage.setItem('analysisResult', JSON.stringify(result));
      sessionStorage.setItem('analysisSystemName', sysName);
      sessionStorage.setItem('analysisSubName', subName);
      // The measured dossier rides along so the Results chat can answer
      // waterfall/forensics questions from evidence (negotiation briefing).
      try { sessionStorage.setItem('prismDossier', dossier.promptBlock); } catch { /* quota — chat just loses grounding */ }
      saveFullResult(resultId, result, sysName, subName);
      navigate('/results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function saveTeardown() {
    if (!tdForm.title.trim()) { toast('Give the teardown a title.', 'error'); return; }
    setTdSaving(true);
    try {
      const r = await fetch('/api/part360/teardowns', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...tdForm, massKg: Number(tdForm.massKg) > 0 ? Number(tdForm.massKg) : undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save');
      setTeardowns(prev => [d.teardown, ...prev]);
      setTdForm({ title: '', reference: '', partName: '', material: '', process: '', joining: '', massKg: '', notes: '' });
      toast('Teardown recorded — it now grounds matching Prism runs.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally { setTdSaving(false); }
  }

  async function deleteTeardown(id: string) {
    try {
      await fetch(`/api/part360/teardowns/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setTeardowns(prev => prev.filter(t => t.id !== id));
    } catch { /* row stays; next load reconciles */ }
  }

  async function runBatch() {
    if (!batchFiles.length) { toast('Add STEP files first.', 'error'); return; }
    if (!material || !processName) { toast('Pick the shared material and process.', 'error'); return; }
    setBatchRunning(true); setBatchRows(null); setBatchBasis(''); setBatchProgress('Uploading…');
    try {
      const fd = new FormData();
      for (const f of batchFiles) fd.append('cadFiles', f);
      fd.append('material', material);
      fd.append('process', processName);
      fd.append('annualVolume', String(Number(annualVolume) || 80000));
      fd.append('region', region);
      const r = await fetch('/api/part360/batch', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Batch failed to start');
      for (;;) {
        await new Promise(res => setTimeout(res, 2500));
        const jr = await fetch(`/api/jobs/${d.jobId}`, { headers: { Authorization: `Bearer ${token}` } });
        const job = await jr.json();
        if (job.status === 'error') throw new Error(job.error || 'Batch job failed');
        if (job.status === 'done') {
          const result = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
          setBatchRows(result.rows ?? []);
          setBatchBasis(result.basis ?? '');
          break;
        }
        const prog = typeof job.progress === 'string' ? JSON.parse(job.progress || '{}') : (job.progress || {});
        setBatchProgress(prog.current ? `Measuring ${prog.current} (${(prog.done ?? 0) + 1}/${prog.total ?? batchFiles.length})…` : 'Measuring…');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Batch failed', 'error');
    } finally { setBatchRunning(false); }
  }

  // Live what-if: the EXISTING deterministic endpoint, debounced. Stale
  // responses are dropped by sequence — the number shown always matches the
  // controls shown.
  useEffect(() => {
    if (step !== 3 || !dossier) return;
    const vol = Number(wiVolume) || Number(annualVolume);
    const reg = wiRegion || region;
    const seq = ++wiSeq.current;
    setWiBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/should-cost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ partName, material, process: processName, weightKg: Number(weightKg), annualVolume: vol, region: reg, currency: 'EUR', toleranceClass: wiTol, surfaceFinish: wiFin }),
        });
        const d = await r.json();
        if (seq === wiSeq.current && r.ok) setWiTotal(Number(d.totalValue));
      } catch { /* cockpit is read-only convenience */ }
      finally { if (seq === wiSeq.current) setWiBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [step, dossier, wiVolume, wiRegion, wiTol, wiFin]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function copyCounterSheet() {
    if (!dossier?.counter) return;
    const co = dossier.counter;
    const text = [
      `Counter positions — ${partName || 'part'} (engine-anchored targets)`,
      ...co.rows.map(r => `• ${r.label}: quoted €${r.quotedEur.toFixed(2)} → ${r.targetEur != null ? `target €${r.targetEur.toFixed(2)} (ask €${(r.askEur ?? 0).toFixed(2)})` : 'please break this line down'} — ${r.argument}`),
      `Total per-line ask: €${co.totalAskEur.toFixed(2)}/part`,
      co.caveat,
    ].join('\n');
    try { await navigator.clipboard.writeText(text); toast('Counter sheet copied — paste into your supplier email.', 'success'); }
    catch { toast('Clipboard unavailable — select and copy from the table.', 'error'); }
  }

  async function decomposeAssemblyFile(f: File) {
    setAsmBusy('Uploading…'); setAsmRows([]); setAsmDossier(null);
    try {
      const fd = new FormData();
      fd.append('cadFile', f);
      const r = await fetch('/api/part360/assembly', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Decomposition failed to start');
      for (;;) {
        await new Promise(res => setTimeout(res, 2500));
        const job = await (await fetch(`/api/jobs/${d.jobId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
        if (job.status === 'error') throw new Error(job.error || 'Decomposition failed');
        if (job.status === 'done') {
          const result = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
          setAsmRows(result.rows ?? []);
          setAsmName(result.assemblyName ?? f.name);
          toast(result.basis, 'info');
          break;
        }
        const prog = typeof job.progress === 'string' ? JSON.parse(job.progress || '{}') : (job.progress || {});
        setAsmBusy(prog.note || 'Decomposing…');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Decomposition failed', 'error');
    } finally { setAsmBusy(''); }
  }

  async function costAssembly() {
    if (!asmRows.length) return;
    setAsmBusy('Costing the BOM…');
    try {
      const r = await fetch('/api/part360/assembly-dossier', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          assemblyName: asmName || 'Assembly', partContext: asmContext.trim() || undefined,
          annualVolume: Number(annualVolume) || 80000, region,
          rows: asmRows.map(r2 => ({
            name: r2.name, subassembly: r2.subassembly, material: r2.material, process: r2.process,
            qty: r2.qty, volumeMm3: r2.volumeMm3, massKg: r2.massKg ?? r2.suggestedMassKg,
            boughtPriceEur: r2.boughtPart ? r2.boughtPriceEur : undefined,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Costing failed');
      setAsmDossier(d);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Costing failed', 'error');
    } finally { setAsmBusy(''); }
  }

  async function generateAssembly() {
    if (!asmDossier) return;
    if (!apiKey) { toast('Add your Anthropic API key in Settings to generate ideas.', 'error'); return; }
    const blocks = asmDossier.lensBlocks.filter(b => asmLenses.has(b.lensId)).map(b => ({ lensId: b.lensId, text: b.text }));
    if (!blocks.length) { toast('Pick at least one level.', 'error'); return; }
    setAsmGenerating(true); setAsmGenLog([]);
    try {
      const config: AnalysisConfig = {
        systemId: 'part360', subassemblyId: 'part360', vehicleType: 'Platform-agnostic assembly',
        annualVolume: Number(annualVolume) || 80000, plantRegion: REGION_TO_PLANT[region] ?? 'germany', currency: 'EUR',
        additionalContext: `Prism ASSEMBLY review of "${asmName}" — engine-costed BOM total €${asmDossier.rollUp.totalEur} across ${asmDossier.rollUp.partCount} part instances.${asmContext.trim() ? ` Assembly function as stated by the user: ${asmContext.trim().slice(0, 600)}` : ''}`,
        deepMode, apiKey,
      };
      const { ideas, sources, resultId, validation } = await generateCostReductionIdeas(
        config, 'Prism', asmName || 'Assembly', asmName || 'Assembly', false, undefined,
        (ev: ProgressEvent) => { if (ev.message) setAsmGenLog(prev => [...prev.slice(-14), ev.message as string]); },
        { partEvidence: { blocks } },
      );
      const result: AnalysisResult = {
        id: resultId, config: { ...config, apiKey: '' }, ideas, sources: sources ?? [], validation,
        summary: {
          totalIdeas: ideas.length,
          quickWins: ideas.filter(i => i.implementationDifficulty === 'Low').length,
          strategicItems: ideas.filter(i => i.implementationDifficulty === 'High').length,
          searchesPerformed: 0,
        },
        generatedAt: new Date().toLocaleString(),
      };
      sessionStorage.setItem('analysisResult', JSON.stringify(result));
      sessionStorage.setItem('analysisSystemName', 'Prism');
      sessionStorage.setItem('analysisSubName', asmName || 'Assembly');
      try { sessionStorage.setItem('prismDossier', asmDossier.lensBlocks[0]?.text ?? ''); } catch { /* quota */ }
      saveFullResult(resultId, result, 'Prism', asmName || 'Assembly');
      navigate('/results');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Generation failed', 'error');
    } finally { setAsmGenerating(false); }
  }

  // ── The rail: every tick is a fact derived from real state ────────────────
  const railSteps: RailStep[] = [
    { id: 's0', label: 'Part & files', hint: !inputsValid ? 'material, process, mass, volume' : undefined, done: inputsValid && step > 0 },
    { id: 's1', label: 'Measure', hint: step === 1 && !shouldCost ? 'run the engines' : undefined, done: !!shouldCost && step > 1 },
    { id: 's2', label: 'Quote', hint: step === 2 ? 'optional — unlocks forensics' : undefined, done: !!dossier },
    { id: 's3', label: 'Evidence & generate', hint: step === 3 && !generating ? 'pick lenses' : undefined, done: false },
  ];
  const activeRailId = `s${step}`;
  const jumpTo = (id: string) => {
    const i = Number(id.slice(1));
    if (i < step) setStep(i);
  };

  const sym = CURRENCY_SYMBOLS[quoteCurrency] || '€';

  // ── Waterfall geometry: bar widths in % of the tallest engine figure ──────
  const wf = dossier?.waterfall;
  const wfMax = wf ? Math.max(
    wf.quoteEur ?? 0, wf.entitlementEur,
    ...wf.steps.filter(s => !s.skipped).map(s => Math.max(s.fromEur, s.toEur)),
  ) : 0;
  const pct = (v: number) => (wfMax > 0 ? Math.max(0, Math.min(100, (v / wfMax) * 100)) : 0);

  return (
    <div className="dfm-shell min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="dfm-aura" aria-hidden="true" />
      <div className="dfm-grid" aria-hidden="true" />
      <div className="dfm-content max-w-6xl mx-auto">

        {/* ── MASTHEAD ─────────────────────────────────────────────────────── */}
        <motion.header variants={m.stagger()} initial="hidden" animate="show" className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <motion.div variants={m.rise} className="flex items-start gap-4 min-w-0">
              <div className="relative shrink-0 w-14 h-14">
                {/* The refraction: three bands sweep out of the mark once on
                    arrival — the waterfall's story in half a second. Absent
                    under reduced motion. */}
                {!m.reduced && (
                  <span aria-hidden="true" className="absolute inset-y-2 left-[58%] right-[-22px] overflow-visible">
                    {[{ c: 'bg-gold-400/70', r: '-14deg', d: 0.15 }, { c: 'bg-teal-300/70', r: '0deg', d: 0.25 }, { c: 'bg-teal-500/60', r: '14deg', d: 0.35 }].map((b, bi) => (
                      <motion.span
                        key={bi}
                        className={`absolute top-1/2 left-0 h-[2px] w-7 origin-left rounded-full ${b.c}`}
                        style={{ rotate: b.r }}
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={{ scaleX: 1, opacity: [0, 1, 0.55] }}
                        transition={{ duration: 0.7, delay: b.d, ease: [0.22, 1, 0.36, 1] }}
                      />
                    ))}
                  </span>
                )}
                <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/15 border border-teal-500/25">
                  <PrismIcon size={28} className="text-teal-400" />
                </div>
              </div>
              <div className="min-w-0">
                <h1 className="dfm-display text-3xl sm:text-4xl">Prism</h1>
                <p className="text-slate-400 text-sm mt-1 max-w-2xl">
                  One part in, the whole cost truth out — every engine measures it, an{' '}
                  <span className="text-teal-300">entitlement waterfall</span> splits the quote into
                  named premiums, and every idea must cite the measured evidence.
                </p>
              </div>
            </motion.div>
            <motion.div variants={m.rise} className="flex items-center gap-2 text-2xs text-slate-500">
              <motion.button
                {...m.press}
                aria-pressed={asmMode}
                onClick={() => { setAsmMode(v => !v); setBatchMode(false); }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-medium transition-colors ${asmMode ? 'border-teal-500/40 bg-teal-500/15 text-teal-300' : 'border-white/10 bg-white/[0.04] text-slate-400 hover:text-slate-200'}`}
              >
                <Box size={11} /> Assembly
              </motion.button>
              <motion.button
                {...m.press}
                aria-pressed={batchMode}
                onClick={() => { setBatchMode(v => !v); setAsmMode(false); }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-medium transition-colors ${batchMode ? 'border-gold-500/40 bg-gold-500/15 text-gold-300' : 'border-white/10 bg-white/[0.04] text-slate-400 hover:text-slate-200'}`}
              >
                <Layers size={11} /> Batch triage
              </motion.button>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-teal-500/25 bg-teal-500/10 text-teal-300 font-medium">
                <Gauge size={11} /> No AI in the numbers
              </span>
            </motion.div>
          </div>
        </motion.header>

        {/* ── STEP RAIL ────────────────────────────────────────────────────── */}
        <div className="dfm-sticky -mx-4 px-4 py-2.5 mb-6 border-y border-white/[0.07] bg-navy-950/70">
          <StepRail steps={railSteps} activeId={activeRailId} onJump={jumpTo} />
        </div>

        {asmMode ? (
          <motion.div variants={m.panel} initial="hidden" animate="show" className="space-y-5">
            <div className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
              <div className="flex items-center gap-2 mb-1">
                <Box size={15} className="text-teal-400" />
                <h2 className="text-white font-semibold text-sm">Assembly mode — product tree to costed BOM</h2>
              </div>
              <p className="text-slate-400 text-xs mb-4 max-w-3xl">
                Upload the assembly STEP. Every child solid is measured by OCCT and mapped to a suggested subassembly,
                material and process from its CAD name — <span className="text-teal-300">suggestions you confirm</span>, never
                facts. Then the BOM is costed, rolled up by cost share, and attacked at assembly, subassembly and part level.
              </p>
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="dfm-label text-slate-500 block mb-1.5">Assembly name</label>
                  <input className="dfm-input" aria-label="Assembly name" value={asmName} onChange={e => setAsmName(e.target.value)} placeholder="e.g. 800V EDU — traction motor" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="dfm-label text-slate-500 block mb-1.5">Volume /yr</label>
                    <input className="dfm-input" aria-label="Assembly annual volume" type="number" min="1" value={annualVolume} onChange={e => setAnnualVolume(e.target.value)} />
                  </div>
                  <div>
                    <label className="dfm-label text-slate-500 block mb-1.5">Region</label>
                    <select className="dfm-select" aria-label="Assembly region" value={region} onChange={e => setRegion(e.target.value)}>
                      {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <label className="dfm-label text-slate-500 block mb-1.5">Assembly function, specification &amp; duty <span className="normal-case tracking-normal text-teal-400/80">(strongly recommended)</span></label>
              <textarea className="dfm-input min-h-[70px] resize-y mb-3" aria-label="Assembly function and specification"
                maxLength={2000} value={asmContext} onChange={e => setAsmContext(e.target.value)}
                placeholder="e.g. 800V PSM traction EDU, 250 kW peak / 120 kW continuous, 16,000 rpm, oil-cooled rotor, D-segment BEV, ASIL-B, 15-year corrosion duty. Ideas are judged against this." />
              <input ref={asmInputRef} type="file" accept=".step,.stp,.igs,.iges" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) decomposeAssemblyFile(f); }} />
              <div className="flex flex-wrap items-center gap-3">
                <motion.button {...m.press} onClick={() => asmInputRef.current?.click()} disabled={!!asmBusy}
                  className="dfm-lift bg-white/[0.06] hover:bg-white/10 disabled:opacity-50 text-white text-sm rounded-xl px-4 py-2 flex items-center gap-2 border border-white/10">
                  <Upload size={14} /> {asmRows.length ? `${asmRows.length} solids decomposed — choose another` : 'Upload assembly STEP'}
                </motion.button>
                {asmRows.length > 0 && (
                  <motion.button {...m.press} onClick={costAssembly} disabled={!!asmBusy}
                    className="dfm-cta text-navy-950 disabled:text-slate-400 font-semibold rounded-xl px-5 py-2.5 text-sm flex items-center gap-2">
                    {asmBusy ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />} Cost the BOM
                  </motion.button>
                )}
                {asmBusy && <span className="text-xs text-slate-400">{asmBusy}</span>}
              </div>
              {asmBusy && <div className="dfm-photon h-0.5 rounded-full bg-white/5 mt-4" aria-hidden="true" />}
            </div>

            {/* The BOM: every row confirmable */}
            {asmRows.length > 0 && (
              <motion.div variants={m.panel} initial="hidden" animate="show" className="dfm-panel p-5">
                <h2 className="text-white font-semibold text-sm mb-1">Confirm the BOM ({asmRows.length} solids)</h2>
                <p className="text-slate-500 text-2xs mb-4">Hover any row for the basis of its suggestion. A row left unassigned is carried as not-costed with its reason — it never silently disappears from the total.</p>
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                  {asmRows.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1.4fr_0.8fr_1fr_1.1fr_54px_78px] gap-2 items-center" title={r.suggestionBasis}>
                      <span className="text-xs text-white truncate">{r.name}</span>
                      <input className="dfm-input !py-1.5 !text-2xs" aria-label={`Row ${i + 1} subassembly`} value={r.subassembly}
                        onChange={e => setAsmRows(p2 => p2.map((x, j) => j === i ? { ...x, subassembly: e.target.value } : x))} />
                      <select className="dfm-select !py-1.5 !text-2xs" aria-label={`Row ${i + 1} material`} value={r.material ?? ''}
                        onChange={e => setAsmRows(p2 => p2.map((x, j) => j === i ? { ...x, material: e.target.value || null } : x))}>
                        <option value="">{r.boughtPart ? 'bought part' : 'assign…'}</option>
                        {(catalogue?.materials ?? []).map(mt => <option key={mt} value={mt}>{mt}</option>)}
                      </select>
                      <select className="dfm-select !py-1.5 !text-2xs" aria-label={`Row ${i + 1} process`} value={r.process ?? ''}
                        onChange={e => setAsmRows(p2 => p2.map((x, j) => j === i ? { ...x, process: e.target.value || null } : x))}>
                        <option value="">{r.boughtPart ? '—' : 'assign…'}</option>
                        {(catalogue?.processes ?? []).map(pp => <option key={pp} value={pp}>{pp}</option>)}
                      </select>
                      <input className="dfm-input !py-1.5 !text-2xs" aria-label={`Row ${i + 1} quantity`} type="number" min="1" value={r.qty}
                        onChange={e => setAsmRows(p2 => p2.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) || 1 } : x))} />
                      <input className="dfm-input !py-1.5 !text-2xs" aria-label={`Row ${i + 1} bought price in euro`} type="number" min="0" step="0.01"
                        placeholder={r.boughtPart ? '€ price' : (r.suggestedMassKg ? `${r.suggestedMassKg} kg` : '—')}
                        value={r.boughtPriceEur ?? ''}
                        onChange={e => setAsmRows(p2 => p2.map((x, j) => j === i ? { ...x, boughtPriceEur: e.target.value ? Number(e.target.value) : null, boughtPart: true } : x))} />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Roll-up */}
            {asmDossier && (
              <motion.div variants={m.panel} initial="hidden" animate="show" className="dfm-panel dfm-framed p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
                  <h2 className="text-white font-semibold text-sm">Assembly roll-up — {asmDossier.assemblyName}</h2>
                  <div className="dfm-kpi-value text-teal-300" style={{ fontSize: 24 }}>
                    <TickNumber value={asmDossier.rollUp.totalEur} decimals={2} prefix="€" />
                  </div>
                </div>
                <p className="text-slate-500 text-2xs mb-4">{asmDossier.rollUp.caveat}</p>
                <motion.div variants={m.stagger()} initial="hidden" animate="show" className="space-y-2 mb-4">
                  {asmDossier.rollUp.subassemblies.map((sb, i) => (
                    <motion.div key={sb.subassembly} variants={m.slideIn} className="grid grid-cols-[130px_1fr_150px] items-center gap-3">
                      <span className="text-xs text-slate-300 text-right">{sb.subassembly}</span>
                      <div className="dfm-bar !h-[16px] rounded-md">
                        <motion.span className={i === 0 ? 'bg-gradient-to-r from-gold-500/80 to-gold-400/80' : 'bg-gradient-to-r from-teal-500/60 to-teal-400/60'}
                          initial={{ width: 0 }} animate={{ width: `${sb.sharePct ?? 0}%` }} transition={m.t(0.5, m.beat(i))} />
                      </div>
                      <span className="dfm-num text-xs text-right text-white">€{sb.eur} <span className="text-slate-500">({sb.sharePct}%)</span></span>
                    </motion.div>
                  ))}
                </motion.div>
                {asmDossier.rollUp.uncosted.length > 0 && (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 mb-4">
                    <div className="text-2xs text-amber-300 font-semibold mb-1">Not costed — excluded from the total above</div>
                    {asmDossier.rollUp.uncosted.map(u => (
                      <p key={u.name} className="text-2xs text-amber-200/80">{u.name} × {u.qty} — {u.reason}</p>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mb-3">
                  {asmDossier.lensBlocks.map(l => {
                    const on = asmLenses.has(l.lensId);
                    return (
                      <motion.button key={l.lensId} {...m.press} aria-pressed={on}
                        onClick={() => setAsmLenses(prev => { const n = new Set(prev); if (n.has(l.lensId)) n.delete(l.lensId); else n.add(l.lensId); return n; })}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium ${on ? 'bg-teal-500/15 text-teal-300 border-teal-500/35' : 'bg-white/[0.04] text-slate-500 border-white/10'}`}>
                        {l.name} <span className="text-2xs opacity-70">· {l.level}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <p className="text-2xs text-slate-500 mb-3">{asmDossier.dossier.evidenceCount} numbered evidence lines. Each level runs its own generation pass; every idea must cite the evidence and carries its systemLevel.</p>
                {asmGenerating && asmGenLog.length > 0 && (
                  <div className="mb-3 bg-navy-950/70 border border-white/[0.07] rounded-xl p-3 text-xs max-h-40 overflow-y-auto">
                    {asmGenLog.map((line, i) => <LogLine key={`${i}-${line.slice(0, 20)}`} text={line} active={i === asmGenLog.length - 1} />)}
                  </div>
                )}
                <div className="flex justify-end">
                  <motion.button {...m.press} onClick={generateAssembly} disabled={asmGenerating || asmLenses.size === 0}
                    className="dfm-cta text-navy-950 disabled:text-slate-400 font-semibold rounded-xl px-6 py-2.5 text-sm flex items-center gap-2">
                    {asmGenerating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    {asmGenerating ? 'Generating across levels…' : `Generate at ${asmLenses.size} level${asmLenses.size === 1 ? '' : 's'}`}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </motion.div>
        ) : batchMode ? (
          <motion.div variants={m.panel} initial="hidden" animate="show" className="space-y-5">
            <div className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
              <div className="flex items-center gap-2 mb-1">
                <Layers size={15} className="text-gold-400" />
                <h2 className="text-white font-semibold text-sm">Zero-touch batch triage</h2>
              </div>
              <p className="text-slate-400 text-xs mb-4 max-w-3xl">
                Drop up to 12 STEP files sharing one material and process. Each is measured, massed from its own
                geometry, and run through the entitlement waterfall — deterministic engines only. The table ranks
                where the money is; deep-dive the winners in the wizard.
              </p>
              <div className="grid md:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="dfm-label text-slate-500 block mb-1.5">Material</label>
                  <select className="dfm-select" aria-label="Batch material" value={material} onChange={e => setMaterial(e.target.value)}>
                    {(catalogue?.materials ?? []).map(mt => <option key={mt} value={mt}>{mt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="dfm-label text-slate-500 block mb-1.5">Process</label>
                  <select className="dfm-select" aria-label="Batch process" value={processName} onChange={e => setProcessName(e.target.value)}>
                    {(catalogue?.processes ?? []).map(pp => <option key={pp} value={pp}>{pp}</option>)}
                  </select>
                </div>
                <div>
                  <label className="dfm-label text-slate-500 block mb-1.5">Volume /yr</label>
                  <input className="dfm-input" aria-label="Batch annual volume" type="number" min="1" value={annualVolume} onChange={e => setAnnualVolume(e.target.value)} />
                </div>
                <div>
                  <label className="dfm-label text-slate-500 block mb-1.5">Region</label>
                  <select className="dfm-select" aria-label="Batch region" value={region} onChange={e => setRegion(e.target.value)}>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <input ref={batchInputRef} type="file" multiple accept=".step,.stp,.igs,.iges" className="hidden"
                onChange={e => setBatchFiles(Array.from(e.target.files ?? []).slice(0, 12))} />
              <div className="flex flex-wrap items-center gap-3">
                <motion.button {...m.press} onClick={() => batchInputRef.current?.click()}
                  className="dfm-lift bg-white/[0.06] hover:bg-white/10 text-white text-sm rounded-xl px-4 py-2 flex items-center gap-2 border border-white/10">
                  <Upload size={14} /> {batchFiles.length ? `${batchFiles.length} file${batchFiles.length === 1 ? '' : 's'} selected` : 'Choose STEP files'}
                </motion.button>
                <motion.button {...m.press} onClick={runBatch} disabled={batchRunning || !batchFiles.length}
                  className="dfm-cta text-navy-950 disabled:text-slate-400 font-semibold rounded-xl px-5 py-2.5 text-sm flex items-center gap-2">
                  {batchRunning ? <Loader2 size={15} className="animate-spin" /> : <Gauge size={15} />}
                  {batchRunning ? batchProgress || 'Measuring…' : 'Run triage'}
                </motion.button>
              </div>
              {batchRunning && <div className="dfm-photon h-0.5 rounded-full bg-white/5 mt-4" aria-hidden="true" />}
            </div>

            {batchRows && (
              <motion.div variants={m.panel} initial="hidden" animate="show" className="dfm-panel dfm-framed p-5">
                <h2 className="text-white font-semibold text-sm mb-1">Triage — ranked by annual gap</h2>
                <p className="text-slate-500 text-2xs mb-4">{batchBasis}</p>
                <motion.div variants={m.stagger()} initial="hidden" animate="show" className="space-y-2.5">
                  {batchRows.map((row, i) => {
                    const maxGap = Math.max(...batchRows.map(x => x.annualGapEur ?? 0), 1);
                    return (
                      <motion.div key={row.file} variants={m.slideIn}
                        className={`rounded-xl border px-4 py-3 ${row.error ? 'border-amber-500/25 bg-amber-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                        {row.error ? (
                          <div className="text-xs text-amber-300/90"><span className="text-white font-medium">{row.file}</span> — not measured: {row.error}</div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="dfm-num text-2xs text-teal-500/80 w-5">{i + 1}</span>
                              <div className="min-w-[140px] flex-1">
                                <div className="text-sm text-white">{row.file}</div>
                                <div className="text-2xs text-slate-500">{row.massKg} kg · {row.massSource}</div>
                              </div>
                              <div className="dfm-num text-xs text-slate-400 w-24 text-right">engine {eur(row.engineEur)}</div>
                              <div className="dfm-num text-xs text-teal-300 w-24 text-right">entitle {eur(row.entitlementEur)}</div>
                              <div className="w-36 hidden sm:block">
                                <div className="dfm-bar">
                                  <motion.span className="bg-gold-400/80" initial={{ width: 0 }}
                                    animate={{ width: `${((row.annualGapEur ?? 0) / maxGap) * 100}%` }} transition={m.t(0.4, i * 0.06)} />
                                </div>
                              </div>
                              <div className="dfm-num text-xs text-gold-400 font-semibold w-28 text-right">
                                {row.annualGapEur != null ? `€${row.annualGapEur.toLocaleString()}/yr` : '—'}
                              </div>
                              <motion.button {...m.press}
                                onClick={() => { setPartName(row.file.replace(/\.(step|stp|igs|iges)$/i, '')); setWeightKg(String(row.massKg ?? '')); setBatchMode(false); setStep(0); toast('Prefilled — re-attach the CAD file for the full deep-dive.', 'info'); }}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20">
                                Deep-dive
                              </motion.button>
                            </div>
                            <div className="text-2xs text-slate-500 mt-1.5 pl-8">{row.topLever}{Number.isFinite(row.co2DeltaKg) ? ` · CO₂e ${(row.co2DeltaKg as number) > 0 ? '+' : ''}${row.co2DeltaKg} kg/part on the switch` : ''}</div>
                          </>
                        )}
                      </motion.div>
                    );
                  })}
                </motion.div>
              </motion.div>
            )}
          </motion.div>
        ) : (
        <AnimatePresence mode="wait">

          {/* ── STEP 1: part & files ───────────────────────────────────────── */}
          {step === 0 && (
            <motion.div key="s0" variants={m.panel} initial="hidden" animate="show" exit="exit" className="grid lg:grid-cols-2 gap-6">
              <div className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
                <div className="flex items-center gap-2 mb-4">
                  <Box size={15} className="text-teal-400" />
                  <h2 className="text-white font-semibold text-sm">The part</h2>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="dfm-label text-slate-500 block mb-1.5">Part name</label>
                    <input className="dfm-input" aria-label="Part name" value={partName} onChange={e => setPartName(e.target.value)} placeholder="e.g. Bracket, seat crossmember" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="dfm-label text-slate-500 block mb-1.5">Material</label>
                      <select className="dfm-select" aria-label="Material" value={material} onChange={e => setMaterial(e.target.value)}>
                        {(catalogue?.materials ?? []).map(mt => <option key={mt} value={mt}>{mt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="dfm-label text-slate-500 block mb-1.5">Process</label>
                      <select className="dfm-select" aria-label="Manufacturing process" value={processName} onChange={e => setProcessName(e.target.value)}>
                        {(catalogue?.processes ?? []).map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="dfm-label text-slate-500 block mb-1.5">Mass (kg)</label>
                      <input className="dfm-input" aria-label="Finished mass in kilograms" type="number" min="0" step="0.001" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="0.50" />
                    </div>
                    <div>
                      <label className="dfm-label text-slate-500 block mb-1.5">Volume /yr</label>
                      <input className="dfm-input" aria-label="Annual volume" type="number" min="1" value={annualVolume} onChange={e => setAnnualVolume(e.target.value)} />
                    </div>
                    <div>
                      <label className="dfm-label text-slate-500 block mb-1.5">Region</label>
                      <select className="dfm-select" aria-label="Region" value={region} onChange={e => setRegion(e.target.value)}>
                        {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="dfm-label text-slate-500 block mb-1.5">About this part — what it is & what it does <span className="normal-case tracking-normal text-teal-400/80">(strongly recommended)</span></label>
                    <textarea
                      className="dfm-input min-h-[74px] resize-y"
                      aria-label="About this part: function, loads, environment"
                      maxLength={1500}
                      value={partContext}
                      onChange={e => setPartContext(e.target.value)}
                      placeholder="e.g. Steering knuckle RH — connects wheel hub and brake caliper to the suspension; carries braking and cornering loads; bolted to strut and lower ball joint; safety-critical; -40 to 120 °C."
                    />
                    <p className="text-2xs text-slate-500 mt-1">
                      This becomes the stated REQUIREMENT every idea is judged against — alternatives the function rules out are treated as defects. Without it, ideas say their function-fit is unverified.
                    </p>
                  </div>
                  <p className="text-2xs text-slate-500 flex items-start gap-1.5 pt-1">
                    <Scale size={11} className="mt-0.5 shrink-0" />
                    Unsure of the mass? Enter an estimate — after the 3D model is measured, the wizard offers the geometry-derived mass to correct it.
                  </p>
                </div>
              </div>

              <div className="dfm-panel dfm-spot p-5 flex flex-col" onMouseMove={spot}>
                <div className="flex items-center gap-2 mb-1">
                  <Upload size={15} className="text-teal-400" />
                  <h2 className="text-white font-semibold text-sm">Files</h2>
                </div>
                <p className="text-2xs text-slate-500 mb-4">Each one unlocks more of the 360° — absence is stated, never guessed.</p>
                <div className="space-y-3 flex-1">
                  <input ref={cadInputRef} type="file" accept=".step,.stp,.stl,.igs,.iges" className="hidden"
                    onChange={e => { setCadFile(e.target.files?.[0] ?? null); setDfmResult(null); setDfmFailed(false); }} />
                  <motion.button {...m.press} onClick={() => cadInputRef.current?.click()}
                    className={`dfm-lift w-full border-2 border-dashed rounded-xl p-4 text-left ${cadFile ? 'border-teal-500/40 bg-teal-500/5' : 'border-white/15 hover:border-white/30'}`}>
                    <div className="flex items-center gap-2 text-sm text-white font-medium">
                      <Box size={14} className={cadFile ? 'text-teal-400' : 'text-slate-500'} />
                      {cadFile ? cadFile.name : '3D model (STEP / STL) — optional'}
                      {cadFile && <CheckCircle2 size={13} className="text-teal-400 ml-auto dfm-tick-in" />}
                    </div>
                    <div className="text-2xs text-slate-500 mt-1 pl-6">{cadFile ? 'Will be measured by the DFM engines and priced down every viable process route.' : 'Without it, the waterfall’s process step is honestly skipped ("geometry absent").'}</div>
                  </motion.button>
                  <input ref={drawingInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
                    onChange={e => { setDrawingFile(e.target.files?.[0] ?? null); setDrawingRead(null); }} />
                  <motion.button {...m.press} onClick={() => drawingInputRef.current?.click()}
                    className={`dfm-lift w-full border-2 border-dashed rounded-xl p-4 text-left ${drawingFile ? 'border-teal-500/40 bg-teal-500/5' : 'border-white/15 hover:border-white/30'}`}>
                    <div className="flex items-center gap-2 text-sm text-white font-medium">
                      <Ruler size={14} className={drawingFile ? 'text-teal-400' : 'text-slate-500'} />
                      {drawingFile ? drawingFile.name : '2D drawing (PDF / image) — optional'}
                      {drawingFile && <CheckCircle2 size={13} className="text-teal-400 ml-auto dfm-tick-in" />}
                    </div>
                    <div className="text-2xs text-slate-500 mt-1 pl-6">{drawingFile ? 'Tolerances and roughness prefill the costed specification — you confirm them.' : 'Without it, the spec defaults to standard and over-specification cannot be measured.'}</div>
                  </motion.button>
                  <p className="text-2xs text-slate-500">The supplier quote comes at step 3 — form entry with optional PDF assist.</p>
                </div>
                <motion.button
                  {...m.press}
                  disabled={!inputsValid}
                  onClick={() => setStep(1)}
                  className="dfm-cta mt-4 w-full disabled:opacity-40 disabled:border disabled:border-white/10 text-navy-950 disabled:text-slate-500 font-semibold rounded-xl py-2.5 text-sm flex items-center justify-center gap-2"
                >
                  Continue to measurement <ChevronRight size={16} />
                </motion.button>
                {!inputsValid && <p className="text-2xs text-slate-500 mt-2 text-center">Material, process, mass and volume are required — they drive every engine.</p>}
              </div>

              <div className="lg:col-span-2 dfm-panel p-5">
                <button onClick={() => setTdOpen(v => !v)} className="w-full flex items-center justify-between text-left" aria-expanded={tdOpen}>
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    <FileSearch size={15} className="text-teal-400" />
                    Teardown library
                    <span className="dfm-num text-2xs text-slate-500 font-normal">({teardowns.length} recorded — user-recorded observations, externally unverified)</span>
                  </span>
                  <ChevronRight size={14} className={`text-slate-500 transition-transform ${tdOpen ? 'rotate-90' : ''}`} />
                </button>
                <AnimatePresence>
                {tdOpen && (
                  <motion.div variants={m.rise} initial="hidden" animate="show" exit="exit" className="mt-4 space-y-4">
                    <p className="text-2xs text-slate-500 max-w-3xl">Record competitor parts you have physically torn down. Matching observations become cited evidence in every Prism run for the same material or process family — your organisation's own benchmark base.</p>
                    <div className="grid md:grid-cols-4 gap-2">
                      <input className="dfm-input" aria-label="Teardown title" placeholder="Title, e.g. Golf 8 hood bracket *" value={tdForm.title} onChange={e => setTdForm(f => ({ ...f, title: e.target.value }))} />
                      <input className="dfm-input" aria-label="Teardown reference" placeholder="Reference (OEM, model, year)" value={tdForm.reference} onChange={e => setTdForm(f => ({ ...f, reference: e.target.value }))} />
                      <input className="dfm-input" aria-label="Teardown part name" placeholder="Part name" value={tdForm.partName} onChange={e => setTdForm(f => ({ ...f, partName: e.target.value }))} />
                      <input className="dfm-input" aria-label="Teardown mass in kilograms" type="number" min="0" step="0.001" placeholder="Mass kg" value={tdForm.massKg} onChange={e => setTdForm(f => ({ ...f, massKg: e.target.value }))} />
                      <select className="dfm-select" aria-label="Teardown material" value={tdForm.material} onChange={e => setTdForm(f => ({ ...f, material: e.target.value }))}>
                        <option value="">Material…</option>
                        {(catalogue?.materials ?? []).map(mt => <option key={mt} value={mt}>{mt}</option>)}
                      </select>
                      <select className="dfm-select" aria-label="Teardown process" value={tdForm.process} onChange={e => setTdForm(f => ({ ...f, process: e.target.value }))}>
                        <option value="">Process…</option>
                        {(catalogue?.processes ?? []).map(pp => <option key={pp} value={pp}>{pp}</option>)}
                      </select>
                      <input className="dfm-input" aria-label="Teardown joining method" placeholder="Joining, e.g. clinching" value={tdForm.joining} onChange={e => setTdForm(f => ({ ...f, joining: e.target.value }))} />
                      <motion.button {...m.press} onClick={saveTeardown} disabled={tdSaving}
                        className="dfm-cta text-navy-950 disabled:text-slate-400 font-semibold rounded-xl px-4 py-2 text-sm flex items-center justify-center gap-2">
                        {tdSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Record
                      </motion.button>
                    </div>
                    <input className="dfm-input" aria-label="Teardown notes" placeholder="Notes — what you observed (gauge, coating, part count…)" value={tdForm.notes} onChange={e => setTdForm(f => ({ ...f, notes: e.target.value }))} />
                    {teardowns.length > 0 && (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {teardowns.map(t => (
                          <div key={t.id} className="dfm-row-hover flex items-center gap-3 rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs">
                            <span className="text-white">{t.title}</span>
                            <span className="text-slate-500 flex-1 truncate">{[t.reference, t.material, t.process, t.massKg ? `${t.massKg} kg` : null].filter(Boolean).join(' · ')}</span>
                            <button aria-label={`Delete teardown ${t.title}`} onClick={() => deleteTeardown(t.id)} className="text-slate-500 hover:text-danger-400"><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: engine measurement ─────────────────────────────────── */}
          {step === 1 && (
            <motion.div key="s1" variants={m.panel} initial="hidden" animate="show" exit="exit" className="space-y-5">
              <div className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Gauge size={15} className="text-teal-400" />
                      <h2 className="text-white font-semibold text-sm">Deterministic measurement</h2>
                    </div>
                    <p className="text-slate-400 text-xs mt-1">
                      Runs the should-cost engine{cadFile ? ', the DFM geometry engines' : ''}{drawingFile ? ' and the drawing reader' : ''} — engine math only; the one AI step (drawing OCR) is prefill you confirm.
                    </p>
                  </div>
                  <motion.button
                    {...m.press}
                    onClick={runMeasurements}
                    disabled={measuring}
                    className="dfm-cta text-navy-950 disabled:text-slate-400 font-semibold rounded-xl px-5 py-2.5 text-sm flex items-center gap-2"
                  >
                    {measuring ? <Loader2 size={15} className="animate-spin" /> : <Gauge size={15} />}
                    {measuring ? 'Measuring…' : shouldCost ? 'Re-run measurement' : 'Run measurement'}
                  </motion.button>
                </div>
                {measuring && <div className="dfm-photon h-0.5 rounded-full bg-white/5 mb-3" aria-hidden="true" />}
                {measureLog.length > 0 && (
                  <motion.div variants={m.stagger()} initial="hidden" animate="show"
                    className="bg-navy-950/70 border border-white/[0.07] rounded-xl p-3 text-xs space-y-0 max-h-52 overflow-y-auto dfm-num">
                    {measureLog.map((line, i) => (
                      <motion.div key={`${i}-${line.slice(0, 24)}`} variants={m.slideIn}>
                        <LogLine text={line} active={measuring && i === measureLog.length - 1} />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
                {measureError && <p className="text-danger-400 text-xs mt-3">{measureError}</p>}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <motion.div variants={m.rise} initial="hidden" animate="show" transition={m.t(undefined, m.beat(0))}
                  className="dfm-panel dfm-spot dfm-lift p-5" onMouseMove={spot}>
                  <div className="dfm-label text-slate-500 mb-2">Engine should-cost · as specified</div>
                  {shouldCost ? (
                    <>
                      <div className="dfm-kpi-value text-white">
                        <TickNumber value={shouldCost.totalValue} decimals={2} prefix={shouldCost.symbol} delay={m.beat(1)} />
                      </div>
                      <div className="text-2xs text-slate-500 mt-2">{material} · {processName} · {region}</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-500 mt-1">Run measurement first.</div>
                  )}
                </motion.div>

                <motion.div variants={m.rise} initial="hidden" animate="show" transition={m.t(undefined, m.beat(1))}
                  className="dfm-panel dfm-spot dfm-lift p-5" onMouseMove={spot}>
                  <div className="dfm-label text-slate-500 mb-2">DFM measurement</div>
                  {dfmResult?.results?.[0] ? (
                    <ScoreRing score={dfmResult.results[0].score} size={76} label="DFM score"
                      sublabel={`${dfmResult.results[0].findings.length} findings · ${dfmResult.results[0].processName}`} />
                  ) : (
                    <div className="text-sm text-slate-500 mt-1">
                      {!cadFile ? 'No 3D model — skipped, stated in the dossier.'
                        : measuring ? 'Measuring…'
                        : dfmFailed ? <span className="text-amber-400/90">Measurement failed — continuing without geometry; the dossier states it.</span>
                        : 'Run measurement.'}
                    </div>
                  )}
                </motion.div>

                <motion.div variants={m.rise} initial="hidden" animate="show" transition={m.t(undefined, m.beat(2))}
                  className="dfm-panel dfm-spot dfm-lift p-5" onMouseMove={spot}>
                  <div className="dfm-label text-slate-500 mb-2">Costed specification <span className="normal-case tracking-normal text-slate-500">(drawing prefill — confirm)</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="dfm-label text-slate-500 block mb-1">Tol. band (mm)</label>
                      <input className="dfm-input" aria-label="Tightest tolerance band in millimetres" type="number" step="0.01" min="0" value={tightestTolMm} onChange={e => setTightestTolMm(e.target.value)} placeholder="none read" />
                    </div>
                    <div>
                      <label className="dfm-label text-slate-500 block mb-1">Finest Ra (µm)</label>
                      <input className="dfm-input" aria-label="Finest surface roughness Ra in micrometres" type="number" step="0.1" min="0" value={roughnessRaUm} onChange={e => setRoughnessRaUm(e.target.value)} placeholder="none read" />
                    </div>
                  </div>
                  <div className="text-2xs text-slate-500 mt-2">
                    {drawingRead ? `Read ${drawingRead.toleranced} toleranced of ${drawingRead.dims} dimensions.` : 'Blank = standard spec assumed, and the dossier says so.'}
                  </div>
                </motion.div>
              </div>

              {/* CAD-measured mass: an OFFER with its basis, never a silent overwrite. */}
              <AnimatePresence>
                {cadMassKg != null && (
                  <motion.div key="mass" variants={m.rise} initial="hidden" animate="show" exit="exit"
                    className={`dfm-panel p-4 flex flex-wrap items-center gap-3 ${massDiverges ? 'dfm-alert-once border-amber-500/40' : ''}`}>
                    <Scale size={16} className={massDiverges ? 'text-amber-400' : 'text-teal-400'} />
                    <div className="text-xs text-slate-300 flex-1 min-w-[240px]">
                      Geometry-derived mass for <span className="text-white font-medium">{material}</span>:{' '}
                      <span className="text-white font-semibold dfm-num">{cadMassKg.toFixed(3)} kg</span>
                      <span className="text-slate-500"> (measured volume × catalogue density)</span>
                      {massLooksSolid ? (
                        <span className="block text-amber-400 mt-0.5">
                          This is {'>'}5× your entered mass — the model is likely a CLOSED SOLID (enclosed volume, not shell material), so the measured figure is unreliable for a hollow part. Keep your own mass unless you know the model is truly solid.
                        </span>
                      ) : massDiverges && (
                        <span className="block text-amber-400 mt-0.5">
                          Your entered mass ({typedMass} kg) differs by more than 25% — a wrong mass skews every engine figure downstream.
                        </span>
                      )}
                    </div>
                    <motion.button {...m.press}
                      onClick={() => { setWeightKg(cadMassKg.toFixed(3)); setShouldCost(null); toast('Mass set from measured geometry — re-run measurement to re-cost.', 'info'); }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20">
                      Use measured mass
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-between">
                <button onClick={() => setStep(0)} className="text-slate-400 hover:text-white text-sm flex items-center gap-1"><ChevronLeft size={15} /> Back</button>
                <motion.button
                  {...m.press}
                  onClick={() => setStep(2)}
                  disabled={!shouldCost}
                  className="dfm-cta disabled:opacity-40 disabled:border disabled:border-white/10 text-navy-950 disabled:text-slate-500 font-semibold rounded-xl px-5 py-2.5 text-sm flex items-center gap-2"
                >
                  Continue to quote <ChevronRight size={16} />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: supplier quote ─────────────────────────────────────── */}
          {step === 2 && (
            <motion.div key="s2" variants={m.panel} initial="hidden" animate="show" exit="exit" className="space-y-5">
              <div className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <FileText size={15} className="text-teal-400" />
                      <h2 className="text-white font-semibold text-sm">Supplier quote <span className="text-slate-500 font-normal">(optional but powerful)</span></h2>
                    </div>
                    <p className="text-slate-400 text-xs">With a breakdown, every line is judged against its engine bucket, and the waterfall gets its commercial step.</p>
                  </div>
                  <div>
                    <input ref={quotePdfRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) extractQuote(f); e.currentTarget.value = ''; }} />
                    <motion.button
                      {...m.press}
                      onClick={() => quotePdfRef.current?.click()}
                      disabled={extracting}
                      className="dfm-lift bg-white/[0.06] hover:bg-white/10 disabled:opacity-50 text-white text-sm rounded-xl px-4 py-2 flex items-center gap-2 border border-white/10"
                    >
                      {extracting ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
                      {extracting ? 'Reading…' : 'PDF assist (prefill)'}
                    </motion.button>
                  </div>
                </div>
                <AnimatePresence>
                  {extractNote && (
                    <motion.div key="xnote" variants={m.rise} initial="hidden" animate="show" exit="exit"
                      className="mt-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {extractNote}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="grid md:grid-cols-3 gap-3 mt-4">
                  <div>
                    <label className="dfm-label text-slate-500 block mb-1.5">Supplier</label>
                    <input className="dfm-input" aria-label="Supplier" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="optional" />
                  </div>
                  <div>
                    <label className="dfm-label text-slate-500 block mb-1.5">Currency</label>
                    <select className="dfm-select" aria-label="Quote currency" value={quoteCurrency} onChange={e => setQuoteCurrency(e.target.value)}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="dfm-label text-slate-500 block mb-1.5">Quoted piece price ({sym})</label>
                    <input className="dfm-input" aria-label="Quoted piece price" type="number" min="0" step="0.01" value={quoteTotal} onChange={e => setQuoteTotal(e.target.value)} placeholder="0.00" />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="dfm-label text-slate-500">Breakdown lines ({sym} each)</label>
                    <motion.button {...m.press} onClick={() => setQuoteLines(prev => [...prev, { label: '', kind: 'other', amount: '' }])}
                      className="text-teal-400 hover:text-teal-300 text-xs flex items-center gap-1"><Plus size={12} /> Add line</motion.button>
                  </div>
                  {quoteLines.length === 0 && <p className="text-2xs text-slate-500">No lines — forensics will be skipped and the dossier will say so.</p>}
                  <motion.div variants={m.stagger()} initial="hidden" animate="show" className="space-y-2">
                    {quoteLines.map((l, i) => (
                      <motion.div key={i} variants={m.slideIn} className="grid grid-cols-[1fr_140px_110px_32px] gap-2 items-center">
                        <input className="dfm-input" aria-label={`Line ${i + 1} label`} value={l.label} placeholder="e.g. Raw material" onChange={e => setQuoteLines(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                        <select className="dfm-select" aria-label={`Line ${i + 1} kind`} value={l.kind} onChange={e => setQuoteLines(prev => prev.map((x, j) => j === i ? { ...x, kind: e.target.value as QuoteKind } : x))}>
                          {QUOTE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                        <input className="dfm-input" aria-label={`Line ${i + 1} amount`} type="number" min="0" step="0.01" value={l.amount} placeholder="0.00" onChange={e => setQuoteLines(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                        <button aria-label={`Remove line ${i + 1}`} onClick={() => setQuoteLines(prev => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-danger-400"><Trash2 size={14} /></button>
                      </motion.div>
                    ))}
                  </motion.div>
                  {Number(quoteTotal) > 0 && (
                    <label className="flex items-center gap-2 mt-4 text-sm text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={saveToCalibration} onChange={e => setSaveToCalibration(e.target.checked)} className="accent-gold-500" />
                      Teach the engine — save this quote to my calibration corpus
                    </label>
                  )}
                </div>
              </div>

              {error && <p className="text-danger-400 text-sm">{error}</p>}
              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="text-slate-400 hover:text-white text-sm flex items-center gap-1"><ChevronLeft size={15} /> Back</button>
                <motion.button
                  {...m.press}
                  onClick={buildDossier}
                  disabled={building}
                  className="dfm-cta text-navy-950 disabled:text-slate-400 font-semibold rounded-xl px-5 py-2.5 text-sm flex items-center gap-2"
                >
                  {building ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
                  {building ? 'Computing dossier…' : `Build the evidence dossier${Number(quoteTotal) > 0 ? '' : ' (no quote)'}`}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 4: dossier + generate ─────────────────────────────────── */}
          {step === 3 && dossier && wf && (
            <motion.div key="s3" variants={m.stagger()} initial="hidden" animate="show" exit="exit" className="space-y-5">

              {/* Pre-flight cautions: flagged, never silently fixed */}
              {dossier.anomalies && dossier.anomalies.length > 0 && (
                <motion.div variants={m.panel} className="dfm-panel dfm-alert-once border-amber-500/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} className="text-amber-400" />
                    <h2 className="text-amber-300 font-semibold text-sm">Input cautions ({dossier.anomalies.length})</h2>
                  </div>
                  <div className="space-y-1.5">
                    {dossier.anomalies.map(a => (
                      <p key={a.id} className="text-xs text-amber-200/80 max-w-none">{a.message}</p>
                    ))}
                  </div>
                  <p className="text-2xs text-slate-500 mt-2">These cautions also ride into the evidence dossier — ideas see the suspicion in the same breath as the input.</p>
                </motion.div>
              )}

              {/* Waterfall — the bars ARE the engine numbers */}
              <motion.div variants={m.panel} className="dfm-panel dfm-framed dfm-spot p-5 relative overflow-hidden" onMouseMove={spot}>
                <div className="dfm-scan" style={{ '--scan-h': '340px' } as React.CSSProperties} aria-hidden="true" />
                <div className="flex items-center gap-2 mb-1">
                  <Layers size={15} className="text-gold-400" />
                  <h2 className="text-white font-semibold text-sm">Cost entitlement waterfall</h2>
                </div>
                <p className="text-slate-500 text-2xs mb-5 max-w-3xl">{wf.caution}</p>

                <div className="space-y-2.5 mb-5" role="img" aria-label="Waterfall of engine-computed cost premiums from quote to entitlement">
                  {wf.quoteEur != null && (
                    <div className="grid grid-cols-[130px_1fr_84px] items-center gap-3">
                      <div className="text-xs text-slate-300 text-right">Supplier quote</div>
                      <div className="dfm-bar !h-[18px] rounded-md">
                        <motion.span
                          className="!rounded-md bg-gradient-to-r from-slate-500/70 to-slate-400/70"
                          initial={{ width: 0 }} animate={{ width: `${pct(wf.quoteEur)}%` }}
                          transition={m.t(0.5, m.beat(0))}
                        />
                      </div>
                      <div className="dfm-num text-xs text-white font-semibold text-right">
                        <TickNumber value={wf.quoteEur} decimals={2} prefix="€" delay={m.beat(0)} />
                      </div>
                    </div>
                  )}
                  {wf.steps.map((s, i) => (
                    <div key={s.id} className="grid grid-cols-[130px_1fr_84px] items-center gap-3">
                      <div className="text-xs text-slate-400 text-right">
                        <span className="text-teal-500/80 dfm-num mr-1">{s.id}</span>{s.name}
                      </div>
                      {s.skipped ? (
                        <div
                          className="h-[18px] rounded-md border border-white/[0.06] text-2xs text-slate-500 italic flex items-center px-2"
                          style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.025) 0 6px, transparent 6px 12px)' }}
                        >
                          not evaluated — {s.reason}
                        </div>
                      ) : (
                        <div className="dfm-bar !h-[18px] rounded-md relative">
                          <motion.span
                            className="absolute left-0 top-0 h-full !rounded-md bg-gradient-to-r from-teal-500/60 to-teal-400/60"
                            initial={{ width: 0 }} animate={{ width: `${pct(s.toEur)}%` }}
                            transition={m.t(0.5, m.beat(i + 1))}
                          />
                          <motion.span
                            title={`${s.name}: ${eur(Math.abs(s.deltaEur))} ${s.deltaEur >= 0 ? 'removable premium' : 'below the model'}`}
                            className={`absolute top-0 h-full ${s.deltaEur >= 0 ? 'bg-gradient-to-r from-gold-500/75 to-gold-400/75' : 'bg-emerald-500/60'}`}
                            style={{ left: `${pct(Math.min(s.toEur, s.fromEur))}%`, borderRadius: '0 6px 6px 0' }}
                            initial={{ width: 0 }} animate={{ width: `${Math.abs(pct(s.fromEur) - pct(s.toEur))}%` }}
                            transition={m.t(0.5, m.beat(i + 1) + 0.12)}
                          />
                        </div>
                      )}
                      <div className={`dfm-num text-xs font-semibold text-right ${s.skipped ? 'text-slate-500' : s.deltaEur > 0 ? 'text-gold-400' : 'text-slate-400'}`}>
                        {s.skipped ? '—' : <>
                          {Math.abs(s.deltaEur) < 0.005 ? '' : s.deltaEur < 0 ? '+' : '−'}<TickNumber value={Math.abs(s.deltaEur)} decimals={2} prefix="€" delay={m.beat(i + 1)} />
                          {Number.isFinite(s.co2DeltaKg) && (
                            <span
                              title={s.co2Basis ?? undefined}
                              className={`block mt-0.5 text-2xs font-medium ${(s.co2DeltaKg as number) <= 0 ? 'text-emerald-400/90' : 'text-amber-400/90'}`}
                            >
                              {(s.co2DeltaKg as number) > 0 ? '+' : ''}{s.co2DeltaKg} kgCO₂e
                            </span>
                          )}
                        </>}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-[130px_1fr_84px] items-center gap-3 pt-1 border-t border-white/[0.06]">
                    <div className="text-xs text-teal-300 font-semibold text-right">Entitlement</div>
                    <div className="dfm-bar !h-[18px] rounded-md">
                      <motion.span
                        className="!rounded-md bg-gradient-to-r from-teal-400/85 to-teal-300/85 shadow-[0_0_14px_-2px_rgb(45_212_191/0.5)]"
                        initial={{ width: 0 }} animate={{ width: `${pct(wf.entitlementEur)}%` }}
                        transition={m.t(0.5, m.beat(wf.steps.length + 1))}
                      />
                    </div>
                    <div className="dfm-num text-xs text-teal-300 font-bold text-right">
                      <TickNumber value={wf.entitlementEur} decimals={2} prefix="€" delay={m.beat(wf.steps.length + 1)} />
                    </div>
                  </div>
                </div>

                <div className="text-sm font-semibold text-gold-400 mb-4">
                  {wf.quoteEur != null
                    ? <>Quote {eur(wf.quoteEur)} → engine entitlement {eur(wf.entitlementEur)} (gap {eur(wf.totalGapEur)})</>
                    : <>Engine entitlement {eur(wf.entitlementEur)} — no quote supplied, commercial step not evaluated</>}
                </div>

                {/* The audit trail: every step's engine basis, verbatim. */}
                <details className="group">
                  <summary className="cursor-pointer text-xs text-slate-400 hover:text-white select-none flex items-center gap-1">
                    <ChevronRight size={12} className="transition-transform group-open:rotate-90" /> Engine basis per step
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-500 text-2xs border-b border-white/10">
                          <th className="text-left py-2 pr-3 font-medium">Step</th>
                          <th className="text-right py-2 pr-3 font-medium">From</th>
                          <th className="text-right py-2 pr-3 font-medium">To</th>
                          <th className="text-left py-2 font-medium">Engine basis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wf.steps.map(s => (
                          <tr key={s.id} className="dfm-row-hover border-b border-white/5 align-top">
                            <td className="py-2 pr-3 text-white whitespace-nowrap text-xs"><span className="text-teal-500/80 dfm-num mr-1">{s.id}</span>{s.name}</td>
                            {s.skipped ? (
                              <td colSpan={2} className="py-2 pr-3 text-slate-500 text-xs italic text-center">not evaluated</td>
                            ) : (
                              <>
                                <td className="py-2 pr-3 text-right dfm-num text-slate-300 text-xs">{eur(s.fromEur)}</td>
                                <td className="py-2 pr-3 text-right dfm-num text-slate-300 text-xs">{eur(s.toEur)}</td>
                              </>
                            )}
                            <td className="py-2 text-slate-500 text-xs max-w-lg">{s.skipped ? s.reason : s.basis}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </motion.div>

              {/* What-if cockpit: live engine re-runs, deltas vs the dossier baseline */}
              <motion.div variants={m.panel} className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <div className="dfm-label text-slate-500 mb-1">What-if · Volume /yr</div>
                      <select className="dfm-select" aria-label="What-if annual volume" value={wiVolume || String(annualVolume)} onChange={e => setWiVolume(e.target.value)}>
                        {[...new Set([Number(annualVolume), 10000, 25000, 50000, 100000, 250000, 500000, 1000000])].sort((a, b) => a - b).map(v => (
                          <option key={v} value={v}>{v.toLocaleString()}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="dfm-label text-slate-500 mb-1">Region</div>
                      <select className="dfm-select" aria-label="What-if region" value={wiRegion || region} onChange={e => setWiRegion(e.target.value)}>
                        {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="dfm-label text-slate-500 mb-1">Tolerance</div>
                      <select className="dfm-select" aria-label="What-if tolerance class" value={wiTol} onChange={e => setWiTol(e.target.value)}>
                        {['standard', 'tight', 'precision'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="dfm-label text-slate-500 mb-1">Finish</div>
                      <select className="dfm-select" aria-label="What-if surface finish" value={wiFin} onChange={e => setWiFin(e.target.value)}>
                        {['standard', 'fine', 'polished'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="text-right min-w-[170px]">
                    <div className="dfm-label text-slate-500 mb-1">Engine total at these settings</div>
                    <div className="dfm-kpi-value text-white" style={{ fontSize: 26 }}>
                      {wiBusy ? <Loader2 size={18} className="animate-spin inline text-slate-500" /> : wiTotal != null ? <TickNumber value={wiTotal} decimals={2} prefix="€" /> : '—'}
                    </div>
                    {wiTotal != null && !wiBusy && (
                      <div className={`dfm-num text-xs mt-0.5 ${wiTotal <= dossier.engineTotalEur ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {wiTotal <= dossier.engineTotalEur ? '−' : '+'}€{Math.abs(wiTotal - dossier.engineTotalEur).toFixed(2)} vs dossier baseline
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-2xs text-slate-500 mt-3">Live deterministic re-run of the as-specified engine total — same math as the dossier. The full waterfall (process &amp; quote steps) recomputes when you rebuild the dossier.</p>
              </motion.div>

              {/* Forensics */}
              {dossier.forensics?.rows?.length ? (
                <motion.div variants={m.panel} className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck size={15} className="text-teal-400" />
                    <h2 className="text-white font-semibold text-sm">Quote forensics — line by line</h2>
                  </div>
                  <motion.div variants={m.stagger(0.1)} initial="hidden" animate="show" className="space-y-2.5">
                    {dossier.forensics.rows.map((r, i) => {
                      const tone = r.verdict === 'above-model' ? 'text-gold-400'
                        : r.verdict === 'below-model' ? 'text-emerald-400'
                        : r.verdict === 'in-band' ? 'text-slate-300' : 'text-slate-500';
                      const spine = r.verdict === 'above-model' ? 'text-gold-400'
                        : r.verdict === 'below-model' ? 'text-emerald-400'
                        : r.verdict === 'in-band' ? 'text-teal-400' : 'text-slate-500';
                      // Ratio bar: 1.0 = engine parity at the midline; capped at 2×.
                      const ratio = r.ratio != null ? Math.min(2, Math.max(0, r.ratio)) : null;
                      return (
                        <motion.div key={i} variants={m.slideIn}
                          className={`dfm-spine dfm-row-hover rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 ${spine}`}>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-[160px] flex-1">
                              <div className="text-sm text-white">{r.label}</div>
                              <div className="text-2xs text-slate-500 uppercase tracking-wider">{r.kind}</div>
                            </div>
                            <div className="dfm-num text-xs text-slate-300 text-right w-20">{eur(r.quoteEur)}</div>
                            <div className="dfm-num text-xs text-slate-500 text-right w-20">{r.engineEur != null ? eur(r.engineEur) : '—'}</div>
                            <div className="w-32 hidden sm:block">
                              {ratio != null ? (
                                <div className="dfm-bar relative" title={`quote is ${(r.ratio! * 100).toFixed(0)}% of the engine bucket`}>
                                  <motion.span
                                    className={`${r.verdict === 'above-model' ? 'bg-gold-400/80' : r.verdict === 'below-model' ? 'bg-emerald-400/80' : 'bg-teal-400/80'}`}
                                    initial={{ width: 0 }} animate={{ width: `${(ratio / 2) * 100}%` }}
                                    transition={m.t(0.4, 0.1 + i * 0.05)}
                                  />
                                  <span className="absolute left-1/2 top-[-2px] bottom-[-2px] w-px bg-white/30" aria-hidden="true" />
                                </div>
                              ) : <div className="text-2xs text-slate-500 text-center">unmapped</div>}
                            </div>
                            <span className={`px-2 py-0.5 rounded-md border text-2xs font-medium whitespace-nowrap border-current/25 bg-current/10 ${tone}`}>
                              {r.verdict}
                            </span>
                          </div>
                          <div className="text-2xs text-slate-500 mt-1.5">{r.basis}</div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                  {dossier.forensics.caveat && <p className="text-2xs text-slate-500 mt-3">{dossier.forensics.caveat}</p>}
                </motion.div>
              ) : null}

              {/* Counter positions: the forensics as a supplier-ready sheet */}
              {dossier.counter?.rows?.length ? (
                <motion.div variants={m.panel} className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-gold-400" />
                      <h2 className="text-white font-semibold text-sm">Counter positions</h2>
                      <span className="dfm-num text-xs text-gold-400 font-semibold">total ask €{dossier.counter.totalAskEur.toFixed(2)}/part</span>
                    </div>
                    <motion.button {...m.press} onClick={copyCounterSheet}
                      className="dfm-lift bg-white/[0.06] hover:bg-white/10 text-white text-xs rounded-lg px-3 py-1.5 border border-white/10">
                      Copy as supplier sheet
                    </motion.button>
                  </div>
                  <div className="space-y-2">
                    {dossier.counter.rows.map((r, i) => (
                      <div key={i} className="dfm-row-hover rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="text-white min-w-[120px] flex-1">{r.label}</span>
                          <span className="dfm-num text-slate-400 w-20 text-right">quoted €{r.quotedEur.toFixed(2)}</span>
                          <span className={`dfm-num w-24 text-right ${r.targetEur != null ? 'text-teal-300' : 'text-slate-500 italic'}`}>{r.targetEur != null ? `target €${r.targetEur.toFixed(2)}` : 'clarify'}</span>
                          <span className={`dfm-num w-20 text-right font-semibold ${r.askEur ? 'text-gold-400' : 'text-slate-500'}`}>{r.askEur ? `−€${r.askEur.toFixed(2)}` : '—'}</span>
                        </div>
                        <p className="text-2xs text-slate-500 mt-1">{r.argument}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-2xs text-slate-500 mt-3">{dossier.counter.caveat}</p>
                </motion.div>
              ) : null}

              {/* Fleet memory: the organisation's own prior runs on similar shapes */}
              {(() => {
                const fleetSec = dossier.dossier.sections.find(sec => sec.id === 'fleet');
                if (!fleetSec?.present) return null;
                return (
                  <motion.div variants={m.panel} className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
                    <div className="flex items-center gap-2 mb-1">
                      <Box size={15} className="text-teal-400" />
                      <h2 className="text-white font-semibold text-sm">Fleet memory</h2>
                    </div>
                    <p className="text-slate-500 text-2xs mb-3">Outcomes from your own prior Prism runs on similar geometry — organisational memory, not an external benchmark.</p>
                    <div className="space-y-2">
                      {fleetSec.lines.slice(1).map(l => (
                        <div key={l.ref} className="text-xs text-slate-300 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                          <span className="dfm-num text-teal-500/80 mr-2">[{l.ref}]</span>{l.text}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })()}

              {/* Evidence + lenses + generate */}
              <motion.div variants={m.panel} className="dfm-panel dfm-spot p-5" onMouseMove={spot}>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={15} className="text-gold-400" />
                  <h2 className="text-white font-semibold text-sm">Generate grounded ideas</h2>
                </div>
                <p className="text-slate-400 text-xs mb-4 max-w-3xl">
                  {dossier.dossier.evidenceCount} numbered evidence lines
                  {dossier.dossier.absent.length > 0 && <> · absent inputs stated honestly: {dossier.dossier.absent.join(', ')}</>}.
                  Each selected lens runs its own generation pass over its slice of the dossier; every idea must cite [E#]/[W#] lines and is engine-checked afterwards.
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {dossier.lensBlocks.map(l => {
                    const on = selectedLenses.has(l.lensId);
                    return (
                      <motion.button
                        key={l.lensId}
                        {...m.press}
                        aria-pressed={on}
                        onClick={() => setSelectedLenses(prev => {
                          const next = new Set(prev);
                          if (next.has(l.lensId)) next.delete(l.lensId); else next.add(l.lensId);
                          return next;
                        })}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                          on ? 'bg-teal-500/15 text-teal-300 border-teal-500/35 shadow-[0_0_12px_-4px_rgb(45_212_191/0.5)]' : 'bg-white/[0.04] text-slate-500 border-white/10 hover:text-slate-300'}`}
                      >
                        {l.name}
                      </motion.button>
                    );
                  })}
                </div>
                <fieldset className="mb-3">
                  <legend className="text-sm text-slate-300 mb-1.5">Review of every idea before ranking</legend>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['critique', 'Critique pass', 'Four-persona expert panel + one repair, on the small model. Default.'],
                      ['full', 'Deep mode', 'Panel + pairwise tournament + flagship repairs (~3–5× tokens).'],
                      ['off', 'Off', 'Generate, validate, engine-check and rank only.'],
                    ] as const).map(([v, label, hint]) => (
                      <button
                        key={v} type="button" onClick={() => setDeepMode(v)} title={hint} aria-pressed={deepMode === v}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${deepMode === v ? 'bg-gold-500/15 border-gold-500/40 text-gold-300' : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/25'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <p className="text-2xs text-slate-500 mb-4">
                  Cost: {selectedLenses.size} generation call{selectedLenses.size === 1 ? '' : 's'}{deepMode === 'full' ? ' + deep-mode passes' : deepMode === 'critique' ? ' + a small-model critique pass' : ''} on your API key, typically 2–6 minutes.
                </p>
                {generating && (
                  <div className="mb-4">
                    <div className="dfm-photon h-0.5 rounded-full bg-white/5 mb-3" aria-hidden="true" />
                    {genLog.length > 0 && (
                      <div className="bg-navy-950/70 border border-white/[0.07] rounded-xl p-3 text-xs space-y-0 max-h-40 overflow-y-auto">
                        {genLog.map((line, i) => (
                          <LogLine key={`${i}-${line.slice(0, 24)}`} text={line} active={i === genLog.length - 1} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {error && <p className="text-danger-400 text-sm mb-3">{error}</p>}
                <div className="flex justify-between items-center">
                  <button onClick={() => setStep(2)} className="text-slate-400 hover:text-white text-sm flex items-center gap-1"><ChevronLeft size={15} /> Back</button>
                  <motion.button
                    {...m.press}
                    onClick={generate}
                    disabled={generating || selectedLenses.size === 0}
                    className="dfm-cta text-navy-950 disabled:text-slate-400 font-semibold rounded-xl px-6 py-2.5 text-sm flex items-center gap-2"
                  >
                    {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    {generating ? 'Generating through the lenses…' : `Generate through ${selectedLenses.size} lens${selectedLenses.size === 1 ? '' : 'es'}`}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>
    </div>
  );
}
