/**
 * InerTayo Geometry Validator
 * Validates GeoJSON LineString coordinates, bounds, order, straight-line shortcuts, and discontinuities.
 */

const { dagupanBounds } = require('../config/routingConfig');
const { haversineDistance } = require('./geoUtils');

/**
 * Validate a GeoJSON LineString geometry object or coordinate array
 * @param {object|Array} input - GeoJSON object or coordinates array
 * @param {object} options - Validation options
 * @returns {{ valid: boolean, errors: string[], warnings: string[], stats: object }}
 */
function validateGeometry(input, options = {}) {
    const errors = [];
    const warnings = [];

    const {
        mode = 'road',               // 'road' | 'boat' | 'walk'
        maxSegmentLengthMeters = 2000, // Large jump without vertices indicates suspicious shortcut
        strictBounds = false,         // True to enforce strict Dagupan bounds
        minVertices = 2
    } = options;

    if (!input) {
        return { valid: false, errors: ['Geometry input is null or undefined'], warnings, stats: {} };
    }

    let coordinates = [];
    if (Array.isArray(input)) {
        coordinates = input;
    } else if (typeof input === 'object' && input.type === 'LineString' && Array.isArray(input.coordinates)) {
        coordinates = input.coordinates;
    } else if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input);
            if (parsed.type === 'LineString' && Array.isArray(parsed.coordinates)) {
                coordinates = parsed.coordinates;
            } else if (Array.isArray(parsed)) {
                coordinates = parsed;
            } else {
                errors.push('Parsed string does not contain valid LineString geometry or coordinate array');
            }
        } catch (e) {
            return { valid: false, errors: [`JSON parse failure: ${e.message}`], warnings, stats: {} };
        }
    } else {
        return { valid: false, errors: ['Input is neither a GeoJSON LineString nor a coordinate array'], warnings, stats: {} };
    }

    if (coordinates.length < minVertices) {
        errors.push(`Geometry contains ${coordinates.length} vertices, minimum required is ${minVertices}`);
        return { valid: false, errors, warnings, stats: { vertexCount: coordinates.length } };
    }

    let totalLengthMeters = 0;
    let maxSegmentFound = 0;
    let outOfBoundsCount = 0;

    for (let i = 0; i < coordinates.length; i++) {
        const pt = coordinates[i];

        // 1. Numeric check
        if (!Array.isArray(pt) || pt.length < 2 || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') {
            errors.push(`Vertex at index ${i} has invalid numeric format: ${JSON.stringify(pt)}`);
            continue;
        }

        const [lng, lat] = pt;

        // NaN or Infinite check
        if (Number.isNaN(lng) || Number.isNaN(lat) || !Number.isFinite(lng) || !Number.isFinite(lat)) {
            errors.push(`Vertex at index ${i} contains NaN or non-finite values`);
            continue;
        }

        // 2. Coordinate order check:
        // In the Philippines / Pangasinan, Latitude is ~15.9 to 16.2, Longitude is ~120.2 to 120.5.
        // If someone passes [lat, lng] as GeoJSON, lat will be in index 0 (~16) and lng in index 1 (~120).
        if (lng < 50 && lat > 100) {
            errors.push(`Vertex at index ${i} appears to have reversed coordinates [lat, lng] instead of GeoJSON [lng, lat]: [${lng}, ${lat}]`);
            continue;
        }

        // 3. Geographic bounds check
        const inBounds = (
            lat >= dagupanBounds.minLat && lat <= dagupanBounds.maxLat &&
            lng >= dagupanBounds.minLng && lng <= dagupanBounds.maxLng
        );

        if (!inBounds) {
            outOfBoundsCount++;
            if (strictBounds) {
                errors.push(`Vertex at index ${i} [${lng}, ${lat}] is outside Dagupan bounds`);
            } else {
                warnings.push(`Vertex at index ${i} [${lng}, ${lat}] is outside primary Dagupan bounds`);
            }
        }

        // 4. Segment distance / jump check
        if (i > 0) {
            const prev = coordinates[i - 1];
            if (Array.isArray(prev) && typeof prev[0] === 'number' && typeof prev[1] === 'number') {
                const segDist = haversineDistance(prev[1], prev[0], lat, lng);
                totalLengthMeters += segDist;
                if (segDist > maxSegmentFound) {
                    maxSegmentFound = segDist;
                }

                // Detect obvious straight-line shortcuts
                if (segDist > maxSegmentLengthMeters) {
                    warnings.push(
                        `Suspicious long straight segment (${Math.round(segDist)}m) between vertex ${i - 1} and ${i}`
                    );
                }

                // Discontinuity check: identical consecutive points
                if (segDist === 0) {
                    warnings.push(`Duplicate consecutive vertex detected at index ${i}`);
                }
            }
        }
    }

    // Obvious shortcut check: Very few vertices covering large distance
    if (coordinates.length <= 4 && totalLengthMeters > 2000) {
        warnings.push(`Route has only ${coordinates.length} vertices spanning ${Math.round(totalLengthMeters)}m, likely a straight-line shortcut`);
    }

    const valid = errors.length === 0;

    return {
        valid,
        errors,
        warnings,
        stats: {
            vertexCount: coordinates.length,
            totalLengthMeters: Math.round(totalLengthMeters),
            maxSegmentMeters: Math.round(maxSegmentFound),
            outOfBoundsCount
        }
    };
}

module.exports = {
    validateGeometry
};
