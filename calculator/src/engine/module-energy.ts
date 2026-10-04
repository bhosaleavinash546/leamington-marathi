/**
 * Energy a commodity module uses — handed to the cost core as kWh, not £.
 *
 * Seven modules (casting melt, forging billet heating, polymer extrusion,
 * thermoforming, moulding resin drying, hot-stamping furnace, …) used to turn
 * kWh into £ themselves at whatever tariff they were given, and put the £ in the
 * material consumables. On the costing itself that was right; but anything that
 * re-costs the same part in ANOTHER country's book — the country comparison, the
 * PDF's country section, a scenario compared in its own country — kept the first
 * country's energy £. Handing the core kWh (`rawMaterial.energyKwh`) lets the
 * core price it at the tariff of whichever book costs the part, the way the
 * aluminium-extrusion module already did. Same bucket, same £ in the same book.
 *
 * A tariff the engineer TYPED is an override: it stays £, as before.
 */
import type { RawMaterialInput } from './types.js';

export type EnergyKwh = NonNullable<RawMaterialInput['energyKwh']>;
export type Fuel = 'electricity' | 'gas';

export interface ModuleEnergy {
  /** £ — only when a tariff was typed (an override); else 0. */
  gbp: number;
  /** kWh for the core to price at the costing book's tariff — when no tariff was typed. */
  kwh?: EnergyKwh;
}

export function moduleEnergy(kwh: number, fuel: Fuel, typedPricePerKwh: number | undefined, basis: string): ModuleEnergy {
  const k = Math.max(0, kwh);
  if (!(k > 0)) return { gbp: 0 };
  if (typedPricePerKwh != null) return { gbp: k * Math.max(0, typedPricePerKwh) };
  return { gbp: 0, kwh: { [fuel]: k, basis } };
}

/** Add two kWh records (either may be absent); bases are joined. */
export function addEnergy(a?: EnergyKwh, b?: EnergyKwh): EnergyKwh | undefined {
  if (!a) return b;
  if (!b) return a;
  const gas = (a.gas ?? 0) + (b.gas ?? 0), electricity = (a.electricity ?? 0) + (b.electricity ?? 0);
  return {
    ...(gas > 0 ? { gas } : {}), ...(electricity > 0 ? { electricity } : {}),
    basis: [a.basis, b.basis].filter(Boolean).join('; '),
  };
}

/**
 * Billet / austenitising furnace: what one kWh of heat into the part costs in
 * delivered fuel — a gas furnace burns 2.4 kWh of gas per kWh delivered, an
 * electric-resistance furnace 1.35 kWh of power, induction 1.0 (forging-advisor
 * `resolveFurnaceEnergyPricePerKwh` is the same table, priced).
 */
export const FURNACE_FUEL: Record<'gas' | 'electric-resistance' | 'induction', { fuel: Fuel; perKwhDelivered: number }> = {
  gas: { fuel: 'gas', perKwhDelivered: 2.4 },
  'electric-resistance': { fuel: 'electricity', perKwhDelivered: 1.35 },
  induction: { fuel: 'electricity', perKwhDelivered: 1.0 },
};
