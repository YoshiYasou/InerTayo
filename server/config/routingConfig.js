/**
 * InerTayo Routing Configuration
 * Authoritative assumptions for speeds, search radii, transfer limits, and geometry flags.
 * All estimated travel times calculated from these assumptions must be labeled "approx."
 */

const ROUTING_CONFIG = {
    // Speeds in km/h
    speeds: {
        walk: 4.5,      // ~75 m/min
        jeepney: 20.0,  // ~333 m/min
        bus: 25.0,      // ~416 m/min
        tricycle: 15.0, // ~250 m/min
        boat: 12.0      // ~200 m/min
    },

    // Maximum walking search radius to locate nearby transit stops (in meters)
    walkingRadius: 600,

    // Maximum transfers permitted in journey planning
    maxTransfers: 1,

    // Flag controlling whether to use validated, corrected geometry
    USE_CORRECTED_GEOMETRY: process.env.USE_CORRECTED_GEOMETRY !== 'false',

    // Geographic bounding box for Dagupan City area (minLon, minLat, maxLon, maxLat)
    dagupanBounds: {
        minLat: 16.0000,
        maxLat: 16.1200,
        minLng: 120.2400,
        maxLng: 120.4000
    },

    /**
     * Calculate approximate travel duration in minutes for a given distance and mode
     * @param {number} distanceMeters - Distance in meters
     * @param {string} mode - 'walk' | 'jeepney' | 'bus' | 'tricycle' | 'boat'
     * @returns {number} Estimated minutes (minimum 1)
     */
    estimateDurationMinutes(distanceMeters, mode = 'walk') {
        const normalizedMode = (mode || 'walk').toLowerCase();
        const speedKmh = ROUTING_CONFIG.speeds[normalizedMode] || ROUTING_CONFIG.speeds.walk;
        const speedMetersPerMin = (speedKmh * 1000) / 60;
        const minutes = Math.ceil(distanceMeters / speedMetersPerMin);
        return Math.max(1, minutes);
    },

    /**
     * Format estimated duration string with mandatory "approx." label
     * @param {number} minutes
     * @returns {string} e.g. "approx. 15 min"
     */
    formatDuration(minutes) {
        return `approx. ${minutes} min`;
    }
};

module.exports = ROUTING_CONFIG;
