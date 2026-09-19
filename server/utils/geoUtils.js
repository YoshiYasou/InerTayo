/**
 * InerTayo Centralized Coordinate & Geographic Utility
 * Authoritative converter between GeoJSON [longitude, latitude] and Leaflet [latitude, longitude].
 */

/**
 * Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
 * @param {[number, number]} lngLat
 * @returns {[number, number]} [lat, lng]
 */
function lngLatToLatLng(lngLat) {
    if (!Array.isArray(lngLat) || lngLat.length < 2) {
        throw new Error(`Invalid lngLat coordinate pair: ${JSON.stringify(lngLat)}`);
    }
    return [Number(lngLat[1]), Number(lngLat[0])];
}

/**
 * Convert Leaflet [lat, lng] to GeoJSON [lng, lat]
 * @param {[number, number]} latLng
 * @returns {[number, number]} [lng, lat]
 */
function latLngToLngLat(latLng) {
    if (!Array.isArray(latLng) || latLng.length < 2) {
        throw new Error(`Invalid latLng coordinate pair: ${JSON.stringify(latLng)}`);
    }
    return [Number(latLng[1]), Number(latLng[0])];
}

/**
 * Convert an array of GeoJSON [lng, lat] coordinates to Leaflet [lat, lng] coordinates
 * @param {Array<[number, number]>} coords
 * @returns {Array<[number, number]>}
 */
function toLeafletCoords(coords) {
    if (!Array.isArray(coords)) return [];
    return coords.map(c => lngLatToLatLng(c));
}

/**
 * Convert an array of Leaflet [lat, lng] coordinates to GeoJSON [lng, lat] coordinates
 * @param {Array<[number, number]>} coords
 * @returns {Array<[number, number]>}
 */
function toGeoJsonCoords(coords) {
    if (!Array.isArray(coords)) return [];
    return coords.map(c => latLngToLngLat(c));
}

/**
 * Calculate Great Circle distance between two points in meters using the Haversine formula
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculate distance between two coordinate objects or arrays
 * Handles:
 * - [lng, lat] (GeoJSON, isGeoJson = true)
 * - [lat, lng] (Leaflet, isGeoJson = false)
 * - { lat, lng } or { latitude, longitude }
 */
function pointDistanceMeters(pt1, pt2, isGeoJson = true) {
    let lat1, lon1, lat2, lon2;

    if (Array.isArray(pt1)) {
        lat1 = isGeoJson ? pt1[1] : pt1[0];
        lon1 = isGeoJson ? pt1[0] : pt1[1];
    } else if (pt1 && typeof pt1 === 'object') {
        lat1 = pt1.latitude ?? pt1.lat;
        lon1 = pt1.longitude ?? pt1.lng ?? pt1.lon;
    }

    if (Array.isArray(pt2)) {
        lat2 = isGeoJson ? pt2[1] : pt2[0];
        lon2 = isGeoJson ? pt2[0] : pt2[1];
    } else if (pt2 && typeof pt2 === 'object') {
        lat2 = pt2.latitude ?? pt2.lat;
        lon2 = pt2.longitude ?? pt2.lng ?? pt2.lon;
    }

    if (typeof lat1 !== 'number' || typeof lon1 !== 'number' ||
        typeof lat2 !== 'number' || typeof lon2 !== 'number') {
        return Infinity;
    }

    return haversineDistance(lat1, lon1, lat2, lon2);
}

/**
 * Calculate total length of a GeoJSON coordinate path in meters
 * @param {Array<[number, number]>} geoJsonCoords - Array of [lng, lat]
 * @returns {number} Total distance in meters
 */
function pathLengthMeters(geoJsonCoords) {
    if (!Array.isArray(geoJsonCoords) || geoJsonCoords.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < geoJsonCoords.length - 1; i++) {
        total += haversineDistance(
            geoJsonCoords[i][1], geoJsonCoords[i][0],
            geoJsonCoords[i + 1][1], geoJsonCoords[i + 1][0]
        );
    }
    return Math.round(total);
}

module.exports = {
    lngLatToLatLng,
    latLngToLngLat,
    toLeafletCoords,
    toGeoJsonCoords,
    haversineDistance,
    pointDistanceMeters,
    pathLengthMeters
};
