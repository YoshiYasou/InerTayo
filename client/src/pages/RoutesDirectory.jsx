import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from '../context/RouterContext';
import AdvisoryBanner from '../components/AdvisoryBanner';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { 
  Search, 
  CarFront, 
  Bus, 
  Bike, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Banknote,
  RotateCcw,
  Footprints
} from 'lucide-react';

export default function RoutesDirectory() {
  const { queryParams, navigate } = useRouter();

  const [searchTerm, setSearchTerm] = useState(queryParams.search || queryParams.from || queryParams.to || '');
  const [selectedMode, setSelectedMode] = useState(queryParams.mode || 'All Modes');
  const [sortBy, setSortBy] = useState(queryParams.sort || 'Fastest Travel Time');

  const [routes, setRoutes] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [modes, setModes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Resolved location from autocomplete selection (has lat/lng for proximity search)
  const [resolvedLocation, setResolvedLocation] = useState(null);
  // Keep the pending location so we can use it when Apply Filters is clicked
  const pendingLocation = useRef(null);

  // Fetch transport modes + advisories on mount
  useEffect(() => {
    fetch('/api/transport-modes')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setModes(data); })
      .catch(err => console.error('Error loading modes:', err));

    fetch('/api/advisories')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setAdvisories(data); })
      .catch(err => console.error('Error loading advisories:', err));
  }, []);

  // Fetch routes whenever URL query params change
  useEffect(() => {
    fetchFilteredRoutes();
  }, [queryParams]);

  const fetchFilteredRoutes = async () => {
    setLoading(true);
    try {
      // If we have a resolved location with coordinates, use proximity search
      const loc = pendingLocation.current || resolvedLocation;
      const hasCoords = loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number';
      const searchText = queryParams.search || queryParams.from || queryParams.to || '';

      if (hasCoords && searchText) {
        // Proximity search: call /api/routes/nearby with the resolved coordinates
        const params = new URLSearchParams({
          lat: loc.latitude,
          lng: loc.longitude,
          radius: 600,
        });
        if (queryParams.mode && queryParams.mode !== 'All Modes') params.append('mode', queryParams.mode);
        if (queryParams.sort) params.append('sort', queryParams.sort);

        const res = await fetch(`/api/routes/nearby?${params.toString()}`);
        const proximityData = await res.json();

        if (!Array.isArray(proximityData)) {
          // outsideDagupan flag or error
          if (proximityData.outsideDagupan) {
            setRoutes([]);
            setLoading(false);
            return;
          }
          throw new Error('Unexpected proximity response');
        }

        // Also run the text search to catch additional matches (e.g. route names containing the term)
        const textParams = new URLSearchParams();
        textParams.append('search', searchText);
        if (queryParams.mode && queryParams.mode !== 'All Modes') textParams.append('mode', queryParams.mode);
        if (queryParams.sort) textParams.append('sort', queryParams.sort);

        const textRes = await fetch(`/api/routes?${textParams.toString()}`);
        const textData = await textRes.json();
        const textRoutes = Array.isArray(textData) ? textData : [];

        // Merge and deduplicate by route id; proximity results come first (sorted by walk distance)
        const seenIds = new Set();
        const merged = [];
        for (const r of proximityData) {
          if (!seenIds.has(r.id)) { seenIds.add(r.id); merged.push(r); }
        }
        for (const r of textRoutes) {
          if (!seenIds.has(r.id)) { seenIds.add(r.id); merged.push(r); }
        }
        setRoutes(merged);

      } else {
        // Standard text search (no resolved coords — legacy behaviour preserved)
        const params = new URLSearchParams();
        if (queryParams.search) params.append('search', queryParams.search);
        if (queryParams.from)   params.append('from', queryParams.from);
        if (queryParams.to)     params.append('to', queryParams.to);
        if (queryParams.mode && queryParams.mode !== 'All Modes') params.append('mode', queryParams.mode);
        if (queryParams.sort)   params.append('sort', queryParams.sort);

        const res = await fetch(`/api/routes?${params.toString()}`);
        const data = await res.json();
        if (Array.isArray(data)) setRoutes(data);
      }
    } catch (err) {
      console.error('Error loading routes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = (e) => {
    e.preventDefault();
    // Persist the pending resolved location so fetchFilteredRoutes can use it
    if (pendingLocation.current) {
      setResolvedLocation(pendingLocation.current);
    }
    navigate('/routes', {
      search: searchTerm.trim(),
      mode: selectedMode,
      sort: sortBy
    });
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedMode('All Modes');
    setSortBy('Fastest Travel Time');
    setResolvedLocation(null);
    pendingLocation.current = null;
    navigate('/routes');
  };

  // Mode badge icon helper
  const renderModeIcon = (modeName) => {
    const lower = (modeName || '').toLowerCase();
    if (lower.includes('jeep')) {
      return (
        <div className="w-6 h-6 rounded-md bg-pink-100 text-pink-600 flex items-center justify-center">
          <CarFront className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (lower.includes('bus')) {
      return (
        <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <Bus className="w-3.5 h-3.5" />
        </div>
      );
    }
    return (
      <div className="w-6 h-6 rounded-md bg-cyan-100 text-cyan-600 flex items-center justify-center">
        <Bike className="w-3.5 h-3.5" />
      </div>
    );
  };

  // Format walking distance for display
  const formatWalkDistance = (meters) => {
    if (!meters && meters !== 0) return null;
    if (meters < 50) return '< 50m walk to stop';
    if (meters < 1000) return `~${Math.round(meters / 10) * 10}m walk to stop`;
    return `~${(meters / 1000).toFixed(1)}km walk to stop`;
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      
      {/* Page Header */}
      <div className="bg-white border-b border-slate-100 pt-10 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-3 border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Pangasinan Transit Directory
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Explore Dagupan Routes
            </h1>
            <p className="text-sm sm:text-base text-slate-500 mt-2 leading-relaxed">
              Browse all available jeepney, bus, and tricycle routes across Dagupan City. Get real-time fare estimates, route maps, and stop schedules.
            </p>
          </div>

          {/* Single Consistent Advisory Banner per §0.6 & §10 */}
          {advisories.length > 0 && (
            <div className="mt-6">
              <AdvisoryBanner advisory={advisories[0]} />
            </div>
          )}

          {/* Filter Bar */}
          <form onSubmit={handleApplyFilters} className="mt-8">
            <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-sm flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
              
              {/* Search input with autocomplete */}
              <div className="flex-1 relative bg-slate-50/70 border border-slate-200 rounded-xl px-3.5 py-1.5 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:bg-white transition-all">
                <LocationAutocomplete
                  value={searchTerm}
                  onChange={(val) => {
                    // User is typing manually — clear any resolved location
                    setSearchTerm(val);
                    pendingLocation.current = null;
                    setResolvedLocation(null);
                  }}
                  onSelect={(item) => {
                    // User selected a suggestion — store full item (with lat/lng) for proximity search
                    setSearchTerm(item.name);
                    pendingLocation.current = item;
                    // Auto-trigger search immediately on selection
                    setResolvedLocation(item);
                    navigate('/routes', {
                      search: item.name,
                      mode: selectedMode,
                      sort: sortBy
                    });
                  }}
                  placeholder="Search landmarks, streets, barangays, schools, or routes (e.g. UPang, Bonuan Gueset)"
                  icon={<Search className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                />
              </div>

              {/* Mode dropdown */}
              <div className="w-full lg:w-48">
                <label className="sr-only">Transport Type</label>
                <div className="relative">
                  <select
                    value={selectedMode}
                    onChange={(e) => setSelectedMode(e.target.value)}
                    className="w-full py-2.5 px-3.5 text-sm bg-slate-50/70 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white appearance-none transition-all cursor-pointer"
                  >
                    <option value="All Modes">All Modes</option>
                    {modes.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">▼</div>
                </div>
              </div>

              {/* Sort dropdown */}
              <div className="w-full lg:w-52">
                <label className="sr-only">Sort By</label>
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full py-2.5 px-3.5 text-sm bg-slate-50/70 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white appearance-none transition-all cursor-pointer"
                  >
                    <option value="Fastest Travel Time">Fastest Travel Time</option>
                    <option value="Cheapest Fare">Cheapest Fare</option>
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">▼</div>
                </div>
              </div>

              {/* Apply Filters Button */}
              <button
                type="submit"
                className="py-2.5 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Apply Filters
              </button>

            </div>
          </form>

          {/* Resolved location indicator */}
          {resolvedLocation && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
              Showing routes near <strong>{resolvedLocation.name}</strong>
              {resolvedLocation.typeLabel && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-emerald-600">
                  {resolvedLocation.typeLabel}
                </span>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Main Routes Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">
            Available Routes ({routes.length})
          </h2>
          {(queryParams.search || queryParams.from || queryParams.to || queryParams.mode || queryParams.sort) && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-emerald-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="bg-white rounded-2xl p-6 border border-slate-200 animate-pulse h-48"></div>
            ))}
          </div>
        ) : routes.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-sm max-w-lg mx-auto mt-6">
            <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">No routes currently registered for this location.</h3>
            <p className="text-sm text-slate-500 mt-1.5 mb-6">
              {searchTerm || queryParams.from || queryParams.to
                ? `No public transit routes currently connect with "${searchTerm || queryParams.from || queryParams.to}". Try searching another street or major terminal.`
                : 'No transit routes currently match the selected criteria.'}
            </p>
            <button
              onClick={handleResetFilters}
              className="py-2.5 px-5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm"
            >
              View All Available Routes
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {routes.map((route) => {
              const isDetour = route.status === 'DETOUR_ACTIVE';
              const walkLabel = route.fromProximitySearch
                ? formatWalkDistance(route.walkDistanceMeters)
                : null;
              return (
                <div
                  key={route.id}
                  className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Card Top: Mode + Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        {renderModeIcon(route.mode_name)}
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          {route.mode_name}
                        </span>
                      </div>

                      {/* Status Badge */}
                      {isDetour ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Detour Active
                        </span>
                      ) : route.status === 'UNAVAILABLE' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          Unavailable
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Clear
                        </span>
                      )}
                    </div>

                    {/* Route Name */}
                    <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-2">
                      {route.route_name}
                    </h3>

                    {/* Walk distance badge — shown only for proximity results */}
                    {walkLabel && (
                      <div className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1 mb-3">
                        <Footprints className="w-3 h-3" />
                        {walkLabel}
                        {route.nearestStop && (
                          <span className="text-emerald-600 ml-0.5">· {route.nearestStop.name}</span>
                        )}
                      </div>
                    )}

                    {/* 2-Column Metrics */}
                    <div className="grid grid-cols-2 gap-4 pb-6 border-b border-slate-100">
                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          EST. FARE
                        </span>
                        <span className="text-base font-extrabold text-slate-900">
                          ₱{Math.round(route.minimum_fare)} – ₱{Math.round(route.maximum_fare)}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                          TRAVEL TIME
                        </span>
                        <span className={`text-base font-extrabold ${isDetour ? 'text-amber-700' : 'text-slate-900'}`}>
                          {route.active_travel_time || route.estimated_time} mins
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Button at bottom */}
                  <button
                    onClick={() => navigate(`/routes/${route.id}`)}
                    className="w-full mt-5 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold tracking-wide uppercase transition-all shadow-sm active:scale-98 text-center"
                  >
                    View Route Details
                  </button>

                </div>
              );
            })}
          </div>
        )}

      </div>

    </div>
  );
}
