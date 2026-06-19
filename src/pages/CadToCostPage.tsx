import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileBox, AlertTriangle, CheckCircle, BarChart3,
  TrendingDown, DollarSign, Wrench, Layers, ChevronRight, RefreshCw,
  Cpu, Info, Shield, Package, Zap, Target, Star,
} from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { parseCadFile, formatFileSize, estimateMass, type CadGeometry } from '../services/cad-parser';
import { useAuth } from '../contexts/AuthContext';
import { ConfidenceLevel } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostBreakdown {
  material: { value: number; currency: string; basis: string };
  process:  { value: number; currency: string; basis: string };
  tooling:  { value: number; currency: string; basis: string };
  overhead: { value: number; currency: string; basis: string };
  totalUnit:{ value: number; currency: string };
}

interface CadRecommendation {
  id: string;
  title: string;
  category: 'material' | 'process' | 'design' | 'commonisation';
  difficulty: 'Low' | 'Medium' | 'High';
  saving: string;
  annualSaving: string;
  description: string;
}

interface CadResult {
  partName: string;
  inferredMaterial: string;
  inferredProcess: string;
  complexity: 'Low' | 'Medium' | 'High';
  massEstimateKg: number | null;
  dfmaScore: number;
  dfmaScoreRationale: string;
  costBreakdown: CostBreakdown;
  annualSpend: { value: number; currency: string };
  confidence: ConfidenceLevel;
  benchmarkReference: string;
  recommendations: CadRecommendation[];
  topRisks: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_FORMATS = '.step,.stp,.stl,.dxf,.dwg,.png,.jpg,.jpeg,.webp,.pdf';

const PLANT_REGIONS = [
  { value: 'germany', label: 'Germany (€45-55/hr)' },
  { value: 'uk',      label: 'UK (£35-45/hr)' },
  { value: 'czech',   label: 'Czech/Slovak (€15-20/hr)' },
  { value: 'spain',   label: 'Spain (€20-28/hr)' },
  { value: 'mexico',  label: 'Mexico ($8-12/hr)' },
  { value: 'usa',     label: 'USA ($40-55/hr)' },
  { value: 'china',   label: 'China (¥70-130/hr)' },
  { value: 'india',   label: 'India (₹800-1,200/hr)' },
  { value: 'korea',   label: 'Korea (€25-32/hr)' },
];

const CURRENCIES = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'CNY', label: 'CNY (¥)' },
];

const MATERIAL_PRESETS = [
  'Auto-detect from drawing',
  'DP780 AHSS (stamping)',
  'PHS 22MnB5 (hot stamp)',
  'EN-AW A380 HPDC aluminium',
  'EN-AW A356 casting aluminium',
  'Grey cast iron GJL-250',
  'Forged 42CrMo4 steel',
  'PA66-GF30 injection moulding',
  'PP-EPDM injection moulding',
  'CFRP prepreg (autoclave)',
  'Custom — see notes',
];

const PROCESS_PRESETS = [
  'Auto-detect from geometry',
  'Progressive die stamping',
  'HPDC aluminium die casting',
  'Cold forging',
  'Hot forging + machining',
  'CNC machining from billet',
  'Injection moulding',
  'Roll forming',
  'Hydroforming',
  'Hot stamping (PHS)',
  'Lost-wax investment casting',
];

const CATEGORY_CONFIG: Record<CadRecommendation['category'], { color: string; bg: string; label: string }> = {
  material:       { color: 'text-blue-300',    bg: 'bg-blue-500/10 border-blue-500/20',    label: 'Material' },
  process:        { color: 'text-purple-300',  bg: 'bg-purple-500/10 border-purple-500/20',label: 'Process' },
  design:         { color: 'text-amber-300',   bg: 'bg-amber-500/10 border-amber-500/20',  label: 'Design' },
  commonisation:  { color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20',label: 'Commonisation' },
};

const DIFF_CONFIG: Record<string, { color: string; bg: string }> = {
  Low:    { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/25' },
  Medium: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25' },
  High:   { color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/25' },
};

const CONF_CONFIG: Record<ConfidenceLevel, { label: string; color: string }> = {
  verified:    { label: 'Verified',    color: 'text-green-400' },
  benchmarked: { label: 'Benchmarked', color: 'text-blue-400' },
  estimated:   { label: 'Estimated',   color: 'text-amber-400' },
  theoretical: { label: 'Theoretical', color: 'text-purple-400' },
};

function currencySymbol(cur: string) {
  return { EUR: '€', GBP: '£', USD: '$', CNY: '¥' }[cur] ?? '€';
}

function formatCost(value: number, currency: string) {
  const sym = currencySymbol(currency);
  if (value >= 1000000) return `${sym}${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000)    return `${sym}${(value / 1000).toFixed(1)}K`;
  return `${sym}${value.toFixed(2)}`;
}

// ─── DFMA Score Ring ─────────────────────────────────────────────────────────

function DfmaRing({ score }: { score: number }) {
  const pct = score / 10;
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const color = score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative flex items-center justify-center">
      <svg width={100} height={100}>
        <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
        <circle
          cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black" style={{ color }}>{score}</span>
        <span className="text-slate-500 text-[10px] font-semibold uppercase">/10</span>
      </div>
    </div>
  );
}

// ─── Cost Bar Chart ───────────────────────────────────────────────────────────

function CostBar({ breakdown, currency }: { breakdown: CostBreakdown; currency: string }) {
  const items = [
    { label: 'Material', value: breakdown.material.value, color: '#3b82f6' },
    { label: 'Process',  value: breakdown.process.value,  color: '#8b5cf6' },
    { label: 'Tooling',  value: breakdown.tooling.value,  color: '#f59e0b' },
    { label: 'Overhead', value: breakdown.overhead.value, color: '#6b7280' },
  ];
  const total = breakdown.totalUnit.value || items.reduce((s, i) => s + i.value, 0);

  return (
    <div>
      <div className="flex h-8 rounded-lg overflow-hidden mb-3">
        {items.map(({ label, value, color }) => {
          const pct = total > 0 ? (value / total) * 100 : 0;
          return (
            <div key={label} style={{ width: `${pct}%`, backgroundColor: color }}
              className="flex items-center justify-center text-white text-xs font-bold transition-all"
              title={`${label}: ${formatCost(value, currency)} (${pct.toFixed(0)}%)`}
            >
              {pct >= 14 ? `${pct.toFixed(0)}%` : ''}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-slate-400 text-xs">{label}</span>
            <span className="text-white text-xs font-medium">{formatCost(value, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CadToCostPage() {
  const { token } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [geometry, setGeometry] = useState<CadGeometry | null>(null);
  const [parsing, setParsing] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<CadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Config state
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('brainspark_api_key') || '');
  const [annualVolume, setAnnualVolume] = useState(50000);
  const [plantRegion, setPlantRegion] = useState('germany');
  const [currency, setCurrency] = useState('EUR');
  const [programmeLengthYears, setProgrammeLengthYears] = useState(5);
  const [materialSpec, setMaterialSpec] = useState('Auto-detect from drawing');
  const [processSpec, setProcessSpec] = useState('Auto-detect from geometry');

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    setParsing(true);
    try {
      const geo = await parseCadFile(f);
      if (geo.estimatedVolume && !geo.estimatedMass) {
        geo.estimatedMass = estimateMass(geo.estimatedVolume);
      }
      setGeometry(geo);
    } catch (e: any) {
      setError(`Failed to parse file: ${e.message}`);
    } finally {
      setParsing(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleAnalyse = async () => {
    if (!geometry || !apiKey.trim()) return;
    setAnalysing(true);
    setError(null);
    try {
      const res = await fetch('/api/cad-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          geometry: {
            ...geometry,
            // Truncate base64 if very large to stay within 10MB JSON limit
            base64Data: geometry.base64Data?.slice(0, 5_000_000),
          },
          config: {
            annualVolume, plantRegion, currency, programmeLengthYears,
            materialSpec: materialSpec !== 'Auto-detect from drawing' ? materialSpec : undefined,
            processSpec:  processSpec  !== 'Auto-detect from geometry' ? processSpec : undefined,
          },
          apiKey: apiKey.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: CadResult = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalysing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setGeometry(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-navy-950 pt-16">
      {/* Hero */}
      <div className="bg-gradient-to-b from-navy-900 to-navy-950 border-b border-white/8 px-4 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center flex-shrink-0">
              <FileBox size={22} className="text-gold-400" />
            </div>
            <div>
              <p className="text-gold-400 text-xs font-semibold uppercase tracking-widest mb-1">CAD to Cost</p>
              <h1 className="text-3xl font-bold text-white mb-2">CAD → Cost Estimation</h1>
              <p className="text-slate-400 text-sm max-w-2xl">
                Upload a STEP, STL, DXF or engineering drawing. BrainSpark extracts geometry, counts features and generates an expert cost estimate + DFMA score with actionable recommendations.
              </p>
            </div>
          </div>

          {/* Format chips */}
          <div className="flex flex-wrap gap-2 mt-5">
            {[
              { label: 'STEP / STP', sub: '3D B-rep', icon: Layers },
              { label: 'STL',        sub: 'Mesh',     icon: Package },
              { label: 'DXF / DWG',  sub: '2D drawing', icon: BarChart3 },
              { label: 'PNG / JPG',  sub: 'CAD screenshot', icon: Zap },
              { label: 'PDF',        sub: 'Drawing sheet', icon: Shield },
            ].map(({ label, sub, icon: Icon }) => (
              <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs">
                <Icon size={11} className="text-gold-400" />
                <span className="text-white font-medium">{label}</span>
                <span className="text-slate-500">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* API key strip */}
        {!apiKey && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <span className="text-amber-300 text-sm">An Anthropic API key is required. Enter it below or in Settings.</span>
          </div>
        )}
        <div>
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider block mb-1.5">Anthropic API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); localStorage.setItem('brainspark_api_key', e.target.value); }}
            placeholder="sk-ant-api03-..."
            className="w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/50"
          />
        </div>

        {/* Upload zone */}
        {!file ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              dragOver ? 'border-gold-500/60 bg-gold-500/5' : 'border-white/15 hover:border-gold-500/35 hover:bg-white/3'
            }`}
          >
            <input ref={fileRef} type="file" accept={ACCEPTED_FORMATS} className="hidden" onChange={onInputChange} />
            <div className="flex flex-col items-center gap-3">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${dragOver ? 'bg-gold-500/20' : 'bg-white/5'}`}>
                <Upload size={28} className={dragOver ? 'text-gold-400' : 'text-slate-500'} />
              </div>
              <div>
                <p className="text-white font-semibold text-lg">Drop your CAD file here</p>
                <p className="text-slate-500 text-sm mt-1">or click to browse · STEP · STL · DXF · PNG · JPG · PDF</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold-500/15 border border-gold-500/25 flex items-center justify-center">
                  <FileBox size={18} className="text-gold-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">{file.name}</p>
                  <p className="text-slate-500 text-xs">{formatFileSize(file.size)} · {geometry?.fileType?.toUpperCase()}</p>
                </div>
              </div>
              <button onClick={reset} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs transition-colors">
                <RefreshCw size={13} /> Change file
              </button>
            </div>

            {parsing && (
              <div className="flex items-center gap-2 text-gold-400 text-sm">
                <ButtonSpinner size={14} /> Parsing geometry…
              </div>
            )}

            {geometry && !parsing && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {geometry.boundingBox && (
                  <div className="bg-white/4 rounded-xl p-3">
                    <p className="text-slate-500 text-xs mb-1">Bounding Box</p>
                    <p className="text-white text-sm font-mono">{geometry.boundingBox.x} × {geometry.boundingBox.y} × {geometry.boundingBox.z} mm</p>
                  </div>
                )}
                {geometry.estimatedVolume !== undefined && (
                  <div className="bg-white/4 rounded-xl p-3">
                    <p className="text-slate-500 text-xs mb-1">Est. Volume</p>
                    <p className="text-white text-sm font-mono">{geometry.estimatedVolume.toFixed(2)} cm³</p>
                  </div>
                )}
                {geometry.estimatedMass !== undefined && (
                  <div className="bg-white/4 rounded-xl p-3">
                    <p className="text-slate-500 text-xs mb-1">Est. Mass (steel)</p>
                    <p className="text-white text-sm font-mono">{geometry.estimatedMass} kg</p>
                  </div>
                )}
                {geometry.triangleCount !== undefined && (
                  <div className="bg-white/4 rounded-xl p-3">
                    <p className="text-slate-500 text-xs mb-1">Triangles</p>
                    <p className="text-white text-sm font-mono">{geometry.triangleCount.toLocaleString()}</p>
                  </div>
                )}
                {geometry.featureCounts && Object.entries(geometry.featureCounts).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="bg-white/4 rounded-xl p-3">
                    <p className="text-slate-500 text-xs mb-1 capitalize">{k}</p>
                    <p className="text-white text-sm font-mono">{v}</p>
                  </div>
                ))}
                {geometry.isImage && (
                  <div className="col-span-2 sm:col-span-4 bg-blue-500/8 border border-blue-500/20 rounded-xl p-3 flex items-center gap-2">
                    <Info size={14} className="text-blue-400 flex-shrink-0" />
                    <span className="text-blue-300 text-xs">Drawing image detected — Claude Vision will read dimensions, features and material spec directly from the drawing.</span>
                  </div>
                )}
                {geometry.extractedMaterial && (
                  <div className="col-span-2 bg-white/4 rounded-xl p-3">
                    <p className="text-slate-500 text-xs mb-1">Material (from drawing)</p>
                    <p className="text-white text-sm">{geometry.extractedMaterial}</p>
                  </div>
                )}
                {geometry.extractedDimensions && geometry.extractedDimensions.length > 0 && (
                  <div className="col-span-2 sm:col-span-4 bg-white/4 rounded-xl p-3">
                    <p className="text-slate-500 text-xs mb-1">Extracted Dimensions</p>
                    <p className="text-slate-300 text-xs font-mono">{geometry.extractedDimensions.slice(0, 12).join(', ')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Config panel */}
        {file && geometry && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-navy-900 border border-white/10 rounded-2xl p-5 space-y-4"
          >
            <h3 className="text-white font-semibold flex items-center gap-2"><Cpu size={15} className="text-gold-400" /> Analysis Parameters</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-slate-400 text-xs font-semibold block mb-1.5">Annual Volume</label>
                <input type="number" min={1000} max={2000000} step={1000} value={annualVolume}
                  onChange={e => setAnnualVolume(parseInt(e.target.value) || 50000)}
                  className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs font-semibold block mb-1.5">Plant Region</label>
                <select value={plantRegion} onChange={e => setPlantRegion(e.target.value)}
                  className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50"
                >
                  {PLANT_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-semibold block mb-1.5">Currency</label>
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                  className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50"
                >
                  {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-semibold block mb-1.5">Programme Length</label>
                <select value={programmeLengthYears} onChange={e => setProgrammeLengthYears(parseInt(e.target.value))}
                  className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50"
                >
                  {[3, 4, 5, 6, 7, 8].map(y => <option key={y} value={y}>{y} years</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 text-xs font-semibold block mb-1.5">Material Specification</label>
                <select value={materialSpec} onChange={e => setMaterialSpec(e.target.value)}
                  className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50"
                >
                  {MATERIAL_PRESETS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-semibold block mb-1.5">Manufacturing Process</label>
                <select value={processSpec} onChange={e => setProcessSpec(e.target.value)}
                  className="w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500/50"
                >
                  {PROCESS_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={handleAnalyse}
              disabled={analysing || !apiKey.trim()}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 text-navy-950 font-bold text-sm transition-all hover:from-gold-400 hover:to-gold-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analysing ? <><ButtonSpinner size={16} /> Analysing…</> : <><Target size={16} /> Analyse Cost & DFMA</>}
            </button>
          </motion.div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20"
            >
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

              {/* Header card */}
              <div className="bg-navy-900 border border-gold-500/20 rounded-2xl p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle size={16} className="text-green-400" />
                      <span className="text-green-400 text-xs font-semibold uppercase tracking-wider">Analysis Complete</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">{result.partName}</h2>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium">{result.inferredMaterial}</span>
                      <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium">{result.inferredProcess}</span>
                      <span className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${DIFF_CONFIG[result.complexity]?.bg} ${DIFF_CONFIG[result.complexity]?.color}`}>{result.complexity} complexity</span>
                      {result.massEstimateKg && (
                        <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs">{result.massEstimateKg.toFixed(2)} kg</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500 text-xs mb-1">Unit Cost</p>
                    <p className="text-3xl font-black text-gold-400">{formatCost(result.costBreakdown.totalUnit.value, result.costBreakdown.totalUnit.currency)}</p>
                    <p className="text-slate-500 text-xs mt-1">Annual: {formatCost(result.annualSpend.value, result.annualSpend.currency)}</p>
                    <p className={`text-xs mt-0.5 ${CONF_CONFIG[result.confidence]?.color}`}>
                      {CONF_CONFIG[result.confidence]?.label} estimate
                    </p>
                  </div>
                </div>

                {/* Cost bar */}
                <CostBar breakdown={result.costBreakdown} currency={result.costBreakdown.totalUnit.currency} />

                {/* Cost breakdown detail */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {(['material', 'process', 'tooling', 'overhead'] as const).map(key => (
                    <div key={key} className="bg-white/4 rounded-xl p-3">
                      <p className="text-slate-500 text-xs capitalize mb-0.5">{key}</p>
                      <p className="text-white font-semibold">{formatCost(result.costBreakdown[key].value, result.costBreakdown[key].currency)}</p>
                      <p className="text-slate-600 text-[10px] leading-tight mt-1">{result.costBreakdown[key].basis}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* DFMA Score + benchmark */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-navy-900 border border-white/10 rounded-2xl p-6">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <Star size={15} className="text-gold-400" /> DFMA Score
                  </h3>
                  <div className="flex items-center gap-6">
                    <DfmaRing score={result.dfmaScore} />
                    <div>
                      <p className="text-slate-400 text-sm leading-relaxed">{result.dfmaScoreRationale}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-navy-900 border border-white/10 rounded-2xl p-6">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 size={15} className="text-blue-400" /> Industry Benchmark
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed">{result.benchmarkReference}</p>

                  {result.topRisks?.length > 0 && (
                    <div className="mt-4">
                      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Top Risks</p>
                      <ul className="space-y-1.5">
                        {result.topRisks.map((risk, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                            <AlertTriangle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Recommendations */}
              {result.recommendations?.length > 0 && (
                <div className="bg-navy-900 border border-white/10 rounded-2xl p-6">
                  <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                    <TrendingDown size={15} className="text-green-400" /> DFMA Cost-Reduction Recommendations
                    <span className="ml-auto text-slate-500 text-xs font-normal">Ordered by saving potential</span>
                  </h3>
                  <div className="space-y-3">
                    {result.recommendations.map((rec, i) => {
                      const cat = CATEGORY_CONFIG[rec.category] ?? CATEGORY_CONFIG.design;
                      const diff = DIFF_CONFIG[rec.difficulty] ?? DIFF_CONFIG.Medium;
                      return (
                        <motion.div key={rec.id || i}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="bg-navy-800/60 border border-white/8 rounded-xl p-4 hover:border-gold-500/20 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="w-6 h-6 rounded-md bg-gold-500/15 border border-gold-500/20 flex items-center justify-center text-gold-400 text-xs font-bold flex-shrink-0">{i + 1}</span>
                              <span className="text-white font-semibold text-sm">{rec.title}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cat.bg} ${cat.color}`}>{cat.label}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${diff.bg} ${diff.color}`}>{rec.difficulty}</span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-green-400 font-bold text-sm whitespace-nowrap">{rec.saving}</p>
                              <p className="text-slate-500 text-xs whitespace-nowrap">{rec.annualSaving}</p>
                            </div>
                          </div>
                          <p className="text-slate-400 text-xs leading-relaxed pl-8">{rec.description}</p>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Total potential savings */}
                  <div className="mt-5 p-4 rounded-xl bg-gold-500/8 border border-gold-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign size={16} className="text-gold-400" />
                      <span className="text-gold-300 font-semibold text-sm">Total savings if all implemented</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Wrench size={13} className="text-slate-500" />
                      <span className="text-slate-400 text-xs">requires engineering validation</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Re-analyse button */}
              <button onClick={handleAnalyse} disabled={analysing}
                className="flex items-center gap-2 text-gold-400 hover:text-gold-300 text-sm font-medium transition-colors"
              >
                <RefreshCw size={14} /> Re-analyse with different parameters
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer note */}
        <p className="text-slate-700 text-xs text-center pb-4">
          Cost estimates are directional — not supplier quotes. CAD geometry is processed client-side and not stored.
          Designed &amp; Created by <strong className="text-slate-600">Avinash Bhosale</strong>
        </p>
      </div>
    </div>
  );
}
