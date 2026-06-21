/**
 * cost-executor.ts
 *
 * Bridges AI-provided params → cost engine → CostToolResult.
 * Used by the agentic loop in server/routes/agent.ts as the handler
 * for the `calculate_cost` Anthropic tool_use block.
 */

import { computeUniversalStack } from '../../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../../src/engine/rate-library.js';

import { computeMachiningDrivers }        from '../../src/engine/modules/machining.js';
import { computeSheetMetalDrivers }        from '../../src/engine/modules/sheet-metal.js';
import { computeSheetMetalFabDrivers }     from '../../src/engine/modules/sheet-metal-fab.js';
import { computeInjectionMouldingDrivers } from '../../src/engine/modules/injection-moulding.js';
import { computeBlowMouldingDrivers }      from '../../src/engine/modules/blow-moulding.js';
import { computeExtrusionDrivers }         from '../../src/engine/modules/extrusion.js';
import { computeThermoformingDrivers }     from '../../src/engine/modules/thermoforming.js';
import { computeRotationalMouldingDrivers } from '../../src/engine/modules/rotational-moulding.js';
import { computeCastingDrivers }           from '../../src/engine/modules/casting.js';
import { computeForgingDrivers }           from '../../src/engine/modules/forging.js';
import { computePaintingDrivers }          from '../../src/engine/modules/painting.js';
import { computeBIWDrivers }               from '../../src/engine/modules/biw-assembly.js';
import { computePCBFabDrivers }            from '../../src/engine/modules/pcb-fab.js';
import { computePCBADrivers }              from '../../src/engine/modules/pcba.js';
import { computeCastAndMachineDrivers }    from '../../src/engine/modules/cast-and-machine.js';
import { computeRubberDrivers }            from '../../src/engine/modules/rubber.js';
import { computeCompositeDrivers }         from '../../src/engine/modules/composites.js';
import { computeWiringHarnessDrivers }     from '../../src/engine/modules/wiring-harness.js';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface CostToolInput {
  commodity: string;
  params: Record<string, unknown>;
  partName?: string;
  overheadPct?: number;      // default 0.12
  marginPct?: number;        // default 0.08
  packagingPerPart?: number; // default 0.15
  logisticsPerPart?: number; // default 0.25
}

export interface CostToolResult {
  success: boolean;
  partName: string;
  commodity: string;
  breakdown: {
    rawMaterial: number;
    process: number;
    labour: number;
    tooling: number;
    packaging: number;
    logistics: number;
    overhead: number;
    margin: number;
  };
  total: number;
  factoryCost: number;
  topDrivers: Array<{ bucket: string; cost: number; pct: number }>;
  dfmOpportunities: string[];
  error?: string;
}

// ─── Commodity dispatch map ───────────────────────────────────────────────────

type ComputeFn = (inputs: Record<string, unknown>) => ReturnType<typeof computeMachiningDrivers>;

const COMMODITY_MAP: Record<string, ComputeFn> = {
  machining:            computeMachiningDrivers        as unknown as ComputeFn,
  sheet_metal:          computeSheetMetalDrivers        as unknown as ComputeFn,
  sheet_metal_fab:      computeSheetMetalFabDrivers     as unknown as ComputeFn,
  injection_moulding:   computeInjectionMouldingDrivers as unknown as ComputeFn,
  blow_moulding:        computeBlowMouldingDrivers      as unknown as ComputeFn,
  extrusion:            computeExtrusionDrivers         as unknown as ComputeFn,
  thermoforming:        computeThermoformingDrivers     as unknown as ComputeFn,
  rotational_moulding:  computeRotationalMouldingDrivers as unknown as ComputeFn,
  casting:              computeCastingDrivers           as unknown as ComputeFn,
  forging:              computeForgingDrivers           as unknown as ComputeFn,
  painting:             computePaintingDrivers          as unknown as ComputeFn,
  biw_assembly:         computeBIWDrivers               as unknown as ComputeFn,
  pcb_fab:              computePCBFabDrivers            as unknown as ComputeFn,
  pcba:                 computePCBADrivers              as unknown as ComputeFn,
  cast_and_machine:     computeCastAndMachineDrivers    as unknown as ComputeFn,
  rubber:               computeRubberDrivers            as unknown as ComputeFn,
  composites:           computeCompositeDrivers         as unknown as ComputeFn,
  wiring_harness:       computeWiringHarnessDrivers     as unknown as ComputeFn,
};

// ─── DFM opportunity generator ────────────────────────────────────────────────

function generateDfmOpportunities(
  breakdown: CostToolResult['breakdown'],
  total: number,
): string[] {
  if (total <= 0) return [];

  const pct = (v: number) => Math.round((v / total) * 100);
  const opportunities: string[] = [];

  const rmPct  = pct(breakdown.rawMaterial);
  const labPct = pct(breakdown.labour);
  const tolPct = pct(breakdown.tooling);
  const proPct = pct(breakdown.process);

  if (rmPct > 40) {
    opportunities.push(
      `Material cost dominates (${rmPct}%). Consider: lighter alloy, reduce part weight, improve yield`,
    );
  }
  if (labPct > 25) {
    opportunities.push(
      `Labour is a top driver (${labPct}%). Consider: higher cavitation, automation, lower-cost region`,
    );
  }
  if (tolPct > 20) {
    opportunities.push(
      `Tooling amortization high (${tolPct}%). Consider: higher volume commitment, family tooling`,
    );
  }
  if (proPct > 30) {
    opportunities.push(
      `Machine time high (${proPct}%). Consider: cycle time reduction, higher OEE target`,
    );
  }

  return opportunities;
}

// ─── Main executor ────────────────────────────────────────────────────────────

export function executeCalculateCost(input: CostToolInput): CostToolResult {
  const {
    commodity,
    params,
    partName = 'Part',
    overheadPct     = 0.12,
    marginPct       = 0.08,
    packagingPerPart = 0.15,
    logisticsPerPart = 0.25,
  } = input;

  try {
    const computeFn = COMMODITY_MAP[commodity];
    if (!computeFn) {
      return {
        success: false,
        partName,
        commodity,
        breakdown: { rawMaterial: 0, process: 0, labour: 0, tooling: 0, packaging: 0, logistics: 0, overhead: 0, margin: 0 },
        total: 0,
        factoryCost: 0,
        topDrivers: [],
        dfmOpportunities: [],
        error: `Unknown commodity: "${commodity}". Valid values: ${Object.keys(COMMODITY_MAP).join(', ')}`,
      };
    }

    // Call the commodity-specific driver function
    const drivers = computeFn(params);

    // Build the UniversalStackInput and run the cost stack
    const result = computeUniversalStack(
      {
        partName,
        rawMaterial:      drivers.rawMaterial,
        operations:       drivers.operations,
        tooling:          drivers.tooling,
        packagingPerPart,
        logisticsPerPart,
        overheadPct,
        marginPct,
      },
      DEFAULT_RATE_LIBRARY,
    );

    const bd = result.breakdown;
    const total = result.total;

    // Build top 3 cost drivers sorted descending
    const buckets: Array<{ bucket: string; cost: number }> = [
      { bucket: 'rawMaterial', cost: bd.rawMaterial },
      { bucket: 'process',     cost: bd.process     },
      { bucket: 'labour',      cost: bd.labour      },
      { bucket: 'tooling',     cost: bd.tooling     },
      { bucket: 'packaging',   cost: bd.packaging   },
      { bucket: 'logistics',   cost: bd.logistics   },
      { bucket: 'overhead',    cost: bd.overhead    },
      { bucket: 'margin',      cost: bd.margin      },
    ];

    buckets.sort((a, b) => b.cost - a.cost);
    const topDrivers = buckets.slice(0, 3).map(b => ({
      bucket: b.bucket,
      cost:   Math.round(b.cost * 100) / 100,
      pct:    total > 0 ? Math.round((b.cost / total) * 1000) / 10 : 0,
    }));

    const dfmOpportunities = generateDfmOpportunities(bd, total);

    return {
      success:   true,
      partName:  result.partName,
      commodity,
      breakdown: {
        rawMaterial: Math.round(bd.rawMaterial * 10000) / 10000,
        process:     Math.round(bd.process     * 10000) / 10000,
        labour:      Math.round(bd.labour      * 10000) / 10000,
        tooling:     Math.round(bd.tooling     * 10000) / 10000,
        packaging:   Math.round(bd.packaging   * 10000) / 10000,
        logistics:   Math.round(bd.logistics   * 10000) / 10000,
        overhead:    Math.round(bd.overhead    * 10000) / 10000,
        margin:      Math.round(bd.margin      * 10000) / 10000,
      },
      total:       Math.round(total           * 10000) / 10000,
      factoryCost: Math.round(result.factoryCost * 10000) / 10000,
      topDrivers,
      dfmOpportunities,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cost-executor] Error computing cost for commodity "${commodity}":`, message);
    return {
      success: false,
      partName,
      commodity,
      breakdown: { rawMaterial: 0, process: 0, labour: 0, tooling: 0, packaging: 0, logistics: 0, overhead: 0, margin: 0 },
      total: 0,
      factoryCost: 0,
      topDrivers: [],
      dfmOpportunities: [],
      error: message,
    };
  }
}
