import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Upload, X, Key, Settings, AlertCircle, Car,
  FileText, Zap, CheckCircle, Globe, Search,
  Shield, Info, Factory, TrendingUp, Mic, MicOff
} from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { toast } from '../hooks/useToast';
import { AUTOMOTIVE_SYSTEMS, getSystemById, getSubassemblyById } from '../data/automotive-catalog';
import { generateCostReductionIdeas, saveFullResult, ProgressEvent } from '../services/claude-service';
import { parseCadFile, CadGeometry, formatFileSize } from '../services/cad-parser';
import { AnalysisConfig, AnalysisResult, BodyStyle, PlantRegion, Currency } from '../types';

interface ProgressStep {
  id: string;
  label: string;
  detail?: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

const VEHICLE_TYPES = [
  // BEV
  'City Car / A-Segment — BEV',
  'Compact Hatchback — BEV (400V)',
  'Compact Hatchback — BEV (800V)',
  'Family Hatchback — BEV (400V)',
  'Family Sedan — BEV (400V)',
  'Family Sedan — BEV (800V)',
  'Executive Saloon — BEV (400V)',
  'Executive Saloon — BEV (800V)',
  'Compact Crossover / CUV — BEV (400V)',
  'Compact Crossover / CUV — BEV (800V)',
  'Mid-Size SUV — BEV (400V)',
  'Mid-Size SUV — BEV (800V)',
  'Full-Size Premium SUV — BEV (800V)',
  'Premium Luxury SUV — BEV (800V)',
  'Performance SUV — BEV (Dual-Motor, 800V)',
  'Performance SUV — BEV (Tri-Motor, 800V)',
  'Performance GTS Coupé — BEV (800V)',
  'MPV / People Carrier — BEV',
  'Pickup Truck — BEV',
  // PHEV / MHEV
  'Compact Hatchback — PHEV (48V MHEV)',
  'Mid-Size SUV — PHEV (48V MHEV)',
  'Full-Size Premium SUV — PHEV (MHEV 48V)',
  'Executive Saloon — PHEV',
  // ICE
  'City Car — ICE',
  'Compact Hatchback — ICE',
  'Family Sedan — ICE',
  'Executive Saloon — ICE',
  'Compact SUV / Crossover — ICE / MHEV',
  'Mid-Size SUV — ICE / MHEV',
  'Full-Size Premium SUV — ICE / MHEV',
  'Performance Coupé — ICE',
  'Pickup Truck — ICE / MHEV',
];

// Systems that restrict which propulsion families are valid.
// 'ice'  = ICE + PHEV/MHEV vehicles allowed; BEV disabled
// 'bev'  = BEV + PHEV/MHEV vehicles allowed; ICE disabled
// absent = all vehicles allowed
const SYSTEM_PROPULSION_RESTRICTION: Record<string, 'ice' | 'bev'> = {
  'powertrain-ice': 'ice',
  'powertrain-bev': 'bev',
  'fuel-emission':  'ice',
};

function isVehicleDisabled(vehicleStr: string, restriction: 'ice' | 'bev' | null): boolean {
  if (!restriction) return false;
  const isBev = vehicleStr.includes('BEV');
  if (restriction === 'ice') return isBev;           // disable BEV vehicles
  if (restriction === 'bev') return !isBev && !vehicleStr.includes('PHEV'); // disable ICE-only
  return false;
}

const BODY_STYLES: { value: BodyStyle; label: string }[] = [
  { value: 'hatchback', label: 'Hatchback (3/5-door)' },
  { value: 'sedan',     label: 'Saloon / Sedan' },
  { value: 'suv',       label: 'SUV / 4x4' },
  { value: 'coupe',     label: 'Coupé / Fastback' },
  { value: 'crossover', label: 'Crossover / CUV' },
  { value: 'mpv',       label: 'MPV / Minivan' },
  { value: 'pickup',    label: 'Pickup Truck' },
  { value: 'universal', label: 'Multi-body / Universal' },
];

const PLANT_REGIONS: { value: PlantRegion; label: string }[] = [
  { value: 'germany', label: 'Germany (€45-55/hr)' },
  { value: 'uk',      label: 'UK (£35-45/hr)' },
  { value: 'czech',   label: 'Czech / Slovakia (€15-20/hr)' },
  { value: 'spain',   label: 'Spain / Portugal (€20-28/hr)' },
  { value: 'mexico',  label: 'Mexico ($8-12/hr)' },
  { value: 'usa',     label: 'USA ($40-55/hr)' },
  { value: 'china',   label: 'China (¥70-130/hr)' },
  { value: 'india',   label: 'India (₹800-1200/hr)' },
  { value: 'korea',   label: 'South Korea (₩35-45k/hr)' },
];

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'CNY', label: 'CNY (¥)' },
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
  const location = useLocation();

  const [step, setStep] = useState(0);
  const [systemId, setSystemId] = useState(searchParams.get('system') || '');
  const [subassemblyId, setSubassemblyId] = useState('');
  const [partId, setPartId] = useState('');
  const [vehicleType, setVehicleType] = useState(VEHICLE_TYPES[0]);
  const propulsionRestriction = SYSTEM_PROPULSION_RESTRICTION[systemId] ?? null;
  const [bodyStyle, setBodyStyle] = useState<BodyStyle>('suv');
  const [annualVolume, setAnnualVolume] = useState(80000);
  const [plantRegion, setPlantRegion] = useState<PlantRegion>('germany');
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [programmeLengthYears, setProgrammeLengthYears] = useState(5);
  const [additionalContext, setAdditionalContext] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [teardownFile, setTeardownFile] = useState<File | null>(null);
  const [dfmeaFile, setDfmeaFile] = useState<File | null>(null);
  const [dfmeaContent, setDfmeaContent] = useState<string>('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('brainspark_api_key') || '');
  const [searchApiKey, setSearchApiKey] = useState(() => localStorage.getItem('brainspark_brave_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [enableSearch, setEnableSearch] = useState(true);
  const [cadFile, setCadFile] = useState<File | null>(null);
  const [cadGeometry, setCadGeometry] = useState<CadGeometry | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedSystem = getSystemById(systemId);
  const selectedSub = getSubassemblyById(systemId, subassemblyId);

  // Quick Start preselection — reads state passed by DashboardPage quick-start cards
  useEffect(() => {
    const preselect = (location.state as { preselect?: { system: string; subassembly?: string } } | null)?.preselect;
    if (!preselect) return;
    const sys = AUTOMOTIVE_SYSTEMS.find(s => s.name === preselect.system || s.id === preselect.system);
    if (!sys) return;
    setSystemId(sys.id);
    if (preselect.subassembly) {
      const sub = sys.subassemblies.find(s => s.name === preselect.subassembly || s.id === preselect.subassembly);
      if (sub) { setSubassemblyId(sub.id); setStep(1); return; }
    }
    setStep(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When system changes, auto-reset vehicle type if the current selection is now incompatible
  useEffect(() => {
    if (isVehicleDisabled(vehicleType, propulsionRestriction)) {
      const firstAllowed = VEHICLE_TYPES.find(v => !isVehicleDisabled(v, propulsionRestriction));
      if (firstAllowed) setVehicleType(firstAllowed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setCadFile(file);
    setCadGeometry(null);
    setIsParsing(true);
    try {
      const geo = await parseCadFile(file);
      setCadGeometry(geo);
      // Surface parser notes/warnings instead of swallowing them silently.
      if (geo.warnings && geo.warnings.length > 0) {
        const isError = !geo.boundingBox && geo.estimatedVolume === undefined;
        toast(geo.warnings[0], isError ? 'error' : 'info');
      }
    } catch (e) {
      setCadGeometry(null);
      toast(`Could not parse ${file.name}. Try a binary STL for full geometry.`, 'error');
    } finally {
      setIsParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'model/stl': ['.stl'],
      'application/octet-stream': ['.stl', '.step', '.stp', '.dxf'],
      'application/step': ['.step', '.stp'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
  });

  const handleProgress = useCallback((event: ProgressEvent) => {
    setProgressSteps(prev => {
      const markActiveDone = () => prev.map(s => s.status === 'active' ? { ...s, status: 'done' as const } : s);
      switch (event.type) {
        case 'connecting':
          return [{ id: 'connect', label: event.message || 'Connecting to AI chief engineer...', status: 'active' as const }];
        case 'searching':
          return [
            ...markActiveDone(),
            { id: `s-${event.searchNumber}`, label: `Searching: ${event.query?.slice(0, 55)}${(event.query?.length || 0) > 55 ? '…' : ''}`, status: 'active' as const, detail: event.purpose?.replace('_', ' ') },
          ];
        case 'search_done':
          return prev.map(s =>
            s.id === `s-${event.searchNumber}`
              ? { ...s, status: 'done' as const, detail: `${event.resultCount} result${event.resultCount !== 1 ? 's' : ''} found` }
              : s
          );
        case 'synthesizing':
          return [...markActiveDone(), { id: 'synth', label: event.message || 'Synthesising expert ideas...', status: 'active' as const }];
        default:
          return prev;
      }
    });
  }, []);

  function toggleVoice() {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      toast('Voice input is not supported in this browser. Try Chrome or Edge.', 'error');
      return;
    }
    if (voiceActive) { setVoiceActive(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    const recognition = new SR();
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceActive(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setAdditionalContext(prev => (prev ? prev + ' ' : '') + transcript);
    };
    recognition.onerror = () => setVoiceActive(false);
    recognition.onend = () => setVoiceActive(false);
    recognition.start();
  }

  const handleGenerate = async () => {
    if (!apiKey.trim()) { setError('Please enter your Anthropic API key.'); return; }
    if (!systemId || !subassemblyId) { setError('Please select a system and subassembly.'); return; }

    setLoading(true);
    setError('');
    setProgressSteps([]);
    localStorage.setItem('brainspark_api_key', apiKey);
    if (searchApiKey) localStorage.setItem('brainspark_brave_key', searchApiKey);

    try {
      let contextWithTeardown = additionalContext;
      if (teardownFile) {
        try {
          const reader = new FileReader();
          const base64: string = await new Promise((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(teardownFile);
          });
          const mimeType = teardownFile.type || 'image/jpeg';
          const authToken = (() => { try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return ''; } })();
          const visionResp = await fetch('/api/teardown-vision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ imageBase64: base64, mimeType, apiKey }),
          });
          if (visionResp.ok) {
            const { description } = await visionResp.json();
            contextWithTeardown = `${additionalContext ? additionalContext + '\n\n' : ''}COMPETITOR TEARDOWN ANALYSIS — "${teardownFile.name}":\n${description}\n\nCAVEAT: the above is an AI reading of a SINGLE external photo — no measurements, scale, material certs, or internal access. Treat material/weight/part-count as visual estimates. Ideas derived primarily from this photo must carry confidenceLevel "estimated" or "theoretical" (never "verified") and must NOT cite the photo as hard quantitative evidence.`;
          } else {
            contextWithTeardown = `${additionalContext ? additionalContext + '\n\n' : ''}TEARDOWN ANALYSIS: A competitor part photo "${teardownFile.name}" was attached but could not be read. Do NOT invent observations about it; generate ideas from the part/system context only.`;
          }
        } catch {
          contextWithTeardown = `${additionalContext ? additionalContext + '\n\n' : ''}TEARDOWN ANALYSIS: A competitor part photo "${teardownFile.name}" was attached but could not be processed. Do NOT invent observations about it; generate ideas from the part/system context only.`;
        }
      }
      let contextFinal = contextWithTeardown;
      if (dfmeaFile) {
        const dfmeaSection = dfmeaContent
          ? `DFMEA REVIEW — "${dfmeaFile.name}":\n${dfmeaContent}\nCross-reference your cost reduction ideas against these specific failure modes. Flag in riskNotes any ideas that could increase RPN on the listed failure modes. Prioritise ideas that directly reduce the highest-RPN items.`
          : `DFMEA REVIEW: A DFMEA/DVP&R file "${dfmeaFile.name}" has been uploaded. Cross-reference cost reduction ideas against typical DFMEA risk items for this system. Flag any ideas that could introduce new failure modes in riskNotes.`;
        contextFinal = `${contextWithTeardown ? contextWithTeardown + '\n\n' : ''}${dfmeaSection}`;
      }

      const config: AnalysisConfig = {
        systemId, subassemblyId,
        partId: partId || undefined,
        vehicleType, bodyStyle, annualVolume, plantRegion, currency, programmeLengthYears,
        cadFileName: cadFile?.name,
        cadFileType: cadFile?.name?.split('.').pop()?.toUpperCase(),
        additionalContext: contextFinal,
        apiKey,
        cadGeometry: cadGeometry ? (cadGeometry as unknown as Record<string, unknown>) : undefined,
      };

      const system = getSystemById(systemId)!;
      const sub = getSubassemblyById(systemId, subassemblyId)!;
      const part = partId ? selectedSub?.parts.find(p => p.id === partId) : undefined;

      const { ideas, sources, resultId } = await generateCostReductionIdeas(
        config, system.name, sub.name, part?.name, enableSearch, searchApiKey || undefined, handleProgress
      );

      const quickWins = ideas.filter(i => i.implementationDifficulty === 'Low').length;
      const programmeItems = ideas.filter(i => i.implementationDifficulty === 'Medium').length;
      const result: AnalysisResult = {
        id: resultId,
        config: { ...config, apiKey: '' },  // strip API key before persistence
        ideas,
        sources,
        summary: {
          totalIdeas: ideas.length,
          quickWins,
          programmeItems,
          strategicItems: ideas.filter(i => i.implementationDifficulty === 'High').length,
          searchesPerformed: sources.length,
        },
        generatedAt: new Date().toLocaleString(),
      };

      sessionStorage.setItem('analysisResult', JSON.stringify(result));
      sessionStorage.setItem('analysisSystemName', system.name);
      sessionStorage.setItem('analysisSubName', sub.name);
      saveFullResult(resultId, result, system.name, sub.name);
      navigate('/results');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes('ECONNREFUSED') || message.includes('fetch')
        ? 'Cannot connect to BrainSpark server. Run "npm run server" in a separate terminal and retry.'
        : `Analysis failed: ${message}`);
    } finally {
      setLoading(false);
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
                  : i < step ? 'bg-success-500/20 text-success-400 cursor-pointer hover:bg-success-500/30'
                  : 'bg-white/5 text-slate-500'
                }`}
              >
                {i < step ? <CheckCircle size={13} /> : <s.icon size={13} />}
                {s.label}
              </button>
              {i < STEPS.length - 1 && <div className={`w-6 h-0.5 ${i < step ? 'bg-success-500/40' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 0: System Selection */}
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 shadow-card">
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
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
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
                  className="w-full py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-navy-950 font-bold transition-all shadow-glow-gold"
                >
                  Continue →
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 1: Configure */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 space-y-6 shadow-card">
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
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Vehicle Type & Drivetrain
                    {propulsionRestriction && (
                      <span className="ml-2 text-xs font-normal text-amber-400/80">
                        {propulsionRestriction === 'ice'
                          ? '— BEV options unavailable for this system'
                          : '— ICE options unavailable for this system'}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <select
                      value={vehicleType}
                      onChange={e => setVehicleType(e.target.value)}
                      className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-gold-500/50"
                    >
                      {VEHICLE_TYPES.map(v => {
                        const disabled = isVehicleDisabled(v, propulsionRestriction);
                        return (
                          <option key={v} value={v} disabled={disabled}
                            style={disabled ? { color: '#475569' } : undefined}>
                            {disabled ? `${v}  [not applicable]` : v}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Body Style + Programme fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Body Style</label>
                    <div className="relative">
                      <select value={bodyStyle} onChange={e => setBodyStyle(e.target.value as BodyStyle)}
                        className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-gold-500/50">
                        {BODY_STYLES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Annual Volume <span className="text-slate-500 font-normal">(units/yr)</span></label>
                    <input
                      type="number"
                      value={annualVolume}
                      onChange={e => setAnnualVolume(Math.max(1000, parseInt(e.target.value) || 80000))}
                      className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold-500/50"
                      placeholder="e.g. 80000"
                      min={1000}
                      step={5000}
                    />
                  </div>
                </div>

                {/* Plant Region + Currency + Programme */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                    <Factory size={14} className="text-slate-500" /> Commercial Parameters
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Plant Region</label>
                      <div className="relative">
                        <select value={plantRegion} onChange={e => setPlantRegion(e.target.value as PlantRegion)}
                          className="w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-gold-500/50">
                          {PLANT_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Currency</label>
                      <div className="relative">
                        <select value={currency} onChange={e => setCurrency(e.target.value as Currency)}
                          className="w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-gold-500/50">
                          {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Programme (years)</label>
                      <div className="relative">
                        <select value={programmeLengthYears} onChange={e => setProgrammeLengthYears(parseInt(e.target.value))}
                          className="w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-gold-500/50">
                          {[2,3,4,5,6,7].map(y => <option key={y} value={y}>{y} years</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <p className="text-slate-600 text-xs mt-1.5 flex items-center gap-1">
                    <TrendingUp size={10} /> These parameters drive AI cost calculations — volume affects annual savings, region sets labour rate benchmarks.
                  </p>
                </div>

                {/* Additional context */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Engineering Context <span className="text-slate-500">(optional but recommended)</span></label>
                  <div className="relative">
                    <textarea
                      value={additionalContext}
                      onChange={e => setAdditionalContext(e.target.value)}
                      placeholder="e.g. Current part is DP980 steel 1.8mm, 220K units/year, target 12% cost reduction, supplier is Gestamp, concerns about rear-pole intrusion under Euro NCAP 2026 protocols..."
                      rows={3}
                      className="w-full bg-navy-800 border border-white/15 rounded-xl px-4 py-3 pr-10 text-white placeholder-slate-600 focus:outline-none focus:border-gold-500/50 resize-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={toggleVoice}
                      title={voiceActive ? 'Stop voice input' : 'Start voice input'}
                      className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${voiceActive ? 'bg-danger-500/20 text-danger-400 border border-danger-500/30' : 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10 hover:text-white'}`}
                    >
                      {voiceActive ? <MicOff size={13} /> : <Mic size={13} />}
                    </button>
                  </div>
                  <p className="text-slate-600 text-xs mt-1">The more context you provide, the more precise the AI's commercial quantification.</p>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(0)} className="flex-1 py-3 rounded-xl border border-white/15 text-slate-300 hover:text-white font-medium transition-colors">← Back</button>
                  <button
                    disabled={!subassemblyId}
                    onClick={() => setStep(2)}
                    className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 text-navy-950 font-bold transition-all shadow-glow-gold"
                  >Continue →</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: CAD Upload */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 space-y-6 shadow-card">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <Upload size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Upload CAD Geometry</h2>
                    <p className="text-slate-400 text-sm">Optional — a binary .STL enables geometry-contextualised analysis (dimensions, volume, mass)</p>
                  </div>
                </div>

                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                    isDragActive ? 'border-gold-400 bg-gold-500/5'
                    : cadFile ? 'border-success-500 bg-success-500/5'
                    : 'border-white/20 hover:border-white/40 bg-white/3'
                  }`}
                >
                  <input {...getInputProps()} />
                  {cadFile ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-3">
                        <FileText size={28} className={cadGeometry ? 'text-success-400' : isParsing ? 'text-amber-400' : 'text-slate-400'} />
                        <div className="text-left">
                          <div className="text-white font-medium">{cadFile.name}</div>
                          <div className="text-slate-400 text-sm">
                            {formatFileSize(cadFile.size)} · {cadFile.name.split('.').pop()?.toUpperCase()} ·
                            {isParsing ? ' Parsing geometry…' : cadGeometry ? ' Geometry extracted ✓' : ' File attached'}
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setCadFile(null); setCadGeometry(null); }} className="ml-4 p-1.5 rounded-lg bg-danger-500/20 text-danger-400 hover:bg-danger-500/30">
                          <X size={14} />
                        </button>
                      </div>
                      {cadGeometry && !cadGeometry.isImage && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-center mt-1">
                          {cadGeometry.boundingBox && (
                            <div className="bg-white/5 rounded-lg px-2 py-1.5">
                              <div className="text-slate-500 mb-0.5">Bounding Box</div>
                              <div className="text-slate-300 font-mono">{cadGeometry.boundingBox.x}×{cadGeometry.boundingBox.y}×{cadGeometry.boundingBox.z} mm</div>
                            </div>
                          )}
                          {cadGeometry.estimatedVolume && (
                            <div className="bg-white/5 rounded-lg px-2 py-1.5">
                              <div className="text-slate-500 mb-0.5">Volume</div>
                              <div className="text-slate-300 font-mono">{cadGeometry.estimatedVolume.toFixed(1)} cm³</div>
                            </div>
                          )}
                          {cadGeometry.featureCounts?.faces && (
                            <div className="bg-white/5 rounded-lg px-2 py-1.5">
                              <div className="text-slate-500 mb-0.5">Triangles</div>
                              <div className="text-slate-300 font-mono">{cadGeometry.featureCounts.faces.toLocaleString()}</div>
                            </div>
                          )}
                          {cadGeometry.featureCounts?.holes != null && (
                            <div className="bg-white/5 rounded-lg px-2 py-1.5">
                              <div className="text-slate-500 mb-0.5">Holes / Arcs</div>
                              <div className="text-slate-300 font-mono">{cadGeometry.featureCounts.holes}</div>
                            </div>
                          )}
                        </div>
                      )}
                      {cadGeometry?.extractedMaterial && (
                        <div className="text-xs text-slate-400 text-center">Material from drawing: <span className="text-amber-400">{cadGeometry.extractedMaterial}</span></div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <Upload size={28} className="text-slate-500 mx-auto mb-3" />
                      <p className="text-slate-300 font-medium">{isDragActive ? 'Drop file here...' : 'Drag & drop CAD file'}</p>
                      <p className="text-slate-500 text-sm mt-1">STL · STEP · DXF · PNG · JPG — geometry auto-extracted</p>
                      <p className="text-slate-600 text-xs mt-2">Click to browse · Skip to continue without CAD</p>
                    </div>
                  )}
                </div>

                {/* Teardown Photo Analysis */}
                <div className="mt-4 p-4 rounded-xl bg-purple-500/5 border border-purple-500/15">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center">
                      <Upload size={12} className="text-purple-400" />
                    </div>
                    <span className="text-purple-300 text-sm font-medium">Teardown Photo (optional)</span>
                    <span className="text-slate-500 text-xs">— AI analyses competitor part photo for benchmarking ideas</span>
                  </div>
                  {teardownFile ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                      <span className="text-purple-300 text-sm truncate flex-1">{teardownFile.name}</span>
                      <button onClick={() => setTeardownFile(null)} className="text-slate-500 hover:text-red-400 transition-colors"><X size={14} /></button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-purple-500/25 cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/5 transition-all">
                      <input type="file" accept="image/*" className="hidden" onChange={e => setTeardownFile(e.target.files?.[0] || null)} />
                      <Upload size={14} className="text-purple-400" />
                      <span className="text-slate-400 text-sm">Upload competitor part photo (JPG, PNG)</span>
                    </label>
                  )}
                  {teardownFile && (
                    <p className="mt-2 text-purple-400 text-xs">Photo will be analysed by Claude Vision to estimate process, material, and part count — generating competitor benchmarking ideas.</p>
                  )}
                </div>

                {/* DFMEA Design Review */}
                <div className="p-4 rounded-xl bg-danger-500/5 border border-danger-500/15">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-danger-500/20 flex items-center justify-center">
                      <Shield size={12} className="text-danger-400" />
                    </div>
                    <span className="text-danger-300 text-sm font-medium">DFMEA / DVP&R (optional)</span>
                    <span className="text-slate-500 text-xs">— AI flags conflicts between risk items and cost reduction ideas</span>
                  </div>
                  {dfmeaFile ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20">
                      <span className="text-danger-300 text-sm truncate flex-1">{dfmeaFile.name}</span>
                      <button onClick={() => setDfmeaFile(null)} className="text-slate-500 hover:text-danger-400 transition-colors"><X size={14} /></button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-danger-500/25 cursor-pointer hover:border-danger-500/40 hover:bg-danger-500/5 transition-all">
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={async e => {
                      const file = e.target.files?.[0] || null;
                      setDfmeaFile(file);
                      setDfmeaContent('');
                      if (!file) return;
                      try {
                        const arrayBuffer = await file.arrayBuffer();
                        const { read, utils } = await import('xlsx');
                        const wb = read(arrayBuffer);
                        const sheet = wb.Sheets[wb.SheetNames[0]];
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const rows: any[] = utils.sheet_to_json(sheet, { defval: '' });
                        // Find key columns by fuzzy header matching
                        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
                        const findCol = (...keywords: string[]) => headers.find(h => keywords.some(k => h.toLowerCase().includes(k))) || '';
                        const fnCol = findCol('function', 'item', 'component');
                        const fmCol = findCol('failure mode', 'failure', 'mode');
                        const efCol = findCol('effect', 'impact');
                        const rpnCol = findCol('rpn', 'risk priority');
                        const topRows = rows
                          .filter(r => r[fmCol] || r[fnCol])
                          .sort((a, b) => (Number(b[rpnCol]) || 0) - (Number(a[rpnCol]) || 0))
                          .slice(0, 15);
                        const summary = topRows.map((r, i) =>
                          `${i + 1}. Function: ${r[fnCol] || 'N/A'} | Failure Mode: ${r[fmCol] || 'N/A'} | Effect: ${r[efCol] || 'N/A'} | RPN: ${r[rpnCol] || 'N/A'}`
                        ).join('\n');
                        setDfmeaContent(summary ? `Top ${topRows.length} risk items (sorted by RPN):\n${summary}` : `Loaded ${rows.length} DFMEA rows (columns: ${headers.slice(0, 6).join(', ')})`);
                      } catch {
                        setDfmeaContent(`DFMEA file attached: ${file.name} (parse failed — content injected as filename reference)`);
                      }
                    }} />
                      <Upload size={14} className="text-danger-400" />
                      <span className="text-slate-400 text-sm">Upload DFMEA/DVP&R Excel or CSV</span>
                    </label>
                  )}
                  {dfmeaFile && (
                    <p className="mt-2 text-danger-400 text-xs">DFMEA reference noted — AI will prioritise ideas that reduce warranty risk and flag any that could introduce new failure modes.</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl border border-white/15 text-slate-300 hover:text-white font-medium transition-colors">← Back</button>
                  <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-bold transition-all shadow-glow-gold">Continue →</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Generate */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <div className="bg-navy-900 rounded-2xl border border-white/10 p-8 space-y-6 shadow-card">
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
                    ['Body Style', bodyStyle.charAt(0).toUpperCase() + bodyStyle.slice(1)],
                    ['Volume / Region', `${annualVolume.toLocaleString()} units · ${plantRegion}`],
                    ['Currency / Programme', `${currency} · ${programmeLengthYears}yr`],
                    ['CAD File', cadFile?.name || 'None uploaded'],
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
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-300 text-sm">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} disabled={loading} className="flex-1 py-3 rounded-xl border border-white/15 text-slate-300 hover:text-white font-medium disabled:opacity-40 transition-colors">← Back</button>
                  <button
                    disabled={!apiKey.trim() || loading}
                    onClick={handleGenerate}
                    className="flex-1 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-navy-950 font-bold flex items-center justify-center gap-2 transition-all shadow-glow-gold"
                  >
                    {loading ? <><ButtonSpinner size={18} /> Analysing…</> : <><Zap size={18} /> Generate Ideas</>}
                  </button>
                </div>

                {/* Loading status */}
                {loading && (
                  <div className="p-4 rounded-xl bg-navy-800 border border-white/10 space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <ButtonSpinner size={14} />
                      <span className="text-gold-400 font-medium text-sm">Analysis in progress…</span>
                      <span className="text-slate-600 text-xs ml-auto">{enableSearch ? '30–60s' : '15–25s'}</span>
                    </div>
                    {progressSteps.length === 0 ? (
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-gold-500 to-amber-400 rounded-full animate-pulse w-1/4" />
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {progressSteps.map(step => (
                          <div key={step.id} className="flex items-start gap-2 text-xs">
                            <span className={`flex-shrink-0 mt-0.5 ${
                              step.status === 'done'  ? 'text-success-400' :
                              step.status === 'active' ? 'text-gold-400' :
                              step.status === 'error'  ? 'text-danger-400' : 'text-slate-600'
                            }`}>
                              {step.status === 'done' ? '✓' : step.status === 'active' ? '⟳' : step.status === 'error' ? '✕' : '○'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className={step.status === 'done' ? 'text-slate-400' : step.status === 'active' ? 'text-white' : 'text-slate-600'}>
                                {step.label}
                              </span>
                              {step.detail && (
                                <span className="text-slate-600 ml-1">({step.detail})</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
