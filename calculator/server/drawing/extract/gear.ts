/** Gear data table: the rows the layout found, read by their labels (English and German). */
import type { DraftParameter, ExtractContext, TextLine } from '../types.js';
import { draft, normText, num, unitOfLines } from './common.js';

const FIRST_NUM = /-?(?:\d+(?:[.,]\d+)?|[.,]\d+)/;

export function extractGear(ctx: ExtractContext): DraftParameter[] {
  const out: DraftParameter[] = [];
  const byId = new Map(ctx.lines.map(l => [l.id, l]));
  for (const lay of ctx.layouts) {
    for (const t of lay.tables) {
      if (t.kind !== 'gear') continue;
      const done = new Set<string>();
      for (const row of t.rows) {
        if (done.has(row.label)) continue;
        const lines = row.lineIds.map(id => byId.get(id)).filter((l): l is TextLine => !!l);
        if (!lines.length) continue;
        const u = unitOfLines(lines, 'free');
        const value = normText(row.value, u.method);
        // a symbol column ("z", "mn", "α", "β", "b", "x") may stand between the label and the value: take the last number
        const nums = [...value.matchAll(new RegExp(FIRST_NUM.source, 'g'))].map(m => num(m[0]));
        const n = nums.length ? nums[nums.length - 1] : undefined;
        const raw = lines.map(l => l.text).join(' ');
        switch (row.label) {
          case 'teeth': if (n !== undefined && Number.isInteger(n) && n > 2) { out.push(draft('gear.teeth', n, u, { raw })); done.add(row.label); } break;
          case 'module': if (n !== undefined && n > 0 && n <= 50) { out.push(draft('gear.module', n, u, { unit: 'mm', raw })); done.add(row.label); } break;
          case 'pressureAngle': if (n !== undefined && n >= 10 && n <= 35) { out.push(draft('gear.pressureAngle', n, u, { unit: 'deg', raw })); done.add(row.label); } break;
          case 'helixAngle': {
            if (n !== undefined && n >= 0 && n <= 60) { out.push(draft('gear.helixAngle', n, u, { unit: 'deg', raw })); done.add(row.label); }
            const hand = /\b(LH|RH|LEFT|RIGHT|LINKS|RECHTS)\b/i.exec(value);
            if (hand && !done.has('helixHand')) { out.push(draft('gear.helixHand', /^(LH|LEFT|LINKS)$/i.test(hand[1]) ? 'left' : 'right', u, { raw })); done.add('helixHand'); }
            break;
          }
          case 'helixHand': {
            const hand = /\b(LH|RH|LEFT|RIGHT|LINKS|RECHTS|L|R)\b/i.exec(value);
            if (hand) { out.push(draft('gear.helixHand', /^(LH|LEFT|LINKS|L)$/i.test(hand[1]) ? 'left' : 'right', u, { raw })); done.add(row.label); }
            break;
          }
          case 'faceWidth': if (n !== undefined && n > 0) { out.push(draft('gear.faceWidth', n, u, { unit: 'mm', raw })); done.add(row.label); } break;
          case 'qualityClass': if (value) { out.push(draft('gear.qualityClass', value, u, { raw })); done.add(row.label); } break;
          case 'profileShift': if (n !== undefined && Math.abs(n) <= 2) { out.push(draft('gear.profileShift', n, u, { raw })); done.add(row.label); } break;
          default: break;
        }
      }
    }
  }
  return out;
}
