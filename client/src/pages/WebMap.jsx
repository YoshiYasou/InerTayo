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
  ArrowRight,
  Landmark,
  GraduationCap
} from 'lucide-react';

export default function WebMap() {
  const { navigate, queryParams } = useRouter();

  const [routes, setRoutes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [schools, setSchools] = useState([]);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'Jeepney', 'Bus', 'Tricycle', 'Boat', 'FLOOD'
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [showLocations, setShowLocations] = useState(true);
  const [showSchools, setShowSchools] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);

  // Journey Planner state
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [selectedJourney, setSelectedJourney] = useState(null);
  const [mobileView, setMobileView] = useState('map'); // 'map' | 'planner'

  useEffect(() => {
    // Load routes with full stops details
    fetch('/api/routes')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(async (routesData) => {
        if (!Array.isArray(routesData)) {
          setRoutes([]);
          setLoading(false);
          return;
        }
        const detailedRoutes = await Promise.all(
          routesData.map(async (r) => {
            try {
              const detailRes = await fetch(`/api/routes/${r.id}`);
              if (!detailRes.ok) return r;
              return await detailRes.json();
            } catch (e) {
              return r;
            }
          })
        );
        setRoutes(detailedRoutes);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load map data:', err);
        setRoutes([]);
        setLoading(false);
      });

    // Load unified locations
    fetch('/api/locations')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setLocations(data);
      })
      .catch(err => console.error('Failed to load locations:', err));

    // Load verified Dagupan City schools
    fetch('/api/schools')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSchools(data);
      })
      .catch(err => console.error('Failed to load schools:', err));
  }, []);

  // Auto-select route if opened from RouteDetails or URL with ?route=<id>
  useEffect(() => {
    if (queryParams?.route && routes.length > 0) {
      const target = routes.find(r => String(r.id) === String(queryParams.route));
      if (target) {
        setSelectedItem({ type: 'route', data: target });
      }
    }
  }, [queryParams?.route, routes]);

  const handleSelect = (type, item) => {
    if (type === 'route') {
      setSelectedItem({ type: 'route', data: item });
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
      setMobileView('planner');
    } else if (type === 'set-destination') {
      setDestination({
        name: item.name,
        latitude: item.entrance_latitude || item.latitude,
        longitude: item.entrance_longitude || item.longitude
      });
      setMobileView('planner');
    } else if (type === 'advisory') {
      setSelectedItem({
        type: 'advisory',
        title: item?.title || 'AB Fernandez Ave Flooding',
        description: item?.description || 'High tide overflow has created standing water along lower lanes. Affected routes reflect current advisories.'
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 py-3 px-4 sm:px-6 lg:px-8 shadow-xs z-20">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
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

          {/* Filter Pills and Layer Toggles */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'ALL', label: 'All Modes' },
              { key: 'Jeepney', label: 'Jeepneys' },
              { key: 'Bus', label: 'Buses' },
              { key: 'Tricycle', label: 'Tricycles' },
              { key: 'Boat', label: '🚤 River Boats' },
              { key: 'FLOOD', label: '⚠️ Flood Zones' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  activeFilter === tab.key
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block"></div>

            <button
              onClick={() => setShowSchools(!showSchools)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1 border ${
                showSchools
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <GraduationCap className="w-3 h-3" />
              Schools {showSchools ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setShowLocations(!showLocations)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1 border ${
                showLocations
                  ? 'bg-sky-50 border-sky-200 text-sky-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <MapPin className="w-3 h-3" />
              Places & Streets {showLocations ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setShowLandmarks(!showLandmarks)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1 border ${
                showLandmarks
                  ? 'bg-purple-50 border-purple-200 text-purple-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Landmark className="w-3 h-3" />
              Landmarks {showLandmarks ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Split-View Content Area */}
      <div className="relative flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        
        {/* Left Side: Journey Planner Panel (Matching UX reference Screenshot 2) */}
        <div className={`w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 h-full overflow-hidden z-20 ${mobileView === 'planner' ? 'block' : 'hidden lg:block'}`}>
          <JourneyPlanner
            origin={origin}
            setOrigin={setOrigin}
            destination={destination}
            setDestination={setDestination}
            selectedJourney={selectedJourney}
            onSelectJourney={(journey) => {
              setSelectedJourney(journey);
              // On mobile, switch to map view to inspect the route
              if (window.innerWidth < 1024) {
                setMobileView('map');
              }
            }}
            className="h-full shadow-lg"
          />
        </div>

        {/* Right Side: Interactive Leaflet Map */}
        <div className={`flex-1 relative overflow-hidden ${mobileView === 'map' ? 'block' : 'hidden lg:block'}`}>
          {loading ? (
            <div className="w-full h-full flex items-center justify-center bg-slate-100">
              <div className="text-center">
                <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs font-semibold text-slate-500">Loading Dagupan transit network...</p>
              </div>
            </div>
          ) : (
            <RouteMap
              routes={routes}
              activeFilter={activeFilter}
              showLandmarks={showLandmarks}
              showLocations={showLocations}
              showSchools={showSchools}
              schools={schools}
              selectedJourney={selectedJourney}
              locations={locations}
              showAdvisories={true}
              interactive={true}
              className="absolute inset-0 w-full h-full"
              onSelect={handleSelect}
            />
          )}

          {/* Selected Item Drawer / Overlay */}
          {selectedItem && (
            <div className="absolute bottom-16 lg:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-200/90 z-20 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {selectedItem.type === 'route' ? 'Selected Route' : selectedItem.type === 'stop' ? 'Selected Transit Stop' : selectedItem.type === 'school' ? 'Verified Dagupan Institution' : selectedItem.type === 'landmark' ? 'Reference Landmark' : 'Advisory Info'}
                </span>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-xs text-slate-400 hover:text-slate-700 font-bold p-1"
                >
                  ✕
                </button>
              </div>

              {selectedItem.type === 'route' && (
                <div>
                  <h3 className="text-base font-bold text-slate-900">{selectedItem.data.route_name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{selectedItem.data.description}</p>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block">Est. Fare</span>
                      <span className="font-bold text-slate-800">
                        ₱{Math.round(selectedItem.data.minimum_fare)} – ₱{Math.round(selectedItem.data.maximum_fare)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Travel Time</span>
                      <span className="font-bold text-slate-800">
                        {selectedItem.data.active_travel_time || selectedItem.data.estimated_time} mins
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/routes/${selectedItem.data.id}`)}
                    className="w-full mt-3 py-2 bg-slate-900 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    View Route Details
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

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

            {legendOpen && (
              <div id="map-legend" className="mt-2 w-56 rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-md backdrop-blur-md">
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
                    <span className="h-3 w-3 rounded-full bg-emerald-600"></span>
                    <span className="text-slate-600">Bus Route</span>
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
            )}
          </div>

        </div>

        {/* Mobile View Bottom Floating Navigation Pill */}
        <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 backdrop-blur-md text-white rounded-full p-1 shadow-2xl flex items-center gap-1 border border-slate-700">
          <button
            type="button"
            onClick={() => setMobileView('planner')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
              mobileView === 'planner' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            🧭 Journey Planner
          </button>
          <button
            type="button"
            onClick={() => setMobileView('map')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
              mobileView === 'map' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🗺️ Map</span>
            {selectedJourney && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            )}
          </button>
        </div>

      </div>

    </div>
  );
}
