// Part 360 — one part interrogated from every angle, then ideas that close
// MEASURED gaps. Staged wizard: (1) part + files, (2) engine measurement,
// (3) supplier quote + forensics, (4) evidence dossier → multi-lens grounded
// generation through the standard /api/analyze pipeline → ResultsPage.
//
// House rule everywhere on this page: math for numbers, LLM for judgment.
// Every figure shown is engine output recomputed server-side; the only AI
// steps are the optional quote-PDF prefill (confirm-before-use) and the final
// idea generation, which must cite the dossier's [E#]/[W#] evidence lines.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Orbit, Upload, FileText, Calculator, Layers, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, AlertTriangle, Plus, Trash2, FileSearch, Sparkles,
  ShieldCheck, Gauge,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from '../hooks/useToast';
import { generateCostReductionIdeas, saveFullResult, ProgressEvent } from '../services/claude-service';
import { AnalysisConfig, AnalysisResult, PlantRegion } from '../types';
import { CURRENCIES, CURRENCY_SYMBOLS } from '../constants/costing';

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

async function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(f);
  });
}

export default function Part360Page() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const apiKey = localStorage.getItem('brainspark_api_key') || '';

  // ── Wizard position ────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const STEPS = ['Part & files', 'Engine measurement', 'Supplier quote', 'Evidence & generate'];

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

  useEffect(() => {
    fetch('/api/should-cost/catalogue')
      .then(r => r.json())
      .then(d => {
        setCatalogue({ materials: d.materials ?? [], processes: d.processes ?? [] });
        if (d.materials?.length) setMaterial((m: string) => m || d.materials[0]);
        if (d.processes?.length) setProcessName((p: string) => p || d.processes[0]);
      })
      .catch(() => setCatalogue({ materials: [], processes: [] }));
  }, []);

  const inputsValid = material && processName && Number(weightKg) > 0 && Number(annualVolume) > 0;

  // ── Step 2: run every measurement the inputs allow ────────────────────────
  async function runMeasurements() {
    setMeasuring(true); setMeasureError(''); setMeasureLog([]);
    const log = (m: string) => setMeasureLog(prev => [...prev, m]);
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
        log(`Drawing read: ${dims.length} dimensions, ${toleranced.length} toleranced${tightest != null ? `, tightest ±${(tightest / 2).toFixed(3)} mm band ${tightest}` : ''}. Confirm the spec fields below.`);
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
      log(`Engine should-cost: ${scd.symbol}${scd.totalShouldCost} / unit.`);

      // DFM geometry measurement (SSE) — only when a 3D model was supplied.
      if (cadFile && !dfmResult) {
        log('Measuring the 3D model (DFM engines)…');
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
        if (!r.ok || !r.body) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || 'DFM analysis failed');
        }
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
            if (ev.type === 'stage' && ev.label) log(`  ${ev.label}`);
            else if (ev.type === 'result' && ev.result) {
              setDfmResult(ev.result);
              const best = ev.result.results?.[0];
              log(`DFM measured: ${best ? `${best.processName} score ${best.score ?? 'n/a'}, ${best.findings.length} findings` : 'no rateable process'}.`);
            } else if (ev.type === 'error') throw new Error(ev.error || 'DFM analysis failed');
          }
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

  // ── Shared bits ───────────────────────────────────────────────────────────
  const inputCls = 'w-full bg-navy-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50';
  const labelCls = 'block text-slate-400 text-xs mb-1';
  const cardCls = 'bg-navy-900 border border-white/10 rounded-2xl p-5';
  const sym = CURRENCY_SYMBOLS[quoteCurrency] || '€';

  const stepper = (
    <div className="flex items-center justify-center gap-2 mb-8 flex-wrap">
      {STEPS.map((s, i) => (
        <button
          key={s}
          onClick={() => { if (i < step) setStep(i); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
            i === step ? 'bg-gold-500/15 text-gold-400 border-gold-500/30'
            : i < step ? 'bg-teal-500/10 text-teal-400 border-teal-500/25 cursor-pointer'
            : 'bg-white/5 text-slate-500 border-white/10 cursor-default'}`}
        >
          {i < step ? <CheckCircle2 size={12} /> : <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[10px]">{i + 1}</span>}
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/15 border border-teal-500/25 mb-4">
            <Orbit size={28} className="text-teal-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Part 360</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
            3D model + 2D drawing + supplier quote → every BrainSpark engine measures the part →
            an <span className="text-teal-300">entitlement waterfall</span> and per-line quote forensics →
            ideas that must cite the measured evidence. <span className="text-teal-300">No AI in the numbers.</span>
          </p>
        </div>

        {stepper}

        {/* ── STEP 1: part & files ─────────────────────────────────────────── */}
        {step === 0 && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className={cardCls}>
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2"><Calculator size={16} className="text-teal-400" /> The part</h2>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Part name</label>
                  <input aria-label="Part name" className={inputCls} value={partName} onChange={e => setPartName(e.target.value)} placeholder="e.g. Bracket, seat crossmember" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Material</label>
                    <select aria-label="Material" className={inputCls} value={material} onChange={e => setMaterial(e.target.value)}>
                      {(catalogue?.materials ?? []).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Manufacturing process</label>
                    <select aria-label="Manufacturing process" className={inputCls} value={processName} onChange={e => setProcessName(e.target.value)}>
                      {(catalogue?.processes ?? []).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Finished mass (kg)</label>
                    <input aria-label="Finished mass in kilograms" className={inputCls} type="number" min="0" step="0.001" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="0.50" />
                  </div>
                  <div>
                    <label className={labelCls}>Annual volume</label>
                    <input aria-label="Annual volume" className={inputCls} type="number" min="1" value={annualVolume} onChange={e => setAnnualVolume(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Region</label>
                    <select aria-label="Region" className={inputCls} value={region} onChange={e => setRegion(e.target.value)}>
                      {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className={cardCls}>
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2"><Upload size={16} className="text-teal-400" /> Files <span className="text-slate-500 text-xs font-normal">(each one unlocks more of the 360°)</span></h2>
              <div className="space-y-3">
                <input ref={cadInputRef} type="file" accept=".step,.stp,.stl,.igs,.iges" className="hidden"
                  onChange={e => { setCadFile(e.target.files?.[0] ?? null); setDfmResult(null); }} />
                <button onClick={() => cadInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-xl p-4 text-left transition-colors ${cadFile ? 'border-teal-500/40 bg-teal-500/5' : 'border-white/20 hover:border-white/40'}`}>
                  <div className="text-sm text-white font-medium">{cadFile ? cadFile.name : '3D model (STEP / STL) — optional'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{cadFile ? 'Will be measured by the DFM engines and priced down every viable process route.' : 'Without it, the waterfall’s process step is honestly skipped ("geometry absent").'}</div>
                </button>
                <input ref={drawingInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
                  onChange={e => { setDrawingFile(e.target.files?.[0] ?? null); setDrawingRead(null); }} />
                <button onClick={() => drawingInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-xl p-4 text-left transition-colors ${drawingFile ? 'border-teal-500/40 bg-teal-500/5' : 'border-white/20 hover:border-white/40'}`}>
                  <div className="text-sm text-white font-medium">{drawingFile ? drawingFile.name : '2D drawing (PDF / image) — optional'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{drawingFile ? 'Tolerances and roughness prefill the costed specification — you confirm them.' : 'Without it, the spec defaults to standard and over-specification cannot be measured.'}</div>
                </button>
                <p className="text-xs text-slate-500">The supplier quote comes at step 3 — form entry with optional PDF assist.</p>
              </div>
              <button
                disabled={!inputsValid}
                onClick={() => setStep(1)}
                className="mt-4 w-full bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-950 font-semibold rounded-lg py-2.5 text-sm flex items-center justify-center gap-2"
              >
                Continue to measurement <ChevronRight size={16} />
              </button>
              {!inputsValid && <p className="text-xs text-slate-500 mt-2 text-center">Material, process, mass and volume are required — they drive every engine.</p>}
            </div>
          </div>
        )}

        {/* ── STEP 2: engine measurement ───────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className={cardCls}>
              <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><Gauge size={16} className="text-teal-400" /> Deterministic measurement</h2>
              <p className="text-slate-400 text-sm mb-4">
                Runs the should-cost engine{cadFile ? ', the DFM geometry engines' : ''}{drawingFile ? ' and the drawing reader' : ''}.
                Engine math only — the one AI step (drawing OCR) is prefill you confirm below.
              </p>
              <button
                onClick={runMeasurements}
                disabled={measuring}
                className="bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold rounded-lg px-5 py-2.5 text-sm flex items-center gap-2"
              >
                {measuring ? <Loader2 size={15} className="animate-spin" /> : <Gauge size={15} />}
                {measuring ? 'Measuring…' : shouldCost ? 'Re-run measurement' : 'Run measurement'}
              </button>
              {measureLog.length > 0 && (
                <div className="mt-4 bg-navy-950 border border-white/10 rounded-lg p-3 text-xs text-slate-400 space-y-1 max-h-48 overflow-y-auto font-mono">
                  {measureLog.map((m, i) => <div key={i}>{m}</div>)}
                </div>
              )}
              {measureError && <p className="text-danger-400 text-xs mt-3">{measureError}</p>}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className={cardCls}>
                <div className="text-slate-400 text-xs mb-1">Engine should-cost (as specified)</div>
                <div className="text-2xl font-black text-white tabular-nums">{shouldCost ? `${shouldCost.symbol}${shouldCost.totalShouldCost}` : '—'}</div>
                <div className="text-xs text-slate-500 mt-1">{shouldCost ? `${material} · ${processName} · ${region}` : 'Run measurement first.'}</div>
              </div>
              <div className={cardCls}>
                <div className="text-slate-400 text-xs mb-1">DFM measurement</div>
                {dfmResult?.results?.[0] ? (
                  <>
                    <div className="text-2xl font-black text-white tabular-nums">{dfmResult.results[0].score ?? '—'}<span className="text-sm text-slate-500 font-normal"> /100</span></div>
                    <div className="text-xs text-slate-500 mt-1">{dfmResult.results[0].findings.length} findings · {dfmResult.results[0].processName}</div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500 mt-2">{cadFile ? 'Run measurement.' : 'No 3D model — skipped, stated in the dossier.'}</div>
                )}
              </div>
              <div className={cardCls}>
                <div className="text-slate-400 text-xs mb-2">Costed specification <span className="text-slate-600">(drawing prefill — confirm)</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Tightest tol. band (mm)</label>
                    <input aria-label="Tightest tolerance band in millimetres" className={inputCls} type="number" step="0.01" min="0" value={tightestTolMm} onChange={e => setTightestTolMm(e.target.value)} placeholder="none read" />
                  </div>
                  <div>
                    <label className={labelCls}>Finest Ra (µm)</label>
                    <input aria-label="Finest surface roughness Ra in micrometres" className={inputCls} type="number" step="0.1" min="0" value={roughnessRaUm} onChange={e => setRoughnessRaUm(e.target.value)} placeholder="none read" />
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  {drawingRead ? `Read ${drawingRead.toleranced} toleranced of ${drawingRead.dims} dimensions.` : 'Blank = standard spec assumed, and the dossier says so.'}
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(0)} className="text-slate-400 hover:text-white text-sm flex items-center gap-1"><ChevronLeft size={15} /> Back</button>
              <button
                onClick={() => setStep(2)}
                disabled={!shouldCost}
                className="bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-950 font-semibold rounded-lg px-5 py-2.5 text-sm flex items-center gap-2"
              >
                Continue to quote <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: supplier quote ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div className={cardCls}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-white font-semibold mb-1 flex items-center gap-2"><FileText size={16} className="text-teal-400" /> Supplier quote <span className="text-slate-500 text-xs font-normal">(optional but powerful)</span></h2>
                  <p className="text-slate-400 text-sm">With a breakdown, every line is judged against its engine bucket, and the waterfall gets its commercial step.</p>
                </div>
                <div>
                  <input ref={quotePdfRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) extractQuote(f); e.currentTarget.value = ''; }} />
                  <button
                    onClick={() => quotePdfRef.current?.click()}
                    disabled={extracting}
                    className="bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-sm rounded-lg px-4 py-2 flex items-center gap-2 border border-white/10"
                  >
                    {extracting ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
                    {extracting ? 'Reading…' : 'PDF assist (prefill)'}
                  </button>
                </div>
              </div>
              {extractNote && (
                <div className="mt-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {extractNote}
                </div>
              )}
              <div className="grid md:grid-cols-3 gap-3 mt-4">
                <div>
                  <label className={labelCls}>Supplier</label>
                  <input aria-label="Supplier" className={inputCls} value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="optional" />
                </div>
                <div>
                  <label className={labelCls}>Currency</label>
                  <select aria-label="Quote currency" className={inputCls} value={quoteCurrency} onChange={e => setQuoteCurrency(e.target.value)}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Quoted piece price ({sym})</label>
                  <input aria-label="Quoted piece price" className={inputCls} type="number" min="0" step="0.01" value={quoteTotal} onChange={e => setQuoteTotal(e.target.value)} placeholder="0.00" />
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-slate-400 text-xs">Breakdown lines ({sym} each)</label>
                  <button onClick={() => setQuoteLines(prev => [...prev, { label: '', kind: 'other', amount: '' }])}
                    className="text-teal-400 hover:text-teal-300 text-xs flex items-center gap-1"><Plus size={12} /> Add line</button>
                </div>
                {quoteLines.length === 0 && <p className="text-xs text-slate-600">No lines — forensics will be skipped and the dossier will say so.</p>}
                <div className="space-y-2">
                  {quoteLines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_140px_110px_32px] gap-2 items-center">
                      <input aria-label={`Line ${i + 1} label`} className={inputCls} value={l.label} placeholder="e.g. Raw material" onChange={e => setQuoteLines(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                      <select aria-label={`Line ${i + 1} kind`} className={inputCls} value={l.kind} onChange={e => setQuoteLines(prev => prev.map((x, j) => j === i ? { ...x, kind: e.target.value as QuoteKind } : x))}>
                        {QUOTE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <input aria-label={`Line ${i + 1} amount`} className={inputCls} type="number" min="0" step="0.01" value={l.amount} placeholder="0.00" onChange={e => setQuoteLines(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                      <button onClick={() => setQuoteLines(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} className="text-slate-500 hover:text-danger-400"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
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
              <button
                onClick={buildDossier}
                disabled={building}
                className="bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold rounded-lg px-5 py-2.5 text-sm flex items-center gap-2"
              >
                {building ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
                {building ? 'Computing dossier…' : `Build the evidence dossier${Number(quoteTotal) > 0 ? '' : ' (no quote)'}`}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: dossier + generate ───────────────────────────────────── */}
        {step === 3 && dossier && (
          <div className="space-y-6">
            {/* Waterfall */}
            <div className={cardCls}>
              <h2 className="text-white font-semibold mb-1 flex items-center gap-2"><Layers size={16} className="text-teal-400" /> Cost entitlement waterfall</h2>
              <p className="text-slate-500 text-xs mb-4">{dossier.waterfall.caution}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-white/10">
                      <th className="text-left py-2 pr-3 font-medium">Step</th>
                      <th className="text-left py-2 pr-3 font-medium">Premium</th>
                      <th className="text-right py-2 pr-3 font-medium">From</th>
                      <th className="text-right py-2 pr-3 font-medium">To</th>
                      <th className="text-right py-2 pr-3 font-medium">Delta</th>
                      <th className="text-left py-2 font-medium">Engine basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.waterfall.steps.map(s => (
                      <tr key={s.id} className="border-b border-white/5 align-top">
                        <td className="py-2 pr-3 text-teal-400 font-mono text-xs">{s.id}</td>
                        <td className="py-2 pr-3 text-white whitespace-nowrap">{s.name}</td>
                        {s.skipped ? (
                          <td colSpan={3} className="py-2 pr-3 text-slate-500 text-xs italic text-center">not evaluated — {s.reason}</td>
                        ) : (
                          <>
                            <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{eur(s.fromEur)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{eur(s.toEur)}</td>
                            <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${s.deltaEur > 0 ? 'text-gold-400' : 'text-slate-400'}`}>{s.deltaEur >= 0 ? '' : '−'}{eur(Math.abs(s.deltaEur)).slice(0)}</td>
                          </>
                        )}
                        <td className="py-2 text-slate-500 text-xs max-w-md">{s.basis || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-sm font-semibold text-gold-400">
                {dossier.waterfall.quoteEur != null
                  ? <>Quote {eur(dossier.waterfall.quoteEur)} → engine entitlement {eur(dossier.waterfall.entitlementEur)} (gap {eur(dossier.waterfall.totalGapEur)})</>
                  : <>Engine entitlement {eur(dossier.waterfall.entitlementEur)} — no quote supplied, commercial step not evaluated</>}
              </div>
            </div>

            {/* Forensics */}
            {dossier.forensics?.rows?.length ? (
              <div className={cardCls}>
                <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><ShieldCheck size={16} className="text-teal-400" /> Quote forensics — line by line</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 text-xs border-b border-white/10">
                        <th className="text-left py-2 pr-3 font-medium">Supplier line</th>
                        <th className="text-left py-2 pr-3 font-medium">Kind</th>
                        <th className="text-right py-2 pr-3 font-medium">Quoted</th>
                        <th className="text-right py-2 pr-3 font-medium">Engine</th>
                        <th className="text-left py-2 pr-3 font-medium">Verdict</th>
                        <th className="text-left py-2 font-medium">Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dossier.forensics.rows.map((r, i) => (
                        <tr key={i} className="border-b border-white/5 align-top">
                          <td className="py-2 pr-3 text-white">{r.label}</td>
                          <td className="py-2 pr-3 text-slate-400 text-xs">{r.kind}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{eur(r.quoteEur)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-slate-300">{r.engineEur != null ? eur(r.engineEur) : '—'}</td>
                          <td className="py-2 pr-3">
                            <span className={`px-1.5 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap ${
                              r.verdict === 'above-model' ? 'bg-gold-500/10 text-gold-400 border-gold-500/25'
                              : r.verdict === 'below-model' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                              : r.verdict === 'in-band' ? 'bg-white/5 text-slate-300 border-white/10'
                              : 'bg-slate-500/10 text-slate-400 border-slate-500/25'}`}>{r.verdict}</span>
                          </td>
                          <td className="py-2 text-slate-500 text-xs max-w-md">{r.basis}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dossier.forensics.caveat && <p className="text-xs text-slate-500 mt-2">{dossier.forensics.caveat}</p>}
              </div>
            ) : null}

            {/* Evidence + lenses + generate */}
            <div className={cardCls}>
              <h2 className="text-white font-semibold mb-1 flex items-center gap-2"><Sparkles size={16} className="text-gold-400" /> Generate grounded ideas</h2>
              <p className="text-slate-400 text-sm mb-4">
                {dossier.dossier.evidenceCount} numbered evidence lines
                {dossier.dossier.absent.length > 0 && <> · absent inputs stated honestly: {dossier.dossier.absent.join(', ')}</>}.
                Each selected lens runs its own generation pass over its slice of the dossier; every idea must cite [E#]/[W#] lines and is engine-checked afterwards.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {dossier.lensBlocks.map(l => (
                  <button
                    key={l.lensId}
                    onClick={() => setSelectedLenses(prev => {
                      const next = new Set(prev);
                      if (next.has(l.lensId)) next.delete(l.lensId); else next.add(l.lensId);
                      return next;
                    })}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                      selectedLenses.has(l.lensId) ? 'bg-teal-500/15 text-teal-300 border-teal-500/30' : 'bg-white/5 text-slate-500 border-white/10'}`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer mb-4">
                <input type="checkbox" checked={deepMode} onChange={e => setDeepMode(e.target.checked)} className="accent-gold-500" />
                Deep mode — adversarial critique panel + tournament (~3–5× tokens)
              </label>
              <p className="text-xs text-slate-500 mb-4">
                Cost: {selectedLenses.size} generation call{selectedLenses.size === 1 ? '' : 's'}{deepMode ? ' + deep-mode passes' : ''} on your API key, typically 2–6 minutes.
              </p>
              {generating && genLog.length > 0 && (
                <div className="mb-4 bg-navy-950 border border-white/10 rounded-lg p-3 text-xs text-slate-400 space-y-1 max-h-40 overflow-y-auto font-mono">
                  {genLog.map((m, i) => <div key={i}>{m}</div>)}
                </div>
              )}
              {error && <p className="text-danger-400 text-sm mb-3">{error}</p>}
              <div className="flex justify-between items-center">
                <button onClick={() => setStep(2)} className="text-slate-400 hover:text-white text-sm flex items-center gap-1"><ChevronLeft size={15} /> Back</button>
                <button
                  onClick={generate}
                  disabled={generating || selectedLenses.size === 0}
                  className="bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold rounded-lg px-6 py-2.5 text-sm flex items-center gap-2"
                >
                  {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {generating ? 'Generating through the lenses…' : `Generate through ${selectedLenses.size} lens${selectedLenses.size === 1 ? '' : 'es'}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
