import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import authRoutes           from './routes/auth';
import shouldCostRoutes     from './routes/shouldCost';
import quotesRoutes         from './routes/quotes';
import comparisonsRoutes    from './routes/comparisons';
import aiRoutes             from './routes/ai';
import vehicleRoutes        from './routes/vehicle';
import multiCompRoutes      from './routes/multiComparison';
import commentRoutes        from './routes/comments';
import exportRoutes         from './routes/export';
import opportunityRoutes    from './routes/opportunity';
import programRoutes        from './routes/programs';
import currentPriceRoutes   from './routes/currentPrice';
import threeWayRoutes       from './routes/threeWay';

const app  = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

app.use('/api/auth',             authRoutes);
app.use('/api/should-cost',      shouldCostRoutes);
app.use('/api/quotes',           quotesRoutes);
app.use('/api/quotes/:quoteId/comments', commentRoutes);
app.use('/api/comparisons',      comparisonsRoutes);
app.use('/api/ai',               aiRoutes);
app.use('/api/vehicle',          vehicleRoutes);
app.use('/api/multi-comparison', multiCompRoutes);
app.use('/api/export',           exportRoutes);
app.use('/api/opportunity',      opportunityRoutes);
app.use('/api/programs',         programRoutes);
app.use('/api/current-price',    currentPriceRoutes);
app.use('/api/three-way',        threeWayRoutes);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});

export default app;
