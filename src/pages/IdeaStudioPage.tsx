import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Box, Image as ImageIcon, Upload, X, Sparkles, Calculator, Wand2, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { parseCadFile, estimateMass, formatFileSize, type CadGeometry } from '../services/cad-parser';
import { generateCostReductionIdeas } from '../services/claude-service';
import { toast } from '../hooks/useToast';
import ButtonSpinner from '../components/ui/ButtonSpinner';

type Mode = 'cad' | 'image';

const CURRENCIES = ['EUR', 'GBP', 'USD', 'CNY'];
const TOLERANCE = ['Standard', 'Tight (precision)', 'Loose (non-critical)'];

// Map a mesh process guess (feature engine) to a should-cost catalogue process name.
function mapProcess(guess: string, catalogue: string[]): string {
  const g = (guess || '').toLowerCase();
  const find = (kw: string) => catalogue.find(p => p.toLowerCase().includes(kw));
  if (/sheet|stamp/.test(g)) return find('stamp') || catalogue[0] || 'Stamping / Deep Drawing';
  if (/cast/.test(g)) return find('die casting (alumin') || find('casting') || 'Die Casting (Aluminium)';
  if (/forg/.test(g)) return find('forging (hot') || find('forging') || 'Forging (Hot)';
  if (/machin|billet/.test(g)) return find('machining') || 'Machining (CNC)';
  if (/extru/.test(g)) return find('extrusion') || 'Extrusion';
  return find('machining') || catalogue[0] || 'Machining (CNC)';
}

// Fuzzy-match a FREE-TEXT material to a should-cost catalogue entry (for the baseline).
// Returns null if nothing sensible matches — the baseline is then simply unavailable.
function matchMaterial(typed: string, catalogue: string[]): string | null {
  const t = (typed || '').toLowerCase();
  if (!t.trim() || !catalogue.length) return null;
  const has = (kw: string) => catalogue.find(m => m.toLowerCase().includes(kw));
  if (/steel|dp\d|hsla|22mnb5|boron|iron|gjs|ss30|stainless/.test(t)) return has('stainless') && /stainless|304|316/.test(t) ? has('stainless')! : (has('high-strength') && /hsla|dp|boron|22mnb5|advanced/.test(t) ? has('high-strength')! : (has('steel') || catalogue[0]));
  if (/7075/.test(t)) return has('7075') || has('alumin') || null;
  if (/alumin|\bal\b|6061|6082|a380|adc12|alsi/.test(t)) return has('6061') || has('alumin') || null;
  if (/magnes|az91|am60|ae44/.test(t)) return has('magnes') || null;
  if (/cfrp|carbon|composite/.test(t)) return has('cfrp') || has('carbon') || null;
  if (/pa6|nylon|pa66/.test(t)) return has('pa6') || has('nylon') || null;
  if (/\babs\b/.test(t)) return has('abs') || null;
  if (/\bpp\b|polyprop/.test(t)) return has('polyprop') || has('pp') || null;
  return null;
}

// Fuzzy-match a FREE-TEXT process to a should-cost catalogue entry.
function matchProcess(typed: string, catalogue: string[]): string | null {
  const t = (typed || '').toLowerCase();
  if (!t.trim() || !catalogue.length) return null;
  const has = (kw: string) => catalogue.find(p => p.toLowerCase().includes(kw));
  if (/stamp|sheet|press|deep draw/.test(t)) return has('stamp') || null;
  if (/hpdc|die.?cast|pressure cast/.test(t)) return has('die casting (alumin') || has('casting') || null;
  if (/cast/.test(t)) return has('casting') || null;
  if (/forg/.test(t)) return has('forging (hot') || has('forging') || null;
  if (/machin|cnc|mill|turn|billet/.test(t)) return has('machining') || null;
  if (/mould|mold|inject/.test(t)) return has('moulding') || has('injection') || null;
  if (/extru/.test(t)) return has('extrusion') || null;
  if (/weld/.test(t)) return has('welding') || null;
  return null;
}

export default function IdeaStudioPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'image' ? 'image' : 'cad');

  // Upload + parse
  const [file, setFile] = useState<File | null>(null);
  const [geometry, setGeometry] = useState<CadGeometry | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Catalogue (materials / processes / regions from the should-cost engine)
  const [materials, setMaterials] = useState<string[]>([]);
  const [processes, setProcesses] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);

  // Current Condition
  const [partName, setPartName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [material, setMaterial] = useState('');
  const [process, setProcess] = useState('');
  const [annualVolume, setAnnualVolume] = useState('80000');
  const [region, setRegion] = useState('Germany');
  const [currency, setCurrency] = useState('EUR');
  const [targetCost, setTargetCost] = useState('');
  const [programYears, setProgramYears] = useState('5');
  const [tolerance, setTolerance] = useState(TOLERANCE[0]);
  const [constraints, setConstraints] = useState('');
  const [notes, setNotes] = useState('');

  // Baseline (deterministic should-cost)
  const [baseline, setBaseline] = useState<{ total: string; matPct: number; p10: string; p90: string } | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineNote, setBaselineNote] = useState('');

  // Generation
  const [generating, setGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Catalogue is used only to fuzzy-match the free-text material/process for the
    // should-cost baseline — the fields themselves are typed freely by the user.
    fetch('/api/should-cost/catalogue').then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      if (d.materials?.length) setMaterials(d.materials);
      if (d.processes?.length) setProcesses(d.processes);
      if (d.regions?.length) setRegions(d.regions);
    }).catch(() => {});
  }, []);

  const onFile = useCallback(async (f: File) => {
    setFile(f); setGeometry(null); setError('');
    if (mode === 'cad') {
      setParsing(true);
      try {
        const geo = await parseCadFile(f);
        setGeometry(geo);
        // Auto-prefill from the feature engine (editable)
        if (!partName && geo.productName) setPartName(geo.productName);
        if (geo.estimatedVolume) setWeightKg(String(estimateMass(geo.estimatedVolume)));
        if (geo.processGuesses?.[0] && processes.length) setProcess(mapProcess(geo.processGuesses[0].process, processes));
        if (geo.extractedMaterial && materials.length) {
          const hit = materials.find(m => m.toLowerCase().includes(geo.extractedMaterial!.toLowerCase().slice(0, 4)));
          if (hit) setMaterial(hit);
        }
        if (geo.warnings?.length) toast(geo.warnings[0], 'info');
      } catch {
        toast('Could not parse that CAD file — enter the condition manually.', 'error');
      } finally { setParsing(false); }
    }
  }, [mode, partName, processes, materials]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
  }

  async function computeBaseline() {
    if (!token || !weightKg || !annualVolume) return;
    setBaseline(null); setBaselineNote('');
    // The deterministic engine needs a recognised material + process; fuzzy-match
    // the free text. If it can't be mapped, the baseline is simply unavailable.
    const engMat = matchMaterial(material, materials);
    const engProc = matchProcess(process, processes);
    if (!engMat || !engProc) {
      setBaselineNote(`Baseline needs a recognised material & process (e.g. "Aluminium 6061" + "Die Casting"). Your typed values still fully drive the AI ideas.`);
      return;
    }
    setBaselineLoading(true);
    try {
      const r = await fetch('/api/should-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partName: partName || 'Component', material: engMat, process: engProc, weightKg: Number(weightKg), annualVolume: Number(annualVolume), region, currency }),
      });
      if (r.ok) {
        const d = await r.json();
        setBaseline({ total: d.totalShouldCost, matPct: d.breakdown?.material?.pct ?? 0, p10: d.simulation?.p10, p90: d.simulation?.p90 });
      } else { setBaselineNote('Could not compute a baseline for these inputs.'); }
    } catch { setBaselineNote('Could not compute a baseline right now.'); } finally { setBaselineLoading(false); }
  }

  function buildConditionContext(): string {
    const lines = ['CURRENT PART CONDITION (user-provided — ground EVERY idea in these facts and reference them explicitly):'];
    if (partName) lines.push(`- Part / assembly: ${partName}`);
    if (weightKg) lines.push(`- Current weight: ${weightKg} kg`);
    if (material) lines.push(`- Material: ${material}`);
    if (process) lines.push(`- Current manufacturing process: ${process}`);
    if (annualVolume) lines.push(`- Annual volume: ${Number(annualVolume).toLocaleString()} units/yr`);
    if (targetCost) lines.push(`- Target cost: ${currency} ${targetCost}/unit — prioritise ideas that close the gap to this target.`);
    lines.push(`- Programme life: ${programYears} years | Plant region: ${region}`);
    lines.push(`- Tolerance / surface-finish criticality: ${tolerance}`);
    if (constraints) lines.push(`- Functional constraints (MUST be preserved): ${constraints}`);
    if (notes) lines.push(`- Known cost drivers / pain points: ${notes}`);
    if (baseline) lines.push(`- Deterministic should-cost baseline: ${baseline.total}/unit (material ${baseline.matPct}% of cost). Express each idea's saving relative to this baseline.`);
    return lines.join('\n');
  }

  async function handleGenerate() {
    setError('');
    const apiKey = localStorage.getItem('brainspark_api_key') || '';
    if (!apiKey) { setError('No API key found. Add one on the Analyze page first (stored only in your browser).'); return; }
    if (!token) { setError('Please sign in to generate ideas.'); return; }
    if (mode === 'cad' && !geometry) { setError('Upload a CAD file (STL/STEP) first.'); return; }
    if (mode === 'image' && !file) { setError('Upload a part image/drawing first.'); return; }
    if (!partName && !material) { setError('Add at least a part name or material so the AI has context.'); return; }

    setGenerating(true); setProgressMsg('Preparing…');
    try {
      let condition = buildConditionContext();

      // Image mode → run vision first, prepend its reading
      if (mode === 'image' && file) {
        setProgressMsg('Reading the image…');
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject; reader.readAsDataURL(file);
        });
        try {
          const vr = await fetch('/api/teardown-vision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ imageBase64: base64, mimeType: file.type || 'image/jpeg', apiKey }),
          });
          if (vr.ok) {
            const { description } = await vr.json();
            condition = `IMAGE READING (AI vision of the supplied photo/drawing — treat material/weight as visual estimates, not certs):\n${description}\n\n${condition}`;
          }
        } catch { /* vision best-effort */ }
      }

      const REGION_KEY: Record<string, string> = {
        'Germany': 'germany', 'UK': 'uk', 'Czech Republic': 'czech', 'Spain': 'spain',
        'Mexico': 'mexico', 'USA': 'usa', 'China': 'china', 'India': 'india', 'Korea': 'korea',
      };
      const config = {
        systemId: 'general', subassemblyId: 'component', partId: partName || undefined,
        vehicleType: 'universal',
        annualVolume: Number(annualVolume) || undefined,
        plantRegion: ((REGION_KEY[region] || 'germany') as never),
        currency: currency as never,
        programmeLengthYears: Number(programYears) || 5,
        cadFileName: file?.name,
        cadFileType: file?.name?.split('.').pop()?.toUpperCase(),
        additionalContext: condition,
        cadGeometry: (mode === 'cad' && geometry) ? (geometry as unknown as Record<string, unknown>) : undefined,
        apiKey,
      };

      setProgressMsg('Generating grounded ideas…');
      // Search defaults OFF here — the grounding comes from the user's own part data
      // (+ curated knowledge base & live prices), which is faster and more reliable.
      const result = await generateCostReductionIdeas(
        config, partName || 'Component', process || 'Component', partName || undefined,
        false, localStorage.getItem('brainspark_brave_key') || undefined,
        (ev) => { if (ev.message) setProgressMsg(ev.message); },
      );
      // Hand off to the Results page (reuses all idea/pipeline UI)
      sessionStorage.setItem('analysisResult', JSON.stringify(result));
      sessionStorage.setItem('analysisSystemName', partName || 'Component');
      sessionStorage.setItem('analysisSubName', process || 'Idea Studio');
      navigate('/results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.');
    } finally { setGenerating(false); }
  }

  const accept = mode === 'cad' ? '.stl,.step,.stp,.dxf' : 'image/*';

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/15 border border-gold-500/25 mb-4">
            <Wand2 size={28} className="text-gold-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-2">Idea Studio</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">Upload a part, describe its current condition, and get cost-reduction ideas grounded in your data — for maximum accuracy.</p>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-3 mb-6 max-w-md mx-auto">
          {([['cad', Box, 'CAD → Idea', 'STL · STEP · DXF'], ['image', ImageIcon, 'Image → Idea', 'Photo · drawing']] as const).map(([m, Icon, label, sub]) => (
            <button key={m} onClick={() => { setMode(m); setFile(null); setGeometry(null); }}
              className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border transition-all ${mode === m ? 'bg-gold-500/15 border-gold-500/40 text-gold-300' : 'bg-navy-900 border-white/10 text-slate-400 hover:border-white/25'}`}>
              <Icon size={22} /><span className="font-semibold text-sm">{label}</span><span className="text-xs opacity-70">{sub}</span>
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left: upload + baseline */}
          <div className="space-y-4">
            {!file ? (
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer ${dragOver ? 'border-gold-500/50 bg-gold-500/5' : 'border-white/15 hover:border-white/30 bg-navy-900'}`}
                onClick={() => document.getElementById('studio-file')?.click()}>
                <input id="studio-file" type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
                <Upload size={26} className="mx-auto text-slate-500 mb-3" />
                <p className="text-white font-semibold">Drop your {mode === 'cad' ? 'CAD file' : 'image/drawing'} here</p>
                <p className="text-slate-500 text-sm mt-1">{mode === 'cad' ? 'STL · STEP · DXF' : 'PNG · JPG · WEBP'}</p>
              </div>
            ) : (
              <div className="bg-navy-900 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                {mode === 'cad' ? <Box size={18} className="text-gold-400" /> : <ImageIcon size={18} className="text-gold-400" />}
                <div className="flex-1 min-w-0"><p className="text-white text-sm truncate">{file.name}</p><p className="text-slate-500 text-xs">{formatFileSize(file.size)}{parsing ? ' · parsing…' : ''}</p></div>
                <button onClick={() => { setFile(null); setGeometry(null); }}><X size={16} className="text-slate-500 hover:text-red-400" /></button>
              </div>
            )}

            {/* Parsed geometry snapshot */}
            {geometry?.featureMap && (
              <div className="bg-navy-900 border border-white/10 rounded-2xl p-4">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-2 font-semibold">Parsed geometry (auto-prefilled →)</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {geometry.boundingBox && <span className="px-2 py-1 rounded-lg bg-white/5 text-slate-300">{geometry.boundingBox.x}×{geometry.boundingBox.y}×{geometry.boundingBox.z} mm</span>}
                  <span className="px-2 py-1 rounded-lg bg-white/5 text-slate-300">solidity {geometry.featureMap.solidity}</span>
                  {geometry.processGuesses?.[0] && <span className="px-2 py-1 rounded-lg bg-white/5 text-teal-300">{geometry.processGuesses[0].process}</span>}
                  {geometry.dfmaFindings && geometry.dfmaFindings.length > 0 && <span className="px-2 py-1 rounded-lg bg-white/5 text-amber-300">{geometry.dfmaFindings.length} DFMA finding{geometry.dfmaFindings.length > 1 ? 's' : ''}</span>}
                </div>
              </div>
            )}

            {/* Should-cost baseline */}
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white text-sm font-semibold flex items-center gap-2"><Calculator size={15} className="text-teal-400" /> Should-cost baseline</p>
                <button onClick={computeBaseline} disabled={baselineLoading || !material.trim() || !process.trim() || !weightKg}
                  className="text-xs px-3 py-1.5 rounded-lg bg-teal-600/80 hover:bg-teal-500 disabled:opacity-40 text-white font-medium transition-colors">
                  {baselineLoading ? 'Computing…' : 'Estimate'}
                </button>
              </div>
              {baseline ? (
                <div className="flex items-baseline gap-4">
                  <span className="text-teal-300 font-black text-2xl">{baseline.total}</span>
                  <span className="text-slate-500 text-xs">P10–P90 {baseline.p10}–{baseline.p90} · material {baseline.matPct}%</span>
                </div>
              ) : baselineNote ? (
                <p className="text-amber-300/80 text-xs">{baselineNote}</p>
              ) : <p className="text-slate-500 text-xs">Fill weight, material, process &amp; volume, then Estimate to anchor savings in a real number (optional).</p>}
            </div>
          </div>

          {/* Right: Current Condition form */}
          <div className="bg-navy-900 border border-white/10 rounded-2xl p-5 space-y-3">
            <p className="text-white font-semibold flex items-center gap-2 mb-1"><Info size={15} className="text-gold-400" /> Current Condition</p>
            <Field label="Part / assembly name"><input value={partName} onChange={e => setPartName(e.target.value)} placeholder="e.g. Front subframe bracket" className={inp} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weight (kg)"><input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="4.2" className={inp} /></Field>
              <Field label="Annual volume"><input type="number" value={annualVolume} onChange={e => setAnnualVolume(e.target.value)} className={inp} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Material (type freely)"><input value={material} onChange={e => setMaterial(e.target.value)} placeholder="e.g. AlSi10MnMg / DP780 / ADC12" className={inp} /></Field>
              <Field label="Manufacturing process (type freely)"><input value={process} onChange={e => setProcess(e.target.value)} placeholder="e.g. HPDC / CNC machining / forging" className={inp} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Plant region"><select value={region} onChange={e => setRegion(e.target.value)} className={inp}>{(regions.length ? regions : ['Germany']).map(r => <option key={r}>{r}</option>)}</select></Field>
              <Field label="Currency"><select value={currency} onChange={e => { setCurrency(e.target.value); setBaseline(null); setBaselineNote(''); }} className={inp}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Target cost"><input type="number" value={targetCost} onChange={e => setTargetCost(e.target.value)} placeholder="opt." className={inp} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Programme life (yrs)"><input type="number" value={programYears} onChange={e => setProgramYears(e.target.value)} className={inp} /></Field>
              <Field label="Tolerance / finish"><select value={tolerance} onChange={e => setTolerance(e.target.value)} className={inp}>{TOLERANCE.map(t => <option key={t}>{t}</option>)}</select></Field>
            </div>
            <Field label="Functional constraints (preserve)"><input value={constraints} onChange={e => setConstraints(e.target.value)} placeholder="e.g. 8 kN load, 120°C, UN R17" className={inp} /></Field>
            <Field label="Known cost drivers / notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="e.g. tooling already cut; copper price sensitivity…" className={inp + ' resize-none'} /></Field>

            {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}
            <button onClick={handleGenerate} disabled={generating}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-bold text-sm transition-all shadow-glow-gold">
              {generating ? <><ButtonSpinner size={16} /> {progressMsg || 'Generating…'}</> : <><Sparkles size={16} /> Generate Grounded Ideas</>}
            </button>
            <p className="text-slate-600 text-[11px] text-center">Ideas are validated and open in Results, where you can push them to Pipeline or the Marketplace.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = 'w-full bg-navy-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-slate-400 mb-1">{label}</span>{children}</label>;
}
