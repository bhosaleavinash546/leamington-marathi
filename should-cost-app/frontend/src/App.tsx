import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import ComparisonView from './components/ComparisonView';
import QuoteForm from './components/QuoteForm';
import SupplierPortal from './components/SupplierPortal';
import Login from './components/Login';
import { AuthUser } from './types';

function App() {
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

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const isSupplier = user.role === 'supplier';

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 24 }}>
          CostIQ
        </div>

        {!isSupplier && (
          <>
            <h2>Internal</h2>
            <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
              Dashboard
            </NavLink>
            <NavLink to="/comparisons" className={({ isActive }) => isActive ? 'active' : ''}>
              Comparisons
            </NavLink>
          </>
        )}

        {isSupplier && (
          <>
            <h2>Supplier</h2>
            <NavLink to="/portal" className={({ isActive }) => isActive ? 'active' : ''}>
              My Quotes
            </NavLink>
            <NavLink to="/portal/new" className={({ isActive }) => isActive ? 'active' : ''}>
              Submit Quote
            </NavLink>
          </>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            {user.fullName} · {user.role}
          </div>
          <button onClick={logout} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
            Sign out
          </button>
        </div>
      </nav>

      <main className="main-content">
        <Routes>
          {!isSupplier && (
            <>
              <Route path="/dashboard" element={<Dashboard user={user} />} />
              <Route path="/comparisons" element={<ComparisonView />} />
              <Route path="/comparisons/:id" element={<ComparisonView />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </>
          )}
          {isSupplier && (
            <>
              <Route path="/portal" element={<SupplierPortal user={user} />} />
              <Route path="/portal/new" element={<QuoteForm user={user} />} />
              <Route path="*" element={<Navigate to="/portal" replace />} />
            </>
          )}
        </Routes>
      </main>
    </div>
  );
}

export default App;
