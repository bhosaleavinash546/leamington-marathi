import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import shouldCostRoutes  from './routes/shouldCost';
import quotesRoutes      from './routes/quotes';
import comparisonsRoutes from './routes/comparisons';
import aiRoutes          from './routes/ai';
import { generateToken } from './middleware/auth';
import pool              from './db/pool';
import bcrypt            from 'bcryptjs';

const app  = express();
const PORT = process.env.PORT ?? 4000;

// ---------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

// ---------------------------------------------------------------
// Health
// ---------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------
// Auth routes (minimal skeleton — expand as needed)
// ---------------------------------------------------------------
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email and password required' });
    return;
  }

  const result = await pool.query(
    `SELECT u.*, r.name AS role_name
     FROM "user" u JOIN role r ON r.id = u.role_id
     WHERE u.email = $1 AND u.is_active = TRUE`,
    [email]
  );

  if (result.rowCount === 0) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = generateToken({
    sub: user.id,
    email: user.email,
    role: user.role_name,
    supplierId: user.supplier_id ?? undefined,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role_name,
      supplierId: user.supplier_id,
    },
  });
});

// POST /api/auth/register  (admin use or seeding only — remove / gate in production)
app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { email, password, fullName, roleId, supplierId } = req.body as {
    email: string; password: string; fullName: string; roleId: number; supplierId?: number;
  };

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO "user" (email, password_hash, full_name, role_id, supplier_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role_id`,
    [email, hash, fullName, roleId, supplierId ?? null]
  );
  res.status(201).json(rows[0]);
});

// ---------------------------------------------------------------
// Feature routes
// ---------------------------------------------------------------
app.use('/api/should-cost',  shouldCostRoutes);
app.use('/api/quotes',       quotesRoutes);
app.use('/api/comparisons',  comparisonsRoutes);
app.use('/api/ai',           aiRoutes);

// ---------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});

export default app;
