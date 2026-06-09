import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, ChevronRight, HelpCircle, BookOpen, Mail, Phone, Zap, Terminal, Download, Globe, Lock, Shield, Cpu, BarChart3 } from 'lucide-react';

const APP_VERSION = '2.1.0';
const BUILD_DATE = 'June 2025';

interface FaqItem { q: string; a: string; }
interface FaqSection { category: string; icon: React.ElementType; items: FaqItem[]; }

const FAQ: FaqSection[] = [
  {
    category: 'Getting Started',
    icon: BookOpen,
    items: [
      { q: 'What is AutoCost AI?', a: 'AutoCost AI is an AI-powered cost reduction tool for automotive products. It uses a Chief Engineer AI persona backed by Claude claude-opus-4-8 with live internet search to generate actionable DFMA and cost engineering ideas across 13 vehicle systems and 260+ parts.' },
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
      { q: 'How many ideas does the AI generate?', a: 'Typically 5–8 ideas per analysis, ranging from quick wins (3–6 months, low risk) to strategic programmes (12–24 months, higher savings). The mix is tailored to the selected component\'s complexity and technology readiness.' },
    ],
  },
  {
    category: 'Export & Reporting',
    icon: Download,
    items: [
      { q: 'What is included in the Excel export?', a: 'The Excel file has three sheets: (1) Summary — overview stats and metadata; (2) Ideas — all cost reduction ideas with savings estimates, implementation steps, risks, and timelines; (3) Roadmap — a chronological view of all ideas by implementation phase.' },
      { q: 'What is included in the PowerPoint export?', a: 'The PowerPoint includes a title slide, a summary slide, one detailed slide per idea (title, savings, type, timeline, key steps, risks), and a closing roadmap slide. Formatted for direct management presentation use.' },
      { q: 'Can I customise the export?', a: 'Not at this time. The export uses a fixed professional template optimised for automotive cost reviews. Custom branding and template options are on the product roadmap.' },
    ],
  },
  {
    category: 'Account & Security',
    icon: Lock,
    items: [
      { q: 'How is my data secured?', a: 'All API keys are stored only in your browser (localStorage) and sent directly to the backend only during analysis — never logged or persisted. User credentials are hashed with bcrypt. Sessions use JWT tokens with 7-day expiry.' },
      { q: 'What happens if I forget my password?', a: 'Use the "Forgot password" option on the sign-in page. An OTP (one-time password) is sent to your registered email. The OTP expires in 10 minutes and can be used only once.' },
      { q: 'Is my analysis data stored?', a: 'Analysis results are stored only in your browser\'s localStorage for the recent history panel on the dashboard. No analysis content is stored on the server.' },
      { q: 'Who can sign up?', a: 'Anyone with access to the running server can sign up. This tool is intended for internal engineering and cost teams. Access control via email domain restrictions can be added by your administrator.' },
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
  { n: 3, title: 'Select target', desc: 'Choose a Vehicle System → Subassembly → Part (optional). Optionally upload a CAD file (.STL or .IGS) for geometry context.' },
  { n: 4, title: 'Generate & export', desc: 'Click "Generate Ideas". The AI runs web searches and returns 5–8 ideas. Export to Excel or PowerPoint for your team.' },
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
            <HelpCircle size={12} /> Help Centre · AutoCost AI v{APP_VERSION}
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
                    ['Application', `AutoCost AI v${APP_VERSION}`],
                    ['Build', BUILD_DATE],
                    ['AI Model', 'Anthropic Claude claude-opus-4-8'],
                    ['Frontend', 'React 18 + TypeScript + Vite'],
                    ['Backend', 'Node.js + Express'],
                    ['Authentication', 'JWT + bcrypt + OTP'],
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
                  Automotive Cost Engineer & AI Product Designer. Creator of AutoCost AI — built to give cost engineers a superpower.
                  Reach out for feature requests, bug reports, or collaboration.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="mailto:bhosale.avinash@bhosale"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-700 border border-white/10 hover:border-gold-500/40 text-slate-300 hover:text-white text-sm transition-all"
                  >
                    <Mail size={14} className="text-gold-400" />
                    bhosale.avinash bhosale
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
