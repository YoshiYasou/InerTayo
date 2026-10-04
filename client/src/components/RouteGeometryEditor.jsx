import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, LocateFixed, Maximize2, Minimize2, Trash2, Undo2 } from 'lucide-react';

const DAGUPAN_CENTER = [16.0433, 120.3333];

function routePointIcon(label, color) {
  const isEndpoint = Boolean(label);
  const size = isEndpoint ? 26 : 14;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border:${isEndpoint ? 2 : 2}px solid #fff;border-radius:50%;background:${label === 'A' ? '#059669' : label === 'B' ? '#e11d48' : color};box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 11px/1 system-ui,sans-serif;cursor:grab">${label || ''}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function readCoordinates(value) {
  if (!value) return { coordinates: [], error: '' };

  try {
    const geometry = typeof value === 'string' ? JSON.parse(value) : value;
    const coordinates = geometry?.type === 'LineString' ? geometry.coordinates : [];
    if (!Array.isArray(coordinates) || coordinates.some(point =>
      !Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
    )) {
      return { coordinates: [], error: 'Enter a valid GeoJSON LineString or redraw the route.' };
    }
    if (coordinates.some(([longitude, latitude]) =>
      longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90
    )) {
      return {
        coordinates: [],
        error: 'Coordinates must use [longitude, latitude] order, with longitude from -180 to 180 and latitude from -90 to 90.',
      };
    }
    return { coordinates, error: '' };
  } catch {
    return { coordinates: [], error: 'Enter valid GeoJSON or redraw the route.' };
  }
}

function MapPointPicker({ onAddPoint, disabled }) {
  useMapEvents({
    click(event) {
      if (!disabled) onAddPoint([event.latlng.lng, event.latlng.lat]);
    },
  });
  return null;
}

function FitInitialRoute({ positions }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    if (positions.length > 1) map.fitBounds(positions, { padding: [28, 28], maxZoom: 16 });
  }, [map, positions]);

  return null;
}

function RouteMapController({ isFullscreen, mapRef }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    const timeoutId = window.setTimeout(() => map.invalidateSize(), 100);
    return () => {
      window.clearTimeout(timeoutId);
      mapRef.current = null;
    };
  }, [isFullscreen, map, mapRef]);

  return null;
}

export default function RouteGeometryEditor({ value, onChange, token, color = '#ec4899', allowRoadSnap = true }) {
  const parsed = readCoordinates(value);
  const lastValidCoordinates = useRef([]);
  const editorRef = useRef(null);
  const mapRef = useRef(null);
  const [snapping, setSnapping] = useState(false);
  const [snapMessage, setSnapMessage] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === editorRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!parsed.error) lastValidCoordinates.current = parsed.coordinates;
  }, [value, parsed.error]);

  const { error } = parsed;
  const coordinates = error ? lastValidCoordinates.current : parsed.coordinates;
  const positions = coordinates.map(([longitude, latitude]) => [latitude, longitude]);
  const handleIndices = coordinates.length <= 12
    ? coordinates.map((_, index) => index)
    : Array.from({ length: 12 }, (_, index) => Math.round(index * (coordinates.length - 1) / 11));

  const updateCoordinates = (nextCoordinates) => {
    onChange(nextCoordinates.length
      ? JSON.stringify({ type: 'LineString', coordinates: nextCoordinates })
      : '');
  };

  const toggleFullscreen = async () => {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === editorRef.current) {
        await document.exitFullscreen();
      } else if (editorRef.current?.requestFullscreen) {
        await editorRef.current.requestFullscreen();
      } else {
        setFullscreenError('Fullscreen mode is not supported by this browser.');
      }
    } catch (error) {
      setFullscreenError(error.message || 'Could not open the map in fullscreen mode.');
    }
  };

  const fitRoute = () => {
    const map = mapRef.current;
    if (!map || !positions.length) return;
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [28, 28], maxZoom: 16 });
    } else {
      map.setView(positions[0], 16);
    }
  };

  const snapToNearbyRoads = async () => {
    if (coordinates.length < 2 || Boolean(error) || !allowRoadSnap) return;

    setSnapping(true);
    setSnapMessage('');
    try {
      const response = await fetch('/api/roads/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ coordinates }),
      });
      const result = await response.json();

      if (!response.ok || result?.geometry?.type !== 'LineString' || !Array.isArray(result.geometry.coordinates) || result.geometry.coordinates.length < 2) {
        throw new Error(result?.error || 'Could not match the path to streets. Your current route was kept.');
      }

      updateCoordinates(result.geometry.coordinates);
      setSnapMessage(`Road match applied (${result.geometry.coordinates.length} points).`);
    } catch (snapError) {
      setSnapMessage(snapError.message || 'Road snapping failed. Your current route was kept.');
    } finally {
      setSnapping(false);
    }
  };

  return (
    <section ref={editorRef} className="route-geometry-editor space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-800">Route path</h4>
          <p className="text-xs text-slate-500">
            {coordinates.length} mapped points · A is the first point; B is the last.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Fit route in map"
            aria-label="Fit route in map"
            disabled={!positions.length}
            onClick={fitRoute}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Match this path to nearby streets"
            aria-label="Match this path to nearby streets"
            disabled={coordinates.length < 2 || Boolean(error) || snapping || !allowRoadSnap}
            onClick={snapToNearbyRoads}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Crosshair className={`h-4 w-4 ${snapping ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            title={isFullscreen ? 'Exit fullscreen map' : 'Expand map'}
            aria-label={isFullscreen ? 'Exit fullscreen map' : 'Expand map'}
            onClick={toggleFullscreen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-sky-50 hover:text-sky-700"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            title="Remove last point"
            aria-label="Remove last point"
            disabled={!coordinates.length || Boolean(error)}
            onClick={() => updateCoordinates(coordinates.slice(0, -1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Clear entire route path"
            aria-label="Clear entire route path"
            disabled={!coordinates.length || Boolean(error)}
            onClick={() => updateCoordinates([])}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Click the map to add a point. Drag the route markers to adjust the path; scroll to zoom.
      </p>
      <div className="route-geometry-map relative h-72 overflow-hidden rounded-lg border border-slate-300">
        <MapContainer
          center={DAGUPAN_CENTER}
          zoom={13}
          scrollWheelZoom
          doubleClickZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
          <RouteMapController isFullscreen={isFullscreen} mapRef={mapRef} />
          <MapPointPicker
            disabled={Boolean(error)}
            onAddPoint={(point) => updateCoordinates([...coordinates, point])}
          />
          <FitInitialRoute positions={positions} />
          {positions.length > 1 && (
            <Polyline positions={positions} pathOptions={{ color, weight: 5, opacity: 0.9 }} />
          )}
          {handleIndices.map((index) => {
            const position = positions[index];
            return (
            <Marker
              key={index}
              position={position}
              icon={routePointIcon(
                index === 0 ? 'A' : index === positions.length - 1 && positions.length > 1 ? 'B' : '',
                color
              )}
              draggable={!error}
              title={index === 0 ? 'Point A: route start'
                : index === positions.length - 1 && positions.length > 1 ? 'Point B: route end'
                : 'Drag to adjust this route point'}
              eventHandlers={{
                dragend(event) {
                  const { lat, lng } = event.target.getLatLng();
                  updateCoordinates(coordinates.map((point, pointIndex) =>
                    pointIndex === index ? [lng, lat] : point
                  ));
                },
              }}
            />
            );
          })}
        </MapContainer>
      </div>

      {fullscreenError && <p role="alert" className="text-xs font-medium text-rose-700">{fullscreenError}</p>}
      {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
      {snapMessage && (
        <p role="status" className={`text-xs font-medium ${snapMessage.includes('applied') ? 'text-emerald-700' : 'text-rose-700'}`}>
          {snapMessage}
        </p>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer font-semibold text-slate-600">GeoJSON coordinates</summary>
        <textarea
          rows="3"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder='{"type":"LineString","coordinates":[[120.334,16.043],[...]]}'
          className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 p-2 font-mono"
        />
        <p className="mt-1 text-slate-500">Use GeoJSON coordinates in [longitude, latitude] order. Invalid coordinates keep the last valid map preview visible.</p>
      </details>
      <p className="text-xs text-slate-500">Changes appear on the public map after you save the route.</p>
    </section>
  );
}