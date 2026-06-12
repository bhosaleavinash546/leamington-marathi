import express from 'express';
import { config } from 'dotenv';
import cadRouter from './routes/cad.js';

config(); // load .env

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(express.json());
app.use('/api/cad', cadRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY });
});

app.listen(PORT, () => {
  console.log(`CAD Analysis server running on http://localhost:${PORT}`);
  console.log(`API key: ${process.env.ANTHROPIC_API_KEY ? 'configured ✓' : 'NOT SET — set ANTHROPIC_API_KEY in .env'}`);
});
