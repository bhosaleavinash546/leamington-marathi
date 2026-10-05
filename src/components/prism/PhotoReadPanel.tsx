/**
 * Photos — Prism's teardown stage (R3).
 *
 * Photos of OUR physical part, or of a competitor's, read by AI vision into
 * teardown facts: visible fasteners (a floor, never a total), joining methods,
 * moulded material markings (copied verbatim, decoded server-side by the
 * ISO 1043 table), finish and process witness marks. Every observation is a
 * checkbox; only ticked ones reach the dossier. With a benchmark read, the
 * dossier runs the deterministic teardown-delta core on the ticked facts.
 */
import { useAiAvailable } from '../../hooks/useAiAvailable';
import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Trash2, AlertTriangle, BookmarkPlus } from 'lucide-react';

export interface PhotoObservation { kind: string; text: string; attr?: Record<string, unknown> }
export interface ConfirmedPhotoRead { subject: 'ours' | 'benchmark'; label: string; observations: PhotoObservation[] }

interface Read {
  id: string;
  subject: 'ours' | 'benchmark';
  label: string;
  thumbs: string[];
  obs: PhotoObservation[];
  ticked: Set<number>;
  caution: string;
  saved?: boolean;
}

interface Props {
  token: string | null;
  apiKey: string;
  partName: string; material: string; process: string;
  onChange: (reads: ConfirmedPhotoRead[]) => void;
}

const KIND_LABEL: Record<string, string> = {
  identity: 'What it is', fastener: 'Fasteners', joining: 'Joining', 'material-mark': 'Marking',
  finish: 'Finish', process: 'Process', other: 'Other', 'cannot-tell': 'Cannot tell',
};
const MAX_PHOTOS = 6;
const MAX_READS = 4;

/** Downscale to ≤1600 px JPEG in the browser — the model needs no more, and the upload stays small. */
async function toJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.85);
}

export default function PhotoReadPanel({ token, apiKey, partName, material, process, onChange }: Props) {
  const aiAvailable = useAiAvailable();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [subject, setSubject] = useState<'ours' | 'benchmark'>('ours');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reads, setReads] = useState<Read[]>([]);

  useEffect(() => {
    onChange(reads.map(r => ({ subject: r.subject, label: r.label, observations: r.obs.filter((_, i) => r.ticked.has(i)) }))
      .filter(r => r.observations.length));
  }, [reads]);   // eslint-disable-line react-hooks/exhaustive-deps

  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  async function read() {
    if (!apiKey && !aiAvailable) { setError('Add your Anthropic API key in Settings to read photos.'); return; }
    if (!files.length) { setError('Choose one or more photos first.'); return; }
    if (subject === 'benchmark' && !label.trim()) { setError('Name the benchmark part (e.g. "Competitor X side cover, 2025 model").'); return; }
    if (reads.length >= MAX_READS) { setError(`At most ${MAX_READS} photo sets — remove one first.`); return; }
    setError(''); setBusy('Preparing photos…');
    try {
      const photos = await Promise.all(files.slice(0, MAX_PHOTOS).map(async f => ({ dataUrl: await toJpeg(f) })));
      setBusy(`Reading ${photos.length} photo${photos.length === 1 ? '' : 's'} with AI vision…`);
      const r = await fetch('/api/part360/photo-read', {
        method: 'POST', headers,
        body: JSON.stringify({ photos, subject, label: label.trim(), notes: notes.trim(), partName, material, process, apiKey }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Photo read failed');
      const obs: PhotoObservation[] = d.observations ?? [];
      setReads(prev => [...prev, {
        id: crypto.randomUUID(), subject, label: subject === 'ours' ? 'our part' : label.trim(),
        thumbs: photos.map(p => p.dataUrl), obs, ticked: new Set(obs.map((_, i) => i)), caution: d.caution ?? '',
      }]);
      setFiles([]); setNotes('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo read failed');
    } finally { setBusy(''); }
  }

  const toggle = (id: string, i: number) => setReads(prev => prev.map(r => {
    if (r.id !== id) return r;
    const t = new Set(r.ticked); if (t.has(i)) t.delete(i); else t.add(i);
    return { ...r, ticked: t };
  }));

  async function saveTeardown(r: Read) {
    const ticked = r.obs.filter((_, i) => r.ticked.has(i));
    const marking = ticked.find(o => o.kind === 'material-mark' && typeof o.attr?.verbatim === 'string')?.attr?.verbatim as string | undefined;
    const joining = [...new Set(ticked.filter(o => o.kind === 'joining').map(o => String(o.attr?.method ?? '')).filter(Boolean))].join(', ');
    try {
      const resp = await fetch('/api/part360/teardowns', {
        method: 'POST', headers,
        body: JSON.stringify({
          title: r.label, partName, material: marking ?? '', process: '', joining,
          notes: `From photos (AI-read, engineer-confirmed): ${ticked.filter(o => o.kind !== 'identity').map(o => o.text).join(' · ')}`.slice(0, 1000),
        }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || 'Save failed');
      setReads(prev => prev.map(x => x.id === r.id ? { ...x, saved: true } : x));
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
  }

  return (
    <div className="dfm-panel p-5">
      <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Camera size={15} className="text-teal-400" /> Photos — our part or a competitor's</h3>
      <p className="text-2xs text-slate-500 mt-1 mb-3 measure">
        Photos show what the CAD cannot: how many fasteners it really takes, how it is joined, its coating, its moulded material marking,
        gate and ejector marks. AI vision lists what is visible; you tick what you agree with. With a competitor's photos, the analysis
        compares the confirmed facts with ours.
      </p>

      <div className="grid md:grid-cols-[auto_1fr] gap-3 items-end mb-3">
        <div role="radiogroup" aria-label="Whose part is in the photos" className="flex rounded-lg border border-hairline overflow-hidden text-xs">
          {(['ours', 'benchmark'] as const).map(v => (
            <button key={v} role="radio" aria-checked={subject === v} onClick={() => setSubject(v)}
              className={`px-3 py-1.5 font-medium ${subject === v ? 'bg-teal-500/15 text-teal-300' : 'text-slate-400 hover:text-white'}`}>
              {v === 'ours' ? 'Our part' : 'Competitor / benchmark'}
            </button>
          ))}
        </div>
        {subject === 'benchmark' && (
          <input className="dfm-input !py-1.5 !text-xs" aria-label="Benchmark part name" placeholder="e.g. Competitor X side cover, 2025 model"
            value={label} onChange={e => setLabel(e.target.value)} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="text-xs text-slate-400 max-w-[260px]"
          aria-label="Choose photos" onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS))} />
        <input className="dfm-input !py-1.5 !text-xs flex-1 min-w-[180px]" aria-label="Photo notes" placeholder="Notes (optional) — e.g. underside not photographed"
          value={notes} onChange={e => setNotes(e.target.value)} />
        <button onClick={read} disabled={!!busy || !files.length}
          className="dfm-cta text-navy-950 font-semibold rounded-xl px-4 py-2 text-xs flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {busy || `Read ${files.length || ''} photo${files.length === 1 ? '' : 's'} with AI vision`}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-3 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{error}</p>}

      {reads.map(r => (
        <section key={r.id} className="mt-4 rounded-xl border border-hairline p-3" aria-label={`Photo read — ${r.label}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs text-slate-300">
              <span className={`text-2xs uppercase tracking-wider mr-2 ${r.subject === 'ours' ? 'text-teal-400' : 'text-gold-400'}`}>{r.subject === 'ours' ? 'Our part' : 'Benchmark'}</span>
              <span className="text-white font-semibold">{r.label}</span> · {r.ticked.size} of {r.obs.length} ticked
            </p>
            <div className="flex items-center gap-2">
              {r.subject === 'benchmark' && (
                <button onClick={() => saveTeardown(r)} disabled={r.saved}
                  className="text-xs px-2.5 py-1 rounded-lg border border-hairline text-slate-300 hover:text-white flex items-center gap-1.5 disabled:opacity-60">
                  <BookmarkPlus size={13} /> {r.saved ? 'Saved to teardown library' : 'Save to my teardown library'}
                </button>
              )}
              <button aria-label={`Remove photo read ${r.label}`} onClick={() => setReads(prev => prev.filter(x => x.id !== r.id))} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
          </div>
          <div className="flex gap-2 mb-2 overflow-x-auto">
            {r.thumbs.map((t, i) => <img key={i} src={t} alt={`photo ${i + 1} of ${r.label}`} className="h-16 rounded-md border border-hairline" />)}
          </div>
          <ul className="space-y-1.5" aria-label={`Photo observations — ${r.label}`}>
            {r.obs.map((o, i) => (
              <li key={i}>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={r.ticked.has(i)} onChange={() => toggle(r.id, i)} className="mt-0.5 accent-teal-500" />
                  <span className={`shrink-0 w-24 text-2xs uppercase tracking-wider mt-0.5 ${o.kind === 'cannot-tell' ? 'text-amber-400' : 'text-slate-500'}`}>{KIND_LABEL[o.kind] ?? o.kind}</span>
                  <span className={r.ticked.has(i) ? 'text-slate-200' : 'text-slate-500 line-through'}>{o.text}</span>
                </label>
              </li>
            ))}
          </ul>
          {r.caution && <p className="text-2xs text-slate-500 mt-2">{r.caution}</p>}
        </section>
      ))}
    </div>
  );
}
