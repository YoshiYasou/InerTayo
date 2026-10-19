import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAuth } from '../context/AuthContext';
import RouteGeometryEditor from '../components/RouteGeometryEditor';
import RouteMap from '../components/RouteMap';
import LocationPinPicker from '../components/LocationPinPicker';
import LocationAutocomplete from '../components/LocationAutocomplete';
import ConfirmDialog from '../components/ConfirmDialog';
import { 
  ShieldCheck, 
  Route, 
  Compass,
  AlertTriangle, 
  MessageSquare, 
  DollarSign, 
  MapPin, 
  Plus, 
  Trash2, 
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Edit, 
  Check, 
  X, 
  ToggleLeft, 
  ToggleRight,
  RefreshCw,
  Eye,
  Bookmark,
  Activity,
  LogIn,
  LogOut,
  Layers,
  Ship,
  FileSpreadsheet,
  Search,
  GraduationCap,
  Landmark,
  ChevronDown,
  Building2,
  Signpost,
  Bus
} from 'lucide-react';

const LOCATION_TYPE_ICONS = {
  LANDMARK: Landmark,
  ESTABLISHMENT: Building2,
  INTERSECTION: Signpost,
  TERMINAL: Bus,
};

function hasPreviewableGeometry(value) {
  try {
    const geometry = typeof value === 'string' ? JSON.parse(value) : value;
    return geometry?.type === 'LineString' && Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length >= 2 && geometry.coordinates.every((point) =>
        Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
        point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90
      );
  } catch {
    return false;
  }
}

function matchesPathSegments(savedSegments = [], editedSegments = []) {
  if (!Array.isArray(savedSegments) || savedSegments.length !== editedSegments.length) return false;
  return editedSegments.every((editedSegment, index) => {
    const savedSegment = savedSegments[index];
    if (savedSegment?.mode !== editedSegment.mode) return false;
    try {
      const savedGeometry = typeof savedSegment.geometry === 'string'
        ? JSON.parse(savedSegment.geometry)
        : savedSegment.geometry;
      const editedGeometry = typeof editedSegment.geometry === 'string'
        ? JSON.parse(editedSegment.geometry)
        : editedSegment.geometry;
      return JSON.stringify(savedGeometry) === JSON.stringify(editedGeometry);
    } catch {
      return false;
    }
  });
}

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

function normalizeDetourSteps(steps, instructions = '') {
  if (Array.isArray(steps) && steps.length > 0) {
    return steps.map((step) => ({
      mode: step.mode || 'Transit',
      instruction: step.instruction || '',
      location_info: step.location_info || ''
    }));
  }
  return String(instructions || '').split(/\r?\n/).map((instruction) => instruction.trim()).filter(Boolean)
    .map((instruction) => ({ mode: 'Transit', instruction, location_info: '' }));
}

function detourInstructionText(steps = []) {
  return steps.map((step) => step.instruction?.trim()).filter(Boolean).join('\n');
}

function getRouteModeColor(modeName = '') {
  const normalized = String(modeName || '').toLowerCase();
  if (normalized.includes('jeep')) return '#ec4899';
  if (normalized.includes('modern') || normalized.includes('aircon') || normalized.includes('puv')) return '#f97316';
  if (normalized.includes('provincial') || normalized.includes('intercity') || normalized.includes('regional')) return '#8b5cf6';
  if (normalized.includes('bus')) return '#10b981';
  if (normalized.includes('tricycle')) return '#06b6d4';
  if (normalized.includes('walk')) return '#2563eb';
  if (normalized.includes('boat')) return '#2563eb';
  return '#64748b';
}

function DetourStepsEditor({ steps = [], onChange, modes = [] }) {
  const updateStep = (stepIndex, updates) => {
    onChange(steps.map((step, index) => index === stepIndex ? { ...step, ...updates } : step));
  };

  const moveStep = (stepIndex, offset) => {
    const nextSteps = [...steps];
    const targetIndex = stepIndex + offset;
    [nextSteps[stepIndex], nextSteps[targetIndex]] = [nextSteps[targetIndex], nextSteps[stepIndex]];
    onChange(nextSteps);
  };

  const availableModes = [...new Set(['Walk', ...modes.map((mode) => mode.name), ...steps.map((step) => step.mode).filter(Boolean)])];

  return (
    <section className="space-y-3" aria-label="Flood detour steps and directions">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h5 className="text-sm font-bold text-slate-800">Detour steps & directions</h5>
          <p className="mt-0.5 text-xs text-slate-500">Shown instead of the normal steps when this detour is active.</p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...steps, { mode: 'Walk', instruction: '', location_info: '' }])}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add step
        </button>
      </div>
      {steps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500">
          No detour directions yet. Add a step to describe the flooded-route detour.
        </p>
      ) : steps.map((step, index) => (
        <div key={step.id || `detour-step-${index}`} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-2 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-700 text-xs font-bold text-white shadow-sm">
            {index + 1}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <select
                aria-label={`Detour step ${index + 1} mode`}
                value={step.mode || 'Walk'}
                onChange={(event) => updateStep(index, { mode: event.target.value })}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs"
              >
                {availableModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
              <input
                type="text"
                aria-label={`Detour step ${index + 1} instruction`}
                value={step.instruction || ''}
                onChange={(event) => updateStep(index, { instruction: event.target.value })}
                placeholder="e.g. Board the jeepney toward Calasiao via the bypass"
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
              />
            </div>
            <input
              type="text"
              aria-label={`Detour step ${index + 1} details`}
              value={step.location_info || ''}
              onChange={(event) => updateStep(index, { location_info: event.target.value })}
              placeholder="Optional location details"
              className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              title="Move detour step up"
              aria-label={`Move detour step ${index + 1} up`}
              disabled={index === 0}
              onClick={() => moveStep(index, -1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Move detour step down"
              aria-label={`Move detour step ${index + 1} down`}
              disabled={index === steps.length - 1}
              onClick={() => moveStep(index, 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Remove detour step"
              aria-label={`Remove detour step ${index + 1}`}
              onClick={() => onChange(steps.filter((_, stepIndex) => stepIndex !== index))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 transition hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

export default function Admin() {
  const { navigate } = useRouter();
  const { user, token, isAdmin, openAuth } = useAuth();
  const [adminDialog, setAdminDialog] = useState(null);
  const adminDialogResolver = useRef(null);

  const requestAdminDialog = (dialog) => new Promise((resolve) => {
    adminDialogResolver.current = resolve;
    setAdminDialog(dialog);
  });

  const confirmAdminAction = (title, message, confirmLabel = 'Continue', tone = 'danger') => (
    requestAdminDialog({ title, message, confirmLabel, tone, showCancel: true })
  );

  const showAdminNotice = (title, message) => (
    requestAdminDialog({ title, message, confirmLabel: 'OK', tone: 'danger', showCancel: false })
  );

  const finishAdminDialog = (confirmed) => {
    adminDialogResolver.current?.(confirmed);
    adminDialogResolver.current = null;
    setAdminDialog(null);
  };

  const [activeTab, setActiveTab] = useState('routes');
  const [stats, setStats] = useState(null);
  const [savedRouteInsights, setSavedRouteInsights] = useState({ total_saved: 0, routes: [] });
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);
  const [activityLogsError, setActivityLogsError] = useState('');
  const [routes, setRoutes] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [modes, setModes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [schools, setSchools] = useState([]);
  const [landmarks, setLandmarks] = useState([]);
  const [routeStops, setRouteStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminSearch, setAdminSearch] = useState('');

  // Authoritative Fare Matrix States
  const [fareTricycles, setFareTricycles] = useState([]);
  const [fareRoutes, setFareRoutes] = useState([]);
  const [fareBoats, setFareBoats] = useState([]);
  const [fareCategory, setFareCategory] = useState('tricycle'); // 'tricycle', 'jeepney', 'modern_puv', 'boat'
  const [fareSearch, setFareSearch] = useState('');

  // Authoritative Fare Modal States
  const [fareModalOpen, setFareModalOpen] = useState(false);
  const [editingFare, setEditingFare] = useState(null);
  const [fareModalCategory, setFareModalCategory] = useState('tricycle');
  const [fareFormData, setFareFormData] = useState({
    zone: 'Zone 1',
    barangay: '',
    landmarks: '',
    solo_fare_min: 40,
    solo_fare_max: 50,
    fare_per_2pax_min: 20,
    fare_per_2pax_max: 25,
    fare_per_3pax_min: 15,
    fare_per_3pax_max: 20,
    transport_mode: 'jeepney',
    route_name: '',
    terminal: '',
    waypoints: '',
    distance_km: '',
    regular_fare_min: 15,
    regular_fare_max: 20,
    discounted_fare_min: 12,
    discounted_fare_max: 16,
    service_type: '',
    dock_location: '',
    destinations: '',
    fare_rate_note: ''
  });

  // Form Modal States
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [selectedWebMapRouteId, setSelectedWebMapRouteId] = useState(null);
  const [webMapLayers, setWebMapLayers] = useState({
    schools: false,
    locations: true,
    landmarks: false
  });
  const [routeMapEditorTab, setRouteMapEditorTab] = useState('normal');
  const [routeSteps, setRouteSteps] = useState([]);
  const [originalRouteSteps, setOriginalRouteSteps] = useState([]);
  const [routePathSegments, setRoutePathSegments] = useState([]);
  const [activePathSegmentIndex, setActivePathSegmentIndex] = useState(0);
  const routePathEditorRef = useRef(null);
  const [availableRouteDraft, setAvailableRouteDraft] = useState(null);
  const [routePreviewOpen, setRoutePreviewOpen] = useState(false);
  const [geometryValidation, setGeometryValidation] = useState(null);
  const [routeValidationWarnings, setRouteValidationWarnings] = useState([]);
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
    operating_status: 'ACTIVE',
    service_notes: '',
    geometry: '',
    walking_geometry: '',
    allow_unverified_map_geometry: false,
    waterway: '',
    origin_river_stop_id: '',
    destination_river_stop_id: '',
    boat_operating_status: 'ACTIVE',
    boat_notes: '',
    advisory_detours: {}
  });

  const [advisoryModalOpen, setAdvisoryModalOpen] = useState(false);
  const [editingAdvisory, setEditingAdvisory] = useState(null);
  const [advisorySaveError, setAdvisorySaveError] = useState('');
  const [advisoryFormData, setAdvisoryFormData] = useState({
    title: '',
    affected_road: '',
    condition: 'FLOODED',
    description: '',
    status: 'ACTIVE',
    route_ids: [],
    route_detours: {}
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
  const [schoolModalOpen, setSchoolModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);
  const [schoolFormData, setSchoolFormData] = useState({
    name: '', type: 'SCHOOL', aliases: '', address: '', barangay: '',
    latitude: '', longitude: '', entrance_latitude: '', entrance_longitude: '',
    nearby_stops: '', verified: false, active: true
  });
  const [landmarkModalOpen, setLandmarkModalOpen] = useState(false);
  const [editingLandmark, setEditingLandmark] = useState(null);
  const [landmarkFormData, setLandmarkFormData] = useState({ name: '', type: 'MALL', latitude: '', longitude: '' });
  const [stopModalOpen, setStopModalOpen] = useState(false);
  const [editingStop, setEditingStop] = useState(null);
  const [stopFormData, setStopFormData] = useState({
    route_id: '',
    stop_name: '',
    stop_order: 1,
    description: '',
    vehicle_type: '',
    is_transfer_point: false,
    latitude: '',
    longitude: '',
  });
  const selectedStopRoute = routes.find((route) => String(route.id) === String(stopFormData.route_id));
  const LOCATION_TYPES = ['LANDMARK', 'ESTABLISHMENT', 'INTERSECTION', 'TERMINAL'];

  const searchTerm = adminSearch.trim().toLowerCase();
  const matchesAdminSearch = (values) => !searchTerm || values.some(value =>
    String(value ?? '').toLowerCase().includes(searchTerm)
  );
  const searchedRoutes = routes.filter(route => matchesAdminSearch([
    route.route_name, route.mode_name, route.origin, route.destination, route.status, route.description
  ]));
  const selectedWebMapRoute = routes.find((route) => String(route.id) === String(selectedWebMapRouteId)) || null;
  const webMapRoutes = selectedWebMapRoute ? [selectedWebMapRoute] : routes;
  const searchedSavedRouteInsights = savedRouteInsights.routes.filter(route => matchesAdminSearch([
    route.route_name, route.mode_name, route.origin, route.destination
  ]));
  const searchedAdvisories = advisories.filter(advisory => matchesAdminSearch([
    advisory.title, advisory.affected_road, advisory.condition, advisory.description, advisory.status,
    ...(advisory.routes || []).map(route => route.route_name)
  ]));
  const searchedFeedback = feedbackList.filter(item => matchesAdminSearch([
    item.name, item.email, item.status, item.message
  ]));
  const searchedActivityLogs = activityLogs.filter(log => matchesAdminSearch([
    log.username, log.role, log.action, log.route_name, log.route_id
  ]));
  const searchedLocations = locations.filter(location => matchesAdminSearch([
    location.name, location.type, location.barangay, location.address, location.status,
    location.search_keywords, location.description
  ]));
  const searchedSchools = schools.filter(school => matchesAdminSearch([
    school.name, school.type, school.aliases, school.address, school.barangay,
    ...(Array.isArray(school.nearby_stops) ? school.nearby_stops : [])
  ]));
  const searchedLandmarks = landmarks.filter(landmark => matchesAdminSearch([
    landmark.name, landmark.type, landmark.latitude, landmark.longitude
  ]));
  const searchedRouteStops = routeStops.filter(stop => matchesAdminSearch([
    stop.stop_name,
    stop.description,
    routes.find(route => String(route.id) === String(stop.route_id))?.route_name,
  ]));
  const routeStopGroupsById = searchedRouteStops.reduce((groups, stop) => {
    const routeKey = String(stop.route_id ?? 'unassigned');
    const route = routes.find(candidate => String(candidate.id) === routeKey);
    if (!groups.has(routeKey)) {
      groups.set(routeKey, {
        route,
        routeId: stop.route_id,
        stops: [],
      });
    }
    groups.get(routeKey).stops.push(stop);
    return groups;
  }, new Map());
  const searchedRouteStopGroups = [
    ...routes.map(route => routeStopGroupsById.get(String(route.id))).filter(Boolean),
    ...[...routeStopGroupsById.entries()]
      .filter(([routeId]) => !routes.some(route => String(route.id) === routeId))
      .map(([, group]) => group),
  ];
  searchedRouteStopGroups.forEach(group => {
    group.stops.sort((first, second) => Number(first.stop_order) - Number(second.stop_order));
  });
  const linkedRouteAdvisories = editingRoute ? advisories.flatMap((advisory) => {
    if (!['FLOODED', 'HIGH_TIDE', 'DETOUR'].includes(advisory.condition)) return [];
    const routeConfig = advisory.routes?.find((route) => route.id === editingRoute.id);
    return routeConfig ? [{ ...advisory, routeConfig }] : [];
  }) : [];
  const selectedPreviewAdvisory = routeMapEditorTab.startsWith('detour-')
    ? linkedRouteAdvisories.find((advisory) => `detour-${advisory.id}` === routeMapEditorTab)
    : null;
  const selectedPreviewDetour = selectedPreviewAdvisory
    ? routeFormData.advisory_detours?.[selectedPreviewAdvisory.id] || selectedPreviewAdvisory.routeConfig
    : null;
  const passengerPreviewGeometry = selectedPreviewDetour
    ? selectedPreviewDetour.detour_geometry
    : routeFormData.geometry;
  const passengerPreviewSteps = selectedPreviewDetour
    ? normalizeDetourSteps(selectedPreviewDetour.detour_steps, selectedPreviewDetour.detour_instructions)
    : routeSteps.filter((step) => step.instruction?.trim());
  const searchedModes = modes.filter(mode => matchesAdminSearch([
    mode.name, mode.description, mode.icon, mode.status
  ]));
  const renderAdminSearch = (placeholder) => (
    <div className="relative w-full sm:max-w-xs">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={adminSearch}
        onChange={(event) => setAdminSearch(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder.replace('...', '')}
        className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
      />
    </div>
  );

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadAdminData();
    loadAdminActivity();
  }, [isAdmin]);

  const loadAdminActivity = async () => {
    setActivityLogsLoading(true);
    setActivityLogsError('');
    try {
      const response = await fetch('/api/admin/audit-logs?limit=200', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to retrieve audit logs.');
      if (!Array.isArray(data)) throw new Error('The audit log response was invalid.');
      setActivityLogs(data);
    } catch (err) {
      console.error('Error loading user activity:', err);
      setActivityLogsError(err.message || 'Failed to retrieve audit logs.');
    } finally {
      setActivityLogsLoading(false);
    }
  };

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      const [statsRes, savedRouteInsightsRes, routesRes, advRes, feedRes, modesRes, locsRes, schoolsRes, landmarksRes, stopsRes, tricyclesRes, routeFaresRes, boatFaresRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }).then(r => r.json()),
        fetch('/api/admin/saved-routes', { headers }).then(r => r.json()),
        fetch('/api/routes').then(r => r.json()),
        fetch('/api/admin/advisories', { headers }).then(r => r.json()),
        fetch('/api/admin/feedback', { headers }).then(r => r.json()),
        fetch('/api/transport-modes').then(r => r.json()),
        fetch('/api/admin/locations', { headers }).then(r => r.json()),
        fetch('/api/admin/schools', { headers }).then(r => r.json()),
        fetch('/api/landmarks').then(r => r.json()),
        fetch('/api/admin/stops', { headers }).then(r => r.json()),
        fetch('/api/fares/tricycles').then(r => r.json()).catch(() => []),
        fetch('/api/fares/routes').then(r => r.json()).catch(() => []),
        fetch('/api/fares/boats').then(r => r.json()).catch(() => [])
      ]);

      let stopRecords = stopsRes;
      if (!Array.isArray(stopRecords) && Array.isArray(routesRes)) {
        const routeStopLists = await Promise.all(routesRes.map(async (route) => {
          const response = await fetch(`/api/admin/routes/${route.id}/stops`, { headers });
          return response.ok ? response.json() : [];
        }));
        stopRecords = routeStopLists.flat();
      }

      setStats(statsRes);
      setSavedRouteInsights(Array.isArray(savedRouteInsightsRes.routes)
        ? savedRouteInsightsRes
        : { total_saved: 0, routes: [] });
      setRoutes(routesRes);
      setAdvisories(advRes);
      setFeedbackList(feedRes);
      setModes(modesRes);
      setLocations(Array.isArray(locsRes) ? locsRes : (locsRes.locations || []));
      setSchools(Array.isArray(schoolsRes) ? schoolsRes : []);
      setLandmarks(Array.isArray(landmarksRes) ? landmarksRes : []);
      setRouteStops(Array.isArray(stopRecords) ? stopRecords : []);
      setFareTricycles(Array.isArray(tricyclesRes) ? tricyclesRes : []);
      setFareRoutes(Array.isArray(routeFaresRes) ? routeFaresRes : []);
      setFareBoats(Array.isArray(boatFaresRes) ? boatFaresRes : []);
    } catch (err) {
      console.error('Error loading admin portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Route Handlers
  const checkRouteDraft = async (draftKey) => {
    setAvailableRouteDraft(null);
    try {
      const response = await fetch(`/api/admin/route-drafts/${draftKey}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setAvailableRouteDraft(await response.json());
    } catch (error) {
      console.error('Could not check for a saved route draft:', error);
    }
  };

  const openNewRouteModal = () => {
    setEditingRoute(null);
    setRouteMapEditorTab('normal');
    setRouteSteps([]);
    setOriginalRouteSteps([]);
    setRoutePathSegments([{ mode: modes[0]?.name || 'Jeepney', geometry: '' }]);
    setActivePathSegmentIndex(0);
    setRoutePreviewOpen(false);
    setGeometryValidation(null);
    setRouteValidationWarnings([]);
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
      operating_status: 'ACTIVE',
      service_notes: '',
      geometry: '',
      walking_geometry: '',
      allow_unverified_map_geometry: false,
      waterway: 'Pantal River',
      origin_river_stop_id: '',
      destination_river_stop_id: '',
      boat_operating_status: 'ACTIVE',
      boat_notes: '',
      advisory_detours: {}
    });
    setRouteModalOpen(true);
    checkRouteDraft('new');
  };

  const openEditRouteModal = async (route) => {
    setEditingRoute(route);
    setRouteMapEditorTab('normal');
    setRouteSteps([]);
    setOriginalRouteSteps([]);
    setRoutePreviewOpen(false);
    setGeometryValidation(null);
    setRouteValidationWarnings([]);
    let routeDetails = route;
    try {
      const detailResponse = await fetch(`/api/routes/${route.id}`);
      if (detailResponse.ok) routeDetails = await detailResponse.json();
    } catch (error) {
      console.error('Could not load route path legs:', error);
    }
    const savedPathSegments = Array.isArray(routeDetails.path_segments) ? routeDetails.path_segments : [];
    const pathSegments = savedPathSegments.length
      ? savedPathSegments.map((segment) => ({
        ...segment,
        geometry: typeof segment.geometry === 'object' ? JSON.stringify(segment.geometry) : (segment.geometry || '')
      }))
      : [
        {
          mode: modes.find((mode) => mode.id === route.transport_mode_id)?.name || 'Jeepney',
          geometry: typeof (routeDetails.geometry_original || route.geometry) === 'object'
            ? JSON.stringify(routeDetails.geometry_original || route.geometry)
            : (routeDetails.geometry_original || route.geometry || '')
        },
        ...(routeDetails.walking_geometry ? [{
          mode: 'Walk',
          geometry: typeof routeDetails.walking_geometry === 'object'
            ? JSON.stringify(routeDetails.walking_geometry)
            : routeDetails.walking_geometry
        }] : [])
      ];
    setRoutePathSegments(pathSegments);
    setActivePathSegmentIndex(0);
    const advisoryDetours = Object.fromEntries(advisories.flatMap((advisory) => {
      if (!['FLOODED', 'HIGH_TIDE', 'DETOUR'].includes(advisory.condition)) return [];
      const routeConfig = advisory.routes?.find((item) => item.id === route.id);
      if (!routeConfig) return [];
      return [[advisory.id, {
        detour_enabled: routeConfig.detour_enabled ?? null,
        flooded_geometry: routeConfig.flooded_geometry || '',
        detour_geometry: routeConfig.detour_geometry || '',
        detour_steps: normalizeDetourSteps(routeConfig.detour_steps, routeConfig.detour_instructions),
        detour_instructions: routeConfig.detour_instructions || '',
        detour_time: routeConfig.detour_time || route.detour_time || '',
        dirty: false
      }]];
    }));
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

    try {
      const stepsResponse = await fetch(`/api/admin/routes/${route.id}/steps`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!stepsResponse.ok) throw new Error('Could not load route steps.');
      const steps = await stepsResponse.json();
      setRouteSteps(Array.isArray(steps) ? steps : []);
      setOriginalRouteSteps(Array.isArray(steps) ? steps : []);
    } catch (stepsError) {
      console.error('Error loading route steps:', stepsError);
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
      operating_status: route.operating_status || route.boat_operating_status || 'ACTIVE',
      service_notes: route.service_notes || route.notes || '',
      geometry: typeof (routeDetails.geometry_original || route.geometry) === 'object'
        ? JSON.stringify(routeDetails.geometry_original || route.geometry)
        : (routeDetails.geometry_original || route.geometry || ''),
      walking_geometry: typeof route.walking_geometry === 'object' ? JSON.stringify(route.walking_geometry) : (route.walking_geometry || ''),
      allow_unverified_map_geometry: route.allow_unverified_map_geometry === true,
      waterway,
      origin_river_stop_id,
      destination_river_stop_id,
      boat_operating_status,
      boat_notes,
      advisory_detours: advisoryDetours
    });
    setRouteModalOpen(true);
    checkRouteDraft(`route-${route.id}`);
  };

  const saveRouteSteps = async (routeId) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    const currentIds = new Set(routeSteps.filter((step) => step.id).map((step) => step.id));
    const removedSteps = originalRouteSteps.filter((step) => !currentIds.has(step.id));

    for (const step of removedSteps) {
      const response = await fetch(`/api/admin/steps/${step.id}`, { method: 'DELETE', headers });
      if (!response.ok) throw new Error('Could not remove a route step.');
    }

    for (const [index, step] of routeSteps.entries()) {
      const payload = {
        route_id: routeId,
        step_number: index + 1,
        mode: step.mode || 'Walk',
        instruction: step.instruction,
        location_info: step.location_info || '',
      };
      const response = await fetch(step.id ? `/api/admin/steps/${step.id}` : '/api/admin/steps', {
        method: step.id ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not save route steps.');
      }
    }
  };

  const routeDraftKey = editingRoute ? `route-${editingRoute.id}` : 'new';

  const updateRouteAdvisoryDetour = (advisoryId, updates) => {
    setRouteFormData((current) => ({
      ...current,
      advisory_detours: {
        ...current.advisory_detours,
        [advisoryId]: {
          ...current.advisory_detours?.[advisoryId],
          ...updates,
          dirty: true
        }
      }
    }));
  };

  const saveRouteDraft = async () => {
    try {
      const response = await fetch(`/api/admin/route-drafts/${routeDraftKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          form_data: { ...routeFormData, path_segments: routePathSegments },
          route_steps: routeSteps,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save this draft.');
      setAvailableRouteDraft({
        form_data: { ...routeFormData, path_segments: routePathSegments },
        route_steps: routeSteps,
      });
    } catch (error) {
      await showAdminNotice('Draft could not be saved', `Failed to save draft: ${error.message}`);
    }
  };

  const restoreRouteDraft = () => {
    if (!availableRouteDraft?.form_data) return;
    const { path_segments, ...formData } = availableRouteDraft.form_data;
    setRouteFormData((current) => ({ ...current, ...formData }));
    setRouteSteps(Array.isArray(availableRouteDraft.route_steps) ? availableRouteDraft.route_steps : []);
    if (Array.isArray(path_segments) && path_segments.length) {
      setRoutePathSegments(path_segments);
      setActivePathSegmentIndex(0);
    }
    setAvailableRouteDraft(null);
  };

  const updateRoutePathSegment = (index, updates) => {
    const nextSegments = routePathSegments.map((segment, segmentIndex) =>
      segmentIndex === index ? { ...segment, ...updates } : segment
    );
    setRoutePathSegments(nextSegments);
    if (index === 0 && updates.geometry !== undefined) {
      setRouteFormData((current) => ({ ...current, geometry: updates.geometry }));
    }
    if (index === 0 && updates.mode && updates.mode !== 'Walk') {
      const selectedMode = modes.find((mode) => mode.name === updates.mode);
      if (selectedMode) setRouteFormData((current) => ({ ...current, transport_mode_id: selectedMode.id }));
    }
  };

  const handleRouteStopSelected = (stop, endpoint, segmentIndex) => {
    const isRouteOrigin = endpoint === 'start' && segmentIndex === 0;
    const isRouteDestination = endpoint === 'end' && segmentIndex === routePathSegments.length - 1;
    if (!isRouteOrigin && !isRouteDestination) return;
    const field = isRouteOrigin ? 'origin' : 'destination';
    setRouteFormData((current) => ({ ...current, [field]: stop.stop_name }));
  };

  const addRoutePathSegment = () => {
    let geometry = '';
    const lastGeometry = routePathSegments.at(-1)?.geometry;
    try {
      const parsed = typeof lastGeometry === 'string' ? JSON.parse(lastGeometry) : lastGeometry;
      const lastPoint = parsed?.type === 'LineString' ? parsed.coordinates?.at(-1) : null;
      if (Array.isArray(lastPoint)) geometry = JSON.stringify({ type: 'LineString', coordinates: [lastPoint] });
    } catch {}
    setRoutePathSegments((segments) => [...segments, { mode: modes[0]?.name || 'Jeepney', geometry }]);
    setActivePathSegmentIndex(routePathSegments.length);
  };

  const moveRoutePathSegment = (index, offset) => {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= routePathSegments.length) return;
    const nextSegments = [...routePathSegments];
    [nextSegments[index], nextSegments[targetIndex]] = [nextSegments[targetIndex], nextSegments[index]];
    setRoutePathSegments(nextSegments);
    setActivePathSegmentIndex(targetIndex);
    const primaryMode = modes.find((mode) => mode.name === nextSegments.find((segment) => segment.mode !== 'Walk')?.mode);
    setRouteFormData((current) => ({
      ...current,
      geometry: nextSegments[0].geometry,
      ...(primaryMode ? { transport_mode_id: primaryMode.id } : {})
    }));
  };

  const removeRoutePathSegment = (index) => {
    if (routePathSegments.length <= 1) return;
    const nextSegments = routePathSegments.filter((_, segmentIndex) => segmentIndex !== index);
    setRoutePathSegments(nextSegments);
    const nextIndex = Math.min(index, nextSegments.length - 1);
    setActivePathSegmentIndex(nextIndex);
    const primaryMode = modes.find((mode) => mode.name === nextSegments.find((segment) => segment.mode !== 'Walk')?.mode);
    setRouteFormData((current) => ({
      ...current,
      geometry: nextSegments[0].geometry,
      ...(primaryMode ? { transport_mode_id: primaryMode.id } : {})
    }));
  };

  const discardRouteChanges = async () => {
    if (!await confirmAdminAction('Discard route changes?', 'Discard the current route changes and any saved draft?', 'Discard changes')) return;
    try {
      const response = await fetch(`/api/admin/route-drafts/${routeDraftKey}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not discard the saved draft.');
      setAvailableRouteDraft(null);
      setRouteModalOpen(false);
    } catch (error) {
      await showAdminNotice('Changes could not be discarded', `Failed to discard changes: ${error.message}`);
    }
  };

  const validateRouteBeforePublish = async () => {
    const incompleteLegIndex = routePathSegments.findIndex((segment) =>
      !segment.mode?.trim() || !hasPreviewableGeometry(segment.geometry)
    );
    if (incompleteLegIndex >= 0) {
      const errors = [`Complete route leg ${incompleteLegIndex + 1} with a mode and at least two valid map points.`];
      setGeometryValidation({ errors });
      setRouteValidationWarnings([]);
      return { errors, warnings: [] };
    }

    const modeName = modes.find((mode) => mode.id === Number(routeFormData.transport_mode_id))?.name || '';
    const response = await fetch('/api/admin/routes/validate-geometry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ geometry: routeFormData.geometry, mode: modeName.toLowerCase() === 'boat' ? 'boat' : 'road' }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Route geometry validation failed.');
    const warnings = [...(result.warnings || [])];
    if (!routeFormData.route_name.trim()) warnings.push('Route name is missing.');
    if (!routeFormData.origin.trim() || !routeFormData.destination.trim()) warnings.push('Origin or destination is missing.');
    if (!routeFormData.description.trim()) warnings.push('Route description is empty.');
    if (!editingRoute || !routeStops.some((stop) => stop.route_id === editingRoute.id)) {
      warnings.push('No designated stops are linked to this route. Configure stops in the existing stop-management section.');
    }
    if (!routeSteps.length) warnings.push('No passenger directions are configured.');
    setGeometryValidation(result);
    setRouteValidationWarnings(warnings);
    return { errors: result.errors || [], warnings };
  };

  const handleSaveRoute = async (e) => {
    e.preventDefault();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    try {
      const validation = await validateRouteBeforePublish();
      if (validation.errors.length) {
        await showAdminNotice('Route cannot be published', `Route cannot be published until geometry errors are fixed:\n${validation.errors.join('\n')}`);
        return;
      }
      const warningText = validation.warnings.length
        ? `\n\nReview these warnings before publishing:\n- ${validation.warnings.join('\n- ')}`
        : '';
      const invalidDetour = linkedRouteAdvisories.find((advisory) => {
        const config = routeFormData.advisory_detours?.[advisory.id];
        return config?.dirty && config.detour_enabled === true &&
          (!hasPreviewableGeometry(config.flooded_geometry) || !hasPreviewableGeometry(config.detour_geometry) ||
            !config.detour_steps?.length || config.detour_steps.some((step) => !step.instruction?.trim()));
      });
      if (invalidDetour) {
        await showAdminNotice('Complete the detour first', `Complete both map paths and every detour step for ${invalidDetour.title} before saving.`);
        return;
      }

      const action = editingRoute ? 'publish these changes' : 'publish this new route';
      if (!await confirmAdminAction('Publish route?', `Are you sure you want to ${action}?${warningText}`, 'Publish', 'primary')) return;

      let routeId;
      if (editingRoute) {
        routeId = editingRoute.id;
        const response = await fetch(`/api/admin/routes/${editingRoute.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            ...routeFormData,
            path_segments: routePathSegments,
            geometry_corrected: routeFormData.geometry || null,
            use_corrected_geometry: 1
          })
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || 'Route update was rejected by the server.');
        }
      } else {
        const res = await fetch('/api/admin/routes', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...routeFormData,
            path_segments: routePathSegments,
            geometry_corrected: routeFormData.geometry || null,
            use_corrected_geometry: 1
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Route creation was rejected by the server.');
        routeId = data.routeId;
      }

      const savedRouteResponse = await fetch(`/api/routes/${routeId}`);
      const savedRoute = await savedRouteResponse.json().catch(() => ({}));
      if (!savedRouteResponse.ok || !matchesPathSegments(savedRoute.path_segments, routePathSegments)) {
        throw new Error('The server did not confirm the latest route legs. Your editor is still open; reload the app server and publish again.');
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

      await saveRouteSteps(routeId);

      if (editingRoute) {
        for (const advisory of linkedRouteAdvisories) {
          const config = routeFormData.advisory_detours?.[advisory.id];
          if (!config?.dirty) continue;
          const response = await fetch(`/api/admin/routes/${routeId}/advisories/${advisory.id}/detour`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(config)
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || `Could not save the ${advisory.title} detour.`);
        }
      }

      await fetch(`/api/admin/route-drafts/${routeDraftKey}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});

      setRouteModalOpen(false);
      loadAdminData();
    } catch (err) {
      await showAdminNotice('Route could not be saved', 'Failed to save route: ' + err.message);
    }
  };

  const handleDeleteRoute = async (routeId) => {
    if (!await confirmAdminAction('Delete route?', 'Are you sure you want to delete this route? This will also delete its stops, steps, and fare schedules.', 'Delete')) return;

    try {
      await fetch(`/api/admin/routes/${routeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadAdminData();
    } catch (err) {
      await showAdminNotice('Route could not be deleted', 'Failed to delete route: ' + err.message);
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
      await showAdminNotice('Advisory status could not be updated', 'Failed to toggle advisory status: ' + err.message);
    }
  };

  const openNewAdvisoryModal = () => {
    setEditingAdvisory(null);
    setAdvisorySaveError('');
    setAdvisoryFormData({
      title: 'HIGH TIDE ADVISORY',
      affected_road: '',
      condition: 'FLOODED',
      description: '',
      status: 'ACTIVE',
      route_ids: [],
      route_detours: {}
    });
    setAdvisoryModalOpen(true);
  };

  const openEditAdvisoryModal = (adv) => {
    setEditingAdvisory(adv);
    setAdvisorySaveError('');
    setAdvisoryFormData({
      title: adv.title,
      affected_road: adv.affected_road,
      condition: adv.condition,
      description: adv.description,
      status: adv.status,
      route_ids: adv.routes ? adv.routes.map(r => r.id) : [],
      route_detours: Object.fromEntries((adv.routes || []).map((route) => [route.id, {
        detour_enabled: route.detour_enabled ?? null,
        flooded_geometry: route.flooded_geometry || '',
        detour_geometry: route.detour_geometry || '',
        detour_steps: normalizeDetourSteps(route.detour_steps, route.detour_instructions),
        detour_instructions: route.detour_instructions || '',
        detour_time: route.detour_time || ''
      }]))
    });
    setAdvisoryModalOpen(true);
  };

  const handleSaveAdvisory = async (e) => {
    e.preventDefault();
    setAdvisorySaveError('');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
    const payload = {
      ...advisoryFormData,
      route_detours: Object.entries(advisoryFormData.route_detours || {}).map(([routeId, config]) => ({
        route_id: Number(routeId),
        ...config
      }))
    };

    try {
      let response;
      if (editingAdvisory) {
        response = await fetch(`/api/admin/advisories/${editingAdvisory.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch('/api/admin/advisories', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to save advisory.');
      setAdvisoryModalOpen(false);
      loadAdminData();
    } catch (err) {
      setAdvisorySaveError(err.message || 'Failed to save advisory.');
    }
  };

  const handleDeleteAdvisory = async (id) => {
    if (!await confirmAdminAction('Delete advisory?', 'Delete this advisory?', 'Delete')) return;
    try {
      await fetch(`/api/admin/advisories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadAdminData();
    } catch (err) {
      await showAdminNotice('Advisory could not be deleted', 'Failed to delete advisory.');
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
      await showAdminNotice('Feedback status could not be updated', 'Failed to update status.');
    }
  };

  const handleDeleteFeedback = async (id) => {
    if (!await confirmAdminAction('Delete feedback?', 'Delete this feedback entry?', 'Delete')) return;
    try {
      await fetch(`/api/admin/feedback/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      loadAdminData();
    } catch (err) {
      await showAdminNotice('Feedback could not be deleted', 'Failed to delete feedback.');
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
      lat: loc.latitude ?? loc.lat ?? '',
      lng: loc.longitude ?? loc.lng ?? '',
      description: loc.description || '',
      status: loc.status
    });
    setLocationModalOpen(true);
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    const { lat, lng, ...locationFields } = locationFormData;
    const body = {
      ...locationFields,
      latitude: parseFloat(lat),
      longitude: parseFloat(lng)
    };
    try {
      let response;
      if (editingLocation) {
        response = await fetch(`/api/admin/locations/${editingLocation.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      } else {
        response = await fetch('/api/admin/locations', { method: 'POST', headers, body: JSON.stringify(body) });
      }
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Location save was rejected by the server.');
      }
      setLocationModalOpen(false);
      loadAdminData();
    } catch (err) {
      await showAdminNotice('Location could not be saved', 'Failed to save location: ' + err.message);
    }
  };

  const handleDeleteLocation = async (id) => {
    if (!await confirmAdminAction('Delete location?', 'Delete this location? This may affect route segments referencing it.', 'Delete')) return;
    try {
      await fetch(`/api/admin/locations/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      loadAdminData();
    } catch (err) {
      await showAdminNotice('Location could not be deleted', 'Failed to delete location.');
    }
  };

  const openNewSchoolModal = () => {
    setEditingSchool(null);
    setSchoolFormData({
      name: '', type: 'SCHOOL', aliases: '', address: '', barangay: '',
      latitude: '', longitude: '', entrance_latitude: '', entrance_longitude: '',
      nearby_stops: '', verified: false, active: true
    });
    setSchoolModalOpen(true);
  };

  const openEditSchoolModal = (school) => {
    setEditingSchool(school);
    let nearbyStops = school.nearby_stops || [];
    if (typeof nearbyStops === 'string') {
      try { nearbyStops = JSON.parse(nearbyStops); } catch { nearbyStops = nearbyStops.split(/\r?\n/); }
    }
    setSchoolFormData({
      name: school.name || '', type: school.type || 'SCHOOL', aliases: school.aliases || '',
      address: school.address || '', barangay: school.barangay || '',
      latitude: school.latitude ?? '', longitude: school.longitude ?? '',
      entrance_latitude: school.entrance_latitude ?? '', entrance_longitude: school.entrance_longitude ?? '',
      nearby_stops: Array.isArray(nearbyStops) ? nearbyStops.join('\n') : '',
      verified: Boolean(school.verified), active: school.active !== 0
    });
    setSchoolModalOpen(true);
  };

  const handleSaveSchool = async (event) => {
    event.preventDefault();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const body = {
      ...schoolFormData,
      latitude: Number(schoolFormData.latitude),
      longitude: Number(schoolFormData.longitude),
      entrance_latitude: schoolFormData.entrance_latitude === '' ? null : Number(schoolFormData.entrance_latitude),
      entrance_longitude: schoolFormData.entrance_longitude === '' ? null : Number(schoolFormData.entrance_longitude),
      nearby_stops: schoolFormData.nearby_stops.split(/\r?\n/).map(stop => stop.trim()).filter(Boolean)
    };
    try {
      const response = await fetch(editingSchool ? `/api/admin/schools/${editingSchool.id}` : '/api/admin/schools', {
        method: editingSchool ? 'PUT' : 'POST', headers, body: JSON.stringify(body)
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'School save was rejected by the server.');
      }
      setSchoolModalOpen(false);
      await loadAdminData();
    } catch (error) {
      await showAdminNotice('School could not be saved', `Failed to save school: ${error.message}`);
    }
  };

  const handleDeleteSchool = async (school) => {
    if (!await confirmAdminAction('Delete school?', `Delete ${school.name} from the web map?`, 'Delete')) return;
    try {
      const response = await fetch(`/api/admin/schools/${school.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('School deletion was rejected by the server.');
      await loadAdminData();
    } catch (error) {
      await showAdminNotice('School could not be deleted', `Failed to delete school: ${error.message}`);
    }
  };

  const openEditLandmarkModal = (landmark) => {
    setEditingLandmark(landmark);
    setLandmarkFormData({
      name: landmark.name,
      type: landmark.type,
      latitude: landmark.latitude,
      longitude: landmark.longitude,
    });
    setLandmarkModalOpen(true);
  };

  const openNewLandmarkModal = () => {
    setEditingLandmark(null);
    setLandmarkFormData({ name: '', type: 'MALL', latitude: '', longitude: '' });
    setLandmarkModalOpen(true);
  };

  const handleSaveLandmark = async (event) => {
    event.preventDefault();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    try {
      const response = await fetch(editingLandmark ? `/api/admin/landmarks/${editingLandmark.id}` : '/api/admin/landmarks', {
        method: editingLandmark ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify({
          ...(editingLandmark ? {} : {
            name: landmarkFormData.name,
            type: landmarkFormData.type,
          }),
          latitude: Number(landmarkFormData.latitude),
          longitude: Number(landmarkFormData.longitude),
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Landmark update was rejected by the server.');
      }
      setLandmarkModalOpen(false);
      await loadAdminData();
    } catch (error) {
      await showAdminNotice('Landmark could not be saved', `Failed to save landmark: ${error.message}`);
    }
  };

  const handleDeleteLandmark = async (landmark) => {
    if (!await confirmAdminAction('Delete landmark?', `Remove ${landmark.name} from the map and search results?`, 'Delete')) return;
    try {
      const response = await fetch(`/api/admin/landmarks/${landmark.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Landmark deletion was rejected by the server.');
      }
      await loadAdminData();
    } catch (error) {
      await showAdminNotice('Landmark could not be deleted', `Failed to delete landmark: ${error.message}`);
    }
  };

  const openNewStopModal = () => {
    setEditingStop(null);
    setStopFormData({
      route_id: routes[0]?.id || '',
      stop_name: '',
      stop_order: 1,
      description: '',
      vehicle_type: '',
      is_transfer_point: false,
      latitude: '',
      longitude: '',
    });
    setStopModalOpen(true);
  };

  const openEditStopModal = (stop) => {
    setEditingStop(stop);
    setStopFormData({
      route_id: stop.route_id,
      stop_name: stop.stop_name,
      stop_order: stop.stop_order,
      description: stop.description || '',
      vehicle_type: stop.vehicle_type || '',
      is_transfer_point: Boolean(stop.is_transfer_point),
      latitude: stop.latitude ?? '',
      longitude: stop.longitude ?? '',
    });
    setStopModalOpen(true);
  };

  const handleSaveStop = async (event) => {
    event.preventDefault();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const body = {
      ...stopFormData,
      route_id: Number(stopFormData.route_id),
      stop_order: Number(stopFormData.stop_order),
      latitude: Number(stopFormData.latitude),
      longitude: Number(stopFormData.longitude),
    };

    try {
      const response = await fetch(editingStop ? `/api/admin/stops/${editingStop.id}` : '/api/admin/stops', {
        method: editingStop ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Stop save was rejected by the server.');
      }
      setStopModalOpen(false);
      await loadAdminData();
    } catch (error) {
      await showAdminNotice('Stop could not be saved', `Failed to save stop: ${error.message}`);
    }
  };

  const handleDeleteStop = async (stop) => {
    if (!await confirmAdminAction('Delete route stop?', `Delete ${stop.stop_name} from ${routes.find(route => route.id === stop.route_id)?.route_name || 'this route'}?`, 'Delete')) return;
    try {
      const response = await fetch(`/api/admin/stops/${stop.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Stop deletion was rejected by the server.');
      await loadAdminData();
    } catch (error) {
      await showAdminNotice('Stop could not be deleted', `Failed to delete stop: ${error.message}`);
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
      await showAdminNotice('Transport mode could not be updated', 'Failed to update transport mode status.');
    }
  };

  // ── Fare Matrix Handlers ────────────────────────────────────────────────────
  const openNewFareModal = (category) => {
    setEditingFare(null);
    setFareModalCategory(category);
    if (category === 'tricycle') {
      setFareFormData({ zone: 'Zone 1', barangay: '', landmarks: '', solo_fare_min: 40, solo_fare_max: 50, fare_per_2pax_min: 20, fare_per_2pax_max: 25, fare_per_3pax_min: 15, fare_per_3pax_max: 20, transport_mode: '', route_name: '', terminal: '', waypoints: '', distance_km: '', regular_fare_min: 15, regular_fare_max: 20, discounted_fare_min: 12, discounted_fare_max: 16, service_type: '', dock_location: '', destinations: '', fare_rate_note: '' });
    } else if (category === 'boat') {
      setFareFormData({ zone: '', barangay: '', landmarks: '', solo_fare_min: 0, solo_fare_max: 0, fare_per_2pax_min: 0, fare_per_2pax_max: 0, fare_per_3pax_min: 0, fare_per_3pax_max: 0, transport_mode: '', route_name: '', terminal: '', waypoints: '', distance_km: '', regular_fare_min: 0, regular_fare_max: 0, discounted_fare_min: 0, discounted_fare_max: 0, service_type: '', dock_location: '', destinations: '', fare_rate_note: '' });
    } else {
      setFareFormData({ zone: '', barangay: '', landmarks: '', solo_fare_min: 0, solo_fare_max: 0, fare_per_2pax_min: 0, fare_per_2pax_max: 0, fare_per_3pax_min: 0, fare_per_3pax_max: 0, transport_mode: category, route_name: '', terminal: '', waypoints: '', distance_km: '', regular_fare_min: 15, regular_fare_max: 20, discounted_fare_min: 12, discounted_fare_max: 16, service_type: '', dock_location: '', destinations: '', fare_rate_note: '' });
    }
    setFareModalOpen(true);
  };

  const openEditFareModal = (fare, category) => {
    setEditingFare(fare);
    setFareModalCategory(category);
    if (category === 'tricycle') {
      setFareFormData({ zone: fare.zone || 'Zone 1', barangay: fare.barangay || '', landmarks: fare.landmarks || '', solo_fare_min: fare.solo_fare?.min ?? 40, solo_fare_max: fare.solo_fare?.max ?? 50, fare_per_2pax_min: fare.fare_per_2pax?.min ?? 20, fare_per_2pax_max: fare.fare_per_2pax?.max ?? 25, fare_per_3pax_min: fare.fare_per_3pax_shared?.min ?? 15, fare_per_3pax_max: fare.fare_per_3pax_shared?.max ?? 20, transport_mode: '', route_name: '', terminal: '', waypoints: '', distance_km: '', regular_fare_min: 0, regular_fare_max: 0, discounted_fare_min: 0, discounted_fare_max: 0, service_type: '', dock_location: '', destinations: '', fare_rate_note: '' });
    } else if (category === 'boat') {
      setFareFormData({ zone: '', barangay: '', landmarks: '', solo_fare_min: 0, solo_fare_max: 0, fare_per_2pax_min: 0, fare_per_2pax_max: 0, fare_per_3pax_min: 0, fare_per_3pax_max: 0, transport_mode: '', route_name: '', terminal: '', waypoints: '', distance_km: '', regular_fare_min: 0, regular_fare_max: 0, discounted_fare_min: 0, discounted_fare_max: 0, service_type: fare.service_type || '', dock_location: fare.dock_location || '', destinations: fare.destinations || '', fare_rate_note: fare.fare_rate_note || '' });
    } else {
      setFareFormData({ zone: '', barangay: '', landmarks: '', solo_fare_min: 0, solo_fare_max: 0, fare_per_2pax_min: 0, fare_per_2pax_max: 0, fare_per_3pax_min: 0, fare_per_3pax_max: 0, transport_mode: fare.transport_mode || category, route_name: fare.route_name || '', terminal: fare.terminal || '', waypoints: fare.waypoints || '', distance_km: fare.distance_km || '', regular_fare_min: fare.regular_fare?.min ?? 15, regular_fare_max: fare.regular_fare?.max ?? 20, discounted_fare_min: fare.discounted_fare_20pct?.min ?? 12, discounted_fare_max: fare.discounted_fare_20pct?.max ?? 16, service_type: '', dock_location: '', destinations: '', fare_rate_note: '' });
    }
    setFareModalOpen(true);
  };

  const handleSaveFare = async (e) => {
    e.preventDefault();
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    try {
      if (fareModalCategory === 'tricycle') {
        const body = {
          zone: fareFormData.zone,
          barangay: fareFormData.barangay,
          landmarks: fareFormData.landmarks,
          solo_fare: { min: Number(fareFormData.solo_fare_min), max: Number(fareFormData.solo_fare_max) },
          fare_per_2pax: { min: Number(fareFormData.fare_per_2pax_min), max: Number(fareFormData.fare_per_2pax_max) },
          fare_per_3pax_shared: { min: Number(fareFormData.fare_per_3pax_min), max: Number(fareFormData.fare_per_3pax_max) }
        };
        if (editingFare) {
          await fetch(`/api/admin/fares/tricycles/${editingFare.id || editingFare._id || editingFare.barangay}`, { method: 'PUT', headers, body: JSON.stringify(body) });
        } else {
          await fetch('/api/admin/fares/tricycles', { method: 'POST', headers, body: JSON.stringify(body) });
        }
      } else if (fareModalCategory === 'boat') {
        const body = {
          service_type: fareFormData.service_type,
          dock_location: fareFormData.dock_location,
          destinations: fareFormData.destinations,
          fare_rate_note: fareFormData.fare_rate_note
        };
        if (editingFare) {
          await fetch(`/api/admin/fares/boats/${editingFare.id || editingFare._id || editingFare.service_type}`, { method: 'PUT', headers, body: JSON.stringify(body) });
        } else {
          await fetch('/api/admin/fares/boats', { method: 'POST', headers, body: JSON.stringify(body) });
        }
      } else {
        const body = {
          transport_mode: fareModalCategory,
          route_name: fareFormData.route_name,
          terminal: fareFormData.terminal,
          waypoints: fareFormData.waypoints,
          distance_km: fareFormData.distance_km,
          regular_fare: { min: Number(fareFormData.regular_fare_min), max: Number(fareFormData.regular_fare_max) },
          discounted_fare_20pct: { min: Number(fareFormData.discounted_fare_min), max: Number(fareFormData.discounted_fare_max) }
        };
        if (editingFare) {
          await fetch(`/api/admin/fares/routes/${editingFare.id || editingFare._id || editingFare.route_name}`, { method: 'PUT', headers, body: JSON.stringify(body) });
        } else {
          await fetch('/api/admin/fares/routes', { method: 'POST', headers, body: JSON.stringify(body) });
        }
      }
      setFareModalOpen(false);
      loadAdminData();
    } catch (err) {
      await showAdminNotice('Fare record could not be saved', 'Failed to save fare record: ' + err.message);
    }
  };

  const handleDeleteFareRecord = async (fare, category) => {
    if (!await confirmAdminAction('Delete fare record?', 'Delete this fare record? This cannot be undone.', 'Delete')) return;
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      if (category === 'tricycle') {
        await fetch(`/api/admin/fares/tricycles/${fare.id || fare._id || fare.barangay}`, { method: 'DELETE', headers });
      } else if (category === 'boat') {
        await fetch(`/api/admin/fares/boats/${fare.id || fare._id || fare.service_type}`, { method: 'DELETE', headers });
      } else {
        await fetch(`/api/admin/fares/routes/${fare.id || fare._id || fare.route_name}`, { method: 'DELETE', headers });
      }
      loadAdminData();
    } catch (err) {
      await showAdminNotice('Fare record could not be deleted', 'Failed to delete fare record.');
    }
  };
  // ── End Fare Matrix Handlers ────────────────────────────────────────────────

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
      <div className="bg-slate-900 text-white py-6 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/30">
                Staff Portal
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-1">
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

      <div className="w-full px-4 sm:px-6 lg:px-8 pt-8">
        
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

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Tab Navigation */}
        <nav aria-label="Admin sections" className="grid grid-cols-2 gap-1 lg:w-60 lg:shrink-0 lg:grid-cols-1">
          {[
            { key: 'routes', label: 'Routes & Travel Times', icon: Route },
            { key: 'web-map', label: 'Web Map', icon: Compass },
            { key: 'advisories', label: 'Flood Advisories & Detours', icon: AlertTriangle },
            { key: 'saved-routes', label: 'Saved Routes', icon: Bookmark },
            { key: 'activity', label: 'User Activity', icon: Activity },
            { key: 'locations', label: 'Places & Stops', icon: Layers },
            { key: 'modes', label: 'Transport Modes', icon: Ship },
            { key: 'fares', label: 'Fare Matrix', icon: DollarSign },
            { key: 'feedback', label: 'Commuter Reports', icon: MessageSquare }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setAdminSearch('');
                }}
                className={`flex min-h-11 items-center gap-2 rounded-lg border-l-4 px-3 py-2 text-left text-xs sm:text-sm font-bold transition-all ${
                  isActive
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
        {/* ========================================================================= */}
        {/* TAB 1: ROUTES MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === 'routes' && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Registered Transit Routes</h3>
                <p className="text-xs text-slate-500">Configure base time, detour time, and fares.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {renderAdminSearch('Search routes...')}
                <button
                  onClick={openNewRouteModal}
                  className="py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Add New Route
                </button>
              </div>
            </div>

            <div className="overflow-x-auto -mx-6 px-6">
              <table className="min-w-[640px] w-full text-left text-xs text-slate-600">
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
                  {searchedRoutes.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center text-slate-400 py-8">
                        {routes.length ? 'No routes match your search.' : 'No routes configured yet.'}
                      </td>
                    </tr>
                  ) : searchedRoutes.map((r) => (
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
                          className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                          title="View Public Page"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditRouteModal(r)}
                          className="p-2 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-slate-100"
                          title="Edit Route"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRoute(r.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100"
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

        {activeTab === 'web-map' && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <h3 className="text-base font-bold text-slate-900">Web Map Routes</h3>
                <p className="mt-1 text-xs text-slate-500">Select a route on the list or map, then open its editor.</p>
                <div className="mt-3">{renderAdminSearch('Search routes...')}</div>
              </div>
              <div className="max-h-[64vh] overflow-y-auto p-2">
                {searchedRoutes.length === 0 ? (
                  <p className="px-3 py-8 text-center text-xs text-slate-500">
                    {routes.length ? 'No routes match your search.' : 'No routes configured yet.'}
                  </p>
                ) : searchedRoutes.map((route) => (
                  <div
                    key={route.id}
                    className={`mb-1 flex items-center gap-2 rounded-lg border p-2 ${selectedWebMapRouteId === route.id ? 'border-emerald-200 bg-emerald-50' : 'border-transparent hover:bg-slate-50'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedWebMapRouteId(route.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-xs font-semibold text-slate-900">{route.route_name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                        {route.mode_name} · {route.origin} to {route.destination}
                      </span>
                      {route.allow_unverified_map_geometry && (
                        <span className="mt-1 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900">
                          Unverified map bypass
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      title={`Edit ${route.route_name}`}
                      aria-label={`Edit ${route.route_name}`}
                      onClick={() => openEditRouteModal(route)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </aside>

            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-900">
                      {selectedWebMapRoute?.route_name || 'Dagupan transit map'}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {selectedWebMapRoute
                        ? `${selectedWebMapRoute.mode_name} · ${selectedWebMapRoute.origin} to ${selectedWebMapRoute.destination}${selectedWebMapRoute.geometry_needs_review ? ' · Unverified geometry preview' : ''}`
                        : 'Select a route to edit its map geometry.'}
                    </p>
                  </div>
                  {selectedWebMapRoute && (
                    <button
                      type="button"
                      onClick={() => openEditRouteModal(selectedWebMapRoute)}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit Route
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2" aria-label="Map layer visibility">
                  <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Show on map</span>
                  {[
                    { key: 'schools', label: 'Schools', icon: GraduationCap },
                    { key: 'locations', label: 'Places', icon: MapPin },
                    { key: 'landmarks', label: 'Landmarks', icon: Landmark }
                  ].map(({ key, label, icon: LayerIcon }) => {
                    const enabled = webMapLayers[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={enabled}
                        onClick={() => setWebMapLayers((current) => ({ ...current, [key]: !current[key] }))}
                        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
                          enabled
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <LayerIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {label}
                        <span className="text-[9px] uppercase">{enabled ? 'On' : 'Off'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="h-[64vh] min-h-[420px]">
                <RouteMap
                  routes={webMapRoutes}
                  selectedRouteId={selectedWebMapRoute?.id ?? null}
                  allowUnverifiedPreview={Boolean(selectedWebMapRoute)}
                  interactive
                  showAdvisories
                  showLocations={webMapLayers.locations}
                  showSchools={webMapLayers.schools}
                  showLandmarks={webMapLayers.landmarks}
                  locations={locations}
                  showStopClusterCounts={false}
                  onSelect={(type, item) => {
                    if (type === 'route') setSelectedWebMapRouteId(item?.id ?? null);
                  }}
                  className="h-full w-full"
                />
              </div>
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ADVISORIES & DETOUR MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === 'advisories' && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Flood & High Tide Road Advisories</h3>
                <p className="text-xs text-slate-500">
                  Toggling an advisory instantly recalculates travel times and updates detour routes.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {renderAdminSearch('Search advisories...')}
                <button
                  onClick={openNewAdvisoryModal}
                  className="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Publish Road Advisory
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {searchedAdvisories.length === 0 && (
                <p className="text-sm text-slate-400 py-6 text-center">
                  {advisories.length ? 'No advisories match your search.' : 'No advisories published yet.'}
                </p>
              )}
              {searchedAdvisories.map((adv) => {
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
                        <span className="linked-route-label text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                          Linked Routes:
                        </span>
                        {adv.routes.map(r => (
                          <span key={r.id} className="linked-route-badge px-2 py-0.5 bg-white/90 border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700">
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Commuter Feedback & Road Reports</h3>
                <p className="text-xs text-slate-500">Review submissions from travelers and commuters in Dagupan.</p>
              </div>
              {renderAdminSearch('Search commuter reports...')}
            </div>

            <div className="space-y-3">
              {searchedFeedback.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">
                  {feedbackList.length ? 'No commuter reports match your search.' : 'No commuter feedback submitted yet.'}
                </p>
              ) : (
                searchedFeedback.map((item) => (
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

        {activeTab === 'saved-routes' && (
          <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Bookmark className="h-5 w-5 text-emerald-700" />
                  <h3 className="text-lg font-bold text-slate-900">Saved Route Popularity</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">Aggregate commuter bookmarks by route. See User Activity for individual bookmark events.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  {savedRouteInsights.total_saved} total bookmarks
                </div>
                {renderAdminSearch('Search saved routes...')}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Origin</th>
                    <th className="px-4 py-3">Destination</th>
                    <th className="px-4 py-3 text-right">Bookmarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {searchedSavedRouteInsights.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-4 py-10 text-center text-slate-400">
                        {savedRouteInsights.routes.length ? 'No saved routes match your search.' : 'Commuters have not saved any routes yet.'}
                      </td>
                    </tr>
                  ) : searchedSavedRouteInsights.map((route) => (
                    <tr key={route.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3.5 font-semibold text-slate-900">{route.route_name}</td>
                      <td className="px-4 py-3.5">{route.mode_name || '—'}</td>
                      <td className="px-4 py-3.5 text-slate-500">{route.origin}</td>
                      <td className="px-4 py-3.5 text-slate-500">{route.destination}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums font-bold text-slate-900">{route.saved_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'activity' && (
          <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-emerald-700" />
                  <h3 className="text-lg font-bold text-slate-900">User Activity</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Latest 200 sign-ins, sign-outs, and saved-route changes.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {renderAdminSearch('Search user activity...')}
                <button
                  type="button"
                  onClick={loadAdminActivity}
                  disabled={activityLogsLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${activityLogsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {activityLogsError && (
              <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {activityLogsError}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Activity</th>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {searchedActivityLogs.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-4 py-10 text-center text-slate-400">
                        {activityLogsLoading
                          ? 'Loading user activity...'
                          : activityLogs.length
                            ? 'No activity matches your search.'
                            : 'No user activity has been recorded yet.'}
                      </td>
                    </tr>
                  ) : searchedActivityLogs.map((log) => {
                    const isLogin = log.action === 'LOGIN';
                    const isLogout = log.action === 'LOGOUT';
                    const ActionIcon = isLogin ? LogIn : isLogout ? LogOut : Bookmark;
                    const actionLabel = {
                      LOGIN: 'Signed in',
                      LOGOUT: 'Signed out',
                      ROUTE_SAVED: 'Saved route',
                      ROUTE_UNSAVED: 'Removed saved route'
                    }[log.action] || log.action;
                    return (
                      <tr key={log.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900">{log.username}</div>
                          <div className="mt-1 text-[10px] text-slate-500">{log.role}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                            <ActionIcon className="h-4 w-4 text-emerald-700" />
                            {actionLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-700">
                          {log.route_name || (log.route_id ? `Route #${log.route_id}` : '—')}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

      {/* ========================================================================= */}
      {/* TAB 4: LANDMARKS, SCHOOLS & STOPS MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'locations' && (
        <div className="space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Landmarks</h3>
              <p className="text-xs text-slate-500">Move existing map landmarks by editing coordinates or placing a pin on the map.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {renderAdminSearch('Search landmarks...')}
              <button type="button" onClick={openNewLandmarkModal} className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800">
                <Plus className="h-4 w-4" /> Add Landmark
              </button>
            </div>
          </div>

          <div className="overflow-x-auto -mx-6 px-6">
            <table className="min-w-[620px] w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Coordinates</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {searchedLandmarks.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-slate-400 py-8">
                      {landmarks.length ? 'No landmarks match your search.' : 'No map landmarks configured.'}
                    </td>
                  </tr>
                ) : (
                  searchedLandmarks.map(landmark => (
                    <tr key={landmark.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{landmark.name}</td>
                      <td className="py-3.5 px-4">{landmark.type}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{Number(landmark.latitude).toFixed(5)}, {Number(landmark.longitude).toFixed(5)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <button type="button" onClick={() => openEditLandmarkModal(landmark)} title={`Move ${landmark.name}`} aria-label={`Move ${landmark.name}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700">
                          <Edit className="h-3.5 w-3.5" /> Move
                        </button>
                        <button type="button" onClick={() => handleDeleteLandmark(landmark)} title={`Delete ${landmark.name}`} aria-label={`Delete ${landmark.name}`} className="ml-1 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Schools</h3>
              <p className="mt-1 text-xs text-slate-500">Manage school details, map positions, verification, and nearby transit stops.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {renderAdminSearch('Search schools...')}
              <button type="button" onClick={openNewSchoolModal} className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-800">
                <Plus className="h-4 w-4" /> Add School
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Barangay</th><th className="px-4 py-3">Map Coordinates</th>
                  <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {searchedSchools.length === 0 ? (
                  <tr><td colSpan="6" className="py-8 text-center text-slate-400">{schools.length ? 'No schools match your search.' : 'No schools configured yet.'}</td></tr>
                ) : searchedSchools.map(school => (
                  <tr key={school.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3.5 font-semibold text-slate-900">{school.name}</td>
                    <td className="px-4 py-3.5">{school.type}</td>
                    <td className="px-4 py-3.5">{school.barangay || '—'}</td>
                    <td className="px-4 py-3.5 font-mono text-slate-500">{Number(school.entrance_latitude ?? school.latitude).toFixed(4)}, {Number(school.entrance_longitude ?? school.longitude).toFixed(4)}</td>
                    <td className="px-4 py-3.5"><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${school.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{school.active ? 'ACTIVE' : 'INACTIVE'}{school.verified ? ' · VERIFIED' : ''}</span></td>
                    <td className="px-4 py-3.5 text-right">
                      <button type="button" onClick={() => openEditSchoolModal(school)} title={`Edit ${school.name}`} aria-label={`Edit ${school.name}`} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-emerald-700"><Edit className="h-4 w-4" /></button>
                      <button type="button" onClick={() => handleDeleteSchool(school)} title={`Delete ${school.name}`} aria-label={`Delete ${school.name}`} className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Route Stops</h3>
              <p className="text-xs text-slate-500">Stops are grouped by route and shown in travel order. Add, edit, or remove stops for each route.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {renderAdminSearch('Search route stops...')}
              <button
                type="button"
                onClick={openNewStopModal}
                disabled={!routes.length}
                className="py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Add Stop
              </button>
            </div>
          </div>

          {searchedRouteStopGroups.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              {routeStops.length ? 'No route stops match your search.' : 'No route stops configured yet. Add them when you are ready.'}
            </p>
          ) : (
            <div className="space-y-4">
              {searchedRouteStopGroups.map(({ route, routeId, stops }) => (
                <details
                  key={String(route?.id ?? routeId ?? 'unassigned')}
                  open={searchTerm ? true : undefined}
                  className="group overflow-hidden rounded-2xl border border-slate-200"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600">
                    <span className="flex min-w-0 items-center gap-2">
                      <Route className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                      <span className="truncate text-sm font-bold text-slate-900">
                        {route?.route_name || (routeId == null ? 'Unassigned route' : `Route ${routeId}`)}
                      </span>
                      {route?.mode_name && <span className="hidden rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline">{route.mode_name}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </span>
                  </summary>
                  <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full text-left text-xs text-slate-600">
                      <thead className="border-b border-slate-200 bg-white text-slate-500">
                        <tr>
                          <th className="w-16 px-4 py-3 font-bold uppercase tracking-wider">Order</th>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider">Stop</th>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider">Coordinates</th>
                          <th className="px-4 py-3 text-right font-bold uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {stops.map((stop) => (
                          <tr key={stop.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 tabular-nums text-slate-500">{stop.stop_order}</td>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-slate-900">{stop.stop_name}</span>
                              {stop.is_transfer_point ? <span className="ml-2 text-[10px] font-bold uppercase text-sky-700">Transfer</span> : null}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-400">
                              {Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
                                ? `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`
                                : 'Not pinned'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button type="button" onClick={() => openEditStopModal(stop)} className="p-2 text-slate-400 hover:text-emerald-700 rounded-lg hover:bg-slate-100" title="Edit stop" aria-label={`Edit ${stop.stop_name}`}>
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={() => handleDeleteStop(stop)} className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100" title="Delete stop" aria-label={`Delete ${stop.stop_name}`}>
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: TRANSPORT MODES MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'modes' && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Configured Transport Modes</h3>
              <p className="text-xs text-slate-500">
                Control transit modes (Jeepney, Bus, Tricycle, Boat). Inactive modes will not be displayed to commuters or allow new routes.
              </p>
            </div>
            {renderAdminSearch('Search transport modes...')}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {searchedModes.length === 0 && (
              <p className="col-span-full text-sm text-slate-400 py-6 text-center">
                {modes.length ? 'No transport modes match your search.' : 'No transport modes configured yet.'}
              </p>
            )}
            {searchedModes.map((mode) => {
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

      {/* ========================================================================= */}
      {/* TAB 6: FARE MATRIX (VIEW-ONLY) */}
      {/* ========================================================================= */}
      {activeTab === 'fares' && (() => {
        const formatFare = (val) => {
          if (val === null || val === undefined || val === '') return 'Not configured';
          if (typeof val === 'string') {
            const trimmed = val.trim();
            return trimmed || 'Not configured';
          }
          if (typeof val === 'number') {
            return `₱${val.toFixed(2)}`;
          }
          if (typeof val === 'object') {
            if (val.raw) return val.raw;
            if (val.min != null && val.max != null) {
              if (val.min === val.max) {
                return `₱${Number(val.min).toFixed(2)}`;
              }
              return `₱${Number(val.min).toFixed(2)} – ₱${Number(val.max).toFixed(2)}`;
            }
            if (val.min != null) return `₱${Number(val.min).toFixed(2)}`;
            if (val.max != null) return `₱${Number(val.max).toFixed(2)}`;
          }
          return 'Not configured';
        };

        const fareCategories = [
          { key: 'tricycle', label: 'Motorized Tricycles', count: fareTricycles.length },
          { key: 'jeepney', label: 'Traditional Jeepneys', count: fareRoutes.filter(r => r.transport_mode === 'jeepney').length },
          { key: 'modern_puv', label: 'Modern PUVs', count: fareRoutes.filter(r => r.transport_mode === 'modern_puv').length },
          { key: 'boat', label: 'Water Boats', count: fareBoats.length },
        ];

        const q = fareSearch.trim().toLowerCase();

        const filteredTricycles = fareTricycles.filter(t => {
          if (!q) return true;
          return (t.barangay && t.barangay.toLowerCase().includes(q)) ||
                 (t.landmarks && t.landmarks.toLowerCase().includes(q)) ||
                 (t.zone && t.zone.toLowerCase().includes(q));
        });

        const activeRoutes = fareRoutes.filter(r => r.transport_mode === fareCategory);
        const filteredRoutes = activeRoutes.filter(r => {
          if (!q) return true;
          return (r.route_name && r.route_name.toLowerCase().includes(q)) ||
                 (r.terminal && r.terminal.toLowerCase().includes(q)) ||
                 (r.waypoints && r.waypoints.toLowerCase().includes(q));
        });

        const filteredBoats = fareBoats.filter(b => {
          if (!q) return true;
          return (b.service_type && b.service_type.toLowerCase().includes(q)) ||
                 (b.dock_location && b.dock_location.toLowerCase().includes(q)) ||
                 (b.destinations && b.destinations.toLowerCase().includes(q)) ||
                 (b.fare_rate_note && b.fare_rate_note.toLowerCase().includes(q));
        });

        return (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden p-6 space-y-6">
            {/* Header & Source Metadata */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">Authoritative Fare Matrix</h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Official Dagupan City benchmark transit fares across road corridors and river crossings.
                </p>
              </div>

              {/* Add Fare Button */}
              <button
                onClick={() => openNewFareModal(fareCategory)}
                className="py-2 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all self-start lg:self-auto"
              >
                <Plus className="w-4 h-4" />
                Add {fareCategory === 'tricycle' ? 'Tricycle' : fareCategory === 'boat' ? 'Boat' : 'Route'} Fare
              </button>
            </div>

            {/* Sub-tabs / Mode Selector & Search Filter */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {fareCategories.map((cat) => {
                  const isSel = fareCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => {
                        setFareCategory(cat.key);
                        setFareSearch('');
                      }}
                      className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                        isSel
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      <span>{cat.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                        isSel ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={fareSearch}
                  onChange={(e) => setFareSearch(e.target.value)}
                  placeholder={`Search ${fareCategory.replace('_', ' ')}...`}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto -mx-6 px-6">
              {/* 1. MOTORIZED TRICYCLES */}
              {fareCategory === 'tricycle' && (
                <table className="min-w-[860px] w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Zone Category</th>
                      <th className="py-3 px-4">Barangay</th>
                      <th className="py-3 px-4">Description & Key Landmarks</th>
                      <th className="py-3 px-4">Solo Passenger (Special Trip)</th>
                      <th className="py-3 px-4">2 Passengers (Per Person)</th>
                      <th className="py-3 px-4">3 Passengers / Shared</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTricycles.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center text-slate-400 py-8">
                          No tricycle fare records found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredTricycles.map((t, idx) => (
                        <tr key={t._id || idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200/60">
                              {t.zone}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">{t.barangay}</td>
                          <td className="py-3 px-4 text-slate-600 max-w-[260px]">{t.landmarks || '—'}</td>
                          <td className="py-3 px-4 font-bold text-emerald-700 whitespace-nowrap">{formatFare(t.solo_fare)}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">{formatFare(t.fare_per_2pax)}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">{formatFare(t.fare_per_3pax_shared)}</td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                            <button onClick={() => openEditFareModal(t, 'tricycle')} className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg transition-colors" title="Edit"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteFareRecord(t, 'tricycle')} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* 2. TRADITIONAL JEEPNEYS & 3. MODERN PUVS */}
              {(fareCategory === 'jeepney' || fareCategory === 'modern_puv') && (
                <table className="min-w-[860px] w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Route Name</th>
                      <th className="py-3 px-4">Origin / Main Terminal</th>
                      <th className="py-3 px-4">Key Waypoints & Barangays Served</th>
                      <th className="py-3 px-4">Est. Distance</th>
                      <th className="py-3 px-4">Regular Fare</th>
                      <th className="py-3 px-4">Discounted Fare (20% Off)</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRoutes.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center text-slate-400 py-8">
                          No {fareCategory === 'jeepney' ? 'traditional jeepney' : 'modern PUV'} fare records found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredRoutes.map((r, idx) => (
                        <tr key={r._id || idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">{r.route_name}</td>
                          <td className="py-3 px-4 text-slate-600 max-w-[200px]">{r.terminal || '—'}</td>
                          <td className="py-3 px-4 text-slate-600 max-w-[260px]">{r.waypoints || '—'}</td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{r.distance_km || '—'}</td>
                          <td className="py-3 px-4 font-bold text-emerald-700 whitespace-nowrap">{formatFare(r.regular_fare)}</td>
                          <td className="py-3 px-4 font-semibold text-amber-700 whitespace-nowrap">{formatFare(r.discounted_fare_20pct)}</td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                            <button onClick={() => openEditFareModal(r, fareCategory)} className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg transition-colors" title="Edit"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteFareRecord(r, fareCategory)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* 6. WATER BOATS */}
              {fareCategory === 'boat' && (
                <table className="min-w-[800px] w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Service Type</th>
                      <th className="py-3 px-4">Dock Location</th>
                      <th className="py-3 px-4">Destinations Covered</th>
                      <th className="py-3 px-4">Fare / Rate Range</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBoats.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center text-slate-400 py-8">
                          No water boat fare records found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredBoats.map((b, idx) => (
                        <tr key={b._id || idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">{b.service_type}</td>
                          <td className="py-3 px-4 text-slate-600">{b.dock_location || '—'}</td>
                          <td className="py-3 px-4 text-slate-600 max-w-[260px]">{b.destinations || '—'}</td>
                          <td className="py-3 px-4 font-bold text-cyan-700 whitespace-nowrap">{formatFare(b.fare_rate_note)}</td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                            <button onClick={() => openEditFareModal(b, 'boat')} className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg transition-colors" title="Edit"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteFareRecord(b, 'boat')} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}

      </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LANDMARK MOVE MODAL */}
      {/* ========================================================================= */}
      {landmarkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl sm:p-7">
            <button type="button" onClick={() => setLandmarkModalOpen(false)} className="absolute right-5 top-5 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close landmark editor">
              <X className="h-5 w-5" />
            </button>
            <h3 className="mb-1 pr-8 text-xl font-bold text-slate-900">{editingLandmark ? 'Move Landmark' : 'Add Landmark'}</h3>
            {editingLandmark ? <p className="mb-5 text-sm text-slate-500">{editingLandmark.name}</p> : <p className="mb-5 text-sm text-slate-500">Add a searchable map landmark and set its location.</p>}
            <form onSubmit={handleSaveLandmark} className="space-y-4 text-xs">
              {!editingLandmark && (
                <>
                  <div>
                    <label className="mb-1 block font-bold text-slate-700">Landmark Name *</label>
                    <input type="text" required maxLength="160" value={landmarkFormData.name}
                      onChange={event => setLandmarkFormData({ ...landmarkFormData, name: event.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-slate-700">Type *</label>
                    <input type="text" required maxLength="40" value={landmarkFormData.type}
                      onChange={event => setLandmarkFormData({ ...landmarkFormData, type: event.target.value })}
                      placeholder="e.g. MALL, PLAZA, TERMINAL"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm" />
                  </div>
                </>
              )}
              <LocationPinPicker
                latitude={landmarkFormData.latitude}
                longitude={landmarkFormData.longitude}
                locationType="LANDMARK"
                onPin={(latitude, longitude) => setLandmarkFormData(previous => ({
                  ...previous,
                  latitude: latitude.toFixed(6),
                  longitude: longitude.toFixed(6),
                }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold text-slate-600">Latitude
                  <input type="number" step="any" min="-90" max="90" required value={landmarkFormData.latitude}
                    onChange={event => setLandmarkFormData({ ...landmarkFormData, latitude: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-sm" />
                </label>
                <label className="font-semibold text-slate-600">Longitude
                  <input type="number" step="any" min="-180" max="180" required value={landmarkFormData.longitude}
                    onChange={event => setLandmarkFormData({ ...landmarkFormData, longitude: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-sm" />
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setLandmarkModalOpen(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="rounded-lg bg-emerald-700 px-5 py-2.5 font-bold text-white hover:bg-emerald-800">{editingLandmark ? 'Save Position' : 'Add Landmark'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCHOOL ADD/EDIT MODAL */}
      {/* ========================================================================= */}
      {schoolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl sm:p-7">
            <button type="button" onClick={() => setSchoolModalOpen(false)} className="absolute right-5 top-5 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close school form">
              <X className="h-5 w-5" />
            </button>
            <h3 className="mb-5 pr-8 text-xl font-bold text-slate-900">{editingSchool ? 'Edit School' : 'Add School'}</h3>
            <form onSubmit={handleSaveSchool} className="space-y-4 text-xs">
              <div>
                <label className="mb-1 block font-bold text-slate-700">School Name *</label>
                <input type="text" required value={schoolFormData.name}
                  onChange={event => setSchoolFormData({ ...schoolFormData, name: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-bold text-slate-700">Type *</label>
                  <select value={schoolFormData.type} onChange={event => setSchoolFormData({ ...schoolFormData, type: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm">
                    <option value="SCHOOL">School</option><option value="COLLEGE">College</option><option value="UNIVERSITY">University</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-bold text-slate-700">Barangay</label>
                  <input type="text" value={schoolFormData.barangay} onChange={event => setSchoolFormData({ ...schoolFormData, barangay: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block font-bold text-slate-700">Aliases</label>
                <input type="text" value={schoolFormData.aliases} onChange={event => setSchoolFormData({ ...schoolFormData, aliases: event.target.value })}
                  placeholder="Alternate or abbreviated names" className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block font-bold text-slate-700">Address</label>
                <input type="text" value={schoolFormData.address} onChange={event => setSchoolFormData({ ...schoolFormData, address: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm" />
              </div>
              <div>
                <p className="mb-2 font-bold text-slate-700">Campus coordinates *</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="font-semibold text-slate-600">Latitude
                    <input type="number" step="any" min="-90" max="90" required value={schoolFormData.latitude}
                      onChange={event => setSchoolFormData({ ...schoolFormData, latitude: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-sm" />
                  </label>
                  <label className="font-semibold text-slate-600">Longitude
                    <input type="number" step="any" min="-180" max="180" required value={schoolFormData.longitude}
                      onChange={event => setSchoolFormData({ ...schoolFormData, longitude: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-sm" />
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-slate-700">Map entrance pin (optional; defaults to campus coordinates)</p>
                <LocationPinPicker
                  latitude={schoolFormData.entrance_latitude}
                  longitude={schoolFormData.entrance_longitude}
                  locationType="LANDMARK"
                  onPin={(latitude, longitude) => setSchoolFormData(previous => ({
                    ...previous,
                    entrance_latitude: latitude.toFixed(6),
                    entrance_longitude: longitude.toFixed(6)
                  }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <label className="font-semibold text-slate-600">Entrance latitude
                    <input type="number" step="any" min="-90" max="90" value={schoolFormData.entrance_latitude}
                      onChange={event => setSchoolFormData({ ...schoolFormData, entrance_latitude: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-sm" />
                  </label>
                  <label className="font-semibold text-slate-600">Entrance longitude
                    <input type="number" step="any" min="-180" max="180" value={schoolFormData.entrance_longitude}
                      onChange={event => setSchoolFormData({ ...schoolFormData, entrance_longitude: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-sm" />
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1 block font-bold text-slate-700">Nearby transit stops</label>
                <textarea rows="3" value={schoolFormData.nearby_stops}
                  onChange={event => setSchoolFormData({ ...schoolFormData, nearby_stops: event.target.value })}
                  placeholder="One stop per line" className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm" />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-700">
                  <input type="checkbox" checked={schoolFormData.verified} onChange={event => setSchoolFormData({ ...schoolFormData, verified: event.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" /> Verified
                </label>
                <label className="inline-flex items-center gap-2 font-semibold text-slate-700">
                  <input type="checkbox" checked={schoolFormData.active} onChange={event => setSchoolFormData({ ...schoolFormData, active: event.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" /> Show on web map
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setSchoolModalOpen(false)} className="rounded-lg bg-slate-100 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-200">Cancel</button>
                <button type="submit" className="rounded-lg bg-emerald-700 px-5 py-2.5 font-bold text-white hover:bg-emerald-800">{editingSchool ? 'Save School' : 'Add School'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              <LocationPinPicker
                latitude={locationFormData.lat}
                longitude={locationFormData.lng}
                locationType={locationFormData.type}
                onPin={(lat, lng) => setLocationFormData(previous => ({
                  ...previous,
                  lat: lat.toFixed(6),
                  lng: lng.toFixed(6),
                }))}
              />
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
      {/* ROUTE STOP ADD/EDIT MODAL */}
      {/* ========================================================================= */}
      {stopModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button type="button" onClick={() => setStopModalOpen(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600" aria-label="Close stop form">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              {editingStop ? 'Edit Route Stop' : 'Add Route Stop'}
            </h3>
            <form onSubmit={handleSaveStop} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Route *</label>
                  <select required value={stopFormData.route_id}
                    onChange={(event) => setStopFormData({ ...stopFormData, route_id: event.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                    <option value="" disabled>Select a route</option>
                    {routes.map(route => <option key={route.id} value={route.id}>{route.route_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Stop Order *</label>
                  <input type="number" min="1" required value={stopFormData.stop_order}
                    onChange={(event) => setStopFormData({ ...stopFormData, stop_order: event.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Stop Name *</label>
                <input type="text" required value={stopFormData.stop_name}
                  onChange={(event) => setStopFormData({ ...stopFormData, stop_name: event.target.value })}
                  placeholder="Enter a verified stop name"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Vehicle Type</label>
                <select value={stopFormData.vehicle_type}
                  onChange={(event) => setStopFormData({ ...stopFormData, vehicle_type: event.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                  <option value="">Use route vehicle ({selectedStopRoute?.mode_name || 'default'})</option>
                  <option value="jeepney">Jeepney</option>
                  <option value="modern_puv">Modern PUV</option>
                  <option value="bus">Bus</option>
                  <option value="provincial_bus">Provincial Bus</option>
                  <option value="tricycle">Tricycle</option>
                  <option value="boat">Boat</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">The map icon updates to match the selected vehicle.</p>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea rows="2" value={stopFormData.description}
                  onChange={(event) => setStopFormData({ ...stopFormData, description: event.target.value })}
                  placeholder="Optional stop details"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
              </div>
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700">
                <input type="checkbox" checked={stopFormData.is_transfer_point}
                  onChange={(event) => setStopFormData({ ...stopFormData, is_transfer_point: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" />
                Transfer point
              </label>
              <LocationPinPicker
                latitude={stopFormData.latitude}
                longitude={stopFormData.longitude}
                mode={stopFormData.vehicle_type || selectedStopRoute?.mode_name}
                onPin={(latitude, longitude) => setStopFormData(previous => ({
                  ...previous,
                  latitude: latitude.toFixed(6),
                  longitude: longitude.toFixed(6),
                }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Latitude *</label>
                  <input type="number" step="any" min="-90" max="90" required value={stopFormData.latitude}
                    onChange={(event) => setStopFormData({ ...stopFormData, latitude: event.target.value })}
                    placeholder="16.0435" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Longitude *</label>
                  <input type="number" step="any" min="-180" max="180" required value={stopFormData.longitude}
                    onChange={(event) => setStopFormData({ ...stopFormData, longitude: event.target.value })}
                    placeholder="120.3340" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono" />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setStopModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl">Cancel</button>
                <button type="submit"
                  className="py-2.5 px-6 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow">
                  {editingStop ? 'Save Stop' : 'Add Stop'}
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
          <div className="min-h-screen">
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
              <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                <button
                  type="button"
                  onClick={() => setRouteModalOpen(false)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to routes
                </button>
                <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                  {editingRoute ? 'Edit Transit Route' : 'Add New Transit Route'}
                </h2>
                <span className="w-24" aria-hidden="true" />
              </div>
            </header>

            <form
              onSubmit={handleSaveRoute}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.defaultPrevented) return;
                const target = event.target;
                if (target instanceof HTMLInputElement && !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(target.type)) {
                  event.preventDefault();
                }
              }}
              className="mx-auto max-w-7xl space-y-4 px-4 py-6 text-xs sm:px-6 sm:py-8 lg:px-8"
            >
              {availableRouteDraft && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                  <span>A saved draft is available for this route.</span>
                  <button type="button" onClick={restoreRouteDraft} className="font-bold underline underline-offset-2">
                    Restore draft
                  </button>
                </div>
              )}

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
                    onChange={(e) => {
                      const transport_mode_id = parseInt(e.target.value, 10);
                      const selectedMode = modes.find((mode) => mode.id === transport_mode_id);
                      setRouteFormData((current) => ({ ...current, transport_mode_id }));
                      setRoutePathSegments((segments) => segments.map((segment, index) =>
                        index === 0 && segment.mode !== 'Walk' ? { ...segment, mode: selectedMode?.name || segment.mode } : segment
                      ));
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    {modes.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Advisory Status</label>
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

              {modes.find(m => m.id === Number(routeFormData.transport_mode_id))?.name?.toLowerCase() !== 'boat' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Operating Status</label>
                  <select
                    value={routeFormData.operating_status || 'ACTIVE'}
                    onChange={(event) => setRouteFormData({ ...routeFormData, operating_status: event.target.value })}
                    className="w-full max-w-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="UNAVAILABLE">Unavailable</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Origin Landmark</label>
                  <LocationAutocomplete
                    value={routeFormData.origin}
                    onChange={(origin) => setRouteFormData(previous => ({ ...previous, origin }))}
                    placeholder="Type or search for an origin"
                    required
                    filterType="LOCATION"
                    preventSubmitOnEnter
                    className="w-full"
                    inputClassName="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-normal"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Destination Landmark</label>
                  <LocationAutocomplete
                    value={routeFormData.destination}
                    onChange={(destination) => setRouteFormData(previous => ({ ...previous, destination }))}
                    placeholder="Type or search for a destination"
                    required
                    filterType="LOCATION"
                    preventSubmitOnEnter
                    className="w-full"
                    inputClassName="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-normal"
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
                <label className="block font-bold text-slate-700 mb-1">Passenger Service Notes</label>
                <textarea
                  rows="2"
                  value={routeFormData.service_notes || ''}
                  onChange={(event) => setRouteFormData({ ...routeFormData, service_notes: event.target.value })}
                  placeholder="Optional operating or passenger information"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="border-y border-slate-200 py-4">
                <button
                  type="button"
                  aria-expanded={routePreviewOpen}
                  onClick={() => setRoutePreviewOpen((open) => !open)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4" />
                  {routePreviewOpen ? 'Hide passenger preview' : 'Preview passenger view'}
                </button>
                {routePreviewOpen && (
                  <section className="mt-3 max-w-3xl space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Passenger route preview">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase text-slate-500">
                          {selectedPreviewDetour ? 'Flood detour passenger preview' : `${modes.find(m => m.id === Number(routeFormData.transport_mode_id))?.name || 'Transit'} route`}
                        </p>
                        <h3 className="mt-1 text-lg font-bold text-slate-900">{routeFormData.route_name || 'Route name'}</h3>
                        <p className="mt-1 text-sm text-slate-600">{routeFormData.origin || 'Origin'} to {routeFormData.destination || 'Destination'}</p>
                      </div>
                      <span className={`rounded px-2 py-1 text-xs font-bold ${routeFormData.operating_status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                        {modes.find(m => m.id === Number(routeFormData.transport_mode_id))?.name?.toLowerCase() === 'boat'
                          ? routeFormData.boat_operating_status
                          : routeFormData.operating_status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-700">
                      <span>{selectedPreviewDetour?.detour_time || routeFormData.estimated_time || '—'} min</span>
                      <span>₱{routeFormData.minimum_fare || '—'} – ₱{routeFormData.maximum_fare || '—'}</span>
                    </div>
                    {selectedPreviewDetour && selectedPreviewAdvisory && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-900">
                        Draft preview for {selectedPreviewAdvisory.title} around {selectedPreviewAdvisory.affected_road}. This does not activate the detour.
                      </p>
                    )}
                    {routeFormData.description && <p className="mt-3 text-sm text-slate-700">{routeFormData.description}</p>}
                    {routeFormData.service_notes && <p className="mt-2 border-l-2 border-emerald-600 pl-3 text-sm text-slate-600">{routeFormData.service_notes}</p>}
                    {hasPreviewableGeometry(passengerPreviewGeometry) ? (
                      <div className="relative h-56 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        <RouteMap
                        routes={[{
                          id: editingRoute?.id || 'route-preview',
                          route_name: routeFormData.route_name,
                          mode_name: modes.find(m => m.id === Number(routeFormData.transport_mode_id))?.name || '',
                          route_path_segments: selectedPreviewDetour ? [] : routePathSegments,
                          status: routeFormData.status,
                          minimum_fare: Number(routeFormData.minimum_fare) || 0,
                          maximum_fare: Number(routeFormData.maximum_fare) || 0,
                          estimated_time: Number(routeFormData.estimated_time) || 0,
                          geometry: passengerPreviewGeometry,
                          walking_geometry: routeFormData.walking_geometry,
                          geometry_needs_review: false,
                          map_preview_unavailable: routeFormData.operating_status !== 'ACTIVE',
                        }]}
                        selectedJourney={selectedPreviewDetour ? { legs: [{
                          coordinates: [],
                          floodedCoordinates: readLineStringCoordinates(selectedPreviewDetour.flooded_geometry),
                          advisoryTitle: selectedPreviewAdvisory?.title
                        }] } : null}
                        interactive={false}
                        showAdvisories={false}
                        showStopClusterCounts={false}
                        className="absolute inset-0 h-full w-full"
                        />
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-xs text-slate-500">
                        {selectedPreviewDetour ? 'Add a valid alternate route path to preview this flood detour.' : 'A valid route path is needed for the map preview.'}
                      </p>
                    )}
                    {passengerPreviewSteps.length > 0 ? (
                      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-600">
                        {passengerPreviewSteps.map((step, index) => (
                          <li key={`detour-step-${index}`}>
                            <span className="font-semibold">{step.mode}:</span> {step.instruction}
                            {step.location_info && <span className="block text-slate-500">{step.location_info}</span>}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">
                        {selectedPreviewDetour ? 'Add detour steps to preview passenger directions.' : 'No normal route directions are configured.'}
                      </p>
                    )}
                  </section>
                )}
              </div>

              {editingRoute && (
                <section className="space-y-4 border-t border-slate-200 pt-5" aria-labelledby="flooded-route-heading">
                  <div>
                    <h4 id="flooded-route-heading" className="text-base font-bold text-slate-900">Route version</h4>
                    <p className="mt-1 text-xs text-slate-500">Choose the normal route or a linked flood detour. Your edits stay separate when you switch.</p>
                  </div>
                  <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Route map to edit">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={routeMapEditorTab === 'normal'}
                      onClick={() => setRouteMapEditorTab('normal')}
                      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${routeMapEditorTab === 'normal' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}
                    >
                      <Route className="h-3.5 w-3.5" />
                      Normal route
                    </button>
                    {linkedRouteAdvisories.map((advisory) => {
                      const tabId = `detour-${advisory.id}`;
                      return (
                        <button
                          key={advisory.id}
                          type="button"
                          role="tab"
                          aria-selected={routeMapEditorTab === tabId}
                          onClick={() => setRouteMapEditorTab(tabId)}
                          className={`inline-flex h-9 max-w-full items-center gap-2 truncate rounded-md px-3 text-xs font-semibold transition ${routeMapEditorTab === tabId ? 'bg-white text-rose-800 shadow-sm ring-1 ring-rose-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Flood detour: {advisory.title}</span>
                        </button>
                      );
                    })}
                  </div>
                  {linkedRouteAdvisories.length === 0 && (
                    <p className="text-xs text-slate-500">This route is not linked to a flood, high-tide, or detour advisory.</p>
                  )}
                </section>
              )}

              {(!editingRoute || routeMapEditorTab === 'normal') && (
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="route-steps-heading">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 id="route-steps-heading" className="text-sm font-bold text-slate-900">Normal route directions</h4>
                    <p className="mt-0.5 text-xs text-slate-500">Used whenever no flood detour is active.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRouteSteps((steps) => [...steps, {
                      mode: 'Walk',
                      instruction: '',
                      location_info: '',
                    }])}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add step
                  </button>
                </div>

                {routeSteps.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                    No directions yet. Add a step to describe the route.
                  </p>
                ) : routeSteps.map((step, index) => (
                  <div key={step.id || `new-step-${index}`} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:border-slate-300">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white shadow-sm">
                      {index + 1}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                        <select
                          aria-label={`Step ${index + 1} mode`}
                          value={step.mode || 'Walk'}
                          onChange={(event) => setRouteSteps((steps) => steps.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, mode: event.target.value } : item
                          ))}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs"
                        >
                          {[...new Set(['Walk', ...modes.map((mode) => mode.name)])].map((mode) => (
                            <option key={mode} value={mode}>{mode}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          aria-label={`Step ${index + 1} instruction`}
                          value={step.instruction || ''}
                          onChange={(event) => setRouteSteps((steps) => steps.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, instruction: event.target.value } : item
                          ))}
                          placeholder="e.g. Board the tricycle toward Lucao"
                          className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
                        />
                      </div>
                      <input
                        type="text"
                        aria-label={`Step ${index + 1} details`}
                        value={step.location_info || ''}
                        onChange={(event) => setRouteSteps((steps) => steps.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, location_info: event.target.value } : item
                        ))}
                        placeholder="Optional location details"
                        className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        title="Move step up"
                        aria-label={`Move step ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => setRouteSteps((steps) => {
                          const nextSteps = [...steps];
                          [nextSteps[index - 1], nextSteps[index]] = [nextSteps[index], nextSteps[index - 1]];
                          return nextSteps;
                        })}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Move step down"
                        aria-label={`Move step ${index + 1} down`}
                        disabled={index === routeSteps.length - 1}
                        onClick={() => setRouteSteps((steps) => {
                          const nextSteps = [...steps];
                          [nextSteps[index + 1], nextSteps[index]] = [nextSteps[index], nextSteps[index + 1]];
                          return nextSteps;
                        })}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remove step"
                        aria-label={`Remove step ${index + 1}`}
                        onClick={() => setRouteSteps((steps) => steps.filter((_, itemIndex) => itemIndex !== index))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                </section>
              )}

              {(routeValidationWarnings.length > 0 || geometryValidation?.errors?.length > 0) && (
                <div className={`rounded-md border p-3 ${geometryValidation?.errors?.length ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`} role="status">
                  <p className="font-bold">Route review</p>
                  {geometryValidation?.errors?.map((message, index) => <p key={`error-${index}`} className="mt-1">Error: {message}</p>)}
                  {routeValidationWarnings.map((message, index) => <p key={`warning-${index}`} className="mt-1">Warning: {message}</p>)}
                </div>
              )}

              {editingRoute && (
                <section className="space-y-3" aria-label="Selected flood detour editor">
                  {linkedRouteAdvisories.map((advisory) => {
                    if (routeMapEditorTab !== `detour-${advisory.id}`) return null;
                    const config = routeFormData.advisory_detours?.[advisory.id] || advisory.routeConfig;
                    return (
                      <div key={advisory.id} role="tabpanel" className="space-y-4 rounded-xl border border-rose-200 bg-white p-4 shadow-sm sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{advisory.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{advisory.affected_road}</p>
                          </div>
                          <label className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={config.detour_enabled === true}
                              onChange={(event) => updateRouteAdvisoryDetour(advisory.id, { detour_enabled: event.target.checked })}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            Enable detour for this advisory
                          </label>
                        </div>
                        <label className="block max-w-xs text-xs font-semibold text-slate-700">
                          Detour travel time (minutes)
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={config.detour_time || ''}
                            onChange={(event) => updateRouteAdvisoryDetour(advisory.id, { detour_time: event.target.value })}
                            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                        <RouteGeometryEditor
                          key={`route-${editingRoute.id}-advisory-${advisory.id}`}
                          value={config.detour_geometry || ''}
                          onChange={(detour_geometry) => updateRouteAdvisoryDetour(advisory.id, { detour_geometry })}
                          walkingValue={config.flooded_geometry || ''}
                          onWalkingChange={(flooded_geometry) => updateRouteAdvisoryDetour(advisory.id, { flooded_geometry })}
                          token={token}
                          color="#0f766e"
                          walkingColor="#dc2626"
                          routeLabel="Alternate detour"
                          walkingLabel="Flooded road"
                        />
                        <DetourStepsEditor
                          steps={config.detour_steps || []}
                          modes={modes}
                          onChange={(detour_steps) => updateRouteAdvisoryDetour(advisory.id, {
                            detour_steps,
                            detour_instructions: detourInstructionText(detour_steps)
                          })}
                        />
                        {config.detour_enabled === true && (!config.flooded_geometry || !config.detour_geometry ||
                          !config.detour_steps?.length || config.detour_steps.some((step) => !step.instruction?.trim())) && (
                          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900" role="status">
                            Add both map paths and complete every detour step before publishing.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              {(!editingRoute || routeMapEditorTab === 'normal') && (
                <section ref={routePathEditorRef} className="route-path-editor-shell space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Route legs and path editor">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Route legs</h4>
                      <p className="mt-1 text-xs text-slate-500">Set each part of the journey to a vehicle or walking, then draw its path.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addRoutePathSegment}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="h-4 w-4" /> Add leg
                    </button>
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      Publish route
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Route legs">
                    {routePathSegments.map((segment, index) => (
                      <button
                        key={`route-leg-tab-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={activePathSegmentIndex === index}
                        onClick={() => setActivePathSegmentIndex(index)}
                        className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold ${activePathSegmentIndex === index ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70'}`}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getRouteModeColor(segment.mode) }} aria-hidden="true" />
                        Leg {index + 1}: {segment.mode || 'Choose mode'}
                      </button>
                    ))}
                  </div>

                  {routePathSegments[activePathSegmentIndex] && (() => {
                    const activeSegment = routePathSegments[activePathSegmentIndex];
                    const activeMode = activeSegment.mode || 'Walk';
                    const isWalking = activeMode.toLowerCase().includes('walk');
                    return (
                      <>
                        <div className="flex flex-wrap items-end justify-between gap-3">
                          <label className="block min-w-[200px] flex-1 text-xs font-bold text-slate-700">
                            Leg {activePathSegmentIndex + 1} mode
                            <select
                              value={activeMode}
                              onChange={(event) => updateRoutePathSegment(activePathSegmentIndex, { mode: event.target.value })}
                              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium"
                            >
                              <option value="Walk">Walking</option>
                              {modes.map((mode) => <option key={mode.id} value={mode.name}>{mode.name}</option>)}
                            </select>
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              title="Move leg earlier"
                              aria-label="Move leg earlier"
                              disabled={activePathSegmentIndex === 0}
                              onClick={() => moveRoutePathSegment(activePathSegmentIndex, -1)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 disabled:opacity-40"
                            ><ArrowUp className="h-4 w-4" /></button>
                            <button
                              type="button"
                              title="Move leg later"
                              aria-label="Move leg later"
                              disabled={activePathSegmentIndex === routePathSegments.length - 1}
                              onClick={() => moveRoutePathSegment(activePathSegmentIndex, 1)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 disabled:opacity-40"
                            ><ArrowDown className="h-4 w-4" /></button>
                            <button
                              type="button"
                              title="Remove this leg"
                              aria-label="Remove this leg"
                              disabled={routePathSegments.length <= 1}
                              onClick={() => removeRoutePathSegment(activePathSegmentIndex)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-700 disabled:opacity-40"
                            ><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>

                        <RouteGeometryEditor
                          key={`route-${editingRoute?.id || 'new'}-path-leg-${activePathSegmentIndex}`}
                          value={activeSegment.geometry || ''}
                          onChange={(geometry) => updateRoutePathSegment(activePathSegmentIndex, { geometry })}
                          token={token}
                          color={getRouteModeColor(activeMode)}
                          routeLabel={`${activeMode} leg`}
                          allowRoadSnap={!activeMode.toLowerCase().includes('boat')}
                          showPathTabs={false}
                          dashed={isWalking}
                          contextPaths={routePathSegments
                            .filter((_, segmentIndex) => segmentIndex !== activePathSegmentIndex)
                            .map((segment) => ({
                              ...segment,
                              color: getRouteModeColor(segment.mode),
                              dashed: String(segment.mode || '').toLowerCase().includes('walk')
                            }))}
                          stops={routeStops.map((stop) => ({
                            ...stop,
                            route_name: routes.find((route) => String(route.id) === String(stop.route_id))?.route_name,
                          }))}
                          onStopSelected={(stop, endpoint) => handleRouteStopSelected(stop, endpoint, activePathSegmentIndex)}
                          fullscreenTargetRef={routePathEditorRef}
                        />
                      </>
                    );
                  })()}
                </section>
              )}

              <section className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl">
                  <h4 className="text-sm font-bold text-amber-950">Web Map review bypass</h4>
                  <p className="mt-1 text-xs leading-relaxed text-amber-900">
                    Allow this valid route line to appear on the Web Map even if it is too sparse for the detail check. Its public route page will still show the unverified warning.
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={routeFormData.allow_unverified_map_geometry === true}
                  disabled={!hasPreviewableGeometry(routeFormData.geometry)}
                  onClick={() => setRouteFormData((current) => ({
                    ...current,
                    allow_unverified_map_geometry: !current.allow_unverified_map_geometry
                  }))}
                  className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${routeFormData.allow_unverified_map_geometry ? 'border-amber-700 bg-amber-700 text-white hover:bg-amber-800' : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100'}`}
                >
                  <Eye className="h-4 w-4" />
                  {routeFormData.allow_unverified_map_geometry ? 'Bypass enabled' : 'Allow unverified map display'}
                </button>
              </section>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRouteModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={discardRouteChanges}
                  className="py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold rounded-xl"
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  onClick={saveRouteDraft}
                  className="py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-xl"
                >
                  Save draft
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 bg-slate-900 hover:bg-emerald-600 text-white font-bold rounded-xl shadow"
                >
                  Publish Route
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
              {advisorySaveError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
                  {advisorySaveError}
                </div>
              )}
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
                            const isChecked = e.target.checked;
                            setAdvisoryFormData((current) => {
                              const routeDetours = { ...(current.route_detours || {}) };
                              const routeIds = isChecked
                                ? [...new Set([...current.route_ids, r.id])]
                                : current.route_ids.filter(id => id !== r.id);
                              if (isChecked) {
                                routeDetours[r.id] ||= {
                                  detour_enabled: false,
                                  flooded_geometry: '',
                                  detour_geometry: '',
                                  detour_steps: [],
                                  detour_instructions: '',
                                  detour_time: r.detour_time || ''
                                };
                              } else {
                                delete routeDetours[r.id];
                              }
                              return { ...current, route_ids: routeIds, route_detours: routeDetours };
                            });
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-slate-800 font-medium">{r.route_name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {advisoryFormData.route_ids.length > 0 && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                  Affected routes are linked here. To edit a route's flooded path, detour map, and passenger directions, use that route's editor under Routes &amp; Travel Times.
                </p>
              )}

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

      {/* ========================================================================= */}
      {/* FARE ADD/EDIT MODAL */}
      {/* ========================================================================= */}
      {fareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setFareModalOpen(false)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-slate-900 mb-1">
              {editingFare ? 'Edit Fare Record' : 'Add Fare Record'}
            </h3>
            <p className="text-xs text-slate-500 mb-5 capitalize">
              Category: <strong>{fareModalCategory.replace('_', ' ')}</strong>
            </p>

            <form onSubmit={handleSaveFare} className="space-y-4">

              {/* ── TRICYCLE FIELDS ── */}
              {fareModalCategory === 'tricycle' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Zone Category</label>
                    <select
                      value={fareFormData.zone}
                      onChange={(e) => setFareFormData(p => ({ ...p, zone: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                      required
                    >
                      <option value="Zone 1">Zone 1</option>
                      <option value="Zone 2">Zone 2</option>
                      <option value="Zone 3">Zone 3</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Barangay <span className="text-rose-500">*</span></label>
                    <input type="text" value={fareFormData.barangay} onChange={(e) => setFareFormData(p => ({ ...p, barangay: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Description & Key Landmarks</label>
                    <textarea rows={2} value={fareFormData.landmarks} onChange={(e) => setFareFormData(p => ({ ...p, landmarks: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Solo Fare — Min (₱)</label>
                      <input type="number" min="0" value={fareFormData.solo_fare_min} onChange={(e) => setFareFormData(p => ({ ...p, solo_fare_min: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Solo Fare — Max (₱)</label>
                      <input type="number" min="0" value={fareFormData.solo_fare_max} onChange={(e) => setFareFormData(p => ({ ...p, solo_fare_max: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">2-Pax Fare — Min (₱)</label>
                      <input type="number" min="0" value={fareFormData.fare_per_2pax_min} onChange={(e) => setFareFormData(p => ({ ...p, fare_per_2pax_min: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">2-Pax Fare — Max (₱)</label>
                      <input type="number" min="0" value={fareFormData.fare_per_2pax_max} onChange={(e) => setFareFormData(p => ({ ...p, fare_per_2pax_max: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">3-Pax Shared — Min (₱)</label>
                      <input type="number" min="0" value={fareFormData.fare_per_3pax_min} onChange={(e) => setFareFormData(p => ({ ...p, fare_per_3pax_min: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">3-Pax Shared — Max (₱)</label>
                      <input type="number" min="0" value={fareFormData.fare_per_3pax_max} onChange={(e) => setFareFormData(p => ({ ...p, fare_per_3pax_max: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                  </div>
                </>
              )}

              {/* ── BOAT FIELDS ── */}
              {fareModalCategory === 'boat' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Service Type <span className="text-rose-500">*</span></label>
                    <input type="text" value={fareFormData.service_type} onChange={(e) => setFareFormData(p => ({ ...p, service_type: e.target.value }))}
                      placeholder="e.g. Motorized Banca Ferry" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Dock Location</label>
                    <input type="text" value={fareFormData.dock_location} onChange={(e) => setFareFormData(p => ({ ...p, dock_location: e.target.value }))}
                      placeholder="e.g. Pantal River Ferry Terminal" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Destinations Covered</label>
                    <textarea rows={2} value={fareFormData.destinations} onChange={(e) => setFareFormData(p => ({ ...p, destinations: e.target.value }))}
                      placeholder="e.g. Bonuan Gueset, Pantal Bridge area" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Fare / Rate Range Note</label>
                    <input type="text" value={fareFormData.fare_rate_note} onChange={(e) => setFareFormData(p => ({ ...p, fare_rate_note: e.target.value }))}
                      placeholder="e.g. ₱10 – ₱20 per person" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" />
                  </div>
                </>
              )}

              {/* ── ROUTE FARE FIELDS (jeepney / modern_puv) ── */}
              {fareModalCategory !== 'tricycle' && fareModalCategory !== 'boat' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Transport Mode</label>
                    <input type="text" value={fareModalCategory.replace('_', ' ')} readOnly
                      className="w-full px-3 py-2 border border-slate-100 bg-slate-50 rounded-xl text-sm text-slate-500 capitalize" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Route Name <span className="text-rose-500">*</span></label>
                    <input type="text" value={fareFormData.route_name} onChange={(e) => setFareFormData(p => ({ ...p, route_name: e.target.value }))}
                      placeholder="e.g. Dagupan – Calasiao" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Origin / Main Terminal</label>
                    <input type="text" value={fareFormData.terminal} onChange={(e) => setFareFormData(p => ({ ...p, terminal: e.target.value }))}
                      placeholder="e.g. Dagupan Bus Terminal, A.B. Fernandez Ave." className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Key Waypoints / Vehicle Type</label>
                    <textarea rows={2} value={fareFormData.waypoints} onChange={(e) => setFareFormData(p => ({ ...p, waypoints: e.target.value }))}
                      placeholder="e.g. Barangays served or vehicle type" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Distance</label>
                    <input type="text" value={fareFormData.distance_km} onChange={(e) => setFareFormData(p => ({ ...p, distance_km: e.target.value }))}
                      placeholder="e.g. ~8 km" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Regular Fare — Min (₱)</label>
                      <input type="number" min="0" value={fareFormData.regular_fare_min} onChange={(e) => setFareFormData(p => ({ ...p, regular_fare_min: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Regular Fare — Max (₱)</label>
                      <input type="number" min="0" value={fareFormData.regular_fare_max} onChange={(e) => setFareFormData(p => ({ ...p, regular_fare_max: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Discounted Fare — Min (₱)</label>
                      <input type="number" min="0" value={fareFormData.discounted_fare_min} onChange={(e) => setFareFormData(p => ({ ...p, discounted_fare_min: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Discounted Fare — Max (₱)</label>
                      <input type="number" min="0" value={fareFormData.discounted_fare_max} onChange={(e) => setFareFormData(p => ({ ...p, discounted_fare_max: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600" required />
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFareModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-6 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow transition-all"
                >
                  {editingFare ? 'Save Changes' : 'Add Fare Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(adminDialog)}
        title={adminDialog?.title || ''}
        message={adminDialog?.message || ''}
        confirmLabel={adminDialog?.confirmLabel}
        showCancel={adminDialog?.showCancel}
        tone={adminDialog?.tone}
        onCancel={() => finishAdminDialog(false)}
        onConfirm={() => finishAdminDialog(true)}
      />

    </div>
  );
}
