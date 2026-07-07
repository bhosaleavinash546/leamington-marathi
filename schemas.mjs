/**
 * Request-body validation (zod) — coarse shape gates at the edge.
 * ------------------------------------------------------------------
 * Routes keep their precise domain checks (ranges, resolution, family guards);
 * these schemas reject malformed shapes early with field-level messages, so a
 * string where an object belongs (or a 500 KB "email") never reaches handlers.
 * Tolerant-in: unknown keys pass through untouched (we validate, not replace).
 */
import { z } from 'zod';

const shortStr = (max = 200) => z.string().max(max);
const numish = z.union([z.number(), z.string().max(40)]);   // routes coerce + range-check

export const SCHEMAS = {
  signup: z.object({
    name: shortStr(120),
    email: shortStr(254),
    password: z.string().min(8).max(200),
  }),
  signin: z.object({
    email: shortStr(254),
    password: z.string().min(1).max(200),
  }),
  resetPassword: z.object({
    email: shortStr(254),
    otp: shortStr(12),
    newPassword: z.string().min(8).max(200),
  }),
  apiKey: z.object({
    apiKey: z.string().min(20).max(300),
  }),
  shouldCost: z.object({
    partName: shortStr(200),
    material: shortStr(200),
    process: z.union([shortStr(200), z.array(shortStr(200)).max(8)]),
    weightKg: numish,
    annualVolume: numish,
    quotedCost: numish.optional(),
    region: shortStr(60).optional(),
    currency: shortStr(8).optional(),
    apiKey: z.string().max(300).optional(),
    route: z.array(z.object({ process: shortStr(200) }).loose()).max(8).optional(),
  }).loose(),
  quote: z.object({
    partName: shortStr(200).optional(),
    material: shortStr(200),
    process: shortStr(200),
    weightKg: numish,
    annualVolume: numish,
    actualPrice: numish,
    region: shortStr(60).optional(),
    currency: shortStr(8).optional(),
  }).loose(),
  costDown: z.object({
    partName: shortStr(200).optional(),
    material: shortStr(200),
    process: shortStr(200),
    weightKg: numish,
    annualVolume: numish,
    region: shortStr(60).optional(),
    apiKey: z.string().max(300).optional(),
  }).loose(),
  marketplaceSubmit: z.object({
    title: shortStr(200),
    system: shortStr(120),
    costSavingType: shortStr(120).optional(),
    annualSaving: shortStr(60).optional(),
    difficulty: shortStr(20).optional(),
    timeToImplement: shortStr(60).optional(),
    description: z.string().max(5000),
    // Rich payload is stored verbatim in the DB — cap it so a submission can't
    // stuff a near-1MB blob into every marketplace list response.
    ideaData: z.string().max(100_000).optional(),
  }).loose(),
};

/** Express middleware: 400 with field-level messages on shape mismatch. */
export function validate(schema) {
  return (req, res, next) => {
    const r = schema.safeParse(req.body ?? {});
    if (!r.success) {
      const issues = r.error.issues.slice(0, 5).map(i => `${i.path.join('.') || 'body'}: ${i.message}`);
      return res.status(400).json({ error: `Invalid request — ${issues.join('; ')}` });
    }
    next();
  };
}
