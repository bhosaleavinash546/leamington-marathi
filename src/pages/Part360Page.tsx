// Part 360 — one part interrogated from every angle, then ideas that close
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
  Orbit, Upload, FileText, Layers, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, AlertTriangle, Plus, Trash2, FileSearch, Sparkles,
  ShieldCheck, Gauge, Box, Ruler, Scale,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../hooks/useToast';
import { generateCostReductionIdeas, saveFullResult, ProgressEvent } from '../services/claude-service';
import { AnalysisConfig, AnalysisResult, PlantRegion } from '../types';
import { CURRENCIES, CURRENCY_SYMBOLS } from '../constants/costing';
import { useDfmMotion } from '../components/dfm/motion';
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
}
interface Waterfall {
  steps: WaterfallStep[]; entitlementEur: number; quoteEur: number | null;
  totalGapEur: number | null; basis: string; caution: string;
}
interface ForensicsRow {
  label: string; kind: string; quoteEur: number; engineEur: number | null;
  ratio: number | null; verdict: string; basis: string;
}
interface DossierResponse {
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
  const [deepMode, setDeepMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genLog, setGenLog] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Each stage starts at its top — otherwise a mid-page scroll position from
  // the previous stage leaves the new panel's heading under the sticky rail.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: m.reduced ? 'auto' : 'smooth' });
  }, [step]);   // eslint-disable-line react-hooks/exhaustive-deps

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
            featureNote: Array.isArray(g.featureTable) && g.featureTable.length
              ? g.featureTable.slice(0, 6).map((f: any) => `${f.count ?? 1}× ${f.kind}${f.diaMm ? ` ⌀${f.diaMm}` : ''}`).join(', ')
              : undefined,
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
        additionalContext: `Part 360 review of "${partName || 'the part'}" (${material}, ${processName}, ${weightKg} kg, ${Number(annualVolume).toLocaleString()}/yr, ${region}).`,
        deepMode,
        apiKey,
      };
      const sysName = 'Part 360';
      const subName = material;
      const { ideas, sources, resultId } = await generateCostReductionIdeas(
        config, sysName, subName, partName || 'Part', false, undefined,
        (ev: ProgressEvent) => { if (ev.message) setGenLog(prev => [...prev.slice(-14), ev.message as string]); },
        { partEvidence: { blocks } },
      );
      const result: AnalysisResult = {
        id: resultId,
        config: { ...config, apiKey: '' },
        ideas,
        sources: sources ?? [],
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
      saveFullResult(resultId, result, sysName, subName);
      navigate('/results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
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
                {/* The orbit: one satellite tracing the review's path around the
                    part. Decorative, slow, and absent under reduced motion. */}
                {!m.reduced && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-[-5px]"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 16, ease: 'linear' }}
                  >
                    <span className="absolute top-0 left-1/2 -ml-[2.5px] w-[5px] h-[5px] rounded-full bg-teal-300 shadow-[0_0_8px_2px_rgb(45_212_191/0.5)]" />
                  </motion.span>
                )}
                <span aria-hidden="true" className="absolute inset-[-5px] rounded-full border border-teal-500/20" />
                <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/15 border border-teal-500/25">
                  <Orbit size={28} className="text-teal-400" />
                </div>
              </div>
              <div className="min-w-0">
                <h1 className="dfm-display text-3xl sm:text-4xl">Part 360</h1>
                <p className="text-slate-400 text-sm mt-1 max-w-2xl">
                  3D model + 2D drawing + supplier quote → every engine measures the part →
                  an <span className="text-teal-300">entitlement waterfall</span> and line-by-line quote
                  forensics → ideas that must cite the measured evidence.
                </p>
              </div>
            </motion.div>
            <motion.div variants={m.rise} className="flex items-center gap-2 text-[11px] text-slate-500">
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
                  <p className="text-[11px] text-slate-500 flex items-start gap-1.5 pt-1">
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
                <p className="text-[11px] text-slate-500 mb-4">Each one unlocks more of the 360° — absence is stated, never guessed.</p>
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
                    <div className="text-[11px] text-slate-500 mt-1 pl-6">{cadFile ? 'Will be measured by the DFM engines and priced down every viable process route.' : 'Without it, the waterfall’s process step is honestly skipped ("geometry absent").'}</div>
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
                    <div className="text-[11px] text-slate-500 mt-1 pl-6">{drawingFile ? 'Tolerances and roughness prefill the costed specification — you confirm them.' : 'Without it, the spec defaults to standard and over-specification cannot be measured.'}</div>
                  </motion.button>
                  <p className="text-[11px] text-slate-600">The supplier quote comes at step 3 — form entry with optional PDF assist.</p>
                </div>
                <motion.button
                  {...m.press}
                  disabled={!inputsValid}
                  onClick={() => setStep(1)}
                  className="dfm-cta mt-4 w-full disabled:opacity-40 disabled:border disabled:border-white/10 text-navy-950 disabled:text-slate-500 font-semibold rounded-xl py-2.5 text-sm flex items-center justify-center gap-2"
                >
                  Continue to measurement <ChevronRight size={16} />
                </motion.button>
                {!inputsValid && <p className="text-[11px] text-slate-500 mt-2 text-center">Material, process, mass and volume are required — they drive every engine.</p>}
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
                      <div className="text-[11px] text-slate-500 mt-2">{material} · {processName} · {region}</div>
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
                  <div className="dfm-label text-slate-500 mb-2">Costed specification <span className="normal-case tracking-normal text-slate-600">(drawing prefill — confirm)</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="dfm-label text-slate-600 block mb-1">Tol. band (mm)</label>
                      <input className="dfm-input" aria-label="Tightest tolerance band in millimetres" type="number" step="0.01" min="0" value={tightestTolMm} onChange={e => setTightestTolMm(e.target.value)} placeholder="none read" />
                    </div>
                    <div>
                      <label className="dfm-label text-slate-600 block mb-1">Finest Ra (µm)</label>
                      <input className="dfm-input" aria-label="Finest surface roughness Ra in micrometres" type="number" step="0.1" min="0" value={roughnessRaUm} onChange={e => setRoughnessRaUm(e.target.value)} placeholder="none read" />
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-2">
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
                      {massDiverges && (
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
                  {quoteLines.length === 0 && <p className="text-[11px] text-slate-600">No lines — forensics will be skipped and the dossier will say so.</p>}
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

              {/* Waterfall — the bars ARE the engine numbers */}
              <motion.div variants={m.panel} className="dfm-panel dfm-framed dfm-spot p-5 relative overflow-hidden" onMouseMove={spot}>
                <div className="dfm-scan" style={{ '--scan-h': '340px' } as React.CSSProperties} aria-hidden="true" />
                <div className="flex items-center gap-2 mb-1">
                  <Layers size={15} className="text-gold-400" />
                  <h2 className="text-white font-semibold text-sm">Cost entitlement waterfall</h2>
                </div>
                <p className="text-slate-500 text-[11px] mb-5 max-w-3xl">{wf.caution}</p>

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
                          className="h-[18px] rounded-md border border-white/[0.06] text-[10px] text-slate-500 italic flex items-center px-2"
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
                      <div className={`dfm-num text-xs font-semibold text-right ${s.skipped ? 'text-slate-600' : s.deltaEur > 0 ? 'text-gold-400' : 'text-slate-400'}`}>
                        {s.skipped ? '—' : <>
                          {Math.abs(s.deltaEur) < 0.005 ? '' : s.deltaEur < 0 ? '+' : '−'}<TickNumber value={Math.abs(s.deltaEur)} decimals={2} prefix="€" delay={m.beat(i + 1)} />
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
                        <tr className="text-slate-500 text-[11px] border-b border-white/10">
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
                        : r.verdict === 'in-band' ? 'text-teal-400' : 'text-slate-600';
                      // Ratio bar: 1.0 = engine parity at the midline; capped at 2×.
                      const ratio = r.ratio != null ? Math.min(2, Math.max(0, r.ratio)) : null;
                      return (
                        <motion.div key={i} variants={m.slideIn}
                          className={`dfm-spine dfm-row-hover rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 ${spine}`}>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-[160px] flex-1">
                              <div className="text-sm text-white">{r.label}</div>
                              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{r.kind}</div>
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
                              ) : <div className="text-[10px] text-slate-600 text-center">unmapped</div>}
                            </div>
                            <span className={`px-2 py-0.5 rounded-md border text-[11px] font-medium whitespace-nowrap border-current/25 bg-current/10 ${tone}`}>
                              {r.verdict}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1.5">{r.basis}</div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                  {dossier.forensics.caveat && <p className="text-[11px] text-slate-500 mt-3">{dossier.forensics.caveat}</p>}
                </motion.div>
              ) : null}

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
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer mb-3">
                  <input type="checkbox" checked={deepMode} onChange={e => setDeepMode(e.target.checked)} className="accent-gold-500" />
                  Deep mode — adversarial critique panel + tournament (~3–5× tokens)
                </label>
                <p className="text-[11px] text-slate-500 mb-4">
                  Cost: {selectedLenses.size} generation call{selectedLenses.size === 1 ? '' : 's'}{deepMode ? ' + deep-mode passes' : ''} on your API key, typically 2–6 minutes.
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
      </div>
    </div>
  );
}
