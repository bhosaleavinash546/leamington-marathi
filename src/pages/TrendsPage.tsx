import { useState } from 'react';
import { TrendingUp, Cpu, Wrench, Building2, ChevronRight, Car, Battery, Settings, Flame, Wind, Armchair, Lightbulb } from 'lucide-react';
import {
  MFG_LEVERS, EDU_TRENDS, OEM_MOVES, EDU_COST_STRUCTURE, getTotalEduIdeas, EDU_COMPONENTS,
} from '../data/edu-knowledge-base';
import { BIW_COMPONENTS, BIW_MFG_LEVERS, BIW_TRENDS, BIW_OEM_BENCHMARKS, BIW_COST_STRUCTURE, getTotalBiwIdeas } from '../data/biw-knowledge-base';
import { CHASSIS_COMPONENTS, CHASSIS_TRENDS, CHASSIS_COST_STRUCTURE, getTotalChassisIdeas } from '../data/chassis-knowledge-base';
import { BATTERY_COMPONENTS, BATTERY_MFG_LEVERS, BATTERY_TRENDS, BATTERY_COST_STRUCTURE, getTotalBatteryIdeas } from '../data/battery-knowledge-base';
import { ICE_COMPONENTS, ICE_MFG_LEVERS, ICE_TRENDS, ICE_COST_STRUCTURE, getTotalIceIdeas } from '../data/powertrain-ice-knowledge-base';
import { HVAC_COMPONENTS, HVAC_MFG_LEVERS, HVAC_TRENDS, HVAC_COST_STRUCTURE, getTotalHvacIdeas } from '../data/hvac-knowledge-base';
import { INTERIOR_COMPONENTS, INTERIOR_TRENDS, INTERIOR_COST_STRUCTURE, getTotalInteriorIdeas } from '../data/interior-knowledge-base';
import { EXTERIOR_COMPONENTS, EXTERIOR_TRENDS, EXTERIOR_COST_STRUCTURE, getTotalExteriorIdeas } from '../data/exterior-knowledge-base';

type Domain = 'edu' | 'biw' | 'chassis' | 'battery' | 'ice' | 'hvac' | 'interior' | 'exterior';
type Tab = 'trends' | 'manufacturing' | 'oem';

const CONF_COLORS: Record<string, string> = {
  verified:    'bg-green-500/10 text-green-400 border-green-500/30',
  benchmarked: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  estimated:   'bg-amber-500/10 text-amber-400 border-amber-500/30',
  theoretical: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

const LEV_COLORS: Record<string, string> = {
  'Layout': 'bg-blue-500/10 text-blue-400 border-blue-500/30', 'Test': 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  'Assembly': 'bg-teal-500/10 text-teal-400 border-teal-500/30', 'Quality': 'bg-green-500/10 text-green-400 border-green-500/30',
  'Automation': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30', 'Consolidation': 'bg-gold-500/10 text-gold-400 border-gold-500/30',
  'Logistics': 'bg-orange-500/10 text-orange-400 border-orange-500/30', 'Energy': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  'Tooling': 'bg-red-500/10 text-red-400 border-red-500/30', 'Process': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  'Material': 'bg-amber-500/10 text-amber-400 border-amber-500/30', 'Yield': 'bg-lime-500/10 text-lime-400 border-lime-500/30',
  'Standardization': 'bg-pink-500/10 text-pink-400 border-pink-500/30', 'Spec opt.': 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  'Hot Stamp': 'bg-red-500/10 text-red-400 border-red-500/30', 'Roll Form': 'bg-teal-500/10 text-teal-400 border-teal-500/30',
  'Laser Weld': 'bg-blue-500/10 text-blue-400 border-blue-500/30', 'SPR': 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  'Adhesive': 'bg-green-500/10 text-green-400 border-green-500/30', 'HPDC': 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  'Surface': 'bg-pink-500/10 text-pink-400 border-pink-500/30',
};

function getLevClass(lev: string) {
  return LEV_COLORS[lev] || 'bg-slate-500/10 text-slate-400 border-slate-500/30';
}

function getTrendStatusClass(status: string) {
  if (status === 'Next-Gen') return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
  if (status.startsWith('Mainstream') || status === 'Mainstream') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  if (status.startsWith('Emerging') || status === 'Emerging') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  if (status === 'Declining') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (status.includes('>800V')) return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
  return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
}

const DOMAINS: { id: Domain; label: string; icon: typeof TrendingUp; color: string; short: string }[] = [
  { id: 'edu',      label: 'Electric Drive Unit',   icon: Cpu,      color: 'text-gold-400',    short: 'EDU' },
  { id: 'biw',      label: 'Body-in-White',         icon: Car,      color: 'text-indigo-400',  short: 'BIW' },
  { id: 'chassis',  label: 'Chassis',               icon: Settings, color: 'text-blue-400',    short: 'Chassis' },
  { id: 'battery',  label: 'Battery Pack',          icon: Battery,  color: 'text-emerald-400', short: 'Battery' },
  { id: 'ice',      label: 'Powertrain ICE',        icon: Flame,    color: 'text-orange-400',  short: 'ICE' },
  { id: 'hvac',     label: 'Thermal & HVAC',        icon: Wind,     color: 'text-cyan-400',    short: 'HVAC' },
  { id: 'interior', label: 'Interior Systems',      icon: Armchair, color: 'text-amber-400',   short: 'Interior' },
  { id: 'exterior', label: 'Exterior Systems',      icon: Lightbulb,color: 'text-yellow-400',  short: 'Exterior' },
];

const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: 'trends',        label: 'Industry Trends',       icon: TrendingUp },
  { id: 'manufacturing', label: 'Manufacturing Levers',  icon: Wrench },
  { id: 'oem',           label: 'OEM Benchmarks',        icon: Building2 },
];

export default function TrendsPage() {
  const [domain, setDomain] = useState<Domain>('edu');
  const [tab, setTab] = useState<Tab>('trends');
  const [mfgLevel, setMfgLevel] = useState<'edu' | 'sub' | 'part'>('edu');

  const domainMeta = DOMAINS.find(d => d.id === domain)!;
  const DomainIcon = domainMeta.icon;

  function getKpis() {
    if (domain === 'edu')      return [{ label: 'Components', value: EDU_COMPONENTS.length }, { label: 'VAVE ideas', value: getTotalEduIdeas() }, { label: 'Mfg levers', value: MFG_LEVERS.edu.items.length + MFG_LEVERS.sub.items.length + MFG_LEVERS.part.items.length }, { label: 'Trends', value: EDU_TRENDS.unit.length + EDU_TRENDS.sub.length + EDU_TRENDS.part.length }];
    if (domain === 'biw')      return [{ label: 'BIW components', value: BIW_COMPONENTS.length }, { label: 'VAVE ideas', value: getTotalBiwIdeas() }, { label: 'Mfg levers', value: BIW_MFG_LEVERS.length }, { label: 'Trends', value: BIW_TRENDS.length }];
    if (domain === 'chassis')  return [{ label: 'Components', value: CHASSIS_COMPONENTS.length }, { label: 'VAVE ideas', value: getTotalChassisIdeas() }, { label: 'Mfg levers', value: 0 }, { label: 'Trends', value: CHASSIS_TRENDS.length }];
    if (domain === 'battery')  return [{ label: 'Components', value: BATTERY_COMPONENTS.length }, { label: 'VAVE ideas', value: getTotalBatteryIdeas() }, { label: 'Mfg levers', value: BATTERY_MFG_LEVERS.length }, { label: 'Trends', value: BATTERY_TRENDS.length }];
    if (domain === 'ice')      return [{ label: 'Components', value: ICE_COMPONENTS.length }, { label: 'VAVE ideas', value: getTotalIceIdeas() }, { label: 'Mfg levers', value: ICE_MFG_LEVERS.length }, { label: 'Trends', value: ICE_TRENDS.length }];
    if (domain === 'hvac')     return [{ label: 'Components', value: HVAC_COMPONENTS.length }, { label: 'VAVE ideas', value: getTotalHvacIdeas() }, { label: 'Mfg levers', value: HVAC_MFG_LEVERS.length }, { label: 'Trends', value: HVAC_TRENDS.length }];
    if (domain === 'interior') return [{ label: 'Components', value: INTERIOR_COMPONENTS.length }, { label: 'VAVE ideas', value: getTotalInteriorIdeas() }, { label: 'Mfg levers', value: 0 }, { label: 'Trends', value: INTERIOR_TRENDS.length }];
    if (domain === 'exterior') return [{ label: 'Components', value: EXTERIOR_COMPONENTS.length }, { label: 'VAVE ideas', value: getTotalExteriorIdeas() }, { label: 'Mfg levers', value: 0 }, { label: 'Trends', value: EXTERIOR_TRENDS.length }];
    return [];
  }

  function getCostStructure() {
    if (domain === 'edu')      return EDU_COST_STRUCTURE;
    if (domain === 'biw')      return BIW_COST_STRUCTURE;
    if (domain === 'chassis')  return CHASSIS_COST_STRUCTURE;
    if (domain === 'battery')  return BATTERY_COST_STRUCTURE;
    if (domain === 'ice')      return ICE_COST_STRUCTURE;
    if (domain === 'hvac')     return HVAC_COST_STRUCTURE;
    if (domain === 'interior') return INTERIOR_COST_STRUCTURE;
    if (domain === 'exterior') return EXTERIOR_COST_STRUCTURE;
    return [];
  }

  const costStructure = getCostStructure();
  const kpis = getKpis();

  function renderTrends() {
    if (domain === 'edu') return (
      <div className="space-y-10">
        {([{ key: 'unit', label: 'EDU / Unit Level', sub: 'Architecture, voltage class and integration' }, { key: 'sub', label: 'Sub-Assembly Level', sub: 'Inverter, motor, gearbox, thermal and interface' }, { key: 'part', label: 'Part Level', sub: 'Component-specific best practice' }] as const).map(({ key, label, sub }) => (
          <section key={key}>
            <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-white/8">
              <h2 className="text-lg font-semibold text-white">{label}</h2>
              <span className="text-slate-500 text-xs font-mono">{sub}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {EDU_TRENDS[key].map((trend) => (
                <div key={trend.t} className={`bg-navy-800/50 border border-white/8 border-l-2 rounded-xl p-4 ${trend.status.includes('>800V') ? 'border-l-violet-500' : trend.status.startsWith('Mainstream') ? 'border-l-blue-500' : 'border-l-amber-500'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getTrendStatusClass(trend.status)}`}>{trend.status}</span>
                    <span className="text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5 whitespace-nowrap">{trend.save}</span>
                  </div>
                  <p className="text-white text-sm font-semibold mb-2">{trend.t}</p>
                  <p className="text-slate-400 text-xs leading-relaxed">{trend.dir}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );

    // New-format domains (ICE, HVAC, Interior, Exterior) use { id, title, description, status, impact }
    const isNewFormat = ['ice', 'hvac', 'interior', 'exterior'].includes(domain);

    if (isNewFormat) {
      const trends = domain === 'ice' ? ICE_TRENDS : domain === 'hvac' ? HVAC_TRENDS : domain === 'interior' ? INTERIOR_TRENDS : EXTERIOR_TRENDS;
      const components = domain === 'ice' ? ICE_COMPONENTS : domain === 'hvac' ? HVAC_COMPONENTS : domain === 'interior' ? INTERIOR_COMPONENTS : EXTERIOR_COMPONENTS;
      return (
        <div className="space-y-10">
          <section>
            <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-white/8">
              <h2 className="text-lg font-semibold text-white">Industry Trends</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {trends.map((trend) => (
                <div key={trend.id} className={`bg-navy-800/50 border border-white/8 border-l-2 rounded-xl p-4 ${trend.status === 'Next-Gen' ? 'border-l-violet-500' : trend.status === 'Mainstream' ? 'border-l-blue-500' : trend.status === 'Emerging' ? 'border-l-amber-500' : 'border-l-red-500'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getTrendStatusClass(trend.status)}`}>{trend.status}</span>
                  </div>
                  <p className="text-white text-sm font-semibold mb-1.5">{trend.title}</p>
                  <p className="text-slate-400 text-xs leading-relaxed mb-2">{trend.description}</p>
                  {trend.impact && <p className="text-green-400 text-xs leading-relaxed italic">{trend.impact}</p>}
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-white/8">
              <h2 className="text-lg font-semibold text-white">Component VAVE Ideas</h2>
              <span className="text-slate-500 text-xs font-mono">Validated cost-reduction levers by component</span>
            </div>
            <div className="space-y-5">
              {components.map((comp) => (
                <div key={comp.id} className="bg-navy-800/40 border border-white/8 rounded-xl p-5">
                  <div className="mb-3">
                    <p className="text-white font-semibold">{comp.name}</p>
                  </div>
                  <div className="space-y-2">
                    {comp.levers.map((lever, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <span className="text-gold-500 text-xs font-bold flex-shrink-0 mt-0.5">{i+1}.</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-white font-medium">{lever.action}</span>
                          <span className="text-green-400 font-semibold ml-2 text-xs">{lever.saving}</span>
                          {lever.conf && (
                            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border font-medium ${CONF_COLORS[lever.conf] || ''}`}>{lever.conf}</span>
                          )}
                          {lever.note && <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{lever.note}</p>}
                          {lever.bench && <p className="text-slate-600 text-xs">Benchmark: {lever.bench}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      );
    }

    // Legacy format (BIW, Chassis, Battery) use { t, dir, save, status }
    const trends = domain === 'biw' ? BIW_TRENDS : domain === 'chassis' ? CHASSIS_TRENDS : BATTERY_TRENDS;
    const components = domain === 'biw' ? BIW_COMPONENTS : domain === 'chassis' ? CHASSIS_COMPONENTS : BATTERY_COMPONENTS;

    return (
      <div className="space-y-10">
        <section>
          <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-white/8">
            <h2 className="text-lg font-semibold text-white">Industry Trends</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {trends.map((trend) => (
              <div key={trend.t} className={`bg-navy-800/50 border border-white/8 border-l-2 rounded-xl p-4 ${trend.status === 'Next-Gen' ? 'border-l-violet-500' : trend.status === 'Mainstream' ? 'border-l-blue-500' : trend.status === 'Emerging' ? 'border-l-amber-500' : 'border-l-red-500'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getTrendStatusClass(trend.status)}`}>{trend.status}</span>
                  <span className="text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5 whitespace-nowrap">{trend.save}</span>
                </div>
                <p className="text-white text-sm font-semibold mb-2">{trend.t}</p>
                <p className="text-slate-400 text-xs leading-relaxed">{trend.dir}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-white/8">
            <h2 className="text-lg font-semibold text-white">Component VAVE Ideas</h2>
            <span className="text-slate-500 text-xs font-mono">Validated cost-reduction levers by component</span>
          </div>
          <div className="space-y-5">
            {components.map((comp) => (
              <div key={comp.id} className="bg-navy-800/40 border border-white/8 rounded-xl p-5">
                <div className="mb-3">
                  <p className="text-white font-semibold">{comp.name}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{comp.subassembly} · Baseline: {comp.baseline}</p>
                </div>
                <div className="space-y-2">
                  {comp.levers.map((lever, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className="text-gold-500 text-xs font-bold flex-shrink-0 mt-0.5">{i+1}.</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-white font-medium">{lever.t}</span>
                        <span className="text-green-400 font-semibold ml-2 text-xs">{lever.save}</span>
                        {lever.conf && (
                          <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border font-medium ${CONF_COLORS[lever.conf] || ''}`}>{lever.conf}</span>
                        )}
                        <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{lever.note}</p>
                        {lever.bench && <p className="text-slate-600 text-xs">Benchmark: {lever.bench}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-slate-500 text-xs mt-3 pt-3 border-t border-white/8 italic leading-relaxed">{comp.trends}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderManufacturing() {
    if (domain === 'edu') return (
      <div>
        <div className="bg-navy-800/40 border border-white/8 border-l-2 border-l-gold-500 rounded-xl p-4 mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">Manufacturing cost reduction</h2>
          <p className="text-slate-400 text-sm max-w-3xl">Process- and operations-driven cost levers at three levels of the EDU build. Savings are directional indicators.</p>
        </div>
        <div className="flex gap-2 mb-6">
          {([{ id: 'edu', label: 'EDU / Unit Level', count: MFG_LEVERS.edu.items.length }, { id: 'sub', label: 'Sub-Assembly', count: MFG_LEVERS.sub.items.length }, { id: 'part', label: 'Part Level', count: MFG_LEVERS.part.items.length }] as const).map(({ id, label, count }) => (
            <button key={id} onClick={() => setMfgLevel(id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${mfgLevel === id ? 'bg-gold-500/15 text-gold-400 border-gold-500/30' : 'text-slate-400 border-white/10 hover:text-white hover:bg-white/5'}`}>
              {label} <span className="text-xs opacity-60">{count}</span>
            </button>
          ))}
        </div>
        {(['edu', 'sub', 'part'] as const).map(level => mfgLevel === level && (
          <div key={level}>
            <div className="mb-4"><h3 className="text-white font-semibold">{MFG_LEVERS[level].title}</h3><p className="text-slate-400 text-xs mt-0.5">{MFG_LEVERS[level].sub} · {MFG_LEVERS[level].items.length} levers</p></div>
            <div className="grid gap-3">
              {MFG_LEVERS[level].items.map((item, i) => (
                <div key={i} className="bg-navy-800/50 border border-white/8 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <div><p className="text-white text-sm font-semibold">{item.t}</p><p className="text-slate-400 text-xs mt-1">{item.note}</p></div>
                  <div className="flex sm:flex-col items-start sm:items-end gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getLevClass(item.lev)}`}>{item.lev}</span>
                    <span className="text-gold-400 text-xs font-semibold whitespace-nowrap">{item.save}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );

    // New-format domains with { id, name, description, saving, status }
    const isNewMfgFormat = ['ice', 'hvac'].includes(domain);
    if (isNewMfgFormat) {
      const levers = domain === 'ice' ? ICE_MFG_LEVERS : HVAC_MFG_LEVERS;
      return (
        <div>
          <div className="bg-navy-800/40 border border-white/8 border-l-2 border-l-gold-500 rounded-xl p-4 mb-6">
            <h2 className="text-lg font-semibold text-white mb-1">{domainMeta.label} — Manufacturing Levers</h2>
            <p className="text-slate-400 text-sm">Process-driven cost reduction levers for the {domainMeta.short} domain.</p>
          </div>
          <div className="grid gap-3">
            {levers.map((item) => (
              <div key={item.id} className="bg-navy-800/50 border border-white/8 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <div>
                  <p className="text-white text-sm font-semibold">{item.name}</p>
                  <p className="text-slate-400 text-xs mt-1">{item.description}</p>
                </div>
                <div className="flex sm:flex-col items-start sm:items-end gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getTrendStatusClass(item.status)}`}>{item.status}</span>
                  <span className="text-gold-400 text-xs font-semibold whitespace-nowrap">{item.saving}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Interior & Exterior don't have separate mfg levers yet
    if (['interior', 'exterior'].includes(domain)) {
      return <div className="text-center py-16 text-slate-500">Dedicated manufacturing levers for {domainMeta.label} coming in Phase 3.</div>;
    }

    const levers = domain === 'biw' ? BIW_MFG_LEVERS : domain === 'battery' ? BATTERY_MFG_LEVERS : [];
    if (levers.length === 0) return <div className="text-center py-16 text-slate-500">Manufacturing levers coming soon for this domain.</div>;

    return (
      <div>
        <div className="bg-navy-800/40 border border-white/8 border-l-2 border-l-gold-500 rounded-xl p-4 mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">{domainMeta.label} — Manufacturing Levers</h2>
          <p className="text-slate-400 text-sm">Process-driven cost reduction levers for the {domainMeta.short} domain. Savings are directional indicators for prioritisation.</p>
        </div>
        <div className="grid gap-3">
          {levers.map((item, i) => (
            <div key={i} className="bg-navy-800/50 border border-white/8 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <div>
                <p className="text-white text-sm font-semibold">{item.t}</p>
                <p className="text-slate-400 text-xs mt-1">{item.note}</p>
              </div>
              <div className="flex sm:flex-col items-start sm:items-end gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getLevClass(item.process)}`}>{item.process}</span>
                <span className="text-gold-400 text-xs font-semibold whitespace-nowrap">{item.save}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderOem() {
    if (domain === 'edu') return (
      <div>
        <div className="mb-6"><h2 className="text-lg font-semibold text-white mb-1">OEM Latest Moves (2025-26)</h2><p className="text-slate-400 text-sm max-w-3xl">Brand-by-brand EDU cost &amp; value-engineering levers from 2025-26 launches.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {OEM_MOVES.map(oem => (
            <div key={oem.brand} className="bg-navy-800/50 border border-white/8 border-l-2 border-l-gold-500 rounded-xl p-4">
              <p className="text-white font-bold text-base">{oem.brand}</p>
              <p className="text-gold-500/80 text-xs font-mono uppercase tracking-wide mt-0.5 mb-3">{oem.model}</p>
              <ul className="space-y-2">{oem.moves.map((move, i) => (<li key={i} className="flex items-start gap-2 text-slate-400 text-xs leading-relaxed"><ChevronRight size={12} className="text-gold-500 flex-shrink-0 mt-0.5" />{move}</li>))}</ul>
            </div>
          ))}
        </div>
      </div>
    );

    const benchmarks = domain === 'biw' ? BIW_OEM_BENCHMARKS : [];
    if (benchmarks.length === 0) return <div className="text-center py-16 text-slate-500">OEM benchmarks for {domainMeta.label} are being compiled — coming in Phase 3.</div>;

    return (
      <div>
        <div className="mb-6"><h2 className="text-lg font-semibold text-white mb-1">{domainMeta.label} — OEM Benchmarks</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {benchmarks.map(oem => (
            <div key={oem.oem} className="bg-navy-800/50 border border-white/8 border-l-2 border-l-indigo-500 rounded-xl p-4">
              <p className="text-white font-bold text-base">{oem.oem}</p>
              <p className="text-indigo-400/80 text-xs font-mono uppercase tracking-wide mt-0.5 mb-3">{oem.model}</p>
              <ul className="space-y-2">{oem.moves.map((move, i) => (<li key={i} className="flex items-start gap-2 text-slate-400 text-xs leading-relaxed"><ChevronRight size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" />{move}</li>))}</ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950 pt-16">
      {/* Hero */}
      <div className="bg-gradient-to-b from-navy-900 to-navy-950 border-b border-white/8 px-4 py-10">
        <div className="max-w-7xl mx-auto">
          {/* Domain selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {DOMAINS.map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                onClick={() => { setDomain(id); setTab('trends'); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${domain === id ? 'bg-gold-500/15 text-gold-400 border-gold-500/30 shadow-lg' : 'text-slate-400 border-white/10 hover:text-white hover:bg-white/5'}`}
              >
                <Icon size={15} className={domain === id ? 'text-gold-400' : color} />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center flex-shrink-0">
              <DomainIcon size={22} className={domainMeta.color} />
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${domainMeta.color}`}>
                {domainMeta.label} · Value &amp; Manufacturing Engineering
              </p>
              <h1 className="text-3xl font-bold text-white mb-2">
                {domainMeta.label} Trends &amp; Levers
              </h1>
              <p className="text-slate-400 text-sm max-w-2xl">
                Industry trends, validated VAVE levers and manufacturing cost-reduction opportunities for the {domainMeta.label} domain.
              </p>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map(({ label, value }) => (
              <div key={label} className="bg-navy-800/60 border border-white/8 rounded-xl px-4 py-3">
                <div className="text-2xl font-bold text-gold-400 font-mono">{value}</div>
                <div className="text-slate-500 text-xs uppercase tracking-widest mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Cost Structure bar */}
          {costStructure.length > 0 && (
            <div className="mt-6 bg-navy-800/40 border border-white/8 rounded-xl p-4">
              <p className="text-slate-400 text-xs uppercase tracking-widest mb-3 font-semibold">
                Indicative {domainMeta.short} cost structure
              </p>
              <div className="flex rounded-lg overflow-hidden h-8">
                {costStructure.map((item) => {
                  const pct = (item as any).share ?? (item as any).value ?? 0;
                  return (
                    <div key={item.name} style={{ width: `${pct}%`, backgroundColor: item.color }} className="flex items-center justify-center text-white text-xs font-bold" title={`${item.name}: ~${pct}%`}>
                      {pct >= 8 ? `${pct}%` : ''}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {costStructure.map((item) => (
                  <span key={item.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                    {item.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="sticky top-16 z-30 bg-navy-900/95 backdrop-blur border-b border-white/8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1 py-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === id ? 'bg-gold-500/15 text-gold-400 border border-gold-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <Icon size={15} />{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {tab === 'trends'        && renderTrends()}
        {tab === 'manufacturing' && renderManufacturing()}
        {tab === 'oem'           && renderOem()}
      </div>

      {domain === 'edu' && tab === 'oem' && (
        <div className="max-w-7xl mx-auto px-4 pb-8">
          <div className="mt-8 border-t border-white/8 pt-5 text-slate-600 text-xs">
            Indicative engineering estimates against stated baselines — a prioritisation aid, not supplier quotes.
            Source: EDU Cost Engineer — VAVE &amp; Manufacturing Ideation. Author: Avinash Bhosale, Senior Cost Improvement Engineer (Propulsion).
          </div>
        </div>
      )}
    </div>
  );
}
