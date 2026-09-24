/**
 * InerTayo Boat Route Geometry Validation Script
 * Evaluates stored boat routes against the Dagupan waterways reference.
 * Flags routes that cross land, contain suspicious jumps, or fail to connect stops.
 */

const { connectDB } = require('../db/connection');
const Route = require('../models/Route');
const TransportMode = require('../models/TransportMode');
const BoatRouteDetail = require('../models/BoatRouteDetail');
const Location = require('../models/Location');
const { pointDistanceMeters } = require('../utils/geoUtils');
const waterwaysRef = require('../data/dagupan_waterways_reference.json');

async function validateBoatRoutes() {
    await connectDB();

    console.log('====================================================');
    console.log('       InerTayo River Boat Geometry Audit          ');
    console.log('====================================================\n');

    // 1. Fetch boat routes from DB
    const [routes, modes, details, locations] = await Promise.all([
        Route.find().lean(),
        TransportMode.find().lean(),
        BoatRouteDetail.find().lean(),
        Location.find().lean()
    ]);
    const modeIds = new Set(modes
        .filter(mode => (mode.name || '').toLowerCase() === 'boat')
        .map(mode => mode.id));
    const locationsById = new Map(locations.map(location => [location.id, location]));
    const detailsByRouteId = new Map(details.map(detail => [detail.route_id, detail]));
    const boatRoutes = routes
        .filter(route => modeIds.has(route.transport_mode_id))
        .map(route => {
            const detail = detailsByRouteId.get(route.id) || {};
            const origin = locationsById.get(detail.origin_river_stop_id) || {};
            const destination = locationsById.get(detail.destination_river_stop_id) || {};
            return {
                ...route,
                waterway: detail.waterway,
                operating_status: detail.operating_status,
                origin_stop: origin.name,
                orig_lat: origin.latitude,
                orig_lng: origin.longitude,
                dest_stop: destination.name,
                dest_lat: destination.latitude,
                dest_lng: destination.longitude
            };
        });

    if (boatRoutes.length === 0) {
        console.log('No boat routes found in database.');
        return [];
    }

    const report = [];

    for (const r of boatRoutes) {
        console.log(`Checking Route #${r.id}: "${r.route_name}"`);
        console.log(`  Waterway: ${r.waterway || 'Unspecified'}`);
        console.log(`  Operating Status: ${r.operating_status || 'ACTIVE'}`);
        console.log(`  Origin: ${r.origin_stop} (${r.orig_lat}, ${r.orig_lng})`);
        console.log(`  Destination: ${r.dest_stop} (${r.dest_lat}, ${r.dest_lng})`);

        let geomObj = null;
        try {
            geomObj = typeof r.geometry === 'string' ? JSON.parse(r.geometry) : r.geometry;
        } catch (e) {
            console.error('  Failed to parse original geometry JSON:', e.message);
        }

        const issues = [];
        const coords = geomObj?.coordinates || [];

        console.log(`  Original geometry vertices: ${coords.length}`);

        if (coords.length < 2) {
            issues.push('Route has fewer than 2 vertices');
        } else {
            // Check start endpoint connection to origin stop
            if (r.orig_lat && r.orig_lng) {
                const distStart = pointDistanceMeters(coords[0], [r.orig_lng, r.orig_lat], true);
                if (distStart > 100) {
                    issues.push(`Start vertex is ${Math.round(distStart)}m away from origin stop`);
                }
            }

            // Check end endpoint connection to destination stop
            if (r.dest_lat && r.dest_lng) {
                const lastPt = coords[coords.length - 1];
                const distEnd = pointDistanceMeters(lastPt, [r.dest_lng, r.dest_lat], true);
                if (distEnd > 100) {
                    issues.push(`End vertex is ${Math.round(distEnd)}m away from destination stop`);
                }
            }

            // Check for large straight-line jumps across land
            for (let i = 0; i < coords.length - 1; i++) {
                const p1 = coords[i];
                const p2 = coords[i + 1];
                const d = pointDistanceMeters(p1, p2, true);
                if (d > 1000) {
                    issues.push(`Suspicious straight jump of ${Math.round(d)}m between vertices ${i} and ${i + 1} (cuts across land)`);
                }
            }

            // Compare each vertex against waterway reference lines
            let farFromWaterCount = 0;
            for (let i = 0; i < coords.length; i++) {
                const pt = coords[i];
                let minWaterDist = Infinity;
                for (const ww of waterwaysRef.waterways) {
                    for (const wPt of ww.coordinates) {
                        const dist = pointDistanceMeters(pt, wPt, true);
                        if (dist < minWaterDist) minWaterDist = dist;
                    }
                }
                if (minWaterDist > 250) {
                    farFromWaterCount++;
                }
            }
            if (farFromWaterCount > 0) {
                issues.push(`${farFromWaterCount} vertices are >250m away from recognized Dagupan waterways`);
            }
        }

        const status = issues.length === 0 ? 'PASS' : 'FLAGGED_FOR_CORRECTION';
        console.log(`  Validation Status: ${status}`);
        if (issues.length > 0) {
            console.log('  Issues Detected:');
            issues.forEach(iss => console.log(`    - ${iss}`));
        }
        console.log('----------------------------------------------------');

        report.push({
            routeId: r.id,
            name: r.route_name,
            vertexCount: coords.length,
            status,
            issues
        });
    }

    return report;
}

if (require.main === module) {
    validateBoatRoutes()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Audit failure:', err);
            process.exit(1);
        });
}

module.exports = { validateBoatRoutes };
