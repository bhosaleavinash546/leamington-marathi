// Inline demo cards — sample luxury-SUV parts per commodity (pure data).

// ─── Inline Demo Cards (all non-PCB commodities) ─────────────────────────────
export const COMMODITY_DEMO_SNIPPETS: Record<string, Array<{brand: string; name: string; spec: string}>> = {
  machining: [
    { brand: 'BMW X7', name: 'Rear Suspension Knuckle', spec: 'Al6061-T6 · 5-axis · 1.85 kg' },
    { brand: 'Range Rover Velar', name: 'Steering Rack Housing', spec: 'Al6061-T6 · 3-axis · 2.10 kg' },
    { brand: 'Toyota Land Cruiser', name: 'Rear Hub Carrier', spec: 'Al6061-T6 · 5-axis · 2.45 kg' },
  ],
  sheet_metal: [
    { brand: 'Porsche Cayenne', name: 'Door Outer Panel', spec: 'AA5182 Al · 1.0 mm · 2.20 kg' },
    { brand: 'Mercedes GLE', name: 'B-Pillar Reinforcement', spec: 'DP600 AHSS · 1.8 mm · 3.20 kg' },
    { brand: 'Ford Bronco Sport', name: 'Floor Cross-Member', spec: 'DP800 AHSS · 2.0 mm · 4.20 kg' },
  ],
  sheet_metal_fab: [
    { brand: 'Audi Q7', name: 'Side Sill Bracket', spec: 'DC01 · Laser + 4 bends + MIG' },
    { brand: 'BMW X5', name: 'Engine Undertray Bracket', spec: 'DC01 · Laser + 3 bends + spot welds' },
    { brand: 'Volvo XC60', name: 'Rear Subframe Mount Bracket', spec: 'DC01 · Laser + 5 bends · 2.80 kg' },
  ],
  injection_moulding: [
    { brand: 'Range Rover Sport', name: 'Front Grille Housing', spec: 'ABS · 2-cavity · 0.45 kg' },
    { brand: 'Bentley Bentayga', name: 'Centre Console Trim', spec: 'PC/ABS · 1-cavity · hot runner' },
    { brand: 'Toyota RAV4', name: 'Rear Bumper Fascia', spec: 'PP-GF · 2-cavity · 1.85 kg' },
  ],
  blow_moulding: [
    { brand: 'BMW X7', name: 'Washer Fluid Reservoir', spec: 'HDPE · EBM · 2-cavity · 0.35 kg' },
    { brand: 'Land Rover Defender', name: 'Coolant Expansion Tank', spec: 'HDPE · EBM · 1-cavity · 0.55 kg' },
    { brand: 'Volvo XC90', name: 'Washer Fluid Reservoir', spec: 'HDPE · EBM · 2-cavity · 0.48 kg' },
  ],
  extrusion: [
    { brand: 'Rolls-Royce Cullinan', name: 'Door Sealing Strip', spec: 'Flexible PVC · 0.18 kg/m · 2.4 m' },
    { brand: 'Range Rover Vogue', name: 'Weatherstrip Profile', spec: 'Flexible PVC · 0.12 kg/m · 3.2 m' },
    { brand: 'BMW X5 M', name: 'Rear Bumper Rubber Trim', spec: 'EPDM · 0.22 kg/m · 1.6 m' },
  ],
  thermoforming: [
    { brand: 'Mercedes GLS', name: 'Boot / Cargo Liner', spec: 'HIPS · Vacuum form · 0.92 kg' },
    { brand: 'Porsche Cayenne', name: 'Dashboard Lower Cover', spec: 'ABS · Pressure form · 0.65 kg' },
    { brand: 'Land Rover Defender', name: 'Spare Wheel Carrier Cover', spec: 'ABS · Vacuum form · 1.15 kg' },
  ],
  rotational_moulding: [
    { brand: 'Land Rover Defender', name: 'Fuel Tank (40L)', spec: 'LLDPE · 3.80 kg · Biaxial' },
    { brand: 'Mercedes G-Class', name: 'Roof Storage Box', spec: 'LLDPE · 6.50 kg · Biaxial' },
    { brand: 'Jeep Grand Cherokee', name: 'Air Intake Snorkel Box', spec: 'LLDPE · 2.80 kg · Biaxial' },
  ],
  casting: [
    { brand: 'Bentley Bentayga', name: 'Differential Housing', spec: 'ADC12 · HPDC 800T · 4.80 kg' },
    { brand: 'Rolls-Royce Cullinan', name: 'Brake Caliper Housing', spec: 'A380 Al · HPDC 800T · 3.20 kg' },
    { brand: 'Toyota Hilux', name: 'Rear Differential Carrier', spec: 'GJL350 · Sand Cast · 8.50 kg' },
  ],
  forging: [
    { brand: 'BMW X7', name: 'Front Lower Control Arm', spec: 'Al 6082 · 500T press · 1.85 kg' },
    { brand: 'Range Rover Vogue', name: '4WD Drive Shaft Yoke', spec: '4340 Steel · 5T hammer · 2.80 kg' },
    { brand: 'Jeep Wrangler', name: 'Front Axle Shaft Flange', spec: '4340 Steel · 5T hammer · 4.20 kg' },
  ],
  painting: [
    { brand: 'Lamborghini Urus', name: 'Body Panel OEM Paint', spec: 'E-coat + primer + base + clear · 8.5 m²' },
    { brand: 'Aston Martin DBX', name: 'Instrument Panel Painting', spec: 'Waterborne basecoat · 0.65 m²' },
    { brand: 'Toyota Land Cruiser', name: 'Tailgate Panel (4-Coat)', spec: 'E-coat + primer + base + clear · 2.8 m²' },
  ],
  biw_assembly: [
    { brand: 'Mercedes GLS', name: 'Door Inner Panel Assembly', spec: '3 robot weld stations · £85 sub-parts' },
    { brand: 'Porsche Cayenne', name: 'BIW Side Frame Assembly', spec: '4 stations · robot frame + spot + hem' },
    { brand: 'Volkswagen Touareg', name: 'Front Door Inner Assembly', spec: '4 stations · 28 spot welds + MIG seam' },
  ],
  cast_and_machine: [
    { brand: 'Bentley Bentayga', name: 'Differential Housing (Cast+Mill)', spec: 'ADC12 · HPDC + 3-axis VMC · 4.80 kg' },
    { brand: 'BMW X5', name: 'Gearbox Housing (Cast+Mill)', spec: 'A380 Al · HPDC + 5-axis · 3.20 kg' },
    { brand: 'Toyota Hilux', name: 'Diff Carrier (Cast+Drill)', spec: 'GJL350 · Sand Cast + drilling · 8.50 kg' },
  ],
  rubber: [
    { brand: 'Range Rover', name: 'Engine Mount Isolator', spec: 'EPDM · Compression mould · 0.45 kg' },
    { brand: 'BMW X7', name: 'Suspension Bush', spec: 'Natural rubber · Transfer mould · 0.12 kg' },
    { brand: 'Land Rover Defender', name: 'Door Seal Profile', spec: 'EPDM · Extrusion · 3.2 m' },
  ],
  composites: [
    { brand: 'McLaren', name: 'Carbon Fibre Monocoque Panel', spec: 'CFRP · Autoclave · 1.2 kg' },
    { brand: 'BMW i3', name: 'CFRP Door Inner Panel', spec: 'CFRP · RTM · 2.8 kg' },
    { brand: 'Aston Martin', name: 'Carbon Fibre Boot Lid', spec: 'CFRP · Wet lay-up · 3.5 kg' },
  ],
  wiring_harness: [
    { brand: 'BMW X7', name: 'Main Body Harness', spec: '42 circuits · 18 connectors · 3.2 kg' },
    { brand: 'Range Rover', name: 'Engine Bay Harness', spec: '28 circuits · 12 connectors · 1.8 kg' },
    { brand: 'Porsche Taycan', name: 'HV Battery Harness', spec: 'HV shielded · 8 circuits · 2.1 kg' },
  ],
};
