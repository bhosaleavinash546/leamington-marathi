import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// Quotes are commercial data: each user sees and changes only the quotes they entered (an
// admin sees all). The list used to return every user's quotes to any signed-in user, and
// PATCH / DELETE took any id (KPI dashboard audit, 11 Nov 2026).
type Authed = Request & { user?: { userId?: string; email?: string } };
const emailOf = (req: Request): string => (req as Authed).user?.email ?? '';
const isAdminReq = (req: Request): boolean =>
  (db.prepare('SELECT role FROM users WHERE id = ?').get((req as Authed).user?.userId ?? '') as { role?: string } | undefined)?.role === 'admin';

const VALID_CURRENCIES = ['GBP','EUR','USD','CNY','INR','JPY','MXN','BRL','KRW','THB','VND','PLN','CZK','RON','TRY','SEK','AUD','CAD'];

router.get('/', (req: Request, res: Response) => {
  const { scenario_id } = req.query;
  const admin = isAdminReq(req);
  const me = emailOf(req);
  const rows = scenario_id
    ? (admin
      ? db.prepare('SELECT * FROM supplier_quotes WHERE scenario_id = ? ORDER BY unit_price ASC').all(scenario_id as string)
      : db.prepare('SELECT * FROM supplier_quotes WHERE scenario_id = ? AND created_by = ? ORDER BY unit_price ASC').all(scenario_id as string, me))
    : (admin
      ? db.prepare('SELECT * FROM supplier_quotes ORDER BY created_at DESC').all()
      : db.prepare('SELECT * FROM supplier_quotes WHERE created_by = ? ORDER BY created_at DESC').all(me));

  const quotes = (rows as Record<string, unknown>[]).map(r => ({
    ...r,
    attachments: JSON.parse(r.attachments as string),
  }));
  res.json(quotes);
});

router.post('/', (req: Request, res: Response) => {
  const {
    scenario_id, supplier_name, supplier_country = '',
    unit_price, currency = 'GBP', moq = 1,
    lead_time_weeks, validity_date, tooling_cost = 0, notes = '',
  } = req.body as Record<string, unknown>;

  if (!scenario_id || typeof scenario_id !== 'string') {
    { res.status(400).json({ error: 'scenario_id is required' }); return; }
  }
  if (!supplier_name || typeof supplier_name !== 'string') {
    { res.status(400).json({ error: 'supplier_name is required' }); return; }
  }
  if (typeof unit_price !== 'number' || unit_price < 0) {
    { res.status(400).json({ error: 'unit_price must be a non-negative number' }); return; }
  }
  if (currency && !VALID_CURRENCIES.includes(currency as string)) {
    { res.status(400).json({ error: `currency must be one of: ${VALID_CURRENCIES.join(', ')}` }); return; }
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO supplier_quotes
      (id, scenario_id, supplier_name, supplier_country, unit_price, currency,
       moq, lead_time_weeks, validity_date, tooling_cost, notes, attachments, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, scenario_id, supplier_name, supplier_country,
    unit_price, currency, moq,
    lead_time_weeks ?? null, validity_date ?? null,
    tooling_cost, notes, '[]',
    (req as Request & { user?: { email?: string } }).user?.email ?? 'system',
    now, now,
  );

  const row = db.prepare('SELECT * FROM supplier_quotes WHERE id = ?').get(id) as Record<string, unknown>;
  res.status(201).json({ ...row, attachments: JSON.parse(row.attachments as string) });
});

router.patch('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM supplier_quotes WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row || (row.created_by !== emailOf(req) && !isAdminReq(req))) { res.status(404).json({ error: 'Quote not found' }); return; }

  // Validate before building the update list
  if ('unit_price' in req.body) {
    const up = req.body['unit_price'];
    if (typeof up !== 'number' || up < 0) {
      { res.status(400).json({ error: 'unit_price must be a non-negative number' }); return; }
    }
  }
  if ('currency' in req.body && !VALID_CURRENCIES.includes(req.body['currency'] as string)) {
    { res.status(400).json({ error: `currency must be one of: ${VALID_CURRENCIES.join(', ')}` }); return; }
  }

  const allowed = ['supplier_name','supplier_country','unit_price','currency','moq','lead_time_weeks','validity_date','tooling_cost','notes'];
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (key in req.body) {
      updates.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }
  if (updates.length === 0) { res.status(400).json({ error: 'No updatable fields provided' }); return; }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(req.params.id);

  db.prepare(`UPDATE supplier_quotes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM supplier_quotes WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  res.json({ ...updated, attachments: JSON.parse(updated.attachments as string) });
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = isAdminReq(req)
    ? db.prepare('DELETE FROM supplier_quotes WHERE id = ?').run(req.params.id)
    : db.prepare('DELETE FROM supplier_quotes WHERE id = ? AND created_by = ?').run(req.params.id, emailOf(req));
  if (result.changes === 0) { res.status(404).json({ error: 'Quote not found' }); return; }
  res.json({ success: true });
});

export default router;
