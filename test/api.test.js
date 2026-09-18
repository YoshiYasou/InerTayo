require('dotenv').config();
const http = require('http');
const app = require('../server/server');
const { seed } = require('../server/db/seed');

let server;
let baseUrl;

function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, data: parsed, headers: res.headers });
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('====================================================');
    console.log('  Starting InerTayo Comprehensive Automated Tests   ');
    console.log('====================================================');

    // Re-seed DB to clean slate
    await seed();

    // Start ephemeral test server on random port
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Test server running at ${baseUrl}\n`);

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✓ PASS: ${message}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${message}`);
            failed++;
        }
    }

    try {
        // -------------------------------------------------------------
        // 1. PUBLIC COMMUTER ENDPOINTS
        // -------------------------------------------------------------
        console.log('\n[1. Public Commuter Endpoints]');

        // Health Check
        const health = await makeRequest('GET', '/api/health');
        assert(health.status === 200 && health.data.status === 'OK', 'Health check returns 200 OK');

        // Transport Modes
        const modesRes = await makeRequest('GET', '/api/transport-modes');
        assert(modesRes.status === 200 && modesRes.data.length >= 3, 'Fetches transport modes (Jeepney, Bus, Tricycle)');

        // Routes list (6 land routes + 1 sample boat route)
        const routesRes = await makeRequest('GET', '/api/routes');
        assert(routesRes.status === 200 && routesRes.data.length === 7, 'Fetches all 7 seeded Dagupan routes (6 land + 1 sample boat)');

        // Filter by mode
        const jeepRes = await makeRequest('GET', '/api/routes?mode=Jeepney');
        assert(
            jeepRes.status === 200 && jeepRes.data.every(r => r.mode_name === 'Jeepney'),
            'Filter by Jeepney returns only jeepney routes'
        );

        // Substring / Landmark search
        const searchRes = await makeRequest('GET', '/api/routes?search=CSI');
        assert(
            searchRes.status === 200 && searchRes.data.some(r => r.route_name.includes('CSI')),
            'Search for "CSI" successfully finds CSI Mall Loop'
        );

        // Sort by cheapest fare
        const sortCheapest = await makeRequest('GET', '/api/routes?sort=cheapest');
        assert(
            sortCheapest.data[0].minimum_fare <= sortCheapest.data[sortCheapest.data.length - 1].minimum_fare,
            'Sort by cheapest orders routes by minimum fare ascending'
        );

        // Sort by fastest travel time (respecting advisory detour time per §0.5)
        const sortFastest = await makeRequest('GET', '/api/routes?sort=fastest');
        assert(
            sortFastest.data[0].active_travel_time <= sortFastest.data[sortFastest.data.length - 1].active_travel_time,
            'Sort by fastest orders routes by active travel time ascending'
        );

        // Route details & steps
        const bonuanRoute = routesRes.data.find(r => r.route_name.includes('Bonuan Beach'));
        const r1Res = await makeRequest('GET', `/api/routes/${bonuanRoute.id}`);
        assert(
            r1Res.status === 200 && r1Res.data.steps && r1Res.data.steps.length >= 4,
            'Route details includes step-by-step commute directions'
        );
        assert(
            r1Res.data.steps[0].instruction === 'Walk to Bonuan Terminal',
            'Route 1 Step 1 instruction matches Dagupan spec'
        );

        // Advisory detour travel time recalculation per §0.5
        const detourRoute = routesRes.data.find(r => r.route_name.includes('Calasiao'));
        assert(
            detourRoute && detourRoute.status === 'DETOUR_ACTIVE' && detourRoute.active_travel_time === 30,
            'Route with active advisory reports increased travel time (30 mins vs 15 mins base)'
        );

        // Advisories endpoint
        const advRes = await makeRequest('GET', '/api/advisories');
        assert(
            advRes.status === 200 && advRes.data.length > 0 && advRes.data[0].affected_routes.length === 3,
            'Active advisories list correctly links affected routes'
        );

        // Landmarks endpoint (Map Addendum §3)
        const landmarksRes = await makeRequest('GET', '/api/landmarks');
        assert(
            landmarksRes.status === 200 && landmarksRes.data.length >= 10,
            'Fetches Dagupan reference landmarks (10+ locations seeded)'
        );

        // Search landmark
        const searchLm = await makeRequest('GET', '/api/landmarks?search=SM+Center');
        assert(
            searchLm.status === 200 && searchLm.data.length > 0 && searchLm.data[0].name.includes('SM Center'),
            'Landmark search finds SM Center Dagupan'
        );

        // Geocoding endpoint with DB caching (Map Addendum §1, §3)
        const geocodeRes = await makeRequest('GET', '/api/geocode?query=CSI+Mall');
        assert(
            geocodeRes.status === 200 && typeof geocodeRes.data.latitude === 'number' && typeof geocodeRes.data.longitude === 'number',
            'Geocoding endpoint resolves valid coordinates for Dagupan landmark'
        );

        // Verify stop coordinates exist for Leaflet mapping (Map Addendum §3, §4)
        assert(
            r1Res.data.stops && r1Res.data.stops.every(s => typeof s.latitude === 'number' && typeof s.longitude === 'number'),
            'Route stops contain valid decimal latitude and longitude for Leaflet mapping'
        );

        // GeoJSON Route Geometry and Endpoint
        assert(
            r1Res.data.geometry && typeof r1Res.data.geometry === 'string' && JSON.parse(r1Res.data.geometry).type === 'LineString',
            'Route details includes valid GeoJSON LineString geometry string'
        );

        const geojsonRes = await makeRequest('GET', `/api/routes/${bonuanRoute.id}/geojson`);
        assert(
            geojsonRes.status === 200 && geojsonRes.data.type === 'Feature' && geojsonRes.data.geometry.type === 'LineString' && Array.isArray(geojsonRes.data.geometry.coordinates),
            'GET /api/routes/:id/geojson returns RFC 7946 GeoJSON Feature with LineString geometry'
        );

        // Locations registry (Phase 3 & Advanced Mapping)
        const locsRes = await makeRequest('GET', '/api/locations');
        assert(
            locsRes.status === 200 && locsRes.data.length >= 24,
            'GET /api/locations returns seeded Dagupan locations registry (24 entries)'
        );

        const riverStops = await makeRequest('GET', '/api/locations?type=RIVER_STOP');
        assert(
            riverStops.status === 200 && riverStops.data.length === 2 && riverStops.data.every(l => l.type === 'RIVER_STOP'),
            'GET /api/locations?type=RIVER_STOP filters to river stop docks'
        );

        const singleLoc = await makeRequest('GET', `/api/locations/${riverStops.data[0].id}`);
        assert(
            singleLoc.status === 200 && singleLoc.data.id === riverStops.data[0].id && Array.isArray(singleLoc.data.available_routes),
            'GET /api/locations/:id returns location detail with available_routes'
        );

        // Boat route attributes in public list
        const boatRoute = routesRes.data.find(r => r.mode_name === 'Boat');
        assert(
            boatRoute && boatRoute.waterway === 'Pantal River' && boatRoute.boat_operating_status === 'ACTIVE',
            'GET /api/routes includes boat route with waterway and boat operating status'
        );

        // -------------------------------------------------------------
        // 2. FARE CALCULATOR ENDPOINTS (§0.2, §12)
        // -------------------------------------------------------------
        console.log('\n[2. Fare Calculator Verification]');

        // Regular fare (0% discount)
        const fareReg = await makeRequest('POST', '/api/fare-calculator', {
            from: 'Bonuan Beach',
            to: 'Dagupan Plaza',
            passengerType: 'REGULAR'
        });
        assert(
            fareReg.status === 200 && fareReg.data.totalEstimatedFare === 20.00,
            'Regular fare correctly totals ₱20.00 without discount'
        );

        // Student fare (20% discount)
        const fareStudent = await makeRequest('POST', '/api/fare-calculator', {
            from: 'Bonuan Beach',
            to: 'Dagupan Plaza',
            passengerType: 'STUDENT'
        });
        assert(
            fareStudent.status === 200 && fareStudent.data.totalEstimatedFare === 16.00,
            'Student fare correctly applies 20% discount (₱16.00)'
        );

        // Boat fare calculation for river crossing
        const fareBoat = await makeRequest('POST', '/api/fare-calculator', {
            from: 'Pantal River Dock (Downtown Side)',
            to: 'Pantal River Dock (Bonuan Side)',
            passengerType: 'REGULAR'
        });
        assert(
            fareBoat.status === 200 && fareBoat.data.totalEstimatedFare === 20.00 && fareBoat.data.legs.some(l => l.mode === 'Boat'),
            'Fare calculator accurately computes boat fare for river crossing'
        );

        // Disclaimer check per §0.2 (must NOT claim official municipal or cite bogus RA 10687)
        assert(
            !fareStudent.data.disclaimer.includes('RA 10687') && !fareStudent.data.disclaimer.includes('Official Municipal'),
            'Fare disclaimer removes false statutory citations and uses neutral framing per §0.2'
        );

        // -------------------------------------------------------------
        // 3. COMMUTER AUTHENTICATION & SAVED ROUTES (§0.8, §19)
        // -------------------------------------------------------------
        console.log('\n[3. Commuter Authentication & Saved Routes]');

        // Register new commuter
        const regRes = await makeRequest('POST', '/api/auth/register', {
            username: 'testcommuter',
            email: 'test@dagupan.ph',
            password: 'Password123!'
        });
        assert(regRes.status === 201 && regRes.data.token, 'New commuter registration succeeds and returns JWT');
        const commuterToken = regRes.data.token;

        // Login existing commuter
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: 'commuter',
            password: 'Commuter123!'
        });
        assert(loginRes.status === 200 && loginRes.data.user.role === 'COMMUTER', 'Commuter login succeeds with correct COMMUTER role');
        const defaultCommuterToken = loginRes.data.token;

        // Save route toggle for authenticated commuter
        const saveToggleRes = await makeRequest('POST', `/api/routes/${routesRes.data[1].id}/save`, null, {
            'Authorization': `Bearer ${defaultCommuterToken}`
        });
        assert(saveToggleRes.status === 200 && typeof saveToggleRes.data.saved === 'boolean', 'Commuter can toggle route bookmark');

        // Retrieve saved routes
        const savedListRes = await makeRequest('GET', '/api/saved-routes', null, {
            'Authorization': `Bearer ${defaultCommuterToken}`
        });
        assert(savedListRes.status === 200 && Array.isArray(savedListRes.data), 'Fetches commuter saved routes list');

        // Guest attempting to save route is rejected
        const guestSaveRes = await makeRequest('POST', `/api/routes/${routesRes.data[0].id}/save`);
        assert(guestSaveRes.status === 401, 'Guest route save attempt is rejected with 401 Unauthorized');

        // Submit feedback
        const feedbackRes = await makeRequest('POST', '/api/feedback', {
            name: 'Dagupan Rider',
            email: 'rider@dagupan.ph',
            message: 'Tricycle terminal at Lucao was very efficient this morning.'
        });
        assert(feedbackRes.status === 201, 'Commuter feedback submission succeeds');

        // -------------------------------------------------------------
        // 4. SECURITY & AUTHORIZATION (§19, §20 — VAPT Test Cases)
        // -------------------------------------------------------------
        console.log('\n[4. Security & Role Authorization — VAPT Test Cases]');

        // ── Test 4.1: SQL Injection defence (parameterized queries)
        // Attack: inject a tautology via the search query parameter.
        // Expected: safe execution returning a normal (possibly empty) array —
        // no 500 error, no database syntax error, no data exfiltration.
        const sqliRes = await makeRequest('GET', "/api/routes?search=' OR '1'='1");
        assert(
            sqliRes.status === 200 && Array.isArray(sqliRes.data),
            'SQL injection payload in search safely parameterized without database syntax error'
        );

        // ── Test 4.2: No JWT → 401 Unauthorized (unauthenticated admin access)
        const noAuthAdmin = await makeRequest('GET', '/api/admin/stats');
        assert(noAuthAdmin.status === 401, 'Accessing /api/admin/stats without token returns 401 Unauthorized');

        // ── Test 4.3: Broken Function-Level Authorization (privilege escalation)
        // Attack: a valid COMMUTER JWT attempts a POST to an ADMIN-only endpoint.
        // Expected: 403 Forbidden — correct role is enforced by requireAdmin middleware.
        // NOTE: this is distinct from BOLA — this is same-credential trying a higher-privilege action.
        const commuterAdmin = await makeRequest('GET', '/api/admin/stats', null, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(commuterAdmin.status === 403, 'Commuter role accessing admin endpoint returns 403 Forbidden (Broken Function-Level Auth)');

        const commuterPostAdmin = await makeRequest('POST', '/api/admin/routes', {
            route_name: 'Injected Route',
            transport_mode_id: 1,
            origin: 'Hacker',
            destination: 'City',
            estimated_time: 10,
            minimum_fare: 1,
            maximum_fare: 2
        }, { 'Authorization': `Bearer ${commuterToken}` });
        assert(commuterPostAdmin.status === 403, 'Commuter cannot POST to /api/admin/routes — 403 Forbidden');

        // ── Test 4.4: BOLA/IDOR — cross-user saved-routes access
        // Setup: register a second commuter (Commuter B) to get a distinct user ID.
        const regB = await makeRequest('POST', '/api/auth/register', {
            username: 'commuterB',
            email: 'commuterb@dagupan.ph',
            password: 'CommuterB123!'
        });
        assert(regB.status === 201 && regB.data.token, 'Commuter B registration succeeds (BOLA test setup)');
        const userB = regB.data.user;

        // Attack: Commuter A (defaultCommuterToken) requests Commuter B's saved routes
        // by substituting B's ID into the path parameter.
        const bolaAttack = await makeRequest('GET', `/api/users/${userB.id}/saved-routes`, null, {
            'Authorization': `Bearer ${defaultCommuterToken}`
        });
        assert(
            bolaAttack.status === 403,
            `BOLA/IDOR: Commuter A's JWT requesting Commuter B's saved routes (id=${userB.id}) returns 403 Forbidden`
        );

        // ── Test 4.5: BOLA/IDOR — self-access is permitted
        // Commuter A accesses their *own* saved-routes via the path-parameterised endpoint.
        const loginA = await makeRequest('POST', '/api/auth/login', {
            username: 'commuter',
            password: 'Commuter123!'
        });
        const userA = loginA.data.user;
        const selfAccess = await makeRequest('GET', `/api/users/${userA.id}/saved-routes`, null, {
            'Authorization': `Bearer ${defaultCommuterToken}`
        });
        assert(
            selfAccess.status === 200 && Array.isArray(selfAccess.data),
            'BOLA/IDOR: Commuter accessing their own saved routes via /api/users/:id/saved-routes returns 200 OK'
        );

        // ── Test 4.6: Rate limiting — auth endpoint throttle (5 req / 60 s → 429)
        // The main test suite runs with NODE_ENV=test (rate-limiter skip=true).
        // We validate 429 by launching a second isolated server whose fresh
        // in-memory rate-limit store is completely independent of the main server.
        // NODE_ENV is temporarily cleared so the skip() lambda returns false.
        {
            const savedEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = '';  // activate rate limiter (skip returns false)

            // Bust the module cache so a fresh app (with its own rate-limit store) loads
            Object.keys(require.cache).forEach(k => { delete require.cache[k]; });
            const rlApp = require('../server/server');
            const rlServer = rlApp.listen(0);
            const rlPort = rlServer.address().port;
            const rlBase = `http://127.0.0.1:${rlPort}`;

            function makeRlReq(method, path, body) {
                return new Promise((resolve, reject) => {
                    const url = new URL(path, rlBase);
                    const opts = {
                        method,
                        hostname: url.hostname,
                        port: url.port,
                        path: url.pathname + url.search,
                        headers: { 'Content-Type': 'application/json' }
                    };
                    const r = http.request(opts, (res) => {
                        let d = '';
                        res.on('data', c => { d += c; });
                        res.on('end', () => {
                            let parsed; try { parsed = JSON.parse(d); } catch (e) { parsed = d; }
                            resolve({ status: res.statusCode, data: parsed });
                        });
                    });
                    r.on('error', reject);
                    if (body) r.write(JSON.stringify(body));
                    r.end();
                });
            }

            const badCreds = { username: 'nonexistent_ratelimit_user', password: 'wrongpass' };
            let rateLimitHit = false;
            for (let i = 0; i < 6; i++) {
                const r = await makeRlReq('POST', '/api/auth/login', badCreds);
                if (r.status === 429) { rateLimitHit = true; break; }
            }

            rlServer.close();

            // Restore main app via module cache rebuild
            Object.keys(require.cache).forEach(k => { delete require.cache[k]; });
            process.env.NODE_ENV = savedEnv;

            assert(rateLimitHit, 'Rate limiter returns 429 Too Many Requests after 5 failed auth attempts in 60 seconds');
        }

        // -------------------------------------------------------------
        // 5. ADMIN MANAGEMENT & DATA PROPAGATION (§18, §21)
        // -------------------------------------------------------------
        console.log('\n[5. Administrator Operations & Live Data Propagation]');

        // Admin login
        const adminLogin = await makeRequest('POST', '/api/auth/login', {
            username: 'admin',
            password: 'AdminPassword123!'
        });
        assert(adminLogin.status === 200 && adminLogin.data.user.role === 'ADMIN', 'Admin login succeeds with ADMIN role');
        const adminToken = adminLogin.data.token;

        // Admin stats
        const adminStats = await makeRequest('GET', '/api/admin/stats', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(adminStats.status === 200 && adminStats.data.totalRoutes === 7, 'Admin stats retrieves accurate metrics');

        // Admin creates a new route with GeoJSON geometry
        const sampleGeom = JSON.stringify({
            type: 'LineString',
            coordinates: [[120.334, 16.043], [120.340, 16.050]]
        });
        const createRouteRes = await makeRequest('POST', '/api/admin/routes', {
            route_name: 'Downtown – Binloc Loop',
            transport_mode_id: modesRes.data[0].id,
            origin: 'Downtown Plaza',
            destination: 'Binloc Beach',
            estimated_time: 22,
            detour_time: 35,
            minimum_fare: 15.00,
            maximum_fare: 30.00,
            status: 'CLEAR',
            description: 'New test loop line.',
            geometry: sampleGeom
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(createRouteRes.status === 201 && createRouteRes.data.routeId, 'Admin successfully creates a new route with GeoJSON geometry');
        const newRouteId = createRouteRes.data.routeId;

        // Verify propagation to public route list and GeoJSON geometry (7 seeded + 1 new = 8)
        const updatedRoutes = await makeRequest('GET', '/api/routes');
        const createdRouteInList = updatedRoutes.data.find(r => r.id === newRouteId);
        assert(
            updatedRoutes.data.length === 8 && createdRouteInList && createdRouteInList.geometry === sampleGeom,
            'New route immediately appears in public commuter route directory with GeoJSON geometry'
        );

        // Admin updates route geometry
        const updatedGeom = JSON.stringify({
            type: 'LineString',
            coordinates: [[120.334, 16.043], [120.342, 16.052], [120.350, 16.060]]
        });
        const updateRouteRes = await makeRequest('PUT', `/api/admin/routes/${newRouteId}`, {
            route_name: 'Downtown – Binloc Loop (Extended)',
            transport_mode_id: modesRes.data[0].id,
            origin: 'Downtown Plaza',
            destination: 'Binloc Beach East',
            estimated_time: 25,
            minimum_fare: 15.00,
            maximum_fare: 30.00,
            status: 'CLEAR',
            geometry: updatedGeom
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(updateRouteRes.status === 200, 'Admin successfully updates route geometry');

        // Admin toggles advisory status
        const advisoryToToggle = advRes.data[0];
        const toggleRes = await makeRequest('POST', `/api/admin/advisories/${advisoryToToggle.id}/toggle-status`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(toggleRes.status === 200 && toggleRes.data.newStatus === 'INACTIVE', 'Admin deactivates high tide advisory');

        // Verify that previously affected route reverts status to CLEAR
        const resyncedRoute = await makeRequest('GET', `/api/routes/${detourRoute.id}`);
        assert(
            resyncedRoute.data.status === 'CLEAR',
            'Route status immediately reverts to CLEAR upon advisory deactivation'
        );

        // Re-activate advisory
        await makeRequest('POST', `/api/admin/advisories/${advisoryToToggle.id}/toggle-status`, null, {
            'Authorization': `Bearer ${adminToken}`
        });

        // Admin deletes created test route
        const delRes = await makeRequest('DELETE', `/api/admin/routes/${newRouteId}`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(delRes.status === 200, 'Admin deletes route');

        // Admin updates feedback status
        const adminFeed = await makeRequest('GET', '/api/admin/feedback', null, { 'Authorization': `Bearer ${adminToken}` });
        if (adminFeed.data.length > 0) {
            const feedId = adminFeed.data[0].id;
            const updateFeed = await makeRequest('PUT', `/api/admin/feedback/${feedId}/status`, { status: 'REVIEWED' }, {
                'Authorization': `Bearer ${adminToken}`
            });
            assert(updateFeed.status === 200, 'Admin marks commuter feedback as REVIEWED');
        }

        // Admin Locations CRUD
        const newLocRes = await makeRequest('POST', '/api/admin/locations', {
            name: 'Pantal Mangrove Eco Park Dock',
            type: 'RIVER_STOP',
            address: 'Pantal River East Bank, Dagupan',
            latitude: 16.0460,
            longitude: 120.3400,
            description: 'New eco park river dock',
            status: 'ACTIVE'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(newLocRes.status === 201 && newLocRes.data.locationId, 'Admin successfully creates new location registry entry');
        const createdLocId = newLocRes.data.locationId;

        const updateLocRes = await makeRequest('PUT', `/api/admin/locations/${createdLocId}`, {
            name: 'Pantal Mangrove Eco Park Dock (Updated)',
            type: 'RIVER_STOP',
            address: 'Pantal River East Bank, Dagupan',
            latitude: 16.0465,
            longitude: 120.3405,
            description: 'Updated dock description',
            status: 'ACTIVE'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(updateLocRes.status === 200, 'Admin successfully updates location');

        const delLocRes = await makeRequest('DELETE', `/api/admin/locations/${createdLocId}`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(delLocRes.status === 200, 'Admin successfully deletes location');

        // Admin Boat Details API
        const boatDetailsRes = await makeRequest('GET', '/api/admin/boat-details', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(
            boatDetailsRes.status === 200 && Array.isArray(boatDetailsRes.data) && boatDetailsRes.data.length > 0,
            'Admin successfully retrieves boat route details list'
        );

        // River Transport Suspended advisory propagates to UNAVAILABLE
        const boatRouteObj = routesRes.data.find(r => r.mode_name === 'Boat');
        if (boatRouteObj) {
            const riverAdvRes = await makeRequest('POST', '/api/admin/advisories', {
                title: 'RIVER TRANSPORT SUSPENSION',
                affected_road: 'Pantal River Waterway',
                condition: 'RIVER_TRANSPORT_SUSPENDED',
                description: 'High water current; boat crossing suspended for passenger safety.',
                status: 'ACTIVE',
                route_ids: [boatRouteObj.id]
            }, { 'Authorization': `Bearer ${adminToken}` });
            assert(riverAdvRes.status === 201, 'Admin publishes RIVER_TRANSPORT_SUSPENDED advisory');

            const suspendedBoatRoute = await makeRequest('GET', `/api/routes/${boatRouteObj.id}`);
            assert(
                suspendedBoatRoute.data.status === 'UNAVAILABLE',
                'Boat route status dynamically becomes UNAVAILABLE when RIVER_TRANSPORT_SUSPENDED advisory is active'
            );

            // Clean up: delete the test advisory
            await makeRequest('DELETE', `/api/admin/advisories/${riverAdvRes.data.advisoryId}`, null, {
                'Authorization': `Bearer ${adminToken}`
            });
        }

        // -------------------------------------------------------------
        // 5. BACKEND AUDIT VALIDATION & 404/400 GAPS VERIFICATION
        // -------------------------------------------------------------
        console.log('\n[5. Backend Audit Validation & 404/400 Gaps]');

        // GAP-1: PUT non-existent route returns 404
        const putNonExistentRoute = await makeRequest('PUT', '/api/admin/routes/99999', {
            route_name: 'Ghost Route',
            transport_mode_id: 1,
            origin: 'Origin',
            destination: 'Destination',
            estimated_time: 15,
            minimum_fare: 15,
            maximum_fare: 25,
            status: 'CLEAR'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putNonExistentRoute.status === 404, 'GAP-1: PUT /api/admin/routes/99999 returns 404 Not Found');

        // GAP-2: DELETE non-existent route returns 404
        const delNonExistentRoute = await makeRequest('DELETE', '/api/admin/routes/99999', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(delNonExistentRoute.status === 404, 'GAP-2: DELETE /api/admin/routes/99999 returns 404 Not Found');

        // GAP-3: PUT route with invalid / empty fields returns 400
        const putInvalidRoute = await makeRequest('PUT', '/api/admin/routes/1', {
            route_name: '',
            transport_mode_id: 1,
            origin: 'Origin',
            destination: 'Destination',
            estimated_time: 15,
            minimum_fare: 15,
            maximum_fare: 25
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putInvalidRoute.status === 400, 'GAP-3: PUT /api/admin/routes/:id with empty route_name returns 400');

        // GAP-4: POST route validation (negative fare, zero time, invalid status)
        const postNegFareRoute = await makeRequest('POST', '/api/admin/routes', {
            route_name: 'Invalid Fare Route',
            transport_mode_id: 1,
            origin: 'Origin',
            destination: 'Destination',
            estimated_time: 15,
            minimum_fare: -5,
            maximum_fare: 20
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(postNegFareRoute.status === 400, 'GAP-4: POST /api/admin/routes with negative fare returns 400');

        const postZeroTimeRoute = await makeRequest('POST', '/api/admin/routes', {
            route_name: 'Zero Time Route',
            transport_mode_id: 1,
            origin: 'Origin',
            destination: 'Destination',
            estimated_time: 0,
            minimum_fare: 15,
            maximum_fare: 20
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(postZeroTimeRoute.status === 400, 'GAP-4: POST /api/admin/routes with zero estimated_time returns 400');

        const postInvalidStatusRoute = await makeRequest('POST', '/api/admin/routes', {
            route_name: 'Invalid Status Route',
            transport_mode_id: 1,
            origin: 'Origin',
            destination: 'Destination',
            estimated_time: 15,
            minimum_fare: 15,
            maximum_fare: 20,
            status: 'NON_EXISTENT_STATUS'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(postInvalidStatusRoute.status === 400, 'GAP-4: POST /api/admin/routes with invalid status returns 400');

        // GAP-5: PUT non-existent location returns 404
        const putNonExistentLoc = await makeRequest('PUT', '/api/admin/locations/99999', {
            name: 'Ghost Stop',
            type: 'STOP'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putNonExistentLoc.status === 404, 'GAP-5: PUT /api/admin/locations/99999 returns 404');

        // GAP-6: DELETE location invalid ID (400) and non-existent (404)
        const delInvalidLocId = await makeRequest('DELETE', '/api/admin/locations/abc', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(delInvalidLocId.status === 400, 'GAP-6: DELETE /api/admin/locations/abc returns 400');

        const delNonExistentLoc = await makeRequest('DELETE', '/api/admin/locations/99999', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(delNonExistentLoc.status === 404, 'GAP-6: DELETE /api/admin/locations/99999 returns 404');

        // GAP-7: PUT transport mode validation & 404
        const putEmptyModeName = await makeRequest('PUT', '/api/admin/transport-modes/1', {
            name: ''
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putEmptyModeName.status === 400, 'GAP-7: PUT /api/admin/transport-modes/:id with empty name returns 400');

        const putNonExistentMode = await makeRequest('PUT', '/api/admin/transport-modes/99999', {
            name: 'Hovercraft'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putNonExistentMode.status === 404, 'GAP-7: PUT /api/admin/transport-modes/99999 returns 404');

        // GAP-8: Stops CRUD validation & 404
        const postEmptyStop = await makeRequest('POST', '/api/admin/stops', {
            route_id: 1,
            stop_name: '',
            stop_order: 1
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(postEmptyStop.status === 400, 'GAP-8: POST /api/admin/stops with empty stop_name returns 400');

        const putEmptyStop = await makeRequest('PUT', '/api/admin/stops/1', {
            stop_name: '',
            stop_order: 1
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putEmptyStop.status === 400, 'GAP-8: PUT /api/admin/stops/:id with empty stop_name returns 400');

        const putNonExistentStop = await makeRequest('PUT', '/api/admin/stops/99999', {
            stop_name: 'Ghost Stop',
            stop_order: 1
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putNonExistentStop.status === 404, 'GAP-8: PUT /api/admin/stops/99999 returns 404');

        // GAP-9: Steps CRUD validation & 404
        const postEmptyStep = await makeRequest('POST', '/api/admin/steps', {
            route_id: 1,
            step_number: 1,
            mode: 'Walk',
            instruction: ''
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(postEmptyStep.status === 400, 'GAP-9: POST /api/admin/steps with empty instruction returns 400');

        const putEmptyStep = await makeRequest('PUT', '/api/admin/steps/1', {
            instruction: ''
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putEmptyStep.status === 400, 'GAP-9: PUT /api/admin/steps/:id with empty instruction returns 400');

        const putNonExistentStep = await makeRequest('PUT', '/api/admin/steps/99999', {
            instruction: 'Walk forward'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putNonExistentStep.status === 404, 'GAP-9: PUT /api/admin/steps/99999 returns 404');

        // GAP-10: Fares PUT validation & 404
        const putInvalidFare = await makeRequest('PUT', '/api/admin/fares/1', {
            base_fare: -10,
            discount_percentage: 20
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putInvalidFare.status === 400, 'GAP-10: PUT /api/admin/fares/:id with negative base_fare returns 400');

        const putNonExistentFare = await makeRequest('PUT', '/api/admin/fares/99999', {
            base_fare: 20,
            discount_percentage: 20
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putNonExistentFare.status === 404, 'GAP-10: PUT /api/admin/fares/99999 returns 404');

        // GAP-11: Advisories validation & 404
        const putNonExistentAdv = await makeRequest('PUT', '/api/admin/advisories/99999', {
            title: 'Ghost Advisory',
            affected_road: 'Road',
            condition: 'CLEAR',
            description: 'Description'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putNonExistentAdv.status === 404, 'GAP-11: PUT /api/admin/advisories/99999 returns 404');

        const putEmptyTitleAdv = await makeRequest('PUT', '/api/admin/advisories/1', {
            title: '',
            affected_road: 'Road',
            condition: 'CLEAR',
            description: 'Description'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(putEmptyTitleAdv.status === 400, 'GAP-11: PUT /api/admin/advisories/:id with empty title returns 400');

        const delNonExistentAdv = await makeRequest('DELETE', '/api/admin/advisories/99999', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(delNonExistentAdv.status === 404, 'GAP-11: DELETE /api/admin/advisories/99999 returns 404');

        // -------------------------------------------------------------
        // 6. DAGUPAN STREET SEARCH & LOCATION SUGGESTIONS (§Street Search)
        // -------------------------------------------------------------
        console.log('\n[6. Dagupan Street Search & Location Suggestions]');

        // Suggestions with road query
        const sugPerez = await makeRequest('GET', '/api/search/suggestions?q=Perez');
        assert(
            sugPerez.status === 200 && Array.isArray(sugPerez.data) && sugPerez.data.some(s => s.name.includes('Perez Boulevard')),
            'GET /api/search/suggestions?q=Perez returns Perez Boulevard'
        );

        // Suggestions with barangay query
        const sugBonuan = await makeRequest('GET', '/api/search/suggestions?q=Bonuan');
        assert(
            sugBonuan.status === 200 && Array.isArray(sugBonuan.data) && sugBonuan.data.some(s => s.typeLabel === 'Barangay' || s.type === 'BARANGAY'),
            'GET /api/search/suggestions?q=Bonuan returns Bonuan barangays'
        );

        // Alias / keyword search matching (AB Fernandez)
        const sugAB = await makeRequest('GET', '/api/search/suggestions?q=AB+Fernandez');
        assert(
            sugAB.status === 200 && sugAB.data.some(s => s.name.includes('A.B. Fernandez')),
            'GET /api/search/suggestions matches aliases (AB Fernandez -> A.B. Fernandez Avenue)'
        );

        // Barangay type filtering
        const barangays = await makeRequest('GET', '/api/locations?type=BARANGAY');
        assert(
            barangays.status === 200 && barangays.data.length === 31,
            'GET /api/locations?type=BARANGAY returns all 31 Dagupan barangays'
        );

        // Road / Street type filtering
        const roads = await makeRequest('GET', '/api/locations?type=ROAD');
        assert(
            roads.status === 200 && roads.data.length >= 28,
            'GET /api/locations?type=ROAD returns Dagupan streets and roads'
        );

        // Route search matching street/barangay
        const routesSearch = await makeRequest('GET', '/api/routes?search=Bonuan');
        assert(
            routesSearch.status === 200 && Array.isArray(routesSearch.data) && routesSearch.data.length > 0,
            'GET /api/routes?search=Bonuan finds routes serving Bonuan'
        );

    } catch (err) {
        console.error('Test execution error:', err);
        failed++;
    } finally {
        if (server) {
            server.close();
        }
        console.log('\n====================================================');
        console.log(`  Tests Completed: ${passed} Passed, ${failed} Failed`);
        console.log('====================================================\n');
        process.exit(failed > 0 ? 1 : 0);
    }
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
