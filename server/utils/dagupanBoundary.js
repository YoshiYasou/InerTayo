/**
 * InerTayo Dagupan City Boundary Utility
 * Provides point-in-polygon verification against the official Dagupan administrative boundary.
 */

const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default || require('@turf/boolean-point-in-polygon');
const { point } = require('@turf/helpers');
const dagupanBoundary = require('../data/dagupan_boundary.json');

/**
 * Check whether a coordinate is physically inside the administrative boundary of Dagupan City
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean}
 */
function isInsideDagupanCity(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return false;
    }

    try {
        const pt = point([lng, lat]);
        return Boolean(booleanPointInPolygon(pt, dagupanBoundary));
    } catch (err) {
        console.warn('Error evaluating point in Dagupan boundary:', err.message);
        return false;
    }
}

/**
 * Get the GeoJSON Feature representing Dagupan City's administrative boundary
 * @returns {object}
 */
function getDagupanBoundaryFeature() {
    return dagupanBoundary;
}

module.exports = {
    isInsideDagupanCity,
    getDagupanBoundaryFeature
};
