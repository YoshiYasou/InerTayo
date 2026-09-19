/**
 * InerTayo Walking Router Service
 * Server-side proxy for OpenRouteService pedestrian routing with fallback,
 * caching, and flood avoidance polygon integration.
 */

const { haversineDistance, pathLengthMeters } = require('../utils/geoUtils');
const ROUTING_CONFIG = require('../config/routingConfig');
const { query } = require('../db/database');

// Simple in-memory response cache: `${startLon},${startLat}-${endLon},${endLat}` -> result
const routeCache = new Map();
const CACHE_MAX_SIZE = 500;

/**
 * Fetch walking directions between two coordinates
 * @param {[number, number]} startLngLat - [lon, lat]
 * @param {[number, number]} endLngLat - [lon, lat]
 * @param {object} options - { avoidPolygons: GeoJSON Polygon/MultiPolygon, signal }
 * @returns {Promise<object>} { geometry, distanceMeters, durationMinutes, durationFormatted, approximate, warning }
 */
async function getWalkingRoute(startLngLat, endLngLat, options = {}) {
    const [startLon, startLat] = startLngLat;
    const [endLon, endLat] = endLngLat;

    const directDist = Math.round(haversineDistance(startLat, startLon, endLat, endLon));

    // If points are virtually identical (< 15 meters), return single-step trivial line
    if (directDist <= 15) {
        return {
            geometry: {
                type: 'LineString',
                coordinates: [startLngLat, endLngLat]
            },
            distanceMeters: directDist,
            durationMinutes: 1,
            durationFormatted: ROUTING_CONFIG.formatDuration(1),
            approximate: false
        };
    }

    // Check cache
    const cacheKey = `${startLon.toFixed(5)},${startLat.toFixed(5)}-${endLon.toFixed(5)},${endLat.toFixed(5)}`;
    if (routeCache.has(cacheKey)) {
        return routeCache.get(cacheKey);
    }

    const apiKey = process.env.ORS_API_KEY;

    // 1. Try OpenRouteService if API key is configured
    if (apiKey && apiKey.trim() !== '') {
        try {
            const orsBody = {
                coordinates: [startLngLat, endLngLat],
                format: 'geojson',
                preference: 'recommended'
            };

            if (options.avoidPolygons) {
                orsBody.options = {
                    avoid_polygons: options.avoidPolygons
                };
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);

            const res = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': apiKey.trim(),
                    'User-Agent': 'InerTayo-Dagupan-Transit/1.0'
                },
                body: JSON.stringify(orsBody),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (res.ok) {
                const data = await res.json();
                const feature = data.features?.[0];
                if (feature && feature.geometry && feature.geometry.coordinates?.length >= 2) {
                    const distMeters = Math.round(feature.properties?.summary?.distance || pathLengthMeters(feature.geometry.coordinates));
                    const durationMins = ROUTING_CONFIG.estimateDurationMinutes(distMeters, 'walk');

                    const result = {
                        geometry: feature.geometry,
                        distanceMeters: distMeters,
                        durationMinutes: durationMins,
                        durationFormatted: ROUTING_CONFIG.formatDuration(durationMins),
                        approximate: false
                    };

                    // Cache result
                    if (routeCache.size >= CACHE_MAX_SIZE) {
                        const firstKey = routeCache.keys().next().value;
                        routeCache.delete(firstKey);
                    }
                    routeCache.set(cacheKey, result);

                    return result;
                }
            } else {
                console.warn(`ORS API responded with status ${res.status}`);
            }
        } catch (err) {
            console.warn(`ORS walking request failed: ${err.message}. Falling back to road-following path.`);
        }
    }

    // 2. Safe Fallback: Generate street-aligned walking path using local Dagupan road/street vertices
    // Instead of a fake straight line between distant points, we snap through nearby street intersections
    const fallbackResult = await generateRoadAlignedFallback(startLngLat, endLngLat, directDist);

    if (routeCache.size >= CACHE_MAX_SIZE) {
        const firstKey = routeCache.keys().next().value;
        routeCache.delete(firstKey);
    }
    routeCache.set(cacheKey, fallbackResult);

    return fallbackResult;
}

/**
 * Construct an approximate road-aligned pedestrian path through Dagupan street nodes
 */
async function generateRoadAlignedFallback(startLngLat, endLngLat, directDist) {
    const [startLon, startLat] = startLngLat;
    const [endLon, endLat] = endLngLat;

    // For short walks (< 100m), direct straight line is physically accurate
    if (directDist < 100) {
        const mins = ROUTING_CONFIG.estimateDurationMinutes(directDist, 'walk');
        return {
            geometry: {
                type: 'LineString',
                coordinates: [startLngLat, endLngLat]
            },
            distanceMeters: directDist,
            durationMinutes: mins,
            durationFormatted: ROUTING_CONFIG.formatDuration(mins),
            approximate: false
        };
    }

    // Find any intermediate street/intersection locations between start and end
    const minLat = Math.min(startLat, endLat) - 0.002;
    const maxLat = Math.max(startLat, endLat) + 0.002;
    const minLng = Math.min(startLon, endLon) - 0.002;
    const maxLng = Math.max(startLon, endLon) + 0.002;

    const nearbyPoints = await query.all(
        `SELECT latitude, longitude FROM locations 
         WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? 
           AND type IN ('STREET', 'ROAD', 'INTERSECTION')
         LIMIT 6`,
        [minLat, maxLat, minLng, maxLng]
    );

    // Pick 1 or 2 best intermediary waypoints that reduce perpendicular deviation (Manhattan-like cornering)
    const waypoints = [startLngLat];

    if (nearbyPoints.length > 0) {
        // Sort by distance to the mid-point
        const midLat = (startLat + endLat) / 2;
        const midLng = (startLon + endLon) / 2;
        nearbyPoints.sort((a, b) => 
            Math.hypot(a.longitude - midLng, a.latitude - midLat) - 
            Math.hypot(b.longitude - midLng, b.latitude - midLat)
        );

        const best = nearbyPoints[0];
        const dCorner = haversineDistance(startLat, startLon, best.latitude, best.longitude) +
                        haversineDistance(best.latitude, best.longitude, endLat, endLon);

        if (dCorner < directDist * 1.5) {
            waypoints.push([best.longitude, best.latitude]);
        } else {
            // Street-grid right-angle corner: [endLon, startLat] or [startLon, endLat]
            waypoints.push([endLon, startLat]);
        }
    } else {
        // Street grid right-angle turn
        waypoints.push([endLon, startLat]);
    }

    waypoints.push(endLngLat);

    const distMeters = pathLengthMeters(waypoints);
    const durationMins = ROUTING_CONFIG.estimateDurationMinutes(distMeters, 'walk');

    return {
        geometry: {
            type: 'LineString',
            coordinates: waypoints
        },
        distanceMeters: distMeters,
        durationMinutes: durationMins,
        durationFormatted: ROUTING_CONFIG.formatDuration(durationMins),
        approximate: true,
        warning: 'Walking route is approximate (OpenRouteService key not configured or offline)'
    };
}

module.exports = {
    getWalkingRoute
};
