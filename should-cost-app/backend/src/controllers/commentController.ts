import { Request, Response } from 'express';
import pool from '../db/pool';

// GET /api/quotes/:quoteId/comments
export async function listComments(req: Request, res: Response): Promise<void> {
  const { quoteId } = req.params;
  const isSupplier = req.user?.role === 'supplier';

  const { rows } = await pool.query(
    `SELECT c.*, u.full_name AS author_name, u.email AS author_email,
            r.name AS author_role
     FROM quote_comment c
     LEFT JOIN "user" u ON u.id = c.created_by
     LEFT JOIN role r ON r.id = u.role_id
     WHERE c.supplier_quote_header_id = $1
       ${isSupplier ? 'AND c.is_internal = FALSE' : ''}
     ORDER BY c.created_at`,
    [quoteId]
  );
  res.json(rows);
}

// POST /api/quotes/:quoteId/comments
export async function addComment(req: Request, res: Response): Promise<void> {
  const { quoteId } = req.params;
  const { body, costElement, parentId, isInternal } = req.body as {
    body: string; costElement?: string; parentId?: number; isInternal?: boolean;
  };

  if (!body?.trim()) { res.status(400).json({ error: 'body required' }); return; }

  // Suppliers can only add public (non-internal) comments
  const internal = req.user?.role === 'supplier' ? false : (isInternal ?? false);

  const { rows } = await pool.query(
    `INSERT INTO quote_comment
       (supplier_quote_header_id, parent_id, cost_element, body, is_internal, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [quoteId, parentId ?? null, costElement ?? null, body.trim(), internal, req.user?.sub]
  );
  res.status(201).json(rows[0]);
}

// DELETE /api/quotes/comments/:id
export async function deleteComment(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  // Only the author or an admin can delete
  const { rows } = await pool.query(`SELECT created_by FROM quote_comment WHERE id = $1`, [id]);
  if (!rows.length) { res.status(404).json({ error: 'Comment not found' }); return; }

  if (req.user?.role !== 'admin' && rows[0].created_by !== req.user?.sub) {
    res.status(403).json({ error: 'Not authorised to delete this comment' }); return;
  }

  await pool.query(`DELETE FROM quote_comment WHERE id = $1`, [id]);
  res.status(204).send();
}
