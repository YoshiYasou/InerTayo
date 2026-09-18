const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/database');
const { authenticateToken, optionalAuth, requireAdmin, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// ============================================================================
// 1. PUBLIC TRANSIT ENDPOINTS (Accessible to Commuters & Guests)
// ============================================================================

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// GET /api/transport-modes - List all transport modes
router.get('/transport-modes', async (req, res) => {
    try {
        const modes = await query.all(`SELECT * FROM transport_modes ORDER BY id ASC`);
        res.json(modes);
    } catch (err) {
        console.error('Error fetching transport modes:', err);
        res.status(500).json({ error: 'Failed to retrieve transport modes.' });
    }
});

// GET /api/search/suggestions - Unified search suggestions across locations, streets, barangays, landmarks & routes
router.get('/search/suggestions', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim() === '') {
            return res.json([]);
        }

        const queryTerm = q.trim();
        const term = `%${queryTerm}%`;

        // 1. Search Locations (Streets, Roads, Barangays, Landmarks, Terminals, etc.)
        const matchingLocations = await query.all(
            `SELECT id, name, type, barangay, address, latitude, longitude, search_keywords
             FROM locations
             WHERE status = 'ACTIVE' AND (
                 name LIKE ? OR 
                 barangay LIKE ? OR 
                 search_keywords LIKE ? OR 
                 address LIKE ?
             )
             ORDER BY 
                 CASE 
                     WHEN LOWER(name) = LOWER(?) THEN 1
                     WHEN LOWER(name) LIKE ? THEN 2
                     WHEN search_keywords LIKE ? THEN 3
                     ELSE 4
                 END,
                 name ASC
             LIMIT 12`,
            [term, term, term, term, queryTerm, `${queryTerm.toLowerCase()}%`, term]
        );

        const getTypeLabel = (type) => {
            const upper = (type || '').toUpperCase();
            switch (upper) {
                case 'STREET':
                case 'ROAD':
                    return 'Street / Road';
                case 'BARANGAY':
                    return 'Barangay';
                case 'LANDMARK':
                case 'ESTABLISHMENT':
                    return 'Landmark';
                case 'TERMINAL':
                    return 'Terminal';
                case 'RIVER_STOP':
                    return 'River Stop';
                case 'DESTINATION':
                    return 'Destination';
                case 'INTERSECTION':
                    return 'Intersection';
                default:
                    return 'Location';
            }
        };

        const locationSuggestions = matchingLocations.map(loc => ({
            id: loc.id,
            name: loc.name,
            type: loc.type,
            typeLabel: getTypeLabel(loc.type),
            barangay: loc.barangay,
            address: loc.address,
            latitude: loc.latitude,
            longitude: loc.longitude,
            category: 'location'
        }));

        // 2. Search Routes (by route_name, origin, destination, description)
        const matchingRoutes = await query.all(
            `SELECT r.id, r.route_name, tm.name AS mode_name, tm.icon AS mode_icon, r.origin, r.destination, r.status
             FROM routes r
             JOIN transport_modes tm ON r.transport_mode_id = tm.id
             WHERE r.route_name LIKE ? OR r.origin LIKE ? OR r.destination LIKE ? OR r.description LIKE ?
             ORDER BY r.route_name ASC
             LIMIT 6`,
            [term, term, term, term]
        );

        const routeSuggestions = matchingRoutes.map(r => ({
            id: r.id,
            name: r.route_name,
            type: 'ROUTE',
            typeLabel: 'Route',
            mode: r.mode_name,
            modeIcon: r.mode_icon,
            origin: r.origin,
            destination: r.destination,
            status: r.status,
            category: 'route'
        }));

        res.json([...locationSuggestions, ...routeSuggestions]);
    } catch (err) {
        console.error('Error fetching search suggestions:', err);
        res.status(500).json({ error: 'Failed to retrieve search suggestions.' });
    }
});

// GET /api/locations - List and search locations (streets, landmarks, river stops, barangays, etc.)
router.get('/locations', async (req, res) => {
    try {
        const { search, type, status } = req.query;
        let sql = `SELECT id, name, type, barangay, address, latitude, longitude, description, search_keywords, status, created_at, updated_at FROM locations WHERE 1=1`;
        const params = [];

        // Status filter: default to ACTIVE unless specified as ALL or specific status
        if (status && status !== 'ALL') {
            sql += ` AND status = ?`;
            params.push(status.toUpperCase());
        } else if (!status) {
            sql += ` AND status = 'ACTIVE'`;
        }

        // Search query: case-insensitive partial match on name, barangay, search_keywords, address, or description
        if (search && search.trim() !== '') {
            const term = `%${search.trim()}%`;
            sql += ` AND (name LIKE ? OR barangay LIKE ? OR search_keywords LIKE ? OR address LIKE ? OR description LIKE ?)`;
            params.push(term, term, term, term, term);
        }

        // Type filter: STREET | ROAD | LANDMARK | ESTABLISHMENT | TERMINAL | STOP | INTERSECTION | BARANGAY | RIVER_STOP | DESTINATION
        if (type && type !== 'ALL') {
            const upperType = type.toUpperCase();
            if (upperType === 'ROAD' || upperType === 'STREET') {
                sql += ` AND UPPER(type) IN ('STREET', 'ROAD')`;
            } else {
                sql += ` AND UPPER(type) = ?`;
                params.push(upperType);
            }
        }

        sql += ` ORDER BY name ASC`;
        const locations = await query.all(sql, params);
        res.json(locations);
    } catch (err) {
        console.error('Error fetching locations:', err);
        res.status(500).json({ error: 'Failed to retrieve locations.' });
    }
});

// GET /api/locations/:id - Single location details with connected routes
router.get('/locations/:id', async (req, res) => {
    try {
        const locationId = parseInt(req.params.id, 10);
        if (isNaN(locationId)) {
            return res.status(400).json({ error: 'Invalid location ID.' });
        }

        const location = await query.get(
            `SELECT id, name, type, barangay, address, latitude, longitude, description, search_keywords, status, created_at, updated_at 
             FROM locations WHERE id = ?`,
            [locationId]
        );

        if (!location) {
            return res.status(404).json({ error: 'Location not found.' });
        }

        // Find routes that pass through this location (via route_segments, stops, or origin/destination)
        const connectedRoutes = await query.all(
            `SELECT DISTINCT r.id, r.route_name, tm.name AS mode_name, tm.icon AS mode_icon, r.minimum_fare, r.maximum_fare, r.status
             FROM routes r
             JOIN transport_modes tm ON r.transport_mode_id = tm.id
             LEFT JOIN route_segments rs ON r.id = rs.route_id
             WHERE rs.start_location_id = ? OR rs.end_location_id = ? 
                OR r.origin LIKE ? OR r.destination LIKE ?
                OR r.description LIKE ?
                OR r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?)`,
            [locationId, locationId, `%${location.name}%`, `%${location.name}%`, `%${location.name}%`, `%${location.name}%`]
        );

        res.json({
            ...location,
            available_routes: connectedRoutes
        });
    } catch (err) {
        console.error('Error fetching location detail:', err);
        res.status(500).json({ error: 'Failed to retrieve location.' });
    }
});

// GET /api/landmarks - List reference landmarks with optional search (legacy backward compatibility)
router.get('/landmarks', async (req, res) => {
    try {
        const { search, type } = req.query;
        let sql = `SELECT id, name, latitude, longitude, type FROM landmarks WHERE 1=1`;
        const params = [];

        if (search && search.trim() !== '') {
            sql += ` AND name LIKE ?`;
            params.push(`%${search.trim()}%`);
        }

        if (type && type !== 'ALL') {
            sql += ` AND type = ?`;
            params.push(type.toUpperCase());
        }

        sql += ` ORDER BY name ASC`;
        const landmarks = await query.all(sql, params);
        res.json(landmarks);
    } catch (err) {
        console.error('Error fetching landmarks:', err);
        res.status(500).json({ error: 'Failed to retrieve landmarks.' });
    }
});

// GET /api/geocode - Free Nominatim OSM geocoding with database caching
router.get('/geocode', async (req, res) => {
    try {
        const { query: queryText } = req.query;
        if (!queryText || queryText.trim() === '') {
            return res.status(400).json({ error: 'Query parameter is required.' });
        }

        const cleanQuery = queryText.trim();

        // 0. Check unified locations table first
        const locMatch = await query.get(
            `SELECT name, latitude, longitude FROM locations WHERE (name LIKE ? OR search_keywords LIKE ? OR barangay LIKE ?) AND latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 1`,
            [`%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`]
        );

        if (locMatch) {
            return res.json({
                name: locMatch.name,
                latitude: locMatch.latitude,
                longitude: locMatch.longitude,
                source: 'database_location'
            });
        }

        // 1. Check local DB landmarks
        const dbMatch = await query.get(
            `SELECT name, latitude, longitude FROM landmarks WHERE name LIKE ? LIMIT 1`,
            [`%${cleanQuery}%`]
        );

        if (dbMatch) {
            return res.json({
                name: dbMatch.name,
                latitude: dbMatch.latitude,
                longitude: dbMatch.longitude,
                source: 'database_cache'
            });
        }

        // 2. Check local DB stops
        const stopMatch = await query.get(
            `SELECT stop_name, latitude, longitude FROM stops WHERE stop_name LIKE ? AND latitude IS NOT NULL LIMIT 1`,
            [`%${cleanQuery}%`]
        );

        if (stopMatch) {
            return res.json({
                name: stopMatch.stop_name,
                latitude: stopMatch.latitude,
                longitude: stopMatch.longitude,
                source: 'database_stop'
            });
        }

        // 3. Fallback: Query OSM Nominatim bounded to Dagupan area
        const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery + ', Dagupan, Pangasinan')}&limit=1`;
        const osmRes = await fetch(osmUrl, {
            headers: {
                'User-Agent': 'InerTayo-Dagupan-Transit/1.0 (transit@inertayo.ph)'
            }
        });

        if (osmRes.ok) {
            const data = await osmRes.json();
            if (Array.isArray(data) && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);

                // Cache in landmarks table
                try {
                    await query.run(
                        `INSERT OR IGNORE INTO landmarks (name, latitude, longitude, type) VALUES (?, ?, ?, 'GEOCODED')`,
                        [cleanQuery, lat, lon]
                    );
                } catch (e) {}

                return res.json({
                    name: result.display_name,
                    latitude: lat,
                    longitude: lon,
                    source: 'nominatim_osm'
                });
            }
        }

        // Fallback default coordinates (Dagupan Plaza)
        res.json({
            name: cleanQuery,
            latitude: 16.0435,
            longitude: 120.3340,
            source: 'default_fallback'
        });
    } catch (err) {
        console.error('Geocoding error:', err);
        res.json({
            name: req.query.query || 'Dagupan City',
            latitude: 16.0435,
            longitude: 120.3340,
            source: 'error_fallback'
        });
    }
});

// Helper: sync route status based on active advisories
async function syncRouteAdvisoryStatus(routeId) {
    const activeAdvisories = await query.all(
        `SELECT a.condition, a.status FROM advisories a
         JOIN advisory_routes ar ON a.id = ar.advisory_id
         WHERE ar.route_id = ? AND a.status = 'ACTIVE'`,
        [routeId]
    );

    let newStatus = 'CLEAR';
    if (activeAdvisories.length > 0) {
        const hasUnavailable = activeAdvisories.some(a => 
            a.condition === 'ROAD_CLOSURE' || 
            a.condition === 'ROUTE_UNAVAILABLE' ||
            a.condition === 'RIVER_TRANSPORT_SUSPENDED'
        );
        if (hasUnavailable) {
            newStatus = 'UNAVAILABLE';
        } else if (activeAdvisories.some(a => a.condition === 'RIVER_ADVISORY' || a.condition === 'ADVISORY')) {
            newStatus = 'ADVISORY';
        } else {
            newStatus = 'DETOUR_ACTIVE';
        }
    }

    // Check boat_route_details if this route has boat operating_status
    const boatDetail = await query.get(`SELECT operating_status FROM boat_route_details WHERE route_id = ?`, [routeId]);
    if (boatDetail && (boatDetail.operating_status === 'SUSPENDED' || boatDetail.operating_status === 'UNAVAILABLE')) {
        newStatus = 'UNAVAILABLE';
    }

    await query.run(
        `UPDATE routes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newStatus, routeId]
    );
    return newStatus;
}

// GET /api/routes - Search, filter, and sort routes
router.get('/routes', async (req, res) => {
    try {
        const { search, mode, sort, from, to } = req.query;

        let sql = `
            SELECT 
                r.id,
                r.route_name,
                r.transport_mode_id,
                tm.name AS mode_name,
                tm.icon AS mode_icon,
                r.origin,
                r.destination,
                r.estimated_time,
                r.detour_time,
                CASE 
                    WHEN r.status = 'DETOUR_ACTIVE' AND r.detour_time IS NOT NULL THEN r.detour_time
                    ELSE r.estimated_time
                END AS active_travel_time,
                r.minimum_fare,
                r.maximum_fare,
                CASE
                    WHEN brd.operating_status = 'SUSPENDED' OR brd.operating_status = 'UNAVAILABLE' THEN 'UNAVAILABLE'
                    ELSE r.status
                END AS status,
                r.description,
                r.geometry,
                r.created_at,
                r.updated_at,
                brd.waterway,
                brd.operating_status AS boat_operating_status
            FROM routes r
            JOIN transport_modes tm ON r.transport_mode_id = tm.id
            LEFT JOIN boat_route_details brd ON r.id = brd.route_id
            WHERE 1=1
        `;

        const params = [];

        // Filter by transport mode (Jeepney, Bus, Tricycle, Boat)
        if (mode && mode !== 'All Modes' && mode !== 'ALL') {
            sql += ` AND LOWER(tm.name) = LOWER(?)`;
            params.push(mode);
        }

        // Search query (matches route name, origin, destination, description, stops, or connected locations/streets/barangays/keywords)
        if (search && search.trim() !== '') {
            const term = `%${search.trim()}%`;
            sql += ` AND (
                r.route_name LIKE ? OR 
                r.origin LIKE ? OR 
                r.destination LIKE ? OR 
                r.description LIKE ? OR
                r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?) OR
                r.id IN (
                    SELECT route_id FROM route_segments rs 
                    JOIN locations l ON rs.start_location_id = l.id OR rs.end_location_id = l.id 
                    WHERE l.name LIKE ? OR l.barangay LIKE ? OR l.search_keywords LIKE ?
                )
            )`;
            params.push(term, term, term, term, term, term, term, term);
        }

        // FROM / TO specific filtering if passed
        if (from && from.trim() !== '') {
            const termFrom = `%${from.trim()}%`;
            sql += ` AND (
                r.origin LIKE ? OR 
                r.route_name LIKE ? OR 
                r.description LIKE ? OR
                r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?) OR 
                r.id IN (
                    SELECT route_id FROM route_segments rs 
                    JOIN locations l ON rs.start_location_id = l.id OR rs.end_location_id = l.id 
                    WHERE l.name LIKE ? OR l.barangay LIKE ? OR l.search_keywords LIKE ?
                )
            )`;
            params.push(termFrom, termFrom, termFrom, termFrom, termFrom, termFrom, termFrom);
        }

        if (to && to.trim() !== '') {
            const termTo = `%${to.trim()}%`;
            sql += ` AND (
                r.destination LIKE ? OR 
                r.route_name LIKE ? OR 
                r.description LIKE ? OR
                r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?) OR 
                r.id IN (
                    SELECT route_id FROM route_segments rs 
                    JOIN locations l ON rs.start_location_id = l.id OR rs.end_location_id = l.id 
                    WHERE l.name LIKE ? OR l.barangay LIKE ? OR l.search_keywords LIKE ?
                )
            )`;
            params.push(termTo, termTo, termTo, termTo, termTo, termTo, termTo);
        }

        // Sorting
        if (sort === 'cheapest' || sort === 'Cheapest Fare') {
            sql += ` ORDER BY r.minimum_fare ASC, active_travel_time ASC`;
        } else {
            // Default: fastest travel time (respecting advisory detour time per §0.5)
            sql += ` ORDER BY active_travel_time ASC, r.minimum_fare ASC`;
        }

        const routes = await query.all(sql, params);

        // Fetch active advisories for each route
        for (const r of routes) {
            const advisories = await query.all(
                `SELECT a.id, a.title, a.affected_road, a.condition, a.description, a.status
                 FROM advisories a
                 JOIN advisory_routes ar ON a.id = ar.advisory_id
                 WHERE ar.route_id = ? AND a.status = 'ACTIVE'`,
                [r.id]
            );
            r.advisories = advisories;
        }

        res.json(routes);
    } catch (err) {
        console.error('Error fetching routes:', err);
        res.status(500).json({ error: 'Failed to retrieve routes.' });
    }
});

// GET /api/routes/:id - Single route with stops, steps, and fare breakdown
router.get('/routes/:id', async (req, res) => {
    try {
        const routeId = parseInt(req.params.id, 10);
        if (isNaN(routeId)) {
            return res.status(400).json({ error: 'Invalid route ID format.' });
        }

        const route = await query.get(
            `SELECT 
                r.id,
                r.route_name,
                r.transport_mode_id,
                tm.name AS mode_name,
                tm.icon AS mode_icon,
                r.origin,
                r.destination,
                r.estimated_time,
                r.detour_time,
                CASE 
                    WHEN r.status = 'DETOUR_ACTIVE' AND r.detour_time IS NOT NULL THEN r.detour_time
                    ELSE r.estimated_time
                END AS active_travel_time,
                r.minimum_fare,
                r.maximum_fare,
                CASE
                    WHEN brd.operating_status = 'SUSPENDED' OR brd.operating_status = 'UNAVAILABLE' THEN 'UNAVAILABLE'
                    ELSE r.status
                END AS status,
                r.description,
                r.geometry,
                r.created_at,
                r.updated_at,
                brd.waterway,
                brd.operating_status AS boat_operating_status
            FROM routes r
            JOIN transport_modes tm ON r.transport_mode_id = tm.id
            LEFT JOIN boat_route_details brd ON r.id = brd.route_id
            WHERE r.id = ?`,
            [routeId]
        );

        if (!route) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        // Fetch stops
        const stops = await query.all(
            `SELECT id, stop_name, stop_order, description, is_transfer_point, latitude, longitude
             FROM stops
             WHERE route_id = ?
             ORDER BY stop_order ASC`,
            [routeId]
        );

        // Fetch steps
        const steps = await query.all(
            `SELECT id, step_number, mode, instruction, location_info
             FROM route_steps
             WHERE route_id = ?
             ORDER BY step_number ASC`,
            [routeId]
        );

        // Fetch fares
        const fares = await query.all(
            `SELECT id, passenger_type, base_fare, discount_percentage, final_fare, effective_date
             FROM fares
             WHERE route_id = ?
             ORDER BY id ASC`,
            [routeId]
        );

        // Fetch active advisories
        const advisories = await query.all(
            `SELECT a.id, a.title, a.affected_road, a.condition, a.description, a.status
             FROM advisories a
             JOIN advisory_routes ar ON a.id = ar.advisory_id
             WHERE ar.route_id = ? AND a.status = 'ACTIVE'`,
            [routeId]
        );

        // Fetch boat details if available
        const boatDetails = await query.get(
            `SELECT brd.*, 
                    orig.name AS origin_stop_name, 
                    dest.name AS destination_stop_name 
             FROM boat_route_details brd
             LEFT JOIN locations orig ON brd.origin_river_stop_id = orig.id
             LEFT JOIN locations dest ON brd.destination_river_stop_id = dest.id
             WHERE brd.route_id = ?`,
            [routeId]
        );

        // Fetch route segments if available
        const segments = await query.all(
            `SELECT rs.*, 
                    sl.name AS start_location_name, 
                    el.name AS end_location_name 
             FROM route_segments rs
             LEFT JOIN locations sl ON rs.start_location_id = sl.id
             LEFT JOIN locations el ON rs.end_location_id = el.id
             WHERE rs.route_id = ?
             ORDER BY rs.segment_order ASC`,
            [routeId]
        );

        // Find alternative clear routes if current route is affected
        let alternativeRoutes = [];
        if (route.status === 'DETOUR_ACTIVE' || route.status === 'UNAVAILABLE') {
            alternativeRoutes = await query.all(
                `SELECT r.id, r.route_name, r.minimum_fare, r.maximum_fare, r.estimated_time, tm.name as mode_name
                 FROM routes r
                 JOIN transport_modes tm ON r.transport_mode_id = tm.id
                 WHERE r.id != ? AND r.status = 'CLEAR'
                 LIMIT 2`,
                [routeId]
            );
        }

        res.json({
            ...route,
            stops,
            steps,
            fares,
            advisories,
            alternativeRoutes,
            boat_details: boatDetails || null,
            segments: segments || []
        });
    } catch (err) {
        console.error('Error fetching route details:', err);
        res.status(500).json({ error: 'Failed to retrieve route details.' });
    }
});

// GET /api/routes/:id/geojson - RFC 7946 GeoJSON Feature representation of route corridor
router.get('/routes/:id/geojson', async (req, res) => {
    try {
        const routeId = parseInt(req.params.id, 10);
        if (isNaN(routeId)) {
            return res.status(400).json({ error: 'Invalid route ID format.' });
        }

        const route = await query.get(
            `SELECT r.*, tm.name AS mode_name FROM routes r
             JOIN transport_modes tm ON r.transport_mode_id = tm.id
             WHERE r.id = ?`,
            [routeId]
        );

        if (!route) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const stops = await query.all(
            `SELECT * FROM stops WHERE route_id = ? ORDER BY stop_order ASC`,
            [routeId]
        );

        let geometryObj = null;
        if (route.geometry) {
            try {
                geometryObj = typeof route.geometry === 'string' ? JSON.parse(route.geometry) : route.geometry;
            } catch (e) {
                console.error('Failed to parse route geometry JSON:', e);
            }
        }

        // Fallback: derive GeoJSON LineString coordinates from sequential stops
        if (!geometryObj && stops.length >= 2) {
            const coords = stops
                .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
                .map(s => [s.longitude, s.latitude]); // RFC 7946: [lon, lat]
            geometryObj = {
                type: 'LineString',
                coordinates: coords
            };
        }

        const geojsonFeature = {
            type: 'Feature',
            properties: {
                id: route.id,
                routeName: route.route_name,
                mode: route.mode_name,
                origin: route.origin,
                destination: route.destination,
                estimatedTime: route.estimated_time,
                detourTime: route.detour_time,
                fareRange: `₱${Math.round(route.minimum_fare)} – ₱${Math.round(route.maximum_fare)}`,
                status: route.status,
                stopsCount: stops.length
            },
            geometry: geometryObj
        };

        res.json(geojsonFeature);
    } catch (err) {
        console.error('Error serving GeoJSON:', err);
        res.status(500).json({ error: 'Failed to retrieve GeoJSON.' });
    }
});

// GET /api/advisories - All active advisories with affected route lists
router.get('/advisories', async (req, res) => {
    try {
        const advisories = await query.all(
            `SELECT a.id, a.title, a.affected_road, a.condition, a.description, a.status, a.created_at, a.updated_at
             FROM advisories a
             WHERE a.status = 'ACTIVE'
             ORDER BY a.created_at DESC`
        );

        for (const adv of advisories) {
            const affectedRoutes = await query.all(
                `SELECT r.id, r.route_name, tm.name AS mode_name, r.status
                 FROM routes r
                 JOIN transport_modes tm ON r.transport_mode_id = tm.id
                 JOIN advisory_routes ar ON r.id = ar.route_id
                 WHERE ar.advisory_id = ?`,
                [adv.id]
            );
            adv.affected_routes = affectedRoutes;
        }

        res.json(advisories);
    } catch (err) {
        console.error('Error fetching advisories:', err);
        res.status(500).json({ error: 'Failed to retrieve advisories.' });
    }
});

// POST /api/fare-calculator - Server-side fare calculation
router.post('/fare-calculator', async (req, res) => {
    try {
        const { from, to, passengerType = 'REGULAR' } = req.body;

        const validTypes = ['REGULAR', 'STUDENT', 'SENIOR_CITIZEN', 'PWD'];
        const normalizedType = validTypes.includes(passengerType.toUpperCase())
            ? passengerType.toUpperCase()
            : 'REGULAR';

        // Default discount configuration
        const discountRates = {
            'REGULAR': 0,
            'STUDENT': 20,
            'SENIOR_CITIZEN': 20,
            'PWD': 20
        };
        const discountPercentage = discountRates[normalizedType] || 0;

        // Try to match a known route for FROM and TO (bidirectional search)
        let matchingRoute = null;
        if (from && to) {
            const fromTerm = `%${from.trim()}%`;
            const toTerm = `%${to.trim()}%`;
            matchingRoute = await query.get(
                `SELECT r.*, tm.name as mode_name
                 FROM routes r
                 JOIN transport_modes tm ON r.transport_mode_id = tm.id
                 WHERE (
                     (r.origin LIKE ? OR r.route_name LIKE ? OR r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?))
                     AND
                     (r.destination LIKE ? OR r.route_name LIKE ? OR r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?))
                 ) OR (
                     (r.destination LIKE ? OR r.route_name LIKE ? OR r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?))
                     AND
                     (r.origin LIKE ? OR r.route_name LIKE ? OR r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?))
                 )
                 LIMIT 1`,
                [fromTerm, fromTerm, fromTerm, toTerm, toTerm, toTerm, fromTerm, fromTerm, fromTerm, toTerm, toTerm, toTerm]
            );
        }

        let legs = [];
        let totalEstimatedFare = 0;

        if (matchingRoute) {
            // Check if there are structured route segments configured
            const segments = await query.all(
                `SELECT rs.*, sl.name as start_location_name, el.name as end_location_name
                 FROM route_segments rs
                 LEFT JOIN locations sl ON rs.start_location_id = sl.id
                 LEFT JOIN locations el ON rs.end_location_id = el.id
                 WHERE rs.route_id = ?
                 ORDER BY rs.segment_order ASC`,
                [matchingRoute.id]
            );

            if (segments.length > 0) {
                for (const seg of segments) {
                    const isFree = (seg.mode.toLowerCase() === 'walk' || seg.fare === 0);
                    const baseFare = seg.fare;
                    const finalFare = isFree ? 0 : (discountPercentage > 0 ? Number((baseFare * (1 - discountPercentage / 100)).toFixed(2)) : baseFare);
                    const instruction = seg.notes || `${seg.mode}: ${seg.start_location_name || 'Origin'} – ${seg.end_location_name || 'Destination'}`;
                    
                    legs.push({
                        mode: seg.mode,
                        instruction,
                        baseFare,
                        discountPercent: isFree ? 0 : discountPercentage,
                        finalFare,
                        isFree,
                        estimatedTime: seg.estimated_time
                    });
                    totalEstimatedFare += finalFare;
                }
                totalEstimatedFare = Number(totalEstimatedFare.toFixed(2));
            } else {
                // Fallback to single route fare record
                const dbFare = await query.get(
                    `SELECT base_fare, discount_percentage, final_fare FROM fares WHERE route_id = ? AND passenger_type = ?`,
                    [matchingRoute.id, normalizedType]
                );

                const baseFare = dbFare ? dbFare.base_fare : matchingRoute.minimum_fare;
                const finalFare = dbFare ? dbFare.final_fare : Number((baseFare * (1 - discountPercentage / 100)).toFixed(2));

                legs = [
                    {
                        mode: matchingRoute.mode_name,
                        instruction: `${matchingRoute.origin} – ${matchingRoute.destination}`,
                        baseFare: baseFare,
                        discountPercent: discountPercentage,
                        finalFare: finalFare,
                        isFree: false
                    }
                ];
                totalEstimatedFare = finalFare;
            }

            res.json({
                passengerType: normalizedType,
                discountPercentage,
                legs,
                totalEstimatedFare,
                disclaimer: 'Fare estimates are based on project/sample route data and configured discount rules. They are not officially verified municipal rates and may vary.'
            });
        } else {
            res.json({
                passengerType: normalizedType,
                discountPercentage,
                legs: [],
                totalEstimatedFare: 0,
                message: 'No configured route found for this destination. Try another location or check the available routes.',
                disclaimer: 'Fare estimates are based on project/sample route data and configured discount rules. They are not officially verified municipal rates and may vary.'
            });
        }
    } catch (err) {
        console.error('Error calculating fare:', err);
        res.status(500).json({ error: 'Failed to calculate fare.' });
    }
});

// POST /api/feedback - Commuter feedback submission (guest or authenticated)
router.post('/feedback', optionalAuth, async (req, res) => {
    try {
        const { name, email, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required fields.' });
        }

        const userId = req.user ? req.user.id : null;

        const result = await query.run(
            `INSERT INTO feedback (user_id, name, email, message, status) VALUES (?, ?, ?, ?, 'NEW')`,
            [userId, name.trim(), email.trim(), message.trim()]
        );

        res.status(201).json({
            message: 'Feedback submitted successfully. Thank you for helping improve Dagupan transit!',
            feedbackId: result.lastID
        });
    } catch (err) {
        console.error('Error saving feedback:', err);
        res.status(500).json({ error: 'Failed to submit feedback.' });
    }
});

// ============================================================================
// 2. AUTHENTICATION & COMMUTER ACCOUNTS
// ============================================================================

// POST /api/auth/register - Register commuter
router.post('/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        }

        // Check if username or email exists
        const existing = await query.get(
            `SELECT id FROM users WHERE username = ? OR email = ?`,
            [username.trim(), email.trim().toLowerCase()]
        );
        if (existing) {
            return res.status(409).json({ error: 'Username or email is already registered.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await query.run(
            `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'COMMUTER')`,
            [username.trim(), email.trim().toLowerCase(), passwordHash]
        );

        const userPayload = {
            id: result.lastID,
            username: username.trim(),
            email: email.trim().toLowerCase(),
            role: 'COMMUTER'
        };

        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'Registration successful!',
            token,
            user: userPayload
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// POST /api/auth/login - Login commuter or admin
router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username/Email and password are required.' });
        }

        const user = await query.get(
            `SELECT id, username, email, password_hash, role FROM users WHERE username = ? OR email = ?`,
            [username.trim(), username.trim().toLowerCase()]
        );

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const userPayload = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Login successful!',
            token,
            user: userPayload
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Authentication failed.' });
    }
});

// GET /api/auth/me - Current profile & saved routes
router.get('/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await query.get(
            `SELECT id, username, email, role, created_at FROM users WHERE id = ?`,
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const savedRoutes = await query.all(
            `SELECT r.id, r.route_name, tm.name as mode_name, r.minimum_fare, r.maximum_fare, r.status
             FROM saved_routes sr
             JOIN routes r ON sr.route_id = r.id
             JOIN transport_modes tm ON r.transport_mode_id = tm.id
             WHERE sr.user_id = ?
             ORDER BY sr.created_at DESC`,
            [req.user.id]
        );

        res.json({
            user,
            savedRoutes
        });
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ error: 'Failed to fetch user profile.' });
    }
});

// ============================================================================
// 3. COMMUTER SAVED ROUTES (per §0.8)
// ============================================================================

// GET /api/saved-routes - Get saved routes for current user
router.get('/saved-routes', authenticateToken, async (req, res) => {
    try {
        const saved = await query.all(
            `SELECT r.id, r.route_name, tm.name as mode_name, tm.icon as mode_icon,
                    r.origin, r.destination, r.estimated_time, r.minimum_fare, r.maximum_fare, r.status,
                    sr.created_at as saved_at
             FROM saved_routes sr
             JOIN routes r ON sr.route_id = r.id
             JOIN transport_modes tm ON r.transport_mode_id = tm.id
             WHERE sr.user_id = ?
             ORDER BY sr.created_at DESC`,
            [req.user.id]
        );
        res.json(saved);
    } catch (err) {
        console.error('Error fetching saved routes:', err);
        res.status(500).json({ error: 'Failed to retrieve saved routes.' });
    }
});

// GET /api/users/:id/saved-routes — BOLA/IDOR-protected user-scoped saved routes
// The server compares the :id path parameter to the authenticated user's JWT subject.
// If they do not match, a 403 Forbidden is returned — this is the BOLA/IDOR defense.
// This endpoint exists specifically to provide a testable BOLA scenario for the VAPT
// section of the security report (see addendum §4).
router.get('/users/:id/saved-routes', authenticateToken, async (req, res) => {
    const requestedId = parseInt(req.params.id, 10);

    // Validate path parameter
    if (isNaN(requestedId)) {
        return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    // ── BOLA/IDOR defence: reject cross-user access
    if (requestedId !== req.user.id) {
        return res.status(403).json({
            error: 'Access denied. You may only retrieve your own saved routes.'
        });
    }

    try {
        const saved = await query.all(
            `SELECT r.id, r.route_name, tm.name as mode_name, tm.icon as mode_icon,
                    r.origin, r.destination, r.estimated_time, r.minimum_fare, r.maximum_fare, r.status,
                    sr.created_at as saved_at
             FROM saved_routes sr
             JOIN routes r ON sr.route_id = r.id
             JOIN transport_modes tm ON r.transport_mode_id = tm.id
             WHERE sr.user_id = ?
             ORDER BY sr.created_at DESC`,
            [req.user.id]
        );
        res.json(saved);
    } catch (err) {
        console.error('Error fetching user saved routes:', err);
        res.status(500).json({ error: 'Failed to retrieve saved routes.' });
    }
});

// POST /api/routes/:id/save - Toggle bookmark in saved_routes
router.post('/routes/:id/save', authenticateToken, async (req, res) => {
    try {
        const routeId = parseInt(req.params.id, 10);
        if (isNaN(routeId)) {
            return res.status(400).json({ error: 'Invalid route ID.' });
        }

        const existing = await query.get(
            `SELECT id FROM saved_routes WHERE user_id = ? AND route_id = ?`,
            [req.user.id, routeId]
        );

        if (existing) {
            await query.run(
                `DELETE FROM saved_routes WHERE user_id = ? AND route_id = ?`,
                [req.user.id, routeId]
            );
            return res.json({ saved: false, message: 'Route removed from saved routes.' });
        } else {
            await query.run(
                `INSERT INTO saved_routes (user_id, route_id) VALUES (?, ?)`,
                [req.user.id, routeId]
            );
            return res.json({ saved: true, message: 'Route saved successfully!' });
        }
    } catch (err) {
        console.error('Error toggling saved route:', err);
        res.status(500).json({ error: 'Failed to toggle saved route.' });
    }
});

// ============================================================================
// 4. ADMIN MANAGEMENT ENDPOINTS (Strictly requires ADMIN role per §18, §19)
// ============================================================================

// GET /api/admin/stats - Admin dashboard overview metrics
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const totalRoutes = await query.get(`SELECT COUNT(*) as count FROM routes`);
        const activeAdvisories = await query.get(`SELECT COUNT(*) as count FROM advisories WHERE status = 'ACTIVE'`);
        const totalStops = await query.get(`SELECT COUNT(*) as count FROM stops`);
        const pendingFeedback = await query.get(`SELECT COUNT(*) as count FROM feedback WHERE status = 'NEW'`);
        const totalLocations = await query.get(`SELECT COUNT(*) as count FROM locations`);
        const totalModes = await query.get(`SELECT COUNT(*) as count FROM transport_modes`);

        res.json({
            totalRoutes: totalRoutes.count,
            activeAdvisories: activeAdvisories.count,
            totalStops: totalStops.count,
            pendingFeedback: pendingFeedback.count,
            totalLocations: totalLocations ? totalLocations.count : 0,
            totalModes: totalModes ? totalModes.count : 0
        });
    } catch (err) {
        console.error('Error fetching admin stats:', err);
        res.status(500).json({ error: 'Failed to retrieve admin stats.' });
    }
});

// ============================================================================
// ADMIN LOCATIONS CRUD
// ============================================================================

const VALID_LOCATION_TYPES = [
    'STREET', 'ROAD', 'LANDMARK', 'ESTABLISHMENT', 'TERMINAL', 
    'STOP', 'INTERSECTION', 'BARANGAY', 'RIVER_STOP', 'DESTINATION'
];

// GET /api/admin/locations - List all locations
router.get('/admin/locations', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { search, type, status } = req.query;
        let sql = `SELECT * FROM locations WHERE 1=1`;
        const params = [];

        if (status && status !== 'ALL') {
            sql += ` AND status = ?`;
            params.push(status.toUpperCase());
        }

        if (type && type !== 'ALL') {
            sql += ` AND UPPER(type) = ?`;
            params.push(type.toUpperCase());
        }

        if (search && search.trim() !== '') {
            sql += ` AND (name LIKE ? OR barangay LIKE ? OR search_keywords LIKE ? OR address LIKE ? OR description LIKE ?)`;
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term, term);
        }

        sql += ` ORDER BY name ASC`;
        const locations = await query.all(sql, params);
        res.json(locations);
    } catch (err) {
        console.error('Error fetching admin locations:', err);
        res.status(500).json({ error: 'Failed to retrieve locations.' });
    }
});

// POST /api/admin/locations - Create a new location
router.post('/admin/locations', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, type, barangay, address, latitude, longitude, description, search_keywords, status = 'ACTIVE' } = req.body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Location name is required.' });
        }

        if (!type || !VALID_LOCATION_TYPES.includes(type.toUpperCase())) {
            return res.status(400).json({ 
                error: `Invalid location type. Must be one of: ${VALID_LOCATION_TYPES.join(', ')}` 
            });
        }

        let lat = null;
        let lng = null;
        if (latitude !== undefined && latitude !== null && latitude !== '') {
            lat = parseFloat(latitude);
            if (isNaN(lat) || lat < -90 || lat > 90) {
                return res.status(400).json({ error: 'Latitude must be a valid number between -90 and 90.' });
            }
        }

        if (longitude !== undefined && longitude !== null && longitude !== '') {
            lng = parseFloat(longitude);
            if (isNaN(lng) || lng < -180 || lng > 180) {
                return res.status(400).json({ error: 'Longitude must be a valid number between -180 and 180.' });
            }
        }

        const validStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

        const result = await query.run(
            `INSERT INTO locations (name, type, barangay, address, latitude, longitude, description, search_keywords, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name.trim(), 
                type.toUpperCase(), 
                barangay ? barangay.trim() : null, 
                address ? address.trim() : null, 
                lat, 
                lng, 
                description ? description.trim() : null, 
                search_keywords ? search_keywords.trim() : null, 
                validStatus
            ]
        );

        res.status(201).json({
            message: 'Location created successfully.',
            locationId: result.lastID
        });
    } catch (err) {
        console.error('Error creating location:', err);
        res.status(500).json({ error: 'Failed to create location.' });
    }
});

// PUT /api/admin/locations/:id - Update location
router.put('/admin/locations/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const locationId = parseInt(req.params.id, 10);
        if (isNaN(locationId)) {
            return res.status(400).json({ error: 'Invalid location ID format.' });
        }

        const { name, type, barangay, address, latitude, longitude, description, search_keywords, status } = req.body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Location name is required.' });
        }

        if (!type || !VALID_LOCATION_TYPES.includes(type.toUpperCase())) {
            return res.status(400).json({ 
                error: `Invalid location type. Must be one of: ${VALID_LOCATION_TYPES.join(', ')}` 
            });
        }

        let lat = null;
        let lng = null;
        if (latitude !== undefined && latitude !== null && latitude !== '') {
            lat = parseFloat(latitude);
            if (isNaN(lat) || lat < -90 || lat > 90) {
                return res.status(400).json({ error: 'Latitude must be a valid number between -90 and 90.' });
            }
        }

        if (longitude !== undefined && longitude !== null && longitude !== '') {
            lng = parseFloat(longitude);
            if (isNaN(lng) || lng < -180 || lng > 180) {
                return res.status(400).json({ error: 'Longitude must be a valid number between -180 and 180.' });
            }
        }

        const validStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

        // GAP-5: Verify location exists before updating
        const existing = await query.get(`SELECT id FROM locations WHERE id = ?`, [locationId]);
        if (!existing) {
            return res.status(404).json({ error: 'Location not found.' });
        }

        await query.run(
            `UPDATE locations SET
                name = ?,
                type = ?,
                barangay = ?,
                address = ?,
                latitude = ?,
                longitude = ?,
                description = ?,
                search_keywords = ?,
                status = ?,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                name.trim(), 
                type.toUpperCase(), 
                barangay ? barangay.trim() : null, 
                address ? address.trim() : null, 
                lat, 
                lng, 
                description ? description.trim() : null, 
                search_keywords ? search_keywords.trim() : null, 
                validStatus, 
                locationId
            ]
        );

        res.json({ message: 'Location updated successfully.' });
    } catch (err) {
        console.error('Error updating location:', err);
        res.status(500).json({ error: 'Failed to update location.' });
    }
});

// DELETE /api/admin/locations/:id - Delete location
router.delete('/admin/locations/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const locationId = parseInt(req.params.id, 10);
        // GAP-6: Guard against non-numeric IDs
        if (isNaN(locationId)) {
            return res.status(400).json({ error: 'Invalid location ID format.' });
        }
        // GAP-6: Verify location exists before deleting
        const existing = await query.get(`SELECT id FROM locations WHERE id = ?`, [locationId]);
        if (!existing) {
            return res.status(404).json({ error: 'Location not found.' });
        }
        await query.run(`DELETE FROM locations WHERE id = ?`, [locationId]);
        res.json({ message: 'Location deleted successfully.' });
    } catch (err) {
        console.error('Error deleting location:', err);
        res.status(500).json({ error: 'Failed to delete location.' });
    }
});

// ============================================================================
// ADMIN TRANSPORT MODES CRUD
// ============================================================================

// GET /api/admin/transport-modes - List all transport modes
router.get('/admin/transport-modes', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const modes = await query.all(`SELECT * FROM transport_modes ORDER BY id ASC`);
        res.json(modes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve transport modes.' });
    }
});

// POST /api/admin/transport-modes - Create new transport mode
router.post('/admin/transport-modes', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, description, icon, status = 'ACTIVE' } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Mode name is required.' });
        }

        const validStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
        const result = await query.run(
            `INSERT INTO transport_modes (name, description, icon, status) VALUES (?, ?, ?, ?)`,
            [name.trim(), description ? description.trim() : null, icon ? icon.trim() : 'bus', validStatus]
        );

        res.status(201).json({ message: 'Transport mode created.', modeId: result.lastID });
    } catch (err) {
        console.error('Error creating transport mode:', err);
        res.status(500).json({ error: 'Failed to create transport mode.' });
    }
});

// PUT /api/admin/transport-modes/:id - Update transport mode
router.put('/admin/transport-modes/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const modeId = parseInt(req.params.id, 10);
        // GAP-7: Guard against non-numeric IDs
        if (isNaN(modeId)) {
            return res.status(400).json({ error: 'Invalid transport mode ID format.' });
        }

        const { name, description, icon, status } = req.body;

        // GAP-7: Required-field guard — prevents name.trim() TypeError
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Mode name is required.' });
        }

        // GAP-7: Verify exists before updating
        const existing = await query.get(`SELECT id FROM transport_modes WHERE id = ?`, [modeId]);
        if (!existing) {
            return res.status(404).json({ error: 'Transport mode not found.' });
        }

        await query.run(
            `UPDATE transport_modes SET name = ?, description = ?, icon = ?, status = ? WHERE id = ?`,
            [name.trim(), description ? description.trim() : null, icon ? icon.trim() : null, status || 'ACTIVE', modeId]
        );

        res.json({ message: 'Transport mode updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update transport mode.' });
    }
});

// ============================================================================
// ADMIN BOAT ROUTE DETAILS CRUD
// ============================================================================

// GET /api/admin/boat-details - List all boat route details
router.get('/admin/boat-details', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const details = await query.all(
            `SELECT brd.*, r.route_name, orig.name AS origin_stop_name, dest.name AS destination_stop_name
             FROM boat_route_details brd
             JOIN routes r ON brd.route_id = r.id
             LEFT JOIN locations orig ON brd.origin_river_stop_id = orig.id
             LEFT JOIN locations dest ON brd.destination_river_stop_id = dest.id
             ORDER BY brd.id ASC`
        );
        res.json(details);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve boat route details.' });
    }
});

// GET /api/admin/routes/:id/boat-details - Get boat details for a specific route
router.get('/admin/routes/:id/boat-details', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseInt(req.params.id, 10);
        const details = await query.get(
            `SELECT brd.*, r.route_name, orig.name AS origin_stop_name, dest.name AS destination_stop_name
             FROM boat_route_details brd
             JOIN routes r ON brd.route_id = r.id
             LEFT JOIN locations orig ON brd.origin_river_stop_id = orig.id
             LEFT JOIN locations dest ON brd.destination_river_stop_id = dest.id
             WHERE brd.route_id = ?`,
            [routeId]
        );
        res.json(details || null);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve route boat details.' });
    }
});

// POST /api/admin/boat-details - Create or set boat details for a route
router.post('/admin/boat-details', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { route_id, waterway, origin_river_stop_id, destination_river_stop_id, operating_status = 'ACTIVE', notes } = req.body;

        if (!route_id) {
            return res.status(400).json({ error: 'route_id is required.' });
        }

        // Validate operating_status
        const validStatuses = ['ACTIVE', 'SUSPENDED', 'UNAVAILABLE'];
        if (!validStatuses.includes(operating_status)) {
            return res.status(400).json({ error: 'operating_status must be ACTIVE, SUSPENDED, or UNAVAILABLE.' });
        }

        // Verify origin and destination are RIVER_STOP if provided
        if (origin_river_stop_id) {
            const orig = await query.get(`SELECT id, type FROM locations WHERE id = ?`, [origin_river_stop_id]);
            if (!orig || orig.type !== 'RIVER_STOP') {
                return res.status(400).json({ error: 'origin_river_stop_id must refer to a location of type RIVER_STOP.' });
            }
        }

        if (destination_river_stop_id) {
            const dest = await query.get(`SELECT id, type FROM locations WHERE id = ?`, [destination_river_stop_id]);
            if (!dest || dest.type !== 'RIVER_STOP') {
                return res.status(400).json({ error: 'destination_river_stop_id must refer to a location of type RIVER_STOP.' });
            }
        }

        // Upsert into boat_route_details
        const existing = await query.get(`SELECT id FROM boat_route_details WHERE route_id = ?`, [route_id]);
        let id;
        if (existing) {
            await query.run(
                `UPDATE boat_route_details SET
                    waterway = ?,
                    origin_river_stop_id = ?,
                    destination_river_stop_id = ?,
                    operating_status = ?,
                    notes = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [waterway ? waterway.trim() : null, origin_river_stop_id || null, destination_river_stop_id || null, operating_status, notes ? notes.trim() : null, existing.id]
            );
            id = existing.id;
        } else {
            const result = await query.run(
                `INSERT INTO boat_route_details (route_id, waterway, origin_river_stop_id, destination_river_stop_id, operating_status, notes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [route_id, waterway ? waterway.trim() : null, origin_river_stop_id || null, destination_river_stop_id || null, operating_status, notes ? notes.trim() : null]
            );
            id = result.lastID;
        }

        // Resync route status with new boat operating status
        await syncRouteAdvisoryStatus(route_id);

        res.status(201).json({ message: 'Boat route details configured successfully.', id });
    } catch (err) {
        console.error('Error saving boat details:', err);
        res.status(500).json({ error: 'Failed to configure boat route details.' });
    }
});

// PUT /api/admin/boat-details/:id - Update boat route details
router.put('/admin/boat-details/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { waterway, origin_river_stop_id, destination_river_stop_id, operating_status, notes } = req.body;

        const current = await query.get(`SELECT route_id FROM boat_route_details WHERE id = ?`, [id]);
        if (!current) {
            return res.status(404).json({ error: 'Boat details not found.' });
        }

        const validStatuses = ['ACTIVE', 'SUSPENDED', 'UNAVAILABLE'];
        if (operating_status && !validStatuses.includes(operating_status)) {
            return res.status(400).json({ error: 'operating_status must be ACTIVE, SUSPENDED, or UNAVAILABLE.' });
        }

        if (origin_river_stop_id) {
            const orig = await query.get(`SELECT id, type FROM locations WHERE id = ?`, [origin_river_stop_id]);
            if (!orig || orig.type !== 'RIVER_STOP') {
                return res.status(400).json({ error: 'origin_river_stop_id must refer to a location of type RIVER_STOP.' });
            }
        }

        if (destination_river_stop_id) {
            const dest = await query.get(`SELECT id, type FROM locations WHERE id = ?`, [destination_river_stop_id]);
            if (!dest || dest.type !== 'RIVER_STOP') {
                return res.status(400).json({ error: 'destination_river_stop_id must refer to a location of type RIVER_STOP.' });
            }
        }

        await query.run(
            `UPDATE boat_route_details SET
                waterway = ?,
                origin_river_stop_id = ?,
                destination_river_stop_id = ?,
                operating_status = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [waterway ? waterway.trim() : null, origin_river_stop_id || null, destination_river_stop_id || null, operating_status || 'ACTIVE', notes ? notes.trim() : null, id]
        );

        await syncRouteAdvisoryStatus(current.route_id);

        res.json({ message: 'Boat details updated successfully.' });
    } catch (err) {
        console.error('Error updating boat details:', err);
        res.status(500).json({ error: 'Failed to update boat details.' });
    }
});

// DELETE /api/admin/boat-details/:id - Delete boat route details
router.delete('/admin/boat-details/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const current = await query.get(`SELECT route_id FROM boat_route_details WHERE id = ?`, [id]);
        await query.run(`DELETE FROM boat_route_details WHERE id = ?`, [id]);
        if (current) {
            await syncRouteAdvisoryStatus(current.route_id);
        }
        res.json({ message: 'Boat details deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete boat details.' });
    }
});

// ============================================================================
// ADMIN ROUTE SEGMENTS CRUD
// ============================================================================

// GET /api/admin/routes/:id/segments - List segments for a route
router.get('/admin/routes/:id/segments', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseInt(req.params.id, 10);
        const segments = await query.all(
            `SELECT rs.*, sl.name AS start_location_name, el.name AS end_location_name
             FROM route_segments rs
             LEFT JOIN locations sl ON rs.start_location_id = sl.id
             LEFT JOIN locations el ON rs.end_location_id = el.id
             WHERE rs.route_id = ?
             ORDER BY rs.segment_order ASC`,
            [routeId]
        );
        res.json(segments);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch route segments.' });
    }
});

// POST /api/admin/segments - Create route segment
router.post('/admin/segments', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { route_id, segment_order, mode, start_location_id, end_location_id, fare = 0, estimated_time = 0, notes } = req.body;

        if (!route_id || !mode || segment_order === undefined) {
            return res.status(400).json({ error: 'route_id, mode, and segment_order are required.' });
        }

        const fareVal = parseFloat(fare);
        if (isNaN(fareVal) || fareVal < 0) {
            return res.status(400).json({ error: 'Fare must be non-negative.' });
        }

        const timeVal = parseInt(estimated_time, 10);
        if (isNaN(timeVal) || timeVal < 0) {
            return res.status(400).json({ error: 'Estimated time must be non-negative.' });
        }

        const result = await query.run(
            `INSERT INTO route_segments (route_id, segment_order, mode, start_location_id, end_location_id, fare, estimated_time, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [route_id, parseInt(segment_order, 10), mode.trim(), start_location_id || null, end_location_id || null, fareVal, timeVal, notes ? notes.trim() : null]
        );

        res.status(201).json({ message: 'Route segment created.', segmentId: result.lastID });
    } catch (err) {
        console.error('Error creating segment:', err);
        res.status(500).json({ error: 'Failed to create segment.' });
    }
});

// PUT /api/admin/segments/:id - Update route segment
router.put('/admin/segments/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segmentId = parseInt(req.params.id, 10);
        const { segment_order, mode, start_location_id, end_location_id, fare, estimated_time, notes } = req.body;

        const fareVal = parseFloat(fare);
        if (fare !== undefined && (isNaN(fareVal) || fareVal < 0)) {
            return res.status(400).json({ error: 'Fare must be non-negative.' });
        }

        const timeVal = parseInt(estimated_time, 10);
        if (estimated_time !== undefined && (isNaN(timeVal) || timeVal < 0)) {
            return res.status(400).json({ error: 'Estimated time must be non-negative.' });
        }

        await query.run(
            `UPDATE route_segments SET
                segment_order = ?,
                mode = ?,
                start_location_id = ?,
                end_location_id = ?,
                fare = ?,
                estimated_time = ?,
                notes = ?
             WHERE id = ?`,
            [parseInt(segment_order, 10), mode ? mode.trim() : 'Walk', start_location_id || null, end_location_id || null, fareVal, timeVal, notes ? notes.trim() : null, segmentId]
        );

        res.json({ message: 'Segment updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update segment.' });
    }
});

// DELETE /api/admin/segments/:id - Delete route segment
router.delete('/admin/segments/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segmentId = parseInt(req.params.id, 10);
        await query.run(`DELETE FROM route_segments WHERE id = ?`, [segmentId]);
        res.json({ message: 'Segment deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete segment.' });
    }
});

// POST /api/admin/routes - Create new route
router.post('/admin/routes', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            route_name,
            transport_mode_id,
            origin,
            destination,
            estimated_time,
            detour_time,
            minimum_fare,
            maximum_fare,
            status = 'CLEAR',
            description,
            geometry
        } = req.body;

        if (!route_name || !transport_mode_id || !origin || !destination ||
            minimum_fare === undefined || minimum_fare === null || minimum_fare === '' ||
            maximum_fare === undefined || maximum_fare === null || maximum_fare === '' ||
            estimated_time === undefined || estimated_time === null || estimated_time === '') {
            return res.status(400).json({ error: 'Missing required route fields.' });
        }

        const parsedEstimatedTime = parseInt(estimated_time, 10);
        if (isNaN(parsedEstimatedTime) || parsedEstimatedTime <= 0) {
            return res.status(400).json({ error: 'estimated_time must be a positive integer (minutes).' });
        }

        const parsedMinFare = parseFloat(minimum_fare);
        if (isNaN(parsedMinFare) || parsedMinFare < 0) {
            return res.status(400).json({ error: 'minimum_fare must be a non-negative number.' });
        }

        const parsedMaxFare = parseFloat(maximum_fare);
        if (isNaN(parsedMaxFare) || parsedMaxFare < parsedMinFare) {
            return res.status(400).json({ error: 'maximum_fare must be a number greater than or equal to minimum_fare.' });
        }

        const VALID_ROUTE_STATUSES = ['CLEAR', 'DETOUR_ACTIVE', 'UNAVAILABLE', 'ADVISORY'];
        const routeStatus = status || 'CLEAR';
        if (!VALID_ROUTE_STATUSES.includes(routeStatus)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_ROUTE_STATUSES.join(', ')}` });
        }

        const geomString = geometry ? (typeof geometry === 'object' ? JSON.stringify(geometry) : geometry) : null;

        const result = await query.run(
            `INSERT INTO routes (
                route_name, transport_mode_id, origin, destination, estimated_time,
                detour_time, minimum_fare, maximum_fare, status, description, geometry
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                route_name.trim(),
                transport_mode_id,
                origin.trim(),
                destination.trim(),
                parsedEstimatedTime,
                detour_time ? parseInt(detour_time, 10) : null,
                parsedMinFare,
                parsedMaxFare,
                routeStatus,
                description ? description.trim() : null,
                geomString
            ]
        );

        // Seed default fares for this new route
        const minFare = parseFloat(minimum_fare);
        await query.run(`INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare) VALUES (?, 'REGULAR', ?, 0, ?)`, [result.lastID, minFare, minFare]);
        await query.run(`INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare) VALUES (?, 'STUDENT', ?, 20, ?)`, [result.lastID, minFare, Number((minFare * 0.8).toFixed(2))]);
        await query.run(`INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare) VALUES (?, 'SENIOR_CITIZEN', ?, 20, ?)`, [result.lastID, minFare, Number((minFare * 0.8).toFixed(2))]);
        await query.run(`INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare) VALUES (?, 'PWD', ?, 20, ?)`, [result.lastID, minFare, Number((minFare * 0.8).toFixed(2))]);

        res.status(201).json({
            message: 'Route created successfully.',
            routeId: result.lastID
        });
    } catch (err) {
        console.error('Error creating route:', err);
        res.status(500).json({ error: 'Failed to create route.' });
    }
});

// PUT /api/admin/routes/:id - Update route
router.put('/admin/routes/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseInt(req.params.id, 10);
        if (isNaN(routeId)) {
            return res.status(400).json({ error: 'Invalid route ID format.' });
        }

        const {
            route_name,
            transport_mode_id,
            origin,
            destination,
            estimated_time,
            detour_time,
            minimum_fare,
            maximum_fare,
            status,
            description,
            geometry
        } = req.body;

        // GAP-3: Validate required fields and numeric ranges
        if (!route_name || typeof route_name !== 'string' || route_name.trim() === '') {
            return res.status(400).json({ error: 'route_name is required.' });
        }
        if (!transport_mode_id) {
            return res.status(400).json({ error: 'transport_mode_id is required.' });
        }
        if (!origin || typeof origin !== 'string' || origin.trim() === '') {
            return res.status(400).json({ error: 'origin is required.' });
        }
        if (!destination || typeof destination !== 'string' || destination.trim() === '') {
            return res.status(400).json({ error: 'destination is required.' });
        }
        if (estimated_time === undefined || estimated_time === null || estimated_time === '') {
            return res.status(400).json({ error: 'estimated_time is required.' });
        }
        const parsedEstimatedTime = parseInt(estimated_time, 10);
        if (isNaN(parsedEstimatedTime) || parsedEstimatedTime <= 0) {
            return res.status(400).json({ error: 'estimated_time must be a positive integer (minutes).' });
        }
        if (minimum_fare === undefined || minimum_fare === null || minimum_fare === '') {
            return res.status(400).json({ error: 'minimum_fare is required.' });
        }
        const parsedMinFare = parseFloat(minimum_fare);
        if (isNaN(parsedMinFare) || parsedMinFare < 0) {
            return res.status(400).json({ error: 'minimum_fare must be a non-negative number.' });
        }
        if (maximum_fare === undefined || maximum_fare === null || maximum_fare === '') {
            return res.status(400).json({ error: 'maximum_fare is required.' });
        }
        const parsedMaxFare = parseFloat(maximum_fare);
        if (isNaN(parsedMaxFare) || parsedMaxFare < parsedMinFare) {
            return res.status(400).json({ error: 'maximum_fare must be a number greater than or equal to minimum_fare.' });
        }
        const VALID_ROUTE_STATUSES = ['CLEAR', 'DETOUR_ACTIVE', 'UNAVAILABLE', 'ADVISORY'];
        const routeStatus = status || 'CLEAR';
        if (!VALID_ROUTE_STATUSES.includes(routeStatus)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_ROUTE_STATUSES.join(', ')}` });
        }

        // GAP-1: Verify route exists before updating
        const existing = await query.get(`SELECT id FROM routes WHERE id = ?`, [routeId]);
        if (!existing) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const geomString = geometry !== undefined ? (geometry ? (typeof geometry === 'object' ? JSON.stringify(geometry) : geometry) : null) : undefined;

        if (geomString !== undefined) {
            await query.run(
                `UPDATE routes SET
                    route_name = ?,
                    transport_mode_id = ?,
                    origin = ?,
                    destination = ?,
                    estimated_time = ?,
                    detour_time = ?,
                    minimum_fare = ?,
                    maximum_fare = ?,
                    status = ?,
                    description = ?,
                    geometry = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    route_name.trim(),
                    transport_mode_id,
                    origin.trim(),
                    destination.trim(),
                    parsedEstimatedTime,
                    detour_time ? parseInt(detour_time, 10) : null,
                    parsedMinFare,
                    parsedMaxFare,
                    routeStatus,
                    description ? description.trim() : null,
                    geomString,
                    routeId
                ]
            );
        } else {
            await query.run(
                `UPDATE routes SET
                    route_name = ?,
                    transport_mode_id = ?,
                    origin = ?,
                    destination = ?,
                    estimated_time = ?,
                    detour_time = ?,
                    minimum_fare = ?,
                    maximum_fare = ?,
                    status = ?,
                    description = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    route_name.trim(),
                    transport_mode_id,
                    origin.trim(),
                    destination.trim(),
                    parsedEstimatedTime,
                    detour_time ? parseInt(detour_time, 10) : null,
                    parsedMinFare,
                    parsedMaxFare,
                    routeStatus,
                    description ? description.trim() : null,
                    routeId
                ]
            );
        }

        res.json({ message: 'Route updated successfully.' });
    } catch (err) {
        console.error('Error updating route:', err);
        res.status(500).json({ error: 'Failed to update route.' });
    }
});

// DELETE /api/admin/routes/:id - Delete route
router.delete('/admin/routes/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseInt(req.params.id, 10);
        if (isNaN(routeId)) {
            return res.status(400).json({ error: 'Invalid route ID format.' });
        }

        // GAP-2: Verify route exists before deleting
        const existing = await query.get(`SELECT id FROM routes WHERE id = ?`, [routeId]);
        if (!existing) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        await query.run(`DELETE FROM routes WHERE id = ?`, [routeId]);
        res.json({ message: 'Route deleted successfully.' });
    } catch (err) {
        console.error('Error deleting route:', err);
        res.status(500).json({ error: 'Failed to delete route.' });
    }
});


// GET /api/admin/routes/:id/stops - Stops for a route
router.get('/admin/routes/:id/stops', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stops = await query.all(
            `SELECT * FROM stops WHERE route_id = ? ORDER BY stop_order ASC`,
            [req.params.id]
        );
        res.json(stops);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stops.' });
    }
});

// POST /api/admin/stops - Create stop
router.post('/admin/stops', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { route_id, stop_name, stop_order, description, is_transfer_point, latitude, longitude } = req.body;
        
        if (!route_id || !stop_name || typeof stop_name !== 'string' || stop_name.trim() === '' || stop_order === undefined || stop_order === null) {
            return res.status(400).json({ error: 'route_id, stop_name, and stop_order are required.' });
        }

        const parsedStopOrder = parseInt(stop_order, 10);
        if (isNaN(parsedStopOrder) || parsedStopOrder < 0) {
            return res.status(400).json({ error: 'stop_order must be a valid non-negative integer.' });
        }

        const result = await query.run(
            `INSERT INTO stops (route_id, stop_name, stop_order, description, is_transfer_point, latitude, longitude)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [route_id, stop_name.trim(), parsedStopOrder, description, is_transfer_point ? 1 : 0, latitude || null, longitude || null]
        );
        res.status(201).json({ message: 'Stop added.', stopId: result.lastID });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create stop.' });
    }
});

// PUT /api/admin/stops/:id - Update stop
router.put('/admin/stops/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stopId = parseInt(req.params.id, 10);
        if (isNaN(stopId)) {
            return res.status(400).json({ error: 'Invalid stop ID format.' });
        }

        const { stop_name, stop_order, description, is_transfer_point, latitude, longitude } = req.body;
        if (!stop_name || typeof stop_name !== 'string' || stop_name.trim() === '' || stop_order === undefined || stop_order === null) {
            return res.status(400).json({ error: 'stop_name and stop_order are required.' });
        }

        const parsedStopOrder = parseInt(stop_order, 10);
        if (isNaN(parsedStopOrder) || parsedStopOrder < 0) {
            return res.status(400).json({ error: 'stop_order must be a valid non-negative integer.' });
        }

        const existing = await query.get(`SELECT id FROM stops WHERE id = ?`, [stopId]);
        if (!existing) {
            return res.status(404).json({ error: 'Stop not found.' });
        }

        await query.run(
            `UPDATE stops SET stop_name = ?, stop_order = ?, description = ?, is_transfer_point = ?, latitude = ?, longitude = ? WHERE id = ?`,
            [stop_name.trim(), parsedStopOrder, description, is_transfer_point ? 1 : 0, latitude || null, longitude || null, stopId]
        );
        res.json({ message: 'Stop updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update stop.' });
    }
});

// DELETE /api/admin/stops/:id - Delete stop
router.delete('/admin/stops/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stopId = parseInt(req.params.id, 10);
        if (isNaN(stopId)) {
            return res.status(400).json({ error: 'Invalid stop ID format.' });
        }

        const existing = await query.get(`SELECT id FROM stops WHERE id = ?`, [stopId]);
        if (!existing) {
            return res.status(404).json({ error: 'Stop not found.' });
        }

        await query.run(`DELETE FROM stops WHERE id = ?`, [stopId]);
        res.json({ message: 'Stop deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete stop.' });
    }
});

// GET /api/admin/routes/:id/steps - Steps for a route
router.get('/admin/routes/:id/steps', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const steps = await query.all(
            `SELECT * FROM route_steps WHERE route_id = ? ORDER BY step_number ASC`,
            [req.params.id]
        );
        res.json(steps);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch steps.' });
    }
});

// POST /api/admin/steps - Create step
router.post('/admin/steps', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { route_id, step_number, mode, instruction, location_info } = req.body;
        if (!route_id || step_number === undefined || step_number === null || !mode || !instruction || typeof instruction !== 'string' || instruction.trim() === '') {
            return res.status(400).json({ error: 'route_id, step_number, mode, and instruction are required.' });
        }

        const parsedStepNumber = parseInt(step_number, 10);
        if (isNaN(parsedStepNumber) || parsedStepNumber < 0) {
            return res.status(400).json({ error: 'step_number must be a valid non-negative integer.' });
        }

        const result = await query.run(
            `INSERT INTO route_steps (route_id, step_number, mode, instruction, location_info) VALUES (?, ?, ?, ?, ?)`,
            [route_id, parsedStepNumber, mode, instruction.trim(), location_info]
        );
        res.status(201).json({ message: 'Step added.', stepId: result.lastID });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add step.' });
    }
});

// PUT /api/admin/steps/:id - Update step
router.put('/admin/steps/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stepId = parseInt(req.params.id, 10);
        if (isNaN(stepId)) {
            return res.status(400).json({ error: 'Invalid step ID format.' });
        }

        const { step_number, mode, instruction, location_info } = req.body;
        if (!instruction || typeof instruction !== 'string' || instruction.trim() === '') {
            return res.status(400).json({ error: 'instruction is required.' });
        }

        const parsedStepNumber = step_number !== undefined && step_number !== null ? parseInt(step_number, 10) : 1;

        const existing = await query.get(`SELECT id FROM route_steps WHERE id = ?`, [stepId]);
        if (!existing) {
            return res.status(404).json({ error: 'Step not found.' });
        }

        await query.run(
            `UPDATE route_steps SET step_number = ?, mode = ?, instruction = ?, location_info = ? WHERE id = ?`,
            [parsedStepNumber, mode || 'Walk', instruction.trim(), location_info, stepId]
        );
        res.json({ message: 'Step updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update step.' });
    }
});

// DELETE /api/admin/steps/:id - Delete step
router.delete('/admin/steps/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stepId = parseInt(req.params.id, 10);
        if (isNaN(stepId)) {
            return res.status(400).json({ error: 'Invalid step ID format.' });
        }

        const existing = await query.get(`SELECT id FROM route_steps WHERE id = ?`, [stepId]);
        if (!existing) {
            return res.status(404).json({ error: 'Step not found.' });
        }

        await query.run(`DELETE FROM route_steps WHERE id = ?`, [stepId]);
        res.json({ message: 'Step deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete step.' });
    }
});

// GET /api/admin/routes/:id/fares - Fares for a route
router.get('/admin/routes/:id/fares', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const fares = await query.all(`SELECT * FROM fares WHERE route_id = ? ORDER BY id ASC`, [req.params.id]);
        res.json(fares);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch fares.' });
    }
});

// PUT /api/admin/fares/:id - Update fare record
router.put('/admin/fares/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const fareId = parseInt(req.params.id, 10);
        if (isNaN(fareId)) {
            return res.status(400).json({ error: 'Invalid fare ID format.' });
        }

        const { base_fare, discount_percentage } = req.body;
        if (base_fare === undefined || base_fare === null || base_fare === '') {
            return res.status(400).json({ error: 'base_fare is required.' });
        }
        if (discount_percentage === undefined || discount_percentage === null || discount_percentage === '') {
            return res.status(400).json({ error: 'discount_percentage is required.' });
        }

        const base = parseFloat(base_fare);
        const disc = parseFloat(discount_percentage);

        if (isNaN(base) || base < 0) {
            return res.status(400).json({ error: 'base_fare must be a non-negative number.' });
        }
        if (isNaN(disc) || disc < 0 || disc > 100) {
            return res.status(400).json({ error: 'discount_percentage must be a number between 0 and 100.' });
        }

        const existing = await query.get(`SELECT id FROM fares WHERE id = ?`, [fareId]);
        if (!existing) {
            return res.status(404).json({ error: 'Fare record not found.' });
        }

        const finalFare = Number((base * (1 - disc / 100)).toFixed(2));

        await query.run(
            `UPDATE fares SET base_fare = ?, discount_percentage = ?, final_fare = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [base, disc, finalFare, fareId]
        );
        res.json({ message: 'Fare updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update fare.' });
    }
});

// GET /api/admin/advisories - All advisories (Active & Inactive)
router.get('/admin/advisories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const advisories = await query.all(`SELECT * FROM advisories ORDER BY created_at DESC`);
        for (const adv of advisories) {
            const routes = await query.all(
                `SELECT r.id, r.route_name FROM routes r
                 JOIN advisory_routes ar ON r.id = ar.route_id
                 WHERE ar.advisory_id = ?`,
                [adv.id]
            );
            adv.routes = routes;
        }
        res.json(advisories);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch advisories.' });
    }
});

const VALID_ADVISORY_CONDITIONS = [
    'FLOODED', 'HIGH_TIDE', 'ROAD_CLOSURE', 'DETOUR', 
    'ROUTE_UNAVAILABLE', 'CLEAR', 'RIVER_TRANSPORT_SUSPENDED', 
    'RIVER_ADVISORY', 'ROUTE_CLEAR'
];

// POST /api/admin/advisories - Create advisory and link affected routes
router.post('/admin/advisories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, affected_road, condition, description, status = 'ACTIVE', route_ids = [] } = req.body;

        if (!title || typeof title !== 'string' || title.trim() === '' ||
            !affected_road || typeof affected_road !== 'string' || affected_road.trim() === '' ||
            !condition || typeof condition !== 'string' || condition.trim() === '' ||
            !description || typeof description !== 'string' || description.trim() === '') {
            return res.status(400).json({ error: 'Missing required advisory fields.' });
        }

        const normalizedCondition = condition.trim().toUpperCase();
        if (!VALID_ADVISORY_CONDITIONS.includes(normalizedCondition)) {
            return res.status(400).json({ 
                error: `Invalid condition. Must be one of: ${VALID_ADVISORY_CONDITIONS.join(', ')}` 
            });
        }

        const validStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

        const result = await query.run(
            `INSERT INTO advisories (title, affected_road, condition, description, status) VALUES (?, ?, ?, ?, ?)`,
            [title.trim(), affected_road.trim(), normalizedCondition, description.trim(), validStatus]
        );

        const advisoryId = result.lastID;

        // Link routes
        for (const rId of route_ids) {
            await query.run(`INSERT INTO advisory_routes (advisory_id, route_id) VALUES (?, ?)`, [advisoryId, rId]);
            await syncRouteAdvisoryStatus(rId);
        }

        res.status(201).json({ message: 'Advisory created successfully.', advisoryId });
    } catch (err) {
        console.error('Error creating advisory:', err);
        res.status(500).json({ error: 'Failed to create advisory.' });
    }
});

// PUT /api/admin/advisories/:id - Update advisory and affected routes
router.put('/admin/advisories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const advisoryId = parseInt(req.params.id, 10);
        if (isNaN(advisoryId)) {
            return res.status(400).json({ error: 'Invalid advisory ID format.' });
        }

        const { title, affected_road, condition, description, status, route_ids = [] } = req.body;

        if (!title || typeof title !== 'string' || title.trim() === '' ||
            !affected_road || typeof affected_road !== 'string' || affected_road.trim() === '' ||
            !description || typeof description !== 'string' || description.trim() === '') {
            return res.status(400).json({ error: 'title, affected_road, and description are required.' });
        }

        const normalizedCondition = condition ? condition.trim().toUpperCase() : 'FLOODED';
        if (!VALID_ADVISORY_CONDITIONS.includes(normalizedCondition)) {
            return res.status(400).json({ 
                error: `Invalid condition. Must be one of: ${VALID_ADVISORY_CONDITIONS.join(', ')}` 
            });
        }

        const existing = await query.get(`SELECT id FROM advisories WHERE id = ?`, [advisoryId]);
        if (!existing) {
            return res.status(404).json({ error: 'Advisory not found.' });
        }

        const validStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

        await query.run(
            `UPDATE advisories SET title = ?, affected_road = ?, condition = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [title.trim(), affected_road.trim(), normalizedCondition, description.trim(), validStatus, advisoryId]
        );

        // Get previously linked routes to resync later
        const previousLinks = await query.all(`SELECT route_id FROM advisory_routes WHERE advisory_id = ?`, [advisoryId]);

        // Replace route links
        await query.run(`DELETE FROM advisory_routes WHERE advisory_id = ?`, [advisoryId]);
        for (const rId of route_ids) {
            await query.run(`INSERT INTO advisory_routes (advisory_id, route_id) VALUES (?, ?)`, [advisoryId, rId]);
        }

        // Resync affected routes
        const allRoutesToSync = new Set([
            ...previousLinks.map(p => p.route_id),
            ...route_ids
        ]);
        for (const rId of allRoutesToSync) {
            await syncRouteAdvisoryStatus(rId);
        }

        res.json({ message: 'Advisory updated successfully.' });
    } catch (err) {
        console.error('Error updating advisory:', err);
        res.status(500).json({ error: 'Failed to update advisory.' });
    }
});

// POST /api/admin/advisories/:id/toggle-status - Toggle active/inactive
router.post('/admin/advisories/:id/toggle-status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const advisoryId = parseInt(req.params.id, 10);
        if (isNaN(advisoryId)) {
            return res.status(400).json({ error: 'Invalid advisory ID format.' });
        }

        const current = await query.get(`SELECT status FROM advisories WHERE id = ?`, [advisoryId]);

        if (!current) {
            return res.status(404).json({ error: 'Advisory not found.' });
        }

        const newStatus = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        await query.run(
            `UPDATE advisories SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newStatus, advisoryId]
        );

        // Resync all affected routes
        const linkedRoutes = await query.all(`SELECT route_id FROM advisory_routes WHERE advisory_id = ?`, [advisoryId]);
        for (const r of linkedRoutes) {
            await syncRouteAdvisoryStatus(r.route_id);
        }

        res.json({ message: `Advisory status updated to ${newStatus}.`, newStatus });
    } catch (err) {
        console.error('Error toggling advisory:', err);
        res.status(500).json({ error: 'Failed to toggle advisory status.' });
    }
});

// DELETE /api/admin/advisories/:id - Delete advisory
router.delete('/admin/advisories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const advisoryId = parseInt(req.params.id, 10);
        if (isNaN(advisoryId)) {
            return res.status(400).json({ error: 'Invalid advisory ID format.' });
        }

        const existing = await query.get(`SELECT id FROM advisories WHERE id = ?`, [advisoryId]);
        if (!existing) {
            return res.status(404).json({ error: 'Advisory not found.' });
        }

        const linkedRoutes = await query.all(`SELECT route_id FROM advisory_routes WHERE advisory_id = ?`, [advisoryId]);

        await query.run(`DELETE FROM advisories WHERE id = ?`, [advisoryId]);

        for (const r of linkedRoutes) {
            await syncRouteAdvisoryStatus(r.route_id);
        }

        res.json({ message: 'Advisory deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete advisory.' });
    }
});

// GET /api/admin/feedback - List all feedback
router.get('/admin/feedback', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const feedbackList = await query.all(`SELECT * FROM feedback ORDER BY created_at DESC`);
        res.json(feedbackList);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve feedback.' });
    }
});

// PUT /api/admin/feedback/:id/status - Update feedback status
router.put('/admin/feedback/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const feedbackId = parseInt(req.params.id, 10);
        if (isNaN(feedbackId)) {
            return res.status(400).json({ error: 'Invalid feedback ID format.' });
        }

        const { status } = req.body;
        if (!['NEW', 'REVIEWED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid feedback status.' });
        }

        const existing = await query.get(`SELECT id FROM feedback WHERE id = ?`, [feedbackId]);
        if (!existing) {
            return res.status(404).json({ error: 'Feedback not found.' });
        }

        await query.run(`UPDATE feedback SET status = ? WHERE id = ?`, [status, feedbackId]);
        res.json({ message: 'Feedback status updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update feedback status.' });
    }
});

// DELETE /api/admin/feedback/:id - Delete feedback
router.delete('/admin/feedback/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const feedbackId = parseInt(req.params.id, 10);
        if (isNaN(feedbackId)) {
            return res.status(400).json({ error: 'Invalid feedback ID format.' });
        }

        const existing = await query.get(`SELECT id FROM feedback WHERE id = ?`, [feedbackId]);
        if (!existing) {
            return res.status(404).json({ error: 'Feedback not found.' });
        }

        await query.run(`DELETE FROM feedback WHERE id = ?`, [feedbackId]);
        res.json({ message: 'Feedback deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete feedback.' });
    }
});

module.exports = router;
