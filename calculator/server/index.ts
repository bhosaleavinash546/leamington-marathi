import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import cadRouter from './routes/cad.js';
import syncRouter from './routes/sync.js';
import agentRouter from './routes/agent.js';
import authRouter from './routes/auth.js';

config(); // load .env

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// CORS — allow Vite dev server and production origin
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:4173').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' })); // increased for base64 photo payloads

app.use('/api/auth', authRouter);
app.use('/api/cad', cadRouter);
app.use('/api/sync', syncRouter);
app.use('/api/agent', agentRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    teamAuthEnabled: !!process.env.TEAM_API_KEY,
    smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
  });
});

app.listen(PORT, () => {
  console.log(`Should-Cost server running on http://localhost:${PORT}`);
  console.log(`API key: ${process.env.ANTHROPIC_API_KEY ? 'configured ✓' : 'NOT SET — set ANTHROPIC_API_KEY in .env'}`);
  console.log(`Team sync auth: ${process.env.TEAM_API_KEY ? 'enabled ✓' : 'disabled (set TEAM_API_KEY to enable)'}`);
  console.log(`SMTP: ${process.env.SMTP_HOST ? `${process.env.SMTP_HOST} ✓` : 'not configured — OTPs logged to console'}`);
  console.log(`JWT secret: ${process.env.JWT_SECRET ? 'configured ✓' : 'using dev default — set JWT_SECRET in .env'}`);
});
