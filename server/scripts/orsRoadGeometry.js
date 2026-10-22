#!/usr/bin/env node
'use strict';

const { connectDB, disconnectDB } = require('../db/connection');
const Route = require('../models/Route');
const Stop = require('../models/Stop');
const TransportMode = require('../models/TransportMode');
const { fetchRoadGeometry, safeRouteGeometry } = require('../services/orsRouter');

async function collectRoadPointsForRoute(route) {
    const stops = await Stop.find({ route_id: route.id }).sort({ stop_order: 1 }).lean();
    const validStops = stops.filter(stop => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
    if (validStops.length < 2) {
        return null;
    }

    return validStops.map(stop => [Number(stop.longitude), Number(stop.latitude)]);
}

async function previewOrsGeometry(route, profile) {
    const points = await collectRoadPointsForRoute(route);
    if (!points) {
        return { routeId: route.id, skipped: 'No valid stop coordinates' };
    }

    try {
        const result = await fetchRoadGeometry(points, profile);
        const coordinates = safeRouteGeometry(result, { maxPoints: 10000 });
        return {
            routeId: route.id,
            routeName: route.route_name,
            coordinateCount: coordinates.length,
            preview: coordinates.slice(0, 3),
            geometry: JSON.stringify({ type: 'LineString', coordinates })
        };
    } catch (error) {
        return { routeId: route.id, routeName: route.route_name, skipped: error.message };
    }
}

function getRouteSkipReason(route, boatModeIds) {
    if (route.geometry_corrected) {
        return 'Corrected geometry already exists';
    }
    if (boatModeIds.has(route.transport_mode_id)) {
        return 'Boat routes use waterway geometry';
    }
    return null;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
    const limit = limitArg ? Number(limitArg.split('=')[1]) : 10;
    const profile = process.argv.find(arg => arg.startsWith('--profile='))?.split('=')[1] || process.env.ORS_PROFILE || 'driving-car';

    if (!process.env.ORS_API_KEY && !process.env.OPENROUTESERVICE_API_KEY) {
        console.warn('No ORS API key found. Set ORS_API_KEY before generating corrected road geometry.');
        process.exitCode = 1;
        return;
    }

    await connectDB();
    const routes = await Route.find({}).sort({ id: 1 }).limit(Number.isFinite(limit) && limit > 0 ? limit : 10).lean();
    const modes = await TransportMode.find({}).lean();
    const boatModeIds = new Set(modes.filter(mode => /boat/i.test(mode.name)).map(mode => mode.id));

    const results = [];
    for (const route of routes) {
        const skipReason = getRouteSkipReason(route, boatModeIds);
        if (skipReason) {
            results.push({ routeId: route.id, routeName: route.route_name, skipped: skipReason });
            continue;
        }

        const preview = await previewOrsGeometry(route, profile);
        results.push(preview);

        if (apply && preview.geometry && !preview.skipped) {
            const update = await Route.updateOne(
                { id: route.id, $or: [{ geometry_corrected: null }, { geometry_corrected: '' }] },
                { geometry_corrected: preview.geometry, use_corrected_geometry: 1 }
            );
            if (update.modifiedCount === 1) {
                console.log(`Applied ORS geometry to route ${route.id}: ${route.route_name}`);
            } else {
                console.log(`Skipped route ${route.id}: corrected geometry changed during generation`);
            }
        }
    }

    console.log('\nORS geometry review:');
    for (const result of results) {
        if (result.skipped) {
            console.log(`- route ${result.routeId}: skipped (${result.skipped})`);
        } else {
            console.log(`- route ${result.routeId} (${result.routeName}): ${result.coordinateCount} points`);
        }
    }

    await disconnectDB();
}

if (require.main === module) {
    main().catch((error) => {
        console.error('ORS geometry script failed:', error);
        process.exitCode = 1;
    });
}

module.exports = { collectRoadPointsForRoute, previewOrsGeometry, getRouteSkipReason };
