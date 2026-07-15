import { lazy } from 'react';
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
import RouteErrorBoundary from './components/layout/RouteErrorBoundary';
import { useIsNative } from './hooks/useMobile';
import AiChatbot from './components/AiChatbot';
import OnboardingChecklist from './components/OnboardingChecklist';

// Route components are code-split: each page (and its heavy deps — recharts,
// framer-motion charts, the xlsx/pptx/jspdf export libs) loads on demand instead
// of bloating the entry chunk. PageTransition provides the Suspense boundary.
const HomePage = lazy(() => import('./pages/HomePage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AnalyzePage = lazy(() => import('./pages/AnalyzePage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const TrendsPage = lazy(() => import('./pages/TrendsPage'));
const CadToCostPage = lazy(() => import('./pages/CadToCostPage'));
const BomAnalysisPage = lazy(() => import('./pages/BomAnalysisPage'));
const SharedResultPage = lazy(() => import('./pages/SharedResultPage'));
const ShouldCostPage = lazy(() => import('./pages/ShouldCostPage'));
const IdeaStudioPage = lazy(() => import('./pages/IdeaStudioPage'));
const AdminRateLibraryPage = lazy(() => import('./pages/AdminRateLibraryPage'));
const PcbBomCostPage = lazy(() => import('./pages/PcbBomCostPage'));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'));
const CadDiffPage = lazy(() => import('./pages/CadDiffPage'));
const ServerSettingsPage = lazy(() => import('./pages/ServerSettingsPage'));
const MobileSettingsPage = lazy(() => import('./pages/MobileSettingsPage'));
const VaveTrackerPage = lazy(() => import('./pages/VaveTrackerPage'));
const PipelinePage = lazy(() => import('./pages/PipelinePage'));
const LegalPage = lazy(() => import('./pages/LegalPage'));

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <RouteErrorBoundary resetKey={location.pathname}>
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
        <Route path="/pcb-bom-cost" element={<ProtectedRoute><PageTransition><PcbBomCostPage /></PageTransition></ProtectedRoute>} />
        <Route path="/admin/rate-library" element={<ProtectedRoute><PageTransition><AdminRateLibraryPage /></PageTransition></ProtectedRoute>} />
        <Route path="/idea-studio" element={<ProtectedRoute><PageTransition><IdeaStudioPage /></PageTransition></ProtectedRoute>} />
        <Route path="/integrations" element={<ProtectedRoute><PageTransition><IntegrationsPage /></PageTransition></ProtectedRoute>} />
        <Route path="/marketplace" element={<ProtectedRoute><PageTransition><MarketplacePage /></PageTransition></ProtectedRoute>} />
        <Route path="/cad-diff" element={<ProtectedRoute><PageTransition><CadDiffPage /></PageTransition></ProtectedRoute>} />
        <Route path="/vave-tracker" element={<ProtectedRoute><PageTransition><VaveTrackerPage /></PageTransition></ProtectedRoute>} />
        <Route path="/pipeline" element={<ProtectedRoute><PageTransition><PipelinePage /></PageTransition></ProtectedRoute>} />
        <Route path="/server-settings" element={<PageTransition><ServerSettingsPage /></PageTransition>} />
        <Route path="/mobile-settings" element={<ProtectedRoute><PageTransition><MobileSettingsPage /></PageTransition></ProtectedRoute>} />

        {/* Public share view */}
        <Route path="/shared/:token" element={<PageTransition><SharedResultPage /></PageTransition>} />
        <Route path="/legal/:doc" element={<PageTransition><LegalPage /></PageTransition>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
    </RouteErrorBoundary>
  );
}

function AppShell() {
  const native = useIsNative();
  return (
    <div className="flex flex-col min-h-screen">
      {!native && <Header />}
      <main className={`flex-1 ${native ? 'pb-14' : 'pb-14 lg:pb-0'}`}>
        <AnimatedRoutes />
      </main>
      {!native && <Footer />}
      {/* Bottom tab bar: always on native; on mobile-web only (hidden ≥lg). */}
      {native ? <MobileNav /> : <div className="lg:hidden"><MobileNav /></div>}
      <AiChatbot />
      <OnboardingChecklist />
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
