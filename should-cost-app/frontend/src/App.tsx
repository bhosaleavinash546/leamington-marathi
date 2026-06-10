import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import ComparisonView from './components/ComparisonView';
import QuoteForm from './components/QuoteForm';
import SupplierPortal from './components/SupplierPortal';
import MultiSupplierComparison from './components/MultiSupplierComparison';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import ThemeToggle from './components/ThemeToggle';
import { AuthUser } from './types';
import { ThemeProvider } from './context/ThemeContext';

function AppShell() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('sc_user');
    if (stored) setUser(JSON.parse(stored) as AuthUser);
  }, []);

  const logout = () => {
    localStorage.removeItem('sc_token');
    localStorage.removeItem('sc_user');
    setUser(null);
  };

  // Public routes
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

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-dot" />
          CostIQ
        </div>

        {!isSupplier && (
          <>
            <div className="sidebar-section">Analytics</div>
            <NavLink to="/dashboard"  className={({ isActive }) => isActive ? 'active' : ''}>
              📊 Dashboard
            </NavLink>
            <NavLink to="/comparisons" className={({ isActive }) => isActive ? 'active' : ''}>
              🔍 Comparisons
            </NavLink>
            <NavLink to="/multi-comparison" className={({ isActive }) => isActive ? 'active' : ''}>
              📋 Multi-Supplier
            </NavLink>

            <div className="sidebar-section">Data</div>
            <NavLink to="/should-costs" className={({ isActive }) => isActive ? 'active' : ''}>
              🏗 Should-Costs
            </NavLink>
            <NavLink to="/quotes" className={({ isActive }) => isActive ? 'active' : ''}>
              📄 All Quotes
            </NavLink>
          </>
        )}

        {isSupplier && (
          <>
            <div className="sidebar-section">Supplier</div>
            <NavLink to="/portal"     className={({ isActive }) => isActive ? 'active' : ''}>
              📄 My Quotes
            </NavLink>
            <NavLink to="/portal/new" className={({ isActive }) => isActive ? 'active' : ''}>
              ＋ Submit Quote
            </NavLink>
          </>
        )}

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Theme</span>
            <ThemeToggle />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600 }}>
            {user.fullName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
            {user.email} · <span className={`badge badge-${user.role}`}>{user.role}</span>
          </div>
          <button onClick={logout} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="main-content">
        <Routes>
          {!isSupplier && (
            <>
              <Route path="/dashboard"        element={<Dashboard user={user} />} />
              <Route path="/comparisons"      element={<ComparisonView />} />
              <Route path="/comparisons/:id"  element={<ComparisonView />} />
              <Route path="/multi-comparison" element={<MultiSupplierComparison />} />
              <Route path="/should-costs"     element={<Dashboard user={user} />} />
              <Route path="/quotes"           element={<SupplierPortal user={user} />} />
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
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
