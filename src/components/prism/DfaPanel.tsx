/**
 * Design for assembly — Prism assembly mode (R4).
 *
 * Boothroyd's three questions decide which parts must exist: does it MOVE
 * relative to the parts already assembled, must it be a DIFFERENT MATERIAL,
 * must it be SEPARABLE for assembly or service? Geometry cannot answer them —
 * it can only propose (a repeated small body of revolution looks like a
 * fastener). The engineer answers here, one choice per part, and picks how
 * each part is secured. The deterministic DFA engine then runs server-side on
 * the measured solids; the theoretical minimum and design efficiency appear
 * only when every part is answered.
 */
import { Wrench } from 'lucide-react';
import { Money } from '../ui/Money';

export interface DfaHint { suspectedFastener: boolean; fastenerConfidence: string | null; proposedMustSeparate: boolean; reason: string | null; contacts: number }
export interface DfaRow { index?: number; name: string; dfaHint?: DfaHint | null }
export interface DfaInput { answers: Record<number, string>; securing: Record<number, string> }
export interface DfaResult {
  totalParts: number; distinctPartTypes?: number; totalAssemblyTimeSec: number; assemblyCostEur: number | null; labourRateEurPerHr: number | null;
  theoreticalMinParts: number | null; designEfficiencyPct: number | null;
  consolidationCandidates: { index: number; name: string; timeSec: number }[];
  suspectedFasteners: { index: number; name: string; confidence: string }[];
  completeness: { answered: number; unanswered: number; indexAvailable: boolean; note: string };
  massAssumptions?: { note: string; assumedParts: number };
}

const NECESSITY = [
  { v: '', label: '— not answered' },
  { v: 'moves', label: 'Must exist — it moves' },
  { v: 'differentMaterial', label: 'Must exist — different material' },
  { v: 'mustSeparate', label: 'Must exist — separable (service/assembly)' },
  { v: 'necessary-none', label: 'Could be combined — no to all three' },
];
const SECURING = [
  { v: 'none', label: 'no securing op' }, { v: 'snapFit', label: 'snap-fit' }, { v: 'screw', label: 'screw' },
  { v: 'boltNut', label: 'bolt + nut' }, { v: 'rivet', label: 'rivet' }, { v: 'weldSpot', label: 'spot weld' }, { v: 'adhesive', label: 'adhesive' },
];

interface Props {
  rows: DfaRow[];
  value: DfaInput;
  onChange: (v: DfaInput) => void;
  result: DfaResult | null;
  error?: string | null;
  /** Re-cost the BOM with these answers (the DFA runs in the same request). */
  onRun?: () => void;
  busy?: boolean;
}

export default function DfaPanel({ rows, value, onChange, result, error, onRun, busy }: Props) {
  const idx = (r: DfaRow, i: number) => (Number.isInteger(r.index) ? (r.index as number) : i);
  const answered = rows.filter((r, i) => value.answers[idx(r, i)]).length;
  const suggestible = rows.filter((r, i) => r.dfaHint?.proposedMustSeparate && !value.answers[idx(r, i)]).length;

  function applySuggestions() {
    const answers = { ...value.answers }, securing = { ...value.securing };
    rows.forEach((r, i) => {
      if (r.dfaHint?.proposedMustSeparate && !answers[idx(r, i)]) answers[idx(r, i)] = 'mustSeparate';
    });
    onChange({ answers, securing });
  }

  return (
    <div className="dfm-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-white font-semibold text-sm flex items-center gap-2"><Wrench size={15} className="text-teal-400" /> Design for assembly — which parts must exist?</h2>
        {suggestible > 0 && (
          <button onClick={applySuggestions} className="text-xs px-3 py-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20">
            Accept {suggestible} geometry suggestion{suggestible === 1 ? '' : 's'} (suspected fasteners → separable)
          </button>
        )}
      </div>
      <p className="text-2xs text-slate-500 mb-3 measure">
        For each part: does it move, must it be a different material, must it come apart? A part with no to all three is a candidate to combine
        with its neighbour. Handling and insertion times come from the measured solids; the minimum part count and design efficiency are shown only
        when every part is answered. {answered} of {rows.length} answered.
      </p>
      <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
        {rows.map((r, i) => {
          const k = idx(r, i);
          return (
            <div key={k} className="grid grid-cols-[1.3fr_1.4fr_0.9fr] gap-2 items-center">
              <span className="text-xs text-white truncate" title={r.dfaHint?.reason ?? undefined}>
                {r.name}
                {r.dfaHint?.suspectedFastener && <span className="ml-1.5 text-2xs text-amber-400">suspected fastener</span>}
              </span>
              <select className="dfm-select !py-1.5 !text-2xs" aria-label={`Is ${r.name} a necessary separate part`} value={value.answers[k] ?? ''}
                onChange={e => onChange({ ...value, answers: { ...value.answers, [k]: e.target.value } })}>
                {NECESSITY.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
              <select className="dfm-select !py-1.5 !text-2xs" aria-label={`How ${r.name} is secured`} value={value.securing[k] ?? 'none'}
                onChange={e => onChange({ ...value, securing: { ...value.securing, [k]: e.target.value } })}>
                {SECURING.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </div>
          );
        })}
      </div>
      {onRun && (
        <div className="flex justify-end mt-3">
          <button onClick={onRun} disabled={busy}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-hairline hover:border-teal-500/40 text-slate-200 disabled:opacity-50">
            {result ? 'Re-run DFA and costing with these answers' : 'Run DFA with the BOM costing'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400 mt-3">DFA not run: {error}</p>}
      {result && (
        <div className="mt-4 rounded-xl border border-hairline p-3" aria-label="DFA result">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
            <div><div className="text-2xs uppercase tracking-wider text-slate-500">Parts</div><div className="text-white text-sm font-semibold">{result.totalParts}</div></div>
            <div><div className="text-2xs uppercase tracking-wider text-slate-500">Assembly time</div><div className="text-teal-300 text-sm font-semibold">{result.totalAssemblyTimeSec} s</div></div>
            <div><div className="text-2xs uppercase tracking-wider text-slate-500">Assembly labour</div><div className="text-teal-300 text-sm font-semibold">{result.assemblyCostEur != null ? <Money eur={result.assemblyCostEur} decimals={2} /> : '—'}</div></div>
            <div><div className="text-2xs uppercase tracking-wider text-slate-500">Design efficiency</div><div className="text-teal-300 text-sm font-semibold">{result.designEfficiencyPct != null ? `${result.designEfficiencyPct}% (min ${result.theoreticalMinParts} parts)` : 'withheld'}</div></div>
          </div>
          <p className="text-2xs text-slate-500">{result.completeness.note} Assembly labour is not in the BOM total.</p>
          {result.consolidationCandidates.length > 0 && (
            <p className="text-xs text-slate-300 mt-2">Candidates to combine: {result.consolidationCandidates.map(c => `${c.name} (${c.timeSec} s)`).join(', ')}</p>
          )}
          {result.massAssumptions?.assumedParts ? <p className="text-2xs text-amber-400 mt-1">{result.massAssumptions.note}</p> : null}
        </div>
      )}
    </div>
  );
}
