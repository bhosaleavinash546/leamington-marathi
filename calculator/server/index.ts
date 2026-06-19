import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import type { Request, Response, NextFunction } from 'express';
import { config } from 'dotenv';
import cadRouter from './routes/cad.js';
import syncRouter from './routes/sync.js';
import agentRouter from './routes/agent.js';
import authRouter from './routes/auth.js';
import dfmRouter from './routes/dfm.js';
import pcbRouter from './routes/pcb.js';
import aichatRouter from './routes/aichat.js';
import newsRouter from './routes/news.js';
import commoditiesRouter from './routes/commodities.js';

config(); // load .env

const app = express();
const PORT = parseInt(process.env.PORT ?? '3002', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],   // unsafe-inline needed for inline auth guard
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
}));

// Request logging — combined in prod (Apache format with IPs), dev in concise format
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

// CORS — in dev allow all localhost origins; in prod restrict to ALLOWED_ORIGINS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5174,http://localhost:4174').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / non-browser calls
    if (!IS_PROD) return cb(null, true); // dev: allow everything on localhost
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' })); // increased for base64 photo payloads

app.use('/api/auth', authRouter);
app.use('/api/cad', cadRouter);
app.use('/api/pcb', pcbRouter);
app.use('/api/aichat', aichatRouter);
app.use('/api/sync', syncRouter);
app.use('/api/agent', agentRouter);
app.use('/api/dfm', dfmRouter);
app.use('/api/news', newsRouter);
app.use('/api/commodities', commoditiesRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    teamAuthEnabled: !!process.env.TEAM_API_KEY,
    smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
    jwtConfigured: !!process.env.JWT_SECRET,
  });
});

// Global error handler — must be last middleware
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error('[ERROR]', err.stack ?? err.message);
  res.status(status).json({ error: IS_PROD ? 'Internal server error' : (err.message ?? 'Unknown error') });
});

const server = app.listen(PORT, () => {
  console.log(`Should-Cost server running on http://localhost:${PORT}`);
  console.log(`API key:      ${process.env.ANTHROPIC_API_KEY ? '✓ configured' : '✗ NOT SET — set ANTHROPIC_API_KEY in .env'}`);
  console.log(`JWT secret:   ${process.env.JWT_SECRET ? '✓ configured' : '⚠  using dev default — set JWT_SECRET in .env'}`);
  console.log(`SMTP:         ${process.env.SMTP_HOST ? `✓ ${process.env.SMTP_HOST}` : 'not configured — OTPs logged to console'}`);
  console.log(`Team sync:    ${process.env.TEAM_API_KEY ? '✓ enabled' : 'disabled'}`);
  console.log(`Environment:  ${IS_PROD ? 'production' : 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
