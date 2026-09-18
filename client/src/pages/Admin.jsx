import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldCheck, 
  Route, 
  AlertTriangle, 
  MessageSquare, 
  DollarSign, 
  MapPin, 
  Plus, 
  Trash2, 
  Edit, 
  Check, 
  X, 
  ToggleLeft, 
  ToggleRight,
  RefreshCw,
  Eye,
  Layers,
  Ship
} from 'lucide-react';

export default function Admin() {
  const { navigate } = useRouter();
  const { user, token, isAdmin, openAuth } = useAuth();

  const [activeTab, setActiveTab] = useState('routes'); // 'routes', 'advisories', 'locations', 'feedback'
  const [stats, setStats] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [modes, setModes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form Modal States
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [routeFormData, setRouteFormData] = useState({
    route_name: '',
    transport_mode_id: 1,
    origin: '',
    destination: '',
    estimated_time: 15,
    detour_time: 30,
    minimum_fare: 15.00,
    maximum_fare: 25.00,
    status: 'CLEAR',
    description: '',
    geometry: '',
    waterway: '',
    origin_river_stop_id: '',
    destination_river_stop_id: '',
    boat_operating_status: 'ACTIVE',
    boat_notes: ''
  });

  const [advisoryModalOpen, setAdvisoryModalOpen] = useState(false);
  const [editingAdvisory, setEditingAdvisory] = useState(null);
  const [advisoryFormData, setAdvisoryFormData] = useState({
    title: '',
    affected_road: '',
    condition: 'FLOODED',
    description: '',
    status: 'ACTIVE',
    route_ids: []
  });

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationFormData, setLocationFormData] = useState({
    name: '',
    type: 'LANDMARK',
    barangay: '',
    search_keywords: '',
    address: '',
    lat: '',
    lng: '',
    description: '',
    status: 'ACTIVE'
  });

  const LOCATION_TYPES = ['STREET', 'ROAD', 'BARANGAY', 'ESTABLISHMENT', 'LANDMARK', 'TERMINAL', 'INTERSECTION', 'RIVER_STOP', 'DESTINATION'];

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadAdminData();
  }, [isAdmin]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      const [statsRes, routesRes, advRes, feedRes, modesRes, locsRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }).then(r => r.json()),
        fetch('/api/routes').then(r => r.json()),
        fetch('/api/admin/advisories', { headers }).then(r => r.json()),
        fetch('/api/admin/feedback', { headers }).then(r => r.json()),
        fetch('/api/transport-modes').then(r => r.json()),
        fetch('/api/admin/locations', { headers }).then(r => r.json())
      ]);

      setStats(statsRes);
      setRoutes(routesRes);
      setAdvisories(advRes);
      setFeedbackList(feedRes);
      setModes(modesRes);
      setLocations(Array.isArray(locsRes) ? locsRes : (locsRes.locations || []));
    } catch (err) {
      console.error('Error loading admin portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Route Handlers
  const openNewRouteModal = () => {
    setEditingRoute(null);
    setRouteFormData({
      route_name: '',
      transport_mode_id: modes[0]?.id || 1,
      origin: '',
      destination: '',
      estimated_time: 15,
      detour_time: 30,
      minimum_fare: 15.00,
      maximum_fare: 25.00,
      status: 'CLEAR',
      description: '',
      geometry: '',
      waterway: 'Pantal River',
      origin_river_stop_id: '',
      destination_river_stop_id: '',
      boat_operating_status: 'ACTIVE',
      boat_notes: ''
    });
    setRouteModalOpen(true);
  };

  const openEditRouteModal = async (route) => {
    setEditingRoute(route);
    let waterway = route.waterway || '';
    let origin_river_stop_id = route.origin_river_stop_id || '';
    let destination_river_stop_id = route.destination_river_stop_id || '';
    let boat_operating_status = route.boat_operating_status || 'ACTIVE';
    let boat_notes = route.notes || '';

    // If boat details not on route object directly, check via API
    const isBoat = modes.find(m => m.id === route.transport_mode_id)?.name?.toLowerCase() === 'boat';
    if (isBoat && !waterway) {
      try {
        const bRes = await fetch(`/api/admin/routes/${route.id}/boat-details`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json());
        if (bRes) {
          waterway = bRes.waterway || '';
          origin_river_stop_id = bRes.origin_river_stop_id || '';
          destination_river_stop_id = bRes.destination_river_stop_id || '';
          boat_operating_status = bRes.operating_status || 'ACTIVE';
          boat_notes = bRes.notes || '';
        }
      } catch (e) {}
    }

    setRouteFormData({
      route_name: route.route_name,
      transport_mode_id: route.transport_mode_id,
      origin: route.origin,
      destination: route.destination,
      estimated_time: route.estimated_time,
      detour_time: route.detour_time || route.estimated_time + 10,
      minimum_fare: route.minimum_fare,
      maximum_fare: route.maximum_fare,
      status: route.status,
      description: route.description || '',
      geometry: typeof route.geometry === 'object' ? JSON.stringify(route.geometry) : (route.geometry || ''),
      waterway,
      origin_river_stop_id,
      destination_river_stop_id,
      boat_operating_status,
      boat_notes
    });
    setRouteModalOpen(true);
  };

  const handleSaveRoute = async (e) => {
    e.preventDefault();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    try {
      let routeId;
      if (editingRoute) {
        routeId = editingRoute.id;
        await fetch(`/api/admin/routes/${editingRoute.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(routeFormData)
        });
      } else {
        const res = await fetch('/api/admin/routes', {
          method: 'POST',
          headers,
          body: JSON.stringify(routeFormData)
        });
        const data = await res.json();
        routeId = data.routeId;
      }

      // If mode is Boat, save boat details
      const selectedMode = modes.find(m => m.id === Number(routeFormData.transport_mode_id));
      if (selectedMode?.name?.toLowerCase() === 'boat' && routeId) {
        await fetch('/api/admin/boat-details', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            route_id: routeId,
            waterway: routeFormData.waterway || 'Pantal River',
            origin_river_stop_id: routeFormData.origin_river_stop_id ? Number(routeFormData.origin_river_stop_id) : null,
            destination_river_stop_id: routeFormData.destination_river_stop_id ? Number(routeFormData.destination_river_stop_id) : null,
            operating_status: routeFormData.boat_operating_status || 'ACTIVE',
            notes: routeFormData.boat_notes || ''
          })
        });
      }

      setRouteModalOpen(false);
      loadAdminData();
    } catch (err) {
      alert('Failed to save route: ' + err.message);
    }
  };

  const handleDeleteRoute = async (routeId) => {
    if (!window.confirm('Are you sure you want to delete this route? This will also delete its stops, steps, and fare schedules.')) return;

    try {
      await fetch(`/api/admin/routes/${routeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadAdminData();
    } catch (err) {
      alert('Failed to delete route: ' + err.message);
    }
  };

  // Advisory Handlers
  const handleToggleAdvisory = async (advisoryId) => {
    try {
      await fetch(`/api/admin/advisories/${advisoryId}/toggle-status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadAdminData();
    } catch (err) {
      alert('Failed to toggle advisory status: ' + err.message);
    }
  };

  const openNewAdvisoryModal = () => {
    setEditingAdvisory(null);
    setAdvisoryFormData({
      title: 'HIGH TIDE ADVISORY',
      affected_road: '',
      condition: 'FLOODED',
      description: '',
      status: 'ACTIVE',
      route_ids: []
    });
    setAdvisoryModalOpen(true);
  };

  const openEditAdvisoryModal = (adv) => {
    setEditingAdvisory(adv);
    setAdvisoryFormData({
      title: adv.title,
      affected_road: adv.affected_road,
      condition: adv.condition,
      description: adv.description,
      status: adv.status,
      route_ids: adv.routes ? adv.routes.map(r => r.id) : []
    });
    setAdvisoryModalOpen(true);
  };

  const handleSaveAdvisory = async (e) => {
    e.preventDefault();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    try {
      if (editingAdvisory) {
        await fetch(`/api/admin/advisories/${editingAdvisory.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(advisoryFormData)
        });
      } else {
        await fetch('/api/admin/advisories', {
          method: 'POST',
          headers,
          body: JSON.stringify(advisoryFormData)
        });
      }
      setAdvisoryModalOpen(false);
      loadAdminData();
    } catch (err) {
      alert('Failed to save advisory: ' + err.message);
    }
  };

  const handleDeleteAdvisory = async (id) => {
    if (!window.confirm('Delete this advisory?')) return;
    try {
      await fetch(`/api/admin/advisories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadAdminData();
    } catch (err) {
      alert('Failed to delete advisory.');
    }
  };

  // Feedback Handlers
  const handleToggleFeedbackStatus = async (item) => {
    const newStatus = item.status === 'NEW' ? 'REVIEWED' : 'NEW';
    try {
      await fetch(`/api/admin/feedback/${item.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      loadAdminData();
    } catch (err) {
      alert('Failed to update status.');
    }
  };

  const handleDeleteFeedback = async (id) => {
    if (!window.confirm('Delete this feedback entry?')) return;
    try {
      await fetch(`/api/admin/feedback/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadAdminData();
    } catch (err) {
      alert('Failed to delete feedback.');
    }
  };

  // Location Handlers
  const openNewLocationModal = () => {
    setEditingLocation(null);
    setLocationFormData({
      name: '',
      type: 'LANDMARK',
      barangay: '',
      search_keywords: '',
      address: '',
      lat: '',
      lng: '',
      description: '',
      status: 'ACTIVE'
    });
    setLocationModalOpen(true);
  };

  const openEditLocationModal = (loc) => {
    setEditingLocation(loc);
    setLocationFormData({
      name: loc.name,
      type: loc.type,
      barangay: loc.barangay || '',
      search_keywords: loc.search_keywords || '',
      address: loc.address || '',
      lat: loc.lat,
      lng: loc.lng,
      description: loc.description || '',
      status: loc.status
    });
    setLocationModalOpen(true);
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    const body = {
      ...locationFormData,
      lat: parseFloat(locationFormData.lat),
      lng: parseFloat(locationFormData.lng)
    };
    try {
      if (editingLocation) {
        await fetch(`/api/admin/locations/${editingLocation.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      } else {
        await fetch('/api/admin/locations', { method: 'POST', headers, body: JSON.stringify(body) });
      }
      setLocationModalOpen(false);
      loadAdminData();
    } catch (err) {
      alert('Failed to save location: ' + err.message);
    }
  };

  const handleDeleteLocation = async (id) => {
    if (!window.confirm('Delete this location? This may affect route segments referencing it.')) return;
    try {
      await fetch(`/api/admin/locations/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      loadAdminData();
    } catch (err) {
      alert('Failed to delete location.');
    }
  };

  const handleToggleModeStatus = async (mode) => {
    const newStatus = mode.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await fetch(`/api/admin/transport-modes/${mode.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: mode.name,
          description: mode.description,
          icon: mode.icon,
          status: newStatus
        })
      });
      loadAdminData();
    } catch (err) {
      alert('Failed to update transport mode status.');
    }
  };

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 py-20 flex items-center justify-center">
        <div className="max-w-md w-full mx-4 bg-white p-8 rounded-3xl border border-slate-200 shadow-xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Administrator Access Required</h2>
          <p className="text-sm text-slate-500 mt-2 mb-6">
            You must be logged into an administrator account to access the InerTayo transit management portal.
          </p>
          <button
            onClick={() => openAuth('login')}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-emerald-600 text-white font-semibold rounded-xl text-sm transition-all shadow"
          >
            Sign In as Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/70 pb-24">
      
      {/* Top Header */}
      <div className="bg-slate-900 text-white pt-10 pb-8 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30">
                Staff Portal
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
              InerTayo Transit Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Live route updates, flood advisories, stops, and commuter feedback for Dagupan City.
            </p>
          </div>

          <button
            onClick={loadAdminData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Data
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Metric Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Routes</span>
                <Route className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-3xl font-black text-slate-900">{stats.totalRoutes}</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Active Advisories</span>
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-3xl font-black text-amber-700">{stats.activeAdvisories}</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Stops</span>
                <MapPin className="w-4 h-4 text-cyan-600" />
              </div>
              <div className="text-3xl font-black text-slate-900">{stats.totalStops}</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Pending Feedback</span>
                <MessageSquare className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-3xl font-black text-slate-900">{stats.pendingFeedback}</div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 mb-6 space-x-2 overflow-x-auto">
          {[
            { key: 'routes', label: 'Routes & Travel Times', icon: Route },
            { key: 'advisories', label: 'Flood Advisories & Detours', icon: AlertTriangle },
            { key: 'locations', label: 'Places & Stops', icon: Layers },
            { key: 'modes', label: 'Transport Modes', icon: Ship },
            { key: 'feedback', label: 'Commuter Reports', icon: MessageSquare }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: ROUTES MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === 'routes' && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Registered Transit Routes</h3>
                <p className="text-xs text-slate-500">Configure base time, detour time, and fares.</p>
              </div>
              <button
                onClick={openNewRouteModal}
                className="py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                Add New Route
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Route Name</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4">Base / Detour Time</th>
                    <th className="py-3 px-4">Fare Range</th>
                    <th className="py-3 px-4">Current Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {routes.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {r.route_name}
                      </td>
                      <td className="py-3.5 px-4 font-semibold">{r.mode_name}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800">{r.estimated_time}m</span>
                        {r.detour_time && (
                          <span className="text-amber-700 font-semibold ml-1.5">(detour: {r.detour_time}m)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        ₱{Math.round(r.minimum_fare)} – ₱{Math.round(r.maximum_fare)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          r.status === 'DETOUR_ACTIVE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => navigate(`/routes/${r.id}`)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                          title="View Public Page"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditRouteModal(r)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-slate-100"
                          title="Edit Route"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRoute(r.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100"
                          title="Delete Route"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ADVISORIES & DETOUR MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === 'advisories' && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Flood & High Tide Road Advisories</h3>
                <p className="text-xs text-slate-500">
                  Toggling an advisory instantly recalculates travel times and updates detour routes.
                </p>
              </div>
              <button
                onClick={openNewAdvisoryModal}
                className="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                Publish Road Advisory
              </button>
            </div>

            <div className="space-y-4">
              {advisories.map((adv) => {
                const isActive = adv.status === 'ACTIVE';
                return (
                  <div
                    key={adv.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      isActive ? 'bg-amber-50/70 border-amber-300' : 'bg-slate-50/80 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isActive ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {adv.condition}
                        </span>
                        <h4 className="font-extrabold text-slate-900 text-base">{adv.title}</h4>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleAdvisory(adv.id)}
                          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                            isActive
                              ? 'bg-amber-600 text-white shadow-sm'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {isActive ? 'Active (Click to Deactivate)' : 'Inactive (Click to Activate)'}
                        </button>
                        <button
                          onClick={() => openEditAdvisoryModal(adv)}
                          className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg"
                          title="Edit Advisory"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAdvisory(adv.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                          title="Delete Advisory"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 font-medium">{adv.description}</p>
                    <div className="text-[11px] text-slate-500 mt-2">
                      Affected Road: <span className="font-semibold text-slate-800">{adv.affected_road}</span>
                    </div>

                    {adv.routes && adv.routes.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-amber-200/60 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                          Linked Routes:
                        </span>
                        {adv.routes.map(r => (
                          <span key={r.id} className="px-2 py-0.5 bg-white/90 border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700">
                            {r.route_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: FEEDBACK MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === 'feedback' && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-900">Commuter Feedback & Road Reports</h3>
              <p className="text-xs text-slate-500">Review submissions from travelers and commuters in Dagupan.</p>
            </div>

            <div className="space-y-3">
              {feedbackList.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">No commuter feedback submitted yet.</p>
              ) : (
                feedbackList.map((item) => (
                  <div key={item.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{item.name}</span>
                        <span className="text-xs text-slate-400">({item.email})</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          item.status === 'NEW' ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{item.message}</p>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Received: {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                      <button
                        onClick={() => handleToggleFeedbackStatus(item)}
                        className="py-1.5 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:border-slate-400 transition-colors"
                      >
                        Mark as {item.status === 'NEW' ? 'Reviewed' : 'New'}
                      </button>
                      <button
                        onClick={() => handleDeleteFeedback(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100"
                        title="Delete Feedback"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      {/* ========================================================================= */}
      {/* TAB 4: LOCATIONS / PLACES & STOPS MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'locations' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Places, Streets & River Stops</h3>
              <p className="text-xs text-slate-500">Searchable location registry — streets, barangays, terminals, river docks, and establishments. Adding a location here makes it available in map search and fare routing.</p>
            </div>
            <button
              onClick={openNewLocationModal}
              className="py-2.5 px-4 bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Location
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Barangay</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4">Coordinates</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {locations.length === 0 ? (
                  <tr><td colSpan="7" className="text-center text-slate-400 py-8">No locations configured yet.</td></tr>
                ) : (
                  locations.map((loc) => (
                    <tr key={loc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">{loc.name}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          loc.type === 'RIVER_STOP' ? 'bg-blue-50 text-blue-700' :
                          loc.type === 'TERMINAL' ? 'bg-orange-50 text-orange-700' :
                          loc.type === 'BARANGAY' ? 'bg-teal-50 text-teal-700' :
                          loc.type === 'ROAD' || loc.type === 'STREET' ? 'bg-indigo-50 text-indigo-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{loc.type}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-[130px] truncate">{loc.barangay || '—'}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-[160px] truncate">{loc.address || '—'}</td>
                      <td className="py-3 px-4 font-mono text-slate-400">{Number(loc.lat).toFixed(4)}, {Number(loc.lng).toFixed(4)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          loc.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>{loc.status}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openEditLocationModal(loc)} className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg" title="Edit">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteLocation(loc.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: TRANSPORT MODES MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'modes' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-900">Configured Transport Modes</h3>
            <p className="text-xs text-slate-500">
              Control transit modes (Jeepney, Bus, Tricycle, Boat). Inactive modes will not be displayed to commuters or allow new routes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modes.map((mode) => {
              const isActive = (mode.status || 'ACTIVE') === 'ACTIVE';
              return (
                <div key={mode.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{mode.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{mode.description || 'Transit mode.'}</p>
                    <span className="text-[10px] text-slate-400 font-mono mt-1 block">Icon: {mode.icon}</span>
                  </div>

                  <button
                    onClick={() => handleToggleModeStatus(mode)}
                    className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    {isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>

      {/* ========================================================================= */}
      {/* LOCATION ADD/EDIT MODAL */}
      {/* ========================================================================= */}
      {locationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setLocationModalOpen(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              {editingLocation ? 'Edit Location' : 'Add New Location'}
            </h3>
            <form onSubmit={handleSaveLocation} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Location Name *</label>
                <input type="text" required value={locationFormData.name}
                  onChange={(e) => setLocationFormData({ ...locationFormData, name: e.target.value })}
                  placeholder="e.g. SM Center Dagupan"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type *</label>
                  <select value={locationFormData.type}
                    onChange={(e) => setLocationFormData({ ...locationFormData, type: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                    {LOCATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select value={locationFormData.status}
                    onChange={(e) => setLocationFormData({ ...locationFormData, status: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Barangay</label>
                  <input type="text" value={locationFormData.barangay}
                    onChange={(e) => setLocationFormData({ ...locationFormData, barangay: e.target.value })}
                    placeholder="e.g. Downtown, Herrero-Perez"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Search Keywords / Aliases</label>
                  <input type="text" value={locationFormData.search_keywords}
                    onChange={(e) => setLocationFormData({ ...locationFormData, search_keywords: e.target.value })}
                    placeholder="e.g. SM Dagupan, Herrero, Perez"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Address / Description of Location</label>
                <input type="text" value={locationFormData.address}
                  onChange={(e) => setLocationFormData({ ...locationFormData, address: e.target.value })}
                  placeholder="e.g. AB Fernandez Ave, Dagupan City"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Latitude *</label>
                  <input type="number" step="any" required value={locationFormData.lat}
                    onChange={(e) => setLocationFormData({ ...locationFormData, lat: e.target.value })}
                    placeholder="16.0435"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Longitude *</label>
                  <input type="number" step="any" required value={locationFormData.lng}
                    onChange={(e) => setLocationFormData({ ...locationFormData, lng: e.target.value })}
                    placeholder="120.3340"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Description</label>
                <textarea rows="2" value={locationFormData.description}
                  onChange={(e) => setLocationFormData({ ...locationFormData, description: e.target.value })}
                  placeholder="Optional notes about this location."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setLocationModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl">Cancel</button>
                <button type="submit"
                  className="py-2.5 px-6 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-xl shadow">
                  {editingLocation ? 'Update Location' : 'Add Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ROUTE ADD/EDIT MODAL */}
      {/* ========================================================================= */}
      {routeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setRouteModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-900 mb-4">
              {editingRoute ? 'Edit Transit Route' : 'Add New Transit Route'}
            </h3>

            <form onSubmit={handleSaveRoute} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Route Name</label>
                <input
                  type="text"
                  required
                  value={routeFormData.route_name}
                  onChange={(e) => setRouteFormData({ ...routeFormData, route_name: e.target.value })}
                  placeholder="e.g. Dagupan – Bonuan Beach"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Transport Mode</label>
                  <select
                    value={routeFormData.transport_mode_id}
                    onChange={(e) => setRouteFormData({ ...routeFormData, transport_mode_id: parseInt(e.target.value, 10) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    {modes.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={routeFormData.status}
                    onChange={(e) => setRouteFormData({ ...routeFormData, status: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="CLEAR">CLEAR</option>
                    <option value="DETOUR_ACTIVE">DETOUR_ACTIVE</option>
                    <option value="UNAVAILABLE">UNAVAILABLE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Origin Landmark</label>
                  <input
                    type="text"
                    required
                    value={routeFormData.origin}
                    onChange={(e) => setRouteFormData({ ...routeFormData, origin: e.target.value })}
                    placeholder="Origin"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Destination Landmark</label>
                  <input
                    type="text"
                    required
                    value={routeFormData.destination}
                    onChange={(e) => setRouteFormData({ ...routeFormData, destination: e.target.value })}
                    placeholder="Destination"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Base Time (m)</label>
                  <input
                    type="number"
                    required
                    value={routeFormData.estimated_time}
                    onChange={(e) => setRouteFormData({ ...routeFormData, estimated_time: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Detour Time (m)</label>
                  <input
                    type="number"
                    value={routeFormData.detour_time || ''}
                    onChange={(e) => setRouteFormData({ ...routeFormData, detour_time: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Min Fare (₱)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={routeFormData.minimum_fare}
                    onChange={(e) => setRouteFormData({ ...routeFormData, minimum_fare: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Max Fare (₱)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={routeFormData.maximum_fare}
                    onChange={(e) => setRouteFormData({ ...routeFormData, maximum_fare: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              {modes.find(m => m.id === Number(routeFormData.transport_mode_id))?.name?.toLowerCase() === 'boat' && (
                <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-200/80 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-blue-900 text-xs">
                    <Ship className="w-4 h-4 text-blue-600" />
                    River Boat Route Configuration
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Waterway Name</label>
                      <input
                        type="text"
                        value={routeFormData.waterway}
                        onChange={(e) => setRouteFormData({ ...routeFormData, waterway: e.target.value })}
                        placeholder="e.g. Pantal River"
                        className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Operating Status</label>
                      <select
                        value={routeFormData.boat_operating_status}
                        onChange={(e) => setRouteFormData({ ...routeFormData, boat_operating_status: e.target.value })}
                        className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs"
                      >
                        <option value="ACTIVE">ACTIVE (Normal Service)</option>
                        <option value="SUSPENDED">SUSPENDED (Weather / Water Conditions)</option>
                        <option value="UNAVAILABLE">UNAVAILABLE (Out of Service)</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Origin River Stop / Dock</label>
                      <select
                        value={routeFormData.origin_river_stop_id}
                        onChange={(e) => setRouteFormData({ ...routeFormData, origin_river_stop_id: e.target.value })}
                        className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs"
                      >
                        <option value="">-- Select Dock / Stop --</option>
                        {locations.filter(l => l.type === 'RIVER_STOP' || l.type === 'TERMINAL').map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Destination River Stop / Dock</label>
                      <select
                        value={routeFormData.destination_river_stop_id}
                        onChange={(e) => setRouteFormData({ ...routeFormData, destination_river_stop_id: e.target.value })}
                        className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs"
                      >
                        <option value="">-- Select Dock / Stop --</option>
                        {locations.filter(l => l.type === 'RIVER_STOP' || l.type === 'TERMINAL').map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Boat Operational Notes</label>
                    <input
                      type="text"
                      value={routeFormData.boat_notes}
                      onChange={(e) => setRouteFormData({ ...routeFormData, boat_notes: e.target.value })}
                      placeholder="e.g. Life vests mandatory. Service operates dawn to dusk."
                      className="w-full p-2 bg-white border border-blue-200 rounded-xl text-xs"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows="2"
                  value={routeFormData.description}
                  onChange={(e) => setRouteFormData({ ...routeFormData, description: e.target.value })}
                  placeholder="Route details and corridor description"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                ></textarea>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Route Geometry (GeoJSON LineString, optional)
                </label>
                <textarea
                  rows="2"
                  value={routeFormData.geometry}
                  onChange={(e) => setRouteFormData({ ...routeFormData, geometry: e.target.value })}
                  placeholder='{"type":"LineString","coordinates":[[120.334,16.043],[...]]}'
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                ></textarea>
                <span className="text-[10px] text-slate-400">
                  Optional GeoJSON coordinates [lon, lat]. If left blank, geometry is automatically derived from designated stops.
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRouteModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 bg-slate-900 hover:bg-emerald-600 text-white font-bold rounded-xl shadow"
                >
                  Save Route
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ADVISORY ADD/EDIT MODAL */}
      {/* ========================================================================= */}
      {advisoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setAdvisoryModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-900 mb-4">
              {editingAdvisory ? 'Edit Road Advisory' : 'Publish New Road Advisory'}
            </h3>

            <form onSubmit={handleSaveAdvisory} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Advisory Title</label>
                <input
                  type="text"
                  required
                  value={advisoryFormData.title}
                  onChange={(e) => setAdvisoryFormData({ ...advisoryFormData, title: e.target.value })}
                  placeholder="e.g. HIGH TIDE ADVISORY"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Affected Road</label>
                  <input
                    type="text"
                    required
                    value={advisoryFormData.affected_road}
                    onChange={(e) => setAdvisoryFormData({ ...advisoryFormData, affected_road: e.target.value })}
                    placeholder="e.g. AB Fernandez Ave"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Condition</label>
                  <select
                    value={advisoryFormData.condition}
                    onChange={(e) => setAdvisoryFormData({ ...advisoryFormData, condition: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="FLOODED">FLOODED</option>
                    <option value="HIGH_TIDE">HIGH_TIDE</option>
                    <option value="ROAD_CLOSURE">ROAD_CLOSURE</option>
                    <option value="DETOUR">DETOUR</option>
                    <option value="CLEAR">CLEAR</option>
                    <option value="ROUTE_CLEAR">ROUTE_CLEAR</option>
                    <option value="RIVER_TRANSPORT_SUSPENDED">RIVER_TRANSPORT_SUSPENDED</option>
                    <option value="RIVER_ADVISORY">RIVER_ADVISORY</option>
                    <option value="ROUTE_UNAVAILABLE">ROUTE_UNAVAILABLE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Advisory Description</label>
                <textarea
                  rows="3"
                  required
                  value={advisoryFormData.description}
                  onChange={(e) => setAdvisoryFormData({ ...advisoryFormData, description: e.target.value })}
                  placeholder="e.g. Roadway flooded due to high tide. Routes reflect this advisory."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                ></textarea>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-2">Affected Routes (Select to Link)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {routes.map((r) => {
                    const checked = advisoryFormData.route_ids.includes(r.id);
                    return (
                      <label key={r.id} className="flex items-center gap-2 p-1.5 hover:bg-white rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAdvisoryFormData({
                                ...advisoryFormData,
                                route_ids: [...advisoryFormData.route_ids, r.id]
                              });
                            } else {
                              setAdvisoryFormData({
                                ...advisoryFormData,
                                route_ids: advisoryFormData.route_ids.filter(id => id !== r.id)
                              });
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-800 font-medium">{r.route_name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAdvisoryModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow"
                >
                  Save Advisory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
