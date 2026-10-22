'use strict';

function getStopAssignments(stop) {
    if (Array.isArray(stop.routes) && stop.routes.length) {
        return stop.routes;
    }
    if (stop.route_id !== undefined && stop.route_id !== null) {
        return [{ route_id: stop.route_id, stop_order: stop.stop_order }];
    }
    return [];
}

function expandStopAssignments(stops) {
    return stops.flatMap((stop) => {
        const assignments = getStopAssignments(stop);
        if (!assignments.length) {
            return [{ ...stop, stop_id: stop.id, route_id: null, stop_order: null }];
        }
        return assignments.map((assignment) => ({
            ...stop,
            stop_id: stop.id,
            route_id: assignment.route_id,
            stop_order: assignment.stop_order
        }));
    });
}

function stopAssignmentFilter(routeId) {
    return { $or: [{ 'routes.route_id': routeId }, { route_id: routeId }] };
}

module.exports = { getStopAssignments, expandStopAssignments, stopAssignmentFilter };
