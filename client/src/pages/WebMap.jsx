import React, { useEffect, useState } from 'react';
import { useRouter } from '../context/RouterContext';
import RouteMap from '../components/RouteMap';
import { 
  Compass, 
  MapPin, 
  Layers, 
  AlertTriangle, 
  CarFront, 
  Bus, 
  Bike, 
  ArrowRight,
  Landmark
} from 'lucide-react';

export default function WebMap() {
  const { navigate } = useRouter();

  const [routes, setRoutes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'Jeepney', 'Bus', 'Tricycle', 'Boat', 'FLOOD'
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [showLocations, setShowLocations] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);

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
  }, []);

  const handleSelect = (type, item) => {
    if (type === 'route') {
      setSelectedItem({ type: 'route', data: item });
    } else if (type === 'stop') {
      setSelectedItem({ type: 'stop', data: item, routeName: item.routeName });
    } else if (type === 'location') {
      setSelectedItem({ type: 'location', data: item });
    } else if (type === 'landmark') {
      setSelectedItem({ type: 'landmark', data: item });
    } else if (type === 'advisory') {
      setSelectedItem({
        type: 'advisory',
        title: item?.title || 'AB Fernandez Ave Flooding',
        description: item?.description || 'High tide overflow has created standing water along lower lanes. Affected routes reflect current advisories.'
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* Header Bar */}
      <div className="bg-white border-b border-slate-200 py-4 px-4 sm:px-6 lg:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-emerald-600" />
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Web Map
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Informational transit corridors, river boat crossings, stops, and flood hazard overlays for Dagupan City.
            </p>
          </div>

          {/* Filter Pills and Layer Toggles */}
          <div className="flex flex-wrap items-center gap-2">
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
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeFilter === tab.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}

            <button
              onClick={() => setShowLocations(!showLocations)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                showLocations
                  ? 'bg-sky-50 border-sky-200 text-sky-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Places & Streets {showLocations ? 'ON' : 'OFF'}
            </button>

            <button
              onClick={() => setShowLandmarks(!showLandmarks)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                showLandmarks
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              Landmarks {showLandmarks ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* Map Area using shared RouteMap component */}
      <div className="relative flex-1 w-full" style={{ height: 'calc(100vh - 140px)', minHeight: '520px' }}>
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
            locations={locations}
            showAdvisories={true}
            interactive={true}
            className="absolute inset-0 w-full h-full"
            onSelect={handleSelect}
          />
        )}

        {/* Selected Item Drawer / Overlay */}
        {selectedItem && (
          <div className="absolute bottom-6 left-6 right-6 sm:left-auto sm:right-6 sm:w-96 bg-white/95 backdrop-blur-md p-5 rounded-2xl shadow-xl border border-slate-200/90 z-10 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {selectedItem.type === 'route' ? 'Selected Route' : selectedItem.type === 'stop' ? 'Selected Transit Stop' : selectedItem.type === 'landmark' ? 'Reference Landmark' : 'Advisory Info'}
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
                  className="w-full mt-4 py-2 bg-slate-900 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  View Route Details
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
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

        {/* Legend Overlay Card */}
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-md border border-slate-200 z-10 text-xs space-y-2 hidden md:block">
          <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Map Legend</div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-pink-500"></span>
            <span className="text-slate-600">Jeepney Route</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
            <span className="text-slate-600">Bus Loop</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyan-500"></span>
            <span className="text-slate-600">Tricycle Corridors</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-blue-600" style={{ background: 'repeating-linear-gradient(90deg, #2563eb 0, #2563eb 4px, transparent 4px, transparent 8px)' }}></span>
            <span className="text-slate-600">River Boat Crossing</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <span className="text-slate-600">Flood Hazard Zone</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-indigo-500"></span>
            <span className="text-slate-600">Reference Landmarks</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-sky-600"></span>
            <span className="text-slate-600">River Stops / Places</span>
          </div>
          <div className="border-t border-slate-100 pt-1.5 text-[9px] text-slate-400 italic">
            Boat routes are sample/configurable data. Verify with admin.
          </div>
        </div>

      </div>

    </div>
  );
}
