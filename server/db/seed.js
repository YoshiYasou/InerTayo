const bcrypt = require('bcryptjs');
const { query, initSchema } = require('./database');

async function seed() {
    console.log('Seeding InerTayo database with Dagupan City transit data...');

    // Initialize Schema
    await initSchema();

    // Clear existing data in reverse dependency order
    await query.run('DELETE FROM landmarks');
    await query.run('DELETE FROM saved_routes');
    await query.run('DELETE FROM advisory_routes');
    await query.run('DELETE FROM advisories');
    await query.run('DELETE FROM feedback');
    await query.run('DELETE FROM fares');
    await query.run('DELETE FROM route_steps');
    await query.run('DELETE FROM stops');
    await query.run('DELETE FROM routes');
    await query.run('DELETE FROM transport_modes');
    await query.run('DELETE FROM users');
    try { await query.run('DELETE FROM sqlite_sequence'); } catch (e) {}

    // 1. Seed Users
    const adminPasswordHash = await bcrypt.hash('AdminPassword123!', 10);
    const commuterPasswordHash = await bcrypt.hash('Commuter123!', 10);

    const adminUser = await query.run(
        `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`,
        ['admin', 'admin@inertayo.ph', adminPasswordHash, 'ADMIN']
    );
    const commuterUser = await query.run(
        `INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)`,
        ['commuter', 'commuter@inertayo.ph', commuterPasswordHash, 'COMMUTER']
    );
    console.log('Users seeded (admin: admin@inertayo.ph / AdminPassword123!)');

    // 2. Seed Transport Modes
    const jeepney = await query.run(
        `INSERT INTO transport_modes (name, description, icon) VALUES (?, ?, ?)`,
        ['Jeepney', 'Classic & Modern e-Jeeps', 'jeepney']
    );
    const tricycle = await query.run(
        `INSERT INTO transport_modes (name, description, icon) VALUES (?, ?, ?)`,
        ['Tricycle', 'Last-mile neighborhood transit', 'tricycle']
    );
    const bus = await query.run(
        `INSERT INTO transport_modes (name, description, icon) VALUES (?, ?, ?)`,
        ['Bus', 'Dagupan Loop & Intercity transit', 'bus']
    );
    console.log('Transport modes seeded.');

    // 3. Seed 6 Initial Routes per §6
    // Route 1: Dagupan – Bonuan Beach (Jeepney)
    const r1 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan – Bonuan Beach',
            jeepney.lastID,
            'Dagupan City Center',
            'Bonuan Beach, Dagupan',
            20,
            35,
            15.00,
            25.00,
            'CLEAR',
            'Direct coastal route linking downtown Dagupan with Bonuan Boquig, Bonuan Gueset, and Tondaligan Beach Park.'
        ]
    );

    // Route 2: CSI Mall Loop (Tricycle)
    const r2 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'CSI Mall Loop',
            tricycle.lastID,
            'Downtown Dagupan',
            'CSI Mall, Dagupan',
            10,
            18,
            20.00,
            40.00,
            'CLEAR',
            'High-frequency tricycle loop connecting downtown commercial hubs with CSI The City Mall Lucao.'
        ]
    );

    // Route 3: Dagupan – Calasiao (Jeepney) - Advisory active per design
    const r3 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan – Calasiao',
            jeepney.lastID,
            'Dagupan City Plaza',
            'Calasiao Town Plaza',
            15,
            30,
            12.00,
            20.00,
            'DETOUR_ACTIVE',
            'Major southern transit corridor connecting Dagupan Plaza with Calasiao. Currently detour routed via De Venecia Road due to flooded sections on AB Fernandez Ave.'
        ]
    );

    // Route 4: Market – Lucao District (Tricycle) - Advisory active per design
    const r4 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Market – Lucao District',
            tricycle.lastID,
            'Dagupan Public Market',
            'Lucao District',
            12,
            25,
            25.00,
            45.00,
            'DETOUR_ACTIVE',
            'Direct tricycle service connecting Malimgas Market with schools and subdivisions in Lucao District, currently taking outer ring bypass.'
        ]
    );

    // Route 5: Dagupan – Mangaldan (Bus) - Advisory active per design
    const r5 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan – Mangaldan',
            bus.lastID,
            'Dagupan Bus Terminal (Perez Blvd)',
            'Mangaldan Public Plaza',
            25,
            40,
            20.00,
            35.00,
            'DETOUR_ACTIVE',
            'Inter-town loop bus traversing eastern Dagupan towards Mangaldan with stops at Mayombo and Tebeng; rerouted around flood corridors.'
        ]
    );

    // Route 6: Bonuan Gueset – City Center (Jeepney)
    const r6 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Bonuan Gueset – City Center',
            jeepney.lastID,
            'Bonuan Gueset',
            'City Center, Dagupan',
            18,
            28,
            15.00,
            25.00,
            'CLEAR',
            'Northern commuter line connecting university students and residents along Gueset highway to downtown Dagupan.'
        ]
    );

    console.log('Routes seeded (6 routes).');

    // 4. Seed Stops for Routes
    const stopsData = [
        // Route 1 Stops (Dagupan – Bonuan Beach)
        { routeId: r1.lastID, order: 1, name: 'Dagupan City Plaza Terminal', desc: 'Central downtown terminal with multi-mode transfers', transfer: 1, lat: 16.0435, lng: 120.3340 },
        { routeId: r1.lastID, order: 2, name: 'Perez Boulevard / Herrero', desc: 'Commercial area with heavy passenger boarding', transfer: 0, lat: 16.0415, lng: 120.3385 },
        { routeId: r1.lastID, order: 3, name: 'Mayombo District Junction', desc: 'Intersection leading to northern bridges', transfer: 0, lat: 16.0480, lng: 120.3420 },
        { routeId: r1.lastID, order: 4, name: 'Dawel Bridge North Entry', desc: 'River crossing into Bonuan peninsula', transfer: 0, lat: 16.0590, lng: 120.3440 },
        { routeId: r1.lastID, order: 5, name: 'Bonuan Boquig Junction', desc: 'Residential and school drop-off point', transfer: 0, lat: 16.0680, lng: 120.3500 },
        { routeId: r1.lastID, order: 6, name: 'Bonuan Gueset Station', desc: 'Barangay center and market area', transfer: 1, lat: 16.0750, lng: 120.3450 },
        { routeId: r1.lastID, order: 7, name: 'Tondaligan Beach Park Entrance', desc: 'Coastal terminus and beach promenade', transfer: 0, lat: 16.0880, lng: 120.3520 },

        // Route 2 Stops (CSI Mall Loop)
        { routeId: r2.lastID, order: 1, name: 'Galvan St Commercial TODA', desc: 'Downtown tricycle loading station', transfer: 1, lat: 16.0438, lng: 120.3330 },
        { routeId: r2.lastID, order: 2, name: 'Fernandez Ave Crossroad', desc: 'Midpoint pickup near commercial banks', transfer: 0, lat: 16.0400, lng: 120.3300 },
        { routeId: r2.lastID, order: 3, name: 'Lucao District Arch', desc: 'Entry to Lucao residential and hospital row', transfer: 0, lat: 16.0320, lng: 120.3250 },
        { routeId: r2.lastID, order: 4, name: 'CSI The City Mall Lucao Entrance', desc: 'Main mall entrance drop-off point', transfer: 1, lat: 16.0270, lng: 120.3220 },

        // Route 3 Stops (Dagupan – Calasiao)
        { routeId: r3.lastID, order: 1, name: 'Dagupan City Plaza', desc: 'Main terminal near St. John Cathedral', transfer: 1, lat: 16.0435, lng: 120.3340 },
        { routeId: r3.lastID, order: 2, name: 'AB Fernandez East Junction', desc: 'Key intersection (flooding alert prone)', transfer: 0, lat: 16.0450, lng: 120.3390 },
        { routeId: r3.lastID, order: 3, name: 'Caranglaan Flyover / Bypass', desc: 'Detour connection point during high tide', transfer: 0, lat: 16.0320, lng: 120.3550 },
        { routeId: r3.lastID, order: 4, name: 'Banaoang Highway Stop', desc: 'Boundary between Dagupan and Calasiao', transfer: 0, lat: 16.0210, lng: 120.3580 },
        { routeId: r3.lastID, order: 5, name: 'Calasiao Town Plaza Terminal', desc: 'Town center terminus near Sts. Peter & Paul Parish', transfer: 1, lat: 16.0120, lng: 120.3600 },

        // Route 4 Stops (Market – Lucao)
        { routeId: r4.lastID, order: 1, name: 'Dagupan Public Market South TODA', desc: 'Market center loading terminal', transfer: 1, lat: 16.0440, lng: 120.3370 },
        { routeId: r4.lastID, order: 2, name: 'Perez Blvd corner Burgos St', desc: 'Commercial strip transfer zone', transfer: 0, lat: 16.0380, lng: 120.3340 },
        { routeId: r4.lastID, order: 3, name: 'Lucao Elementary School', desc: 'Community and campus terminal', transfer: 0, lat: 16.0290, lng: 120.3260 },
        { routeId: r4.lastID, order: 4, name: 'Lucao District Outer Terminal', desc: 'Final passenger drop-off loop', transfer: 0, lat: 16.0250, lng: 120.3200 },

        // Route 5 Stops (Dagupan – Mangaldan)
        { routeId: r5.lastID, order: 1, name: 'Perez Blvd Integrated Bus Terminal', desc: 'Inter-city bus terminal bay', transfer: 1, lat: 16.0415, lng: 120.3385 },
        { routeId: r5.lastID, order: 2, name: 'Mayombo District Terminal', desc: 'Eastern suburban boarding station', transfer: 0, lat: 16.0480, lng: 120.3450 },
        { routeId: r5.lastID, order: 3, name: 'Mangin Highway Junction', desc: 'Junction connecting provincial road', transfer: 0, lat: 16.0550, lng: 120.3650 },
        { routeId: r5.lastID, order: 4, name: 'Tebeng Intersection', desc: 'Secondary stop before municipal border', transfer: 0, lat: 16.0620, lng: 120.3800 },
        { routeId: r5.lastID, order: 5, name: 'Mangaldan Public Plaza Terminal', desc: 'Mangaldan commercial center and plaza', transfer: 1, lat: 16.0710, lng: 120.4020 },

        // Route 6 Stops (Bonuan Gueset – City Center)
        { routeId: r6.lastID, order: 1, name: 'Bonuan Gueset North TODA', desc: 'Northern residential staging zone', transfer: 1, lat: 16.0780, lng: 120.3430 },
        { routeId: r6.lastID, order: 2, name: 'Bonuan Binloc Entryway', desc: 'Drop-off for coastal schools', transfer: 0, lat: 16.0710, lng: 120.3440 },
        { routeId: r6.lastID, order: 3, name: 'Dawel River Bridge', desc: 'Bridge crossing southbound', transfer: 0, lat: 16.0590, lng: 120.3440 },
        { routeId: r6.lastID, order: 4, name: 'Dagupan Doctors Villaflor Hospital', desc: 'Major medical center stop', transfer: 0, lat: 16.0490, lng: 120.3400 },
        { routeId: r6.lastID, order: 5, name: 'Downtown MH Del Pilar St', desc: 'Central business and university terminus', transfer: 1, lat: 16.0420, lng: 120.3350 }
    ];

    for (const stop of stopsData) {
        await query.run(
            `INSERT INTO stops (route_id, stop_name, stop_order, description, is_transfer_point, latitude, longitude)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [stop.routeId, stop.name, stop.order, stop.desc, stop.transfer, stop.lat, stop.lng]
        );
    }
    console.log('Stops seeded.');

    // 5. Seed Route Steps (Exact step-by-step directions matching Page 4 of the specification, no blah-blah)
    const stepsData = [
        // Route 1: Dagupan – Bonuan Beach
        { routeId: r1.lastID, step: 1, mode: 'Walk', instruction: 'Walk to Bonuan Terminal', info: 'Head east on foot toward the designated Bonuan jeepney terminal station along Perez Blvd.' },
        { routeId: r1.lastID, step: 2, mode: 'Jeepney', instruction: "Board Jeepney 'Bonuan–Dagupan'", info: 'Ride along Perez Blvd across Dawel Bridge toward Bonuan district.' },
        { routeId: r1.lastID, step: 3, mode: 'Tricycle', instruction: 'Transfer to Tricycle at Dagupan Plaza', info: 'Transfer point. Average 3 min wait for a direct tricycle. Fare is ₱8.' },
        { routeId: r1.lastID, step: 4, mode: 'Walk', instruction: 'Arrive at Bonuan Beach', info: 'Drop off and take a brief 2 min walk to the main beach front entrance.' },

        // Route 2: CSI Mall Loop
        { routeId: r2.lastID, step: 1, mode: 'Walk', instruction: 'Proceed to Galvan St Tricycle Terminal', info: 'Short 2-minute walk from downtown commercial strip to the Galvan St TODA station.' },
        { routeId: r2.lastID, step: 2, mode: 'Tricycle', instruction: 'Board Lucao-bound Tricycle', info: 'Direct express trip via Fernandez Ave straight to CSI The City Mall.' },
        { routeId: r2.lastID, step: 3, mode: 'Walk', instruction: 'Alight at CSI Mall North Entrance', info: 'Arrive at CSI Mall Lucao entrance atrium.' },

        // Route 3: Dagupan – Calasiao
        { routeId: r3.lastID, step: 1, mode: 'Walk', instruction: 'Walk to City Plaza Jeepney Terminal', info: 'Walk 2 minutes to the City Plaza staging area near St. John Cathedral.' },
        { routeId: r3.lastID, step: 2, mode: 'Jeepney', instruction: "Board Calasiao-bound Jeepney (Via De Venecia Bypass)", info: 'During high tide, vehicles detour along De Venecia bypass to avoid flooded AB Fernandez corridor.' },
        { routeId: r3.lastID, step: 3, mode: 'Walk', instruction: 'Arrive at Calasiao Town Plaza', info: 'Alight at Calasiao Town Plaza near public market and puto stalls.' },

        // Route 4: Market – Lucao District
        { routeId: r4.lastID, step: 1, mode: 'Walk', instruction: 'Walk to Public Market TODA Station', info: 'Head to Malimgas market south tricycle terminal.' },
        { routeId: r4.lastID, step: 2, mode: 'Tricycle', instruction: 'Board TODA Tricycle for Lucao District', info: 'Driver takes detour route around low-lying waterlogged sections.' },
        { routeId: r4.lastID, step: 3, mode: 'Walk', instruction: 'Arrive at Lucao Destination', info: 'Step off directly at destination in Lucao district.' },

        // Route 5: Dagupan – Mangaldan
        { routeId: r5.lastID, step: 1, mode: 'Walk', instruction: 'Walk to Integrated Bus Terminal', info: 'Located at Perez Blvd bus bay.' },
        { routeId: r5.lastID, step: 2, mode: 'Bus', instruction: 'Board Mangaldan-bound Dagupan Loop Bus', info: 'Mini-bus traversing eastern highway via Mayombo and Tebeng.' },
        { routeId: r5.lastID, step: 3, mode: 'Walk', instruction: 'Alight at Mangaldan Plaza', info: 'Arrival at Mangaldan town center.' },

        // Route 6: Bonuan Gueset – City Center
        { routeId: r6.lastID, step: 1, mode: 'Walk', instruction: 'Walk to Gueset Jeepney Stop', info: 'Station located near Gueset Barangay Hall.' },
        { routeId: r6.lastID, step: 2, mode: 'Jeepney', instruction: 'Board Downtown-bound Jeepney', info: 'Scenic transit passing Villaflor Hospital and downtown avenues.' },
        { routeId: r6.lastID, step: 3, mode: 'Walk', instruction: 'Arrive at Downtown City Center', info: 'Alight on MH Del Pilar St near university campuses.' }
    ];

    for (const s of stepsData) {
        await query.run(
            `INSERT INTO route_steps (route_id, step_number, mode, instruction, location_info)
             VALUES (?, ?, ?, ?, ?)`,
            [s.routeId, s.step, s.mode, s.instruction, s.info]
        );
    }
    console.log('Route steps seeded.');

    // 6. Seed Fares (with 20% discount for Student, Senior Citizen, PWD)
    const routesList = [
        { id: r1.lastID, base: 15.00 },
        { id: r2.lastID, base: 20.00 },
        { id: r3.lastID, base: 12.00 },
        { id: r4.lastID, base: 25.00 },
        { id: r5.lastID, base: 20.00 },
        { id: r6.lastID, base: 15.00 }
    ];

    for (const r of routesList) {
        // Regular
        await query.run(
            `INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare, effective_date)
             VALUES (?, 'REGULAR', ?, 0, ?, '2026-01-01')`,
            [r.id, r.base, r.base]
        );
        // Student (20% discount)
        const studentFare = Number((r.base * 0.8).toFixed(2));
        await query.run(
            `INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare, effective_date)
             VALUES (?, 'STUDENT', ?, 20, ?, '2026-01-01')`,
            [r.id, r.base, studentFare]
        );
        // Senior Citizen (20% discount)
        const seniorFare = Number((r.base * 0.8).toFixed(2));
        await query.run(
            `INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare, effective_date)
             VALUES (?, 'SENIOR_CITIZEN', ?, 20, ?, '2026-01-01')`,
            [r.id, r.base, seniorFare]
        );
        // PWD (20% discount)
        const pwdFare = Number((r.base * 0.8).toFixed(2));
        await query.run(
            `INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare, effective_date)
             VALUES (?, 'PWD', ?, 20, ?, '2026-01-01')`,
            [r.id, r.base, pwdFare]
        );
    }
    console.log('Fares seeded.');

    // 7. Seed Advisories (Matching Page 1 & Page 3 high-tide alert, rephrased per §0.3)
    const adv = await query.run(
        `INSERT INTO advisories (title, affected_road, condition, description, status)
         VALUES (?, ?, ?, ?, ?)`,
        [
            'HIGH TIDE ADVISORY',
            'AB Fernandez Ave, Perez Blvd, and 2 other roads',
            'FLOODED',
            'AB Fernandez Ave, Perez Blvd, and 2 other roads are currently flooded. Routes below reflect this advisory.',
            'ACTIVE'
        ]
    );

    // Link advisory to affected routes (Route 3, Route 4, Route 5) using advisory_routes per §4
    await query.run(`INSERT INTO advisory_routes (advisory_id, route_id) VALUES (?, ?)`, [adv.lastID, r3.lastID]);
    await query.run(`INSERT INTO advisory_routes (advisory_id, route_id) VALUES (?, ?)`, [adv.lastID, r4.lastID]);
    await query.run(`INSERT INTO advisory_routes (advisory_id, route_id) VALUES (?, ?)`, [adv.lastID, r5.lastID]);
    console.log('Advisories seeded.');

    // 8. Seed Sample Feedback
    await query.run(
        `INSERT INTO feedback (user_id, name, email, message, status) VALUES (?, ?, ?, ?, ?)`,
        [
            commuterUser.lastID,
            'Mariano Rivera',
            'mariano@commuter.ph',
            'Thank you for providing flood advisories for AB Fernandez Avenue. This saved me from getting stranded during high tide!',
            'NEW'
        ]
    );

    // 9. Seed Sample Saved Route for Commuter
    await query.run(
        `INSERT INTO saved_routes (user_id, route_id) VALUES (?, ?)`,
        [commuterUser.lastID, r1.lastID]
    );
    console.log('Saved route seeded.');

    // 10. Seed Dagupan City Landmarks for map reference & search autocomplete
    const landmarksData = [
        { name: 'SM Center Dagupan', lat: 16.0468, lng: 120.3418, type: 'MALL' },
        { name: 'CSI The City Mall Lucao', lat: 16.0270, lng: 120.3220, type: 'MALL' },
        { name: 'Dagupan Public Market / Malimgas', lat: 16.0440, lng: 120.3370, type: 'TERMINAL' },
        { name: 'Dagupan City Plaza & St. John Cathedral', lat: 16.0435, lng: 120.3340, type: 'PLAZA' },
        { name: 'Dagupan Doctors Villaflor Memorial Hospital', lat: 16.0490, lng: 120.3400, type: 'HOSPITAL' },
        { name: 'Robinsons Place Pangasinan', lat: 16.0180, lng: 120.3540, type: 'MALL' },
        { name: 'Tondaligan People\'s Park & Bonuan Beach', lat: 16.0880, lng: 120.3520, type: 'BEACH' },
        { name: 'University of Pangasinan (PHINMA)', lat: 16.0418, lng: 120.3362, type: 'SCHOOL' },
        { name: 'Calasiao Town Plaza & Sts. Peter & Paul Parish', lat: 16.0120, lng: 120.3600, type: 'PLAZA' },
        { name: 'Mangaldan Public Plaza', lat: 16.0710, lng: 120.4020, type: 'PLAZA' },
        { name: 'Perez Blvd Integrated Bus Terminal', lat: 16.0415, lng: 120.3385, type: 'TERMINAL' },
        { name: 'Dawel Bridge River Entry', lat: 16.0590, lng: 120.3440, type: 'TERMINAL' }
    ];

    for (const lm of landmarksData) {
        await query.run(
            `INSERT INTO landmarks (name, latitude, longitude, type) VALUES (?, ?, ?, ?)`,
            [lm.name, lm.lat, lm.lng, lm.type]
        );
    }
    console.log('Landmarks seeded (12 reference points).');

    console.log('Initial sample database seeding completed successfully!');
}

if (require.main === module) {
    seed()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('Seed error:', err);
            process.exit(1);
        });
}

module.exports = { seed };
