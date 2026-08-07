/**
 * The six real parts with independent manual costs — shared by every review script.
 *
 * `docs/cad-to-cost-learnings.md` documents six parts whose right answer is known
 * from OUTSIDE the tool (a manual bottom-up cost, produced by a cost engineer, not
 * by CostVision). They are the only honest place to ask whether the geometric DFM
 * rules say anything a manufacturing engineer would agree with.
 *
 * This lives in its own file because two scripts now consume it — the markdown
 * review sheet (`dfm-six-parts.ts`) and the image review pack (`dfm-review-pack.ts`)
 * — and a duplicated part list would drift the moment either one is edited.
 *
 * `commodity` is the TRUE commodity per the learnings doc, not whatever the tool
 * once guessed.
 */
import type { CommodityType } from '../src/engine/types.js';

export const UPLOAD_DIR = process.env.CV_UPLOAD_DIR
  ?? '/root/.claude/uploads/8bf32d1a-7485-5bd6-9947-7843ee6c5644';

export interface ReviewPart {
  name: string;
  /** Filesystem-safe stem for image filenames — never derive this from `name`. */
  slug: string;
  /** Absolute path to the STEP/IGES file. */
  file: string;
  commodity: CommodityType;
  process?: string;
  materialFamily?: string;
  /** The independent manual bottom-up cost, as documented. */
  manualCost: string;
}

const part = (p: Omit<ReviewPart, 'file'> & { file: string }): ReviewPart =>
  ({ ...p, file: `${UPLOAD_DIR}/${p.file}` });

export const REVIEW_PARTS: ReviewPart[] = [
  part({ name: 'RH steering knuckle', slug: 'knuckle', file: 'd8d13088-steering_knuckle_RH.stp',
    commodity: 'casting', process: 'gravity', materialFamily: 'aluminium', manualCost: '~£16–18' }),
  part({ name: 'Stub axle (PRCR002)', slug: 'stub-axle', file: 'ee3d48dc-PRCR002.stp',
    commodity: 'forging', materialFamily: 'steel', manualCost: '~£30' }),
  part({ name: '25T servo horn', slug: 'servo-horn', file: 'ed1e77f6-Aluminium_25T_Servo_Horn.step',
    commodity: 'machining', materialFamily: 'aluminium', manualCost: '~£2.2' }),
  part({ name: 'Front bumper', slug: 'bumper', file: 'edd2f685-BUMPER.stp',
    commodity: 'injection_moulding', materialFamily: 'plastic', manualCost: '~£8–9' }),
  part({ name: 'Seat LH cross-member', slug: 'cross-member', file: '97fb714b-Seat_LH_Cross_Member.stp',
    commodity: 'sheet_metal', materialFamily: 'steel', manualCost: '~£1.4' }),
  part({ name: 'Fuel tank', slug: 'fuel-tank', file: 'b7a8495b-Fuel_tank.STEP',
    commodity: 'blow_moulding', materialFamily: 'plastic', manualCost: '~£20–30' }),
];
