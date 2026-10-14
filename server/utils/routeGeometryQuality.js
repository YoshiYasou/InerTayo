'use strict';

const { haversineDistance } = require('./geoUtils');

const MIN_ROUTE_POINTS = 20;
const MAX_SEGMENT_METERS = 500;
const DEFAULT_DENSIFY_TARGET = 100;

function getLineStringCoordinates(input) {
    let geometry = input;
    if (typeof geometry === 'string') {
        try {
            geometry = JSON.parse(geometry);
        } catch {
            return [];
        }
    }

    const coordinates = geometry?.type === 'LineString' && Array.isArray(geometry.coordinates)
        ? geometry.coordinates
        : [];
    if (coordinates.length < 2 || coordinates.some(point =>
        !Array.isArray(point) || point.length < 2 ||
        !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
        point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90
    )) {
        return [];
    }
    return coordinates;
}

function getMaxSegmentMeters(coordinates) {
    let maxSegment = 0;
    for (let index = 1; index < coordinates.length; index += 1) {
        const [previousLng, previousLat] = coordinates[index - 1];
        const [longitude, latitude] = coordinates[index];
        maxSegment = Math.max(
            maxSegment,
            haversineDistance(previousLat, previousLng, latitude, longitude)
        );
    }
    return maxSegment;
}

function densifyLineString(input, targetSegmentMeters = DEFAULT_DENSIFY_TARGET) {
    const coordinates = getLineStringCoordinates(input);
    if (coordinates.length < 2) {
        return coordinates;
    }

    const dense = [coordinates[0]];
    for (let index = 1; index < coordinates.length; index += 1) {
        const previous = coordinates[index - 1];
        const current = coordinates[index];
        const segmentMeters = haversineDistance(previous[1], previous[0], current[1], current[0]);
        const steps = Math.max(1, Math.ceil(segmentMeters / targetSegmentMeters));
        for (let step = 1; step <= steps; step += 1) {
            const fraction = step / steps;
            dense.push([
                previous[0] + (current[0] - previous[0]) * fraction,
                previous[1] + (current[1] - previous[1]) * fraction,
            ]);
        }
    }

    return dense;
}

function isDetailedRoadGeometry(input) {
    const coordinates = getLineStringCoordinates(input);
    return coordinates.length >= MIN_ROUTE_POINTS
        && getMaxSegmentMeters(coordinates) <= MAX_SEGMENT_METERS;
}

module.exports = {
    getLineStringCoordinates,
    getMaxSegmentMeters,
    isDetailedRoadGeometry,
    densifyLineString,
};
