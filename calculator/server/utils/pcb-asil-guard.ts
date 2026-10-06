/**
 * The ASIL is a classification by the model (Stage 1b), and it moves money: ASIL-C/D adds
 * burn-in to every board, a higher conformal-coat rate and a higher NRE tier. On the 360°
 * camera board (live run, 6 Oct 2026) the classifier returned ASIL-C with a rationale
 * describing an "automotive radar transceiver… radar target detection, Doppler processing"
 * — for a board whose parts list is an image sensor, an FPD-Link serializer and power
 * rails. The report printed it, and burn-in (£0.61 a board in China) was in the headline.
 *
 * Geometry is the ground truth for CAD; the parts list is the ground truth here. This guard
 * reads the BOM (no AI) and:
 *  - costs ASIL-C/D only when the parts list carries the hardware an ASIL-C/D design needs
 *    (a safety PMIC / SBC, a lockstep safety MCU); otherwise it costs ASIL-B and says so;
 *  - withholds a rationale that names a board function the parts list contradicts
 *    (radar text on a camera BOM, and the reverse), with the reason.
 * The claimed level is kept and shown; the engineer confirms against the safety concept.
 */
export type AsilLevel = 'QM' | 'ASIL-A' | 'ASIL-B' | 'ASIL-C' | 'ASIL-D' | 'Unknown';

type BomLine = { description?: unknown; partNumber?: unknown; componentType?: unknown; value?: unknown };

export type BoardFunction = 'camera' | 'radar' | 'lidar' | 'ecu' | 'unknown';

const text = (l: BomLine) => `${l.partNumber ?? ''} ${l.description ?? ''} ${l.componentType ?? ''} ${l.value ?? ''}`;

const CAMERA = /image ?sensor|cmos (image|sensor)|\bimager\b|\bAR0\d{3}|\bOX0\d|\bOV\d{4}|\bIMX\d{3}|\bISX\d{3}|serial[i]?[sz]er|FPD-?Link|\bGMSL|\bDS90UB9\d\d|\bMAX9\d{4}/i;
const RADAR = /\bradar\b|\bMMIC\b|\bAWR\d{4}|\bAWR2\d|\bTEF8\d{3}|\bMR300\d|\bCTRX|\bS32R\d|\bRXS816|\b77 ?GHz|\b79 ?GHz/i;
const LIDAR = /\blidar\b|\bSPAD\b|laser driver|\bVCSEL\b/i;
const ECU = /\bAURIX\b|\bTC[23]\d{2}|\bS32K\d|\bS32G\d|\bRH850|\bTMS570|\bSPC5\d|\bMPC57\d{2}/i;

/** What an ASIL-C/D design carries: an independent safety supply / watchdog, a lockstep safety MCU. */
const SAFETY_HW = /\bTLF3558\d|\bTLF3x?5584|\bFS8[45]\d*|\bFS6[5-9]\d*|\bFS4[5-9]\d*|\bMC3[34]FS|\bTPS6594|\bTPS65386|\bTPS653850|\bTLF4\d{3}|\bVR55\d\d|\bPF5\d{3}|\bPF8[12]00|\bSBC\b|safety (PMIC|SBC|MCU|monitor|supervisor)|lock-?step|\bAURIX\b|\bTC[23]\d{2}|\bS32K3\d|\bS32R\d|\bS32G\d|\bRH850|\bTMS570|window(ed)? watchdog|voltage supervisor/i;

/** The board's function as its parts list shows it. */
export function boardFunctionFromBom(bom: BomLine[]): BoardFunction {
  const all = (bom ?? []).map(text);
  if (all.some(t => RADAR.test(t))) return 'radar';
  if (all.some(t => LIDAR.test(t))) return 'lidar';
  if (all.some(t => CAMERA.test(t))) return 'camera';
  if (all.some(t => ECU.test(t))) return 'ecu';
  return 'unknown';
}

/** Board function a rationale describes. */
function functionInText(s: string): BoardFunction {
  if (/\bradar\b|doppler|\bMMIC\b|chirp|range[- ]doppler/i.test(s)) return 'radar';
  if (/\blidar\b|time[- ]of[- ]flight|point cloud/i.test(s)) return 'lidar';
  if (/\bcamera\b|image sensor|imager|surround[- ]view|vision/i.test(s)) return 'camera';
  return 'unknown';
}

export interface AsilGuardResult {
  /** What the classifier said. */
  claimed: AsilLevel;
  /** What the costing used. */
  costed: AsilLevel;
  rationale: string;
  safetyFunctions: string[];
  boardFunction: BoardFunction;
  /** The parts that support ASIL-C/D (empty when none). */
  safetyHardware: string[];
  /** Why the costed level or the rationale differs from the classifier's — empty when they agree. */
  notes: string[];
}

export function guardAsil(inp: { asil: AsilLevel; rationale?: string; safetyFunctions?: string[]; bom: BomLine[] }): AsilGuardResult {
  const bom = Array.isArray(inp.bom) ? inp.bom : [];
  const claimed = inp.asil ?? 'Unknown';
  const boardFunction = boardFunctionFromBom(bom);
  const safetyHardware = bom.filter(l => SAFETY_HW.test(text(l)))
    .map(l => String(l.partNumber || l.description || '').trim()).filter(Boolean).slice(0, 4);
  const notes: string[] = [];
  let costed = claimed;
  let rationale = String(inp.rationale ?? '').trim();
  let safetyFunctions = Array.isArray(inp.safetyFunctions) ? inp.safetyFunctions.map(String) : [];

  const said = functionInText(`${rationale} ${safetyFunctions.join(' ')}`);
  if (rationale && boardFunction !== 'unknown' && said !== 'unknown' && said !== boardFunction
      && !(said === 'camera' && boardFunction === 'ecu')) {
    notes.push(`The classifier described a ${said} module, but the parts list is a ${boardFunction} board — its description is withheld as inconsistent with the BOM.`);
    rationale = '';
    safetyFunctions = [];
  }

  if ((claimed === 'ASIL-C' || claimed === 'ASIL-D') && bom.length > 0 && safetyHardware.length === 0) {
    costed = 'ASIL-B';
    notes.push(`${claimed} was claimed from the photos, but the parts list has no safety PMIC / SBC or lockstep safety MCU that an ${claimed} design carries — costed at ASIL-B (no burn-in). Confirm the level against the safety concept; an ${claimed} answer adds burn-in and the higher NRE tier.`);
  }
  return { claimed, costed, rationale, safetyFunctions, boardFunction, safetyHardware, notes };
}
