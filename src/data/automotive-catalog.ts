import { System } from '../types';

export const AUTOMOTIVE_SYSTEMS: System[] = [
  {
    id: 'biw',
    name: 'Body-in-White (BIW)',
    category: 'body',
    description: 'Structural body shell including all welded metal panels and structural members',
    icon: '🚗',
    color: 'from-slate-600 to-slate-800',
    subassemblies: [
      {
        id: 'biw-front-structure',
        name: 'Front End Structure',
        description: 'Front rails, engine compartment, crash management system',
        icon: '🔧',
        parts: [
          { id: 'front-rail-lh', name: 'Front Side Rail LH', description: 'Left-hand front longitudinal rail' },
          { id: 'front-rail-rh', name: 'Front Side Rail RH', description: 'Right-hand front longitudinal rail' },
          { id: 'crash-can', name: 'Crash Can / Deformation Element', description: 'Energy absorbing front crash element' },
          { id: 'front-bumper-beam', name: 'Front Bumper Beam', description: 'Transverse front impact beam' },
          { id: 'engine-crossmember', name: 'Engine Crossmember', description: 'Powertrain mounting crossmember' },
        ],
      },
      {
        id: 'biw-roof',
        name: 'Roof Structure',
        description: 'Roof panel, bow reinforcements, panoramic frame',
        icon: '🏠',
        parts: [
          { id: 'roof-panel', name: 'Outer Roof Panel', description: 'Main outer roof skin panel' },
          { id: 'roof-bow-1', name: 'Front Roof Bow', description: 'Front transverse roof reinforcement' },
          { id: 'roof-bow-2', name: 'Rear Roof Bow', description: 'Rear transverse roof reinforcement' },
          { id: 'roof-rail-lh', name: 'Roof Rail LH', description: 'Left side roof structural rail' },
          { id: 'pano-frame', name: 'Panoramic Roof Frame', description: 'Structural frame for panoramic glass' },
        ],
      },
      {
        id: 'biw-floor',
        name: 'Floor Structure',
        description: 'Floor pan, sill, tunnel, crossmembers',
        icon: '⬛',
        parts: [
          { id: 'floor-pan-front', name: 'Front Floor Pan', description: 'Main front floor structural panel' },
          { id: 'floor-pan-rear', name: 'Rear Floor Pan', description: 'Main rear floor structural panel' },
          { id: 'tunnel', name: 'Transmission Tunnel', description: 'Central tunnel / high-voltage cable tunnel' },
          { id: 'sill-lh', name: 'Sill Assembly LH', description: 'Left rocker/sill structural assembly' },
          { id: 'floor-crossmember', name: 'Floor Crossmember', description: 'Lateral floor reinforcement' },
        ],
      },
      {
        id: 'biw-pillars',
        name: 'Pillars & Rings',
        description: 'A/B/C pillars, windshield header, rear header',
        icon: '🏛️',
        parts: [
          { id: 'a-pillar', name: 'A-Pillar Assembly', description: 'Front windshield pillar' },
          { id: 'b-pillar', name: 'B-Pillar Assembly', description: 'Center door pillar' },
          { id: 'c-pillar', name: 'C-Pillar Assembly', description: 'Rear quarter pillar' },
          { id: 'windshield-header', name: 'Windshield Header', description: 'Upper windshield frame' },
        ],
      },
    ],
  },
  {
    id: 'suspension',
    name: 'Suspension System',
    category: 'chassis',
    description: 'Front and rear suspension including arms, links, spring-damper units',
    icon: '⚙️',
    color: 'from-blue-600 to-blue-900',
    subassemblies: [
      {
        id: 'front-suspension',
        name: 'Front Suspension',
        description: 'Double wishbone / multi-link front suspension assembly',
        icon: '🔩',
        parts: [
          { id: 'upper-control-arm', name: 'Upper Control Arm', description: 'Upper wishbone / control arm' },
          { id: 'lower-control-arm', name: 'Lower Control Arm', description: 'Lower wishbone / control arm' },
          { id: 'knuckle', name: 'Steering Knuckle', description: 'Hub carrier / steering knuckle' },
          { id: 'front-coilover', name: 'Coilover Assembly', description: 'Integrated coil spring and damper' },
          { id: 'front-arb', name: 'Anti-Roll Bar', description: 'Front stabilizer bar and links' },
          { id: 'subframe-front', name: 'Front Subframe', description: 'Front suspension cradle / K-frame' },
        ],
      },
      {
        id: 'rear-suspension',
        name: 'Rear Suspension',
        description: 'Multi-link rear suspension assembly',
        icon: '🔩',
        parts: [
          { id: 'trailing-arm', name: 'Trailing Arm', description: 'Rear longitudinal control arm' },
          { id: 'upper-lateral-link', name: 'Upper Lateral Link', description: 'Rear upper transverse link' },
          { id: 'lower-lateral-link', name: 'Lower Lateral Link', description: 'Rear lower transverse link' },
          { id: 'toe-link', name: 'Toe Link', description: 'Rear toe control link' },
          { id: 'rear-coilover', name: 'Rear Coilover Assembly', description: 'Rear integrated spring-damper' },
          { id: 'rear-subframe', name: 'Rear Subframe', description: 'Rear suspension cradle' },
        ],
      },
      {
        id: 'wheels-tyres',
        name: 'Wheels & Tyres',
        description: 'Alloy wheels, tyres, hub bearings, brake disc',
        icon: '⭕',
        parts: [
          { id: 'alloy-wheel', name: 'Alloy Wheel Rim', description: 'Cast or forged aluminium wheel' },
          { id: 'tyre', name: 'Tyre Assembly', description: 'Run-flat or conventional tyre' },
          { id: 'hub-bearing', name: 'Wheel Hub Bearing Unit', description: 'Gen3 integrated hub bearing' },
          { id: 'brake-disc', name: 'Brake Disc', description: 'Vented cast iron brake rotor' },
        ],
      },
    ],
  },
  {
    id: 'battery-edu',
    name: 'Battery & EDU (EV)',
    category: 'ev',
    description: 'High-voltage battery pack, Electric Drive Unit, power electronics',
    icon: '⚡',
    color: 'from-green-600 to-emerald-900',
    subassemblies: [
      {
        id: 'battery-pack',
        name: 'Battery Pack',
        description: 'HV battery modules, BMS, cooling plates, enclosure',
        icon: '🔋',
        parts: [
          { id: 'battery-module', name: 'Battery Module', description: 'Cell group in module housing' },
          { id: 'battery-cell', name: 'Battery Cell (Prismatic/Cylindrical)', description: 'Individual Li-ion cell' },
          { id: 'bms', name: 'Battery Management System (BMS)', description: 'Cell monitoring and balancing PCB' },
          { id: 'battery-tray', name: 'Battery Tray / Enclosure', description: 'Structural HV battery housing' },
          { id: 'cooling-plate', name: 'Thermal Management Cooling Plate', description: 'Serpentine coolant cooling plate' },
          { id: 'hv-busbar', name: 'HV Busbar Assembly', description: 'High-voltage interconnect busbars' },
        ],
      },
      {
        id: 'electric-drive-unit',
        name: 'Electric Drive Unit (EDU)',
        description: 'E-motor, single-speed reducer, inverter',
        icon: '⚡',
        parts: [
          { id: 'e-motor', name: 'Permanent Magnet E-Motor', description: 'PMSM traction motor stator/rotor' },
          { id: 'gearbox-single', name: 'Single-Speed Reducer', description: 'Fixed ratio gear reduction unit' },
          { id: 'inverter', name: 'Power Inverter / PE Module', description: 'SiC MOSFET power inverter' },
          { id: 'ecu-edu', name: 'EDU Control Unit', description: 'Motor control and torque management ECU' },
        ],
      },
      {
        id: 'hv-system',
        name: 'HV Distribution & Charging',
        description: 'OBC, DCDC converter, HV junction box, cables',
        icon: '🔌',
        parts: [
          { id: 'obc', name: 'On-Board Charger (OBC)', description: 'AC/DC on-board charging unit' },
          { id: 'dcdc', name: 'DC/DC Converter', description: 'HV to 12V/48V power converter' },
          { id: 'hvjb', name: 'HV Junction Box', description: 'HV distribution and fusing module' },
          { id: 'hv-cable', name: 'HV Cable Assembly', description: 'Orange high-voltage shielded cable' },
        ],
      },
    ],
  },
  {
    id: 'powertrain-ice',
    name: 'Powertrain (ICE)',
    category: 'ice',
    description: 'Internal combustion engine, transmission, driveline',
    icon: '🔥',
    color: 'from-orange-600 to-red-900',
    subassemblies: [
      {
        id: 'engine',
        name: 'Engine Assembly',
        description: 'Cylinder block, head, valvetrain, ancillaries',
        icon: '🔧',
        parts: [
          { id: 'cylinder-block', name: 'Cylinder Block', description: 'Engine block casting (Al or CI)' },
          { id: 'cylinder-head', name: 'Cylinder Head Assembly', description: 'Head with valvetrain and cams' },
          { id: 'crankshaft', name: 'Crankshaft', description: 'Forged crankshaft assembly' },
          { id: 'pistons', name: 'Piston & Con-Rod Assembly', description: 'Piston, rings, and connecting rod' },
          { id: 'engine-mount', name: 'Engine Mount', description: 'Powertrain rubber-to-metal mount' },
        ],
      },
      {
        id: 'transmission',
        name: 'Transmission / Gearbox',
        description: 'DCT / AT / CVT gearbox assembly',
        icon: '⚙️',
        parts: [
          { id: 'gearbox-housing', name: 'Gearbox Housing', description: 'Cast aluminium gear housing' },
          { id: 'gear-cluster', name: 'Gear Cluster Assembly', description: 'Layshaft gears and synchronizers' },
          { id: 'clutch-pack', name: 'Clutch Pack Assembly', description: 'Wet clutch or torque converter' },
          { id: 'tcu', name: 'Transmission Control Unit (TCU)', description: 'Gearshift and clutch control ECU' },
        ],
      },
      {
        id: 'exhaust',
        name: 'Exhaust System',
        description: 'Manifold, catalyst, DPF, muffler, tailpipes',
        icon: '💨',
        parts: [
          { id: 'exhaust-manifold', name: 'Exhaust Manifold', description: 'Cast iron / SS exhaust manifold' },
          { id: 'twc', name: 'Three-Way Catalyst', description: 'Close-coupled catalytic converter' },
          { id: 'dpf', name: 'Diesel Particulate Filter (DPF)', description: 'DPF / GPF particulate filter' },
          { id: 'muffler', name: 'Rear Muffler', description: 'Sound attenuation rear silencer' },
        ],
      },
    ],
  },
  {
    id: 'interior',
    name: 'Interior Systems',
    category: 'interior',
    description: 'Dashboard, door panels, headliner, carpets, trim',
    icon: '🛋️',
    color: 'from-amber-600 to-amber-900',
    subassemblies: [
      {
        id: 'ip-dashboard',
        name: 'Instrument Panel (Dashboard)',
        description: 'IP carrier, airbag housing, display cluster, center stack',
        icon: '📊',
        parts: [
          { id: 'ip-carrier', name: 'IP Carrier / Cross-Car Beam', description: 'Main IP structural beam and carrier' },
          { id: 'instrument-cluster', name: 'Digital Instrument Cluster', description: 'LCD/OLED driver information display' },
          { id: 'center-display', name: 'Centre Touchscreen Display', description: 'Main HMI infotainment display' },
          { id: 'airbag-module', name: 'Passenger Airbag Module', description: 'Frontal airbag inflator and bag' },
          { id: 'ip-pad', name: 'IP Soft Pad / Cover', description: 'Foam-backed IP trim cover' },
        ],
      },
      {
        id: 'seats',
        name: 'Seat Systems',
        description: 'Front and rear seat structure, foam, trim, adjustment',
        icon: '💺',
        parts: [
          { id: 'seat-frame', name: 'Seat Frame Assembly', description: 'Steel/Al welded seat structure' },
          { id: 'seat-foam', name: 'Seat Cushion & Back Foam', description: 'Polyurethane foam comfort layer' },
          { id: 'seat-trim', name: 'Seat Trim Cover', description: 'Leather / Alcantara seat covering' },
          { id: 'seat-adjust', name: 'Power Adjust Mechanism', description: 'Motor-driven seat adjustment tracks' },
          { id: 'seat-heat', name: 'Seat Heating Element', description: 'Resistive wire heating pad' },
        ],
      },
      {
        id: 'door-trim',
        name: 'Door Trim Panels',
        description: 'Front and rear door inner trim, armrest, speaker grille',
        icon: '🚪',
        parts: [
          { id: 'door-carrier', name: 'Door Trim Carrier', description: 'Main door trim substrate' },
          { id: 'door-armrest', name: 'Door Armrest Pad', description: 'Foam and leather armrest assembly' },
          { id: 'door-pull', name: 'Door Pull Handle', description: 'Interior door opening handle' },
          { id: 'window-switch', name: 'Window Switch Bezel', description: 'Power window and mirror switch module' },
        ],
      },
    ],
  },
  {
    id: 'hvac',
    name: 'HVAC System',
    category: 'mechanical',
    description: 'Heating, ventilation, air conditioning for cabin and battery',
    icon: '❄️',
    color: 'from-cyan-600 to-cyan-900',
    subassemblies: [
      {
        id: 'hvac-unit',
        name: 'HVAC Core Unit',
        description: 'Evaporator, heater core, blower, mix flaps',
        icon: '🌡️',
        parts: [
          { id: 'hvac-housing', name: 'HVAC Housing', description: 'Polypropylene blower and distribution housing' },
          { id: 'evaporator', name: 'Evaporator Core', description: 'Aluminium brazed evaporator coil' },
          { id: 'heater-core', name: 'Heater Core', description: 'Aluminium coolant heater matrix' },
          { id: 'blower-motor', name: 'Blower Motor & Fan', description: 'DC blower motor with squirrel cage fan' },
          { id: 'blend-flap', name: 'Blend / Mode Flaps', description: 'Air distribution and temp blend flaps' },
        ],
      },
      {
        id: 'ac-refrigerant',
        name: 'Refrigerant Circuit',
        description: 'Compressor, condenser, expansion valve, receiver-dryer',
        icon: '💧',
        parts: [
          { id: 'compressor', name: 'A/C Compressor', description: 'Electric compressor (EV) / belt-driven (ICE)' },
          { id: 'condenser', name: 'Condenser Assembly', description: 'Front-end aluminium condenser' },
          { id: 'expansion-valve', name: 'Thermostatic Expansion Valve', description: 'TXV or electronic expansion valve' },
          { id: 'receiver-dryer', name: 'Receiver-Dryer', description: 'Refrigerant moisture removal unit' },
        ],
      },
    ],
  },
  {
    id: 'closures',
    name: 'Closures',
    category: 'body',
    description: 'Doors, hood, tailgate, liftgate assemblies',
    icon: '🚪',
    color: 'from-purple-600 to-purple-900',
    subassemblies: [
      {
        id: 'front-door',
        name: 'Front Door Assembly',
        description: 'Door outer, inner, glass, sealing, hinges, latch',
        icon: '🚗',
        parts: [
          { id: 'door-outer', name: 'Door Outer Panel', description: 'Pressed steel or aluminium outer skin' },
          { id: 'door-inner', name: 'Door Inner Panel', description: 'Stamped door inner structure' },
          { id: 'door-glass', name: 'Side Door Glass', description: 'Tempered side glazing' },
          { id: 'door-seal', name: 'Door Sealing System', description: 'Primary and secondary EPDM seals' },
          { id: 'door-latch', name: 'Door Latch Mechanism', description: 'Electronic or manual door latch' },
          { id: 'door-hinge', name: 'Door Hinge Assembly', description: 'Upper and lower door hinges' },
        ],
      },
      {
        id: 'liftgate',
        name: 'Power Liftgate',
        description: 'Liftgate outer, glass, power actuator, latch',
        icon: '🔼',
        parts: [
          { id: 'liftgate-outer', name: 'Liftgate Outer Panel', description: 'Rear liftgate skin panel' },
          { id: 'liftgate-strut', name: 'Power Strut Actuator', description: 'Electric liftgate actuator strut' },
          { id: 'rear-glass', name: 'Rear Heated Glass', description: 'Laminated rear window with defrost' },
          { id: 'liftgate-latch', name: 'Liftgate Latch', description: 'Electronic power latch mechanism' },
        ],
      },
    ],
  },
  {
    id: 'electrical',
    name: 'Electrical & Electronics (E/E)',
    category: 'electronics',
    description: 'ECUs, wiring harnesses, 12V power distribution, sensors',
    icon: '💡',
    color: 'from-yellow-600 to-yellow-900',
    subassemblies: [
      {
        id: 'wiring-harness',
        name: 'Wiring Harness',
        description: 'Main vehicle, engine, and body wiring harnesses',
        icon: '🔌',
        parts: [
          { id: 'main-harness', name: 'Main Body Harness', description: 'Primary vehicle routing harness' },
          { id: 'engine-harness', name: 'Engine / Powertrain Harness', description: 'Engine bay wiring loom' },
          { id: 'door-harness', name: 'Door Harness', description: 'Per-door wiring assembly' },
          { id: 'connectors', name: 'Connector Assemblies', description: 'USCAR / Delphi connector terminals' },
        ],
      },
      {
        id: 'ecu-network',
        name: 'ECU Network Architecture',
        description: 'Domain controllers, gateway, zone ECUs, sensors',
        icon: '🖥️',
        parts: [
          { id: 'vehicle-computer', name: 'Central Vehicle Computer', description: 'Domain controller / zonal ECU' },
          { id: 'gateway-ecu', name: 'Central Gateway ECU', description: 'CAN/Ethernet network gateway' },
          { id: 'adas-ecu', name: 'ADAS Fusion Controller', description: 'Sensor fusion processing unit' },
          { id: 'body-ecu', name: 'Body Control Module (BCM)', description: 'Comfort and body function ECU' },
        ],
      },
    ],
  },
  {
    id: 'adas',
    name: 'ADAS & Sensors',
    category: 'electronics',
    description: 'Cameras, radar, LiDAR, ultrasonic sensors for autonomous driving',
    icon: '👁️',
    color: 'from-indigo-600 to-indigo-900',
    subassemblies: [
      {
        id: 'perception-sensors',
        name: 'Perception Sensor Suite',
        description: 'Front camera, surround cameras, radar, LiDAR, ultrasonic',
        icon: '📡',
        parts: [
          { id: 'front-camera', name: 'Front Mono/Stereo Camera', description: 'Forward-facing ADAS camera module' },
          { id: 'surround-camera', name: 'Surround View Camera Set', description: '360-degree surround view cameras x4' },
          { id: 'front-radar', name: 'Front Long-Range Radar', description: '77GHz ACC/AEB front radar' },
          { id: 'corner-radar', name: 'Corner Radar Set', description: 'Blind-spot and cross-traffic radars x4' },
          { id: 'lidar', name: 'Roof LiDAR Module', description: 'Solid-state / spinning LiDAR unit' },
          { id: 'ultrasonic', name: 'Ultrasonic Sensor Set', description: 'Park assist ultrasonic sensors x12' },
        ],
      },
    ],
  },
  {
    id: 'thermal',
    name: 'Thermal Management',
    category: 'ev',
    description: 'Coolant loops, heat pump, chiller, thermal interface for battery and motors',
    icon: '🌡️',
    color: 'from-red-600 to-red-900',
    subassemblies: [
      {
        id: 'coolant-system',
        name: 'Coolant Circuit',
        description: 'Radiators, pumps, valves, coolant pipes',
        icon: '💧',
        parts: [
          { id: 'radiator', name: 'High-Temperature Radiator', description: 'Main engine / motor cooling radiator' },
          { id: 'ltr', name: 'Low-Temperature Radiator (LTR)', description: 'EV battery cooling low-temp radiator' },
          { id: 'coolant-pump', name: 'Electric Coolant Pump', description: 'Variable-speed electric water pump' },
          { id: 'thermal-valve', name: 'Thermal Management Valve', description: 'Multi-way coolant flow control valve' },
          { id: 'chiller', name: 'Refrigerant-Coolant Chiller', description: 'Battery chiller heat exchanger' },
        ],
      },
    ],
  },
  {
    id: 'paint',
    name: 'Paint & Surface Treatment',
    category: 'body',
    description: 'E-coat, primer, base coat, clear coat process and materials',
    icon: '🎨',
    color: 'from-pink-600 to-rose-900',
    subassemblies: [
      {
        id: 'paint-process',
        name: 'Paint Process',
        description: 'Zinc phosphate, E-coat, sealer, primer, base, clear coat',
        icon: '🖌️',
        parts: [
          { id: 'e-coat', name: 'Electrophoretic Coat (E-Coat)', description: 'Cathodic E-coat corrosion protection' },
          { id: 'primer-surfacer', name: 'Primer / Surfacer', description: 'Stone chip resistant primer coat' },
          { id: 'base-coat', name: 'Colour Base Coat', description: 'Waterborne base coat layer' },
          { id: 'clear-coat', name: 'Clear Coat / Lacquer', description: 'UV-resistant top clear coat' },
          { id: 'sealer', name: 'Cavity Wax / Seam Sealer', description: 'Seam sealing and cavity wax injection' },
        ],
      },
    ],
  },
];

export function getSystemById(id: string): System | undefined {
  return AUTOMOTIVE_SYSTEMS.find(s => s.id === id);
}

export function getSubassemblyById(systemId: string, subId: string) {
  const system = getSystemById(systemId);
  return system?.subassemblies.find(s => s.id === subId);
}

export function getPartById(systemId: string, subId: string, partId: string) {
  const sub = getSubassemblyById(systemId, subId);
  return sub?.parts.find(p => p.id === partId);
}
