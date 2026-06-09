import { System } from '../types';

export const AUTOMOTIVE_SYSTEMS: System[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. BODY-IN-WHITE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'biw',
    name: 'Body-in-White (BIW)',
    category: 'body',
    description: 'Complete welded body structure — upper & lower body, front/rear ends, closures, pillars, reinforcements',
    icon: '🚗',
    color: 'from-slate-500 to-slate-700',
    subassemblies: [
      {
        id: 'biw-upper',
        name: 'Upper Body Structure',
        description: 'Roof panel, roof bows, A/B/C/D pillars, header panels, windscreen surround',
        icon: '🏠',
        parts: [
          { id: 'roof-outer', name: 'Outer Roof Panel', description: 'Pressed steel/Al outer roof skin (typically 0.65–0.8mm steel)' },
          { id: 'roof-bow-front', name: 'Front Roof Bow', description: 'Transverse front roof reinforcement' },
          { id: 'roof-bow-centre', name: 'Centre Roof Bow', description: 'Mid-roof transverse reinforcement' },
          { id: 'roof-bow-rear', name: 'Rear Roof Bow', description: 'Rear transverse roof reinforcement' },
          { id: 'a-pillar-inner', name: 'A-Pillar Inner', description: 'Hot-stamped (PHS) windscreen pillar inner' },
          { id: 'a-pillar-outer', name: 'A-Pillar Outer / Reinforcement', description: 'A-pillar outer skin and crash reinforcement' },
          { id: 'b-pillar', name: 'B-Pillar Assembly (PHS)', description: 'Hot-stamped B-pillar with tailored blank / tailored thickness' },
          { id: 'c-pillar', name: 'C-Pillar Assembly', description: 'Rear quarter pillar — DP or PHS steel' },
          { id: 'd-pillar', name: 'D-Pillar Assembly (SUV)', description: 'Rearmost pillar on SUV/estate body style' },
          { id: 'windscreen-header', name: 'Windscreen Header', description: 'Upper windscreen frame — roll-formed or stamped' },
          { id: 'rear-header', name: 'Rear Header', description: 'Rear window upper frame reinforcement' },
          { id: 'roof-rail-lh', name: 'Roof Rail / Side Member LH & RH', description: 'Longitudinal roof side rails connecting pillars' },
          { id: 'pano-surround', name: 'Panoramic Roof Structural Frame', description: 'Opening surround reinforcement for panoramic glass' },
        ],
      },
      {
        id: 'biw-lower',
        name: 'Lower Body Structure',
        description: 'Floor pan (front/rear), sills, crossmembers, transmission tunnel, rocker reinforcements',
        icon: '⬛',
        parts: [
          { id: 'floor-front', name: 'Front Floor Pan', description: 'Main front floor pressed panel — often tailor-welded blank' },
          { id: 'floor-rear', name: 'Rear Floor Pan', description: 'Rear floor with spare wheel recess or EV battery tunnel' },
          { id: 'tunnel', name: 'Transmission/HV Tunnel', description: 'Centre tunnel — critical for rigidity and cable routing (EV)' },
          { id: 'sill-inner', name: 'Sill Inner (Rocker)', description: 'Structural inner sill — often roll-formed AHSS' },
          { id: 'sill-outer', name: 'Sill Outer Skin', description: 'Cosmetic sill outer panel' },
          { id: 'sill-reinf', name: 'Sill Reinforcement / Battery Protection', description: 'Extrusion or pressing for side-pole protection (EV)' },
          { id: 'floor-xmember-1', name: 'Front Seat Crossmember', description: 'Transverse floor beam at front seat position' },
          { id: 'floor-xmember-2', name: 'Rear Seat Crossmember', description: 'Transverse beam at rear seat front-edge' },
          { id: 'floor-xmember-3', name: 'Rear Crossmember', description: 'Rear floor transverse stiffener' },
        ],
      },
      {
        id: 'biw-front-end',
        name: 'Front End Module (FEM)',
        description: 'Front crash rails, engine bay, apron, strut towers, radiator/condenser support, front bumper beam',
        icon: '🔧',
        parts: [
          { id: 'front-rail-lh', name: 'Front Side Rail LH', description: 'Left longitudinal crash rail — typically AHSS or Al extrusion' },
          { id: 'front-rail-rh', name: 'Front Side Rail RH', description: 'Right longitudinal crash rail' },
          { id: 'crash-can-lh', name: 'Crash Can / Deformation Box LH', description: 'Energy-absorbing crush element (Al extrusion or injection moulded)' },
          { id: 'crash-can-rh', name: 'Crash Can / Deformation Box RH', description: 'Energy-absorbing crush element RH' },
          { id: 'front-bumper-beam', name: 'Front Bumper Beam', description: 'Transverse impact beam — roll-formed AHSS or Al extrusion' },
          { id: 'strut-tower-lh', name: 'Strut Tower / Wheelhouse LH', description: 'Front suspension upper mount and inner wheelhouse' },
          { id: 'strut-tower-rh', name: 'Strut Tower / Wheelhouse RH', description: 'Suspension upper mount RH' },
          { id: 'apron-lh', name: 'Front Apron LH', description: 'Inner wing / engine bay side panel LH' },
          { id: 'apron-rh', name: 'Front Apron RH', description: 'Inner wing RH' },
          { id: 'front-xmember-upper', name: 'Upper Front Crossmember', description: 'Radiator/condenser upper support cross-car beam' },
          { id: 'front-xmember-lower', name: 'Lower Front Crossmember', description: 'Radiator lower support / aero deflector mount' },
          { id: 'engine-bay-xmember', name: 'Engine Bay Crossmember / K-Frame', description: 'Main powertrain mounting crossmember' },
          { id: 'front-subframe', name: 'Front Subframe / Cradle', description: 'Auxiliary frame for suspension and steering mounting' },
        ],
      },
      {
        id: 'biw-rear-end',
        name: 'Rear End Structure',
        description: 'Rear rails, wheelhouses, spare wheel recess, tailgate aperture, rear bumper beam',
        icon: '🔙',
        parts: [
          { id: 'rear-rail-lh', name: 'Rear Longitudinal Rail LH', description: 'Rear crash rail / longitudinal member LH' },
          { id: 'rear-rail-rh', name: 'Rear Longitudinal Rail RH', description: 'Rear crash rail RH' },
          { id: 'rear-crash-can-lh', name: 'Rear Crash Can LH', description: 'Rear energy absorber LH' },
          { id: 'rear-crash-can-rh', name: 'Rear Crash Can RH', description: 'Rear energy absorber RH' },
          { id: 'rear-bumper-beam', name: 'Rear Bumper Beam', description: 'Transverse rear impact beam' },
          { id: 'wheelhouse-rear-lh', name: 'Rear Wheelhouse Inner LH', description: 'Rear inner wheel arch pressing' },
          { id: 'wheelhouse-rear-rh', name: 'Rear Wheelhouse Inner RH', description: 'Rear inner wheel arch pressing RH' },
          { id: 'tailgate-aperture', name: 'Tailgate Aperture Frame', description: 'Structural frame surrounding liftgate opening' },
          { id: 'rear-subframe', name: 'Rear Subframe / Cradle', description: 'Rear suspension mounting auxiliary frame' },
          { id: 'spare-wheel-recess', name: 'Spare Wheel / Battery Load Floor', description: 'Rear load floor / spare recess / EV underfloor structure' },
        ],
      },
      {
        id: 'biw-closures',
        name: 'Closures — Doors, Hood, Tailgate',
        description: 'Front/rear door assemblies, hood/bonnet, power liftgate/tailgate, hinges, latches, seals',
        icon: '🚪',
        parts: [
          { id: 'front-door-outer', name: 'Front Door Outer Panel', description: 'Pressed steel or Al door skin — Class A surface' },
          { id: 'front-door-inner', name: 'Front Door Inner Panel', description: 'Structural door inner pressing' },
          { id: 'rear-door-outer', name: 'Rear Door Outer Panel', description: 'Rear door skin panel' },
          { id: 'rear-door-inner', name: 'Rear Door Inner Panel', description: 'Rear structural door inner' },
          { id: 'door-impact-beam', name: 'Door Side-Impact Intrusion Beam', description: 'Roll-formed UHSS or Al extrusion beam inside door' },
          { id: 'door-hinge', name: 'Door Hinge Pair (Upper/Lower)', description: 'Forged or stamped steel hinges' },
          { id: 'door-latch', name: 'Door Latch / Release Mechanism', description: 'Electronic or cable-operated latch assembly' },
          { id: 'door-seal', name: 'Door Sealing System (Primary/Secondary)', description: 'EPDM extruded seals — primary and secondary line' },
          { id: 'hood-outer', name: 'Hood / Bonnet Outer Panel', description: 'Aluminium or steel hood outer skin' },
          { id: 'hood-inner', name: 'Hood Inner Frame', description: 'Aluminium or steel hood structural inner' },
          { id: 'hood-hinge', name: 'Hood Hinge & Prop Rod', description: 'Hood pivot hinges and support rod' },
          { id: 'liftgate-outer', name: 'Power Liftgate Outer Panel', description: 'Rear liftgate/tailgate outer skin' },
          { id: 'liftgate-strut', name: 'Power Liftgate Actuator Struts', description: 'Electric spindle drive actuator (pair)' },
          { id: 'liftgate-latch', name: 'Liftgate Power Latch', description: 'Electronic power release latch' },
        ],
      },
      {
        id: 'biw-reinforcements',
        name: 'Reinforcements & NVH Treatments',
        description: 'Impact beams, gussets, structural foam, acoustic pads, body sealers',
        icon: '🛡️',
        parts: [
          { id: 'b-pillar-reinf', name: 'B-Pillar Inner Reinforcement', description: 'Additional crash load path reinforcement' },
          { id: 'gusset-a-pillar', name: 'A-Pillar Lower Gusset', description: 'Connection gusset A-pillar to sill' },
          { id: 'roof-reinf', name: 'Roof Crush Reinforcement Rings', description: 'Perimeter reinforcement for roof crush (NCAP)' },
          { id: 'structural-foam', name: 'Structural Foam Inserts (Pillar Fill)', description: 'Expandable epoxy foam for NVH and rigidity (Sika, Dow)' },
          { id: 'nvh-pads', name: 'Acoustic Deadening Pads', description: 'Bitumen-based or constrained layer damping pads' },
          { id: 'body-sealer', name: 'Body Seam Sealers & Cavity Wax', description: 'Extruded/applied seam sealers and wax injection' },
          { id: 'crash-sensor-bracket', name: 'Airbag & Crash Sensor Brackets', description: 'Stamped or cast sensor mounting brackets' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. CHASSIS & FRAME
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'chassis',
    name: 'Chassis & Frame',
    category: 'chassis',
    description: 'Subframes, suspension (front/rear), steering, braking, wheels & tyres, wheel-end',
    icon: '⚙️',
    color: 'from-blue-600 to-blue-800',
    subassemblies: [
      {
        id: 'front-suspension',
        name: 'Front Suspension System',
        description: 'Double wishbone or MacPherson strut — control arms, knuckle, spring/damper, ARB, subframe',
        icon: '🔩',
        parts: [
          { id: 'upper-control-arm', name: 'Upper Control Arm (Wishbone)', description: 'Forged Al or AHSS stamped upper arm — ball joint integrated' },
          { id: 'lower-control-arm', name: 'Lower Control Arm (Front)', description: 'Forged/cast Al or stamped steel lower wishbone' },
          { id: 'front-knuckle', name: 'Front Steering Knuckle / Hub Carrier', description: 'Al HPDC or forged knuckle with integrated ABS ring mount' },
          { id: 'front-coilspring', name: 'Front Coil Spring', description: 'Progressive or linear rate coil spring' },
          { id: 'front-damper', name: 'Front Damper / Shock Absorber', description: 'Twin-tube or monotube damper — adaptive if CDC/MRC' },
          { id: 'front-top-mount', name: 'Front Strut Top Mount', description: 'Rubber-to-metal top mount with bearing' },
          { id: 'front-arb', name: 'Front Anti-Roll Bar (ARB)', description: 'Hollow or solid steel ARB with drop links' },
          { id: 'front-arb-links', name: 'Front ARB Drop Links', description: 'Ball-joint ARB links' },
          { id: 'front-bushing', name: 'Control Arm Bushings (Set)', description: 'Hydro-bushing or rubber-metal bushings — NVH critical' },
          { id: 'front-subframe', name: 'Front Subframe / Cradle', description: 'Al HPDC or welded steel front suspension cradle' },
        ],
      },
      {
        id: 'rear-suspension',
        name: 'Rear Suspension System',
        description: 'Multi-link or air suspension — trailing arms, lateral links, knuckle, spring/damper, active ride height',
        icon: '🔩',
        parts: [
          { id: 'rear-upper-lateral', name: 'Rear Upper Lateral Link', description: 'Camber control arm — forged Al or stamped steel' },
          { id: 'rear-lower-lateral', name: 'Rear Lower Lateral Link', description: 'Load-bearing lateral arm' },
          { id: 'rear-toe-link', name: 'Rear Toe Link', description: 'Toe adjustment link — adjustable or fixed' },
          { id: 'rear-trailing-arm', name: 'Rear Trailing Arm', description: 'Longitudinal rear arm — high load path' },
          { id: 'rear-knuckle', name: 'Rear Knuckle / Hub Carrier', description: 'Al HPDC rear hub carrier — ABS, wheel bearing mounting' },
          { id: 'rear-coilspring', name: 'Rear Coil Spring or Air Spring', description: 'Coil spring or air bellows (active air suspension)' },
          { id: 'rear-damper', name: 'Rear Damper — CDC / Air Strut', description: 'Adaptive damper or integrated air strut' },
          { id: 'air-compressor', name: 'Air Suspension Compressor & Reservoir', description: 'Electric air compressor and pressure vessel (air susp. only)' },
          { id: 'rear-arb', name: 'Rear Anti-Roll Bar', description: 'Rear ARB with end links — active ARB on premium applications' },
          { id: 'rear-subframe', name: 'Rear Subframe / Cradle', description: 'Multi-link rear cradle — Al or welded steel' },
          { id: 'rws-module', name: 'Rear-Wheel Steering Actuator', description: 'Electric RWS actuator module for dynamic cornering' },
        ],
      },
      {
        id: 'steering',
        name: 'Steering System',
        description: 'EPS motor, rack & pinion, steering column, intermediate shaft, tie rods',
        icon: '🎯',
        parts: [
          { id: 'eps-motor', name: 'EPS Motor (Column / Rack-Assist)', description: 'BLDC or PMSM electric power steering motor' },
          { id: 'rack-pinion', name: 'Steering Rack & Pinion', description: 'Variable-ratio steering rack — may include REPS' },
          { id: 'steering-column', name: 'Collapsible Steering Column', description: 'Energy-absorbing column with steer-by-wire potential' },
          { id: 'intermediate-shaft', name: 'Intermediate Shaft', description: 'Cardan-joint shaft between column and rack' },
          { id: 'tie-rod', name: 'Tie Rod Assembly (L&R)', description: 'Ball-jointed tie rod and end — alignment critical' },
          { id: 'steering-ecu', name: 'EPS Control Unit', description: 'Steering ECU with torque/angle sensing' },
        ],
      },
      {
        id: 'braking',
        name: 'Braking System',
        description: 'Front/rear calipers, discs, brake booster, ABS/ESC modulator, EPB, brake pads',
        icon: '🛑',
        parts: [
          { id: 'front-caliper', name: 'Front Brake Caliper (Fixed/Floating)', description: 'Cast iron or Al 4/6-pot caliper — premium SUV may be fixed' },
          { id: 'rear-caliper', name: 'Rear Brake Caliper with EPB', description: 'Floating caliper with integrated electric park brake motor' },
          { id: 'front-disc', name: 'Front Brake Disc (Vented)', description: 'Vented cast iron rotor — or composite CCM on performance' },
          { id: 'rear-disc', name: 'Rear Brake Disc (Vented)', description: 'Vented rear rotor' },
          { id: 'brake-pads', name: 'Brake Pad Set (F&R)', description: 'Low-dust, low-noise pad compound — NAO or semi-metallic' },
          { id: 'abs-modulator', name: 'ABS/ESC Hydraulic Control Unit', description: 'ABS/ESC/TCS HCU with solenoid valves — Continental/Bosch' },
          { id: 'brake-booster', name: 'Brake Booster / iBooster / Vacuum', description: 'Vacuum servo or electric iBooster (EV brake-by-wire)' },
          { id: 'brake-master-cyl', name: 'Brake Master Cylinder', description: 'Tandem master cylinder with reservoir' },
          { id: 'epb-motor', name: 'Electric Park Brake (EPB) Actuator', description: 'Integrated in rear caliper or separate drum-in-hat' },
        ],
      },
      {
        id: 'wheels-tyres',
        name: 'Wheels & Tyres',
        description: 'Alloy wheels, tyres, TPMS, wheel hub bearing, brake dust shields',
        icon: '⭕',
        parts: [
          { id: 'alloy-wheel', name: 'Cast / Flow-Formed Alloy Wheel', description: '20–22" cast Al alloy (A356) or flow-formed for weight saving' },
          { id: 'tyre', name: 'Tyre (Run-Flat / Standard)', description: 'OEM-spec tyre: all-season or run-flat (RSC), typically 265/45 R21+' },
          { id: 'hub-bearing', name: 'Wheel Hub Bearing Unit (Gen3)', description: 'Gen3 integrated hub unit — double-row angular contact ball bearing' },
          { id: 'tpms-sensor', name: 'TPMS Sensor (Battery-Powered)', description: 'Direct TPMS transceiver in valve stem' },
          { id: 'wheel-nut', name: 'Wheel Nuts / Locking Bolts', description: 'M14×1.5 wheel fasteners — locking nut set' },
          { id: 'dust-shield', name: 'Brake Dust / Stone Shield', description: 'Pressed steel or PP dust shield behind disc' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. POWERTRAIN – ICE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'powertrain-ice',
    name: 'Powertrain — ICE',
    category: 'ice',
    description: 'Engine assembly, air intake, fuel system, exhaust, cooling, lubrication, forced induction, mounts',
    icon: '🔥',
    color: 'from-orange-600 to-red-700',
    subassemblies: [
      {
        id: 'engine-assembly',
        name: 'Engine Assembly',
        description: 'Block, cylinder head, pistons, crankshaft, camshaft, valvetrain, timing system',
        icon: '🔧',
        parts: [
          { id: 'cylinder-block', name: 'Cylinder Block (Al or CI)', description: 'Aluminium alloy (A319/A356) or cast iron block with liners' },
          { id: 'cylinder-head', name: 'Cylinder Head Assembly', description: 'Al alloy head with integrated valvetrain, cam carriers, ports' },
          { id: 'crankshaft', name: 'Crankshaft (Forged/Cast)', description: 'Forged steel or nodular iron crank with microalloyed steel' },
          { id: 'piston-conrod', name: 'Piston & Connecting Rod Set', description: 'Al alloy forged/cast piston + forged steel con-rod' },
          { id: 'camshaft', name: 'Camshaft Set (DOHC)', description: 'Steel or assembled hollow camshafts' },
          { id: 'valvetrain', name: 'Valvetrain (Valves, Springs, Lifters)', description: 'Engine valves, valve springs, tappets/hydraulic lifters' },
          { id: 'timing-chain', name: 'Timing Chain System', description: 'Chain, guides, tensioner, sprockets — phaser actuators' },
          { id: 'vvt-phaser', name: 'Variable Valve Timing (VVT) Phasers', description: 'Cam phaser for intake/exhaust cam timing adjustment' },
          { id: 'head-gasket', name: 'Multi-Layer Steel Head Gasket (MLS)', description: 'MLS gasket sealing block-to-head joint' },
          { id: 'engine-mount', name: 'Engine Mount (Rubber-to-Metal / Active)', description: 'Hydraulic or active engine mount for NVH isolation' },
        ],
      },
      {
        id: 'air-intake',
        name: 'Air Intake System',
        description: 'Airbox, snorkel, MAF sensor, throttle body, intake manifold, charge air',
        icon: '💨',
        parts: [
          { id: 'air-filter-box', name: 'Air Filter Housing (Airbox)', description: 'PP/PA injection-moulded air filter housing' },
          { id: 'air-filter', name: 'Panel Air Filter Element', description: 'Paper/foam-polyurethane panel filter' },
          { id: 'maf-sensor', name: 'Mass Airflow (MAF) Sensor', description: 'Hot-film anemometer MAF sensor — Bosch/Denso' },
          { id: 'intake-duct', name: 'Intake Duct Assembly', description: 'PP/EPDM flexible intake pipe with resonator' },
          { id: 'throttle-body', name: 'Electronic Throttle Body', description: 'Drive-by-wire throttle butterfly valve' },
          { id: 'intake-manifold', name: 'Intake Manifold (Al / PA66)', description: 'Al or PA66-GF30 variable-geometry intake manifold' },
        ],
      },
      {
        id: 'fuel-system',
        name: 'Fuel System',
        description: 'Fuel tank, pump module, fuel rail, injectors, fuel lines, fuel pressure regulator',
        icon: '⛽',
        parts: [
          { id: 'fuel-tank', name: 'Plastic Fuel Tank (HDPE/Multilayer)', description: '6-layer HDPE blow-moulded tank with anti-slosh baffles' },
          { id: 'fuel-pump-module', name: 'Fuel Pump Module', description: 'In-tank fuel pump with float sender and filter' },
          { id: 'fuel-rail', name: 'Fuel Rail (GDI High-Pressure)', description: 'GDI high-pressure fuel rail — stainless or Al — 200+ bar' },
          { id: 'gdi-injector', name: 'GDI Fuel Injectors (Set)', description: 'High-pressure GDI piezo or solenoid injectors' },
          { id: 'hpfp', name: 'High-Pressure Fuel Pump (GDI)', description: 'Cam-driven high-pressure fuel pump — GDI supply' },
          { id: 'fuel-lines', name: 'Fuel Line Assembly', description: 'Nylon/HDPE fuel supply and return lines' },
        ],
      },
      {
        id: 'exhaust-system',
        name: 'Exhaust System',
        description: 'Exhaust manifold, close-coupled catalyst, GPF/DPF, muffler, tailpipes',
        icon: '💨',
        parts: [
          { id: 'exhaust-manifold', name: 'Exhaust Manifold (Cast/Tubular)', description: 'Cast nodular iron or fabricated SS tubular manifold' },
          { id: 'cc-catalyst', name: 'Close-Coupled Three-Way Catalyst (TWC)', description: 'Pd/Rh washcoat on Al₂O₃ substrate — fast light-off' },
          { id: 'gpf', name: 'Gasoline Particulate Filter (GPF)', description: 'Cordierite or SiC GPF — EU7 requirement' },
          { id: 'dpf', name: 'Diesel Particulate Filter (DPF)', description: 'SiC wall-flow DPF with active regeneration (Diesel)' },
          { id: 'scr', name: 'Selective Catalytic Reduction (SCR)', description: 'Vanadium/zeolite SCR system with AdBlue dosing' },
          { id: 'flexi-pipe', name: 'Flexible Decoupling Pipe', description: 'SS braided flexi pipe isolating powertrain vibration' },
          { id: 'centre-silencer', name: 'Centre Silencer (Resonator)', description: 'Absorption/reflection silencer — sound tuning' },
          { id: 'rear-muffler', name: 'Rear Muffler & Tailpipes', description: 'Main rear silencer with twin/quad polished tailpipes' },
        ],
      },
      {
        id: 'engine-cooling',
        name: 'Engine Cooling System',
        description: 'Radiator, coolant pump, thermostat, coolant hoses, expansion tank, oil cooler',
        icon: '🌡️',
        parts: [
          { id: 'main-radiator', name: 'Engine Cooling Radiator', description: 'Al brazed tube-and-fin radiator — cross-flow or down-flow' },
          { id: 'coolant-pump', name: 'Coolant Pump (Mechanical/Electric)', description: 'Belt-driven or electrically-assisted coolant pump' },
          { id: 'thermostat', name: 'Electronic Thermostat / Map-Controlled', description: 'Electronic thermostat for optimised warm-up / temp map' },
          { id: 'coolant-hoses', name: 'Coolant Hose Set', description: 'EPDM rubber coolant hoses with clamps' },
          { id: 'expansion-tank', name: 'Coolant Expansion Tank', description: 'PP translucent expansion reservoir with pressure cap' },
          { id: 'engine-oil-cooler', name: 'Engine Oil Cooler', description: 'Plate heat exchanger in coolant circuit' },
        ],
      },
      {
        id: 'turbo-system',
        name: 'Forced Induction — Turbocharger',
        description: 'Turbocharger, intercooler (air-to-air or air-to-water), charge air pipes',
        icon: '🌀',
        parts: [
          { id: 'turbocharger', name: 'Turbocharger Assembly (VGT)', description: 'Variable-geometry turbine (VGT) or twin-scroll turbo' },
          { id: 'intercooler', name: 'Charge Air Cooler (WCAC/FMAC)', description: 'Water-cooled or front-mounted air-to-air intercooler' },
          { id: 'charge-pipe', name: 'Charge Air Pipe Set', description: 'Al/silicone boost pipes between turbo and intake' },
          { id: 'wastegate', name: 'Wastegate / Blow-Off Valve', description: 'Integral or external wastegate for boost regulation' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. POWERTRAIN – BEV / MHEV
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'powertrain-bev',
    name: 'Powertrain — BEV / MHEV',
    category: 'ev',
    description: 'Battery pack, EDU, HV system, thermal management, 48V MHEV, next-gen architectures',
    icon: '⚡',
    color: 'from-green-600 to-emerald-800',
    subassemblies: [
      {
        id: 'battery-pack',
        name: 'Battery Pack System',
        description: 'HV battery — modules/cells, BMS, HVJB, cooling plates, structural enclosure, crash protection',
        icon: '🔋',
        parts: [
          { id: 'battery-cell', name: 'Battery Cell (Prismatic/Cylindrical/Pouch)', description: 'Li-ion cell: NMC, LFP, NCA — prismatic (CATL), cylindrical 4680 (Tesla/Panasonic), pouch (LG/SK)' },
          { id: 'battery-module', name: 'Battery Module Assembly', description: 'Grouped cells in module housing with busbars and cell interconnects (CTP eliminates this level)' },
          { id: 'bms', name: 'Battery Management System (BMS)', description: 'Cell monitoring IC (AFE), BMS master/slave PCBs — voltage/temp/SOC/SOH management' },
          { id: 'hvjb', name: 'HV Junction Box (HVJB)', description: 'HV contactor assembly, precharge circuit, current sensor, fusing' },
          { id: 'battery-cooling-plate', name: 'Thermal Cooling Plate / Cold Plate', description: 'Al brazed serpentine cooling plate between module rows' },
          { id: 'battery-tray', name: 'Battery Enclosure / Structural Tray', description: 'Al extrusion/HPDC lower tray — structural, crash-compliant, IP67' },
          { id: 'battery-lid', name: 'Battery Pack Lid / Top Cover', description: 'Al sheet or SMC lid with sealing, safety venting' },
          { id: 'battery-side-crash', name: 'Side Crash Protection Extrusions', description: 'Al extrusion side impact guards integrated in sill/pack' },
          { id: 'cell-to-pack', name: 'Cell-to-Pack (CTP) Structure', description: 'Cells bonded directly into tray — eliminates module housings (CATL Qilin / BYD Blade)' },
        ],
      },
      {
        id: 'edu',
        name: 'Electric Drive Unit (EDU)',
        description: 'PMSM e-motor (hairpin winding), SiC inverter, single/2-speed gearbox, differential, integrated housing',
        icon: '⚡',
        parts: [
          { id: 'e-motor-stator', name: 'E-Motor Stator (Hairpin Winding)', description: 'Segmented or distributed hairpin-wound PMSM stator — copper fill factor 70–75%' },
          { id: 'e-motor-rotor', name: 'E-Motor Rotor & NdFeB Magnets', description: 'Interior permanent magnet (IPM) rotor with sintered NdFeB magnets — flux-barrier topology' },
          { id: 'e-motor-housing', name: 'E-Motor Housing & Cooling Jacket', description: 'Al HPDC housing with integrated water jacket — helical/spiral coolant channels' },
          { id: 'inverter-sic', name: 'SiC MOSFET Power Inverter Module', description: '800V/400V SiC inverter (Wolfspeed, Onsemi, STMicro) — gate driver, DC link cap, current sensor' },
          { id: 'inverter-dc-cap', name: 'DC Link Capacitor (Film)', description: 'Polypropylene film capacitor for DC bus smoothing' },
          { id: 'gearbox-single', name: 'Single-Speed Reduction Gearbox', description: 'Helical gear pair or planetary set — fixed ~9:1 ratio, oil-lubricated' },
          { id: 'gearbox-2speed', name: '2-Speed EV Gearbox (High Perf.)', description: '2-speed automated gearbox for extended range and performance' },
          { id: 'differential', name: 'Open / LSD / e-Differential', description: 'Open diff or torque-vectoring e-differential — integrated in gearbox' },
          { id: 'edu-housing', name: 'EDU Integrated 3-in-1 Housing', description: 'Common cast Al housing integrating motor + inverter + gearbox (3-in-1 e-axle)' },
          { id: 'edu-ecu', name: 'EDU Control Unit / VCU Interface', description: 'Motor controller ECU — torque demand, field weakening, regen' },
        ],
      },
      {
        id: 'hv-system',
        name: 'High-Voltage Distribution System',
        description: 'OBC, DC-DC converter, HV cables, connectors, contactors, HV PDU, 800V architecture',
        icon: '🔌',
        parts: [
          { id: 'obc', name: 'On-Board Charger (OBC) — 11/22kW', description: 'Bidirectional OBC (V2L/V2G capable) — 11kW or 22kW AC charging, SiC-based' },
          { id: 'dcdc', name: 'DC-DC Converter (HV→12V/48V)', description: 'Isolated DC-DC: 400/800V → 12V LV supply — 3.5–6kW, SiC/Si MOSFET' },
          { id: 'hv-pdu', name: 'HV Power Distribution Unit (PDU)', description: 'Central HV distribution with fuses, relays, contactors for all HV loads' },
          { id: 'hv-cable', name: 'HV Cable Harness (Orange, Shielded)', description: 'HV shielded orange cables — Al conductor or Cu — 400V/800V rated, IP67' },
          { id: 'hv-connector', name: 'HV Connector Set (Amphenol / TE)', description: 'Orange HV connectors with interlock — mating/unmating under load protection' },
          { id: 'ccs-inlet', name: 'DC Fast Charge Inlet (CCS2 / CHAdeMO)', description: 'Combined charging system inlet — supports 350kW DC (800V)' },
          { id: 'precharge-circuit', name: 'Pre-charge Relay & Resistor', description: 'Controlled pre-charge to protect inverter capacitors on startup' },
        ],
      },
      {
        id: 'mhev-48v',
        name: 'MHEV 48V System',
        description: 'Belt-starter generator (BSG), 48V lithium battery, DC-DC converter, P0 hybrid integration',
        icon: '🔋',
        parts: [
          { id: 'bsg', name: 'Belt-Starter Generator (BSG / RSG)', description: 'Belt-driven 48V PMSM motor/generator — 15–20kW peak — start-stop, boost, regen' },
          { id: '48v-battery', name: '48V Li-Ion Battery (LFP/NMC)', description: 'LFP or NMC 48V battery pack — 0.4–1.5kWh — air or liquid cooled' },
          { id: '48v-dcdc', name: '48V–12V DC-DC Converter', description: '48V to 12V step-down for LV loads — replaces alternator' },
          { id: 'ecat', name: 'Electric Catalytic Heating (eCAT)', description: 'Electrically heated catalyst for cold-start emission compliance (Euro 7)' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. TRANSMISSION & DRIVELINE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'transmission',
    name: 'Transmission & Driveline',
    category: 'mechanical',
    description: 'ICE automatic/DCT, BEV e-axle, transfer case, propshaft, half-shafts, CV joints, differentials',
    icon: '🔄',
    color: 'from-purple-600 to-violet-800',
    subassemblies: [
      {
        id: 'ice-gearbox',
        name: 'ICE Automatic / DCT Transmission',
        description: '8/9/10-speed automatic or dual-clutch transmission',
        icon: '⚙️',
        parts: [
          { id: 'gearbox-housing', name: 'Transmission Housing (Al HPDC)', description: 'Al die-cast gearbox casing — main housing, extension, bell housing' },
          { id: 'gear-set', name: 'Planetary Gear Sets', description: 'Ravigneaux / simple planetary gear sets — precision ground gears' },
          { id: 'clutch-packs', name: 'Clutch Pack Assemblies', description: 'Multi-plate wet clutch packs with separator plates — friction material critical' },
          { id: 'torque-converter', name: 'Torque Converter (Lock-Up)', description: 'Hydrodynamic torque converter with lock-up clutch — torsional vibration damper' },
          { id: 'mechatronics', name: 'Mechatronics Unit (TCU + Valve Body)', description: 'Integrated TCU and hydraulic valve body — solenoids for shift control' },
          { id: 'transmission-pump', name: 'Transmission Oil Pump', description: 'Mechanical gerator pump or electric oil pump (e-pump for stop-start)' },
          { id: 'transmission-oil-cooler', name: 'Transmission Oil Cooler', description: 'Air-cooled external cooler or coolant-to-oil heat exchanger' },
        ],
      },
      {
        id: 'driveline',
        name: 'Driveline — AWD / 4x4',
        description: 'Transfer case, propshaft, half-shafts, CV joints, e-lock differential',
        icon: '🔗',
        parts: [
          { id: 'transfer-case', name: 'Transfer Case (2-speed / Single-Speed)', description: 'Active AWD transfer case with multi-plate coupling or Torsen' },
          { id: 'propshaft-front', name: 'Front Propshaft', description: 'Front propeller shaft with rubber coupling and universal joints' },
          { id: 'propshaft-rear', name: 'Rear Propshaft', description: 'Rear propshaft — typically 2-piece with centre bearing' },
          { id: 'halfshaft-front', name: 'Front Half-Shafts (CV Joints)', description: 'Front driveshaft with Rzeppa outer CV and tripod inner CV' },
          { id: 'halfshaft-rear', name: 'Rear Half-Shafts (CV Joints)', description: 'Rear driveshaft with equal-length configuration' },
          { id: 'front-diff', name: 'Front Differential', description: 'Open or Torsen/e-diff front differential' },
          { id: 'rear-diff', name: 'Rear Differential (Torsen / eLSD)', description: 'Torsen or electronic LSD / torque-vectoring rear differential' },
          { id: 'elock', name: 'E-Lock Differential', description: 'Electronically controlled locking differential for off-road use' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. THERMAL & HVAC
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'hvac',
    name: 'Thermal & HVAC',
    category: 'mechanical',
    description: 'Cabin HVAC, refrigerant circuit, heat pump (BEV), battery thermal loop, filtration, rear HVAC',
    icon: '❄️',
    color: 'from-cyan-600 to-sky-800',
    subassemblies: [
      {
        id: 'hvac-core',
        name: 'HVAC Core Unit',
        description: 'Evaporator, heater core, blower motor, air distribution housing, blend/mode flaps',
        icon: '🌡️',
        parts: [
          { id: 'hvac-housing', name: 'HVAC Distribution Housing', description: 'PP injection-moulded blower/evap/heater housing — multi-zone capable' },
          { id: 'evaporator-core', name: 'Evaporator Core (Al Brazed)', description: 'Al multi-port extrusion (MPE) or tube-and-fin evaporator coil' },
          { id: 'heater-core', name: 'Heater Core (Al Brazed)', description: 'Al heater matrix — coolant-to-air heat exchanger' },
          { id: 'ptc-heater', name: 'PTC Electric Heater (BEV)', description: 'PTC (Positive Temperature Coefficient) electric supplemental heater for BEV' },
          { id: 'blower-motor', name: 'Blower Motor & Centrifugal Fan', description: 'BLDC brushless blower motor with squirrel cage fan — variable speed' },
          { id: 'blend-flap-actuators', name: 'Blend & Mode Flap Actuators', description: 'Stepper motor actuators for air distribution flaps — multi-zone' },
          { id: 'cabin-filter', name: 'Cabin Air Filter (HEPA/Activated C)', description: 'HEPA + activated carbon combi filter — PM2.5 / odour / pollen' },
        ],
      },
      {
        id: 'refrigerant-circuit',
        name: 'Refrigerant Circuit & Heat Pump',
        description: 'A/C compressor, condenser, TXV/EXV, receiver-dryer, heat pump valve block, chiller',
        icon: '💧',
        parts: [
          { id: 'ac-compressor', name: 'A/C Compressor (Electric — BEV / Belt — ICE)', description: 'Variable displacement scroll compressor (BEV: electric; ICE: belt-driven)' },
          { id: 'condenser', name: 'Condenser (Al MPE Brazed)', description: 'Front-end Al condenser — integrated with radiator module' },
          { id: 'txv-exv', name: 'Thermal / Electronic Expansion Valve (TXV/EXV)', description: 'TXV or EXV for refrigerant metering — EXV enables heat pump control' },
          { id: 'receiver-dryer', name: 'Receiver-Dryer / Accumulator', description: 'Moisture removal and liquid separation in refrigerant circuit' },
          { id: 'heat-pump-valve', name: 'Heat Pump Valve Block (BEV)', description: 'Multi-way valve manifold enabling heat pump and waste-heat recovery modes' },
          { id: 'refrigerant-chiller', name: 'Refrigerant-Coolant Chiller (BEV)', description: 'Brazed plate heat exchanger cooling battery loop via refrigerant' },
          { id: 'ac-lines', name: 'A/C Refrigerant Lines & Fittings', description: 'Al/SS refrigerant pipe set with quick-connect fittings — R1234yf' },
        ],
      },
      {
        id: 'rear-hvac',
        name: 'Rear HVAC Module',
        description: 'Second-row/third-row climate control unit',
        icon: '🔙',
        parts: [
          { id: 'rear-hvac-unit', name: 'Rear HVAC Evaporator/Heater Unit', description: 'Rear seat climate module with separate evap/heater and blower' },
          { id: 'rear-hvac-blower', name: 'Rear Blower Motor & Fan', description: 'Rear zone blower — often mounted under rear seat' },
          { id: 'rear-hvac-control', name: 'Rear Climate Control Panel', description: 'Rear passenger zone touch/button climate control' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. INTERIOR SYSTEMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'interior',
    name: 'Interior Systems',
    category: 'interior',
    description: 'Instrument panel, centre console, seats, door trims, headliner, floor, boot trim',
    icon: '🛋️',
    color: 'from-amber-600 to-orange-700',
    subassemblies: [
      {
        id: 'instrument-panel',
        name: 'Instrument Panel (Dashboard)',
        description: 'IP cross-car beam, digital cluster, centre touchscreen, airbag, soft pad, vents',
        icon: '📊',
        parts: [
          { id: 'ip-ccb', name: 'Cross-Car Beam (IP Structural Beam)', description: 'Mg/Al die-cast or steel tube IP carrier — steering column mount, airbag mount' },
          { id: 'ip-substrate', name: 'IP Main Substrate / Carrier', description: 'PP-GF injection-moulded main IP carrier — supports all sub-modules' },
          { id: 'ip-soft-pad', name: 'IP Soft Pad (Foam + Skin)', description: 'PU foam-backed slush-moulded PVC or genuine leather pad' },
          { id: 'digital-cluster', name: 'Digital Instrument Cluster (12–15")', description: 'OLED/LCD fully digital driver display — 12–15" format' },
          { id: 'centre-display', name: 'Central Touchscreen (12–15")', description: 'Main HMI capacitive touchscreen — curved or portrait format' },
          { id: 'hud', name: 'Head-Up Display (HUD)', description: 'Combiner or windscreen-projected HUD — AR-capable on premium' },
          { id: 'passenger-airbag', name: 'Passenger Airbag Module', description: 'Frontal passenger airbag — integrated in IP or above knee' },
          { id: 'hvac-vents', name: 'HVAC Air Vents (Set)', description: 'Centre, side and defrost vent set — twist or rotary style' },
          { id: 'steering-wheel', name: 'Heated Steering Wheel', description: 'Leather-trimmed heated steering wheel with controls' },
        ],
      },
      {
        id: 'seats',
        name: 'Seat Systems',
        description: 'Front/rear seat structure, foam, trim (leather/suede), heating/ventilation/massage, memory',
        icon: '💺',
        parts: [
          { id: 'seat-frame-front', name: 'Front Seat Frame Assembly', description: 'Welded steel or Al seat back and base frame — structural integrity to FMVSS202' },
          { id: 'seat-track', name: 'Seat Track / Power Adjuster', description: 'Motor-driven 8-way power adjust rails — memory position sensors' },
          { id: 'seat-foam-cushion', name: 'Seat Cushion & Backrest Foam', description: 'PU foam with zonal hardness — moulded contour for comfort/support' },
          { id: 'seat-trim', name: 'Seat Trim Cover (Leather / Nappa / Alcantara)', description: 'Full-grain Nappa leather or Alcantara facing — quilted pattern' },
          { id: 'seat-heating', name: 'Seat Heating Element (Carbon / Wire)', description: 'Carbon-fibre or resistance-wire heating pad — driver/passenger + rear row' },
          { id: 'seat-ventilation', name: 'Seat Ventilation System', description: 'Blower and perforated seat trim for airflow ventilation — summer cooling' },
          { id: 'seat-massage', name: 'Seat Massage System', description: 'Pneumatic bladder or motorised rollers for lumbar/back massage' },
          { id: 'rear-seat-frame', name: 'Rear Seat Frame & Fold Mechanism', description: '60:40 or 40:20:40 fold-flat mechanism — Al or steel frame' },
          { id: 'child-seat-isofix', name: 'ISOFIX Anchor & Top Tether System', description: 'ISOFIX lower anchors and top tether in rear seats' },
        ],
      },
      {
        id: 'door-trim',
        name: 'Door Trim Panels',
        description: 'Front/rear door inner panels, armrests, switch modules, speaker grilles, ambient lighting',
        icon: '🚪',
        parts: [
          { id: 'door-trim-carrier', name: 'Door Trim Carrier (Substrate)', description: 'PP-NF or PP-GF injection-moulded door trim main substrate' },
          { id: 'door-armrest-pad', name: 'Door Armrest with Leather Pad', description: 'Foam-backed leather armrest — soft-touch class A surface' },
          { id: 'door-switch-pack', name: 'Window & Mirror Switch Pack', description: 'Illuminated window/mirror/seat control switch module' },
          { id: 'speaker-grille', name: 'Door Speaker Grille', description: 'Woven textile or perforated metal grille for door speaker' },
          { id: 'ambient-light-strip', name: 'Ambient LED Light Strip', description: 'RGB LED ambient light strip in door — customisable colours' },
          { id: 'door-pull-handle', name: 'Interior Door Pull Handle', description: 'Chrome or anodised Al door pull — Class A finish' },
          { id: 'door-map-pocket', name: 'Door Map Pocket / Bin', description: 'Soft-lined storage pocket in lower door' },
        ],
      },
      {
        id: 'headliner-trim',
        name: 'Headliner & Pillar Trims',
        description: 'Roof headliner, A/B/C/D pillar trims, grab handles, sunvisors, overhead console',
        icon: '☁️',
        parts: [
          { id: 'headliner-board', name: 'Headliner Board (Fibre Composite)', description: 'Glass-fibre or natural-fibre composite headliner — cloth or suede facing' },
          { id: 'a-pillar-trim', name: 'A-Pillar Trim Cover', description: 'PP or ABS trim with fabric covering — airbag tear seam' },
          { id: 'b-pillar-trim', name: 'B-Pillar Trim Cover', description: 'PP trim cover — seatbelt guide integrated' },
          { id: 'grab-handles', name: 'Grab Handle Set (x4)', description: 'Passenger grab handles with return spring — soft insert optional' },
          { id: 'sunvisor', name: 'Sunvisor Set (Illuminated / Vanity)', description: 'Fabric-covered sunvisor with vanity mirror and LED lighting' },
          { id: 'overhead-console', name: 'Overhead Console / Roof Module', description: 'Overhead console with lighting, garage button, SOS, microphone' },
        ],
      },
      {
        id: 'centre-console',
        name: 'Centre Console',
        description: 'Console armrest, gear selector, wireless charging, storage, cup holders',
        icon: '🎛️',
        parts: [
          { id: 'console-structure', name: 'Centre Console Structural Housing', description: 'PP or ABS console main housing — storage, cup holders, shifter mount' },
          { id: 'console-armrest', name: 'Console Armrest Lid & Pad', description: 'Leatherette or leather-covered hinged armrest lid with storage' },
          { id: 'gear-selector', name: 'Gear Selector / Rotary Dial / E-Shift', description: 'Electronic gear selector: rotary, joystick, or e-shift lever' },
          { id: 'wireless-charger', name: 'Wireless Phone Charger (15W Qi)', description: 'Dual-coil 15W Qi wireless charger pad in console bin' },
          { id: 'usb-usbc-hub', name: 'USB-A / USB-C / 12V Socket Hub', description: 'Multi-port charging hub: 2× USB-C (45W) + USB-A + 12V' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. EXTERIOR SYSTEMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'exterior',
    name: 'Exterior Systems',
    category: 'body',
    description: 'Front/rear bumpers, lighting, mirrors, glass, panoramic roof, wipers',
    icon: '💡',
    color: 'from-yellow-500 to-yellow-700',
    subassemblies: [
      {
        id: 'bumpers',
        name: 'Bumper Systems (F&R)',
        description: 'Front/rear bumper fascia, energy absorber, beam, underbody spoilers',
        icon: '🚗',
        parts: [
          { id: 'front-fascia', name: 'Front Bumper Fascia (PP / SMC)', description: 'PP-EPDM injection-moulded or SMC fascia — Class A, painted' },
          { id: 'front-energy-abs', name: 'Front Energy Absorber (EPS/PP Foam)', description: 'Expanded PP (EPP) or EPE pedestrian impact absorber' },
          { id: 'front-bumper-beam-ext', name: 'Front Bumper Beam (Roll-Formed)', description: 'Roll-formed AHSS or Al extrusion impact beam' },
          { id: 'rear-fascia', name: 'Rear Bumper Fascia', description: 'PP-EPDM rear fascia — lower diffuser integrated on sporty variants' },
          { id: 'rear-energy-abs', name: 'Rear Energy Absorber', description: 'EPP foam rear pedestrian and low-speed impact absorber' },
          { id: 'underbody-spoiler', name: 'Front Underbody Spoiler / Aero Shield', description: 'PP aero diffuser for underbody airflow management and Cd reduction' },
        ],
      },
      {
        id: 'lighting',
        name: 'Lighting Systems',
        description: 'LED/Matrix/Pixel headlights, DRL, tail lamps, indicators, brake lights',
        icon: '💡',
        parts: [
          { id: 'headlight-unit', name: 'Full-LED / Matrix LED Headlight Unit', description: 'ADB (Adaptive Driving Beam) LED matrix headlight — DRL integrated' },
          { id: 'drl', name: 'Daytime Running Light (DRL) Strip', description: 'LED DRL — signature LED light guide strip, brand identity element' },
          { id: 'tail-lamp', name: 'Full-LED Tail Lamp Assembly', description: 'LED tail lamp with brake / indicator / reverse functions' },
          { id: 'front-fog', name: 'Front Fog / Auxiliary Lamp', description: 'LED front fog lamp — may include cornering or static bending function' },
          { id: 'headlight-ecu', name: 'Headlight Control Module / Levelling', description: 'Automatic levelling actuator + ECU for matrix beam control' },
          { id: 'ambient-exterior', name: 'Exterior Ambient / Puddle Lights', description: 'Welcome/puddle projector lights in mirror or door sill' },
        ],
      },
      {
        id: 'mirrors',
        name: 'Exterior Mirrors',
        description: 'Power fold, heated, auto-dim, camera, blind-spot indicator',
        icon: '🪞',
        parts: [
          { id: 'mirror-housing', name: 'Mirror Housing (PP)', description: 'PP injection-moulded mirror cap and base housing — colour-keyed' },
          { id: 'mirror-glass', name: 'Mirror Glass (Auto-Dim / Spotter)', description: 'Electrochromic auto-dimming mirror glass with integrated spotter' },
          { id: 'mirror-fold-motor', name: 'Power Fold Actuator Motor', description: 'DC motor for power folding — with memory position' },
          { id: 'mirror-camera', name: 'Side Camera Module (Camera Wing Mirror)', description: 'Camera-based wing mirror system — display in instrument cluster' },
          { id: 'bsm-indicator', name: 'Blind Spot Monitoring Indicator LED', description: 'LED warning lamp in mirror housing for BSM system' },
        ],
      },
      {
        id: 'glass-glazing',
        name: 'Glass & Glazing',
        description: 'Windscreen (acoustic/HUD), side glass, rear glass, sunroof/panoramic glass',
        icon: '🔲',
        parts: [
          { id: 'windscreen', name: 'Laminated Acoustic Windscreen', description: 'PVB-interlayer acoustic laminated glass — HUD-optimised geometry' },
          { id: 'front-side-glass', name: 'Front Side Door Glass (Frameless)', description: 'Tempered or laminated side glass — acoustic/frameless for premium' },
          { id: 'rear-side-glass', name: 'Rear Side Door Glass', description: 'Tempered rear door glass — privacy tint optional' },
          { id: 'quarter-glass', name: 'Fixed Quarter Light Glass', description: 'Fixed triangular quarter light glass' },
          { id: 'rear-screen', name: 'Heated Rear Screen', description: 'Laminated or tempered rear window with embedded heating wires' },
          { id: 'pano-glass', name: 'Panoramic Roof Glass (Laminated)', description: 'Large-area laminated glass with interlayer — electrochromic dimming optional' },
          { id: 'sunroof-mechanism', name: 'Panoramic Sunroof Tilt/Slide Mechanism', description: 'Motor-driven mechanism for tilt, slide, wind deflector, blind' },
        ],
      },
      {
        id: 'wipers-washers',
        name: 'Wiper & Washer System',
        description: 'Front/rear wipers, flat blades, rain sensor, washer jets, heated screen washer',
        icon: '🌧️',
        parts: [
          { id: 'wiper-mechanism', name: 'Front Wiper Mechanism (Tandem/Opposed)', description: 'Tandem or opposed-arm wiper drive mechanism with motor' },
          { id: 'wiper-blades', name: 'Flat Wiper Blade Set (Aero)', description: 'Aerodynamic flat wiper blades — driver-side larger 650–700mm' },
          { id: 'rain-sensor', name: 'Rain / Light Sensor Module', description: 'Optical rain + ambient light + solar sensor on windscreen' },
          { id: 'washer-pump', name: 'Washer Fluid Pump & Reservoir', description: 'Electric washer pump and 4–7L tank — heated fluid option' },
          { id: 'jet-nozzles', name: 'Jet Nozzles (Heated)', description: 'Heated pop-up or fixed washer nozzles — headlamp washers optional' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. ELECTRICAL & ELECTRONICS (E/E)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'electrical',
    name: 'Electrical & Electronics (E/E)',
    category: 'electronics',
    description: 'Wiring harnesses, ECU network, infotainment, connectivity, sensors, 12V system',
    icon: '🖥️',
    color: 'from-indigo-600 to-indigo-800',
    subassemblies: [
      {
        id: 'wiring-harness',
        name: 'Wiring Harness System',
        description: 'Body, engine, chassis, HV, door harnesses — copper and Al conductors',
        icon: '🔌',
        parts: [
          { id: 'main-body-harness', name: 'Main Body Wiring Harness', description: 'Central body harness routing power and signals — largest harness (30–50kg Cu)' },
          { id: 'engine-harness', name: 'Engine / Powertrain Harness', description: 'Engine bay loom — high-temp rated, oil resistant' },
          { id: 'chassis-harness', name: 'Chassis / Underbody Harness', description: 'ABS, brakes, suspension sensors routing — corrugated protection' },
          { id: 'door-harness', name: 'Door Harness Set (F&R)', description: 'Per-door loom with sliding contact via door grommet' },
          { id: 'hv-harness', name: 'HV Orange Harness (BEV)', description: 'High-voltage shielded orange cable assembly — Al or Cu conductor, 400/800V' },
          { id: 'flat-wire', name: 'Flat Wire / Flexi-PCB Harness (Next Gen)', description: 'Flat laminated wiring replacing round cables for weight/package savings' },
          { id: 'connectors-terminals', name: 'Connector & Terminal Set', description: 'USCAR / Delphi / Molex sealed connectors and crimped terminals' },
        ],
      },
      {
        id: 'ecu-architecture',
        name: 'ECU / E-Architecture',
        description: 'Central compute, domain controllers, zone ECUs, gateway, OTA capability',
        icon: '💻',
        parts: [
          { id: 'vehicle-computer', name: 'Central Vehicle Computer (High-Perf SoC)', description: 'NVIDIA Orin / Qualcomm Snapdragon / Mobileye — central compute for ADAS + infotainment' },
          { id: 'domain-controller', name: 'Domain Controller (Chassis / Body / PT)', description: 'Domain controllers replacing individual ECUs — Arm-based SoC' },
          { id: 'gateway-ecu', name: 'Central Gateway / Ethernet Switch', description: 'CAN-to-Ethernet gateway — cybersecurity firewall — OTA server' },
          { id: 'bcm', name: 'Body Control Module (BCM)', description: 'Lighting, wipers, locks, windows control ECU' },
          { id: 'pdu-12v', name: '12V Power Distribution Unit (PDU)', description: 'Smart PDU with electronic fuses — replaces traditional fuse box' },
          { id: '12v-battery', name: '12V AGM / LFP Battery', description: '12V AGM or LFP auxiliary battery — LFP saves weight on BEV' },
        ],
      },
      {
        id: 'infotainment',
        name: 'Infotainment & Connectivity',
        description: 'Head unit, amplifier, antennas, 5G/V2X modem, GPS, OTA, digital key',
        icon: '📱',
        parts: [
          { id: 'head-unit', name: 'Head Unit / IVI System', description: 'Android Auto/CarPlay compatible IVI — Snapdragon SoC — OTA updateable' },
          { id: 'amplifier', name: 'Premium Audio Amplifier (DSP)', description: 'Multi-channel DSP amplifier (Harman, Meridian, Bowers & Wilkins)' },
          { id: 'speakers', name: 'Speaker System (12–29 speakers)', description: 'Coaxial and component speaker set — subwoofer integrated' },
          { id: 'antenna-module', name: 'Antenna Module (Shark Fin / Integrated)', description: 'Integrated antenna: AM/FM/DAB + GPS + 5G + BT + WiFi' },
          { id: 'telematics-5g', name: 'Telematics Control Unit (5G/V2X)', description: '5G TCU with V2X (C-V2X / DSRC) capability — eCall, stolen vehicle, OTA' },
          { id: 'digital-key', name: 'Digital Key / UWB Module', description: 'UWB (Ultra-Wideband) precise positioning for hands-free digital key' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. ADAS & SAFETY SYSTEMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'adas',
    name: 'ADAS & Safety Systems',
    category: 'electronics',
    description: 'Cameras, radar, LiDAR, ultrasonic, airbags, seatbelts, ADAS fusion — Level 2+/3',
    icon: '👁️',
    color: 'from-violet-600 to-purple-800',
    subassemblies: [
      {
        id: 'perception-sensors',
        name: 'Perception Sensor Suite',
        description: 'Front/surround cameras, front long-range radar, corner radar, LiDAR, ultrasonics',
        icon: '📡',
        parts: [
          { id: 'front-camera-mono', name: 'Front Mono / Stereo Camera', description: 'Forward-facing monocular or stereo ADAS camera — AEB, LKA, TSR' },
          { id: 'surround-cameras', name: 'Surround View Camera Set (×4)', description: '1.3MP fisheye cameras × 4 for 360° surround view / parking assist' },
          { id: 'dms-camera', name: 'Driver Monitoring System (DMS) Camera', description: 'IR camera monitoring driver gaze/head pose — drowsiness alert — Euro NCAP 2026' },
          { id: 'front-lrr', name: 'Front Long-Range Radar (77 GHz)', description: '77GHz FMCW long-range radar — ACC, AEB, FCW — up to 250m range' },
          { id: 'corner-radars', name: 'Corner Radar Set (×4 — 77 GHz)', description: 'Short/mid-range 77GHz corner radars — BSM, RCTA, RCTB, PCA' },
          { id: 'lidar', name: 'Solid-State LiDAR Module', description: 'MEMS or FMCW solid-state LiDAR — roof or grille mounted — L2+/L3 ADAS' },
          { id: 'ultrasonics', name: 'Ultrasonic Sensor Array (×12)', description: '12 ultrasonic sensors front/rear/sides — parking sensors, low-speed AEB' },
        ],
      },
      {
        id: 'airbag-safety',
        name: 'Airbag & Passive Safety System',
        description: 'Frontal, side, curtain, knee airbags, inflators, ACU, crash sensors',
        icon: '🛡️',
        parts: [
          { id: 'driver-airbag', name: 'Driver Airbag Module (DAB)', description: 'Steering wheel-mounted driver frontal airbag — squib-fired inflator' },
          { id: 'passenger-airbag', name: 'Passenger Frontal Airbag (PAB)', description: 'IP-mounted passenger airbag — multi-stage inflator' },
          { id: 'side-airbags', name: 'Front Side Thorax Airbags (×2)', description: 'Seat-mounted side thorax/pelvis airbags — far-side airbag optional' },
          { id: 'curtain-airbags', name: 'Side Curtain Airbags / ICAs (×2)', description: 'Roof-rail mounted curtain/IC airbags — full row coverage' },
          { id: 'knee-airbags', name: 'Knee Airbags (×2)', description: 'Driver and passenger knee bolster airbags — lower extremity protection' },
          { id: 'acu', name: 'Airbag Control Unit (ACU)', description: 'ACU with satellite sensors — crash sensing, firing decision, data recording' },
          { id: 'crash-sensors-front', name: 'Frontal Crash Sensor (Upfront)', description: 'Upfront accelerometer sensors in front rails for early firing signal' },
          { id: 'seat-occupancy', name: 'Seat Occupancy / Weight Sensor', description: 'Capacitive or strain-gauge seat occupancy detection for airbag suppression' },
        ],
      },
      {
        id: 'seatbelt',
        name: 'Seatbelt System',
        description: 'Seatbelt assemblies, pretensioners, load limiters, buckle sensors',
        icon: '🔒',
        parts: [
          { id: 'seatbelt-front', name: 'Front Seatbelt with Pretensioner (×2)', description: 'Retractor with pyrotechnic pretensioner + adaptive load limiter (ALR/ELR)' },
          { id: 'seatbelt-rear', name: 'Rear Seatbelt Set (×3)', description: 'Rear outboard 3-point belts with pretensioner + lap belt centre' },
          { id: 'buckle-sensor', name: 'Buckle Sensor (Hall / Switch)', description: 'Electronic buckle switch for belt-reminder and airbag logic' },
          { id: 'belt-reminder', name: 'Seatbelt Reminder System (SBR)', description: 'Euro NCAP-rated SBR visual/acoustic warning system — all positions' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. FUEL & EMISSION SYSTEMS (ICE/MHEV)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'fuel-emission',
    name: 'Fuel & Emission Systems',
    category: 'ice',
    description: 'Fuel tank, lines, EVAP, SCR/DPF/NOx aftertreatment, AdBlue — ICE and MHEV',
    icon: '🌿',
    color: 'from-teal-600 to-green-700',
    subassemblies: [
      {
        id: 'fuel-tank-system',
        name: 'Fuel Storage & Delivery',
        description: 'Multi-layer plastic fuel tank, pump module, filler neck, cap-less system',
        icon: '⛽',
        parts: [
          { id: 'fuel-tank-plastic', name: 'Multilayer HDPE Fuel Tank', description: '6-layer HDPE tank (HDPE/adhesive/EVOH/adhesive/rHDPE/HDPE) — anti-slosh baffles, multi-port' },
          { id: 'filler-cap', name: 'Filler Cap (Capless System)', description: 'Capless filler neck with anti-rollover valve — reduces EVAP emissions' },
          { id: 'filler-neck', name: 'Filler Neck Assembly', description: 'PP or HDPE filler pipe with anti-siphon protection' },
          { id: 'fuel-level-sender', name: 'Fuel Level Sender Unit', description: 'Float-arm or magnetostrictive level sensor integrated in pump module' },
        ],
      },
      {
        id: 'evap-system',
        name: 'EVAP (Evaporative Emission Control)',
        description: 'Charcoal canister, purge valve, vapour lines — CARB/Euro 7 compliance',
        icon: '💨',
        parts: [
          { id: 'charcoal-canister', name: 'Activated Charcoal Canister (EVAP)', description: 'Activated carbon vapour canister — BLDC brushless purge valve — LEV III/CARB' },
          { id: 'purge-valve', name: 'EVAP Purge Solenoid Valve', description: 'Electric purge valve for canister regeneration — duty-cycle controlled' },
          { id: 'overfill-valve', name: 'Rollover / Overfill Limiter Valve (FLVV)', description: 'Float-operated fill-limit and rollover protection valve in tank' },
          { id: 'vapour-lines', name: 'EVAP Vapour Line Assembly', description: 'PA/HDPE multilayer vapour recovery lines with connectors' },
        ],
      },
      {
        id: 'nox-aftertreatment',
        name: 'NOx Aftertreatment (Diesel / Euro 7)',
        description: 'SCR, AdBlue dosing, DPF, NOx sensor, EGR — Euro 7 / US Tier 3 compliance',
        icon: '🌱',
        parts: [
          { id: 'scr-catalyst', name: 'SCR Catalyst Module (Cu-Zeolite)', description: 'Copper-zeolite SCR catalyst — converts NOx using AdBlue (urea) reduction' },
          { id: 'adblue-tank', name: 'AdBlue (DEF) Tank & Pump Module', description: 'Polyamide DEF tank with heating — typically 20–30L capacity' },
          { id: 'adblue-dosing', name: 'AdBlue Dosing Injector', description: 'Precision air-assisted AdBlue dosing injector upstream of SCR' },
          { id: 'dpf-filter', name: 'Diesel Particulate Filter (DPF)', description: 'SiC wall-flow DPF — active regeneration at 550°C+ catalyst temperature' },
          { id: 'nox-sensor', name: 'NOx Sensor (Upstream/Downstream SCR)', description: 'NOx + lambda combined sensor for OBD monitoring' },
          { id: 'egr-valve', name: 'EGR Valve & Cooler', description: 'High-pressure EGR valve with water-cooled EGR cooler for NOx in-cylinder control' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. EXTERIOR TRIM & ORNAMENTATION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'exterior-trim',
    name: 'Exterior Trim & Ornamentation',
    category: 'body',
    description: 'Grille, chrome trim, badges, wheel arch cladding, side steps, underbody protection',
    icon: '✨',
    color: 'from-gray-500 to-gray-700',
    subassemblies: [
      {
        id: 'grille-trim',
        name: 'Front Grille & Exterior Chrome',
        description: 'Radiator grille, chrome surround, active grille shutters, window trim',
        icon: '🔲',
        parts: [
          { id: 'front-grille', name: 'Front Radiator Grille (Upper/Lower)', description: 'ABS chrome-plated or gloss black injection-moulded grille with mesh inserts' },
          { id: 'active-grille', name: 'Active Grille Shutter (AGS)', description: 'Motorised grille fins for aero/thermal management — Cd reduction 0.008' },
          { id: 'window-surround', name: 'Window Surround Chrome Strip Set', description: 'Chrome-plated ABS or Al bright trim around door windows — "belt-line" feature line' },
          { id: 'door-cladding', name: 'Door Side Cladding / Moulding', description: 'PP body colour or black cladding along door lower section — scratch protection' },
        ],
      },
      {
        id: 'badges-emblems',
        name: 'Badges, Emblems & Decals',
        description: 'Brand logos, model nameplates, EV/PHEV badges, performance badges',
        icon: '🏷️',
        parts: [
          { id: 'front-badge', name: 'Front Brand Badge / Emblem', description: 'Chrome-plated ABS or illuminated front badge — adhesive-bonded' },
          { id: 'rear-badge', name: 'Rear Brand + Model Badge', description: 'Rear brand and model name badges — ABS chrome plated' },
          { id: 'ev-badge', name: 'EV / BEV / PHEV Designation Badge', description: 'Drive system designation badge — colour-coded (green, blue)' },
        ],
      },
      {
        id: 'cladding-protection',
        name: 'Wheel Arch & Underbody Protection',
        description: 'Wheel arch cladding, underbody shields, side steps, roof rails',
        icon: '🛡️',
        parts: [
          { id: 'wheel-arch-cladding', name: 'Wheel Arch Cladding Set (×4)', description: 'PP + EPDM wheel arch extensions — SUV styling, stone chip protection' },
          { id: 'underbody-shield', name: 'Underbody Shield Set (PP / Al)', description: 'Engine bay and gearbox underbody aerodynamic shields' },
          { id: 'side-steps', name: 'Running Boards / Deployable Steps', description: 'Fixed or powered deployable side steps — Al extrusion with PP tread' },
          { id: 'roof-rails', name: 'Roof Rails (Al Extrusion)', description: 'Longitudinal Al roof rails — static or raised — with cross-bar attachment points' },
          { id: 'tow-bar', name: 'Tow Bar & Trailer Socket', description: 'Retractable or detachable tow bar — 13-pin ISO trailer socket' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. ADVANCED NEXT-GEN SYSTEMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'next-gen',
    name: 'Advanced Next-Gen Systems',
    category: 'ev',
    description: 'Cutting-edge: 800V architecture, cell-to-body, 3-in-1 e-axle, torque-vectoring, air suspension, RWS, heat pump, predictive energy management, frunk',
    icon: '🚀',
    color: 'from-fuchsia-600 to-pink-800',
    subassemblies: [
      {
        id: '800v-architecture',
        name: '800V Charging Architecture',
        description: 'Ultra-fast 350kW DC charging, SiC-based HV system, bank-charging balancing',
        icon: '⚡',
        parts: [
          { id: '800v-sic-inverter', name: '800V SiC MOSFET Traction Inverter', description: '800V SiC MOSFET full-bridge inverter — Wolfspeed/Onsemi — 800V/400A rating' },
          { id: '800v-obc', name: '800V Bidirectional OBC (11/22kW)', description: 'V2L/V2G-capable OBC with 800V→AC bidirectional conversion' },
          { id: 'dc-boost', name: 'DC-DC Boost Converter (400→800V)', description: 'Boost converter for 400V charging compatibility with 800V pack' },
          { id: '800v-cable', name: '800V HV Cable (Al CCA Conductor)', description: 'Al conductor core HV cable rated for 800V — 20–30% lighter than Cu equiv.' },
        ],
      },
      {
        id: 'ctb-ctp',
        name: 'Cell-to-Pack / Cell-to-Body (CTP/CTB)',
        description: 'Structural battery integration — eliminating module housings, cells bonded to BIW',
        icon: '🔋',
        parts: [
          { id: 'structural-battery-tray', name: 'Structural Battery Pack Tray (CTB)', description: 'Battery floor doubles as vehicle floor — Al extrusion honeycomb — BYD / Tesla approach' },
          { id: 'ctp-cell-bonding', name: 'Cell-to-Pack Adhesive Bonding System', description: 'Thermally conductive structural adhesive bonding cells directly — eliminates module frame' },
          { id: 'battery-structural-lid', name: 'Structural Battery Lid (CTB)', description: 'Composite or Al structural lid forming vehicle floor surface — weight and cost savings' },
        ],
      },
      {
        id: 'integrated-eaxle',
        name: 'Integrated 3-in-1 / 5-in-1 e-Axle',
        description: 'Motor + inverter + gearbox + OBC + DC-DC in single thermal/housing solution',
        icon: '⚙️',
        parts: [
          { id: 'eaxle-3in1-housing', name: '3-in-1 e-Axle Integrated Housing', description: 'Single Al HPDC housing integrating motor, inverter, single-speed gearbox — shared lubrication/cooling' },
          { id: 'eaxle-5in1', name: '5-in-1 e-Axle (+ OBC + DC-DC)', description: '5-in-1 integrated unit adding OBC and DC-DC into motor housing — ultimate packaging efficiency' },
          { id: 'eaxle-torque-vector', name: 'Torque-Vectoring Dual-Motor e-Axle', description: 'Independent dual-motor rear axle with torque vectoring — active yaw control, no mechanical diff needed' },
        ],
      },
      {
        id: 'predictive-systems',
        name: 'Predictive & Intelligent Control Systems',
        description: 'Predictive energy management, thermal domain controller, active air suspension with road preview',
        icon: '🧠',
        parts: [
          { id: 'pems', name: 'Predictive Energy Management System (PEMS)', description: 'Cloud-connected PEMS using GPS + traffic + route data to optimise regen, SOC, HVAC pre-conditioning' },
          { id: 'thermal-domain-ctrl', name: 'Thermal Domain Controller (TDC)', description: 'Centralised TDC managing all thermal loops: battery, cabin, motor — single ECU replacing multiple' },
          { id: 'active-air-suspension', name: 'Active Air Suspension with Road Preview', description: '48V/HV active air spring with stereo camera road preview — proactive damping before wheel contact' },
          { id: 'hprb', name: 'High-Performance Regenerative Braking', description: 'Blended regen braking: e-motor regen + hydraulic backup — maximises energy recovery, reduces pad wear' },
          { id: 'frunk-module', name: 'Front Trunk (Frunk) Storage Module', description: 'BEV frunk: PP-lined compartment using freed space from no ICE — typically 60–100L, soft-close lid' },
        ],
      },
    ],
  },
];

export function getSystemById(id: string) {
  return AUTOMOTIVE_SYSTEMS.find(s => s.id === id);
}

export function getSubassemblyById(systemId: string, subId: string) {
  return getSystemById(systemId)?.subassemblies.find(s => s.id === subId);
}

export function getPartById(systemId: string, subId: string, partId: string) {
  return getSubassemblyById(systemId, subId)?.parts.find(p => p.id === partId);
}
