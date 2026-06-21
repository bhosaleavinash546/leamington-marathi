import { Routes, Route, NavLink, Navigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './components/Dashboard';
import ComparisonView from './components/ComparisonView';
import QuoteForm from './components/QuoteForm';
import SupplierPortal from './components/SupplierPortal';
import MultiSupplierComparison from './components/MultiSupplierComparison';
import OpportunityDashboard from './pages/OpportunityDashboard';
import ThreeWayComparison from './pages/ThreeWayComparison';
import ShouldCostDetail from './pages/ShouldCostDetail';
import CrossModelComparison from './pages/CrossModelComparison';
import NegotiationTracker from './pages/NegotiationTracker';
import SupplierScorecard from './pages/SupplierScorecard';
import CommodityPrices from './pages/CommodityPrices';
import ACRTracker from './pages/ACRTracker';
import AssemblyBOM from './pages/AssemblyBOM';
import RateLibrary from './pages/RateLibrary';
import CEREstimator from './pages/CEREstimator';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import ShouldCostVersionDiff from './pages/ShouldCostVersionDiff';
import CountryCostIndex from './pages/CountryCostIndex';
import PartFamilyNorms from './pages/PartFamilyNorms';
import CERAccuracyTracker from './pages/CERAccuracyTracker';
import ThemeToggle from './components/ThemeToggle';
import CommandPalette from './components/CommandPalette';
import Logo from './components/Logo';
import { AuthUser } from './types';
import { ThemeProvider } from './context/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

function AppShell() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem('sc_user');
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch {
      return null;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logout = () => {
    localStorage.removeItem('sc_token');
    localStorage.removeItem('sc_user');
    setUser(null);
  };

  if (!user) {
    return (
      <Routes>
        <Route path="/"        element={<LandingPage />} />
        <Route path="/login"   element={<AuthPage initialView="login"   onLogin={setUser} />} />
        <Route path="/signup"  element={<AuthPage initialView="signup-details" onLogin={setUser} />} />
        <Route path="/forgot"  element={<AuthPage initialView="forgot-email" />} />
        <Route path="*"        element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const isSupplier = user.role === 'supplier';
  const isInternal = user.role === 'internal' || user.role === 'admin';

  return (
    <div className="app-shell">
      {/* ── Persistent theme toggle (always top-right) ── */}
      <div className="app-theme-toggle" title="Toggle light / dark theme">
        <ThemeToggle />
      </div>

      {/* ── Mobile hamburger ── */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* ── Sidebar overlay (mobile) ── */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <nav className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-logo" style={{ padding: '4px 0' }}>
          <Link to="/dashboard" style={{ display: 'block', textDecoration: 'none' }} onClick={() => setSidebarOpen(false)}>
            <Logo height={52} />
          </Link>
        </div>

        {!isSupplier && (
          <>
            <div className="sidebar-section">Analytics</div>
            <NavLink to="/dashboard"       className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>📊 Dashboard</NavLink>
            <NavLink to="/opportunity"     className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🎯 Opportunity</NavLink>
            <NavLink to="/three-way"       className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>⚖ Three-Way Analysis</NavLink>
            <NavLink to="/comparisons"     className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🔍 Comparisons</NavLink>
            <NavLink to="/cross-model"     className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🌐 Cross-Model</NavLink>
            <NavLink to="/multi-comparison" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>📋 Multi-Supplier</NavLink>
            <NavLink to="/version-diff"    className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>📊 Version Compare</NavLink>
            <NavLink to="/country-cost"    className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🌍 Country Cost Index</NavLink>
            <NavLink to="/part-norms"      className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>📐 Part Norms</NavLink>
            <NavLink to="/accuracy"        className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🎯 CER Accuracy</NavLink>

            <div className="sidebar-section">Procurement</div>
            <NavLink to="/negotiations"    className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🤝 Negotiations</NavLink>
            <NavLink to="/scorecard"       className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🏆 Supplier Scorecard</NavLink>

            <div className="sidebar-section">Data</div>
            <NavLink to="/should-costs"    className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🏗 Should-Costs</NavLink>
            <NavLink to="/quotes"          className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>📄 All Quotes</NavLink>
            <NavLink to="/commodity-prices" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>📈 Commodity Prices</NavLink>
            <NavLink to="/acr"             className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🎯 ACR Tracker</NavLink>
            <NavLink to="/assembly"        className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🔩 Assembly BOM</NavLink>
            <NavLink to="/rate-library"    className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>📐 Rate Library</NavLink>
            <NavLink to="/cer"             className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>🧮 Cost Estimator</NavLink>
          </>
        )}

        {isSupplier && (
          <>
            <div className="sidebar-section">Supplier</div>
            <NavLink to="/portal"     className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>📄 My Quotes</NavLink>
            <NavLink to="/portal/new" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setSidebarOpen(false)}>＋ Submit Quote</NavLink>
          </>
        )}

        <div className="sidebar-footer">
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600 }}>
            {user.fullName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
            {user.email} · <span className={`badge badge-${user.role}`}>{user.role}</span>
          </div>
          <button onClick={logout} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
            Sign out
          </button>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Designed &amp; developed by<br />
            <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>Avinash Bhosale</span><br />
            <span style={{ opacity: 0.8 }}>Senior Cost Improvement Engineer</span>
          </div>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="main-content" onClick={() => sidebarOpen && setSidebarOpen(false)}>
        <Routes>
          {!isSupplier && (
            <>
              <Route path="/dashboard"        element={<Dashboard user={user} />} />
              <Route path="/opportunity"      element={<OpportunityDashboard />} />
              <Route path="/three-way"        element={<ThreeWayComparison />} />
              <Route path="/comparisons"      element={<ComparisonView />} />
              <Route path="/comparisons/:id"  element={<ComparisonView />} />
              <Route path="/cross-model"      element={<CrossModelComparison />} />
              <Route path="/multi-comparison" element={<MultiSupplierComparison />} />
              <Route path="/negotiations"     element={<NegotiationTracker />} />
              <Route path="/scorecard"        element={<SupplierScorecard />} />
              <Route path="/should-costs"     element={<ShouldCostDetail />} />
              <Route path="/quotes"           element={<SupplierPortal user={user} />} />
              <Route path="/commodity-prices" element={<CommodityPrices />} />
              <Route path="/acr"              element={<ACRTracker />} />
              <Route path="/assembly"         element={<AssemblyBOM />} />
              <Route path="/rate-library"     element={<RateLibrary />} />
              <Route path="/cer"              element={<CEREstimator />} />
              <Route path="/version-diff"     element={<ShouldCostVersionDiff />} />
              <Route path="/country-cost"     element={<CountryCostIndex />} />
              <Route path="/part-norms"       element={<PartFamilyNorms />} />
              <Route path="/accuracy"         element={<CERAccuracyTracker />} />
              <Route path="/portal/new"       element={<QuoteForm user={user} />} />
              <Route path="*"                 element={<Navigate to="/dashboard" replace />} />
            </>
          )}
          {isSupplier && (
            <>
              <Route path="/portal"     element={<SupplierPortal user={user} />} />
              <Route path="/portal/new" element={<QuoteForm user={user} />} />
              <Route path="*"           element={<Navigate to="/portal" replace />} />
            </>
          )}
        </Routes>
      </main>

      {/* ── Command Palette (Cmd+K / Ctrl+K) — internal users only (P9) ── */}
      {isInternal && <CommandPalette />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
