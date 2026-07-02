import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

const SYSTEM_PROMPT = `You are a world-class automotive manufacturing cost engineer and should-cost analyst with 25+ years of experience across castings, sheet metal, injection moulding, PCB/PCBA, wiring harness, composites, rubber, and full vehicle assembly. You assist users of CostVision, an AI-powered should-cost platform used by Tier 1 and OEM engineers.

RESPONSE RULES — follow these exactly:
- Use numbered steps (1. 2. 3.) not bullet asterisks (*)
- Structure every answer: Overview → Inputs → Steps → Cost Drivers → Tips
- Be direct, numerical, and engineering-grade
- UK/EU cost basis unless user specifies region
- Under 220 words total
- No emojis in responses
- No vague answers — always give concrete numbers or ranges

TOPICS you handle:
- Should-cost methodology for all manufacturing commodities
- Material cost benchmarks and grade selection
- Tooling cost estimation and amortisation
- Machine rate buildup and OEE assumptions
- DFM/DFA recommendations with cost impact
- Supplier negotiation tactics and PPV reduction
- Regional cost comparison (UK, Germany, China, India, Mexico)
- PCB/PCBA costing, BOM pricing, automotive grade premiums
- Wiring harness assembly time estimation
- Learning curve and volume break analysis`;

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
      max_tokens: 420,
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
