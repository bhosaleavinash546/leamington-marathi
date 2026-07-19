import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ChevronDown, LayoutDashboard, HelpCircle, LogOut, Sun, Moon, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { TOOLS, TOOL_GROUPS, SETTINGS_LINKS } from '../../config/tools';

const dropdownVariants = {
  hidden: { opacity: 0, y: -6, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.15, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.1, ease: 'easeIn' } },
};

/** Lightweight tool jumper: type to filter the registry, Enter opens the top hit. */
function ToolSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return TOOLS.filter(t =>
      t.label.toLowerCase().includes(s) || t.description.toLowerCase().includes(s)
    ).slice(0, 6);
  }, [q]);

  // ⌘K / Ctrl+K focuses the jumper from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function go(route: string) {
    setQ(''); setOpen(false); inputRef.current?.blur();
    navigate(route);
  }

  return (
    <div ref={wrapRef} className="relative hidden md:block w-64 lg:w-80">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 focus-within:border-gold-500/40 transition-colors">
        <Search size={13} className="text-slate-500 shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && matches[0]) go(matches[0].route);
            if (e.key === 'Escape') { setQ(''); setOpen(false); inputRef.current?.blur(); }
          }}
          placeholder="Jump to a tool…"
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none min-w-0"
          aria-label="Jump to a tool"
        />
        <kbd className="text-[10px] text-slate-600 border border-white/12 rounded px-1 py-px shrink-0">⌘K</kbd>
      </div>
      <AnimatePresence>
        {open && matches.length > 0 && (
          <motion.div
            variants={dropdownVariants} initial="hidden" animate="visible" exit="exit"
            className="absolute top-full left-0 right-0 mt-1.5 rounded-xl bg-navy-800 border border-white/10 shadow-2xl shadow-black/50 py-1 overflow-hidden z-50"
          >
            {matches.map((t, i) => (
              <button
                key={t.id}
                onClick={() => go(t.route)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition-colors ${i === 0 ? 'bg-white/5 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                <t.icon size={14} className="text-gold-400 shrink-0" />
                <span className="font-medium">{t.label}</span>
                <span className="text-slate-500 text-xs truncate ml-auto">{t.description}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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

  // Close the mobile drawer on navigation.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-navy-950/95 backdrop-blur-md border-b border-white/10">
      <div className={isAuthenticated ? 'px-4 sm:px-6' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}>
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo */}
          <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2.5 group shrink-0">
            <img
              src="/brainspark-logo.svg"
              alt="BrainSpark"
              className="w-9 h-9 group-hover:scale-105 transition-transform"
            />
            <div>
              <span className="text-white font-bold text-lg leading-none tracking-tight">Brain</span>
              <span className="text-gold-400 font-bold text-lg leading-none">Spark</span>
            </div>
          </Link>

          {/* Authenticated: quick tool jumper (the sidebar owns navigation).
              Guest: simple marketing links. */}
          {isAuthenticated ? (
            <ToolSearch />
          ) : (
            <nav className="hidden md:flex items-center gap-1">
              {[{ path: '/', label: 'Home' }, { path: '/help', label: 'Help' }].map(({ path, label }) => (
                <Link key={path} to={path}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isActive(path) ? 'bg-gold-500/20 text-gold-400' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}>
                  {label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
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

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      variants={dropdownVariants} initial="hidden" animate="visible" exit="exit"
                      className="absolute right-0 mt-2 w-52 rounded-xl bg-navy-800 border border-white/10 shadow-2xl shadow-black/50 py-1 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-white/8">
                        <p className="text-white text-sm font-semibold truncate">{user?.name}</p>
                        <p className="text-slate-500 text-xs truncate mt-0.5">{user?.email}</p>
                      </div>
                      {[
                        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
                        ...SETTINGS_LINKS.map(s => ({ icon: s.icon, label: s.label, path: s.route })),
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
                    </motion.div>
                  )}
                </AnimatePresence>
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

      {/* Mobile menu — grouped, rendered from the tools registry */}
      <AnimatePresence>
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="md:hidden bg-navy-900 border-t border-white/10 px-4 py-3 overflow-hidden max-h-[calc(100vh-4rem)] overflow-y-auto">
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-3 px-3 py-2 mb-2 border-b border-white/8 pb-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-navy-950 font-bold text-xs">{initials}</div>
                <div>
                  <p className="text-white text-sm font-medium">{user?.name}</p>
                  <p className="text-slate-500 text-xs">{user?.email}</p>
                </div>
              </div>
              <Link to="/dashboard" className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>
                <LayoutDashboard size={14} className="text-slate-500" /> Dashboard
              </Link>
              {TOOL_GROUPS.map(group => (
                <div key={group.id}>
                  <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-600">{group.label}</div>
                  {group.tools.map(t => (
                    <Link key={t.id} to={t.route} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>
                      <t.icon size={14} className="text-slate-500" /> {t.label}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="border-t border-white/8 mt-2 pt-2 space-y-1">
                {SETTINGS_LINKS.map(s => (
                  <Link key={s.id} to={s.route} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>
                    <s.icon size={14} className="text-slate-500" /> {s.label}
                  </Link>
                ))}
                <button onClick={() => { toggleTheme(); setMenuOpen(false); }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/5 rounded-lg">
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
                </button>
                <button onClick={handleSignOut} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg">Sign Out</button>
              </div>
            </>
          ) : (
            <>
              <Link to="/" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Home</Link>
              <Link to="/help" className="block px-3 py-2 text-sm text-slate-300 hover:text-white rounded-lg hover:bg-white/5" onClick={() => setMenuOpen(false)}>Help</Link>
              <Link to="/auth" className="block px-3 py-2 text-sm text-gold-400 font-medium rounded-lg hover:bg-gold-500/10" onClick={() => setMenuOpen(false)}>Sign In</Link>
            </>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </header>
  );
}
