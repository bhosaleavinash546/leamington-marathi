// How-to guides for the 8 innovation idea-generation tools.
// Written for busy cost engineers: plain English, step-by-step, no theory required.
// Every tool is reachable two ways:
//   1) Tools -> Innovation Studio -> pick the method
//   2) On the Analyze page, switch the tool on as a "lens" (an extra view on your current part)

export interface HowToGuide {
  id: string;            // kebab e.g. 'triz'
  tool: string;          // display name e.g. 'TRIZ Innovation Studio'
  tagline: string;       // one plain-English sentence: what it's for
  whenToUse: string;     // one sentence: when to reach for THIS tool vs others
  steps: { title: string; detail: string }[];  // 4-7 steps, each detail 1-3 plain sentences
  example: string;       // one concrete worked automotive example, 1-2 sentences
}

export const HOW_TO_GUIDES: HowToGuide[] = [
  {
    id: 'triz',
    tool: 'TRIZ Innovation Studio',
    tagline:
      'Breaks an engineering trade-off ("better X makes Y worse") using 40 proven inventive principles — patterns of fixes distilled from millions of patents.',
    whenToUse:
      'Reach for TRIZ when you are stuck on a genuine conflict — improving one thing hurts another — rather than just hunting for any cost idea.',
    steps: [
      {
        title: 'Open the tool',
        detail:
          'Go to Tools -> Innovation Studio and pick TRIZ, or toggle the TRIZ lens on the Analyze page while looking at a part.',
      },
      {
        title: 'Type your trade-off in plain English',
        detail:
          'In the contradiction box, write the conflict the way you would say it out loud, e.g. "make the bracket lighter without losing stiffness". No TRIZ vocabulary needed.',
      },
      {
        title: 'Add context (optional)',
        detail:
          'Fill in the part name, the system it sits in, and the material if you know them. More context means ideas that fit your part better.',
      },
      {
        title: 'Click Generate',
        detail: 'The tool reads your sentence and works out the two conflicting parameters for you.',
      },
      {
        title: 'Read the diagnosis',
        detail:
          'Check the two conflicting parameters it identified (e.g. "weight of object" vs "stiffness") and the recommended inventive principles. If the conflict looks wrong, reword your sentence and Generate again.',
      },
      {
        title: 'Review the ideas',
        detail:
          'Each idea is engine-checked: a deterministic cost engine verifies the saving direction before you see it. Read the reasoning and the estimated saving on each card.',
      },
      {
        title: 'Push the good ones forward',
        detail: 'Click Add to Pipeline on any idea you want to build a business case for.',
      },
    ],
    example:
      'Contradiction "lighter steering knuckle without losing stiffness" -> the tool picks Segmentation and Composite materials -> concrete idea: a steel-CFRP hybrid knuckle with ribs only where the load paths need them.',
  },
  {
    id: 'scamper',
    tool: 'SCAMPER',
    tagline:
      'Runs a fast 7-question creativity checklist over your part: Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse.',
    whenToUse:
      'Use SCAMPER as your first pass on any part — it is the fastest and broadest tool, trading depth for speed, so run it before the heavier methods.',
    steps: [
      {
        title: 'Open the tool',
        detail:
          'Go to Tools -> Innovation Studio and pick SCAMPER, or toggle the SCAMPER lens on the Analyze page.',
      },
      {
        title: 'Name the part',
        detail: 'Type the part name in the box, e.g. "door module". That is all the input it needs.',
      },
      {
        title: 'Click Generate',
        detail: 'The tool asks all seven SCAMPER questions against your part in one go.',
      },
      {
        title: 'Read one idea per verb',
        detail:
          'You get seven cards, one per question — e.g. what could you Substitute, what could you Eliminate. Every idea is engine-checked, meaning a deterministic cost engine confirms the saving direction.',
      },
      {
        title: 'Keep the winners',
        detail:
          'Click Add to Pipeline on any card worth a business case. Ignore the weak ones — with seven quick shots, two or three keepers is a good result.',
      },
    ],
    example:
      'Door module -> Combine: merge two brackets into one moulding; Eliminate: replace a fastener with a snap-fit (a push-together clip joint).',
  },
  {
    id: 'value-engineering',
    tool: 'Value Engineering (Function Analysis)',
    tagline: 'Shows where you pay a lot of money for a function that adds little value.',
    whenToUse:
      'Use this when a part feels expensive but you cannot see why — it points at the overpriced function instead of guessing at random ideas.',
    steps: [
      {
        title: 'Open the tool',
        detail:
          'Go to Tools -> Innovation Studio and pick Value Engineering, or toggle the Value Engineering lens on the Analyze page.',
      },
      {
        title: 'Enter the part',
        detail: 'Type the part name in the box and click Generate.',
      },
      {
        title: 'Read the function breakdown',
        detail:
          'The tool splits the part into its functions, each written as a verb plus a noun, e.g. "transmit torque" or "locate sensor". This is just a plain list of the jobs the part does.',
      },
      {
        title: 'Check cost vs importance',
        detail:
          'For each function you see its estimated share of the part cost and how important it really is. The tool divides the two into a Value Index (importance per euro spent) and flags the poor-value functions in red.',
      },
      {
        title: 'Review the targeted ideas',
        detail:
          'The tool generates ideas aimed only at the flagged functions. Each idea is engine-checked — a deterministic cost engine verifies the saving direction.',
      },
      {
        title: 'Push forward',
        detail: 'Click Add to Pipeline on any idea you want turned into a business case.',
      },
    ],
    example:
      'A bracket where 40% of the cost delivers a "look finished" function worth only 5% of the value — the tool flags it and proposes deleting the cosmetic machining on hidden faces.',
  },
  {
    id: 'dfa',
    tool: 'DFA / Part Consolidation',
    tagline: 'Finds parts in an assembly that you can delete or merge into their neighbours.',
    whenToUse:
      'Use this when you have an assembly (not a single part) and suspect it has more pieces, fasteners and joins than it really needs.',
    steps: [
      {
        title: 'Open the tool',
        detail:
          'Go to Tools -> Innovation Studio and pick DFA / Part Consolidation, or toggle the DFA lens on the Analyze page.',
      },
      {
        title: 'Give it the parts list',
        detail:
          'Type or paste the list of parts in the box, or point the tool at a BOM (bill of materials — the parts list) or CAD file you have already uploaded.',
      },
      {
        title: 'Click Generate',
        detail:
          'For every part the tool asks the three classic Boothroyd-Dewhurst questions: does it move relative to the other parts, must it be a different material for a real reason, and must it stay separate for assembly or service?',
      },
      {
        title: 'Read the verdict per part',
        detail:
          'Any part that scores "no" on all three questions is flagged as a consolidation candidate — it only exists because someone designed it that way.',
      },
      {
        title: 'Check the headline numbers',
        detail:
          'The tool shows the theoretical minimum part count and a design-efficiency percentage (how close your design is to that minimum). A low percentage means lots of room to merge parts.',
      },
      {
        title: 'Review the consolidation ideas',
        detail:
          'It then proposes concrete merges, each engine-checked so a deterministic cost engine confirms the saving direction, including tooling and joining effects.',
      },
      {
        title: 'Push forward',
        detail: 'Click Add to Pipeline on the merges you want costed as a full business case.',
      },
    ],
    example:
      'A 6-piece welded bracket assembly comes back with only 2 essential parts — the tool proposes replacing all six with one casting and deleting four fasteners.',
  },
  {
    id: 'design-to-cost',
    tool: 'Design-to-Cost (Target Costing)',
    tagline: 'Works backwards from the price you must hit, instead of forwards from the design you have.',
    whenToUse:
      'Use this when you have a hard cost target from purchasing or the market and need a plan that actually adds up to it, not a loose pile of ideas.',
    steps: [
      {
        title: 'Open the tool',
        detail:
          'Go to Tools -> Innovation Studio and pick Design-to-Cost, or toggle the Design-to-Cost lens on the Analyze page.',
      },
      {
        title: 'Enter the current cost',
        detail:
          'Type the current piece cost in the box, or click Pull should-cost to use the cost the engine has already calculated for this part.',
      },
      {
        title: 'Enter the target',
        detail:
          'Type the target as a number (market price minus your margin) or as a percentage like "-15%". Then click Generate.',
      },
      {
        title: 'Read the gap breakdown',
        detail:
          'The tool computes the cost gap and splits it across the cost buckets: material, process, tooling and overhead. Now you can see where the money has to come from.',
      },
      {
        title: 'Review ideas sized to the gap',
        detail:
          'It generates ideas sized to close each bucket\'s share of the gap. Every idea is engine-checked — a deterministic cost engine verifies the saving direction and size.',
      },
      {
        title: 'Check the sum',
        detail:
          'The tool adds the ideas up and tells you whether the plan reaches the target or how much is still missing. If there is a shortfall, loosen a constraint or add another tool\'s ideas.',
      },
      {
        title: 'Push forward',
        detail: 'Click Add to Pipeline on the ideas you want in the savings plan.',
      },
    ],
    example:
      'Current cost 12 euro, target 10 euro -> 2 euro gap -> the tool proposes 1.20 euro from a material switch plus 0.80 euro from a process change, and confirms the plan sums to target.',
  },
  {
    id: 'morphological',
    tool: 'Morphological Analysis',
    tagline:
      'Explores genuinely different concepts by mixing and matching every way to do each sub-job of the part.',
    whenToUse:
      'Use this for a clean-sheet rethink — when tweaking the current design is not enough and you want concepts that look nothing like it.',
    steps: [
      {
        title: 'Open the tool',
        detail:
          'Go to Tools -> Innovation Studio and pick Morphological Analysis, or toggle the Morphological lens on the Analyze page.',
      },
      {
        title: 'Name the part and click Generate',
        detail: 'Type the part name in the box. The tool does the decomposition for you.',
      },
      {
        title: 'Check the sub-functions',
        detail:
          'The tool splits the part\'s job into sub-functions like "actuate", "seal" and "mount". Delete or rename any that do not match how your part really works.',
      },
      {
        title: 'Scan the options grid',
        detail:
          'For each sub-function you see a row of ways to do it — different physics, materials and layouts. This grid is the whole design space on one screen.',
      },
      {
        title: 'Review the best concept mixes',
        detail:
          'The tool combines one option per row into complete concepts, scores them on cost and feasibility, and shows the top mixes. Each concept is engine-checked, so a deterministic cost engine confirms the saving direction.',
      },
      {
        title: 'Push forward',
        detail: 'Click Add to Pipeline on any concept you want developed into a business case.',
      },
    ],
    example:
      'Actuating an air flap: options are solenoid, small motor, pneumatic, bimetal, or shape-memory alloy (metal that moves when heated) — the tool scores SMA plus an integrated mount as the cheapest mix.',
  },
  {
    id: 'effects-trends',
    tool: 'Effects & Evolution Trends',
    tagline:
      'Advanced TRIZ in two parts: look up a cheap physical effect that does your function, and see the next, usually cheaper generation of your technology.',
    whenToUse:
      'Use this when the basic tools have run dry and you want a physics-level or generation-level jump, not another tweak to the current design.',
    steps: [
      {
        title: 'Open the tool',
        detail:
          'Go to Tools -> Innovation Studio and pick Effects & Evolution Trends, or toggle it as a lens on the Analyze page. You will see two tabs: Effects and Evolution Trends.',
      },
      {
        title: 'Effects tab: pick the function you need',
        detail:
          'Choose from the function list — e.g. "hold two parts" or "sense position" — and click Generate.',
      },
      {
        title: 'Read the effects list',
        detail:
          'The tool returns physical effects that deliver that function cheaply: shrink-fit (parts gripped by thermal shrinkage), magnetism, Hall effect (a chip that senses magnetic fields), and more, each with a cost note.',
      },
      {
        title: 'Trends tab: locate your part',
        detail:
          'Switch to Evolution Trends and click Generate. The tool identifies where your part sits on the classic technology-evolution path — for example still mechanical while the industry moved to sensors.',
      },
      {
        title: 'Read the next-generation proposal',
        detail:
          'It proposes the next generation — usually cheaper and more integrated — as concrete ideas. All ideas from both tabs are engine-checked: a deterministic cost engine verifies the saving direction.',
      },
      {
        title: 'Push forward',
        detail: 'Click Add to Pipeline on any effect or next-generation idea worth a business case.',
      },
    ],
    example:
      'A mechanical position linkage on a shift selector -> the mechanics-to-fields trend points to a Hall-effect sensor, deleting the linkage, its bracket and three fasteners.',
  },
  {
    id: 'circularity',
    tool: 'Design for Circularity',
    tagline:
      'Finds ideas that cut cost today and make the part easier to disassemble and recycle, so it also meets end-of-life rules like the EU ELV (end-of-life vehicle) regulation.',
    whenToUse:
      'Use this when a part has glued joints, mixed materials or many fastener types — or when compliance is asking for recyclability numbers anyway.',
    steps: [
      {
        title: 'Open the tool',
        detail:
          'Go to Tools -> Innovation Studio and pick Design for Circularity, or toggle the Circularity lens on the Analyze page.',
      },
      {
        title: 'Enter the part and click Generate',
        detail: 'Type the part name in the box, or run it on the part already open in Analyze.',
      },
      {
        title: 'Read the circularity check',
        detail:
          'The tool scores the part against the standard strategies: reversible joints (joints you can undo) instead of adhesive, single-material design, fewer fastener types, easy separation, and remanufacture-ready construction. Failing items are flagged.',
      },
      {
        title: 'Review the double-win ideas',
        detail:
          'It generates ideas that fix the flags and save money at the same time — deleted adhesive stations, fewer fastener part numbers, one material instead of three. Each idea is engine-checked, so a deterministic cost engine verifies the saving direction.',
      },
      {
        title: 'Check the compliance note',
        detail:
          'Each idea shows what it does to recyclability and disassembly time as well as cost, so you can hand the same slide to compliance and to finance.',
      },
      {
        title: 'Push forward',
        detail: 'Click Add to Pipeline on the ideas you want in the business case.',
      },
    ],
    example:
      'A bonded mixed-material interior trim panel -> a mono-material clip-in panel: fully recyclable, and it deletes the adhesive station from the line.',
  },
  {
    id: 'horizon',
    tool: 'BrainSpark Horizon',
    tagline:
      'Predicts which technologies will reshape your part across ICE/MHEV/PHEV/BEV — and when — using a curated technology register positioned by S-curve, diffusion and cost-curve models.',
    whenToUse:
      'Reach for Horizon before a sourcing decision or platform study: it tells you whether the technology you are quoting today will still be the right answer in 3, 5 or 8 years.',
    steps: [
      {
        title: 'Open the tool',
        detail: 'Go to Tools -> Horizon (in the Learn group).',
      },
      {
        title: 'Name your part',
        detail:
          'Type the part or assembly the way you would say it — "BEV HV battery", "stator", "headlamps" — or just pick a commodity. Optionally filter to one powertrain.',
      },
      {
        title: 'Click Predict',
        detail:
          'The register is matched deterministically: every technology shown carries an automotive TRL, a current adoption share, named production evidence and (where real) a dated regulation.',
      },
      {
        title: 'Read the three horizons',
        detail:
          'Horizon 1 is production reality now — quote around it. Horizon 2 is the transition to plan for. Horizon 3 is worth tracking, not committing to. A gold "committed" badge means a regulation or named production programme anchors it; "speculative" means treat with care.',
      },
      {
        title: 'Open the modelled projection',
        detail:
          'Each card expands to show adoption and cost-index projections at +3/+5/+8 years. These are labelled models (Bass diffusion, Wright\'s law) seeded from curated data — not measurements.',
      },
      {
        title: 'Use the signals',
        detail:
          'With an API key set, an AI analyst briefing and one observable signal-to-watch per key technology are added — each grounded only in the cards on screen.',
      },
    ],
    example:
      '"EDU stator assembly" -> Horizon 1: 8-layer hairpin/X-pin windings (TRL 9, cost falling); Horizon 2: magnet-free EESM with inductive excitation; Horizon 3: iron-nitride magnets — watch Niron pilot magnets before betting a programme on them.',
  },
];
