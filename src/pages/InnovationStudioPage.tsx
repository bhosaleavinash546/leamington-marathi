import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sparkles, CheckCircle, XCircle, Layers, Cpu, Wand2, ArrowRight, FileDown, Table2,
  Search, Lightbulb, Target, GitBranch, ShieldCheck, Gauge, ChevronDown,
} from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';
import BusinessCaseModal from '../components/BusinessCaseModal';
import { toast } from '../hooks/useToast';
import './innovation.css';

// Innovation Studio — one home for the structured idea-generation methods.
// Pick a method, describe the part in plain English, Generate. Deterministic
// methods (DFA, Value Engineering, Design-to-Cost) also accept structured input
// and show a real analysis before the ideas.
//
// THE VISUAL IDEA, and why the motion is what it is. Every method on this page
// has the same shape: one problem opens out into many possibilities, then
// collapses back to the few that survive engine checking. Divergence and
// convergence. So the ambience drifts outward from the input, the method
// preview literally draws that fan, and the results settle inward with a
// crystallising wipe. Nothing here animates for decoration alone, and all of it
// sits behind prefers-reduced-motion (see innovation.css).

interface Method {
  id: string; name: string; tier: number; blurb: string; input: string;
  /** What the method wants from you, in the reader's words — shown before they commit. */
  needs: string;
  /** What comes back that a spinner cannot tell you. */
  returns: string;
  /** The lenses this method fans a problem into. Used for the divergence diagram
   *  and to set expectations: a 7-verb checklist and a 40-principle matrix are
   *  not the same size of search. */
  lenses: string[];
}

interface EngineCheck { direction: 'confirmed' | 'contradicted'; savingPct: number; }
interface Idea { lens: string; title: string; technicalDescription: string; costAngle: string; riskNotes?: string; engineCheck?: EngineCheck | null; }
interface Result { method: { id: string; name: string }; analysis: unknown; ideas: Idea[]; engineChecks?: { checked: number; confirmed: number; contradicted: number } | null; }

const METHODS: Method[] = [
  {
    id: 'triz', name: 'TRIZ', tier: 1, input: 'contradiction',
    blurb: 'Break an engineering trade-off with 40 inventive principles.',
    needs: 'A contradiction — "lighter without losing stiffness".',
    returns: 'The contradiction mapped onto the Altshuller matrix, and the principles that resolve it.',
    lenses: ['Segmentation', 'Asymmetry', 'Merging', 'Nesting', 'Prior action', 'Cheap short-life'],
  },
  {
    id: 'value-engineering', name: 'Value Engineering', tier: 1, input: 'part',
    blurb: 'Find functions where you pay a lot for little value.',
    needs: 'The part, and what it is for.',
    returns: 'A value index per function — cost share against worth share — and which functions to attack.',
    lenses: ['Function cost', 'Function worth', 'Value index', 'Attack list'],
  },
  {
    id: 'fast', name: 'FAST Function-Cost Matrix', tier: 1, input: 'part',
    blurb: 'Map component cost onto functions; attack poor-value ones.',
    needs: 'The part. Component costs if you have them — the AI proposes them if you do not, and they are invariant-checked.',
    returns: 'A function-cost matrix with the poor-value functions named.',
    lenses: ['Basic function', 'Secondary functions', 'Cost carriers', 'Poor-value set'],
  },
  {
    id: 'spec-challenge', name: 'Spec & Tolerance Challenge', tier: 1, input: 'part',
    blurb: 'Challenge tolerances, grades and tests — CTQs stay locked.',
    needs: 'A characteristic register. Mark the critical-to-quality rows and they are never challenged.',
    returns: 'Engine-verified savings for each relaxation, and a locked list nobody touched.',
    lenses: ['Tolerance', 'Surface finish', 'Material grade', 'Test regime'],
  },
  {
    id: 'teardown-delta', name: 'Teardown Delta', tier: 1, input: 'part',
    blurb: 'Attribute-by-attribute vs a benchmark; every gap becomes a target.',
    needs: 'Your part and a benchmark, as attribute lines — or raw teardown notes for the AI to extract.',
    returns: 'Every attribute gap, sized, with the significant ones flagged.',
    lenses: ['Mass', 'Part count', 'Fasteners', 'Process', 'Material'],
  },
  {
    id: 'dfa', name: 'DFA / Part Consolidation', tier: 1, input: 'parts',
    blurb: 'Find deletable parts — theoretical minimum count.',
    needs: 'The parts list. Flag which ones move, differ in material, or must separate for service.',
    returns: 'The Boothroyd-Dewhurst theoretical minimum and the named deletable candidates.',
    lenses: ['Does it move?', 'Different material?', 'Must it separate?', 'Consolidation set'],
  },
  {
    id: 'design-to-cost', name: 'Design-to-Cost', tier: 1, input: 'target',
    blurb: 'Work back from a price target; close the cost gap.',
    needs: 'Current cost and target cost.',
    returns: 'The gap, split into per-bucket targets you can hand to owners.',
    lenses: ['Material', 'Process', 'Assembly', 'Overhead', 'Logistics'],
  },
  {
    id: 'scamper', name: 'SCAMPER', tier: 2, input: 'part',
    blurb: 'Fast 7-verb creativity checklist — broad first pass.',
    needs: 'Just the part. This is the cheapest first sweep on the page.',
    returns: 'Seven angles on one part — deliberately broad, deliberately unfiltered.',
    lenses: ['Substitute', 'Combine', 'Adapt', 'Modify', 'Put to other use', 'Eliminate', 'Reverse'],
  },
  {
    id: 'morphological', name: 'Morphological', tier: 2, input: 'part',
    blurb: 'Explore different concepts by mixing sub-function options.',
    needs: 'The part and its sub-functions.',
    returns: 'The size of the concept space, and concepts sampled across it rather than clustered.',
    lenses: ['Sub-functions', 'Options per function', 'Combination space', 'Sampled concepts'],
  },
  {
    id: 'effects-trends', name: 'Effects & Trends', tier: 3, input: 'part',
    blurb: 'Deliver a function with a physical effect; jump a generation.',
    needs: 'The function you need delivered, not the part that delivers it today.',
    returns: 'Physical effects that deliver the same function by another route.',
    lenses: ['Mechanical', 'Magnetic', 'Thermal', 'Fluidic', 'Electrostatic', 'Optical'],
  },
  {
    id: 'circularity', name: 'Design for Circularity', tier: 3, input: 'part',
    blurb: 'Cut cost and meet end-of-life rules (EU ELV).',
    needs: 'The part and its material.',
    returns: 'Ideas that cut cost and end-of-life exposure at the same time.',
    lenses: ['Disassembly', 'Material purity', 'Reuse', 'Recyclate content', 'ELV compliance'],
  },
];

const TIER_LABEL: Record<number, string> = { 1: 'Rigorous', 2: 'Fast lens', 3: 'Advanced' };
const TIER_NOTE: Record<number, string> = {
  1: 'Deterministic analysis first, then ideas built on it.',
  2: 'A quick sweep. Broad by design, cheap to run.',
  3: 'Reaches further from today\'s design. Higher variance.',
};
const TIER_TEXT: Record<number, string> = { 1: 'text-gold-300', 2: 'text-teal-300', 3: 'text-violet-300' };
const TIER_DOT: Record<number, string> = { 1: 'bg-gold-400', 2: 'bg-teal-400', 3: 'bg-violet-400' };

/** The stages the request actually passes through server-side, named honestly.
 *  There is no progress event from `/api/innovate/resolve`, so this shows WHAT
 *  is happening and never claims to know HOW FAR along it is — an indeterminate
 *  rail rather than a percentage nobody measured. */
const STAGES = [
  { id: 'frame', label: 'Framing the method', icon: Target },
  { id: 'diverge', label: 'Generating across lenses', icon: GitBranch },
  { id: 'check', label: 'Engine-checking every £', icon: ShieldCheck },
  { id: 'rank', label: 'Ranking what survived', icon: Gauge },
];

export default function InnovationStudioPage() {
  const { token } = useAuth();
  const [methodId, setMethodId] = useState('value-engineering');
  const [query, setQuery] = useState('');
  // The picker COLLAPSES once a method is chosen. Eleven cards in three tier
  // groups is the right way to choose the first time and the wrong way to sit
  // above the input on every run after it — the part name was two screens down.
  const [pickerOpen, setPickerOpen] = useState(true);
  const [part, setPart] = useState('');
  const [system, setSystem] = useState('');
  const [material, setMaterial] = useState('');
  // structured (optional) inputs for deterministic methods
  const [partsText, setPartsText] = useState('');       // DFA: one part per line
  const [currentCost, setCurrentCost] = useState('');    // design-to-cost
  const [targetCost, setTargetCost] = useState('');
  // spec-challenge: characteristic register + optional engine cost base
  const [charsText, setCharsText] = useState('');
  const [scProcess, setScProcess] = useState('');
  const [scWeight, setScWeight] = useState('');
  const [scTol, setScTol] = useState('standard');
  const [scFin, setScFin] = useState('standard');
  const [scCc, setScCc] = useState('');
  // teardown-delta: subject/benchmark attribute lines or pasted notes
  const [tdSubject, setTdSubject] = useState('');
  const [tdBenchmark, setTdBenchmark] = useState('');
  const [tdNotes, setTdNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [exporting, setExporting] = useState<'' | 'pdf' | 'xlsx'>('');

  // Exports are available for EVERY method: the report renders `analysis`
  // generically (tables from arrays, a metric strip from scalars), so a new
  // method exports correctly without anyone remembering to update this page.
  async function exportReport(kind: 'pdf' | 'xlsx') {
    if (!result) return;
    setExporting(kind);
    try {
      const mod = await import('../services/innovation-report');
      const payload = { ...result, subject: { part, system, material } };
      if (kind === 'pdf') mod.exportInnovationPdf(payload);
      else await mod.exportInnovationXlsx(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting('');
    }
  }
  const [pipelineIdea, setPipelineIdea] = useState<Idea | null>(null);

  const method = METHODS.find(m => m.id === methodId)!;

  // Search is over name AND blurb AND lens names, because an engineer looking
  // for "tolerance" should find Spec Challenge, and one looking for "eliminate"
  // should find SCAMPER — neither word is in the method's title.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return METHODS;
    return METHODS.filter(m =>
      m.name.toLowerCase().includes(q) || m.blurb.toLowerCase().includes(q)
      || m.lenses.some(l => l.toLowerCase().includes(q)));
  }, [query]);

  const tiers = useMemo(() => [1, 2, 3]
    .map(t => ({ tier: t, items: matches.filter(m => m.tier === t) }))
    .filter(g => g.items.length > 0), [matches]);

  async function generate() {
    if (!token) { setError('Please sign in.'); return; }
    if (methodId === 'triz') {
      // TRIZ has its own contradiction-shaped flow — send users there.
      window.location.href = '/triz';
      return;
    }
    if (!part.trim()) { setError('Name the part or assembly to analyse.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const body: Record<string, unknown> = {
        method: methodId, apiKey,
        context: { part, system, material, annualVolume: 80000, region: 'germany' },
      };
      // attach optional structured input so the method can show a real analysis
      if (methodId === 'dfa' && partsText.trim()) {
        body.parts = partsText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
          // "name | moves | material | separate"  (y flags) — or just a name
          const [name, ...flags] = line.split('|').map(s => s.trim());
          const f = flags.join(' ').toLowerCase();
          return { name, moves: /move|rotat|slide/.test(f), differentMaterial: /material|insulat|conduct/.test(f), mustSeparate: /separat|service|assembl/.test(f) };
        });
      }
      if (methodId === 'design-to-cost' && currentCost && targetCost) {
        body.currentCost = Number(currentCost);
        body.targetCost = Number(targetCost);
      }
      if (methodId === 'spec-challenge') {
        if (charsText.trim()) {
          // "name | kind | current | ctq reason" — 4th field marks critical-to-quality
          body.characteristics = charsText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
            const [name, kind, current, ctqField] = line.split('|').map(s => s.trim());
            return {
              name, kind: (kind || 'tolerance').toLowerCase(), current: current || '',
              ctq: !!ctqField, ctqReason: ctqField || '',
            };
          });
        }
        if (material && scProcess && scWeight) {
          body.costBase = {
            material, process: scProcess, weightKg: Number(scWeight),
            toleranceClass: scTol, surfaceFinish: scFin,
            criticalCharacteristics: Number(scCc) || 0,
          };
        }
      }
      if (methodId === 'teardown-delta') {
        // "attribute | value" lines per side; pasted notes go to AI extraction
        const parseAttrs = (text: string) => text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
          const [name, ...rest] = line.split('|').map(s => s.trim());
          return { name, value: rest.join(' | ') };
        }).filter(a => a.name && a.value);
        const subj = parseAttrs(tdSubject);
        const bench = parseAttrs(tdBenchmark);
        if (subj.length && bench.length) { body.subject = subj; body.benchmark = bench; }
        else if (tdNotes.trim()) body.notes = tdNotes.trim();
      }
      const r = await fetch('/api/innovate/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Idea generation failed.');
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Idea generation failed.');
    } finally { setLoading(false); }
  }

  return (
    <div className="relative min-h-screen bg-navy-950 pt-20 pb-16 px-4 overflow-hidden">
      {/* Ambient field. Purely decorative and therefore hidden from assistive
          technology; every animation in it is behind prefers-reduced-motion. */}
      <div className="iv-backdrop" aria-hidden="true" />
      <div className="iv-motes" aria-hidden="true" />
      <div className="iv-motes2" aria-hidden="true" />
      <div className="iv-glow iv-glow-gold" aria-hidden="true" />
      <div className="iv-glow iv-glow-violet" aria-hidden="true" />
      <div className="iv-glow iv-glow-teal" aria-hidden="true" />

      <div className="relative max-w-5xl mx-auto">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="text-center mb-9">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="iv-mark inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-500/20 to-violet-500/10 border border-gold-500/25 mb-5">
            <Wand2 size={30} className="text-gold-400" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.06 }}
            className="iv-title text-4xl sm:text-5xl font-black mb-3 tracking-tight">
            Innovation Studio
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
            {/* COUNTED, not typed. This line read "Eight structured methods" while
                the list held eleven — a number in the product's own shop window
                that nobody updated when methods were added. */}
            <span className="text-white font-semibold">{METHODS.length}</span> structured methods for generating
            cost-reduction ideas. Each gives the AI a proven thinking framework — one problem, many lenses —
            and every idea comes back <span className="text-gold-400">engine-checked</span>.
          </motion.p>
        </div>

        {/* ── Method picker ────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              <Lightbulb size={15} className="text-gold-400" aria-hidden="true" /> Choose a method
            </h2>
            <div className="flex items-center gap-2">
              {pickerOpen && (
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                  <input
                    value={query} onChange={e => setQuery(e.target.value)}
                    aria-label="Filter methods by name, description or lens"
                    placeholder="Filter — try &quot;tolerance&quot;, &quot;eliminate&quot;"
                    className="w-44 sm:w-60 bg-navy-900 border border-white/10 rounded-lg pl-7 pr-2.5 py-1.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/50" />
                </div>
              )}
              <button
                onClick={() => setPickerOpen(o => !o)}
                aria-expanded={pickerOpen}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-navy-900 text-slate-300 hover:border-white/25 text-xs transition-colors">
                <ChevronDown size={13} aria-hidden="true"
                  className={`transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                {pickerOpen ? 'Hide' : `All ${METHODS.length} methods`}
              </button>
            </div>
          </div>

          {/* Collapsed: the chosen method in one line, so the working area stays
              in reach and the choice is still visible and reversible. */}
          {!pickerOpen && (
            <button
              onClick={() => setPickerOpen(true)}
              className={`iv-method iv-tier-${method.tier} w-full text-left flex items-center gap-3 p-3 pl-5 rounded-xl border border-gold-500/40 bg-gold-500/[0.07]`}>
              <span className="iv-spot" aria-hidden="true" />
              <span className={`relative shrink-0 w-2 h-2 rounded-full ${TIER_DOT[method.tier]} iv-aperture`} aria-hidden="true" />
              <span className="relative min-w-0 flex-1">
                <span className="block text-gold-300 font-semibold text-sm truncate">{method.name}</span>
                <span className="block text-slate-400 text-xs truncate">{method.blurb}</span>
              </span>
              <span className={`relative shrink-0 text-[10px] font-semibold uppercase tracking-wider ${TIER_TEXT[method.tier]}`}>{TIER_LABEL[method.tier]}</span>
            </button>
          )}

          {pickerOpen && tiers.length === 0 && (
            <p className="text-slate-500 text-sm py-6 text-center">
              No method matches “{query}”. Every method is listed without a filter.
            </p>
          )}

          {pickerOpen && <div className="space-y-4">
            {tiers.map(({ tier, items }) => (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOT[tier]}`} aria-hidden="true" />
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${TIER_TEXT[tier]}`}>{TIER_LABEL[tier]}</span>
                  <span className="text-slate-600 text-[11px]">{TIER_NOTE[tier]}</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" role="group" aria-label={`${TIER_LABEL[tier]} methods`}>
                  {items.map(m => (
                    <MethodCard
                      key={m.id} m={m} selected={methodId === m.id}
                      onSelect={() => { setMethodId(m.id); setResult(null); setError(''); setPickerOpen(false); }} />
                  ))}
                </div>
              </div>
            ))}
          </div>}
        </div>

        {/* ── What this method does, before you commit to running it ───────── */}
        <MethodPreview method={method} result={result} />

        {/* ── Input ────────────────────────────────────────────────────────── */}
        <div className="relative bg-navy-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
          {methodId === 'triz' ? (
            <div className="text-center py-4">
              <p className="text-slate-300 text-sm mb-3">TRIZ works from a <span className="text-white">contradiction</span> ("lighter without losing stiffness"), so it has its own studio.</p>
              <a href="/triz" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold text-sm transition-all">Open TRIZ Studio <ArrowRight size={16} /></a>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <input value={part} onChange={e => setPart(e.target.value)} placeholder="Part / assembly (e.g. front knuckle)" aria-label="Part or assembly"
                  className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/50" />
                <input value={system} onChange={e => setSystem(e.target.value)} placeholder="System (optional)" aria-label="System"
                  className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                <input value={material} onChange={e => setMaterial(e.target.value)} placeholder="Current material (optional)" aria-label="Current material"
                  className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
              </div>

              {methodId === 'dfa' && (
                <div className="mt-3">
                  <label className="block text-xs text-slate-400 mb-1" htmlFor="iv-parts">Parts list (optional — one per line; add "| moves | material | service" flags for exact scoring)</label>
                  <textarea id="iv-parts" value={partsText} onChange={e => setPartsText(e.target.value)} rows={3}
                    placeholder={'e.g.\nhousing | service\ngear | moves\nspacer'}
                    className="w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40 resize-none font-mono" />
                </div>
              )}
              {methodId === 'design-to-cost' && (
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <input value={currentCost} onChange={e => setCurrentCost(e.target.value)} type="number" placeholder="Current unit cost (£)" aria-label="Current unit cost in pounds"
                    className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                  <input value={targetCost} onChange={e => setTargetCost(e.target.value)} type="number" placeholder="Target unit cost (£)" aria-label="Target unit cost in pounds"
                    className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                </div>
              )}
              {methodId === 'spec-challenge' && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1" htmlFor="iv-chars">Characteristic register (optional — one per line: "name | tolerance/grade/finish/test | current value | CTQ reason if critical". CTQ rows are locked and never challenged.)</label>
                    <textarea id="iv-chars" value={charsText} onChange={e => setCharsText(e.target.value)} rows={4}
                      placeholder={'e.g.\nbore diameter | tolerance | IT7\nsurface Ra | finish | 0.8\nmounting face flatness | tolerance | 0.05 | crash load path'}
                      className="w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40 resize-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Engine cost base (optional — with material above, enables engine-verified relaxation savings)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <input value={scProcess} onChange={e => setScProcess(e.target.value)} placeholder="Process (e.g. CNC machining)" aria-label="Process"
                        className="col-span-2 sm:col-span-1 bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                      <input value={scWeight} onChange={e => setScWeight(e.target.value)} type="number" placeholder="Weight kg" aria-label="Weight in kilograms"
                        className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                      <select value={scTol} onChange={e => setScTol(e.target.value)} aria-label="Tolerance class" className="bg-navy-800 border border-white/15 rounded-lg px-2 py-2 text-white text-xs focus:outline-none">
                        <option value="standard">Std tolerance</option><option value="tight">Tight</option><option value="precision">Precision</option>
                      </select>
                      <select value={scFin} onChange={e => setScFin(e.target.value)} aria-label="Surface finish" className="bg-navy-800 border border-white/15 rounded-lg px-2 py-2 text-white text-xs focus:outline-none">
                        <option value="standard">Std finish</option><option value="fine">Fine</option><option value="polished">Polished</option>
                      </select>
                      <input value={scCc} onChange={e => setScCc(e.target.value)} type="number" placeholder="# CCs" aria-label="Number of critical characteristics"
                        className="bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40" />
                    </div>
                  </div>
                </div>
              )}

              {methodId === 'teardown-delta' && (
                <div className="mt-3 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1" htmlFor="iv-td-subject">Your part — attributes ("name | value", one per line)</label>
                      <textarea id="iv-td-subject" value={tdSubject} onChange={e => setTdSubject(e.target.value)} rows={4}
                        placeholder={'mass kg | 4.2\npart count | 7\nfastener count | 12\nmaterial | stamped steel'}
                        className="w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40 resize-none font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1" htmlFor="iv-td-bench">Benchmark part — attributes ("name | value")</label>
                      <textarea id="iv-td-bench" value={tdBenchmark} onChange={e => setTdBenchmark(e.target.value)} rows={4}
                        placeholder={'mass kg | 2.9\npart count | 3\nfastener count | 4\nmaterial | Al HPDC'}
                        className="w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40 resize-none font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1" htmlFor="iv-td-notes">…or paste raw teardown notes (AI extracts the attribute table verbatim — used only when the tables above are empty)</label>
                    <textarea id="iv-td-notes" value={tdNotes} onChange={e => setTdNotes(e.target.value)} rows={3}
                      placeholder="e.g. Our bracket: 4.2 kg, 7 stampings, 12 M6 bolts. Benchmark (competitor X): single 2.9 kg aluminium HPDC, 4 bolts…"
                      className="w-full bg-navy-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-gold-500/40 resize-none" />
                  </div>
                </div>
              )}

              {error && <p className="text-red-400 text-sm mt-4" role="alert">{error}</p>}
              <button onClick={generate} disabled={loading}
                className="group relative w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-gold-500 to-amber-400 hover:from-gold-400 hover:to-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-navy-950 font-semibold transition-all overflow-hidden">
                {loading
                  ? <><ButtonSpinner size={16} /> Generating with {method.name}…</>
                  : <><Sparkles size={18} className="transition-transform group-hover:rotate-12" /> Generate Ideas · {method.name}</>}
              </button>
            </>
          )}
        </div>

        {/* ── The generating state ─────────────────────────────────────────── */}
        <AnimatePresence>{loading && <SynthesisRail method={method} />}</AnimatePresence>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {result && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Deterministic analysis panel (method-specific, best-effort) */}
            {result.analysis != null && <AnalysisPanel methodId={result.method.id} analysis={result.analysis} />}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h2 className="text-white font-bold text-lg flex items-center gap-2"><Cpu size={18} className="text-gold-400" aria-hidden="true" /> Generated Ideas · {result.method.name}</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => exportReport('pdf')} disabled={exporting !== ''}
                    title="Branded PDF report: method analysis, every idea in full, and each engine-check verdict."
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold-500/30 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20 text-xs transition-colors disabled:opacity-50">
                    {exporting === 'pdf' ? <ButtonSpinner size={12} /> : <FileDown size={13} aria-hidden="true" />} Export PDF
                  </button>
                  <button onClick={() => exportReport('xlsx')} disabled={exporting !== ''}
                    title="Formatted Excel workbook: summary, filterable idea table, and one sheet per analysis table."
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs transition-colors disabled:opacity-50">
                    {exporting === 'xlsx' ? <ButtonSpinner size={12} /> : <Table2 size={13} aria-hidden="true" />} Export Excel
                  </button>
                </div>
              </div>

              {/* CONVERGENCE, in real numbers. How many ideas came back, how many
                  the engine could check, and how many it agreed with — the shape
                  of the whole page stated once. */}
              <ConvergenceStrip ideas={result.ideas.length} checks={result.engineChecks ?? null} />

              <div className="space-y-3 mt-4">
                {result.ideas.map((idea, i) => (
                  <IdeaCard key={i} idea={idea} index={i} onPipeline={() => setPipelineIdea(idea)} />
                ))}
              </div>
            </div>
            <p className="text-slate-600 text-xs text-center">Method structure is deterministic; every £ figure is engine-checked or labelled. Validate before commercial use.</p>
          </motion.div>
        )}

        {pipelineIdea && (
          <BusinessCaseModal
            ideaTitle={pipelineIdea.title}
            ideaSource={`innovation:${result?.method.id || methodId}`}
            systemName={system || (result ? result.method.name : method.name)}
            onClose={() => setPipelineIdea(null)}
            onSaved={() => { setPipelineIdea(null); toast('Added to Pipeline', 'success'); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Method card ──────────────────────────────────────────────────────────────
// The spotlight follows the pointer via two CSS custom properties. It is set on
// the element rather than in React state on purpose: a state update per
// mousemove would re-render the whole picker sixty times a second.
function MethodCard({ m, selected, onSelect }: { m: Method; selected: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const track = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <button
      ref={ref} onClick={onSelect} onMouseMove={track}
      aria-pressed={selected}
      className={`iv-method iv-tier-${m.tier} text-left p-4 pl-5 rounded-xl border
        ${selected ? 'border-gold-500/50 bg-gold-500/10' : 'border-white/10 bg-navy-900/70 hover:border-white/25'}`}>
      <span className="iv-spot" aria-hidden="true" />
      <span className="relative flex items-center justify-between mb-1 gap-2">
        <span className={`font-semibold text-sm ${selected ? 'text-gold-300' : 'text-white'}`}>{m.name}</span>
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${TIER_DOT[m.tier]} ${selected ? 'iv-aperture' : ''}`} aria-hidden="true" />
      </span>
      <span className="relative block text-slate-400 text-xs leading-snug">{m.blurb}</span>
      <span className="relative block text-slate-600 text-[10px] mt-1.5">{m.lenses.length} lenses</span>
    </button>
  );
}

// ── Method preview ───────────────────────────────────────────────────────────
// The empty state used to be nothing at all: pick a method, stare at a blank
// page, guess what it wants. This says what the method needs, what it gives
// back, and DRAWS the divergence — one problem opening into N lenses.
function MethodPreview({ method, result }: { method: Method; result: Result | null }) {
  return (
    <motion.div
      key={method.id}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="bg-navy-900/60 backdrop-blur-sm border border-white/10 rounded-2xl p-5 mb-6">
      <div className="grid md:grid-cols-[minmax(0,1fr)_auto] gap-5 items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${TIER_TEXT[method.tier]}`}>{TIER_LABEL[method.tier]}</span>
            <span className="text-slate-700">·</span>
            <span className="text-white font-semibold text-sm">{method.name}</span>
          </div>
          <dl className="space-y-2">
            <div className="flex gap-2">
              <dt className="text-slate-500 text-xs shrink-0 w-24">It needs</dt>
              <dd className="text-slate-300 text-xs leading-relaxed">{method.needs}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500 text-xs shrink-0 w-24">You get back</dt>
              <dd className="text-slate-300 text-xs leading-relaxed">{method.returns}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {method.lenses.map(l => (
              <span key={l} className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-slate-400 text-[10px]">{l}</span>
            ))}
          </div>
        </div>
        <DivergenceFan key={method.id + (result ? 'r' : '')} lenses={method.lenses.length} converged={result?.ideas.length ?? null} />
      </div>
    </motion.div>
  );
}

// One source, N lenses, one convergence — drawn, not decorated. Before a run the
// right-hand node is hollow; after one it carries the real idea count.
function DivergenceFan({ lenses, converged }: { lenses: number; converged: number | null }) {
  const n = Math.min(lenses, 7);
  const H = 108, W = 176, midY = H / 2;
  const ys = Array.from({ length: n }, (_, i) => 14 + (i * (H - 28)) / Math.max(1, n - 1));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 mx-auto md:mx-0"
      role="img" aria-label={`This method opens one problem into ${lenses} lenses${converged != null ? `, which returned ${converged} ideas` : ''}.`}>
      {ys.map((y, i) => (
        <path key={`a${i}`} className="iv-fan-line" d={`M 20 ${midY} C 60 ${midY}, 60 ${y}, 88 ${y}`}
          stroke="rgba(245,158,11,0.45)" strokeWidth="1.2" fill="none"
          style={{ animationDelay: `${i * 60}ms` }} />
      ))}
      {ys.map((y, i) => (
        <path key={`b${i}`} className="iv-fan-line" d={`M 88 ${y} C 116 ${y}, 116 ${midY}, 156 ${midY}`}
          stroke="rgba(139,92,246,0.4)" strokeWidth="1.2" fill="none"
          style={{ animationDelay: `${240 + i * 60}ms` }} />
      ))}
      <circle cx="20" cy={midY} r="5" fill="#0f172a" stroke="rgba(245,158,11,0.9)" strokeWidth="1.5" />
      {ys.map((y, i) => (
        <circle key={`n${i}`} className="iv-fan-node" cx="88" cy={y} r="3"
          fill="rgba(245,158,11,0.75)" style={{ animationDelay: `${200 + i * 60}ms` }} />
      ))}
      <circle cx="156" cy={midY} r={converged != null ? 8 : 5}
        fill={converged != null ? 'rgba(139,92,246,0.22)' : '#0f172a'}
        stroke="rgba(139,92,246,0.9)" strokeWidth="1.5" />
      {converged != null && (
        <text x="156" y={midY + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#c4b5fd">{converged}</text>
      )}
    </svg>
  );
}

// ── The generating state ─────────────────────────────────────────────────────
// An INDETERMINATE rail, not a percentage. `/api/innovate/resolve` sends no
// progress events, so the honest thing to show is WHAT is happening and not how
// far along it is — a bar creeping to 90% and stopping is a lie with a
// progress indicator drawn on it.
function SynthesisRail({ method }: { method: Method }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden mb-6">
      <div className="bg-navy-900/70 backdrop-blur-sm border border-gold-500/20 rounded-2xl p-5"
        role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-white text-sm font-semibold">Running {method.name} across {method.lenses.length} lenses…</p>
          <span className="text-slate-500 text-[11px]">no progress figure — the endpoint reports none</span>
        </div>
        <div className="iv-rail mb-4" aria-hidden="true" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAGES.map(s => (
            <div key={s.id} className="iv-stage iv-stage-live flex items-center gap-2">
              <span className="iv-stage-dot shrink-0" aria-hidden="true" />
              <s.icon size={13} className="text-gold-400/80 shrink-0" aria-hidden="true" />
              <span className="text-slate-300 text-[11px] leading-tight">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Convergence strip ────────────────────────────────────────────────────────
function ConvergenceStrip({ ideas, checks }: { ideas: number; checks: { checked: number; confirmed: number; contradicted: number } | null }) {
  const unchecked = checks ? Math.max(0, ideas - checks.checked) : ideas;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-1 text-xs">
      <span className="iv-count text-slate-400"><span className="text-white font-semibold">{ideas}</span> ideas</span>
      {checks && checks.checked > 0 && (
        <>
          <span className="iv-count text-slate-400" style={{ animationDelay: '60ms' }}>
            <span className="text-white font-semibold">{checks.checked}</span> engine-checked
          </span>
          <span className="iv-count text-emerald-400" style={{ animationDelay: '120ms' }}>{checks.confirmed} confirmed</span>
          <span className="iv-count text-amber-400" style={{ animationDelay: '180ms' }}>{checks.contradicted} contradicted</span>
        </>
      )}
      {/* Named, not hidden. An idea the engine could not price is not an idea it
          approved, and the difference has to be visible without arithmetic. */}
      {unchecked > 0 && (
        <span className="iv-count text-slate-500" style={{ animationDelay: '240ms' }}>
          {unchecked} not engine-checked — no modelled driver connects them to a price
        </span>
      )}
    </div>
  );
}

// ── Idea card ────────────────────────────────────────────────────────────────
function IdeaCard({ idea, index, onPipeline }: { idea: Idea; index: number; onPipeline: () => void }) {
  const v = idea.engineCheck;
  const edge = v ? (v.direction === 'confirmed' ? 'iv-idea-confirmed' : 'iv-idea-contradicted') : '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.06, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={`iv-idea iv-crystallise ${edge} bg-navy-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:border-gold-500/25`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        {idea.lens
          ? <span className="px-2 py-0.5 rounded-md bg-gold-500/10 border border-gold-500/20 text-gold-400 text-[11px] font-semibold">{idea.lens}</span>
          : <span />}
        {v && (
          <span className={`flex items-center gap-1.5 text-xs font-medium ${v.direction === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>
            <VerdictRing pct={v.savingPct} confirmed={v.direction === 'confirmed'} />
            {v.direction === 'confirmed' ? <CheckCircle size={13} aria-hidden="true" /> : <XCircle size={13} aria-hidden="true" />}
            Engine {v.direction} ({v.savingPct > 0 ? '−' : '+'}{Math.abs(v.savingPct)}%)
          </span>
        )}
      </div>
      <h3 className="text-white font-semibold mb-2">{idea.title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed mb-2">{idea.technicalDescription}</p>
      <p className="text-teal-300 text-xs mb-1"><span className="text-slate-500">Cost angle:</span> {idea.costAngle}</p>
      {idea.riskNotes && <p className="text-amber-300/80 text-xs mb-3"><span className="text-slate-500">Risk:</span> {idea.riskNotes}</p>}
      <div className="flex justify-end">
        <button onClick={onPipeline}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/50 transition-colors text-xs">
          <Layers size={11} aria-hidden="true" /> Add to Pipeline
        </button>
      </div>
    </motion.div>
  );
}

// A small arc drawn to the engine's saving figure. Capped at 100% of the ring so
// a 300% outlier does not wrap round and read as 0 — the number beside it is the
// authority, this is the glance.
function VerdictRing({ pct, confirmed }: { pct: number; confirmed: boolean }) {
  const C = 2 * Math.PI * 8;                        // r = 8
  const frac = Math.min(1, Math.abs(pct) / 100);
  const rest = C * (1 - frac);
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="iv-verdict-ring shrink-0" aria-hidden="true">
      <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="2.4" />
      <circle
        cx="10" cy="10" r="8" fill="none" strokeWidth="2.4" strokeLinecap="round"
        stroke={confirmed ? '#34d399' : '#fbbf24'}
        className="iv-verdict-arc"
        style={{ strokeDasharray: C, strokeDashoffset: rest, ['--arc-rest' as string]: rest }} />
    </svg>
  );
}

// ── Deterministic-analysis renderers (best-effort, method-specific) ──────────
function AnalysisPanel({ methodId, analysis }: { methodId: string; analysis: unknown }) {
  const a = analysis as Record<string, unknown>;
  if (methodId === 'dfa' && typeof a.totalParts === 'number') {
    return (
      <Panel title="DFA analysis (Boothroyd-Dewhurst)">
        <div className="flex flex-wrap gap-2 text-sm">
          <Stat label="Parts" value={String(a.totalParts)} />
          <Stat label="Theoretical min" value={String(a.theoreticalMin)} gold />
          <Stat label="Design efficiency" value={`${a.designEfficiencyPct}%`} />
        </div>
        {Array.isArray(a.consolidationCandidates) && a.consolidationCandidates.length > 0 && (
          <p className="text-slate-400 text-xs mt-3">Deletable candidates: <span className="text-amber-300">{(a.consolidationCandidates as string[]).join(', ')}</span></p>
        )}
      </Panel>
    );
  }
  if (methodId === 'value-engineering' && Array.isArray(a.rows)) {
    return (
      <Panel title="Function value analysis">
        <ValueRows rows={a.rows as ValueRow[]} />
      </Panel>
    );
  }
  if (methodId === 'fast' && Array.isArray(a.functions)) {
    return (
      <Panel title={`Function-cost matrix ${a.proposedBy === 'ai' ? '(AI-proposed, invariant-validated)' : '(user-supplied)'}`}>
        <ValueRows rows={a.functions as ValueRow[]} />
        {Array.isArray(a.components) && (
          <p className="text-slate-500 text-xs mt-3">Components: {(a.components as { name: string; costPct: number }[]).map(c => `${c.name} ${c.costPct}%`).join(' · ')}</p>
        )}
        {Array.isArray(a.poorValueFunctions) && (a.poorValueFunctions as string[]).length > 0 && (
          <p className="text-slate-400 text-xs mt-2">Attack first: <span className="text-red-400">{(a.poorValueFunctions as string[]).join(', ')}</span></p>
        )}
      </Panel>
    );
  }
  if (methodId === 'spec-challenge' && (Array.isArray(a.register) || a.engineDeltas)) {
    const reg = (a.register as { name: string; kind: string; current: string; ctq: boolean; ctqReason: string }[]) || [];
    const deltas = a.engineDeltas as { baseline: number; steps: { id: string; label: string; savingEur: number; savingPct: number }[] } | null;
    return (
      <Panel title="Characteristic register">
        {reg.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {reg.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs gap-3">
                <span className={`flex-1 truncate ${r.ctq ? 'text-slate-500' : 'text-slate-300'}`}>{r.name} <span className="text-slate-600">[{r.kind}]</span>{r.current ? ` — ${r.current}` : ''}</span>
                {r.ctq
                  ? <span className="text-red-400/80 font-medium" title={r.ctqReason}>🔒 CTQ — locked</span>
                  : <span className="text-emerald-400">challengeable</span>}
              </div>
            ))}
          </div>
        )}
        {deltas && deltas.steps.length > 0 && (
          <>
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-2 mt-3">Engine-verified relaxation savings (baseline €{deltas.baseline})</p>
            <div className="flex flex-wrap gap-2">
              {deltas.steps.map(s => (
                <span key={s.id} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                  {s.label}: −€{s.savingEur} ({s.savingPct}%)
                </span>
              ))}
            </div>
          </>
        )}
      </Panel>
    );
  }
  if (methodId === 'teardown-delta' && Array.isArray(a.rows)) {
    const rows = a.rows as { attribute: string; subject: unknown; benchmark: unknown; kind: string; deltaPct?: number | null; direction?: string; significant: boolean }[];
    return (
      <Panel title={`Teardown delta (${String(a.significantCount)} significant gap${a.significantCount === 1 ? '' : 's'})`}>
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs gap-3">
              <span className="text-slate-300 flex-1 truncate">{r.attribute}</span>
              <span className="text-slate-500 font-mono">{String(r.subject ?? '—')} vs {String(r.benchmark ?? '—')}</span>
              {r.kind === 'numeric' && r.deltaPct != null && (
                <span className={`font-mono font-semibold ${r.significant ? 'text-red-400' : 'text-slate-500'}`}>{r.deltaPct > 0 ? '+' : ''}{r.deltaPct}%</span>
              )}
              {r.kind === 'categorical' && (
                <span className={`font-medium ${r.significant ? 'text-amber-400' : 'text-slate-600'}`}>{r.significant ? 'differs' : 'same'}</span>
              )}
              {(r.kind === 'subject-only' || r.kind === 'benchmark-only') && <span className="text-slate-600">{r.kind}</span>}
            </div>
          ))}
        </div>
      </Panel>
    );
  }
  if (methodId === 'design-to-cost' && typeof a.gap === 'number') {
    return (
      <Panel title="Cost-gap analysis">
        <div className="flex flex-wrap gap-2 text-sm">
          <Stat label="Current" value={`£${a.currentCost}`} />
          <Stat label="Target" value={`£${a.targetCost}`} />
          <Stat label="Gap to close" value={`£${a.gap} (${a.gapPct}%)`} gold />
        </div>
        {Array.isArray(a.allocations) && a.allocations.length > 0 && (
          <p className="text-slate-400 text-xs mt-3">Per-bucket targets: {(a.allocations as { name: string; target: number }[]).map(x => `${x.name} £${x.target}`).join(' · ')}</p>
        )}
      </Panel>
    );
  }
  if (methodId === 'morphological' && typeof a.totalCombinations === 'number') {
    return (
      <Panel title="Concept space">
        <p className="text-slate-300 text-sm">{a.totalCombinations} possible combinations across {(a.dimensions as { name: string }[]).map(d => d.name).join(' × ')}.</p>
      </Panel>
    );
  }
  return null;
}

interface ValueRow { name: string; costPct: number; worthPct: number; valueIndex: number; verdict: string }

// The value index as a BAR as well as a number: cost against worth is a
// comparison, and a comparison read as two figures on a line is arithmetic the
// reader has to do.
//
// The first version let the bars run the full panel width. At 1340px that put a
// 46% bar 400px long with its own label sitting on top of it, and the two
// stacked bars read as one broken line. The track is now a FIXED 160px column,
// so the bars are a chart beside the text rather than a decoration behind it.
function ValueRows({ rows }: { rows: ValueRow[] }) {
  const max = Math.max(1, ...rows.flatMap(r => [r.costPct, r.worthPct]));
  return (
    <div className="space-y-3">
      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_160px_58px] gap-3 text-[10px] uppercase tracking-wider text-slate-600">
        <span>Function</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><i className="w-2 h-1 rounded-full bg-red-400/70 inline-block" aria-hidden="true" />cost</span>
          <span className="flex items-center gap-1"><i className="w-2 h-1 rounded-full bg-emerald-400/70 inline-block" aria-hidden="true" />worth</span>
        </span>
        <span className="text-right">Value</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid sm:grid-cols-[minmax(0,1fr)_160px_58px] gap-1 sm:gap-3 sm:items-center">
          <div className="min-w-0">
            <p className="text-slate-300 text-xs truncate">{r.name}</p>
            <p className="text-slate-600 text-[10px] font-mono">cost {r.costPct}% · worth {r.worthPct}%</p>
          </div>
          <div className="space-y-1" aria-hidden="true">
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div className="h-full rounded-full bg-red-400/75"
                initial={{ width: 0 }} animate={{ width: `${(r.costPct / max) * 100}%` }}
                transition={{ duration: 0.55, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div className="h-full rounded-full bg-emerald-400/75"
                initial={{ width: 0 }} animate={{ width: `${(r.worthPct / max) * 100}%` }}
                transition={{ duration: 0.55, delay: 0.07 + i * 0.05, ease: [0.22, 1, 0.36, 1] }} />
            </div>
          </div>
          {/* A value index below 0.7 means you pay far more than the function is
              worth. Colour says it at a glance; the number is the authority. */}
          <span className={`font-mono font-semibold text-xs sm:text-right ${r.valueIndex < 0.7 ? 'text-red-400' : r.valueIndex > 1.4 ? 'text-blue-400' : 'text-emerald-400'}`}>
            VI {r.valueIndex}
          </span>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="bg-navy-900/80 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">{title}</p>
      {children}
    </motion.div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <span className={`px-3 py-1.5 rounded-lg border ${gold ? 'bg-gold-500/10 border-gold-500/25 text-gold-300' : 'bg-white/5 border-white/10 text-slate-300'}`}>
      <span className="text-slate-500 mr-1.5">{label}</span>{value}
    </span>
  );
}
