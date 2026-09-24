import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, 
  Bookmark, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Footprints, 
  CarFront, 
  Bus, 
  Bike,
  MapPin,
  ExternalLink
} from 'lucide-react';
import RouteMap from '../components/RouteMap';

export default function RouteDetails() {
  const { currentPath, navigate } = useRouter();
  const { user, isCommuter, isSaved, toggleSaveRoute, openAuth } = useAuth();

  // Extract ID from path: /routes/:id
  const routeId = currentPath.split('/')[2];

  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!routeId) return;

    fetch(`/api/routes/${routeId}`)
      .then(res => {
        if (!res.ok) throw new Error('Route not found');
        return res.json();
      })
      .then(data => {
        setRoute(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Unable to load route details.');
        setLoading(false);
      });
  }, [routeId]);

  useEffect(() => {
    if (route) {
      setSaved(isSaved(route.id));
    }
  }, [route, isSaved]);

  const handleToggleSave = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    const result = await toggleSaveRoute(route.id);
    setSaved(result);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white py-16 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="min-h-screen bg-slate-50 py-20">
        <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-slate-800">Route Not Found</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">The requested Dagupan route does not exist.</p>
          <button
            onClick={() => navigate('/routes')}
            className="py-2.5 px-5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-emerald-600 transition-colors"
          >
            ← Back to Routes
          </button>
        </div>
      </div>
    );
  }

  const isDetour = route.status === 'DETOUR_ACTIVE';

  const renderStepIcon = (mode) => {
    const m = (mode || '').toLowerCase();
    if (m.includes('walk')) {
      return <Footprints className="w-4 h-4 text-emerald-600" />;
    }
    if (m.includes('jeep')) {
      return <CarFront className="w-4 h-4 text-pink-600" />;
    }
    if (m.includes('bus')) {
      return <Bus className="w-4 h-4 text-emerald-700" />;
    }
    return <Bike className="w-4 h-4 text-cyan-600" />;
  };

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Back Link */}
        <button
          onClick={() => navigate('/routes')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Routes
        </button>

        {/* Route Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              {route.route_name}
            </h1>
            
            {/* Badges Row */}
            <div className="flex flex-wrap items-center gap-2.5 mt-3">
              {/* Travel Time */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>{route.active_travel_time || route.estimated_time} mins total</span>
              </div>

              {/* Total Fare Range per §0.7 */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-700">
                <span>₱{Math.round(route.minimum_fare)} – ₱{Math.round(route.maximum_fare)} total fare</span>
              </div>

              {/* Status Badge */}
              {isDetour ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-semibold text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Detour Active — High Tide / Flood Advisory</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Clear — no flood alerts</span>
                </div>
              )}
            </div>
          </div>

          {/* Bookmark / Save Route Button per §0.8 */}
          {isCommuter && <div className="flex items-center gap-3">
            <button
              onClick={handleToggleSave}
              className={`p-3 rounded-2xl border transition-all flex items-center justify-center gap-2 text-xs font-semibold shadow-sm ${
                saved
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
              }`}
              title={saved ? 'Remove saved route' : 'Save route'}
              aria-label={saved ? 'Remove saved route' : 'Save route'}
            >
              <Bookmark className={`w-5 h-5 ${saved ? 'fill-emerald-600 text-emerald-600' : ''}`} />
              <span className="hidden sm:inline">{saved ? 'Saved' : 'Save Route'}</span>
            </button>
          </div>}
        </div>

        {/* Advisory Callout if Affected */}
        {isDetour && route.advisories && route.advisories.length > 0 && (
          <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{route.advisories[0].title}: {route.advisories[0].affected_road}</p>
              <p className="text-xs mt-1 text-amber-800 leading-relaxed">
                {route.advisories[0].description} Estimated travel time has been updated to {route.active_travel_time} mins to reflect the detour bypass.
              </p>
            </div>
          </div>
        )}

        {/* Two-Column Layout matching Page 4 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 mt-10">
          
          {/* Left Column: Route Steps & Directions */}
          <div className="lg:col-span-7">
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              Route Steps & Directions
            </h2>

            <div className="relative pl-6 sm:pl-8 space-y-8 before:absolute before:left-3.5 sm:before:left-4.5 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
              {route.steps && route.steps.length > 0 ? (
                route.steps.map((step) => (
                  <div key={step.id} className="relative group">
                    
                    {/* Step Number Circle */}
                    <div className="absolute -left-6 sm:-left-8 top-0 w-7 h-7 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shadow-md ring-4 ring-white">
                      {step.step_number}
                    </div>

                    {/* Step Content Card */}
                    <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/80 group-hover:bg-white group-hover:shadow-md transition-all">
                      <div className="flex items-center gap-2 mb-1.5">
                        {renderStepIcon(step.mode)}
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          {step.mode}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900">
                        {step.instruction}
                      </h3>
                      {step.location_info && (
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                          {step.location_info}
                        </p>
                      )}
                    </div>

                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No step instructions recorded for this route.</p>
              )}
            </div>

            {/* List of Designated Stops */}
            {route.stops && route.stops.length > 0 && (
              <div className="mt-12 pt-8 border-t border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-4">
                  Designated Stops & Landmarks ({route.stops.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {route.stops.map((stop) => (
                    <div key={stop.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span>{stop.stop_order}. {stop.stop_name}</span>
                      </div>
                      {stop.description && (
                        <p className="text-slate-500 mt-1 pl-5">{stop.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Route Map Preview & Estimated Fare Breakdown */}
          <div className="lg:col-span-5 space-y-8">
            
            {/* Route Map Preview Card */}
            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200/80 overflow-hidden relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                  Route Map Preview
                </h3>
                <button
                  onClick={() => navigate('/map', { route: route.id })}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Open in Web Map
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              {/* Interactive Route Map Preview per Addendum */}
              <div className="relative h-60 sm:h-72 w-full rounded-2xl overflow-hidden shadow-sm border border-slate-200">
                <RouteMap
                  routes={[route]}
                  interactive={true}
                  showAdvisories={true}
                  className="absolute inset-0 w-full h-full"
                />
              </div>
              <div className="mt-2 text-right">
                <span className="text-[10px] text-slate-400">Interactive OpenStreetMap preview • No live GPS</span>
              </div>
            </div>

            {/* Estimated Fare Breakdown Card matching Page 4 */}
            <div className="bg-slate-50/70 rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-5">
                Estimated Fare Breakdown
              </h3>

              <div className="space-y-3.5 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Walk to Terminal</span>
                  <span className="font-semibold text-slate-400">Free</span>
                </div>

                <div className="flex items-center justify-between text-slate-700">
                  <span className="font-medium">Primary Leg: {route.route_name}</span>
                  <span className="font-bold text-slate-900">₱{route.minimum_fare.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between text-slate-700">
                  <span className="font-medium">Connecting Transfer (if applicable)</span>
                  <span className="font-bold text-slate-900">₱8.00</span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Final Walk to Destination</span>
                  <span className="font-semibold text-slate-400">Free</span>
                </div>

                <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-sm sm:text-base">
                    Total Est. Fare
                  </span>
                  {/* Consistent formatting per §0.7 */}
                  <span className="text-xl sm:text-2xl font-black text-emerald-700">
                    ₱{Math.round(route.minimum_fare)} – ₱{Math.round(route.maximum_fare)}
                  </span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200/60">
                <button
                  onClick={() => navigate('/fare-calculator')}
                  className="w-full py-2.5 px-4 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 text-emerald-700 text-xs font-bold transition-all text-center"
                >
                  Calculate Passenger Discounts (Student/Senior/PWD)
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
