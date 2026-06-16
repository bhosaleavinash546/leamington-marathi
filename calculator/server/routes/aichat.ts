import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

const SYSTEM_PROMPT = `You are an expert automotive cost engineer and should-cost analyst with 20+ years of experience across castings, sheet metal, injection moulding, PCB/PCBA, wiring harness, and assembly. You assist users of CostVision, an AI-powered should-cost tool.

Answer questions concisely and practically. Focus on:
- Manufacturing process selection and cost drivers
- Material cost benchmarks (UK/EU/China/India basis)
- Tooling cost estimation and amortisation
- DFM/DFA recommendations
- Supplier negotiation tactics
- Commodity-specific should-cost ranges

Keep answers under 150 words. Be direct and numerical where possible.`;

router.post('/', async (req, res): Promise<void> => {
  const { message } = req.body as { message?: string };
  if (!message?.trim()) { res.status(400).json({ error: 'No message provided' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? (req.headers['x-api-key'] as string);
  if (!apiKey) {
    res.json({ reply: 'AI assistant requires an Anthropic API key. Add it in Settings or set the ANTHROPIC_API_KEY environment variable.' });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message.trim() }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : 'No response.';
    res.json({ reply: text });
  } catch (err) {
    const msg2 = err instanceof Error ? err.message : String(err);
    console.error('[AiChat] Error:', msg2);
    res.status(502).json({ error: `AI service error: ${msg2}` });
  }
});

export default router;
