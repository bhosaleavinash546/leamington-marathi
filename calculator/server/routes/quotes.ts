import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

const VALID_CURRENCIES = ['GBP','EUR','USD','CNY','INR','JPY','MXN','BRL','KRW','THB','VND','PLN','CZK','RON','TRY','SEK','AUD','CAD'];

router.get('/', (req: Request, res: Response) => {
  const { scenario_id } = req.query;
  const rows = scenario_id
    ? db.prepare('SELECT * FROM supplier_quotes WHERE scenario_id = ? ORDER BY unit_price ASC').all(scenario_id as string)
    : db.prepare('SELECT * FROM supplier_quotes ORDER BY created_at DESC').all();

  const quotes = rows.map((r: Record<string, unknown>) => ({
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
    return res.status(400).json({ error: 'scenario_id is required' });
  }
  if (!supplier_name || typeof supplier_name !== 'string') {
    return res.status(400).json({ error: 'supplier_name is required' });
  }
  if (typeof unit_price !== 'number' || unit_price < 0) {
    return res.status(400).json({ error: 'unit_price must be a non-negative number' });
  }
  if (currency && !VALID_CURRENCIES.includes(currency as string)) {
    return res.status(400).json({ error: `currency must be one of: ${VALID_CURRENCIES.join(', ')}` });
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
  if (!row) return res.status(404).json({ error: 'Quote not found' });

  // Validate before building the update list
  if ('unit_price' in req.body) {
    const up = req.body['unit_price'];
    if (typeof up !== 'number' || up < 0) {
      return res.status(400).json({ error: 'unit_price must be a non-negative number' });
    }
  }
  if ('currency' in req.body && !VALID_CURRENCIES.includes(req.body['currency'] as string)) {
    return res.status(400).json({ error: `currency must be one of: ${VALID_CURRENCIES.join(', ')}` });
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
  if (updates.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(req.params.id);

  db.prepare(`UPDATE supplier_quotes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM supplier_quotes WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  res.json({ ...updated, attachments: JSON.parse(updated.attachments as string) });
});

router.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM supplier_quotes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Quote not found' });
  res.json({ success: true });
});

export default router;
