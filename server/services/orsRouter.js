/**
 * InerTayo ORS Routing Service
 * Provides safe, server-side OpenRouteService (ORS) route generation for
 * road-following geometry while preserving the original geometry field.
 *
 * Important: ORS API credentials are never exposed to the browser; all
 * requests are sent directly from the backend only.
 */

const ROUTING_CONFIG = require('../config/routingConfig');

function getApiKey() {
    return (process.env.ORS_API_KEY || process.env.OPENROUTESERVICE_API_KEY || '').trim();
}

function getBaseUrl() {
    const configured = (process.env.ORS_BASE_URL || process.env.ORS_URL || ROUTING_CONFIG.ors?.baseUrl || 'https://api.heigit.org/openrouteservice').trim();
    const normalized = configured.replace(/\/+$/, '');

    if (/api\.heigit\.org$/i.test(normalized) && !/\/openrouteservice$/i.test(normalized)) {
        return `${normalized}/openrouteservice`;
    }

    if (/api\.openrouteservice\.org$/i.test(normalized)) {
        return 'https://api.heigit.org/openrouteservice';
    }

    return normalized;
}

function normalizeCoordinatePair(point, index = 0) {
    if (Array.isArray(point)) {
        if (point.length < 2) {
            throw new Error(`Coordinate at index ${index} is incomplete: expected [lng, lat].`);
        }
        return [Number(point[0]), Number(point[1])];
    }

    if (point && typeof point === 'object') {
        const lng = Number(point.lng ?? point.lon ?? point.longitude ?? point[0]);
        const lat = Number(point.lat ?? point.latitude ?? point[1]);
        return [lng, lat];
    }

    throw new Error(`Coordinate at index ${index} is not a valid point.`);
}

function safeRouteGeometry(input, { maxPoints = 100 } = {}) {
    if (input == null) {
        throw new Error('Route geometry is required.');
    }

    let coordinates;

    if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input);
            coordinates = parsed?.coordinates || parsed;
        } catch (error) {
            throw new Error(`Could not parse route geometry string: ${error.message}`);
        }
    } else if (typeof input === 'object' && input.type === 'LineString' && Array.isArray(input.coordinates)) {
        coordinates = input.coordinates;
    } else if (Array.isArray(input)) {
        coordinates = input;
    } else {
        throw new Error('Geometry input must be a LineString, coordinate array, or GeoJSON string.');
    }

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error('Route geometry must contain at least 2 coordinate pairs.');
    }

    if (coordinates.length > maxPoints) {
        throw new Error(`Route geometry exceeds the maximum of ${maxPoints} points.`);
    }

    const normalized = coordinates.map((point, index) => {
        const [lng, lat] = normalizeCoordinatePair(point, index);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            throw new Error(`Coordinate at index ${index} contains non-finite values.`);
        }
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
            throw new Error(`Coordinate at index ${index} is outside valid geographic bounds.`);
        }
        return [Number(lng), Number(lat)];
    });

    return normalized;
}

function buildRoadGeometryRequest(waypoints, profile = ROUTING_CONFIG.ors?.defaultProfile || 'driving-car') {
    const coordinates = safeRouteGeometry(waypoints);
    const normalizedProfile = String(profile || ROUTING_CONFIG.ors?.defaultProfile || 'driving-car').trim();
    if (!['driving-car', 'foot-walking'].includes(normalizedProfile)) {
        throw new Error('ORS profile must be driving-car or foot-walking.');
    }

    return {
        coordinates,
        profile: normalizedProfile,
        preference: 'recommended',
        format: 'geojson',
        instructions: false,
        alternative: false,
        options: {
            avoid_features: ['ferry']
        }
    };
}

async function fetchRoadGeometry(waypoints, profile = ROUTING_CONFIG.ors?.defaultProfile || 'driving-car', options = {}) {
    const apiKey = (options.apiKey || getApiKey()).trim();
    const baseUrl = (options.baseUrl || getBaseUrl()).trim();
    if (!apiKey) {
        throw new Error('ORS_API_KEY is not configured.');
    }

    const requestBody = buildRoadGeometryRequest(waypoints, profile);
    const endpoint = `${baseUrl}/v2/directions/${requestBody.profile}/geojson`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || ROUTING_CONFIG.ors?.timeoutMs || 8000));

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json, application/geo+json',
                'Authorization': apiKey,
                'User-Agent': 'InerTayo-Dagupan-Transit/1.0'
            },
            body: JSON.stringify({
                coordinates: requestBody.coordinates,
                preference: requestBody.preference,
                format: requestBody.format,
                instructions: requestBody.instructions,
                alternative: requestBody.alternative,
                options: requestBody.options
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`ORS request failed (${response.status}): ${errorText || 'unknown error'}`);
        }

        const data = await response.json();
        const feature = data?.features?.[0];
        if (!feature || !feature.geometry || feature.geometry.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates)) {
            throw new Error('ORS returned no valid LineString geometry.');
        }

        return {
            type: 'LineString',
            coordinates: safeRouteGeometry(feature.geometry.coordinates, { maxPoints: 10000 }),
            meta: {
                profile: requestBody.profile,
                distanceMeters: Number(feature.properties?.summary?.distance || 0),
                durationSeconds: Number(feature.properties?.summary?.duration || 0)
            }
        };
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    getApiKey,
    getBaseUrl,
    normalizeCoordinatePair,
    safeRouteGeometry,
    buildRoadGeometryRequest,
    fetchRoadGeometry
};
