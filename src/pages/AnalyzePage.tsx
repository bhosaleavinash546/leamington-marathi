import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Upload, X, Key, Settings, AlertCircle, Car,
  FileText, Loader2, Zap, CheckCircle, Globe, Search,
  Shield, Info
} from 'lucide-react';
import { AUTOMOTIVE_SYSTEMS, getSystemById, getSubassemblyById } from '../data/automotive-catalog';
import { generateCostReductionIdeas } from '../services/claude-service';
import { AnalysisConfig, AnalysisResult } from '../types';

const VEHICLE_TYPES = [
  'Premium Luxury SUV — BEV (800V)',
  'Premium Luxury SUV — BEV (400V)',
  'Premium Luxury SUV — PHEV (MHEV 48V)',
  'Premium Luxury SUV — ICE',
  'Performance SUV — BEV (Dual-Motor)',
  'Performance SUV — BEV (Tri-Motor)',
  'Executive Saloon — BEV',
  'Executive Saloon — ICE',
  'Performance GTS Coupé — BEV',
  'Full-Size Premium SUV — ICE / MHEV',
];

const STEPS = [
  { label: 'System', icon: Car },
  { label: 'Configure', icon: Settings },
  { label: 'Upload CAD', icon: Upload },
  { label: 'Generate', icon: Zap },
];

const PURPOSE_LABELS: Record<string, string> = {
  material_cost: 'Material Costs',
  technology_benchmark: 'Tech Benchmarks',
  oem_practice: 'OEM Practices',
  supplier_capability: 'Supplier Tech',
  regulatory: 'Regulations',
};

export default function AnalyzePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [systemId, setSystemId] = useState(searchParams.get('system') || '');
  const [subassemblyId, setSubassemblyId] = useState('');
  const [partId, setPartId] = useState('');
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPES[0]);
  const [additionalContext, setAdditionalContext] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('brainspark_api_key') || '');
  const [searchApiKey, setSearchApiKey] = useState(() => localStorage.getItem('brainspark_brave_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [enableSearch, setEnableSearch] = useState(true);
  const [cadFile, setCadFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState('');

  const selectedSystem = getSystemById(systemId);
  const selectedSub = getSubassemblyById(systemId, subassemblyId);

  useEffect(() => {
    if (searchParams.get('system') && step === 0) {
      setStep(0);
    }
  }, [searchParams]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) setCadFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'model/stl': ['.stl'], 'model/iges': ['.igs', '.iges'], 'application/octet-stream': ['.stl', '.igs'] },
    maxFiles: 1,
  });

  const handleGenerate = async () => {
    if (!apiKey.trim()) { setError('Please enter your Anthropic API key.'); return; }
    if (!systemId || !subassemblyId) { setError('Please select a system and subassembly.'); return; }

    setLoading(true);
    setError('');
    localStorage.setItem('brainspark_api_key', apiKey);
    if (searchApiKey) localStorage.setItem('brainspark_brave_key', searchApiKey);

    const statusMessages = enableSearch
      ? ['Connecting to AI chief engineer...', 'Searching web for material cost data...', 'Fetching OEM benchmark references...', 'Searching for technology innovations...', 'Analysing supplier capabilities...', 'Synthesising cost reduction ideas...', 'Quantifying savings and validating...']
      : ['Connecting to AI chief engineer...', 'Applying 30-year engineering expertise...', 'Generating cost reduction ideas...', 'Quantifying savings and risk assessment...'];

    let si = 0;
    setLoadingStatus(statusMessages[0]);
    const statusInterval = setInterval(() => {
      si = (si + 1) % statusMessages.length;
      setLoadingStatus(statusMessages[si]);
    }, 4000);

    try {
      const config: AnalysisConfig = {
        systemId, subassemblyId,
        partId: partId || undefined,
        vehicleType,
        cadFileName: cadFile?.name,
        cadFileType: cadFile?.name?.split('.').pop()?.toUpperCase(),
        additionalContext,
        apiKey,
      };

      const system = getSystemById(systemId)!;
      const sub = getSubassemblyById(systemId, subassemblyId)!;
      const part = partId ? selectedSub?.parts.find(p => p.id === partId) : undefined;

      const { ideas, sources } = await generateCostReductionIdeas(
        config, system.name, sub.name, part?.name, enableSearch, searchApiKey || undefined
      );

      const quickWins = ideas.filter(i => i.implementationDifficulty === 'Low').length;
      const result: AnalysisResult = {
        config,
        ideas,
        sources,
        summary: {
          totalIdeas: ideas.length,
          quickWins,
          strategicItems: ideas.length - quickWins,
          searchesPerformed: sources.length,
        },
        generatedAt: new Date().toLocaleString(),
      };

      sessionStorage.setItem('analysisResult', JSON.stringify(result));
      sessionStorage.setItem('analysisSystemName', system.name);
      sessionStorage.setItem('analysisSubName', sub.name);
      navigate('/results');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes('ECONNREFUSED') || message.includes('fetch')
        ? 'Cannot connect to BrainSpark server. Run "npm run server" in a separate terminal and retry.'
        : `Analysis failed: ${message}`);
    } finally {
      clearInterval(statusInterval);
      setLoading(false);
      setLoadingStatus('');
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white mb-3">Cost Reduction Analysis</h1>
          <p className="text-slate-400">Chief Engineer AI — 360° expertise with live internet intelligence</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center mb-10 gap-0">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  i === step ? 'bg-gold-500 text-navy-950'
                  : i < step ? 'bg-green-500/20 text-green-400 cursor-pointer hover:bg-green-500/30'
                  : 'bg-white/5 text-slate-500'
                }`}
              >
                {i < step ? <CheckCircle size={13} /> : <s.icon size={13} />}
                {s.label}
              </button>
              {i < STEPS.length - 1 && <div className={`w-6 h-0.5 ${i < step ? 'bg-green-500/40' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 0: System Selection */}
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
                    <Car size={20} className="text-gold-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Select Vehicle System</h2>
                    <p className="text-slate-400 text-sm">13 systems — 50+ subassemblies — 250+ components</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
                  {AUTOMOTIVE_SYSTEMS.map((sys) => (
                    <motion.button
                      key={sys.id}
                      onClick={() => { setSystemId(sys.id); setSubassemblyId(''); setPartId(''); }}
                      whileHover={{ y: -3, scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className={`p-3.5 rounded-xl border text-left ${
                        systemId === sys.id
                          ? 'border-gold-500 bg-gold-500/10 shadow-lg shadow-gold-500/10'
                          : 'border-white/10 bg-white/5 hover:border-gold-500/30 hover:bg-gold-500/5'
                      }`}
                      style={systemId === sys.id ? { boxShadow: '0 0 20px rgba(245,158,11,0.12)' } : {}}
                    >
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${sys.color} flex items-center justify-center text-lg mb-2`}>
                        {sys.icon}
                      </div>
                      <div className="text-white text-xs font-semibold leading-tight">{sys.name}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{sys.subassemblies.length} subs</div>
                      {systemId === sys.id && (
                        <div className="mt-1.5 flex items-center gap-1 text-gold-400 text-xs font-medium">
                          <CheckCircle size={10} /> Selected
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>

                <button
                  disabled={!systemId}
                  onClick={() => setStep(1)}
                  className="w-full py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-navy-950 font-bold transition-all"
                >
                  Continue →
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 1: Configure */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Settings size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Configure Analysis</h2>
                    <p className="text-slate-400 text-sm">Select subassembly, part, and vehicle parameters</p>
                  </div>
                </div>

                {/* Subassembly */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Subassembly <span className="text-gold-400">*</span></label>
                  <div className="relative">
                    <select
                      value={subassemblyId}
                      onChange={e => { setSubassemblyId(e.target.value); setPartId(''); }}
                      className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-gold-500/50"
                    >
                      <option value="">— Select Subassembly —</option>
                      {selectedSystem?.subassemblies.map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.icon} {sub.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {selectedSub && <p className="text-slate-500 text-xs mt-1.5">{selectedSub.description}</p>}
                </div>

                {/* Part */}
                {selectedSub && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Specific Part <span className="text-slate-500">(optional — leave blank for whole subassembly)</span></label>
                    <div className="relative">
                      <select
                        value={partId}
                        onChange={e => setPartId(e.target.value)}
                        className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-gold-500/50"
                      >
                        <option value="">— All Parts in Subassembly —</option>
                        {selectedSub.parts.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                    {partId && <p className="text-slate-500 text-xs mt-1.5">{selectedSub.parts.find(p => p.id === partId)?.description}</p>}
                  </div>
                )}

                {/* Vehicle Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Vehicle Type & Drivetrain</label>
                  <div className="relative">
                    <select
                      value={vehicleType}
                      onChange={e => setVehicleType(e.target.value)}
                      className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-gold-500/50"
                    >
                      {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Additional context */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Engineering Context <span className="text-slate-500">(optional but recommended)</span></label>
                  <textarea
                    value={additionalContext}
                    onChange={e => setAdditionalContext(e.target.value)}
                    placeholder="e.g. Current part is DP980 steel 1.8mm, 220K units/year, target 12% cost reduction, supplier is Gestamp, concerns about rear-pole intrusion under Euro NCAP 2026 protocols..."
                    rows={3}
                    className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-gold-500/50 resize-none text-sm"
                  />
                  <p className="text-slate-600 text-xs mt-1">The more context you provide, the more precise the AI's commercial quantification.</p>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(0)} className="flex-1 py-3 rounded-xl border border-white/15 text-slate-300 hover:text-white font-medium transition-colors">← Back</button>
                  <button
                    disabled={!subassemblyId}
                    onClick={() => setStep(2)}
                    className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-950 font-bold transition-all"
                  >Continue →</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: CAD Upload */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <Upload size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Upload CAD Geometry</h2>
                    <p className="text-slate-400 text-sm">Optional — .STL or .IGS enables geometry-contextualised analysis</p>
                  </div>
                </div>

                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                    isDragActive ? 'border-gold-400 bg-gold-500/5'
                    : cadFile ? 'border-green-500 bg-green-500/5'
                    : 'border-white/20 hover:border-white/40 bg-white/3'
                  }`}
                >
                  <input {...getInputProps()} />
                  {cadFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText size={28} className="text-green-400" />
                      <div className="text-left">
                        <div className="text-white font-medium">{cadFile.name}</div>
                        <div className="text-slate-400 text-sm">{(cadFile.size / 1024).toFixed(0)} KB · {cadFile.name.split('.').pop()?.toUpperCase()} format</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setCadFile(null); }} className="ml-4 p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload size={28} className="text-slate-500 mx-auto mb-3" />
                      <p className="text-slate-300 font-medium">{isDragActive ? 'Drop file here...' : 'Drag & drop CAD file'}</p>
                      <p className="text-slate-500 text-sm mt-1">Supports .STL (surface mesh) and .IGS / .IGES formats</p>
                      <p className="text-slate-600 text-xs mt-2">Click to browse · Skip to continue without CAD</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl border border-white/15 text-slate-300 hover:text-white font-medium transition-colors">← Back</button>
                  <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold transition-all">Continue →</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Generate */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
                    <Zap size={20} className="text-gold-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Generate Analysis</h2>
                    <p className="text-slate-400 text-sm">Chief Engineer AI with real-time web intelligence</p>
                  </div>
                </div>

                {/* Config summary */}
                <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-white/5 border border-white/10 text-sm">
                  {[
                    ['System', getSystemById(systemId)?.name || '—'],
                    ['Subassembly', getSubassemblyById(systemId, subassemblyId)?.name || '—'],
                    ['Part', partId ? selectedSub?.parts.find(p => p.id === partId)?.name || '—' : 'All subassembly parts'],
                    ['Vehicle', vehicleType],
                    ['CAD File', cadFile?.name || 'None uploaded'],
                    ['Ideas to generate', '8 detailed ideas'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="text-slate-500 text-xs uppercase tracking-wide mb-0.5">{k}</div>
                      <div className="text-white font-medium truncate">{v}</div>
                    </div>
                  ))}
                </div>

                {/* Web Search Toggle */}
                <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Globe size={16} className="text-blue-400" />
                      <span className="text-white font-medium text-sm">Live Internet Intelligence</span>
                      <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/15 text-blue-300 border border-blue-500/20">Recommended</span>
                    </div>
                    <button
                      onClick={() => setEnableSearch(!enableSearch)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${enableSearch ? 'bg-blue-500' : 'bg-white/15'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enableSearch ? 'translate-x-5.5 left-0' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {enableSearch && (
                    <div className="space-y-2">
                      <p className="text-slate-400 text-xs">The AI will search the web for current material costs, OEM benchmarks, technology trends, and regulatory data before generating ideas.</p>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">
                          Brave Search API Key <span className="text-slate-600">(optional — uses DuckDuckGo free if blank)</span>
                        </label>
                        <input
                          type="password"
                          value={searchApiKey}
                          onChange={e => setSearchApiKey(e.target.value)}
                          placeholder="BSAxxxxxxxxxxxxxxxxxxxxxxxx (Brave Search API key)"
                          className="w-full bg-navy-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-700 focus:outline-none focus:border-blue-500/40 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* API Key */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <Key size={14} /> Anthropic API Key <span className="text-gold-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="sk-ant-api03-..."
                      className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-gold-500/50 font-mono text-sm pr-16"
                    />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs transition-colors">
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Shield size={11} className="text-slate-600" />
                    <p className="text-slate-600 text-xs">Key stored locally in your browser. Never sent anywhere except Anthropic's API.</p>
                  </div>
                </div>

                {/* Server note */}
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Info size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-300/80 text-xs">
                    <strong>Backend required:</strong> Run <code className="bg-black/30 px-1 rounded">npm run server</code> in a terminal (port 3001) alongside <code className="bg-black/30 px-1 rounded">vite</code> for web search to work. Or run <code className="bg-black/30 px-1 rounded">npm run dev</code> to start both together.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} disabled={loading} className="flex-1 py-3 rounded-xl border border-white/15 text-slate-300 hover:text-white font-medium disabled:opacity-40 transition-colors">← Back</button>
                  <button
                    disabled={!apiKey.trim() || loading}
                    onClick={handleGenerate}
                    className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-navy-950 font-bold flex items-center justify-center gap-2 transition-all"
                  >
                    {loading ? <><Loader2 size={18} className="animate-spin" /> Analysing...</> : <><Zap size={18} /> Generate 8 Ideas</>}
                  </button>
                </div>

                {/* Loading status */}
                {loading && (
                  <div className="p-4 rounded-xl bg-navy-800 border border-white/10 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 size={14} className="animate-spin text-gold-400" />
                      <span className="text-gold-400 font-medium">{loadingStatus}</span>
                    </div>
                    {enableSearch && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(PURPOSE_LABELS).map(([key, label]) => (
                          <div key={key} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-400">
                            <Search size={10} className="text-blue-400" />
                            {label}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-slate-600 text-xs">Typical time: {enableSearch ? '30–60 seconds (with web search)' : '15–25 seconds'} — Claude claude-opus-4-8 generating 8 expert ideas</p>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-gold-500 to-amber-400 rounded-full animate-pulse w-3/4" />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
