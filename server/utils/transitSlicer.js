/**
 * InerTayo Transit Line Slicer
 * Accurately snaps passenger boarding and alighting points to stored transit routes
 * and slices the route polyline using Turf.
 * Preserves the authoritative stored transit geometry.
 */

const nearestPointOnLine = require('@turf/nearest-point-on-line').default || require('@turf/nearest-point-on-line');
const lineSlice = require('@turf/line-slice').default || require('@turf/line-slice');
const { point, lineString } = require('@turf/helpers');
const { pathLengthMeters, pointDistanceMeters } = require('./geoUtils');
const ROUTING_CONFIG = require('../config/routingConfig');

/**
 * Standardize point to GeoJSON [lng, lat]
 */
function toLngLatPair(pt) {
    if (Array.isArray(pt)) {
        return [Number(pt[0]), Number(pt[1])];
    }
    if (pt && typeof pt === 'object') {
        const lng = pt.longitude ?? pt.lng ?? pt.lon;
        const lat = pt.latitude ?? pt.lat;
        return [Number(lng), Number(lat)];
    }
    throw new Error(`Invalid point: ${JSON.stringify(pt)}`);
}

/**
 * Slice a stored transit route between a boarding point and an alighting point
 * @param {object|string|Array} routeGeometry - GeoJSON LineString or coordinates array
 * @param {[number, number]|object} boardPt - Boarding point [lng, lat] or {lat, lng}
 * @param {[number, number]|object} alightPt - Alighting point [lng, lat] or {lat, lng}
 * @param {string} mode - Transit mode name ('jeepney', 'bus', 'tricycle', 'boat')
 * @returns {object|null} Sliced segment details or null if slicing fails
 */
function sliceTransitRoute(routeGeometry, boardPt, alightPt, mode = 'jeepney') {
    if (!routeGeometry || !boardPt || !alightPt) return null;

    let coords = [];
    if (Array.isArray(routeGeometry)) {
        coords = routeGeometry;
    } else if (typeof routeGeometry === 'string') {
        try {
            const parsed = JSON.parse(routeGeometry);
            coords = parsed.coordinates || [];
        } catch (e) {
            return null;
        }
    } else if (typeof routeGeometry === 'object' && Array.isArray(routeGeometry.coordinates)) {
        coords = routeGeometry.coordinates;
    }

    if (coords.length < 2) return null;

    const boardLngLat = toLngLatPair(boardPt);
    const alightLngLat = toLngLatPair(alightPt);

    try {
        const line = lineString(coords);
        const ptBoard = point(boardLngLat);
        const ptAlight = point(alightLngLat);

        const snappedBoard = nearestPointOnLine(line, ptBoard);
        const snappedAlight = nearestPointOnLine(line, ptAlight);

        const walkToBoardMeters = Math.round(pointDistanceMeters(boardLngLat, snappedBoard.geometry.coordinates, true));
        const walkFromAlightMeters = Math.round(pointDistanceMeters(alightLngLat, snappedAlight.geometry.coordinates, true));

        // Check order along line
        const boardIndex = snappedBoard.properties.index;
        const alightIndex = snappedAlight.properties.index;

        // Slice line
        const sliced = lineSlice(snappedBoard, snappedAlight, line);
        let slicedCoords = sliced.geometry.coordinates;

        // If user is traveling against digitized direction, reverse sliced coordinates
        if (boardIndex > alightIndex || (boardIndex === alightIndex && snappedBoard.properties.location > snappedAlight.properties.location)) {
            slicedCoords = [...slicedCoords].reverse();
        }

        const distanceMeters = pathLengthMeters(slicedCoords);
        const durationMinutes = ROUTING_CONFIG.estimateDurationMinutes(distanceMeters, mode);

        return {
            type: 'LineString',
            coordinates: slicedCoords,
            distanceMeters,
            durationMinutes,
            durationFormatted: ROUTING_CONFIG.formatDuration(durationMinutes),
            snappedBoarding: snappedBoard.geometry.coordinates,
            snappedAlighting: snappedAlight.geometry.coordinates,
            walkToBoardMeters,
            walkFromAlightMeters
        };
    } catch (err) {
        console.warn('Error slicing transit line:', err.message);
        return null;
    }
}

module.exports = {
    sliceTransitRoute
};
