'use strict';

const { connectDB, disconnectDB } = require('../db/connection');
const Route = require('../models/Route');
const Stop = require('../models/Stop');
const TransportMode = require('../models/TransportMode');
const { fetchRoadRoute } = require('../services/osrmRouter');
const {
    getLineStringCoordinates,
    getMaxSegmentMeters,
    isDetailedRoadGeometry,
} = require('../utils/routeGeometryQuality');

const MAX_STOP_SNAP_METERS = 300;
const REQUEST_DELAY_MS = 750;

function parseGeometry(input) {
    return getLineStringCoordinates(input);
}

function needsRoadGeometry(route) {
    if (route.geometry_corrected) return false;
    return !isDetailedRoadGeometry(route.geometry);
}

function getRouteSkipReason(route, boatModeIds) {
    if (boatModeIds.has(route.transport_mode_id)) return 'Boat routes use waterway geometry';
    if (route.geometry_corrected) return 'Existing corrected geometry is preserved';
    if (!needsRoadGeometry(route)) return 'Existing road geometry is already detailed';
    return null;
}

function getOrderedStopCoordinates(stops) {
    if (stops.length < 2 || stops.length > 100) {
        throw new Error(`Expected 2–100 ordered stops; found ${stops.length}.`);
    }
    if (stops.some(stop => !Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude))) {
        throw new Error('One or more ordered stops have invalid coordinates.');
    }
    return stops.map(stop => [stop.longitude, stop.latitude]);
}

async function repairRoadGeometry({ apply = false } = {}) {
    await connectDB();

    try {
        const [routes, modes] = await Promise.all([
            Route.find().sort({ id: 1 }).lean(),
            TransportMode.find().lean(),
        ]);
        const boatModeIds = new Set(
            modes.filter(mode => /boat/i.test(mode.name || '')).map(mode => mode.id)
        );
        const modeNames = new Map(modes.map(mode => [mode.id, mode.name]));
        const report = [];
        let requestCount = 0;

        for (const route of routes) {
            const skipReason = getRouteSkipReason(route, boatModeIds);
            if (skipReason) {
                continue;
            }

            const stops = await Stop.find({ route_id: route.id }).sort({ stop_order: 1 }).lean();
            try {
                if (requestCount > 0) {
                    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
                }
                requestCount += 1;

                const result = await fetchRoadRoute(getOrderedStopCoordinates(stops), {
                    maxSnapDistanceMeters: MAX_STOP_SNAP_METERS,
                });
                const correctedGeometry = JSON.stringify({
                    type: 'LineString',
                    coordinates: result.coordinates,
                });

                if (apply) {
                    const update = await Route.updateOne(
                        { id: route.id, geometry_corrected: null },
                        {
                            geometry_corrected: correctedGeometry,
                            use_corrected_geometry: 1,
                            updated_at: new Date(),
                        }
                    );
                    if (update.modifiedCount !== 1) {
                        throw new Error('Route changed during repair; corrected geometry was not written.');
                    }
                }

                report.push({
                    routeId: route.id,
                    routeName: route.route_name,
                    mode: modeNames.get(route.transport_mode_id) || 'Unknown',
                    pointCount: result.coordinates.length,
                    distanceMeters: Math.round(result.distanceMeters),
                    maxStopSnapMeters: Math.round(Math.max(...result.waypointSnapDistances)),
                    applied: apply,
                });
            } catch (error) {
                report.push({
                    routeId: route.id,
                    routeName: route.route_name,
                    mode: modeNames.get(route.transport_mode_id) || 'Unknown',
                    skipped: error.message,
                });
            }
        }

        for (const item of report) {
            if (item.skipped) {
                console.warn(`Skipped route ${item.routeId} (${item.routeName}): ${item.skipped}`);
            } else {
                console.log(
                    `${apply ? 'Applied' : 'Preview'} route ${item.routeId} (${item.routeName}): ` +
                    `${item.pointCount} road points, ${item.distanceMeters}m; max stop snap ${item.maxStopSnapMeters}m`
                );
            }
        }

        const completed = report.filter(item => !item.skipped).length;
        const skipped = report.length - completed;
        console.log(`Road geometry repair: ${completed} ${apply ? 'applied' : 'ready'}, ${skipped} skipped.`);
        if (skipped > 0) process.exitCode = 1;
        return report;
    } finally {
        await disconnectDB();
    }
}

if (require.main === module) {
    repairRoadGeometry({ apply: process.argv.includes('--apply') })
        .catch(error => {
            console.error('Road geometry repair failed:', error);
            process.exitCode = 1;
        });
}

module.exports = {
    parseGeometry,
    getMaxSegmentMeters,
    needsRoadGeometry,
    getRouteSkipReason,
    getOrderedStopCoordinates,
    repairRoadGeometry,
};
