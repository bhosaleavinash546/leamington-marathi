/**
 * Native Excel charts for an ExcelJS workbook.
 *
 * ExcelJS writes styles, images and formulas but no charts. A picture of a chart would be
 * blurry, uneditable and blind to the numbers beside it, so the charts are real DrawingML
 * chart parts, added to the saved .xlsx: each chart's series point at the sheet's own cells
 * (with cached values, so it draws before any recalculation), and sits in the sheet's drawing
 * next to the logo image ExcelJS already placed there.
 *
 *   const buf = await wb.xlsx.writeBuffer();
 *   const out = await addCharts(buf, [{ sheet: 'Summary', kind: 'doughnut', ... }]);
 *
 * Works in the browser and in Node (JSZip). Every sheet that gets a chart must already have a
 * drawing (an image) — the report puts the logo on every sheet, so it always does.
 */
import JSZip from 'jszip';

export interface ChartSeries {
  name: string;
  /** Category labels and values: cell ranges ("'Cost Breakdown'!$B$8:$B$16") and their current values. */
  catRef: string; cats: string[];
  valRef: string; vals: number[];
  /** Hex colours (no '#'): one per point (doughnut, bar with varyColors) or one for the series. */
  colors?: string[]; color?: string;
  /** Line charts: a dash style, so lines differ without colour. */
  dash?: 'solid' | 'dash' | 'sysDot';
  /** Scatter charts: numeric x values (catRef / cats are ignored). */
  xRef?: string; xs?: number[];
}
export interface ChartSpec {
  sheet: string;
  kind: 'doughnut' | 'bar' | 'column' | 'line' | 'scatter';
  /** Scatter: a log10 x axis (volumes 100 → 250,000 spaced to scale), and its number format. */
  logX?: boolean; xNumFmt?: string;
  /** Scatter: the x-axis range (the data's own, so a log axis does not run on to the next decade). */
  xMin?: number; xMax?: number;
  title?: string;
  series: ChartSeries[];
  /** Anchor: zero-based columns / rows, from (col,row) to (col,row) exclusive. */
  from: { col: number; row: number }; to: { col: number; row: number };
  /** Number format for data labels / value axis, e.g. '£#,##0.00'. */
  numFmt?: string;
  /** Doughnut hole size % (10–90). */
  holeSize?: number;
  /** Data labels: 'percent' (doughnut), 'value', or none. */
  labels?: 'percent' | 'value' | 'none';
  legend?: 'r' | 'b' | 'none';
  /** Bar charts: categories in sheet order top-to-bottom. */
  reverseCats?: boolean;
  /** Category axis title / value axis title (bar, column, line). */
  catTitle?: string; valTitle?: string;
  /** Bar / column: stack the series. */
  stacked?: boolean;
  /** Doughnut: no label on a slice below this share (0.03 = 3 %). */
  hideLabelBelow?: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const FONT = 'Arial';

const solid = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
const txPr = (sz: number, color = '3A4356', bold = false) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}">${solid(color)}<a:latin typeface="${FONT}"/><a:cs typeface="${FONT}"/></a:defRPr></a:pPr><a:endParaRPr lang="en-GB"/></a:p></c:txPr>`;
const richTitle = (t: string, sz = 1100) =>
  `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="1">${solid('16325C')}<a:latin typeface="${FONT}"/></a:defRPr></a:pPr><a:r><a:rPr lang="en-GB" sz="${sz}" b="1">${solid('16325C')}<a:latin typeface="${FONT}"/></a:rPr><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;

function strRef(ref: string, vals: string[]): string {
  return `<c:strRef><c:f>${esc(ref)}</c:f><c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef>`;
}
function numRef(ref: string, vals: number[], fmt: string): string {
  return `<c:numRef><c:f>${esc(ref)}</c:f><c:numCache><c:formatCode>${esc(fmt)}</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${Number.isFinite(v) ? v : 0}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`;
}

function dLbls(spec: ChartSpec, pos?: string, s?: ChartSeries): string {
  const mode = spec.labels ?? 'none';
  const total = s ? s.vals.reduce((t, v) => t + Math.max(0, v), 0) : 0;
  const hidden = s && spec.hideLabelBelow && total > 0
    ? s.vals.map((v, i) => (v / total < spec.hideLabelBelow! ? `<c:dLbl><c:idx val="${i}"/><c:delete val="1"/></c:dLbl>` : '')).join('') : '';
  if (mode === 'none') return '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>';
  const fmt = mode === 'percent' ? '0%' : (spec.numFmt ?? 'General');
  return `<c:dLbls>${hidden}<c:numFmt formatCode="${esc(fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, mode === 'percent' ? 'FFFFFF' : '3A4356', true)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="${mode === 'value' ? 1 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${mode === 'percent' ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`;
}

function seriesXml(spec: ChartSpec, s: ChartSeries, i: number): string {
  const fmt = spec.numFmt ?? 'General';
  const pts = (s.colors ?? []).map((col, p) => `<c:dPt><c:idx val="${p}"/><c:bubble3D val="0"/><c:spPr>${solid(col)}<a:ln w="12700">${solid('FFFFFF')}</a:ln></c:spPr></c:dPt>`).join('');
  if (spec.kind === 'scatter') {
    const col = s.color ?? '1D6FB8';
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx><c:spPr><a:ln w="28575" cap="rnd">${solid(col)}<a:prstDash val="${s.dash ?? 'solid'}"/><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${solid(col)}<a:ln>${solid('FFFFFF')}</a:ln></c:spPr></c:marker>${dLbls(spec, undefined, s)}<c:xVal>${numRef(s.xRef ?? '', s.xs ?? [], spec.xNumFmt ?? '#,##0')}</c:xVal><c:yVal>${numRef(s.valRef, s.vals, fmt)}</c:yVal><c:smooth val="0"/></c:ser>`;
  }
  const sp = spec.kind === 'line'
    ? `<c:spPr><a:ln w="28575" cap="rnd">${solid(s.color ?? '1D6FB8')}<a:prstDash val="${s.dash ?? 'solid'}"/><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr>${solid(s.color ?? '1D6FB8')}<a:ln>${solid('FFFFFF')}</a:ln></c:spPr></c:marker>`
    : s.color ? `<c:spPr>${solid(s.color)}</c:spPr>` : '';
  const lblPos = spec.kind === 'bar' || spec.kind === 'column' ? (spec.stacked ? 'ctr' : 'outEnd') : spec.kind === 'line' ? 't' : undefined;
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>${sp}${spec.kind === 'bar' || spec.kind === 'column' ? '<c:invertIfNegative val="0"/>' : ''}${pts}${dLbls(spec, lblPos, s)}<c:cat>${strRef(s.catRef, s.cats)}</c:cat><c:val>${numRef(s.valRef, s.vals, fmt)}</c:val>${spec.kind === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
}

function axes(spec: ChartSpec): string {
  const fmt = spec.numFmt ?? 'General';
  const isBar = spec.kind === 'bar';
  const grid = `<c:majorGridlines><c:spPr><a:ln w="6350">${solid('DCE3EE')}</a:ln></c:spPr></c:majorGridlines>`;
  const axTitle = (t?: string) => (t ? richTitle(t, 900) : '');
  const cat = `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="${isBar && spec.reverseCats ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${isBar ? 'l' : 'b'}"/>${axTitle(spec.catTitle)}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="6350">${solid('B8C2D3')}</a:ln></c:spPr>${txPr(900)}<c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const val = `<c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${isBar ? 'b' : 'l'}"/>${grid}${axTitle(spec.valTitle)}<c:numFmt formatCode="${esc(fmt.replace(/\.0+/, ''))}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, '686F7D')}<c:crossAx val="111"/><c:crosses val="${isBar && spec.reverseCats ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
  return cat + val;
}

export function chartXml(spec: ChartSpec): string {
  const ser = spec.series.map((s, i) => seriesXml(spec, s, i)).join('');
  let plot: string;
  if (spec.kind === 'scatter') {
    const grid = `<c:majorGridlines><c:spPr><a:ln w="6350">${solid('DCE3EE')}</a:ln></c:spPr></c:majorGridlines>`;
    const ax = (id: number, cross: number, pos: string, title: string | undefined, nf: string, log: boolean, min?: number, max?: number) =>
      `<c:valAx><c:axId val="${id}"/><c:scaling>${log ? '<c:logBase val="10"/>' : ''}<c:orientation val="minMax"/>${max != null ? `<c:max val="${max}"/>` : ''}${min != null ? `<c:min val="${min}"/>` : ''}</c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${grid}${title ? richTitle(title, 900) : ''}<c:numFmt formatCode="${esc(nf)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="6350">${solid('B8C2D3')}</a:ln></c:spPr>${txPr(900, '686F7D')}<c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
    plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${ser}<c:axId val="111"/><c:axId val="222"/></c:scatterChart>`
      + ax(111, 222, 'b', spec.catTitle, spec.xNumFmt ?? '#,##0', !!spec.logX, spec.xMin, spec.xMax) + ax(222, 111, 'l', spec.valTitle, (spec.numFmt ?? 'General').replace(/\.0+/, ''), false);
  } else if (spec.kind === 'doughnut') {
    plot = `<c:doughnutChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/><c:holeSize val="${spec.holeSize ?? 62}"/></c:doughnutChart>`;
  } else if (spec.kind === 'line') {
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/><c:axId val="111"/><c:axId val="222"/></c:lineChart>${axes(spec)}`;
  } else {
    plot = `<c:barChart><c:barDir val="${spec.kind === 'bar' ? 'bar' : 'col'}"/><c:grouping val="${spec.stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${ser}<c:gapWidth val="55"/>${spec.stacked ? '<c:overlap val="100"/>' : ''}<c:axId val="111"/><c:axId val="222"/></c:barChart>${axes(spec)}`;
  }
  const legend = (spec.legend ?? 'none') === 'none' ? ''
    : `<c:legend><c:legendPos val="${spec.legend}"/><c:overlay val="0"/>${txPr(900)}</c:legend>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace ${NS}><c:date1904 val="0"/><c:lang val="en-GB"/><c:roundedCorners val="0"/>
<c:chart>${spec.title ? richTitle(spec.title) : ''}<c:autoTitleDeleted val="${spec.title ? 0 : 1}"/><c:plotArea>${spec.kind === 'scatter'
    // An inner plot inset so the value-axis labels sit clear of the plot border.
    ? '<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.1"/><c:y val="0.13"/><c:w val="0.86"/><c:h val="0.62"/></c:manualLayout></c:layout>'
    : '<c:layout/>'}${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
<c:spPr>${solid('FFFFFF')}<a:ln><a:noFill/></a:ln></c:spPr>${txPr(900)}
</c:chartSpace>`;
}

function anchorXml(spec: ChartSpec, rid: string, id: number): string {
  const m = (c: number, r: number) => `<xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
  return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${m(spec.from.col, spec.from.row)}</xdr:from><xdr:to>${m(spec.to.col, spec.to.row)}</xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${esc(spec.title ?? `Chart ${id}`)}" descr="${esc(spec.title ?? 'Chart')}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

/** Sheet name → its worksheet part path, from workbook.xml and its rels. */
async function sheetParts(zip: JSZip): Promise<Map<string, string>> {
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)].map(m => [m[1], m[2]]));
  for (const m of rels.matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"/g)) target.set(m[2], m[1]);
  const out = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g)) {
    const t = target.get(m[2]); if (!t) continue;
    const name = m[1].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
    out.set(name, t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`);
  }
  return out;
}

/** Add the charts to a saved workbook. Returns the new file. */
export async function addCharts(xlsx: ArrayBuffer | Uint8Array, charts: ChartSpec[]): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(xlsx);
  const sheets = await sheetParts(zip);
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  let n = 0;
  for (const spec of charts) {
    const part = sheets.get(spec.sheet);
    if (!part) throw new Error(`addCharts: no sheet "${spec.sheet}"`);
    const dir = part.slice(0, part.lastIndexOf('/')), base = part.slice(part.lastIndexOf('/') + 1);
    const sRels = await zip.file(`${dir}/_rels/${base}.rels`)?.async('string');
    const dm = sRels && /Type="[^"]*\/drawing"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Type="[^"]*\/drawing"/.exec(sRels);
    const dTarget = dm ? (dm[1] ?? dm[2]) : null;
    if (!dTarget) throw new Error(`addCharts: sheet "${spec.sheet}" has no drawing (put an image on it first)`);
    const dPath = `xl/${dTarget.replace(/^\.\.\//, '')}`;
    const dDir = dPath.slice(0, dPath.lastIndexOf('/')), dBase = dPath.slice(dPath.lastIndexOf('/') + 1);
    n++;
    while (zip.file(`xl/charts/chart${n}.xml`)) n++;
    zip.file(`xl/charts/chart${n}.xml`, chartXml(spec));
    ct = ct.replace('</Types>', `<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
    const relsPath = `${dDir}/_rels/${dBase}.rels`;
    let dRels = (await zip.file(relsPath)?.async('string'))
      ?? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const rid = `rIdCvChart${n}`;
    dRels = dRels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/></Relationships>`);
    zip.file(relsPath, dRels);
    let dXml = await zip.file(dPath)!.async('string');
    if (!/xmlns:r=/.test(dXml.slice(0, 600))) dXml = dXml.replace('<xdr:wsDr ', '<xdr:wsDr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    if (!/xmlns:a=/.test(dXml.slice(0, 600))) dXml = dXml.replace('<xdr:wsDr ', '<xdr:wsDr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ');
    dXml = dXml.replace('</xdr:wsDr>', `${anchorXml(spec, rid, 1000 + n)}</xdr:wsDr>`);
    zip.file(dPath, dXml);
  }
  zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
