/**
 * InerTayo Stored Road Route Audit Script
 * REPORT-ONLY audit of stored jeepney, bus, and tricycle route polylines.
 * Flags vertex gaps, suspicious straight-line shortcuts, bounds, and order issues.
 * DOES NOT modify or overwrite any database records.
 */

const { query } = require('../db/database');
const { validateGeometry } = require('../utils/geometryValidator');

async function auditRoadRoutes() {
    console.log('====================================================');
    console.log('       InerTayo Stored Road Routes Audit           ');
    console.log('====================================================\n');

    const routes = await query.all(`
        SELECT r.id, r.route_name, tm.name AS mode_name, r.geometry, r.geometry_corrected,
               r.use_corrected_geometry, r.status, r.origin, r.destination
        FROM routes r
        JOIN transport_modes tm ON r.transport_mode_id = tm.id
        WHERE LOWER(tm.name) != 'boat'
        ORDER BY r.id ASC
    `);

    console.log(`Found ${routes.length} road transit routes to evaluate.\n`);

    const report = [];

    for (const r of routes) {
        console.log(`Route #${r.id}: "${r.route_name}" (${r.mode_name})`);
        console.log(`  Origin: ${r.origin}`);
        console.log(`  Destination: ${r.destination}`);
        console.log(`  Status: ${r.status}`);

        const res = validateGeometry(r.geometry, {
            mode: 'road',
            maxSegmentLengthMeters: 1800,
            strictBounds: false
        });

        console.log(`  Vertices: ${res.stats.vertexCount || 0}`);
        console.log(`  Total Length: ${res.stats.totalLengthMeters || 0}m`);
        console.log(`  Max Segment: ${res.stats.maxSegmentMeters || 0}m`);

        if (res.errors.length > 0) {
            console.log('  ❌ ERRORS:');
            res.errors.forEach(e => console.log(`    - ${e}`));
        }

        if (res.warnings.length > 0) {
            console.log('  ⚠️ WARNINGS:');
            res.warnings.forEach(w => console.log(`    - ${w}`));
        }

        if (res.errors.length === 0 && res.warnings.length === 0) {
            console.log('  ✓ Geometry clean and valid.');
        }

        console.log('----------------------------------------------------');

        report.push({
            routeId: r.id,
            name: r.route_name,
            mode: r.mode_name,
            valid: res.valid,
            errors: res.errors,
            warnings: res.warnings,
            stats: res.stats
        });
    }

    const flaggedCount = report.filter(r => !r.valid || r.warnings.length > 0).length;
    console.log(`Audit Summary: ${routes.length} routes inspected, ${flaggedCount} flagged with warnings/coarse segments.`);
    return report;
}

if (require.main === module) {
    auditRoadRoutes()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Audit failed:', err);
            process.exit(1);
        });
}

module.exports = { auditRoadRoutes };
