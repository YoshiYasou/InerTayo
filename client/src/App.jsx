import React from 'react';
import { useRouter } from './context/RouterContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AuthModal from './components/AuthModal';

// Pages
import Home from './pages/Home';
import RoutesDirectory from './pages/RoutesDirectory';
import RouteDetails from './pages/RouteDetails';
import FareCalculator from './pages/FareCalculator';
import About from './pages/About';
import WebMap from './pages/WebMap';
import Admin from './pages/Admin';

export default function App() {
  const { currentPath } = useRouter();

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
    if (currentPath === '/map') {
      return <WebMap />;
    }
    if (currentPath === '/admin') {
      return <Admin />;
    }
    // Fallback to Home
    return <Home />;
  };

  const isMapPage = currentPath === '/map';

  return (
    <div className="flex flex-col min-h-screen bg-white selection:bg-emerald-100 selection:text-emerald-900">
      <Navbar />
      <main className="flex-1 flex flex-col">
        {renderPage()}
      </main>
      {!isMapPage && <Footer />}
      <AuthModal />
    </div>
  );
}
