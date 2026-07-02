import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Globe, Zap, CheckCircle, TrendingDown, AlertCircle, Clock, Lock } from 'lucide-react';
import { AnalysisResult } from '../types';

export default function SharedResultPage() {
  const { token } = useParams<{ token: string }>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [systemName, setSystemName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/shared/${token}`)
      .then(async r => {
        if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Not found'); }
        return r.json();
      })
      .then(data => {
        setResult(data);
        setSystemName(data.systemName || data.config?.vehicleType || '');
        setExpiresAt(data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('en-GB') : '');
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center">
      <motion.div className="w-10 h-10 rounded-full border-[3px] border-gold-500/30 border-t-gold-400"
        animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center px-4">
      <div className="text-center">
        <Lock size={48} className="mx-auto mb-4 text-slate-600" />
        <h1 className="text-2xl font-bold text-white mb-2">Access Unavailable</h1>
        <p className="text-slate-400">{error}</p>
      </div>
    </div>
  );

  if (!result) return null;

  const quickWins = result.ideas.filter(i => i.implementationDifficulty === 'Low').length;

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Shared banner */}
        <div className="mb-6 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
          <Globe size={16} className="text-blue-400 flex-shrink-0" />
          <span className="text-blue-300 text-sm">This is a shared read-only report from BrainSpark.{expiresAt && ` Link expires ${expiresAt}.`}</span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">{systemName || result.config.vehicleType}</h1>
          <p className="text-slate-400 mt-1">{result.generatedAt}</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Ideas Generated', value: result.summary.totalIdeas, icon: Zap, color: 'from-blue-500 to-indigo-600' },
            { label: 'Quick Wins', value: quickWins, icon: CheckCircle, color: 'from-green-500 to-emerald-600' },
            { label: 'Strategic Items', value: result.summary.strategicItems, icon: TrendingDown, color: 'from-gold-500 to-amber-600' },
            { label: 'Web Searches', value: result.summary.searchesPerformed, icon: Globe, color: 'from-blue-500 to-cyan-600' },
          ].map(stat => (
            <div key={stat.label} className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                <stat.icon size={20} className="text-white" />
              </div>
              <div className="text-3xl font-black text-white">{stat.value}</div>
              <div className="text-slate-500 text-sm mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Ideas list (simplified, read-only) */}
        <div className="space-y-4">
          {result.ideas.map((idea, i) => (
            <motion.div key={idea.id || i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.25 }}
              className="bg-navy-900 border border-white/10 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gold-500/15 border border-gold-500/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-gold-400 font-bold text-sm">{i + 1}</span>
                  </div>
                  <h3 className="text-white font-semibold text-base leading-tight">{idea.title}</h3>
                </div>
                <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  idea.implementationDifficulty === 'Low' ? 'bg-green-500/10 text-green-400 border border-green-500/30' :
                  idea.implementationDifficulty === 'Medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                  'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>{idea.implementationDifficulty}</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed line-clamp-3 ml-11">{idea.technicalDescription}</p>
              <div className="ml-11 mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                {idea.costSavingPotential.annualValue && <span className="text-gold-400">{idea.costSavingPotential.annualValue}/yr</span>}
                {idea.costSavingPotential.percentage && <span className="text-green-400">{idea.costSavingPotential.percentage}</span>}
                <span className="flex items-center gap-1"><Clock size={11} />{idea.timeToImplement}</span>
                {idea.benchmarkReference && <span className="text-blue-400 truncate max-w-xs">{idea.benchmarkReference.slice(0, 80)}</span>}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-slate-600 text-sm">Generated by <span className="text-gold-400 font-semibold">BrainSpark</span> · AI Cost Reduction Platform</p>
          {error && <div className="mt-4 flex items-center justify-center gap-2 text-red-400 text-sm"><AlertCircle size={14} />{error}</div>}
        </div>
      </div>
    </div>
  );
}
