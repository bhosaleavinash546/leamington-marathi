/**
 * "Excel report" on the PCB photo results: the six-tab workbook (src/export/pcb-workbook.ts).
 * Browser glue only — photos are downscaled for the sheet (they are shown ~330 px wide; the
 * analysis keeps them at up to 2,576 px), the workbook is built in a lazy chunk and downloaded.
 */
import type { PcbWorkbookInput } from '../../export/pcb-workbook.js';
import { exportFilename } from '../../export/filename.js';

type Photo = { label: string; dataUrl: string; w: number; h: number };

/** A photo re-encoded as JPEG with its long edge at most `maxEdge` px. */
export async function downscalePhoto(p: Photo, maxEdge = 900): Promise<Photo> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = p.dataUrl; });
  const k = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); if (!ctx) return p;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  return { label: p.label, dataUrl: cv.toDataURL('image/jpeg', 0.85), w, h };
}

export async function exportPcbWorkbook(inp: Omit<PcbWorkbookInput, 'photos'> & { photos: Photo[] }): Promise<void> {
  const photos = (await Promise.all(inp.photos.map(p => downscalePhoto(p).catch(() => null)))).filter((p): p is Photo => !!p);
  const { buildPcbWorkbook } = await import('../../export/pcb-workbook.js');
  const bytes = await buildPcbWorkbook({ ...inp, photos });
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = exportFilename('pcb-should-cost', inp.partName || inp.analysis.partName || 'pcb', 'xlsx');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
