// ─────────────────────────────────────────────────────────────────────────────
// BrainSpark Horizon — full-vehicle BOM taxonomy (ICE / MHEV / PHEV / BEV).
//
// The "nothing missing" layer: a navigable commodity → assembly → component
// tree of the whole vehicle. It does NOT duplicate the technology register —
// each leaf is a query into it, and tests/foresight.test.mjs guarantees that
// EVERY leaf resolves to at least one technology (via matchTerms or the
// commodity classifier). Add a part here and CI forces the register to answer
// for it. Leaves are phrased the way cost engineers actually say them.
// ─────────────────────────────────────────────────────────────────────────────

export const BOM_TREE = {
  Powertrain: {
    'Engine structure': ['engine block', 'cylinder head', 'crankshaft', 'camshaft', 'variable valve timing', 'pistons and conrods', 'engine bearings', 'valve train', 'timing drive', 'dual mass flywheel', 'engine gaskets and seals', 'engine mounts'],
    'Air, fuel & boosting': ['air intake system', 'throttle body', 'turbocharger', 'intercooler', 'fuel injectors', 'fuel rail', 'high pressure fuel pump', 'fuel tank', 'carbon canister'],
    'Exhaust & aftertreatment': ['exhaust manifold', 'catalytic converter', 'gasoline particulate filter', 'scr system', 'diesel particulate filter', 'adblue tank and doser', 'muffler and silencer', 'exhaust pipes', 'lambda sensors'],
    'Engine auxiliaries': ['engine oil pump', 'engine water pump', 'engine thermostat', 'alternator', 'starter motor', 'belt drive and tensioner', 'engine cooling fan'],
    'Ignition & control': ['spark plugs', 'ignition coils', 'engine ecu', 'engine knock sensors'],
    'Hybrid & hydrogen': ['48v belt starter generator', '48v mhev battery', 'dedicated hybrid engine', 'range extender genset', 'fuel cell stack', 'hydrogen storage tank'],
  },
  EDU: {
    'Electric motor': ['stator assembly', 'stator winding', 'rotor assembly', 'rotor magnets', 'stator rotor lamination', 'motor shaft', 'motor housing', 'motor position sensor', 'motor cooling jacket'],
    'Inverter & power electronics': ['traction inverter', 'sic power module', 'inverter gate driver', 'dc link capacitor', 'inverter busbar', 'inverter housing'],
    'Gearbox & integration': ['reduction gearbox', 'edu gear set', 'park lock', 'e-axle assembly', 'edu housing'],
    'Charging electronics': ['onboard charger', 'dc-dc converter', 'charge port inlet'],
  },
  Battery: {
    'Cells & modules': ['battery cell', 'cell chemistry', 'battery module', 'cell contacting system', 'module housing'],
    'Pack structure': ['battery pack assembly', 'battery enclosure', 'battery tray', 'pack lid', 'cell to pack structure', 'pack seals', 'underbody protection plate'],
    'Electrics & safety': ['battery management system', 'cell sensing harness', 'hv busbar', 'hv contactor', 'pyro fuse', 'battery junction box', 'service disconnect', 'hv connectors', 'pressure relief vent', 'thermal propagation barrier'],
    'Thermal': ['battery cooling plate', 'battery heater', 'pack coolant circuit', 'immersion cooling'],
    'LV & lifecycle': ['12v battery', '48v battery', 'second life battery reuse', 'battery recycling'],
  },
  Chassis: {
    'Suspension': ['front subframe', 'rear subframe', 'control arm', 'wishbone', 'steering knuckle', 'coil spring', 'air spring', 'damper', 'adaptive damper', 'anti-roll bar', 'active roll control', 'suspension bushings'],
    'Steering': ['steering rack', 'eps power steering', 'steering column', 'steer-by-wire actuator', 'rear wheel steering'],
    'Braking': ['brake caliper', 'brake disc', 'brake pads', 'brake-by-wire unit', 'abs esc module', 'brake booster', 'electronic parking brake', 'brake pedal', 'pedal box', 'wheel speed sensor'],
    'Wheels & tyres': ['tyre', 'wheel rim', 'alloy wheel', 'aero wheel cover', 'tpms sensor', 'wheel bearing', 'central tyre inflation', 'carbon fibre wheel', 'airless tyre'],
  },
  Driveline: {
    'Transmissions': ['automatic transmission', 'dual clutch transmission', 'cvt transmission', 'dedicated hybrid transmission', 'torque converter', 'clutch pack', 'gear selector', 'transmission control unit'],
    '4x4 & shafts': ['transfer case', 'low range gearbox', 'propshaft', 'halfshaft', 'cv joint', 'differential', 'locking differential', 'axle disconnect', 'e-beam axle'],
  },
  BIW: {
    'Structure': ['underbody structure', 'floor panel', 'front rail', 'rear rail', 'a-pillar', 'b-pillar', 'rocker sill', 'cross car beam', 'dash panel structure', 'rear quarter panel'],
    'Crash management': ['front crash box', 'bumper beam', 'door intrusion beam', 'battery protection frame'],
    'Materials & joining': ['press hardened steel parts', 'aluminium castings', 'giga casting', 'magnesium casting', 'structural adhesive joints', 'tailored blanks', 'unboxed assembly'],
    'Closures structure': ['door structure', 'hood panel', 'tailgate structure', 'fender'],
  },
  Exterior: {
    'Front & rear end': ['front bumper fascia', 'rear bumper fascia', 'grille', 'illuminated front panel', 'active grille shutter', 'pop-up hood actuator', 'underbody aero panels', 'active aero flaps'],
    'Lighting': ['headlamp', 'matrix led module', 'tail lamp', 'fog lamp', 'light bar'],
    'Glazing & vision': ['windscreen', 'side glazing', 'panoramic roof glass', 'sunroof mechanism', 'rear glazing', 'door mirror', 'camera mirror', 'wiper system', 'washer system', 'rain light sensor'],
    'Trim & mechanisms': ['door handle', 'sealing system', 'roof rails', 'spoiler', 'wheel arch liner', 'solar roof panel', 'adaptive body surface'],
  },
  Interior: {
    'Cockpit': ['instrument panel', 'centre console', 'cockpit display', 'instrument cluster', 'head-up display', 'steering wheel', 'ambient lighting', 'air vents'],
    'Seating': ['seat frame', 'seat foam', 'seat trim cover', 'seat heater', 'seat ventilation', 'seat adjuster', 'rear executive seats'],
    'Trim & acoustics': ['door trim', 'headliner', 'carpet', 'nvh insulation', 'sun visor', 'natural fibre trim panels'],
    'Safety & restraint': ['airbag', 'curtain airbag', 'knee airbag', 'seatbelt', 'seatbelt pretensioner', 'isofix anchors', 'occupant sensing'],
    'Climate hardware': ['hvac unit', 'blower motor', 'evaporator', 'heater core', 'radiant heating panel', 'air purification filter'],
    'Doors & access': ['door module', 'window regulator', 'e-latch', 'power door drive'],
  },
  Electrical: {
    'E/E architecture': ['wiring harness', 'hv harness', 'hv cables', 'zonal controller', 'central computer', 'domain controller', 'ecu', 'fuse box', 'e-fuse', 'relay', 'connectors'],
    'ADAS sensing': ['front camera', 'surround cameras', 'radar sensor', 'imaging radar', 'lidar', 'ultrasonic sensor', 'thermal camera', 'driver monitoring camera'],
    'Connectivity': ['telematics unit', 'antenna', 'satellite module', 'v2x module', 'uwb digital key module', 'central gateway', 'e-call module'],
    'Infotainment & audio': ['infotainment head unit', 'audio amplifier', 'speakers', 'cabin microphones', 'wireless charging pad'],
    'Thermal system': ['heat pump', 'hvac compressor', 'ptc heater', 'radiator', 'condenser', 'cooling fan module', 'coolant valve module', 'coolant pump', 'refrigerant lines'],
    'Charging & power': ['charge port', 'charge flap actuator', 'bidirectional charger', 'wireless vehicle charging', 'automated charging robot'],
  },
};

/** Flat list of every BOM leaf with its path — powers tests and the UI. */
export function flattenBom() {
  const out = [];
  for (const [commodity, assemblies] of Object.entries(BOM_TREE)) {
    for (const [assembly, parts] of Object.entries(assemblies)) {
      for (const part of parts) out.push({ commodity, assembly, part });
    }
  }
  return out;
}
