process.env.NODE_ENV = 'test';
require('dotenv').config();
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectDB, disconnectDB } = require('../server/db/connection');
const app = require('../server/server');
const { seed } = require('../server/db/seed');
const { getCache } = require('../server/cache/mapLayerCache');
const Route = require('../server/models/Route');
const { auditRoadGeometry } = require('../server/utils/routeGeometryAudit');
const { isTestOrSampleRoute } = require('../server/scripts/fixRoutes');

let server;
let baseUrl;
let mongod;

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

    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;
    await connectDB(uri);

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
        assert(
            isTestOrSampleRoute({ route_name: 'Dagupan Loop (TEST)' }) &&
                isTestOrSampleRoute({ route_name: 'Sample River Crossing' }) &&
                !isTestOrSampleRoute({ route_name: 'Dagupan Bonuan Route' }),
            'Route repair skips routes labeled as tests or samples'
        );

        const validRoadAudit = auditRoadGeometry(
            [
                { stop_order: 1, stop_name: 'Start', latitude: 16.043, longitude: 120.334 },
                { stop_order: 2, stop_name: 'End', latitude: 16.043, longitude: 120.340 }
            ],
            { type: 'LineString', coordinates: [[120.334, 16.043], [120.340, 16.043]] }
        );
        assert(validRoadAudit.warnings.length === 0, 'Road geometry audit accepts an in-bound path close to its ordered stops');

        const farStopAudit = auditRoadGeometry(
            [
                { stop_order: 1, stop_name: 'Start', latitude: 16.043, longitude: 120.334 },
                { stop_order: 2, stop_name: 'Far stop', latitude: 16.050, longitude: 120.337 }
            ],
            { type: 'LineString', coordinates: [[120.334, 16.043], [120.340, 16.043]] }
        );
        assert(
            farStopAudit.warnings.some(warning => warning.includes('Far stop') && warning.includes('snapped path')),
            'Road geometry audit flags a stop more than 100m from the snapped path'
        );

        const detourAudit = auditRoadGeometry(
            [
                { stop_order: 1, latitude: 16.043, longitude: 120.334 },
                { stop_order: 2, latitude: 16.043, longitude: 120.340 }
            ],
            { type: 'LineString', coordinates: [[120.334, 16.043], [120.334, 16.050], [120.340, 16.050], [120.340, 16.043]] }
        );
        assert(
            detourAudit.warnings.some(warning => warning.includes('endpoint straight-line distance')),
            'Road geometry audit flags a path more than 1.5 times its straight-line distance'
        );

        const outsideAudit = auditRoadGeometry(
            [
                { stop_order: 1, latitude: 16.043, longitude: 120.334 },
                { stop_order: 2, latitude: 16.043, longitude: 120.340 }
            ],
            { type: 'LineString', coordinates: [[120.334, 16.043], [120.230, 16.030]] }
        );
        assert(
            outsideAudit.warnings.some(warning => warning.includes('Dagupan boundary')),
            'Road geometry audit flags points outside the Dagupan boundary'
        );

        const emptyRouteAudit = await Route.deleteMany({});
        assert(
            emptyRouteAudit.deletedCount >= 0 && typeof emptyRouteAudit.deletedCount === 'number',
            'Route audit can run cleanly against an empty route collection'
        );
        const emptyAuditReport = await require('../server/scripts/fixRoutes').fixRoutes({ apply: false });
        assert(Array.isArray(emptyAuditReport) && emptyAuditReport.length === 0, 'Empty route collections produce an empty dry-run report instead of crashing');
        await seed();

        // -------------------------------------------------------------
        // 1. PUBLIC COMMUTER ENDPOINTS
        // -------------------------------------------------------------
        console.log('\n[1. Public Commuter Endpoints]');

        // Health Check
        const health = await makeRequest('GET', '/api/health');
        assert(health.status === 200 && health.data.status === 'OK', 'Health check returns 200 OK');

        const localOrigin = `http://localhost:${process.env.PORT || 5000}`;
        const localOriginRes = await makeRequest('GET', '/api/health', null, { Origin: localOrigin });
        assert(
            localOriginRes.status === 200 && localOriginRes.headers['access-control-allow-origin'] === localOrigin,
            'CORS allows requests from the local server origin'
        );

        // Transport Modes
        const modesRes = await makeRequest('GET', '/api/transport-modes');
        assert(modesRes.status === 200 && modesRes.data.length >= 3, 'Fetches transport modes (Jeepney, Bus, Tricycle)');

        // Routes list (12 land routes + 1 sample boat route = 13 total, but boat seeded after)
        const routesRes = await makeRequest('GET', '/api/routes');
        assert(routesRes.status === 200 && routesRes.data.length >= 12, 'Fetches all seeded Dagupan routes (12 land + 1 sample boat)');

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

        const mangaldanRoute = await makeRequest('GET', '/api/routes/5');
        assert(
            mangaldanRoute.status === 200 &&
            mangaldanRoute.data.use_corrected_geometry === 1 &&
            mangaldanRoute.data.geometry_corrected &&
            JSON.parse(mangaldanRoute.data.geometry_corrected).coordinates.length >= 20 &&
            mangaldanRoute.data.geometry_needs_review === false,
            'Route 5 uses corrected road geometry instead of the coarse fallback line'
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
            (r1Res.data.geometry_needs_review &&
                geojsonRes.status === 422 && geojsonRes.data.geometry_needs_review === true) ||
            (!r1Res.data.geometry_needs_review &&
                geojsonRes.status === 200 && geojsonRes.data.type === 'Feature' &&
                geojsonRes.data.geometry.type === 'LineString' && Array.isArray(geojsonRes.data.geometry.coordinates)),
            'GET /api/routes/:id/geojson only returns detailed routes and flags coarse geometry for review'
        );

        // Locations registry (Phase 3 & Advanced Mapping)
        const locsRes = await makeRequest('GET', '/api/locations');
        assert(
            locsRes.status === 200 && locsRes.data.length >= 24,
            'GET /api/locations returns seeded Dagupan locations registry (24 entries)'
        );

        const riverStops = await makeRequest('GET', '/api/locations?type=RIVER_STOP');
        assert(
            riverStops.status === 200 && riverStops.data.length === 0,
            'GET /api/locations?type=RIVER_STOP has no unconfigured river docks'
        );

        const terminals = await makeRequest('GET', '/api/locations?type=TERMINAL');
        assert(
            terminals.status === 200 && terminals.data.length === 0,
            'GET /api/locations?type=TERMINAL has no unconfigured terminals'
        );

        const stopLayer = await makeRequest('GET', '/api/map/layers/stops');
        assert(
            stopLayer.status === 200 && stopLayer.data.features.length === 0,
            'Map stop layer is empty until route stops are configured'
        );

        // Boat route attributes in public list
        const boatRoute = routesRes.data.find(r => r.mode_name === 'Boat');
        assert(
            boatRoute && boatRoute.waterway === 'Pantal River' && boatRoute.boat_operating_status === 'UNAVAILABLE',
            'GET /api/routes keeps the unverified sample boat route unavailable'
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
        assert(
            regRes.status === 201 && regRes.data.token && regRes.data.user?.role === 'COMMUTER' &&
                !regRes.data.verificationRequired,
            'New commuter registration creates an immediately usable account without an email code'
        );
        const removedSignupVerification = await makeRequest('POST', '/api/auth/verify-email', {
            email: 'test@dagupan.ph'
        });
        const removedSignupResend = await makeRequest('POST', '/api/auth/resend-verification', {
            email: 'test@dagupan.ph'
        });
        assert(
            removedSignupVerification.status === 404 && removedSignupResend.status === 404,
            'Commuter email verification and resend endpoints are removed'
        );
        const immediateCommuterLogin = await makeRequest('POST', '/api/auth/login', {
            username: 'testcommuter',
            password: 'Password123!'
        });
        assert(
            immediateCommuterLogin.status === 200 && immediateCommuterLogin.data.token &&
                immediateCommuterLogin.data.user.role === 'COMMUTER',
            'New commuter can sign in without email verification'
        );
        const commuterToken = regRes.data.token;

        // Password Constraint Validations
        const shortPw = await makeRequest('POST', '/api/auth/register', {
            username: 'shortpwuser',
            email: 'short@dagupan.ph',
            password: 'Ab1!'
        });
        assert(shortPw.status === 400 && shortPw.data.error.includes('8 characters'), 'Password < 8 characters is rejected with 400');

        const noUpperPw = await makeRequest('POST', '/api/auth/register', {
            username: 'noupperuser',
            email: 'noupper@dagupan.ph',
            password: 'password123!'
        });
        assert(noUpperPw.status === 400 && noUpperPw.data.error.includes('uppercase'), 'Password missing uppercase is rejected with 400');

        const noNumPw = await makeRequest('POST', '/api/auth/register', {
            username: 'nonumuser',
            email: 'nonum@dagupan.ph',
            password: 'Password!'
        });
        assert(noNumPw.status === 400 && noNumPw.data.error.includes('number'), 'Password missing number is rejected with 400');

        const noSpecialPw = await makeRequest('POST', '/api/auth/register', {
            username: 'nospecialuser',
            email: 'nospecial@dagupan.ph',
            password: 'Password123'
        });
        assert(noSpecialPw.status === 400 && noSpecialPw.data.error.includes('special character'), 'Password missing special character is rejected with 400');

        const badEmail = await makeRequest('POST', '/api/auth/register', {
            username: 'bademailuser',
            email: 'invalid-email-format',
            password: 'Password123!'
        });
        assert(badEmail.status === 400 && badEmail.data.error.includes('valid email'), 'Invalid email format is rejected with 400');

        // Forgot Password Flow Validations
        const forgotReq = await makeRequest('POST', '/api/auth/forgot-password', {
            identifier: 'commuter@inertayo.ph'
        });
        assert(
            forgotReq.status === 200 &&
            !forgotReq.data.devCode &&
            !forgotReq.data.code &&
            !forgotReq.data.resetCode &&
            !forgotReq.data.verificationCode,
            'POST /api/auth/forgot-password succeeds without exposing verification code in response'
        );
        assert(global.__testMailbox && global.__testMailbox.code, 'Verification code was dispatched to email mailbox');
        const generatedCode = global.__testMailbox.code;

        // Reset with invalid code
        const invalidReset = await makeRequest('POST', '/api/auth/reset-password', {
            email: 'commuter@inertayo.ph',
            resetCode: '999999',
            newPassword: 'NewPassword123!'
        });
        assert(invalidReset.status === 400 && invalidReset.data.error.includes('Invalid or expired'), 'Reset with wrong code is rejected with 400');

        // Reset with valid code
        const validReset = await makeRequest('POST', '/api/auth/reset-password', {
            email: 'commuter@inertayo.ph',
            resetCode: generatedCode,
            newPassword: 'ResetPassword123!'
        });
        assert(validReset.status === 200, 'POST /api/auth/reset-password succeeds with valid code and updates password');

        // Verify login with new password
        const loginWithNew = await makeRequest('POST', '/api/auth/login', {
            username: 'commuter',
            password: 'ResetPassword123!'
        });
        assert(loginWithNew.status === 200, 'Login succeeds with newly reset password');

        // Restore default password for remaining tests
        await makeRequest('POST', '/api/auth/forgot-password', {
            identifier: 'commuter@inertayo.ph'
        });
        await makeRequest('POST', '/api/auth/reset-password', {
            email: 'commuter@inertayo.ph',
            resetCode: global.__testMailbox.code,
            newPassword: 'Commuter123!'
        });

        // Login existing commuter
        const loginRes = await makeRequest('POST', '/api/auth/login', {
            username: 'commuter',
            password: 'Commuter123!'
        });
        const defaultCommuterToken = loginRes.data.token;

        // ── Change Password with Email Verification Flow ──
        // 1. Guest request rejected
        const guestCpReq = await makeRequest('POST', '/api/auth/change-password/request-code');
        assert(guestCpReq.status === 401, 'Guest change-password request rejected with 401 Unauthorized');

        // 2. Authenticated user requests code
        const cpReq = await makeRequest('POST', '/api/auth/change-password/request-code', null, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(
            cpReq.status === 200 &&
            !cpReq.data.devCode &&
            !cpReq.data.code &&
            !cpReq.data.verificationCode,
            'Authenticated user requests change password code without code exposure in response'
        );
        assert(global.__testMailbox && global.__testMailbox.code, 'Change-password verification code was dispatched to email mailbox');
        const cpCode = global.__testMailbox.code;

        // 3. Rate limiting cooldown rejection (within 60s)
        const cpCooldownReq = await makeRequest('POST', '/api/auth/change-password/request-code', null, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(cpCooldownReq.status === 429, 'Immediate second code request is rejected with 429 cooldown error');

        // 4. Policy validation checks on change-password confirm
        const cpShort = await makeRequest('POST', '/api/auth/change-password/confirm', {
            code: cpCode,
            newPassword: 'Ab1!'
        }, { 'Authorization': `Bearer ${commuterToken}` });
        assert(cpShort.status === 400 && cpShort.data.error.includes('8 characters'), 'Change password < 8 characters is rejected with 400');

        const cpNoUpper = await makeRequest('POST', '/api/auth/change-password/confirm', {
            code: cpCode,
            newPassword: 'password123!'
        }, { 'Authorization': `Bearer ${commuterToken}` });
        assert(cpNoUpper.status === 400 && cpNoUpper.data.error.includes('uppercase'), 'Change password missing uppercase is rejected with 400');

        const cpNoNum = await makeRequest('POST', '/api/auth/change-password/confirm', {
            code: cpCode,
            newPassword: 'Password!'
        }, { 'Authorization': `Bearer ${commuterToken}` });
        assert(cpNoNum.status === 400 && cpNoNum.data.error.includes('number'), 'Change password missing number is rejected with 400');

        const cpNoSpecial = await makeRequest('POST', '/api/auth/change-password/confirm', {
            code: cpCode,
            newPassword: 'Password123'
        }, { 'Authorization': `Bearer ${commuterToken}` });
        assert(cpNoSpecial.status === 400 && cpNoSpecial.data.error.includes('special character'), 'Change password missing special character is rejected with 400');

        // 5. Wrong code rejected
        const cpWrongCode = await makeRequest('POST', '/api/auth/change-password/confirm', {
            code: '000000',
            newPassword: 'NewValidPassword123!'
        }, { 'Authorization': `Bearer ${commuterToken}` });
        assert(cpWrongCode.status === 400 && cpWrongCode.data.error.includes('Invalid verification code'), 'Change password with wrong code is rejected with 400');

        // 6. Verify-code endpoint check
        const cpVerifyRes = await makeRequest('POST', '/api/auth/change-password/verify-code', {
            code: cpCode
        }, { 'Authorization': `Bearer ${commuterToken}` });
        assert(cpVerifyRes.status === 200 && cpVerifyRes.data.valid === true, 'POST /api/auth/change-password/verify-code validates active code');

        // 7. Successful password change
        const cpSuccess = await makeRequest('POST', '/api/auth/change-password/confirm', {
            code: cpCode,
            newPassword: 'BrandNewPassword123!'
        }, { 'Authorization': `Bearer ${commuterToken}` });
        assert(cpSuccess.status === 200, 'POST /api/auth/change-password/confirm succeeds with valid code and policy-compliant password');

        // 8. Single-use invalidation: reusing code rejected
        const cpReuse = await makeRequest('POST', '/api/auth/change-password/confirm', {
            code: cpCode,
            newPassword: 'AnotherPassword123!'
        }, { 'Authorization': `Bearer ${commuterToken}` });
        assert(cpReuse.status === 400, 'Reusing already-consumed verification code is rejected with 400');

        // 9. Verify login with newly changed password
        const cpNewLogin = await makeRequest('POST', '/api/auth/login', {
            username: 'testcommuter',
            password: 'BrandNewPassword123!'
        });
        assert(cpNewLogin.status === 200 && cpNewLogin.data.token, 'Login succeeds with newly changed password');

        // 10. Login with old password rejected
        const cpOldLogin = await makeRequest('POST', '/api/auth/login', {
            username: 'testcommuter',
            password: 'Password123!'
        });
        assert(cpOldLogin.status === 401, 'Login with old password is now rejected with 401');

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
        const noAuthSavedRoutes = await makeRequest('GET', '/api/admin/saved-routes');
        assert(noAuthSavedRoutes.status === 401, 'Admin saved-route insights reject unauthenticated requests');
        const noAuthAuditLogs = await makeRequest('GET', '/api/admin/audit-logs');
        assert(noAuthAuditLogs.status === 401, 'Admin audit logs reject unauthenticated requests');

        const noAuthRoadMatch = await makeRequest('POST', '/api/roads/match', { coordinates: [] });
        assert(noAuthRoadMatch.status === 401, 'Road map matching rejects unauthenticated requests');

        // ── Test 4.3: Broken Function-Level Authorization (privilege escalation)
        // Attack: a valid COMMUTER JWT attempts a POST to an ADMIN-only endpoint.
        // Expected: 403 Forbidden — correct role is enforced by requireAdmin middleware.
        // NOTE: this is distinct from BOLA — this is same-credential trying a higher-privilege action.
        const commuterAdmin = await makeRequest('GET', '/api/admin/stats', null, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(commuterAdmin.status === 403, 'Commuter role accessing admin endpoint returns 403 Forbidden (Broken Function-Level Auth)');
        const commuterSavedRoutesAdmin = await makeRequest('GET', '/api/admin/saved-routes', null, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(commuterSavedRoutesAdmin.status === 403, 'Admin saved-route insights reject commuter credentials');
        const commuterAuditLogsAdmin = await makeRequest('GET', '/api/admin/audit-logs', null, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(commuterAuditLogsAdmin.status === 403, 'Admin audit logs reject commuter credentials');

        const commuterRoadMatch = await makeRequest('POST', '/api/roads/match', { coordinates: [] }, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(commuterRoadMatch.status === 403, 'Road map matching rejects commuter-role requests');

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
        assert(regB.status === 201 && regB.data.token, 'Commuter B can register without email verification (BOLA test setup)');
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
            Object.keys(require.cache).forEach(k => { if (!k.includes('node_modules')) delete require.cache[k]; });
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
            Object.keys(require.cache).forEach(k => { if (!k.includes('node_modules')) delete require.cache[k]; });
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
        assert(
            adminLogin.status === 200 && adminLogin.data.verificationRequired === 'admin' && !adminLogin.data.token,
            'Admin password login requires an email code before issuing a JWT'
        );
        const earlyAdminResend = await makeRequest('POST', '/api/auth/admin-login/resend', {
            challengeId: adminLogin.data.challengeId
        });
        assert(earlyAdminResend.status === 429, 'Admin sign-in code resend is rate limited');
        const adminCode = global.__testMailbox.code;
        const adminVerification = await makeRequest('POST', '/api/auth/admin-login/verify', {
            challengeId: adminLogin.data.challengeId,
            code: adminCode
        });
        assert(
            adminVerification.status === 200 && adminVerification.data.user.role === 'ADMIN' && adminVerification.data.token,
            'Valid admin email code completes sign-in and returns an ADMIN JWT'
        );
        const adminToken = adminVerification.data.token;
        const adminAuthHeaders = { Authorization: ['Bearer', adminToken].join(' ') };

        const jeepneyMode = modesRes.data.find(mode => mode.name === 'Jeepney');
        const jeepneyRouteId = routesRes.data.find(route => route.transport_mode_id === jeepneyMode.id)?.id;
        const deactivateJeepney = await makeRequest('PUT', `/api/admin/transport-modes/${jeepneyMode.id}`, {
            name: jeepneyMode.name,
            description: jeepneyMode.description,
            icon: jeepneyMode.icon,
            status: 'INACTIVE'
        }, adminAuthHeaders);
        const commuterRoutesWithoutJeepney = await makeRequest('GET', '/api/routes');
        const inactiveJeepneyDetails = await makeRequest('GET', `/api/routes/${jeepneyRouteId}`);
        const adminRoutesWithInactiveMode = await makeRequest('GET', '/api/routes?include_inactive=true', null, adminAuthHeaders);
        const jeepneyLayerWithoutMode = await makeRequest('GET', '/api/map/layers/jeepneys');
        const publicModesWithoutJeepney = await makeRequest('GET', '/api/transport-modes');
        assert(
            deactivateJeepney.status === 200 &&
                commuterRoutesWithoutJeepney.data.every(route => route.transport_mode_id !== jeepneyMode.id) &&
                inactiveJeepneyDetails.status === 404 &&
                adminRoutesWithInactiveMode.data.some(route => route.transport_mode_id === jeepneyMode.id) &&
                jeepneyLayerWithoutMode.data.features.every(feature => feature.properties.mode !== jeepneyMode.name) &&
                publicModesWithoutJeepney.data.every(mode => mode.id !== jeepneyMode.id),
            'Deactivating a transport mode hides its routes from commuters and map while preserving admin access'
        );
        const reactivateJeepney = await makeRequest('PUT', `/api/admin/transport-modes/${jeepneyMode.id}`, {
            name: jeepneyMode.name,
            description: jeepneyMode.description,
            icon: jeepneyMode.icon,
            status: 'ACTIVE'
        }, adminAuthHeaders);
        assert(
            reactivateJeepney.status === 200 && jeepneyRouteId &&
                (await makeRequest('GET', '/api/routes')).data.some(route => route.id === jeepneyRouteId),
            'Reactivating a transport mode restores its routes to commuter results'
        );

        const activityRoute = routesRes.data.find(route =>
            !savedListRes.data.some(savedRoute => savedRoute.id === route.id)
        );
        const savedActivityRoute = await makeRequest('POST', '/api/saved-routes', {
            routeId: activityRoute.id
        }, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(savedActivityRoute.status === 201, 'Commuter saves a route for the audit log test');

        const logoutEvent = await makeRequest('POST', '/api/auth/logout', null, {
            'Authorization': `Bearer ${commuterToken}`
        });
        assert(logoutEvent.status === 200, 'Authenticated logout records the user activity');

        const adminAuditLogs = await makeRequest('GET', '/api/admin/audit-logs?limit=500', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const auditLogRecords = Array.isArray(adminAuditLogs.data) ? adminAuditLogs.data : [];
        const accountCreatedEvent = auditLogRecords.find(log =>
            log.action === 'ACCOUNT_CREATED' && log.username === 'testcommuter' && log.role === 'COMMUTER'
        );
        const savedRouteEvent = auditLogRecords.find(log =>
            log.action === 'ROUTE_SAVED' && log.username === 'testcommuter' &&
            log.route_id === activityRoute.id && log.route_name === activityRoute.route_name
        );
        assert(
            adminAuditLogs.status === 200 && Array.isArray(adminAuditLogs.data) &&
                accountCreatedEvent && accountCreatedEvent.created_at && !Object.hasOwn(accountCreatedEvent, 'email') &&
                auditLogRecords.some(log => log.action === 'LOGIN' && log.username === 'admin') &&
                auditLogRecords.some(log => log.action === 'LOGOUT' && log.username === 'testcommuter') &&
                savedRouteEvent && savedRouteEvent.created_at && !Object.hasOwn(savedRouteEvent, 'email'),
            'Admin audit logs include account creation, login, logout, and saved-route activity without exposing email'
        );
        await makeRequest('DELETE', `/api/saved-routes/${activityRoute.id}`, null, {
            'Authorization': `Bearer ${commuterToken}`
        });

        const uvExpressRejected = await makeRequest('POST', '/api/admin/fares/routes', {
            transport_mode: 'uv_express',
            route_name: 'Test UV Express Route',
            terminal: 'Dagupan Terminal',
            regular_fare: { min: 15, max: 25 },
            discounted_fare_20pct: { min: 12, max: 20 }
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(
            uvExpressRejected.status === 400 && typeof uvExpressRejected.data.error === 'string' && uvExpressRejected.data.error.includes('Invalid transport_mode'),
            'Admin fare creation rejects UV Express and removes it as an available vehicle form'
        );

        const auditFareName = 'Audit Trail Test Fare';
        const createdAuditFare = await makeRequest('POST', '/api/admin/fares/routes', {
            transport_mode: 'jeepney',
            route_name: auditFareName,
            terminal: 'Test Terminal',
            regular_fare: { min: 12, max: 14 },
            discounted_fare_20pct: { min: 9.6, max: 11.2 }
        }, adminAuthHeaders);
        const updatedAuditFare = await makeRequest('PUT', `/api/admin/fares/routes/${encodeURIComponent(auditFareName)}`, {
            regular_fare: { min: 13, max: 15 },
            discounted_fare_20pct: { min: 10.4, max: 12 }
        }, adminAuthHeaders);
        const publicAuditFareRead = await makeRequest('GET', '/api/fares/routes?mode=jeepney');
        const publicAuditFare = publicAuditFareRead.data.find(fare => fare.route_name === auditFareName);
        const deletedAuditFare = await makeRequest('DELETE', `/api/admin/fares/routes/${encodeURIComponent(auditFareName)}`, null, adminAuthHeaders);
        const fareAuditLogs = await makeRequest('GET', '/api/admin/audit-logs?limit=500', null, adminAuthHeaders);
        assert(
            createdAuditFare.status === 201 && updatedAuditFare.status === 200 &&
                publicAuditFareRead.status === 200 && publicAuditFareRead.headers['cache-control']?.includes('no-store') &&
                publicAuditFare?.regular_fare?.min === 13 && publicAuditFare?.regular_fare?.max === 15 &&
                deletedAuditFare.status === 200 &&
                fareAuditLogs.data.some(log => log.action === 'ADMIN_FARE_CREATED' && log.username === 'admin' && log.details.includes(auditFareName)) &&
                fareAuditLogs.data.some(log => log.action === 'ADMIN_FARE_UPDATED' && log.username === 'admin' && log.details.includes('₱13.00')) &&
                fareAuditLogs.data.some(log => log.action === 'ADMIN_FARE_DELETED' && log.username === 'admin' && log.details.includes(auditFareName)),
            'Fare changes refresh public fare data without caching and record the admin, action, and fare details'
        );

        const adminSavedRoutes = await makeRequest('GET', '/api/admin/saved-routes', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(
            adminSavedRoutes.status === 200 && Number.isInteger(adminSavedRoutes.data.total_saved) &&
                Array.isArray(adminSavedRoutes.data.routes) && adminSavedRoutes.data.routes.every(route =>
                    Number.isInteger(route.saved_count) && !Object.hasOwn(route, 'user_id') && !Object.hasOwn(route, 'email')
                ),
            'Admin saved-route insights return route-level bookmark counts without commuter identities'
        );

        const draftPayload = {
            form_data: {
                route_name: 'Draft only route',
                description: 'Not published.',
                path_segments: [{ mode: 'Walk', geometry: 'draft-geometry' }]
            },
            route_steps: []
        };
        const savedRouteDraft = await makeRequest('PUT', '/api/admin/route-drafts/new', draftPayload, {
            'Authorization': `Bearer ${adminToken}`
        });
        const loadedRouteDraft = await makeRequest('GET', '/api/admin/route-drafts/new', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const publicRoutesBeforePublish = await makeRequest('GET', '/api/routes');
        assert(
            savedRouteDraft.status === 200 && loadedRouteDraft.status === 200 &&
                loadedRouteDraft.data.form_data.route_name === 'Draft only route' &&
                loadedRouteDraft.data.form_data.path_segments?.[0]?.mode === 'Walk' &&
                !publicRoutesBeforePublish.data.some(route => route.route_name === 'Draft only route'),
            'Admin route drafts persist privately without publishing route changes'
        );
        const discardedRouteDraft = await makeRequest('DELETE', '/api/admin/route-drafts/new', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(discardedRouteDraft.status === 200, 'Admin can discard a saved route draft');

        // Admin stats
        const adminStats = await makeRequest('GET', '/api/admin/stats', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(adminStats.status === 200 && adminStats.data.totalRoutes >= 13, 'Admin stats retrieves accurate metrics');

        const emptyAdminStops = await makeRequest('GET', '/api/admin/stops', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(emptyAdminStops.status === 200 && emptyAdminStops.data.length === 0, 'Admin stop list starts empty after transit stops are cleared');
        await makeRequest('GET', '/api/map/layers/stops');

        const createdStop = await makeRequest('POST', '/api/admin/stops', {
            route_id: 1,
            stop_name: 'Admin CRUD Test Stop',
            stop_order: 1,
            description: 'Temporary API test stop.',
            vehicle_type: 'tricycle',
            is_transfer_point: 0,
            latitude: 16.0435,
            longitude: 120.334
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(
            createdStop.status === 201 && createdStop.data.stopId && getCache('layer:stops') === null,
            'Creating a route stop invalidates the cached client map layer'
        );

        const updatedStop = await makeRequest('PUT', `/api/admin/stops/${createdStop.data.stopId}`, {
            route_id: 2,
            stop_name: 'Admin CRUD Test Stop Updated',
            stop_order: 1,
            description: 'Updated temporary API test stop.',
            vehicle_type: 'boat',
            is_transfer_point: 1,
            latitude: 16.044,
            longitude: 120.337
        }, { 'Authorization': `Bearer ${adminToken}` });
        const movedRouteStops = await makeRequest('GET', '/api/admin/routes/2/stops', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(
            updatedStop.status === 200 && movedRouteStops.data.length === 1 &&
                movedRouteStops.data[0].stop_name === 'Admin CRUD Test Stop Updated' &&
                movedRouteStops.data[0].stop_order === 1 &&
                movedRouteStops.data[0].vehicle_type === 'boat',
            'Admin edits and reassigns route stops while preserving sequential order'
        );

        const deletedStop = await makeRequest('DELETE', `/api/admin/stops/${createdStop.data.stopId}`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const finalAdminStops = await makeRequest('GET', '/api/admin/stops', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(deletedStop.status === 200 && finalAdminStops.status === 200 && finalAdminStops.data.length === 0, 'Admin deletes route stops and restores the empty list');
        const stopAuditLogs = await makeRequest('GET', '/api/admin/audit-logs?limit=500', null, adminAuthHeaders);
        assert(
            stopAuditLogs.status === 200 &&
                stopAuditLogs.data.some(log => log.action === 'ADMIN_STOP_CREATED' && log.username === 'admin' && log.details.includes('Admin CRUD Test Stop')) &&
                stopAuditLogs.data.some(log => log.action === 'ADMIN_STOP_UPDATED' && log.username === 'admin' && log.details.includes('Admin CRUD Test Stop Updated')) &&
                stopAuditLogs.data.some(log => log.action === 'ADMIN_STOP_DELETED' && log.username === 'admin' && log.details.includes('Admin CRUD Test Stop Updated')),
            'Admin audit logs identify the administrator and describe stop create, update, and delete actions'
        );

        // Admin creates a new route with GeoJSON geometry
        const sampleGeom = JSON.stringify({
            type: 'LineString',
            coordinates: [[120.334, 16.043], [120.340, 16.050]]
        });
        const sampleWalkingGeom = JSON.stringify({
            type: 'LineString',
            coordinates: [[120.334, 16.043], [120.337, 16.046], [120.340, 16.050]]
        });
        const geometryValidation = await makeRequest('POST', '/api/admin/routes/validate-geometry', {
            geometry: sampleGeom,
            mode: 'road'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(
            geometryValidation.status === 200 && geometryValidation.data.valid &&
                Array.isArray(geometryValidation.data.warnings),
            'Admin route geometry validation accepts valid GeoJSON'
        );
        const outsideGeometryValidation = await makeRequest('POST', '/api/admin/routes/validate-geometry', {
            geometry: { type: 'LineString', coordinates: [[120.334, 16.043], [120.230, 16.030]] },
            mode: 'road'
        }, { 'Authorization': `Bearer ${adminToken}` });
        const malformedGeometryValidation = await makeRequest('POST', '/api/admin/routes/validate-geometry', {
            geometry: '{invalid json',
            mode: 'road'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(
            outsideGeometryValidation.status === 200 && outsideGeometryValidation.data.warnings.some(warning => warning.includes('Dagupan City')) &&
                malformedGeometryValidation.status === 200 && !malformedGeometryValidation.data.valid,
            'Route geometry validation warns about boundary crossings and handles malformed GeoJSON'
        );
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
            operating_status: 'ACTIVE',
            service_notes: 'Test service note.',
            geometry: sampleGeom,
            walking_geometry: sampleWalkingGeom,
            allow_unverified_map_geometry: true,
            path_segments: [
                { mode: 'Jeepney', geometry: sampleGeom },
                { mode: 'Walk', geometry: sampleWalkingGeom },
                { mode: 'Tricycle', geometry: sampleGeom }
            ]
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(createRouteRes.status === 201 && createRouteRes.data.routeId, 'Admin successfully creates a new route with GeoJSON geometry');
        const newRouteId = createRouteRes.data.routeId;

        // Verify propagation to public route list and GeoJSON geometry (13 seeded + 1 new = 14)
        const updatedRoutes = await makeRequest('GET', '/api/routes');
        const createdRouteInList = updatedRoutes.data.find(r => r.id === newRouteId);
        assert(
            updatedRoutes.data.length >= 14 && createdRouteInList && createdRouteInList.geometry === sampleGeom && createdRouteInList.walking_geometry === sampleWalkingGeom,
            'New route immediately appears in public route directory with separate walking geometry'
        );
        const mixedModeMapLayer = await makeRequest('GET', '/api/map/layers/jeepneys');
        const mixedModeMapFeature = mixedModeMapLayer.data.features.find(feature => feature.properties.id === newRouteId);
        assert(
            mixedModeMapFeature?.properties.route_path_segments?.map(segment => segment.mode).join(',') === 'Jeepney,Walk,Tricycle',
            'Public map layer includes every ordered mixed-mode route path'
        );

        // Admin updates route geometry
        const updatedGeom = JSON.stringify({
            type: 'LineString',
            coordinates: [[120.334, 16.043], [120.342, 16.052], [120.350, 16.060]]
        });
        const updatedWalkingGeom = JSON.stringify({
            type: 'LineString',
            coordinates: [[120.334, 16.043], [120.336, 16.045], [120.339, 16.049], [120.350, 16.060]]
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
            geometry: updatedGeom,
            walking_geometry: updatedWalkingGeom
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(updateRouteRes.status === 200, 'Admin successfully updates route geometry');
        const updatedRouteList = await makeRequest('GET', '/api/routes');
        const updatedRouteInList = updatedRouteList.data.find(r => r.id === newRouteId);
        assert(updatedRouteInList?.walking_geometry === updatedWalkingGeom, 'Admin route updates persist separate walking geometry');
        const updatedRouteDetails = await makeRequest('GET', `/api/routes/${newRouteId}`);
        assert(
            updatedRouteDetails.data.walking_geometry === updatedWalkingGeom &&
                updatedRouteDetails.data.service_notes === 'Test service note.' &&
                updatedRouteDetails.data.operating_status === 'ACTIVE',
            'Route detail endpoint returns walking geometry and passenger service metadata'
        );

        assert(
            updatedRouteDetails.data.path_segments?.map(segment => segment.mode).join(',') === 'Jeepney,Walk,Tricycle',
            'Route details preserve ordered jeepney, walking, and tricycle path legs'
        );
        const invalidPathSegments = await makeRequest('PUT', `/api/admin/routes/${newRouteId}`, {
            route_name: 'Downtown – Binloc Loop (Extended)',
            transport_mode_id: modesRes.data[0].id,
            origin: 'Downtown Plaza',
            destination: 'Binloc Beach East',
            estimated_time: 25,
            minimum_fare: 15.00,
            maximum_fare: 30.00,
            status: 'CLEAR',
            path_segments: [{ mode: 'Walk', geometry: '{invalid json' }]
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(invalidPathSegments.status === 400, 'Admin route update rejects malformed path segment geometry');

        const serviceStatusUpdate = await makeRequest('PUT', `/api/admin/routes/${newRouteId}`, {
            route_name: 'Downtown – Binloc Loop (Extended)',
            transport_mode_id: modesRes.data[0].id,
            origin: 'Downtown Plaza',
            destination: 'Binloc Beach East',
            estimated_time: 25,
            minimum_fare: 15.00,
            maximum_fare: 30.00,
            status: 'CLEAR',
            operating_status: 'SUSPENDED',
            service_notes: 'Temporarily suspended for testing.',
            geometry: updatedGeom,
            walking_geometry: updatedWalkingGeom
        }, { 'Authorization': `Bearer ${adminToken}` });
        const suspendedRouteDetails = await makeRequest('GET', `/api/routes/${newRouteId}`);
        assert(
            serviceStatusUpdate.status === 200 && suspendedRouteDetails.data.operating_status === 'SUSPENDED' &&
                suspendedRouteDetails.data.service_notes === 'Temporarily suspended for testing.',
            'Route operating status and service notes update independently of advisory status'
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

        const seededAffectedRouteIds = new Set(advRes.data.flatMap(advisory =>
            (advisory.affected_routes || []).map(route => route.id)
        ));
        const detourTestRoute = routesRes.data.find(route =>
            route.mode_name !== 'Boat' && !seededAffectedRouteIds.has(route.id) &&
            route.geometry
        );
        const detourBaseCoordinates = JSON.parse(detourTestRoute.geometry).coordinates;
        const detourCoordinates = [];
        const minimumSubdivisions = Math.ceil(20 / Math.max(1, detourBaseCoordinates.length - 1));
        for (let index = 0; index < detourBaseCoordinates.length - 1; index += 1) {
            const [startLongitude, startLatitude] = detourBaseCoordinates[index];
            const [endLongitude, endLatitude] = detourBaseCoordinates[index + 1];
            const midpointLatitude = (startLatitude + endLatitude) / 2;
            const longitudeMeters = (endLongitude - startLongitude) * 111000 * Math.cos(midpointLatitude * Math.PI / 180);
            const latitudeMeters = (endLatitude - startLatitude) * 111000;
            const segmentCount = Math.max(minimumSubdivisions, Math.ceil(Math.hypot(longitudeMeters, latitudeMeters) / 150));
            for (let pointIndex = 0; pointIndex < segmentCount; pointIndex += 1) {
                const ratio = pointIndex / segmentCount;
                detourCoordinates.push([
                    startLongitude + (endLongitude - startLongitude) * ratio + 0.00003,
                    startLatitude + (endLatitude - startLatitude) * ratio + 0.00002
                ]);
            }
        }
        const [lastLongitude, lastLatitude] = detourBaseCoordinates.at(-1);
        detourCoordinates.push([lastLongitude + 0.00003, lastLatitude + 0.00002]);
        const floodedCoordinates = detourBaseCoordinates.slice(0, Math.max(2, Math.ceil(detourBaseCoordinates.length / 3)));
        const detourTestPaths = {
            flooded_geometry: JSON.stringify({ type: 'LineString', coordinates: floodedCoordinates }),
            detour_geometry: JSON.stringify({ type: 'LineString', coordinates: detourCoordinates }),
            detour_steps: [
                { mode: 'Jeepney', instruction: 'Board via the alternate road.', location_info: 'Use the Calasiao-bound stop.' },
                { mode: 'Walk', instruction: 'Rejoin the route after the flooded section.', location_info: '' }
            ],
            detour_time: 32
        };
        const detourAdvisoryPayload = {
            title: 'TEST FLOOD DETOUR',
            affected_road: 'Test Flood Road',
            condition: 'FLOODED',
            description: 'Test-only flood detour advisory.',
            status: 'ACTIVE',
            route_ids: [detourTestRoute.id],
            route_detours: [{ route_id: detourTestRoute.id, ...detourTestPaths, detour_enabled: false }]
        };
        const invalidDetourAdvisory = await makeRequest('POST', '/api/admin/advisories', {
            ...detourAdvisoryPayload,
            route_detours: [{ route_id: detourTestRoute.id, detour_enabled: true }]
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(
            invalidDetourAdvisory.status === 400,
            'Enabled detours reject incomplete flood paths, alternate paths, or instructions'
        );

        const createdDetourAdvisory = await makeRequest('POST', '/api/admin/advisories', detourAdvisoryPayload, {
            'Authorization': `Bearer ${adminToken}`
        });
        const configuredAdvisory = await makeRequest('GET', '/api/admin/advisories', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const configuredRoute = configuredAdvisory.data.find(advisory => advisory.id === createdDetourAdvisory.data.advisoryId)?.routes?.[0];
        assert(
            createdDetourAdvisory.status === 201 && configuredRoute?.detour_enabled === false &&
                configuredRoute.flooded_geometry === detourTestPaths.flooded_geometry &&
                configuredRoute.detour_geometry === detourTestPaths.detour_geometry &&
                configuredRoute.detour_steps?.length === detourTestPaths.detour_steps.length,
            'Advisory stores route-specific flood and detour paths while leaving the detour disabled'
        );

        const detourJourneyEndpoints = {
            origin: { lat: detourCoordinates[0][1], lng: detourCoordinates[0][0], name: 'Test route start' },
            destination: { lat: detourCoordinates.at(-1)[1], lng: detourCoordinates.at(-1)[0], name: 'Test route end' }
        };
        const disabledDetourJourney = await makeRequest('POST', '/api/journey/plan', detourJourneyEndpoints);
        const disabledDetourLeg = disabledDetourJourney.data.itineraries
            .flatMap(itinerary => itinerary.legs)
            .find(leg => leg.routeId === detourTestRoute.id);
        assert(
            disabledDetourJourney.status === 200 && disabledDetourLeg && !disabledDetourLeg.detourActive &&
                disabledDetourJourney.data.itineraries.some(itinerary => itinerary.floodStatus === 'ADVISORY'),
            'Active flood advisory keeps the normal route until its detour is explicitly enabled'
        );

        await Route.updateOne({ id: detourTestRoute.id }, { status: 'DETOUR_ACTIVE' });
        const staleStatusRoutePreview = await makeRequest('GET', `/api/routes/${detourTestRoute.id}`);
        assert(
            staleStatusRoutePreview.status === 200 && staleStatusRoutePreview.data.status === 'ADVISORY' &&
                staleStatusRoutePreview.data.active_travel_time === detourTestRoute.estimated_time &&
                staleStatusRoutePreview.data.geometry === detourTestRoute.geometry &&
                !staleStatusRoutePreview.data.active_detour,
            'An explicit disabled detour ignores stale DETOUR_ACTIVE status and keeps normal map and time'
        );

        const enabledRouteDetour = await makeRequest('PUT', `/api/admin/routes/${detourTestRoute.id}/advisories/${createdDetourAdvisory.data.advisoryId}/detour`, {
            ...detourTestPaths,
            detour_enabled: true
        }, { 'Authorization': `Bearer ${adminToken}` });
        const enabledDetourJourney = await makeRequest('POST', '/api/journey/plan', detourJourneyEndpoints);
        const enabledDetourLeg = enabledDetourJourney.data.itineraries
            .flatMap(itinerary => itinerary.legs)
            .find(leg => leg.routeId === detourTestRoute.id);
        assert(
            enabledRouteDetour.status === 200 && enabledDetourLeg?.detourActive === true &&
                enabledDetourLeg.floodedCoordinates.length === floodedCoordinates.length &&
                enabledDetourLeg.instruction.includes('via the detour around Test Flood Road'),
            'Enabled route-specific detour supplies alternate journey geometry, flood overlay, and directions'
        );
        const activeRoutePreview = await makeRequest('GET', `/api/routes/${detourTestRoute.id}`);
        assert(
            activeRoutePreview.status === 200 && activeRoutePreview.data.active_detour?.detour_steps?.[0]?.mode === 'Jeepney' &&
                activeRoutePreview.data.geometry === detourTestPaths.detour_geometry,
            'Public route preview switches to the configured map and instructions during an active detour'
        );
        const detourLayerName = detourTestRoute.mode_name.toLowerCase().includes('jeep') ? 'jeepneys'
            : detourTestRoute.mode_name.toLowerCase().includes('bus') ? 'buses' : 'tricycles';
        const activeDetourLayer = await makeRequest('GET', `/api/map/layers/${detourLayerName}`);
        const detourFeature = activeDetourLayer.data.features.find(feature => feature.properties.id === detourTestRoute.id);
        assert(
            activeDetourLayer.status === 200 &&
                JSON.stringify(detourFeature?.geometry.coordinates) === JSON.stringify(detourCoordinates) &&
                detourFeature?.properties.flooded_geometry?.coordinates?.length === floodedCoordinates.length,
            `Standalone map layer draws the enabled detour and includes its flooded-road overlay (status ${activeDetourLayer.status}, feature ${Boolean(detourFeature)}, coordinates ${detourFeature?.geometry?.coordinates?.length || 0}, flooded ${detourFeature?.properties?.flooded_geometry?.coordinates?.length || 0})`
        );

        await makeRequest('POST', `/api/admin/advisories/${createdDetourAdvisory.data.advisoryId}/toggle-status`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const inactiveDetourJourney = await makeRequest('POST', '/api/journey/plan', detourJourneyEndpoints);
        const inactiveDetourLeg = inactiveDetourJourney.data.itineraries
            .flatMap(itinerary => itinerary.legs)
            .find(leg => leg.routeId === detourTestRoute.id);
        assert(
            inactiveDetourJourney.status === 200 && inactiveDetourLeg && !inactiveDetourLeg.detourActive &&
                !inactiveDetourLeg.floodedCoordinates?.length,
            'Deactivating the advisory immediately restores the normal route geometry'
        );
        const inactiveRoutePreview = await makeRequest('GET', `/api/routes/${detourTestRoute.id}`);
        assert(
            inactiveRoutePreview.status === 200 && !inactiveRoutePreview.data.active_detour &&
                inactiveRoutePreview.data.geometry === detourTestRoute.geometry,
            'Public route preview returns to its normal map when the flood advisory is inactive'
        );
        await makeRequest('DELETE', `/api/admin/advisories/${createdDetourAdvisory.data.advisoryId}`, null, {
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

        // Admin Schools CRUD and public map propagation
        const newSchoolRes = await makeRequest('POST', '/api/admin/schools', {
            name: 'Dagupan Test Academy',
            type: 'SCHOOL',
            aliases: 'DTA',
            address: 'Test Street, Dagupan City',
            barangay: 'Poblacion Oeste',
            latitude: 16.0430,
            longitude: 120.3330,
            entrance_latitude: 16.0431,
            entrance_longitude: 120.3331,
            nearby_stops: ['Test Jeepney Stop'],
            verified: true,
            active: true
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(newSchoolRes.status === 201 && newSchoolRes.data.schoolId, 'Admin successfully creates a school');
        const createdSchoolId = newSchoolRes.data.schoolId;

        const listedSchools = await makeRequest('GET', '/api/admin/schools', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(
            listedSchools.status === 200 && listedSchools.data.some(school => school.id === createdSchoolId),
            'Admin school list includes newly created schools'
        );

        const updateSchoolRes = await makeRequest('PUT', `/api/admin/schools/${createdSchoolId}`, {
            name: 'Dagupan Test Academy Updated',
            type: 'COLLEGE',
            aliases: 'DTA Updated',
            address: 'Updated Test Street, Dagupan City',
            barangay: 'Poblacion Oeste',
            latitude: 16.0440,
            longitude: 120.3340,
            entrance_latitude: 16.0441,
            entrance_longitude: 120.3341,
            nearby_stops: ['Updated Test Stop'],
            verified: true,
            active: true
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(updateSchoolRes.status === 200, 'Admin successfully updates school details');

        const schoolsMapLayer = await makeRequest('GET', '/api/map/layers/schools');
        const updatedSchoolFeature = schoolsMapLayer.data.features.find(feature => feature.properties.id === createdSchoolId);
        assert(
            updatedSchoolFeature?.properties.name === 'Dagupan Test Academy Updated' &&
                updatedSchoolFeature.geometry.coordinates[0] === 120.3341,
            'Updated school details and entrance coordinates appear on the public map layer'
        );

        const invalidSchoolRes = await makeRequest('PUT', `/api/admin/schools/${createdSchoolId}`, {
            name: 'Dagupan Test Academy Updated', type: 'COLLEGE', latitude: 100, longitude: 120
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(invalidSchoolRes.status === 400, 'Admin school updates reject out-of-range coordinates');

        const delSchoolRes = await makeRequest('DELETE', `/api/admin/schools/${createdSchoolId}`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(delSchoolRes.status === 200, 'Admin successfully deletes a school');

        // Admin landmark positioning and public map propagation
        const adminLandmarksRes = await makeRequest('GET', '/api/admin/landmarks', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        const landmarkToMove = adminLandmarksRes.data.find(landmark => landmark.name === 'SM Center Dagupan');
        assert(adminLandmarksRes.status === 200 && landmarkToMove, 'Admin landmark list includes existing map landmarks');

        const movedCoordinates = {
            latitude: landmarkToMove.latitude + 0.0002,
            longitude: landmarkToMove.longitude + 0.0002
        };
        const moveLandmarkRes = await makeRequest('PUT', `/api/admin/landmarks/${landmarkToMove.id}`, movedCoordinates, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(moveLandmarkRes.status === 200, 'Admin can move an existing landmark');

        const movedLandmarkLayer = await makeRequest('GET', '/api/map/layers/landmarks');
        const movedLandmarkFeature = movedLandmarkLayer.data.features.find(feature => feature.properties.name === landmarkToMove.name);
        assert(
            movedLandmarkFeature?.geometry.coordinates[1] === movedCoordinates.latitude &&
                movedLandmarkFeature.geometry.coordinates[0] === movedCoordinates.longitude,
            'Moved landmark coordinates immediately appear on the public map layer'
        );

        const invalidLandmarkMove = await makeRequest('PUT', `/api/admin/landmarks/${landmarkToMove.id}`, {
            latitude: 91, longitude: movedCoordinates.longitude
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(invalidLandmarkMove.status === 400, 'Admin landmark moves reject out-of-range coordinates');

        const restoreLandmarkRes = await makeRequest('PUT', `/api/admin/landmarks/${landmarkToMove.id}`, {
            latitude: landmarkToMove.latitude,
            longitude: landmarkToMove.longitude
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(restoreLandmarkRes.status === 200, 'Landmark test restores the original map position');

        const newLandmarkRes = await makeRequest('POST', '/api/admin/landmarks', {
            name: 'Admin CRUD Test Landmark',
            type: 'PLAZA',
            latitude: 16.052,
            longitude: 120.347
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(newLandmarkRes.status === 201 && newLandmarkRes.data.landmarkId, 'Admin can create a landmark');
        const createdLandmarkId = newLandmarkRes.data.landmarkId;

        const createdLandmarkLayer = await makeRequest('GET', '/api/map/layers/landmarks');
        assert(
            createdLandmarkLayer.data.features.some(feature => feature.properties.id === createdLandmarkId),
            'New landmarks immediately appear on the public map layer'
        );

        const duplicateLandmarkRes = await makeRequest('POST', '/api/admin/landmarks', {
            name: 'Admin CRUD Test Landmark', type: 'PLAZA', latitude: 16.052, longitude: 120.347
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert(duplicateLandmarkRes.status === 409, 'Duplicate landmark names are rejected');

        const deleteLandmarkRes = await makeRequest('DELETE', `/api/admin/landmarks/${createdLandmarkId}`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert(deleteLandmarkRes.status === 200, 'Admin can delete a landmark');

        const deletedLandmarkLayer = await makeRequest('GET', '/api/map/layers/landmarks');
        assert(
            !deletedLandmarkLayer.data.features.some(feature => feature.properties.id === createdLandmarkId),
            'Deleted landmarks disappear from the public map layer'
        );

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
            name: 'Hovercraft',
            status: 'ACTIVE'
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

        // New popular route: Bolosan (was previously returning [])
        const routesBolosan = await makeRequest('GET', '/api/routes?search=Bolosan');
        assert(
            routesBolosan.status === 200 && routesBolosan.data.length >= 1,
            'GET /api/routes?search=Bolosan finds Dagupan–Bolosan/Salisay/Tambac/Tebeng route'
        );

        // New popular route: Binloc
        const routesBinloc = await makeRequest('GET', '/api/routes?search=Binloc');
        assert(
            routesBinloc.status === 200 && routesBinloc.data.length >= 1,
            'GET /api/routes?search=Binloc finds Dagupan–Bonuan Binloc route'
        );

        // New popular route: Boquig
        const routesBoquig = await makeRequest('GET', '/api/routes?search=Boquig');
        assert(
            routesBoquig.status === 200 && routesBoquig.data.length >= 1,
            'GET /api/routes?search=Boquig finds Dagupan–Bonuan Boquig route'
        );

        // New popular route: Downtown Loop
        const routesLoop = await makeRequest('GET', '/api/routes?search=Downtown+Loop');
        assert(
            routesLoop.status === 200 && routesLoop.data.length >= 1,
            'GET /api/routes?search=Downtown+Loop finds Dagupan Downtown Loop route'
        );

        // Lowercase partial: bonuan matches 4+ routes (Bonuan Beach, Bonuan Gueset–City Center, Bonuan Gueset/Tondaligan, Bonuan Binloc, Bonuan Boquig)
        const routesBonuanLower = await makeRequest('GET', '/api/routes?search=bonuan');
        assert(
            routesBonuanLower.status === 200 && routesBonuanLower.data.length >= 4,
            'GET /api/routes?search=bonuan (lowercase) matches 4+ Bonuan routes'
        );

        // Lucao now returns 2+ routes (Market–Lucao District + Dagupan–CSI Lucao)
        const routesLucao = await makeRequest('GET', '/api/routes?search=Lucao');
        assert(
            routesLucao.status === 200 && routesLucao.data.length >= 2,
            'GET /api/routes?search=Lucao finds 2+ Lucao routes'
        );

        // ====================================================================
        // [7. Dagupan City Schools & University Routing]
        // ====================================================================
        console.log('\n[7. Dagupan City Schools & University Routing]');

        const schoolsList = await makeRequest('GET', '/api/schools');
        assert(
            schoolsList.status === 200 && Array.isArray(schoolsList.data) && schoolsList.data.length >= 5,
            'GET /api/schools returns verified Dagupan institutions (5 seeded schools)'
        );

        const schoolSearchUPang = await makeRequest('GET', '/api/schools/search?q=UPang');
        assert(
            schoolSearchUPang.status === 200 && schoolSearchUPang.data.length >= 1 &&
            schoolSearchUPang.data[0].name.includes('Pangasinan'),
            'GET /api/schools/search?q=UPang finds PHINMA University of Pangasinan by alias'
        );

        const schoolDetail = await makeRequest('GET', `/api/schools/${schoolsList.data[0].id}`);
        assert(
            schoolDetail.status === 200 && schoolDetail.data.id === schoolsList.data[0].id &&
            Array.isArray(schoolDetail.data.nearby_stops) && schoolDetail.data.nearby_stops.length > 0,
            'GET /api/schools/:id returns school details with calculated nearby transit stops'
        );

        const suggestionsUPang = await makeRequest('GET', '/api/search/suggestions?q=UPang');
        assert(
            suggestionsUPang.status === 200 && suggestionsUPang.data.some(s => s.category === 'school'),
            'GET /api/search/suggestions?q=UPang includes school suggestion with SCHOOL category badge'
        );

        // ====================================================================
        // [8. Boundary Polygon Enforcement]
        // ====================================================================
        console.log('\n[8. Boundary Polygon Enforcement]');
        const { isInsideDagupanCity } = require('../server/utils/dagupanBoundary');

        assert(
            isInsideDagupanCity(16.0410, 120.3340) === true,
            'PHINMA UPang (16.0410, 120.3340) is strictly INSIDE Dagupan City boundary'
        );
        assert(
            isInsideDagupanCity(16.0440, 120.3385) === true,
            'University of Luzon (16.0440, 120.3385) is strictly INSIDE Dagupan City boundary'
        );
        assert(
            isInsideDagupanCity(16.0300, 120.2300) === false,
            'PSU Lingayen Campus (16.0300, 120.2300) is OUTSIDE Dagupan City boundary (rejected)'
        );
        assert(
            isInsideDagupanCity(16.0020, 120.3550) === false,
            'PCST Calasiao (16.0020, 120.3550) is OUTSIDE Dagupan City boundary (rejected)'
        );
        assert(
            isInsideDagupanCity(17.6130, 121.7260) === false,
            'USL Tuguegarao (17.6130, 121.7260) is OUTSIDE Dagupan City boundary (rejected)'
        );

        // ====================================================================
        // [9. Multi-Modal Journey Planner Engine]
        // ====================================================================
        console.log('\n[9. Multi-Modal Journey Planner Engine]');

        const journey400 = await makeRequest('POST', '/api/journey/plan', {});
        assert(
            journey400.status === 400,
            'POST /api/journey/plan returns 400 Bad Request when origin or destination is missing'
        );

        const journeyDirect = await makeRequest('POST', '/api/journey/plan', {
            origin: 'PHINMA University of Pangasinan',
            destination: 'Bonuan Beach'
        });
        assert(
            journeyDirect.status === 200 && Array.isArray(journeyDirect.data.itineraries) && journeyDirect.data.itineraries.length >= 1,
            'POST /api/journey/plan returns direct transit itineraries for UPang -> Bonuan Beach'
        );
        const topJourney = journeyDirect.data.itineraries[0];
        assert(
            topJourney.totalDurationFormatted.includes('approx.') && topJourney.totalFareFormatted.includes('₱'),
            'Journey itinerary formats travel duration with "approx." and fare with ₱ symbol'
        );
        assert(
            Array.isArray(topJourney.legs) && topJourney.legs.length >= 2,
            'Journey itinerary contains detailed legs (walking and sliced transit polyline)'
        );
        assert(
            journeyDirect.data.itineraries.some(itinerary => itinerary.primaryMode === 'MULTI_MODAL'),
            'POST /api/journey/plan includes a one-transfer option alongside direct routes'
        );

        const journeyNamedPlaces = await makeRequest('POST', '/api/journey/plan', {
            origin: { name: 'Upang' },
            destination: { name: 'Colegio de Dagupan' }
        });
        assert(
            journeyNamedPlaces.status === 200 && journeyNamedPlaces.data.origin.name === 'PHINMA University of Pangasinan' &&
            journeyNamedPlaces.data.destination.name === 'Colegio de Dagupan',
            'POST /api/journey/plan resolves name-only place objects from autocomplete'
        );

        const journeyBoat = await makeRequest('POST', '/api/journey/plan', {
            origin: { lat: 16.0390, lng: 120.3315, name: 'Downtown Market' },
            destination: { lat: 16.0630, lng: 120.3430, name: 'Bonuan Gueset Dock' },
            preferredModes: ['Boat']
        });
        assert(
            journeyBoat.status === 200 && journeyBoat.data.itineraries.some(it => it.primaryMode === 'Boat'),
            'POST /api/journey/plan returns river boat crossing option across Pantal River'
        );

        const journeyWalk = await makeRequest('POST', '/api/journey/plan', {
            origin: { lat: 16.0430, lng: 120.3330, name: 'City Plaza' },
            destination: { lat: 16.0445, lng: 120.3350, name: 'Herrero' }
        });
        assert(
            journeyWalk.status === 200 && journeyWalk.data.itineraries.some(it => it.primaryMode === 'Walking'),
            'POST /api/journey/plan provides direct walking itinerary for short distance (< 500m)'
        );

        // ====================================================================
        // [10. Flood-Aware Advisory Integration & Route Detours]
        // ====================================================================
        console.log('\n[10. Flood-Aware Advisory Integration & Route Detours]');

        const journeyFlood = await makeRequest('POST', '/api/journey/plan', {
            origin: 'Downtown Market',
            destination: 'Lucao District'
        });
        assert(
            journeyFlood.status === 200 && journeyFlood.data.itineraries.some(it => 
                it.floodStatus === 'DETOUR_ACTIVE' && it.floodWarning && it.floodWarning.includes('Route adjusted because a flood-affected road segment was detected')
            ),
            'Flood-affected itinerary displays commuter warning: "Route adjusted because a flood-affected road segment was detected"'
        );
        // ====================================================================
        // [11. Routes Directory Proximity & Location Search]
        // ====================================================================
        console.log('\n[11. Routes Directory Proximity & Location Search]');

        // 1. Proximity search around PHINMA UPang coordinates
        const nearbyUPang = await makeRequest('GET', '/api/routes/nearby?lat=16.0418&lng=120.3362');
        assert(
            nearbyUPang.status === 200 && Array.isArray(nearbyUPang.data) && nearbyUPang.data.length > 0,
            'GET /api/routes/nearby returns routes serving PHINMA UPang coordinates'
        );
        assert(
            nearbyUPang.data[0].walkDistanceMeters !== undefined && nearbyUPang.data[0].fromProximitySearch === true,
            'Nearby routes return walkDistanceMeters and fromProximitySearch flag'
        );

        // 2. Proximity search outside Dagupan boundary
        const outsideDagupan = await makeRequest('GET', '/api/routes/nearby?lat=14.5995&lng=120.9842');
        assert(
            outsideDagupan.status === 200 && outsideDagupan.data.outsideDagupan === true,
            'GET /api/routes/nearby rejects coordinates outside Dagupan boundary'
        );

        // 3. Proximity search with invalid params returns 400
        const invalidNearby = await makeRequest('GET', '/api/routes/nearby?lat=invalid&lng=120.3362');
        assert(
            invalidNearby.status === 400,
            'GET /api/routes/nearby with non-numeric coordinates returns 400 Bad Request'
        );

        // 4. Text search cannot infer served routes until route stops are configured
        const searchSchoolRoutes = await makeRequest('GET', '/api/routes?search=PHINMA+University+of+Pangasinan');
        assert(
            searchSchoolRoutes.status === 200 && Array.isArray(searchSchoolRoutes.data) && searchSchoolRoutes.data.length === 0,
            'GET /api/routes?search=PHINMA+University+of+Pangasinan needs configured stops to infer route service'
        );

        // ORS regression guard: road-following geometry must be server-side, safe, and easy to validate.
        const orsRouter = require('../server/services/orsRouter');
        assert(orsRouter && typeof orsRouter.buildRoadGeometryRequest === 'function', 'ORS router exports a request builder');
        const requestBody = orsRouter.buildRoadGeometryRequest([
            { lat: 16.0430, lng: 120.3330 },
            { lat: 16.0440, lng: 120.3350 }
        ], 'driving-car');
        assert(requestBody && requestBody.coordinates && requestBody.coordinates.length >= 2, 'ORS request builder preserves ordered road-following coordinates');
        assert(requestBody.coordinates[0][0] === 120.3330 && requestBody.coordinates[0][1] === 16.0430, 'ORS coordinates are normalized as [lng, lat] per ORS API contract');
        assert(orsRouter.buildRoadGeometryRequest([[120.3330, 16.0430], [120.3350, 16.0440]], 'foot-walking').profile === 'foot-walking', 'ORS supports the intended walking profile');
        let rejectsUnsupportedProfile = false;
        try {
            orsRouter.buildRoadGeometryRequest([[120.3330, 16.0430], [120.3350, 16.0440]], 'driving-hgv');
        } catch (error) {
            rejectsUnsupportedProfile = true;
        }
        assert(rejectsUnsupportedProfile, 'ORS request builder rejects unsupported routing profiles');
        const routeEligibility = require('../server/scripts/orsRoadGeometry');
        assert(typeof routeEligibility.previewOrsGeometry === 'function', 'ORS batch geometry script exposes its preview operation');
        assert(routeEligibility.getRouteSkipReason({ transport_mode_id: 3, geometry_corrected: null }, new Set([3])) === 'Boat routes use waterway geometry', 'ORS batch script skips boat routes');
        assert(routeEligibility.getRouteSkipReason({ transport_mode_id: 1, geometry_corrected: '{"type":"LineString"}' }, new Set([3])) === 'Corrected geometry already exists', 'ORS batch script preserves existing corrected geometry');

        const originalFetch = global.fetch;
        const denseCoordinates = Array.from({ length: 150 }, (_, index) => [120.33 + index / 100000, 16.04]);
        let capturedOrsRequest;
        try {
            global.fetch = async (url, options) => {
                capturedOrsRequest = { url, options };
                return {
                    ok: true,
                    json: async () => ({
                        features: [{
                            geometry: { type: 'LineString', coordinates: denseCoordinates },
                            properties: { summary: { distance: 1300, duration: 240 } }
                        }]
                    })
                };
            };
            const orsResult = await orsRouter.fetchRoadGeometry(
                [[120.33, 16.04], [120.34, 16.04]],
                'driving-car',
                { apiKey: 'test-key', baseUrl: 'https://ors.invalid' }
            );
            assert(orsResult.coordinates.length === 150, 'ORS adapter preserves dense returned road geometry');
            assert(capturedOrsRequest.url === 'https://ors.invalid/v2/directions/driving-car/geojson', 'ORS adapter calls the configured server-side endpoint');
            assert(capturedOrsRequest.options.headers.Authorization === 'test-key', 'ORS API key is sent in the backend Authorization header');
        } finally {
            global.fetch = originalFetch;
        }
        assert(typeof orsRouter.safeRouteGeometry === 'function', 'ORS router exposes a safe geometry normalizer');

        const osrmRouter = require('../server/services/osrmRouter');
        const roadGeometryRepair = require('../server/scripts/repairRoadGeometry');
        const coverageAudit = require('../server/scripts/coverageAudit');
        const routeGeometryQuality = require('../server/utils/routeGeometryQuality');
        const coarseGeometry = {
            type: 'LineString',
            coordinates: [[120.333, 16.043], [120.34, 16.05], [120.35, 16.06]],
        };
        const detailedGeometry = {
            type: 'LineString',
            coordinates: Array.from({ length: 20 }, (_, index) => [120.333 + index / 10000, 16.043]),
        };
        assert(roadGeometryRepair.needsRoadGeometry({ geometry: JSON.stringify(coarseGeometry) }), 'Road geometry repair detects sparse straight-line routes');
        assert(!roadGeometryRepair.needsRoadGeometry({ geometry: JSON.stringify(detailedGeometry) }), 'Road geometry repair preserves detailed existing routes');
        assert(routeGeometryQuality.isDetailedRoadGeometry(detailedGeometry), 'Map geometry quality accepts dense road-following paths');
        assert(!routeGeometryQuality.isDetailedRoadGeometry(coarseGeometry), 'Map geometry quality rejects sparse straight-line paths');
        const routeProximityMeters = coverageAudit.distanceToRouteGeometryMeters(16.001, 120.005, {
            type: 'LineString',
            coordinates: [[120, 16], [120.01, 16]],
        });
        assert(
            Math.abs(routeProximityMeters - 111) < 2,
            'Coverage audit measures nearest distance to the route segment, not only its vertices'
        );
        assert(
            coverageAudit.distanceToRouteGeometryMeters(16, 120, null) === Infinity &&
                coverageAudit.LOCATION_TYPES.includes('ROAD') && coverageAudit.LOCATION_TYPES.includes('LANDMARK'),
            'Coverage audit safely handles missing geometry and includes road/landmark categories'
        );
        assert(
            roadGeometryRepair.getRouteSkipReason({ transport_mode_id: 3, geometry: JSON.stringify(coarseGeometry) }, new Set([3])) === 'Boat routes use waterway geometry',
            'Road geometry repair leaves boat routes unchanged'
        );
        const jeepneyMapLayer = await makeRequest('GET', '/api/map/layers/jeepneys');
        assert(
            jeepneyMapLayer.status === 200 && jeepneyMapLayer.data.features.every(feature =>
                routeGeometryQuality.isDetailedRoadGeometry(feature.geometry)
            ),
            'Road map layers omit sparse, unverified straight-line route geometry'
        );

        const bypassMode = modesRes.data.find(mode => mode.name.toLowerCase().includes('jeep'));
        const bypassRouteGeometry = JSON.stringify(coarseGeometry);
        const bypassRouteCreated = await makeRequest('POST', '/api/admin/routes', {
            route_name: 'Unverified Web Map Bypass Test',
            transport_mode_id: bypassMode.id,
            origin: 'Dagupan Plaza',
            destination: 'Calasiao Town Plaza',
            estimated_time: 20,
            minimum_fare: 15,
            maximum_fare: 25,
            status: 'CLEAR',
            operating_status: 'ACTIVE',
            geometry: bypassRouteGeometry,
            geometry_corrected: bypassRouteGeometry,
            use_corrected_geometry: 1,
            allow_unverified_map_geometry: false
        }, { 'Authorization': `Bearer ${adminToken}` });
        const bypassRouteId = bypassRouteCreated.data?.routeId;
        const hiddenBypassCandidateLayer = await makeRequest('GET', '/api/map/layers/jeepneys');
        assert(
            bypassRouteCreated.status === 201 &&
                !hiddenBypassCandidateLayer.data.features.some(feature => feature.properties.id === bypassRouteId),
            'Low-detail route stays off the Web Map until an admin bypass is enabled'
        );

        const bypassRouteUpdate = await makeRequest('PUT', `/api/admin/routes/${bypassRouteId}`, {
            route_name: 'Unverified Web Map Bypass Test',
            transport_mode_id: bypassMode.id,
            origin: 'Dagupan Plaza',
            destination: 'Calasiao Town Plaza',
            estimated_time: 20,
            minimum_fare: 15,
            maximum_fare: 25,
            status: 'CLEAR',
            operating_status: 'ACTIVE',
            geometry: bypassRouteGeometry,
            geometry_corrected: bypassRouteGeometry,
            use_corrected_geometry: 1,
            allow_unverified_map_geometry: true
        }, { 'Authorization': `Bearer ${adminToken}` });
        const visibleBypassCandidateLayer = await makeRequest('GET', '/api/map/layers/jeepneys');
        const bypassedRouteDetails = await makeRequest('GET', `/api/routes/${bypassRouteId}`);
        const bypassedRouteFeature = visibleBypassCandidateLayer.data.features.find(feature => feature.properties.id === bypassRouteId);
        assert(
            bypassRouteUpdate.status === 200 && bypassedRouteFeature?.properties.geometry_needs_review === true &&
                bypassedRouteDetails.data.geometry_needs_review === true &&
                bypassedRouteDetails.data.allow_unverified_map_geometry === true,
            'Admin bypass displays structurally valid low-detail geometry while preserving its unverified warning'
        );
        await makeRequest('DELETE', `/api/admin/routes/${bypassRouteId}`, null, {
            'Authorization': `Bearer ${adminToken}`
        });

        const floodMapLayer = await makeRequest('GET', '/api/map/layers/flood-zones');
        assert(
            floodMapLayer.status === 200 && Array.isArray(floodMapLayer.data.features) && floodMapLayer.data.features.length === 0,
            'Flood map layer omits unverified placeholder geometry'
        );
        const inactiveBoatRouteIds = new Set(routesRes.data
            .filter(route => route.mode_name === 'Boat' && route.boat_operating_status !== 'ACTIVE')
            .map(route => route.id));
        const hiddenMapRouteIds = new Set(routesRes.data
            .filter(route => route.geometry_needs_review || route.map_preview_unavailable)
            .map(route => route.id));
        const boatMapLayer = await makeRequest('GET', '/api/map/layers/boats');
        const stopMapLayer = await makeRequest('GET', '/api/map/layers/stops');
        assert(
            boatMapLayer.status === 200 && boatMapLayer.data.features.every(feature =>
                !inactiveBoatRouteIds.has(feature.properties.id)
            ),
            'Boat map layers omit inactive services'
        );
        assert(
            stopMapLayer.status === 200 && stopMapLayer.data.features.every(feature =>
                !hiddenMapRouteIds.has(feature.properties.route_id)
            ),
            'Map stop layers omit stops for inactive or unverified routes'
        );

        const originalOsrmFetch = global.fetch;
        let capturedOsrmUrl;
        try {
            global.fetch = async (url) => {
                capturedOsrmUrl = String(url);
                return {
                    ok: true,
                    json: async () => ({
                        code: 'Ok',
                        waypoints: [{ distance: 8 }, { distance: 12 }],
                        routes: [{
                            distance: 1300,
                            duration: 240,
                            geometry: {
                                type: 'LineString',
                                coordinates: denseCoordinates,
                            },
                        }],
                    }),
                };
            };
            const osrmResult = await osrmRouter.fetchRoadRoute(
                [[120.33, 16.04], [120.34, 16.04]],
                { baseUrl: 'https://osrm.invalid', maxSnapDistanceMeters: 30 }
            );
            assert(osrmResult.coordinates.length === 150, 'OSRM route adapter preserves dense road geometry');
            assert(capturedOsrmUrl.startsWith('https://osrm.invalid/route/v1/driving/'), 'OSRM route adapter requests road-following geometry');
            assert(osrmResult.waypointSnapDistances.every(distance => distance <= 30), 'OSRM route adapter validates stop-to-road snapping');
        } finally {
            global.fetch = originalOsrmFetch;
        }

    } catch (err) {
        console.error('Test execution error:', err);
        failed++;
    } finally {
        if (server) {
            server.close();
        }
        await disconnectDB();
        if (mongod) {
            await mongod.stop();
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
