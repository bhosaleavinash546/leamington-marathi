import { Router } from 'express';
import type { Request, Response } from 'express';
import { createAnthropic, isAirGapped, aiDisabledBody } from '../utils/ai-client.js';
import { aiLimit } from '../middleware/ai-limit.js';
import { analyzeRfq, type RfqLineItem } from '../../src/engine/rfq.js';
import { numbersIn, isGrounded } from '../utils/agent-grounding.js';

/**
 * A line the model read from RFQ text keeps only the numbers that are IN that text, and never a should-cost: the model
 * reads the document, the engine costs (AI-path audit, Oct 2026). A dropped number is said on the line.
 */
export function groundRfqItems(items: RfqLineItem[], text: string): Array<RfqLineItem & { droppedByGrounding?: string[] }> {
  const given = numbersIn([text]);
  const FIELDS = ['quantity', 'netWeightKg', 'materialPricePerKg', 'targetPricePerPart', 'supplierCount'] as const;
  return items.map(l => {
    const out: RfqLineItem & { droppedByGrounding?: string[] } = { ...l };
    const dropped: string[] = [];
    delete out.shouldCostPerPart;
    if (typeof l.shouldCostPerPart === 'number') dropped.push(`shouldCostPerPart = ${l.shouldCostPerPart} (the model never sets a cost)`);
    for (const f of FIELDS) {
      const v = out[f];
      if (typeof v === 'number' && !isGrounded(v, given)) { delete out[f]; dropped.push(`${f} = ${v} (not in the RFQ text)`); }
    }
    if (dropped.length) out.droppedByGrounding = dropped;
    return out;
  });
}

const router = Router();

const DECOMPOSE_SYSTEM = `You are a strategic-sourcing cost engineer. Extract the RFQ / BOM text into a JSON array of line items. For EACH part return:
{ "partName": string, "commodity": one of [machining,casting,cast_and_machine,forging,sheet_metal,sheet_metal_fab,injection_moulding,blow_moulding,extrusion,thermoforming,rotational_moulding,rubber,composites,painting,biw_assembly,wiring_harness], "quantity": number, "netWeightKg"?: number, "materialPricePerKg"?: number, "targetPricePerPart"?: number, "supplierCount"?: number, "toleranceClass"?: "loose"|"standard"|"tight" }
Infer the commodity from the material/description. Copy numbers exactly as written in the text — never estimate one; leave
a field out when the text does not state it. Return ONLY the JSON array, nothing else.`;

/** POST /api/rfq/analyze — analyse RFQ line items (or decompose raw text first). */
router.post('/analyze', aiLimit('rfq'), async (req: Request, res: Response): Promise<void> => {
  const { lines, text, apiKey } = req.body as { lines?: RfqLineItem[]; text?: string; apiKey?: string };

  try {
    let items: RfqLineItem[] | undefined = Array.isArray(lines) ? lines : undefined;

    // Decompose raw RFQ text with the LLM when structured lines aren't supplied.
    if ((!items || items.length === 0) && text && text.trim()) {
      // Structured lines still work air-gapped; only reading free text needs AI.
      if (isAirGapped()) { res.status(503).json(aiDisabledBody('Reading line items from RFQ text')); return; }
      const key = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!key) { res.status(400).json({ error: 'Provide "lines", or "text" plus an Anthropic API key to decompose it.' }); return; }
      const anthropic = createAnthropic(key);
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-5', max_tokens: 4096,
        system: DECOMPOSE_SYSTEM,
        messages: [{ role: 'user', content: text.slice(0, 20000) }],
      });
      const raw = (msg.content.map(b => b.type === 'text' ? b.text : '').join('') || '[]');
      const jsonStr = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1) || '[]';
      items = groundRfqItems(JSON.parse(jsonStr) as RfqLineItem[], text);
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
