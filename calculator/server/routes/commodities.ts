import { Router } from 'express';

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommodityBase {
  id: string;
  name: string;
  category: string;   // 'Steel' | 'Aluminium' | 'Copper' | 'Battery' | 'Magnets' | 'Plastics' | 'Rubber' | 'Composites' | 'EDU' | 'Electronics'
  unit: string;       // '$/ton' | '$/kg' | '$/wafer'
  basePrice: number;  // USD
  volatility: number; // daily σ as fraction e.g. 0.008 = 0.8%
  trend: number;      // weekly drift fraction e.g. 0.002 = +0.2%/week
  region: string;     // 'LME Global' | 'Asia' | 'Europe' | 'Global'
  source: string;     // 'LME' | 'SMM' | 'ICIS' | 'Fastmarkets' | 'BMI'
  impactCoeff: number; // should-cost sensitivity: % part cost change per % commodity price change
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
}

interface LiveCommodity extends CommodityBase {
  currentPrice: number;
  changeDay: number;    // % day change
  changeWeek: number;   // % week change
  history: number[];    // last 30 daily prices
  forecast30?: number;
  forecast90?: number;
  forecastDirection?: 'up' | 'down' | 'flat';
}

// ─── Commodity Catalog ────────────────────────────────────────────────────────

const COMMODITY_CATALOG: CommodityBase[] = [
  // STEEL
  { id:'hrc',            name:'Hot Rolled Coil',          category:'Steel',       unit:'$/ton',   basePrice:645,   volatility:0.012, trend:-0.001, region:'LME Global', source:'LME',          impactCoeff:0.35, riskLevel:'Medium'   },
  { id:'crc',            name:'Cold Rolled Coil (CRCA)',   category:'Steel',       unit:'$/ton',   basePrice:790,   volatility:0.011, trend:-0.001, region:'LME Global', source:'LME',          impactCoeff:0.38, riskLevel:'Medium'   },
  { id:'dp600',          name:'DP600 AHSS',                category:'Steel',       unit:'$/ton',   basePrice:960,   volatility:0.010, trend:0.001,  region:'Europe',     source:'Fastmarkets',  impactCoeff:0.40, riskLevel:'Low'      },
  { id:'dp780',          name:'DP780 AHSS',                category:'Steel',       unit:'$/ton',   basePrice:1065,  volatility:0.010, trend:0.001,  region:'Europe',     source:'Fastmarkets',  impactCoeff:0.40, riskLevel:'Low'      },
  { id:'dp980',          name:'DP980 AHSS',                category:'Steel',       unit:'$/ton',   basePrice:1195,  volatility:0.009, trend:0.001,  region:'Europe',     source:'Fastmarkets',  impactCoeff:0.38, riskLevel:'Low'      },
  { id:'ms1500',         name:'MS1500 PHS / Boron Steel',  category:'Steel',       unit:'$/ton',   basePrice:1420,  volatility:0.009, trend:0.002,  region:'Europe',     source:'Fastmarkets',  impactCoeff:0.36, riskLevel:'Low'      },
  { id:'ss304',          name:'Stainless Steel 304',       category:'Steel',       unit:'$/ton',   basePrice:2750,  volatility:0.014, trend:0.002,  region:'Asia',       source:'SMM',          impactCoeff:0.42, riskLevel:'Medium'   },
  { id:'ss316',          name:'Stainless Steel 316',       category:'Steel',       unit:'$/ton',   basePrice:3380,  volatility:0.013, trend:0.002,  region:'Asia',       source:'SMM',          impactCoeff:0.42, riskLevel:'Medium'   },
  // ALUMINIUM
  { id:'al_primary',     name:'Primary Aluminium (LME)',   category:'Aluminium',   unit:'$/ton',   basePrice:2580,  volatility:0.013, trend:0.001,  region:'LME Global', source:'LME',          impactCoeff:0.45, riskLevel:'Medium'   },
  { id:'al5754',         name:'AA5754-O Sheet',            category:'Aluminium',   unit:'$/ton',   basePrice:3120,  volatility:0.011, trend:0.001,  region:'Europe',     source:'Fastmarkets',  impactCoeff:0.48, riskLevel:'Low'      },
  { id:'al6061',         name:'AA6061-T6 Sheet',           category:'Aluminium',   unit:'$/ton',   basePrice:3420,  volatility:0.011, trend:0.001,  region:'Europe',     source:'Fastmarkets',  impactCoeff:0.48, riskLevel:'Low'      },
  { id:'a380',           name:'A380 Die Cast Alloy',       category:'Aluminium',   unit:'$/ton',   basePrice:2870,  volatility:0.012, trend:0.000,  region:'Asia',       source:'SMM',          impactCoeff:0.50, riskLevel:'Low'      },
  { id:'adc12',          name:'ADC12 Die Cast Alloy',      category:'Aluminium',   unit:'$/ton',   basePrice:2790,  volatility:0.012, trend:0.000,  region:'Asia',       source:'SMM',          impactCoeff:0.50, riskLevel:'Low'      },
  { id:'al7075',         name:'AA7075-T6 Forging',         category:'Aluminium',   unit:'$/ton',   basePrice:4200,  volatility:0.013, trend:0.002,  region:'Global',     source:'Fastmarkets',  impactCoeff:0.44, riskLevel:'Medium'   },
  // COPPER
  { id:'cu_cathode',     name:'Copper Cathode (LME)',      category:'Copper',      unit:'$/ton',   basePrice:9250,  volatility:0.015, trend:0.002,  region:'LME Global', source:'LME',          impactCoeff:0.55, riskLevel:'High'     },
  { id:'cu_rod',         name:'Copper Rod Class 5',        category:'Copper',      unit:'$/ton',   basePrice:10100, volatility:0.014, trend:0.002,  region:'Europe',     source:'Fastmarkets',  impactCoeff:0.60, riskLevel:'High'     },
  { id:'nickel',         name:'Nickel (LME)',              category:'Copper',      unit:'$/ton',   basePrice:16800, volatility:0.020, trend:-0.002, region:'LME Global', source:'LME',          impactCoeff:0.30, riskLevel:'High'     },
  { id:'zinc',           name:'Zinc (LME)',                category:'Copper',      unit:'$/ton',   basePrice:2980,  volatility:0.014, trend:0.001,  region:'LME Global', source:'LME',          impactCoeff:0.12, riskLevel:'Medium'   },
  // BATTERY MATERIALS
  { id:'li_carbonate',   name:'Lithium Carbonate',         category:'Battery',     unit:'$/ton',   basePrice:11500, volatility:0.025, trend:-0.005, region:'Asia',       source:'SMM',          impactCoeff:0.65, riskLevel:'Critical' },
  { id:'li_hydroxide',   name:'Lithium Hydroxide',         category:'Battery',     unit:'$/ton',   basePrice:12800, volatility:0.024, trend:-0.004, region:'Asia',       source:'SMM',          impactCoeff:0.65, riskLevel:'Critical' },
  { id:'cobalt',         name:'Cobalt Sulphate',           category:'Battery',     unit:'$/ton',   basePrice:27500, volatility:0.022, trend:-0.003, region:'Global',     source:'BMI',          impactCoeff:0.55, riskLevel:'Critical' },
  { id:'nickel_sulphate',name:'Nickel Sulphate',           category:'Battery',     unit:'$/ton',   basePrice:4950,  volatility:0.019, trend:-0.002, region:'Asia',       source:'SMM',          impactCoeff:0.50, riskLevel:'High'     },
  { id:'manganese_sulphate', name:'Manganese Sulphate',    category:'Battery',     unit:'$/ton',   basePrice:680,   volatility:0.015, trend:0.001,  region:'Asia',       source:'SMM',          impactCoeff:0.20, riskLevel:'Medium'   },
  { id:'nmc811',         name:'NMC811 Cathode',            category:'Battery',     unit:'$/kg',    basePrice:33.5,  volatility:0.022, trend:-0.003, region:'Asia',       source:'SMM',          impactCoeff:0.70, riskLevel:'Critical' },
  { id:'lfp',            name:'LFP Cathode',               category:'Battery',     unit:'$/kg',    basePrice:14.8,  volatility:0.018, trend:-0.004, region:'Asia',       source:'SMM',          impactCoeff:0.65, riskLevel:'High'     },
  { id:'nat_graphite',   name:'Natural Graphite Anode',    category:'Battery',     unit:'$/ton',   basePrice:860,   volatility:0.018, trend:-0.002, region:'Asia',       source:'BMI',          impactCoeff:0.35, riskLevel:'High'     },
  { id:'synth_graphite', name:'Synthetic Graphite Anode',  category:'Battery',     unit:'$/ton',   basePrice:1850,  volatility:0.015, trend:0.001,  region:'Global',     source:'BMI',          impactCoeff:0.35, riskLevel:'Medium'   },
  { id:'lipf6',          name:'LiPF6 Electrolyte Salt',    category:'Battery',     unit:'$/ton',   basePrice:11200, volatility:0.025, trend:-0.003, region:'Asia',       source:'SMM',          impactCoeff:0.25, riskLevel:'High'     },
  // MAGNETS / EDU
  { id:'ndfeb_n35',      name:'NdFeB Magnet N35',          category:'Magnets',     unit:'$/kg',    basePrice:72,    volatility:0.018, trend:0.003,  region:'Asia',       source:'Asian Metal',  impactCoeff:0.45, riskLevel:'High'     },
  { id:'ndfeb_n52',      name:'NdFeB Magnet N52',          category:'Magnets',     unit:'$/kg',    basePrice:118,   volatility:0.018, trend:0.003,  region:'Asia',       source:'Asian Metal',  impactCoeff:0.45, riskLevel:'High'     },
  { id:'elec_steel_m270',name:'Electrical Steel M270-35A', category:'EDU',         unit:'$/ton',   basePrice:1850,  volatility:0.010, trend:0.002,  region:'Europe',     source:'Fastmarkets',  impactCoeff:0.38, riskLevel:'Medium'   },
  { id:'elec_steel_m300',name:'Electrical Steel M300-35A', category:'EDU',         unit:'$/ton',   basePrice:1780,  volatility:0.010, trend:0.002,  region:'Europe',     source:'Fastmarkets',  impactCoeff:0.38, riskLevel:'Medium'   },
  { id:'sic_wafer',      name:'SiC 150mm Wafer',           category:'Electronics', unit:'$/wafer', basePrice:780,   volatility:0.020, trend:0.005,  region:'Global',     source:'Yole',         impactCoeff:0.55, riskLevel:'High'     },
  // PLASTICS
  { id:'pp_h',           name:'PP Homopolymer',            category:'Plastics',    unit:'$/ton',   basePrice:1020,  volatility:0.016, trend:0.001,  region:'Europe',     source:'ICIS',         impactCoeff:0.42, riskLevel:'Low'      },
  { id:'pp_gf30',        name:'PP-GF30 Compound',          category:'Plastics',    unit:'$/ton',   basePrice:1820,  volatility:0.014, trend:0.001,  region:'Europe',     source:'ICIS',         impactCoeff:0.45, riskLevel:'Low'      },
  { id:'pa6',            name:'PA6 (Nylon 6)',             category:'Plastics',    unit:'$/ton',   basePrice:2050,  volatility:0.015, trend:0.001,  region:'Europe',     source:'ICIS',         impactCoeff:0.48, riskLevel:'Medium'   },
  { id:'pa66',           name:'PA66 (Nylon 66)',           category:'Plastics',    unit:'$/ton',   basePrice:2380,  volatility:0.016, trend:0.002,  region:'Global',     source:'ICIS',         impactCoeff:0.48, riskLevel:'High'     },
  { id:'pa6_gf30',       name:'PA6-GF30 Compound',         category:'Plastics',    unit:'$/ton',   basePrice:2850,  volatility:0.014, trend:0.001,  region:'Europe',     source:'ICIS',         impactCoeff:0.50, riskLevel:'Medium'   },
  { id:'abs_gp',         name:'ABS General Purpose',       category:'Plastics',    unit:'$/ton',   basePrice:1620,  volatility:0.014, trend:0.000,  region:'Asia',       source:'ICIS',         impactCoeff:0.40, riskLevel:'Low'      },
  { id:'pc_abs',         name:'PC/ABS Blend',              category:'Plastics',    unit:'$/ton',   basePrice:2750,  volatility:0.013, trend:0.001,  region:'Europe',     source:'ICIS',         impactCoeff:0.42, riskLevel:'Low'      },
  { id:'pbt_gf30',       name:'PBT-GF30',                  category:'Plastics',    unit:'$/ton',   basePrice:3050,  volatility:0.013, trend:0.001,  region:'Europe',     source:'ICIS',         impactCoeff:0.45, riskLevel:'Low'      },
  // RUBBER
  { id:'epdm',           name:'EPDM',                      category:'Rubber',      unit:'$/ton',   basePrice:1750,  volatility:0.015, trend:0.001,  region:'Europe',     source:'ICIS',         impactCoeff:0.40, riskLevel:'Low'      },
  { id:'nbr',            name:'NBR (Nitrile)',             category:'Rubber',      unit:'$/ton',   basePrice:2050,  volatility:0.014, trend:0.001,  region:'Asia',       source:'ICIS',         impactCoeff:0.40, riskLevel:'Low'      },
  { id:'silicone_vmq',   name:'Silicone VMQ',              category:'Rubber',      unit:'$/ton',   basePrice:6400,  volatility:0.012, trend:0.001,  region:'Asia',       source:'ICIS',         impactCoeff:0.38, riskLevel:'Medium'   },
  { id:'fkm',            name:'FKM (Viton)',               category:'Rubber',      unit:'$/ton',   basePrice:21500, volatility:0.010, trend:0.002,  region:'Global',     source:'ICIS',         impactCoeff:0.35, riskLevel:'Medium'   },
  // COMPOSITES
  { id:'cf_t300',        name:'Carbon Fiber T300',         category:'Composites',  unit:'$/kg',    basePrice:17.5,  volatility:0.012, trend:0.001,  region:'Global',     source:'Toray',        impactCoeff:0.55, riskLevel:'Medium'   },
  { id:'cf_t700',        name:'Carbon Fiber T700',         category:'Composites',  unit:'$/kg',    basePrice:22.0,  volatility:0.012, trend:0.001,  region:'Global',     source:'Toray',        impactCoeff:0.55, riskLevel:'Medium'   },
  { id:'eglass',         name:'E-Glass Fiber',             category:'Composites',  unit:'$/kg',    basePrice:2.45,  volatility:0.010, trend:0.000,  region:'Global',     source:'Owens Corning',impactCoeff:0.30, riskLevel:'Low'      },
];

// ─── Region Risk Index ────────────────────────────────────────────────────────

export const REGION_RISK: Record<string, {
  volatility: number; geopolitical: number; supply: number; energy: number; labour: number; overall: number; label: string;
}> = {
  'Global':  { volatility:35, geopolitical:30, supply:30, energy:35, labour:25, overall:31, label:'Moderate' },
  'China':   { volatility:42, geopolitical:68, supply:40, energy:38, labour:28, overall:43, label:'Elevated' },
  'India':   { volatility:38, geopolitical:32, supply:45, energy:42, labour:22, overall:36, label:'Moderate' },
  'Europe':  { volatility:28, geopolitical:48, supply:32, energy:65, labour:55, overall:46, label:'Elevated' },
  'USA':     { volatility:30, geopolitical:35, supply:28, energy:30, labour:48, overall:34, label:'Moderate' },
  'Japan':   { volatility:22, geopolitical:28, supply:35, energy:58, labour:52, overall:39, label:'Moderate' },
  'Korea':   { volatility:25, geopolitical:45, supply:32, energy:52, labour:48, overall:40, label:'Moderate' },
  'Mexico':  { volatility:48, geopolitical:42, supply:38, energy:35, labour:25, overall:38, label:'Moderate' },
  'UK':      { volatility:32, geopolitical:30, supply:35, energy:62, labour:52, overall:42, label:'Elevated' },
};

// ─── Price Simulation Engine ──────────────────────────────────────────────────

/**
 * Generate 30-day history using Gaussian random walk
 */
function generateHistory(base: number, vol: number, trend: number, days = 30): number[] {
  const hist: number[] = [];
  let p = base * (0.9 + Math.random() * 0.1);
  for (let i = 0; i < days; i++) {
    const drift = trend / 7;           // daily drift from weekly trend
    const noise = vol * (Math.random() + Math.random() - 1); // ~normal(0, vol)
    p = Math.max(base * 0.75, Math.min(base * 1.25, p * (1 + drift + noise)));
    hist.push(Math.round(p * 100) / 100);
  }
  return hist;
}

/**
 * Simulate live price movement (bounded random walk tick)
 */
function tickPrice(comm: LiveCommodity): void {
  const drift = comm.trend / 7;
  const noise = comm.volatility * (Math.random() + Math.random() - 1);
  const newPrice = Math.max(comm.basePrice * 0.75, Math.min(comm.basePrice * 1.25,
    comm.currentPrice * (1 + drift + noise)
  ));
  const change = (newPrice - comm.currentPrice) / comm.currentPrice;
  comm.history.push(Math.round(newPrice * 100) / 100);
  if (comm.history.length > 30) comm.history.shift();
  comm.currentPrice = Math.round(newPrice * 100) / 100;
  comm.changeDay = Math.round(change * 10000) / 100;
  comm.changeWeek = Math.round(((comm.currentPrice / comm.history[Math.max(0, comm.history.length - 7)]) - 1) * 10000) / 100;
}

// ─── Module-level state ───────────────────────────────────────────────────────

const liveMap = new Map<string, LiveCommodity>();
let lastTickTime = 0;

// Initialize all commodities with history and starting prices at startup
function initializeCommodities(): void {
  for (const base of COMMODITY_CATALOG) {
    const history = generateHistory(base.basePrice, base.volatility, base.trend, 30);
    const startPrice = Math.round(base.basePrice * (0.98 + Math.random() * 0.04) * 100) / 100;
    const comm: LiveCommodity = {
      ...base,
      currentPrice: startPrice,
      changeDay: 0,
      changeWeek: 0,
      history,
    };
    // Compute initial day/week changes from history
    if (history.length >= 2) {
      comm.changeDay = Math.round(((startPrice / history[history.length - 1]) - 1) * 10000) / 100;
    }
    if (history.length >= 7) {
      comm.changeWeek = Math.round(((startPrice / history[Math.max(0, history.length - 7)]) - 1) * 10000) / 100;
    }
    liveMap.set(base.id, comm);
  }
  lastTickTime = Date.now();
  console.log(`[commodities] Initialized ${liveMap.size} commodities`);
}

// Tick all prices (called periodically)
function tickAll(): void {
  liveMap.forEach(comm => tickPrice(comm));
  lastTickTime = Date.now();
  console.log(`[commodities] Ticked all ${liveMap.size} prices at ${new Date().toISOString()}`);
}

// Initialize on module load
initializeCommodities();

// Auto-tick every 30 minutes
const TICK_INTERVAL_MS = 30 * 60 * 1000;
setInterval(tickAll, TICK_INTERVAL_MS);

// ─── Forecast computation ─────────────────────────────────────────────────────

function computeForecast(comm: LiveCommodity): { forecast30: number; forecast90: number; forecastDirection: 'up' | 'down' | 'flat' } {
  const h = comm.history;
  const recentTrend = h.length >= 7
    ? (h[h.length - 1] - h[Math.max(0, h.length - 7)]) / 7
    : 0;
  const forecast30 = Math.round(comm.currentPrice * (1 + recentTrend * 30 / comm.currentPrice) * 100) / 100;
  const forecast90 = Math.round(comm.currentPrice * (1 + recentTrend * 60 / comm.currentPrice + comm.trend * 13) * 100) / 100;
  const forecastDirection: 'up' | 'down' | 'flat' = forecast30 > comm.currentPrice ? 'up' : forecast30 < comm.currentPrice ? 'down' : 'flat';
  return { forecast30, forecast90, forecastDirection };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/commodities
 * Returns all live commodity prices with forecasts, plus region risk index
 */
router.get('/', (_req, res) => {
  // Tick if cache is older than 30 minutes (belt-and-suspenders for the setInterval)
  if (Date.now() - lastTickTime >= TICK_INTERVAL_MS) {
    tickAll();
  }

  const commodities = Array.from(liveMap.values()).map(comm => {
    const { forecast30, forecast90, forecastDirection } = computeForecast(comm);
    return {
      id: comm.id,
      name: comm.name,
      category: comm.category,
      unit: comm.unit,
      basePrice: comm.basePrice,
      currentPrice: comm.currentPrice,
      changeDay: comm.changeDay,
      changeWeek: comm.changeWeek,
      history: comm.history,
      volatility: comm.volatility,
      trend: comm.trend,
      region: comm.region,
      source: comm.source,
      impactCoeff: comm.impactCoeff,
      riskLevel: comm.riskLevel,
      forecast30,
      forecast90,
      forecastDirection,
    };
  });

  res.json({
    commodities,
    lastUpdated: new Date(lastTickTime).toISOString(),
    cached: Date.now() - lastTickTime < TICK_INTERVAL_MS,
    riskIndex: REGION_RISK,
  });
});

/**
 * GET /api/commodities/history/:id
 * Returns the 30-day price history for a single commodity
 */
router.get('/history/:id', (req, res) => {
  const comm = liveMap.get(req.params.id);
  if (!comm) {
    res.status(404).json({ error: `Commodity '${req.params.id}' not found` });
    return;
  }
  res.json({
    id: comm.id,
    history: comm.history,
    unit: comm.unit,
  });
});

export default router;
