/**
 * InerTayo Boat Route Geometry Validation Script
 * Evaluates stored boat routes against the Dagupan waterways reference.
 * Flags routes that cross land, contain suspicious jumps, or fail to connect stops.
 */

const fs = require('fs');
const path = require('path');
const { query } = require('../db/database');
const { pointDistanceMeters } = require('../utils/geoUtils');
const waterwaysRef = require('../data/dagupan_waterways_reference.json');

async function validateBoatRoutes() {
    console.log('====================================================');
    console.log('       InerTayo River Boat Geometry Audit          ');
    console.log('====================================================\n');

    // 1. Fetch boat routes from DB
    const boatRoutes = await query.all(`
        SELECT r.id, r.route_name, r.geometry, r.geometry_corrected, r.use_corrected_geometry, r.status,
               brd.waterway, brd.operating_status,
               orig.name AS origin_stop, orig.latitude AS orig_lat, orig.longitude AS orig_lng,
               dest.name AS dest_stop, dest.latitude AS dest_lat, dest.longitude AS dest_lng
        FROM routes r
        JOIN transport_modes tm ON r.transport_mode_id = tm.id
        LEFT JOIN boat_route_details brd ON r.id = brd.route_id
        LEFT JOIN locations orig ON brd.origin_river_stop_id = orig.id
        LEFT JOIN locations dest ON brd.destination_river_stop_id = dest.id
        WHERE LOWER(tm.name) = 'boat'
    `);

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
