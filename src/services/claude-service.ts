import Anthropic from '@anthropic-ai/sdk';
import { AnalysisConfig, CostReductionIdea } from '../types';

const SYSTEM_PROMPT = `You are a world-class automotive cost reduction engineer with 25+ years of experience in DFMA (Design for Manufacturing and Assembly), lean design, premium vehicle engineering, and supplier development. You have deep expertise across EV and ICE vehicle systems for luxury SUVs.

When generating cost reduction ideas, you provide technically rigorous, commercially viable suggestions with:
- Deep understanding of manufacturing processes (stamping, casting, injection moulding, welding, assembly)
- Knowledge of material science, tolerance stacking, NVH, safety regulations
- Awareness of industry benchmarks and supplier capability
- Practical implementation insights including risk mitigation

Always respond with valid JSON only, no markdown, no explanation outside the JSON.`;

function buildPrompt(config: AnalysisConfig, systemName: string, subassemblyName: string, partName?: string): string {
  const scope = partName
    ? `Part: ${partName} (within ${subassemblyName}, part of ${systemName})`
    : `Subassembly: ${subassemblyName} (part of ${systemName})`;

  const cadContext = config.cadFileName
    ? `\nCAD file uploaded: ${config.cadFileName} (${config.cadFileType}). Assume typical geometry for this component and flag specific geometric improvements based on common manufacturing issues for this part type.`
    : '';

  return `Generate comprehensive cost reduction ideas for the following automotive component:

Vehicle Type: ${config.vehicleType}
System: ${systemName}
${scope}
${config.additionalContext ? `Additional Context: ${config.additionalContext}` : ''}${cadContext}

Generate exactly 7 cost reduction ideas covering a mix of:
- Assembly-level improvements
- Subassembly optimizations
- Part-level DFMA changes
- Material substitution opportunities
- Process and tooling improvements
- Standardization / commonization
- Weight and logistics optimization

For each idea, provide a JSON object with these exact fields:
{
  "id": "unique-id-string",
  "title": "Concise title (max 10 words)",
  "technicalDescription": "Detailed technical description (150-200 words) explaining the change, how it works, and why it provides value",
  "manufacturingImpact": "Impact on manufacturing/assembly process (80-120 words)",
  "costSavingTypes": ["array of applicable types from: material, process, logistics, complexity, warranty, tooling, weight"],
  "costSavingPotential": {
    "qualitative": "High/Medium/Low with explanation",
    "percentage": "e.g. 8-15% part cost reduction",
    "annualValue": "e.g. €200K–€500K at 50K vehicles/year"
  },
  "implementationDifficulty": "Low | Medium | High",
  "riskNotes": "Key risks to performance, safety, NVH, durability, or regulations (60-80 words)",
  "dfmaPrinciples": ["list of DFMA/lean principles applied, e.g. Part count reduction, Snap-fit assembly, Material substitution"],
  "systemLevel": "Assembly | Subassembly | Part",
  "timeToImplement": "e.g. 12-18 months (new model cycle)",
  "benchmarkReference": "Optional: competitor or industry benchmark reference"
}

Return ONLY a valid JSON array of 7 idea objects. No markdown, no explanation.`;
}

export async function generateCostReductionIdeas(
  config: AnalysisConfig,
  systemName: string,
  subassemblyName: string,
  partName?: string
): Promise<CostReductionIdea[]> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const prompt = buildPrompt(config, systemName, subassemblyName, partName);

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  let raw = content.text.trim();
  // Strip any accidental markdown code fences
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  }

  const ideas: CostReductionIdea[] = JSON.parse(raw);
  return ideas;
}
