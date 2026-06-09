import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Zap, Menu, X } from 'lucide-react';

export default function Header() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-navy-950/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Zap size={18} className="text-navy-950" strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-white font-bold text-lg leading-none tracking-tight">AutoCost</span>
              <span className="text-gold-400 font-bold text-lg leading-none"> AI</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { path: '/', label: 'Home' },
              { path: '/analyze', label: 'Analyze' },
            ].map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive(path)
                    ? 'bg-gold-500/20 text-gold-400'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/analyze"
              className="px-4 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 text-navy-950 text-sm font-semibold transition-all hover:scale-105 shadow-lg shadow-gold-500/20"
            >
              Start Analysis
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-white p-2"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-navy-900 border-t border-white/10 px-4 py-3 space-y-1">
          <Link to="/" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link to="/analyze" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Analyze</Link>
        </div>
      )}
    </header>
  );
}
