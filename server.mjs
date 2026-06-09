/**
 * AutoCost AI — Backend Server
 * Handles Claude API calls with agentic web-search tool loop.
 * Proxies web searches to avoid browser CORS restrictions.
 */
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json({ limit: '10mb' }));

const PORT = 3001;

// ─── Chief Engineer System Prompt ────────────────────────────────────────────

const CHIEF_ENGINEER_PROMPT = `You are a Chief Engineer at a premium automotive OEM with 30+ years of hands-on experience across luxury SUV programmes at BMW, Audi, Mercedes-Benz, Jaguar Land Rover, and Tier-0.5 suppliers (Magna, Bosch, ZF, Continental, Gestamp). You have 360-degree mastery across:

ENGINEERING DEPTH:
• DFMA: Part count reduction, snap-fit design, modular assembly, error-proofing, tolerance stack-up, GD&T, Design for X
• Materials science: PHS (22MnB5, 37MnB4), dual-phase steels (DP590–1200), TRIP, TWIP, aluminium alloys (5xxx, 6xxx, 7xxx, A380, A413), magnesium die-cast, engineering polymers (PA6-GF30, PP-GF20, PC/ABS), CFRP, GFRP, titanium, copper alloys
• Manufacturing processes: Progressive/transfer stamping, HPDC, low-pressure die-casting, gravity casting, investment casting, injection moulding, structural foam, hot-stamping (PHS), roll forming, hydroforming, extrusion, FSW (Friction Stir Welding), laser welding, RSW, CMT welding, brazing, hem flanging, flow drilling, thread-forming screws, clinching, rivet bonding, SPR (Self-Piercing Rivets)
• Surface treatment: Zinc phosphating, cathodic E-coat, KTL, powder coat, PVD, anodising, micro-arc oxidation, PTFE coating, laser ablation
• EV-specific: Hairpin winding (I-pin, X-pin), SiC MOSFETs (650V/1200V), Si IGBT, DC link capacitor sizing, pouch/prismatic/cylindrical cells (21700, 4680), LFP, NMC, NCA chemistry, cell-to-module, cell-to-pack (CTP), cell-to-body (CTB), integrated structural pack, thermal interface materials (TIM), phase-change materials, immersion cooling, BTMS design

COST ENGINEERING (Current Benchmarks — use as baselines, validate with search):
• HSLA steel sheet: €700–850/t | DP980 steel: €950–1,200/t | PHS boron steel: €1,100–1,400/t
• 5xxx Al sheet: €2,800–3,200/t | 6xxx Al extrusion: €3,000–3,600/t | Al HPDC alloy (A380): €2,400–2,800/t
• CFRP (prepreg): €20–35/kg | GFRP-SMC: €3–5/kg | PA6-GF30: €2.5–4/kg
• Copper (LME): €8,500–10,000/t | NdFeB magnets: €60–90/kg | Li carbonate: €10–15/kg (2024 spot)
• NMC cell cost: €65–90/kWh (pack level) | LFP cell cost: €50–70/kWh | SiC module: €1.5–3/kW
• Stamping tool (medium panel): €300K–€800K | HPDC tool: €500K–€1.2M | Injection mould: €80K–€400K
• Assembly labour: Germany €45–55/hr | Czech/Slovak €15–20/hr | Mexico €8–12/hr | China €10–18/hr
• Typical OEM product cost breakdown: Material ~55%, Manufacturing ~20%, Overhead ~15%, Profit ~10%

REAL-TIME INTELLIGENCE PROTOCOL:
You ALWAYS search the web before generating ideas. For each analysis, execute 3–5 targeted searches to ground your ideas in current market reality:
1. Current commodity/material prices relevant to this system
2. Recent technology innovations or disruptors in this area (2023–2025)
3. OEM or Tier-1 benchmarks: what are BMW/Audi/Tesla/BYD doing?
4. Supplier technology offers that could be leveraged
5. Regulatory changes affecting this system (Euro NCAP 2026+, Euro 7, battery regulation EU 2024)

IDEA QUALITY STANDARDS:
• Every idea must state: specific material grades, process names, dimensional targets, volume assumptions
• Quantify savings: use €/kg, €/part, % cost reduction with calculation logic
• Distinguish non-recurring investment (tooling, validation) from recurring savings
• Rate implementation risk: consider NCAP/FMVSS impact, NVH delta, warranty, supplier readiness
• Reference real-world precedents: "Tesla Model Y uses X approach saving Y%" where known
• Cover the full range: quick wins (0–6 months, process/specification changes) AND strategic (12–36 months, design changes, material substitution, platform commonisation)

OUTPUT FORMAT: Return ONLY valid JSON — a single array of 8 idea objects. No markdown, no preamble, no trailing text.`;

// ─── Web Search Functions ────────────────────────────────────────────────────

async function searchDuckDuckGo(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&kl=us-en`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'AutoCostAI/2.0 Research Tool' },
      signal: AbortSignal.timeout(8000),
    });
    const data = await resp.json();

    const results = [];
    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: data.Abstract,
        source: data.AbstractSource || 'Wikipedia',
      });
    }
    if (data.Answer) {
      results.push({
        title: 'Quick Answer',
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: data.Answer,
        source: 'DuckDuckGo Instant Answer',
      });
    }
    for (const topic of (data.RelatedTopics || []).slice(0, 5)) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(' - ')[0]?.slice(0, 80) || query,
          url: topic.FirstURL,
          snippet: topic.Text?.slice(0, 300) || '',
          source: new URL(topic.FirstURL).hostname.replace('www.', ''),
        });
      }
    }
    return results.slice(0, 5).filter(r => r.snippet);
  } catch {
    return [{ title: query, url: '', snippet: 'Search temporarily unavailable — using trained knowledge.', source: 'fallback' }];
  }
}

async function searchBrave(query, apiKey) {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6&search_lang=en&result_filter=web`;
    const resp = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`Brave API ${resp.status}`);
    const data = await resp.json();
    return (data.web?.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || r.extra_snippets?.[0] || '',
      source: r.meta_url?.hostname || new URL(r.url).hostname.replace('www.', ''),
    }));
  } catch {
    return searchDuckDuckGo(query);
  }
}

async function performSearch(query, braveApiKey) {
  if (braveApiKey?.trim()) {
    return searchBrave(query, braveApiKey.trim());
  }
  return searchDuckDuckGo(query);
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

function buildAnalysisPrompt(config, systemName, subassemblyName, partName, enableSearch) {
  const scope = partName
    ? `Part: **${partName}** (within Subassembly: ${subassemblyName}, System: ${systemName})`
    : `Subassembly: **${subassemblyName}** (System: ${systemName})`;

  const cadLine = config.cadFileName
    ? `\nCAD file provided: ${config.cadFileName} (${config.cadFileType}). Consider typical geometric complexity, feature count, wall thickness variation, and undercut risks for this component type.`
    : '';

  const searchInstruction = enableSearch
    ? `\nIMPORTANT: Use your web_search tool NOW to find: (1) current material costs for this system, (2) recent 2024–2025 innovations in this area, (3) what leading OEMs or Tier-1s are doing. Do 3–5 searches before generating ideas.`
    : '';

  return `Generate 8 expert-level cost reduction ideas for the following:

Vehicle Type: ${config.vehicleType}
${scope}
${config.additionalContext ? `Engineering Context: ${config.additionalContext}` : ''}${cadLine}${searchInstruction}

For each idea, return a JSON object with EXACTLY these fields:
{
  "id": "unique-slug",
  "title": "Action-oriented title ≤12 words",
  "technicalDescription": "Deep technical description 180–220 words. Include specific material grades, process names, dimensions, joining methods, tolerances. Reference real OEM/supplier benchmarks where applicable. Include the commercial rationale.",
  "manufacturingImpact": "90–130 words describing cycle time change, automation potential, tooling implications, assembly error-proofing, scrap rate impact, and supply chain simplification.",
  "costSavingTypes": ["array from: material, process, logistics, complexity, warranty, tooling, weight, commonisation"],
  "costSavingPotential": {
    "qualitative": "High/Medium/Low — one-sentence explanation of the lever",
    "percentage": "e.g. 10–18% part cost reduction",
    "annualValue": "e.g. €350K–€650K at 80K units/year — show calculation basis",
    "calculationBasis": "Brief explanation: e.g. 0.4 kg weight save × €3.2/kg Al × 80K units = €102K"
  },
  "implementationDifficulty": "Low | Medium | High",
  "riskNotes": "70–90 words: specific risks to NCAP rating, NVH (dB delta), corrosion, durability (fatigue cycles), warranty exposure, regulatory (Euro 7 / REACH / Battery Regulation EU), and proposed mitigations.",
  "dfmaPrinciples": ["3–6 specific DFMA/lean principles: e.g. Part count reduction, Integral attachment features, Material substitution, Modular assembly, Snap-fit design, Error-proofing"],
  "systemLevel": "Assembly | Subassembly | Part",
  "timeToImplement": "e.g. 6–12 months (mid-cycle refresh) or 18–30 months (new model)",
  "benchmarkReference": "Specific real-world reference: e.g. BMW iX uses aluminium casting integration for front-end saving 23 parts | Tesla Model Y cell-to-pack eliminates module housing saving €180/vehicle",
  "searchDataUsed": true | false
}

Cover a mix of system levels and idea types: at least 2 quick wins (Low difficulty), 3 medium-term, 2 strategic. Include at least one commonisation/platforming idea and one emerging-technology idea.

Return ONLY the JSON array. No markdown, no explanation outside JSON.`;
}

// ─── Main Analysis Endpoint ──────────────────────────────────────────────────

app.post('/api/analyze', async (req, res) => {
  const { config, systemName, subassemblyName, partName, enableSearch, searchApiKey } = req.body;

  if (!config?.apiKey?.trim()) {
    return res.status(400).json({ error: 'Anthropic API key is required.' });
  }
  if (!systemName || !subassemblyName) {
    return res.status(400).json({ error: 'System and subassembly must be specified.' });
  }

  const client = new Anthropic({ apiKey: config.apiKey });

  const webSearchTool = {
    name: 'web_search',
    description: 'Search the internet for real-time data: material commodity prices, manufacturing technology innovations, OEM design benchmarks, supplier capabilities, regulatory updates. Use specific, targeted queries.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Specific search query. Be targeted: include year (2024/2025), technology name, or material grade.',
        },
        purpose: {
          type: 'string',
          enum: ['material_cost', 'technology_benchmark', 'oem_practice', 'supplier_capability', 'regulatory'],
          description: 'Category of information being searched.',
        },
      },
      required: ['query', 'purpose'],
    },
  };

  const messages = [
    {
      role: 'user',
      content: buildAnalysisPrompt(config, systemName, subassemblyName, partName, enableSearch),
    },
  ];

  const sources = [];
  const MAX_ITERATIONS = 8;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const apiParams = {
        model: 'claude-opus-4-8',
        max_tokens: 12000,
        system: CHIEF_ENGINEER_PROMPT,
        messages,
      };

      if (enableSearch) {
        apiParams.tools = [webSearchTool];
        apiParams.tool_choice = { type: 'auto' };
      }

      const response = await client.messages.create(apiParams);

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
        const toolResults = [];

        for (const block of toolUseBlocks) {
          if (block.name === 'web_search') {
            const query = block.input.query;
            const purpose = block.input.purpose;
            console.log(`[Search] ${purpose}: "${query}"`);

            const results = await performSearch(query, searchApiKey);
            sources.push({ query, purpose, results, timestamp: new Date().toISOString() });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({
                query,
                results,
                note: 'Use this data to ground your cost estimates and technology references in current market reality.',
              }),
            });
          }
        }

        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });

      } else if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(b => b.type === 'text');
        if (!textBlock) throw new Error('No text response received from AI.');

        let raw = textBlock.text.trim();
        if (raw.startsWith('```')) {
          raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
        }

        const ideas = JSON.parse(raw);
        return res.json({ ideas, sources });

      } else {
        throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
      }
    }
    throw new Error('Maximum agentic loop iterations reached.');
  } catch (err) {
    console.error('[Analysis Error]', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed. Check your API key and try again.' });
  }
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚗 AutoCost AI Server v2.0 running on http://localhost:${PORT}`);
  console.log(`   Web search: DuckDuckGo (free) + optional Brave Search`);
  console.log(`   AI model: claude-opus-4-8 (agentic web-search loop)\n`);
});
