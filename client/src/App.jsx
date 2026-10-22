import React, { lazy, Suspense } from 'react';
import { useRouter } from './context/RouterContext';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';

const AuthModal = lazy(() => import('./components/AuthModal'));
const Home = lazy(() => import('./pages/Home'));
const RoutesDirectory = lazy(() => import('./pages/RoutesDirectory'));
const RouteDetails = lazy(() => import('./pages/RouteDetails'));
const FareCalculator = lazy(() => import('./pages/FareCalculator'));
const About = lazy(() => import('./pages/About'));
const WebMap = lazy(() => import('./pages/WebMap'));
const Admin = lazy(() => import('./pages/Admin'));
const SavedRoutes = lazy(() => import('./pages/SavedRoutes'));
const Terms = lazy(() => import('./pages/Terms'));

export default function App() {
  const { currentPath, queryParams } = useRouter();
  const { authModalOpen } = useAuth();

  // Simple client-side page router
  const renderPage = () => {
    if (currentPath === '/') {
      return <Home />;
    }
    if (currentPath === '/routes') {
      return <RoutesDirectory />;
    }
    if (currentPath.startsWith('/routes/')) {
      return <RouteDetails />;
    }
    if (currentPath === '/fare-calculator') {
      return <FareCalculator />;
    }
    if (currentPath === '/about') {
      return <About />;
    }
    if (currentPath === '/terms') {
      return <Terms />;
    }
    if (currentPath === '/map') {
      return <WebMap />;
    }
    if (currentPath === '/admin') {
      return <Admin />;
    }
    if (currentPath === '/saved-routes') {
      return <SavedRoutes />;
    }
    // Fallback to Home
    return <Home />;
  };

  const isMapPage = currentPath === '/map';
  const isEmbeddedTerms = currentPath === '/terms' && queryParams?.embed === 'signup';

  return (
    <div className="flex flex-col min-h-screen bg-white selection:bg-emerald-100 selection:text-emerald-900">
      {!isEmbeddedTerms && <Navbar />}
      <main className="flex-1 flex flex-col">
        <Suspense fallback={<div className="min-h-[50vh] flex-1" aria-label="Loading page" />}>
          {renderPage()}
        </Suspense>
      </main>
      {!isMapPage && !isEmbeddedTerms && <Footer />}
      {!isEmbeddedTerms && authModalOpen && (
        <Suspense fallback={null}>
          <AuthModal />
        </Suspense>
      )}
    </div>
  );
}
