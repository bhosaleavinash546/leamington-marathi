/**
 * Automotive software → vehicle map (Oct 2026, Chief Engineer review).
 *
 * Where each of the 54 software modules RUNS in an SUV: the ECUs, sensors, actuators and networks its code executes on
 * or controls. The screen draws these on a top-view SUV skeleton (src/ui/panels/sw-vehicle-skeleton.ts) and lights the
 * components of the modules being costed.
 *
 * This is a FUNCTIONAL allocation — CostVision engineering mapping of a typical premium SUV E/E architecture (domain
 * controllers + zonal controllers + an Ethernet backbone), not any one vehicle's wiring. It carries NO money: the map
 * never allocates £ to a component; a component lists the modules that run on it and their costs as computed.
 *
 * Coordinates are a 1000 × 470 top view, FRONT TO THE RIGHT; the driver's side (left-hand drive) is the upper half.
 */

import type { SWPowertrain } from './sw-should-cost.js';

export type SWComponentKind = 'ecu' | 'sensor' | 'actuator' | 'network' | 'energy' | 'hmi' | 'offboard';

export interface SWVehicleComponent {
  id:     string;
  label:  string;
  kind:   SWComponentKind;
  /** One marker per instance (four corner radars = four points). */
  points: [number, number][];
  /** Drawn as a region instead of markers (the traction battery). [x, y, w, h]. */
  rect?:  [number, number, number, number];
  /** Drivetrains that carry it; absent = every drivetrain. */
  powertrains?: SWPowertrain[];
  /** One line on what it is, shown on hover / focus. */
  what:   string;
}

const ICE_FAMILY: SWPowertrain[] = ['ICE', 'MHEV', 'PHEV'];
const HV: SWPowertrain[] = ['PHEV', 'BEV'];

export const SW_VEHICLE_COMPONENTS: SWVehicleComponent[] = [
  // ── Sensors (perimeter) ──
  { id: 'front_radar',   label: 'Front long-range radar', kind: 'sensor', points: [[958, 235]], what: '77 GHz long-range radar behind the bumper (ACC, AEB).' },
  { id: 'corner_radars', label: 'Corner radars ×4', kind: 'sensor', points: [[925, 78], [925, 392], [80, 78], [80, 392]], what: 'Short / mid-range corner radars (blind spot, cross traffic, lane change).' },
  { id: 'front_camera',  label: 'Front camera (windscreen)', kind: 'sensor', points: [[712, 235]], what: 'Forward multi-purpose camera at the top of the windscreen (lanes, signs, objects).' },
  { id: 'surround_cams', label: 'Surround-view cameras ×4', kind: 'sensor', points: [[955, 280], [45, 235], [652, 52], [652, 418]], what: 'Fisheye cameras in grille, tailgate and both mirrors (360° view, parking).' },
  { id: 'ultrasonics',   label: 'Ultrasonic sensors ×12', kind: 'sensor', points: [[946, 128], [958, 178], [958, 292], [946, 342], [54, 128], [42, 178], [42, 292], [54, 342]], what: 'Bumper ultrasonic park sensors.' },
  { id: 'dms_camera',    label: 'Driver-monitoring camera', kind: 'sensor', points: [[636, 160]], what: 'IR camera on the steering column (attention, drowsiness).' },
  { id: 'microphones',   label: 'Cabin microphones', kind: 'sensor', points: [[590, 235]], what: 'Overhead-console microphone array (voice, active noise control).' },
  // ── Domain / central compute ──
  { id: 'central_compute', label: 'Central vehicle computer', kind: 'ecu', points: [[540, 190]], what: 'High-performance computer running vehicle functions, OTA and service-oriented software.' },
  { id: 'adas_dc',       label: 'ADAS domain controller', kind: 'ecu', points: [[540, 285]], what: 'Perception, fusion and planning SoC for assisted driving and parking.' },
  { id: 'ivi',           label: 'Infotainment head unit', kind: 'ecu', points: [[625, 235]], what: 'IVI / cockpit SoC (Android Automotive or QNX).' },
  { id: 'gateway',       label: 'Central gateway', kind: 'ecu', points: [[600, 320]], what: 'Routes and firewalls traffic between domains; diagnostics entry point.' },
  { id: 'tcu',           label: 'Telematics unit + roof antenna', kind: 'ecu', points: [[345, 235]], what: 'LTE / 5G modem, GNSS and the shark-fin antenna.' },
  // ── Zonal / body ──
  { id: 'zone_front_left',  label: 'Zone controller front-left', kind: 'ecu', points: [[785, 105]], what: 'Zonal controller: local I/O, power distribution and actuators in its corner.' },
  { id: 'zone_front_right', label: 'Zone controller front-right', kind: 'ecu', points: [[785, 365]], what: 'Zonal controller: local I/O, power distribution and actuators in its corner.' },
  { id: 'zone_rear',     label: 'Zone controller rear', kind: 'ecu', points: [[160, 235]], what: 'Zonal controller for the rear of the vehicle.' },
  { id: 'bcm',           label: 'Body control module', kind: 'ecu', points: [[690, 320]], what: 'Locks, wipers, mirrors, interior and exterior lighting logic.' },
  { id: 'lighting',      label: 'Head / tail lamps', kind: 'actuator', points: [[932, 100], [932, 370], [68, 100], [68, 370]], what: 'Adaptive LED headlamps and rear lamps.' },
  { id: 'door_modules',  label: 'Door modules ×4', kind: 'actuator', points: [[560, 60], [385, 60], [560, 410], [385, 410]], what: 'Window lifts, locks, mirror and handle electronics.' },
  { id: 'uwb_anchors',   label: 'UWB / BLE key anchors', kind: 'sensor', points: [[470, 48], [470, 422], [108, 190]], what: 'Ultra-wideband and BLE anchors locating the phone key.' },
  { id: 'obd_port',      label: 'OBD-II port', kind: 'network', points: [[655, 120]], what: 'Diagnostic connector under the dashboard.' },
  // ── HMI ──
  { id: 'centre_display', label: 'Centre display', kind: 'hmi', points: [[668, 235]], what: 'Touchscreen in the centre stack.' },
  { id: 'cluster',       label: 'Instrument cluster', kind: 'hmi', points: [[668, 160]], what: 'Driver display behind the steering wheel.' },
  { id: 'hud',           label: 'Head-up display', kind: 'hmi', points: [[698, 160]], what: 'AR head-up display projector in the dashboard.' },
  { id: 'audio',         label: 'Amplifier + speakers', kind: 'actuator', points: [[140, 300], [610, 74], [410, 74], [610, 396], [410, 396]], what: 'Premium amplifier (DSP) in the boot and door speakers.' },
  // ── Chassis ──
  { id: 'brake_system',  label: 'Brake-by-wire / ESC', kind: 'actuator', points: [[868, 128]], what: 'Electro-hydraulic brake booster and stability control unit.' },
  { id: 'eps',           label: 'Electric power steering', kind: 'actuator', points: [[868, 342]], what: 'EPS rack motor and controller.' },
  { id: 'dampers',       label: 'Adaptive dampers ×4', kind: 'actuator', points: [[790, 32], [790, 438], [215, 32], [215, 438]], what: 'Continuously variable / active dampers at each wheel.' },
  { id: 'hvac',          label: 'HVAC module', kind: 'actuator', points: [[748, 235]], what: 'Blower, flaps and cabin climate actuators behind the dashboard.' },
  { id: 'thermal_loop',  label: 'Coolant loop / heat pump', kind: 'actuator', points: [[905, 235]], what: 'Pumps, valves, chiller and heat pump in the front end.' },
  // ── Powertrain ──
  { id: 'battery_pack',  label: 'HV traction battery', kind: 'energy', points: [[470, 235]], rect: [300, 120, 400, 230], powertrains: HV, what: 'High-voltage battery pack in the floor.' },
  { id: 'bms',           label: 'BMS master controller', kind: 'ecu', points: [[420, 235]], powertrains: HV, what: 'Battery management controller in the pack.' },
  { id: 'cell_monitors', label: 'Cell monitoring units', kind: 'sensor', points: [[340, 160], [340, 310], [470, 160], [470, 310], [600, 160], [600, 310]], powertrains: HV, what: 'Cell voltage / temperature front-ends on each module.' },
  { id: 'charge_port',   label: 'Charge port + on-board charger', kind: 'energy', points: [[105, 98]], powertrains: HV, what: 'CCS inlet, charge controller and on-board charger.' },
  { id: 'front_edu',     label: 'Front drive unit (inverter + motor)', kind: 'actuator', points: [[818, 270]], powertrains: ['BEV'], what: 'Front e-axle: inverter, motor and reduction gear.' },
  { id: 'rear_edu',      label: 'Rear drive unit (inverter + motor)', kind: 'actuator', points: [[230, 235]], powertrains: HV, what: 'Rear e-axle: inverter, motor and reduction gear.' },
  { id: 'engine',        label: 'Engine + engine ECU', kind: 'actuator', points: [[835, 200]], powertrains: ICE_FAMILY, what: 'Combustion engine and its control unit.' },
  { id: 'transmission',  label: 'Transmission + TCU', kind: 'actuator', points: [[765, 200]], powertrains: ICE_FAMILY, what: 'Gearbox and transmission control unit.' },
  { id: 'aftertreatment', label: 'Exhaust after-treatment', kind: 'actuator', points: [[620, 372], [330, 372]], powertrains: ICE_FAMILY, what: 'Catalyst / particulate filter / SCR and NOx sensors along the exhaust.' },
  { id: 'bsg_48v',       label: '48 V starter-generator + battery', kind: 'energy', points: [[878, 280], [260, 330]], powertrains: ['MHEV'], what: 'Belt starter-generator on the engine and the 48 V battery.' },
  // ── Network / off-board ──
  { id: 'backbone',      label: 'Ethernet backbone', kind: 'network', points: [], what: 'Automotive Ethernet linking the zones, gateway and central compute (CAN / LIN at the edges).' },
  { id: 'cloud',         label: 'Cloud back-end', kind: 'offboard', points: [[500, 462]], what: 'Off-vehicle services: OTA, data, fleet, voice, maps.' },
];

/** Backbone links drawn as lines (component id pairs). */
export const SW_BACKBONE_LINKS: [string, string][] = [
  ['zone_front_left', 'central_compute'], ['zone_front_right', 'gateway'], ['zone_rear', 'central_compute'],
  ['central_compute', 'gateway'], ['gateway', 'adas_dc'], ['central_compute', 'ivi'], ['central_compute', 'tcu'],
  ['zone_front_left', 'zone_front_right'], ['zone_rear', 'gateway'],
];

const ECUS_CLASSIC = ['bms', 'bcm', 'brake_system', 'eps', 'zone_front_left', 'zone_front_right', 'zone_rear', 'gateway', 'front_edu', 'rear_edu', 'engine', 'transmission'];
const HSM_ECUS = ['gateway', 'central_compute', 'adas_dc', 'ivi', 'tcu', 'bms'];

/** Module id → the components its software runs on / controls. Every SW_MODULES id must appear (tested). */
export const SW_MODULE_COMPONENTS: Record<string, string[]> = {
  bms_core:            ['bms', 'battery_pack', 'cell_monitors'],
  cell_balancing:      ['cell_monitors', 'battery_pack', 'bms'],
  soc_soh_soe:         ['bms', 'battery_pack', 'cloud'],
  thermal_mgmt:        ['thermal_loop', 'battery_pack', 'hvac', 'bms'],
  fast_charge:         ['charge_port', 'bms', 'cloud'],
  edu_control:         ['front_edu', 'rear_edu'],
  inverter_ctrl:       ['front_edu', 'rear_edu'],
  motor_ctrl:          ['front_edu', 'rear_edu'],
  regen_braking:       ['brake_system', 'front_edu', 'rear_edu'],
  camera_perception:   ['front_camera', 'surround_cams', 'adas_dc'],
  radar_processing:    ['front_radar', 'corner_radars', 'adas_dc'],
  ultrasonic:          ['ultrasonics', 'adas_dc'],
  sensor_fusion:       ['adas_dc', 'front_camera', 'front_radar', 'corner_radars'],
  path_planning:       ['adas_dc'],
  control_algos:       ['adas_dc', 'brake_system', 'eps'],
  driver_monitor:      ['dms_camera', 'adas_dc', 'cluster'],
  highway_assist:      ['adas_dc', 'front_camera', 'front_radar', 'eps', 'brake_system'],
  ivi_os:              ['ivi', 'centre_display'],
  navigation:          ['ivi', 'centre_display', 'tcu', 'cloud'],
  voice_assistant:     ['ivi', 'microphones', 'cloud'],
  tcu_software:        ['tcu', 'cloud'],
  connectivity_stack:  ['tcu', 'ivi'],
  hmi_framework:       ['centre_display', 'cluster', 'ivi'],
  body_control:        ['bcm', 'door_modules', 'lighting', 'zone_front_left', 'zone_front_right', 'zone_rear'],
  chassis_control:     ['brake_system', 'eps', 'dampers'],
  gateway_ecu:         ['gateway', 'backbone'],
  zonal_arch:          ['zone_front_left', 'zone_front_right', 'zone_rear', 'central_compute', 'backbone'],
  vehicle_motion:      ['central_compute', 'brake_system', 'eps', 'front_edu', 'rear_edu'],
  autosar_classic:     ECUS_CLASSIC,
  autosar_adaptive:    ['central_compute', 'adas_dc', 'gateway'],
  rtos:                ECUS_CLASSIC,
  diagnostics:         ['gateway', 'obd_port', 'backbone'],
  comm_stacks:         ['backbone', 'gateway', 'zone_front_left', 'zone_front_right', 'zone_rear'],
  time_sync:           ['backbone', 'gateway', 'adas_dc', 'central_compute'],
  secure_boot:         HSM_ECUS,
  encryption:          ['gateway', 'tcu', 'central_compute'],
  ids:                 ['gateway', 'tcu', 'central_compute', 'backbone'],
  secure_ota:          ['tcu', 'gateway', 'central_compute', 'cloud'],
  key_mgmt:            ['gateway', 'tcu', 'uwb_anchors', 'cloud'],
  ota_manager:         ['central_compute', 'tcu', 'gateway'],
  cloud_backend:       ['cloud', 'tcu'],
  data_pipeline:       ['tcu', 'central_compute', 'cloud'],
  fleet_mgmt:          ['cloud', 'tcu'],
  active_suspension:   ['dampers', 'front_camera', 'central_compute'],
  premium_audio:       ['audio', 'microphones', 'ivi'],
  park_assist:         ['surround_cams', 'ultrasonics', 'adas_dc', 'eps', 'centre_display'],
  climate_control:     ['hvac', 'thermal_loop', 'centre_display'],
  digital_key:         ['uwb_anchors', 'bcm', 'tcu', 'cloud'],
  ar_hud:              ['hud', 'ivi', 'front_camera'],
  engine_control:      ['engine'],
  transmission_control: ['transmission'],
  aftertreatment_obd:  ['aftertreatment', 'engine', 'obd_port'],
  hybrid_supervisor:   ['central_compute', 'engine', 'rear_edu', 'bms'],
  mhev_48v:            ['bsg_48v', 'engine'],
};

const BY_ID = new Map(SW_VEHICLE_COMPONENTS.map(c => [c.id, c]));

export function vehicleComponent(id: string): SWVehicleComponent | undefined { return BY_ID.get(id); }

/** Whether a component exists on this drivetrain. */
export function componentOnPowertrain(c: SWVehicleComponent, pt: SWPowertrain | undefined): boolean {
  return !c.powertrains || !pt || c.powertrains.includes(pt);
}

/** The components a module runs on, limited to the drivetrain's (an ICE engine module lights no e-axle). */
export function componentsForModule(moduleId: string, pt?: SWPowertrain): SWVehicleComponent[] {
  return (SW_MODULE_COMPONENTS[moduleId] ?? [])
    .map(id => BY_ID.get(id))
    .filter((c): c is SWVehicleComponent => !!c && componentOnPowertrain(c, pt));
}

/** The modules (ids) that run on a component, from the given list. */
export function modulesOnComponent(componentId: string, moduleIds: string[]): string[] {
  return moduleIds.filter(m => (SW_MODULE_COMPONENTS[m] ?? []).includes(componentId));
}
