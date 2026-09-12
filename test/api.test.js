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

        // Routes list
        const routesRes = await makeRequest('GET', '/api/routes');
        assert(routesRes.status === 200 && routesRes.data.length === 6, 'Fetches all 6 seeded Dagupan routes');

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
        // 4. SECURITY & AUTHORIZATION (§19, §20)
        // -------------------------------------------------------------
        console.log('\n[4. Security & Role Authorization]');

        // SQL Injection attack defense
        const sqliRes = await makeRequest('GET', "/api/routes?search=' OR '1'='1");
        assert(
            sqliRes.status === 200 && Array.isArray(sqliRes.data),
            'SQL injection payload in search safely parameterized without database syntax error'
        );

        // Unauthorized access to admin endpoint
        const noAuthAdmin = await makeRequest('GET', '/api/admin/stats');
        assert(noAuthAdmin.status === 401, 'Accessing /api/admin/stats without token returns 401 Unauthorized');

        // Commuter role forbidden from admin endpoint
        const commuterAdmin = await makeRequest('GET', '/api/admin/stats', null, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(commuterAdmin.status === 403, 'Commuter role accessing admin endpoint returns 403 Forbidden');

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
        assert(adminStats.status === 200 && adminStats.data.totalRoutes === 6, 'Admin stats retrieves accurate metrics');

        // Admin creates a new route
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
            description: 'New test loop line.'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(createRouteRes.status === 201 && createRouteRes.data.routeId, 'Admin successfully creates a new route');
        const newRouteId = createRouteRes.data.routeId;

        // Verify propagation to public route list
        const updatedRoutes = await makeRequest('GET', '/api/routes');
        assert(
            updatedRoutes.data.length === 7 && updatedRoutes.data.some(r => r.id === newRouteId),
            'New route immediately appears in public commuter route directory'
        );

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
