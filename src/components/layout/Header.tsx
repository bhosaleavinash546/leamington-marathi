import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ChevronDown, LayoutDashboard, HelpCircle, LogOut, User, Sun, Moon, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

const APP_VERSION = '2.1';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname === path;

  const initials = user?.name
    ? user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  function handleSignOut() {
    signOut();
    setUserMenuOpen(false);
    navigate('/auth');
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-navy-950/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2.5 group">
            <img
              src="/brainspark-logo.svg"
              alt="BrainSpark"
              className="w-9 h-9 group-hover:scale-105 transition-transform"
            />
            <div className="flex items-end gap-1.5">
              <div>
                <span className="text-white font-bold text-lg leading-none tracking-tight">Brain</span>
                <span className="text-gold-400 font-bold text-lg leading-none">Spark</span>
              </div>
              <span className="mb-0.5 px-1.5 py-0.5 rounded bg-gold-500/15 border border-gold-500/30 text-gold-400 text-[10px] font-semibold leading-none">
                v{APP_VERSION}
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {isAuthenticated ? (
              <>
                {[
                  { path: '/dashboard', label: 'Dashboard' },
                  { path: '/analyze', label: 'Analyze' },
                  { path: '/trends', label: 'Trends' },
                  { path: '/help', label: 'Help' },
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
              </>
            ) : (
              <>
                {[
                  { path: '/', label: 'Home' },
                  { path: '/help', label: 'Help' },
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
              </>
            )}
          </nav>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-gold-500/30 transition-all group"
            >
              {theme === 'dark'
                ? <Sun size={15} className="text-slate-400 group-hover:text-gold-400 transition-colors" />
                : <Moon size={15} className="text-slate-500 group-hover:text-navy-950 transition-colors" />}
            </button>

            {isAuthenticated ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-navy-950 font-bold text-xs">
                    {initials}
                  </div>
                  <span className="text-slate-300 text-sm font-medium max-w-[120px] truncate">{user?.name}</span>
                  <ChevronDown size={14} className={`text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-xl bg-navy-800 border border-white/10 shadow-2xl shadow-black/50 py-1 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/8">
                      <p className="text-white text-sm font-semibold truncate">{user?.name}</p>
                      <p className="text-slate-500 text-xs truncate mt-0.5">{user?.email}</p>
                    </div>
                    {[
                      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
                      { icon: User, label: 'Analyze', path: '/analyze' },
                      { icon: TrendingUp, label: 'Trends', path: '/trends' },
                      { icon: HelpCircle, label: 'Help', path: '/help' },
                    ].map(({ icon: Icon, label, path }) => (
                      <Link
                        key={path}
                        to={path}
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 text-sm transition-colors"
                      >
                        <Icon size={14} className="text-slate-500" />
                        {label}
                      </Link>
                    ))}
                    <div className="border-t border-white/8 mt-1 pt-1">
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:bg-red-500/10 text-sm transition-colors"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/auth"
                className="px-4 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 text-navy-950 text-sm font-semibold transition-all hover:scale-105 shadow-lg shadow-gold-500/20"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button className="md:hidden text-white p-2" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-navy-900 border-t border-white/10 px-4 py-3 space-y-1">
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-3 px-3 py-2 mb-2 border-b border-white/8 pb-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-navy-950 font-bold text-xs">{initials}</div>
                <div>
                  <p className="text-white text-sm font-medium">{user?.name}</p>
                  <p className="text-slate-500 text-xs">{user?.email}</p>
                </div>
              </div>
              <Link to="/dashboard" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Dashboard</Link>
              <Link to="/analyze" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Analyze</Link>
              <Link to="/trends" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Trends</Link>
              <Link to="/help" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Help</Link>
              <button onClick={() => { toggleTheme(); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/5 rounded-lg">
                {theme === 'dark' ? '☀️ Light Theme' : '🌙 Dark Theme'}
              </button>
              <button onClick={handleSignOut} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg">Sign Out</button>
            </>
          ) : (
            <>
              <Link to="/" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Home</Link>
              <Link to="/help" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Help</Link>
              <Link to="/auth" className="block px-3 py-2 text-sm text-gold-400 font-medium rounded-lg hover:bg-gold-500/10" onClick={() => setMenuOpen(false)}>Sign In</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
