import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, ChevronRight, HelpCircle, BookOpen, Mail, Zap, Terminal, Download, Globe, Lock, Shield, Cpu, BarChart3, Sparkles, Map, Share2, Package, Smartphone } from 'lucide-react';
import { APP_VERSION } from '../version';


const BUILD_DATE = 'June 2026';

interface FaqItem { q: string; a: string; }
interface FaqSection { category: string; icon: React.ElementType; items: FaqItem[]; }

const FAQ: FaqSection[] = [
  {
    category: 'Getting Started',
    icon: BookOpen,
    items: [
      { q: 'What is BrainSpark?', a: 'BrainSpark is an AI-powered VAVE (Value Analysis / Value Engineering) tool for automotive products. It uses a Chief Engineer AI persona with 30+ years of domain expertise and live internet search to generate all available DFMA and cost-engineering ideas in a single click, across 13 vehicle systems and 250+ parts, plus a Marketplace of 1,250+ curated, benchmarked cost-reduction ideas.' },
      { q: 'Do I need an API key to use this?', a: 'Yes — you need an Anthropic API key (for Claude AI). You enter it on the Analyze page. It is stored only in your browser session and never saved to any server.' },
      { q: 'How do I run the tool locally?', a: 'Install Node.js v18+, run "npm install" once, then "npm run dev" to start both the backend (port 3001) and frontend (port 5173). Open http://localhost:5173 in your browser.' },
      { q: 'Is an internet connection required?', a: 'An internet connection is required to call the Claude AI API. The optional web search feature (enabled by default) also uses internet to fetch live pricing and supplier data for more accurate estimates.' },
    ],
  },
  {
    category: 'Analysis & AI',
    icon: Cpu,
    items: [
      { q: 'How does the AI generate ideas?', a: 'The Chief Engineer AI persona (30+ years automotive experience) analyses the selected part/subassembly using DFMA principles, material science, supply chain knowledge, and real-time web search data. It then generates structured ideas with savings estimates, implementation steps, risks, and timelines.' },
      { q: 'What does "web search" do?', a: 'When enabled, the AI performs up to 8 targeted internet searches per analysis — looking for current material prices, supplier benchmarks, and manufacturing process costs. This grounds estimates in real market data rather than training knowledge alone.' },
      { q: 'How accurate are the savings estimates?', a: 'Estimates are directionally accurate based on automotive benchmarks and live market data. They should be treated as engineering ballpark figures and validated with detailed cost studies and supplier RFQs before business case commitment.' },
      { q: 'What is the difference between Assembly, Subassembly, and Part level analysis?', a: 'System-level gives broad DFMA opportunities across the entire subsystem. Subassembly level focuses on interface and integration savings. Part level provides surgical, component-specific ideas with the highest precision. All three levels can be analysed for the same target.' },
      { q: 'How many ideas does the AI generate?', a: 'All available ideas in a single run — typically 12–20+ ideas depending on the component. There is no cap: the AI generates every viable cost reduction lever it can identify, spanning material substitution, process optimisation, design changes, commonisation, logistics, and emerging technology. Quick wins (Low difficulty), medium-term, and strategic ideas are all included, along with at least one commonisation and one emerging-tech idea.' },
      { q: 'How does competitor benchmarking work?', a: 'The AI is instructed to populate every idea\'s "Industry Benchmark" field with specific OEM or Tier-1 evidence — citing manufacturer, programme name, model year, and a quantified result (e.g. "BMW Gen5 EDU hairpin winding: −18% copper mass", "Tesla Model Y gigacasting: 171 parts → 2"). This gives engineering teams immediate evidence to support business cases.' },
      { q: 'What is the Idea Cache?', a: 'When web search is disabled, BrainSpark stores the analysis result in a server-side cache keyed by a hash of your inputs (system, subassembly, part, vehicle type, region, context). Re-running the same analysis within 7 days returns the cached result instantly — saving API tokens and time. The cache is bypassed automatically when web search is enabled, since live results are time-sensitive.' },
      { q: 'What is Multi-pass Deduplication?', a: 'When you use "Refine Analysis" to generate additional ideas, BrainSpark runs a token-overlap similarity check between the new ideas and the existing set. Any new idea whose title shares more than 50% of its keywords with an existing idea is automatically filtered out before being added to your list. This keeps your results clean regardless of how many refinement passes you run.' },
      { q: 'What is BOM Batch Analysis?', a: 'Available at /bom-analysis, this feature lets you upload an Excel (.xlsx) or CSV file containing a list of parts (system, subassembly, part name columns). BrainSpark analyses each part sequentially using the same Chief Engineer AI, then aggregates the results into a single Excel export showing total ideas, quick wins, and the top saving per part. Useful for programme-level impact assessments across a full vehicle BOM. Up to 100 parts per batch.' },
    ],
  },
  {
    category: 'Export & Reporting',
    icon: Download,
    items: [
      { q: 'What is included in the Excel export?', a: 'The Excel file has three sheets: (1) Summary — overview stats and metadata; (2) Ideas — all cost reduction ideas with savings estimates, implementation steps, risks, and timelines; (3) Roadmap — a chronological view by implementation phase.' },
      { q: 'What is included in the PowerPoint export?', a: 'The PowerPoint includes a title slide, a summary slide, one detailed slide per idea (title, savings, type, timeline, key steps, risks), and a closing roadmap slide. Formatted for direct management gate-review use.' },
      { q: 'What is included in the PDF export?', a: 'The PDF is an A4 portrait document with: (1) Branded cover page with summary metrics; (2) Business Case Summary page — phase boxes (Quick Wins / Programme / Strategic) and a Top-10 ROI-ranked ideas table; (3) One detailed page per idea with technical description, manufacturing impact, DFMA principles, risk notes, and benchmark reference; (4) Final implementation roadmap page grouped by phase.' },
      { q: 'What is the Implementation Roadmap?', a: 'The roadmap section (collapsible, inside every Results page) automatically groups all ideas into three phases based on difficulty and timeline keywords: Phase 1 — Quick Wins (0–6 months, Low difficulty), Phase 2 — Programme Plan (6–18 months, Medium difficulty), Phase 3 — Strategic (18+ months, High difficulty or long-horizon keywords). It helps prioritise where to start.' },
      { q: 'How do I sort ideas by ROI?', a: 'On the Results page, the filter bar has a Sort row with four options: "AI Order" (default — as generated), "Best ROI" (annual savings divided by difficulty multiplier), "Highest Savings" (by annual value figure), and "Easiest First" (Low → Medium → High difficulty). ROI sort is the recommended starting point for workshop prioritisation.' },
      { q: 'Can I annotate ideas?', a: 'Yes — expand any idea card on the Results page and click "Add annotation". You can set an implementation status (Investigating / Approved / Rejected / On Hold) and add free-text engineering notes. Annotations are saved locally in your browser. You can also filter the entire idea list by annotation status using the Status filter row.' },
      { q: 'How do I share results with my team?', a: 'On the Results page, click the "Share" button in the header (visible once an analysis has been saved to the server). This generates a 30-day read-only link that anyone can open without needing a BrainSpark account — useful for sharing with programme managers, procurement, or suppliers. You can also generate share links from the Dashboard project list.' },
      { q: 'Can I customise the export templates?', a: 'Not at this time. The exports use a fixed professional template optimised for automotive cost reviews. Custom branding and template options are on the product roadmap.' },
    ],
  },
  {
    category: 'Account & Security',
    icon: Lock,
    items: [
      { q: 'How is my data secured?', a: 'All API keys are stored only in your browser (localStorage) and sent directly to the backend only during analysis — never logged or persisted. User credentials are hashed with bcrypt. Sessions use JWT tokens with 7-day expiry and server-side revocation on sign-out.' },
      { q: 'What happens if I forget my password?', a: 'Use the "Forgot password" option on the sign-in page. An OTP (one-time password) is sent to your registered email. The OTP expires in 10 minutes and can be used only once.' },
      { q: 'Where is my analysis data stored?', a: 'From v3.0, analysis results are automatically saved to a server-side SQLite database linked to your account (API key is redacted before saving). You can access all your past analyses from the Dashboard — including projects from any device. Idea annotations are still stored locally in your browser and restored when you re-open a project.' },
      { q: 'How do share links work?', a: 'Share links are generated per project with a 30-day expiry. They are single-use read-only views — the recipient does not need a BrainSpark account. Share tokens are stored in the database and expire automatically. You cannot revoke a token before expiry, but expiry ensures they are short-lived.' },
      { q: 'Who can sign up?', a: 'Anyone with access to the running server can sign up. This tool is intended for internal engineering and cost teams. Access control via email domain restrictions can be added by your administrator.' },
      { q: 'Can I install BrainSpark on my phone or desktop?', a: 'Yes. BrainSpark v3.0 is a Progressive Web App (PWA). In Chrome or Edge, click the install icon in the browser address bar (or use the browser menu → "Install app"). On mobile, use Safari → Share → Add to Home Screen. Once installed, it opens in standalone mode with no browser chrome, just like a native app. Core pages are cached for offline viewing.' },
    ],
  },
  {
    category: 'Automotive Coverage',
    icon: BarChart3,
    items: [
      { q: 'Which vehicle systems are covered?', a: 'BIW Body-in-White, Chassis & Frame (incl. air suspension, RWS), Powertrain ICE, Powertrain BEV/MHEV (800V, CTP/CTB, SiC), Transmission & Driveline, Thermal & HVAC (heat pump), Interior, Exterior, Electrical & Electronics, ADAS & Safety, Fuel & Emission, Exterior Trim, and Advanced Next-Gen systems.' },
      { q: 'Is BEV / EV supported?', a: 'Yes. The BEV/MHEV system covers Battery Pack (cell-to-pack, cell-to-body), Battery Management System, Electric Drive Unit (hairpin motor, SiC inverter), 800V high-voltage architecture, MHEV 48V systems, charging port, and thermal management.' },
      { q: 'Does it handle ADAS components?', a: 'Yes. The ADAS & Safety system covers cameras, radar, LiDAR, fusion ECU, airbags, seatbelts, TPMS, stability control, DMS, and HUD.' },
    ],
  },
];

const STEPS = [
  { n: 1, title: 'Sign in', desc: 'Create your account or sign in with email and password. Use "Forgot password" if needed — an OTP is sent to your email.' },
  { n: 2, title: 'Enter API key', desc: 'On the Analyze page, paste your Anthropic API key. It stays in your browser only.' },
  { n: 3, title: 'Select target', desc: 'Choose a Vehicle System → Subassembly → Part (optional). Optionally upload a CAD file (STL / STEP / DXF / PNG) — geometry is auto-extracted and injected into the AI prompt.' },
  { n: 4, title: 'Generate & export', desc: 'Click "Generate Ideas". Watch live as the AI searches the web and synthesises all available expert ideas (typically 12–20+). Export to Excel, PowerPoint, or PDF. Annotate ideas with implementation status and notes.' },
];

function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/3 transition-colors"
      >
        <span className="text-slate-200 text-sm font-medium pr-4">{item.q}</span>
        <ChevronDown size={16} className={`text-gold-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="px-5 pb-4 text-slate-400 text-sm leading-relaxed border-t border-white/5 pt-3">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const filtered = FAQ.map(section => ({
    ...section,
    items: section.items.filter(
      item =>
        !search ||
        item.q.toLowerCase().includes(search.toLowerCase()) ||
        item.a.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(s => s.items.length > 0);

  return (
    <div className="min-h-screen bg-navy-950 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-medium mb-4">
            <HelpCircle size={12} /> Help Centre · BrainSpark v{APP_VERSION}
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">How can we help?</h1>
          <p className="text-slate-400 max-w-xl mx-auto">Search our documentation, browse FAQs, or contact the tool author directly.</p>

          {/* Search */}
          <div className="relative mt-6 max-w-lg mx-auto">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search FAQs…"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-navy-800 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-gold-500/50"
            />
          </div>
        </motion.div>

        {/* Getting started steps */}
        {!search && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
              <BookOpen size={16} className="text-gold-400" /> Getting Started in 4 Steps
            </h2>
            <div className="grid sm:grid-cols-4 gap-4">
              {STEPS.map(({ n, title, desc }) => (
                <div key={n} className="rounded-xl bg-navy-900 border border-white/8 p-5">
                  <div className="w-8 h-8 rounded-lg bg-gold-500/15 flex items-center justify-center mb-3">
                    <span className="text-gold-400 font-bold text-sm">{n}</span>
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-1">{title}</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* What's New in v3.0 */}
        {!search && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
              <Sparkles size={16} className="text-gold-400" /> What's New
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { icon: BarChart3,  color: 'text-teal-400',   bg: 'bg-teal-500/10',   border: 'border-teal-500/20',  title: 'Deterministic Should-Cost Engine', desc: 'Bottom-up part cost from real rate × time / mass × price (13 processes, 10 materials, 9 regions) — with a Monte-Carlo P10/P50/P90 band and a unit-cost-vs-volume curve. Numbers are computed, not guessed. See /should-cost.' },
                { icon: Package,    color: 'text-gold-400',   bg: 'bg-gold-500/10',   border: 'border-gold-500/20',  title: 'Cost-Idea Marketplace', desc: '1,250+ curated, OEM-benchmarked cost-reduction ideas across every commodity, each with a full technical business case. Browse at /marketplace.' },
                { icon: Zap,        color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20',title: 'Powertrain & Voltage Facets', desc: 'Filter the Marketplace by commodity, powertrain (ICE/MHEV/PHEV/BEV) and architecture (400V/800V); every card shows its tags at a glance.' },
                { icon: Shield,     color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',  title: 'AI Output Validation', desc: 'Every generated idea is schema-validated and sanity-banded (saving %, payback) before you ever see it — hallucinated figures are caught and flagged.' },
                { icon: Map,        color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20',title: 'VAVE Tracker & Pipeline', desc: 'Push ideas into a VAVE action tracker (6 stages) and a G0–G3 business-case pipeline with ROI/IRR/payback at /vave-tracker and /pipeline.' },
                { icon: Globe,      color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',  title: 'Commodity Trends & Live Prices', desc: '13-domain knowledge base plus daily-refreshed automotive commodity prices, injected into every analysis. See /trends.' },
                { icon: BarChart3,  color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', title: 'ROI Auto-Ranking', desc: 'Sort by Best ROI, Highest Savings, or Easiest First. Instantly surface the ideas worth presenting first.' },
                { icon: Zap,        color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20', title: 'Status Filter', desc: 'Filter ideas by annotation status — show only Approved, Investigating, or On Hold items.' },
                { icon: Globe,      color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20',title: 'Cloud Project History', desc: 'Analyses are auto-saved to a server-side SQLite database. Open any project from any device via the Dashboard.' },
                { icon: Cpu,        color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20',  title: 'Idea Caching', desc: '7-day server cache for identical analyses. Re-run the same config and get results instantly with zero API cost.' },
                { icon: Zap,        color: 'text-pink-400',   bg: 'bg-pink-500/10',   border: 'border-pink-500/20',  title: 'Multi-pass Dedup', desc: 'Refine runs now automatically remove near-duplicate ideas using token-overlap similarity detection.' },
                { icon: Globe,      color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',  title: 'Competitor Benchmarking', desc: 'Every idea now cites specific OEM/programme/year evidence — BMW, Tesla, Hyundai, and more — in the benchmark field.' },
                { icon: Map,        color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20', title: 'Implementation Roadmap', desc: '3-phase roadmap auto-groups ideas into Quick Wins (0–6 mo), Programme (6–18 mo), and Strategic (18+ mo) inside every Results page.' },
                { icon: Download,   color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',   title: 'Business Case PDF', desc: 'PDF now includes a dedicated Business Case page: phase summary boxes and a Top-10 ROI-ranked ideas table.' },
                { icon: Share2,     color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20',title: 'Team Sharing', desc: 'Generate a 30-day read-only share link for any analysis. No account needed for recipients.' },
                { icon: Package,    color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20',title: 'BOM Batch Analysis', desc: 'Upload an Excel BOM, analyse up to 100 parts at once with the Chief Engineer AI, export an aggregated savings summary.' },
                { icon: Smartphone, color: 'text-teal-400',   bg: 'bg-teal-500/10',   border: 'border-teal-500/20',  title: 'Progressive Web App', desc: 'Install BrainSpark on mobile or desktop via the browser install prompt. Offline cache included for core pages.' },
                { icon: Shield,     color: 'text-gold-400',   bg: 'bg-gold-500/10',   border: 'border-gold-500/20',  title: 'Security Hardening', desc: 'JWT revocation on sign-out, rate limiting on auth routes, input sanitisation, async atomic file I/O, and security headers.' },
              ].map(({ icon: Icon, color, bg, border, title, desc }) => (
                <div key={title} className={`rounded-xl ${bg} border ${border} p-4`}>
                  <div className={`flex items-center gap-2 mb-2`}>
                    <Icon size={14} className={color} />
                    <span className={`text-sm font-semibold ${color}`}>{title}</span>
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* FAQ sections */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-6">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <HelpCircle size={16} className="text-gold-400" /> Frequently Asked Questions
            {search && <span className="text-slate-500 text-sm font-normal">— {filtered.reduce((a, s) => a + s.items.length, 0)} result(s)</span>}
          </h2>

          {filtered.length === 0 && (
            <p className="text-slate-500 text-sm py-8 text-center">No FAQs match your search. Try a different term or contact us below.</p>
          )}

          {filtered.map(section => (
            <div key={section.category}>
              <button
                onClick={() => setActiveSection(activeSection === section.category ? null : section.category)}
                className="flex items-center gap-3 mb-3 text-left group"
              >
                <div className="w-7 h-7 rounded-lg bg-navy-800 border border-white/10 flex items-center justify-center">
                  <section.icon size={13} className="text-gold-400" />
                </div>
                <span className="text-slate-200 font-semibold text-sm">{section.category}</span>
                <ChevronRight size={14} className={`text-slate-500 transition-transform ${!search && activeSection !== section.category ? '' : 'rotate-90'}`} />
              </button>
              <AnimatePresence>
                {(search || activeSection === section.category) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {section.items.map(item => <FaqAccordion key={item.q} item={item} />)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>

        {/* System coverage table */}
        {!search && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Globe size={16} className="text-gold-400" /> System Coverage
            </h2>
            <div className="rounded-xl bg-navy-900 border border-white/8 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="text-left px-5 py-3 text-slate-400 font-medium">#</th>
                    <th className="text-left px-5 py-3 text-slate-400 font-medium">System</th>
                    <th className="text-left px-5 py-3 text-slate-400 font-medium hidden sm:table-cell">Coverage Highlight</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['1', 'BIW Body-in-White', 'Closures, reinforcements, FEM, sill, roof'],
                    ['2', 'Chassis & Frame', 'Air suspension, RWS, e-brake, e-diff'],
                    ['3', 'Powertrain ICE', 'Engine, turbo, exhaust, EGR, cooling'],
                    ['4', 'Powertrain BEV/MHEV', '800V, CTP/CTB, SiC inverter, 48V MHEV'],
                    ['5', 'Transmission & Driveline', '8AT, e-axle, AWD, torque vectoring'],
                    ['6', 'Thermal & HVAC', 'Heat pump, R1234yf, battery thermal'],
                    ['7', 'Interior', 'IP, seats with massage, door trim, HUD'],
                    ['8', 'Exterior', 'LED/matrix lamps, aeroglass, wiper system'],
                    ['9', 'Electrical & Electronics', 'Flat wire harness, zonal ECU, 5G TCU'],
                    ['10', 'ADAS & Safety', 'LiDAR, radar, airbags, DMS, HUD'],
                    ['11', 'Fuel & Emission', 'EVAP, SCR, AdBlue, DPF, TWC'],
                    ['12', 'Exterior Trim', 'AGS, grille, cladding, roof rails'],
                    ['13', 'Advanced Next-Gen', 'Frunk, PEMS, thermal domain controller'],
                  ].map(([n, sys, highlight]) => (
                    <tr key={n} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                      <td className="px-5 py-3 text-slate-500">{n}</td>
                      <td className="px-5 py-3 text-white font-medium">{sys}</td>
                      <td className="px-5 py-3 text-slate-400 hidden sm:table-cell">{highlight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Version & Tech stack */}
        {!search && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="rounded-xl bg-navy-900 border border-white/8 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Zap size={16} className="text-gold-400" />
                  <h3 className="text-white font-semibold text-sm">Version Information</h3>
                </div>
                <dl className="space-y-2">
                  {[
                    ['Application', `BrainSpark v${APP_VERSION}`],
                    ['Build', BUILD_DATE],
                    ['AI Model', 'Anthropic Claude Opus 4.8'],
                    ['Frontend', 'React 18 + TypeScript + Vite + PWA'],
                    ['Backend', 'Node.js + Express + SQLite'],
                    ['Authentication', 'JWT + bcrypt + OTP + revocation'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="text-slate-300 font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="rounded-xl bg-navy-900 border border-white/8 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Terminal size={16} className="text-gold-400" />
                  <h3 className="text-white font-semibold text-sm">Quick Commands</h3>
                </div>
                <div className="space-y-2">
                  {[
                    { cmd: 'npm install', label: 'Install dependencies (first time)' },
                    { cmd: 'npm run dev', label: 'Start both server & frontend' },
                    { cmd: 'npm run build', label: 'Build for production' },
                    { cmd: 'node server.mjs', label: 'Backend only (port 3001)' },
                  ].map(({ cmd, label }) => (
                    <div key={cmd} className="rounded-lg bg-navy-800 px-4 py-2.5">
                      <code className="text-gold-300 text-xs font-mono">{cmd}</code>
                      <p className="text-slate-500 text-xs mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Contact section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="rounded-2xl bg-gradient-to-br from-navy-800 to-navy-900 border border-gold-500/20 p-8">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-gold-500/20">
                <span className="text-navy-950 font-bold text-xl">AB</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-bold text-lg">Avinash Bhosale</h3>
                  <span className="px-2 py-0.5 rounded-full bg-gold-500/15 border border-gold-500/30 text-gold-400 text-xs font-medium">Tool Author</span>
                </div>
                <p className="text-slate-400 text-sm mb-4 leading-relaxed">
                  Automotive Cost Engineer & AI Product Designer. Creator of BrainSpark — built to give cost engineers a superpower.
                  Reach out for feature requests, bug reports, or collaboration.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="mailto:avinash.bhosale8925@gmail.com"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-700 border border-white/10 hover:border-gold-500/40 text-slate-300 hover:text-white text-sm transition-all"
                  >
                    <Mail size={14} className="text-gold-400" />
                    avinash.bhosale8925@gmail.com
                  </a>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-700 border border-white/10 text-slate-400 text-sm">
                    <Shield size={14} className="text-gold-400" />
                    Internal Tool — Confidential
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
