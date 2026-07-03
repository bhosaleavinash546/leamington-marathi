import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cron from 'node-cron';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

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
import crossModelRoutes       from './routes/crossModel';
import negotiationRoutes        from './routes/negotiation';
import supplierScorecardRoutes  from './routes/supplierScorecard';
import commodityTemplateRoutes  from './routes/commodityTemplates';
import commodityPriceRoutes     from './routes/commodityPrices';
import acrRoutes                from './routes/acr';
import assemblyRoutes           from './routes/assembly';
import dashboardRoutes          from './routes/dashboard';
import rateLibraryRoutes        from './routes/rateLibrary';
import cerRoutes                from './routes/cer';
import csvImportRoutes          from './routes/csvImport';
import acrCommitmentRoutes      from './routes/acrCommitment';
import openBookRoutes           from './routes/openBook';

import { startWeeklyDigest, generateAndSendDigest } from './services/weeklyDigest';
import { scheduledEmailDigest } from './controllers/emailDigestController';
import { startCommodityPriceScheduler } from './services/commodityPriceService';
import { requireAuth, requireRole } from './middleware/auth';
import { validateEnv } from './config/env';

// Fail fast on insecure/missing critical env (JWT secret, DATABASE_URL,
// ALLOW_DEV_OTP in prod) before the app starts accepting traffic.
validateEnv();

const app  = express();
const PORT = process.env.PORT ?? 4000;

// Tiered rate limits
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,  // Strict limit for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'API rate limit exceeded.' },
});

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CostLens API',
      version: '2.0.0',
      description: 'Should-Cost vs Supplier Quotes — Engineering Cost Intelligence Platform',
    },
    servers: [{ url: '/api', description: 'CostLens API' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication & user management' },
      { name: 'Should-Cost', description: 'Should-cost model management' },
      { name: 'Quotes', description: 'Supplier quote management' },
      { name: 'Negotiations', description: 'Negotiation pipeline' },
      { name: 'ACR', description: 'Annual Cost Reduction targets' },
      { name: 'Commodity', description: 'Commodity price tracking' },
      { name: 'Dashboard', description: 'KPI dashboard data' },
      { name: 'Export', description: 'Data export (Excel, PowerPoint, CSV)' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
});

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

// Raw text/plain body parser for CSV import (must come before routes)
app.use('/api/import', express.raw({ type: 'text/plain', limit: '5mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// Apply global rate limit to all requests
app.use(globalLimiter);

// Swagger API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { background: #1d4ed8; }',
  customSiteTitle: 'CostLens API Docs',
}));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// Strict rate limit for auth endpoints
app.use('/api/auth', authLimiter);
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
app.use('/api/cross-model',        crossModelRoutes);
app.use('/api/negotiations',        negotiationRoutes);
app.use('/api/supplier-scorecard',  supplierScorecardRoutes);
app.use('/api/commodity-templates', commodityTemplateRoutes);
app.use('/api/commodity-prices',    commodityPriceRoutes);
app.use('/api/acr',                 acrRoutes);
app.use('/api/assembly',            assemblyRoutes);
app.use('/api/dashboard',           dashboardRoutes);
app.use('/api/rate-library',        rateLibraryRoutes);
app.use('/api/cer',                 cerRoutes);
app.use('/api/import',              csvImportRoutes);
app.use('/api/export/acr',          acrCommitmentRoutes);
app.use('/api/open-book',           openBookRoutes);

// Manual digest trigger for admins
app.post(
  '/api/admin/trigger-digest',
  requireAuth,
  requireRole('admin'),
  async (_req, res) => {
    generateAndSendDigest().catch(console.error);
    res.json({ message: 'Digest generation triggered' });
  }
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  startWeeklyDigest();

  // Monday 08:00 — weekly email digest (new controller)
  cron.schedule('0 8 * * 1', scheduledEmailDigest);
  console.log('[server] Email digest cron scheduled — Mondays 08:00.');

  // Daily 07:00 UTC — commodity price update
  startCommodityPriceScheduler();
});

export default app;
