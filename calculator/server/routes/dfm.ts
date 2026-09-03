import { Router } from 'express';
import { requireAuth } from '../middleware/auth-middleware.js';
import type { Request, Response } from 'express';
import { createAnthropic } from '../utils/ai-client.js';
import { queueDFMJob, getDFMJob, requeueOrphans } from '../utils/dfm-job-runner.js';
import { GEOMETRIC_DFM_COMMODITIES } from '../../src/engine/dfm-geometry/index.js';
import type { CommodityType } from '../../src/engine/types.js';

const router = Router();

router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { result, input, commodity, dfmResult } = req.body as {
      result: unknown;
      input: unknown;
      commodity: string;
      dfmResult: {
        dfm: { score: number; issues: Array<{ severity: string; title: string; recommendation: string }>; summary: string };
        dfa: { score: number; issues: Array<{ severity: string; title: string; recommendation: string }>; summary: string };
        costOptimisations: Array<{ title: string; expectedSavingPct: number; technicalJustification: string; timeframe: string }>;
        totalPotentialSavingPct: number;
      };
    };

    if (!dfmResult || !commodity) {
      res.status(400).json({ error: 'Missing required fields: dfmResult, commodity' });
      return;
    }

    const dfmIssuesSummary = dfmResult.dfm.issues
      .map(i => `[${i.severity.toUpperCase()}] ${i.title}: ${i.recommendation}`)
      .join('\n');

    const dfaIssuesSummary = dfmResult.dfa.issues
      .map(i => `[${i.severity.toUpperCase()}] ${i.title}: ${i.recommendation}`)
      .join('\n');

    const optimSummary = dfmResult.costOptimisations
      .map(o => `• ${o.title} (~${o.expectedSavingPct.toFixed(1)}% saving, ${o.timeframe})`)
      .join('\n');

    const prompt = `You are a world-class manufacturing cost engineer specialising in DFM (Design for Manufacture) and DFA (Design for Assembly) analysis.

A should-cost model has been run for a **${commodity.replace(/_/g, ' ')}** component. The rule-based DFM/DFA analysis produced:

**DFM Score:** ${dfmResult.dfm.score}/10
**DFA Score:** ${dfmResult.dfa.score}/10
**Total Potential Saving:** ~${dfmResult.totalPotentialSavingPct.toFixed(1)}%

**DFM Issues Identified:**
${dfmIssuesSummary || 'None detected.'}

**DFA Issues Identified:**
${dfaIssuesSummary || 'None detected.'}

**Cost Optimisation Levers:**
${optimSummary || 'None identified.'}

**DFM Summary:** ${dfmResult.dfm.summary}
**DFA Summary:** ${dfmResult.dfa.summary}

Provide a deep engineering analysis covering:
1. **Root Cause Commentary** — explain WHY the identified issues occur in this commodity and what design decisions typically drive them
2. **Priority Actions** — rank the top 3 changes by combined cost and risk impact
3. **Supplier Negotiation Strategy** — specific talking points for using this analysis in price discussions
4. **Process Alternatives** — one or two alternative manufacturing processes that could deliver a better cost/quality trade-off
5. **Risk Assessment** — any red flags in the cost structure that warrant further investigation

Be specific, engineering-literate, and concise. Target 400–500 words. Do not repeat verbatim what the rule-based engine already said — provide expert commentary and depth.`;

    const client = createAnthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find(c => c.type === 'text');
    const analysis = textBlock && textBlock.type === 'text' ? textBlock.text : 'No analysis returned.';

    res.json({ analysis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DFM] AI analysis error:', msg);
    res.status(500).json({ error: `AI analysis failed: ${msg}` });
  }
});

// ─── Background geometric DFM ────────────────────────────────────────────────
// Separate from the AI /analyze route above, which is untouched. These read the
// measured CAD rather than a costing result, and every finding they return
// names the B-rep faces that produced it.

requeueOrphans();   // a restart must not strand a job in 'running' forever

router.post('/jobs', requireAuth, (req: Request, res: Response) => {
  const { filePath, commodity, partName, materialFamily, process: proc } = req.body as {
    filePath?: string; commodity?: string; partName?: string;
    materialFamily?: string; process?: string;
  };
  if (!filePath || !commodity) {
    res.status(400).json({ error: 'filePath and commodity are required' });
    return;
  }
  const id = queueDFMJob({
    filePath, commodity: commodity as CommodityType, partName,
    materialFamily, process: proc,
  });
  res.status(202).json({
    jobId: id,
    status: 'queued',
    // Say up front when there is no pack, so the caller is not left waiting for
    // a detailed report that was never going to contain findings.
    packAvailable: GEOMETRIC_DFM_COMMODITIES.has(commodity as CommodityType),
  });
});

router.get('/jobs/:id', requireAuth, (req: Request, res: Response) => {
  const job = getDFMJob(req.params.id);
  if (!job) { res.status(404).json({ error: 'job not found' }); return; }
  const { result, ...meta } = job;
  res.json({ ...meta, findingCount: result?.findings.length ?? null });
});

router.get('/jobs/:id/report', requireAuth, (req: Request, res: Response) => {
  const job = getDFMJob(req.params.id);
  if (!job) { res.status(404).json({ error: 'job not found' }); return; }
  if (job.status !== 'done') {
    res.status(409).json({ error: `job is ${job.status}`, status: job.status, detail: job.error });
    return;
  }
  res.json(job.result);
});

export default router;
