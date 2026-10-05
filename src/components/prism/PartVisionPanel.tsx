/**
 * See the part — Prism's vision stage.
 *
 * The same 3D viewer the engineer looks at renders the part, with the faces
 * the draft analysis MEASURED as undercut (red) or zero-draft (amber) painted
 * on. One button captures four standard views and sends them, with the
 * measured geometry, to a vision model (/api/part360/vision-read). What comes
 * back is a list of view-cited observations — what the part probably is and
 * does, which surfaces look functional, what looks over-designed — and the
 * engineer ticks the ones they agree with. Only ticked lines reach the dossier.
 *
 * House rule: the images inform judgement; every number stays with the engines.
 */
import { useAiAvailable } from '../../hooks/useAiAvailable';
import { useEffect, useRef, useState } from 'react';
import { Eye, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import CadViewer3D, { type CadViewerRef } from '../CadViewer3D';

export interface VisionObservation { kind: string; text: string }

// Four views that between them see every side. Front and right showed blank
// walls on a box-like part and carried almost nothing for the model, so the
// set is: the standard isometric, the REVERSE isometric (from below, opposite
// corner), straight down and straight up.
type Capture = { view: string; named?: 'iso' | 'top' | 'bottom' | 'front'; reverse?: boolean };
const CAPTURES: Capture[] = [
  { view: 'iso', named: 'iso' },
  { view: 'iso-reverse', named: 'iso', reverse: true },
  { view: 'top', named: 'top' },
  { view: 'bottom', named: 'bottom' },
];
const UNDERCUT = 0xef4444;
const ZERO_DRAFT = 0xf59e0b;

const KIND_LABEL: Record<string, string> = {
  identity: 'What it is', function: 'Function', interface: 'Surface', 'over-design': 'Over-design',
  manufacturing: 'Manufacturing', 'cannot-tell': 'Cannot tell',
};

interface Props {
  file: File;
  token: string | null;
  apiKey: string;
  geo: Record<string, unknown> | null;       // geometry WITH its dfm block
  partName: string; material: string; process: string; partContext: string;
  /** Lines the engineer has ticked — what the dossier receives. */
  onConfirmedChange: (lines: string[]) => void;
  /** Offer the AI's function summary as the part description. */
  onUseDescription: (text: string) => void;
}

export default function PartVisionPanel({ file, token, apiKey, geo, partName, material, process, partContext, onConfirmedChange, onUseDescription }: Props) {
  const aiAvailable = useAiAvailable();
  const viewerRef = useRef<CadViewerRef | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');
  const [shots, setShots] = useState<{ view: string; dataUrl: string }[]>([]);
  const [obs, setObs] = useState<VisionObservation[]>([]);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [summary, setSummary] = useState('');
  const [caution, setCaution] = useState('');

  // Paint what the analysis MEASURED, so the picture the AI reads and the one
  // the engineer sees carry the same evidence.
  const draft = (geo?.dfm as { draft?: { undercutFaceIds?: number[]; zeroDraftFaceIds?: number[] } } | undefined)?.draft;
  const undercutIds = draft?.undercutFaceIds ?? [];
  const zeroIds = draft?.zeroDraftFaceIds ?? [];
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    void (async () => {
      await v.ready();
      await v.clearAllLayers();
      if (zeroIds.length) await v.paintFaces('zero-draft', zeroIds, { colour: ZERO_DRAFT, opacity: 0.85 });
      if (undercutIds.length) await v.paintFaces('undercut', undercutIds, { colour: UNDERCUT, opacity: 0.9 });
    })();
  }, [file, undercutIds.join(','), zeroIds.join(',')]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onConfirmedChange(obs.filter((_, i) => ticked.has(i)).map(o => o.text));
  }, [obs, ticked]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function read() {
    const v = viewerRef.current;
    if (!v) return;
    if (!apiKey && !aiAvailable) { setError('Add your Anthropic API key in Settings to use AI vision.'); return; }
    setError(''); setBusy('Capturing views…');
    try {
      const captured: { view: string; dataUrl: string }[] = [];
      const h = await v.ready();
      for (const c of CAPTURES) {
        await v.setView(c.named ?? 'iso');
        if (c.reverse && h) {
          // Mirror the camera through its target: the opposite corner, from below.
          const cam = h.getCamera();
          const [tx, ty, tz] = cam.target, [px, py, pz] = cam.position;
          h.setCamera({ target: cam.target, position: [2 * tx - px, 2 * ty - py, 2 * tz - pz] });
        }
        const dataUrl = await v.snapshot({ width: 1024, height: 768, clean: true, mime: 'image/jpeg', quality: 0.85 });
        if (dataUrl && dataUrl.startsWith('data:image/')) captured.push({ view: c.reverse ? 'iso-reverse' : c.view, dataUrl });
      }
      await v.setView('iso');
      if (!captured.length) throw new Error('The 3D view could not be captured — is the model still loading?');
      setShots(captured);
      setBusy(`Reading ${captured.length} views with AI vision…`);
      const r = await fetch('/api/part360/vision-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ images: captured, geo, partName, material, process, partContext, apiKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Vision read failed');
      const list: VisionObservation[] = d.observations ?? [];
      setObs(list);
      // Default: tick everything — the engineer UNticks what they disagree with.
      setTicked(new Set(list.map((_, i) => i)));
      setSummary(d.read?.functionSummary ?? '');
      setCaution(d.caution ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vision read failed');
    } finally {
      setBusy('');
    }
  }

  const toggle = (i: number) => setTicked(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <div className="dfm-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Eye size={15} className="text-teal-400" /> See the part</h3>
          <p className="text-2xs text-slate-500 mt-1 measure">
            Your 3D model, with the faces the analysis measured painted on —{' '}
            <span className="text-red-400">red: undercut ({undercutIds.length})</span>,{' '}
            <span className="text-amber-400">amber: zero draft ({zeroIds.length})</span>.
            AI vision reads four views (iso, reverse iso from below, top, bottom) and says what the part probably is, what it does and which surfaces matter. You confirm.
          </p>
        </div>
        <button onClick={read} disabled={!!busy}
          className="dfm-cta text-navy-950 font-semibold rounded-xl px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
          {busy || (obs.length ? 'Read again' : 'Read the part with AI vision')}
        </button>
      </div>

      <CadViewer3D ref={viewerRef} file={file} token={token} className="h-[320px] rounded-xl overflow-hidden" />

      {error && <p className="text-xs text-red-400 mt-3 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{error}</p>}

      {shots.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-3" aria-label="Views sent to AI vision">
          {shots.map(s => (
            <figure key={s.view} className="rounded-lg overflow-hidden border border-hairline">
              <img src={s.dataUrl} alt={`${s.view} view of the part as sent to AI vision`} className="w-full aspect-[4/3] object-cover" />
              <figcaption className="text-2xs text-slate-500 text-center py-0.5">{s.view}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {obs.length > 0 && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs text-slate-300"><span className="text-white font-semibold">{ticked.size}</span> of {obs.length} observations ticked — only ticked ones reach the analysis.</p>
            {summary && (
              <button onClick={() => onUseDescription(summary)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20">
                Use as part description
              </button>
            )}
          </div>
          <ul className="space-y-1.5" aria-label="AI vision observations">
            {obs.map((o, i) => (
              <li key={i}>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={ticked.has(i)} onChange={() => toggle(i)} className="mt-0.5 accent-teal-500" />
                  <span className={`shrink-0 w-24 text-2xs uppercase tracking-wider mt-0.5 ${o.kind === 'cannot-tell' ? 'text-amber-400' : 'text-slate-500'}`}>{KIND_LABEL[o.kind] ?? o.kind}</span>
                  <span className={ticked.has(i) ? 'text-slate-200' : 'text-slate-500 line-through'}>{o.text}</span>
                </label>
              </li>
            ))}
          </ul>
          {caution && <p className="text-2xs text-slate-500 mt-2 flex items-center gap-1.5"><CheckCircle2 size={12} className="text-teal-400" />{caution}</p>}
        </div>
      )}
    </div>
  );
}
