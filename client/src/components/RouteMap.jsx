import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default icon path in bundlers (Vite/Webpack)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Helper to extract polyline coordinates [lat, lon] from GeoJSON geometry or sequential stops
function getRoutePolylineCoords(route) {
  if (!route) return [];

  if (route.geometry) {
    try {
      const geom = typeof route.geometry === 'string' ? JSON.parse(route.geometry) : route.geometry;
      if (geom && geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
        // GeoJSON RFC 7946 coordinates are [longitude, latitude].
        // Leaflet Polyline expects [latitude, longitude].
        return geom.coordinates.map(coord => [coord[1], coord[0]]);
      }
    } catch (e) {
      console.warn('Failed to parse route GeoJSON geometry:', e);
    }
  }

  // Fallback: derive polyline from sequential stops
  if (Array.isArray(route.stops) && route.stops.length >= 2) {
    return route.stops
      .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map(s => [s.latitude, s.longitude]);
  }

  return [];
}

// Helper component to resize and adjust map bounds dynamically
function MapResizerAndBounds({ routes, activeFilter }) {
  const map = useMap();

  // Invalidate size immediately and on slight delay to handle tabs/flex mounts
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map]);

  // Fit bounds when routes or filter changes
  useEffect(() => {
    if (!routes || routes.length === 0) return;

    if (routes.length === 1) {
      // Single route: zoom to fit geometry or stops of this route
      const points = getRoutePolylineCoords(routes[0]);
      if (points.length > 0) {
        map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
      }
    } else if (routes.length > 1) {
      if (activeFilter !== 'ALL' && activeFilter !== 'FLOOD') {
        const filtered = routes.filter(r => (r.mode_name || '').toLowerCase().includes(activeFilter.toLowerCase()));
        const points = [];
        filtered.forEach(r => {
          const coords = getRoutePolylineCoords(r);
          coords.forEach(pt => points.push(pt));
        });
        if (points.length > 0) {
          map.fitBounds(points, { padding: [35, 35] });
        }
      } else if (activeFilter === 'FLOOD') {
        // Center on AB Fernandez flood zone
        map.setView([16.0440, 120.3380], 14);
      }
    }
  }, [routes, activeFilter, map]);

  return null;
}

// Marker icon generator matching UI legend colors:
// Jeepney = #ec4899, Bus = #10b981, Tricycle = #06b6d4, Flood = #f59e0b, Landmark = #6366f1
function createStopIcon(stop, isOrigin, isDest, routeColor) {
  let bg = routeColor;
  let size = 16;
  let label = stop.stop_order;

  if (isOrigin) {
    bg = '#059669'; // Origin Start Green
    size = 20;
    label = 'A';
  } else if (isDest) {
    bg = '#e11d48'; // Destination Terminus Rose
    size = 20;
    label = 'B';
  } else if (stop.is_transfer_point) {
    bg = '#0f172a'; // Transfer Point Dark Slate
    size = 18;
    label = 'T';
  }

  return L.divIcon({
    className: 'custom-stop-div-icon',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background-color: ${bg};
        border: 2px solid #ffffff;
        box-shadow: 0 2px 5px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-family: system-ui, sans-serif;
        font-size: ${size > 16 ? '10px' : '9px'};
        font-weight: 800;
        line-height: 1;
      ">
        ${label}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}

function createLandmarkIcon(type) {
  return L.divIcon({
    className: 'custom-landmark-div-icon',
    html: `
      <div style="
        width: 14px;
        height: 14px;
        border-radius: 3px;
        background-color: #6366f1;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-size: 8px;
        font-weight: bold;
      ">
        ★
      </div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -7]
  });
}

function createLocationIcon(loc) {
  const type = (loc.type || '').toUpperCase();
  let bg = '#6366f1';
  let symbol = '★';
  let size = 18;
  let isDiamond = false;

  if (type === 'RIVER_STOP') {
    bg = '#0284c7';
    symbol = '⚓';
    size = 22;
    isDiamond = true;
  } else if (type === 'STREET') {
    bg = '#475569';
    symbol = '≡';
    size = 16;
  } else if (type === 'TERMINAL') {
    bg = '#ea580c';
    symbol = 'T';
    size = 18;
  } else if (type === 'ESTABLISHMENT') {
    bg = '#8b5cf6';
    symbol = 'E';
    size = 16;
  } else if (type === 'BARANGAY') {
    bg = '#0d9488';
    symbol = 'B';
    size = 16;
  } else if (type === 'INTERSECTION') {
    bg = '#64748b';
    symbol = '+';
    size = 14;
  } else if (type === 'STOP') {
    bg = '#10b981';
    symbol = '●';
    size = 14;
  }

  return L.divIcon({
    className: 'custom-loc-div-icon',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: ${isDiamond ? '4px' : '50%'};
        background-color: ${bg};
        border: 2px solid #ffffff;
        box-shadow: 0 2px 5px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-size: ${size >= 18 ? '10px' : '9px'};
        font-weight: 800;
        line-height: 1;
        ${isDiamond ? 'transform: rotate(45deg);' : ''}
      ">
        <span style="${isDiamond ? 'transform: rotate(-45deg);' : ''}">${symbol}</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}

export default function RouteMap({
  routes = [],
  activeFilter = 'ALL',
  showLandmarks = false,
  showLocations = false,
  locations = [],
  showAdvisories = true,
  interactive = true,
  className = 'w-full h-full rounded-2xl',
  style = {},
  onSelect = null
}) {
  const [landmarks, setLandmarks] = useState([]);

  // Fetch landmarks when showLandmarks is true
  useEffect(() => {
    if (showLandmarks && landmarks.length === 0) {
      fetch('/api/landmarks')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setLandmarks(data);
        })
        .catch(err => console.error('Failed to load landmarks:', err));
    }
  }, [showLandmarks, landmarks.length]);

  // Dagupan City Plaza coordinates per Addendum §5
  const dagupanCenter = [16.0433, 120.3333];

  // Flood zone polyline coordinates for AB Fernandez Avenue
  const abFernandezFloodCoords = [
    [16.0420, 120.3345],
    [16.0440, 120.3380],
    [16.0460, 120.3420],
  ];

  // Filter routes based on mode (supports Jeepney, Bus, Tricycle, Boat)
  const visibleRoutes = routes.filter(route => {
    const mode = (route.mode_name || '').toLowerCase();
    if (activeFilter === 'ALL' || activeFilter === 'FLOOD') return true;
    return mode.includes(activeFilter.toLowerCase());
  });

  return (
    <div
      className={`overflow-hidden bg-slate-100 ${className}`}
      style={{ width: '100%', height: '100%', ...style }}
    >
      <MapContainer
        center={dagupanCenter}
        zoom={14}
        scrollWheelZoom={false}
        dragging={interactive}
        zoomControl={interactive}
        doubleClickZoom={interactive}
        style={{ width: '100%', height: '100%' }}
        attributionControl={true}
      >
        {/* OpenStreetMap Raster Tile Layer (Official OSM tile URL per Tile Usage Policy) */}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        {/* Dynamic bounds and resize invalidation */}
        <MapResizerAndBounds routes={routes} activeFilter={activeFilter} />

        {/* Flood Hazard Advisory Overlay */}
        {showAdvisories && (activeFilter === 'ALL' || activeFilter === 'FLOOD') && (
          <Polyline
            positions={abFernandezFloodCoords}
            pathOptions={{
              color: '#f59e0b',
              weight: activeFilter === 'FLOOD' ? 12 : 8,
              opacity: 0.8,
              lineCap: 'round',
            }}
            eventHandlers={{
              click: () => {
                if (onSelect) {
                  onSelect('advisory', {
                    title: 'AB Fernandez Ave Flooding',
                    description: 'High tide overflow has created standing water on the lower roadway. Commuter routes reflect active detours.'
                  });
                }
              }
            }}
          >
            <Popup>
              <div style={{ fontFamily: 'sans-serif', minWidth: '180px' }}>
                <div style={{ color: '#b45309', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px' }}>
                  ⚠️ ACTIVE FLOOD ADVISORY
                </div>
                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 'bold' }}>
                  AB Fernandez Avenue
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                  Water level elevated during high tide. Routes 3, 4, and 5 reflect detour bypass.
                </div>
              </div>
            </Popup>
          </Polyline>
        )}

        {/* Transit Routes and Stop Markers */}
        {visibleRoutes.map((route) => {
          const mode = (route.mode_name || '').toLowerCase();
          const isBoat = mode.includes('boat');
          const routeColor = isBoat
            ? '#2563eb' // Blue matching Boat legend
            : mode.includes('jeep')
            ? '#ec4899' // Pink matching Jeepney legend
            : mode.includes('bus')
            ? '#10b981' // Green matching Bus legend
            : '#06b6d4'; // Cyan matching Tricycle legend

          const isDetour = route.status === 'DETOUR_ACTIVE';
          const isUnavailable = route.status === 'UNAVAILABLE';
          const polylineCoords = getRoutePolylineCoords(route);

          return (
            <React.Fragment key={route.id}>
              {/* Route Polyline */}
              {polylineCoords.length >= 2 && (
                <Polyline
                  positions={polylineCoords}
                  pathOptions={{
                    color: isUnavailable ? '#94a3b8' : isDetour ? '#f59e0b' : routeColor,
                    weight: isBoat ? 6 : 5,
                    opacity: isUnavailable ? 0.6 : 0.85,
                    dashArray: isBoat ? '8, 8' : isDetour ? '8, 8' : undefined,
                    lineCap: 'round'
                  }}
                  eventHandlers={{
                    click: () => {
                      if (onSelect) onSelect('route', route);
                    }
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'sans-serif', minWidth: '180px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b' }}>
                        {route.mode_name}
                      </span>
                      <h4 style={{ margin: '2px 0 6px 0', fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>
                        {route.route_name}
                      </h4>
                      <p style={{ margin: 0, fontSize: '11px', color: '#475569' }}>
                        Fare: ₱{Math.round(route.minimum_fare)} – ₱{Math.round(route.maximum_fare)}<br />
                        Travel Time: {route.active_travel_time || route.estimated_time} mins
                      </p>
                      {isUnavailable && (
                        <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '10px', fontWeight: 'bold', color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: '4px' }}>
                          🚫 Service Suspended
                        </span>
                      )}
                      {isDetour && (
                        <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '10px', fontWeight: 'bold', color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: '4px' }}>
                          ⚠️ Detour Active
                        </span>
                      )}
                    </div>
                  </Popup>
                </Polyline>
              )}

              {/* Stop Markers */}
              {(route.stops || []).map((stop, idx) => {
                if (typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') return null;

                const isOrigin = idx === 0;
                const isDest = idx === route.stops.length - 1;
                const stopIcon = createStopIcon(stop, isOrigin, isDest, routeColor);

                return (
                  <Marker
                    key={`${route.id}-stop-${stop.id || idx}`}
                    position={[stop.latitude, stop.longitude]}
                    icon={stopIcon}
                    eventHandlers={{
                      click: () => {
                        if (onSelect) onSelect('stop', { ...stop, routeName: route.route_name });
                      }
                    }}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'sans-serif', minWidth: '160px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: routeColor }}>
                          STOP #{stop.stop_order} {isOrigin ? '(START)' : isDest ? '(TERMINUS)' : stop.is_transfer_point ? '(TRANSFER)' : ''}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a', margin: '2px 0' }}>
                          {stop.stop_name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          {route.route_name}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Unified Locations Overlay (Streets, River Stops, Terminals, Barangays, etc.) */}
        {showLocations && locations.map((loc) => {
          if (typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return null;
          const locIcon = createLocationIcon(loc);

          return (
            <Marker
              key={`location-${loc.id}`}
              position={[loc.latitude, loc.longitude]}
              icon={locIcon}
              eventHandlers={{
                click: () => {
                  if (onSelect) onSelect('location', loc);
                }
              }}
            >
              <Popup>
                <div style={{ fontFamily: 'sans-serif', minWidth: '160px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#0284c7', textTransform: 'uppercase' }}>
                    {loc.type}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a', margin: '2px 0' }}>
                    {loc.name}
                  </div>
                  {loc.address && (
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {loc.address}
                    </div>
                  )}
                  {loc.description && (
                    <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>
                      {loc.description}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Dagupan Reference Landmarks Overlay */}
        {showLandmarks && landmarks.map((lm) => {
          if (typeof lm.latitude !== 'number' || typeof lm.longitude !== 'number') return null;
          const lmIcon = createLandmarkIcon(lm.type);

          return (
            <Marker
              key={`landmark-${lm.id}`}
              position={[lm.latitude, lm.longitude]}
              icon={lmIcon}
              eventHandlers={{
                click: () => {
                  if (onSelect) onSelect('landmark', lm);
                }
              }}
            >
              <Popup>
                <div style={{ fontFamily: 'sans-serif', minWidth: '150px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 'bold', color: '#6366f1', textTransform: 'uppercase' }}>
                    {lm.type} LANDMARK
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a', margin: '2px 0' }}>
                    {lm.name}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
