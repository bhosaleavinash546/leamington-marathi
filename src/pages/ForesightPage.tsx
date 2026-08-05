import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Telescope, Sparkles, Landmark, Factory, ChevronDown, ChevronUp, FileSearch, ExternalLink, Microscope, Users, BookMarked, Trash2, RotateCcw, FileDown, Mountain, Gem, Cpu, Layers, Sun, Moon } from 'lucide-react';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { useAuth } from '../contexts/AuthContext';
import { exportForesightPdf } from '../services/foresight-report';
import './foresight.css';

// BrainSpark Horizon — technology foresight for any part/commodity across
// ICE/MHEV/PHEV/BEV. Every number on this page is deterministic (curated
// register + S-curve/Bass/Wright cores); the AI writes the briefing only.

interface RegAnchor { id: string; name: string; year: number; region: string; status?: 'in-force' | 'adopted' | 'proposed' | 'under-revision'; effect: string; }
type Crossing = number | 'passed' | null;
type CrossingBand = [number | null, number | null] | null;
interface Projection { basis: string; adoption: Record<string, number>; costIndex: Record<string, number>; crossings?: { cross25: Crossing; cross50: Crossing; band25?: CrossingBand; band50?: CrossingBand; share25?: number; share50?: number; ceiling?: number; peakGrowth?: Crossing }; }
interface TechCard {
  id: string; name: string; commodity: string; powertrains: string[]; replaces: string;
  trl: number; adoptionPct: number; firstProduction?: string; drivers: string[];
  costTrend: string; players: string[]; note: string;
  phase: string; horizon: 'H1' | 'H2' | 'H3'; regPulled: boolean; momentum: number;
  confidence: 'committed' | 'probable' | 'speculative';
  regAnchorDetail: RegAnchor | null; projection: Projection;
  related?: boolean; origin?: string; sourceUrl?: string;
}
interface HorizonWindow { label: string; from: number; to: number | null; }
interface ForesightResult {
  query: string; commodity: string | null; powertrain: string | null;
  segment?: string | null;
  benchmarks?: BenchmarkVehicle[];
  matchedByTerms: boolean; count: number;
  windows: { H1: HorizonWindow; H2: HorizonWindow; H3: HorizonWindow };
  horizons: { H1: TechCard[]; H2: TechCard[]; H3: TechCard[] };
  anchors: RegAnchor[];
  narrative: { briefing: string; signals: Array<{ techId: string; watch: string }> } | null;
  narrativeNote?: string | null;
  researched?: ResearchedBlock | null;
  note?: string;
}
interface ResearchedCandidate {
  id: string; name: string; whatItIs: string; replaces: string; whyItMatters: string;
  earliestProduction: string; players: string[]; sourceUrl: string;
  trl: number; adoptionPct: number; phase: string; horizon: 'H1' | 'H2' | 'H3';
  projection: { basis: string; adoption: Record<string, number>; crossings?: { cross25: Crossing; cross50: Crossing; share25?: number; share50?: number; peakGrowth?: Crossing }; estimatedInputs?: boolean };
}
interface ResearchedBlock {
  candidates: ResearchedCandidate[];
  fromCache?: boolean; cacheAgeDays?: number;
  landscapeNote?: string | null; evidenceGaps?: string | null; trigger?: string; note?: string;
  evidence?: { searches?: Array<{ title: string; url: string; source?: string }>; patents?: Array<{ title: string; url: string; assignee?: string }> };
}
interface BenchmarkVehicle { vehicle: string; brand: string; year: number; powertrains: string[]; signature: string[]; watch: string; }
interface Catalogue { commodities: string[]; powertrains: string[]; segments?: string[]; technologies: number; vintage: number; bom?: Record<string, Record<string, string[]>>; analyzeSystems?: Record<string, string[]>; }
interface PartResearch {
  research: { summary: string; developments: Array<{ finding: string; sourceTitle: string; url: string }>; outlook: string; risks: string } | null;
  evidence?: { searches: Array<{ title: string; url: string }>; patents: PatentRef[] };
  note: string;
}
interface PatentRef { number: string; title: string; date: string; assignee: string; url: string; }
interface Evidence {
  configured: boolean; patents: PatentRef[];
  velocity: Array<{ year: number; count: number }>;
  trend: 'accelerating' | 'steady' | 'declining' | null;
  note: string;
}
interface DeepDive {
  research: {
    developments: Array<{ finding: string; sourceTitle: string; url: string }>;
    sourcingImplication: string; risks: string;
    registerVerdict: 'supports' | 'challenges' | 'mixed';
  } | null;
  note: string;
}
interface PanelCritique { techId: string; stance: 'agree' | 'caution' | 'challenge'; note: string; }
interface PanelResult { panel: Array<{ persona: string; focus: string; critiques: PanelCritique[] }>; note: string; }
interface LedgerEntry { id: string; createdAt: string; query: string | null; commodity: string | null; powertrain: string | null; vintage: number; techCount: number; }
interface LedgerRevisit {
  id: string; createdAt: string; query: string | null; commodity: string | null;
  thenVintage: number; nowVintage: number; yearsElapsed: number;
  drift: Array<{
    id: string; name: string; removed: boolean;
    trlDelta?: number; adoptionDelta?: number; horizonMoved?: boolean; momentumDelta?: number;
    projectionError?: number; projectedForNow?: number;
    then: { trl: number; adoptionPct: number; horizon: string; momentum: number };
    now: { trl: number; adoptionPct: number; horizon: string; momentum: number } | null;
  }>;
  addedTechIds: string[];
  score: { meanAbsProjectionError: number; scored: number } | null;
  note: string;
}

const EXAMPLES = ['BEV HV battery', 'EDU stator assembly', 'Inverter', 'Suspension', 'BIW underbody', 'Headlamps', 'Cockpit display', 'Seats', 'Wiring harness', 'HVAC / heat pump'];

const CONFIDENCE_STYLE: Record<TechCard['confidence'], string> = {
  committed: 'bg-gold-500/15 border-gold-500/30 text-gold-300',
  probable: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
  speculative: 'bg-white/5 border-white/15 text-slate-400',
};
const PHASE_LABEL: Record<string, string> = {
  research: 'Research', demonstration: 'Demonstration', takeoff: 'Take-off', growth: 'Growth', mainstream: 'Mainstream',
};
const TREND_LABEL: Record<string, { text: string; cls: string }> = {
  'falling-fast': { text: 'cost ↓↓', cls: 'text-emerald-400' },
  falling: { text: 'cost ↓', cls: 'text-emerald-300' },
  flat: { text: 'cost →', cls: 'text-slate-400' },
  rising: { text: 'cost ↑', cls: 'text-amber-400' },
};

/** Instrument-style count-up — numbers compute rather than appear. */
function TickNumber({ value, duration = 800 }: { value: number; duration?: number }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setN(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, duration]);
  return <span className="hz-num">{n}</span>;
}

/** FUI decode effect: text resolves out of glyph noise. */
const DECODE_GLYPHS = '01<>[]|/=+×·';
function DecodeText({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const [out, setOut] = useState(reduced ? text : '');
  useEffect(() => {
    if (reduced) { setOut(text); return; }
    let raf = 0;
    const t0 = performance.now();
    const D = 650;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / D);
      const n = Math.floor(text.length * k);
      let s = text.slice(0, n);
      if (k < 1) for (let i = 0; i < Math.min(3, text.length - n); i++) s += DECODE_GLYPHS[Math.floor(Math.random() * DECODE_GLYPHS.length)];
      setOut(s);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, reduced]);
  return <>{out}</>;
}

/** Cursor-tracking spotlight position for the card glow. */
function trackSpot(e: React.MouseEvent<HTMLDivElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--hx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--hy', `${e.clientY - r.top}px`);
}

const VERDICT_STYLE: Record<string, string> = {
  supports: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  challenges: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  mixed: 'bg-white/5 border-white/15 text-slate-300',
};

const STANCE_STYLE: Record<PanelCritique['stance'], string> = {
  agree: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  caution: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  challenge: 'bg-red-500/10 border-red-500/30 text-red-300',
};

// ── Motion-language micro-visuals (deterministic data, drawn not decorated) ──

// Where each S-curve phase sits along the logistic curve.
const PHASE_POS: Record<string, number> = { research: 0.12, demonstration: 0.32, takeoff: 0.52, growth: 0.72, mainstream: 0.9 };
const logisticY = (x: number) => 1 / (1 + Math.exp(-9 * (x - 0.5)));

/** Tiny S-curve that draws itself, with a marker at THIS tech's phase. */
function SCurveSpark({ phase }: { phase: string }) {
  const W = 78, H = 24, PAD = 3;
  const pts: string[] = [];
  for (let i = 0; i <= 26; i++) {
    const x = i / 26;
    pts.push(`${(PAD + x * (W - 2 * PAD)).toFixed(1)},${(H - PAD - logisticY(x) * (H - 2 * PAD)).toFixed(1)}`);
  }
  const mx = PHASE_POS[phase] ?? 0.5;
  const cx = PAD + mx * (W - 2 * PAD);
  const cy = H - PAD - logisticY(mx) * (H - 2 * PAD);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-label={`S-curve position: ${phase}`} role="img">
      <polyline points={pts.join(' ')} fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="1.5" strokeLinecap="round" className="hz-draw" />
      <circle cx={cx} cy={cy} r="5.5" fill="none" stroke="rgba(245,158,11,0.35)" strokeWidth="1" className="hz-marker" />
      <circle cx={cx} cy={cy} r="2.8" fill="#f59e0b" className="hz-marker" />
    </svg>
  );
}

/** Modelled adoption path (now → +8y) as a small drawn area chart. */
function BassSpark({ adoption }: { adoption: Record<string, number> }) {
  const vals = [adoption.now, adoption.in3, adoption.in5, adoption.in8];
  const W = 118, H = 32, PAD = 4;
  const max = Math.max(...vals, 1);
  const px = (i: number) => PAD + (i / 3) * (W - 2 * PAD);
  const py = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  const line = vals.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-label="Modelled adoption path" role="img">
      <polygon points={`${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`} fill="rgba(45,212,191,0.12)" />
      <polyline points={line} fill="none" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round" className="hz-draw" />
      {vals.map((v, i) => <circle key={i} cx={px(i)} cy={py(v)} r="2" fill="#2dd4bf" className="hz-marker" />)}
    </svg>
  );
}

function crossingLabel(v: Crossing, band?: CrossingBand): string {
  if (v === 'passed') return 'already passed';
  if (v === null) return 'beyond 15y';
  const range = band ? ` (${band[0] ?? '…'}–${band[1] ?? '…'})` : '';
  return `≈ ${v}${range}`;
}

const ANCHOR_STATUS_LABEL: Record<string, string> = {
  proposed: 'proposed — not yet law', 'under-revision': 'under revision — weakening',
};

function TechCardView({ c, signal, critiques }: { c: TechCard; signal?: string; critiques?: Array<{ persona: string } & PanelCritique> }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [evLoading, setEvLoading] = useState(false);
  const [dive, setDive] = useState<DeepDive | null>(null);
  const [diveLoading, setDiveLoading] = useState(false);
  const [diveError, setDiveError] = useState('');

  async function loadEvidence() {
    if (evidence) { setEvidence(null); return; }
    setEvLoading(true);
    try {
      const r = await fetch('/api/foresight/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ techId: c.id }),
      });
      const d = await r.json();
      if (r.ok) setEvidence(d);
    } finally { setEvLoading(false); }
  }

  async function loadDeepDive() {
    setDiveLoading(true); setDiveError('');
    try {
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const r = await fetch('/api/foresight/deepdive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ techId: c.id, apiKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Deep research failed.');
      setDive(d);
    } catch (e) {
      setDiveError(e instanceof Error ? e.message : 'Deep research failed.');
    } finally { setDiveLoading(false); }
  }

  const maxCount = Math.max(1, ...(evidence?.velocity ?? []).map(v => v.count));
  const reduced = useReducedMotion();
  return (
    <div className="hz-card bg-navy-900 border border-white/10 rounded-2xl p-4 hover:border-gold-500/25" onMouseMove={trackSpot}>
      <div className="hz-spot" aria-hidden="true" />
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-white font-semibold text-sm leading-snug">{c.name}</h3>
        <span className="flex shrink-0 items-center gap-1.5">
          {c.origin === 'promoted' && (
            <span className="px-1.5 py-0.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300 text-[9px] font-semibold uppercase tracking-wide" title={`Curator-promoted from AI research${c.sourceUrl ? ` — source: ${c.sourceUrl}` : ''}. Not yet part of the shipped curated register.`}>promoted</span>
          )}
          {c.related && (
            <span className="px-1.5 py-0.5 rounded-md border border-white/15 bg-white/5 text-slate-400 text-[9px] font-semibold uppercase tracking-wide" title="Widened into this landscape from the same commodity — no direct term match on your query.">related</span>
          )}
          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_STYLE[c.confidence]} ${c.confidence === 'committed' ? 'hz-committed' : ''}`}>{c.confidence}</span>
        </span>
      </div>
      <div className="flex items-end justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 font-mono hz-num">TRL {c.trl}</span>
          <span className="text-slate-400">{PHASE_LABEL[c.phase] ?? c.phase}</span>
          <span className={TREND_LABEL[c.costTrend]?.cls ?? 'text-slate-400'}>{TREND_LABEL[c.costTrend]?.text}</span>
          <span className="text-slate-500">{c.powertrains.join(' · ')}</span>
        </div>
        <div title={`S-curve position: ${PHASE_LABEL[c.phase] ?? c.phase}`}><SCurveSpark phase={c.phase} /></div>
      </div>
      {/* Momentum bar — deterministic 0-100, sweeps in from zero */}
      <div className="flex items-center gap-2 mb-2" title="Momentum: maturity + adoption + cost trajectory + drivers + regulation + production evidence">
        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-gold-400"
            initial={reduced ? { width: `${c.momentum}%` } : { width: 0 }}
            animate={{ width: `${c.momentum}%` }}
            transition={{ duration: 0.9, delay: 0.25, ease: 'easeOut' }}
          />
        </div>
        <span className="text-slate-500 text-[10px] w-14 text-right font-mono">momentum <TickNumber value={c.momentum} /></span>
      </div>
      <p className="text-slate-400 text-xs leading-relaxed mb-1.5">{c.note}</p>
      <p className="text-slate-500 text-[11px] mb-1"><span className="text-slate-600">Replaces:</span> {c.replaces}</p>
      {c.firstProduction && <p className="text-emerald-300/80 text-[11px] mb-1 flex items-center gap-1"><Factory size={11} className="shrink-0" /> {c.firstProduction}</p>}
      {c.regAnchorDetail && (
        <p className="text-gold-300/90 text-[11px] mb-1 flex items-center gap-1">
          <Landmark size={11} className="shrink-0" /> {c.regAnchorDetail.name} ({c.regAnchorDetail.year}){c.regPulled ? ' — pulls this forward' : ''}
        </p>
      )}
      {signal && <p className="text-teal-300 text-[11px] mb-1 flex items-start gap-1.5"><span className="hz-ping-dot mt-1" /> <span>Watch: {signal}</span></p>}
      <p className="text-slate-600 text-[11px]">{c.players.join(' · ')}</p>
      {critiques && critiques.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {critiques.map((cr, i) => (
            <p key={i} className="text-[11px] leading-snug">
              <span className={`inline-block px-1.5 py-px mr-1 rounded border text-[10px] ${STANCE_STYLE[cr.stance]}`}>{cr.persona}: {cr.stance}</span>
              <span className="text-slate-400">{cr.note}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-slate-500 text-[11px] hover:text-slate-300">
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {open ? 'Hide' : 'Show'} modelled projection
        </button>
        <button onClick={loadEvidence} disabled={evLoading} className="flex items-center gap-1 text-slate-500 text-[11px] hover:text-slate-300 disabled:opacity-50">
          {evLoading ? <ButtonSpinner size={10} /> : <FileSearch size={12} />} {evidence ? 'Hide' : 'Patent'} evidence
        </button>
      </div>

      <AnimatePresence initial={false}>
      {evidence && (
        <motion.div key="evidence" initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="overflow-hidden">
        <div className="mt-2 rounded-lg bg-navy-800/70 border border-white/5 p-3">
          {!evidence.configured && <p className="text-slate-500 text-[11px]">{evidence.note}</p>}
          {evidence.configured && (
            <>
              <div className="flex items-end gap-1.5 mb-1" title="US patent filings per year matching this technology">
                {evidence.velocity.map(v => (
                  <div key={v.year} className="flex flex-col items-center gap-0.5">
                    <div className="w-6 rounded-sm bg-teal-500/60" style={{ height: `${Math.max(3, (v.count / maxCount) * 34)}px` }} />
                    <span className="text-slate-600 text-[9px]">{String(v.year).slice(2)}</span>
                  </div>
                ))}
                {evidence.trend && (
                  <span className={`ml-2 mb-2 px-1.5 py-0.5 rounded border text-[10px] ${evidence.trend === 'accelerating' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : evidence.trend === 'declining' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/15 text-slate-400'}`}>
                    filings {evidence.trend}
                  </span>
                )}
              </div>
              {evidence.patents.length > 0 && (
                <div className="space-y-1 mt-2">
                  {evidence.patents.map(p => (
                    <a key={p.number} href={p.url} target="_blank" rel="noreferrer" className="flex items-start gap-1 text-[11px] text-slate-400 hover:text-teal-300">
                      <ExternalLink size={10} className="shrink-0 mt-0.5" />
                      <span>US{p.number} · {p.title.slice(0, 70)}{p.title.length > 70 ? '…' : ''} <span className="text-slate-600">({p.assignee}, {p.date.slice(0, 4)})</span></span>
                    </a>
                  ))}
                </div>
              )}
              <p className="text-slate-600 text-[10px] mt-1.5">{evidence.note}</p>
            </>
          )}
          <button onClick={loadDeepDive} disabled={diveLoading} className="mt-2 flex items-center gap-1 text-teal-400 text-[11px] hover:text-teal-300 disabled:opacity-50">
            {diveLoading ? <ButtonSpinner size={10} /> : <Microscope size={12} />} Deep research (AI, cited sources)
          </button>
          {diveError && <p className="text-red-400 text-[11px] mt-1">{diveError}</p>}
          {dive && !dive.research && <p className="text-slate-500 text-[11px] mt-1">{dive.note}</p>}
          {dive?.research && (
            <div className="mt-2 space-y-1.5">
              <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] ${VERDICT_STYLE[dive.research.registerVerdict]}`}>evidence {dive.research.registerVerdict === 'supports' ? 'supports' : dive.research.registerVerdict === 'challenges' ? 'challenges' : 'is mixed on'} the register position</span>
              {dive.research.developments.map((d, i) => (
                <p key={i} className="text-slate-400 text-[11px] leading-relaxed">
                  {d.finding}{' '}
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-teal-400 hover:text-teal-300">[{d.sourceTitle.slice(0, 40)}]</a>
                </p>
              ))}
              <p className="text-slate-300 text-[11px]"><span className="text-slate-500">Sourcing:</span> {dive.research.sourcingImplication}</p>
              <p className="text-amber-300/80 text-[11px]"><span className="text-slate-500">Uncertainty:</span> {dive.research.risks}</p>
              <p className="text-slate-600 text-[10px]">{dive.note}</p>
            </div>
          )}
        </div>
        </motion.div>
      )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
      {open && (
        <motion.div key="projection" initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="overflow-hidden">
        <div className="mt-2 rounded-lg bg-navy-800/70 border border-white/5 p-3">
          <div className="flex items-center gap-2.5 mb-2">
            <BassSpark adoption={c.projection.adoption} />
            <span className="text-slate-600 text-[10px] leading-tight">modelled adoption path<br />now → +8 years</span>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-medium pb-1"> </th>
                <th className="text-right font-medium pb-1">Now</th>
                <th className="text-right font-medium pb-1">+3y</th>
                <th className="text-right font-medium pb-1">+5y</th>
                <th className="text-right font-medium pb-1">+8y</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr>
                <td className="text-slate-500 py-0.5">Adoption %</td>
                <td className="text-right">{c.projection.adoption.now}</td>
                <td className="text-right">{c.projection.adoption.in3}</td>
                <td className="text-right">{c.projection.adoption.in5}</td>
                <td className="text-right">{c.projection.adoption.in8}</td>
              </tr>
              <tr>
                <td className="text-slate-500 py-0.5">Cost index</td>
                <td className="text-right">{c.projection.costIndex.now.toFixed(2)}</td>
                <td className="text-right">{c.projection.costIndex.in3.toFixed(2)}</td>
                <td className="text-right">{c.projection.costIndex.in5.toFixed(2)}</td>
                <td className="text-right">{c.projection.costIndex.in8.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          {c.projection.crossings && (
            <p className="text-teal-300/90 text-[11px] mt-2">
              Modelled to reach <span className="font-semibold">{c.projection.crossings.share25 ?? 25}% share</span> {crossingLabel(c.projection.crossings.cross25, c.projection.crossings.band25)} · <span className="font-semibold">{c.projection.crossings.share50 ?? 50}%</span> {crossingLabel(c.projection.crossings.cross50, c.projection.crossings.band50)}
              {c.projection.crossings.peakGrowth !== undefined && (
                <> · <span className="text-gold-300/90">peak growth {crossingLabel(c.projection.crossings.peakGrowth)}</span></>
              )}
              {typeof c.projection.crossings.ceiling === 'number' && c.projection.crossings.ceiling < 90 && (
                <span className="text-slate-500"> (milestones = ¼ and ½ of its {c.projection.crossings.ceiling}% ceiling)</span>
              )}
            </p>
          )}
          <p className="text-slate-600 text-[10px] mt-1.5">{c.projection.basis}</p>
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

// The stages the engine actually runs — honest theatre.
const COMPUTE_STAGES = [
  'Scanning curated register…',
  'Positioning S-curves…',
  'Running Bass diffusion + Wright curves…',
  'Mapping horizon lanes…',
];

export default function ForesightPage() {
  const { token } = useAuth();
  const reduced = useReducedMotion();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [query, setQuery] = useState('');
  const [commodity, setCommodity] = useState('');
  const [powertrain, setPowertrain] = useState('');
  const [segment, setSegment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ForesightResult | null>(null);
  const [panel, setPanel] = useState<PanelResult | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [bomOpen, setBomOpen] = useState(false);
  const [bomCommodity, setBomCommodity] = useState('');
  const [bomView, setBomView] = useState<'bom' | 'analyze'>('bom');
  const [partResearch, setPartResearch] = useState<PartResearch | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [prError, setPrError] = useState('');
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [revisit, setRevisit] = useState<LedgerRevisit | null>(null);
  const [saveNote, setSaveNote] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<Record<string, string>>({});
  const [stage, setStage] = useState(0);

  useEffect(() => {
    fetch('/api/foresight/catalogue').then(r => r.json()).then(setCatalogue).catch(() => {});
  }, []);

  // Staged "computing the future" loader — advances through the real pipeline
  // steps while the request runs (reduced-motion users see one static label).
  useEffect(() => {
    if (!loading || reduced) return;
    setStage(0);
    const t = setInterval(() => setStage(s => Math.min(s + 1, COMPUTE_STAGES.length - 1)), 700);
    return () => clearInterval(t);
  }, [loading, reduced]);

  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  async function convenePanel() {
    if (!result) return;
    setPanelLoading(true); setPanelError('');
    try {
      const cards = [...result.horizons.H1, ...result.horizons.H2, ...result.horizons.H3];
      const techIds = cards.sort((a, b) => b.momentum - a.momentum).slice(0, 12).map(c => c.id);
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const r = await fetch('/api/foresight/critique', { method: 'POST', headers: authHeaders, body: JSON.stringify({ techIds, apiKey }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Panel critique failed.');
      setPanel(d);
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'Panel critique failed.');
    } finally { setPanelLoading(false); }
  }

  async function loadLedger() {
    try {
      const r = await fetch('/api/foresight/ledger', { headers: authHeaders });
      const d = await r.json();
      if (r.ok) setLedger(d.entries);
    } catch { /* list stays stale */ }
  }

  async function saveToLedger() {
    if (!result) return;
    setSaveNote('');
    try {
      const r = await fetch('/api/foresight/ledger', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ query: result.query, commodity: result.commodity || undefined, powertrain: result.powertrain || undefined, segment: result.segment || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save.');
      setSaveNote(`Snapshot of ${d.techCount} positions saved to the ledger.`);
      setLedgerOpen(true);
      loadLedger();
    } catch (e) {
      setSaveNote(e instanceof Error ? e.message : 'Could not save.');
    }
  }

  async function openRevisit(id: string) {
    try {
      const r = await fetch(`/api/foresight/ledger/${id}`, { headers: authHeaders });
      const d = await r.json();
      if (r.ok) setRevisit(d);
    } catch { /* leave closed */ }
  }

  async function deleteEntry(id: string) {
    await fetch(`/api/foresight/ledger/${id}`, { method: 'DELETE', headers: authHeaders }).catch(() => {});
    if (revisit?.id === id) setRevisit(null);
    loadLedger();
  }

  const critiquesFor = (techId: string) =>
    panel?.panel.flatMap(p => p.critiques.filter(cr => cr.techId === techId).map(cr => ({ persona: p.persona, ...cr }))) ?? [];

  async function runPartResearch(q: string) {
    setPrLoading(true); setPrError('');
    try {
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const r = await fetch('/api/foresight/research', { method: 'POST', headers: authHeaders, body: JSON.stringify({ query: q, apiKey }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Deep research failed.');
      setPartResearch(d);
    } catch (e) {
      setPrError(e instanceof Error ? e.message : 'Deep research failed.');
    } finally { setPrLoading(false); }
  }

  function bomPick(part: string) {
    setQuery(part);
    setCommodity('');
    setBomOpen(false);
    predict(part);   // explicit query — no stale-closure risk
  }

  async function promoteCandidateToRegister(c: ResearchedCandidate) {
    if (!result) return;
    setPromoting(c.id);
    try {
      const r = await fetch('/api/foresight/promote', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ candidate: c, query: result.query, commodity: result.commodity || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Promotion failed');
      setPromoted(prev => ({ ...prev, [c.id]: data.id }));
    } catch (e) {
      setPromoted(prev => ({ ...prev, [c.id]: `error:${e instanceof Error ? e.message : 'failed'}` }));
    } finally {
      setPromoting(null);
    }
  }

  async function predict(qOverride?: string) {
    const q = qOverride ?? query;
    if (!q.trim() && !commodity && !segment) { setError('Type a part, pick a commodity, or choose a segment lens.'); return; }
    if (!token) { setError('Please sign in.'); return; }
    setLoading(true); setError(''); setResult(null);
    setPanel(null); setPanelError(''); setSaveNote('');
    setPartResearch(null); setPrError('');
    try {
      const apiKey = localStorage.getItem('brainspark_api_key') || undefined;
      const r = await fetch('/api/foresight/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: q, commodity: qOverride ? undefined : (commodity || undefined), powertrain: powertrain || undefined, segment: segment || undefined, apiKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Foresight failed.');
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Foresight failed.');
    } finally {
      setLoading(false);
    }
  }

  const signalFor = (id: string) => result?.narrative?.signals.find(s => s.techId === id)?.watch;
  const lanes: Array<{ key: 'H1' | 'H2' | 'H3'; title: string }> = [
    { key: 'H1', title: 'Horizon 1 — adopt/quote now' },
    { key: 'H2', title: 'Horizon 2 — plan the transition' },
    { key: 'H3', title: 'Horizon 3 — track, don’t commit' },
  ];

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4 relative overflow-hidden">
      {/* Full-page ambience: drifting starfield layers */}
      <div className="hz-stars" aria-hidden="true" />
      <div className="hz-stars2" aria-hidden="true" />
      {/* Instrument backdrop: engineering grid + drifting aurora, header region */}
      <div className="hz-backdrop" style={{ height: 420 }} aria-hidden="true">
        <div className="hz-glow hz-glow-gold" />
        <div className="hz-glow hz-glow-teal" />
      </div>
      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <div className="relative text-center mb-8">
          {/* The literal horizon: perspective grid floor vanishing behind the title */}
          <div className="hz-horizon-grid" style={{ top: 96 }} aria-hidden="true" />
          <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gold-500/15 border border-gold-500/25 mb-9">
            <span className="hz-radar" aria-hidden="true" />
            <span className="hz-radar-echo" aria-hidden="true" />
            <span className="hz-orbit" aria-hidden="true"><span className="hz-orbit-sat" /></span>
            <span className="hz-orbit-outer" aria-hidden="true"><span className="hz-orbit-sat2" /></span>
            <Telescope size={46} className="text-gold-400" />
          </div>
          <h1 className="relative text-4xl font-black mb-3"><span className="hz-title">BrainSpark Horizon</span></h1>
          <p className="relative text-slate-400 max-w-2xl mx-auto">
            Which technologies will reshape this part — and when? A curated register of {catalogue ? <TickNumber value={catalogue.technologies} duration={1200} /> : '60+'} technologies with automotive TRL, adoption and dated regulations, positioned by <span className="text-white">deterministic S-curve, Bass-diffusion and Wright's-law models</span>. The AI narrates; it never invents a number.
          </p>
        </div>

        {/* Input */}
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-6 mb-6 max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3">
            <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && predict()}
              placeholder='Part or assembly — e.g. "BEV HV battery", "stator", "headlamps"'
              className="bg-navy-800 border border-white/15 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/50" />
            <select value={commodity} onChange={e => setCommodity(e.target.value)} aria-label="Commodity"
              className="bg-navy-800 border border-white/15 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-gold-500/40">
              <option value="">All commodities</option>
              {(catalogue?.commodities ?? []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Segment lens — the dedicated Off-Road / Luxury SUV category */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-slate-500 text-xs mr-1">Segment:</span>
            <button onClick={() => setSegment('')}
              className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${segment === '' ? 'bg-gold-500/15 border-gold-500/40 text-gold-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
              All vehicles
            </button>
            <button onClick={() => setSegment(s => s === 'off-road' ? '' : 'off-road')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${segment === 'off-road' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
              <Mountain size={12} /> Off-Road Features & Tech
            </button>
            <button onClick={() => setSegment(s => s === 'luxury' ? '' : 'luxury')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${segment === 'luxury' ? 'bg-violet-500/15 border-violet-500/40 text-violet-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
              <Gem size={12} /> Luxury / Premium SUV
            </button>
            <button onClick={() => setSegment(s => s === 'software' ? '' : 'software')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${segment === 'software' ? 'bg-teal-500/15 border-teal-500/40 text-teal-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
              <Cpu size={12} /> SDV / ADAS & Software
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-slate-500 text-xs mr-1">Powertrain:</span>
            {['', ...(catalogue?.powertrains ?? ['ICE', 'MHEV', 'PHEV', 'BEV'])].map(p => (
              <button key={p || 'all'} onClick={() => setPowertrain(p)}
                className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${powertrain === p ? 'bg-gold-500/15 border-gold-500/40 text-gold-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                {p || 'All'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => setQuery(ex)}
                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs hover:border-gold-500/40 hover:text-gold-300 transition-colors">
                {ex}
              </button>
            ))}
          </div>
          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
          <button onClick={() => predict()} disabled={loading}
            className="w-full mt-5 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold transition-all">
            {loading
              ? <><ButtonSpinner size={16} /> {reduced ? 'Computing the horizon…' : (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={stage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                      {COMPUTE_STAGES[stage]}
                    </motion.span>
                  </AnimatePresence>
                )}</>
              : <><Sparkles size={18} /> Predict Future Technologies</>}
          </button>
          {loading && (
            <div className="mt-3 h-0.5 rounded-full bg-white/5 overflow-hidden" aria-hidden="true">
              <div className="h-full w-full hz-scanline bg-gold-500/20" />
            </div>
          )}
        </div>

        {/* Forward research — walled off from the curated lanes on purpose */}

        {result?.researched && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Microscope size={15} className="text-violet-300" />
                <h3 className="text-violet-200 font-semibold text-sm">Forward research — AI-researched, not curated</h3>
                {result.researched.trigger && (
                  <span className="text-[10px] uppercase tracking-wider text-violet-300/70 border border-violet-500/30 rounded px-1.5 py-0.5">{result.researched.trigger.replace(/-/g, ' ')}</span>
                )}
                {result.researched.fromCache && (
                  <span className="text-[10px] uppercase tracking-wider text-teal-300/70 border border-teal-500/30 rounded px-1.5 py-0.5" title="Served from the knowledge cache — this research question was already answered and cost nothing to reuse.">cached {result.researched.cacheAgeDays ?? 0}d ago</span>
                )}
              </div>
              <p className="text-slate-400 text-[11px] mb-3">
                The curated register was thin for this query, so the tool searched live sources for what is coming.
                TRL and adoption below are <span className="text-violet-300">AI estimates</span> — every projection built on them is
                modelled on estimated inputs, not measured. Uncited claims were dropped in code.
              </p>
              {result.researched.landscapeNote && <p className="text-slate-300 text-xs mb-3">{result.researched.landscapeNote}</p>}
              {result.researched.candidates.length === 0 && (
                <p className="text-slate-500 text-xs">{result.researched.note}</p>
              )}
              <div className="space-y-3">
                {result.researched.candidates.map(c => (
                  <div key={c.id} className="rounded-xl border border-white/10 bg-navy-900/60 p-3">
                    <div className="flex items-start gap-2">
                      <h4 className="text-slate-100 text-sm font-semibold flex-1">{c.name}</h4>
                      <span className="text-[9px] uppercase tracking-wider text-violet-300 border border-violet-500/30 rounded px-1.5 py-0.5 shrink-0">AI-researched</span>
                    </div>
                    <p className="text-slate-500 text-[10px] font-mono mt-1">
                      TRL ~{c.trl} (est) · {c.phase} · adoption ~{c.adoptionPct}% (est) · {c.horizon}
                    </p>
                    <p className="text-slate-300 text-xs mt-1.5">{c.whatItIs}</p>
                    {c.replaces && <p className="text-slate-500 text-[11px] mt-1">Replaces: {c.replaces}</p>}
                    {c.whyItMatters && <p className="text-slate-400 text-[11px] mt-0.5">Cost relevance: {c.whyItMatters}</p>}
                    {c.earliestProduction && <p className="text-emerald-300/80 text-[11px] mt-0.5">Earliest production cited: {c.earliestProduction}</p>}
                    {c.players?.length > 0 && <p className="text-slate-500 text-[11px] mt-0.5">Players named: {c.players.join(', ')}</p>}
                    {c.projection?.crossings && (
                      <p className="text-violet-300/90 text-[11px] mt-1.5">
                        Modelled on estimates: {c.projection.crossings.share25 ?? 25}% share {crossingLabel(c.projection.crossings.cross25)} · {c.projection.crossings.share50 ?? 50}% {crossingLabel(c.projection.crossings.cross50)}
                        {c.projection.crossings.peakGrowth !== undefined && <> · peak growth {crossingLabel(c.projection.crossings.peakGrowth)}</>}
                      </p>
                    )}
                    {c.sourceUrl && (
                      <a href={c.sourceUrl} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-teal-300/80 hover:text-teal-300 text-[10px] mt-1.5 break-all">
                        <ExternalLink size={10} /> {c.sourceUrl}
                      </a>
                    )}
                    <div className="mt-2">
                      {promoted[c.id]?.startsWith('error:') ? (
                        <p className="text-red-400 text-[10px]">{promoted[c.id].slice(6)}</p>
                      ) : promoted[c.id] ? (
                        <p className="text-emerald-300 text-[10px]">Promoted into the live register — it now appears in lanes with a PROMOTED badge. Re-run the prediction to see it.</p>
                      ) : (
                        <button onClick={() => promoteCandidateToRegister(c)} disabled={promoting === c.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 text-[11px] transition-colors disabled:opacity-50"
                          title="Curator action: after reviewing the source, admit this candidate into the live register. It keeps a PROMOTED provenance badge and can be demoted any time.">
                          {promoting === c.id ? <ButtonSpinner size={11} /> : <BookMarked size={11} />} Promote to register
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {result.researched.evidenceGaps && (
                <p className="text-slate-500 text-[11px] mt-3">
                  <span className="text-slate-400">What the evidence did not establish:</span> {result.researched.evidenceGaps}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Prediction Ledger — the tool keeps score on itself */}
        <div className="max-w-4xl mx-auto mb-6">
          <button onClick={() => { setLedgerOpen(o => !o); if (!ledger) loadLedger(); }}
            className="flex items-center gap-1.5 text-slate-500 text-xs hover:text-slate-300 mx-auto">
            {ledgerOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} <BookMarked size={13} /> Prediction Ledger {ledger ? `(${ledger.length})` : ''}
          </button>
          {ledgerOpen && (
            <div className="mt-3 bg-navy-900 border border-white/10 rounded-2xl p-4">
              {(!ledger || ledger.length === 0) && <p className="text-slate-500 text-xs">No snapshots yet. Run a prediction and save it — revisiting later shows how the register moved and scores the projections. A foresight tool that never checks its own past predictions is astrology.</p>}
              {ledger && ledger.length > 0 && (
                <div className="space-y-2">
                  {ledger.map(e => (
                    <div key={e.id} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-300 flex-1 truncate">{e.query || e.commodity}{e.powertrain ? ` · ${e.powertrain}` : ''}</span>
                      <span className="text-slate-600">{e.createdAt.slice(0, 10)} · {e.techCount} techs · v{e.vintage}</span>
                      <button onClick={() => openRevisit(e.id)} className="flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-slate-400 hover:text-teal-300 hover:border-teal-500/30" title="Revisit: drift vs today's register">
                        <RotateCcw size={11} /> Revisit
                      </button>
                      <button onClick={() => deleteEntry(e.id)} aria-label="Delete entry" className="p-1 text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              {revisit && (
                <div className="mt-3 rounded-lg bg-navy-800/70 border border-white/5 p-3">
                  <p className="text-slate-300 text-xs font-semibold mb-1">
                    Revisit: {revisit.query || revisit.commodity} — snapshot {revisit.createdAt.slice(0, 10)} (register v{revisit.thenVintage}) vs today (v{revisit.nowVintage})
                  </p>
                  {revisit.score && <p className="text-teal-300 text-xs mb-1">Projection score: mean abs error {revisit.score.meanAbsProjectionError} adoption pts over {revisit.score.scored} technologies (lower is better).</p>}
                  <p className="text-slate-500 text-[11px] mb-2">{revisit.note}</p>
                  <div className="space-y-1">
                    {revisit.drift.map(d => (
                      <p key={d.id} className="text-[11px] text-slate-400">
                        <span className="text-slate-300">{d.name}</span>{' — '}
                        {d.removed ? <span className="text-amber-300">removed from register</span> : (
                          (d.trlDelta || d.adoptionDelta || d.horizonMoved || (d.momentumDelta ?? 0) !== 0)
                            ? <>
                                {d.trlDelta ? `TRL ${d.trlDelta > 0 ? '+' : ''}${d.trlDelta} ` : ''}
                                {d.adoptionDelta ? `adoption ${d.adoptionDelta > 0 ? '+' : ''}${d.adoptionDelta}pt ` : ''}
                                {d.horizonMoved && d.now ? `horizon ${d.then.horizon}→${d.now.horizon} ` : ''}
                                {typeof d.projectionError === 'number' ? `· projected ${d.projectedForNow}% vs curated ${d.now?.adoptionPct}% (err ${d.projectionError}pt)` : ''}
                              </>
                            : <span className="text-slate-600">unchanged</span>
                        )}
                      </p>
                    ))}
                    {revisit.addedTechIds.length > 0 && <p className="text-[11px] text-teal-300">New in register since snapshot: {revisit.addedTechIds.join(', ')}</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Full-vehicle BOM browser — every assembly & component, guaranteed to resolve */}
        <div className="max-w-4xl mx-auto mb-6">
          <button onClick={() => setBomOpen(o => !o)}
            className="flex items-center gap-1.5 text-slate-500 text-xs hover:text-slate-300 mx-auto">
            {bomOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} <Layers size={13} /> Browse the full vehicle BOM ({catalogue?.bom ? Object.values(catalogue.bom).reduce((a, c) => a + Object.values(c).flat().length, 0) : '270+'} components)
          </button>
          {bomOpen && catalogue?.bom && (
            <div className="mt-3 bg-navy-900 border border-white/10 rounded-2xl p-4">
              {/* View toggle: Horizon BOM tree vs the exact Analyze catalog */}
              <div className="flex gap-2 mb-3">
                <button onClick={() => setBomView('bom')}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${bomView === 'bom' ? 'bg-gold-500/15 border-gold-500/40 text-gold-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                  Vehicle BOM tree
                </button>
                <button onClick={() => setBomView('analyze')}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${bomView === 'analyze' ? 'bg-teal-500/15 border-teal-500/40 text-teal-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                  Analyze systems (13 · 52)
                </button>
              </div>
              {bomView === 'analyze' && catalogue.analyzeSystems && (
                <div className="space-y-3">
                  {Object.entries(catalogue.analyzeSystems).map(([sys, subs]) => (
                    <div key={sys}>
                      <button onClick={() => bomPick(sys)} className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1.5 hover:text-teal-300">{sys}</button>
                      <div className="flex flex-wrap gap-1.5">
                        {subs.map(sub => (
                          <button key={sub} onClick={() => bomPick(sub)}
                            className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 text-[11px] hover:border-teal-500/40 hover:text-teal-300 transition-colors">
                            {sub}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="text-slate-600 text-[10px]">The exact systems & subassemblies from the Analyze tool — same taxonomy, now with a technology future behind every one (parity is CI-enforced).</p>
                </div>
              )}
              {bomView === 'bom' && (<>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.keys(catalogue.bom).map(c => (
                  <button key={c} onClick={() => setBomCommodity(b => b === c ? '' : c)}
                    className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${bomCommodity === c ? 'bg-gold-500/15 border-gold-500/40 text-gold-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'}`}>
                    {c}
                  </button>
                ))}
              </div>
              {bomCommodity && catalogue.bom[bomCommodity] && (
                <div className="space-y-3">
                  {Object.entries(catalogue.bom[bomCommodity]).map(([assembly, parts]) => (
                    <div key={assembly}>
                      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{assembly}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {parts.map(p => (
                          <button key={p} onClick={() => bomPick(p)}
                            className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300 text-[11px] hover:border-teal-500/40 hover:text-teal-300 transition-colors">
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!bomCommodity && <p className="text-slate-600 text-xs">Pick a commodity — every component chip runs a live prediction. Each of these is test-guaranteed to resolve to technologies.</p>}
              </>)}
            </div>
          )}
        </div>

        {/* Results */}
        {result && result.count === 0 && (
          <div className="max-w-xl mx-auto text-center space-y-3">
            <p className="text-slate-500 text-sm">{result.note}</p>
            <button onClick={() => runPartResearch(result.query)} disabled={prLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 disabled:opacity-50 text-xs transition-colors">
              {prLoading ? <ButtonSpinner size={12} /> : <Microscope size={13} />} Run AI deep research on "{result.query}" (live, cited)
            </button>
            {prError && <p className="text-red-400 text-xs">{prError}</p>}
          </div>
        )}
        {partResearch && (
          <div className="max-w-3xl mx-auto mt-4 bg-navy-900 border border-teal-500/20 rounded-2xl p-5 space-y-2">
            <p className="text-teal-300 text-xs uppercase tracking-wider font-semibold">AI deep research — researched, NOT curated</p>
            {!partResearch.research && <p className="text-slate-500 text-xs">{partResearch.note}</p>}
            {partResearch.research && (
              <>
                <p className="text-slate-300 text-sm leading-relaxed">{partResearch.research.summary}</p>
                {partResearch.research.developments.map((d, i) => (
                  <p key={i} className="text-slate-400 text-xs leading-relaxed">
                    • {d.finding} <a href={d.url} target="_blank" rel="noreferrer" className="text-teal-400 hover:text-teal-300">[{d.sourceTitle.slice(0, 40)}]</a>
                  </p>
                ))}
                <p className="text-slate-300 text-xs"><span className="text-slate-500">Outlook:</span> {partResearch.research.outlook}</p>
                <p className="text-amber-300/80 text-xs"><span className="text-slate-500">Uncertainty:</span> {partResearch.research.risks}</p>
                <p className="text-slate-600 text-[10px]">{partResearch.note}</p>
              </>
            )}
          </div>
        )}
        {result && result.count > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative space-y-6">
            {/* Holographic arrival: one scanline sweep per new result */}
            {!reduced && <div key={`scan|${result.query}|${result.commodity}|${result.segment}|${result.count}`} className="hz-scan-reveal" aria-hidden="true" />}
            {/* Result actions */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button onClick={convenePanel} disabled={panelLoading || !!panel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 text-xs transition-colors">
                {panelLoading ? <ButtonSpinner size={12} /> : <Users size={13} />} {panel ? 'Panel convened' : 'Convene expert panel (AI)'}
              </button>
              <button onClick={saveToLedger}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 text-xs transition-colors">
                <BookMarked size={13} /> Save to Prediction Ledger
              </button>
              <div className="relative">
                <button onClick={() => setExportOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gold-500/30 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20 text-xs transition-colors">
                  <FileDown size={13} /> Export report (PDF)
                </button>
                <AnimatePresence>
                  {exportOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.16 }}
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-56 rounded-xl border border-white/15 bg-[#0b1526]/95 backdrop-blur-md shadow-2xl shadow-black/50 p-2">
                      <p className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">Report theme</p>
                      <button
                        onClick={() => { setExportOpen(false); if (result) exportForesightPdf(result, panel, 'light'); }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-slate-200 hover:bg-gold-500/10 hover:text-gold-300 transition-colors">
                        <Sun size={14} className="text-gold-300 shrink-0" />
                        <span className="flex-1">Light <span className="text-slate-500">— Horizon on white</span></span>
                        <span className="text-[9px] uppercase tracking-wider text-gold-300/80 border border-gold-500/30 rounded px-1 py-0.5">default</span>
                      </button>
                      <button
                        onClick={() => { setExportOpen(false); if (result) exportForesightPdf(result, panel, 'dark'); }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-slate-200 hover:bg-teal-500/10 hover:text-teal-300 transition-colors">
                        <Moon size={14} className="text-teal-300 shrink-0" />
                        <span className="flex-1">Dark <span className="text-slate-500">— deep-space observatory</span></span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {panelError && <p className="text-center text-red-400 text-xs">{panelError}</p>}
            {saveNote && <p className="text-center text-teal-300 text-xs">{saveNote}</p>}
            {panel && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {panel.panel.map(p => (
                  <span key={p.persona} className="px-2.5 py-1 rounded-lg bg-violet-500/5 border border-violet-500/20 text-violet-300/90 text-xs" title={p.focus}>
                    {p.persona} · {p.critiques.length} views
                  </span>
                ))}
                <span className="text-slate-600 text-[11px] w-full text-center">{panel.note}</span>
              </div>
            )}

            {/* Analyst briefing (LLM, grounded) or honest degradation note */}
            {result.narrative?.briefing && (
              <div className="bg-navy-900 border border-gold-500/20 rounded-2xl p-5 max-w-4xl mx-auto">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">Analyst briefing <span className="normal-case tracking-normal">(AI-written, grounded in the cards below)</span></p>
                <p className="text-slate-300 text-sm leading-relaxed">{result.narrative.briefing}</p>
              </div>
            )}
            {result.narrativeNote && <p className="text-center text-slate-500 text-xs max-w-xl mx-auto">{result.narrativeNote}</p>}

            {/* Segment benchmark strip — the vehicles defining the bar */}
            {result.benchmarks && result.benchmarks.length > 0 && (
              <div className="max-w-6xl mx-auto">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Mountain size={12} /> Segment benchmarks — who sets the technology bar (curated evidence, not predictions)
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {result.benchmarks.map(b => (
                    <div key={`${b.brand}-${b.vehicle}`} className="hz-card shrink-0 w-64 bg-navy-900 border border-white/10 rounded-2xl p-3.5">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <h3 className="text-white font-semibold text-sm leading-tight">{b.vehicle}</h3>
                        <span className="text-slate-500 text-[10px] whitespace-nowrap">{b.year}</span>
                      </div>
                      <p className="text-slate-500 text-[11px] mb-1.5">{b.brand} · {b.powertrains.join('/')}</p>
                      <ul className="space-y-0.5 mb-1.5">
                        {b.signature.map((s, i) => <li key={i} className="text-slate-400 text-[11px] leading-snug">• {s}</li>)}
                      </ul>
                      <p className="text-teal-300/90 text-[11px] leading-snug"><span className="hz-ping-dot mr-1 align-middle" style={{ width: 5, height: 5 }} />Watch: {b.watch}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regulatory anchors: a timeline, not a chip cloud */}
            {result.anchors.length > 0 && (
              <div className="max-w-5xl mx-auto">
                <p className="text-slate-500 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5"><Landmark size={12} /> Regulations shaping this landscape (dated commitments, not predictions)</p>
                <div className="relative overflow-x-auto pb-1">
                  <div className="relative flex items-start" style={{ minWidth: `${[...result.anchors].length * 128}px` }}>
                    <div className="absolute top-[4px] left-6 right-6 h-px bg-gradient-to-r from-gold-500/50 via-gold-500/25 to-transparent" aria-hidden="true" />
                    {[...result.anchors].sort((a, b) => a.year - b.year).map((a, i) => (
                      <div key={a.id} title={a.effect} className="relative flex flex-col items-center flex-1 min-w-[128px] px-2">
                        <span className={`relative w-2.5 h-2.5 rounded-full border border-gold-500/60 ${i === 0 ? 'bg-gold-400 hz-committed' : 'bg-gold-500/30'}`} />
                        <span className="text-gold-300 text-xs font-bold mt-1.5">{a.year}</span>
                        <span className="text-slate-400 text-[10px] text-center leading-tight mt-0.5">{a.name}</span>
                        <span className="text-slate-600 text-[9px] mt-0.5">{a.region}{a.status && ANCHOR_STATUS_LABEL[a.status] ? ` · ${ANCHOR_STATUS_LABEL[a.status]}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* The time-road: certainty fades with distance into the future */}
            <div className="hidden lg:grid grid-cols-3 gap-4 -mb-3 px-2" aria-hidden="true">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-gold-400 font-bold whitespace-nowrap font-mono">{result.windows.H1.label}</span>
                <div className="flex-1 h-[2px] rounded hz-rail-solid hz-rail-live" />
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-teal-400 font-bold whitespace-nowrap font-mono">{result.windows.H2.label}</span>
                <div className="flex-1 h-[2px] rounded hz-rail-mid" />
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-slate-400 font-bold whitespace-nowrap">{result.windows.H3.label}</span>
                <div className="flex-1 h-[2px] hz-rail-far" />
                <span className="text-slate-600">future →</span>
              </div>
            </div>

            {/* Three horizon lanes — H2 softens, H3 renders "not yet in focus" */}
            <div className="grid lg:grid-cols-3 gap-4 items-start">
              {lanes.map(lane => (
                <div key={lane.key} className={`bg-navy-900/50 border border-white/5 rounded-2xl p-3 ${lane.key === 'H2' ? 'hz-lane-h2' : ''} ${lane.key === 'H3' ? 'hz-lane-h3' : ''}`}>
                  <div className="px-1 pb-2 mb-1 border-b border-white/5">
                    <h2 className="text-white font-bold text-sm"><DecodeText text={lane.title} /></h2>
                    <p className="text-slate-500 text-xs">{result.windows[lane.key].label} · {result.horizons[lane.key].length} technologies</p>
                  </div>
                  <div className="space-y-3 mt-2">
                    {result.horizons[lane.key].length === 0 && <p className="text-slate-600 text-xs px-1 py-2">Nothing in this window for this selection.</p>}
                    {result.horizons[lane.key].map((c, i) => (
                      <motion.div
                        key={c.id}
                        initial={reduced ? false : { opacity: 0, y: 18, scale: 0.98, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                        transition={{ delay: reduced ? 0 : Math.min(i, 8) * 0.08, duration: 0.45, ease: 'easeOut' }}
                      >
                        <TechCardView c={c} signal={signalFor(c.id)} critiques={critiquesFor(c.id)} />
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-slate-600 text-xs text-center max-w-3xl mx-auto">{result.note}</p>
          </motion.div>
        )}

        {!result && !loading && (
          <p className="text-center text-slate-600 text-xs mt-8">
            Curated register · automotive TRL 1–9 · Bass diffusion (p=0.03, q=0.38) · Wright's-law cost curves · dated regulatory anchors · committed / probable / speculative confidence tiers
          </p>
        )}
      </div>
    </div>
  );
}
