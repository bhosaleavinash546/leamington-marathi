import express from 'express';
import { config } from 'dotenv';
import cadRouter from './routes/cad.js';
import syncRouter from './routes/sync.js';

config(); // load .env

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(express.json({ limit: '2mb' }));
app.use('/api/cad', cadRouter);
app.use('/api/sync', syncRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    teamAuthEnabled: !!process.env.TEAM_API_KEY,
  });
});

app.listen(PORT, () => {
  console.log(`Should-Cost server running on http://localhost:${PORT}`);
  console.log(`API key: ${process.env.ANTHROPIC_API_KEY ? 'configured ✓' : 'NOT SET — set ANTHROPIC_API_KEY in .env'}`);
  console.log(`Team sync auth: ${process.env.TEAM_API_KEY ? 'enabled ✓' : 'disabled (set TEAM_API_KEY to enable)'}`);
});
