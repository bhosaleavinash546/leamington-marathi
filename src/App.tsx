import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastContainer } from './hooks/useToast';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import MobileNav from './components/mobile/MobileNav';
import PageTransition from './components/layout/PageTransition';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { useIsNative } from './hooks/useMobile';
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import AnalyzePage from './pages/AnalyzePage';
import ResultsPage from './pages/ResultsPage';
import HelpPage from './pages/HelpPage';
import TrendsPage from './pages/TrendsPage';
import CadToCostPage from './pages/CadToCostPage';
import BomAnalysisPage from './pages/BomAnalysisPage';
import SharedResultPage from './pages/SharedResultPage';
import ShouldCostPage from './pages/ShouldCostPage';
import IntegrationsPage from './pages/IntegrationsPage';
import MarketplacePage from './pages/MarketplacePage';
import CadDiffPage from './pages/CadDiffPage';
import ServerSettingsPage from './pages/ServerSettingsPage';
import MobileSettingsPage from './pages/MobileSettingsPage';
import VaveTrackerPage from './pages/VaveTrackerPage';
import AiChatbot from './components/AiChatbot';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        {/* Public */}
        <Route path="/" element={<PageTransition><HomePage /></PageTransition>} />
        <Route path="/auth" element={<PageTransition><AuthPage /></PageTransition>} />
        <Route path="/help" element={<PageTransition><HelpPage /></PageTransition>} />

        {/* Protected */}
        <Route path="/dashboard" element={<ProtectedRoute><PageTransition><DashboardPage /></PageTransition></ProtectedRoute>} />
        <Route path="/analyze" element={<ProtectedRoute><PageTransition><AnalyzePage /></PageTransition></ProtectedRoute>} />
        <Route path="/results" element={<ProtectedRoute><PageTransition><ResultsPage /></PageTransition></ProtectedRoute>} />
        <Route path="/trends" element={<ProtectedRoute><PageTransition><TrendsPage /></PageTransition></ProtectedRoute>} />
        <Route path="/cad-to-cost" element={<ProtectedRoute><PageTransition><CadToCostPage /></PageTransition></ProtectedRoute>} />
        <Route path="/bom-analysis" element={<ProtectedRoute><PageTransition><BomAnalysisPage /></PageTransition></ProtectedRoute>} />
        <Route path="/should-cost" element={<ProtectedRoute><PageTransition><ShouldCostPage /></PageTransition></ProtectedRoute>} />
        <Route path="/integrations" element={<ProtectedRoute><PageTransition><IntegrationsPage /></PageTransition></ProtectedRoute>} />
        <Route path="/marketplace" element={<ProtectedRoute><PageTransition><MarketplacePage /></PageTransition></ProtectedRoute>} />
        <Route path="/cad-diff" element={<ProtectedRoute><PageTransition><CadDiffPage /></PageTransition></ProtectedRoute>} />
        <Route path="/vave-tracker" element={<ProtectedRoute><PageTransition><VaveTrackerPage /></PageTransition></ProtectedRoute>} />
        <Route path="/server-settings" element={<PageTransition><ServerSettingsPage /></PageTransition>} />
        <Route path="/mobile-settings" element={<ProtectedRoute><PageTransition><MobileSettingsPage /></PageTransition></ProtectedRoute>} />

        {/* Public share view */}
        <Route path="/shared/:token" element={<PageTransition><SharedResultPage /></PageTransition>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function AppShell() {
  const native = useIsNative();
  return (
    <div className="flex flex-col min-h-screen">
      {!native && <Header />}
      <main className={`flex-1${native ? ' pb-14' : ''}`}>
        <AnimatedRoutes />
      </main>
      {!native && <Footer />}
      {native && <MobileNav />}
      <AiChatbot />
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppShell />
            <ToastContainer />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
