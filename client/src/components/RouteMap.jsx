import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

// Fix Leaflet default icon paths under Vite bundler
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ─── Zoom thresholds ────────────────────────────────────────────────────────
const ZOOM_SHOW_MARKERS = 14; // individual stop / school / landmark markers
const CLUSTER_MAX_ZOOM  = 15; // cluster collapses below this zoom

// ─── GeoJSON → Leaflet [lat, lng] array ─────────────────────────────────────
function getRoutePolylineCoords(route) {
  if (!route) return [];
  if (route.geometry) {
    try {
      const geom = typeof route.geometry === 'string'
        ? JSON.parse(route.geometry)
        : route.geometry;
      if (geom?.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
        return geom.coordinates.map(c => [c[1], c[0]]);
      }
    } catch (e) { /* fall through */ }
  }
  if (Array.isArray(route.stops) && route.stops.length >= 2) {
    return route.stops
      .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map(s => [s.latitude, s.longitude]);
  }
  return [];
}

// ─── Route colour by mode ─────────────────────────────────────────────────
function routeColor(mode = '') {
  const m = mode.toLowerCase();
  if (m.includes('boat'))   return '#2563eb'; // blue
  if (m.includes('jeep'))   return '#ec4899'; // pink
  if (m.includes('bus'))    return '#10b981'; // green
  return '#06b6d4';                           // cyan = tricycle / default
}

// ─── DivIcon factories ────────────────────────────────────────────────────
function createStopIcon(stop, isOrigin, isDest, color) {
  let bg   = color;
  let size = 16;
  let label = stop.stop_order ?? '';
  if (isOrigin)              { bg = '#059669'; size = 20; label = 'A'; }
  else if (isDest)           { bg = '#e11d48'; size = 20; label = 'B'; }
  else if (stop.is_transfer_point) { bg = '#0f172a'; size = 18; label = 'T'; }

  return L.divIcon({
    className: 'custom-stop-div-icon',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};
      border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;
      align-items:center;justify-content:center;color:#fff;
      font-family:system-ui,sans-serif;font-size:${size > 16 ? '10px' : '9px'};
      font-weight:800;line-height:1;">${label}</div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createLandmarkIcon() {
  return L.divIcon({
    className: 'custom-landmark-div-icon',
    html: `<div style="width:14px;height:14px;border-radius:3px;background:#6366f1;
      border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.35);display:flex;
      align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:bold;">★</div>`,
    iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -7],
  });
}

function createLocationIcon(loc) {
  const type = (loc.type || '').toUpperCase();
  const map = {
    RIVER_STOP:    { bg: '#0284c7', sym: '⚓', sz: 22 },
    STREET:        { bg: '#475569', sym: '≡',  sz: 16 },
    TERMINAL:      { bg: '#ea580c', sym: 'T',  sz: 18 },
    ESTABLISHMENT: { bg: '#8b5cf6', sym: 'E',  sz: 16 },
    BARANGAY:      { bg: '#0d9488', sym: 'B',  sz: 16 },
    INTERSECTION:  { bg: '#64748b', sym: '+',  sz: 14 },
    STOP:          { bg: '#10b981', sym: '●',  sz: 14 },
  };
  const { bg = '#6366f1', sym = '★', sz = 18 } = map[type] || {};
  return L.divIcon({
    className: 'custom-loc-div-icon',
    html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};
      border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;
      align-items:center;justify-content:center;color:#fff;
      font-size:${sz >= 18 ? '10px' : '9px'};font-weight:800;">${sym}</div>`,
    iconSize:    [sz, sz],
    iconAnchor:  [sz / 2, sz / 2],
    popupAnchor: [0, -sz / 2],
  });
}

function createSchoolIcon() {
  return L.divIcon({
    className: 'custom-school-div-icon',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:#4f46e5;
      border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;
      align-items:center;justify-content:center;color:#fff;font-size:11px;">🎓</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11],
  });
}

// ─── Popup HTML helpers ───────────────────────────────────────────────────
function stopPopupHtml(stop, route, color) {
  const isOrigin = stop._isOrigin, isDest = stop._isDest;
  return `<div style="font-family:sans-serif;min-width:160px">
    <div style="font-size:10px;font-weight:bold;color:${color}">
      STOP #${stop.stop_order} ${isOrigin ? '(START)' : isDest ? '(TERMINUS)' : stop.is_transfer_point ? '(TRANSFER)' : ''}
    </div>
    <div style="font-size:12px;font-weight:bold;color:#0f172a;margin:2px 0">${stop.stop_name}</div>
    <div style="font-size:11px;color:#64748b">${route.route_name}</div>
  </div>`;
}

function routePopupHtml(route, color) {
  const isUnavail = route.status === 'UNAVAILABLE';
  const isDetour  = route.status === 'DETOUR_ACTIVE';
  return `<div style="font-family:sans-serif;min-width:180px">
    <span style="font-size:10px;font-weight:bold;text-transform:uppercase;color:#64748b">${route.mode_name}</span>
    <h4 style="margin:2px 0 6px;font-size:13px;font-weight:bold;color:#0f172a">${route.route_name}</h4>
    <p style="margin:0;font-size:11px;color:#475569">
      Fare: ₱${Math.round(route.minimum_fare)} – ₱${Math.round(route.maximum_fare)}<br/>
      Travel Time: ${route.active_travel_time || route.estimated_time} mins
    </p>
    ${isUnavail ? `<span style="display:inline-block;margin-top:6px;font-size:10px;font-weight:bold;color:#dc2626;background:#fee2e2;padding:2px 6px;border-radius:4px">🚫 Service Suspended</span>` : ''}
    ${isDetour  ? `<span style="display:inline-block;margin-top:6px;font-size:10px;font-weight:bold;color:#b45309;background:#fef3c7;padding:2px 6px;border-radius:4px">⚠️ Detour Active</span>` : ''}
  </div>`;
}

function schoolPopupHtml(sch, onSelect) {
  let nearbyStops = [];
  if (Array.isArray(sch.nearby_stops)) nearbyStops = sch.nearby_stops;
  else if (typeof sch.nearby_stops === 'string') {
    try { nearbyStops = JSON.parse(sch.nearby_stops); } catch (e) {}
  }
  const nearby = nearbyStops.slice(0, 2)
    .map(st => `<div style="font-size:10px;color:#334155">• ${st.stop_name} (${st.mode}) ~${st.distance_meters}m</div>`)
    .join('');
  return `<div style="font-family:sans-serif;min-width:190px">
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
      <span style="font-size:9px;font-weight:bold;color:#4f46e5;text-transform:uppercase">🎓 ${sch.type}</span>
      <span style="font-size:9px;font-weight:bold;color:#059669;background:#ecfdf5;padding:1px 5px;border-radius:4px">Verified Dagupan</span>
    </div>
    <div style="font-size:13px;font-weight:bold;color:#0f172a;margin:2px 0">${sch.name}</div>
    ${sch.barangay ? `<div style="font-size:11px;color:#475569;margin-bottom:4px">Brgy. ${sch.barangay}</div>` : ''}
    ${nearbyStops.length > 0 ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0">
      <div style="font-size:10px;font-weight:bold;color:#64748b;margin-bottom:2px">Nearby Transit:</div>
      ${nearby}
    </div>` : ''}
  </div>`;
}

function locationPopupHtml(loc) {
  return `<div style="font-family:sans-serif;min-width:160px">
    <div style="font-size:9px;font-weight:bold;color:#0284c7;text-transform:uppercase">${loc.type}</div>
    <div style="font-size:12px;font-weight:bold;color:#0f172a;margin:2px 0">${loc.name}</div>
    ${loc.address ? `<div style="font-size:10px;color:#64748b">${loc.address}</div>` : ''}
    ${loc.description ? `<div style="font-size:10px;color:#475569;margin-top:4px">${loc.description}</div>` : ''}
  </div>`;
}

// ─── Core imperative layer manager ─────────────────────────────────────────
function LayerManager({
  routes,
  activeFilter,
  showLandmarks,
  showLocations,
  showSchools,
  schools,
  locations,
  landmarks,
  showAdvisories,
  selectedJourney,
  onSelect,
}) {
  const map = useMap();

  // Stable refs so effects can clean up previous layers
  const layerRefs = useRef({
    flood:      null,  // L.polyline (flood advisory)
    routeLines: {},    // { routeId: L.polyline }
    stopCluster: null, // L.markerClusterGroup
    schoolCluster: null,
    locationCluster: null,
    landmarkCluster: null,
    journeyGroup: null,
  });

  // ── Resize / bounds helper ──────────────────────────────────────────────
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);
    let ro;
    const container = map.getContainer();
    if (container && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(container);
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (ro) ro.disconnect();
    };
  }, [map]);

  // ── Fit bounds to selected journey ──────────────────────────────────────
  useEffect(() => {
    if (!selectedJourney?.legs?.length) return;
    const pts = [];
    selectedJourney.legs.forEach(leg => {
      (leg.coordinates || leg.geometry?.coordinates || []).forEach(c => {
        if (Array.isArray(c) && c.length >= 2) pts.push([c[1], c[0]]);
      });
    });
    if (pts.length > 0) map.fitBounds(pts, { padding: [50, 50], maxZoom: 16 });
  }, [selectedJourney, map]);

  // ── Fit bounds when filter changes (but no journey active) ───────────────
  useEffect(() => {
    if (selectedJourney || !routes.length) return;
    if (activeFilter !== 'ALL' && activeFilter !== 'FLOOD') {
      const filtered = routes.filter(r =>
        (r.mode_name || '').toLowerCase().includes(activeFilter.toLowerCase())
      );
      const pts = [];
      filtered.forEach(r => getRoutePolylineCoords(r).forEach(p => pts.push(p)));
      if (pts.length > 0) map.fitBounds(pts, { padding: [35, 35] });
    } else if (activeFilter === 'FLOOD') {
      map.setView([16.0440, 120.3380], 14);
    }
  }, [activeFilter, routes, selectedJourney, map]);

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 1 — Flood advisory (always bottom: drawn first)
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const refs = layerRefs.current;
    if (refs.flood) { refs.flood.remove(); refs.flood = null; }

    const showFlood = showAdvisories && (activeFilter === 'ALL' || activeFilter === 'FLOOD');
    if (!showFlood) return;

    refs.flood = L.polyline(
      [[16.0420, 120.3345], [16.0440, 120.3380], [16.0460, 120.3420]],
      {
        color: '#f59e0b',
        weight: activeFilter === 'FLOOD' ? 14 : 9,
        opacity: 0.75,
        lineCap: 'round',
        // pane: 'overlayPane' — default, keeps it beneath markers automatically
      }
    )
      .bindPopup(`<div style="font-family:sans-serif;min-width:180px">
        <div style="color:#b45309;font-weight:bold;font-size:11px;margin-bottom:4px">⚠️ ACTIVE FLOOD ADVISORY</div>
        <div style="font-size:12px;font-weight:bold;color:#0f172a">AB Fernandez Avenue</div>
        <div style="font-size:11px;color:#475569;margin-top:2px">Water level elevated during high tide.
        Routes 3, 4, and 5 reflect detour bypass.</div>
      </div>`)
      .on('click', () => onSelect?.('advisory', {
        title: 'AB Fernandez Ave Flooding',
        description: 'High tide overflow has created standing water on the lower roadway. Commuter routes reflect active detours.'
      }))
      .addTo(map);

    return () => { refs.flood?.remove(); refs.flood = null; };
  }, [map, showAdvisories, activeFilter, onSelect]);

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 2 — Route polylines (recede at rest; boost on hover)
  //   - Default: weight 3, opacity 0.50 — the tangle recedes visually
  //   - Hover / selected: weight 6, opacity 0.95 — brought to front
  //   - Genuine mode filtering: only matching mode is added to map
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const refs = layerRefs.current;

    // Remove all previous route polylines
    Object.values(refs.routeLines).forEach(pl => pl.remove());
    refs.routeLines = {};

    if (!routes.length) return;

    // Determine which routes to show
    const visible = routes.filter(route => {
      const mode = (route.mode_name || '').toLowerCase();
      if (activeFilter === 'ALL' || activeFilter === 'FLOOD') return true;
      return mode.includes(activeFilter.toLowerCase());
    });

    visible.forEach((route, routeIdx) => {
      const coords = getRoutePolylineCoords(route);
      if (coords.length < 2) return;

      const mode = (route.mode_name || '').toLowerCase();
      const isBoat     = mode.includes('boat');
      const isDetour   = route.status === 'DETOUR_ACTIVE';
      const isUnavail  = route.status === 'UNAVAILABLE';
      const color = isUnavail ? '#94a3b8' : isDetour ? '#f59e0b' : routeColor(mode);

      const pl = L.polyline(coords, {
        color,
        weight:    3,
        opacity:   0.50,
        dashArray: isBoat ? '8, 8' : isDetour ? '8, 8' : undefined,
        lineCap:   'round',
      });

      // Hover: boost → bring-to-front, dim others
      pl.on('mouseover', () => {
        pl.setStyle({ weight: 6, opacity: 0.95 });
        pl.bringToFront();
      });
      pl.on('mouseout', () => {
        pl.setStyle({ weight: 3, opacity: 0.50 });
      });
      pl.on('click', () => {
        onSelect?.('route', route);
        // Persistent highlight until another route is clicked or map click clears
        pl.setStyle({ weight: 6, opacity: 0.95 });
        pl.bringToFront();
      });

      pl.bindPopup(routePopupHtml(route, color));
      pl.addTo(map);
      refs.routeLines[route.id] = pl;
    });

    // Clear persistent highlights on map background click
    const clearHighlight = () => {
      Object.values(refs.routeLines).forEach(pl =>
        pl.setStyle({ weight: 3, opacity: 0.50 })
      );
    };
    map.on('click', clearHighlight);
    return () => {
      Object.values(refs.routeLines).forEach(pl => pl.remove());
      refs.routeLines = {};
      map.off('click', clearHighlight);
    };
  }, [map, routes, activeFilter, onSelect]);

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 3 — Clustered point markers (stops, schools, locations, landmarks)
  //   - Each category gets its own MarkerClusterGroup
  //   - Entire cluster group is added/removed based on zoom (≥ ZOOM_SHOW_MARKERS)
  //     AND the appropriate toggle flag
  //   - Flood zone markers stay outside clustering
  // ══════════════════════════════════════════════════════════════════════════

  // Helper: create or recreate a cluster group
  function makeClusterGroup(color = '#64748b') {
    return L.markerClusterGroup({
      maxClusterRadius: 40,
      disableClusteringAtZoom: CLUSTER_MAX_ZOOM + 1,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
          className: 'custom-cluster-icon',
          html: `<div style="
            width:32px;height:32px;border-radius:50%;background:${color};
            border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
            display:flex;align-items:center;justify-content:center;
            color:#fff;font-size:11px;font-weight:800;line-height:1;">${count}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
      },
    });
  }

  // ── Stop markers cluster ──────────────────────────────────────────────────
  useEffect(() => {
    const refs = layerRefs.current;
    if (refs.stopCluster) { refs.stopCluster.remove(); refs.stopCluster = null; }

    const cluster = makeClusterGroup('#64748b');

    const visible = routes.filter(route => {
      const mode = (route.mode_name || '').toLowerCase();
      if (activeFilter === 'ALL' || activeFilter === 'FLOOD') return true;
      return mode.includes(activeFilter.toLowerCase());
    });

    visible.forEach(route => {
      const color = routeColor(route.mode_name || '');
      (route.stops || []).forEach((stop, idx) => {
        if (typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') return;
        const isOrigin = idx === 0;
        const isDest   = idx === route.stops.length - 1;
        const marker = L.marker(
          [stop.latitude, stop.longitude],
          { icon: createStopIcon({ ...stop, _isOrigin: isOrigin, _isDest: isDest }, isOrigin, isDest, color) }
        );
        marker.bindPopup(stopPopupHtml({ ...stop, _isOrigin: isOrigin, _isDest: isDest }, route, color));
        marker.on('click', () => onSelect?.('stop', { ...stop, routeName: route.route_name }));
        cluster.addLayer(marker);
      });
    });

    refs.stopCluster = cluster;

    // Add/remove based on zoom
    function syncStopCluster() {
      const z = map.getZoom();
      if (z >= ZOOM_SHOW_MARKERS) {
        if (!map.hasLayer(cluster)) cluster.addTo(map);
      } else {
        if (map.hasLayer(cluster)) cluster.remove();
      }
    }

    map.on('zoomend', syncStopCluster);
    syncStopCluster(); // run immediately on mount

    return () => {
      map.off('zoomend', syncStopCluster);
      cluster.remove();
      refs.stopCluster = null;
    };
  }, [map, routes, activeFilter, onSelect]);

  // ── School markers cluster ────────────────────────────────────────────────
  useEffect(() => {
    const refs = layerRefs.current;
    if (refs.schoolCluster) { refs.schoolCluster.remove(); refs.schoolCluster = null; }
    if (!showSchools || !schools.length) return;

    const cluster = makeClusterGroup('#4f46e5');

    schools.forEach(sch => {
      const lat = sch.entrance_latitude ?? sch.latitude;
      const lng = sch.entrance_longitude ?? sch.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      const marker = L.marker([lat, lng], { icon: createSchoolIcon() });
      marker.bindPopup(schoolPopupHtml(sch, onSelect));
      marker.on('click', () => onSelect?.('school', sch));
      cluster.addLayer(marker);
    });

    refs.schoolCluster = cluster;

    function syncSchoolCluster() {
      const z = map.getZoom();
      if (z >= ZOOM_SHOW_MARKERS) {
        if (!map.hasLayer(cluster)) cluster.addTo(map);
      } else {
        if (map.hasLayer(cluster)) cluster.remove();
      }
    }

    map.on('zoomend', syncSchoolCluster);
    syncSchoolCluster();

    return () => {
      map.off('zoomend', syncSchoolCluster);
      cluster.remove();
      refs.schoolCluster = null;
    };
  }, [map, schools, showSchools, onSelect]);

  // ── Location markers cluster ──────────────────────────────────────────────
  useEffect(() => {
    const refs = layerRefs.current;
    if (refs.locationCluster) { refs.locationCluster.remove(); refs.locationCluster = null; }
    if (!showLocations || !locations.length) return;

    const cluster = makeClusterGroup('#0284c7');

    locations.forEach(loc => {
      if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;
      const marker = L.marker([loc.latitude, loc.longitude], { icon: createLocationIcon(loc) });
      marker.bindPopup(locationPopupHtml(loc));
      marker.on('click', () => onSelect?.('location', loc));
      cluster.addLayer(marker);
    });

    refs.locationCluster = cluster;

    function syncLocCluster() {
      const z = map.getZoom();
      if (z >= ZOOM_SHOW_MARKERS) {
        if (!map.hasLayer(cluster)) cluster.addTo(map);
      } else {
        if (map.hasLayer(cluster)) cluster.remove();
      }
    }

    map.on('zoomend', syncLocCluster);
    syncLocCluster();

    return () => {
      map.off('zoomend', syncLocCluster);
      cluster.remove();
      refs.locationCluster = null;
    };
  }, [map, locations, showLocations, onSelect]);

  // ── Landmark markers cluster ──────────────────────────────────────────────
  useEffect(() => {
    const refs = layerRefs.current;
    if (refs.landmarkCluster) { refs.landmarkCluster.remove(); refs.landmarkCluster = null; }
    if (!showLandmarks || !landmarks.length) return;

    const cluster = makeClusterGroup('#6366f1');

    landmarks.forEach(lm => {
      if (typeof lm.latitude !== 'number' || typeof lm.longitude !== 'number') return;
      const marker = L.marker([lm.latitude, lm.longitude], { icon: createLandmarkIcon() });
      marker.bindPopup(`<div style="font-family:sans-serif;min-width:150px">
        <div style="font-size:9px;font-weight:bold;color:#6366f1;text-transform:uppercase">${lm.type} LANDMARK</div>
        <div style="font-size:12px;font-weight:bold;color:#0f172a;margin:2px 0">${lm.name}</div>
      </div>`);
      marker.on('click', () => onSelect?.('landmark', lm));
      cluster.addLayer(marker);
    });

    refs.landmarkCluster = cluster;

    function syncLmCluster() {
      const z = map.getZoom();
      if (z >= ZOOM_SHOW_MARKERS) {
        if (!map.hasLayer(cluster)) cluster.addTo(map);
      } else {
        if (map.hasLayer(cluster)) cluster.remove();
      }
    }

    map.on('zoomend', syncLmCluster);
    syncLmCluster();

    return () => {
      map.off('zoomend', syncLmCluster);
      cluster.remove();
      refs.landmarkCluster = null;
    };
  }, [map, landmarks, showLandmarks, onSelect]);

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 4 — Selected journey overlay (always on top)
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const refs = layerRefs.current;
    if (refs.journeyGroup) { refs.journeyGroup.remove(); refs.journeyGroup = null; }
    if (!selectedJourney?.legs?.length) return;

    const group = L.layerGroup();

    selectedJourney.legs.forEach((leg, lIdx) => {
      const coords = (leg.coordinates || leg.geometry?.coordinates || []).map(c => [c[1], c[0]]);
      if (coords.length < 2) return;

      const isWalk = leg.type === 'WALK';
      const mode   = (leg.mode || '').toLowerCase();
      let color = '#2563eb';
      if (mode.includes('jeep'))     color = '#ec4899';
      else if (mode.includes('bus')) color = '#10b981';
      else if (mode.includes('tri')) color = '#06b6d4';
      else if (mode.includes('boat'))color = '#2563eb';
      else if (isWalk)               color = '#3b82f6';

      const pl = L.polyline(coords, {
        color,
        weight:    isWalk ? 5 : 8,
        opacity:   0.95,
        dashArray: isWalk ? '6, 8' : undefined,
        lineCap:   'round',
      }).bindPopup(`<div style="font-family:sans-serif;min-width:150px">
        <div style="font-size:10px;font-weight:bold;color:${color};text-transform:uppercase">
          ${leg.mode} (${leg.durationFormatted})</div>
        <div style="font-size:12px;font-weight:bold;color:#0f172a;margin:2px 0">${leg.instruction}</div>
        <div style="font-size:10px;color:#64748b">Distance: ${leg.distanceMeters}m</div>
      </div>`);
      group.addLayer(pl);
    });

    // Origin pin
    const firstLeg  = selectedJourney.legs[0];
    const firstCoord = firstLeg?.coordinates?.[0];
    if (firstCoord) {
      group.addLayer(
        L.marker([firstCoord[1], firstCoord[0]], {
          icon: createStopIcon({ stop_order: 'A' }, true, false, '#059669'),
        }).bindPopup('<div style="font-family:sans-serif"><span style="font-size:10px;font-weight:bold;color:#059669">TRIP ORIGIN (A)</span></div>')
      );
    }

    // Destination pin
    const lastLeg = selectedJourney.legs[selectedJourney.legs.length - 1];
    const lastCoords = lastLeg?.coordinates || lastLeg?.geometry?.coordinates;
    if (lastCoords?.length) {
      const end = lastCoords[lastCoords.length - 1];
      group.addLayer(
        L.marker([end[1], end[0]], {
          icon: createStopIcon({ stop_order: 'B' }, false, true, '#e11d48'),
        }).bindPopup('<div style="font-family:sans-serif"><span style="font-size:10px;font-weight:bold;color:#e11d48">DESTINATION (B)</span></div>')
      );
    }

    group.addTo(map);
    group.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    refs.journeyGroup = group;

    return () => { group.remove(); refs.journeyGroup = null; };
  }, [map, selectedJourney]);

  return null;
}

// ─── Public RouteMap component ────────────────────────────────────────────
export default function RouteMap({
  routes       = [],
  activeFilter = 'ALL',
  showLandmarks = false,
  showLocations = false,
  showSchools   = true,
  schools       = [],
  selectedJourney = null,
  locations     = [],
  showAdvisories = true,
  interactive   = true,
  className     = 'w-full h-full rounded-2xl',
  style         = {},
  onSelect      = null,
}) {
  const [landmarks, setLandmarks] = useState([]);

  // Fetch landmarks on demand
  useEffect(() => {
    if (showLandmarks && landmarks.length === 0) {
      fetch('/api/landmarks')
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setLandmarks(data); })
        .catch(err => console.error('Failed to load landmarks:', err));
    }
  }, [showLandmarks, landmarks.length]);

  const dagupanCenter = [16.0433, 120.3333];

  return (
    <div
      className={`overflow-hidden bg-slate-100 ${className}`}
      style={{ width: '100%', height: '100%', ...style }}
    >
      <MapContainer
        center={dagupanCenter}
        zoom={13}
        scrollWheelZoom={false}
        dragging={interactive}
        zoomControl={interactive}
        doubleClickZoom={interactive}
        style={{ width: '100%', height: '100%', minHeight: '300px' }}
        className="sm:min-h-[400px]"
        attributionControl={true}
      >
        {/* Base tile layer — OpenStreetMap */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        {/* All imperative layer logic lives here, inside MapContainer context */}
        <LayerManager
          routes={routes}
          activeFilter={activeFilter}
          showLandmarks={showLandmarks}
          showLocations={showLocations}
          showSchools={showSchools}
          schools={schools}
          locations={locations}
          landmarks={landmarks}
          showAdvisories={showAdvisories}
          selectedJourney={selectedJourney}
          onSelect={onSelect}
        />
      </MapContainer>
    </div>
  );
}
