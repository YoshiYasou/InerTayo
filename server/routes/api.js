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

// GET /api/landmarks - List reference landmarks with optional search
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

        // 1. Check local DB landmarks first
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
        const hasUnavailable = activeAdvisories.some(a => a.condition === 'ROAD_CLOSURE' || a.condition === 'ROUTE_UNAVAILABLE');
        if (hasUnavailable) {
            newStatus = 'UNAVAILABLE';
        } else {
            newStatus = 'DETOUR_ACTIVE';
        }
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
                r.status,
                r.description,
                r.created_at,
                r.updated_at
            FROM routes r
            JOIN transport_modes tm ON r.transport_mode_id = tm.id
            WHERE 1=1
        `;

        const params = [];

        // Filter by transport mode
        if (mode && mode !== 'All Modes' && mode !== 'ALL') {
            sql += ` AND LOWER(tm.name) = LOWER(?)`;
            params.push(mode);
        }

        // Search query (matches route name, origin, destination, description, or connected stops)
        if (search && search.trim() !== '') {
            const term = `%${search.trim()}%`;
            sql += ` AND (
                r.route_name LIKE ? OR 
                r.origin LIKE ? OR 
                r.destination LIKE ? OR 
                r.description LIKE ? OR
                r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?)
            )`;
            params.push(term, term, term, term, term);
        }

        // FROM / TO specific filtering if passed
        if (from && from.trim() !== '') {
            const termFrom = `%${from.trim()}%`;
            sql += ` AND (r.origin LIKE ? OR r.route_name LIKE ? OR r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?))`;
            params.push(termFrom, termFrom, termFrom);
        }

        if (to && to.trim() !== '') {
            const termTo = `%${to.trim()}%`;
            sql += ` AND (r.destination LIKE ? OR r.route_name LIKE ? OR r.id IN (SELECT route_id FROM stops WHERE stop_name LIKE ?))`;
            params.push(termTo, termTo, termTo);
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
                r.status,
                r.description,
                r.created_at,
                r.updated_at
            FROM routes r
            JOIN transport_modes tm ON r.transport_mode_id = tm.id
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
            alternativeRoutes
        });
    } catch (err) {
        console.error('Error fetching route details:', err);
        res.status(500).json({ error: 'Failed to retrieve route details.' });
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

        // Try to match a known route for FROM and TO
        let matchingRoute = null;
        if (from && to) {
            const fromTerm = `%${from.trim()}%`;
            const toTerm = `%${to.trim()}%`;
            matchingRoute = await query.get(
                `SELECT r.*, tm.name as mode_name
                 FROM routes r
                 JOIN transport_modes tm ON r.transport_mode_id = tm.id
                 WHERE (r.origin LIKE ? OR r.route_name LIKE ?) AND (r.destination LIKE ? OR r.route_name LIKE ?)
                 LIMIT 1`,
                [fromTerm, fromTerm, toTerm, toTerm]
            );
        }

        let legs = [];
        let totalEstimatedFare = 0;

        if (matchingRoute) {
            // Retrieve DB fare record for passenger type if available
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
        } else {
            // Multi-leg Dagupan calculation matching Page 6 design mockup
            // Leg 1: Jeepney: Bonuan – Dagupan (Base 12.00)
            const leg1Base = 12.00;
            const leg1Final = discountPercentage > 0 ? Number((leg1Base * (1 - discountPercentage / 100)).toFixed(2)) : leg1Base;

            // Leg 2: Tricycle: Dagupan Plaza – Bonuan Beach (Base 8.00)
            const leg2Base = 8.00;
            const leg2Final = discountPercentage > 0 ? Number((leg2Base * (1 - discountPercentage / 100)).toFixed(2)) : leg2Base;

            // Leg 3: Walk: Terminal to Stop (Free)
            legs = [
                {
                    mode: 'Jeepney',
                    instruction: 'Jeepney: Bonuan – Dagupan',
                    baseFare: leg1Base,
                    discountPercent: discountPercentage,
                    finalFare: leg1Final,
                    isFree: false
                },
                {
                    mode: 'Tricycle',
                    instruction: 'Tricycle: Dagupan Plaza – Bonuan Beach',
                    baseFare: leg2Base,
                    discountPercent: discountPercentage,
                    finalFare: leg2Final,
                    isFree: false
                },
                {
                    mode: 'Walk',
                    instruction: 'Walk: Terminal to Stop',
                    baseFare: 0,
                    discountPercent: 0,
                    finalFare: 0,
                    isFree: true
                }
            ];

            totalEstimatedFare = Number((leg1Final + leg2Final).toFixed(2));
        }

        res.json({
            passengerType: normalizedType,
            discountPercentage,
            legs,
            totalEstimatedFare,
            disclaimer: 'Fare estimates are based on project/sample route data and configured discount rules. They are not officially verified municipal rates and may vary.'
        });
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

        const passwordHash = await bcrypt.hash(password, 10);

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

        res.json({
            totalRoutes: totalRoutes.count,
            activeAdvisories: activeAdvisories.count,
            totalStops: totalStops.count,
            pendingFeedback: pendingFeedback.count
        });
    } catch (err) {
        console.error('Error fetching admin stats:', err);
        res.status(500).json({ error: 'Failed to retrieve admin stats.' });
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
            description
        } = req.body;

        if (!route_name || !transport_mode_id || !origin || !destination || !estimated_time || !minimum_fare || !maximum_fare) {
            return res.status(400).json({ error: 'Missing required route fields.' });
        }

        const result = await query.run(
            `INSERT INTO routes (
                route_name, transport_mode_id, origin, destination, estimated_time,
                detour_time, minimum_fare, maximum_fare, status, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                route_name.trim(),
                transport_mode_id,
                origin.trim(),
                destination.trim(),
                parseInt(estimated_time, 10),
                detour_time ? parseInt(detour_time, 10) : null,
                parseFloat(minimum_fare),
                parseFloat(maximum_fare),
                status,
                description ? description.trim() : null
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
            description
        } = req.body;

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
                parseInt(estimated_time, 10),
                detour_time ? parseInt(detour_time, 10) : null,
                parseFloat(minimum_fare),
                parseFloat(maximum_fare),
                status,
                description ? description.trim() : null,
                routeId
            ]
        );

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
        const result = await query.run(
            `INSERT INTO stops (route_id, stop_name, stop_order, description, is_transfer_point, latitude, longitude)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [route_id, stop_name.trim(), parseInt(stop_order, 10), description, is_transfer_point ? 1 : 0, latitude || null, longitude || null]
        );
        res.status(201).json({ message: 'Stop added.', stopId: result.lastID });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create stop.' });
    }
});

// PUT /api/admin/stops/:id - Update stop
router.put('/admin/stops/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { stop_name, stop_order, description, is_transfer_point, latitude, longitude } = req.body;
        await query.run(
            `UPDATE stops SET stop_name = ?, stop_order = ?, description = ?, is_transfer_point = ?, latitude = ?, longitude = ? WHERE id = ?`,
            [stop_name.trim(), parseInt(stop_order, 10), description, is_transfer_point ? 1 : 0, latitude || null, longitude || null, req.params.id]
        );
        res.json({ message: 'Stop updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update stop.' });
    }
});

// DELETE /api/admin/stops/:id - Delete stop
router.delete('/admin/stops/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await query.run(`DELETE FROM stops WHERE id = ?`, [req.params.id]);
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
        const result = await query.run(
            `INSERT INTO route_steps (route_id, step_number, mode, instruction, location_info) VALUES (?, ?, ?, ?, ?)`,
            [route_id, parseInt(step_number, 10), mode, instruction.trim(), location_info]
        );
        res.status(201).json({ message: 'Step added.', stepId: result.lastID });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add step.' });
    }
});

// PUT /api/admin/steps/:id - Update step
router.put('/admin/steps/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { step_number, mode, instruction, location_info } = req.body;
        await query.run(
            `UPDATE route_steps SET step_number = ?, mode = ?, instruction = ?, location_info = ? WHERE id = ?`,
            [parseInt(step_number, 10), mode, instruction.trim(), location_info, req.params.id]
        );
        res.json({ message: 'Step updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update step.' });
    }
});

// DELETE /api/admin/steps/:id - Delete step
router.delete('/admin/steps/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await query.run(`DELETE FROM route_steps WHERE id = ?`, [req.params.id]);
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
        const { base_fare, discount_percentage } = req.body;
        const base = parseFloat(base_fare);
        const disc = parseFloat(discount_percentage);
        const finalFare = Number((base * (1 - disc / 100)).toFixed(2));

        await query.run(
            `UPDATE fares SET base_fare = ?, discount_percentage = ?, final_fare = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [base, disc, finalFare, req.params.id]
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

// POST /api/admin/advisories - Create advisory and link affected routes
router.post('/admin/advisories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, affected_road, condition, description, status = 'ACTIVE', route_ids = [] } = req.body;

        if (!title || !affected_road || !condition || !description) {
            return res.status(400).json({ error: 'Missing required advisory fields.' });
        }

        const result = await query.run(
            `INSERT INTO advisories (title, affected_road, condition, description, status) VALUES (?, ?, ?, ?, ?)`,
            [title.trim(), affected_road.trim(), condition, description.trim(), status]
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
        const { title, affected_road, condition, description, status, route_ids = [] } = req.body;

        await query.run(
            `UPDATE advisories SET title = ?, affected_road = ?, condition = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [title.trim(), affected_road.trim(), condition, description.trim(), status, advisoryId]
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
        const { status } = req.body;
        if (!['NEW', 'REVIEWED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid feedback status.' });
        }
        await query.run(`UPDATE feedback SET status = ? WHERE id = ?`, [status, req.params.id]);
        res.json({ message: 'Feedback status updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update feedback status.' });
    }
});

// DELETE /api/admin/feedback/:id - Delete feedback
router.delete('/admin/feedback/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await query.run(`DELETE FROM feedback WHERE id = ?`, [req.params.id]);
        res.json({ message: 'Feedback deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete feedback.' });
    }
});

module.exports = router;
