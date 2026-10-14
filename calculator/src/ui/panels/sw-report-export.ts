/**
 * Report export on screen (360 report, Oct 2026): the report options (type, scope, body, the user's metadata) and the
 * one export path — request → model (src/engine/sw-report-model.ts) → skeleton pictures rasterised in this browser →
 * PDF (src/export/sw-report-pdf.ts) or Excel (src/export/sw-report-xlsx.ts). The header's "PDF report" / "Excel" buttons
 * use the same options (Vehicle by default). Everything typed here is printed as typed — nothing is invented.
 */
import { SW_REPORT_PROFILES, SW_BODY_TYPES, buildSWReportModel, type SWReportProfile, type SWBodyType, type SWReportModel } from '../../engine/sw-report-model.js';
import type { SWCategory, SWProgramResult } from '../../engine/sw-should-cost.js';
import type { SWReportOptions } from '../../export/sw-report-request.js';
import { buildSWReportRequest } from '../../export/sw-report-request.js';
import type { RasterImage } from '../../export/svg-raster.js';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

/** The options form (static part). The domain / module pickers are filled from the result by `fillReportScope`. */
export function reportOptionsHTML(): string {
  const prof = (Object.keys(SW_REPORT_PROFILES) as SWReportProfile[]).map(k => `<option value="${k}">${esc(SW_REPORT_PROFILES[k].label)}</option>`).join('');
  const body = (Object.keys(SW_BODY_TYPES) as SWBodyType[]).map(k => `<option value="${k}">${esc(SW_BODY_TYPES[k])}</option>`).join('');
  return `<div class="sw-rep" id="sw-rep" data-no-live>
    <div class="sw-rep-grid">
      <div class="sw-rep-f"><label class="sw-label" for="sw-rep-profile">Report type</label>
        <select id="sw-rep-profile" class="sw-input">${prof}</select>
        <p class="sw-rep-hint" id="sw-rep-what">${esc(SW_REPORT_PROFILES.vehicle.what)}</p></div>
      <div class="sw-rep-f"><label class="sw-label" for="sw-rep-body">Body for the vehicle skeleton</label>
        <select id="sw-rep-body" class="sw-input">${body}</select>
        <p class="sw-rep-hint">A schematic top view: parts are placed by vehicle zone.</p></div>
    </div>
    <fieldset class="sw-rep-scope" id="sw-rep-domains" hidden><legend class="sw-label">Domains in the report</legend><div class="sw-rep-checks" id="sw-rep-domain-list"></div></fieldset>
    <div class="sw-rep-scope" id="sw-rep-modules-wrap" hidden><label class="sw-label" for="sw-rep-modules">Modules in the report (Ctrl / ⌘ to pick several)</label>
      <select id="sw-rep-modules" class="sw-input" multiple size="8"></select></div>
    <div class="sw-rep-grid">
      <div class="sw-rep-f"><label class="sw-label" for="sw-rep-by">Prepared by</label><input id="sw-rep-by" class="sw-input" type="text" maxlength="80" autocomplete="name"></div>
      <div class="sw-rep-f"><label class="sw-label" for="sw-rep-for">Prepared for</label><input id="sw-rep-for" class="sw-input" type="text" maxlength="80"></div>
      <div class="sw-rep-f"><label class="sw-label" for="sw-rep-ref">Document reference</label><input id="sw-rep-ref" class="sw-input" type="text" maxlength="60"></div>
      <div class="sw-rep-f"><label class="sw-label" for="sw-rep-conf">Confidentiality label</label><input id="sw-rep-conf" class="sw-input" type="text" maxlength="60" placeholder="e.g. Confidential"></div>
    </div>
    <p class="sw-rep-status" id="sw-rep-status" role="status" aria-live="polite"></p>
  </div>`;
}

export const REPORT_OPTIONS_CSS = `
.sw-rep{display:flex;flex-direction:column;gap:10px;margin:4px 0 12px}
.sw-rep-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.sw-rep-f{display:flex;flex-direction:column;gap:4px;min-width:0}
.sw-rep-hint{margin:0;font-size:.7rem;color:var(--sw-text-secondary)}
.sw-rep-scope{border:1px solid var(--sw-border);border-radius:8px;padding:8px 10px;margin:0}
.sw-rep-checks{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.78rem}
.sw-rep-checks label{display:inline-flex;gap:6px;align-items:center;color:var(--sw-text-body)}
.sw-rep-status{margin:0;font-size:.74rem;color:var(--sw-text-secondary);min-height:1.2em}
`;

/** Fill the domain and module pickers from the current result (keeps what was ticked). */
export function fillReportScope(root: ParentNode, result: SWProgramResult): void {
  const dl = root.querySelector<HTMLElement>('#sw-rep-domain-list');
  const ms = root.querySelector<HTMLSelectElement>('#sw-rep-modules');
  if (!dl || !ms) return;
  const ticked = new Set(Array.from(dl.querySelectorAll<HTMLInputElement>('input:checked')).map(i => i.value));
  const cats = [...new Map(result.modules.map(m => [m.category, m.categoryLabel])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  dl.innerHTML = cats.map(([c, l]) => `<label><input type="checkbox" value="${esc(c)}"${ticked.has(c) ? ' checked' : ''}> ${esc(l)}</label>`).join('');
  const picked = new Set(Array.from(ms.selectedOptions).map(o => o.value));
  ms.innerHTML = cats.map(([c, l]) => `<optgroup label="${esc(l)}">${result.modules.filter(m => m.category === c)
    .map(m => `<option value="${esc(m.moduleId)}"${picked.has(m.moduleId) ? ' selected' : ''}>${esc(m.moduleName)}</option>`).join('')}</optgroup>`).join('');
}

/** Show the scope picker the chosen report needs. */
export function wireReportOptions(root: ParentNode): void {
  const sel = root.querySelector<HTMLSelectElement>('#sw-rep-profile');
  const sync = () => {
    const p = (sel?.value ?? 'vehicle') as SWReportProfile;
    const d = root.querySelector<HTMLElement>('#sw-rep-domains'), m = root.querySelector<HTMLElement>('#sw-rep-modules-wrap');
    if (d) d.hidden = p !== 'domain';
    if (m) m.hidden = p !== 'module';
    const w = root.querySelector('#sw-rep-what');
    if (w) w.textContent = `${SW_REPORT_PROFILES[p].what} For: ${SW_REPORT_PROFILES[p].reader}.`;
  };
  sel?.addEventListener('change', sync);
  sync();
}

export function readReportOptions(root: ParentNode | null): SWReportOptions {
  const v = (id: string) => (root?.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value ?? '').trim();
  const profile = (v('sw-rep-profile') || 'vehicle') as SWReportProfile;
  const domains = Array.from(root?.querySelectorAll<HTMLInputElement>('#sw-rep-domain-list input:checked') ?? []).map(i => i.value as SWCategory);
  const ms = root?.querySelector<HTMLSelectElement>('#sw-rep-modules');
  const moduleIds = ms ? Array.from(ms.selectedOptions).map(o => o.value) : [];
  return {
    profile, domains: profile === 'domain' ? domains : undefined, moduleIds: profile === 'module' ? moduleIds : undefined,
    bodyType: (v('sw-rep-body') || 'suv') as SWBodyType,
    meta: { preparedBy: v('sw-rep-by') || undefined, preparedFor: v('sw-rep-for') || undefined, reference: v('sw-rep-ref') || undefined, confidentiality: v('sw-rep-conf') || undefined },
  };
}

/** Problems with the chosen options (a domain / module report needs a scope). */
export function reportOptionProblem(o: SWReportOptions): string | null {
  if (o.profile === 'domain' && !o.domains?.length) return 'Tick at least one domain for a domain report.';
  if (o.profile === 'module' && !o.moduleIds?.length) return 'Pick at least one module for a module report.';
  return null;
}

export type ReportContext = Omit<Parameters<typeof buildSWReportRequest>[1], 'options'>;

/** Request → model; the pictures rasterised in this browser. */
export async function prepareReport(result: SWProgramResult, options: SWReportOptions, ctx: ReportContext): Promise<{ model: SWReportModel; images: Map<string, RasterImage> }> {
  const model = buildSWReportModel(result, buildSWReportRequest(result, { ...ctx, options }));
  const [{ reportImageSpecs }, { rasteriseSvg }] = await Promise.all([import('../../export/sw-report-skeleton.js'), import('../../export/svg-raster.js')]);
  const images = new Map<string, RasterImage>();
  for (const spec of reportImageSpecs(model)) {
    try { images.set(spec.key, await rasteriseSvg(spec)); } catch { /* the renderer prints a labelled placeholder */ }
  }
  return { model, images };
}
