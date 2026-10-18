import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bike, Bus, CarFront, Ship } from 'lucide-react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const DAGUPAN_CENTER = [16.0433, 120.3333];

const MODE_MARKERS = [
  { match: 'tricycle', icon: Bike, color: '#06b6d4' },
  { match: 'boat', icon: Ship, color: '#2563eb' },
  { match: 'provincial', icon: Bus, color: '#8b5cf6' },
  { match: 'modern', icon: Bus, color: '#f97316' },
  { match: 'puv', icon: Bus, color: '#f97316' },
  { match: 'jeep', icon: CarFront, color: '#ec4899' },
  { match: 'bus', icon: Bus, color: '#10b981' },
];

function pinIcon(mode) {
  const normalizedMode = String(mode || '').toLowerCase();
  const marker = MODE_MARKERS.find(({ match }) => normalizedMode.includes(match));
  const color = marker?.color || '#dc2626';
  const icon = marker
    ? `<span style="position:absolute;left:4px;top:4px;transform:rotate(45deg);display:flex;align-items:center;justify-content:center">${renderToStaticMarkup(
      React.createElement(marker.icon, { size: 13, strokeWidth: 2.5, color: '#fff' })
    )}</span>`
    : '';

  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:22px;height:22px;border:3px solid #fff;
      border-radius:50% 50% 50% 0;background:${color};box-shadow:0 2px 5px rgba(0,0,0,.4);
      transform:rotate(-45deg)">${icon}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

function MapClickHandler({ onPin }) {
  useMapEvents({
    click(event) {
      onPin(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function LocationPinPicker({ latitude, longitude, onPin, mode }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const hasPin = latitude !== '' && longitude !== '' && Number.isFinite(lat) && Number.isFinite(lng);
  const position = hasPin ? [lat, lng] : null;
  const markerIcon = React.useMemo(() => pinIcon(mode), [mode]);

  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-xs font-bold text-slate-700">Pin location</p>
        <p className="text-[11px] text-slate-500">Click the map to place the pin, or drag it to adjust.</p>
      </div>
      <div className="h-56 overflow-hidden rounded-lg border border-slate-300">
        <MapContainer
          center={position || DAGUPAN_CENTER}
          zoom={position ? 16 : 13}
          scrollWheelZoom
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
          <MapClickHandler onPin={onPin} />
          {position && (
            <Marker
              position={position}
              icon={markerIcon}
              draggable
              title="Drag to adjust the location pin"
              eventHandlers={{
                dragend(event) {
                  const { lat: nextLat, lng: nextLng } = event.target.getLatLng();
                  onPin(nextLat, nextLng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}