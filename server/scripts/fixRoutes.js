'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs/promises');
const path = require('path');
const { connectDB, disconnectDB } = require('../db/connection');
const Route = require('../models/Route');
const Stop = require('../models/Stop');
const TransportMode = require('../models/TransportMode');
const { auditRoadGeometry, getLineStringCoordinates } = require('../utils/routeGeometryAudit');
const { pathLengthMeters } = require('../utils/geoUtils');

const OSRM_BASE_URL = String(process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');
const REQUEST_INTERVAL_MS = 1000;
const MAX_OSRM_WAYPOINTS = 100;
let lastRequestStartedAt = 0;

function parseArguments(args) {
    const unknown = args.filter(argument => argument !== '--dry-run' && argument !== '--apply');
    if (unknown.length) throw new Error(`Unknown argument: ${unknown.join(', ')}`);
    if (args.includes('--dry-run') && args.includes('--apply')) {
        throw new Error('Choose either --dry-run or --apply, not both.');
    }
    return { apply: args.includes('--apply') };
}

function geometryLength(geometry) {
    if (!geometry) return null;
    try {
        return pathLengthMeters(getLineStringCoordinates(geometry));
    } catch {
        return null;
    }
}

function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchSnappedRoute(stops) {
    const elapsed = Date.now() - lastRequestStartedAt;
    if (lastRequestStartedAt && elapsed < REQUEST_INTERVAL_MS) {
        await sleep(REQUEST_INTERVAL_MS - elapsed);
    }

    const coordinates = stops.map(stop => `${stop.longitude},${stop.latitude}`).join(';');
    const url = new URL(`${OSRM_BASE_URL}/route/v1/driving/${coordinates}`);
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('steps', 'false');
    lastRequestStartedAt = Date.now();

    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'InerTayo-Dagupan-Transit/1.0'
        }
    });
    if (!response.ok) throw new Error(`OSRM request failed (${response.status}).`);

    const result = await response.json();
    if (result.code !== 'Ok' || !result.routes?.[0]?.geometry) {
        throw new Error(`OSRM could not route the stops: ${result.message || result.code || 'unknown error'}`);
    }
    if (!Array.isArray(result.waypoints) || result.waypoints.length !== stops.length) {
        throw new Error('OSRM returned a waypoint count that does not match the ordered stops.');
    }
    getLineStringCoordinates(result.routes[0].geometry);
    return result.routes[0].geometry;
}

function duplicateStopOrders(stops) {
    const orders = new Set();
    const duplicates = new Set();
    for (const stop of stops) {
        if (orders.has(stop.stop_order)) duplicates.add(stop.stop_order);
        orders.add(stop.stop_order);
    }
    return [...duplicates].sort((a, b) => a - b);
}

function isTestOrSampleRoute(route) {
    return /\b(?:test|sample)\b/i.test(route.route_name || '');
}

function formatTable(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) {
        console.log('Route ID | Old length (m) | New length (m) | Warnings');
        console.log('-------- | --------------- | --------------- | --------');
        console.log('No routes were eligible for geometry auditing.');
        return;
    }

    const columns = [
        ['Route ID', row => String(row.routeId)],
        ['Old length (m)', row => row.oldLengthMeters === null ? 'N/A' : String(row.oldLengthMeters)],
        ['New length (m)', row => row.newLengthMeters === null ? 'N/A' : String(row.newLengthMeters)],
        ['Warnings', row => Array.isArray(row.warnings) && row.warnings.length ? row.warnings.join(' | ') : '—']
    ];
    const widths = columns.map(([heading, value]) =>
        Math.max(heading.length, ...safeRows.map(row => value(row).length))
    );
    const formatRow = (row, isHeader = false) => columns
        .map(([heading, value], index) => (isHeader ? heading : value(row)).padEnd(widths[index]))
        .join(' | ');
    console.log(formatRow(null, true));
    console.log(widths.map(width => '-'.repeat(width)).join('-+-'));
    for (const row of safeRows) console.log(formatRow(row));
}

async function fixRoutes({ apply = false } = {}) {
    await connectDB();
    try {
        const [routes, stops, modes] = await Promise.all([
            Route.find().sort({ id: 1 }).lean(),
            Stop.find().sort({ route_id: 1, stop_order: 1 }).lean(),
            TransportMode.find().lean()
        ]);
        const stopsByRoute = new Map();
        for (const stop of stops) {
            if (!stopsByRoute.has(stop.route_id)) stopsByRoute.set(stop.route_id, []);
            stopsByRoute.get(stop.route_id).push(stop);
        }
        const modeNameById = new Map(modes.map(mode => [mode.id, mode.name]));
        const report = [];

        for (const route of routes) {
            const row = {
                routeId: route.id,
                oldLengthMeters: geometryLength(route.geometry),
                newLengthMeters: null,
                warnings: [],
                geometry: null
            };
            const modeName = modeNameById.get(route.transport_mode_id);
            if (/boat/i.test(modeName || '')) {
                row.warnings.push('Skipped boat route.');
                report.push(row);
                continue;
            }
            if (isTestOrSampleRoute(route)) {
                row.warnings.push('Skipped test/sample route; geometry was not changed.');
                report.push(row);
                continue;
            }
            if (!modeName) {
                row.warnings.push(`Unknown transport mode ${route.transport_mode_id}; route was not changed.`);
                report.push(row);
                continue;
            }

            const routeStops = stopsByRoute.get(route.id) || [];
            const duplicates = duplicateStopOrders(routeStops);
            if (duplicates.length) {
                row.warnings.push(`Duplicate stop_order values (${duplicates.join(', ')}); route was not routed.`);
                report.push(row);
                continue;
            }
            if (routeStops.length < 2) {
                row.warnings.push(`Only ${routeStops.length} ordered stop(s) are configured; route was not routed.`);
                report.push(row);
                continue;
            }
            if (routeStops.length > MAX_OSRM_WAYPOINTS) {
                row.warnings.push(`Route has ${routeStops.length} stops; OSRM supports at most ${MAX_OSRM_WAYPOINTS}.`);
                report.push(row);
                continue;
            }
            if (routeStops.some(stop =>
                typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number' ||
                !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude) ||
                stop.latitude < -90 || stop.latitude > 90 ||
                stop.longitude < -180 || stop.longitude > 180
            )) {
                row.warnings.push('One or more ordered stops have invalid coordinates; route was not routed.');
                report.push(row);
                continue;
            }

            try {
                row.geometry = await fetchSnappedRoute(routeStops);
                const audit = auditRoadGeometry(routeStops, row.geometry);
                row.newLengthMeters = audit.lengthMeters;
                row.warnings.push(...audit.warnings);
            } catch (error) {
                row.warnings.push(`Routing failed: ${error.message}`);
            }
            report.push(row);
        }

        formatTable(report);
        if (apply) {
            const backupPath = path.resolve(__dirname, '../data', `route_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
            const backup = {
                created_at: new Date().toISOString(),
                routes: routes.map(route => ({
                    route_id: route.id,
                    route_name: route.route_name,
                    geometry: route.geometry ?? null
                }))
            };
            await fs.writeFile(backupPath, `${JSON.stringify(backup, null, 2)}\n`, { flag: 'wx' });
            console.log(`Geometry backup written to ${backupPath}`);

            let updated = 0;
            for (const row of report) {
                if (!row.geometry) continue;
                const result = await Route.updateOne(
                    { id: row.routeId },
                    { $set: { geometry: JSON.stringify(row.geometry), updated_at: new Date() } }
                );
                if (result.matchedCount !== 1) {
                    throw new Error(`Route ${row.routeId} was not found while applying its new geometry.`);
                }
                updated += 1;
            }
            console.log(`Applied updated geometry to ${updated} road route(s).`);
        } else {
            console.log('Dry run only: no database changes or backup file were written.');
        }
        return report;
    } finally {
        await disconnectDB();
    }
}

if (require.main === module) {
    try {
        const options = parseArguments(process.argv.slice(2));
        fixRoutes(options).catch(error => {
            console.error('Route geometry audit failed:', error);
            process.exitCode = 1;
        });
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { parseArguments, geometryLength, auditRoadGeometry, isTestOrSampleRoute, fixRoutes };
