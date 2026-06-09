import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Upload, X, Key, Settings, AlertCircle,
  Car, Cpu, FileText, Loader2, Zap, CheckCircle
} from 'lucide-react';
import { AUTOMOTIVE_SYSTEMS, getSystemById, getSubassemblyById } from '../data/automotive-catalog';
import { generateCostReductionIdeas } from '../services/claude-service';
import { AnalysisConfig, AnalysisResult } from '../types';

const VEHICLE_TYPES = [
  'Premium Luxury SUV (ICE)',
  'Premium Luxury SUV (EV)',
  'Premium Luxury SUV (PHEV)',
  'Performance SUV (EV)',
  'Executive Saloon (ICE)',
  'Executive Saloon (EV)',
  'Performance GTS Coupe',
];

const STEPS = ['System', 'Configure', 'Upload CAD', 'Generate'];

export default function AnalyzePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [systemId, setSystemId] = useState(searchParams.get('system') || '');
  const [subassemblyId, setSubassemblyId] = useState('');
  const [partId, setPartId] = useState('');
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPES[0]);
  const [additionalContext, setAdditionalContext] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('autocost_api_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [cadFile, setCadFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedSystem = getSystemById(systemId);
  const selectedSub = getSubassemblyById(systemId, subassemblyId);

  useEffect(() => {
    if (searchParams.get('system')) {
      setStep(0);
    }
  }, [searchParams]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) setCadFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'model/stl': ['.stl'], 'model/iges': ['.igs', '.iges'] },
    maxFiles: 1,
  });

  const handleGenerate = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your Anthropic API key to generate ideas.');
      return;
    }
    if (!systemId || !subassemblyId) {
      setError('Please select a system and subassembly.');
      return;
    }

    setLoading(true);
    setError('');
    localStorage.setItem('autocost_api_key', apiKey);

    try {
      const config: AnalysisConfig = {
        systemId,
        subassemblyId,
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

      const ideas = await generateCostReductionIdeas(config, system.name, sub.name, part?.name);

      const quickWins = ideas.filter(i => i.implementationDifficulty === 'Low').length;
      const result: AnalysisResult = {
        config,
        ideas,
        summary: {
          totalIdeas: ideas.length,
          totalPotentialSaving: 'See individual ideas',
          quickWins,
          strategicItems: ideas.length - quickWins,
        },
        generatedAt: new Date().toLocaleString(),
      };

      sessionStorage.setItem('analysisResult', JSON.stringify(result));
      sessionStorage.setItem('analysisSystemName', system.name);
      sessionStorage.setItem('analysisSubName', sub.name);
      navigate('/results');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Analysis failed: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const canProceedStep0 = !!systemId;
  const canProceedStep1 = !!subassemblyId;
  const canGenerate = !!apiKey.trim();

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white mb-3">Cost Reduction Analysis</h1>
          <p className="text-slate-400">Select your system and let the AI generate technical cost reduction ideas</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center mb-10 gap-0">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  i === step
                    ? 'bg-gold-500 text-navy-950'
                    : i < step
                    ? 'bg-green-500/20 text-green-400 cursor-pointer hover:bg-green-500/30'
                    : 'bg-white/5 text-slate-500'
                }`}
              >
                {i < step ? <CheckCircle size={14} /> : <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">{i + 1}</span>}
                {s}
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-green-500/40' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 0: System Selection */}
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
                    <Car size={20} className="text-gold-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Select Vehicle System</h2>
                    <p className="text-slate-400 text-sm">Choose the top-level automotive system to analyze</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
                  {AUTOMOTIVE_SYSTEMS.map((sys) => (
                    <button
                      key={sys.id}
                      onClick={() => { setSystemId(sys.id); setSubassemblyId(''); setPartId(''); }}
                      className={`p-4 rounded-xl border text-left transition-all hover:-translate-y-0.5 ${
                        systemId === sys.id
                          ? 'border-gold-500 bg-gold-500/10'
                          : 'border-white/10 bg-white/5 hover:border-white/25'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${sys.color} flex items-center justify-center text-xl mb-2`}>
                        {sys.icon}
                      </div>
                      <div className="text-white text-sm font-semibold leading-tight">{sys.name}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{sys.subassemblies.length} subassemblies</div>
                      {systemId === sys.id && (
                        <div className="mt-2 flex items-center gap-1 text-gold-400 text-xs font-medium">
                          <CheckCircle size={12} /> Selected
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <button
                  disabled={!canProceedStep0}
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
            <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Settings size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Configure Analysis</h2>
                    <p className="text-slate-400 text-sm">Select subassembly and vehicle parameters</p>
                  </div>
                </div>

                {/* Subassembly */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Subassembly <span className="text-gold-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={subassemblyId}
                      onChange={e => { setSubassemblyId(e.target.value); setPartId(''); }}
                      className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-gold-500/50 transition-colors"
                    >
                      <option value="">— Select Subassembly —</option>
                      {selectedSystem?.subassemblies.map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {selectedSub && (
                    <p className="text-slate-500 text-xs mt-1.5">{selectedSub.description}</p>
                  )}
                </div>

                {/* Part (optional) */}
                {selectedSub && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Specific Part <span className="text-slate-500">(optional)</span>
                    </label>
                    <div className="relative">
                      <select
                        value={partId}
                        onChange={e => setPartId(e.target.value)}
                        className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-gold-500/50 transition-colors"
                      >
                        <option value="">— All Parts in Subassembly —</option>
                        {selectedSub.parts.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Vehicle Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Vehicle Type</label>
                  <div className="relative">
                    <select
                      value={vehicleType}
                      onChange={e => setVehicleType(e.target.value)}
                      className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-gold-500/50 transition-colors"
                    >
                      {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Additional context */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Additional Context <span className="text-slate-500">(optional)</span>
                  </label>
                  <textarea
                    value={additionalContext}
                    onChange={e => setAdditionalContext(e.target.value)}
                    placeholder="e.g. Current part is HSLA 420 steel 2.0mm, target 15% cost reduction, concerns about corrosion near salt zones..."
                    rows={3}
                    className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-gold-500/50 transition-colors resize-none text-sm"
                  />
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(0)} className="flex-1 py-3 rounded-xl border border-white/15 text-slate-300 hover:text-white transition-colors font-medium">
                    ← Back
                  </button>
                  <button
                    disabled={!canProceedStep1}
                    onClick={() => setStep(2)}
                    className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-navy-950 font-bold transition-all"
                  >
                    Continue →
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: CAD Upload */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <Upload size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Upload CAD Geometry</h2>
                    <p className="text-slate-400 text-sm">Optional — upload .STL or .IGS for geometry-aware analysis</p>
                  </div>
                </div>

                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                    isDragActive
                      ? 'border-gold-400 bg-gold-500/5'
                      : cadFile
                      ? 'border-green-500 bg-green-500/5'
                      : 'border-white/20 hover:border-white/40 bg-white/3'
                  }`}
                >
                  <input {...getInputProps()} />
                  {cadFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText size={32} className="text-green-400" />
                      <div className="text-left">
                        <div className="text-white font-medium">{cadFile.name}</div>
                        <div className="text-slate-400 text-sm">{(cadFile.size / 1024).toFixed(0)} KB</div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setCadFile(null); }}
                        className="ml-4 p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload size={32} className="text-slate-500 mx-auto mb-3" />
                      <p className="text-slate-300 font-medium">
                        {isDragActive ? 'Drop the file here...' : 'Drag & drop CAD file'}
                      </p>
                      <p className="text-slate-500 text-sm mt-1">Supports .STL and .IGS / .IGES formats</p>
                      <p className="text-slate-600 text-xs mt-3">Click to browse, or skip to continue without CAD</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4 text-sm text-blue-300">
                  <strong>Note:</strong> The AI will reference uploaded geometry by filename and common manufacturing issues for this part type. Full geometric parsing requires server-side processing (not included in this browser-based demo).
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl border border-white/15 text-slate-300 hover:text-white transition-colors font-medium">
                    ← Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold transition-all"
                  >
                    Continue →
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Generate */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
                    <Zap size={20} className="text-gold-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Generate Analysis</h2>
                    <p className="text-slate-400 text-sm">Enter your API key and launch the AI analysis</p>
                  </div>
                </div>

                {/* Config summary */}
                <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">System</div>
                    <div className="text-white text-sm font-medium">{selectedSystem?.name}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Subassembly</div>
                    <div className="text-white text-sm font-medium">{selectedSub?.name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Vehicle Type</div>
                    <div className="text-white text-sm font-medium">{vehicleType}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">CAD File</div>
                    <div className="text-white text-sm font-medium">{cadFile?.name || 'None uploaded'}</div>
                  </div>
                </div>

                {/* API Key */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <Key size={14} />
                    Anthropic API Key <span className="text-gold-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="sk-ant-api03-..."
                      className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-gold-500/50 transition-colors font-mono text-sm pr-20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs transition-colors"
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="text-slate-600 text-xs mt-1.5 flex items-center gap-1">
                    <Cpu size={11} />
                    Key is stored locally in your browser. Uses claude-opus-4-8 model for best quality.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl border border-white/15 text-slate-300 hover:text-white transition-colors font-medium disabled:opacity-40"
                  >
                    ← Back
                  </button>
                  <button
                    disabled={!canGenerate || loading}
                    onClick={handleGenerate}
                    className="flex-2 flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-navy-950 font-bold transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Generating Ideas...
                      </>
                    ) : (
                      <>
                        <Zap size={18} />
                        Generate Ideas
                      </>
                    )}
                  </button>
                </div>

                {loading && (
                  <div className="text-center p-4 rounded-xl bg-gold-500/5 border border-gold-500/15">
                    <div className="flex items-center justify-center gap-2 text-gold-400 text-sm mb-2">
                      <Loader2 size={14} className="animate-spin" />
                      AI is analyzing the {selectedSub?.name}...
                    </div>
                    <p className="text-slate-500 text-xs">This may take 15–30 seconds. Claude is generating 7 detailed cost reduction ideas.</p>
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
