import { useState } from 'react';
import { motion } from 'framer-motion';
import { Store, Star, TrendingDown, Clock, ChevronDown, CheckCircle } from 'lucide-react';

interface MarketplaceIdea {
  id: string;
  title: string;
  system: string;
  costSavingType: string;
  annualSaving: string;
  difficulty: string;
  timeToImplement: string;
  stars: number;
  verified: boolean;
  description: string;
}

const SAMPLE_IDEAS: MarketplaceIdea[] = [
  { id: '1', title: 'Roll-formed B-pillar replacing stamped assemblies', system: 'Body Structure', costSavingType: 'Process', annualSaving: '€1.2M', difficulty: 'Medium', timeToImplement: '12–18 months', stars: 47, verified: true, description: 'Replace multi-piece stamped B-pillar assembly with single roll-formed profile. Reduces part count by 4, eliminates 3 spot-weld fixtures, saves 18% on direct labour.' },
  { id: '2', title: 'Aluminium 6061-T6 front crash box replacing steel', system: 'Chassis', costSavingType: 'Material + Weight', annualSaving: '€840k', difficulty: 'Low', timeToImplement: '6–12 months', stars: 34, verified: true, description: 'Extrusion-based crash box in Al 6061-T6 delivers same NCAP crash performance at 2.1 kg weight saving per vehicle. OEM benchmark: Volvo XC60 (2022).' },
  { id: '3', title: 'Integrated wiper motor bracket via die casting', system: 'Electrical', costSavingType: 'Complexity', annualSaving: '€520k', difficulty: 'Low', timeToImplement: '0–6 months', stars: 28, verified: false, description: 'Consolidate 3 wiper linkage brackets into a single Al die casting, eliminating 6 fasteners and 2 assembly operations.' },
  { id: '4', title: 'Laser-welded tailored blank door inner panel', system: 'Body Structure', costSavingType: 'Material + Process', annualSaving: '€1.6M', difficulty: 'High', timeToImplement: '18–24 months', stars: 61, verified: true, description: 'Laser-welded tailored blank consolidates 4-piece door inner into 1 press hit. Proven at BMW 3-Series (G20), Toyota Corolla e-TNGA.' },
  { id: '5', title: 'Common seat rail across SUV and sedan variants', system: 'Interior', costSavingType: 'Commonisation', annualSaving: '€700k', difficulty: 'Medium', timeToImplement: '12–18 months', stars: 19, verified: false, description: 'Platform-shared seat rail eliminates variant-specific tooling, reduces Tier-1 piece cost by 8% through volume pooling.' },
  { id: '6', title: 'Overmoulded rubber seal replacing multi-piece assembly', system: 'Body Sealing', costSavingType: 'Process', annualSaving: '€380k', difficulty: 'Low', timeToImplement: '3–9 months', stars: 22, verified: true, description: 'Single-shot TPE overmoulded seal on door frame replaces 3-clip + adhesive assembly. Reduces leak risk and eliminates rework line.' },
];

const SYSTEMS = ['All Systems', 'Body Structure', 'Chassis', 'Electrical', 'Interior', 'Body Sealing'];
const DIFFICULTIES = ['All', 'Low', 'Medium', 'High'];

export default function MarketplacePage() {
  const [searchQ, setSearchQ] = useState('');
  const [filterSystem, setFilterSystem] = useState('All Systems');
  const [filterDiff, setFilterDiff] = useState('All');

  const filtered = SAMPLE_IDEAS.filter(idea => {
    const matchQ = !searchQ || idea.title.toLowerCase().includes(searchQ.toLowerCase()) || idea.description.toLowerCase().includes(searchQ.toLowerCase());
    const matchSys = filterSystem === 'All Systems' || idea.system === filterSystem;
    const matchDiff = filterDiff === 'All' || idea.difficulty === filterDiff;
    return matchQ && matchSys && matchDiff;
  });

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/15 border border-gold-500/25 mb-4">
            <Store size={28} className="text-gold-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Idea Marketplace</h1>
          <p className="text-slate-400">Proven cost reduction ideas from the BrainSpark community — anonymised, validated, and ready to apply to your programme.</p>
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
            <CheckCircle size={11} /> Verified ideas confirmed in production by OEM engineering teams
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="flex flex-wrap gap-3 mb-6">
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search ideas..."
            className="flex-1 min-w-[200px] bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-gold-500/30"
          />
          <div className="relative">
            <select value={filterSystem} onChange={e => setFilterSystem(e.target.value)}
              className="bg-navy-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-gold-500/30 pr-8">
              {SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-3 text-slate-500 pointer-events-none" />
          </div>
          <div className="flex gap-1.5">
            {DIFFICULTIES.map(d => (
              <button key={d} onClick={() => setFilterDiff(d)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${filterDiff === d ? 'bg-gold-500/20 text-gold-400 border-gold-500/30' : 'text-slate-400 border-white/10 hover:border-white/25 hover:text-white'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {filtered.map((idea, i) => (
            <motion.div key={idea.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="bg-navy-900 border border-white/10 rounded-2xl p-5 hover:border-gold-500/25 transition-all">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-semibold text-base leading-tight">{idea.title}</h3>
                    {idea.verified && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs flex-shrink-0">
                        <CheckCircle size={9} /> Verified
                      </span>
                    )}
                  </div>
                  <span className="text-gold-500 text-xs">{idea.system}</span>
                </div>
                <div className="flex items-center gap-1 text-amber-400 text-xs font-medium flex-shrink-0">
                  <Star size={12} fill="currentColor" /> {idea.stars}
                </div>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">{idea.description}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="text-green-400 font-semibold">{idea.annualSaving}/yr</span>
                <span className={`px-2 py-0.5 rounded-full border ${idea.difficulty === 'Low' ? 'bg-green-500/10 text-green-400 border-green-500/30' : idea.difficulty === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>{idea.difficulty}</span>
                <span className="flex items-center gap-1"><Clock size={10} />{idea.timeToImplement}</span>
                <span className="flex items-center gap-1"><TrendingDown size={10} />{idea.costSavingType}</span>
              </div>
            </motion.div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <Store size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No ideas match your filters.</p>
            </div>
          )}
        </div>
        <p className="text-center text-slate-700 text-xs mt-8">Ideas are anonymised community contributions. Always validate applicability for your specific programme.</p>
      </div>
    </div>
  );
}
