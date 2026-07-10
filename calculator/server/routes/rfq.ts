import { Router } from 'express';
import type { Request, Response } from 'express';
import { createAnthropic } from '../utils/ai-client.js';
import { analyzeRfq, type RfqLineItem } from '../../src/engine/rfq.js';

const router = Router();

const DECOMPOSE_SYSTEM = `You are a strategic-sourcing cost engineer. Extract the RFQ / BOM text into a JSON array of line items. For EACH part return:
{ "partName": string, "commodity": one of [machining,casting,cast_and_machine,forging,sheet_metal,sheet_metal_fab,injection_moulding,blow_moulding,extrusion,thermoforming,rotational_moulding,rubber,composites,painting,biw_assembly,wiring_harness], "quantity": number, "netWeightKg"?: number, "materialPricePerKg"?: number, "targetPricePerPart"?: number, "supplierCount"?: number, "toleranceClass"?: "loose"|"standard"|"tight" }
Infer the commodity from the material/description. Return ONLY the JSON array, nothing else.`;

/** POST /api/rfq/analyze — analyse RFQ line items (or decompose raw text first). */
router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  const { lines, text, apiKey } = req.body as { lines?: RfqLineItem[]; text?: string; apiKey?: string };

  try {
    let items: RfqLineItem[] | undefined = Array.isArray(lines) ? lines : undefined;

    // Decompose raw RFQ text with the LLM when structured lines aren't supplied.
    if ((!items || items.length === 0) && text && text.trim()) {
      const key = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!key) { res.status(400).json({ error: 'Provide "lines", or "text" plus an Anthropic API key to decompose it.' }); return; }
      const anthropic = createAnthropic(key);
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6', max_tokens: 4096, temperature: 0,
        system: DECOMPOSE_SYSTEM,
        messages: [{ role: 'user', content: text.slice(0, 20000) }],
      });
      const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '[]';
      const jsonStr = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1) || '[]';
      items = JSON.parse(jsonStr) as RfqLineItem[];
    }

    if (!items || items.length === 0) { res.status(400).json({ error: 'No RFQ line items to analyse.' }); return; }
    // Sanity-clamp the decomposed items.
    const clean = items
      .filter(l => l && typeof l.partName === 'string' && typeof l.commodity === 'string')
      .map(l => ({ ...l, quantity: Math.max(1, Math.round(Number(l.quantity) || 1)) }));

    res.json({ success: true, lineCount: clean.length, analysis: analyzeRfq(clean) });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error('[RFQ] analyze error:', m);
    res.status(502).json({ error: `RFQ analysis failed: ${m}` });
  }
});

export default router;
