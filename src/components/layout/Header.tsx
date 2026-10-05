import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, ChevronDown, LayoutDashboard, HelpCircle, LogOut, Sun, Moon, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { OnboardingHeaderChip } from '../OnboardingChecklist';
import RunIndicator from './RunIndicator';
import { useTheme } from '../../contexts/ThemeContext';
import { TOOLS, TOOL_GROUPS, SETTINGS_LINKS } from '../../config/tools';
import { getAuthToken } from '../../services/auth';
import { readJSON, pushRecent } from '../../lib/storage';

const dropdownVariants = {
  hidden: { opacity: 0, y: -6, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.15, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.1, ease: 'easeIn' } },
};

/**
 * THE COMMAND PALETTE (⌘K).
 *
 * Type to filter the tool registry and, from two characters, the server's
 * BM25 index over the marketplace and the caller's own projects and quotes.
 * It used to open the top hit on Enter and nothing else — no arrow keys, no
 * memory, no accessible semantics. Now it is a combobox in the ARIA sense:
 * ↑/↓ move the active row, Enter opens it, Escape closes, and a screen
 * reader is told which row is active. Empty query shows the five tools used
 * most recently, from browser storage that cannot throw (src/lib/storage.ts).
 */
interface ContentHit { kind: 'idea' | 'project' | 'quote'; id: string; title: string; route: string }
const HIT_LABEL: Record<ContentHit['kind'], string> = { idea: 'Idea', project: 'Analysis', quote: 'Quote' };
const RECENTS_KEY = 'brainspark_palette_recents';

type PaletteRow =
  | { key: string; kind: 'tool'; tool: typeof TOOLS[number] }
  | { key: string; kind: 'hit'; hit: ContentHit };

function ToolSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => readJSON<string[]>(RECENTS_KEY, []));
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = 'palette-listbox';

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) {
      // Recents, in order, only ones that still exist in the registry.
      return recents.map(id => TOOLS.find(t => t.id === id)).filter((t): t is typeof TOOLS[number] => !!t).slice(0, 5);
    }
    return TOOLS.filter(t =>
      t.label.toLowerCase().includes(s) || t.description.toLowerCase().includes(s)
    ).slice(0, 5);
  }, [q, recents]);

  const [content, setContent] = useState<ContentHit[]>([]);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setContent([]); return; }
    const token = getAuthToken();
    if (!token) { setContent([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(s)}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal,
        });
        if (!r.ok) return;
        const d = await r.json();
        setContent([
          ...(d.ideas || []).slice(0, 3).map((x: { id: string; title: string }) => ({ kind: 'idea' as const, id: x.id, title: x.title, route: '/marketplace' })),
          ...(d.projects || []).slice(0, 2).map((x: { id: string; title: string }) => ({ kind: 'project' as const, id: x.id, title: x.title, route: `/results?id=${encodeURIComponent(x.id)}` })),
          ...(d.quotes || []).slice(0, 2).map((x: { id: string; title: string }) => ({ kind: 'quote' as const, id: x.id, title: x.title, route: '/should-cost' })),
        ]);
      } catch { /* aborted or offline — the tool list still works */ }
    }, 220);   // debounce: this hits the server on every keystroke otherwise
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const rows = useMemo<PaletteRow[]>(() => [
    ...matches.map(tool => ({ key: `tool-${tool.id}`, kind: 'tool' as const, tool })),
    ...content.map(hit => ({ key: `${hit.kind}-${hit.id}`, kind: 'hit' as const, hit })),
  ], [matches, content]);
  useEffect(() => { setActive(0); }, [q, rows.length]);

  // ⌘K / Ctrl+K focuses the jumper from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
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

  function go(row: PaletteRow) {
    if (row.kind === 'tool') setRecents(pushRecent(RECENTS_KEY, row.tool.id, 5));
    setQ(''); setOpen(false); inputRef.current?.blur();
    navigate(row.kind === 'tool' ? row.tool.route : row.hit.route);
  }

  const showList = open && rows.length > 0;
  const showingRecents = !q.trim() && matches.length > 0;

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
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => rows.length ? (i + 1) % rows.length : 0); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => rows.length ? (i - 1 + rows.length) % rows.length : 0); }
            else if (e.key === 'Home' && rows.length) { e.preventDefault(); setActive(0); }
            else if (e.key === 'End' && rows.length) { e.preventDefault(); setActive(rows.length - 1); }
            else if (e.key === 'Enter' && rows[active]) go(rows[active]);
            else if (e.key === 'Escape') { setQ(''); setOpen(false); inputRef.current?.blur(); }
          }}
          placeholder="Jump to a tool…"
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none min-w-0"
          role="combobox"
          aria-label="Jump to a tool"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && rows[active] ? `${listId}-${rows[active].key}` : undefined}
        />
        <kbd className="text-2xs text-slate-400 border border-hairline-strong rounded px-1 py-px shrink-0">⌘K</kbd>
      </div>
      <AnimatePresence>
        {showList && (
          <motion.div
            variants={dropdownVariants} initial="hidden" animate="visible" exit="exit"
            id={listId}
            role="listbox"
            aria-label={showingRecents ? 'Recent tools' : 'Results'}
            className="absolute top-full left-0 right-0 mt-1.5 rounded-xl bg-navy-800 border border-white/10 shadow-popover py-1 overflow-hidden z-popover"
          >
            {showingRecents && (
              <div className="px-3.5 pt-1.5 pb-1 text-2xs uppercase tracking-wider text-slate-500">Recent</div>
            )}
            {rows.map((row, i) => {
              const isActive = i === active;
              const base = `w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition-colors ${isActive ? 'bg-white/5 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'}`;
              const firstHit = row.kind === 'hit' && (i === 0 || rows[i - 1].kind === 'tool');
              return (
                <div key={row.key}>
                  {firstHit && (
                    <div className="px-3.5 pt-2 pb-1 text-2xs uppercase tracking-wider text-slate-500 border-t border-white/8 mt-1">Your content</div>
                  )}
                  <button
                    id={`${listId}-${row.key}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(row)}
                    className={base}
                  >
                    {row.kind === 'tool' ? (
                      <>
                        <row.tool.icon size={14} className="text-gold-400 shrink-0" />
                        <span className="font-medium whitespace-nowrap shrink-0">{row.tool.label}</span>
                        <span className="text-slate-500 text-xs truncate ml-auto min-w-0">{row.tool.description}</span>
                      </>
                    ) : (
                      <>
                        <Search size={13} className="text-slate-500 shrink-0" />
                        <span className="truncate">{row.hit.title}</span>
                        <span className="text-slate-500 text-2xs uppercase tracking-wider ml-auto shrink-0">{HIT_LABEL[row.hit.kind]}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
            <div className="px-3.5 pt-1.5 pb-1 text-2xs text-slate-600 border-t border-white/8 mt-1 flex gap-3">
              <span><kbd className="font-mono">↑↓</kbd> move</span><span><kbd className="font-mono">↵</kbd> open</span><span><kbd className="font-mono">esc</kbd> close</span>
            </div>
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
    <header className="fixed top-0 left-0 right-0 z-nav bg-navy-950/95 backdrop-blur-md border-b border-white/10">
      <div className={isAuthenticated ? 'px-4 sm:px-6' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}>
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo */}
          <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2.5 group shrink-0">
            <img
              src="/brainspark-logo.svg"
              alt=""
              aria-hidden="true"
              className="w-9 h-9 group-hover:-translate-y-0.5 transition-transform"
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-ui ${isActive(path) ? 'bg-gold-500/20 text-gold-400' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}>
                  {label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {isAuthenticated && <RunIndicator />}
            {isAuthenticated && <OnboardingHeaderChip />}
            <button
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-gold-500/30 transition-ui group"
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
                className="px-4 py-2 rounded-lg bg-gold-500 hover:bg-gold-400 text-navy-950 text-sm font-semibold transition-ui hover:-translate-y-0.5 shadow-lg shadow-gold-500/20"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-white p-3 -mr-1 rounded-lg hover:bg-tint-strong transition-ui duration-micro ease-house"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu — grouped, rendered from the tools registry */}
      <AnimatePresence>
      {menuOpen && (
        <motion.div
          id="mobile-menu"
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
                  <div className="px-3 pt-3 pb-1 text-2xs font-bold uppercase tracking-widest text-slate-500">{group.label}</div>
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
                <button onClick={e => { const r = e.currentTarget.getBoundingClientRect(); toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); setMenuOpen(false); }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/5 rounded-lg">
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
