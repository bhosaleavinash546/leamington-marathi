import { Router } from 'express';
import { isAirGapped } from '../utils/ai-client.js';
import type { Request, Response } from 'express';

const router = Router();

interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
  imageUrl?: string;
}

interface FeedSource {
  url: string;
  name: string;
  defaultCategory: string;
}

const FEED_SOURCES: FeedSource[] = [
  { url: 'https://electrek.co/feed/', name: 'Electrek', defaultCategory: 'EV Tech' },
  { url: 'https://insideevs.com/feed/', name: 'InsideEVs', defaultCategory: 'EV Tech' },
  { url: 'https://www.greencarcongress.com/atom.xml', name: 'Green Car Congress', defaultCategory: 'EV Tech' },
  { url: 'https://www.theengineer.co.uk/feed/', name: 'The Engineer', defaultCategory: 'Manufacturing' },
  { url: 'https://www.automotiveworld.com/feed/', name: 'Automotive World', defaultCategory: 'Automotive' },
  { url: 'https://www.compositesworld.com/rss/news', name: 'Composites World', defaultCategory: 'Composites' },
  { url: 'https://www.plasticstoday.com/rss', name: 'Plastics Today', defaultCategory: 'Plastics' },
  { url: 'https://www.wardsauto.com/rss', name: 'Wards Auto', defaultCategory: 'Automotive' },
  { url: 'https://www.sae.org/rss/news', name: 'SAE International', defaultCategory: 'Manufacturing' },
  { url: 'https://manufacturing.net/rss/industry-news', name: 'Manufacturing.net', defaultCategory: 'Manufacturing' },
  { url: 'https://www.automotivemanufacturingsolutions.com/feed', name: 'Automotive Mfg Solutions', defaultCategory: 'Manufacturing' },
  { url: 'https://www.just-auto.com/feed/', name: 'Just Auto', defaultCategory: 'Automotive' },
  { url: 'https://www.engineeringnews.co.za/rss/article.rss', name: 'Engineering News', defaultCategory: 'Manufacturing' },
  { url: 'https://batterytechnology.news/feed/', name: 'Battery Technology News', defaultCategory: 'Battery' },
  { url: 'https://semiconductorengineering.com/feed/', name: 'Semiconductor Engineering', defaultCategory: 'PCB / PCBA' },
  { url: 'https://chargedevs.com/feed/', name: 'Charged EVs', defaultCategory: 'Battery' },
  { url: 'https://cleantechnica.com/feed/', name: 'CleanTechnica', defaultCategory: 'EV Tech' },
  { url: 'https://www.supplychaindive.com/feeds/news/', name: 'Supply Chain Dive', defaultCategory: 'Cost & Commodity' },
  { url: 'https://agmetalminer.com/feed/', name: 'MetalMiner', defaultCategory: 'Cost & Commodity' },
  { url: 'https://www.plasticsnews.com/rss/news', name: 'Plastics News', defaultCategory: 'Plastics' },
  { url: 'https://electrive.com/feed/', name: 'Electrive', defaultCategory: 'EV Tech' },
  { url: 'https://www.mining.com/feed/', name: 'Mining.com', defaultCategory: 'Materials' },
  { url: 'https://www.benchmarkminerals.com/feed/', name: 'Benchmark Mineral Intelligence', defaultCategory: 'Battery' },
  { url: 'https://batteryindustry.tech/feed/', name: 'Battery Industry', defaultCategory: 'Battery' },
  { url: 'https://www.autonews.com/rss.xml', name: 'Automotive News', defaultCategory: 'Automotive' },
  { url: 'https://www.robotics247.com/rss/', name: 'Robotics247', defaultCategory: 'Robotics' },
  { url: 'https://industrytoday.com/feed/', name: 'Industry Today', defaultCategory: 'Manufacturing' },
  { url: 'https://www.thedriven.io/feed/', name: 'The Driven', defaultCategory: 'EV Tech' },
  { url: 'https://www.autonews.com/manufacturing/rss.xml', name: 'Automotive News Mfg', defaultCategory: 'Manufacturing' },
  { url: 'https://www.freightwaves.com/news/feed', name: 'FreightWaves', defaultCategory: 'Cost & Commodity' },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Battery':          ['battery', 'lithium', 'cathode', 'anode', 'bev', 'cell chemistry', 'solid.state', 'gigafactory', 'energy storage', 'battery pack', 'kwh', 'soc', 'bms'],
  'EV Tech':          ['electric vehicle', 'electric car', 'bev', 'phev', 'hybrid', 'fuel cell', 'charging', 'fast charge', 'range', 'e-mobility', 'zero emission'],
  'EDU':              ['electric motor', 'inverter', 'gearbox', 'drivetrain', 'electric drive', 'e-axle', 'e-drive', 'powertrain', 'torque vectoring', 'motor winding'],
  'BIW':              ['body.in.white', 'biw', 'body structure', 'car body', 'roof panel', 'door panel', 'structural adhesive', 'crash structure'],
  'Chassis':          ['chassis', 'subframe', 'crossmember', 'vehicle platform', 'underbody', 'floor structure', 'space frame'],
  'Suspension':       ['suspension', 'shock absorber', 'damper', 'spring', 'wishbone', 'control arm', 'knuckle', 'hub carrier', 'mcpherson', 'multi.link', 'air suspension'],
  'Casting':          ['casting', 'die cast', 'hpdc', 'foundry', 'sand cast', 'investment cast', 'megacasting', 'giga press', 'diecast', 'cast aluminum', 'pressure die'],
  'Forging':          ['forging', 'forged', 'hot stamp', 'press hardening', 'precision forging', 'closed die', 'open die', 'warm forging'],
  'Machining':        ['machining', 'cnc', 'turning', 'milling', 'grinding', 'boring', 'drilling', 'cutting tool', 'hmc', 'vmc', '5-axis'],
  'Sheet Metal':      ['sheet metal', 'stamping', 'pressing', 'blanking', 'deep draw', 'laser cut', 'progressive die', 'transfer die'],
  'Composites':       ['composite', 'carbon fiber', 'cfrp', 'gfrp', 'glass fiber', 'fiber reinforced', 'prepreg', 'autoclave', 'rtm', 'infusion', 'smc', 'bmc', 'natural fiber'],
  'Plastics':         ['plastic', 'polymer', 'injection mould', 'polypropylene', 'polyamide', 'thermoplastic', 'abs plastic', 'nylon', 'resin', 'blow moulding', 'extrusion', 'rotomould'],
  'PCB / PCBA':       ['pcb', 'pcba', 'printed circuit', 'semiconductor', 'microcontroller', 'ecu', 'adas', 'radar chip', 'lidar electronics', 'smt', 'surface mount', 'bga', 'automotive chip'],
  'Harness':          ['wiring harness', 'wire harness', 'cable assembly', 'connector', 'hv cable', 'low voltage', 'hsd', 'twisted pair', 'can bus wiring'],
  'Lightweighting':   ['lightweight', 'lightweighting', 'weight reduction', 'mass reduction', 'aluminium', 'aluminum', 'magnesium', 'titanium', 'multi.material', 'topology optimis'],
  'Materials':        ['new material', 'alloy', 'advanced steel', 'ahss', 'uhss', 'dual phase', 'trip steel', 'high entropy', 'am60', 'az91', 'engineering plastic'],
  'Robotics':         ['robot', 'cobots', 'automation', 'automated assembly', 'industry 4.0', 'ai manufacturing', 'digital twin', 'smart factory', 'iot manufacturing'],
  'Sustainability':   ['sustainability', 'recycling', 'circular economy', 'carbon neutral', 'green manufacturing', 'co2 reduction', 'scope 3', 'lifecycle', 'bio-based'],
  'Cost & Commodity': ['manufacturing cost', 'commodity price', 'steel price', 'aluminium price', 'supply chain cost', 'tariff', 'raw material cost', 'inflation', 'shortage', 'procurement'],
  'Assembly':         ['final assembly', 'assembly line', 'production plant', 'body shop', 'paint shop', 'trim assembly', 'marriage', 'end of line'],
};

const AUTOMOTIVE_FILTER = [
  'automotive', 'vehicle', 'car ', 'auto ', 'mobility', 'oem', 'tier 1', 'tier1', 'tier-1',
  'electric vehicle', ' ev ', 'hybrid', 'bev', 'phev', 'fuel cell',
  'manufacturing', 'production', 'assembly plant', 'supply chain', 'powertrain',
  'battery', 'electric motor', 'inverter', 'chassis', 'suspension', 'biw', 'stamping',
  'casting', 'forging', 'machining', 'alumin', 'steel', 'composite', 'plastic',
  'lightweighting', 'weight reduction', 'material cost', 'commodity', 'pcb', 'harness',
  'semiconductor chip', 'robot', 'automation', 'gigafactory',
  'tesla', 'bmw', 'toyota', 'volkswagen', 'ford', 'gm ', 'stellantis', 'hyundai',
  'mercedes', 'audi', 'porsche', 'rivian', 'lucid', 'nio', 'byd', 'volvo', 'jaguar',
  'land rover', 'renault', 'peugeot', 'nissan', 'honda', 'mazda', 'subaru',
  'lithium', 'cobalt', 'nickel', 'manganese', 'rare earth', 'critical mineral',
  'press hardening', 'spot weld', 'resistance weld', 'laser weld',
  'tier 2', 'tier 3', 'jit ', 'just-in-time', 'kanban', 'lean manufacturing',
  'gigacast', 'structural battery', 'cell-to-pack',
];

const EXCLUDE_FILTER = [
  'racing', 'formula 1', 'nascar', 'grand prix', 'motorsport', 'rally car',
  'dealership', 'test drive', 'review:', 'first drive', 'road test',
  'car insurance', 'used car', 'buy a car', 'best cars', 'lease deal',
];

function classifyCategory(title: string, summary: string, defaultCat: string): string {
  const text = (title + ' ' + summary).toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => {
      const pattern = kw.replace('.', '[^a-z]?');
      try { return new RegExp(pattern, 'i').test(text); } catch { return text.includes(kw); }
    })) return cat;
  }
  return defaultCat;
}

function isRelevant(title: string, summary: string): boolean {
  const text = (title + ' ' + summary).toLowerCase();
  if (EXCLUDE_FILTER.some(kw => text.includes(kw))) return false;
  return AUTOMOTIVE_FILTER.some(kw => text.includes(kw));
}

function stripCDATA(s: string): string { return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(); }
function stripHtml(s: string): string  { return s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim(); }
function cleanText(s: string): string  { return stripHtml(stripCDATA(s)); }

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? cleanText(m[1]) : '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`, 'i'));
  return m ? m[1] : '';
}

function parseItems(xmlText: string, source: FeedSource): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const itemRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(xmlText)) !== null) {
    const item = match[1];

    const title = (extractTag(item, 'title') || '').slice(0, 220);
    if (!title || title.length < 10) continue;

    // URL: atom link href, then <link>, then <guid>
    const url = extractAttr(item, 'link', 'href')
      || extractTag(item, 'link')
      || extractTag(item, 'guid')
      || '';
    if (!url.startsWith('http')) continue;

    const rawDesc = extractTag(item, 'description')
      || extractTag(item, 'summary')
      || extractTag(item, 'content');
    const summary = rawDesc.slice(0, 300);

    const pubDate = extractTag(item, 'pubDate')
      || extractTag(item, 'published')
      || extractTag(item, 'updated')
      || new Date().toUTCString();

    const imageUrl = extractAttr(item, 'media:content', 'url')
      || extractAttr(item, 'media:thumbnail', 'url')
      || extractAttr(item, 'enclosure', 'url')
      || '';

    if (!isRelevant(title, summary)) continue;

    articles.push({
      id: Buffer.from(url).toString('base64').slice(0, 24),
      title,
      summary: summary || title,
      url,
      source: source.name,
      publishedAt: pubDate,
      category: classifyCategory(title, summary, source.defaultCategory),
      imageUrl: imageUrl || undefined,
    });
  }
  return articles;
}

async function fetchFeed(source: FeedSource): Promise<NewsArticle[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CostVisionBot/1.0; +https://costvision.ai)',
        'Accept': 'application/rss+xml,application/atom+xml,text/xml,application/xml,*/*',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const text = await res.text();
    return parseItems(text, source);
  } catch {
    return [];
  }
}

let cache: { articles: NewsArticle[]; ts: number } | null = null;
const CACHE_MS = 15 * 60 * 1000;

async function buildFeed(): Promise<NewsArticle[]> {
  // Air-gapped deployments make no outbound fetches — an empty feed, not an error.
  if (isAirGapped()) return [];

  const results = await Promise.allSettled(FEED_SOURCES.map(fetchFeed));
  const all: NewsArticle[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const a of r.value) {
      if (!seen.has(a.url)) { seen.add(a.url); all.push(a); }
    }
  }

  all.sort((a, b) => {
    const ta = new Date(a.publishedAt).getTime() || 0;
    const tb = new Date(b.publishedAt).getTime() || 0;
    return tb - ta;
  });

  return all.slice(0, 120);
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = Date.now();
    if (cache && now - cache.ts < CACHE_MS) {
      res.json({ articles: cache.articles, cached: true, ageSeconds: Math.round((now - cache.ts) / 1000) });
      return;
    }
    const articles = await buildFeed();
    cache = { articles, ts: Date.now() };
    res.json({ articles, cached: false, ageSeconds: 0 });
  } catch (err) {
    res.status(500).json({ error: 'News fetch failed', articles: [] });
  }
});

router.post('/refresh', async (_req: Request, res: Response): Promise<void> => {
  try {
    cache = null;
    const articles = await buildFeed();
    cache = { articles, ts: Date.now() };
    res.json({ articles, refreshed: true });
  } catch (err) {
    res.status(500).json({ error: 'Refresh failed', articles: [] });
  }
});

export default router;
