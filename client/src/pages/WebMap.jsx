import React, { useEffect, useState } from 'react';
import { useRouter } from '../context/RouterContext';
import RouteMap from '../components/RouteMap';
import JourneyPlanner from '../components/JourneyPlanner';
import { 
  Compass, 
  MapPin, 
  Layers, 
  AlertTriangle, 
  CarFront, 
  Bus, 
  Bike, 
  Footprints,
  Ship,
  ArrowRight,
  Landmark,
  GraduationCap,
  Menu,
  PanelLeftClose
} from 'lucide-react';

function readLineStringCoordinates(value) {
  try {
    const geometry = typeof value === 'string' ? JSON.parse(value) : value;
    return geometry?.type === 'LineString' && Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : [];
  } catch {
    return [];
  }
}

export default function WebMap() {
  const { navigate, queryParams } = useRouter();

  const [routes, setRoutes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [schools, setSchools] = useState([]);
  const [focusedRoute, setFocusedRoute] = useState(null);
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [showLocations, setShowLocations] = useState(false); // routes-only default
  const [showSchools, setShowSchools] = useState(false);     // routes-only default
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);

  // Journey Planner state
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [selectedJourney, setSelectedJourney] = useState(null);
  const [panelView, setPanelView] = useState(queryParams?.route ? 'route' : 'planner');

  useEffect(() => {
    // Load routes summary
    fetch('/api/routes', { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((routesData) => {
        setRoutes(Array.isArray(routesData) ? routesData : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load map data:', err);
        setRoutes([]);
        setLoading(false);
      });

    // Load unified locations
    fetch('/api/locations', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setLocations(data);
      })
      .catch(err => console.error('Failed to load locations:', err));

    // Load verified Dagupan City schools
    fetch('/api/schools', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSchools(data);
      })
      .catch(err => console.error('Failed to load schools:', err));
  }, []);

  // Load the exact route record when opened from RouteDetails or a route URL.
  useEffect(() => {
    const routeId = queryParams?.route;
    if (!routeId) {
      setFocusedRoute(null);
      setSelectedItem(current => current?.type === 'route' ? null : current);
      setPanelView('planner');
      return undefined;
    }

    let cancelled = false;
    setFocusedRoute(null);
    setSelectedItem(null);
    setPanelView('route');
    fetch(`/api/routes/${encodeURIComponent(routeId)}`, { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`Route request failed: ${response.status}`);
        return response.json();
      })
      .then(route => {
        if (cancelled) return;
        const selectedRoute = route.active_detour
          ? {
            ...route,
            geometry: route.active_detour.detour_geometry,
            path_segments: [],
            route_path_segments: [],
            active_travel_time: route.active_detour.detour_time || route.active_travel_time,
            geometry_needs_review: false
          }
          : route;
        setFocusedRoute(selectedRoute);
        setSelectedItem({ type: 'route', data: selectedRoute });
      })
      .catch(error => {
        if (!cancelled) {
          console.error('Failed to load selected route:', error);
          setFocusedRoute(null);
          setSelectedItem(null);
          setPanelView('planner');
        }
      });

    return () => { cancelled = true; };
  }, [queryParams?.route]);

  const handleSelect = (type, item) => {
    if (type === 'route') {
      setSelectedItem(item ? { type: 'route', data: item } : null);
      if (item) setPanelView('route');
    } else if (type === 'stop') {
      setSelectedItem({ type: 'stop', data: item, routeName: item.routeName });
    } else if (type === 'location') {
      setSelectedItem({ type: 'location', data: item });
    } else if (type === 'landmark') {
      setSelectedItem({ type: 'landmark', data: item });
    } else if (type === 'school') {
      setSelectedItem({ type: 'school', data: item });
    } else if (type === 'set-origin') {
      setOrigin({
        name: item.name,
        latitude: item.entrance_latitude || item.latitude,
        longitude: item.entrance_longitude || item.longitude
      });
      setPanelView('planner');
    } else if (type === 'set-destination') {
      setDestination({
        name: item.name,
        latitude: item.entrance_latitude || item.latitude,
        longitude: item.entrance_longitude || item.longitude
      });
      setPanelView('planner');
    } else if (type === 'advisory') {
      setSelectedItem({
        type: 'advisory',
        title: item?.title || 'AB Fernandez Ave Flooding',
        description: item?.description || 'High tide overflow has created standing water along lower lanes. Affected routes reflect current advisories.'
      });
    }
  };

  const toggleSidePanel = () => {
    if (panelView === 'planner') {
      setPanelView(selectedItem?.type === 'route' ? 'route' : 'closed');
    } else {
      setSelectedItem(current => current?.type === 'route' ? null : current);
      setFocusedRoute(null);
      if (queryParams?.route) navigate('/map');
      setPanelView('planner');
    }
  };

  const getSelectedRouteModes = (route) => {
    const routeSegments = Array.isArray(route?.route_path_segments)
      ? route.route_path_segments
      : Array.isArray(route?.path_segments) ? route.path_segments : [];
    const segmentModes = routeSegments
      .slice()
      .sort((first, second) => (first.segment_order ?? 0) - (second.segment_order ?? 0))
      .map((segment) => String(segment.mode || '').trim())
      .filter(Boolean);
    const modes = segmentModes.length ? segmentModes : [String(route?.mode_name || route?.mode || '').trim()];
    const seenModes = new Set();

    return modes.flatMap((mode) => {
      const normalizedMode = mode.toLowerCase();
      if (!normalizedMode || seenModes.has(normalizedMode)) return [];
      seenModes.add(normalizedMode);

      if (normalizedMode.includes('walk')) {
        return [{ label: mode, icon: Footprints, color: 'text-emerald-700', background: 'bg-emerald-50', border: 'border-emerald-200' }];
      }
      if (normalizedMode.includes('tricycle')) {
        return [{ label: mode, icon: Bike, color: 'text-cyan-700', background: 'bg-cyan-50', border: 'border-cyan-200' }];
      }
      if (normalizedMode.includes('jeep')) {
        return [{ label: mode, icon: CarFront, color: 'text-pink-700', background: 'bg-pink-50', border: 'border-pink-200' }];
      }
      if (normalizedMode.includes('bus')) {
        return [{ label: mode, icon: Bus, color: 'text-emerald-700', background: 'bg-emerald-50', border: 'border-emerald-200' }];
      }
      if (normalizedMode.includes('boat')) {
        return [{ label: mode, icon: Ship, color: 'text-blue-700', background: 'bg-blue-50', border: 'border-blue-200' }];
      }
      return [{ label: mode, icon: CarFront, color: 'text-slate-700', background: 'bg-slate-50', border: 'border-slate-200' }];
    });
  };
  const selectedRouteModes = selectedItem?.type === 'route'
    ? getSelectedRouteModes(selectedItem.data)
    : [];
  const mapLayers = [
    { label: 'Schools', icon: GraduationCap, enabled: showSchools, toggle: () => setShowSchools(!showSchools), activeClass: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
    { label: 'Places & Streets', icon: MapPin, enabled: showLocations, toggle: () => setShowLocations(!showLocations), activeClass: 'bg-sky-50 border-sky-200 text-sky-700' },
    { label: 'Landmarks', icon: Landmark, enabled: showLandmarks, toggle: () => setShowLandmarks(!showLandmarks), activeClass: 'bg-purple-50 border-purple-200 text-purple-700' }
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 py-3 px-4 sm:px-6 lg:px-8 shadow-xs z-20">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-start gap-3 lg:gap-6">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-emerald-600" />
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                Web Map & Journey Planner
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Flood-aware commute guide, verified schools, and waterways for Dagupan City.
            </p>
          </div>

          {/* Map layer toggles */}
          <div className="flex max-w-full flex-wrap items-center gap-1.5">
            {mapLayers.map(({ label, icon: LayerIcon, enabled, toggle, activeClass }) => (
              <button
                key={label}
                type="button"
                onClick={toggle}
                aria-pressed={enabled}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
                  enabled
                    ? activeClass
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <LayerIcon className="h-3 w-3" aria-hidden="true" />
                {label} {enabled ? 'ON' : 'OFF'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Split-View Content Area */}
      <div className="relative flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        
        {/* Sliding side panel switches between the planner and selected route details. */}
        <div className={`absolute inset-y-0 left-0 z-30 w-[min(90vw,420px)] overflow-hidden bg-white shadow-xl transition-transform duration-300 ease-in-out md:relative md:inset-y-auto md:left-auto md:z-auto md:h-full md:flex-shrink-0 md:transition-[width,transform] ${
          panelView === 'closed'
            ? '-translate-x-full md:w-0 md:-translate-x-full'
            : 'translate-x-0 md:w-[380px] xl:w-[420px]'
        }`}>
          <div className="flex h-full w-[min(90vw,420px)] flex-col border-r border-slate-200 bg-white md:w-[380px] xl:w-[420px]">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                {panelView === 'planner' ? (
                  <Compass className="h-4 w-4 text-emerald-600" />
                ) : (
                  <MapPin className="h-4 w-4 text-emerald-600" />
                )}
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  {panelView === 'planner' ? 'Journey Planner' : 'Selected Route'}
                </h2>
              </div>
              <button
                type="button"
                onClick={toggleSidePanel}
                aria-label={panelView === 'planner' ? 'Hide Journey Planner' : 'Open Journey Planner'}
                title={panelView === 'planner' ? 'Hide panel' : 'Open Journey Planner'}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {panelView === 'planner' ? <PanelLeftClose className="h-4 w-4" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>

            {panelView === 'planner' && (
              <JourneyPlanner
                origin={origin}
                setOrigin={setOrigin}
                destination={destination}
                setDestination={setDestination}
                selectedJourney={selectedJourney}
                onSelectJourney={(journey) => {
                  setSelectedJourney(journey);
                  if (window.innerWidth < 768) setPanelView('closed');
                }}
                className="min-h-0 flex-1"
              />
            )}

            {panelView === 'route' && selectedItem?.type === 'route' && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                <h3 className="text-lg font-bold text-slate-900">{selectedItem.data.route_name}</h3>
                {selectedRouteModes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Vehicles used on this route">
                    {selectedRouteModes.map((routeMode) => {
                      const ModeIcon = routeMode.icon;
                      return (
                        <div
                          key={routeMode.label.toLowerCase()}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${routeMode.background} ${routeMode.border} ${routeMode.color}`}
                        >
                          <ModeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="text-[11px] font-bold uppercase tracking-wider">{routeMode.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  {selectedItem.data.description || 'Route details for this Dagupan transit service.'}
                </p>
                {selectedItem.data.geometry_needs_review && (
                  <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    This route is hidden from the map until its road geometry is verified.
                  </p>
                )}
                {selectedItem.data.map_preview_unavailable && (
                  <p role="status" className="mt-3 rounded-lg border border-slate-200 bg-slate-100 p-3 text-xs text-slate-700">
                    This river service is not active, so it is hidden from the map.
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-4 text-xs">
                  <div>
                    <span className="block text-slate-400">Est. Fare</span>
                    <span className="font-bold text-slate-800">
                      ₱{Math.round(selectedItem.data.minimum_fare)} – ₱{Math.round(selectedItem.data.maximum_fare)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400">Travel Time</span>
                    <span className="font-bold text-slate-800">
                      {selectedItem.data.active_travel_time || selectedItem.data.estimated_time} mins
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/routes/${selectedItem.data.id}`)}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600"
                >
                  View Route Details
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {panelView === 'route' && !selectedItem && queryParams?.route && (
              <div role="status" className="flex flex-1 items-center justify-center text-xs font-semibold text-slate-500">
                Loading selected route...
              </div>
            )}

          </div>
        </div>

        {/* Right Side: Interactive Leaflet Map (Fills full viewport height) */}
        <div className="flex-1 relative overflow-hidden w-full min-h-[60vh]">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center bg-slate-100">
              <div className="text-center">
                <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs font-semibold text-slate-500">Loading Dagupan transit network...</p>
              </div>
            </div>
          ) : (
            <RouteMap
              routes={queryParams?.route ? (focusedRoute ? [focusedRoute] : []) : routes}
              activeFilter="ALL"
              showLandmarks={showLandmarks}
              showLocations={showLocations}
              showSchools={showSchools}
              schools={schools}
              selectedJourney={queryParams?.route
                ? focusedRoute?.active_detour
                  ? { legs: [{
                    coordinates: [],
                    floodedCoordinates: readLineStringCoordinates(focusedRoute.active_detour.flooded_geometry),
                    advisoryTitle: focusedRoute.active_detour.title
                  }] }
                  : null
                : selectedJourney}
              selectedRouteId={queryParams?.route || (selectedItem?.type === 'route' ? selectedItem.data.id : null)}
              routeOnly={Boolean(queryParams?.route)}
              allowUnverifiedPreview={queryParams?.route ? Boolean(focusedRoute?.geometry_needs_review) : selectedItem?.type === 'route' && Boolean(selectedItem.data.geometry_needs_review)}
              locations={locations}
              showAdvisories={true}
              interactive={true}
              className="absolute inset-0 w-full h-full"
              onSelect={handleSelect}
            />
          )}

          {panelView === 'closed' && (
            <button
              type="button"
              onClick={() => setPanelView('planner')}
              aria-label="Open Journey Planner"
              title="Open Journey Planner"
              className="absolute top-20 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-lg backdrop-blur transition-colors hover:bg-white hover:text-emerald-700"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          {/* Non-route map selections remain as compact map overlays. */}
          {selectedItem && selectedItem.type !== 'route' && (
            <div className="absolute bottom-16 lg:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-200/90 z-20 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex min-h-11 items-center justify-between gap-3 mb-2">
                <span className="text-[10px] font-bold uppercase leading-tight tracking-wider text-slate-400">
                  {selectedItem.type === 'stop' ? 'Selected Transit Stop' : selectedItem.type === 'school' ? 'Verified Dagupan Institution' : selectedItem.type === 'landmark' ? 'Reference Landmark' : 'Advisory Info'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  aria-label="Close selected map details"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              {selectedItem.type === 'school' && (
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                    <GraduationCap className="w-4 h-4 text-indigo-600" />
                    {selectedItem.data.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {selectedItem.data.type}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      Dagupan City Verified
                    </span>
                  </div>
                  {selectedItem.data.barangay && (
                    <p className="text-xs text-slate-500 mt-1.5">Brgy. {selectedItem.data.barangay}, Dagupan City</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleSelect('set-origin', selectedItem.data)}
                      className="py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                    >
                      Set as Origin
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelect('set-destination', selectedItem.data)}
                      className="py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors"
                    >
                      Route Here
                    </button>
                  </div>
                </div>
              )}

              {selectedItem.type === 'stop' && (
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    {selectedItem.data.stop_name}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{selectedItem.data.description || 'Designated boarding and transfer point.'}</p>
                  {selectedItem.routeName && (
                    <div className="mt-2 text-xs text-slate-600">
                      Route: <span className="font-semibold text-slate-800">{selectedItem.routeName}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedItem.type === 'location' && (
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                    <MapPin className="w-4 h-4 text-sky-600" />
                    {selectedItem.data.name}
                  </div>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-100">
                    {selectedItem.data.type}
                  </span>
                  {selectedItem.data.address && (
                    <p className="text-xs text-slate-500 mt-1.5">{selectedItem.data.address}</p>
                  )}
                  {selectedItem.data.description && (
                    <p className="text-xs text-slate-400 mt-1 italic">{selectedItem.data.description}</p>
                  )}
                </div>
              )}

              {selectedItem.type === 'landmark' && (
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                    <Landmark className="w-4 h-4 text-indigo-600" />
                    {selectedItem.data.name}
                  </div>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {selectedItem.data.type}
                  </span>
                  <p className="text-xs text-slate-500 mt-2">
                    Official Dagupan landmark reference point for commute navigation.
                  </p>
                </div>
              )}

              {selectedItem.type === 'advisory' && (
                <div>
                  <div className="flex items-center gap-1.5 text-amber-700 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {selectedItem.title}
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    {selectedItem.description}
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => navigate('/routes')}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors"
                    >
                      See Detoured Routes in Directory
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Collapsible map key: layers remain interactive through their existing toggles and popups. */}
          <div className="absolute top-4 right-4 z-10 hidden md:block">
            <button
              type="button"
              onClick={() => setLegendOpen(!legendOpen)}
              aria-expanded={legendOpen}
              aria-controls="map-legend"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-md backdrop-blur-md transition-colors hover:bg-white"
            >
              <Layers className="h-3.5 w-3.5 text-emerald-600" />
              Map key
              <span className={`text-slate-400 transition-transform ${legendOpen ? 'rotate-180' : ''}`}>⌄</span>
            </button>

            <div
              id="map-legend"
              aria-hidden={!legendOpen}
              className={`absolute right-0 top-full mt-2 w-56 origin-top-right rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-md backdrop-blur-md transition-all duration-200 ease-out ${legendOpen
                ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none -translate-y-2 scale-95 opacity-0'
              }`}
            >
                <div className="space-y-1.5">
                  {selectedJourney && (
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-1">
                      <span className="h-3 w-3 rounded-full bg-blue-600 ring-2 ring-emerald-400"></span>
                      <span className="font-bold text-emerald-800">Selected Commute Path</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-pink-500"></span>
                    <span className="text-slate-600">Jeepney Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-orange-500"></span>
                    <span className="text-slate-600">Modern PUV Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-600"></span>
                    <span className="text-slate-600">Bus Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-violet-500"></span>
                    <span className="text-slate-600">Provincial Bus</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-cyan-500"></span>
                    <span className="text-slate-600">Tricycle Corridor</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border-2 border-blue-600" style={{ background: 'repeating-linear-gradient(90deg, #2563eb 0, #2563eb 4px, transparent 4px, transparent 8px)' }}></span>
                    <span className="text-slate-600">River Boat Crossing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-amber-500"></span>
                    <span className="text-slate-600">Flood Hazard Zone</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 items-center justify-center rounded-full bg-indigo-600 text-[8px] text-white">🎓</span>
                    <span className="text-slate-600">Schools & Universities</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 items-center justify-center rounded bg-indigo-500 text-[8px] text-white">★</span>
                    <span className="text-slate-600">Reference Landmarks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-sky-600"></span>
                    <span className="text-slate-600">River Stops / Places</span>
                  </div>
                </div>
                <div className="mt-2 border-t border-slate-100 pt-1 text-[9px] italic text-slate-400">
                  Click routes and markers for details. Boat routes are sample data.
                </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
