import { Car, Cog, Flame, BatteryCharging, Settings2, Thermometer, Armchair, Lamp, CircuitBoard, Radar, Fuel, Sparkles, Rocket, Boxes, type LucideIcon } from 'lucide-react';

/**
 * Line icons for the vehicle systems, from the product's one icon family.
 * The catalogue's emoji (🚗 ⚙️ 🔥 ⚡) rendered on per-system gradient tiles —
 * a consumer-app idiom, a second icon language next to lucide, and glyphs
 * that differ by operating system. The emoji stay in the data (exports and
 * prompts use them); the interface uses these.
 */
export const SYSTEM_ICONS: Record<string, LucideIcon> = {
  biw: Car,
  chassis: Cog,
  'powertrain-ice': Flame,
  'powertrain-bev': BatteryCharging,
  transmission: Settings2,
  hvac: Thermometer,
  interior: Armchair,
  exterior: Lamp,
  electrical: CircuitBoard,
  adas: Radar,
  'fuel-emission': Fuel,
  'exterior-trim': Sparkles,
  'next-gen': Rocket,
};

export const systemIcon = (id: string): LucideIcon => SYSTEM_ICONS[id] ?? Boxes;
