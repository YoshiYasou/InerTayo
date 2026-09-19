/**
 * InerTayo — Routes Coverage Audit
 * READ-ONLY script. Does NOT mutate any data.
 *
 * For every school, barangay (locations type=BARANGAY), and boat stop (locations type=RIVER_STOP),
 * determines whether at least one existing route has a stop or geometry point within walkingRadius.
 *
 * Usage: node server/scripts/coverageAudit.js
 */

const path = require('path');

const { query } = require('../db/database');
const ROUTING_CONFIG = require('../config/routingConfig');
const { haversineDistance } = require('../utils/geoUtils');

const RADIUS = ROUTING_CONFIG.walkingRadius; // 600m default

async function main() {
    console.log('='.repeat(80));
    console.log('InerTayo — Routes Coverage Audit (READ-ONLY)');
    console.log(`Walking radius: ${RADIUS}m`);
    console.log('='.repeat(80));

    // Load all stops with lat/lng
    const allStops = await query.all(
        'SELECT route_id, id, stop_name, latitude, longitude FROM stops WHERE latitude IS NOT NULL AND longitude IS NOT NULL'
    );

    // Load all routes with geometry
    const allRoutes = await query.all(
        'SELECT id, route_name, mode_name, geometry FROM (SELECT r.id, r.route_name, tm.name AS mode_name, COALESCE(CASE WHEN r.use_corrected_geometry=1 THEN r.geometry_corrected END, r.geometry) AS geometry FROM routes r JOIN transport_modes tm ON r.transport_mode_id = tm.id)'
    );

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

    const rows = [];

    // --- Schools ---
    const schools = await query.all(
        'SELECT id, name, latitude, longitude, entrance_latitude, entrance_longitude, verified FROM schools WHERE active = 1'
    );
    for (const sch of schools) {
        const lat = sch.entrance_latitude || sch.latitude;
        const lng = sch.entrance_longitude || sch.longitude;
        if (!lat || !lng) {
            rows.push({ location: sch.name, type: 'SCHOOL', nearestRoute: 'N/A', nearestStop: 'NO COORDS', distance: '—', served: 'NO DATA', verified: sch.verified ? 'YES' : 'NO' });
            continue;
        }
        const { minDist, nearestStop, nearestRouteName } = nearestStopDist(lat, lng);
        rows.push({
            location: sch.name,
            type: 'SCHOOL',
            nearestRoute: nearestRouteName || '—',
            nearestStop: nearestStop || '—',
            distance: minDist,
            served: minDist <= RADIUS ? 'YES' : 'NO',
            verified: sch.verified ? 'YES' : 'NO'
        });
    }

    // --- Barangays ---
    const barangays = await query.all(
        'SELECT id, name, latitude, longitude FROM locations WHERE type = ? AND status = ? AND latitude IS NOT NULL',
        ['BARANGAY', 'ACTIVE']
    );
    for (const brgy of barangays) {
        const { minDist, nearestStop, nearestRouteName } = nearestStopDist(brgy.latitude, brgy.longitude);
        rows.push({
            location: brgy.name,
            type: 'BARANGAY',
            nearestRoute: nearestRouteName || '—',
            nearestStop: nearestStop || '—',
            distance: minDist,
            served: minDist <= RADIUS ? 'YES' : 'NO',
            verified: 'LOCATION DB'
        });
    }

    // --- Boat Stops / River Stops ---
    const riverStops = await query.all(
        'SELECT id, name, latitude, longitude FROM locations WHERE type = ? AND status = ? AND latitude IS NOT NULL',
        ['RIVER_STOP', 'ACTIVE']
    );
    for (const rs of riverStops) {
        const { minDist, nearestStop, nearestRouteName } = nearestStopDist(rs.latitude, rs.longitude);
        rows.push({
            location: rs.name,
            type: 'RIVER_STOP',
            nearestRoute: nearestRouteName || '—',
            nearestStop: nearestStop || '—',
            distance: minDist,
            served: minDist <= RADIUS ? 'YES' : 'NO',
            verified: 'LOCATION DB'
        });
    }

    // --- Print table ---
    const pad = (s, n) => String(s).substring(0, n).padEnd(n);
    console.log('\n' + pad('Location', 40) + pad('Type', 12) + pad('Nearest Route', 35) + pad('Nearest Stop', 35) + pad('Dist(m)', 9) + pad('Served?', 9) + 'Verified?');
    console.log('-'.repeat(145));

    let served = 0, total = 0;
    for (const r of rows) {
        total++;
        if (r.served === 'YES') served++;
        const distStr = typeof r.distance === 'number' ? `${r.distance}m` : r.distance;
        console.log(pad(r.location, 40) + pad(r.type, 12) + pad(r.nearestRoute, 35) + pad(r.nearestStop, 35) + pad(distStr, 9) + pad(r.served, 9) + r.verified);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Coverage summary: ${served}/${total} locations served within ${RADIUS}m of a transit stop`);

    // Identify data gaps vs potential bugs
    const gaps = rows.filter(r => r.served === 'NO');
    if (gaps.length > 0) {
        console.log(`\nData gaps (${gaps.length} locations with no stop within ${RADIUS}m):`);
        for (const g of gaps) {
            console.log(`  [${g.type}] ${g.location} — nearest stop: ${g.nearestStop} (${typeof g.distance === 'number' ? g.distance + 'm' : g.distance})`);
        }
    }
    console.log('\nNote: This audit checks stop proximity only. For locations shown as served here');
    console.log('but returning 0 results in the Routes Directory, the cause is a query bug (not a data gap).');

    process.exit(0);
}

main().catch(err => {
    console.error('Coverage audit error:', err);
    process.exit(1);
});
