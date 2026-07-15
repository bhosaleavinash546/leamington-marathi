import { Link, useParams } from 'react-router-dom';
import { ShieldCheck, FileText } from 'lucide-react';
import { APP_VERSION } from '../version';

/**
 * Privacy policy + terms of use. Single component serving both routes —
 * plain-language, honest about what the app actually stores (the audit flagged
 * the absence of any legal surface as an enterprise-procurement blocker).
 */
export default function LegalPage() {
  const { doc } = useParams<{ doc: string }>();
  const isPrivacy = doc !== 'terms';

  return (
    <div className="min-h-screen bg-navy-950 pt-24 pb-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          {isPrivacy ? <ShieldCheck size={22} className="text-gold-400" /> : <FileText size={22} className="text-gold-400" />}
          <h1 className="text-3xl font-black text-white">{isPrivacy ? 'Privacy Policy' : 'Terms of Use'}</h1>
        </div>
        <p className="text-slate-500 text-sm mb-8">BrainSpark v{APP_VERSION} · Last updated 15 July 2026</p>

        {isPrivacy ? (
          <div className="space-y-6 text-slate-300 text-sm leading-relaxed">
            <section>
              <h2 className="text-white font-bold text-lg mb-2">What we store</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li><span className="text-white">Account data:</span> your name, email address, and a salted password hash.</li>
                <li><span className="text-white">Your work:</span> analyses, projects, pipeline items, uploaded quotes, and ideas you submit — stored so you can return to them.</li>
                <li><span className="text-white">API keys:</span> if you save an Anthropic API key, it is encrypted at rest (AES-256-GCM) and never shown back in full.</li>
                <li><span className="text-white">Usage metadata:</span> per-request logs (endpoint, status, latency) and per-AI-call token counts — never prompt content.</li>
              </ul>
            </section>
            <section>
              <h2 className="text-white font-bold text-lg mb-2">What we do not do</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>No advertising, no sale of data, no third-party analytics trackers.</li>
                <li>CAD files are processed for geometry extraction and are not retained after analysis.</li>
                <li>AI requests go to Anthropic under your key; we log token counts, not content.</li>
              </ul>
            </section>
            <section>
              <h2 className="text-white font-bold text-lg mb-2">Your controls</h2>
              <p>You can delete stored API keys in Settings, export your work (Excel/PPTX/PDF), and request account deletion via the contact below.</p>
            </section>
            <section>
              <h2 className="text-white font-bold text-lg mb-2">Contact</h2>
              <p>Data questions: use the in-app Help Centre or the project repository's issue tracker.</p>
            </section>
          </div>
        ) : (
          <div className="space-y-6 text-slate-300 text-sm leading-relaxed">
            <section>
              <h2 className="text-white font-bold text-lg mb-2">The tool, honestly</h2>
              <p>BrainSpark generates engineering cost-reduction ideas and bottom-up should-cost estimates. Estimates are deterministic models with stated assumptions; AI-generated content is labelled with confidence and provenance. <span className="text-white">Nothing here is a substitute for validated supplier quotations, engineering sign-off, or regulatory compliance review.</span></p>
            </section>
            <section>
              <h2 className="text-white font-bold text-lg mb-2">Acceptable use</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Use your own or properly licensed CAD data and quotes.</li>
                <li>Do not attempt to extract other users' data or probe the service.</li>
                <li>Marketplace submissions must be yours to share and free of confidential third-party information.</li>
              </ul>
            </section>
            <section>
              <h2 className="text-white font-bold text-lg mb-2">Liability</h2>
              <p>The service is provided as-is. Decisions made on its outputs — sourcing, negotiation, design changes — are yours, and figures must be validated before commercial use (the app repeats this on every estimate).</p>
            </section>
          </div>
        )}

        <div className="mt-10 flex gap-4 text-sm">
          <Link to="/legal/privacy" className={`${isPrivacy ? 'text-gold-400' : 'text-slate-400 hover:text-white'}`}>Privacy</Link>
          <Link to="/legal/terms" className={`${!isPrivacy ? 'text-gold-400' : 'text-slate-400 hover:text-white'}`}>Terms</Link>
          <Link to="/" className="text-slate-400 hover:text-white ml-auto">← Back to app</Link>
        </div>
      </div>
    </div>
  );
}
