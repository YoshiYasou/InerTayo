import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, LocateFixed, Lock, Maximize2, Minimize2, Trash2, Undo2, Unlock } from 'lucide-react';

const DAGUPAN_CENTER = [16.0433, 120.3333];

function routePointIcon(label, color, isActive = false) {
  const isEndpoint = Boolean(label);
  const size = isEndpoint ? 28 : isActive ? 20 : 18;
  const pointColor = label === 'A' ? '#059669' : label === 'B' ? '#e11d48' : isActive ? '#f59e0b' : color;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border:2px solid #fff;border-radius:50%;background:${pointColor};box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 11px/1 system-ui,sans-serif;cursor:grab">${label || ''}</div>`,
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

export default function RouteGeometryEditor({ value, onChange, walkingValue = '', onWalkingChange, token, color = '#ec4899', allowRoadSnap = true }) {
  const [activePath, setActivePath] = useState('route');
  const activeValue = activePath === 'walking' ? walkingValue : value;
  const changeActivePath = activePath === 'walking' ? onWalkingChange : onChange;
  const parsed = readCoordinates(activeValue);
  const secondaryParsed = readCoordinates(activePath === 'walking' ? value : walkingValue);
  const lastValidCoordinates = useRef({ route: [], walking: [] });
  const editorRef = useRef(null);
  const mapRef = useRef(null);
  const historyRef = useRef({ route: [], walking: [] });
  const segmentDragRef = useRef(null);
  const suppressNextLineClickRef = useRef(false);
  const [snapping, setSnapping] = useState(false);
  const [snapMessage, setSnapMessage] = useState('');
  const [activeHandleIndex, setActiveHandleIndex] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [moveWholeLine, setMoveWholeLine] = useState(false);
  const [, setHistoryRevision] = useState(0);
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
    if (!parsed.error) lastValidCoordinates.current[activePath] = parsed.coordinates;
  }, [activeValue, parsed.error, activePath]);

  const { error } = parsed;
  const coordinates = error ? lastValidCoordinates.current[activePath] : parsed.coordinates;
  const positions = coordinates.map(([longitude, latitude]) => [latitude, longitude]);
  const secondaryCoordinates = secondaryParsed.error ? [] : secondaryParsed.coordinates;
  const secondaryPositions = secondaryCoordinates.map(([longitude, latitude]) => [latitude, longitude]);
  const handleIndices = coordinates.length <= 12
    ? coordinates.map((_, index) => index)
    : Array.from({ length: 12 }, (_, index) => Math.round(index * (coordinates.length - 1) / 11));
  const selectedHandleIndex = activeHandleIndex ?? (coordinates.length ? 0 : null);
  const visibleHandleIndices = selectedHandleIndex !== null && selectedHandleIndex < coordinates.length
    ? [...new Set([...handleIndices, selectedHandleIndex])]
    : handleIndices;

  const updateCoordinates = (nextCoordinates, { recordHistory = true } = {}) => {
    if (recordHistory && JSON.stringify(nextCoordinates) !== JSON.stringify(coordinates)) {
      historyRef.current[activePath] = [...historyRef.current[activePath].slice(-99), coordinates];
      setHistoryRevision((revision) => revision + 1);
    }
    changeActivePath?.(nextCoordinates.length
      ? JSON.stringify({ type: 'LineString', coordinates: nextCoordinates })
      : '');
  };

  const undo = () => {
    const previousCoordinates = historyRef.current[activePath].pop();
    if (!previousCoordinates) return;
    setHistoryRevision((revision) => revision + 1);
    changeActivePath?.(previousCoordinates.length
      ? JSON.stringify({ type: 'LineString', coordinates: previousCoordinates })
      : '');
    setActiveHandleIndex(null);
  };

  useEffect(() => {
    const handleUndoShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || !isEditing) return;
      if (!editorRef.current?.contains(event.target)) return;
      if (event.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (!historyRef.current[activePath].length) return;
      event.preventDefault();
      undo();
    };
    document.addEventListener('keydown', handleUndoShortcut);
    return () => document.removeEventListener('keydown', handleUndoShortcut);
  }, [activePath, isEditing]);

  useEffect(() => () => {
    const drag = segmentDragRef.current;
    if (!drag) return;
    drag.map.off('mousemove', drag.moveHandler);
    drag.map.off('mouseup', drag.endHandler);
    window.removeEventListener('mouseup', drag.endHandler);
    if (drag.wasMapDraggingEnabled) drag.map.dragging.enable();
  }, []);

  const addPointOnRoute = (event) => {
    if (!isEditing || error || positions.length < 2 || !mapRef.current) return;

    const map = mapRef.current;
    const clickPoint = map.latLngToLayerPoint(event.latlng);
    let closestSegmentIndex = 0;
    let closestPoint = null;
    let closestDistance = Infinity;

    for (let index = 0; index < positions.length - 1; index += 1) {
      const start = map.latLngToLayerPoint(positions[index]);
      const end = map.latLngToLayerPoint(positions[index + 1]);
      const segmentX = end.x - start.x;
      const segmentY = end.y - start.y;
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
      const projection = segmentLengthSquared
        ? Math.max(0, Math.min(1, ((clickPoint.x - start.x) * segmentX + (clickPoint.y - start.y) * segmentY) / segmentLengthSquared))
        : 0;
      const pointX = start.x + projection * segmentX;
      const pointY = start.y + projection * segmentY;
      const distanceX = clickPoint.x - pointX;
      const distanceY = clickPoint.y - pointY;
      const distanceSquared = distanceX * distanceX + distanceY * distanceY;

      if (distanceSquared < closestDistance) {
        closestDistance = distanceSquared;
        closestSegmentIndex = index;
        closestPoint = map.layerPointToLatLng(L.point(pointX, pointY));
      }
    }

    if (!closestPoint) return;
    const insertedIndex = closestSegmentIndex + 1;
    const nextCoordinates = [...coordinates];
    nextCoordinates.splice(insertedIndex, 0, [closestPoint.lng, closestPoint.lat]);
    setSelectedSection(null);
    setActiveHandleIndex(insertedIndex);
    updateCoordinates(nextCoordinates);
  };

  const startSegmentDrag = (event) => {
    if (!isEditing || error || !mapRef.current || coordinates.length < 2) return;
    const map = mapRef.current;
    const pointerStart = map.latLngToLayerPoint(event.latlng);
    let closestSegmentIndex = 0;
    let closestDistance = Infinity;

    for (let index = 0; index < positions.length - 1; index += 1) {
      const start = map.latLngToLayerPoint(positions[index]);
      const end = map.latLngToLayerPoint(positions[index + 1]);
      const segmentX = end.x - start.x;
      const segmentY = end.y - start.y;
      const lengthSquared = segmentX * segmentX + segmentY * segmentY;
      const projection = lengthSquared
        ? Math.max(0, Math.min(1, ((pointerStart.x - start.x) * segmentX + (pointerStart.y - start.y) * segmentY) / lengthSquared))
        : 0;
      const distanceX = pointerStart.x - (start.x + projection * segmentX);
      const distanceY = pointerStart.y - (start.y + projection * segmentY);
      const distance = distanceX * distanceX + distanceY * distanceY;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestSegmentIndex = index;
      }
    }

    const originalCoordinates = coordinates.map((point) => [...point]);
    const projectedPoints = originalCoordinates.map(([longitude, latitude]) =>
      map.latLngToLayerPoint([latitude, longitude])
    );
    const cumulativeDistances = [0];
    for (let index = 1; index < projectedPoints.length; index += 1) {
      cumulativeDistances.push(cumulativeDistances[index - 1] + projectedPoints[index - 1].distanceTo(projectedPoints[index]));
    }
    const wasMapDraggingEnabled = map.dragging.enabled();
    if (wasMapDraggingEnabled) map.dragging.disable();
    event.originalEvent?.preventDefault();

    const drag = {
      map,
      originalCoordinates,
      pointerStart,
      projectedPoints,
      cumulativeDistances,
      segmentIndex: closestSegmentIndex,
      wasMapDraggingEnabled,
      didMove: false,
      ended: false,
    };
    drag.moveHandler = (moveEvent) => {
      const pointer = map.latLngToLayerPoint(moveEvent.latlng);
      const offsetX = pointer.x - drag.pointerStart.x;
      const offsetY = pointer.y - drag.pointerStart.y;
      if (Math.abs(offsetX) + Math.abs(offsetY) > 2) drag.didMove = true;
      if (!drag.didMove) return;

      const nextCoordinates = drag.originalCoordinates.map((point) => [...point]);
      drag.originalCoordinates.forEach((_, pointIndex) => {
        const segmentStart = drag.cumulativeDistances[drag.segmentIndex];
        const segmentEnd = drag.cumulativeDistances[drag.segmentIndex + 1];
        const distanceOutsideSegment = drag.cumulativeDistances[pointIndex] < segmentStart
          ? segmentStart - drag.cumulativeDistances[pointIndex]
          : drag.cumulativeDistances[pointIndex] > segmentEnd
            ? drag.cumulativeDistances[pointIndex] - segmentEnd
            : 0;
        const influence = moveWholeLine ? 1 : Math.max(0, 1 - distanceOutsideSegment / 180);
        if (!influence) return;
        const easedInfluence = influence * influence * (3 - 2 * influence);
        const movedPoint = map.layerPointToLatLng(L.point(
          drag.projectedPoints[pointIndex].x + offsetX * easedInfluence,
          drag.projectedPoints[pointIndex].y + offsetY * easedInfluence
        ));
        nextCoordinates[pointIndex] = [movedPoint.lng, movedPoint.lat];
      });
      changeActivePath?.(JSON.stringify({ type: 'LineString', coordinates: nextCoordinates }));
    };
    drag.endHandler = () => {
      if (drag.ended) return;
      drag.ended = true;
      map.off('mousemove', drag.moveHandler);
      map.off('mouseup', drag.endHandler);
      window.removeEventListener('mouseup', drag.endHandler);
      if (drag.wasMapDraggingEnabled) map.dragging.enable();
      segmentDragRef.current = null;
      if (drag.didMove) {
        historyRef.current[activePath] = [...historyRef.current[activePath].slice(-99), drag.originalCoordinates];
        setHistoryRevision((revision) => revision + 1);
        suppressNextLineClickRef.current = true;
        window.setTimeout(() => {
          suppressNextLineClickRef.current = false;
        }, 250);
        setActiveHandleIndex(drag.segmentIndex);
      }
    };
    segmentDragRef.current = drag;
    map.on('mousemove', drag.moveHandler);
    map.on('mouseup', drag.endHandler);
    window.addEventListener('mouseup', drag.endHandler);
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
    if (!isEditing || activePath === 'walking' || coordinates.length < 2 || Boolean(error) || !allowRoadSnap) return;

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
          <div className="mt-2 inline-flex rounded-md border border-slate-200 p-0.5">
            {[
              { id: 'route', label: 'Transit path' },
              { id: 'walking', label: 'Walking path' },
            ].map((path) => (
              <button
                key={path.id}
                type="button"
                aria-pressed={activePath === path.id}
                onClick={() => {
                  setActivePath(path.id);
                  setActiveHandleIndex(null);
                  setSelectedSection(null);
                }}
                className={`rounded px-2.5 py-1 text-xs font-semibold ${activePath === path.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {path.label}
                {path.id === 'walking' && <span className="ml-1 text-sky-500">- - -</span>}
              </button>
            ))}
          </div>
          {coordinates.length > 0 && (
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <label htmlFor="route-point-index">Selected point</label>
              <input
                id="route-point-index"
                type="number"
                min="1"
                max={coordinates.length}
                value={(selectedHandleIndex ?? 0) + 1}
                disabled={!isEditing}
                onChange={(event) => {
                  const pointIndex = Number(event.target.value) - 1;
                  if (Number.isInteger(pointIndex) && pointIndex >= 0 && pointIndex < coordinates.length) {
                    setActiveHandleIndex(pointIndex);
                  }
                }}
                className="h-7 w-16 rounded border border-slate-300 px-2 text-xs"
              />
              <span>of {coordinates.length}</span>
              <button
                type="button"
                title="Remove selected point"
                aria-label="Remove selected point"
                disabled={!isEditing || coordinates.length <= 2 || selectedHandleIndex === null || Boolean(error)}
                onClick={() => {
                  const nextCoordinates = coordinates.filter((_, index) => index !== selectedHandleIndex);
                  updateCoordinates(nextCoordinates);
                  setActiveHandleIndex(Math.min(selectedHandleIndex, nextCoordinates.length - 1));
                  setSelectedSection(null);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Delete selected section"
                aria-label="Delete selected section"
                disabled={!isEditing || !selectedSection || Math.abs(selectedSection.start - selectedSection.end) <= 1 || Boolean(error)}
                onClick={() => {
                  const { start, end } = selectedSection;
                  const sectionStart = Math.min(start, end);
                  const sectionEnd = Math.max(start, end);
                  const nextCoordinates = coordinates.filter((_, index) => index <= sectionStart || index >= sectionEnd);
                  updateCoordinates(nextCoordinates);
                  setSelectedSection(null);
                  setActiveHandleIndex(Math.min(sectionStart, nextCoordinates.length - 1));
                }}
                className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete section
              </button>
            </div>
          )}
          {selectedSection && (
            <p className="mt-1 text-[11px] text-slate-500">
              Selected section: points {Math.min(selectedSection.start, selectedSection.end) + 1} to {Math.max(selectedSection.start, selectedSection.end) + 1}. Deleting removes the points inside and joins the ends.
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={isEditing ? 'Lock route editing' : 'Unlock route editing'}
            aria-label={isEditing ? 'Lock route editing' : 'Unlock route editing'}
            aria-pressed={isEditing}
            onClick={() => setIsEditing((editing) => !editing)}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${isEditing ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}
          >
            {isEditing ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {isEditing ? 'Editing' : 'Edit route'}
          </button>
          <button
            type="button"
            title={moveWholeLine ? 'Disable whole-line moving' : 'Move the entire path while preserving its shape'}
            aria-label={moveWholeLine ? 'Disable whole-line moving' : 'Move the entire path'}
            aria-pressed={moveWholeLine}
            disabled={!isEditing || coordinates.length < 2}
            onClick={() => setMoveWholeLine((moving) => !moving)}
            className={`inline-flex h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${moveWholeLine ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}
          >
            {moveWholeLine ? 'Move all' : 'Move section'}
          </button>
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
            disabled={!isEditing || activePath === 'walking' || coordinates.length < 2 || Boolean(error) || snapping || !allowRoadSnap}
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
            title="Undo last route edit (Ctrl+Z)"
            aria-label="Undo last route edit"
            disabled={!historyRef.current[activePath].length || !isEditing}
            onClick={undo}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Clear entire route path"
            aria-label="Clear entire route path"
            disabled={!isEditing || !coordinates.length || Boolean(error)}
            onClick={() => updateCoordinates([])}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {isEditing
          ? 'Click the map to extend the route. Click the line to add a control point, then Shift-click two points to select the part between them for deletion. Drag points to reshape, or drag a line section to move it. Ctrl+Z undoes the last edit.'
          : 'Route editing is locked. Unlock editing to add points, reshape the route, or move a line section.'}
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
          {secondaryPositions.length > 1 && (
            <Polyline
              positions={secondaryPositions}
              pathOptions={{
                color: activePath === 'walking' ? color : '#2563eb',
                weight: 5,
                opacity: 0.6,
                dashArray: activePath === 'walking' ? undefined : '8 8',
                lineCap: 'round',
                interactive: false,
              }}
            />
          )}
          <MapPointPicker
            disabled={!isEditing || Boolean(error)}
            onAddPoint={(point) => updateCoordinates([...coordinates, point])}
          />
          <FitInitialRoute positions={positions} />
          {positions.length > 1 && (
            <Polyline
              positions={positions}
              pathOptions={{
                color: activePath === 'walking' ? '#2563eb' : color,
                weight: 7,
                opacity: 0.95,
                dashArray: activePath === 'walking' ? '8 8' : undefined,
                lineCap: 'round',
                bubblingMouseEvents: false,
              }}
              eventHandlers={{
                click(event) {
                  if (suppressNextLineClickRef.current) {
                    suppressNextLineClickRef.current = false;
                    return;
                  }
                  addPointOnRoute(event);
                },
                mousedown: startSegmentDrag,
              }}
            />
          )}
          {selectedSection && positions.length > 1 && (
            <Polyline
              positions={positions.slice(
                Math.min(selectedSection.start, selectedSection.end),
                Math.max(selectedSection.start, selectedSection.end) + 1
              )}
              pathOptions={{
                color: '#dc2626',
                weight: 11,
                opacity: 0.9,
                lineCap: 'round',
                interactive: false,
              }}
            />
          )}
          {visibleHandleIndices.map((index) => {
            const position = positions[index];
            return (
            <Marker
              key={index}
              position={position}
              icon={routePointIcon(
                index === 0 ? 'A' : index === positions.length - 1 && positions.length > 1 ? 'B' : '',
                activePath === 'walking' ? '#2563eb' : color,
                index === selectedHandleIndex
              )}
              draggable={isEditing && !error}
              title={index === activeHandleIndex ? 'New control point: drag to adjust this section'
                : index === 0 ? 'Point A: route start'
                : index === positions.length - 1 && positions.length > 1 ? 'Point B: route end'
                : 'Drag to adjust this route point'}
              eventHandlers={{
                click(event) {
                  if (event.originalEvent?.shiftKey) {
                    if (selectedHandleIndex === null) {
                      setActiveHandleIndex(index);
                      return;
                    }

                    const start = Math.min(selectedHandleIndex, index);
                    const end = Math.max(selectedHandleIndex, index);
                    setSelectedSection({ start, end });
                    setActiveHandleIndex(end);
                    return;
                  }

                  setSelectedSection(null);
                  setActiveHandleIndex(index);
                },
                dragend(event) {
                  const { lat, lng } = event.target.getLatLng();
                  updateCoordinates(coordinates.map((point, pointIndex) =>
                    pointIndex === index ? [lng, lat] : point
                  ));
                  setSelectedSection(null);
                  setActiveHandleIndex(index);
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
          value={activeValue}
          disabled={!isEditing}
          onChange={(event) => changeActivePath?.(event.target.value)}
          placeholder='{"type":"LineString","coordinates":[[120.334,16.043],[...]]}'
          className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 p-2 font-mono"
        />
        <p className="mt-1 text-slate-500">Use GeoJSON coordinates in [longitude, latitude] order. Invalid coordinates keep the last valid map preview visible.</p>
      </details>
      <p className="text-xs text-slate-500">Changes appear on the public map after you save the route.</p>
    </section>
  );
}