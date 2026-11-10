/**
 * General tolerances: the standard and class as written (ISO 2768, ISO 8062-3, ISO 22081, DIN 7168, DIN 16742 / 16901,
 * ISO 20457, ISO 13920, ASME Y14.5 block tolerances), and the class read out of it.
 */
import type { DraftParameter, ExtractContext } from '../types.js';
import { buildUnits, draft, type TextUnit } from './common.js';

const ISO2768_LINEAR: Record<string, string> = { f: 'fine', m: 'medium', c: 'coarse', v: 'very coarse' };

export interface GeneralToleranceRead { written: string; index: number; linearClass?: string; geometricClass?: string; castingGrade?: string; standard: string }

/** Every general-tolerance statement in a piece of text. */
export function findGeneralTolerances(text: string): GeneralToleranceRead[] {
  const out: GeneralToleranceRead[] = [];
  let m: RegExpExecArray | null;
  // ISO 2768-mK, DIN ISO 2768-1 m, ISO 2768 - f H, ISO 2768-mK-E
  const iso2768 = /\b((?:DIN\s?)?(?:EN\s?)?ISO\s?2768)(?:\s?-\s?[12])?\s?[-–:\s]\s?([fmcv])\s?([HKL])?(?:\s?-\s?E)?(?![A-Za-z])/g;
  while ((m = iso2768.exec(text))) out.push({ written: m[0].trim(), index: m.index, standard: 'ISO 2768', linearClass: ISO2768_LINEAR[m[2]], ...(m[3] ? { geometricClass: m[3] } : {}) });
  // geometrical class alone: ISO 2768-2 K / ISO 2768-K
  const iso2768g = /\b(?:DIN\s?)?(?:EN\s?)?ISO\s?2768(?:\s?-\s?2)?\s?[-–:\s]\s?([HKL])(?![A-Za-z])/g;
  while ((m = iso2768g.exec(text))) if (!out.some(o => Math.abs(o.index - m!.index) < 4)) out.push({ written: m[0].trim(), index: m.index, standard: 'ISO 2768', geometricClass: m[1] });
  // ISO 8062-3 DCTG 8 / GCTG 5 ; ISO 8062 CT9
  const iso8062 = /\b((?:DIN\s?)?(?:EN\s?)?ISO\s?8062(?:-[34])?)\b[\s:,-]*((?:(?:DCTG|GCTG|RMAG|CT|GCT)\s?-?\s?[A-K\d]{1,2}[\s,/-]*)+)/g;
  while ((m = iso8062.exec(text))) {
    const d = /\b(?:DCTG|CT)\s?-?\s?(\d{1,2})\b/.exec(m[2]);
    out.push({ written: m[0].trim().replace(/[\s,/-]+$/, ''), index: m.index, standard: 'ISO 8062', ...(d ? { castingGrade: `DCTG ${d[1]}` } : {}) });
  }
  const dctgAlone = /\b(DCTG\s?-?\s?\d{1,2})\b/g;
  while ((m = dctgAlone.exec(text))) if (!out.some(o => m!.index >= o.index && m!.index <= o.index + o.written.length)) out.push({ written: m[0], index: m.index, standard: 'ISO 8062', castingGrade: m[1].replace(/\s?-?\s?(\d)/, ' $1') });
  // standards whose class is written beside them
  const others: Array<[RegExp, string]> = [
    [/\b(?:DIN\s?)?(?:EN\s?)?ISO\s?22081\b(?:[\s:,-]*(?:±\s?)?\d+(?:[.,]\d+)?(?:\s?mm)?)?/g, 'ISO 22081'],
    [/\bDIN\s?7168(?:\s?-\s?[12])?\s?[-–:\s]?\s?(?:sg|f|m|g)?(?:\s?-?\s?[A-DR-U])?\b/g, 'DIN 7168'],
    [/\bDIN\s?16742\b(?:[\s:,-]*TG\s?\d)?/g, 'DIN 16742'],
    [/\bDIN\s?16901\b(?:[\s:,-]*\d{3})?/g, 'DIN 16901'],
    [/\b(?:DIN\s?)?(?:EN\s?)?ISO\s?20457\b(?:[\s:,-]*TG\s?\d)?/g, 'ISO 20457'],
    [/\b(?:DIN\s?)?(?:EN\s?)?ISO\s?13920\s?[-–:\s]?\s?[A-D][E-H]?\b/g, 'ISO 13920'],
    [/\b(?:DIN\s?)?(?:EN\s?)?ISO\s?3302(?:-[12])?\s?[-–:\s]?\s?(?:(?:CLASS|KLASSE)\s?)?[MEXLN]\s?[1-4]\b/gi, 'ISO 3302'],
    [/\b(?:DIN\s?)?EN\s?(?:755-[3-9]|12020-2|10243-[12](?:\s?[-–:\s]?\s?[FE]\b)?|10029|10051|10131|10140|10143|485-[34]|754-[3-8])\b/g, 'EN product tolerance standard'],
    [/\bDIN\s?1688\b(?:[\s:,-]*GT[AB]?\s?\d{1,2}(?:\/\d)?)?/g, 'DIN 1688'],
  ];
  // ASME model-based practice: one profile tolerance "applies to all untoleranced surfaces"
  const untol = /(?:[.,]\d+\s)?[^.;]*\b(?:APPLIES\s+TO\s+ALL\s+UNTOLERANCED|ALL\s+UNTOLERANCED\s+(?:SURFACES|FEATURES|DIMENSIONS))[^.;]*/gi;
  while ((m = untol.exec(text))) out.push({ written: m[0].trim(), index: m.index, standard: 'ASME Y14.5 general profile' });
  for (const [re, standard] of others) while ((m = re.exec(text))) out.push({ written: m[0].trim().replace(/[\s,:-]+$/, ''), index: m.index, standard });
  return out.sort((a, b) => a.index - b.index);
}

/** ASME-style block tolerances: "X.X ±0.1", ".XX ±.01", "ANGLES ±0.5°", "LINEAR ±0.25". */
export function findBlockTolerances(text: string): string[] {
  const out: string[] = [];
  const re = /(?:(?<![A-Za-z0-9])(?:X{1,2})?[.,]X{1,4}\b|\bX{1,3}\b(?=\s*(?:=|±))|\b(?:ANGLES?|ANGULAR|LINEAR|FRACTIONAL|WINKEL|DECIMALS?|\d\s?PLACE(?:\s?DECIMALS?)?)\b)\s*[:=]?\s*±\s?\d*[.,]?\d+\s?(?:°|mm|MM|IN)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[0].replace(/\s+/g, ' ').trim());
  return out;
}

export function extractGeneralTolerance(ctx: ExtractContext): DraftParameter[] {
  const units = buildUnits(ctx);
  const out: DraftParameter[] = [];
  const rank = (u: TextUnit): number => (u.context === 'title:generalTolerance' ? 0 : u.region === 'title-block' ? 1 : u.context === 'note' ? 2 : 3);
  const reads: Array<{ r: GeneralToleranceRead; u: TextUnit }> = [];
  const blocks: Array<{ t: string; u: TextUnit }> = [];
  for (const u of units) {
    for (const r of findGeneralTolerances(u.text)) reads.push({ r, u });
    for (const t of findBlockTolerances(u.text)) blocks.push({ t, u });
  }
  reads.sort((a, b) => rank(a.u) - rank(b.u) || a.u.sheet - b.u.sheet || a.u.bbox[1] - b.u.bbox[1] || a.r.index - b.r.index);
  // the dimensional general tolerance: the first statement that carries a class or names a dimensional standard
  const dimensional = reads;
  const seenWritten = new Set<string>();
  const main = dimensional[0];
  if (main) {
    const same = dimensional.filter(x => x.u === main.u);
    const written = [...new Set(same.map(x => x.r.written))].join('; ');
    const differing = [...new Set(dimensional.filter(x => x.u !== main.u && x.r.written.replace(/\s/g, '') !== main.r.written.replace(/\s/g, '') && x.r.standard === main.r.standard).map(x => x.r.written))];
    out.push(draft('tolerance.general', written, main.u, {
      raw: main.u.text, at: main.r.written,
      ...(differing.length ? { status: 'needs-validation' as const, note: `The drawing also states: ${differing.slice(0, 4).join('; ')}.` } : {}),
    }));
    seenWritten.add(written);
    const cls = same.find(x => x.r.linearClass);
    if (cls) {
      out.push(draft('tolerance.generalClass', cls.r.linearClass!, cls.u, {
        raw: cls.r.written, at: cls.r.written, kind: 'interpreted',
        note: `ISO 2768-1 class letter${cls.r.geometricClass ? `; ISO 2768-2 geometrical class ${cls.r.geometricClass}` : ''}.`,
      }));
    }
    const cast = dimensional.find(x => x.r.castingGrade);
    if (cast) out.push(draft('tolerance.castingGrade', cast.r.castingGrade!, cast.u, { raw: cast.r.written, at: cast.r.written, kind: 'interpreted', note: 'ISO 8062-3 dimensional casting tolerance grade.' }));
  }
  if (!main && !blocks.length) {
    const cell = units.find(u => u.context === 'title:generalTolerance' && u.text && !/^[-–—/.\s]*$/.test(u.text));
    if (cell) out.push(draft('tolerance.general', cell.text, cell, { status: 'needs-validation', note: 'The general-tolerance cell holds text that matches no tolerance standard known to the reader: reported as written, not interpreted.' }));
  }
  if (blocks.length) {
    const u0 = blocks.sort((a, b) => rank(a.u) - rank(b.u) || a.u.bbox[1] - b.u.bbox[1])[0].u;
    const near = blocks.filter(b => b.u.sheet === u0.sheet && Math.abs(b.u.bbox[1] - u0.bbox[1]) < 120 && Math.abs(b.u.bbox[0] - u0.bbox[0]) < 260);
    const written = [...new Set(near.map(b => b.t))].join('; ');
    if (!main) out.push(draft('tolerance.general', written, u0, { raw: near.map(b => b.u.text).filter((t, i, a) => a.indexOf(t) === i).join(' | '), at: near[0].t, note: 'Block tolerances by number of decimal places.' }));
    else if (!seenWritten.has(written)) {
      const p = out.find(o => o.name === 'tolerance.general');
      if (p) p.note = [p.note, `Block tolerances also stated: ${written}.`].filter(Boolean).join(' ');
    }
  }
  return out;
}
