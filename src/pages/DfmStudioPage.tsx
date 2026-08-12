import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, ShieldCheck, AlertTriangle, HelpCircle, FileDown, Table2,
  Ruler, Layers, Boxes, Info, CheckCircle2, MinusCircle, ChevronRight,
  FileText, Crosshair, Gauge,
} from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import CadViewer3D, { type CadViewerRef } from '../components/CadViewer3D';
import type { DfmFigure } from '../services/dfm-report';
import { selectFindingAnnotations, chooseSecondView, sectionCandidate } from '../services/dfm-annotations.mjs';
import { diffAnalyses, comparability } from '../services/dfm-diff.mjs';
import { useAuth } from '../contexts/AuthContext';
// ── The studio's own material and motion ────────────────────────────────────
// Precision-instrument identity: graph-paper ground, drawing-frame ticks, a
// swept gauge. Everything decorative sits behind prefers-reduced-motion in
// dfm.css, matching the convention foresight.css and innovation.css set.
import './dfm.css';
import { useDfmMotion, scoreTone, TONE_TEXT, TONE_LABEL } from '../components/dfm/motion';
import Panel from '../components/dfm/Panel';
import ScoreRing from '../components/dfm/ScoreRing';
import TickNumber from '../components/dfm/TickNumber';
import StepRail, { type RailStep } from '../components/dfm/StepRail';
import SectionNav, { type NavSection } from '../components/dfm/SectionNav';
import { useSpotlight } from '../components/dfm/useSpotlight';

// DFM / DFA Studio. Upload a STEP or IGES part and get a manufacturability
// analysis measured from the geometry, plus an assembly analysis when the file
// carries more than one solid.
//
// The page's job is to keep the honesty of the engines visible. Three things it
// must never do: show a score without its coverage, list findings without the
// rules that could NOT be checked, or print a cost figure the engines did not
// compute. Each has its own visible treatment below.

interface Finding {
  id: string; title: string; severity: 'high' | 'medium' | 'low';
  measure: string; measured?: number; unit: string; thresholdText: string;
  rationale: string; fix: string; source: string; sourceStatus?: string; status: string; reason?: string;
  /** Where the MEASURED side came from: model PMI, the 2D drawing, or typed. */
  measuredBasis?: string;
  cost?: {
    priced: boolean; basis?: string; changeDescription?: string;
    asDrawnEur?: number; improvedEur?: number; deltaEur?: number; annualDeltaEur?: number;
    reason?: string; externalGuideline?: string; upperBound?: boolean; caveat?: string;
  };
}
interface ProcessResult {
  process: string; processName: string;
  findings: Finding[]; passed: Finding[]; notEvaluated: Finding[];
  ruleCount: number; evaluatedCount: number; coveragePct: number; score: number | null;
  impact?: { pricedCount: number; unpricedCount: number; perPartEur: number; annualEur: number; caveat: string | null };
}
interface DfmResponse {
  partName?: string;
  geometry?: Record<string, any>;
  dfm?: Record<string, any>;
  results: ProcessResult[];
  processFamily?: string | null;
  processFamilyBasis?: string;
  /** What the geometry itself measures the process to be. */
  measuredProcess?: {
    family: string | null;
    confidence: 'measured' | 'indicative' | null;
    evidence: string[];
    notes: string[];
  } | null;
  material?: string | null;
  processConflict?: { chosenName: string; measuredName: string; evidence: string[] } | null;
  routes?: {
    routes: RouteRow[]; skipped: Array<{ process: string; reason: string }>; basis: string;
    /** The route the user chose, so the table can mark it rather than reading as a survey. */
    chosenProcess?: string | null;
  } | null;
  analysisLimits?: AnalysisLimit[];
  /** Rule-catalogue provenance, counted server-side. */
  catalogue?: { total: number; byGrade: Record<string, number> } | null;
  /** When the server finished this analysis — also the key for the arrival scan. */
  analysedAt?: string;
  /** The 2D drawing's side of the story, when one was uploaded. */
  drawing?: DrawingData | null;
  drawingCheck?: DrawingCheck | null;
  drawingApplied?: string[] | null;
  modelPmi?: Record<string, any> | null;
}
interface RouteRow {
  process: string; dfmFamily: string | null; dfmFamilyName: string | null;
  score: number | null; coveragePct: number; ruleCount: number; evaluatedCount: number;
  findingCount: number; highSeverityCount: number; scoreCaveat: string | null;
  topFindings?: Array<{ title: string; severity: string; measured?: number; thresholdText: string }>;
  piecePriceEur: number | null; toolingEur: number | null; annualEur: number | null;
  inputMassKg: number | null; kgCo2e: number | null; cbamEur: number | null;
  costReason?: string; carbonReason?: string;
  isChosen?: boolean;
  deltaPieceEur?: number | null; deltaToolingEur?: number | null;
  /** False when a feasibility rule failed: the route cannot make this part at all. */
  viable?: boolean; blockedReason?: string | null;
}
interface AnalysisLimit { kind: string; severity: 'blocking' | 'warning'; message: string }
// ── The 2D drawing, as /api/dfm/drawing-extract returns it ──────────────────
interface DrawingDim {
  nominalMm: number; bandMm?: number; type: 'linear' | 'diameter' | 'radius' | 'angle';
  toleranced: boolean; sheet?: number; zone?: string; sourceText: string;
}
interface DrawingData {
  ok: boolean; units: 'mm' | 'inch' | 'unknown';
  dimensions: DrawingDim[];
  gdt: Array<{ symbol: string; toleranceMm?: number; datums: string[]; sourceText: string }>;
  roughness: Array<{ raUm?: number; raUin?: number; scope?: string; sourceText: string }>;
  titleBlock: { material?: string; generalToleranceNote?: string; drawingNumber?: string; revision?: string; title?: string };
  overall?: { widthMm?: number; heightMm?: number; thicknessMm?: number };
  notes: string[]; pageCount?: number; readability: string; conversions: string[];
}
interface DrawingCheckRow {
  nominalMm: number; bandMm?: number; type: string; sourceText: string;
  status: 'confirmed' | 'conflict' | 'not-found';
  candidate: { kind: string; valueMm: number; deltaMm: number } | null;
  note: string;
}
interface DrawingCheck {
  rows: DrawingCheckRow[];
  counts: { confirmed: number; conflict: number; notFound: number };
  unitsSuspect: boolean; basis: string;
}
interface RuleOverride { enabled: boolean; threshold?: number | number[]; note?: string }
interface CatalogueRule {
  id: string; process: string; severity: string; title: string; measure: string;
  threshold: number | number[] | string; unit: string; source: string; sourceStatus?: string;
}
interface BatchPart {
  fileName: string; partName: string; error?: string;
  score?: number | null; coveragePct?: number; findingCount?: number; highSeverityCount?: number;
  worstFinding?: string | null; measuredProcess?: string | null; processName?: string;
  weightKg?: number | null; wallP50Mm?: number | null; scoreReason?: string;
  bestRoute?: { process: string; piecePriceEur: number; score: number | null } | null;
}
interface BatchResponse { parts: BatchPart[]; basis: string; material: string | null }
interface DfaResponse {
  decomposition?: Record<string, any>;
  dfa?: Record<string, any>;
  analysisLimits?: AnalysisLimit[];
}

// MATERIALS and PROCESSES ARE NOT DECLARED HERE ANY MORE. This page used to
// carry a hand-typed ten-material, six-process subset of the tables in
// costing-engine.mjs, and the two drifted: four fifths of the material list was
// missing, "Gravity Die Casting" was routed to the high-pressure die-casting
// rules (a 1.0-3.5 mm wall band against gravity's 3-8) and "Sand Casting" was
// routed to nothing at all. Both lists now come from GET /api/dfm/options, which
// derives them from the cost model's own tables, so there is one list rather
// than two that agree until someone edits one of them.
interface ProcessOption {
  /** The KEY the analysis is submitted with — never shown to a user. */
  name: string;
  /** What the menu shows, acronym first: "HPDC — High-pressure die casting". */
  label: string;
  /** Commodity heading this option sorts under. */
  group: string;
  /** Other words somebody might type looking for it. */
  aliases: string[];
  dfmFamily: string | null;
  dfmFamilyName: string | null;
  noDfmReason: string | null;
}
interface DfmOptions {
  materialFamilies: Array<{ family: string; label: string; grades: string[] }>;
  processesForMaterial: Record<string, ProcessOption[]>;
  allProcesses: ProcessOption[];
}

const REGIONS = ['Germany', 'UK', 'Czech Republic', 'Spain', 'Mexico', 'USA', 'China', 'India'];

/** Pinned draw directions. Blank means "sweep for the best one". */
const DRAW_AXES: Record<string, [number, number, number]> = {
  x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1],
};

type DfaQuestion = 'moves' | 'differentMaterial' | 'mustSeparate';
/** Boothroyd's three questions. Geometry proposes them; only a human can answer.
 *  Without this UI the engine never received answers, so the DFA index and the
 *  consolidation list were withheld for every user on every part. */
const DFA_QUESTIONS: { key: DfaQuestion; label: string; hint: string }[] = [
  { key: 'moves', label: 'Moves', hint: 'Does it move relative to parts already assembled?' },
  { key: 'differentMaterial', label: 'Material', hint: 'Must it be a different material for a fundamental reason?' },
  { key: 'mustSeparate', label: 'Separable', hint: 'Must it be separable for assembly or service?' },
];

// What a threshold actually rests on. 24 of the 26 rules are industry consensus:
// widely published, mutually consistent, and never checked against a primary
// standard or measured scrap data.
const SOURCE_GRADE: Record<string, string> = {
  'standard-named': 'Named standard, not read first-hand',
  'industry-consensus': 'Industry consensus — no primary source audited',
  'engine-derived': "This tool's own cost model",
};

/** Plain-English names for the engine's stage events. */
const STAGE_LABEL: Record<string, string> = {
  tessellate: 'Meshed the surface',
  wallThickness: 'Measured wall thickness',
  drawSweep: 'Swept candidate draw directions',
  features: 'Recognised features',
  sheetMetal: 'Checked for folded sheet',
};

/** The figure the engine actually measured in that stage — never a guess. */
function describeStage(s: any): string {
  if (s.status === 'skipped') return `skipped — ${s.reason}`;
  switch (s.stage) {
    case 'tessellate': return `${s.triangles?.toLocaleString?.() ?? s.triangles} triangles${s.truncated ? ' (budget hit)' : ''}`;
    case 'wallThickness': return s.p50Mm != null ? `${s.p50Mm} mm median, ${s.samples} rays` : 'not measurable';
    case 'drawSweep': return s.drawDirectionXYZ
      ? `[${s.drawDirectionXYZ.join(', ')}] · ${s.undercutAreaPct}% undercut${s.ambiguous ? ' · close call' : ''}`
      : '';
    case 'features': return Object.entries(s.counts ?? {}).map(([k, v]) => `${v}x ${k}`).join(', ') || 'none named';
    case 'sheetMetal': return s.isSheetMetal ? 'folded sheet' : 'not folded sheet';
    default: return '';
  }
}

const SEV_STYLE: Record<string, string> = {
  high: 'border-red-500/40 bg-red-500/10 text-red-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  low: 'border-teal-500/40 bg-teal-500/10 text-teal-300',
};

export default function DfmStudioPage() {
  const { token } = useAuth();
  // The page's motion vocabulary, already resolved against the reader's
  // reduced-motion preference — see components/dfm/motion.ts.
  const m = useDfmMotion();
  // The pointer-tracked light on every panel — see useSpotlight().
  const spot = useSpotlight();
  const inputRef = useRef<HTMLInputElement>(null);
  // Reaches into the viewer to paint finding layers and capture report figures.
  const viewerRef = useRef<CadViewerRef | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [material, setMaterial] = useState('');
  const [costProcess, setCostProcess] = useState('');
  const [options, setOptions] = useState<DfmOptions | null>(null);
  const [routeSort, setRouteSort] = useState<'piecePriceEur' | 'score' | 'kgCo2e' | 'toolingEur'>('piecePriceEur');
  const [drawAxis, setDrawAxis] = useState<'' | 'x' | 'y' | 'z'>('');
  // The deliberate opt-out. Blocking the analysis with no way past it would be
  // worse than the problem: a quick generic look is a legitimate thing to want,
  // and this repo's standing rule is that the honest-degradation path stays
  // REACHABLE and clearly labelled rather than being hidden. It just stops being
  // the thing that happens when you press the obvious button without reading.
  const [runGeneric, setRunGeneric] = useState(false);
  // Company standards: this workspace's own thresholds, which outrank the
  // published guidelines and are graded as the stronger claim they are.
  const [overrides, setOverrides] = useState<Record<string, RuleOverride>>({});
  const [catalogue, setCatalogue] = useState<CatalogueRule[]>([]);
  const [showStandards, setShowStandards] = useState(false);
  const [savingRule, setSavingRule] = useState('');
  // Batch: many parts, one ranked answer.
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batch, setBatch] = useState<BatchResponse | null>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const [region, setRegion] = useState('Germany');
  const [annualVolume, setAnnualVolume] = useState(120000);
  // Drawing callouts, typed from the drawing. Almost no STEP carries semantic
  // PMI, so without these every tolerance- and flatness-capability rule
  // abstains on every part. Blank means undeclared — the rules say NOT
  // EVALUATED rather than judging a default; real PMI in the file outranks
  // whatever is typed here.
  const [tightestTolMm, setTightestTolMm] = useState('');
  const [toleranceGrade, setToleranceGrade] = useState<'standard' | 'precision'>('standard');
  const [flatnessCalloutMm, setFlatnessCalloutMm] = useState('');
  // SFSA 2000 production series (steel castings): short is the honest
  // first-article default; long declares that tooling has been iterated.
  const [productionSeries, setProductionSeries] = useState<'short' | 'long'>('short');
  // ── The 2D drawing ────────────────────────────────────────────────────────
  // AI reads the drawing; every number it extracts is judged by the same
  // deterministic rules as a typed input and labelled as drawing-read. The
  // extraction is shown BEFORE anything is judged so a misread row can be
  // excluded — the engineer stays the editor of record.
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [drawing, setDrawing] = useState<DrawingData | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [excludedDims, setExcludedDims] = useState<Set<number>>(new Set());
  const [showExtraction, setShowExtraction] = useState(true);
  const drawingInputRef = useRef<HTMLInputElement>(null);
  // Drag-over feedback for the two dropzones. A drop target that does not
  // acknowledge the drag is the commonest reason a file gets dropped on the
  // page background and nothing happens.
  const [dragOver, setDragOver] = useState(false);
  const [dragOverDrawing, setDragOverDrawing] = useState(false);
  const [loading, setLoading] = useState<'' | 'dfm' | 'dfa'>('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<DfmResponse | null>(null);
  const [dfa, setDfa] = useState<DfaResponse | null>(null);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'xlsx'>('');
  // ── Revision comparison ──────────────────────────────────────────────────
  // The baseline is the PREVIOUS analysis of this part, saved deliberately. It
  // is never auto-selected: comparing rev B against whatever happened to be in
  // the store last is how a report ends up diffing two different parts.
  const [snapshots, setSnapshots] = useState<Array<{ id: string; label: string; createdAt: string; savedBy?: string }>>([]);
  const [baselineId, setBaselineId] = useState('');
  const [baseline, setBaseline] = useState<{ label: string; analysis: unknown } | null>(null);
  const [savingSnap, setSavingSnap] = useState(false);
  // WHICH WORKSPACE this analysis is acting in. Company standards and revision
  // history now belong to an org rather than a person, and without a picker the
  // API could serve a team while the page could only ever reach one workspace —
  // support with no way to use it.
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; role: string; members: number }>>([]);
  const [orgId, setOrgId] = useState('');
  // Which findings the viewer paints onto the model. The analysis already
  // returns the face ids; a finding that says "2 undercut regions" without
  // showing WHERE leaves the engineer to hunt for them.
  const [highlight, setHighlight] = useState<'undercuts' | 'zeroDraft' | 'none'>('undercuts');
  const [answers, setAnswers] = useState<Record<number, Partial<Record<DfaQuestion, boolean>>>>({});
  const [showCallouts, setShowCallouts] = useState(true);
  // Stages the engine has actually finished, newest last. Real events only.
  const [stages, setStages] = useState<any[]>([]);
  const [explode, setExplode] = useState(0);

  const pick = useCallback((f: File | null) => {
    setFile(f); setResult(null); setDfa(null); setError(''); setAnswers({});
  }, []);

  /** Jump the reader to a step. 128px clears the app header and the sticky bar. */
  const scrollToStep = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 128;
    // `smooth` already defers to the OS reduced-motion setting in every
    // browser that implements it; no branch needed here.
    window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  /** Read the drawing file and send it for extraction. Nothing is judged here. */
  async function pickDrawing(f: File | null) {
    setDrawingFile(f); setDrawing(null); setExcludedDims(new Set()); setResult(null);
    if (!f) return;
    if (!token) { setError('Please sign in.'); return; }
    setExtracting(true); setError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.readAsDataURL(f);
      });
      const mime = f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? 'application/pdf'
        : f.type || 'image/png';
      const r = await fetch('/api/dfm/drawing-extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, mimeType: mime, fileName: f.name }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Drawing extraction failed');
      setDrawing(d.drawing); setShowExtraction(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Drawing extraction failed');
      setDrawingFile(null);
    } finally { setExtracting(false); }
  }

  /** The drawing as it will be judged: minus the rows the engineer excluded. */
  function drawingForAnalysis(): DrawingData | null {
    if (!drawing) return null;
    return { ...drawing, dimensions: drawing.dimensions.filter((_, i) => !excludedDims.has(i)) };
  }

  async function post(path: string, extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.append('cadFile', file as File);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const r = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Analysis failed');
    return d;
  }

  /**
   * Run the analysis, showing each stage AS IT GENUINELY COMPLETES.
   *
   * The server streams an event per phase the engine finishes — tessellation,
   * wall thickness, the draw-direction sweep, feature recognition — carrying the
   * real figures it just measured. Nothing here is a predicted percentage or a
   * bar invented to look busy: if a stage is skipped by the time budget, the
   * event says skipped and so does the UI.
   */
  async function analyse() {
    if (!file && !drawing) { setError('Choose a STEP/IGES file, a 2D drawing, or both.'); return; }
    if (!token) { setError('Please sign in.'); return; }
    setLoading('dfm'); setError(''); setStages([]);
    const fd = new FormData();
    if (file) fd.append('cadFile', file);
    // The 2D drawing's extraction, minus any rows the engineer excluded. The
    // server re-normalizes it — this is data, not trusted state.
    const dwg = drawingForAnalysis();
    if (dwg) fd.append('drawing', JSON.stringify(dwg));
    // weightKg is deliberately not sent: the server derives it from the
    // kernel-measured volume and the chosen material, so a value typed here
    // could silently disagree with the geometry the findings are based on.
    for (const [k, v] of Object.entries({ material, costProcess, region, annualVolume: String(annualVolume) })) fd.append(k, v);
    // Declared drawing callouts, sent only when typed: an empty field must
    // reach the server as ABSENT so the rules abstain instead of judging 0.
    fd.append('toleranceGrade', toleranceGrade);
    fd.append('productionSeries', productionSeries);
    if (tightestTolMm.trim()) fd.append('tightestToleranceMm', tightestTolMm.trim());
    if (flatnessCalloutMm.trim()) fd.append('flatnessMm', flatnessCalloutMm.trim());
    // A pinned draw direction, when the tool split is already decided. Left
    // blank the engine sweeps for the axis with the least undercut, which is
    // the right default and the wrong answer once a foundry has told you where
    // the parting line goes.
    if (drawAxis) fd.append('drawDirection', JSON.stringify(DRAW_AXES[drawAxis]));
    try {
      const r = await fetch('/api/dfm/analyze', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        body: fd,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Analysis failed');
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let ev: any;
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type === 'stage') setStages(prev => [...prev, ev]);
          else if (ev.type === 'result') setResult(ev.result);
          else if (ev.type === 'error') throw new Error(ev.error);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally { setLoading(''); }
  }

  async function analyseAssembly(withAnswers = answers) {
    if (!file) { setError('Choose a STEP or IGES file first.'); return; }
    if (!token) { setError('Please sign in.'); return; }
    setLoading('dfa'); setError('');
    try {
      // Region drives the labour rate instead of a hard-coded EUR 42/hr, and the
      // confirmed answers are what let the engine release the DFA index.
      setDfa(await post('/api/dfm/dfa', { options: JSON.stringify({ region, answers: withAnswers }) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assembly analysis failed');
    } finally { setLoading(''); }
  }

  /** Answer one of the three questions for a part, then re-score immediately. */
  function answer(index: number, q: DfaQuestion, value: boolean) {
    const next = { ...answers, [index]: { ...(answers[index] || {}), [q]: value } };
    setAnswers(next);
    void analyseAssembly(next);
  }

  // The comparison, computed where both halves exist. Pure and shared with the
  // report, so what the page shows and what the PDF prints cannot diverge.
  const revisionDiff = useMemo(() => {
    if (!result || !baseline?.analysis) return null;
    const d = diffAnalyses(baseline.analysis, result);
    return { ...d, warnings: comparability(baseline.analysis, result), baselineLabel: baseline.label };
  }, [result, baseline]);

  /** Every saved revision of THIS part, so a baseline can be chosen. */
  useEffect(() => {
    if (!token || !result) return;
    const key = String(result.partName || file?.name || 'part')
      .toLowerCase().replace(/\.(step|stp|igs|iges)$/i, '').replace(/[^a-z0-9]+/g, '-').slice(0, 80);
    fetch(`/api/dfm/snapshots?partKey=${encodeURIComponent(key)}${orgId ? `&orgId=${encodeURIComponent(orgId)}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.snapshots) setSnapshots(d.snapshots); })
      .catch(() => { /* no history is a normal state, not an error to show */ });
  }, [token, result, file, orgId]);

  async function saveRevision() {
    if (!token || !result) return;
    setSavingSnap(true);
    try {
      const res = await fetch('/api/dfm/snapshots', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: { ...result, fileName: file?.name }, orgId: orgId || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not save this revision.'); return; }
      setSnapshots(s => [{ id: d.id, label: d.label, createdAt: new Date().toISOString() }, ...s]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this revision.');
    } finally { setSavingSnap(false); }
  }

  async function loadBaseline(id: string) {
    setBaselineId(id);
    if (!id || !token) { setBaseline(null); return; }
    try {
      const res = await fetch(`/api/dfm/snapshots/${encodeURIComponent(id)}${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not load that revision.'); setBaseline(null); return; }
      setBaseline({ label: d.label, analysis: d.analysis });
    } catch { setBaseline(null); }
  }

  async function exportReport(kind: 'pdf' | 'xlsx') {
    if (!result) return;
    setExporting(kind);
    try {
      const mod = await import('../services/dfm-report');
      const payload = {
        ...result,
        fileName: file?.name,
        analysisLimits: [...(result.analysisLimits || []), ...(dfa?.analysisLimits || [])],
        dfa: dfa?.dfa ?? null,
        subject: { part: result.partName, material, process: costProcess },
      };
      if (kind === 'pdf') {
        const cap = await captureFigures();
        mod.exportDfmPdf(payload as never, cap.figures, {
          notLocated: located.notLocated,
          droppedByCap: located.droppedByCap,
          markable: located.annotations.length,
          captureError: cap.error,
        }, revisionDiff as never);
      } else await mod.exportDfmXlsx(payload as never, revisionDiff as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally { setExporting(''); }
  }

  /**
   * Render the annotated views the PDF embeds as evidence.
   *
   * Two things happen per view and the ORDER matters: the snapshot moves the
   * camera and captures, then the anchors are projected against THAT camera. Do
   * it the other way round and every leader line is drawn for a view the reader
   * is not looking at.
   *
   * The callouts themselves are deliberately NOT in the pixels. CSS2D labels are
   * DOM and never appear in a WebGL capture, so the PDF gets the clean render and
   * draws its markers as vector on top — sharp at print resolution rather than
   * upscaled screen text.
   */
  async function captureFigures(): Promise<{ figures: DfmFigure[]; error?: string }> {
    const v = viewerRef.current;
    if (!v || !file) return { figures: [], error: 'No 3D view was open when the report was exported.' };
    const W = 1400, H = 1000;

    // The marker NUMBERS come from the annotation order — worst finding first —
    // so #1 is the same finding in every view and in the page-one table. Deriving
    // them per-view from whatever happened to be visible would renumber the same
    // undercut between two pictures of the same part.
    const numberOf = new Map(annotations.map((a, i) => [a.id, i + 1]));

    // ── PAINT THE ACTUAL FEATURE, not just a ring above it ────────────────
    //
    // The interactive page has always painted a finding's faces when it is
    // CLICKED — and the export path never called that code, so every PDF
    // shipped with ring markers floating over untinted geometry. A reader was
    // told "the undercut is here" and shown an arrow, when the engine knows
    // exactly which B-rep faces it measured. The report is the artefact a
    // supplier acts on, so it gets the same evidence the screen does: every
    // finding's faces tinted by severity, in every captured view, and cleared
    // afterwards so the live viewport returns to whatever the user had.
    const SEV_TINT: Record<string, number> = { high: 0xdc2626, medium: 0xf59e0b, low: 0x0d9488, info: 0x64748b };
    // The page's global undercut/zero-draft wash (blue) would sit under the
    // severity tints and read as a fourth, unexplained colour in print. The
    // export clears it and the finally below restores the user's selection.
    await v.highlightFaces([]);
    const paintedLayers: string[] = [];
    for (const sev of ['low', 'medium', 'high'] as const) {   // high last, so it wins overlaps
      const ids = annotations.filter(a => (a.severity ?? 'info') === sev).flatMap(a => a.faceIds ?? []);
      if (!ids.length) continue;
      const layer = `report-${sev}`;
      await v.paintFaces(layer, ids, { colour: SEV_TINT[sev], opacity: 0.75 });
      paintedLayers.push(layer);
    }

    const shoot = async (view: 'iso' | 'front' | 'top' | 'back' | 'left' | 'right' | 'bottom') => {
      const dataUri = await v.snapshot({ view, width: W, height: H, clean: true });
      if (!dataUri) return null;
      const projected = await v.projectAnchors();
      const visible = projected.filter(p => p.visible);
      return {
        dataUri,
        visibleIds: visible.map(p => p.id),
        // Off-screen anchors are DROPPED, never clamped to an edge: a clamped
        // leader line points at a face that is not in the picture.
        callouts: visible.flatMap(p => {
          const a = annotations.find(x => x.id === p.id);
          if (!a) return [];
          return [{ n: numberOf.get(a.id) ?? 0, x: p.x, y: p.y, label: a.label, value: a.value ?? '', severity: a.severity ?? 'info', note: a.note ?? '' }];
        }).sort((a, b) => a.n - b.n),
      };
    };

    try {
      const iso = await shoot('iso');
      if (!iso) {
        return { figures: [], error: 'The 3D view returned no image. WebGL may be unavailable in this browser.' };
      }
      const figures: DfmFigure[] = [{
        id: 'iso', view: 'iso', role: 'hero', width: W, height: H,
        dataUri: iso.dataUri, callouts: iso.callouts,
      }];

      // A SECOND VIEW ONLY WHEN IT EARNS ITS PAGE.
      //
      // The old export always printed iso, front and top — three pages of the
      // same part, two of which usually restated the first. Here the candidates
      // are captured, and the one that reveals the most findings the ISO could
      // not show is kept. If none reveals anything, there is no second page.
      const missing = annotations.map(a => a.id).filter(id => !iso.visibleIds.includes(id));
      if (missing.length) {
        const byView: Record<string, string[]> = {};
        const shots: Record<string, Awaited<ReturnType<typeof shoot>>> = {};
        for (const view of ['back', 'bottom', 'front', 'left', 'right', 'top'] as const) {
          try {
            const s = await shoot(view);
            if (!s) continue;
            shots[view] = s; byView[view] = s.visibleIds;
          } catch { /* one bad candidate must not lose the others */ }
        }
        const best = chooseSecondView(missing, byView);
        const shot = best ? shots[best.view] : null;
        if (best && shot) {
          figures.push({
            id: best.view, view: best.view, role: 'evidence', width: W, height: H,
            dataUri: shot.dataUri, callouts: shot.callouts,
          });
        }
      }
      // ── A CUT, for the findings you cannot see from outside ──────────────
      //
      // A thin wall is under the skin. The ring was drawn on the surface above
      // it and the reader asked to trust that something was wrong underneath —
      // the one case where an external view proves nothing. The plane goes
      // THROUGH the point the engine measured, not wherever a slider was left.
      const cut = sectionCandidate(annotations);
      if (cut) {
        try {
          await v.sectionThrough(cut.anchorXYZ);
          const s = await shoot('iso');
          if (s) {
            figures.push({
              id: 'section', view: 'iso', role: 'section', width: W, height: H,
              dataUri: s.dataUri,
              // Only the finding the cut was made for. Every other marker on a
              // sectioned view sits on geometry that is half removed.
              callouts: s.callouts.filter(c => c.n === (numberOf.get(cut.id) ?? -1)),
              sectionOf: cut.label,
            });
          }
        } catch { /* a failed cut must not lose the figures that worked */ }
        finally { await v.sectionThrough(null).catch(() => {}); }
      }

      return { figures };
    } catch (e) {
      return { figures: [], error: e instanceof Error ? e.message : 'The 3D view could not be captured.' };
    } finally {
      // The report's paint must not outlive the capture: the live viewport goes
      // back to whatever the user had selected before they pressed Export.
      for (const layer of paintedLayers) { try { await v.clearLayer(layer); } catch { /* viewer gone */ } }
      try { await v.highlightFaces(highlightIds ?? []); } catch { /* viewer gone */ }
      await v.setView('iso').catch(() => {});
    }
  }

  const dfmBlock = result?.dfm ?? {};
  const wall = dfmBlock.wallThickness ?? {};
  const draft = dfmBlock.draft ?? {};
  const feats = dfmBlock.features ?? {};
  // ── Callouts, built from the engine's LOCATED findings ────────────────────
  // Everything here carries its own coordinates and its own measured value, so
  // a callout never re-derives anything — it reads what the analysis measured
  // and pins it to the face that produced it.
  // MARKERS COME FROM THE RULE RESULTS, NOT FROM THE GEOMETRY BLOCK.
  //
  // This used to walk `dfm.draft` / `dfm.features` and pin a ring on every
  // undercut region, every rib and every pocket the recogniser found — dozens of
  // markers on a casting, most of them on features that broke no rule, while a
  // rule that actually failed got none. It annotated what the engine MEASURED
  // instead of what it CONCLUDED.
  //
  // `selectFindingAnnotations` is the join, and it is pure and unit-tested
  // (tests/dfm-annotations.test.mjs) because a browser is a terrible place to
  // prove that a passing rib never gets marked.
  const located = useMemo(
    () => selectFindingAnnotations(result ?? {}),
    [result],
  );
  const annotations = located.annotations;

  /**
   * Shade the assembly by HANDLING TIME — the part that costs the most to pick
   * up and orient reads hottest.
   *
   * Scaled against the slowest part on this assembly rather than an absolute
   * band, because handling seconds mean nothing without a comparison: 4 s is
   * slow for a bracket and fast for a wiring loom. Parts the engine could not
   * time are simply left out of the map, so they stay neutral instead of being
   * shaded as if they were quick.
   */
  // One fetch, on mount. The lists come from the server's own tables so this
  // page can never again disagree with the cost model about what a material is
  // or which processes can make it.
  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch('/api/dfm/options', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(o => { if (live && o) setOptions(o); })
      .catch(() => { /* the selects fall back to disabled, never to a stale copy */ });
    return () => { live = false; };
  }, [token]);

  // The catalogue and this workspace's overrides, so the standards panel can
  // show what WILL be checked and what has been retuned — before anything runs.
  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    fetch('/api/dfm/rules', { headers: h }).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.rules) setCatalogue(d.rules); }).catch(() => {});
    fetch(`/api/dfm/rule-overrides${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''}`, { headers: h })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.overrides) setOverrides(d.overrides); }).catch(() => {});
  }, [token, orgId]);

  // The workspaces this user belongs to. One entry is the normal case and the
  // picker stays out of the way; more than one means a team, and which one a
  // standard is being set in is then a decision the page must not make silently.
  useEffect(() => {
    if (!token) return;
    fetch('/api/orgs', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (Array.isArray(d) && d.length) { setOrgs(d); setOrgId(prev => prev || d[0].id); } })
      .catch(() => { /* orgs unreachable: the endpoints fall back to the personal workspace */ });
  }, [token]);

  async function saveOverride(ruleId: string, body: RuleOverride | null) {
    if (!token) return;
    setSavingRule(ruleId);
    try {
      const res = await fetch(`/api/dfm/rule-overrides/${encodeURIComponent(ruleId)}${!body && orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''}`, {
        method: body ? 'PUT' : 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify({ ...body, orgId: orgId || undefined }) } : {}),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not save the standard.'); return; }
      setOverrides(d.overrides ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the standard.');
    } finally { setSavingRule(''); }
  }

  async function analyseBatch() {
    if (!batchFiles.length) return;
    setLoading('dfm'); setError(''); setBatch(null);
    try {
      const fd = new FormData();
      for (const f of batchFiles) fd.append('cadFiles', f);
      for (const [k, v] of Object.entries({ material, costProcess, region, annualVolume: String(annualVolume) })) fd.append(k, v);
      const res = await fetch('/api/dfm/batch', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Batch analysis failed');
      setBatch(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch analysis failed');
    } finally { setLoading(''); }
  }

  // Processes this material can actually take. Choosing ABS must not leave
  // "Sand Casting" selectable, and the tags for that already live in the cost
  // model, so the filter is a lookup rather than a second opinion.
  const processOptions: ProcessOption[] = useMemo(() => {
    if (!options) return [];
    return (material ? options.processesForMaterial[material] : options.allProcesses) ?? [];
  }, [options, material]);

  // The same list, split into the commodity headings the menu renders. Order is
  // the server's — it already sorts by group and puts the rule-bearing
  // processes first inside each one — so the two can never disagree.
  const processGroups: Array<[string, ProcessOption[]]> = useMemo(() => {
    const byGroup = new Map<string, ProcessOption[]>();
    for (const p of processOptions) {
      if (!byGroup.has(p.group)) byGroup.set(p.group, []);
      byGroup.get(p.group)!.push(p);
    }
    return [...byGroup.entries()];
  }, [processOptions]);

  // Sorted client-side by ONE measured column. A route missing that column sorts
  // last and keeps its reason rather than being read as zero, which would put
  // every unpriceable route at the top of a cheapest-first list.
  const sortedRoutes = useMemo(() => {
    const rows = result?.routes?.routes ?? [];
    const dir = routeSort === 'score' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = a[routeSort], bv = b[routeSort];
      if (!Number.isFinite(av as number) && !Number.isFinite(bv as number)) return 0;
      if (!Number.isFinite(av as number)) return 1;
      if (!Number.isFinite(bv as number)) return -1;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [result, routeSort]);

  // A file alone is no longer enough. `runGeneric` is the explicit way past it.
  // A 2D drawing counts as a part too — drawing-only analysis is the
  // quote-stage case, and the geometry rules say NOT EVALUATED honestly.
  const canAnalyse = (!!file || !!drawing) && (runGeneric || (!!material && !!costProcess));

  // ── THE GUIDED FLOW ───────────────────────────────────────────────────────
  //
  // Four steps, each `done` derived from state that genuinely exists — a file
  // or drawing actually loaded, a material and process actually chosen, an
  // analysis that actually returned. A tick here is a fact about the session,
  // never encouragement, which is the same contract the findings keep.
  const railSteps: RailStep[] = useMemo(() => [
    { id: 'step-part', label: 'Part', done: !!file || !!drawing,
      hint: 'Upload a STEP/IGES model, a 2D drawing, or both' },
    { id: 'step-process', label: 'Process', done: (!!material && !!costProcess) || runGeneric,
      hint: 'Material and process choose the ruleset' },
    { id: 'step-analyse', label: 'Analyse', done: !!result,
      hint: canAnalyse ? 'Ready to run' : 'Complete the steps above' },
    { id: 'results', label: 'Results', done: !!result,
      hint: 'Findings, routes and the cost impact' },
  ], [file, drawing, material, costProcess, runGeneric, result, canAnalyse]);

  const activeStep = !file && !drawing ? 'step-part'
    : !((material && costProcess) || runGeneric) ? 'step-process'
      : !result ? 'step-analyse' : 'results';

  // The report's own table of contents, with live counts. Only sections that
  // actually rendered appear — a nav entry that jumps nowhere is worse than
  // no nav at all.
  const navSections: NavSection[] = useMemo(() => {
    if (!result) return [];
    const findings = (result.results ?? []).reduce((n, r) => n + r.findings.length, 0);
    const highSeverity = (result.results ?? []).reduce(
      (n, r) => n + r.findings.filter(f => f.severity === 'high').length, 0);
    const out: NavSection[] = [
      { id: 'sec-summary', label: 'Summary', count: null },
      { id: 'sec-findings', label: 'Findings', count: findings, alert: highSeverity > 0 },
    ];
    if (result.drawingCheck) {
      out.push({ id: 'sec-drawing', label: 'Drawing check',
        count: result.drawingCheck.counts.conflict || null,
        alert: result.drawingCheck.counts.conflict > 0 });
    }
    out.push({ id: 'sec-geometry', label: 'Geometry', count: null });
    if (result.routes?.routes?.length) {
      out.push({ id: 'sec-routes', label: 'Routes', count: result.routes.routes.length });
    }
    if (dfa?.dfa) out.push({ id: 'sec-dfa', label: 'Assembly', count: null });
    return out;
  }, [result, dfa]);

  // The headline numbers of a finished analysis, computed once for the KPI
  // strip. Every one is a sum over what the engines returned — nothing here
  // is a ratio this page invented.
  // The cheapest priced route sets the scale for the comparison bars in the
  // routes table. Absent when nothing was priced, and the bars then do not
  // render at all rather than drawing against a guess.
  const cheapestRouteEur = useMemo(() => {
    const priced = (result?.routes?.routes ?? [])
      .map(r => r.piecePriceEur)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    return priced.length ? Math.min(...priced) : 0;
  }, [result]);

  const summary = useMemo(() => {
    if (!result) return null;
    const rs = result.results ?? [];
    const findings = rs.flatMap(r => r.findings);
    const scored = rs.filter(r => typeof r.score === 'number');
    return {
      score: scored.length
        ? Math.round(scored.reduce((s, r) => s + (r.score as number), 0) / scored.length)
        : null,
      scoredFamilies: scored.length,
      familyCount: rs.length,
      findings: findings.length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      evaluated: rs.reduce((n, r) => n + r.evaluatedCount, 0),
      ruleCount: rs.reduce((n, r) => n + r.ruleCount, 0),
      annualEur: rs.reduce((n, r) => n + (r.impact?.annualEur ?? 0), 0),
      notEvaluated: rs.reduce((n, r) => n + r.notEvaluated.length, 0),
    };
  }, [result]);
  // What the drawing supplies, so the manual callout inputs can say they are
  // superseded rather than silently ignored.
  const drawingSupplies = useMemo(() => {
    if (!drawing) return { tolerance: false, flatness: false };
    const activeDims = drawing.dimensions.filter((d, i) => !excludedDims.has(i) && d.toleranced && d.type !== 'angle' && (d.bandMm ?? 0) > 0);
    return {
      tolerance: activeDims.length > 0,
      flatness: drawing.gdt.some(g => g.symbol === 'flatness' && (g.toleranceMm ?? 0) > 0),
    };
  }, [drawing, excludedDims]);

  const selectedProcess = useMemo(
    () => processOptions.find(p => p.name === costProcess) ?? null,
    [processOptions, costProcess]);

  // A process that the newly-chosen material cannot take is cleared rather than
  // left showing, so the form can never submit a combination the picker forbids.
  useEffect(() => {
    if (!costProcess || !processOptions.length) return;
    if (!processOptions.some(p => p.name === costProcess)) setCostProcess('');
  }, [processOptions, costProcess]);

  // Naming a material or a process means you no longer want the generic run, so
  // the opt-out releases itself rather than silently persisting into an analysis
  // the user has since told us how to make specific.
  useEffect(() => {
    if (material || costProcess) setRunGeneric(false);
  }, [material, costProcess]);

  useEffect(() => {
    const rows = (dfa?.dfa as any)?.rows as any[] | undefined;
    if (!rows?.length) { void viewerRef.current?.setBodyColours(null); return; }
    // `time.handlingSec`, not `handlingS` — a wrong field name here would have
    // shaded nothing at all and looked exactly like "no DFA result yet".
    const times = rows.map(r => Number(r.time?.handlingSec)).filter(Number.isFinite);
    const max = Math.max(...times, 0.001);
    const m = new Map<number, number>();
    for (const r of rows) {
      const t = Number(r.time?.handlingSec);
      if (!Number.isFinite(t)) continue;
      const f = Math.min(1, t / max);
      // Cool slate -> amber -> red as handling time climbs.
      const red = Math.round(120 + 135 * f);
      const green = Math.round(160 - 100 * f);
      const blue = Math.round(190 - 150 * f);
      m.set(Number(r.index), (red << 16) | (green << 8) | blue);
    }
    void viewerRef.current?.setBodyColours(m);
  }, [dfa]);

  useEffect(() => { void viewerRef.current?.setExplode(explode); }, [explode]);

  // Pin them as soon as an analysis lands, and clear them when it is replaced.
  useEffect(() => {
    void viewerRef.current?.setAnnotations(showCallouts ? annotations : []);
  }, [annotations, showCallouts]);

  /**
   * Which marker backs a rule id.
   *
   * This was a list of string-prefix guesses — `endsWith('-undercuts')` and so
   * on — which meant a rule whose id did not match one of five patterns had no
   * button however well located its evidence was, and a matching id pointed at
   * whatever region happened to be first rather than the one that failed. The
   * annotation now carries its own `ruleId`, so the lookup is an identity rather
   * than an inference.
   */
  function anchorFor(ruleId: string) {
    return annotations.find(a => a.ruleId === ruleId);
  }

  /** Fly to a finding's anchor and make sure its callout is on screen. */
  function showOnModel(ruleId: string) {
    const a = anchorFor(ruleId);
    if (!a) return;
    setShowCallouts(true);
    void viewerRef.current?.flyTo(a.anchorXYZ);
    if (a.faceIds?.length) {
      void viewerRef.current?.paintFaces('finding', a.faceIds, { colour: 0xf59e0b, opacity: 0.7 });
    }
    viewerRef.current?.ready().then(() => {
      document.querySelector('.cv3d-host')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  const highlightIds: number[] | null =
    highlight === 'undercuts' ? (draft.undercutFaceIds ?? null)
      : highlight === 'zeroDraft' ? (draft.zeroDraftFaceIds ?? null)
        : null;

  return (
    <div className="dfm-shell min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      {/* The ground this tool works on: two-level squared paper, faded away
          from the reading column. Decorative and inert. */}
      <div className="dfm-aura" aria-hidden="true" />
      <div className="dfm-grid" aria-hidden="true" />
      <div className="dfm-content max-w-6xl mx-auto">
        {/* ── TOOL HEADER ────────────────────────────────────────────────────
            A workspace masthead, not a landing hero. The right-hand figures
            are COUNTED from the catalogue the server sent, so the header
            cannot claim a rule count the engine does not hold. */}
        <header className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gold-500/15 border border-gold-500/25 shrink-0">
              <ShieldCheck size={22} className="text-gold-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-[27px] font-black text-white tracking-tight leading-tight">DFM / DFA Studio</h1>
              <p className="text-[13px] text-slate-400 mt-0.5 max-w-2xl">
                Manufacturability measured from your geometry and read off your drawing, judged against
                cited standards, priced by deterministic engines.
              </p>
            </div>
          </div>
          <dl className="flex items-center gap-5 shrink-0">
            {[
              ['Rules', result?.catalogue?.total ?? catalogue.length ?? null],
              ['Standards-named', result?.catalogue?.byGrade?.['standard-named'] ?? null],
              ['Company standards', Object.keys(overrides).length || null],
            ].map(([label, value]) => (
              <div key={label as string} className="text-right">
                <dd className="text-white font-bold text-lg dfm-num leading-none">
                  {value === null || value === undefined ? '—' : (value as number)}
                </dd>
                <dt className="dfm-label text-slate-500 mt-1">{label as string}</dt>
              </div>
            ))}
          </dl>
        </header>

        {/* ── THE GUIDED FLOW + REPORT NAV ───────────────────────────────────
            One sticky bar carrying both: where you are in the four steps, and
            — once there is a report — its table of contents with live counts. */}
        <div className="dfm-sticky -mx-4 px-4 py-2.5 mb-5 border-y border-white/[0.07] bg-navy-950/70">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <StepRail steps={railSteps} activeId={activeStep} onJump={scrollToStep} />
            {navSections.length > 1 && (
              <div className="flex items-center gap-2 min-w-0">
                <span className="dfm-label text-slate-600 hidden lg:inline shrink-0">Report</span>
                <SectionNav sections={navSections} />
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div id="step-part" onMouseMove={spot} className="dfm-panel dfm-spot dfm-framed p-6 mb-6 scroll-mt-32">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold-500 text-navy-950 text-[11px] font-bold">1</span>
            The part
          </h2>
          {/* The drop target stays a div because dragging has no keyboard
              equivalent — but the CHOOSE action is a real button, so the page is
              operable without a mouse. It was a bare div with onClick, which no
              keyboard or screen-reader user could reach at all. */}
          <motion.div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0] ?? null); }}
            animate={m.reduced ? undefined : { scale: dragOver ? 1.008 : 1 }}
            transition={m.t(0.16)}
            className={`relative overflow-hidden rounded-xl p-8 text-center cursor-pointer border-2 border-dashed transition-colors ${
              dragOver ? 'border-gold-500/70 bg-gold-500/[0.07]'
                : file ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                  : 'border-white/15 hover:border-gold-500/40'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {file ? (
                <motion.div key="chosen" variants={m.rise} initial="hidden" animate="show" exit="exit">
                  <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 mb-2">
                    <CheckCircle2 size={24} className="text-emerald-400 dfm-tick-in" aria-hidden="true" />
                  </span>
                  <p className="text-white text-sm font-semibold">{file.name}</p>
                  <p className="text-slate-500 text-xs mt-1 dfm-num">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · B-rep geometry ready to measure
                  </p>
                </motion.div>
              ) : (
                <motion.div key="empty" variants={m.rise} initial="hidden" animate="show" exit="exit">
                  <Upload size={28} className={`mx-auto mb-2 transition-colors ${dragOver ? 'text-gold-400' : 'text-slate-500'}`} aria-hidden="true" />
                  <p className="text-white text-sm font-medium">
                    {dragOver ? 'Release to load the part' : 'Drop a STEP or IGES file, or choose one'}
                  </p>
                  <p className="text-slate-500 text-xs mt-1 max-w-lg mx-auto">
                    B-rep geometry only. An STL is a triangle mesh with no topology, so draft, undercuts and features cannot be measured from it.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button type="button"
              {...m.press}
              onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
              className="relative mt-3 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium
                         focus:outline-none focus:ring-2 focus:ring-gold-500/60"
            >
              {file ? 'Choose a different file' : 'Choose CAD file'}
            </motion.button>
            <input ref={inputRef} type="file" accept=".step,.stp,.iges,.igs" className="hidden"
              tabIndex={-1} aria-hidden="true" onChange={e => pick(e.target.files?.[0] ?? null)} />
          </motion.div>

          {/* ── THE 2D DRAWING — optional, alone or alongside the 3D file ────
              AI reads the drawing; every number it extracts is judged by the
              same deterministic rules as a typed input and labelled as
              drawing-read. The extraction renders below BEFORE anything is
              judged, so a misread row can be excluded. */}
          <div
            onDragOver={e => { e.preventDefault(); if (!dragOverDrawing) setDragOverDrawing(true); }}
            onDragLeave={() => setDragOverDrawing(false)}
            onDrop={e => { e.preventDefault(); setDragOverDrawing(false); void pickDrawing(e.dataTransfer.files?.[0] ?? null); }}
            className={`relative mt-4 border rounded-xl p-4 overflow-hidden transition-colors ${
              dragOverDrawing ? 'border-gold-500/60 bg-gold-500/[0.06]'
                : drawing ? 'border-sky-500/25 bg-sky-500/[0.03]' : 'border-white/10 bg-navy-950/40'
            }`}>
            {/* While vision is reading, the panel carries an indeterminate
                photon — the duration of a multi-sheet read is genuinely
                unknown, so a percentage bar here would be a fiction. */}
            {extracting && <div className="dfm-photon absolute inset-x-0 top-0 h-0.5" aria-hidden="true" />}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium flex items-center gap-2">
                  <FileText size={14} className="text-sky-400" aria-hidden="true" />
                  2D drawing (optional) — PDF or image
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  AI reads the dimensions, GD&amp;T and title block; every number is still judged by the
                  deterministic rules and labelled as drawing-read. Works with or without a 3D file —
                  with both, the two are cross-checked.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {drawingFile && (
                  <motion.button type="button" {...m.press} onClick={() => pickDrawing(null)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs
                               focus:outline-none focus:ring-2 focus:ring-gold-500/60">
                    Remove
                  </motion.button>
                )}
                <motion.button type="button" disabled={extracting} {...m.press}
                  onClick={() => drawingInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium
                             focus:outline-none focus:ring-2 focus:ring-gold-500/60 disabled:opacity-50">
                  {extracting && <ButtonSpinner size={12} />}
                  {extracting ? 'Reading the drawing…' : drawingFile ? drawingFile.name : 'Choose drawing'}
                </motion.button>
              </div>
              <input ref={drawingInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
                tabIndex={-1} aria-hidden="true" onChange={e => pickDrawing(e.target.files?.[0] ?? null)} />
            </div>

            {/* The extraction, reviewable before it is judged. */}
            {drawing && (
              <motion.div variants={m.rise} initial="hidden" animate="show" className="mt-3 border-t border-white/10 pt-3">
                <button type="button" onClick={() => setShowExtraction(s => !s)}
                  aria-expanded={showExtraction}
                  className="inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 font-medium
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 rounded">
                  <ChevronRight size={13} aria-hidden="true"
                    className={`transition-transform ${showExtraction ? 'rotate-90' : ''}`} />
                  What the AI read
                  {' '}({drawing.dimensions.length} dimensions · {drawing.gdt.length} GD&amp;T · {drawing.roughness.length} roughness)
                  {drawing.titleBlock.drawingNumber ? ` — ${drawing.titleBlock.drawingNumber}` : ''}
                  {drawing.titleBlock.revision ? ` rev ${drawing.titleBlock.revision}` : ''}
                </button>
                {showExtraction && (
                  <div className="mt-2 space-y-3">
                    {drawing.conversions.map((c, i) => (
                      <p key={i} className="text-[11px] text-amber-300/90">{c}</p>
                    ))}
                    {drawing.titleBlock.material && (
                      <p className="text-xs text-slate-400">
                        Title block material: <span className="text-slate-200">{drawing.titleBlock.material}</span>
                        {drawing.titleBlock.generalToleranceNote ? <> · general tolerance note: <span className="text-slate-200">{drawing.titleBlock.generalToleranceNote}</span></> : null}
                      </p>
                    )}
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="text-slate-500 text-left border-b border-white/10">
                            <th className="pr-2 py-1.5 dfm-label font-medium">Use</th>
                            <th className="pr-3 py-1.5 dfm-label font-medium">As printed</th>
                            <th className="pr-3 py-1.5 dfm-label font-medium">Nominal (mm)</th>
                            <th className="pr-3 py-1.5 dfm-label font-medium">Band (mm)</th>
                            <th className="pr-3 py-1.5 dfm-label font-medium">Type</th>
                            <th className="py-1.5 dfm-label font-medium">Check vs 3D</th>
                          </tr>
                        </thead>
                        <motion.tbody variants={m.stagger()} initial="hidden" animate="show">
                          {drawing.dimensions.map((d, i) => {
                            const check = result?.drawingCheck?.rows.find(r => r.sourceText === d.sourceText && r.nominalMm === d.nominalMm);
                            const conflict = check?.status === 'conflict';
                            return (
                              <motion.tr key={i} variants={m.staggerItem}
                                className={`border-t border-white/5 dfm-row-hover ${excludedDims.has(i) ? 'opacity-40' : ''} ${
                                  conflict ? 'bg-red-500/[0.05]' : ''}`}>
                                <td className="pr-2 py-1.5">
                                  <input type="checkbox" checked={!excludedDims.has(i)}
                                    aria-label={`Include ${d.sourceText}`}
                                    onChange={() => setExcludedDims(prev => {
                                      const next = new Set(prev);
                                      if (next.has(i)) next.delete(i); else next.add(i);
                                      return next;
                                    })} />
                                </td>
                                <td className="pr-3 py-1.5 text-slate-200 font-mono">{d.sourceText}</td>
                                <td className="pr-3 py-1.5 text-slate-300 dfm-num">{d.nominalMm}</td>
                                <td className="pr-3 py-1.5 text-slate-300 dfm-num">{d.bandMm ?? <span className="text-slate-600">— (general tol.)</span>}</td>
                                <td className="pr-3 py-1.5 text-slate-400">{d.type}</td>
                                <td className="py-1.5">
                                  {check ? (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                                      check.status === 'confirmed' ? 'text-emerald-300 bg-emerald-500/10'
                                        : conflict ? 'text-red-300 bg-red-500/15 font-medium dfm-alert-once'
                                          : 'text-slate-500 bg-white/5'
                                    }`}>
                                      {check.status === 'confirmed'
                                        ? <><CheckCircle2 size={11} aria-hidden="true" /> confirmed</>
                                        : conflict
                                          ? <><AlertTriangle size={11} aria-hidden="true" /> conflict — model {check.candidate?.valueMm} mm</>
                                          : <><MinusCircle size={11} aria-hidden="true" /> not found in 3D</>}
                                      <span className="sr-only">{check.note}</span>
                                    </span>
                                  ) : <span className="text-slate-600">—</span>}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </motion.tbody>
                      </table>
                    </div>
                    {drawing.gdt.length > 0 && (
                      <div className="text-xs text-slate-400">
                        <span className="text-slate-300 font-medium">GD&amp;T: </span>
                        {drawing.gdt.map((g, i) => (
                          <span key={i} className="mr-3 font-mono">
                            {g.symbol} {g.toleranceMm ?? '?'}{g.datums.length ? ` | ${g.datums.join(' | ')}` : ''}
                            {g.symbol !== 'flatness' && (
                              <span className="text-slate-600 font-sans"> (no deterministic rule consumes this yet — shown for the record)</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {drawing.roughness.length > 0 && (
                      <p className="text-xs text-slate-400">
                        <span className="text-slate-300 font-medium">Roughness: </span>
                        {drawing.roughness.map((r) => r.sourceText).join(' · ')}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* ── STEP 2 — HOW IT'S MADE ───────────────────────────────────────
              These two selectors decide WHICH RULE FAMILY judges the part, and
              they used to sit as two cells of a five-column row of settings
              below a large dropzone, in small muted text, both defaulting to
              "Not set". The consequence was silent: upload, press Analyse, and
              get a speculative sweep of all fifteen families with findings for
              processes the part will never see — with no moment where anyone was
              asked. That is the report that reaches a director.

              So they are now a STEP, they appear once there is a part to apply
              them to, and the analyse button waits for them. */}
          {(file || drawing) && (
            <div className="mt-5 border-t border-white/10 pt-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold-500 text-navy-950 text-[11px] font-bold">2</span>
                How is this part made?
              </h2>
              <p className="text-xs text-slate-400 mb-3">
                Sheet metal, die casting, sand casting and forging are different rulesets with
                different thresholds — and the alloy moves them again. This is what makes the
                analysis specific rather than generic.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="text-sm text-slate-200 font-medium">Material
                  <select value={material} onChange={e => setMaterial(e.target.value)}
                    className="dfm-select mt-1.5" data-unset={material ? 'false' : 'true'}>
                    {/* Short, because a ~200 px select truncated the old label
                        mid-sentence. What it COSTS you to leave it unset is said
                        in full in the line below, where there is room for it. */}
                    <option value="">Choose a material</option>
                    {options?.materialFamilies.map(f => (
                      <optgroup key={f.family} label={f.label}>
                        {f.grades.map(g => <option key={g} value={g}>{g}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {/* MANUFACTURING process, not "costing process". Labelling it
                    "costing" made it read as optional metadata, so it was left
                    unset and every part got a speculative sweep. */}
                <label className="text-sm text-slate-200 font-medium">Manufacturing process
                  <select value={costProcess} onChange={e => setCostProcess(e.target.value)}
                    disabled={!material}
                    className={`mt-1.5 w-full bg-navy-800 border rounded-lg px-3 py-2.5 text-white text-sm
                                focus:outline-none focus:border-gold-500/60 disabled:opacity-50
                                ${costProcess ? 'border-white/15' : 'border-amber-500/50'}`}>
                    <option value="">{material ? 'Choose a process' : 'Choose a material first'}</option>
                    {/* GROUPED BY COMMODITY, not by whether rules exist. The old
                        split put all 26 rule-bearing processes in one flat
                        optgroup — casting beside machining beside moulding — and
                        finding one row in it while somebody watched was the
                        failure that sent this menu back to be rebuilt. A reader
                        looking for HPDC now opens "Casting" and reads eleven
                        rows, not thirty-seven. */}
                    {processGroups.map(([groupName, opts]) => (
                      <optgroup key={groupName} label={groupName}>
                        {opts.map(p => (
                          <option key={p.name} value={p.name}>
                            {p.label}{p.dfmFamily ? '' : '  (no DFM rules)'}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>

              {/* WHAT THE CHOICE WILL DO, before the analysis runs. */}
              <p className="mt-3 text-xs text-slate-400 flex items-start gap-2">
                <Info size={13} className="shrink-0 mt-0.5 text-gold-400" aria-hidden="true" />
                <span>
                  {selectedProcess?.dfmFamily ? (
                    <>Will run the <strong className="text-white">{selectedProcess.dfmFamilyName}</strong> ruleset
                      {material
                        ? <> with thresholds for <strong className="text-white">{material}</strong> where the alloy changes them.</>
                        : <>. Pick a material and the thresholds that depend on it — bend radius, minimum wall — are resolved for that alloy instead of the generic band.</>}
                    </>
                  ) : selectedProcess ? (
                    <span className="text-amber-400/90">{selectedProcess.noDfmReason}</span>
                  ) : (
                    <>Until a process is chosen, every rule family runs speculatively and some findings
                      will be for processes this part will never see.</>
                  )}
                </span>
              </p>

              {/* ── Costing & advanced ────────────────────────────────────────
                  Deliberately quieter. These scale figures or override a default
                  the engine would otherwise measure for itself; none of them
                  decides which rules run. */}
              <p className="mt-4 mb-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                Costing &amp; advanced
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="text-xs text-slate-400">Region
                  <select value={region} onChange={e => setRegion(e.target.value)}
                    className="dfm-select mt-1">
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-400">Annual volume
                  <input type="number" value={annualVolume} min={1}
                    onChange={e => setAnnualVolume(Math.max(1, Number(e.target.value) || 1))}
                    className="dfm-select mt-1" />
                </label>
                <label className="text-xs text-slate-400">Draw / parting direction
                  <select value={drawAxis} onChange={e => setDrawAxis(e.target.value as '' | 'x' | 'y' | 'z')}
                    className="dfm-select mt-1">
                    <option value="">Find the best (least undercut)</option>
                    <option value="x">Pin to +X</option>
                    <option value="y">Pin to +Y</option>
                    <option value="z">Pin to +Z</option>
                  </select>
                </label>
              </div>

              {/* ── Drawing callouts ─────────────────────────────────────────
                  What the DRAWING asks for, which no STEP file carries. Left
                  blank, the capability rules abstain (NOT EVALUATED) — they
                  never judge a default. Die castings are judged against the
                  NADCA #402 tables; the grade selects Standard vs Precision
                  tolerance columns, a die-cost decision the engineer owns. */}
              <p className="mt-4 mb-2 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                Drawing callouts <span className="normal-case font-normal">— optional; blank = rules abstain honestly</span>
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className={`text-xs ${drawingSupplies.tolerance ? 'text-slate-600' : 'text-slate-400'}`}>Tightest tolerance band (mm)
                  <input type="number" value={tightestTolMm} min={0} step={0.01}
                    placeholder={drawingSupplies.tolerance ? 'superseded by the uploaded drawing' : 'e.g. 0.5 for ±0.25'}
                    disabled={drawingSupplies.tolerance}
                    title={drawingSupplies.tolerance ? 'The uploaded drawing carries toleranced dimensions, and those are judged each at their own size — a single typed band would be weaker evidence.' : undefined}
                    onChange={e => setTightestTolMm(e.target.value)}
                    className="dfm-input mt-1" />
                </label>
                <label className="text-xs text-slate-400">Tolerance grade (NADCA #402)
                  <select value={toleranceGrade} onChange={e => setToleranceGrade(e.target.value as 'standard' | 'precision')}
                    className="dfm-select mt-1">
                    <option value="standard">Standard — first-quote assumption</option>
                    <option value="precision">Precision — costs die money, declared deliberately</option>
                  </select>
                </label>
                <label className="text-xs text-slate-400">Flatness callout (mm)
                  <input type="number" value={flatnessCalloutMm} min={0} step={0.01}
                    placeholder={drawingSupplies.flatness ? 'drawing supplies one; typing here overrides it' : 'e.g. 0.3'}
                    onChange={e => setFlatnessCalloutMm(e.target.value)}
                    className="dfm-input mt-1" />
                </label>
                <label className="text-xs text-slate-400">Production series (SFSA 2000, steel castings)
                  <select value={productionSeries} onChange={e => setProductionSeries(e.target.value as 'short' | 'long')}
                    className="dfm-select mt-1">
                    <option value="short">Short — first article, no pattern iteration yet</option>
                    <option value="long">Long — tooling iterated, dimensions centred</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* ── COMPANY STANDARDS ────────────────────────────────────────────
              A plant's own guideline outranks a published one, and this is how a
              DFM tool gets adopted: the organisation encodes ITS standards
              rather than accepting a vendor's. The catalogue is pure data, so
              this is storage — and an overridden threshold is graded
              'customer-standard', a STRONGER claim than the industry consensus
              it replaced, because someone accountable put their name to it. */}
          <div className="mt-4 border-t border-white/10 pt-3">
            <button type="button" onClick={() => setShowStandards(v => !v)}
              className="flex items-center gap-2 text-xs text-slate-300 hover:text-white"
              aria-expanded={showStandards}>
              <ChevronRight size={13} className={`transition-transform ${showStandards ? 'rotate-90' : ''}`} aria-hidden="true" />
              Company standards
              <span className="text-slate-500">
                {Object.keys(overrides).length
                  ? `${Object.keys(overrides).length} rule${Object.keys(overrides).length === 1 ? '' : 's'} retuned or switched off`
                  : `${catalogue.length} published rules, none changed`}
              </span>
            </button>
            {showStandards && (
              <div className="mt-3 max-h-80 overflow-y-auto pr-1">
                <p className="text-slate-500 text-xs mb-2">
                  Set your own threshold and it replaces the published guideline for every analysis
                  you run, carrying your note as its source. Clear it and the published value returns.
                  A rule switched off leaves the coverage figure too, so it cannot look like a rule
                  that passed.
                </p>
                <table className="w-full text-xs">
                  <tbody>
                    {catalogue
                      .filter(r => !selectedProcess?.dfmFamily || r.process === selectedProcess.dfmFamily)
                      .map(r => {
                        const ov = overrides[r.id];
                        const isRange = Array.isArray(r.threshold);
                        const shown = ov?.threshold ?? r.threshold;
                        return (
                          <tr key={r.id} className="border-b border-white/5">
                            <td className="py-1.5 pr-2">
                              <span className={ov?.enabled === false ? 'text-slate-500 line-through' : 'text-white'}>{r.title}</span>
                              <span className="block text-slate-500">{r.id} · {r.unit}</span>
                            </td>
                            <td className="py-1.5 px-2 whitespace-nowrap">
                              <input
                                defaultValue={Array.isArray(shown) ? shown.join(', ') : String(shown)}
                                onBlur={e => {
                                  const raw = e.target.value.trim();
                                  const parsed = isRange
                                    ? raw.split(',').map(v => Number(v.trim()))
                                    : Number(raw);
                                  const original = Array.isArray(r.threshold) ? r.threshold.join(', ') : String(r.threshold);
                                  if (raw === original) { void saveOverride(r.id, ov ? { ...ov, threshold: undefined } : null); return; }
                                  if (Array.isArray(parsed) ? parsed.some(v => !Number.isFinite(v)) : !Number.isFinite(parsed)) return;
                                  void saveOverride(r.id, { enabled: ov?.enabled !== false, threshold: parsed, note: ov?.note });
                                }}
                                className="w-24 bg-navy-800 border border-white/15 rounded px-2 py-1 text-white tabular-nums
                                           focus:outline-none focus:border-gold-500/40"
                                aria-label={`Threshold for ${r.title}`} />
                              {ov?.threshold !== undefined && <span className="ml-2 text-gold-400">yours</span>}
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                defaultValue={ov?.note ?? ''}
                                placeholder="Why — this becomes the source line"
                                onBlur={e => {
                                  const note = e.target.value.trim();
                                  if (note === (ov?.note ?? '')) return;
                                  void saveOverride(r.id, { enabled: ov?.enabled !== false, threshold: ov?.threshold, note });
                                }}
                                className="w-full bg-navy-800 border border-white/15 rounded px-2 py-1 text-slate-300
                                           focus:outline-none focus:border-gold-500/40"
                                aria-label={`Reason for the ${r.title} standard`} />
                            </td>
                            <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                              <label className="inline-flex items-center gap-1 text-slate-400">
                                <input type="checkbox" checked={ov?.enabled !== false}
                                  onChange={e => void saveOverride(r.id, { enabled: e.target.checked, threshold: ov?.threshold, note: ov?.note })}
                                  className="accent-gold-500" />
                                on
                              </label>
                              {savingRule === r.id && <span className="ml-2 text-slate-500">saving…</span>}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── BATCH ────────────────────────────────────────────────────────
              A plant head does not care about one bracket; they care about which
              twenty of five hundred are worst. */}
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => batchInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium
                           focus:outline-none focus:ring-2 focus:ring-gold-500/60">
                {batchFiles.length ? `${batchFiles.length} parts chosen` : 'Choose many parts (portfolio scan)'}
              </button>
              <input ref={batchInputRef} type="file" multiple accept=".step,.stp,.iges,.igs" className="hidden"
                onChange={e => setBatchFiles(Array.from(e.target.files ?? []))} />
              {batchFiles.length > 0 && (
                <button onClick={() => void analyseBatch()} disabled={loading !== ''}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gold-500/90 text-navy-950 font-semibold text-xs
                             hover:bg-gold-400 disabled:opacity-50">
                  {loading === 'dfm' ? <ButtonSpinner size={12} /> : <Boxes size={13} />} Scan all {batchFiles.length}
                </button>
              )}
              <span className="text-slate-500 text-xs">Up to 25 parts, each measured by the same kernel and judged by the same rules.</span>
            </div>
          </div>

          {/* THE GATE. `Analyse` used to enable on the file alone, so the shortest
              path through this page produced a speculative sweep across all
              fifteen rule families with findings for processes the part will
              never see. It now waits for the two answers that decide which rules
              run — or for an explicit, labelled decision to go without them. */}
          <div className="flex flex-wrap gap-2 mt-5">
            <motion.button onClick={analyse} disabled={!canAnalyse || loading !== ''}
              {...(canAnalyse && loading === '' ? m.press : {})}
              /* `disabled:opacity-50` alone leaves a bright gold button still
                 reading as clickable — checked against a real render. A disabled
                 PRIMARY has to lose its fill, not just some of its alpha, or the
                 gate is invisible until you click and nothing happens.
                 When it IS armed it carries the gold glow, so the one action
                 the page is built around is unmistakably the primary. */
              className="dfm-cta flex items-center gap-2 px-5 py-2.5 rounded-xl text-navy-950 font-semibold text-sm
                         transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60
                         disabled:text-slate-500 disabled:border disabled:border-white/15
                         disabled:cursor-not-allowed">
              {loading === 'dfm' ? <ButtonSpinner size={14} /> : <Ruler size={15} aria-hidden="true" />}
              {loading === 'dfm' ? 'Measuring…' : 'Analyse manufacturability'}
            </motion.button>
            <motion.button onClick={() => void analyseAssembly()} disabled={!file || loading !== ''}
              {...(file && loading === '' ? m.press : {})}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-300 font-semibold text-sm hover:bg-teal-500/20 transition-colors disabled:opacity-50
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60">
              {loading === 'dfa' ? <ButtonSpinner size={14} /> : <Boxes size={15} aria-hidden="true" />} Analyse assembly (DFA)
              {/* The title= was the only place this said what DFA does. */}
              <span className="sr-only">Decompose an assembly into parts and score it for assembly</span>
            </motion.button>
          </div>
          {file && !canAnalyse && (
            <p className="mt-2.5 text-xs text-amber-400/90 flex items-start gap-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Choose {[!material && 'a material', !costProcess && 'a manufacturing process']
                  .filter(Boolean).join(' and ')} to run the analysis against the right rules.
                {' '}
                <button type="button" onClick={() => setRunGeneric(true)}
                  className="underline underline-offset-2 hover:text-amber-300 focus:outline-none
                             focus:ring-2 focus:ring-amber-400/60 rounded">
                  Or run it generically — every rule family, speculatively
                </button>.
              </span>
            </p>
          )}
          {file && runGeneric && !(material && costProcess) && (
            <p className="mt-2.5 text-xs text-amber-400/90 flex items-start gap-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Running generically. Every rule family will be applied, so some findings will be for
                processes this part will never see and their cost figures must not be added together.
              </span>
            </p>
          )}
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>

        {/* ── PORTFOLIO RESULTS ────────────────────────────────────────────────
          Worst first, because the only reason to scan a portfolio is to find the
          parts that need attention. A part that could not be read keeps its row
          with the reason: a table that drops what it failed on reads as "these
          are your parts". */}
        {batch && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          onMouseMove={spot} className="dfm-panel dfm-spot dfm-framed p-5 mb-6">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-1">
            <Boxes size={15} className="text-gold-400" aria-hidden="true" />
            Portfolio scan — {batch.parts.length} parts
          </h3>
          <p className="text-slate-500 text-xs mb-3">{batch.basis}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left py-2 pr-3 font-medium">Part</th>
                  <th className="text-right py-2 px-2 font-medium">DFM score</th>
                  <th className="text-right py-2 px-2 font-medium">Rules run</th>
                  <th className="text-left py-2 px-2 font-medium">Measured as</th>
                  <th className="text-left py-2 px-2 font-medium">Worst finding</th>
                  <th className="text-left py-2 pl-2 font-medium">Cheapest viable route</th>
                </tr>
              </thead>
              <tbody>
                {[...batch.parts].sort((a, b) => {
                  // Unreadable parts first — they are the ones needing action,
                  // then worst score, then the ones that could not be judged.
                  if (a.error && !b.error) return -1;
                  if (b.error && !a.error) return 1;
                  const av = a.score ?? 1e9, bv = b.score ?? 1e9;
                  return av - bv;
                }).map(p => (
                  <tr key={p.fileName} className="border-b border-white/5 align-top">
                    <td className="py-2 pr-3 text-white">{p.partName}</td>
                    {p.error ? (
                      <td className="py-2 px-2 text-amber-400" colSpan={5}>{p.error}</td>
                    ) : (
                      <>
                        <td className={`text-right py-2 px-2 tabular-nums ${TONE_TEXT[scoreTone(p.score)]}`}>
                          {p.score ?? '—'}
                          {p.highSeverityCount ? <span className="block text-red-400/70">{p.highSeverityCount} high</span> : null}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums text-slate-400">
                          {p.coveragePct == null ? <span title={p.scoreReason}>—</span> : `${p.coveragePct}%`}
                        </td>
                        <td className="py-2 px-2 text-slate-300">{p.measuredProcess ?? <span className="text-slate-500">unsettled</span>}</td>
                        <td className="py-2 px-2 text-slate-400">{p.worstFinding ?? '—'}</td>
                        <td className="py-2 pl-2 text-slate-300">
                          {p.bestRoute ? `${p.bestRoute.process} — EUR ${p.bestRoute.piecePriceEur.toFixed(2)}` : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
        )}

        {/* ── LIVE STAGES ────────────────────────────────────────────────────
            Each line appears when the engine has genuinely FINISHED that
            phase and carries the figure it just measured — never a predicted
            percentage. It used to sit inside the 3D viewer card, which meant
            a drawing-only run (no STEP file, so no viewer) showed a dead
            button for the whole analysis with nothing to say it was working.
            The bar at the top is indeterminate on purpose: the duration of an
            OCCT pass over an unseen part is not knowable, and a filling bar
            would be a number this tool did not measure. */}
        <AnimatePresence>
          {(loading === 'dfm' || stages.length > 0) && !result && (
            <motion.div variants={m.panel} initial="hidden" animate="show" exit="exit"
              className="dfm-panel relative overflow-hidden p-4 mb-6">
              {loading === 'dfm' && <div className="dfm-photon absolute inset-x-0 top-0 h-0.5" aria-hidden="true" />}
              <p className="dfm-label text-slate-500 mb-2.5 flex items-center gap-1.5">
                <Gauge size={12} className="text-gold-500/70" aria-hidden="true" />
                Measuring
              </p>
              <ol className="space-y-1.5 relative" aria-live="polite">
                {/* The spine every tick hangs off — a witness line down the
                    left of the finished stages. */}
                {stages.length > 1 && (
                  <span className="absolute left-[6px] top-2 bottom-2 w-px bg-white/10" aria-hidden="true" />
                )}
                <AnimatePresence initial={false}>
                  {stages.filter(s2 => s2.status !== 'start').map((s2, i) => (
                    <motion.li key={`${s2.stage}-${i}`} variants={m.slideIn}
                      initial="hidden" animate="show" exit="exit"
                      className="relative flex items-center gap-2 text-[11px] pl-0">
                      {s2.status === 'skipped'
                        ? <MinusCircle size={13} className="text-amber-400 shrink-0 relative bg-navy-900 rounded-full dfm-tick-in" aria-hidden="true" />
                        : <CheckCircle2 size={13} className="text-emerald-400 shrink-0 relative bg-navy-900 rounded-full dfm-tick-in" aria-hidden="true" />}
                      <span className="text-slate-300 font-medium">{STAGE_LABEL[s2.stage] ?? s2.stage}</span>
                      <span className="text-slate-500 dfm-num">{describeStage(s2)}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {loading === 'dfm' && (
                  <li className="relative flex items-center gap-2 text-[11px] text-gold-400">
                    <span className="shrink-0 relative bg-navy-900 rounded-full flex items-center justify-center" style={{ width: 13, height: 13 }}>
                      <ButtonSpinner size={11} />
                    </span>
                    <span>{STAGE_LABEL[stages[stages.length - 1]?.stage] ?? 'Reading geometry'}…</span>
                  </li>
                )}
              </ol>

              {/* The shape of the report, while the report is still being
                  measured. Deliberately carries NO numbers and no score dial:
                  a skeleton that hints at a figure is a figure. */}
              {loading === 'dfm' && (
                <div className="mt-4 pt-4 border-t border-white/[0.07]">
                  <div className="flex items-center gap-5">
                    <div className="dfm-skeleton rounded-full shrink-0" style={{ width: 92, height: 92 }} />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="dfm-skeleton h-5 w-1/3" />
                      <div className="dfm-skeleton h-3 w-1/4" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="space-y-2">
                        <div className="dfm-skeleton h-7 w-14" />
                        <div className="dfm-skeleton h-2.5 w-20" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* GEOMETRY FIRST. This viewer used to live inside the results block, so a
            user stared at a form for up to 30 s with their part invisible, then
            saw it only once the analysis returned. CadToCostPage has always done
            it the other way round — "Independent of the parse/analyse flow
            below" — and that is the right way round: the part appears the moment
            it is chosen, and the findings paint onto it when they arrive. */}
        {file && /\.(step|stp|igs|iges)$/i.test(file.name) && (
          <div id="sec-geometry" onMouseMove={spot} className="dfm-panel dfm-spot p-5 mb-6 scroll-mt-32">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <p className="dfm-label text-slate-500 flex items-center gap-1.5">
                <Crosshair size={12} className={`text-gold-500/70 ${result ? '' : 'dfm-idle'}`} aria-hidden="true" />
                {result ? 'Geometry — findings shown on the part' : 'Geometry'}
              </p>
              {result && (
                <div className="flex items-center gap-1.5" role="group" aria-label="Highlight findings on the model">
                  {([
                    ['undercuts', `Undercuts (${draft.undercutFaceCount ?? 0})`],
                    ['zeroDraft', `Zero-draft walls (${draft.zeroDraftFaceCount ?? 0})`],
                    ['none', 'None'],
                  ] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setHighlight(k)} aria-pressed={highlight === k}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                        highlight === k
                          ? 'border-gold-500/50 bg-gold-500/15 text-gold-300'
                          : 'border-white/10 text-slate-400 hover:text-slate-200'}`}>
                      {label}
                    </button>
                  ))}
                  {/* Explode, shown only when there is genuinely more than one
                      solid to pull apart. On a single-part file the control
                      would do nothing and imply the tool had found an assembly
                      where there is none. */}
                  {((dfa?.decomposition as any)?.solidCount ?? 0) > 1 && (
                    <label className="flex items-center gap-2 text-[11px] text-slate-400">
                      Explode
                      <input type="range" min={0} max={100} value={explode * 100}
                        onChange={e => setExplode(Number(e.target.value) / 100)}
                        aria-label="Explode the assembly"
                        className="w-20 accent-gold-500" />
                    </label>
                  )}
                  <button type="button" onClick={() => setShowCallouts(v => !v)}
                    aria-pressed={showCallouts}
                    className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
                      showCallouts
                        ? 'border-gold-500/50 bg-gold-500/15 text-gold-300'
                        : 'border-white/10 text-slate-400 hover:text-slate-200'}`}>
                    Findings on model ({annotations.length})
                  </button>
                </div>
              )}
            </div>
            <CadViewer3D ref={viewerRef} file={file} token={token} highlightFaceIds={highlightIds}
              className="h-[420px] rounded-xl overflow-hidden" />
            <p className="text-slate-600 text-[11px] mt-2">
              {result
                ? 'An undercut is occluded in both tool halves and buys a slide or a lifter. A zero-draft wall drags out but scuffs, and is fixable with a degree of taper. They are deliberately shown as different problems.'
                : 'Orbit, section and measure the part now. Run the analysis and the findings will be painted onto these faces.'}
            </p>
          </div>
        )}

        {result && (
          <motion.div variants={m.stagger()} initial="hidden" animate="show" className="space-y-5">
            {/* ── THE HEADLINE ───────────────────────────────────────────────
                A finished analysis used to announce itself with a filename and
                two export buttons; the score was twelve-pixel text three
                screens down. This is the panel a director reads: the dial, the
                counted findings, the priced impact, and the coverage that says
                how much of the catalogue actually ran. Every figure is summed
                from what the engines returned — see `summary` above. */}
            <motion.div variants={m.staggerItem} id="sec-summary" onMouseMove={spot}
              className="dfm-panel dfm-spot dfm-framed relative overflow-hidden p-6 scroll-mt-32">
              {/* One scan per analysis: keyed on the content so a new result
                  replays it and nothing loops. */}
              {!m.reduced && (
                <div key={`scan|${result.partName}|${summary?.findings}|${result.analysedAt ?? ''}`}
                  className="dfm-scan" style={{ ['--scan-h' as string]: '220px' }} aria-hidden="true" />
              )}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-5 min-w-0">
                  <ScoreRing
                    score={summary?.score ?? null}
                    size={116}
                    label="DFM score"
                    sublabel={summary && summary.scoredFamilies > 1
                      ? `mean of ${summary.scoredFamilies} rule families`
                      : summary?.score === null ? 'nothing could be evaluated' : undefined}
                  />
                  <div className="min-w-0 border-l border-white/10 pl-6">
                    <p className="dfm-label text-slate-500 mb-1">Part</p>
                    <h2 className="dfm-display text-[26px] leading-none truncate max-w-[24rem]">
                      {result.partName || file?.name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-2 flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-slate-300">
                        {result.material ?? 'material not set'}
                      </span>
                      {result.processFamily && (
                        <span className="px-2 py-0.5 rounded-md bg-gold-500/10 border border-gold-500/25 text-gold-300">
                          {result.processFamily}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button {...m.press} onClick={() => exportReport('pdf')} disabled={exporting !== ''}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gold-500/30 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20 text-xs font-medium transition-colors disabled:opacity-50
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60">
                    {exporting === 'pdf' ? <ButtonSpinner size={12} /> : <FileDown size={13} aria-hidden="true" />} Export PDF
                  </motion.button>
                  <motion.button {...m.press} onClick={() => exportReport('xlsx')} disabled={exporting !== ''}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-medium transition-colors disabled:opacity-50
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">
                    {exporting === 'xlsx' ? <ButtonSpinner size={12} /> : <Table2 size={13} aria-hidden="true" />} Export Excel
                  </motion.button>
                </div>
              </div>

              {summary && (
                <div className="mt-5 pt-5 border-t border-white/[0.07] grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
                  {[
                    { label: 'Findings', value: summary.findings,
                      sub: `${summary.high} high severity`, tone: summary.high > 0 ? 'text-red-400' : 'text-white',
                      // The mix, not just the count: three lows and three highs
                      // are the same number and a completely different morning.
                      viz: 'severity' as const },
                    { label: 'Rules evaluated', value: summary.evaluated,
                      sub: `of ${summary.ruleCount} that apply`, tone: 'text-white',
                      viz: 'coverage' as const },
                    { label: 'Priced impact', value: summary.annualEur, prefix: '€', suffix: '/yr',
                      sub: summary.annualEur > 0 ? 'upper bound, engine-priced' : 'nothing priced',
                      tone: summary.annualEur > 0 ? 'text-emerald-400' : 'text-slate-500' },
                    { label: 'Not evaluated', value: summary.notEvaluated,
                      sub: 'measurement unavailable', tone: 'text-slate-300' },
                  ].map((k) => (
                    <div key={k.label} className="min-w-0">
                      <p className={`dfm-kpi-value ${k.tone}`}>
                        <TickNumber value={k.value} prefix={k.prefix ?? ''} suffix={k.suffix ?? ''} />
                      </p>
                      <p className="dfm-label text-slate-500 mt-1.5">{k.label}</p>
                      {k.viz === 'severity' && summary.findings > 0 && (
                        <div className="dfm-bar mt-2 flex" role="img"
                          aria-label={`${summary.high} high, ${summary.medium} medium, ${summary.low} low severity`}>
                          {([['bg-red-500', summary.high], ['bg-amber-500', summary.medium], ['bg-teal-500', summary.low]] as const)
                            .map(([cls, n], i) => n > 0 && (
                              <motion.span key={i} className={cls}
                                initial={{ width: 0 }}
                                animate={{ width: `${(n / summary.findings) * 100}%` }}
                                transition={m.t(0.7, 0.15 + i * 0.06)} />
                            ))}
                        </div>
                      )}
                      {k.viz === 'coverage' && summary.ruleCount > 0 && (
                        <div className="dfm-bar mt-2">
                          <motion.span className="bg-slate-400/70"
                            initial={{ width: 0 }}
                            animate={{ width: `${(summary.evaluated / summary.ruleCount) * 100}%` }}
                            transition={m.t(0.7, 0.15)} />
                        </div>
                      )}
                      <p className="text-[11px] text-slate-600 mt-1.5">{k.sub}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* ── Drawing vs model reconciliation ──────────────────────────
                When both documents were supplied, every drawing dimension was
                matched against the model's measured quantities. Conflicts are
                the rows with money in them: one of the two documents is wrong,
                and this tool deliberately does not guess which. */}
            {result.drawingCheck && (
              <motion.div variants={m.staggerItem} id="sec-drawing" className="dfm-panel dfm-framed p-4 scroll-mt-32">
                <p className="text-slate-300 text-sm font-medium mb-1">Drawing vs 3D model</p>
                <p className="text-xs">
                  <span className="text-emerald-400 font-medium">{result.drawingCheck.counts.confirmed} confirmed</span>
                  <span className="text-slate-500"> · </span>
                  <span className={result.drawingCheck.counts.conflict ? 'text-red-400 font-medium' : 'text-slate-400'}>
                    {result.drawingCheck.counts.conflict} in conflict
                  </span>
                  <span className="text-slate-500"> · {result.drawingCheck.counts.notFound} with no measured counterpart (normal — the kernel does not name most drawing dimensions)</span>
                </p>
                {result.drawingCheck.rows.filter(r2 => r2.status === 'conflict').map((r2, i) => (
                  <p key={i} className="text-xs text-red-300/90 mt-1.5">
                    ✗ <span className="font-mono">{r2.sourceText}</span> — the model's {r2.candidate?.kind} measures {r2.candidate?.valueMm} mm, {r2.candidate?.deltaMm} mm away. One of the two documents is wrong; this tool cannot say which.
                  </p>
                ))}
                <p className="text-slate-600 text-[10px] mt-2">{result.drawingCheck.basis}</p>
              </motion.div>
            )}
            {result.drawingApplied && result.drawingApplied.length > 0 && (
              <p className="text-[11px] text-sky-300/70 italic">
                Supplied by the uploaded drawing (not typed): {result.drawingApplied.join(' · ')}. Each is judged deterministically and labelled as drawing-read on its finding.
              </p>
            )}

            {/* ── Revision comparison ──────────────────────────────────────
                The second question a review asks is "did last month's changes
                work?", and the tool could not answer it. The baseline is chosen
                EXPLICITLY: auto-selecting the most recent snapshot is how a
                report ends up diffing two different parts. */}
            <div className="dfm-panel p-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-slate-300 text-sm font-medium flex items-center gap-2">
                  <Ruler size={14} className="text-gold-400" /> Compare revisions
                </p>
                <button onClick={saveRevision} disabled={savingSnap}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/25 text-xs transition-colors disabled:opacity-50">
                  {savingSnap ? <ButtonSpinner size={12} /> : null} Save this revision
                </button>
                {orgs.length > 1 && (
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    Workspace
                    <select value={orgId} onChange={e => setOrgId(e.target.value)}
                      className="bg-navy-800 border border-white/10 rounded-lg px-2 py-1.5 text-slate-200 text-xs">
                      {orgs.map(o => (
                        <option key={o.id} value={o.id}>{o.name} · {o.role}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  Baseline
                  <select value={baselineId} onChange={e => void loadBaseline(e.target.value)}
                    className="bg-navy-800 border border-white/10 rounded-lg px-2 py-1.5 text-slate-200 text-xs">
                    <option value="">None — report this revision on its own</option>
                    {snapshots.map(sn => (
                      <option key={sn.id} value={sn.id}>
                        {sn.label}{sn.savedBy && orgs.length > 1 ? ` · ${sn.savedBy}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {revisionDiff ? (
                <div className="mt-3">
                  <p className="text-white text-sm font-semibold">{revisionDiff.headline}</p>
                  <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                    <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300">{revisionDiff.counts.closed} closed</span>
                    <span className="px-2 py-1 rounded-lg bg-red-500/15 text-red-300">{revisionDiff.counts.created} new</span>
                    <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300">{revisionDiff.counts.persisting} still open</span>
                    {revisionDiff.counts.nowVisible > 0 && (
                      <span className="px-2 py-1 rounded-lg bg-teal-500/15 text-teal-300">{revisionDiff.counts.nowVisible} newly visible</span>
                    )}
                  </div>
                  {revisionDiff.warnings.map((w, i) => (
                    <p key={i} className="mt-2 text-[11px] text-amber-300/90 flex items-start gap-2">
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" /><span>{w}</span>
                    </p>
                  ))}
                  <p className="mt-2 text-slate-500 text-[11px]">
                    Both exports carry this comparison. A finding that stopped failing because the
                    measurement disappeared is listed as NOT FIXED, never as a win.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-slate-500 text-[11px]">
                  {snapshots.length
                    ? 'Choose a saved revision to compare this analysis against.'
                    : 'Save this analysis, then compare the next revision of the same part against it.'}
                  {orgs.length > 1 && ' Saved revisions and company standards belong to the workspace, so your colleagues see them too.'}
                </p>
              )}
            </div>

            {/* Analysis limits. These flags were always produced by the engine
                and never shown: a part drawn in metres reported a 0.05 mm wall
                and three confident findings, with the unit warning invisible. */}
            {(result.analysisLimits?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                <p className="text-amber-300 font-semibold text-sm flex items-center gap-2 mb-2">
                  <AlertTriangle size={15} /> Analysis limits
                </p>
                <ul className="space-y-1.5">
                  {result.analysisLimits!.map((l, i) => (
                    <li key={i} className={`text-xs ${l.severity === 'blocking' ? 'text-amber-200' : 'text-amber-300/80'}`}>
                      {l.severity === 'blocking' && <span className="font-bold uppercase mr-1.5">Blocking:</span>}
                      {l.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Measured geometry — the evidence the findings rest on */}
            <div className="dfm-panel p-5">
              <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">Measured geometry</p>
              <div className="grid sm:grid-cols-4 gap-4 text-sm">
                <Metric label="Wall p5 / p50 / p95"
                  value={wall.p50Mm ? `${wall.p5Mm} / ${wall.p50Mm} / ${wall.p95Mm} mm` : 'not measured'} />
                <Metric label="Uniformity" value={wall.uniformity ?? '—'} />
                <Metric label="Draw direction"
                  value={draft.drawDirectionXYZ ? `[${draft.drawDirectionXYZ.join(', ')}]` : '—'}
                  hint="Chosen by sweeping candidate axes, not assumed" />
                <Metric label="Undercut regions" value={String(draft.undercutFaceCount ?? '—')}
                  hint="Occluded in both tool halves — needs a slide or lifter" />
                <Metric label="Wall area below min draft"
                  value={draft.wallAreaBelowMinDraftPct != null ? `${draft.wallAreaBelowMinDraftPct}%` : '—'}
                  hint="Drag faces: fixable with taper. Distinct from undercuts." />
                <Metric label="Features"
                  value={Object.entries(feats.counts ?? {}).map(([k, v]) => `${v}x ${k}`).join(', ') || 'none named'} />
                <Metric label="Unclassified area"
                  value={feats.unclassifiedAreaPct != null ? `${feats.unclassifiedAreaPct}%` : '—'}
                  hint="Surface the feature recogniser could not name" />
                <Metric label="Setups"
                  value={String(result.geometry?.setupAnalysis?.estimatedSetupCount ?? '—')} />
              </div>
            </div>

            {/* What the RECOGNISER itself says it cannot do. The engine has
                emitted this list since the feature shipped and nothing rendered
                it, so a reader had no way to tell "no ribs on this part" from
                "ribs with curved sides are not recognised". */}
            {Array.isArray(feats.knownLimits) && feats.knownLimits.length > 0 && (
              <details className="dfm-panel p-5 group">
                <summary className="text-slate-500 text-xs uppercase tracking-wider cursor-pointer
                                    marker:content-none flex items-center gap-2
                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 rounded">
                  <ChevronRight size={13} className="transition-transform group-open:rotate-90" aria-hidden="true" />
                  What the feature recogniser cannot see ({feats.knownLimits.length})
                </summary>
                <ul className="mt-3 space-y-2">
                  {feats.knownLimits.map((l: string, i: number) => (
                    <li key={i} className="text-slate-400 text-xs flex gap-2">
                      <span className="text-slate-600 shrink-0" aria-hidden="true">·</span>{l}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Ribs, with the ratios the rules are actually written against.
                A "3x rib" count says nothing; the proportions are the finding. */}
            {Array.isArray(feats.ribs) && feats.ribs.length > 0 && (
              <div className="dfm-panel p-5">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">
                  Recognised ribs
                </p>
                <p className="text-slate-600 text-[11px] mb-3">
                  Thickness is measured at the base, where the guideline applies — drafted sides
                  are opened out by the draft term rather than reported at mid-height.
                  {wall.p50Mm
                    ? ` Ratios are against the measured ${wall.p50Mm} mm nominal wall.`
                    : ' Wall thickness could not be measured, so no ratio is shown and the rib rules abstain.'}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 text-[11px] uppercase tracking-wider text-left">
                        <th className="py-1 pr-3 font-medium">#</th>
                        <th className="py-1 pr-3 font-medium">Thickness</th>
                        <th className="py-1 pr-3 font-medium">Height</th>
                        <th className="py-1 pr-3 font-medium">Length</th>
                        <th className="py-1 pr-3 font-medium">Draft/side</th>
                        <th className="py-1 pr-3 font-medium">t / wall</th>
                        <th className="py-1 font-medium">h / wall</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {feats.ribs.map((r: any, i: number) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-1.5 pr-3 text-slate-500">{i + 1}</td>
                          <td className="py-1.5 pr-3 text-white">{r.thicknessMm} mm</td>
                          <td className="py-1.5 pr-3">{r.heightMm} mm</td>
                          <td className="py-1.5 pr-3">{r.lengthMm != null ? `${r.lengthMm} mm` : '—'}</td>
                          <td className="py-1.5 pr-3">{r.draftPerSideDeg}°</td>
                          <td className="py-1.5 pr-3">
                            {wall.p50Mm ? (r.thicknessMm / wall.p50Mm).toFixed(2) : '—'}
                          </td>
                          <td className="py-1.5">
                            {wall.p50Mm ? (r.heightMm / wall.p50Mm).toFixed(2) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Which rule families ran, and why. Without this a reader cannot
                tell a targeted analysis from a speculative sweep. */}
            {/* A PINNED AXIS MUST STATE ITS COST. Choosing the draw direction is
                often right — the die exists, the foundry has decided — but it
                can silently make every draft and undercut figure worse than the
                part needs to be, and the reader has no way to know unless the
                page says what the best available axis would have given. */}
            {(result.dfm?.draft as any)?.drawDirectionChosenBy === 'user'
              && (result.dfm?.draft as any)?.bestAvailable && (
              <p className="text-xs flex items-start gap-2 text-slate-300">
                <Info size={13} className="shrink-0 mt-0.5 text-gold-400" aria-hidden="true" />
                Draft measured along the direction you pinned,
                [{((result.dfm?.draft as any).drawDirectionXYZ ?? []).join(', ')}], which leaves{' '}
                <strong className="text-white">{(result.dfm?.draft as any).areaPct?.undercut}%</strong> undercut area.
                {(() => {
                  const best = (result.dfm?.draft as any).bestAvailable;
                  const mine = Number((result.dfm?.draft as any).areaPct?.undercut);
                  const bestPct = Number(best.undercutAreaPct);
                  if (!Number.isFinite(bestPct) || bestPct >= mine - 0.01) {
                    return <> That is the best axis available, so nothing was given up.</>;
                  }
                  return (
                    <span className="text-amber-400/90">
                      {' '}Drawing along [{(best.drawDirectionXYZ ?? []).join(', ')}] instead would leave {bestPct}% —
                      pinning this axis costs {(mine - bestPct).toFixed(2)} points of undercut area.
                    </span>
                  );
                })()}
              </p>
            )}

            {result.processConflict && (
              <p className="text-red-400 text-xs flex items-start gap-2 font-semibold">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                Process conflict: you asked for {result.processConflict.chosenName}, but the
                geometry measures as {result.processConflict.measuredName} —{' '}
                {result.processConflict.evidence.join('; ')}. Every finding below is judged
                against the family you chose.
              </p>
            )}
            {result.measuredProcess?.confidence === 'measured' && !result.processConflict && (
              <p className="text-slate-300 text-xs flex items-start gap-2">
                <Info size={13} className="shrink-0 mt-0.5 text-gold-400" />
                Process measured from the geometry: {result.measuredProcess.evidence.join('; ')}.
                The rules below were run for that family.
              </p>
            )}
            {!result.processFamily && (
              <p className="text-amber-400/90 text-xs flex items-start gap-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                No costing process was chosen and the geometry does not settle it, so every rule
                family was run speculatively — some findings below will be for processes this
                part will never see. Pick a costing process to narrow it.
              </p>
            )}

            {/* Per-process results */}
            <div id="sec-findings" className="scroll-mt-32 space-y-5">
            {result.results.filter(r => r.ruleCount > 0).map(r => (
              <motion.div key={r.process} variants={m.staggerItem} onMouseMove={spot} className="dfm-panel dfm-spot dfm-lift p-5" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h3 className="text-white font-semibold">{r.processName}</h3>
                  <div className="flex items-center gap-4 text-xs">
                    {/* One score scale for the whole page — see scoreTone(). */}
                    <span className={TONE_TEXT[scoreTone(r.score)]}>
                      Score {r.score == null ? 'not given' : `${r.score}/100`}
                      {r.score != null && <span className="text-slate-600"> · {TONE_LABEL[scoreTone(r.score)]}</span>}
                    </span>
                    {/* Coverage always sits next to the score. A score without it
                        invites the reader to assume the whole catalogue ran. It
                        is a bar now as well as a figure: 8 of 34 rules reads
                        very differently once you can see it. */}
                    <span className="flex items-center gap-2 text-slate-400">
                      Coverage
                      <span className="inline-block w-16 h-1 rounded-full bg-white/10 overflow-hidden align-middle">
                        <motion.span className="block h-full bg-slate-400/70"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(0, Math.min(100, r.coveragePct))}%` }}
                          transition={m.t(0.6, 0.1)} />
                      </span>
                      <span className="dfm-num">{r.coveragePct}% ({r.evaluatedCount}/{r.ruleCount})</span>
                    </span>
                    {r.impact?.annualEur ? <span className="text-emerald-400 dfm-num">€{r.impact.annualEur.toLocaleString()}/yr priced</span> : null}
                  </div>
                </div>

                {r.score == null && (
                  <p className="text-slate-500 text-xs mb-3 italic">
                    No rule in this family could be evaluated on this geometry, so no score is given.
                  </p>
                )}

                <motion.div variants={m.stagger()} initial="hidden" animate="show">
                {r.findings.map(f => (
                  <motion.div key={f.id} variants={m.staggerItem}
                    whileHover={m.reduced ? undefined : { y: -1 }}
                    className={`dfm-spine dfm-lift rounded-xl border p-4 pl-5 mb-3 ${SEV_STYLE[f.severity]}`}>
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h4 className="text-white font-semibold text-sm">{f.title}</h4>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* THE POINT OF THE WHOLE WAVE: a finding that can show
                            you the face that caused it. Only offered when the
                            engine actually located this kind of finding — a
                            button that flies to nowhere is worse than none. */}
                        {anchorFor(f.id) && (
                          <motion.button type="button" onClick={() => showOnModel(f.id)} {...m.press}
                            className="px-2 py-0.5 rounded-md border border-current/40 text-[10px]
                                       font-semibold uppercase tracking-wider hover:bg-white/10
                                       focus:outline-none focus:ring-2 focus:ring-gold-500/60">
                            Show on model
                          </motion.button>
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-wider">{f.severity}</span>
                      </div>
                    </div>
                    <p className="text-xs opacity-90 mb-2">
                      Measured <span className="font-semibold">{f.measured ?? '—'} {f.unit}</span> · guideline {f.thresholdText}
                    </p>
                    {/* WHERE the measured side came from — the model's own PMI,
                        the uploaded 2D drawing, or a typed declaration. Three
                        kinds of evidence a reader must never confuse. */}
                    {f.measuredBasis && (
                      <p className="text-[11px] text-sky-300/80 italic mb-2">
                        Evidence: {f.measuredBasis}
                      </p>
                    )}
                    <p className="text-slate-300 text-sm leading-relaxed mb-2">{f.rationale}</p>
                    <p className="text-emerald-300 text-xs mb-2"><span className="text-slate-500">What to do:</span> {f.fix}</p>
                    {f.cost?.priced ? (
                      <p className="text-emerald-300 text-xs">
                        <span className="text-slate-500">Cost impact:</span> {f.cost.changeDescription} saves €{f.cost.deltaEur}/part
                        {f.cost.annualDeltaEur ? ` (€${f.cost.annualDeltaEur.toLocaleString()}/yr)` : ''} — {f.cost.basis}
                        {/* A ceiling must never be shown as a forecast. This is
                            the number a director remembers. */}
                        {f.cost.caveat && (
                          <span className="block mt-1 text-amber-400/90 italic not-italic">
                            <span className="font-semibold uppercase text-[10px] tracking-wider">Upper bound — </span>
                            {f.cost.caveat}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-slate-500 text-xs">
                        <span className="text-slate-600">Not priced:</span> {f.cost?.reason}
                        {f.cost?.externalGuideline && <span className="block mt-1 text-amber-400/80 italic">{f.cost.externalGuideline}</span>}
                      </p>
                    )}
                    {/* The grade travels with the citation. "Source:" beside an
                        unaudited number claims an authority this tool has not
                        earned — the same failure it flags everywhere else. */}
                    <p className="text-slate-600 text-[10px] mt-2">
                      <span className="uppercase tracking-wider text-amber-500/70">
                        {SOURCE_GRADE[f.sourceStatus || 'industry-consensus']}
                      </span>
                      {' · '}{f.source}
                    </p>
                  </motion.div>
                ))}
                </motion.div>
                {/* Only an all-clear when something was actually checked. With
                    zero evaluated rules this would be a green tick on a family
                    nobody looked at. */}
                {!r.findings.length && r.evaluatedCount > 0 && (
                  <p className="text-emerald-400 text-sm flex items-center gap-2">
                    <CheckCircle2 size={15} /> No rule in this family was breached ({r.evaluatedCount} of {r.ruleCount} checked).
                  </p>
                )}
                {!r.findings.length && r.evaluatedCount === 0 && (
                  <p className="text-slate-500 text-sm flex items-center gap-2">
                    <MinusCircle size={15} /> Nothing in this family could be checked on this geometry — see below.
                  </p>
                )}

                {r.notEvaluated.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-slate-400 text-xs cursor-pointer hover:text-slate-200 flex items-center gap-1.5">
                      <MinusCircle size={13} /> {r.notEvaluated.length} rule{r.notEvaluated.length === 1 ? '' : 's'} could NOT be checked — these are not passes
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {r.notEvaluated.map(n => (
                        <li key={n.id} className="text-slate-500 text-xs">· {n.title} — {n.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {r.passed.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-emerald-500/80 text-xs cursor-pointer hover:text-emerald-300">
                      {r.passed.length} rule{r.passed.length === 1 ? '' : 's'} passed
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {r.passed.map(p => (
                        <li key={p.id} className="text-slate-500 text-xs">· {p.title} — {p.measured ?? '—'} {p.unit} against {p.thresholdText}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </motion.div>
            ))}
            </div>

            {/* ── EVERY VIABLE ROUTE ─────────────────────────────────────────
                The report answers "is this part good for the process you named".
                The question a cost engineer arrives with is "which process
                should make it". Both come from one measurement of the geometry:
                each row is that geometry judged by THAT process's own rule
                family and priced by the same cost engine.

                Deliberately not ranked by a blended score. Cost, manufacturability
                and CO2e are three different questions in three different units,
                and one number would hide the trade-off the reader is here for. */}
            {result.routes && result.routes.routes.length > 0 && (
              <motion.div variants={m.staggerItem} id="sec-routes" onMouseMove={spot} className="dfm-panel dfm-spot p-5 scroll-mt-32" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
                <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Layers size={15} className="text-gold-400" aria-hidden="true" />
                    {result.routes.chosenProcess
                      ? <>Alternative routes — {result.routes.chosenProcess} against the other {result.routes.routes.length - 1}</>
                      : <>Route comparison — {result.routes.routes.length} viable processes</>}
                  </h3>
                  {/* A segmented control, so the four sorts read as one choice
                      rather than four buttons that happen to sit together. */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="dfm-label text-slate-500">Sort by</span>
                    <div className="dfm-seg" role="group" aria-label="Sort routes by">
                      {(['piecePriceEur', 'score', 'kgCo2e', 'toolingEur'] as const).map(k => (
                        <button key={k} onClick={() => setRouteSort(k)} aria-pressed={routeSort === k}
                          className="dfm-seg-btn focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60">
                          {{ piecePriceEur: 'Cost', score: 'DFM score', kgCo2e: 'CO2e', toolingEur: 'Tooling' }[k]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-slate-500 text-xs mb-3">{result.routes.basis}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 border-b border-white/10">
                        <th className="text-left py-2 pr-3 font-medium">Process</th>
                        <th className="text-right py-2 px-2 font-medium">DFM score</th>
                        <th className="text-right py-2 px-2 font-medium">Rules run</th>
                        <th className="text-right py-2 px-2 font-medium">EUR / part</th>
                        <th className="text-right py-2 px-2 font-medium">Tooling</th>
                        <th className="text-right py-2 px-2 font-medium">Buy-to-fly</th>
                        <th className="text-right py-2 pl-2 font-medium">kg CO2e</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRoutes.map(r => (
                        <motion.tr key={r.process} layout={m.reduced ? false : 'position'}
                          transition={m.layout}
                          className={`border-b border-white/5 align-top dfm-row-hover ${
                            r.isChosen ? 'bg-gold-500/10 ring-1 ring-inset ring-gold-500/25' : ''}`}>
                          <td className="py-2 pr-3">
                            <span className={r.isChosen ? 'text-gold-300 font-semibold' : 'text-white'}>{r.process}</span>
                            {/* Marked in place, not lifted to the top: where the
                                chosen route SITS in a cheapest-first list is the
                                answer to "should I have picked something else". */}
                            {r.isChosen && (
                              <span className="block text-gold-400/90 mt-0.5">
                                your route — the findings above are this one
                              </span>
                            )}
                            {r.viable === false && (
                              <span className="block text-red-400/90 mt-0.5">
                                cannot make this part: {r.blockedReason}
                              </span>
                            )}
                            {r.viable !== false && !r.isChosen && Number.isFinite(r.deltaPieceEur as number) && (
                              <span className={`block mt-0.5 ${(r.deltaPieceEur as number) < 0 ? 'text-emerald-400/80' : 'text-slate-500'}`}>
                                {(r.deltaPieceEur as number) < 0 ? '−' : '+'}€{Math.abs(r.deltaPieceEur as number).toFixed(2)}/part vs your route
                              </span>
                            )}
                            {r.topFindings?.[0] && (
                              <span className="block text-slate-500 mt-0.5">
                                worst: {r.topFindings[0].title} ({r.topFindings[0].measured} vs {r.topFindings[0].thresholdText})
                              </span>
                            )}
                          </td>
                          {/* A score without its coverage invites comparison
                              between a 9-of-9 check and a 1-of-9 one. */}
                          {/* NOT VIABLE is a different statement from a low
                              score. A number invites a comparison the geometry
                              has already settled. */}
                          <td className={`text-right py-2 px-2 tabular-nums ${r.viable === false ? 'text-red-400 font-semibold' : TONE_TEXT[scoreTone(r.score)]}`}>
                            {r.viable === false ? 'not viable' : r.score === null ? '—' : r.score}
                            {r.highSeverityCount > 0 && <span className="block text-red-400/70">{r.highSeverityCount} high</span>}
                          </td>
                          <td className="text-right py-2 px-2 tabular-nums text-slate-400">
                            {r.evaluatedCount}/{r.ruleCount}
                            {r.scoreCaveat && <span className="block text-amber-400/70" title={r.scoreCaveat}>partial</span>}
                          </td>
                          <td className="text-right py-2 px-2 tabular-nums text-white relative">
                            {/* The cheapest route sets the scale; every other
                                bar is that route's price over this one's, so
                                the column reads as a comparison at a glance
                                rather than as seven numbers to subtract. */}
                            {Number.isFinite(r.piecePriceEur as number) && (r.piecePriceEur as number) > 0 && cheapestRouteEur > 0 && (
                              <motion.span aria-hidden="true"
                                className="absolute inset-y-1 right-1 rounded bg-gold-500/[0.13]"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(4, Math.min(100, (cheapestRouteEur / (r.piecePriceEur as number)) * 100))}%` }}
                                transition={m.t(0.65, 0.05)} />
                            )}
                            <span className="relative">
                              {r.piecePriceEur === null
                                ? <span className="text-slate-500">not priced<span className="sr-only">: {r.costReason}</span></span>
                                : `EUR ${r.piecePriceEur.toFixed(2)}`}
                            </span>
                          </td>
                          <td className="text-right py-2 px-2 tabular-nums text-slate-300">
                            {r.toolingEur === null ? '—' : `EUR ${Math.round(r.toolingEur).toLocaleString('en-GB')}`}
                          </td>
                          <td className="text-right py-2 px-2 tabular-nums text-slate-400">
                            {r.inputMassKg === null ? '—' : `${r.inputMassKg.toFixed(2)} kg`}
                          </td>
                          <td className="text-right py-2 pl-2 tabular-nums text-slate-300">
                            {r.kgCo2e === null
                              ? <span className="text-slate-500" title={r.carbonReason}>—</span>
                              : r.kgCo2e.toFixed(2)}
                            {r.cbamEur ? <span className="block text-amber-400/70">CBAM EUR {r.cbamEur}</span> : null}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Named, not hidden: the absence of sand casting from a list
                    looks like an oversight unless the list says why. */}
                {result.routes.skipped.length > 0 && (
                  <p className="text-slate-500 text-xs mt-3">
                    Not applicable to {result.material}: {result.routes.skipped.map(s => s.process).join(', ')}.
                  </p>
                )}
              </motion.div>
            )}

          </motion.div>
        )}

        {/* DFA */}
        {dfa?.dfa && (
          <motion.div id="sec-dfa" variants={m.panel} initial="hidden" animate="show" onMouseMove={spot}
            className="dfm-panel dfm-spot p-5 mt-5 scroll-mt-32">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><Boxes size={17} className="text-teal-400" /> Design for Assembly</h3>
            <div className="grid sm:grid-cols-4 gap-4 text-sm mb-4">
              <Metric label="Parts" value={String(dfa.dfa.totalParts)} />
              <Metric label="Assembly time" value={`${dfa.dfa.totalAssemblyTimeSec} s`} />
              <Metric label="Theoretical min"
                value={dfa.dfa.theoreticalMinParts == null ? 'withheld' : String(dfa.dfa.theoreticalMinParts)} />
              <Metric label="DFA index"
                value={dfa.dfa.designEfficiencyPct == null ? 'withheld' : `${dfa.dfa.designEfficiencyPct}%`} />
            </div>
            {!dfa.dfa.completeness?.indexAvailable && (
              <p className="text-amber-400/90 text-xs mb-3 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {dfa.dfa.completeness?.note}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-white/10">
                    <th className="text-left py-1.5 pr-3">#</th><th className="text-left pr-3">Part</th>
                    <th className="text-right pr-3">Off</th><th className="text-right pr-3">α+β</th>
                    <th className="text-right pr-3">Handle s</th><th className="text-right pr-3">Insert s</th>
                    <th className="text-right pr-3">Total s</th>
                    <th className="text-left pr-3">Fastener?</th>
                    <th className="text-left" colSpan={3}>Necessary? — answer all three to release the index</th>
                  </tr>
                </thead>
                <tbody>
                  {(dfa.dfa.rows || []).filter((r: any) => !r.skipped).map((r: any) => (
                    <tr key={r.index} className="border-b border-white/5 text-slate-300">
                      <td className="py-1.5 pr-3">{r.index}</td>
                      <td className="pr-3">{r.name}</td>
                      <td className="text-right pr-3">{r.groupSize}</td>
                      <td className="text-right pr-3">{r.symmetry?.totalDeg ?? '—'}</td>
                      <td className="text-right pr-3">{r.time?.handlingSec}</td>
                      <td className="text-right pr-3">{r.time?.insertionSec}</td>
                      <td className="text-right pr-3 font-semibold">{r.time?.totalSec}</td>
                      <td className="text-slate-500 pr-3">{r.fastener?.isFastener ? `probable (${r.fastener.confidence})` : '—'}</td>
                      {DFA_QUESTIONS.map(q => {
                        const v = answers[r.index]?.[q.key];
                        return (
                          <td key={q.key} className="pr-2 py-1">
                            <div className="flex items-center gap-0.5" role="group" aria-label={`${r.name}: ${q.hint}`}>
                              <span className="text-slate-600 text-[10px] mr-1">{q.label}</span>
                              {([['Y', true], ['N', false]] as const).map(([lbl, val]) => (
                                <button key={lbl} type="button" onClick={() => answer(r.index, q.key, val)}
                                  aria-pressed={v === val} title={q.hint}
                                  className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                                    v === val
                                      ? (val ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                                             : 'border-slate-500/50 bg-slate-500/15 text-slate-300')
                                      : 'border-white/10 text-slate-600 hover:text-slate-300'}`}>
                                  {lbl}
                                </button>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-slate-600 text-[11px] mt-3 italic">
              α+β is measured by rotating each solid and intersecting it with itself, not inferred from inertia.
              Times use the {dfa.dfa.timeModel?.version} model — {dfa.dfa.timeModel?.basis}
            </p>
          </motion.div>
        )}

        {!result && !dfa && (
          <motion.div variants={m.panel} initial="hidden" animate="show" className="dfm-panel dfm-framed p-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <div className="relative shrink-0">
                {/* An idling instrument: the dial with no needle, because
                    nothing has been measured yet. */}
                <ScoreRing score={null} size={78} label="Awaiting a part" sublabel="nothing measured yet" />
              </div>
              <div className="sm:border-l sm:border-white/10 sm:pl-5 grid sm:grid-cols-3 gap-4">
                {[
                  { icon: Upload, title: 'Measured, not guessed',
                    body: 'Draft, undercuts, wall thickness and features come off the B-rep itself — no estimate stands in for a measurement.' },
                  { icon: ShieldCheck, title: 'Cited, not asserted',
                    body: 'Every threshold names its source and its grade, from NADCA and SFSA to ISO 8062-4 and DIN 16742.' },
                  { icon: MinusCircle, title: 'Honest about silence',
                    body: 'A rule the geometry cannot answer is reported as NOT EVALUATED with the reason — never as a pass.' },
                ].map(({ icon: Icon, title, body }) => (
                  <div key={title}>
                    <p className="text-white text-xs font-semibold flex items-center gap-1.5 mb-1">
                      <Icon size={13} className="text-gold-400" aria-hidden="true" />{title}
                    </p>
                    <p className="text-slate-500 text-[11px] leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="dfm-lift rounded-lg -m-1.5 p-1.5 hover:bg-white/[0.03]">
      <p className="dfm-label text-slate-500 flex items-center gap-1">
        {label}
        {/* The hint was a `title` on a span, which a screen reader never
            announces and a keyboard user can never reveal. The icon is now
            decorative and the text itself is in the accessibility tree. */}
        {hint && (
          <>
            <HelpCircle size={11} className="text-slate-600" aria-hidden="true" />
            <span className="sr-only">{hint}</span>
          </>
        )}
      </p>
      <p className="text-white font-semibold mt-0.5 dfm-num">{value}</p>
    </div>
  );
}
