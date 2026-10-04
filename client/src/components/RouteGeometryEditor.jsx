import React, { useEffect, useRef } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Trash2, Undo2 } from 'lucide-react';

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

export default function RouteGeometryEditor({ value, onChange, color = '#ec4899' }) {
  const parsed = readCoordinates(value);
  const lastValidCoordinates = useRef([]);
  useEffect(() => {
    if (!parsed.error) lastValidCoordinates.current = parsed.coordinates;
  }, [value, parsed.error]);

  const { error } = parsed;
  const coordinates = error ? lastValidCoordinates.current : parsed.coordinates;
  const positions = coordinates.map(([longitude, latitude]) => [latitude, longitude]);

  const updateCoordinates = (nextCoordinates) => {
    onChange(nextCoordinates.length
      ? JSON.stringify({ type: 'LineString', coordinates: nextCoordinates })
      : '');
  };

  return (
    <section className="space-y-2">
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

      <div className="h-72 overflow-hidden rounded-lg border border-slate-300">
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
          <MapPointPicker
            disabled={Boolean(error)}
            onAddPoint={(point) => updateCoordinates([...coordinates, point])}
          />
          <FitInitialRoute positions={positions} />
          {positions.length > 1 && (
            <Polyline positions={positions} pathOptions={{ color, weight: 5, opacity: 0.9 }} />
          )}
          {positions.map((position, index) => (
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
          ))}
        </MapContainer>
      </div>

      {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}

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