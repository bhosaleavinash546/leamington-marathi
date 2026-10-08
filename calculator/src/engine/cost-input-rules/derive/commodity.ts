/**
 * Which process, with no model to ask?
 *
 * On the AI path a Haiku call picks the commodity and
 * `enforceGeometryCommodity` overrides it where the measurement is decisive.
 * The deterministic path has no such starting guess, so this supplies one —
 * and, more often, admits it cannot.
 *
 * That admission is the honest part. The fill-ratio ladder the prompt has
 * carried for months is written as prose *pairs*:
 *
 *     < 0.20  very sparse/thin-wall → sheet metal, injection moulding, or
 *             thin-wall machined
 *     < 0.40  moderate fill → casting OR machined from billet
 *     < 0.65  semi-solid → forging OR heavy section casting
 *     else    near-solid → forging OR machined from solid bar
 *
 * Every rung names two or three routes because the shape genuinely does not
 * separate them: a 0.5-fill bracket is a forging or a casting depending on
 * volume, tolerance and who is quoting. Reading that ladder as a classifier —
 * which is what asking a model to "pick one" amounts to — turns a documented
 * ambiguity into a confident-sounding answer.
 *
 * So this returns a commodity only where the geometry is decisive, and a
 * Decision listing the plausible routes everywhere else. The three decisive
 * signals are the ones `enforceGeometryCommodity` already trusts enough to
 * override a model with.
 */
import type { Decision, RuleContext } from '../types.js';
import { hollowVerdict, enclosedShell, cavityShell } from './hollow.js';
import { extrusionProfile } from './profile.js';
import { shellWallEstimateMm } from '../../geometry-sanity.js';
import { partNames, processFromNames, polymerFromNames, netShapeSignal, hasMachinedFeatures } from './part-evidence.js';

export const COMMODITY_DECISION_ID = 'commodity.route';

/**
 * A filename that names a gear: `ring_gear.step`, `PINION-12.stp`, `gear_z38.stp`. "gear" / "pinion" must be a whole
 * word (underscores, digits and punctuation separate words) — `offroad_vehicle_gearbox_housing.stp` matched `_gear` and
 * was costed as a gear asking for a tooth count (uploaded-parts review, Oct 2026). A gearbox, gear housing or gear
 * cover is not a gear: "gear" followed by box / case / housing / cover / shift / lever is excluded.
 */
const GEAR_NAME = /(?:^|[^a-z])(?:gears?|pinions?)(?![a-z])(?![\s_-]*(?:box|case|housing|cover|shift|lever|knob|oil|pump))/i;

/**
 * Is this a gear? The one rule, for every caller.
 *
 * `cad.ts` routes a gear to the gear commodity before Stage 1 — counted
 * tip-circle teeth are not something a classifier can improve on — and it did
 * that with its own inline copy of this test. `inferCommodity` had no gear
 * branch at all, so the deterministic bulk path could not reach the gear
 * commodity and could not be answered into it either: `ROUTES` has no gear
 * entry, so `commodity.route=gear` was silently ignored and the question came
 * straight back. The browser costed a gear the bulk run refused. Sharing the
 * predicate is what stops the two paths disagreeing again.
 */
export function looksLikeGear(
  geo: { gear?: { likelyGear?: boolean; teeth?: number } | null }, filename?: string,
): { gear: boolean; basis: string } {
  if (geo.gear?.likelyGear === true) {
    const z = geo.gear.teeth;
    return { gear: true, basis: `tip-circle metrology counted ${z ?? 'the'} teeth` };
  }
  if (filename && GEAR_NAME.test(filename)) {
    return { gear: true, basis: 'the filename names a gear' };
  }
  return { gear: false, basis: '' };
}

/**
 * How far the mean wall may exceed the reported gauge and still read as sheet.
 *
 * A pressing is one wall throughout, but the ray-cast mean is not exactly the
 * gauge: rays that graze a bend or run along the sheet plane read long, and a
 * flange doubles locally. Two lets that through. The parts this exists to keep
 * out are not marginal — the bracket, knuckle and PRCR002 in the audit set
 * measure 11x, 17x and 76x their reported gauge.
 */
const GAUGE_WALL_TOLERANCE = 2;

/**
 * Above this bulk wall a sparse part is not a pressing or a moulding.
 *
 * Sheet steel for pressings stops around 6 mm, and injection moulding is
 * designed to 1–4 mm because a thick section sinks and cycles for minutes. A
 * sparse part with walls past this is a casting, a forging or a machined part
 * — the knuckle, Casting_Braket and PRCR002 in the audit set measure 9–15 mm,
 * and were only ever offered sheet metal, injection moulding or machining.
 */
const THICK_WALL_MM = 6;
/** The thickest wall injection moulding is designed to; a shell above it with bosses is cast. */
const MOULDED_WALL_MAX_MM = 4;

export interface CommodityVerdict {
  /** Set when the measurement settles it. */
  commodity?: string;
  basis?: string;
  /** Set when it does not. */
  decision?: Decision;
}

interface Route { value: string; label: string; consequence: string }

const ROUTES: Record<string, Route> = {
  machining: { value: 'machining', label: 'Machined from solid', consequence: 'no tooling; cost is cutting time and the billet' },
  casting: { value: 'casting', label: 'Cast', consequence: 'a die or pattern to amortise; near-net, little machining' },
  cast_and_machine: { value: 'cast_and_machine', label: 'Cast then machined', consequence: 'die plus finish machining on the datums' },
  forging: { value: 'forging', label: 'Forged', consequence: 'die set plus billet; best grain flow, heaviest tooling' },
  sheet_metal: { value: 'sheet_metal', label: 'Pressed sheet metal', consequence: 'press tool and coil' },
  injection_moulding: { value: 'injection_moulding', label: 'Injection moulded', consequence: 'mould and resin' },
  blow_moulding: { value: 'blow_moulding', label: 'Blow moulded', consequence: 'blow mould and resin; hollow by construction' },
  rotational_moulding: { value: 'rotational_moulding', label: 'Rotomoulded', consequence: 'cheap tool, very long cycle' },
  thermoforming: { value: 'thermoforming', label: 'Thermoformed', consequence: 'cheap tool, sheet stock, high trim waste' },
  // Rubber review: an elastomer part could not be answered into its own
  // commodity — only forced from the drop-down. Offered when the name says
  // rubber (part-evidence), and accepted as an answer always.
  rubber: { value: 'rubber', label: 'Moulded or extruded rubber', consequence: 'compound, cure time and a rubber mould or die' },
  // Composites review: a laminate could not be answered into its own
  // commodity either. Offered when the name says composite (part-evidence).
  composites: { value: 'composites', label: 'Composite laminate', consequence: 'fibre and resin, layup hours, a cure cycle and a layup tool' },
  // Extrusion build: a constant-section polymer part — tube, pipe or profile.
  extrusion: { value: 'extrusion', label: 'Extruded (polymer) and cut to length', consequence: 'resin by the kg/m, a line rate and a die — polymer lines only' },
  // Aluminium extrusion build: billet, press, quench, stretch, age, fabricate, finish.
  aluminium_extrusion: { value: 'aluminium_extrusion', label: 'Aluminium extrusion', consequence: 'billet at LME + regional premium, a press plan by section, ageing and a die by the tonne' },
};

function ask(why: string, routes: string[], leaning?: string): Decision {
  return {
    id: COMMODITY_DECISION_ID,
    kind: 'commodity',
    question: 'Which process makes this part?',
    why,
    options: routes.map(r => ({ ...ROUTES[r], leaning: leaning === r })),
    blockedFieldIds: [],
    blockedRuleIds: [],
    severity: 'blocking',
  };
}

/**
 * Infer the commodity, or ask.
 *
 * The three decisive signals, in the order `enforceGeometryCommodity` applies
 * them: measured bends at a sheet gauge; a large thin shell with no enclosed
 * void; a large thin shell that does enclose one.
 */
export function inferCommodity(ctx: RuleContext): CommodityVerdict {
  const g = ctx.geo;

  const answered = ctx.answers[COMMODITY_DECISION_ID];
  if (typeof answered === 'string' && ROUTES[answered]) {
    return { commodity: answered, basis: 'chosen by the engineer' };
  }

  if (g.status !== 'success' || g.fillRatio == null || !g.boundingBox) {
    return {
      decision: ask(
        'No fill ratio or bounding box was measured, so nothing about the shape '
        + 'narrows the process. This is the STL or text-parsed path.',
        ['machining', 'casting', 'sheet_metal', 'injection_moulding']),
    };
  }

  // Teeth first. A gear is not a rung on the fill ladder — a spur gear sits at
  // 62% fill, indistinguishable there from a forging or a machined blank — and
  // the tooth count is measured, not inferred, so nothing downstream improves
  // on it.
  const gear = looksLikeGear(g as { gear?: { likelyGear?: boolean; teeth?: number } }, ctx.filename);
  if (gear.gear) return { commodity: 'gear', basis: gear.basis };

  // A constant section, cut to length, is a profile before anything else: a
  // tube's bore makes it read as a closed tank to the enclosure probe, and its
  // round faces as bends (extrusion build). Extruded if polymer; a rubber seal
  // is extruded rubber; a metal one is bar or extrusion stock machined.
  const prof = extrusionProfile({ ...ctx, geo: g } as RuleContext) ?? kernelProfile(g);
  if (prof) {
    const names = partNames(ctx.filename, g);
    const named = processFromNames(names).route;
    const alu = /\b(alu|aluminium|aluminum|al ?\d{4}|[1-7]0\d\d[a-z]?)\b/i.test(names.map(n => n.text).join(' '));
    const lean = named && ROUTES[named] ? (named === 'extrusion' && alu ? 'aluminium_extrusion' : named)
      : alu ? 'aluminium_extrusion' : polymerFromNames(names) ? 'extrusion' : undefined;
    return {
      decision: ask(
        `${prof.basis} — extruded and cut to length. Aluminium on an extrusion press; a polymer on a screw `
        + 'line; a rubber profile is extruded rubber; or bar machined to shape.',
        [...new Set(['aluminium_extrusion', 'extrusion', 'rubber', 'machining', ...(named && ROUTES[named] ? [named] : [])])], lean),
    };
  }

  const fill = g.fillRatio;
  const wall = g.wallThickness?.meanMm ?? null;
  const maxDim = Math.max(g.boundingBox.xMm, g.boundingBox.yMm, g.boundingBox.zMm);

  // 0. A closed shell, measured by the kernel's enclosure probe, is a hollow
  //    route before anything else: a tank's rounded corners read as bend pairs,
  //    and step 1 used to send every tank — the real fuel tank included — to a
  //    pressing-or-moulding question with no blow or roto option on it
  //    (rotational-moulding review). Roto leans below 10,000 a year, where its
  //    cheap tools win; blow above, where its minute-long cycle does.
  if (enclosedShell(g) || cavityShell(g)) {
    const mx = Math.max(g.boundingBox.xMm, g.boundingBox.yMm, g.boundingBox.zMm);
    // A revolved cup up to 200 mm across may be an impact extrusion (cell cans,
    // capacitor and aerosol cans) — offered, never leaned (aluminium-extrusion build).
    const t = g.turning as { fraction?: number; maxDiaMm?: number } | undefined;
    const impactCup = (t?.fraction ?? 0) >= 0.9 && (t?.maxDiaMm ?? 0) > 0 && (t?.maxDiaMm ?? 0) <= 200;
    return {
      decision: ask(
        (enclosedShell(g)
          ? `A closed ${mx.toFixed(0)} mm shell (${Math.round((g.enclosure!.hitShare ?? 0) * 100)}% of rays from its centre `
            + 'meet a wall) — a tank or container.'
          : `A ${mx.toFixed(0)} mm thin shell with ${g.draftAnalysis!.cavityFaceCount} of its ${g.draftAnalysis!.analyzedFaceCount} `
            + 'measured faces facing an enclosed cavity — a tank or container (a saddle tank\'s centre sits outside it, so '
            + 'the ray probe alone cannot say).')
        + ` It cannot come out of a solid process; blow and rotational moulding `
        + 'both make it, and the annual volume decides which.'
        + (impactCup ? ` Fully revolved and ${g.turning!.maxDiaMm!.toFixed(0)} mm across: a metal can or cup is impact extruded.` : ''),
        ['blow_moulding', 'rotational_moulding', 'sheet_metal', ...(impactCup ? ['aluminium_extrusion'] : [])],
        ctx.annualVolume < 10_000 ? 'rotational_moulding' : 'blow_moulding'),
    };
  }

  // 1. Bends at a sheet gauge. A moulding has no measurable bend radius on a
  //    1.5 mm wall — this is the one thin-shell signal that is not ambiguous.
  //
  //    It IS ambiguous if the gauge is not the wall the part actually has. A
  //    pressing has one wall, so its gauge and its mean wall agree; a solid
  //    casting whose fillets were misread as bends reports a gauge many times
  //    thinner than its body. The geometry engine now measures the gauge from
  //    the mean wall so this cannot arise upstream, but geometry reaches here
  //    from a cache and from files measured by an older engine, so the
  //    contradiction is refused here too rather than trusted twice.
  const sm = g.sheetMetal;
  const gauge = sm?.thicknessMm ?? 0;
  const meanWall = g.wallThickness?.meanMm ?? null;
  const gaugeIsTheBulkWall = meanWall == null || meanWall <= GAUGE_WALL_TOLERANCE * gauge;
  if (sm && (sm.bendCount ?? 0) >= 2 && gauge > 0 && gauge <= 6 && gaugeIsTheBulkWall) {
    // A moulded shell reads the same way: a uniform wall with filleted corners
    // has the concentric inner / outer radii a bend has. Found on a modelled
    // 2.5 mm ECU cover (12 "bends") and a 3 mm tray (8), both routed to
    // sheet metal without a question (moulding review, 2 Oct 2026). A pressing
    // carries no bosses, and a file that names another process outranks a
    // radius pattern — then it is a question, leaning on that evidence.
    const bosses = (g.featureTable ?? []).filter(r => r.kind === 'boss').reduce((n, r) => n + (r.count ?? 1), 0);
    const named = processFromNames(partNames(ctx.filename, g));
    const namedOther = named.route && named.route !== 'sheet_metal' ? named : null;
    // A polymer in the name is evidence against a pressing too (thermoforming
    // review: "… HDPE THERMOFORMED" and "… ABS" parts went to sheet metal).
    const polymer = polymerFromNames(partNames(ctx.filename, g));
    // Over 4 mm with bosses it is not a moulding either — injection moulding is designed to 1–4 mm (THICK_WALL_MM
    // above) — but a die-cast shell: a 5.9 mm aluminium gearbox housing with 20 filleted "bends" and bosses was offered
    // only injection moulding, sheet metal or thermoforming, leaning injection moulding (uploaded-parts review, Oct
    // 2026). Then casting is on the table, leaning on the part's own evidence (names, surface, measured holes).
    if (gauge > MOULDED_WALL_MAX_MM && bosses > 0 && !polymer && hollowVerdict(g) !== 'near-enclosed') {
      const lean = processLeaning(ctx, ['cast_and_machine', 'casting', 'injection_moulding', 'sheet_metal']);
      return {
        decision: ask(
          `${sm.bendCount} bend-like radius pairs at a ${gauge.toFixed(1)} mm wall with ${bosses} boss(es) — fillets on a `
          + `shell too thick to mould (injection moulding is designed to 1–${MOULDED_WALL_MAX_MM} mm) and with bosses a `
          + 'pressing does not have: a cast shell, most likely.'
          + (lean.evidence.length ? ` Evidence: ${lean.evidence.join('; ')}.` : ''),
          lean.routes, lean.leaning ?? 'cast_and_machine'),
      };
    }
    if (bosses > 0 || namedOther || polymer) {
      const lean = namedOther ? namedOther.route!
        : bosses > 0 ? 'injection_moulding'
        : ctx.annualVolume >= 50_000 ? 'injection_moulding' : 'thermoforming';
      const evidence = [
        bosses > 0 ? `${bosses} boss(es), which a pressing does not have` : '',
        namedOther ? `the file calls it ${namedOther.hits[0].label} ("${namedOther.hits[0].text}", ${namedOther.hits[0].where})` : '',
        polymer && !namedOther ? `the file names a polymer (${polymer.word}, "${polymer.text}", ${polymer.where})` : '',
      ].filter(Boolean).join('; ');
      // Geometry measured before the enclosure probe cannot say whether the
      // shell is closed; if it may be hollow, the hollow routes are offered
      // too (the real fuel tank is in this position), never leaned on.
      const mayBeHollow = !g.enclosure && hollowVerdict(g) === 'near-enclosed';
      return {
        decision: ask(
          `${sm.bendCount} bend-like radius pairs at a ${gauge.toFixed(1)} mm wall — a pressing, or a moulded shell `
          + `whose fillets read the same way. Against a pressing: ${evidence}.`,
          [...new Set(['injection_moulding', 'sheet_metal', 'thermoforming',
            ...(mayBeHollow ? ['blow_moulding', 'rotational_moulding'] : []),
            ...(namedOther ? [namedOther.route!] : [])])], lean),
      };
    }
    return {
      commodity: 'sheet_metal',
      basis: `${sm.bendCount} bends measured at a ${gauge.toFixed(1)} mm gauge`,
    };
  }

  const largeThinShell = fill < 0.03 && maxDim >= 250 && (wall == null || wall <= 10);
  // `near-enclosed` (a watertight thin container whose cavity has openings — a
  // fuel tank with a filler neck) must land in the HOLLOW branch: topology says
  // "no sealed void" for it, and routing a tank to injection/thermoform on that
  // technicality is the exact £216.97-sand-casting error class this exists for.
  const hv = hollowVerdict(g);
  // Measured enclosure outranks the fill-based verdict: a probe that found an
  // OPEN shell (the composites roof panel, the BIW inner panel) means it is no
  // container, whatever its fill (composites review).
  const sealed = g.topology?.available
    ? (g.topology.enclosesSealedVoid === true || enclosedShell(g) ? true
      // Conclusive only when the centre sits over the part (≥ 30% of rays
      // meet it): from beside a bent tube almost every ray misses (the blow
      // duct reads 8%), which says nothing about whether it is closed.
      : g.enclosure?.hitShare != null && g.enclosure.hitShare >= 0.3 ? false
      : hv === 'near-enclosed' ? true : (g.topology.enclosesSealedVoid ?? null))
    : null;
  // A process the file names is put on the table in the shell branches too.
  const namedRoute = processFromNames(partNames(ctx.filename, g)).route;
  const withNamed = (routes: string[], lean: string): [string[], string] =>
    namedRoute && ROUTES[namedRoute] ? [[...new Set([...routes, namedRoute])], namedRoute] : [routes, lean];

  // A hollow thin shell is a hollow route whatever its size. The branch used
  // to need ≥ 250 mm and < 3% fill, so a 220 mm washer reservoir at 6.5% fill
  // fell to the sparse-thin-wall rung and was offered sheet metal, injection
  // moulding and machining — blow moulding was not on the list (blow-moulding
  // review, 3 Oct 2026). The bulk wall 2·V/S keeps cored castings out.
  const bulkWall0 = (g.volume?.cm3 ?? 0) > 0 && (g.surfaceArea?.cm2 ?? 0) > 0
    ? shellWallEstimateMm(g.volume!.cm3, g.surfaceArea!.cm2) : wall;
  const hollowThinShell = fill < 0.20 && (bulkWall0 == null || bulkWall0 <= 10);
  // "Hollow" on the fill ratio alone — no sealed void, no enclosure probe ≥ 90 %, no face measured into a cavity — is
  // not evidence of a container: a 2.5 mm bumper fascia at 0.4 % fill reads the same and was offered only blow /
  // roto / sheet, leaning roto (uploaded-parts review, Oct 2026). Then the open-shell routes are offered too, and
  // the lean is only what the file's name says.
  const weakHollow = sealed === true && g.topology?.enclosesSealedVoid !== true && !enclosedShell(g) && !cavityShell(g)
    && hv === 'near-enclosed';
  if ((largeThinShell || hollowThinShell) && weakHollow) {
    const routes = ['injection_moulding', 'blow_moulding', 'rotational_moulding', 'thermoforming', 'sheet_metal'];
    const named = namedRoute && ROUTES[namedRoute] ? namedRoute : undefined;
    return {
      decision: ask(
        `A ${maxDim.toFixed(0)} mm thin shell at ${(fill * 100).toFixed(1)}% fill. Nothing measured says it is closed: `
        + 'no sealed void, the rays from its centre mostly miss it, and no face was found facing an enclosed cavity — so it '
        + 'may be an open moulding (a fascia, a cover) or a container. The shape does not settle which.',
        named ? [...new Set([...routes, named])] : routes, named),
    };
  }
  if ((largeThinShell || hollowThinShell) && sealed === true) {
    // A sealed cavity rules out every solid process — no core comes out. Which
    // hollow route it is depends on size and volume, which the shape does not say.
    return {
      decision: ask(
        `A ${maxDim.toFixed(0)} mm shell at ${(fill * 100).toFixed(1)}% fill enclosing a sealed `
        + 'void cannot come out of a solid process — there is no way to extract a core. '
        + 'Which hollow route depends on the size and the annual volume, not the shape.',
        ...withNamed(['blow_moulding', 'rotational_moulding', 'sheet_metal'],
          maxDim > 900 ? 'rotational_moulding' : 'blow_moulding')),
    };
  }

  if (largeThinShell && sealed === false) {
    // An open drape: not a solid process, and not blowable. Injection moulding
    // or thermoforming, and the volume decides which.
    return {
      decision: ask(
        `A ${maxDim.toFixed(0)} mm open drape at ${(fill * 100).toFixed(1)}% fill encloses no `
        + 'cavity, so it is neither a solid process nor a blown one. Injection moulding and '
        + 'thermoforming both make this shape; the volume and the surface finish decide.',
        ...withNamed(['injection_moulding', 'thermoforming', 'sheet_metal'],
          ctx.annualVolume >= 50_000 ? 'injection_moulding' : 'thermoforming')),
    };
  }

  // 2. Everything else is the prompt's fill ladder, and every rung of it names
  //    more than one route. Ask, with the rung as the reason.
  //
  //    Low fill does not mean thin walls: a knuckle or a bracket is sparse in
  //    its bounding box and 10+ mm thick. The bulk wall 2·V/S separates them —
  //    it is the characteristic thickness of the whole solid, and unlike the
  //    ray-cast mean it cannot read a cavity as wall. The ray-cast mean is the
  //    fallback when volume or surface area is missing.
  const vCm3 = g.volume?.cm3 ?? 0;
  const sCm2 = g.surfaceArea?.cm2 ?? 0;
  const bulkWall = vCm3 > 0 && sCm2 > 0 ? shellWallEstimateMm(vCm3, sCm2) : wall;
  const rung =
    fill < 0.20 && bulkWall != null && bulkWall > THICK_WALL_MM ? {
      why: `${(fill * 100).toFixed(0)}% fill but a ${bulkWall.toFixed(1)} mm bulk wall (2·V/S) — `
        + `sparse, yet too thick to press or mould.`,
      routes: ['casting', 'forging', 'cast_and_machine', 'machining'],
    } : fill < 0.20 ? {
      why: `${(fill * 100).toFixed(0)}% fill — a sparse thin-wall part.`,
      routes: ['sheet_metal', 'injection_moulding', 'machining'],
    } : fill < 0.40 ? {
      why: `${(fill * 100).toFixed(0)}% fill — moderate.`,
      routes: ['casting', 'cast_and_machine', 'machining'],
    } : fill < 0.65 ? {
      why: `${(fill * 100).toFixed(0)}% fill — semi-solid.`,
      routes: ['forging', 'casting', 'cast_and_machine'],
    } : {
      why: `${(fill * 100).toFixed(0)}% fill — near-solid.`,
      routes: ['machining', 'forging', 'cast_and_machine'],
    };

  // A flat plate (thinnest side ≤ 12 mm and under 8 % of the largest) is a profile cut or blanked from plate — laser,
  // fine blanking or a press — whatever its fill: the 5 mm × Ø271 chain sprocket was offered only casting or machining
  // and turned from Ø275 bar (uploaded-parts review, Oct 2026). Offered, not leaned on.
  const dimsSorted = [g.boundingBox.xMm, g.boundingBox.yMm, g.boundingBox.zMm].sort((a, b) => a - b);
  if (dimsSorted[0] <= 12 && dimsSorted[0] / dimsSorted[2] < 0.08 && !rung.routes.includes('sheet_metal')) {
    rung.routes = [...rung.routes, 'sheet_metal'];
    rung.why += ` A flat ${dimsSorted[0].toFixed(1)} mm plate ${dimsSorted[2].toFixed(0)} mm across: it may be cut or blanked from plate.`;
  }
  const lean = processLeaning(ctx, rung.routes);
  return {
    decision: ask(
      `${rung.why} The fill ratio narrows the field to these routes but does not choose `
      + 'between them: the same shape is cast at one volume and machined at another, and '
      + 'nothing in the geometry says which. This is a sourcing decision, not a measurement.'
      + (lean.evidence.length ? ` Evidence: ${lean.evidence.join('; ')}.` : ''),
      lean.routes, lean.leaning ?? undefined),
  };
}

/**
 * Which of the rung's routes the evidence points to, and why.
 *
 * Names first — a designer who called it a casting knew — then the surface: a
 * blended, free-form surface is net-shape (cast or forged), a prismatic one is
 * cut from solid. A cast or forged part with measured holes leans to the
 * "then machined" route, because those holes are finish operations. A route a
 * name points to but the rung did not list is offered as well: the name is
 * evidence enough to put it on the table, though never to answer for the
 * engineer.
 */
export function processLeaning(ctx: RuleContext, routes: string[]): { routes: string[]; leaning: string | null; evidence: string[] } {
  const g = ctx.geo;
  const evidence: string[] = [];
  const names = processFromNames(partNames(ctx.filename, g));
  const shape = netShapeSignal(g);
  const machinedAfter = hasMachinedFeatures(g);
  const castRoute = machinedAfter && routes.includes('cast_and_machine') ? 'cast_and_machine' : 'casting';
  let out = [...routes];
  let leaning: string | null = null;

  for (const h of names.hits) evidence.push(`${h.where} "${h.text}" reads as ${h.label}`);
  if (names.route) {
    const wanted = names.route === 'casting' ? castRoute : names.route;
    if (ROUTES[wanted] && !out.includes(wanted)) out = [wanted, ...out];
    if (ROUTES[wanted]) leaning = wanted;
  } else if (names.hits.length > 1) {
    evidence.push('the names point to different processes, so they settle nothing');
  }

  if (shape.kind) evidence.push(shape.basis);
  if (!leaning && shape.kind === 'net-shape') {
    leaning = ['cast_and_machine', 'casting', 'forging'].find(r => out.includes(r) && (r !== 'cast_and_machine' || machinedAfter))
      ?? ['casting', 'forging'].find(r => out.includes(r)) ?? null;
  } else if (!leaning && shape.kind === 'machined' && out.includes('machining')) {
    leaning = 'machining';
  } else if (leaning && shape.kind === 'machined' && leaning !== 'machining') {
    evidence.push(`the name and the surface disagree — the surface is prismatic, which is how a ${ROUTES[leaning].label.toLowerCase()} part looks only when it is machined all over`);
  }
  if (leaning && machinedAfter && leaning === 'cast_and_machine') evidence.push('holes were measured, the finish machining a casting carries');
  return { routes: out, leaning, evidence };
}

/**
 * A profile by the kernel's cross-section probe (aluminium-extrusion build):
 * a constant section that is long (≥ 3 × its section) or intricate (outline
 * long for its area — fins, chambers: a heat sink is cut short), or a long
 * section with material machined away (volume 60–98% of section × length).
 * The silhouette test above needs 8:1 and misses all three.
 */
function kernelProfile(g: RuleContext['geo']): { basis: string } | null {
  const ps = g.profileSection as Record<string, unknown> | null | undefined;
  if (!ps || typeof ps.areaMm2 !== 'number' || !(ps.areaMm2 > 0)) return null;
  const A = ps.areaMm2 as number; const P = ps.perimeterMm as number; const L = ps.lengthMm as number;
  const box = (ps.sectionBoxMm as number[] | undefined) ?? [];
  const cross = Math.max(...box, 1);
  const intricacy = P * P / (4 * Math.PI * A);
  const share = (ps.volumeShare as number | null) ?? 1;
  const long = L >= 3 * cross;
  if (ps.constant === true && (long || intricacy >= 6)) {
    return { basis: `a constant ${A.toFixed(0)} mm² section ${L.toFixed(0)} mm long (${ps.voids} void${ps.voids === 1 ? '' : 's'}, measured across the ${ps.axis} axis)` };
  }
  if (ps.constant !== true && L >= 4 * cross && share >= 0.6 && share < 0.98) {
    return { basis: `a ${A.toFixed(0)} mm² section ${L.toFixed(0)} mm long with ${((1 - share) * 100).toFixed(1)}% machined away — an extrusion, machined` };
  }
  return null;
}
