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
const nearestPointOnLine = require('@turf/nearest-point-on-line').default || require('@turf/nearest-point-on-line');
const { point, lineString } = require('@turf/helpers');

/**
 * Standardize input coordinate to { lat, lng, name }
 */
async function resolveLocation(input) {
    if (!input) return null;

    if (typeof input === 'object') {
        const lat = Number(input.latitude ?? input.lat);
        const lng = Number(input.longitude ?? input.lng ?? input.lon);
        if (!isNaN(lat) && !isNaN(lng)) {
            return {
                lat,
                lng,
                name: input.name || input.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
            };
        }
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

        // Search in schools first
        const school = await School.findOne({
            active: 1,
            $or: [
                { name: { $regex: trimmed, $options: 'i' } },
                { aliases: { $regex: trimmed, $options: 'i' } }
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
            status: 'ACTIVE',
            $or: [
                { name: { $regex: trimmed, $options: 'i' } },
                { search_keywords: { $regex: trimmed, $options: 'i' } }
            ]
        }).lean();
        if (loc) {
            return { lat: loc.latitude, lng: loc.longitude, name: loc.name };
        }

        // Search in landmarks
        const lm = await Landmark.findOne({ name: { $regex: trimmed, $options: 'i' } }).lean();
        if (lm) {
            return { lat: lm.latitude, lng: lm.longitude, name: lm.name };
        }

        // Search by individual words if multi-word phrase
        const words = trimmed.split(/[\s,–-]+/).filter(w => w.length >= 3);
        if (words.length > 0) {
            const wordOr = words.map(w => ({ name: { $regex: w, $options: 'i' } }));
            const locLike = await Location.findOne({ status: 'ACTIVE', $or: wordOr }).lean();
            if (locLike) {
                return { lat: locLike.latitude, lng: locLike.longitude, name: locLike.name };
            }
            const lmLike = await Landmark.findOne({ $or: wordOr }).lean();
            if (lmLike) {
                return { lat: lmLike.latitude, lng: lmLike.longitude, name: lmLike.name };
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
            advisoriesByRoute.get(ar.route_id).push(advMap.get(ar.advisory_id));
        }
    }

    const routes = [];
    for (const r of rawRoutes) {
        const mode = modeMap.get(r.transport_mode_id) || {};
        const boat = boatMap.get(r.id);
        const geom = (r.use_corrected_geometry === 1 && r.geometry_corrected) ? r.geometry_corrected : r.geometry;

        let coords = [];
        try {
            const parsed = typeof geom === 'string' ? JSON.parse(geom) : geom;
            if (parsed && parsed.coordinates) coords = parsed.coordinates;
        } catch (e) {}

        routes.push({
            ...r,
            mode_name: mode.name,
            mode_icon: mode.icon,
            waterway: boat ? boat.waterway : null,
            boat_operating_status: boat ? boat.operating_status : null,
            geometry: geom,
            parsedCoordinates: coords,
            stops: stopsByRoute.get(r.id) || [],
            advisories: advisoriesByRoute.get(r.id) || []
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
            const walk1 = await getWalkingRoute(origLngLat, sliced.snappedBoarding);
            // Generate walking route 2: Alighting point to Destination
            const walk2 = await getWalkingRoute(sliced.snappedAlighting, destLngLat);

            const walk1Mins = ROUTING_CONFIG.estimateDurationMinutes(walk1.distanceMeters, 'walk');
            const walk2Mins = ROUTING_CONFIG.estimateDurationMinutes(walk2.distanceMeters, 'walk');
            let transitMins = sliced.durationMinutes;

            // Check flood advisories and detour
            let floodStatus = 'CLEAR';
            let floodWarning = null;
            if (route.advisories && route.advisories.length > 0) {
                floodStatus = route.status === 'DETOUR_ACTIVE' ? 'DETOUR_ACTIVE' : 'ADVISORY';
                const adv = route.advisories[0];
                floodWarning = `Route adjusted because a flood-affected road segment was detected (${adv.affected_road}: ${adv.title}).`;
                if (route.detour_time && route.detour_time > route.estimated_time) {
                    transitMins += Math.round(route.detour_time - route.estimated_time);
                } else {
                    transitMins += 5; // standard advisory buffer
                }
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
                instruction: `Ride ${route.mode_name} (${route.route_name}) from ${boardName} to ${alightName}`,
                fare: route.minimum_fare || 15.0,
                coordinates: sliced.coordinates,
                geometry: { type: 'LineString', coordinates: sliced.coordinates },
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

    // 2. River Boat Crossing Option (Route 13 or any boat route)
    const boatRoute = routes.find(r => r.mode_name.toLowerCase() === 'boat');
    if (boatRoute && isModeAllowed('Boat') && boatRoute.boat_operating_status !== 'SUSPENDED') {
        const docks = [
            { name: 'Downtown Dock (Pantal)', lat: 16.0395, lng: 120.3310 },
            { name: 'Bonuan Dock (Dawel/Pantal)', lat: 16.0620, lng: 120.3420 }
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
            const walk1 = await getWalkingRoute(origLngLat, [boardDock.lng, boardDock.lat]);
            const slicedBoat = sliceTransitRoute(boatRoute.parsedCoordinates, [boardDock.lng, boardDock.lat], [alightDock.lng, alightDock.lat], 'boat');
            const walk2 = await getWalkingRoute([alightDock.lng, alightDock.lat], destLngLat);

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
                        geometry: { type: 'LineString', coordinates: walk1.coordinates }
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
                        geometry: { type: 'LineString', coordinates: walk2.coordinates }
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
    if (candidateItineraries.length < 3) {
        const transferHubs = [
            { name: 'Perez Boulevard / Herrero', lat: 16.0425, lng: 120.3375 },
            { name: 'Downtown City Plaza', lat: 16.0433, lng: 120.3333 },
            { name: 'MH Del Pilar / Arellano Junction', lat: 16.0405, lng: 120.3350 },
            { name: 'Mayombo District Junction', lat: 16.0380, lng: 120.3450 }
        ];

        for (const hub of transferHubs) {
            const hubLngLat = [hub.lng, hub.lat];

            // Find Route 1 near Origin that passes through Hub
            for (const r1 of routes) {
                if (!isModeAllowed(r1.mode_name) || r1.status === 'UNAVAILABLE') continue;
                if (!r1.parsedCoordinates || r1.parsedCoordinates.length < 2) continue;

                const dOrigR1 = distanceToRoutePolyline(r1.parsedCoordinates, origLngLat);
                const dHubR1 = distanceToRoutePolyline(r1.parsedCoordinates, hubLngLat);
                if (dOrigR1 > MAX_WALK || dHubR1 > 400) continue;

                // Find Route 2 near Hub that goes near Destination
                for (const r2 of routes) {
                    if (r1.id === r2.id) continue;
                    if (!isModeAllowed(r2.mode_name) || r2.status === 'UNAVAILABLE') continue;
                    if (!r2.parsedCoordinates || r2.parsedCoordinates.length < 2) continue;

                    const dHubR2 = distanceToRoutePolyline(r2.parsedCoordinates, hubLngLat);
                    const dDestR2 = distanceToRoutePolyline(r2.parsedCoordinates, destLngLat);
                    if (dHubR2 > 400 || dDestR2 > MAX_WALK) continue;

                    const slice1 = sliceTransitRoute(r1.parsedCoordinates, origLngLat, hubLngLat, r1.mode_name);
                    const slice2 = sliceTransitRoute(r2.parsedCoordinates, hubLngLat, destLngLat, r2.mode_name);

                    if (!slice1 || !slice2 || slice1.distanceMeters < 200 || slice2.distanceMeters < 200) continue;

                    const walk1 = await getWalkingRoute(origLngLat, slice1.snappedBoarding);
                    const transferWalk = await getWalkingRoute(slice1.snappedAlighting, slice2.snappedBoarding);
                    const walk2 = await getWalkingRoute(slice2.snappedAlighting, destLngLat);

                    const walk1Mins = ROUTING_CONFIG.estimateDurationMinutes(walk1.distanceMeters, 'walk');
                    const r1Mins = slice1.durationMinutes;
                    const transferWaitMins = 5 + ROUTING_CONFIG.estimateDurationMinutes(transferWalk.distanceMeters, 'walk');
                    const r2Mins = slice2.durationMinutes;
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
                            geometry: { type: 'LineString', coordinates: walk1.coordinates }
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
                            instruction: `Ride ${r1.mode_name} (${r1.route_name}) to ${hub.name}`,
                            fare: r1.minimum_fare || 15.0,
                            coordinates: slice1.coordinates,
                            geometry: { type: 'LineString', coordinates: slice1.coordinates }
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
                            geometry: { type: 'LineString', coordinates: transferWalk.coordinates }
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
                            instruction: `Ride ${r2.mode_name} (${r2.route_name}) toward destination`,
                            fare: r2.minimum_fare || 15.0,
                            coordinates: slice2.coordinates,
                            geometry: { type: 'LineString', coordinates: slice2.coordinates }
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
                            geometry: { type: 'LineString', coordinates: walk2.coordinates }
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
                        floodStatus: (r1.status === 'DETOUR_ACTIVE' || r2.status === 'DETOUR_ACTIVE') ? 'DETOUR_ACTIVE' : 'CLEAR',
                        floodWarning: null,
                        legs
                    });
                    break;
                }
            }
        }
    }

    // 4. Direct Walk Option (Always provide if distance < 2.5km or if few transit options)
    if (straightDist < 2500 || candidateItineraries.length === 0) {
        const walkDirect = await getWalkingRoute(origLngLat, destLngLat);
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

    return {
        origin: orig,
        destination: dest,
        departureTime: leaveNow ? 'Leaving Now' : 'Scheduled',
        itineraries: unique.slice(0, 4)
    };
}

module.exports = {
    planJourney,
    resolveLocation
};
