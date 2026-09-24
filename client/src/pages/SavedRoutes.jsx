import React, { useEffect, useState } from 'react';
import { Bookmark, CarFront, Bus, Bike, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';

export default function SavedRoutes() {
  const { user, isCommuter, token } = useAuth();
  const { navigate } = useRouter();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isCommuter || !token) {
      setLoading(false);
      return;
    }

    fetch('/api/saved-routes', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load saved routes.');
        return res.json();
      })
      .then(setRoutes)
      .catch((err) => {
        console.error('Error loading saved routes:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [isCommuter, token]);

  const removeRoute = async (routeId) => {
    try {
      const res = await fetch(`/api/saved-routes/${routeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Unable to remove saved route.');
      setRoutes(prev => prev.filter(route => route.id !== routeId));
    } catch (err) {
      console.error('Error removing saved route:', err);
      setError(err.message);
    }
  };

  const modeIcon = (mode) => {
    const normalized = (mode || '').toLowerCase();
    if (normalized.includes('jeep')) return <CarFront className="w-4 h-4 text-pink-600" />;
    if (normalized.includes('bus')) return <Bus className="w-4 h-4 text-emerald-700" />;
    return <Bike className="w-4 h-4 text-cyan-600" />;
  };

  if (!user || !isCommuter) {
    return (
      <div className="min-h-screen bg-slate-50 py-20 px-4">
        <div className="max-w-md mx-auto bg-white p-8 rounded-2xl border border-slate-200 text-center shadow-sm">
          <Bookmark className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-900">Saved Routes</h1>
          <p className="text-sm text-slate-500 mt-2">Sign in as a commuter to view your saved routes.</p>
          <button onClick={() => navigate('/routes')} className="mt-5 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-emerald-600">
            Browse Routes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-2">
          <Bookmark className="w-6 h-6 text-emerald-600 fill-emerald-100" />
          <h1 className="text-3xl font-extrabold text-slate-900">Saved Routes</h1>
        </div>
        <p className="text-sm text-slate-500 mb-8">Your bookmarked Dagupan transit routes.</p>

        {loading && <div className="text-sm text-slate-500">Loading saved routes...</div>}
        {error && <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">{error}</div>}
        {!loading && !error && routes.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-200">
            <Bookmark className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h2 className="font-bold text-slate-800">No saved routes yet</h2>
            <p className="text-sm text-slate-500 mt-1">Open a route and select Save Route to add it here.</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {routes.map(route => (
            <article key={route.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => navigate(`/routes/${route.id}`)} className="text-left">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    {modeIcon(route.mode_name)} {route.mode_name}
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-slate-900 hover:text-emerald-700">{route.route_name}</h2>
                </button>
                <button onClick={() => removeRoute(route.id)} className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50" aria-label={`Remove ${route.route_name} from saved routes`}>
                  <Bookmark className="w-5 h-5 fill-emerald-600" />
                </button>
              </div>
              <p className="text-sm text-slate-500 mt-3">{route.origin} → {route.destination}</p>
              <div className="flex items-center gap-3 mt-4 text-xs font-semibold text-slate-600">
                <span>{route.estimated_time} mins</span>
                <span>₱{Math.round(route.minimum_fare)} – ₱{Math.round(route.maximum_fare)}</span>
                {route.status !== 'CLEAR' && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="w-3.5 h-3.5" />{route.status.replace('_', ' ')}</span>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
