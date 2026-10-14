/**
 * InerTayo Journey Planner Engine
 * Multi-modal routing engine for Dagupan City public transportation.
 * Generates direct transit, 1-transfer transit, river boat crossings, and walking itineraries.
 * Accurately slices authoritative route polylines and uses road-following walking paths.
 * Integrates flood hazard advisories with clear commuter warnings.
 */

const School = require('../models/School');
const Location = require('../models/Location');
const Landmark = require('../models/Landmark');
const Route = require('../models/Route');
const TransportMode = require('../models/TransportMode');
const Stop = require('../models/Stop');
const Advisory = require('../models/Advisory');
const AdvisoryRoute = require('../models/AdvisoryRoute');
const BoatRouteDetail = require('../models/BoatRouteDetail');
const ROUTING_CONFIG = require('../config/routingConfig');
const { sliceTransitRoute } = require('../utils/transitSlicer');
const { getWalkingRoute } = require('./walkingRouter');
const { pointDistanceMeters, lngLatToLatLng, latLngToLngLat } = require('../utils/geoUtils');
const {
    findActiveRouteDetour,
    hasExplicitRouteDetour,
    hasLegacyActiveDetour,
    readDetourSteps,
    readLineString
} = require('../utils/routeDetour');
const nearestPointOnLine = require('@turf/nearest-point-on-line').default || require('@turf/nearest-point-on-line');
const { point, lineString } = require('@turf/helpers');

/**
 * Standardize input coordinate to { lat, lng, name }
 */
async function resolveLocation(input) {
    if (!input) return null;

    if (typeof input === 'object') {
        const rawLat = input.latitude ?? input.lat;
        const rawLng = input.longitude ?? input.lng ?? input.lon;
        const lat = Number(rawLat);
        const lng = Number(rawLng);
        if (rawLat != null && rawLng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
            return {
                lat,
                lng,
                name: input.name || input.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
            };
        }

        const placeName = input.name || input.address;
        if (typeof placeName === 'string' && placeName.trim()) {
            return resolveLocation(placeName.trim());
        }

        return null;
    }

    if (typeof input === 'string') {
        const trimmed = input.trim();
        // Check "lng,lat" or "lat,lng"
        if (/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(trimmed)) {
            const parts = trimmed.split(',').map(s => Number(s.trim()));
            // In Dagupan, lat is ~16, lng is ~120
            let lat = parts[0];
            let lng = parts[1];
            if (lat > 50 && lng < 50) {
                // swapped lng, lat
                lng = parts[0];
                lat = parts[1];
            }
            return { lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
        }

        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const safeSearch = escapeRegex(trimmed);

        // Search in schools first
        const school = await School.findOne({
            active: 1,
            $or: [
                { name: { $regex: safeSearch, $options: 'i' } },
                { aliases: { $regex: safeSearch, $options: 'i' } }
            ]
        }).lean();
        if (school) {
            return {
                lat: school.entrance_latitude || school.latitude,
                lng: school.entrance_longitude || school.longitude,
                name: school.name
            };
        }

        // Search in locations
        const loc = await Location.findOne({
            status: { $ne: 'INACTIVE' },
            $or: [
                { name: { $regex: safeSearch, $options: 'i' } },
                { search_keywords: { $regex: safeSearch, $options: 'i' } }
            ]
        }).lean();
        if (loc) {
            return { lat: loc.latitude, lng: loc.longitude, name: loc.name };
        }

        // Search in landmarks
        const lm = await Landmark.findOne({ name: { $regex: safeSearch, $options: 'i' } }).lean();
        if (lm) {
            return { lat: lm.latitude, lng: lm.longitude, name: lm.name };
        }

        // Search in transit stops
        const stp = await Stop.findOne({
            stop_name: { $regex: safeSearch, $options: 'i' }
        }).lean();
        if (stp && typeof stp.latitude === 'number' && typeof stp.longitude === 'number') {
            return { lat: stp.latitude, lng: stp.longitude, name: stp.stop_name };
        }

        // Search by individual words if multi-word phrase
        const words = trimmed.split(/[\s,–-]+/).filter(w => w.length >= 3);
        if (words.length > 0) {
            const wordOr = words.map(w => ({ name: { $regex: escapeRegex(w), $options: 'i' } }));
            const locLike = await Location.findOne({ status: { $ne: 'INACTIVE' }, $or: wordOr }).lean();
            if (locLike) {
                return { lat: locLike.latitude, lng: locLike.longitude, name: locLike.name };
            }
            const lmLike = await Landmark.findOne({ $or: wordOr }).lean();
            if (lmLike) {
                return { lat: lmLike.latitude, lng: lmLike.longitude, name: lmLike.name };
            }
            const stopOr = words.map(w => ({ stop_name: { $regex: escapeRegex(w), $options: 'i' } }));
            const stopLike = await Stop.findOne({ $or: stopOr }).lean();
            if (stopLike && typeof stopLike.latitude === 'number' && typeof stopLike.longitude === 'number') {
                return { lat: stopLike.latitude, lng: stopLike.longitude, name: stopLike.stop_name };
            }
        }

    }

    return null;
}

/**
 * Find nearest transit stop to a coordinate on a specific route
 */
function findNearestStop(stops, coord) {
    if (!Array.isArray(stops) || stops.length === 0) return null;
    let closest = null;
    let minDist = Infinity;

    for (const stop of stops) {
        if (typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') continue;
        const d = pointDistanceMeters([coord.lng, coord.lat], [stop.longitude, stop.latitude], true);
        if (d < minDist) {
            minDist = d;
            closest = { ...stop, distanceMeters: Math.round(d) };
        }
    }
    return closest;
}

/**
 * Calculate distance from a point to a route polyline
 */
function distanceToRoutePolyline(routeCoords, pointLngLat) {
    if (!Array.isArray(routeCoords) || routeCoords.length < 2) return Infinity;
    try {
        const line = lineString(routeCoords);
        const pt = point(pointLngLat);
        const snapped = nearestPointOnLine(line, pt);
        return pointDistanceMeters(pointLngLat, snapped.geometry.coordinates, true);
    } catch (e) {
        return Infinity;
    }
}

function parseLineStringCoordinates(value) {
    if (!value) return [];
    try {
        const geometry = typeof value === 'string' ? JSON.parse(value) : value;
        if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return [];
        return geometry.coordinates.every(coordinate =>
            Array.isArray(coordinate) && coordinate.length >= 2 &&
            Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])
        ) ? geometry.coordinates : [];
    } catch {
        return [];
    }
}

function getAdvisoryTimeBuffer(route) {
    if (!route.activeDetour && !route.legacyDetourActive) return 0;
    const detourTime = route.activeDetour?.detourTime || route.detour_time;
    if (detourTime && route.estimated_time && detourTime > route.estimated_time) {
        return Math.round(detourTime - route.estimated_time);
    }
    return 5;
}

function getRouteFloodWarning(route) {
    if (!route.advisories?.length) return null;
    const advisory = route.activeDetour || route.advisories[0];
    if (route.activeDetour || route.legacyDetourActive) {
        return `Route adjusted because a flood-affected road segment was detected (${advisory.affected_road}: ${advisory.title}).`;
    }
    return `Flood advisory active for ${advisory.affected_road}: ${advisory.title}. No detour is configured for this route.`;
}

function routeHasDetour(route) {
    return Boolean(route.activeDetour || route.legacyDetourActive);
}

/**
 * Main Journey Planner function
 * @param {object} params - { origin, destination, preferredModes, leaveNow }
 * @returns {Promise<object>} { origin, destination, itineraries: [...] }
 */
async function planJourney({ origin, destination, preferredModes = 'ALL', leaveNow = true }) {
    const orig = await resolveLocation(origin);
    const dest = await resolveLocation(destination);

    if (!orig || !dest) {
        throw new Error('Unable to resolve valid coordinates for origin or destination in Dagupan City.');
    }

    const origLngLat = [orig.lng, orig.lat];
    const destLngLat = [dest.lng, dest.lat];

    const straightDist = pointDistanceMeters(origLngLat, destLngLat, true);
    if (straightDist < 20) {
        return {
            origin: orig,
            destination: dest,
            itineraries: [
                {
                    id: 'same-location',
                    title: 'You are already here',
                    summary: 'Origin and destination are at the same location',
                    totalDurationMinutes: 0,
                    totalDurationFormatted: '0 min',
                    totalDistanceMeters: 0,
                    totalFare: 0,
                    totalFareFormatted: '₱0.00',
                    floodStatus: 'CLEAR',
                    floodWarning: null,
                    legs: []
                }
            ]
        };
    }

    // Load active transport modes and routes
    const rawRoutes = await Route.find({ status: { $ne: 'INACTIVE' } }).lean();
    const modes = await TransportMode.find().lean();
    const modeMap = new Map(modes.map(m => [m.id, m]));
    const boatDetails = await BoatRouteDetail.find().lean();
    const boatMap = new Map(boatDetails.map(b => [b.route_id, b]));

    const allStops = await Stop.find().sort({ stop_order: 1 }).lean();
    const stopsByRoute = new Map();
    for (const stop of allStops) {
        if (!stopsByRoute.has(stop.route_id)) stopsByRoute.set(stop.route_id, []);
        stopsByRoute.get(stop.route_id).push(stop);
    }

    const activeAdvisories = await Advisory.find({ status: 'ACTIVE' }).lean();
    const advMap = new Map(activeAdvisories.map(a => [a.id, a]));
    const advisoryRoutes = await AdvisoryRoute.find().lean();
    const advisoriesByRoute = new Map();
    for (const ar of advisoryRoutes) {
        if (advMap.has(ar.advisory_id)) {
            if (!advisoriesByRoute.has(ar.route_id)) advisoriesByRoute.set(ar.route_id, []);
            advisoriesByRoute.get(ar.route_id).push({
                ...advMap.get(ar.advisory_id),
                routeAdvisory: ar
            });
        }
    }

    // Extract active flood advisories and build avoidance polygons for pedestrian routing
    let floodAvoidPolygons = null;
    const floodRoadsList = [];
    for (const adv of activeAdvisories) {
        if (adv.affected_road) {
            floodRoadsList.push(...adv.affected_road.split(/[,;&]+/).map(s => s.trim()).filter(Boolean));
        }
    }
    if (activeAdvisories.length > 0) {
        // Enclosing corridor polygon around active high tide / flooded streets in Downtown
        floodAvoidPolygons = {
            type: 'Polygon',
            coordinates: [[
                [120.3330, 16.0410],
                [120.3430, 16.0450],
                [120.3430, 16.0475],
                [120.3330, 16.0435],
                [120.3330, 16.0410]
            ]]
        };
    }
    const walkOptions = {
        avoidPolygons: floodAvoidPolygons,
        avoidRoads: floodRoadsList
    };

    const routes = [];
    for (const r of rawRoutes) {
        const mode = modeMap.get(r.transport_mode_id) || {};
        const boat = boatMap.get(r.id);
        const routeAdvisories = advisoriesByRoute.get(r.id) || [];
        const routeLinks = routeAdvisories.map(advisory => advisory.routeAdvisory);
        const activeDetourMatch = findActiveRouteDetour(routeLinks, routeAdvisories);
        const activeDetour = activeDetourMatch ? {
            ...activeDetourMatch.advisory,
            routeAdvisory: activeDetourMatch.link
        } : null;
        const hasExplicitDetour = hasExplicitRouteDetour(routeLinks);
        const legacyDetourActive = hasLegacyActiveDetour(r, routeLinks, routeAdvisories);
        const normalGeometry = (r.use_corrected_geometry === 1 && r.geometry_corrected) ? r.geometry_corrected : r.geometry;
        const geom = activeDetour?.routeAdvisory.detour_geometry || normalGeometry;

        const coords = parseLineStringCoordinates(geom);

        routes.push({
            ...r,
            mode_name: mode.name,
            mode_icon: mode.icon,
            waterway: boat ? boat.waterway : null,
            boat_operating_status: boat ? boat.operating_status : null,
            geometry: geom,
            parsedCoordinates: coords,
            stops: stopsByRoute.get(r.id) || [],
            advisories: routeAdvisories,
            hasExplicitDetour,
            legacyDetourActive,
            activeDetour: activeDetour ? {
                title: activeDetour.title,
                affectedRoad: activeDetour.affected_road,
                floodedCoordinates: readLineString(activeDetour.routeAdvisory.flooded_geometry).coordinates,
                detourTime: activeDetour.routeAdvisory.detour_time,
                detourSteps: readDetourSteps(activeDetour.routeAdvisory),
                detourInstructions: activeDetour.routeAdvisory.detour_instructions || ''
            } : null
        });
    }

    const candidateItineraries = [];

    // Mode filter check helper
    const isModeAllowed = (modeName) => {
        if (!preferredModes || preferredModes === 'ALL') return true;
        if (Array.isArray(preferredModes)) {
            return preferredModes.some(m => m.toLowerCase() === modeName.toLowerCase());
        }
        return preferredModes.toLowerCase().includes(modeName.toLowerCase());
    };

    // 1. Direct Transit Routes (Single Route: Walk -> Transit -> Walk)
    const MAX_WALK = ROUTING_CONFIG.walkingRadius || 600; // 600m

    for (const route of routes) {
        if (!isModeAllowed(route.mode_name)) continue;
        if (route.status === 'UNAVAILABLE' || route.boat_operating_status === 'SUSPENDED') continue;
        if (!route.parsedCoordinates || route.parsedCoordinates.length < 2) continue;

        const distToOrig = distanceToRoutePolyline(route.parsedCoordinates, origLngLat);
        const distToDest = distanceToRoutePolyline(route.parsedCoordinates, destLngLat);

        // Allow slightly larger walk radius (up to 750m) if direct transit connects them
        if (distToOrig <= MAX_WALK * 1.25 && distToDest <= MAX_WALK * 1.25) {
            const sliced = sliceTransitRoute(route.parsedCoordinates, origLngLat, destLngLat, route.mode_name);
            if (!sliced || sliced.distanceMeters < 150) continue;

            // Generate walking route 1: Origin to boarding point
            const walk1 = await getWalkingRoute(origLngLat, sliced.snappedBoarding, walkOptions);
            // Generate walking route 2: Alighting point to Destination
            const walk2 = await getWalkingRoute(sliced.snappedAlighting, destLngLat, walkOptions);

            const walk1Mins = ROUTING_CONFIG.estimateDurationMinutes(walk1.distanceMeters, 'walk');
            const walk2Mins = ROUTING_CONFIG.estimateDurationMinutes(walk2.distanceMeters, 'walk');
            let transitMins = sliced.durationMinutes;

            let floodStatus = 'CLEAR';
            let floodWarning = null;
            if (route.advisories && route.advisories.length > 0) {
                floodStatus = routeHasDetour(route) ? 'DETOUR_ACTIVE' : 'ADVISORY';
                floodWarning = getRouteFloodWarning(route);
                transitMins += getAdvisoryTimeBuffer(route);
            }

            const totalDurationMinutes = walk1Mins + transitMins + walk2Mins;
            const totalDistanceMeters = walk1.distanceMeters + sliced.distanceMeters + walk2.distanceMeters;

            // Find closest stop names for friendly commuter instructions
            const boardStop = findNearestStop(route.stops, { lat: sliced.snappedBoarding[1], lng: sliced.snappedBoarding[0] });
            const alightStop = findNearestStop(route.stops, { lat: sliced.snappedAlighting[1], lng: sliced.snappedAlighting[0] });

            const boardName = boardStop ? boardStop.stop_name : 'designated transit stop';
            const alightName = alightStop ? alightStop.stop_name : 'alighting stop';

            const legs = [];

            // Leg 1: Walk to Boarding
            if (walk1.distanceMeters > 15) {
                legs.push({
                    id: `leg-${route.id}-walk1`,
                    type: 'WALK',
                    mode: 'Walking',
                    durationMinutes: walk1Mins,
                    durationFormatted: ROUTING_CONFIG.formatDuration(walk1Mins),
                    distanceMeters: walk1.distanceMeters,
                    instruction: `Walk ${walk1.distanceMeters}m to ${boardName}`,
                    fare: 0,
                    coordinates: walk1.coordinates,
                    geometry: { type: 'LineString', coordinates: walk1.coordinates },
                    isApproximate: walk1.isApproximate
                });
            }

            // Leg 2: Transit Ride (sliced road polyline)
            legs.push({
                id: `leg-${route.id}-transit`,
                type: 'TRANSIT',
                mode: route.mode_name,
                routeId: route.id,
                routeName: route.route_name,
                durationMinutes: transitMins,
                durationFormatted: ROUTING_CONFIG.formatDuration(transitMins),
                distanceMeters: sliced.distanceMeters,
                instruction: `Ride ${route.mode_name} (${route.route_name}) from ${boardName} to ${alightName}${route.activeDetour ? ` via the detour around ${route.activeDetour.affectedRoad}` : ''}`,
                fare: route.minimum_fare || 15.0,
                coordinates: sliced.coordinates,
                geometry: { type: 'LineString', coordinates: sliced.coordinates },
                detourActive: Boolean(route.activeDetour),
                floodedCoordinates: route.activeDetour?.floodedCoordinates || [],
                advisoryTitle: route.activeDetour?.title || null,
                detourInstructions: route.activeDetour?.detourInstructions || '',
                boardStopName: boardName,
                alightStopName: alightName,
                boardCoordinates: sliced.snappedBoarding,
                alightCoordinates: sliced.snappedAlighting
            });

            // Leg 3: Walk to Destination
            if (walk2.distanceMeters > 15) {
                legs.push({
                    id: `leg-${route.id}-walk2`,
                    type: 'WALK',
                    mode: 'Walking',
                    durationMinutes: walk2Mins,
                    durationFormatted: ROUTING_CONFIG.formatDuration(walk2Mins),
                    distanceMeters: walk2.distanceMeters,
                    instruction: `Walk ${walk2.distanceMeters}m to ${dest.name}`,
                    fare: 0,
                    coordinates: walk2.coordinates,
                    geometry: { type: 'LineString', coordinates: walk2.coordinates },
                    isApproximate: walk2.isApproximate
                });
            }

            candidateItineraries.push({
                id: `direct-${route.id}`,
                title: `${route.mode_name}: ${route.route_name}`,
                summary: legs.map(l => l.mode).join(' → '),
                primaryMode: route.mode_name,
                totalDurationMinutes,
                totalDurationFormatted: ROUTING_CONFIG.formatDuration(totalDurationMinutes),
                totalDistanceMeters,
                totalFare: route.minimum_fare || 15.0,
                totalFareFormatted: `₱${(route.minimum_fare || 15.0).toFixed(2)}`,
                floodStatus,
                floodWarning,
                legs
            });
        }
    }

    // 2. River Boat Crossing Option (Route 22, 23 or any boat route)
    const boatRoute = routes.find(r => r.mode_name.toLowerCase() === 'boat');
    if (boatRoute && isModeAllowed('Boat') && boatRoute.boat_operating_status !== 'SUSPENDED') {
        // Dynamically query river stops from database Location collection
        const riverStops = await Location.find({ type: 'RIVER_STOP', status: { $ne: 'INACTIVE' } }).lean();
        const docks = (riverStops.length >= 2)
            ? riverStops.map(s => ({ name: s.name, lat: s.latitude, lng: s.longitude }))
            : [
                { name: 'Pantal River Dock (Downtown Side)', lat: 16.0395, lng: 120.3310 },
                { name: 'Pantal River Dock (Bonuan Side)', lat: 16.0620, lng: 120.3420 }
            ];

        // Determine orientation
        const d1Orig = pointDistanceMeters(origLngLat, [docks[0].lng, docks[0].lat], true);
        const d2Orig = pointDistanceMeters(origLngLat, [docks[1].lng, docks[1].lat], true);

        const boardDock = d1Orig < d2Orig ? docks[0] : docks[1];
        const alightDock = d1Orig < d2Orig ? docks[1] : docks[0];

        const walkToDock = pointDistanceMeters(origLngLat, [boardDock.lng, boardDock.lat], true);
        const walkFromDock = pointDistanceMeters([alightDock.lng, alightDock.lat], destLngLat, true);

        // If reasonable commute using river boat
        if (walkToDock < 1500 && walkFromDock < 1800) {
            const walk1 = await getWalkingRoute(origLngLat, [boardDock.lng, boardDock.lat], walkOptions);
            const slicedBoat = sliceTransitRoute(boatRoute.parsedCoordinates, [boardDock.lng, boardDock.lat], [alightDock.lng, alightDock.lat], 'boat');
            const walk2 = await getWalkingRoute([alightDock.lng, alightDock.lat], destLngLat, walkOptions);

            if (slicedBoat) {
                const walk1Mins = ROUTING_CONFIG.estimateDurationMinutes(walk1.distanceMeters, 'walk');
                const boatMins = slicedBoat.durationMinutes;
                const walk2Mins = ROUTING_CONFIG.estimateDurationMinutes(walk2.distanceMeters, 'walk');
                const totalMins = walk1Mins + boatMins + walk2Mins;
                const totalDist = walk1.distanceMeters + slicedBoat.distanceMeters + walk2.distanceMeters;

                const legs = [
                    {
                        id: `boat-walk1`,
                        type: 'WALK',
                        mode: 'Walking',
                        durationMinutes: walk1Mins,
                        durationFormatted: ROUTING_CONFIG.formatDuration(walk1Mins),
                        distanceMeters: walk1.distanceMeters,
                        instruction: `Walk ${walk1.distanceMeters}m to ${boardDock.name}`,
                        fare: 0,
                        coordinates: walk1.coordinates,
                        geometry: { type: 'LineString', coordinates: walk1.coordinates },
                        isApproximate: walk1.isApproximate
                    },
                    {
                        id: `boat-transit`,
                        type: 'TRANSIT',
                        mode: 'Boat',
                        routeId: boatRoute.id,
                        routeName: boatRoute.route_name,
                        durationMinutes: boatMins,
                        durationFormatted: ROUTING_CONFIG.formatDuration(boatMins),
                        distanceMeters: slicedBoat.distanceMeters,
                        instruction: `Take River Boat across Pantal River from ${boardDock.name} to ${alightDock.name}`,
                        fare: boatRoute.minimum_fare || 20.0,
                        coordinates: slicedBoat.coordinates,
                        geometry: { type: 'LineString', coordinates: slicedBoat.coordinates },
                        boardStopName: boardDock.name,
                        alightStopName: alightDock.name
                    },
                    {
                        id: `boat-walk2`,
                        type: 'WALK',
                        mode: 'Walking',
                        durationMinutes: walk2Mins,
                        durationFormatted: ROUTING_CONFIG.formatDuration(walk2Mins),
                        distanceMeters: walk2.distanceMeters,
                        instruction: `Walk ${walk2.distanceMeters}m to ${dest.name}`,
                        fare: 0,
                        coordinates: walk2.coordinates,
                        geometry: { type: 'LineString', coordinates: walk2.coordinates },
                        isApproximate: walk2.isApproximate
                    }
                ];

                candidateItineraries.push({
                    id: `river-boat-crossing`,
                    title: `River Boat: ${boatRoute.route_name}`,
                    summary: 'Walk → River Boat → Walk',
                    primaryMode: 'Boat',
                    totalDurationMinutes: totalMins,
                    totalDurationFormatted: ROUTING_CONFIG.formatDuration(totalMins),
                    totalDistanceMeters: totalDist,
                    totalFare: boatRoute.minimum_fare || 20.0,
                    totalFareFormatted: `₱${(boatRoute.minimum_fare || 20.0).toFixed(2)}`,
                    floodStatus: 'CLEAR',
                    floodWarning: null,
                    legs
                });
            }
        }
    }

    // 3. Multi-Modal / 1-Transfer Option (Route A -> Route B)
    if (routes.length > 1) {
        const maxTransferItineraries = 4;
        let transferItineraryCount = 0;
        const transferHubs = [
            { name: 'Perez Boulevard / Herrero', lat: 16.0425, lng: 120.3375 },
            { name: 'Downtown City Plaza', lat: 16.0433, lng: 120.3333 },
            { name: 'MH Del Pilar / Arellano Junction', lat: 16.0405, lng: 120.3350 },
            { name: 'Mayombo District Junction', lat: 16.0380, lng: 120.3450 }
        ];

        // Enrich transfer hubs with designated transfer stops from database
        const stopTransferHubs = allStops
            .filter(s => s.is_transfer_point === 1 && typeof s.latitude === 'number' && typeof s.longitude === 'number')
            .map(s => ({ name: s.stop_name, lat: s.latitude, lng: s.longitude }));

        const allHubs = [...transferHubs];
        for (const sh of stopTransferHubs) {
            const alreadyExists = allHubs.some(h => Math.hypot(h.lat - sh.lat, h.lng - sh.lng) < 0.0008);
            if (!alreadyExists) {
                allHubs.push(sh);
            }
        }

        for (const hub of allHubs) {
            if (transferItineraryCount >= maxTransferItineraries) break;
            const hubLngLat = [hub.lng, hub.lat];

            // Find Route 1 near Origin that passes through Hub
            for (const r1 of routes) {
                if (transferItineraryCount >= maxTransferItineraries) break;
                if (!isModeAllowed(r1.mode_name) || r1.status === 'UNAVAILABLE') continue;
                if (!r1.parsedCoordinates || r1.parsedCoordinates.length < 2) continue;

                const dOrigR1 = distanceToRoutePolyline(r1.parsedCoordinates, origLngLat);
                const dHubR1 = distanceToRoutePolyline(r1.parsedCoordinates, hubLngLat);
                if (dOrigR1 > MAX_WALK || dHubR1 > 400) continue;

                // Find Route 2 near Hub that goes near Destination
                for (const r2 of routes) {
                    if (transferItineraryCount >= maxTransferItineraries) break;
                    if (r1.id === r2.id) continue;
                    if (!isModeAllowed(r2.mode_name) || r2.status === 'UNAVAILABLE') continue;
                    if (!r2.parsedCoordinates || r2.parsedCoordinates.length < 2) continue;

                    const dHubR2 = distanceToRoutePolyline(r2.parsedCoordinates, hubLngLat);
                    const dDestR2 = distanceToRoutePolyline(r2.parsedCoordinates, destLngLat);
                    if (dHubR2 > 400 || dDestR2 > MAX_WALK) continue;

                    const slice1 = sliceTransitRoute(r1.parsedCoordinates, origLngLat, hubLngLat, r1.mode_name);
                    const slice2 = sliceTransitRoute(r2.parsedCoordinates, hubLngLat, destLngLat, r2.mode_name);

                    if (!slice1 || !slice2 || slice1.distanceMeters < 200 || slice2.distanceMeters < 200) continue;

                    const walk1 = await getWalkingRoute(origLngLat, slice1.snappedBoarding, walkOptions);
                    const transferWalk = await getWalkingRoute(slice1.snappedAlighting, slice2.snappedBoarding, walkOptions);
                    const walk2 = await getWalkingRoute(slice2.snappedAlighting, destLngLat, walkOptions);

                    const walk1Mins = ROUTING_CONFIG.estimateDurationMinutes(walk1.distanceMeters, 'walk');
                    const r1Mins = slice1.durationMinutes + getAdvisoryTimeBuffer(r1);
                    const transferWaitMins = 5 + ROUTING_CONFIG.estimateDurationMinutes(transferWalk.distanceMeters, 'walk');
                    const r2Mins = slice2.durationMinutes + getAdvisoryTimeBuffer(r2);
                    const walk2Mins = ROUTING_CONFIG.estimateDurationMinutes(walk2.distanceMeters, 'walk');

                    const totalMins = walk1Mins + r1Mins + transferWaitMins + r2Mins + walk2Mins;
                    const totalDist = walk1.distanceMeters + slice1.distanceMeters + transferWalk.distanceMeters + slice2.distanceMeters + walk2.distanceMeters;
                    const totalFare = (r1.minimum_fare || 15.0) + (r2.minimum_fare || 15.0);

                    const legs = [
                        {
                            id: `transfer-walk1`,
                            type: 'WALK',
                            mode: 'Walking',
                            durationMinutes: walk1Mins,
                            durationFormatted: ROUTING_CONFIG.formatDuration(walk1Mins),
                            distanceMeters: walk1.distanceMeters,
                            instruction: `Walk ${walk1.distanceMeters}m to board ${r1.mode_name}`,
                            fare: 0,
                            coordinates: walk1.coordinates,
                            geometry: { type: 'LineString', coordinates: walk1.coordinates },
                            isApproximate: walk1.isApproximate
                        },
                        {
                            id: `transfer-r1`,
                            type: 'TRANSIT',
                            mode: r1.mode_name,
                            routeId: r1.id,
                            routeName: r1.route_name,
                            durationMinutes: r1Mins,
                            durationFormatted: ROUTING_CONFIG.formatDuration(r1Mins),
                            distanceMeters: slice1.distanceMeters,
                            instruction: `Ride ${r1.mode_name} (${r1.route_name}) to ${hub.name}${r1.activeDetour ? ` via the detour around ${r1.activeDetour.affectedRoad}` : ''}`,
                            fare: r1.minimum_fare || 15.0,
                            coordinates: slice1.coordinates,
                            geometry: { type: 'LineString', coordinates: slice1.coordinates },
                            detourActive: Boolean(r1.activeDetour),
                            floodedCoordinates: r1.activeDetour?.floodedCoordinates || [],
                            advisoryTitle: r1.activeDetour?.title || null,
                            detourInstructions: r1.activeDetour?.detourInstructions || ''
                        },
                        {
                            id: `transfer-walk-hub`,
                            type: 'WALK',
                            mode: 'Transfer',
                            durationMinutes: transferWaitMins,
                            durationFormatted: ROUTING_CONFIG.formatDuration(transferWaitMins),
                            distanceMeters: transferWalk.distanceMeters,
                            instruction: `Transfer at ${hub.name} (${transferWalk.distanceMeters}m walk + ~5 min wait)`,
                            fare: 0,
                            coordinates: transferWalk.coordinates,
                            geometry: { type: 'LineString', coordinates: transferWalk.coordinates },
                            isApproximate: transferWalk.isApproximate
                        },
                        {
                            id: `transfer-r2`,
                            type: 'TRANSIT',
                            mode: r2.mode_name,
                            routeId: r2.id,
                            routeName: r2.route_name,
                            durationMinutes: r2Mins,
                            durationFormatted: ROUTING_CONFIG.formatDuration(r2Mins),
                            distanceMeters: slice2.distanceMeters,
                            instruction: `Ride ${r2.mode_name} (${r2.route_name}) toward destination${r2.activeDetour ? ` via the detour around ${r2.activeDetour.affectedRoad}` : ''}`,
                            fare: r2.minimum_fare || 15.0,
                            coordinates: slice2.coordinates,
                            geometry: { type: 'LineString', coordinates: slice2.coordinates },
                            detourActive: Boolean(r2.activeDetour),
                            floodedCoordinates: r2.activeDetour?.floodedCoordinates || [],
                            advisoryTitle: r2.activeDetour?.title || null,
                            detourInstructions: r2.activeDetour?.detourInstructions || ''
                        },
                        {
                            id: `transfer-walk2`,
                            type: 'WALK',
                            mode: 'Walking',
                            durationMinutes: walk2Mins,
                            durationFormatted: ROUTING_CONFIG.formatDuration(walk2Mins),
                            distanceMeters: walk2.distanceMeters,
                            instruction: `Walk ${walk2.distanceMeters}m to ${dest.name}`,
                            fare: 0,
                            coordinates: walk2.coordinates,
                            geometry: { type: 'LineString', coordinates: walk2.coordinates },
                            isApproximate: walk2.isApproximate
                        }
                    ];

                    candidateItineraries.push({
                        id: `transfer-${r1.id}-${r2.id}`,
                        title: `${r1.mode_name} + ${r2.mode_name} via ${hub.name}`,
                        summary: `${r1.mode_name} → ${r2.mode_name} (1 Transfer)`,
                        primaryMode: 'MULTI_MODAL',
                        totalDurationMinutes: totalMins,
                        totalDurationFormatted: ROUTING_CONFIG.formatDuration(totalMins),
                        totalDistanceMeters: totalDist,
                        totalFare,
                        totalFareFormatted: `₱${totalFare.toFixed(2)}`,
                        floodStatus: routeHasDetour(r1) || routeHasDetour(r2)
                            ? 'DETOUR_ACTIVE'
                            : (r1.advisories.length || r2.advisories.length) ? 'ADVISORY' : 'CLEAR',
                        floodWarning: [getRouteFloodWarning(r1), getRouteFloodWarning(r2)].filter(Boolean).join(' '),
                        legs
                    });
                    transferItineraryCount += 1;
                    break;
                }
            }
        }
    }

    // 4. Direct Walk Option (Always provide if distance < 2.5km or if few transit options)
    if (straightDist < 2500 || candidateItineraries.length === 0) {
        const walkDirect = await getWalkingRoute(origLngLat, destLngLat, walkOptions);
        const walkMins = ROUTING_CONFIG.estimateDurationMinutes(walkDirect.distanceMeters, 'walk');
        candidateItineraries.push({
            id: 'direct-walk',
            title: 'Walk to Destination',
            summary: 'Walking only',
            primaryMode: 'Walking',
            totalDurationMinutes: walkMins,
            totalDurationFormatted: ROUTING_CONFIG.formatDuration(walkMins),
            totalDistanceMeters: walkDirect.distanceMeters,
            totalFare: 0,
            totalFareFormatted: '₱0.00',
            floodStatus: 'CLEAR',
            floodWarning: null,
            legs: [
                {
                    id: 'walk-direct-leg',
                    type: 'WALK',
                    mode: 'Walking',
                    durationMinutes: walkMins,
                    durationFormatted: ROUTING_CONFIG.formatDuration(walkMins),
                    distanceMeters: walkDirect.distanceMeters,
                    instruction: `Walk directly along streets to ${dest.name}`,
                    fare: 0,
                    coordinates: walkDirect.coordinates,
                    geometry: { type: 'LineString', coordinates: walkDirect.coordinates },
                    isApproximate: walkDirect.isApproximate
                }
            ]
        });
    }

    // Sort itineraries: fastest first
    candidateItineraries.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);

    // Deduplicate by summary/mode and cap at top 4
    const unique = [];
    const seenSummaries = new Set();
    for (const it of candidateItineraries) {
        const key = `${it.title}-${it.totalFare}`;
        if (!seenSummaries.has(key)) {
            seenSummaries.add(key);
            unique.push(it);
        }
    }

    const itineraries = unique.slice(0, 6);
    const activeDetourItinerary = unique.find(itinerary =>
        itinerary.legs.some(leg => leg.detourActive)
    ) || unique.find(itinerary => itinerary.floodStatus === 'DETOUR_ACTIVE');
    if (activeDetourItinerary && !itineraries.includes(activeDetourItinerary)) {
        itineraries[itineraries.length - 1] = activeDetourItinerary;
        itineraries.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
    }

    return {
        origin: orig,
        destination: dest,
        departureTime: leaveNow ? 'Leaving Now' : 'Scheduled',
        itineraries
    };
}

module.exports = {
    planJourney,
    resolveLocation
};
