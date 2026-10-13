'use strict';

const DETOUR_CONDITIONS = new Set(['FLOODED', 'HIGH_TIDE', 'DETOUR']);

function readLineString(value) {
    if (!value) return null;
    try {
        const geometry = typeof value === 'string' ? JSON.parse(value) : value;
        if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
            return null;
        }
        if (!geometry.coordinates.every(coordinate =>
            Array.isArray(coordinate) && coordinate.length >= 2 &&
            Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]) &&
            coordinate[0] >= -180 && coordinate[0] <= 180 &&
            coordinate[1] >= -90 && coordinate[1] <= 90
        )) return null;
        return geometry;
    } catch {
        return null;
    }
}

function readDetourSteps(link) {
    if (Array.isArray(link?.detour_steps) && link.detour_steps.length > 0) {
        return link.detour_steps.map(step => ({
            mode: step.mode || 'Transit',
            instruction: typeof step.instruction === 'string' ? step.instruction.trim() : '',
            location_info: typeof step.location_info === 'string' ? step.location_info.trim() : ''
        }));
    }
    return String(link?.detour_instructions || '')
        .split(/\r?\n/)
        .map(instruction => instruction.trim())
        .filter(Boolean)
        .map(instruction => ({ mode: 'Transit', instruction, location_info: '' }));
}

function isActiveRouteDetour(advisory, link) {
    if (advisory?.status !== 'ACTIVE' || !DETOUR_CONDITIONS.has(advisory.condition) || link?.detour_enabled !== true) {
        return false;
    }
    if (!readLineString(link.flooded_geometry) || !readLineString(link.detour_geometry)) return false;
    const steps = readDetourSteps(link);
    return steps.length > 0 && steps.every(step => step.instruction.length > 0);
}

function findActiveRouteDetour(routeLinks, advisoriesById) {
    for (const link of routeLinks || []) {
        const advisory = advisoriesById instanceof Map
            ? advisoriesById.get(link.advisory_id)
            : advisoriesById?.find(item => item.id === link.advisory_id);
        if (isActiveRouteDetour(advisory, link)) return { advisory, link };
    }
    return null;
}

function hasExplicitRouteDetour(routeLinks) {
    return (routeLinks || []).some(link => typeof link.detour_enabled === 'boolean');
}

function hasLegacyActiveDetour(route, routeLinks, advisoriesById) {
    if (hasExplicitRouteDetour(routeLinks) || route?.status !== 'DETOUR_ACTIVE') return false;
    return (routeLinks || []).some(link => {
        const advisory = advisoriesById instanceof Map
            ? advisoriesById.get(link.advisory_id)
            : advisoriesById?.find(item => item.id === link.advisory_id);
        return advisory?.status === 'ACTIVE' && DETOUR_CONDITIONS.has(advisory.condition) && link.detour_enabled == null;
    });
}

module.exports = {
    DETOUR_CONDITIONS,
    findActiveRouteDetour,
    hasExplicitRouteDetour,
    hasLegacyActiveDetour,
    isActiveRouteDetour,
    readDetourSteps,
    readLineString
};