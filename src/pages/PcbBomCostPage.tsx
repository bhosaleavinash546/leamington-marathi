import { useState, useEffect, useRef, useCallback } from 'react';
import { downloadXlsx, objectsToAoa } from '../services/xlsx-write';
import { CircuitBoard, Upload, Cpu, Calculator, Download, Trash2, Plus, AlertTriangle, Info, X, Globe2, Activity, Lightbulb, Sparkles, CheckCircle2, XCircle, HelpCircle, Zap, FileSpreadsheet, SlidersHorizontal, ChevronDown, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ButtonSpinner from '../components/ui/ButtonSpinner';
import { parseBomFile } from '../services/bom-import';

interface Line { refDes: string; type: string; label?: string; package: string; mount: 'SMT' | 'TH'; pins: number; qty: number; unitCost: number; lineCost?: number; unitCostOverride?: number; confidence?: string; markings?: string; partGuess?: string; aiPrice1k?: number | null; mpn?: string; liveSource?: string; liveMeta?: string }
interface Board { widthMm: number; heightMm: number; layers: number; finish: string; areaCm2?: number }
interface Cost {
  currency: string; board: Board; total: number; componentCost: number; fabCost: number; assemblyCost: number; testCost: number; logistics: number; overhead: number; tariff: number; volume: number;
  region: string; regionLabel: string;
  params: { volume: number; autoGrade: boolean; testStrategy: string; sides: string; panelUtil: number; tariffPct: number };
  stats: { lineItems: number; uniqueParts: number; totalPlacements: number; bgaPlacements: number; thLeads: number; activeDevices: number };
  breakdown: Record<string, { value: number; pct: number }>;
  lines: Line[]; note: string;
}
interface RegionRow { region: string; label: string; labourHr: number; total: number; deltaVsCheapest: number }
interface Sensitivity { simulation: { p10: number; p50: number; p90: number; mean: number; stdev: number }; tornado: { baseTotal: number; scenarios: Array<{ label: string; total: number; delta: number }> } }
interface Coverage { viewsSeen: string[]; hiddenAreas: string[]; bomCoveragePct: number | null }
interface Insight { title: string; bucket: 'optimization' | 'dfm' | 'sourcing'; lever: string; detail: string; engineCheck: { baseline?: number; proposed?: number; delta?: number; direction: string; basis: string } }
interface Photo { name: string; dataUrl: string }

const FINISHES = ['hasl', 'leadfree_hasl', 'enig', 'osp', 'immersion_silver'];
const LAYERS = [1, 2, 4, 6, 8, 10];
const TEST_STRATEGIES = [
  { value: 'auto', label: 'Auto (by volume)' },
  { value: 'aoi', label: 'AOI only' },
  { value: 'aoi_fct', label: 'AOI + bench FCT' },
  { value: 'aoi_ict', label: 'AOI + ICT' },
  { value: 'aoi_ict_fct', label: 'AOI + ICT + FCT' },
];
const inp = 'w-full bg-navy-800 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-500/40';
const MAX_PHOTOS = 5;

// Downscale a photo client-side (≤1600px JPEG) so five HD shots fit the API limit.
function downscalePhoto(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unavailable')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}`)); };
    img.src = url;
  });
}

const CONF_DOT: Record<string, string> = { high: 'bg-emerald-400', med: 'bg-amber-400', low: 'bg-danger-400' };

// ── Detailed manual should-costing (CBD) types ───────────────────────────────
interface CbdLine { tier: string; label: string; value: number; pct: number; basis: string }
interface CbdStation { id: string; label: string; cycleSec: number; mhr: number; cost: number; detail?: string }
interface CbdNre { id: string; label: string; amount: number; amortVolume: number; perBoard: number }
interface Cbd {
  lines: CbdLine[]; stations: CbdStation[]; nre: CbdNre[]; rty: number;
  exWorks: number; landed: number;
  parity: { simpleTotal: number; detailedTotal: number; deltaPct: number };
  meta: { regionLabel: string; volume: number; testStrategy: string };
}
interface Drivers {
  material: { attritionPct: number; materialOhPct: number; consumablesPerBoard: number };
  fab: { ratePerCm2: number; finishMult: number; panelUtil: number };
  stations: Array<{ id: string; label: string; cycleSec: number; mhr: number; detail?: string }>;
  yieldD: { fpyPrintPct: number; fpyPlacePct: number; fpyReflowPct: number; fpyTestPct: number; reworkSharePct: number; reworkMin: number; reworkRatePerHr: number };
  nre: Array<{ id: string; label: string; amount: number; amortVolume: number }>;
  overheads: { mfgOhPct: number; sgaPct: number; profitPct: number };
  belowLine: { packagingPerBoard: number; freightPct: number; tariffPct: number };
}
type Overrides = Record<string, Record<string, number> | Record<string, Record<string, number>>>;

export default function PcbBomCostPage() {
  const { token } = useAuth();
  const [types, setTypes] = useState<Record<string, { label: string; mount: string; unit: number }>>({});
  // Static fallback mirrors the engine's PCB_REGIONS so the selector renders
  // even before/without the catalogue endpoint; server data replaces it on load.
  const [regions, setRegions] = useState<Record<string, { label: string; labourHr: number }>>({
    china: { label: 'China', labourHr: 7 }, taiwan: { label: 'Taiwan', labourHr: 12 },
    vietnam: { label: 'Vietnam', labourHr: 3.5 }, india: { label: 'India', labourHr: 2.5 },
    thailand: { label: 'Thailand', labourHr: 4 }, malaysia: { label: 'Malaysia', labourHr: 5 },
    korea: { label: 'South Korea', labourHr: 26 }, japan: { label: 'Japan', labourHr: 26 },
    mexico: { label: 'Mexico', labourHr: 5.5 }, easteu: { label: 'Eastern Europe', labourHr: 12 },
    germany: { label: 'Germany / W. EU', labourHr: 48 }, usa: { label: 'USA', labourHr: 30 },
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [board, setBoard] = useState<Board>({ widthMm: 80, heightMm: 60, layers: 2, finish: 'hasl' });
  const [lines, setLines] = useState<Line[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const [multiRegion, setMultiRegion] = useState<RegionRow[] | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [pricingProviders, setPricingProviders] = useState<{ digikey: boolean; octopart: boolean } | null>(null);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [entryMode, setEntryMode] = useState<'photos' | 'bom'>('photos');
  const [importNotes, setImportNotes] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [pricingNote, setPricingNote] = useState('');
  const bomFileRef = useRef<HTMLInputElement>(null);
  // costing params
  const [volume, setVolume] = useState('150000');
  const [region, setRegion] = useState('china');
  const [allRegions, setAllRegions] = useState(true);
  const [autoGrade, setAutoGrade] = useState(true);
  const [testStrategy, setTestStrategy] = useState('auto');
  const [sides, setSides] = useState<'single' | 'double'>('single');
  const [panelUtil, setPanelUtil] = useState('0.85');
  const [tariffPct, setTariffPct] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [bottomPopulated, setBottomPopulated] = useState(false);
  const [boardWidthMm, setBoardWidthMm] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/pcb-cost/catalogue').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.classes) setTypes(d.classes);
      if (d?.regions) setRegions(d.regions);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch('/api/pcb-part-prices/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.providers) setPricingProviders(d.providers); })
      .catch(() => {});
  }, [token]);

  const addFiles = useCallback(async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'));
    if (imgs.length === 0) { setError('Please upload photos (PNG/JPG) of the PCB.'); return; }
    setError('');
    try {
      const scaled = await Promise.all(imgs.map(downscalePhoto));
      setPhotos(prev => [...prev, ...scaled].slice(0, MAX_PHOTOS));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read a photo.'); }
  }, []);

  const costParams = () => ({
    volume: Number(volume) || 1000,
    region, autoGrade, testStrategy, sides,
    panelUtil: Number(panelUtil) || 0.85,
    tariffPct: Number(tariffPct) || 0,
  });

  async function extractAndCost() {
    if (photos.length === 0 || !token) return;
    const apiKey = localStorage.getItem('brainspark_api_key') || '';
    setBusy(true); setError(''); setInsights(null); setImportNotes(''); setImportedCount(0); setPricingNote('');
    try {
      const r = await fetch('/api/pcb-bom-cost', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          images: photos.map(p => ({ base64: p.dataUrl.split(',')[1], mimeType: 'image/jpeg' })),
          ...(apiKey ? { apiKey } : {}),
          ...costParams(),
          bottomPopulated, boardWidthMm: Number(boardWidthMm) || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Extraction failed');
      setAssumptions(d.assumptions || '');
      setCoverage(d.coverage || null);
      applyCost(d.cost);
      // Immediately follow with the full deterministic pass (regions + sensitivity).
      await recost(seedLines(d.cost.lines), d.cost.board);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not analyse the board.'); }
    finally { setBusy(false); }
  }

  // AI-priced lines keep their price as an explicit (editable) override; class-priced
  // lines stay override-free so a Type change reprices from the class average.
  // The MPN/query field seeds from the vision part-family guess.
  function seedLines(ls: Line[]): Line[] {
    return ls.map(l => ({ ...l, unitCostOverride: l.aiPrice1k ? l.unitCost : undefined, mpn: l.mpn || l.partGuess || '' }));
  }

  async function importBom(file: File) {
    if (!token) return;
    const apiKey = localStorage.getItem('brainspark_api_key') || '';
    setBusy(true); setError(''); setInsights(null); setCoverage(null); setAssumptions('');
    try {
      const payload = await parseBomFile(file);
      const r = await fetch('/api/pcb-bom-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...payload, board, ...costParams(), ...(apiKey ? { apiKey } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'BOM import failed');
      setImportNotes(d.notes || '');
      setImportedCount(d.imported || 0);
      applyCost(d.cost);
      const seeded = seedLines(d.cost.lines);
      await recost(seeded, d.cost.board);
      // Exact MPNs are in hand — go straight to live pricing when configured.
      if (pricingConfigured) await getLivePricesFor(seeded);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not import that BOM.'); }
    finally { setBusy(false); }
  }

  function applyCost(c: Cost) {
    setCost(c);
    setBoard(c.board);
    setLines(seedLines(c.lines));
    setDirty(false);
  }

  async function recost(nextLines = lines, nextBoard = board) {
    if (!token) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/pcb-cost', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          board: nextBoard, ...costParams(), allRegions, sensitivity: true,
          components: nextLines.map(l => ({ refDes: l.refDes, type: l.type, package: l.package, mount: l.mount, pins: l.pins, qty: l.qty, unitCostOverride: l.unitCostOverride })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Costing failed');
      setCost(d.cost);
      setMultiRegion(d.multiRegion?.results ?? null);
      setSensitivity(d.sensitivity ?? null);
      // Preserve user overrides + vision metadata across the re-cost.
      setLines(d.cost.lines.map((l: Line, i: number) => ({
        ...l,
        unitCostOverride: nextLines[i]?.unitCostOverride,
        confidence: nextLines[i]?.confidence,
        markings: nextLines[i]?.markings,
        partGuess: nextLines[i]?.partGuess,
        aiPrice1k: nextLines[i]?.aiPrice1k,
        mpn: nextLines[i]?.mpn,
        liveSource: nextLines[i]?.liveSource,
        liveMeta: nextLines[i]?.liveMeta,
      })));
      setDirty(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not re-cost.'); }
    finally { setBusy(false); }
  }

  async function generateInsights() {
    if (!cost || !token) return;
    const apiKey = localStorage.getItem('brainspark_api_key') || '';
    setInsightsBusy(true); setError('');
    try {
      const r = await fetch('/api/pcb-insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          board, ...costParams(), ...(apiKey ? { apiKey } : {}),
          components: lines.map(l => ({ refDes: l.refDes, type: l.type, package: l.package, mount: l.mount, pins: l.pins, qty: l.qty, unitCostOverride: l.unitCostOverride })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Insights failed');
      setInsights(d.ideas || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not generate insights.'); }
    finally { setInsightsBusy(false); }
  }

  function updateLine(i: number, patch: Partial<Line>) {
    if (patch.type !== undefined) patch = { ...patch, unitCostOverride: undefined, aiPrice1k: null, liveSource: undefined, liveMeta: undefined };
    setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
    setDirty(true);
  }

  const pricingConfigured = !!(pricingProviders?.digikey || pricingProviders?.octopart);

  async function getLivePricesFor(sourceLines: Line[]) {
    if (!token || sourceLines.length === 0) return;
    const vol = Number(volume) || 1000;
    // Send every searchable line — the server prices the 40 most cost-dominant
    // (qty × best-known unit price) within the provider-call budget.
    const payload = sourceLines
      .map((l, index) => ({
        index,
        query: (l.mpn || l.partGuess || l.markings || '').trim(),
        qty: l.qty,
        type: l.type,
        unitCostOverride: l.unitCostOverride,
      }))
      .filter(l => l.query.length >= 3)
      .slice(0, 300);
    if (payload.length === 0) { setError('No part numbers to look up — type an MPN in the MPN column first.'); return; }
    setPricingBusy(true); setError(''); setPricingNote('');
    try {
      const r = await fetch('/api/pcb-part-prices', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lines: payload, volume: vol }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Price lookup failed');
      const byIndex = new Map<number, any>((d.results || []).map((res: any) => [res.index, res]));
      const next = sourceLines.map((l, i) => {
        const res = byIndex.get(i);
        if (!res?.found) return l;
        return {
          ...l,
          unitCostOverride: res.unitPrice,
          aiPrice1k: null,
          mpn: res.match?.mpn || l.mpn,
          liveSource: res.source,
          liveMeta: `${res.match?.manufacturer ? res.match.manufacturer + ' ' : ''}${res.match?.mpn || ''} · £${res.unitPrice} @ ${res.breakQty.toLocaleString()}-break${res.atRequestedQty ? '' : ' (best published — negotiated volume pricing typically lower)'}`,
        };
      });
      const priced = next.filter(l => l.liveSource).length;
      if (priced === 0) { setError('No matches found — check the MPN spellings.'); setLines(next); return; }
      setPricingNote(`${priced} line${priced === 1 ? '' : 's'} live-priced${d.skipped > 0 ? ` · ${d.skipped} lower-value lines stayed on class prices (40-lookup budget)` : ''}.`);
      await recost(next);   // refresh totals with live prices applied
    } catch (e) { setError(e instanceof Error ? e.message : 'Price lookup failed.'); }
    finally { setPricingBusy(false); }
  }
  const getLivePrices = () => getLivePricesFor(lines);
  function addLine() { setLines(ls => [...ls, { refDes: '', type: 'resistor', package: '', mount: 'SMT', pins: 2, qty: 1, unitCost: 0, unitCostOverride: undefined }]); setDirty(true); }
  function delLine(i: number) { setLines(ls => ls.filter((_, j) => j !== i)); setDirty(true); }

  function exportXlsx() {
    if (!cost) return;
    const rows = lines.map(l => ({ RefDes: l.refDes, Type: l.type, Package: l.package, Mount: l.mount, Pins: l.pins, Qty: l.qty, MPN: l.mpn || '', Markings: l.markings || '', 'Unit £': l.unitCostOverride ?? l.unitCost, 'Price source': l.liveSource ? `live:${l.liveSource}` : l.aiPrice1k ? 'AI estimate' : (l.unitCostOverride ? 'manual' : 'class average'), 'Line £': +(((l.unitCostOverride ?? l.unitCost) * l.qty)).toFixed(3) }));
    rows.push({} as never);
    for (const [k, v] of Object.entries(cost.breakdown)) rows.push({ RefDes: k === 'fab' ? 'PCB fab' : k[0].toUpperCase() + k.slice(1), 'Line £': v.value } as never);
    rows.push({ RefDes: `TOTAL /board · ${cost.regionLabel} @ ${cost.volume.toLocaleString()}/yr`, 'Line £': cost.total } as never);
    const sheets = [{ name: 'PCB BOM Cost', rows: objectsToAoa(rows) }];
    if (multiRegion) {
      sheets.push({ name: 'By country', rows: objectsToAoa(multiRegion.map(r => ({ Country: r.label, 'Labour $/hr': r.labourHr, 'Unit £': r.total, 'Δ vs cheapest £': r.deltaVsCheapest }))) });
    }
    if (insights?.length) {
      sheets.push({ name: 'AI insights', rows: objectsToAoa(insights.map(i => ({ Bucket: i.bucket, Idea: i.title, Detail: i.detail, 'Engine check': i.engineCheck.direction, 'Δ £/board': i.engineCheck.delta ?? '', Basis: i.engineCheck.basis }))) });
    }
    void downloadXlsx('BrainSpark_PCB_BOM_Cost.xlsx', sheets);
  }

  const confCounts = lines.reduce((a, l) => { a[l.confidence || 'med'] = (a[l.confidence || 'med'] || 0) + 1; return a; }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="lg:hidden max-w-3xl mx-auto mb-4 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200/90 text-xs">This data-dense workspace is best used on a desktop screen.</div>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center flex-shrink-0"><CircuitBoard size={22} className="text-teal-400" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">PCB Photos → BOM → Should-Cost</h1>
            <p className="text-slate-400 text-sm max-w-2xl mt-1">Upload your engineering BOM (.xlsx/.csv/.pdf — exact part numbers, highest accuracy) or up to {MAX_PHOTOS} board photos (AI fuses views, reading silkscreen and IC markings). Live distributor pricing fills real part costs; a deterministic model then costs the board across the world's PCB manufacturing hubs, with sensitivity bands and engine-verified optimisation ideas.</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          {/* Left column */}
          <div className="space-y-4">
            {!cost && (
              <div className="flex gap-1.5 p-1 rounded-xl bg-navy-900 border border-white/10 w-fit">
                {([['photos', 'Board photos'], ['bom', 'BOM file (.xlsx / .csv / .pdf)']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setEntryMode(mode)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${entryMode === mode ? 'bg-teal-600/80 text-white' : 'text-slate-400 hover:text-white'}`}
                  >{mode === 'bom' ? <span className="inline-flex items-center gap-1.5"><FileSpreadsheet size={12} /> {label}</span> : label}</button>
                ))}
              </div>
            )}

            {!cost && entryMode === 'bom' && (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void importBom(f); }}
                onClick={() => bomFileRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-teal-500/60 bg-teal-500/5' : 'border-white/15 hover:border-white/30'}`}>
                {busy ? <ButtonSpinner size={24} /> : <FileSpreadsheet size={30} className="text-slate-500 mx-auto mb-3" />}
                <p className="text-white text-sm font-medium">{busy ? 'Reading the BOM…' : 'Drop your BOM (.xlsx, .csv or .pdf), or click to browse'}</p>
                <p className="text-slate-500 text-xs mt-1">The highest-accuracy path: exact part numbers and per-board quantities — AI maps any column layout{pricingConfigured ? ', then live distributor pricing runs automatically' : ''}.</p>
                <input ref={bomFileRef} type="file" accept=".xlsx,.xlsm,.csv,.tsv,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void importBom(f); e.target.value = ''; }} />
              </div>
            )}

            {!cost && entryMode === 'photos' && (
              <>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); void addFiles(Array.from(e.dataTransfer.files || [])); }}
                  onClick={() => fileRef.current?.click()}
                  className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-teal-500/60 bg-teal-500/5' : 'border-white/15 hover:border-white/30'}`}>
                  <Upload size={30} className="text-slate-500 mx-auto mb-3" />
                  <p className="text-white text-sm font-medium">Drop up to {MAX_PHOTOS} PCB photos, or click to browse</p>
                  <p className="text-slate-500 text-xs mt-1">Top + bottom + close-ups of dense areas work best · photos are downscaled locally before upload</p>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { void addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
                </div>

                {photos.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {photos.map((p, i) => (
                      <div key={i} className="relative">
                        <img src={p.dataUrl} alt={p.name} className="h-24 rounded-lg border border-white/10 object-cover" />
                        <button onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-navy-800 border border-white/20 text-slate-300 hover:text-white flex items-center justify-center"><X size={11} /></button>
                      </div>
                    ))}
                    {photos.length < MAX_PHOTOS && (
                      <button onClick={() => fileRef.current?.click()} className="h-24 w-20 rounded-lg border border-dashed border-white/15 text-slate-500 hover:border-white/30 flex flex-col items-center justify-center gap-1 text-[11px]"><Plus size={14} /> Add</button>
                    )}
                  </div>
                )}

                {photos.length > 0 && (
                  <div className="space-y-3">
                    <div className="bg-navy-900 border border-white/10 rounded-2xl p-4 grid grid-cols-2 gap-3">
                      <label className="text-xs text-slate-400 col-span-2 flex items-center gap-2">
                        <input type="checkbox" checked={bottomPopulated} onChange={e => setBottomPopulated(e.target.checked)} className="accent-teal-500" />
                        Bottom side is populated but NOT in any photo
                      </label>
                      <label className="text-xs text-slate-400 col-span-2">Board width (mm) — a scale reference greatly improves size accuracy
                        <input type="number" value={boardWidthMm} onChange={e => setBoardWidthMm(e.target.value)} placeholder="optional, e.g. 85" className={`${inp} mt-1`} /></label>
                    </div>
                    <button onClick={extractAndCost} disabled={busy} className="w-full py-3 rounded-xl bg-teal-600/90 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2">
                      {busy ? <><ButtonSpinner /> Reading {photos.length} photo{photos.length > 1 ? 's' : ''}…</> : <><Cpu size={16} /> Extract BOM & cost ({photos.length} photo{photos.length > 1 ? 's' : ''})</>}
                    </button>
                  </div>
                )}
              </>
            )}

            {error && <div className="flex items-start gap-2 text-sm text-danger-300 bg-danger-500/10 border border-danger-500/25 rounded-xl px-4 py-3"><AlertTriangle size={15} className="mt-0.5 flex-shrink-0" /> {error}</div>}

            {cost && (importedCount > 0 || pricingNote) && (
              <div className="flex items-start gap-2 text-[11px] text-emerald-300/90 bg-emerald-500/8 border border-emerald-500/25 rounded-xl px-3 py-2.5">
                <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  {importedCount > 0 && <><b className="text-emerald-300">{importedCount} BOM lines imported</b> — exact part numbers, highest-accuracy path. </>}
                  {pricingNote && <>{pricingNote} </>}
                  {importNotes && <span className="text-slate-400">Mapper notes: {importNotes}</span>}
                </span>
              </div>
            )}

            {cost && (coverage || assumptions) && (
              <div className="flex items-start gap-2 text-[11px] text-amber-300/80 bg-amber-500/8 border border-amber-500/25 rounded-xl px-3 py-2.5">
                <Info size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  {coverage?.viewsSeen?.length ? <><b className="text-amber-300">Views:</b> {coverage.viewsSeen.join(', ')}. </> : null}
                  {coverage?.bomCoveragePct ? <><b className="text-amber-300">Estimated BOM coverage ~{coverage.bomCoveragePct}%.</b> </> : null}
                  {coverage?.hiddenAreas?.length ? <><b className="text-amber-300">Not visible:</b> {coverage.hiddenAreas.join('; ')}. </> : null}
                  {assumptions ? <><b className="text-amber-300">Assumptions:</b> {assumptions}</> : null}
                  {' '}<span className="text-slate-500">Confidence: {confCounts.high || 0} high · {confCounts.med || 0} med · {confCounts.low || 0} low</span>
                </span>
              </div>
            )}

            {cost && (
              <div className="bg-navy-900 border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                  <p className="text-white font-semibold text-sm flex items-center gap-2"><Calculator size={15} className="text-teal-400" /> Estimated BOM ({lines.length} lines)</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={getLivePrices}
                      disabled={pricingBusy || busy || !pricingConfigured}
                      title={pricingConfigured
                        ? `Look up real distributor prices by part number (${[pricingProviders?.digikey && 'DigiKey', pricingProviders?.octopart && 'Octopart'].filter(Boolean).join(' · ')})`
                        : 'Not configured — set DIGIKEY_CLIENT_ID + DIGIKEY_CLIENT_SECRET and/or NEXAR_TOKEN in the server .env'}
                      className="text-xs px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {pricingBusy ? <><ButtonSpinner size={11} /> Pricing…</> : <><Zap size={12} /> Live prices</>}
                    </button>
                    <button onClick={addLine} className="text-xs px-2 py-1 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 flex items-center gap-1"><Plus size={12} /> Row</button>
                    <button onClick={() => recost()} disabled={busy} className="text-xs px-3 py-1 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-white font-medium disabled:opacity-40">{busy ? 'Costing…' : 'Re-cost'}</button>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[520px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-navy-900"><tr className="text-slate-500 text-left">
                      <th className="px-2 py-2 font-medium"> </th><th className="px-2 py-2 font-medium">Ref</th><th className="px-2 py-2 font-medium">Type</th><th className="px-2 py-2 font-medium">Pkg</th>
                      <th className="px-2 py-2 font-medium">MPN / part</th>
                      <th className="px-2 py-2 font-medium">Mnt</th><th className="px-2 py-2 font-medium">Pins</th><th className="px-2 py-2 font-medium">Qty</th>
                      <th className="px-2 py-2 font-medium text-right">Unit £</th><th className="px-2 py-2 font-medium text-right">Line £</th><th></th>
                    </tr></thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="px-2 py-1"><span title={`${l.confidence || 'med'} confidence`} className={`inline-block w-2 h-2 rounded-full ${CONF_DOT[l.confidence || 'med'] || 'bg-amber-400'}`} /></td>
                          <td className="px-1 py-1"><input value={l.refDes} onChange={e => updateLine(i, { refDes: e.target.value })} className={`${inp} w-14`} /></td>
                          <td className="px-1 py-1">
                            <select value={l.type} onChange={e => updateLine(i, { type: e.target.value })} className={`${inp} w-28`}>
                              {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </td>
                          <td className="px-1 py-1"><input value={l.package} onChange={e => updateLine(i, { package: e.target.value })} className={`${inp} w-14`} /></td>
                          <td className="px-1 py-1">
                            <input
                              value={l.mpn ?? ''}
                              onChange={e => updateLine(i, { mpn: e.target.value, liveSource: undefined, liveMeta: undefined })}
                              placeholder={l.markings || 'MPN / query'}
                              title={l.liveMeta || (l.markings ? `Read off the part: "${l.markings}"` : 'Type a manufacturer part number for live pricing')}
                              className={`${inp} w-32 ${l.liveSource ? 'border-emerald-500/40 text-emerald-200' : ''}`}
                            />
                          </td>
                          <td className="px-1 py-1"><select value={l.mount} onChange={e => updateLine(i, { mount: e.target.value as 'SMT' | 'TH' })} className={`${inp} w-14`}><option>SMT</option><option>TH</option></select></td>
                          <td className="px-1 py-1"><input type="number" value={l.pins} onChange={e => updateLine(i, { pins: Number(e.target.value) })} className={`${inp} w-12`} /></td>
                          <td className="px-1 py-1"><input type="number" value={l.qty} onChange={e => updateLine(i, { qty: Number(e.target.value) })} className={`${inp} w-14`} /></td>
                          <td className="px-1 py-1">
                            <div className="relative">
                              <input type="number" step="0.001" value={l.unitCostOverride ?? l.unitCost} onChange={e => updateLine(i, { unitCostOverride: e.target.value === '' ? undefined : Number(e.target.value), aiPrice1k: null, liveSource: undefined, liveMeta: undefined })} className={`${inp} w-16 text-right ${l.liveSource ? 'border-emerald-500/50 text-emerald-200' : l.aiPrice1k ? 'border-amber-500/40 text-amber-200' : ''}`} />
                              {l.liveSource
                                ? <span title={l.liveMeta || `Live distributor price (${l.liveSource})`} className="absolute -top-1.5 -right-1 text-[8px] font-bold text-emerald-400 bg-navy-900 px-0.5 rounded">LIVE</span>
                                : l.aiPrice1k ? <span title={`AI-estimated from markings (~£${l.aiPrice1k} @1k). Edit to correct.`} className="absolute -top-1.5 -right-1 text-[8px] font-bold text-amber-400 bg-navy-900 px-0.5 rounded">AI</span> : null}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-right text-slate-300 font-mono">{(((l.unitCostOverride ?? l.unitCost) * l.qty)).toFixed(2)}</td>
                          <td className="px-1 py-1"><button onClick={() => delLine(i)} className="text-slate-600 hover:text-danger-400"><Trash2 size={13} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Multi-country comparison */}
            {cost && multiRegion && (
              <div className="bg-navy-900 border border-white/10 rounded-2xl p-4">
                <p className="text-white font-semibold text-sm flex items-center gap-2 mb-3"><Globe2 size={15} className="text-teal-400" /> Should-cost by manufacturing hub <span className="text-slate-500 font-normal">@ {cost.volume.toLocaleString()}/yr</span></p>
                <div className="space-y-1.5">
                  {multiRegion.map(r => {
                    const max = multiRegion[multiRegion.length - 1].total;
                    const w = Math.max(4, Math.round((r.total / max) * 100));
                    const isBase = r.region === cost.region;
                    return (
                      <div key={r.region} className="flex items-center gap-2 text-xs">
                        <span className={`w-32 truncate ${isBase ? 'text-teal-300 font-semibold' : 'text-slate-300'}`}>{r.label}{isBase ? ' •' : ''}</span>
                        <div className="flex-1 h-3.5 rounded bg-white/5 overflow-hidden"><div className={`h-full ${isBase ? 'bg-teal-500/70' : 'bg-slate-500/40'}`} style={{ width: `${w}%` }} /></div>
                        <span className="w-16 text-right font-mono text-slate-200">£{r.total.toFixed(2)}</span>
                        <span className="w-14 text-right font-mono text-slate-500">{r.deltaVsCheapest > 0 ? `+${r.deltaVsCheapest.toFixed(2)}` : '—'}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10.5px] text-slate-600 mt-2.5">Conversion rates scale with each hub; component prices are global. Tariffs/duties not included unless set in parameters.</p>
              </div>
            )}

            {/* Sensitivity */}
            {cost && sensitivity && (
              <div className="bg-navy-900 border border-white/10 rounded-2xl p-4">
                <p className="text-white font-semibold text-sm flex items-center gap-2 mb-3"><Activity size={15} className="text-teal-400" /> Sensitivity</p>
                <div className="flex items-center gap-4 mb-4 text-center">
                  {[['P10', sensitivity.simulation.p10, 'text-emerald-300'], ['P50', sensitivity.simulation.p50, 'text-white'], ['P90', sensitivity.simulation.p90, 'text-amber-300']].map(([k, v, c]) => (
                    <div key={k as string} className="flex-1 rounded-xl bg-white/4 border border-white/8 py-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
                      <div className={`text-lg font-bold ${c}`}>£{(v as number).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mb-2">What moves the price most (each a real engine run):</p>
                <div className="space-y-1">
                  {sensitivity.tornado.scenarios.slice(0, 8).map((s, i) => {
                    const maxAbs = Math.abs(sensitivity.tornado.scenarios[0].delta) || 1;
                    const w = Math.max(3, Math.round((Math.abs(s.delta) / maxAbs) * 100));
                    return (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className="w-44 truncate text-slate-400">{s.label}</span>
                        <div className="flex-1 h-3 rounded bg-white/5 overflow-hidden"><div className={`h-full ${s.delta < 0 ? 'bg-emerald-500/60' : 'bg-danger-500/50'}`} style={{ width: `${w}%` }} /></div>
                        <span className={`w-16 text-right font-mono ${s.delta < 0 ? 'text-emerald-300' : 'text-danger-300'}`}>{s.delta > 0 ? '+' : ''}{s.delta.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI insights */}
            {cost && (
              <div className="bg-navy-900 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-semibold text-sm flex items-center gap-2"><Lightbulb size={15} className="text-gold-400" /> AI insights — cost · DFM · sourcing</p>
                  <button onClick={generateInsights} disabled={insightsBusy || dirty} title={dirty ? 'Re-cost first' : ''} className="text-xs px-3 py-1.5 rounded-lg bg-gold-500/90 hover:bg-gold-400 text-navy-950 font-semibold disabled:opacity-40 flex items-center gap-1.5">
                    {insightsBusy ? <><ButtonSpinner size={12} /> Thinking…</> : <><Sparkles size={13} /> {insights ? 'Regenerate' : 'Generate insights'}</>}
                  </button>
                </div>
                {!insights && !insightsBusy && <p className="text-slate-500 text-xs">AI proposes ideas; the deterministic engine re-costs every expressible lever and stamps the real £ delta.</p>}
                {insights && (['optimization', 'dfm', 'sourcing'] as const).map(bucket => {
                  const items = insights.filter(i => i.bucket === bucket);
                  if (items.length === 0) return null;
                  return (
                    <div key={bucket} className="mb-3 last:mb-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 mb-1.5">{bucket === 'dfm' ? 'DFM' : bucket}</p>
                      <div className="space-y-2">
                        {items.map((idea, i) => {
                          const ec = idea.engineCheck;
                          return (
                            <div key={i} className="rounded-xl bg-white/4 border border-white/8 px-3 py-2.5">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-white text-xs font-semibold">{idea.title}</p>
                                {ec.direction === 'confirmed' && <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-300"><CheckCircle2 size={12} /> −£{Math.abs(ec.delta || 0).toFixed(2)}/board</span>}
                                {ec.direction === 'contradicted' && <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-bold text-danger-300"><XCircle size={12} /> +£{Math.abs(ec.delta || 0).toFixed(2)} (engine disagrees)</span>}
                                {ec.direction === 'unverified' && <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] text-slate-500"><HelpCircle size={12} /> qualitative</span>}
                              </div>
                              <p className="text-slate-400 text-[11.5px] mt-1">{idea.detail}</p>
                              {ec.basis && <p className="text-slate-600 text-[10px] mt-1">Engine check: {ec.basis}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Detailed manual should-costing (CBD) */}
            {cost && !dirty && <DetailedEngine token={token} board={board} lines={lines} getParams={costParams} />}
          </div>

          {/* Right column: parameters + cost summary */}
          <div className="space-y-4">
            <div className="bg-navy-900 border border-white/10 rounded-2xl p-4">
              <p className="text-white font-semibold text-sm mb-3">Board & costing parameters</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-400">Width (mm)<input type="number" value={board.widthMm} onChange={e => { setBoard(b => ({ ...b, widthMm: Number(e.target.value) })); setDirty(true); }} className={`${inp} mt-1`} /></label>
                <label className="text-xs text-slate-400">Height (mm)<input type="number" value={board.heightMm} onChange={e => { setBoard(b => ({ ...b, heightMm: Number(e.target.value) })); setDirty(true); }} className={`${inp} mt-1`} /></label>
                <label className="text-xs text-slate-400">Layers<select value={board.layers} onChange={e => { setBoard(b => ({ ...b, layers: Number(e.target.value) })); setDirty(true); }} className={`${inp} mt-1`}>{LAYERS.map(n => <option key={n}>{n}</option>)}</select></label>
                <label className="text-xs text-slate-400">Finish<select value={board.finish} onChange={e => { setBoard(b => ({ ...b, finish: e.target.value })); setDirty(true); }} className={`${inp} mt-1`}>{FINISHES.map(f => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}</select></label>
                <label className="text-xs text-slate-400 col-span-2">Annual volume<input type="number" value={volume} onChange={e => { setVolume(e.target.value); setDirty(true); }} className={`${inp} mt-1`} /></label>
                <label className="text-xs text-slate-400">Build country<select value={region} onChange={e => { setRegion(e.target.value); setDirty(true); }} className={`${inp} mt-1`}>{Object.entries(regions).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
                <label className="text-xs text-slate-400">Test strategy<select value={testStrategy} onChange={e => { setTestStrategy(e.target.value); setDirty(true); }} className={`${inp} mt-1`}>{TEST_STRATEGIES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
                <label className="text-xs text-slate-400">Assembly sides<select value={sides} onChange={e => { setSides(e.target.value as 'single' | 'double'); setDirty(true); }} className={`${inp} mt-1`}><option value="single">Single</option><option value="double">Double</option></select></label>
                <label className="text-xs text-slate-400">Panel utilisation<input type="number" step="0.05" min="0.5" max="0.95" value={panelUtil} onChange={e => { setPanelUtil(e.target.value); setDirty(true); }} className={`${inp} mt-1`} /></label>
                <label className="text-xs text-slate-400">Tariff % (optional)<input type="number" value={tariffPct} onChange={e => { setTariffPct(e.target.value); setDirty(true); }} className={`${inp} mt-1`} /></label>
                <label className="text-xs text-slate-400 flex items-end gap-2 pb-1"><input type="checkbox" checked={autoGrade} onChange={e => { setAutoGrade(e.target.checked); setDirty(true); }} className="accent-teal-500" /> Automotive grade (AEC-Q)</label>
                <label className="text-xs text-slate-400 col-span-2 flex items-center gap-2"><input type="checkbox" checked={allRegions} onChange={e => { setAllRegions(e.target.checked); setDirty(true); }} className="accent-teal-500" /> Compare all manufacturing hubs</label>
              </div>
              {cost && <button onClick={() => recost()} disabled={busy} className="w-full mt-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 disabled:opacity-40">Apply & re-cost</button>}
            </div>

            {cost && (
              <div className="bg-teal-500/8 border border-teal-500/25 rounded-2xl p-4">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-slate-400 text-xs uppercase tracking-wider">Unit cost · {cost.regionLabel}</span>
                  <span className="text-teal-300 font-black text-2xl">£{cost.total.toFixed(2)}</span>
                </div>
                {sensitivity && <p className="text-right text-[11px] text-slate-500 mb-2">P10 £{sensitivity.simulation.p10.toFixed(2)} – P90 £{sensitivity.simulation.p90.toFixed(2)}</p>}
                <div className="space-y-1.5">
                  {Object.entries(cost.breakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-300 flex-1 capitalize">{k === 'fab' ? 'PCB fab' : k}</span>
                      <span className="text-slate-400 tabular-nums w-9 text-right">{v.pct}%</span>
                      <span className="text-slate-200 tabular-nums w-16 text-right font-mono">£{v.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-slate-500 space-y-0.5">
                  <p>{cost.stats.totalPlacements} SMT placements · {cost.stats.thLeads} TH leads · {cost.board.areaCm2} cm² · {cost.board.layers}-layer {cost.board.finish}</p>
                  <p>@ {cost.volume.toLocaleString()} boards/yr · test: {cost.params.testStrategy} · {cost.params.autoGrade ? 'AEC-Q grade' : 'commercial grade'}</p>
                </div>
                {dirty && <p className="text-amber-300/80 text-[11px] mt-2">Edits pending — re-cost to update the totals before exporting.</p>}
                <button onClick={exportXlsx} disabled={dirty} title={dirty ? 'Re-cost first' : ''} className="w-full mt-3 py-2 rounded-lg bg-teal-600/80 hover:bg-teal-500 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2"><Download size={14} /> Export .xlsx</button>
              </div>
            )}

            <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-navy-900/60 border border-white/8 rounded-xl px-3 py-2.5">
              <Info size={13} className="mt-0.5 flex-shrink-0" />
              <span>Engineering estimate from research-based rate priors and class-average component prices shaped by per-class volume curves. Green "LIVE" prices are real distributor price-breaks (DigiKey/Octopart); amber "AI" prices are vision estimates — edit either where you know better. Use the P10–P90 band, not a single point. Not a supplier quote.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detailed manual should-costing engine (CBD waterfall) ───────────────────
// One engine, two views: drivers are DERIVED from the standard estimate, so at
// defaults the totals reconcile; every field is overridable with provenance.
function DetailedEngine({ token, board, lines, getParams }: { token: string | null; board: Board; lines: Line[]; getParams: () => Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<Drivers | null>(null);
  const [cbd, setCbd] = useState<Cbd | null>(null);
  const [ov, setOv] = useState<Overrides>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [group, setGroup] = useState('');
  const [mhrFor, setMhrFor] = useState('');
  const [mhrIn, setMhrIn] = useState({ investment: '1000000', deprYears: '7', operators: '0.75', labourRate: '18', productiveHoursYr: '5000' });

  async function compute(overrides: Overrides) {
    if (!token) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/pcb-detailed', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          board, ...getParams(), overrides,
          components: lines.map(l => ({ refDes: l.refDes, type: l.type, package: l.package, mount: l.mount, pins: l.pins, qty: l.qty, unitCostOverride: l.unitCostOverride })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Detailed costing failed');
      setDrivers(d.drivers); setCbd(d.cbd);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Detailed costing failed.'); }
    finally { setBusy(false); }
  }

  useEffect(() => { if (open && !cbd) void compute(ov); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => {
    if (!open || !cbd) return;
    const t = setTimeout(() => void compute(ov), 700);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ov]);

  const setFlat = (grp: string, key: string, raw: string) => {
    const v = raw === '' ? undefined : Number(raw);
    setOv(prev => {
      const g = { ...(prev[grp] as Record<string, number> | undefined) };
      if (v === undefined || !Number.isFinite(v)) delete g[key]; else g[key] = v;
      const next = { ...prev, [grp]: g };
      if (Object.keys(g).length === 0) delete next[grp];
      return next;
    });
  };
  const setNested = (grp: 'stations' | 'nre', id: string, key: string, raw: string) => {
    const v = raw === '' ? undefined : Number(raw);
    setOv(prev => {
      const g = { ...((prev[grp] as Record<string, Record<string, number>>) || {}) };
      const e = { ...(g[id] || {}) };
      if (v === undefined || !Number.isFinite(v)) delete e[key]; else e[key] = v;
      if (Object.keys(e).length === 0) delete g[id]; else g[id] = e;
      const next = { ...prev, [grp]: g };
      if (Object.keys(g).length === 0) delete next[grp];
      return next;
    });
  };
  const flatVal = (grp: string, key: string, derived: number) =>
    ((ov[grp] as Record<string, number> | undefined)?.[key] ?? derived);
  const nestedVal = (grp: 'stations' | 'nre', id: string, key: string, derived: number) =>
    ((ov[grp] as Record<string, Record<string, number>> | undefined)?.[id]?.[key] ?? derived);
  const isSet = (grp: string, key: string) => (ov[grp] as Record<string, number> | undefined)?.[key] !== undefined;
  const isSetN = (grp: 'stations' | 'nre', id: string, key: string) => (ov[grp] as Record<string, Record<string, number>> | undefined)?.[id]?.[key] !== undefined;
  const hasOv = Object.keys(ov).length > 0;

  async function applyMhr(stationId: string) {
    if (!token) return;
    try {
      const r = await fetch('/api/pcb-detailed/mhr', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(Object.fromEntries(Object.entries(mhrIn).map(([k, v]) => [k, Number(v)]))),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.mhr) { setNested('stations', stationId, 'mhr', String(d.mhr)); setMhrFor(''); }
    } catch { /* leave field as-is */ }
  }

  function exportCbd() {
    if (!cbd) return;
    const rows: (string | number)[][] = [
      ['BrainSpark — PCBA Should-Cost Breakdown (CBD)'],
      [`Region: ${cbd.meta.regionLabel}`, `Volume: ${cbd.meta.volume.toLocaleString()}/yr`, `Test: ${cbd.meta.testStrategy}`, `RTY: ${cbd.rty}%`],
      [],
      ['Tier', 'Cost line', '£/board', '% of landed', 'Basis'],
      ...cbd.lines.map(l => [l.tier, l.label, l.value, l.pct, l.basis]),
      [],
      ['', 'EX-WORKS', cbd.exWorks], ['', 'LANDED', cbd.landed],
      [],
      ['Stations'], ['Station', 'Cycle s', '£/hr', '£/board'],
      ...cbd.stations.map(s => [s.label, s.cycleSec, s.mhr, s.cost]),
      [],
      ['NRE & tooling'], ['Item', '£', 'Amortisation qty', '£/board'],
      ...cbd.nre.map(n => [n.label, n.amount, n.amortVolume, n.perBoard]),
      [],
      ['Assumptions'],
      [hasOv ? `User-overridden drivers: ${JSON.stringify(ov)}` : 'All drivers derived from the standard engine (no overrides).'],
      ['Engineering estimate — not a supplier quote. Derived defaults carry research-prior uncertainty.'],
    ];
    void downloadXlsx('BrainSpark_PCB_CBD_ShouldCost.xlsx', [{ name: 'CBD Should-Cost', rows }]);
  }

  const inpS = 'w-20 bg-navy-800 border rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-500/40';
  const bcls = (set: boolean) => `${inpS} ${set ? 'border-gold-500/50 text-gold-200' : 'border-white/10'}`;
  const Grp = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      <button onClick={() => setGroup(g => g === id ? '' : id)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">
        {title} <ChevronDown size={13} className={`transition-transform ${group === id ? 'rotate-180' : ''}`} />
      </button>
      {group === id && <div className="px-3 pb-3 pt-1 space-y-2">{children}</div>}
    </div>
  );
  const F = ({ grp, k, label, unit, derived, step = 0.1 }: { grp: string; k: string; label: string; unit: string; derived: number; step?: number }) => (
    <label className="flex items-center gap-2 text-[11.5px] text-slate-400">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSet(grp, k) ? 'bg-gold-400' : 'bg-slate-600'}`} title={isSet(grp, k) ? 'Your value' : 'Derived from the standard engine'} />
      <span className="flex-1">{label}</span>
      <input type="number" step={step} value={flatVal(grp, k, derived)} onChange={e => setFlat(grp, k, e.target.value)} className={bcls(isSet(grp, k))} />
      <span className="w-10 text-slate-600">{unit}</span>
    </label>
  );

  if (!token) return null;
  return (
    <div className="bg-navy-900 border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-white font-semibold text-sm">
          <SlidersHorizontal size={15} className="text-teal-400" /> Detailed engine — manual should-costing (CBD)
          <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && cbd && (
          <div className="flex items-center gap-2">
            {hasOv
              ? <span className="text-[10.5px] font-bold text-gold-300 bg-gold-500/10 border border-gold-500/25 rounded-full px-2 py-0.5">custom drivers</span>
              : <span className="text-[10.5px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5" title={`Simple £${cbd.parity.simpleTotal} vs detailed £${cbd.parity.detailedTotal}`}>matches standard ±{Math.abs(cbd.parity.deltaPct)}%</span>}
            {hasOv && <button onClick={() => setOv({})} title="Reset every driver to its derived value" className="text-slate-500 hover:text-white"><RotateCcw size={13} /></button>}
            <button onClick={exportCbd} className="text-xs px-2.5 py-1 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 flex items-center gap-1"><Download size={11} /> CBD sheet</button>
          </div>
        )}
      </div>
      {!open && <p className="text-slate-500 text-xs mt-1.5">Open the full industry-standard driver tree — cycle times, machine rates, per-stage yield, NRE amortisation, overhead pools — pre-filled from the standard estimate; override anything you know.</p>}

      {open && (
        <div className="mt-3 space-y-3">
          {err && <p className="text-danger-300 text-xs">{err}</p>}
          {busy && !cbd && <p className="text-slate-500 text-xs">Deriving drivers…</p>}
          {cbd && (
            <>
              {/* CBD waterfall */}
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <table className="w-full text-[11.5px]">
                  <thead><tr className="text-slate-500 text-left bg-white/3">
                    <th className="px-2.5 py-1.5 font-medium w-8">Tier</th><th className="px-2 py-1.5 font-medium">Cost line</th>
                    <th className="px-2 py-1.5 font-medium text-right">£/board</th><th className="px-2 py-1.5 font-medium text-right w-12">%</th>
                  </tr></thead>
                  <tbody>
                    {cbd.lines.map((l, i) => (
                      <tr key={i} className="border-t border-white/5" title={l.basis}>
                        <td className="px-2.5 py-1 text-slate-600 font-bold">{l.tier}</td>
                        <td className="px-2 py-1 text-slate-300">{l.label}</td>
                        <td className="px-2 py-1 text-right font-mono text-slate-200">{l.value.toFixed(3)}</td>
                        <td className="px-2 py-1 text-right text-slate-500">{l.pct}%</td>
                      </tr>
                    ))}
                    <tr className="border-t border-white/15 font-semibold"><td /><td className="px-2 py-1.5 text-slate-200">Ex-works</td><td className="px-2 py-1.5 text-right font-mono text-white">£{cbd.exWorks.toFixed(2)}</td><td /></tr>
                    <tr className="font-bold"><td /><td className="px-2 py-1.5 text-teal-300">Landed / delivered</td><td className="px-2 py-1.5 text-right font-mono text-teal-300">£{cbd.landed.toFixed(2)}</td><td /></tr>
                  </tbody>
                </table>
              </div>
              {busy && <p className="text-slate-600 text-[10.5px]">Recomputing…</p>}

              {/* Driver groups */}
              {drivers && (
                <div className="space-y-2">
                  <Grp id="mat" title="Material & overheads on material">
                    <F grp="material" k="attritionPct" label="Component attrition" unit="%" derived={drivers.material.attritionPct} />
                    <F grp="material" k="materialOhPct" label="Material overhead (procurement, inspection, stores)" unit="%" derived={drivers.material.materialOhPct} />
                    <F grp="material" k="consumablesPerBoard" label="Consumables (paste, flux, coating) — not estimated by default" unit="£" derived={drivers.material.consumablesPerBoard} step={0.01} />
                  </Grp>
                  <Grp id="fab" title="Bare PCB">
                    <F grp="fab" k="ratePerCm2" label="Fab rate" unit="£/cm²" derived={drivers.fab.ratePerCm2} step={0.001} />
                    <F grp="fab" k="finishMult" label="Surface-finish multiplier" unit="×" derived={drivers.fab.finishMult} step={0.05} />
                    <F grp="fab" k="panelUtil" label="Panel utilisation" unit="0-1" derived={drivers.fab.panelUtil} step={0.05} />
                  </Grp>
                  <Grp id="stn" title="Stations — cycle time & machine-hour rates">
                    {drivers.stations.map(st => (
                      <div key={st.id} className="space-y-1">
                        <div className="flex items-center gap-2 text-[11.5px] text-slate-400">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(isSetN('stations', st.id, 'cycleSec') || isSetN('stations', st.id, 'mhr')) ? 'bg-gold-400' : 'bg-slate-600'}`} />
                          <span className="flex-1">{st.label}{st.detail ? <span className="text-slate-600"> · {st.detail}</span> : null}</span>
                          <input type="number" step={0.5} value={nestedVal('stations', st.id, 'cycleSec', st.cycleSec)} onChange={e => setNested('stations', st.id, 'cycleSec', e.target.value)} className={bcls(isSetN('stations', st.id, 'cycleSec'))} title="Cycle seconds per board" />
                          <span className="text-slate-600">s</span>
                          <input type="number" step={1} value={nestedVal('stations', st.id, 'mhr', st.mhr)} onChange={e => setNested('stations', st.id, 'mhr', e.target.value)} className={bcls(isSetN('stations', st.id, 'mhr'))} title="Fully-burdened machine-hour rate" />
                          <span className="text-slate-600">£/hr</span>
                          <button onClick={() => setMhrFor(m => m === st.id ? '' : st.id)} className="text-teal-400 hover:text-teal-300 text-[10.5px] font-semibold whitespace-nowrap">build-up</button>
                        </div>
                        {mhrFor === st.id && (
                          <div className="ml-3.5 p-2.5 rounded-lg bg-white/4 border border-white/8 grid grid-cols-2 gap-2">
                            {([['investment', 'Line investment £'], ['deprYears', 'Depreciation yrs'], ['operators', 'Operators/line'], ['labourRate', 'Labour £/hr'], ['productiveHoursYr', 'Productive hrs/yr']] as const).map(([k, lbl]) => (
                              <label key={k} className="text-[10.5px] text-slate-500">{lbl}
                                <input type="number" value={mhrIn[k]} onChange={e => setMhrIn(p => ({ ...p, [k]: e.target.value }))} className={`${inpS} border-white/10 w-full mt-0.5`} />
                              </label>
                            ))}
                            <button onClick={() => void applyMhr(st.id)} className="col-span-2 text-[11px] py-1.5 rounded-lg bg-teal-600/80 hover:bg-teal-500 text-white font-medium">Compute & apply MHR</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </Grp>
                  <Grp id="yld" title={`Yield — rolled throughput (RTY ${cbd.rty}%)`}>
                    <F grp="yieldD" k="fpyPrintPct" label="FPY — paste print" unit="%" derived={drivers.yieldD.fpyPrintPct} />
                    <F grp="yieldD" k="fpyPlacePct" label="FPY — placement" unit="%" derived={drivers.yieldD.fpyPlacePct} />
                    <F grp="yieldD" k="fpyReflowPct" label="FPY — reflow" unit="%" derived={drivers.yieldD.fpyReflowPct} />
                    <F grp="yieldD" k="fpyTestPct" label="FPY — test fallout" unit="%" derived={drivers.yieldD.fpyTestPct} />
                    <F grp="yieldD" k="reworkSharePct" label="Failures reworked (vs scrapped)" unit="%" derived={drivers.yieldD.reworkSharePct} step={5} />
                    <F grp="yieldD" k="reworkMin" label="Rework time" unit="min" derived={drivers.yieldD.reworkMin} step={1} />
                    <F grp="yieldD" k="reworkRatePerHr" label="Rework rate" unit="£/hr" derived={drivers.yieldD.reworkRatePerHr} step={1} />
                  </Grp>
                  <Grp id="nre" title="NRE & tooling amortisation">
                    {drivers.nre.map(n => (
                      <div key={n.id} className="flex items-center gap-2 text-[11.5px] text-slate-400">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(isSetN('nre', n.id, 'amount') || isSetN('nre', n.id, 'amortVolume')) ? 'bg-gold-400' : 'bg-slate-600'}`} />
                        <span className="flex-1">{n.label}</span>
                        <input type="number" step={100} value={nestedVal('nre', n.id, 'amount', n.amount)} onChange={e => setNested('nre', n.id, 'amount', e.target.value)} className={bcls(isSetN('nre', n.id, 'amount'))} title="One-time cost £" />
                        <span className="text-slate-600">£ ÷</span>
                        <input type="number" step={1000} value={nestedVal('nre', n.id, 'amortVolume', n.amortVolume)} onChange={e => setNested('nre', n.id, 'amortVolume', e.target.value)} className={bcls(isSetN('nre', n.id, 'amortVolume'))} title="Amortisation quantity (e.g. programme lifetime volume)" />
                      </div>
                    ))}
                  </Grp>
                  <Grp id="ohd" title="Overheads, SG&A & profit">
                    <F grp="overheads" k="mfgOhPct" label="Manufacturing overhead (on conversion)" unit="%" derived={drivers.overheads.mfgOhPct} />
                    <F grp="overheads" k="sgaPct" label="SG&A" unit="%" derived={drivers.overheads.sgaPct} />
                    <F grp="overheads" k="profitPct" label="Profit" unit="%" derived={drivers.overheads.profitPct} />
                  </Grp>
                  <Grp id="log" title="Logistics, duty & packaging">
                    <F grp="belowLine" k="freightPct" label="Inbound freight (on material)" unit="%" derived={drivers.belowLine.freightPct} />
                    <F grp="belowLine" k="tariffPct" label="Duty / tariff" unit="%" derived={drivers.belowLine.tariffPct} />
                    <F grp="belowLine" k="packagingPerBoard" label="Packaging (not estimated by default)" unit="£" derived={drivers.belowLine.packagingPerBoard} step={0.01} />
                  </Grp>
                </div>
              )}
              <p className="text-[10.5px] text-slate-600">Slate dot = derived from the standard engine · gold dot = your value. Values you know beat any model default — that is the point of this mode.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
