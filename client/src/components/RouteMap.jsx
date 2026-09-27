/**
 * RouteMap.jsx — InerTayo Web Map Component
 *
 * Architecture (Steps 1–8):
 *  • Step 1  – Consumes precomputed GeoJSON from /api/map/layers/*
 *  • Step 2  – preferCanvas: true on MapContainer
 *  • Step 3  – 3-tier zoom LOD (11-13 / 14-15 / 16+) via zoomend
 *  • Step 4  – leaflet.markercluster for stops, schools, landmarks
 *  • Step 5  – One variable per visual channel:
 *               color → mode, dash → status, weight/opacity → selection
 *  • Step 7  – Z-order: flood → routes → stops/markers → journey overlay
 *  • Step 8  – Interaction-driven focus: routes-only default,
 *               mode-toggle dims others, click highlights + shows stops,
 *               journey fitBounds + hides unrelated layers
 */

import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

// Fix Leaflet default icon paths under Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon   from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// ─── Visual encoding constants (Step 5) ────────────────────────────────────
const MODE_COLORS = {
  jeepney:  '#ec4899',
  bus:      '#10b981',
  tricycle: '#06b6d4',
  boat:     '#2563eb',
  default:  '#64748b',
};
function modeColor(modeName = '') {
  const m = modeName.toLowerCase();
  if (m.includes('jeep'))     return MODE_COLORS.jeepney;
  if (m.includes('bus'))      return MODE_COLORS.bus;
  if (m.includes('tricycle')) return MODE_COLORS.tricycle;
  if (m.includes('boat'))     return MODE_COLORS.boat;
  return MODE_COLORS.default;
}

// Default / dim / selected polyline styles
const STYLE_DEFAULT  = { weight: 2, opacity: 0.5 };
const STYLE_DIMMED   = { weight: 2, opacity: 0.12 };
const STYLE_SELECTED = { weight: 5, opacity: 1.0 };

// ─── Zoom LOD thresholds (Step 3) ──────────────────────────────────────────
const ZOOM_TIER1_MAX      = 13; // ≤13: routes only
const ZOOM_TIER2_MIN      = 14; // 14-15: stops cluster appear
const ZOOM_TIER3_MIN      = 16; // ≥16: stops unclustered + landmarks
const CLUSTER_MAX_ZOOM    = 15; // clustering disabled above this zoom

// ─── DivIcon factories ─────────────────────────────────────────────────────
function stopDivIcon(color, label, size = 16) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.45);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-family:system-ui,sans-serif;
      font-size:${size > 16 ? '10px' : '9px'};font-weight:800;">${label}</div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2],
  });
}

function schoolDivIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:#4f46e5;
      border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;font-size:13px;">🎓</div>`,
    iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12],
  });
}

function landmarkDivIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:3px;background:#6366f1;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:8px;font-weight:bold;">★</div>`,
    iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -7],
  });
}

function clusterIcon(color) {
  return (cluster) => {
    const n = cluster.getChildCount();
    return L.divIcon({
      className: '',
      html: `<div style="width:34px;height:34px;border-radius:50%;background:${color};
        border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-size:12px;font-weight:800;">${n}</div>`,
      iconSize: [34, 34], iconAnchor: [17, 17],
    });
  };
}

function journeyStopIcon(label, bg) {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${bg};
      border:2.5px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.45);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:11px;font-weight:800;">${label}</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11],
  });
}

// ─── Popup HTML helpers ────────────────────────────────────────────────────
function routePopupHtml(props) {
  const detour  = props.status === 'DETOUR_ACTIVE';
  const unavail = props.status === 'UNAVAILABLE';
  return `<div style="font-family:sans-serif;min-width:185px">
    <div style="font-size:10px;font-weight:bold;text-transform:uppercase;color:#64748b;margin-bottom:2px">${props.mode}</div>
    <div style="font-size:13px;font-weight:bold;color:#0f172a;margin-bottom:4px">${props.route_name}</div>
    <div style="font-size:11px;color:#475569">
      Fare: ₱${Math.round(props.minimum_fare)} – ₱${Math.round(props.maximum_fare)}<br/>
      Travel: ${props.estimated_time} mins
    </div>
    ${unavail ? `<span style="display:inline-block;margin-top:6px;font-size:10px;font-weight:bold;color:#dc2626;background:#fee2e2;padding:2px 6px;border-radius:4px">🚫 Suspended</span>` : ''}
    ${detour  ? `<span style="display:inline-block;margin-top:6px;font-size:10px;font-weight:bold;color:#b45309;background:#fef3c7;padding:2px 6px;border-radius:4px">⚠️ Detour</span>` : ''}
  </div>`;
}

function stopPopupHtml(props) {
  const tag = props.is_origin ? '(Start)' : props.is_terminus ? '(Terminus)' : props.is_transfer ? '(Transfer)' : `#${props.stop_order}`;
  return `<div style="font-family:sans-serif;min-width:160px">
    <div style="font-size:10px;font-weight:bold;color:${props.color}">${props.mode} STOP ${tag}</div>
    <div style="font-size:12px;font-weight:bold;color:#0f172a;margin:2px 0">${props.stop_name}</div>
    <div style="font-size:11px;color:#64748b">${props.route_name}</div>
  </div>`;
}

function schoolPopupHtml(props, onSelect) {
  const nearby = (props.nearby_stops || []).slice(0, 2)
    .map(s => `<div style="font-size:10px;color:#334155">• ${s.stop_name} (${s.mode}) ~${s.distance_meters}m</div>`)
    .join('');
  return `<div style="font-family:sans-serif;min-width:190px">
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
      <span style="font-size:9px;font-weight:bold;color:#4f46e5;text-transform:uppercase">🎓 ${props.type}</span>
      <span style="font-size:9px;font-weight:bold;color:#059669;background:#ecfdf5;padding:1px 5px;border-radius:4px">Verified</span>
    </div>
    <div style="font-size:13px;font-weight:bold;color:#0f172a;margin:2px 0">${props.name}</div>
    ${props.barangay ? `<div style="font-size:11px;color:#475569;margin-bottom:4px">Brgy. ${props.barangay}</div>` : ''}
    ${nearby ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0">
      <div style="font-size:10px;font-weight:bold;color:#64748b;margin-bottom:2px">Nearby Transit:</div>${nearby}</div>` : ''}
  </div>`;
}

// ─── Core layer manager (runs inside MapContainer context) ─────────────────
function LayerManager({
  activeFilter,
  showLandmarks,
  showLocations,
  showSchools,
  showAdvisories,
  selectedJourney,
  onSelect,
  selectedRouteId,
  setSelectedRouteId,
}) {
  const map = useMap();

  // GeoJSON data fetched from server
  const geoDataRef = useRef({
    jeepneys: null, buses: null, tricycles: null, boats: null,
    stops: null, schools: null, landmarks: null, flood: null,
  });

  // Leaflet layer references — we manage all layers imperatively
  const layersRef = useRef({
    floodLayer:   null,            // L.geoJSON flood zone
    routeLayers:  {},              // { 'jeepneys': L.geoJSON, ... }
    stopCluster:  null,            // L.markerClusterGroup
    schoolCluster: null,
    landmarkCluster: null,
    journeyGroup: null,
    // Per-feature lookup for highlight/dim
    routeFeatureLayers: {},        // { routeId: L.layer }
  });

  const currentZoom = useRef(map.getZoom());

  // ── Resize + invalidate ──────────────────────────────────────────────────
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);
    let ro;
    const c = map.getContainer();
    if (c && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(c);
    }
    return () => { clearTimeout(t1); clearTimeout(t2); if (ro) ro.disconnect(); };
  }, [map]);

  // ── Fetch all GeoJSON data once ─────────────────────────────────────────
  useEffect(() => {
    const layers = ['jeepneys', 'buses', 'tricycles', 'boats', 'stops', 'schools', 'landmarks', 'flood-zones'];
    const keys   = ['jeepneys', 'buses', 'tricycles', 'boats', 'stops', 'schools', 'landmarks', 'flood'];

    Promise.all(
      layers.map(l => fetch(`/api/map/layers/${l}`).then(r => r.ok ? r.json() : null).catch(() => null))
    ).then(results => {
      keys.forEach((key, i) => { geoDataRef.current[key] = results[i]; });
      buildAllLayers();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-apply layers when filter/toggle/zoom changes ─────────────────────
  useEffect(() => {
    buildAllLayers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, showLandmarks, showLocations, showSchools, showAdvisories]);

  // ── Zoom listener (LOD Step 3) ──────────────────────────────────────────
  useEffect(() => {
    const onZoomEnd = () => {
      currentZoom.current = map.getZoom();
      syncZoomLOD();
    };
    map.on('zoomend', onZoomEnd);
    return () => map.off('zoomend', onZoomEnd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // ── Journey bounds + hide ───────────────────────────────────────────────
  useEffect(() => {
    if (selectedJourney?.legs?.length) {
      const pts = [];
      selectedJourney.legs.forEach(leg => {
        (leg.coordinates || leg.geometry?.coordinates || []).forEach(c => {
          if (Array.isArray(c) && c.length >= 2) pts.push([c[1], c[0]]);
        });
      });
      if (pts.length > 0) map.fitBounds(pts, { padding: [50, 50], maxZoom: 16 });
    }
    buildAllLayers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJourney]);

  // ── selectedRouteId highlight ───────────────────────────────────────────
  useEffect(() => {
    applySelectionStyles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId]);

  // ════════════════════════════════════════════════════════════════════════
  function buildAllLayers() {
    const refs = layersRef.current;
    const geo  = geoDataRef.current;

    // 1. FLOOD ZONE (always bottom — add first)
    if (refs.floodLayer) { refs.floodLayer.remove(); refs.floodLayer = null; }
    if (showAdvisories && geo.flood && (activeFilter === 'ALL' || activeFilter === 'FLOOD')) {
      refs.floodLayer = L.geoJSON(geo.flood, {
        style: f => ({
          ...(f.properties.style || {}),
          weight: activeFilter === 'FLOOD' ? 14 : 10,
        }),
        onEachFeature(f, layer) {
          layer.bindPopup(`<div style="font-family:sans-serif;min-width:180px">
            <div style="color:#b45309;font-weight:bold;font-size:11px;margin-bottom:4px">⚠️ ACTIVE FLOOD ADVISORY</div>
            <div style="font-size:12px;font-weight:bold;color:#0f172a">${f.properties.name}</div>
            <div style="font-size:11px;color:#475569;margin-top:2px">${f.properties.description}</div>
          </div>`);
          layer.on('click', () => onSelect?.('advisory', {
            title: `${f.properties.name} Flooding`,
            description: f.properties.description,
          }));
        },
      }).addTo(map);
    }

    // 2. ROUTE POLYLINES per mode group (Step 7: after flood)
    Object.values(refs.routeLayers).forEach(lg => lg.remove());
    refs.routeLayers = {};
    refs.routeFeatureLayers = {};

    const modeKeys = ['jeepneys', 'buses', 'tricycles', 'boats'];
    const modeKeywords = {
      jeepneys: 'jeep', buses: 'bus', tricycles: 'tricycle', boats: 'boat',
    };

    // During an active journey, only show route lines of modes involved
    const journeyModes = selectedJourney?.legs
      ? new Set(selectedJourney.legs.map(l => (l.mode || '').toLowerCase()))
      : null;

    for (const key of modeKeys) {
      const data = geo[key];
      if (!data?.features?.length) continue;

      // Filter by active mode toggle
      const matchesFilter = (
        activeFilter === 'ALL' ||
        activeFilter === 'FLOOD' ||
        (activeFilter === 'Jeepney'  && key === 'jeepneys') ||
        (activeFilter === 'Bus'      && key === 'buses') ||
        (activeFilter === 'Tricycle' && key === 'tricycles') ||
        (activeFilter === 'Boat'     && key === 'boats')
      );
      if (!matchesFilter) continue;

      const layerGroup = L.geoJSON(data, {
        renderer: L.canvas(), // Step 2 – canvas per layer
        style(f) {
          const props = f.properties;
          const base = props.style || {};
          return {
            color:     base.color    || modeColor(props.mode),
            weight:    STYLE_DEFAULT.weight,
            opacity:   STYLE_DEFAULT.opacity,
            dashArray: base.dashArray || undefined,
            lineCap:   'round',
          };
        },
        onEachFeature(f, layer) {
          const id = f.properties.id;
          refs.routeFeatureLayers[id] = layer;

          layer.bindPopup(routePopupHtml(f.properties));

          // Hover: boost this, don't dim others on hover (only on click)
          layer.on('mouseover', () => {
            if (selectedRouteId !== id) {
              layer.setStyle({ weight: 4, opacity: 0.85 });
              layer.bringToFront();
            }
          });
          layer.on('mouseout', () => {
            if (selectedRouteId !== id) {
              layer.setStyle(STYLE_DEFAULT);
            }
          });
          layer.on('click', () => {
            setSelectedRouteId(id === selectedRouteId ? null : id);
            onSelect?.('route', f.properties);
          });
        },
      }).addTo(map);

      refs.routeLayers[key] = layerGroup;
    }

    // Apply current selection highlight
    applySelectionStyles();

    // 3. STOPS, SCHOOLS, LANDMARKS — clusters (Step 7: after route lines)
    rebuildStopCluster();
    rebuildSchoolCluster();
    rebuildLandmarkCluster();

    // 4. JOURNEY OVERLAY (always top)
    buildJourneyOverlay();

    // 5. Sync LOD based on current zoom
    syncZoomLOD();
  }

  // ════════════════════════════════════════════════════════════════════════
  function applySelectionStyles() {
    const refs = layersRef.current;
    const flayers = refs.routeFeatureLayers;
    if (!Object.keys(flayers).length) return;

    if (!selectedRouteId) {
      // No selection: restore all to default
      Object.values(flayers).forEach(l => { try { l.setStyle(STYLE_DEFAULT); } catch {} });
      return;
    }

    // Dim everything, then highlight the selected one
    Object.entries(flayers).forEach(([id, l]) => {
      try {
        if (parseInt(id) === selectedRouteId) {
          l.setStyle(STYLE_SELECTED);
          l.bringToFront();
        } else {
          l.setStyle(STYLE_DIMMED);
        }
      } catch {}
    });

    // If a route is selected, show its stops even below ZOOM_TIER2_MIN (Step 8)
    rebuildStopCluster(selectedRouteId);
  }

  // ════════════════════════════════════════════════════════════════════════
  function rebuildStopCluster(forceRouteId = null) {
    const refs = layersRef.current;
    const geo  = geoDataRef.current;

    if (refs.stopCluster) { refs.stopCluster.remove(); refs.stopCluster = null; }
    if (!geo.stops?.features?.length) return;

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      disableClusteringAtZoom: CLUSTER_MAX_ZOOM + 1,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: clusterIcon('#64748b'),
    });

    const zoom = currentZoom.current;
    const showAll = zoom >= ZOOM_TIER2_MIN || forceRouteId !== null;
    if (!showAll) return; // don't even build below LOD threshold

    geo.stops.features.forEach(f => {
      const props = f.properties;
      const [lng, lat] = f.geometry.coordinates;

      // If a route is selected, only show stops from that route
      if (forceRouteId && props.route_id !== forceRouteId) return;

      // Filter by active mode
      if (activeFilter !== 'ALL' && activeFilter !== 'FLOOD') {
        const keyword = activeFilter.toLowerCase().replace('jeepney', 'jeep').replace('bus', 'bus').replace('tricycle', 'tricycle').replace('boat', 'boat');
        if (!props.mode.toLowerCase().includes(keyword)) return;
      }

      const size = (props.is_origin || props.is_terminus) ? 20 : props.is_transfer ? 18 : 16;
      const bg   = props.is_origin   ? '#059669'
                 : props.is_terminus ? '#e11d48'
                 : props.is_transfer ? '#0f172a'
                 : props.color;

      const marker = L.marker([lat, lng], {
        icon: stopDivIcon(bg, props.label, size),
        zIndexOffset: 100,
      });
      marker.bindPopup(stopPopupHtml(props));
      marker.on('click', () => onSelect?.('stop', { ...props, routeName: props.route_name }));
      cluster.addLayer(marker);
    });

    refs.stopCluster = cluster;
    cluster.addTo(map);
  }

  // ════════════════════════════════════════════════════════════════════════
  function rebuildSchoolCluster() {
    const refs = layersRef.current;
    const geo  = geoDataRef.current;

    if (refs.schoolCluster) { refs.schoolCluster.remove(); refs.schoolCluster = null; }
    if (!showSchools || !geo.schools?.features?.length) return;

    const zoom = currentZoom.current;
    if (zoom < ZOOM_TIER2_MIN) return;

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      disableClusteringAtZoom: CLUSTER_MAX_ZOOM + 1,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: clusterIcon('#4f46e5'),
    });

    geo.schools.features.forEach(f => {
      const props = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const marker = L.marker([lat, lng], { icon: schoolDivIcon(), zIndexOffset: 200 });
      marker.bindPopup(schoolPopupHtml(props, onSelect));
      marker.on('click', () => onSelect?.('school', props));
      cluster.addLayer(marker);
    });

    refs.schoolCluster = cluster;
    cluster.addTo(map);
  }

  // ════════════════════════════════════════════════════════════════════════
  function rebuildLandmarkCluster() {
    const refs = layersRef.current;
    const geo  = geoDataRef.current;

    if (refs.landmarkCluster) { refs.landmarkCluster.remove(); refs.landmarkCluster = null; }
    if (!showLandmarks || !geo.landmarks?.features?.length) return;

    const zoom = currentZoom.current;
    if (zoom < ZOOM_TIER3_MIN) return; // landmarks only at ≥16

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      disableClusteringAtZoom: CLUSTER_MAX_ZOOM + 1,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: clusterIcon('#6366f1'),
    });

    geo.landmarks.features.forEach(f => {
      const props = f.properties;
      const [lng, lat] = f.geometry.coordinates;
      const marker = L.marker([lat, lng], { icon: landmarkDivIcon(), zIndexOffset: 150 });
      marker.bindPopup(`<div style="font-family:sans-serif;min-width:150px">
        <div style="font-size:9px;font-weight:bold;color:#6366f1;text-transform:uppercase">${props.type} LANDMARK</div>
        <div style="font-size:12px;font-weight:bold;color:#0f172a;margin:2px 0">${props.name}</div>
      </div>`);
      marker.on('click', () => onSelect?.('landmark', props));
      cluster.addLayer(marker);
    });

    refs.landmarkCluster = cluster;
    cluster.addTo(map);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Step 3: LOD — add/remove cluster layers based on zoom
  function syncZoomLOD() {
    const refs = layersRef.current;
    const zoom = currentZoom.current;

    // Stops
    if (zoom < ZOOM_TIER2_MIN) {
      if (refs.stopCluster && map.hasLayer(refs.stopCluster)) {
        refs.stopCluster.remove();
      }
    } else {
      if (refs.stopCluster && !map.hasLayer(refs.stopCluster)) {
        refs.stopCluster.addTo(map);
      } else if (!refs.stopCluster) {
        rebuildStopCluster(selectedRouteId || null);
      }
    }

    // Schools
    if (zoom < ZOOM_TIER2_MIN) {
      if (refs.schoolCluster && map.hasLayer(refs.schoolCluster)) refs.schoolCluster.remove();
    } else {
      if (refs.schoolCluster && !map.hasLayer(refs.schoolCluster)) refs.schoolCluster.addTo(map);
      else if (!refs.schoolCluster && showSchools) rebuildSchoolCluster();
    }

    // Landmarks only at TIER3
    if (zoom < ZOOM_TIER3_MIN) {
      if (refs.landmarkCluster && map.hasLayer(refs.landmarkCluster)) refs.landmarkCluster.remove();
    } else {
      if (refs.landmarkCluster && !map.hasLayer(refs.landmarkCluster)) refs.landmarkCluster.addTo(map);
      else if (!refs.landmarkCluster && showLandmarks) rebuildLandmarkCluster();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Step 8: Journey overlay (on top of everything)
  function buildJourneyOverlay() {
    const refs = layersRef.current;
    if (refs.journeyGroup) { refs.journeyGroup.remove(); refs.journeyGroup = null; }
    if (!selectedJourney?.legs?.length) return;

    const group = L.layerGroup();

    selectedJourney.legs.forEach((leg, i) => {
      const coords = (leg.coordinates || leg.geometry?.coordinates || []).map(c => [c[1], c[0]]);
      if (coords.length < 2) return;

      const isWalk = leg.type === 'WALK';
      const color  = modeColor(leg.mode || '');

      L.polyline(coords, {
        renderer: L.canvas(),
        color:    isWalk ? '#3b82f6' : color,
        weight:   isWalk ? 5 : 8,
        opacity:  0.95,
        dashArray: isWalk ? '6 8' : undefined,
        lineCap:  'round',
      })
        .bindPopup(`<div style="font-family:sans-serif;min-width:150px">
          <div style="font-size:10px;font-weight:bold;color:${color};text-transform:uppercase">
            ${leg.mode} (${leg.durationFormatted})</div>
          <div style="font-size:12px;font-weight:bold;color:#0f172a;margin:2px 0">${leg.instruction}</div>
          <div style="font-size:10px;color:#64748b">~${leg.distanceMeters}m</div>
        </div>`)
        .addTo(group);
    });

    // Origin pin
    const firstCoord = selectedJourney.legs[0]?.coordinates?.[0];
    if (firstCoord) {
      L.marker([firstCoord[1], firstCoord[0]], { icon: journeyStopIcon('A', '#059669'), zIndexOffset: 1000 })
        .bindPopup('<div style="font-family:sans-serif"><b style="color:#059669;font-size:10px">TRIP ORIGIN (A)</b></div>')
        .addTo(group);
    }

    // Destination pin
    const lastLeg    = selectedJourney.legs[selectedJourney.legs.length - 1];
    const lastCoords = lastLeg?.coordinates || lastLeg?.geometry?.coordinates;
    if (lastCoords?.length) {
      const end = lastCoords[lastCoords.length - 1];
      L.marker([end[1], end[0]], { icon: journeyStopIcon('B', '#e11d48'), zIndexOffset: 1000 })
        .bindPopup('<div style="font-family:sans-serif"><b style="color:#e11d48;font-size:10px">DESTINATION (B)</b></div>')
        .addTo(group);
    }

    group.addTo(map);
    group.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    refs.journeyGroup = group;
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const refs = layersRef.current;
      if (refs.floodLayer)     refs.floodLayer.remove();
      Object.values(refs.routeLayers).forEach(lg => lg.remove());
      if (refs.stopCluster)    refs.stopCluster.remove();
      if (refs.schoolCluster)  refs.schoolCluster.remove();
      if (refs.landmarkCluster) refs.landmarkCluster.remove();
      if (refs.journeyGroup)   refs.journeyGroup.remove();
    };
  }, []);

  return null;
}

// ─── Public RouteMap component ─────────────────────────────────────────────
export default function RouteMap({
  routes        = [],     // still accepted for compat (metadata, bounds)
  activeFilter  = 'ALL',
  showLandmarks = false,
  showLocations = false,
  showSchools   = false,
  schools       = [],
  selectedJourney = null,
  locations     = [],
  showAdvisories = true,
  interactive   = true,
  className     = 'w-full h-full rounded-2xl',
  style         = {},
  onSelect      = null,
}) {
  // selectedRouteId is owned here so LayerManager + parent can both react
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  const dagupanCenter = [16.0433, 120.3333];

  return (
    <div
      className={`overflow-hidden bg-slate-100 ${className}`}
      style={{ width: '100%', height: '100%', ...style }}
    >
      <MapContainer
        center={dagupanCenter}
        zoom={13}
        preferCanvas={true}          // Step 2 – canvas renderer
        scrollWheelZoom={false}
        dragging={interactive}
        zoomControl={interactive}
        doubleClickZoom={interactive}
        style={{ width: '100%', height: '100%', minHeight: '300px' }}
        className="sm:min-h-[400px]"
        attributionControl={true}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        <LayerManager
          activeFilter={activeFilter}
          showLandmarks={showLandmarks}
          showLocations={showLocations}
          showSchools={showSchools}
          showAdvisories={showAdvisories}
          selectedJourney={selectedJourney}
          onSelect={onSelect}
          selectedRouteId={selectedRouteId}
          setSelectedRouteId={setSelectedRouteId}
        />
      </MapContainer>
    </div>
  );
}
