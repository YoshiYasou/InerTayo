'use strict';

const nearestPointOnLine = require('@turf/nearest-point-on-line').default || require('@turf/nearest-point-on-line');
const { lineString, point } = require('@turf/helpers');
const { isInsideDagupanCity } = require('./dagupanBoundary');
const { haversineDistance, pathLengthMeters } = require('./geoUtils');

function getLineStringCoordinates(input) {
    let geometry = input;
    if (typeof geometry === 'string') {
        try {
            geometry = JSON.parse(geometry);
        } catch (error) {
            throw new Error(`Geometry is not valid JSON: ${error.message}`);
        }
    }

    const coordinates = geometry?.type === 'LineString' ? geometry.coordinates : null;
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error('Geometry must be a GeoJSON LineString with at least two coordinates.');
    }

    for (const [index, coordinate] of coordinates.entries()) {
        if (!Array.isArray(coordinate) || coordinate.length < 2 ||
            !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1]) ||
            coordinate[0] < -180 || coordinate[0] > 180 ||
            coordinate[1] < -90 || coordinate[1] > 90) {
            throw new Error(`Geometry coordinate ${index + 1} is invalid.`);
        }
    }

    return coordinates;
}

function auditRoadGeometry(stops, inputGeometry, options = {}) {
    const maxStopDistanceMeters = options.maxStopDistanceMeters ?? 100;
    const maxDetourRatio = options.maxDetourRatio ?? 1.5;
    const segmentSampleMeters = options.segmentSampleMeters ?? 100;
    if (!Array.isArray(stops) || stops.length < 2) {
        throw new Error('At least two ordered stops are required to audit route geometry.');
    }
    if (!Number.isFinite(maxStopDistanceMeters) || maxStopDistanceMeters < 0 ||
        !Number.isFinite(maxDetourRatio) || maxDetourRatio <= 0 ||
        !Number.isFinite(segmentSampleMeters) || segmentSampleMeters <= 0) {
        throw new Error('Geometry audit thresholds must be positive finite numbers.');
    }

    const coordinates = getLineStringCoordinates(inputGeometry);
    const line = lineString(coordinates);
    const warnings = [];

    for (const [index, stop] of stops.entries()) {
        const latitude = stop.latitude;
        const longitude = stop.longitude;
        if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
            !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
            latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            warnings.push(`Stop ${stop.stop_order ?? index + 1} ("${stop.stop_name || 'unnamed'}") has invalid coordinates.`);
            continue;
        }

        const nearest = nearestPointOnLine(line, point([longitude, latitude]));
        const [nearestLongitude, nearestLatitude] = nearest.geometry.coordinates;
        const distanceMeters = haversineDistance(latitude, longitude, nearestLatitude, nearestLongitude);
        if (distanceMeters > maxStopDistanceMeters) {
            warnings.push(
                `Stop ${stop.stop_order ?? index + 1} ("${stop.stop_name || 'unnamed'}") is ${Math.round(distanceMeters)}m from the snapped path (over ${maxStopDistanceMeters}m).`
            );
        }
    }

    const outsideVertices = [];
    const outsideSegments = [];
    coordinates.forEach(([longitude, latitude], index) => {
        if (!isInsideDagupanCity(latitude, longitude)) outsideVertices.push(index + 1);
        if (index === 0) return;

        const [previousLongitude, previousLatitude] = coordinates[index - 1];
        const distance = haversineDistance(previousLatitude, previousLongitude, latitude, longitude);
        const samples = Math.max(1, Math.ceil(distance / segmentSampleMeters));
        for (let sampleIndex = 1; sampleIndex < samples; sampleIndex += 1) {
            const fraction = sampleIndex / samples;
            const sampleLatitude = previousLatitude + (latitude - previousLatitude) * fraction;
            const sampleLongitude = previousLongitude + (longitude - previousLongitude) * fraction;
            if (!isInsideDagupanCity(sampleLatitude, sampleLongitude)) {
                outsideSegments.push(index);
                break;
            }
        }
    });
    if (outsideVertices.length || outsideSegments.length) {
        const details = [];
        if (outsideVertices.length) details.push(`vertices ${outsideVertices.join(', ')}`);
        if (outsideSegments.length) details.push(`segments ${outsideSegments.join(', ')}`);
        warnings.push(`Geometry falls outside the Dagupan boundary at ${details.join('; ')}.`);
    }

    const lengthMeters = pathLengthMeters(coordinates);
    const [firstLongitude, firstLatitude] = coordinates[0];
    const [lastLongitude, lastLatitude] = coordinates[coordinates.length - 1];
    const straightLineDistanceMeters = haversineDistance(
        firstLatitude, firstLongitude, lastLatitude, lastLongitude
    );
    const detourRatio = straightLineDistanceMeters === 0
        ? (lengthMeters === 0 ? 1 : Infinity)
        : lengthMeters / straightLineDistanceMeters;
    if (detourRatio > maxDetourRatio) {
        warnings.push(
            `Snapped path is ${detourRatio === Infinity ? 'infinitely' : `${detourRatio.toFixed(2)}x`} the endpoint straight-line distance (over ${maxDetourRatio}x).`
        );
    }

    return {
        coordinates,
        lengthMeters,
        straightLineDistanceMeters,
        detourRatio,
        warnings
    };
}

module.exports = { getLineStringCoordinates, auditRoadGeometry };
