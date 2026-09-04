// ─────────────────────────────────────────────────────────────────────────────
// Trade names → catalogue keys. The covering map the ordered regex ladder was
// never able to be.
//
// WHY. The resolver in material-process-resolve.mjs is an ordered if/else of
// regexes. Order is load-bearing there for good reasons (the comments explain
// each one), but an ordered ladder cannot be complete: whichever branch fires
// first wins, so a grade that resembles an earlier branch is silently priced as
// something else. Measured, Sept 2026 review R-26:
//
//   ADC12 / A380 / AlSi9Cu3 → Aluminium A356 (cast)   — a different alloy and €/kg
//   GFRP                    → CFRP (Carbon Fibre)     — €4.50/kg priced at €28.00
//   hot stamping            → Stamping / Deep Drawing — a cold press line
//   laser welding           → Laser Cutting + Bending — a different machine
//   anodising, nitriding, riveting, MIM, hobbing      → null, or the wrong op
//
// Quote ingest stores whatever this returns, so the calibration corpus — the
// product's moat — was being fed mislabelled rows.
//
// This table is consulted FIRST, is keyed on catalogue entries (so it cannot
// drift from them), and is asserted complete by tests/material-aliases.test.mjs:
// every MATERIALS and PROCESSES key must be reachable from at least one alias,
// and no alias may resolve to a different key than its own.
//
// Aliases are matched as normalised whole tokens or as anchored substrings —
// see aliasLookup below. Order inside a list does not matter; specificity does,
// and the lookup prefers the longest match, so "aluminium a356" beats "a356".
// ─────────────────────────────────────────────────────────────────────────────

/** Trade names, standard designations and shop vernacular, per catalogue key. */
export const MATERIAL_ALIASES = Object.freeze({
  'Steel (mild)': ['mild steel', 'cr4', 'crc', 'cold rolled steel', 'dc01', 'dc03', 'dc04', 'dc05', 'dc06', 'dx51d', 'dd11', 'dd13', 's235', 's235jr', 'st37', 'spcc', 'sphc', 'low carbon steel', 'plain carbon steel', 'hr steel', 'hot rolled steel', 'sae 1008', 'sae 1010', 'aisi 1018'],
  'Steel (high-strength)': ['hsla', 'high strength steel', 'high-strength low-alloy', 's355', 's355mc', 's420', 's420mc', 's460', 's500mc', 's700mc', 'cr340la', 'cr420la', 'hc340la', 'hc420la', 'hx340lad', 'hx420lad', 'jsc440', 'sphc440', 'docol 500', 'domex', 'strenx', 'micro-alloyed steel', 'microalloyed steel'],
  'Steel DP600 (dual-phase)': ['dp600', 'dp 600', 'dp590', 'cr290y490t-dp', 'dual phase 600', 'docol 600dp', 'ahss dp600'],
  'Steel DP980 (dual-phase)': ['dp980', 'dp 980', 'dp1000', 'cp800', 'cp1000', 'ms1200', 'trip780', 'trip690', 'qp980', 'qp1180', 'docol 980', 'ultra high strength steel', 'uhss', 'advanced high strength steel', 'ahss'],
  'Steel 22MnB5 (press-hardened)': ['22mnb5', '20mnb5', '34mnb5', 'usibor', 'usibor 1500', 'ductibor', 'press hardened steel', 'press-hardened steel', 'phs', 'boron steel', 'hot stamping steel', 'phs1500', 'mbw1500'],
  'Steel 42CrMo4 / 4140': ['42crmo4', '4140', 'aisi 4140', 'scm440', '708m40', 'en19', 'chrome moly', 'crmo steel', 'quenched and tempered steel', 'q&t steel', '34crnimo6', '4340'],
  'Steel 16MnCr5 (case-hardening)': ['16mncr5', '20mncr5', '18crnimo7-6', '8620', 'aisi 8620', 'case hardening steel', 'carburising steel', 'carburizing steel', 'gear steel', '5115'],
  'Stainless Steel 304': ['304', 'ss304', 'aisi 304', '1.4301', 'x5crni18-10', 'sus304', '18/8 stainless', 'a2 stainless', '304l', '1.4307'],
  'Stainless Steel 316L': ['316', '316l', 'ss316', 'aisi 316', '1.4404', '1.4401', 'x2crnimo17-12-2', 'sus316', 'a4 stainless', 'marine stainless'],
  'Stainless Steel 430': ['430', 'ss430', 'aisi 430', '1.4016', 'x6cr17', 'sus430', 'ferritic stainless'],
  'Cast Iron (Grey)': ['grey iron', 'gray iron', 'grey cast iron', 'gray cast iron', 'gjl', 'gjl-250', 'gg25', 'gg-25', 'en-gjl-250', 'flake graphite iron', 'lamellar iron'],
  'Cast Iron (Ductile/GJS)': ['ductile iron', 'ductile cast iron', 'nodular iron', 'sg iron', 'spheroidal graphite iron', 'gjs', 'gjs-450-10', 'gjs-500-7', 'ggg40', 'ggg50', 'ggg-50', 'en-gjs-500-7', '65-45-12', '80-55-06'],
  'Cast Iron (CGI / GJV-450)': ['cgi', 'gjv', 'gjv-450', 'compacted graphite iron', 'vermicular iron', 'gjv-400'],
  'Cast Iron (ADI 900, austempered)': ['adi', 'adi 900', 'austempered ductile iron', 'ejs-900', 'gjs-900-8', 'adi 1050'],
  'Cast Iron (SiMo, exhaust)': ['simo', 'si-mo iron', 'simo51', 'exhaust manifold iron', 'gjs-simo', 'ni-resist'],
  'Aluminium 6061': ['6061', 'al6061', 'aa6061', '6061-t6', 'en aw-6061', 'he20', 'aluminium 6061-t6'],
  'Aluminium 6082': ['6082', 'al6082', 'aa6082', '6082-t6', 'en aw-6082', 'he30', 'aluminium 6082-t6', '6005', '6005a', '6063', 'en aw-6063'],
  'Aluminium 7075': ['7075', 'al7075', 'aa7075', '7075-t6', 'en aw-7075', '7050', '7175'],
  'Aluminium 5052 (sheet)': ['5052', 'al5052', 'aa5052', 'en aw-5052', '5754', '5083', '5182', '5xxx sheet', 'aluminium sheet'],
  'Aluminium A356 (cast)': ['a356', 'a356.0', 'a356-t6', '356', 'en ac-42000', 'alsi7mg', 'lm25', 'gravity cast aluminium'],
  'Aluminium A357 (cast)': ['a357', 'a357.0', 'c355', '357', 'alsi7mg0.6', 'en ac-42200'],
  'Aluminium AlSi7Mg0.3 / EN AC-42100 (cast)': ['alsi7mg0.3', 'en ac-42100', 'ac-42100', '42100'],
  'Aluminium A380 / ADC12 (die-cast)': ['a380', 'a380.0', 'adc12', 'adc 12', '380', 'alsi8cu3', 'en ac-46500', 'lm24', 'die cast aluminium', 'hpdc aluminium'],
  'Aluminium AlSi9Cu3 / EN AC-46000 (die-cast)': ['alsi9cu3', 'en ac-46000', 'ac-46000', '46000', 'alsi9cu3(fe)', 'lm24 alloy'],
  'Aluminium ADC10 / A383 (die-cast)': ['adc10', 'adc 10', 'a383', '383', 'alsi10cu'],
  'Aluminium A360 (die-cast)': ['a360', 'a360.0', '360', 'alsi10mg(fe)', 'adc3'],
  'Aluminium A413 (die-cast)': ['a413', 'a413.0', '413', 'alsi12', 'adc1', 'en ac-44300'],
  'Aluminium AlSi10MnMg (Silafont-36, structural HPDC)': ['alsi10mnmg', 'silafont', 'silafont-36', 'silafont 36', 'en ac-43500', 'structural hpdc alloy', 'aural-2', 'aural 2'],
  'Aluminium Castasil-37 (AlSi9MnMoZr, structural HPDC)': ['castasil', 'castasil-37', 'castasil 37', 'alsi9mnmozr', 'en ac-43800'],
  'Magnesium AZ31': ['az31', 'az31b', 'magnesium az31', 'wrought magnesium'],
  'Magnesium AZ91D (die-cast)': ['az91', 'az91d', 'magnesium az91', 'mg az91d'],
  'Magnesium AM60B (die-cast)': ['am60', 'am60b', 'magnesium am60'],
  'Magnesium AM50A (die-cast)': ['am50', 'am50a', 'magnesium am50'],
  'Titanium Ti-6Al-4V': ['ti-6al-4v', 'ti6al4v', 'ti 6al 4v', 'tc4', 'grade 5 titanium', 'ti grade 5', 'ta6v', '3.7165', 'titanium alloy'],
  'Brass (CuZn39)': ['brass', 'cuzn39', 'cuzn39pb3', 'cw614n', 'c38500', 'free cutting brass', 'ms58', 'cuzn37', 'cartridge brass'],
  'Bronze (CuSn8)': ['bronze', 'cusn8', 'cusn12', 'phosphor bronze', 'cuzn tin bronze', 'c51000', 'gunmetal'],
  'Copper (Cu-ETP)': ['cu-etp', 'cuetp', 'etp copper', 'c11000', 'electrolytic copper', 'copper busbar', 'busbar copper', 'cu-of', 'ofhc', 'cu-dhp'],
  'Copper (enamelled winding wire)': ['enamelled copper', 'enameled copper', 'magnet wire', 'winding wire', 'hairpin copper', 'hairpin wire', 'litz wire', 'rectangular winding wire', 'flat copper wire'],
  'Zinc (ZAMAK 5)': ['zamak 5', 'zamak5', 'zamak-5', 'zp5', 'zn-al4-cu1', 'zinc alloy 5'],
  'Zinc (ZAMAK 3)': ['zamak 3', 'zamak3', 'zamak-3', 'zp3', 'zinc alloy 3', 'zdc1'],
  'Zinc (ZAMAK 2)': ['zamak 2', 'zamak2', 'zamak-2', 'zp2'],
  'Zinc ZA-8': ['za-8', 'za8', 'zinc aluminium 8'],
  'Polypropylene (PP)': ['pp', 'polypropylene', 'pp homopolymer', 'pp copolymer', 'ppcp', 'pph'],
  'PP-T20 (talc-filled)': ['pp-t20', 'ppt20', 'talc filled pp', 'talc-filled polypropylene', 'pp-td20', 'pp t20', 'mineral filled pp'],
  'PA6 (Nylon)': ['pa6', 'nylon 6', 'nylon6', 'polyamide 6', 'pa 6'],
  'PA66-GF30 (glass-filled)': ['pa66-gf30', 'pa66 gf30', 'pa66gf30', 'nylon 66 glass filled', 'pa6.6-gf30', 'pa66', 'nylon 66', 'polyamide 66', 'pa66-gf35', 'glass filled nylon'],
  'ABS': ['abs', 'acrylonitrile butadiene styrene'],
  'PC/ABS blend': ['pc/abs', 'pc-abs', 'pcabs', 'pc abs blend', 'bayblend', 'cycoloy'],
  'POM (Acetal)': ['pom', 'acetal', 'delrin', 'polyoxymethylene', 'pom-c', 'pom-h'],
  'Polycarbonate (PC)': ['pc', 'polycarbonate', 'lexan', 'makrolon'],
  'PBT': ['pbt', 'polybutylene terephthalate', 'valox', 'pbt-gf30'],
  'PET': ['pet', 'polyethylene terephthalate', 'rynite', 'pet-gf30'],
  'PPS': ['pps', 'polyphenylene sulfide', 'ryton', 'fortron', 'pps-gf40'],
  'PEEK': ['peek', 'polyether ether ketone', 'victrex', 'peek-cf30'],
  'TPU (thermoplastic PU)': ['tpu', 'thermoplastic polyurethane', 'desmopan', 'elastollan'],
  'HDPE': ['hdpe', 'high density polyethylene', 'pe-hd'],
  'EPDM Rubber': ['epdm', 'ethylene propylene diene', 'epdm rubber', 'weatherstrip rubber'],
  'NBR (Nitrile) Rubber': ['nbr', 'nitrile', 'nitrile rubber', 'buna-n', 'hnbr'],
  'Silicone (VMQ) Rubber': ['vmq', 'silicone', 'silicone rubber', 'lsr', 'liquid silicone rubber'],
  'FKM (Viton) Rubber': ['fkm', 'viton', 'fluoroelastomer', 'fpm'],
  'CFRP (Carbon Fibre)': ['cfrp', 'carbon fibre', 'carbon fiber', 'carbon composite', 'cf prepreg', 'carbon prepreg', 'cfrtp'],
  'GFRP (Glass Fibre)': ['gfrp', 'glass fibre', 'glass fiber', 'grp', 'fibreglass', 'fiberglass', 'glass reinforced plastic', 'gf composite'],
  'SMC (Sheet Moulding Compound)': ['smc', 'sheet moulding compound', 'sheet molding compound', 'bmc', 'bulk moulding compound', 'gmt'],
  'Magnet (NdFeB, sintered, heavy-RE)': ['ndfeb', 'nd-fe-b', 'neodymium', 'neodymium magnet', 'rare earth magnet', 'sintered magnet', 'n35', 'n38', 'n42', 'n45', 'n48', 'n42uh', 'n45sh', 'n38eh', 'n42sh', 'gbd magnet', 'grain boundary diffusion magnet'],
  'Magnet (Ferrite, Y30BH)': ['ferrite magnet', 'y30bh', 'y35', 'ceramic magnet', 'hard ferrite', 'strontium ferrite'],
  'Electrical Steel (M250-35A)': ['m250-35a', 'm250 35a', 'm270-35a', 'm270-50a', 'm300-35a', 'm330-35a', 'm350-50a', 'm400-50a', 'electrical steel', 'non-oriented electrical steel', 'silicon steel', 'lamination steel', '35a250', '35a270', '50a350', 'no35', 'no30'],
  'Electrical Steel (NO20, 0.20 mm)': ['no20', 'no 20', 'm235-20a', 'm250-20a', '20jneh1200', '20jnex900', '20hth1200', 'thin gauge electrical steel', '0.20 mm electrical steel', '0.2mm silicon steel', 'nо20'],
  'Epoxy (impregnation resin)': ['impregnation resin', 'vpi resin', 'trickle resin', 'epoxy resin', 'potting compound', 'encapsulant', 'varnish'],
  'Glass (Soda-lime, automotive)': ['soda lime glass', 'soda-lime', 'automotive glass', 'laminated glass', 'tempered glass', 'float glass', 'windscreen glass'],
});

/** Process trade names and shop vernacular, per catalogue key. */
export const PROCESS_ALIASES = Object.freeze({
  'Stamping / Deep Drawing': ['stamping', 'stamp', 'pressing', 'sheet metal forming', 'blanking', 'progressive die', 'transfer press', 'draw press', 'press forming', 'cold stamping'],
  'Fine Blanking': ['fine blanking', 'fineblank', 'fineblanking', 'precision blanking', 'feinschneiden'],
  'Hot Stamping (Press Hardening)': ['hot stamping', 'hot stamp', 'press hardening', 'press-hardening', 'hot forming', 'hot press forming', 'usibor forming', 'phs process', 'direct hot stamping', 'indirect hot stamping'],
  'Deep Drawing (Multi-stage)': ['deep drawing', 'multi-stage drawing', 'multistage draw', 'redraw', 'cupping', 'ironing'],
  'Metal Spinning': ['metal spinning', 'spinning', 'flow forming', 'shear forming', 'spin forming'],
  'Cold Heading / Upsetting': ['cold heading', 'cold head', 'cold upsetting', 'header', 'bolt making', 'thread rolling', 'cold forming fastener'],
  'Open-Die Forging': ['open die forging', 'open-die forging', 'hammer forging', 'free forging', 'cogging'],
  'Tube Bending': ['tube bending', 'pipe bending', 'mandrel bending', 'rotary draw bending', 'tube forming'],
  'Roll Forming': ['roll forming', 'rollforming', 'roll-formed', 'cold roll forming', 'profile rolling'],
  'Hydroforming': ['hydroforming', 'hydroform', 'tube hydroforming', 'sheet hydroforming'],
  'Laser Cutting + Bending': ['laser cutting', 'laser cut', 'laser blanking', 'laser profiling', 'flat laser', 'cut and bend', 'laser cutting and bending'],
  'Die Casting (Aluminium)': ['die casting', 'hpdc', 'high pressure die casting', 'pressure die casting', 'aluminium die casting', 'alu die cast', 'giga casting', 'gigacasting', 'mega casting'],
  'Vacuum-Assisted Die Casting': ['vacuum die casting', 'vacural', 'vacuum assisted hpdc', 'vacuum-assisted die casting', 'high vacuum die casting'],
  'Die Casting (Zinc)': ['zinc die casting', 'hot chamber die casting', 'zamak die casting', 'zinc casting'],
  'Sand Casting': ['sand casting', 'green sand', 'sand mould casting', 'sand mold casting', 'lost foam', 'no-bake sand'],
  'Shell Mould Casting': ['shell mould', 'shell mold', 'shell moulding', 'croning process', 'croning casting', 'shell casting'],
  'Investment Casting': ['investment casting', 'lost wax', 'precision casting', 'ceramic mould casting'],
  'Gravity Die Casting': ['gravity die casting', 'gravity casting', 'permanent mould casting', 'permanent mold casting', 'gdc', 'tilt pour casting'],
  'Low-Pressure Die Casting': ['low pressure die casting', 'low-pressure die casting', 'lpdc', 'low pressure casting'],
  'Squeeze Casting': ['squeeze casting', 'squeeze cast', 'liquid forging', 'indirect squeeze casting'],
  'Semi-Solid Casting (Thixo/Rheo)': ['semi solid casting', 'semi-solid casting', 'thixocasting', 'thixomoulding', 'thixomolding', 'thixomold', 'thixomoulded', 'rheocasting', 'rheoforming', 'thixoforming', 'ssm casting'],
  'Centrifugal Casting': ['centrifugal casting', 'spin casting', 'centrifuge casting'],
  'Injection Moulding': ['injection moulding', 'injection molding', 'plastic injection', 'im', 'thermoplastic injection', 'gas assist moulding', 'two-shot moulding', 'overmoulding', 'insert moulding'],
  'Thermoforming': ['thermoforming', 'vacuum forming', 'pressure forming', 'twin sheet forming'],
  'Rotational Moulding': ['rotational moulding', 'rotational molding', 'rotomoulding', 'rotomolding', 'rotocasting'],
  'Powder Metallurgy (Press & Sinter)': ['powder metallurgy', 'press and sinter', 'press & sinter', 'sintering', 'sintered part', 'pm part', 'p/m'],
  'Metal Injection Moulding (MIM)': ['metal injection moulding', 'metal injection molding', 'mim', 'powder injection moulding', 'pim'],
  'Laser Powder Bed Fusion (DMLS/SLM)': ['laser powder bed fusion', 'lpbf', 'dmls', 'slm', 'selective laser melting', 'metal 3d printing', 'metal additive manufacturing', 'additive manufacturing', '3d printing'],
  'Composite Layup (RTM)': ['rtm', 'resin transfer moulding', 'resin transfer molding', 'composite layup', 'hand layup', 'prepreg layup', 'autoclave cure', 'hp-rtm', 'compression moulding composite'],
  'Forging (Hot)': ['hot forging', 'forging', 'closed die forging', 'impression die forging', 'drop forging', 'hot upsetting', 'near net forging'],
  'Forging (Cold)': ['cold forging', 'cold extrusion', 'cold forming', 'backward extrusion'],
  'Machining (CNC)': ['machining', 'cnc', 'cnc machining', 'milling', 'cnc milling', 'machining centre', 'machining center', '5-axis machining', 'billet machining', 'hard milling'],
  'Turning (CNC)': ['turning', 'cnc turning', 'lathe', 'cnc lathe', 'swiss turning', 'screw machining', 'bar turning'],
  'Wire EDM': ['wire edm', 'edm', 'wire erosion', 'spark erosion', 'electrical discharge machining', 'sinker edm'],
  'Deep-Hole / Gun Drilling': ['gun drilling', 'gundrilling', 'deep hole drilling', 'deep-hole drilling', 'bta drilling'],
  'Broaching': ['broaching', 'broach', 'spline broaching', 'keyway broaching'],
  'Extrusion': ['extrusion', 'extruded', 'aluminium extrusion', 'profile extrusion', 'hot extrusion'],
  'Hairpin Winding (form, insert, weld)': ['hairpin winding', 'hairpin', 'bar winding', 'wave winding', 'i-pin winding', 'hairpin stator'],
  'Coil Winding (needle/flyer, round wire)': ['coil winding', 'needle winding', 'flyer winding', 'round wire winding', 'distributed winding', 'concentrated winding'],
  'Magnet Production (sinter, grind, coat)': ['magnet production', 'magnet sintering', 'magnet grinding', 'magnet coating', 'magnet manufacture'],
  'Vacuum Pressure Impregnation (VPI)': ['vpi', 'vacuum pressure impregnation', 'impregnation', 'trickle impregnation', 'varnishing', 'potting'],
  'Lamination Stamping (Electrical Steel)': ['lamination stamping', 'lamination blanking', 'stator lamination stamping', 'rotor lamination stamping', 'electrical steel stamping', 'core stamping', 'notching'],
  'Rubber Moulding (Compression/Injection)': ['rubber moulding', 'rubber molding', 'compression moulding', 'rubber injection', 'elastomer moulding', 'seal moulding'],
  'Glass Forming (Bend + Temper)': ['glass forming', 'glass bending', 'glass tempering', 'glass toughening', 'windscreen forming'],
  'MIG Welding Assembly': ['mig welding', 'mag welding', 'gmaw', 'tig welding', 'gtaw', 'arc welding', 'robot welding', 'weld assembly', 'laser welding', 'laser weld', 'remote laser welding', 'friction stir welding', 'fsw', 'laser brazing', 'brazing', 'projection welding', 'ultrasonic welding', 'clinching', 'self piercing rivet', 'self-piercing rivet', 'spr', 'riveting', 'rivet', 'flow drill screw', 'fds', 'adhesive bonding', 'structural bonding', 'weld bonding'],
  'Resistance Spot Welding': ['spot welding', 'resistance spot welding', 'rsw', 'spot weld', 'weld nut', 'seam welding'],
  'Machining (secondary ops)': ['secondary machining', 'secondary ops', 'finish machining', 'drilling and tapping', 'deburring', 'reaming', 'honing', 'boring', 'thread cutting', 'trimming'],
  'Heat Treatment (batch)': ['heat treatment', 'heat treat', 'quench and temper', 'q&t', 'annealing', 'normalising', 'normalizing', 'solution treatment', 't6', 't7', 'ageing', 'aging', 'stress relief', 'case hardening', 'carburising', 'carburizing', 'carbonitriding', 'nitriding', 'nitrocarburising', 'induction hardening', 'through hardening', 'vacuum heat treatment', 'austempering', 'tempering'],
  'E-coat (KTL)': ['e-coat', 'ecoat', 'electrocoat', 'ktl', 'cathodic dip', 'cathodic electrodeposition', 'ed coating', 'cataphoresis'],
  'Powder Coating': ['powder coating', 'powder coat', 'electrostatic powder', 'painting', 'wet paint', 'base coat clear coat', 'topcoat', 'primer coat'],
  'Zinc Plating': ['zinc plating', 'electroplating', 'galvanising', 'galvanizing', 'zinc nickel', 'zinc-nickel', 'znni', 'anodising', 'anodizing', 'hard anodising', 'chrome plating', 'nickel plating', 'electroless nickel', 'phosphating', 'zinc phosphate', 'passivation', 'chromating', 'dacromet', 'geomet', 'mechanical plating'],
  'Grinding (finish)': ['grinding', 'surface grinding', 'cylindrical grinding', 'centreless grinding', 'centerless grinding', 'gear grinding', 'lapping', 'superfinishing', 'polishing', 'shot blasting', 'shot peening', 'bead blasting', 'vibratory finishing', 'tumbling'],
  'Washing & Final Inspection': ['washing', 'cleaning', 'final inspection', 'leak test', 'cmm inspection', 'end of line test', 'degreasing'],
});

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/[®™]/g, '')
  .replace(/[_/]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Build a longest-match-first lookup from an alias table. */
function buildIndex(table) {
  const entries = [];
  for (const [key, aliases] of Object.entries(table)) {
    entries.push([norm(key), key]);
    for (const a of aliases) entries.push([norm(a), key]);
  }
  // Longest alias first: "aluminium a356 (cast)" must beat "a356", and
  // "hot stamping" must beat "stamping".
  //
  // …but length alone is the wrong order when a GRADE DESIGNATION competes with
  // a FAMILY NAME. "20JNEH1200 silicon steel" contains both "20jneh1200" (a
  // specific 0.20 mm JIS grade) and "silicon steel" (the whole family), and raw
  // length hands it to the longer, vaguer one — the coarse-neighbour failure
  // R-26 exists to stop. A designation carries digits; a family name does not.
  // So designations sort ahead of pure-alphabetic aliases, and length decides
  // within each tier.
  const isDesignation = (a) => /\d/.test(a);
  entries.sort((a, b) => {
    const da = isDesignation(a[0]) ? 1 : 0;
    const db = isDesignation(b[0]) ? 1 : 0;
    if (da !== db) return db - da;
    return b[0].length - a[0].length;
  });
  return entries;
}

let _materialIndex = null;
let _processIndex = null;

/**
 * Look a typed string up in an alias index.
 *
 * Matches, in order: the whole normalised string, then any alias appearing in
 * it as a whole token run. Returns the catalogue key or null. `available`
 * restricts the answer to keys the live catalogue actually has, so a custom
 * rate library that drops an entry cannot resolve to it.
 */
export function aliasLookup(typed, index, available) {
  const t = norm(typed);
  if (!t) return null;
  for (const [alias, key] of index) {
    if (available && !available.has(key)) continue;
    if (t === alias) return key;
  }
  for (const [alias, key] of index) {
    if (available && !available.has(key)) continue;
    // Whole-token containment: "0.6 mm dp780 sheet" matches "dp780", but
    // "adp780x" does not match "dp780".
    const re = new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
    if (re.test(t)) return key;
  }
  return null;
}

/** Catalogue key for a typed material, or null. */
export function materialAlias(typed, materials) {
  _materialIndex ||= buildIndex(MATERIAL_ALIASES);
  return aliasLookup(typed, _materialIndex, materials ? new Set(Object.keys(materials)) : null);
}

/** Catalogue key for a typed process, or null. */
export function processAlias(typed, processes) {
  _processIndex ||= buildIndex(PROCESS_ALIASES);
  return aliasLookup(typed, _processIndex, processes ? new Set(Object.keys(processes)) : null);
}
