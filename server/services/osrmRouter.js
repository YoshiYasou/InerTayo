'use strict';

const { safeRouteGeometry } = require('./orsRouter');
const { pointDistanceMeters } = require('../utils/geoUtils');

const DEFAULT_BASE_URL = 'https://router.project-osrm.org';
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeWaypoints(waypoints) {
    if (!Array.isArray(waypoints) || waypoints.length < 2 || waypoints.length > 100) {
        throw new Error('Provide between 2 and 100 ordered route waypoints.');
    }

    return safeRouteGeometry(waypoints, { maxPoints: 100 });
}

function validateOsrmRoute(data, waypoints, maxSnapDistanceMeters) {
    if (data?.code !== 'Ok') {
        throw new Error(`OSRM could not route these waypoints: ${data?.message || data?.code || 'unknown error'}`);
    }

    const route = data.routes?.[0];
    if (!route?.geometry || !Array.isArray(data.waypoints) || data.waypoints.length !== waypoints.length) {
        throw new Error('OSRM returned an incomplete route or waypoint list.');
    }
    const distanceMeters = Number(route.distance);
    const durationSeconds = Number(route.duration);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
        throw new Error('OSRM returned invalid route distance or duration.');
    }

    data.waypoints.forEach((waypoint, index) => {
        const distance = Number(waypoint.distance);
        if (!Number.isFinite(distance) || distance > maxSnapDistanceMeters) {
            throw new Error(
                `Stop ${index + 1} is ${Number.isFinite(distance) ? Math.round(distance) : 'an unknown distance'}m from a routable road (limit ${maxSnapDistanceMeters}m).`
            );
        }
    });

    return {
        type: 'LineString',
        coordinates: safeRouteGeometry(route.geometry, { maxPoints: 10_000 }),
        distanceMeters,
        durationSeconds,
        waypointSnapDistances: data.waypoints.map(waypoint => Number(waypoint.distance)),
    };
}

async function fetchRoadRoute(waypointInput, options = {}) {
    const waypoints = normalizeWaypoints(waypointInput);
    const baseUrl = String(options.baseUrl || process.env.OSRM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const maxSnapDistanceMeters = Number(options.maxSnapDistanceMeters ?? 300);
    if (!Number.isFinite(maxSnapDistanceMeters) || maxSnapDistanceMeters < 0) {
        throw new Error('Maximum waypoint snap distance must be a non-negative number.');
    }

    const coordinates = waypoints.map(([longitude, latitude]) => `${longitude},${latitude}`).join(';');
    const url = new URL(`${baseUrl}/route/v1/driving/${coordinates}`);
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('steps', 'false');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));

    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'InerTayo-Dagupan-Transit/1.0',
            },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`OSRM request failed (${response.status}).`);
        }
        return validateOsrmRoute(await response.json(), waypoints, maxSnapDistanceMeters);
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = { normalizeWaypoints, validateOsrmRoute, fetchRoadRoute };
