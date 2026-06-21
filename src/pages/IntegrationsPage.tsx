import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link2, CheckCircle, AlertCircle, ExternalLink, Slack, Send, Construction, Clock, Database, Settings, GitBranch, Box } from 'lucide-react';
import { toast } from '../hooks/useToast';

interface WebhookConfig {
  slackUrl: string;
  teamsUrl: string;
  autoNotify: boolean;
}

const DEFAULT_CONFIG: WebhookConfig = {
  slackUrl: '', teamsUrl: '', autoNotify: false,
};

const STORAGE_KEY = 'brainspark_webhooks';

function InDevBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
      <Construction size={10} /> In Development
    </span>
  );
}

export default function IntegrationsPage() {
  const [config, setConfig] = useState<WebhookConfig>(DEFAULT_CONFIG);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});
  const [saved, setSaved] = useState(false);
  const [earlyAccessEmail, setEarlyAccessEmail] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setConfig(JSON.parse(stored));
    } catch {}
  }, []);

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testWebhook(url: string, type: 'slack' | 'teams') {
    if (!url) return;
    setTestStatus(s => ({ ...s, [type]: 'testing' }));
    try {
      const r = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(() => { try { return JSON.parse(localStorage.getItem('brainspark_auth') || '{}').token; } catch { return ''; } })()}` },
        body: JSON.stringify({ url, type }),
      });
      setTestStatus(s => ({ ...s, [type]: r.ok ? 'ok' : 'fail' }));
    } catch {
      setTestStatus(s => ({ ...s, [type]: 'fail' }));
    }
    setTimeout(() => setTestStatus(s => ({ ...s, [type]: 'idle' })), 4000);
  }

  function handleEarlyAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!earlyAccessEmail.trim()) return;
    toast('Thanks! We will notify you when this integration launches.', 'success');
    setEarlyAccessEmail('');
  }

  const StatusIcon = ({ type }: { type: string }) => {
    const s = testStatus[type] || 'idle';
    if (s === 'testing') return <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-400/40 border-t-blue-400 animate-spin" />;
    if (s === 'ok') return <CheckCircle size={13} className="text-green-400" />;
    if (s === 'fail') return <AlertCircle size={13} className="text-red-400" />;
    return null;
  };

  return (
    <div className="min-h-screen bg-navy-950 pt-20 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-500/25 mb-4">
            <Link2 size={28} className="text-blue-400" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3">Integrations</h1>
          <p className="text-slate-400">Connect BrainSpark to your team's workflow tools. When ideas are approved, automatically notify your team.</p>
        </div>

        {/* ── Live Integrations ── */}
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 px-1">Live</h2>
        <div className="space-y-4 mb-8">
          {/* Slack */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-navy-900 rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#4A154B]/40 border border-[#611f69]/40 flex items-center justify-center">
                <Slack size={20} className="text-[#E01E5A]" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold">Slack</h3>
                <p className="text-slate-500 text-xs">Notify a channel when ideas are approved</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={config.slackUrl}
                onChange={e => setConfig(c => ({ ...c, slackUrl: e.target.value }))}
                placeholder="https://hooks.slack.com/services/..."
                className="flex-1 bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/40"
              />
              <button onClick={() => testWebhook(config.slackUrl, 'slack')} disabled={!config.slackUrl || testStatus.slack === 'testing'}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/25 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50">
                <StatusIcon type="slack" /> Test
              </button>
            </div>
            <p className="mt-2 text-slate-600 text-xs">Create a Slack incoming webhook from your Slack workspace settings → Integrations → Incoming Webhooks.</p>
          </motion.div>

          {/* Microsoft Teams */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-navy-900 rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#464EB8]/20 border border-[#464EB8]/30 flex items-center justify-center">
                <Send size={20} className="text-[#7B83EB]" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold">Microsoft Teams</h3>
                <p className="text-slate-500 text-xs">Post approved ideas to a Teams channel</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={config.teamsUrl}
                onChange={e => setConfig(c => ({ ...c, teamsUrl: e.target.value }))}
                placeholder="https://outlook.office.com/webhook/..."
                className="flex-1 bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/40"
              />
              <button onClick={() => testWebhook(config.teamsUrl, 'teams')} disabled={!config.teamsUrl || testStatus.teams === 'testing'}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/25 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50">
                <StatusIcon type="teams" /> Test
              </button>
            </div>
            <p className="mt-2 text-slate-600 text-xs">Create a Teams incoming webhook via the connector settings on your channel. Copy the webhook URL here.</p>
          </motion.div>

          {/* Auto-notify setting */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-navy-900 rounded-2xl border border-white/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-white text-sm font-medium">Auto-notify on Approval</p>
              <p className="text-slate-500 text-xs mt-0.5">Automatically trigger webhooks when you mark an idea as "Approved"</p>
            </div>
            <button
              onClick={() => setConfig(c => ({ ...c, autoNotify: !c.autoNotify }))}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${config.autoNotify ? 'bg-blue-500' : 'bg-navy-700 border border-white/10'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${config.autoNotify ? 'left-6' : 'left-1'}`} />
            </button>
          </motion.div>

          <button onClick={save} className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${saved ? 'bg-green-600 text-white' : 'bg-gold-500 hover:bg-gold-400 text-navy-950 hover:scale-[1.02]'}`}>
            {saved ? '✓ Settings Saved' : 'Save Integration Settings'}
          </button>
        </div>

        {/* ── In Development Integrations ── */}
        <div className="mb-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">On the Roadmap</h2>
          <p className="text-slate-500 text-sm">
            Integrations marked <span className="text-amber-400 font-medium">In Development</span> are on our roadmap — sign up for early access notifications below.
          </p>
        </div>

        <div className="space-y-3 mt-4 mb-8">
          {/* Jira */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-navy-900/60 rounded-2xl border border-white/8 p-5 opacity-80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0052CC]/15 border border-[#0052CC]/20 flex items-center justify-center">
                <ExternalLink size={20} className="text-[#5a8fd4]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-slate-300 font-semibold">Jira</h3>
                  <InDevBadge />
                </div>
                <p className="text-slate-500 text-xs">Auto-create Jira tasks for approved ideas</p>
              </div>
              <button disabled className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/8 text-slate-600 text-sm font-medium cursor-not-allowed select-none flex-shrink-0">
                <Clock size={13} /> Coming Soon
              </button>
            </div>
          </motion.div>

          {/* Windchill / PTC PLM */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="bg-navy-900/60 rounded-2xl border border-white/8 p-5 opacity-80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/15 flex items-center justify-center">
                <Settings size={20} className="text-purple-500/70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-slate-300 font-semibold">PTC Windchill (PLM)</h3>
                  <InDevBadge />
                </div>
                <p className="text-slate-500 text-xs">Pull BOM data and push cost-reduction ideas directly into your PLM</p>
              </div>
              <button disabled className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/8 text-slate-600 text-sm font-medium cursor-not-allowed select-none flex-shrink-0">
                <Clock size={13} /> Coming Soon
              </button>
            </div>
          </motion.div>

          {/* SAP ERP */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-navy-900/60 rounded-2xl border border-white/8 p-5 opacity-80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-400/10 border border-blue-400/15 flex items-center justify-center">
                <Database size={20} className="text-blue-400/60" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-slate-300 font-semibold">SAP ERP</h3>
                  <InDevBadge />
                </div>
                <p className="text-slate-500 text-xs">Sync cost estimates and approved savings back to SAP material masters</p>
              </div>
              <button disabled className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/8 text-slate-600 text-sm font-medium cursor-not-allowed select-none flex-shrink-0">
                <Clock size={13} /> Coming Soon
              </button>
            </div>
          </motion.div>

          {/* GitHub / Version Control */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="bg-navy-900/60 rounded-2xl border border-white/8 p-5 opacity-80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center">
                <GitBranch size={20} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-slate-300 font-semibold">GitHub / GitLab</h3>
                  <InDevBadge />
                </div>
                <p className="text-slate-500 text-xs">Comment cost analysis results directly on pull requests for CAD file changes</p>
              </div>
              <button disabled className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/8 text-slate-600 text-sm font-medium cursor-not-allowed select-none flex-shrink-0">
                <Clock size={13} /> Coming Soon
              </button>
            </div>
          </motion.div>

          {/* Onshape / CAD native */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="bg-navy-900/60 rounded-2xl border border-white/8 p-5 opacity-80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center">
                <Box size={20} className="text-cyan-500/60" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-slate-300 font-semibold">Onshape / Fusion 360</h3>
                  <InDevBadge />
                </div>
                <p className="text-slate-500 text-xs">Analyse cost directly from your CAD tool without exporting files first</p>
              </div>
              <button disabled className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/8 text-slate-600 text-sm font-medium cursor-not-allowed select-none flex-shrink-0">
                <Clock size={13} /> Coming Soon
              </button>
            </div>
          </motion.div>
        </div>

        {/* ── Early Access Sign-up ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          className="bg-navy-900 rounded-2xl border border-amber-500/20 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Construction size={16} className="text-amber-400" />
            <h3 className="text-white font-semibold">Get Early Access</h3>
          </div>
          <p className="text-slate-400 text-sm mb-4">Enter your email and we will notify you as soon as a new integration launches.</p>
          <form onSubmit={handleEarlyAccess} className="flex gap-2">
            <input
              type="email"
              value={earlyAccessEmail}
              onChange={e => setEarlyAccessEmail(e.target.value)}
              placeholder="you@company.com"
              className="flex-1 bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-amber-500/40"
            />
            <button type="submit"
              className="px-5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-sm font-semibold transition-colors">
              Notify Me
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
