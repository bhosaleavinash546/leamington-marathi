import { Zap } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-navy-950 border-t border-white/10 py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
              <Zap size={14} className="text-navy-950" strokeWidth={2.5} />
            </div>
            <span className="text-white font-semibold text-sm">AutoCost AI</span>
          </div>
          <p className="text-slate-500 text-xs text-center">
            Intelligent Cost Reduction Platform for Premium Automotive — Confidential Internal Tool
          </p>
          <p className="text-slate-600 text-xs">© {new Date().getFullYear()} AutoCost AI</p>
        </div>
      </div>
    </footer>
  );
}
