import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

interface BomRow {
  id: string;
  parent_scenario_id: string;
  child_scenario_id: string | null;
  item_name: string;
  quantity: number;
  unit_cost_override: number | null;
  notes: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface ScenarioRow {
  id: string;
  name: string;
  data: string;
}

function resolveItemCost(item: BomRow): { cost: number; unresolved: boolean } {
  if (item.unit_cost_override !== null) return { cost: item.unit_cost_override, unresolved: false };
  if (item.child_scenario_id) {
    const child = db.prepare('SELECT data FROM scenarios WHERE id = ?').get(item.child_scenario_id) as ScenarioRow | undefined;
    if (child) {
      try {
        const parsed = JSON.parse(child.data) as { total?: number; result?: { total?: number } };
        const cost = parsed.total ?? parsed.result?.total ?? 0;
        return { cost, unresolved: false };
      } catch {
        return { cost: 0, unresolved: true };
      }
    }
    // child_scenario_id set but not found in SQLite (lives in IndexedDB client-side)
    return { cost: 0, unresolved: true };
  }
  return { cost: 0, unresolved: false };
}

// GET /api/bom/:scenarioId — return BOM with rolled-up totals
router.get('/:scenarioId', (req: Request, res: Response) => {
  const items = db.prepare(
    'SELECT * FROM bom_items WHERE parent_scenario_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(req.params.scenarioId) as BomRow[];

  const enriched = items.map(item => {
    const result = resolveItemCost(item);
    return {
      ...item,
      resolvedUnitCost: result.cost,
      lineTotal: result.cost * item.quantity,
      unresolved: result.unresolved,
    };
  });

  const assemblyTotal = enriched.reduce((sum, i) => sum + i.lineTotal, 0);
  const unresolvedCount = enriched.filter(i => i.unresolved).length;

  res.json({ items: enriched, assemblyTotal, unresolvedCount });
});

// POST /api/bom/:scenarioId — add a BOM line
router.post('/:scenarioId', (req: Request, res: Response) => {
  const { child_scenario_id, item_name, quantity = 1, unit_cost_override, notes = '', sort_order = 0 } =
    req.body as Record<string, unknown>;

  if (!item_name || typeof item_name !== 'string') {
    return res.status(400).json({ error: 'item_name is required' });
  }
  if (typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive number' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO bom_items
      (id, parent_scenario_id, child_scenario_id, item_name, quantity, unit_cost_override, notes, sort_order, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, req.params.scenarioId,
    child_scenario_id ?? null,
    item_name, quantity,
    unit_cost_override ?? null,
    notes, sort_order, now, now,
  );

  const row = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(id) as BomRow;
  const rowResult = resolveItemCost(row);
  res.status(201).json({ ...row, resolvedUnitCost: rowResult.cost, lineTotal: rowResult.cost * row.quantity, unresolved: rowResult.unresolved });
});

// PATCH /api/bom/item/:id — update a BOM line
router.patch('/item/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(req.params.id) as BomRow | undefined;
  if (!row) return res.status(404).json({ error: 'BOM item not found' });

  const allowed = ['child_scenario_id', 'item_name', 'quantity', 'unit_cost_override', 'notes', 'sort_order'];
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

  db.prepare(`UPDATE bom_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(req.params.id) as BomRow;
  const updatedResult = resolveItemCost(updated);
  res.json({ ...updated, resolvedUnitCost: updatedResult.cost, lineTotal: updatedResult.cost * updated.quantity, unresolved: updatedResult.unresolved });
});

// DELETE /api/bom/item/:id
router.delete('/item/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM bom_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'BOM item not found' });
  res.json({ success: true });
});

export default router;
