// Wiring-harness should-cost.
//
// The engine (harness-cost.mjs) and its route have existed since the commodity
// audit and had no product surface at all — the Help page documented it as a
// raw API call. It is also the answer to the platform's worst measured number:
// the body wiring harness scored 0 of 14 engine-checked ideas, because a
// harness is not "a part with a process" and nothing else could cost it.
import { useState } from 'react';
import { Cable, Loader2 } from 'lucide-react';
import { getAuthToken } from '../services/auth';
import PageHeader from '../components/ui/PageHeader';

const REGIONS = ['Mexico', 'Czech Republic', 'India', 'China', 'Spain', 'Germany', 'UK', 'USA', 'Korea'];

interface Band { lowEur: number; highEur: number; pct: number }
interface Result {
  engine: string;
  inputs: Record<string, number | string>;
  drivers: Record<string, number>;
  breakdown: Record<string, number>;
  totalEur: number;
  band: Band;
  assumptions: string[];
}

const LABELS: Record<string, string> = {
  conductor: 'Conductor (copper)', insulation: 'Insulation', connectors: 'Connectors',
  terminals: 'Terminals', splices: 'Splices', tapeConduit: 'Tape / conduit',
  labour: 'Assembly labour', overhead: 'Factory overhead', commercial: 'Packaging / freight',
  sgaProfit: 'SG&A + profit', nrcAmortised: 'NRC amortised',
};

export default function HarnessCostPage() {
  const [form, setForm] = useState({
    circuits: 180, avgLengthM: 1.8, connectors: 30, splices: 22, sealedPct: 0.3,
    region: 'Mexico', annualVolume: 120000,
  });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const token = getAuthToken();

  async function compute() {
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await fetch('/api/harness-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not cost this harness.');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cost this harness.');
    } finally {
      setBusy(false);
    }
  }

  const num = (k: keyof typeof form, label: string, step = 1, min = 0) => (
    <label className="block">
      <span className="text-slate-400 text-xs">{label}</span>
      <input
        type="number" step={step} min={min} value={form[k] as number}
        onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
        className="mt-1 w-full bg-navy-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
      />
    </label>
  );

  const total = result ? result.totalEur : 0;

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          tool="harness"
          title="Wiring Harness Cost"
          subtitle={<>Deterministic bottom-up piece price — <span className="text-teal-300">copper × circuits × connectors × assembly minutes</span>. No AI in the numbers.</>}
        />

      <div className="grid lg:grid-cols-[340px_1fr] gap-6 mt-6">
        <div className="bg-navy-900 border border-white/10 rounded-2xl p-5 space-y-4">
          {num('circuits', 'Circuits (cut leads)')}
          {num('avgLengthM', 'Mean circuit length (m)', 0.1)}
          {num('connectors', 'Connectors')}
          {num('splices', 'Splices')}
          {num('sealedPct', 'Sealed connector share (0–1)', 0.05)}
          {num('annualVolume', 'Annual volume', 1000)}
          <label className="block">
            <span className="text-slate-400 text-xs">Assembly region</span>
            <select
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className="mt-1 w-full bg-navy-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            >
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <button
            onClick={compute} disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-950 font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Cable size={16} />} Cost this harness
          </button>
          {error && <p className="text-danger-400 text-xs">{error}</p>}
        </div>

        <div>
          {!result && !busy && (
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-8 text-center text-slate-500 text-sm">
              Set the harness parameters and run the engine. Every figure below is computed,
              not estimated by a model.
            </div>
          )}

          {result && (
            <div className="space-y-5">
              <div className="bg-navy-900 border border-white/10 rounded-2xl p-6">
                <div className="flex flex-wrap items-end gap-6">
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider">Should-cost / harness</div>
                    <div className="text-4xl font-bold text-white tabular-nums">€{total.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider">Range (±{result.band.pct}%)</div>
                    <div className="text-lg text-slate-300 tabular-nums">
                      €{result.band.lowEur.toFixed(2)} – €{result.band.highEur.toFixed(2)}
                    </div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-slate-500 text-xs uppercase tracking-wider">Copper / labour</div>
                    <div className="text-sm text-slate-300 tabular-nums">
                      {result.drivers.copperKg} kg · {result.drivers.labourMinutes} min
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-navy-900 border border-white/10 rounded-2xl p-6">
                <h3 className="text-white font-semibold mb-4">Cost breakdown</h3>
                <div className="space-y-2">
                  {Object.entries(result.breakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <div key={k} className="flex items-center gap-3">
                        <span className="text-slate-400 text-sm w-44 flex-shrink-0">{LABELS[k] ?? k}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-gold-500/70" style={{ width: `${total ? (v / total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-white text-sm tabular-nums w-20 text-right">€{v.toFixed(2)}</span>
                        <span className="text-slate-500 text-xs tabular-nums w-12 text-right">
                          {total ? ((v / total) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* The engine volunteers what it under-models. That belongs on screen,
                  not buried in the payload. */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="text-slate-300 text-sm font-semibold mb-2">Assumptions and limits</h3>
                <ul className="space-y-1.5">
                  {result.assumptions.map((a, i) => (
                    <li key={i} className="text-slate-400 text-xs leading-relaxed">• {a}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
