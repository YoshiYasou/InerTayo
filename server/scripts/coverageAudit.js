/**
 * InerTayo — Routes Coverage Audit
 * READ-ONLY script. Does NOT mutate any data.
 *
 * Compares every saved Dagupan place with public-map route geometry and configured stops.
 * Route-line proximity is straight-line distance and does not prove that service stops there.
 *
 * Usage: node server/scripts/coverageAudit.js
 */

const { connectDB } = require('../db/connection');
const Stop = require('../models/Stop');
const { expandStopAssignments } = require('../utils/stopAssignments');
const Route = require('../models/Route');
const TransportMode = require('../models/TransportMode');
const School = require('../models/School');
const Location = require('../models/Location');
const BoatRouteDetail = require('../models/BoatRouteDetail');
const ROUTING_CONFIG = require('../config/routingConfig');
const { haversineDistance } = require('../utils/geoUtils');
const { getLineStringCoordinates, isDetailedRoadGeometry } = require('../utils/routeGeometryQuality');
const nearestPointOnLine = require('@turf/nearest-point-on-line').default || require('@turf/nearest-point-on-line');
const { lineString, point } = require('@turf/helpers');

const RADIUS = ROUTING_CONFIG.walkingRadius; // 600m default
const LOCATION_TYPES = [
    'BARANGAY', 'DESTINATION', 'ESTABLISHMENT', 'INTERSECTION',
    'LANDMARK', 'ROAD', 'STREET', 'TERMINAL', 'RIVER_STOP'
];

function distanceToRouteGeometryMeters(latitude, longitude, geometry) {
    const coordinates = getLineStringCoordinates(geometry);
    if (coordinates.length < 2 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return Infinity;
    }

    try {
        const nearest = nearestPointOnLine(lineString(coordinates), point([longitude, latitude]));
        const [nearestLongitude, nearestLatitude] = nearest.geometry.coordinates;
        return haversineDistance(latitude, longitude, nearestLatitude, nearestLongitude);
    } catch {
        return Infinity;
    }
}

async function main() {
    await connectDB();

    console.log('='.repeat(80));
    console.log('InerTayo — Routes Coverage Audit (READ-ONLY)');
    console.log(`Proximity radius: ${RADIUS}m (straight-line; not walking distance)`);
    console.log('='.repeat(80));

    // Load all stops with lat/lng
    const allStops = expandStopAssignments(await Stop.find({
        latitude: { $ne: null },
        longitude: { $ne: null }
    }).lean()).filter(stop => stop.route_id !== null);

    // Load all routes with geometry
    const [routes, modes, boatDetails] = await Promise.all([
        Route.find().lean(),
        TransportMode.find().lean(),
        BoatRouteDetail.find().lean()
    ]);
    const modeNames = new Map(modes.map(mode => [mode.id, mode.name]));
    const boatDetailsByRoute = new Map(boatDetails.map(detail => [detail.route_id, detail]));
    const allRoutes = routes.flatMap(route => {
        const modeName = modeNames.get(route.transport_mode_id);
        if (!modeName) return [];
        const isBoat = /boat/i.test(modeName);
        if (isBoat && boatDetailsByRoute.get(route.id)?.operating_status !== 'ACTIVE') return [];

        const geometry = route.use_corrected_geometry === 1 && route.geometry_corrected
            ? route.geometry_corrected
            : route.geometry;
        const coordinates = getLineStringCoordinates(geometry);
        if (coordinates.length < 2) return [];

        const geometryNeedsReview = !isBoat && !isDetailedRoadGeometry(geometry);
        if (geometryNeedsReview && route.allow_unverified_map_geometry !== true) return [];

        return [{
            id: route.id,
            route_name: route.route_name,
            mode_name: modeName,
            status: route.status || 'UNKNOWN',
            geometry,
            geometryNeedsReview
        }];
    });

    // Helper: nearest stop distance from point
    function nearestStopDist(lat, lng) {
        let minDist = Infinity;
        let nearestStop = null;
        let nearestRouteName = null;
        for (const stop of allStops) {
            const d = haversineDistance(lat, lng, stop.latitude, stop.longitude);
            if (d < minDist) {
                minDist = d;
                nearestStop = stop.stop_name;
                // Find route name
                const route = allRoutes.find(r => r.id === stop.route_id);
                nearestRouteName = route ? route.route_name : `Route ${stop.route_id}`;
            }
        }
        return { minDist: Math.round(minDist), nearestStop, nearestRouteName };
    }

    function nearestRouteGeometry(lat, lng) {
        let minDist = Infinity;
        let nearestRoute = null;
        for (const route of allRoutes) {
            const distance = distanceToRouteGeometryMeters(lat, lng, route.geometry);
            if (distance < minDist) {
                minDist = distance;
                nearestRoute = route;
            }
        }
        return {
            distance: Number.isFinite(minDist) ? Math.round(minDist) : null,
            route: nearestRoute
        };
    }

    function addPlace(location, type, lat, lng, verified) {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            rows.push({ location, type, verified, hasCoordinates: false });
            return;
        }

        const nearestStop = nearestStopDist(lat, lng);
        const nearestRoute = nearestRouteGeometry(lat, lng);
        rows.push({
            location,
            type,
            verified,
            hasCoordinates: true,
            nearestRoute: nearestRoute.route,
            routeDistance: nearestRoute.distance,
            nearestStop: nearestStop.nearestStop,
            stopRoute: nearestStop.nearestRouteName,
            stopDistance: Number.isFinite(nearestStop.minDist) ? nearestStop.minDist : null
        });
    }

    const rows = [];

    // --- Schools ---
    const schools = await School.find({ active: 1 }).lean();
    for (const sch of schools) {
        const lat = sch.entrance_latitude ?? sch.latitude;
        const lng = sch.entrance_longitude ?? sch.longitude;
        addPlace(sch.name, 'SCHOOL', lat, lng, sch.verified ? 'YES' : 'NO');
    }

    // --- Roads, landmarks, barangays, campuses, and other saved destinations ---
    const places = await Location.find({
        type: { $in: LOCATION_TYPES },
        status: 'ACTIVE',
        latitude: { $ne: null },
        longitude: { $ne: null }
    }).lean();
    for (const place of places) {
        addPlace(place.name, place.type, place.latitude, place.longitude, 'LOCATION DB');
    }

    // --- Print table ---
    const pad = (value, length) => String(value ?? '—').substring(0, length).padEnd(length);
    console.log('\n' + pad('Location', 34) + pad('Type', 15) + pad('Nearest map route', 38) + pad('Route m', 9) + pad('Review', 9) + pad('Nearest stop', 28) + pad('Stop m', 9) + 'Verified?');
    console.log('-'.repeat(150));

    let routeNearby = 0;
    let stopNearby = 0;
    let total = 0;
    for (const r of rows) {
        total++;
        if (r.routeDistance !== null && r.routeDistance <= RADIUS) routeNearby++;
        if (r.stopDistance !== null && r.stopDistance <= RADIUS) stopNearby++;
        const routeLabel = r.nearestRoute
            ? `${r.nearestRoute.route_name} (${r.nearestRoute.mode_name})`
            : '—';
        const stopLabel = r.nearestStop
            ? `${r.nearestStop} (${r.stopRoute || 'unknown route'})`
            : '—';
        console.log(
            pad(r.location, 34) + pad(r.type, 15) + pad(routeLabel, 38) +
            pad(r.routeDistance === null ? '—' : `${r.routeDistance}m`, 9) +
            pad(r.nearestRoute?.geometryNeedsReview ? 'UNVERIFIED' : r.nearestRoute ? 'OK' : '—', 9) +
            pad(stopLabel, 28) + pad(r.stopDistance === null ? '—' : `${r.stopDistance}m`, 9) +
            (r.verified || 'NO COORDS')
        );
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Route proximity: ${routeNearby}/${total} places are within ${RADIUS}m of a public-map route line.`);
    console.log(`Configured-stop proximity: ${stopNearby}/${total} places are within ${RADIUS}m of a verified stop point.`);
    console.log('Route-line proximity alone does not confirm that a vehicle stops at that place.');

    const noNearbyRoute = rows.filter(row => row.routeDistance === null || row.routeDistance > RADIUS);
    if (noNearbyRoute.length > 0) {
        console.log(`\nPlaces with no map route line within ${RADIUS}m (${noNearbyRoute.length}):`);
        for (const place of noNearbyRoute) console.log(`  [${place.type}] ${place.location}`);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Coverage audit error:', err);
            process.exit(1);
        });
}

module.exports = { distanceToRouteGeometryMeters, LOCATION_TYPES };
