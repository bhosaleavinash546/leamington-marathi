import { Request, Response } from 'express';
import pool from '../db/pool';

// POST /api/open-book/share — internal/admin only
// body: { should_cost_header_id, supplier_id, message? }
export async function createShare(req: Request, res: Response): Promise<void> {
  try {
    const { should_cost_header_id, supplier_id, message } = req.body as {
      should_cost_header_id: number;
      supplier_id: number;
      message?: string;
    };

    if (!should_cost_header_id || !supplier_id) {
      res.status(400).json({ error: 'should_cost_header_id and supplier_id are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO should_cost_share (should_cost_header_id, supplier_id, shared_by, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [should_cost_header_id, supplier_id, req.user?.sub ?? null, message ?? null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === '23505') {
      res.status(409).json({ error: 'This should-cost has already been shared with this supplier' });
      return;
    }
    console.error('[openBookController] createShare error:', err);
    res.status(500).json({ error: 'Failed to create share' });
  }
}

// GET /api/open-book/shares/:headerId — internal/admin only
export async function listSharesForHeader(req: Request, res: Response): Promise<void> {
  try {
    const { headerId } = req.params;

    const result = await pool.query(
      `SELECT scs.*,
              s.name AS supplier_name,
              s.code AS supplier_code,
              COUNT(sclr.id)::int AS response_count
       FROM should_cost_share scs
       JOIN supplier s ON s.id = scs.supplier_id
       LEFT JOIN should_cost_line_response sclr ON sclr.share_id = scs.id
       WHERE scs.should_cost_header_id = $1
       GROUP BY scs.id, s.name, s.code
       ORDER BY scs.shared_at DESC`,
      [headerId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[openBookController] listSharesForHeader error:', err);
    res.status(500).json({ error: 'Failed to list shares' });
  }
}

// GET /api/open-book/my-shares — supplier user (sees own); internal sees all they shared
export async function getMyShares(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user!;

    let result;
    if (user.role === 'supplier') {
      result = await pool.query(
        `SELECT scs.*,
                sch.version, sch.status AS sc_status, sch.total_cost, sch.currency,
                p.part_number, p.description AS part_description,
                COUNT(sclr.id)::int AS response_count
         FROM should_cost_share scs
         JOIN should_cost_header sch ON sch.id = scs.should_cost_header_id
         JOIN part_master p ON p.id = sch.part_id
         LEFT JOIN should_cost_line_response sclr ON sclr.share_id = scs.id
         WHERE scs.supplier_id = $1
         GROUP BY scs.id, sch.version, sch.status, sch.total_cost, sch.currency, p.part_number, p.description
         ORDER BY scs.shared_at DESC`,
        [user.supplierId]
      );
    } else {
      result = await pool.query(
        `SELECT scs.*,
                sch.version, sch.status AS sc_status, sch.total_cost, sch.currency,
                p.part_number, p.description AS part_description,
                s.name AS supplier_name,
                COUNT(sclr.id)::int AS response_count
         FROM should_cost_share scs
         JOIN should_cost_header sch ON sch.id = scs.should_cost_header_id
         JOIN part_master p ON p.id = sch.part_id
         JOIN supplier s ON s.id = scs.supplier_id
         LEFT JOIN should_cost_line_response sclr ON sclr.share_id = scs.id
         WHERE scs.shared_by = $1
         GROUP BY scs.id, sch.version, sch.status, sch.total_cost, sch.currency, p.part_number, p.description, s.name
         ORDER BY scs.shared_at DESC`,
        [user.sub]
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error('[openBookController] getMyShares error:', err);
    res.status(500).json({ error: 'Failed to fetch shares' });
  }
}

// GET /api/open-book/shares/:shareId/responses — internal or the supplier for that share
export async function getShareResponses(req: Request, res: Response): Promise<void> {
  try {
    const { shareId } = req.params;
    const user = req.user!;

    // Check that the share exists and that this user is authorised to view it
    const shareRes = await pool.query(
      `SELECT scs.*, s.id AS supplier_id_val FROM should_cost_share scs
       JOIN supplier s ON s.id = scs.supplier_id
       WHERE scs.id = $1`,
      [shareId]
    );
    if (!shareRes.rowCount) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }
    const share = shareRes.rows[0];

    if (user.role === 'supplier' && user.supplierId !== share.supplier_id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await pool.query(
      `SELECT sclr.*,
              scb.cost_element,
              scb.category,
              u.full_name AS responder_name
       FROM should_cost_line_response sclr
       LEFT JOIN should_cost_breakdown scb ON scb.id = sclr.breakdown_id
       LEFT JOIN "user" u ON u.id = sclr.created_by
       WHERE sclr.share_id = $1
       ORDER BY sclr.created_at`,
      [shareId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[openBookController] getShareResponses error:', err);
    res.status(500).json({ error: 'Failed to fetch responses' });
  }
}

// POST /api/open-book/shares/:shareId/responses — supplier user (or internal)
// body: { breakdown_id?, response_text?, counter_value? }
export async function addLineResponse(req: Request, res: Response): Promise<void> {
  try {
    const { shareId } = req.params;
    const { breakdown_id, response_text, counter_value } = req.body as {
      breakdown_id?: number;
      response_text?: string;
      counter_value?: number;
    };
    const user = req.user!;

    // Verify share exists and user is allowed
    const shareRes = await pool.query(
      `SELECT * FROM should_cost_share WHERE id = $1`,
      [shareId]
    );
    if (!shareRes.rowCount) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }
    const share = shareRes.rows[0];

    if (user.role === 'supplier' && user.supplierId !== share.supplier_id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Upsert on (share_id, breakdown_id)
    const result = await pool.query(
      `INSERT INTO should_cost_line_response (share_id, breakdown_id, response_text, counter_value, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (share_id, breakdown_id) DO UPDATE
         SET response_text = EXCLUDED.response_text,
             counter_value = EXCLUDED.counter_value,
             updated_at    = NOW()
       RETURNING *`,
      [shareId, breakdown_id ?? null, response_text ?? null, counter_value ?? null, user.sub]
    );

    // After any supplier response, mark share as responded
    await pool.query(
      `UPDATE should_cost_share SET status = 'responded' WHERE id = $1 AND status = 'open'`,
      [shareId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    console.error('[openBookController] addLineResponse error:', err);
    res.status(500).json({ error: 'Failed to add response' });
  }
}

// PATCH /api/open-book/shares/:shareId/close — internal/admin only
export async function closeShare(req: Request, res: Response): Promise<void> {
  try {
    const { shareId } = req.params;

    const result = await pool.query(
      `UPDATE should_cost_share SET status = 'closed' WHERE id = $1 RETURNING *`,
      [shareId]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[openBookController] closeShare error:', err);
    res.status(500).json({ error: 'Failed to close share' });
  }
}
