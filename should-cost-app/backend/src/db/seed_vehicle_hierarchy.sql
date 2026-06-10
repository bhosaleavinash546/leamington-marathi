-- ============================================================
-- Vehicle Hierarchy Seed — 22 Automotive Systems
-- ============================================================

-- ─── SYSTEMS ──────────────────────────────────────────────────
INSERT INTO vehicle_system (code,name,icon,sort_order) VALUES
 ('VB',  'Vehicle Body & BIW',               'layout',           1),
 ('EXT', 'Exterior Systems & Trim',           'sun',              2),
 ('CF',  'Chassis, Frame & Underbody',        'square',           3),
 ('SUS', 'Suspension Systems',                'settings',         4),
 ('STR', 'Steering Systems',                  'navigation',       5),
 ('BRK', 'Braking Systems',                   'disc',             6),
 ('WHL', 'Wheels & Tyres',                    'circle',           7),
 ('ICE', 'Powertrain – ICE',                  'zap',              8),
 ('BEV', 'Powertrain – BEV / MHEV',           'battery',          9),
 ('TDL', 'Transmission & Driveline',          'refresh-cw',      10),
 ('FES', 'Fuel & Emission Systems (ICE)',      'wind',            11),
 ('THM', 'Thermal Management & HVAC',         'thermometer',     12),
 ('INT', 'Interior Systems & Trim',           'home',            13),
 ('SEA', 'Seating Systems',                   'user',            14),
 ('SAF', 'Safety & Restraint Systems',        'shield',          15),
 ('ADA', 'ADAS & Driver Assistance',          'eye',             16),
 ('EE',  'Electrical & Electronics',          'cpu',             17),
 ('INF', 'Infotainment, HMI & Connectivity',  'monitor',         18),
 ('COM', 'Comfort & Convenience Systems',     'star',            19),
 ('WIP', 'Wipers, Washers & Visibility',      'droplets',        20),
 ('NVH', 'NVH, Sealing & Corrosion',         'volume-2',        21),
 ('EVA', 'EV-Specific Advanced Systems',      'trending-up',     22);

-- ─── SUBSYSTEMS ───────────────────────────────────────────────

-- 1. VB — Vehicle Body & BIW
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'VB-BIW','Body-in-White Main Structure',1 FROM vehicle_system WHERE code='VB';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'VB-CS', 'Crash & Stiffness Structures',  2 FROM vehicle_system WHERE code='VB';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'VB-CL', 'Closures (Body)',               3 FROM vehicle_system WHERE code='VB';

-- 2. EXT — Exterior
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EXT-BMP','Bumpers',               1 FROM vehicle_system WHERE code='EXT';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EXT-LT', 'Exterior Lighting',     2 FROM vehicle_system WHERE code='EXT';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EXT-GL', 'Glazing',               3 FROM vehicle_system WHERE code='EXT';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EXT-RF', 'Roof Systems',          4 FROM vehicle_system WHERE code='EXT';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EXT-MIR','Mirrors',               5 FROM vehicle_system WHERE code='EXT';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EXT-TR', 'Exterior Trim & Ornamentation', 6 FROM vehicle_system WHERE code='EXT';

-- 3. CF — Chassis, Frame & Underbody
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'CF-FR', 'Frame & Subframes',     1 FROM vehicle_system WHERE code='CF';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'CF-UB', 'Underbody Protection',  2 FROM vehicle_system WHERE code='CF';

-- 4. SUS — Suspension
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'SUS-FR','Front Suspension',      1 FROM vehicle_system WHERE code='SUS';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'SUS-RR','Rear Suspension',       2 FROM vehicle_system WHERE code='SUS';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'SUS-ADV','Advanced Suspension',  3 FROM vehicle_system WHERE code='SUS';

-- 5. STR — Steering
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'STR-COL','Steering Column',      1 FROM vehicle_system WHERE code='STR';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'STR-GR', 'Steering Gear',        2 FROM vehicle_system WHERE code='STR';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'STR-WHL','Steering Wheel',       3 FROM vehicle_system WHERE code='STR';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'STR-RWS','Rear-Wheel Steering',  4 FROM vehicle_system WHERE code='STR';

-- 6. BRK — Braking
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'BRK-FND','Foundation Brakes',   1 FROM vehicle_system WHERE code='BRK';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'BRK-HYD','Hydraulic System',    2 FROM vehicle_system WHERE code='BRK';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'BRK-CTL','Control Systems',     3 FROM vehicle_system WHERE code='BRK';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'BRK-REG','Regenerative Braking',4 FROM vehicle_system WHERE code='BRK';

-- 7. WHL — Wheels & Tyres
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'WHL-WHL','Wheels',              1 FROM vehicle_system WHERE code='WHL';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'WHL-TYR','Tyres',               2 FROM vehicle_system WHERE code='WHL';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'WHL-MON','Monitoring (TPMS)',   3 FROM vehicle_system WHERE code='WHL';

-- 8. ICE — Powertrain ICE
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ICE-ENG','Engine Mechanical',   1 FROM vehicle_system WHERE code='ICE';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ICE-AF', 'Air & Fuel',          2 FROM vehicle_system WHERE code='ICE';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ICE-EXH','Exhaust & Emissions',  3 FROM vehicle_system WHERE code='ICE';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ICE-COL','Cooling',             4 FROM vehicle_system WHERE code='ICE';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ICE-LUB','Lubrication',         5 FROM vehicle_system WHERE code='ICE';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ICE-MNT','Engine Mounting',     6 FROM vehicle_system WHERE code='ICE';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ICE-ANC','Ancillaries',         7 FROM vehicle_system WHERE code='ICE';

-- 9. BEV — Powertrain BEV/MHEV
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'BEV-BAT','HV Battery Pack',     1 FROM vehicle_system WHERE code='BEV';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'BEV-EDU','Electric Drive Unit',  2 FROM vehicle_system WHERE code='BEV';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'BEV-HVD','HV Distribution',     3 FROM vehicle_system WHERE code='BEV';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'BEV-48V','48V MHEV System',     4 FROM vehicle_system WHERE code='BEV';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'BEV-CHG','Charging System',     5 FROM vehicle_system WHERE code='BEV';

-- 10. TDL — Transmission & Driveline
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'TDL-ICT','ICE Transmissions',   1 FROM vehicle_system WHERE code='TDL';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'TDL-EVT','BEV Transmission/e-Axle',2 FROM vehicle_system WHERE code='TDL';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'TDL-TC', 'Transfer Case / AWD', 3 FROM vehicle_system WHERE code='TDL';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'TDL-DS', 'Driveshafts',         4 FROM vehicle_system WHERE code='TDL';

-- 11. FES — Fuel & Emission
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'FES-FT', 'Fuel Tank & Lines',   1 FROM vehicle_system WHERE code='FES';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'FES-EVP','EVAP System',         2 FROM vehicle_system WHERE code='FES';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'FES-SCR','SCR/DPF System',      3 FROM vehicle_system WHERE code='FES';

-- 12. THM — Thermal & HVAC
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'THM-ECL','Engine/EDU Cooling',  1 FROM vehicle_system WHERE code='THM';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'THM-BCL','Battery Cooling',     2 FROM vehicle_system WHERE code='THM';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'THM-HVAC','HVAC Module',        3 FROM vehicle_system WHERE code='THM';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'THM-REF','Refrigerant Circuit',  4 FROM vehicle_system WHERE code='THM';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'THM-HP', 'Heat Pump (BEV)',     5 FROM vehicle_system WHERE code='THM';

-- 13. INT — Interior
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'INT-IP', 'Instrument Panel',    1 FROM vehicle_system WHERE code='INT';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'INT-CON','Center Console',      2 FROM vehicle_system WHERE code='INT';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'INT-DT', 'Door Trims',          3 FROM vehicle_system WHERE code='INT';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'INT-HL', 'Headliner & Pillars', 4 FROM vehicle_system WHERE code='INT';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'INT-FL', 'Floor & Luggage',     5 FROM vehicle_system WHERE code='INT';

-- 14. SEA — Seating
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'SEA-FR','Front Seats',          1 FROM vehicle_system WHERE code='SEA';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'SEA-RR','Rear Seats',           2 FROM vehicle_system WHERE code='SEA';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'SEA-SAF','Seat Safety',         3 FROM vehicle_system WHERE code='SEA';

-- 15. SAF — Safety & Restraints
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'SAF-AB','Airbags',              1 FROM vehicle_system WHERE code='SAF';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'SAF-SB','Seatbelts',            2 FROM vehicle_system WHERE code='SAF';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'SAF-CS','Crash Sensing',        3 FROM vehicle_system WHERE code='SAF';

-- 16. ADA — ADAS
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ADA-SNS','Sensors & Cameras',   1 FROM vehicle_system WHERE code='ADA';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ADA-ECU','ADAS Controllers',    2 FROM vehicle_system WHERE code='ADA';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'ADA-ACT','Haptic Actuators',    3 FROM vehicle_system WHERE code='ADA';

-- 17. EE — Electrical & Electronics
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EE-PWR','Power Distribution',   1 FROM vehicle_system WHERE code='EE';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EE-HAR','Wiring Harnesses',     2 FROM vehicle_system WHERE code='EE';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EE-ECU','Control Units (ECUs)', 3 FROM vehicle_system WHERE code='EE';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EE-SEN','Sensors & Actuators',  4 FROM vehicle_system WHERE code='EE';

-- 18. INF — Infotainment
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'INF-DSP','Displays',            1 FROM vehicle_system WHERE code='INF';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'INF-AUD','Audio System',        2 FROM vehicle_system WHERE code='INF';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'INF-CTL','Controls & HMI',      3 FROM vehicle_system WHERE code='INF';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'INF-CON','Connectivity',        4 FROM vehicle_system WHERE code='INF';

-- 19. COM — Comfort & Convenience
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'COM-WIN','Power Windows',       1 FROM vehicle_system WHERE code='COM';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'COM-LK', 'Locking & Entry',     2 FROM vehicle_system WHERE code='COM';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'COM-LT', 'Interior Lighting',   3 FROM vehicle_system WHERE code='COM';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'COM-HT', 'Heated/Comfort Features',4 FROM vehicle_system WHERE code='COM';

-- 20. WIP — Wipers & Washers
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'WIP-FR','Front Wiper System',   1 FROM vehicle_system WHERE code='WIP';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'WIP-RR','Rear Wiper System',    2 FROM vehicle_system WHERE code='WIP';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'WIP-WSH','Washer System',       3 FROM vehicle_system WHERE code='WIP';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'WIP-SEN','Rain/Light Sensors',  4 FROM vehicle_system WHERE code='WIP';

-- 21. NVH — NVH & Sealing
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'NVH-SEL','Seals & Channels',    1 FROM vehicle_system WHERE code='NVH';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'NVH-INS','Insulators & Pads',   2 FROM vehicle_system WHERE code='NVH';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'NVH-COR','Corrosion Protection', 3 FROM vehicle_system WHERE code='NVH';

-- 22. EVA — EV Advanced
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EVA-SUS','Active Air Suspension',1 FROM vehicle_system WHERE code='EVA';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EVA-RWS','Rear-Wheel Steering',  2 FROM vehicle_system WHERE code='EVA';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EVA-MTV','Multi-Motor Torque Vectoring',3 FROM vehicle_system WHERE code='EVA';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EVA-HVT','HV Thermal Mgmt',     4 FROM vehicle_system WHERE code='EVA';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EVA-CHG','800V Charging Arch',   5 FROM vehicle_system WHERE code='EVA';
INSERT INTO vehicle_subsystem (system_id,code,name,sort_order) SELECT id,'EVA-SBP','Structural Battery',   6 FROM vehicle_system WHERE code='EVA';

-- ─── KEY COMPONENTS (representative sample for each subsystem) ───

-- VB-BIW components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-BIW-FP',  'Floor Pan (Front/Rear)',       1 FROM vehicle_subsystem WHERE code='VB-BIW';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-BIW-TNL', 'Tunnel & Crossmembers',        2 FROM vehicle_subsystem WHERE code='VB-BIW';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-BIW-SIL', 'Side Sills (Inner/Outer)',     3 FROM vehicle_subsystem WHERE code='VB-BIW';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-BIW-PIL', 'A/B/C/D Pillars & Reinf.',    4 FROM vehicle_subsystem WHERE code='VB-BIW';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-BIW-RAIL','Front/Rear Longitudinal Rails',5 FROM vehicle_subsystem WHERE code='VB-BIW';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-BIW-WH',  'Front/Rear Wheelhouses',       6 FROM vehicle_subsystem WHERE code='VB-BIW';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-BIW-ROOF','Roof Panel, Bows & Rails',     7 FROM vehicle_subsystem WHERE code='VB-BIW';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-BIW-DASH','Dash Panel / Firewall / Cowl', 8 FROM vehicle_subsystem WHERE code='VB-BIW';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-BIW-REAR','Rear End Panel & Tailgate Ap.',9 FROM vehicle_subsystem WHERE code='VB-BIW';

-- VB-CS components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CS-FCB','Front Crash Box',                1 FROM vehicle_subsystem WHERE code='VB-CS';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CS-RCB','Rear Crash Box',                 2 FROM vehicle_subsystem WHERE code='VB-CS';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CS-SIB','Side Impact Beams',              3 FROM vehicle_subsystem WHERE code='VB-CS';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CS-CCB','Cross Car Beam (IP Beam)',       4 FROM vehicle_subsystem WHERE code='VB-CS';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CS-STT','Strut Towers / Suspension Turrets',5 FROM vehicle_subsystem WHERE code='VB-CS';

-- VB-CL components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CL-HD', 'Hood (Outer/Inner/Latch/Hinges)',1 FROM vehicle_subsystem WHERE code='VB-CL';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CL-TG', 'Tailgate (Outer/Inner/Hinges)', 2 FROM vehicle_subsystem WHERE code='VB-CL';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CL-DFR','Front Door (Outer/Inner/Hinges)',3 FROM vehicle_subsystem WHERE code='VB-CL';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CL-DRR','Rear Door (Outer/Inner/Hinges)', 4 FROM vehicle_subsystem WHERE code='VB-CL';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'VB-CL-FFL','Fuel/Charge Filler Flap',        5 FROM vehicle_subsystem WHERE code='VB-CL';

-- EXT-BMP components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EXT-BMP-FF','Front Fascia',                  1 FROM vehicle_subsystem WHERE code='EXT-BMP';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EXT-BMP-RF','Rear Fascia',                   2 FROM vehicle_subsystem WHERE code='EXT-BMP';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EXT-BMP-EA','Energy Absorber & Crash Beam',  3 FROM vehicle_subsystem WHERE code='EXT-BMP';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EXT-BMP-MB','Mounting Brackets & Guides',    4 FROM vehicle_subsystem WHERE code='EXT-BMP';

-- EXT-LT components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EXT-LT-HL', 'Headlamp Assembly (LED/Matrix)',1 FROM vehicle_subsystem WHERE code='EXT-LT';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EXT-LT-TL', 'Tail Lamp Assembly',            2 FROM vehicle_subsystem WHERE code='EXT-LT';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EXT-LT-FOG','Fog Lamps / CHMSL',             3 FROM vehicle_subsystem WHERE code='EXT-LT';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EXT-LT-DRL','DRL / Turn Signal Module',      4 FROM vehicle_subsystem WHERE code='EXT-LT';

-- SUS-FR components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-FR-ARM','Control Arms (Upper/Lower)',     1 FROM vehicle_subsystem WHERE code='SUS-FR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-FR-KNK','Knuckle / Upright',             2 FROM vehicle_subsystem WHERE code='SUS-FR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-FR-SPR','Coil / Air Spring',             3 FROM vehicle_subsystem WHERE code='SUS-FR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-FR-DMR','Damper / Shock Absorber',        4 FROM vehicle_subsystem WHERE code='SUS-FR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-FR-ARB','Anti-Roll Bar & Links',          5 FROM vehicle_subsystem WHERE code='SUS-FR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-FR-TOP','Top Mount & Bump Stop',          6 FROM vehicle_subsystem WHERE code='SUS-FR';

-- SUS-RR components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-RR-ML', 'Multi-Link Arms (Control/Toe)', 1 FROM vehicle_subsystem WHERE code='SUS-RR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-RR-TRL','Trailing Arms',                  2 FROM vehicle_subsystem WHERE code='SUS-RR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-RR-KNK','Rear Knuckle / Upright',        3 FROM vehicle_subsystem WHERE code='SUS-RR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-RR-SPR','Rear Coil / Air Spring',         4 FROM vehicle_subsystem WHERE code='SUS-RR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SUS-RR-DMR','Rear Damper / Shock Absorber',  5 FROM vehicle_subsystem WHERE code='SUS-RR';

-- BRK-FND components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BRK-FND-FD','Front Disc & Caliper & Pads',   1 FROM vehicle_subsystem WHERE code='BRK-FND';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BRK-FND-RD','Rear Disc & Caliper & Pads',    2 FROM vehicle_subsystem WHERE code='BRK-FND';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BRK-FND-PK','Parking Brake / EPB',           3 FROM vehicle_subsystem WHERE code='BRK-FND';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BRK-FND-SS','Splash Shields',                4 FROM vehicle_subsystem WHERE code='BRK-FND';

-- ICE-ENG components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ICE-ENG-BLK','Cylinder Block & Liners',      1 FROM vehicle_subsystem WHERE code='ICE-ENG';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ICE-ENG-CRK','Crankshaft & Bearings',         2 FROM vehicle_subsystem WHERE code='ICE-ENG';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ICE-ENG-PST','Pistons, Rings & Con Rods',     3 FROM vehicle_subsystem WHERE code='ICE-ENG';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ICE-ENG-HD', 'Cylinder Head & Valvetrain',   4 FROM vehicle_subsystem WHERE code='ICE-ENG';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ICE-ENG-CAM','Camshafts & Timing Drive',      5 FROM vehicle_subsystem WHERE code='ICE-ENG';

-- BEV-BAT components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BEV-BAT-CEL','Cell Modules & Cells',         1 FROM vehicle_subsystem WHERE code='BEV-BAT';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BEV-BAT-BMS','Battery Management System',     2 FROM vehicle_subsystem WHERE code='BEV-BAT';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BEV-BAT-HVJ','HV Junction Box & Contactors', 3 FROM vehicle_subsystem WHERE code='BEV-BAT';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BEV-BAT-CPL','Cooling Plates & Channels',     4 FROM vehicle_subsystem WHERE code='BEV-BAT';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BEV-BAT-ENC','Pack Enclosure & Structure',   5 FROM vehicle_subsystem WHERE code='BEV-BAT';

-- BEV-EDU components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BEV-EDU-MOT','Electric Motor (Stator/Rotor)', 1 FROM vehicle_subsystem WHERE code='BEV-EDU';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BEV-EDU-INV','Inverter (Power Modules)',      2 FROM vehicle_subsystem WHERE code='BEV-EDU';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BEV-EDU-GBX','Reduction Gearbox',             3 FROM vehicle_subsystem WHERE code='BEV-EDU';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'BEV-EDU-DIF','Differential (LSD/TV)',         4 FROM vehicle_subsystem WHERE code='BEV-EDU';

-- THM-HVAC components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'THM-HVAC-MOD','HVAC Module (Evap/Heater/Blend)',1 FROM vehicle_subsystem WHERE code='THM-HVAC';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'THM-HVAC-BLW','Blower Motor & Housing',        2 FROM vehicle_subsystem WHERE code='THM-HVAC';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'THM-HVAC-FLT','Cabin Air Filter',               3 FROM vehicle_subsystem WHERE code='THM-HVAC';

-- INT-IP components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'INT-IP-CAR','IP Carrier / Beam',              1 FROM vehicle_subsystem WHERE code='INT-IP';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'INT-IP-UPR','Upper / Lower IP Panels',        2 FROM vehicle_subsystem WHERE code='INT-IP';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'INT-IP-GLV','Glovebox',                       3 FROM vehicle_subsystem WHERE code='INT-IP';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'INT-IP-VNT','Defroster / Vent Outlets',       4 FROM vehicle_subsystem WHERE code='INT-IP';

-- SAF-AB components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SAF-AB-DRV','Driver Front Airbag',            1 FROM vehicle_subsystem WHERE code='SAF-AB';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SAF-AB-PAS','Passenger Front Airbag',         2 FROM vehicle_subsystem WHERE code='SAF-AB';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SAF-AB-SID','Side Airbags (Thorax)',          3 FROM vehicle_subsystem WHERE code='SAF-AB';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SAF-AB-CRT','Curtain Airbags',                4 FROM vehicle_subsystem WHERE code='SAF-AB';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SAF-AB-ACU','Airbag Control Unit (ACU)',      5 FROM vehicle_subsystem WHERE code='SAF-AB';

-- ADA-SNS components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ADA-SNS-FRD','Front Radar',                  1 FROM vehicle_subsystem WHERE code='ADA-SNS';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ADA-SNS-CRD','Corner Radars (x4)',           2 FROM vehicle_subsystem WHERE code='ADA-SNS';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ADA-SNS-CAM','Front Camera Module',           3 FROM vehicle_subsystem WHERE code='ADA-SNS';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ADA-SNS-SVC','Surround View Cameras (x4)',   4 FROM vehicle_subsystem WHERE code='ADA-SNS';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ADA-SNS-USS','Ultrasonic Sensors',           5 FROM vehicle_subsystem WHERE code='ADA-SNS';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'ADA-SNS-LDR','Lidar (if equipped)',          6 FROM vehicle_subsystem WHERE code='ADA-SNS';

-- EE-HAR components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EE-HAR-ENG','Engine Harness',                1 FROM vehicle_subsystem WHERE code='EE-HAR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EE-HAR-BDY','Body Harness',                  2 FROM vehicle_subsystem WHERE code='EE-HAR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EE-HAR-CHS','Chassis Harness',               3 FROM vehicle_subsystem WHERE code='EE-HAR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'EE-HAR-HV', 'HV Harness (BEV/MHEV)',        4 FROM vehicle_subsystem WHERE code='EE-HAR';

-- INF-DSP components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'INF-DSP-IC', 'Digital Instrument Cluster',   1 FROM vehicle_subsystem WHERE code='INF-DSP';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'INF-DSP-CTR','Center Display',               2 FROM vehicle_subsystem WHERE code='INF-DSP';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'INF-DSP-RSE','Rear Seat Entertainment',      3 FROM vehicle_subsystem WHERE code='INF-DSP';

-- SEA-FR components
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SEA-FR-FRM','Seat Frame (Cushion/Backrest)', 1 FROM vehicle_subsystem WHERE code='SEA-FR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SEA-FR-ADJ','Recliner/Height Adj/Rails',    2 FROM vehicle_subsystem WHERE code='SEA-FR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SEA-FR-FOA','Foam & Trim Covers',           3 FROM vehicle_subsystem WHERE code='SEA-FR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SEA-FR-HVM','Heating/Ventilation/Massage',  4 FROM vehicle_subsystem WHERE code='SEA-FR';
INSERT INTO vehicle_component(subsystem_id,code,name,sort_order) SELECT id,'SEA-FR-MOD','Seat Control Module & Memory', 5 FROM vehicle_subsystem WHERE code='SEA-FR';
