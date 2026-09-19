const bcrypt = require('bcryptjs');
const { query, initSchema } = require('./database');

async function seed() {
    console.log('Seeding InerTayo database with Dagupan City transit data...');

    // Initialize Schema
    await initSchema();

    // Clear existing data in reverse dependency order
    try { await query.run('DELETE FROM route_segments'); } catch (e) {}
    try { await query.run('DELETE FROM boat_route_details'); } catch (e) {}
    try { await query.run('DELETE FROM locations'); } catch (e) {}
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
        `INSERT INTO transport_modes (name, description, icon, status) VALUES (?, ?, ?, ?)`,
        ['Jeepney', 'Classic & Modern e-Jeeps', 'jeepney', 'ACTIVE']
    );
    const tricycle = await query.run(
        `INSERT INTO transport_modes (name, description, icon, status) VALUES (?, ?, ?, ?)`,
        ['Tricycle', 'Last-mile neighborhood transit', 'tricycle', 'ACTIVE']
    );
    const bus = await query.run(
        `INSERT INTO transport_modes (name, description, icon, status) VALUES (?, ?, ?, ?)`,
        ['Bus', 'Dagupan Loop & Intercity transit', 'bus', 'ACTIVE']
    );
    const boat = await query.run(
        `INSERT INTO transport_modes (name, description, icon, status) VALUES (?, ?, ?, ?)`,
        ['Boat', 'River & waterway transport via Pantal River', 'boat', 'ACTIVE']
    );
    console.log('Transport modes seeded (Jeepney, Tricycle, Bus, Boat).');

    // 3. Seed 6 Initial Routes per §6 with GeoJSON LineString geometry
    // Route 1: Dagupan – Bonuan Beach (Jeepney)
    const r1 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan – Bonuan Beach',
            jeepney.lastID,
            'Dagupan Plaza',
            'Bonuan Beach, Dagupan',
            20,
            35,
            15.00,
            25.00,
            'CLEAR',
            'Direct coastal route linking downtown Dagupan with Bonuan Boquig, Bonuan Gueset, and Tondaligan Beach Park.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3340, 16.0435],
                    [120.3385, 16.0415],
                    [120.3420, 16.0480],
                    [120.3440, 16.0590],
                    [120.3500, 16.0680],
                    [120.3450, 16.0750],
                    [120.3520, 16.0880]
                ]
            })
        ]
    );

    // Route 2: CSI Mall Loop (Tricycle)
    const r2 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            'High-frequency tricycle loop connecting downtown commercial hubs with CSI The City Mall Lucao.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3330, 16.0438],
                    [120.3300, 16.0400],
                    [120.3250, 16.0320],
                    [120.3220, 16.0270]
                ]
            })
        ]
    );

    // Route 3: Dagupan – Calasiao (Jeepney) - Advisory active per design
    const r3 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            'Major southern transit corridor connecting Dagupan Plaza with Calasiao. Currently detour routed via De Venecia Road due to flooded sections on AB Fernandez Ave.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3340, 16.0435],
                    [120.3390, 16.0450],
                    [120.3550, 16.0320],
                    [120.3580, 16.0210],
                    [120.3600, 16.0120]
                ]
            })
        ]
    );

    // Route 4: Market – Lucao District (Tricycle) - Advisory active per design
    const r4 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            'Direct tricycle service connecting Malimgas Market with schools and subdivisions in Lucao District, currently taking outer ring bypass.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3370, 16.0440],
                    [120.3340, 16.0380],
                    [120.3260, 16.0290],
                    [120.3200, 16.0250]
                ]
            })
        ]
    );

    // Route 5: Dagupan – Mangaldan (Bus) - Advisory active per design
    const r5 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            'Inter-town loop bus traversing eastern Dagupan towards Mangaldan with stops at Mayombo and Tebeng; rerouted around flood corridors.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3385, 16.0415],
                    [120.3450, 16.0480],
                    [120.3650, 16.0550],
                    [120.3800, 16.0620],
                    [120.4020, 16.0710]
                ]
            })
        ]
    );

    // Route 6: Bonuan Gueset – City Center (Jeepney)
    const r6 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            'Northern commuter line connecting university students and residents along Gueset highway to downtown Dagupan.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3450, 16.0750],
                    [120.3440, 16.0590],
                    [120.3420, 16.0480],
                    [120.3385, 16.0415],
                    [120.3340, 16.0435]
                ]
            })
        ]
    );

    // Route 7: Dagupan – Bonuan Gueset / Tondaligan (Jeepney)
    const r7 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan – Bonuan Gueset / Tondaligan',
            jeepney.lastID,
            'Dagupan Plaza',
            'Tondaligan Beach',
            22,
            35,
            15.00,
            25.00,
            'CLEAR',
            'Popular coastal jeepney route from downtown Dagupan Plaza through Bonuan Gueset barangay to Tondaligan Beach and People\'s Park along the South China Sea.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3340, 16.0435],
                    [120.3385, 16.0415],
                    [120.3420, 16.0480],
                    [120.3440, 16.0590],
                    [120.3450, 16.0750],
                    [120.3520, 16.0880]
                ]
            })
        ]
    );

    // Route 8: Dagupan – Bonuan Binloc (Jeepney)
    const r8 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan – Bonuan Binloc',
            jeepney.lastID,
            'Dagupan Plaza',
            'Bonuan Binloc',
            18,
            28,
            15.00,
            20.00,
            'CLEAR',
            'Direct jeepney service from Dagupan Plaza to Bonuan Binloc barangay via Mayombo District and Dawel Bridge. Serves schools, residences, and the fishing community in Binloc.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3340, 16.0435],
                    [120.3385, 16.0415],
                    [120.3420, 16.0480],
                    [120.3440, 16.0590],
                    [120.3470, 16.0700],
                    [120.3490, 16.0760]
                ]
            })
        ]
    );

    // Route 9: Dagupan – Bonuan Boquig (Jeepney)
    const r9 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan – Bonuan Boquig',
            jeepney.lastID,
            'Dagupan Plaza',
            'Bonuan Boquig',
            15,
            25,
            12.00,
            20.00,
            'CLEAR',
            'Jeepney route from Dagupan City Plaza to Bonuan Boquig barangay via Dawel Bridge. Passes through Herrero-Perez commercial strip and serves the northern Bonuan coastal communities.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3340, 16.0435],
                    [120.3385, 16.0415],
                    [120.3420, 16.0480],
                    [120.3440, 16.0590],
                    [120.3500, 16.0680]
                ]
            })
        ]
    );

    // Route 10: Dagupan – CSI Lucao (Jeepney)
    const r10 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan – CSI Lucao',
            jeepney.lastID,
            'Dagupan Plaza',
            'CSI The City Mall Lucao',
            12,
            20,
            15.00,
            25.00,
            'CLEAR',
            'Direct jeepney service from Dagupan Plaza to CSI The City Mall in Lucao District. Route passes through AB Fernandez Avenue and Lucao Road serving shoppers, students, and workers in Lucao.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3340, 16.0435],
                    [120.3370, 16.0440],
                    [120.3330, 16.0400],
                    [120.3280, 16.0340],
                    [120.3220, 16.0270]
                ]
            })
        ]
    );

    // Route 11: Dagupan Downtown Loop (Jeepney)
    const r11 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan Downtown Loop',
            jeepney.lastID,
            'Dagupan Plaza',
            'Dagupan Plaza',
            15,
            22,
            12.00,
            15.00,
            'CLEAR',
            'Circular jeepney loop around Dagupan City downtown core. Covers AB Fernandez Ave, Perez Boulevard, Galvan Street, M.H. Del Pilar Street, Arellano Street, and Rizal Street. High frequency service for shoppers and commuters in the city center.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3340, 16.0435],
                    [120.3380, 16.0440],
                    [120.3415, 16.0415],
                    [120.3400, 16.0400],
                    [120.3370, 16.0385],
                    [120.3330, 16.0410],
                    [120.3340, 16.0435]
                ]
            })
        ]
    );

    // Route 12: Dagupan – Bolosan / Salisay / Tambac / Tebeng (Jeepney)
    const r12 = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, detour_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Dagupan – Bolosan / Salisay / Tambac / Tebeng',
            jeepney.lastID,
            'Dagupan Plaza',
            'Tebeng District',
            25,
            38,
            15.00,
            25.00,
            'CLEAR',
            'Northern jeepney route from Dagupan Plaza serving the outer barangays: Bolosan, Salisay, Tambac, and Tebeng. Follows Bolosan Road through residential and agricultural communities north of the city center.',
            JSON.stringify({
                type: 'LineString',
                coordinates: [
                    [120.3340, 16.0435],
                    [120.3310, 16.0460],
                    [120.3280, 16.0510],
                    [120.3250, 16.0560],
                    [120.3220, 16.0620],
                    [120.3190, 16.0680]
                ]
            })
        ]
    );

    console.log('Routes seeded (12 routes with GeoJSON geometry).');

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
        { routeId: r6.lastID, order: 5, name: 'Downtown MH Del Pilar St', desc: 'Central business and university terminus', transfer: 1, lat: 16.0420, lng: 120.3350 },

        // Route 7 Stops (Dagupan – Bonuan Gueset / Tondaligan)
        { routeId: r7.lastID, order: 1, name: 'Dagupan Plaza – Tondaligan Terminal', desc: 'City plaza jeepney boarding point for Bonuan Gueset/Tondaligan route', transfer: 1, lat: 16.0435, lng: 120.3340 },
        { routeId: r7.lastID, order: 2, name: 'Perez Blvd / Herrero Junction', desc: 'Commercial boarding zone along Perez Boulevard', transfer: 0, lat: 16.0415, lng: 120.3385 },
        { routeId: r7.lastID, order: 3, name: 'Mayombo District Northbound', desc: 'Northbound junction towards Bonuan barangays', transfer: 0, lat: 16.0480, lng: 120.3420 },
        { routeId: r7.lastID, order: 4, name: 'Dawel Bridge Northbound', desc: 'River crossing into Bonuan peninsula', transfer: 0, lat: 16.0590, lng: 120.3440 },
        { routeId: r7.lastID, order: 5, name: 'Bonuan Gueset Barangay Center', desc: 'Main barangay center and market area of Bonuan Gueset', transfer: 1, lat: 16.0750, lng: 120.3450 },
        { routeId: r7.lastID, order: 6, name: 'Tondaligan People\'s Park Entrance', desc: 'Coastal terminus at Tondaligan Beach and People\'s Park', transfer: 0, lat: 16.0880, lng: 120.3520 },

        // Route 8 Stops (Dagupan – Bonuan Binloc)
        { routeId: r8.lastID, order: 1, name: 'Dagupan Plaza – Binloc Terminal', desc: 'City plaza boarding point for Bonuan Binloc jeepney', transfer: 1, lat: 16.0435, lng: 120.3340 },
        { routeId: r8.lastID, order: 2, name: 'Perez Blvd / Herrero Stop', desc: 'Commercial strip pickup along Perez Boulevard', transfer: 0, lat: 16.0415, lng: 120.3385 },
        { routeId: r8.lastID, order: 3, name: 'Mayombo Northbound Junction', desc: 'Turning point towards Bonuan barangays', transfer: 0, lat: 16.0480, lng: 120.3420 },
        { routeId: r8.lastID, order: 4, name: 'Dawel Bridge Entry', desc: 'River bridge crossing northbound', transfer: 0, lat: 16.0590, lng: 120.3440 },
        { routeId: r8.lastID, order: 5, name: 'Bonuan Binloc Barangay Center', desc: 'Terminus at Bonuan Binloc barangay center and fishing community', transfer: 0, lat: 16.0760, lng: 120.3490 },

        // Route 9 Stops (Dagupan – Bonuan Boquig)
        { routeId: r9.lastID, order: 1, name: 'Dagupan Plaza – Boquig Terminal', desc: 'City plaza boarding point for Bonuan Boquig jeepney', transfer: 1, lat: 16.0435, lng: 120.3340 },
        { routeId: r9.lastID, order: 2, name: 'Herrero-Perez Commercial Strip', desc: 'High-volume boarding stop along commercial strip', transfer: 0, lat: 16.0415, lng: 120.3385 },
        { routeId: r9.lastID, order: 3, name: 'Dawel Bridge Crossing', desc: 'River bridge crossing into Bonuan area', transfer: 0, lat: 16.0590, lng: 120.3440 },
        { routeId: r9.lastID, order: 4, name: 'Bonuan Boquig Barangay Center', desc: 'Terminus at Bonuan Boquig barangay and coastal community', transfer: 0, lat: 16.0680, lng: 120.3500 },

        // Route 10 Stops (Dagupan – CSI Lucao)
        { routeId: r10.lastID, order: 1, name: 'Dagupan Plaza – CSI Lucao Jeepney', desc: 'City plaza boarding for Lucao-bound jeepney', transfer: 1, lat: 16.0435, lng: 120.3340 },
        { routeId: r10.lastID, order: 2, name: 'AB Fernandez / Galvan Crossroad', desc: 'Key intersection en route to Lucao District', transfer: 0, lat: 16.0440, lng: 120.3370 },
        { routeId: r10.lastID, order: 3, name: 'Lucao Road Entry', desc: 'Start of Lucao residential corridor', transfer: 0, lat: 16.0340, lng: 120.3280 },
        { routeId: r10.lastID, order: 4, name: 'CSI The City Mall Lucao Main Entrance', desc: 'Terminus at CSI The City Mall Lucao entrance', transfer: 1, lat: 16.0270, lng: 120.3220 },

        // Route 11 Stops (Dagupan Downtown Loop)
        { routeId: r11.lastID, order: 1, name: 'Dagupan Plaza Loop Start', desc: 'Starting/ending point of downtown circular loop', transfer: 1, lat: 16.0435, lng: 120.3340 },
        { routeId: r11.lastID, order: 2, name: 'AB Fernandez Ave / Perez Blvd Corner', desc: 'Major intersection on the downtown loop', transfer: 0, lat: 16.0440, lng: 120.3380 },
        { routeId: r11.lastID, order: 3, name: 'Perez Blvd Bus Terminal Stop', desc: 'Bus terminal area along Perez Boulevard', transfer: 1, lat: 16.0415, lng: 120.3415 },
        { routeId: r11.lastID, order: 4, name: 'Galvan St Market Area', desc: 'Public market and TODA tricycle zone', transfer: 0, lat: 16.0400, lng: 120.3400 },
        { routeId: r11.lastID, order: 5, name: 'MH Del Pilar / Arellano St', desc: 'University and civic center strip', transfer: 0, lat: 16.0385, lng: 120.3370 },
        { routeId: r11.lastID, order: 6, name: 'Dagupan Plaza Loop End', desc: 'Return terminus completing the downtown loop', transfer: 1, lat: 16.0435, lng: 120.3340 },

        // Route 12 Stops (Dagupan – Bolosan / Salisay / Tambac / Tebeng)
        { routeId: r12.lastID, order: 1, name: 'Dagupan Plaza – North Barangay Terminal', desc: 'City plaza boarding for northern barangay routes', transfer: 1, lat: 16.0435, lng: 120.3340 },
        { routeId: r12.lastID, order: 2, name: 'Bolosan Barangay Entry', desc: 'First major stop at Bolosan barangay along Bolosan Road', transfer: 0, lat: 16.0510, lng: 120.3280 },
        { routeId: r12.lastID, order: 3, name: 'Salisay Barangay Center', desc: 'Community stop at Salisay barangay market', transfer: 0, lat: 16.0560, lng: 120.3250 },
        { routeId: r12.lastID, order: 4, name: 'Tambac Barangay Junction', desc: 'Tambac stop along northern road corridor', transfer: 0, lat: 16.0620, lng: 120.3220 },
        { routeId: r12.lastID, order: 5, name: 'Tebeng District Terminus', desc: 'Final stop at Tebeng barangay district center', transfer: 0, lat: 16.0680, lng: 120.3190 }
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
        { routeId: r6.lastID, step: 3, mode: 'Walk', instruction: 'Arrive at Downtown City Center', info: 'Alight on MH Del Pilar St near university campuses.' },

        // Route 7: Dagupan – Bonuan Gueset / Tondaligan
        { routeId: r7.lastID, step: 1, mode: 'Walk', instruction: 'Walk to Dagupan Plaza Jeepney Terminal', info: 'Head to the Bonuan Gueset/Tondaligan jeepney bay at Dagupan Plaza.' },
        { routeId: r7.lastID, step: 2, mode: 'Jeepney', instruction: "Board Jeepney 'Dagupan–Bonuan Gueset'", info: 'Ride via Perez Blvd across Dawel Bridge through Bonuan Gueset barangay toward Tondaligan Beach.' },
        { routeId: r7.lastID, step: 3, mode: 'Walk', instruction: 'Arrive at Tondaligan Beach / People\'s Park', info: 'Alight at Tondaligan Park entrance along the South China Sea coastal road.' },

        // Route 8: Dagupan – Bonuan Binloc
        { routeId: r8.lastID, step: 1, mode: 'Walk', instruction: 'Walk to City Plaza Jeepney Terminal', info: 'Head to the Bonuan Binloc-bound jeepney stop at Dagupan Plaza.' },
        { routeId: r8.lastID, step: 2, mode: 'Jeepney', instruction: "Board Jeepney 'Dagupan–Bonuan Binloc'", info: 'Ride north via Perez Blvd, cross Dawel Bridge, and continue to Bonuan Binloc barangay.' },
        { routeId: r8.lastID, step: 3, mode: 'Walk', instruction: 'Arrive at Bonuan Binloc', info: 'Alight at the Bonuan Binloc barangay center near the fishing community and schools.' },

        // Route 9: Dagupan – Bonuan Boquig
        { routeId: r9.lastID, step: 1, mode: 'Walk', instruction: 'Walk to City Plaza Jeepney Terminal', info: 'Proceed to the Bonuan Boquig-bound jeepney bay at Dagupan Plaza.' },
        { routeId: r9.lastID, step: 2, mode: 'Jeepney', instruction: "Board Jeepney 'Dagupan–Bonuan Boquig'", info: 'Ride via Herrero-Perez commercial strip and across Dawel Bridge to Bonuan Boquig.' },
        { routeId: r9.lastID, step: 3, mode: 'Walk', instruction: 'Arrive at Bonuan Boquig', info: 'Alight at Bonuan Boquig barangay center in the northern coastal community.' },

        // Route 10: Dagupan – CSI Lucao
        { routeId: r10.lastID, step: 1, mode: 'Walk', instruction: 'Walk to Dagupan Plaza Jeepney Terminal', info: 'Head to the CSI Lucao jeepney bay near Dagupan Plaza.' },
        { routeId: r10.lastID, step: 2, mode: 'Jeepney', instruction: "Board Jeepney 'Dagupan–CSI Lucao'", info: 'Ride via AB Fernandez Avenue and Lucao Road directly to CSI The City Mall.' },
        { routeId: r10.lastID, step: 3, mode: 'Walk', instruction: 'Arrive at CSI The City Mall Lucao', info: 'Alight at the main mall entrance on Lucao Road.' },

        // Route 11: Dagupan Downtown Loop
        { routeId: r11.lastID, step: 1, mode: 'Walk', instruction: 'Walk to Dagupan Plaza Loop Terminal', info: 'Board at Dagupan Plaza — the circular loop departs frequently throughout the day.' },
        { routeId: r11.lastID, step: 2, mode: 'Jeepney', instruction: 'Board Downtown Loop Jeepney', info: 'Circular route covers AB Fernandez Ave, Perez Blvd, Galvan St, MH Del Pilar St, Arellano St, and Rizal St.' },
        { routeId: r11.lastID, step: 3, mode: 'Walk', instruction: 'Alight at Your Stop', info: 'Alight at any stop along the downtown loop. The jeepney returns to Dagupan Plaza to complete the circuit.' },

        // Route 12: Dagupan – Bolosan / Salisay / Tambac / Tebeng
        { routeId: r12.lastID, step: 1, mode: 'Walk', instruction: 'Walk to Dagupan Plaza North Terminal', info: 'Head to the northern barangay jeepney bay at Dagupan Plaza.' },
        { routeId: r12.lastID, step: 2, mode: 'Jeepney', instruction: "Board Jeepney 'Dagupan–Tebeng'", info: 'Ride via Bolosan Road northward through Bolosan, Salisay, and Tambac barangays to Tebeng District.' },
        { routeId: r12.lastID, step: 3, mode: 'Walk', instruction: 'Arrive at Tebeng / Barangay Destination', info: 'Alight at your barangay stop along the northern corridor (Bolosan, Salisay, Tambac, or Tebeng).' }
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
        { id: r6.lastID, base: 15.00 },
        { id: r7.lastID, base: 15.00 },
        { id: r8.lastID, base: 15.00 },
        { id: r9.lastID, base: 12.00 },
        { id: r10.lastID, base: 15.00 },
        { id: r11.lastID, base: 12.00 },
        { id: r12.lastID, base: 15.00 }
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

    // 11. Seed Unified Locations (Authoritative Dagupan dataset with search keywords & barangays)
    const locationsData = [
        // -------------------------------------------------------------
        // A. DAGUPAN STREETS & ROADS (28 Streets per Specification)
        // -------------------------------------------------------------
        { 
            name: 'A.B. Fernandez Avenue', 
            type: 'STREET', 
            barangay: 'Poblacion Oeste', 
            address: 'Downtown Dagupan City', 
            lat: 16.0440, lng: 120.3380, 
            desc: 'Major commercial thoroughfare in Dagupan downtown.', 
            keywords: 'AB Fernandez, A.B Fernandez, AB Fernandez Ave, Fernandez Avenue, Fernandez Ave' 
        },
        { 
            name: 'A.B. Fernandez East', 
            type: 'STREET', 
            barangay: 'Herrero', 
            address: 'East Dagupan City', 
            lat: 16.0450, lng: 120.3390, 
            desc: 'Eastern extension of AB Fernandez Avenue leading to Mayombo.', 
            keywords: 'AB Fernandez East, Fernandez East, AB East' 
        },
        { 
            name: 'A.B. Fernandez West', 
            type: 'STREET', 
            barangay: 'Poblacion Oeste', 
            address: 'West Dagupan City', 
            lat: 16.0430, lng: 120.3320, 
            desc: 'Western section of AB Fernandez Avenue connecting to Lucao.', 
            keywords: 'AB Fernandez West, Fernandez West, AB West' 
        },
        { 
            name: 'Perez Boulevard', 
            type: 'STREET', 
            barangay: 'Herrero', 
            address: 'Dagupan City', 
            lat: 16.0415, lng: 120.3385, 
            desc: 'Primary commercial boulevard along the riverfront and bus terminal.', 
            keywords: 'Perez, Perez Blvd, Perez Boulevard Dagupan, Perez Avenue' 
        },
        { 
            name: 'Burgos Street', 
            type: 'STREET', 
            barangay: 'Barangay I', 
            address: 'Downtown Dagupan City', 
            lat: 16.0428, lng: 120.3345, 
            desc: 'Historic central street in downtown Dagupan.', 
            keywords: 'Burgos, Burgos St, Calle Burgos, Padre Burgos' 
        },
        { 
            name: 'Burgos Extension', 
            type: 'STREET', 
            barangay: 'Barangay IV', 
            address: 'Dagupan City', 
            lat: 16.0445, lng: 120.3355, 
            desc: 'Extension connecting Burgos Street to market district.', 
            keywords: 'Burgos Ext, Burgos Extension Dagupan' 
        },
        { 
            name: 'M.H. Del Pilar Street', 
            type: 'STREET', 
            barangay: 'Barangay II', 
            address: 'Downtown Dagupan City', 
            lat: 16.0420, lng: 120.3350, 
            desc: 'Central downtown street near university campuses and city plaza.', 
            keywords: 'MH del Pilar, MH Del Pilar St, Del Pilar Street, M.H. del Pilar' 
        },
        { 
            name: 'Arellano-Bani Road', 
            type: 'ROAD', 
            barangay: 'Pantal', 
            address: 'Dagupan City', 
            lat: 16.0495, lng: 120.3395, 
            desc: 'Road connecting Arellano district towards northern river communities.', 
            keywords: 'Arellano Bani, Arellano Road, Bani Road, Arellano-Bani' 
        },
        { 
            name: 'Tapuac-Lucao Road', 
            type: 'ROAD', 
            barangay: 'Tapuac', 
            address: 'Dagupan City', 
            lat: 16.0350, lng: 120.3280, 
            desc: 'Major corridor between Tapuac school row and Lucao district.', 
            keywords: 'Tapuac Lucao, Lucao Road, Tapuac Road, Tapuac-Lucao' 
        },
        { 
            name: 'Mayombo-Caranglaan Road', 
            type: 'ROAD', 
            barangay: 'Mayombo', 
            address: 'Dagupan City', 
            lat: 16.0510, lng: 120.3470, 
            desc: 'Eastern connector linking Mayombo commercial area with Caranglaan.', 
            keywords: 'Mayombo Caranglaan, Mayombo Road, Caranglaan Road' 
        },
        { 
            name: 'Bonuan–De Venecia Road', 
            type: 'ROAD', 
            barangay: 'Bonuan Boquig', 
            address: 'Bonuan, Dagupan City', 
            lat: 16.0650, lng: 120.3480, 
            desc: 'Scenic highway traversing northern Bonuan coastal district.', 
            keywords: 'Bonuan De Venecia, De Venecia Highway, De Venecia Ext, Bonuan Road' 
        },
        { 
            name: 'Calasiao–De Venecia Old Highway', 
            type: 'ROAD', 
            barangay: 'Lucao', 
            address: 'Southern Dagupan', 
            lat: 16.0310, lng: 120.3420, 
            desc: 'Historic southern route connecting Dagupan City with Calasiao.', 
            keywords: 'Calasiao De Venecia, Old De Venecia Highway, Calasiao Road' 
        },
        { 
            name: 'Urdaneta Junction–Dagupan–Lingayen Road', 
            type: 'ROAD', 
            barangay: 'Caranglaan', 
            address: 'National Highway, Dagupan City', 
            lat: 16.0460, lng: 120.3550, 
            desc: 'Primary provincial highway spanning Pangasinan transit corridors.', 
            keywords: 'Urdaneta Dagupan Lingayen Road, National Highway, Manila North Road' 
        },
        { 
            name: 'Pangasinan-Zambales Road', 
            type: 'ROAD', 
            barangay: 'Lucao', 
            address: 'Western Dagupan', 
            lat: 16.0240, lng: 120.3150, 
            desc: 'Inter-provincial highway heading west towards western Pangasinan.', 
            keywords: 'Pangasinan Zambales Hwy, Zambales Road, Pangasinan-Zambales' 
        },
        { 
            name: 'Pangasinan-Tarlac Road', 
            type: 'ROAD', 
            barangay: 'Caranglaan', 
            address: 'Eastern Dagupan', 
            lat: 16.0380, lng: 120.3600, 
            desc: 'Provincial arterial road towards southern Luzon.', 
            keywords: 'Pangasinan Tarlac Hwy, Tarlac Road, Pangasinan-Tarlac' 
        },
        { 
            name: 'San Carlos–Calasiao Road', 
            type: 'ROAD', 
            barangay: 'Lasip Grande', 
            address: 'Southern Dagupan', 
            lat: 16.0150, lng: 120.3500, 
            desc: 'Arterial connection to San Carlos City and Calasiao town center.', 
            keywords: 'San Carlos Calasiao Hwy, San Carlos Road, San Carlos-Calasiao' 
        },
        { 
            name: 'Carmen Junction–Bayambang–Manat Road', 
            type: 'ROAD', 
            barangay: 'Bacayao Sur', 
            address: 'Dagupan City', 
            lat: 16.0290, lng: 120.3390, 
            desc: 'Transit road connecting central Pangasinan municipalities.', 
            keywords: 'Carmen Bayambang Manat, Bayambang Road, Manat Road' 
        },
        { 
            name: 'W.A. Jones Street', 
            type: 'STREET', 
            barangay: 'Barangay II', 
            address: 'Downtown Dagupan', 
            lat: 16.0410, lng: 120.3360, 
            desc: 'Downtown street near city government offices.', 
            keywords: 'WA Jones, WA Jones St, Jones Street, W.A. Jones' 
        },
        { 
            name: 'F. Sison Street', 
            type: 'STREET', 
            barangay: 'Barangay I', 
            address: 'Dagupan City', 
            lat: 16.0432, lng: 120.3372, 
            desc: 'Commercial street near public market.', 
            keywords: 'F Sison, F Sison St, Sison Street, F. Sison' 
        },
        { 
            name: 'Malong Street', 
            type: 'STREET', 
            barangay: 'Barangay IV', 
            address: 'Dagupan City', 
            lat: 16.0442, lng: 120.3365, 
            desc: 'Downtown residential and commercial street.', 
            keywords: 'Malong, Malong St, Andres Malong' 
        },
        { 
            name: 'Tesoro Road', 
            type: 'ROAD', 
            barangay: 'Malued', 
            address: 'Dagupan City', 
            lat: 16.0370, lng: 120.3320, 
            desc: 'Connecting road through Malued district.', 
            keywords: 'Tesoro, Tesoro Rd, Tesoro Street' 
        },
        { 
            name: 'Galvan Street', 
            type: 'STREET', 
            barangay: 'Barangay I', 
            address: 'Downtown Dagupan City', 
            lat: 16.0438, lng: 120.3330, 
            desc: 'Commercial street with TODA tricycle loading station.', 
            keywords: 'Galvan, Galvan St, Calle Galvan' 
        },
        { 
            name: 'Nueva Street', 
            type: 'STREET', 
            barangay: 'Barangay II', 
            address: 'Downtown Dagupan', 
            lat: 16.0418, lng: 120.3340, 
            desc: 'Downtown street near commercial banks.', 
            keywords: 'Nueva, Nueva St, Calle Nueva' 
        },
        { 
            name: 'Jovellanos Extension', 
            type: 'STREET', 
            barangay: 'Poblacion Oeste', 
            address: 'Dagupan City', 
            lat: 16.0422, lng: 120.3315, 
            desc: 'Extension road in western Poblacion.', 
            keywords: 'Jovellanos, Jovellanos Ext, Jovellanos Street' 
        },
        { 
            name: 'Zamora Street', 
            type: 'STREET', 
            barangay: 'Barangay I', 
            address: 'Downtown Dagupan', 
            lat: 16.0430, lng: 120.3358, 
            desc: 'Street traversing commercial downtown district.', 
            keywords: 'Zamora, Zamora St, Jacinto Zamora' 
        },
        { 
            name: 'Don Jose Calimlim Road', 
            type: 'ROAD', 
            barangay: 'Tapuac', 
            address: 'Dagupan City', 
            lat: 16.0390, lng: 120.3290, 
            desc: 'Road serving university and residential subdivisions.', 
            keywords: 'Don Jose Calimlim, Calimlim Road, Calimlim St' 
        },
        { 
            name: 'Malued-Guilig Road', 
            type: 'ROAD', 
            barangay: 'Malued', 
            address: 'Dagupan City', 
            lat: 16.0360, lng: 120.3340, 
            desc: 'Corridor connecting Malued with Guilig residential areas.', 
            keywords: 'Malued Guilig, Guilig Road, Malued Road, Malued-Guilig' 
        },
        { 
            name: 'Caranglaan-Bacayao Sur Road', 
            type: 'ROAD', 
            barangay: 'Caranglaan', 
            address: 'Dagupan City', 
            lat: 16.0420, lng: 120.3510, 
            desc: 'Connector road linking eastern Caranglaan with Bacayao Sur.', 
            keywords: 'Caranglaan Bacayao, Bacayao Sur Road, Caranglaan-Bacayao' 
        },
        { 
            name: 'De Venecia Road', 
            type: 'STREET', 
            barangay: 'Lucao', 
            address: 'Dagupan City', 
            lat: 16.0460, lng: 120.3450, 
            desc: 'Bypass road used during flood detours and heavy traffic.', 
            keywords: 'De Venecia Highway, De Venecia Ext, Jose De Venecia Expressway' 
        },

        // -------------------------------------------------------------
        // B. ALL 31 DAGUPAN CITY BARANGAYS (type: BARANGAY)
        // -------------------------------------------------------------
        { name: 'Bacayao Norte', type: 'BARANGAY', barangay: 'Bacayao Norte', address: 'Dagupan City', lat: 16.0340, lng: 120.3420, desc: 'Barangay Bacayao Norte, Dagupan City.', keywords: 'Bacayao Norte, Brgy Bacayao Norte' },
        { name: 'Bacayao Sur', type: 'BARANGAY', barangay: 'Bacayao Sur', address: 'Dagupan City', lat: 16.0300, lng: 120.3400, desc: 'Barangay Bacayao Sur, Dagupan City.', keywords: 'Bacayao Sur, Brgy Bacayao Sur' },
        { name: 'Barangay I', type: 'BARANGAY', barangay: 'Barangay I', address: 'Dagupan City', lat: 16.0435, lng: 120.3350, desc: 'Barangay I (Poblacion), Dagupan City.', keywords: 'Barangay 1, Brgy 1, Poblacion 1, Barangay I' },
        { name: 'Barangay II', type: 'BARANGAY', barangay: 'Barangay II', address: 'Dagupan City', lat: 16.0415, lng: 120.3340, desc: 'Barangay II (Poblacion), Dagupan City.', keywords: 'Barangay 2, Brgy 2, Poblacion 2, Barangay II' },
        { name: 'Barangay IV', type: 'BARANGAY', barangay: 'Barangay IV', address: 'Dagupan City', lat: 16.0450, lng: 120.3360, desc: 'Barangay IV (Poblacion), Dagupan City.', keywords: 'Barangay 4, Brgy 4, Poblacion 4, Barangay IV' },
        { name: 'Bolosan', type: 'BARANGAY', barangay: 'Bolosan', address: 'Dagupan City', lat: 16.0580, lng: 120.3620, desc: 'Barangay Bolosan, Dagupan City.', keywords: 'Bolosan, Brgy Bolosan' },
        { name: 'Bonuan Binloc', type: 'BARANGAY', barangay: 'Bonuan Binloc', address: 'Dagupan City', lat: 16.0720, lng: 120.3650, desc: 'Barangay Bonuan Binloc, coastal Bonuan peninsula.', keywords: 'Binloc, Bonuan Binloc, Brgy Bonuan Binloc' },
        { name: 'Bonuan Boquig', type: 'BARANGAY', barangay: 'Bonuan Boquig', address: 'Dagupan City', lat: 16.0680, lng: 120.3500, desc: 'Barangay Bonuan Boquig in the Bonuan peninsula.', keywords: 'Boquig, Bonuan Boquig, Brgy Bonuan Boquig' },
        { name: 'Bonuan Gueset', type: 'BARANGAY', barangay: 'Bonuan Gueset', address: 'Dagupan City', lat: 16.0750, lng: 120.3450, desc: 'Barangay Bonuan Gueset with coastal and university communities.', keywords: 'Gueset, Bonuan Gueset, Brgy Bonuan Gueset' },
        { name: 'Calmay', type: 'BARANGAY', barangay: 'Calmay', address: 'Dagupan City', lat: 16.0500, lng: 120.3200, desc: 'Barangay Calmay island community along the river.', keywords: 'Calmay, Brgy Calmay, Calmay Island' },
        { name: 'Carael', type: 'BARANGAY', barangay: 'Carael', address: 'Dagupan City', lat: 16.0460, lng: 120.3150, desc: 'Barangay Carael in western Dagupan.', keywords: 'Carael, Brgy Carael' },
        { name: 'Caranglaan', type: 'BARANGAY', barangay: 'Caranglaan', address: 'Dagupan City', lat: 16.0450, lng: 120.3550, desc: 'Barangay Caranglaan along eastern highway.', keywords: 'Caranglaan, Brgy Caranglaan' },
        { name: 'Herrero', type: 'BARANGAY', barangay: 'Herrero', address: 'Dagupan City', lat: 16.0440, lng: 120.3410, desc: 'Barangay Herrero-Perez commercial area.', keywords: 'Herrero, Herrero-Perez, Brgy Herrero' },
        { name: 'Lasip Chico', type: 'BARANGAY', barangay: 'Lasip Chico', address: 'Dagupan City', lat: 16.0250, lng: 120.3440, desc: 'Barangay Lasip Chico, Dagupan City.', keywords: 'Lasip Chico, Brgy Lasip Chico' },
        { name: 'Lasip Grande', type: 'BARANGAY', barangay: 'Lasip Grande', address: 'Dagupan City', lat: 16.0200, lng: 120.3480, desc: 'Barangay Lasip Grande in southern Dagupan.', keywords: 'Lasip Grande, Brgy Lasip Grande' },
        { name: 'Lomboy', type: 'BARANGAY', barangay: 'Lomboy', address: 'Dagupan City', lat: 16.0350, lng: 120.3180, desc: 'Barangay Lomboy, Dagupan City.', keywords: 'Lomboy, Brgy Lomboy' },
        { name: 'Lucao', type: 'BARANGAY', barangay: 'Lucao', address: 'Dagupan City', lat: 16.0270, lng: 120.3220, desc: 'Barangay Lucao, commercial and hospital district.', keywords: 'Lucao, Lucao District, Brgy Lucao' },
        { name: 'Malued', type: 'BARANGAY', barangay: 'Malued', address: 'Dagupan City', lat: 16.0380, lng: 120.3320, desc: 'Barangay Malued, central residential district.', keywords: 'Malued, Brgy Malued' },
        { name: 'Mamalingling', type: 'BARANGAY', barangay: 'Mamalingling', address: 'Dagupan City', lat: 16.0480, lng: 120.3600, desc: 'Barangay Mamalingling, Dagupan City.', keywords: 'Mamalingling, Brgy Mamalingling' },
        { name: 'Mangin', type: 'BARANGAY', barangay: 'Mangin', address: 'Dagupan City', lat: 16.0600, lng: 120.3700, desc: 'Barangay Mangin in northeastern Dagupan.', keywords: 'Mangin, Brgy Mangin' },
        { name: 'Mayombo', type: 'BARANGAY', barangay: 'Mayombo', address: 'Dagupan City', lat: 16.0480, lng: 120.3420, desc: 'Barangay Mayombo commercial and transit district.', keywords: 'Mayombo, Mayombo District, Brgy Mayombo' },
        { name: 'Pantal', type: 'BARANGAY', barangay: 'Pantal', address: 'Dagupan City', lat: 16.0395, lng: 120.3300, desc: 'Barangay Pantal along the Pantal River waterway.', keywords: 'Pantal, Pantal Barangay, Brgy Pantal' },
        { name: 'Poblacion Oeste', type: 'BARANGAY', barangay: 'Poblacion Oeste', address: 'Dagupan City', lat: 16.0425, lng: 120.3310, desc: 'Barangay Poblacion Oeste downtown area.', keywords: 'Poblacion Oeste, Poblacion West, Brgy Poblacion Oeste' },
        { name: 'Pogo Chico', type: 'BARANGAY', barangay: 'Pogo Chico', address: 'Dagupan City', lat: 16.0380, lng: 120.3380, desc: 'Barangay Pogo Chico, Dagupan City.', keywords: 'Pogo Chico, Brgy Pogo Chico' },
        { name: 'Pogo Grande', type: 'BARANGAY', barangay: 'Pogo Grande', address: 'Dagupan City', lat: 16.0340, lng: 120.3360, desc: 'Barangay Pogo Grande, Dagupan City.', keywords: 'Pogo Grande, Brgy Pogo Grande' },
        { name: 'Pugaro Suit', type: 'BARANGAY', barangay: 'Pugaro Suit', address: 'Dagupan City', lat: 16.0780, lng: 120.3300, desc: 'Barangay Pugaro Suit island and fishing community.', keywords: 'Pugaro, Pugaro Suit, Brgy Pugaro' },
        { name: 'Salapingao', type: 'BARANGAY', barangay: 'Salapingao', address: 'Dagupan City', lat: 16.0700, lng: 120.3200, desc: 'Barangay Salapingao river island community.', keywords: 'Salapingao, Brgy Salapingao' },
        { name: 'Salisay', type: 'BARANGAY', barangay: 'Salisay', address: 'Dagupan City', lat: 16.0540, lng: 120.3660, desc: 'Barangay Salisay, Dagupan City.', keywords: 'Salisay, Brgy Salisay' },
        { name: 'Tambac', type: 'BARANGAY', barangay: 'Tambac', address: 'Dagupan City', lat: 16.0550, lng: 120.3550, desc: 'Barangay Tambac, Dagupan City.', keywords: 'Tambac, Brgy Tambac' },
        { name: 'Tapuac', type: 'BARANGAY', barangay: 'Tapuac', address: 'Dagupan City', lat: 16.0380, lng: 120.3280, desc: 'Barangay Tapuac university and educational district.', keywords: 'Tapuac, Tapuac District, Brgy Tapuac' },
        { name: 'Tebeng', type: 'BARANGAY', barangay: 'Tebeng', address: 'Dagupan City', lat: 16.0420, lng: 120.3680, desc: 'Barangay Tebeng along eastern border.', keywords: 'Tebeng, Brgy Tebeng' },

        // -------------------------------------------------------------
        // C. LANDMARKS, ESTABLISHMENTS, TERMINALS & DESTINATIONS
        // -------------------------------------------------------------
        { 
            name: 'SM Center Dagupan', 
            type: 'ESTABLISHMENT', 
            barangay: 'Herrero', 
            address: 'Perez Blvd, Dagupan City', 
            lat: 16.0468, lng: 120.3418, 
            desc: 'Major shopping mall and retail hub along Perez Boulevard.', 
            keywords: 'SM Dagupan, SM Center, SM Downtown, SM Mall' 
        },
        { 
            name: 'CSI City Mall', 
            type: 'ESTABLISHMENT', 
            barangay: 'Barangay I', 
            address: 'A.B. Fernandez Ave, Downtown Dagupan', 
            lat: 16.0436, lng: 120.3360, 
            desc: 'Department store and shopping center in downtown Dagupan.', 
            keywords: 'CSI Market Square, CSI Downtown, CSI City Mall, CSI Fernandez' 
        },
        { 
            name: 'CSI The City Mall Lucao', 
            type: 'ESTABLISHMENT', 
            barangay: 'Lucao', 
            address: 'Lucao District, Dagupan City', 
            lat: 16.0270, lng: 120.3220, 
            desc: 'Regional shopping mall and entertainment center in Lucao district.', 
            keywords: 'CSI Lucao, CSI Mall Lucao, CSI The City Mall' 
        },
        { 
            name: 'Dagupan City Hall', 
            type: 'LANDMARK', 
            barangay: 'Barangay II', 
            address: 'M.H. Del Pilar St, Dagupan City', 
            lat: 16.0410, lng: 120.3355, 
            desc: 'Seat of Dagupan City municipal government.', 
            keywords: 'City Hall, Dagupan City Hall, City Government, Munisipyo' 
        },
        { 
            name: 'Dagupan City Plaza & St. John Cathedral', 
            type: 'LANDMARK', 
            barangay: 'Barangay I', 
            address: 'Dagupan City Center', 
            lat: 16.0435, lng: 120.3340, 
            desc: 'Historic city plaza and St. John the Evangelist Cathedral.', 
            keywords: 'City Plaza, Dagupan Plaza, St John Cathedral, Dagupan Cathedral' 
        },
        { 
            name: 'Dagupan Public Market / Malimgas', 
            type: 'TERMINAL', 
            barangay: 'Barangay I', 
            address: 'Galvan St, Dagupan City', 
            lat: 16.0440, lng: 120.3370, 
            desc: 'Central commercial market and tricycle/jeepney hub.', 
            keywords: 'Malimgas Market, Public Market, Palengke, Malimgas Mall' 
        },
        { 
            name: 'Perez Blvd Integrated Bus Terminal', 
            type: 'TERMINAL', 
            barangay: 'Herrero', 
            address: 'Perez Blvd, Dagupan City', 
            lat: 16.0415, lng: 120.3385, 
            desc: 'Inter-city bus terminal for provincial routes.', 
            keywords: 'Dagupan Bus Terminal, Perez Bus Terminal, Bus Terminal' 
        },
        { 
            name: 'Bonuan Beach & Tondaligan People\'s Park', 
            type: 'LANDMARK', 
            barangay: 'Bonuan Gueset', 
            address: 'Bonuan, Dagupan City', 
            lat: 16.0880, lng: 120.3520, 
            desc: 'Popular coastal park, beach boardwalk, and recreational area.', 
            keywords: 'Bonuan Beach, Tondaligan Beach, Tondaligan Park, Tondaligan People\'s Park' 
        },
        { 
            name: 'Tondaligan Beach & People\'s Park', 
            type: 'LANDMARK', 
            barangay: 'Bonuan Gueset', 
            address: 'Bonuan, Dagupan City', 
            lat: 16.0880, lng: 120.3520, 
            desc: 'Coastal park and beach terminus for northern routes.', 
            keywords: 'Tondaligan, Bonuan Beach, Tondaligan Beach' 
        },
        { 
            name: 'Region 1 Medical Center (R1MC)', 
            type: 'LANDMARK', 
            barangay: 'Bonuan Boquig', 
            address: 'Arellano St, Dagupan City', 
            lat: 16.0520, lng: 120.3440, 
            desc: 'Tertiary government medical center for Northern Luzon.', 
            keywords: 'R1MC, Region 1 Hospital, Provincial Hospital, R1 Medical Center' 
        },
        { 
            name: 'Dagupan Doctors Villaflor Memorial Hospital', 
            type: 'LANDMARK', 
            barangay: 'Mayombo', 
            address: 'Mayombo District, Dagupan City', 
            lat: 16.0490, lng: 120.3400, 
            desc: 'Major private hospital center in Dagupan.', 
            keywords: 'Villaflor Hospital, Dagupan Doctors, Villaflor Medical' 
        },
        { 
            name: 'University of Pangasinan (PHINMA)', 
            type: 'LANDMARK', 
            barangay: 'Barangay II', 
            address: 'Arellano St, Dagupan City', 
            lat: 16.0418, lng: 120.3362, 
            desc: 'Major higher education university campus in downtown.', 
            keywords: 'UPang, PHINMA UPang, University of Pangasinan, UPang Dagupan' 
        },
        { 
            name: 'Colegio de Dagupan', 
            type: 'LANDMARK', 
            barangay: 'Tapuac', 
            address: 'Arellano St, Tapuac, Dagupan City', 
            lat: 16.0375, lng: 120.3295, 
            desc: 'Higher education college institution in Tapuac district.', 
            keywords: 'CdD, Colegio de Dagupan, CdD Tapuac' 
        },
        { 
            name: 'Universidad de Dagupan', 
            type: 'LANDMARK', 
            barangay: 'Tapuac', 
            address: 'Arellano St, Tapuac, Dagupan City', 
            lat: 16.0365, lng: 120.3285, 
            desc: 'University campus along Tapuac university belt.', 
            keywords: 'UdD, Computronix, Universidad de Dagupan' 
        },
        { 
            name: 'Robinsons Place Pangasinan', 
            type: 'ESTABLISHMENT', 
            barangay: 'Lucao', 
            address: 'Calasiao / Dagupan Border', 
            lat: 16.0180, lng: 120.3540, 
            desc: 'Regional commercial shopping mall.', 
            keywords: 'Robinsons Calasiao, Robinsons Mall, Robinsons Place' 
        },
        { 
            name: 'Dagupan City Plaza Terminal', 
            type: 'TERMINAL', 
            barangay: 'Barangay I', 
            address: 'Dagupan City Center', 
            lat: 16.0435, lng: 120.3340, 
            desc: 'Central multi-mode transport terminal near City Plaza.', 
            keywords: 'Plaza Terminal, Downtown Terminal, City Plaza Jeepney Terminal' 
        },
        { 
            name: 'Bonuan Jeepney & Tricycle Terminal', 
            type: 'TERMINAL', 
            barangay: 'Bonuan Gueset', 
            address: 'Bonuan Gueset, Dagupan City', 
            lat: 16.0740, lng: 120.3460, 
            desc: 'Northern terminal for Bonuan route transfers.', 
            keywords: 'Bonuan Terminal, Gueset Terminal' 
        },
        { 
            name: 'Pantal River', 
            type: 'DESTINATION', 
            barangay: 'Pantal', 
            address: 'Pantal Waterway, Dagupan City', 
            lat: 16.0420, lng: 120.3350, 
            desc: 'Major river waterway through Dagupan City.', 
            keywords: 'Pantal River, Pantal Waterway, Dagupan River' 
        },
        { 
            name: 'Pantal River Dock (Bonuan Side)', 
            type: 'RIVER_STOP', 
            barangay: 'Bonuan Boquig', 
            address: 'Pantal River, Bonuan Boquig, Dagupan City', 
            lat: 16.0620, lng: 120.3420, 
            desc: 'Sample river stop dock on the Bonuan northern bank.', 
            keywords: 'Bonuan Dock, Pantal North Dock, River Dock Bonuan' 
        },
        { 
            name: 'Pantal River Dock (Downtown Side)', 
            type: 'RIVER_STOP', 
            barangay: 'Pantal', 
            address: 'Pantal River, Pantal Barangay, Dagupan City', 
            lat: 16.0395, lng: 120.3310, 
            desc: 'Sample river stop dock on the downtown southern bank.', 
            keywords: 'Downtown Dock, Pantal South Dock, River Dock Downtown' 
        },
        { 
            name: 'A.B. Fernandez & Perez Blvd Intersection', 
            type: 'INTERSECTION', 
            barangay: 'Herrero', 
            address: 'Dagupan City', 
            lat: 16.0425, lng: 120.3390, 
            desc: 'Key downtown intersection prone to flooding during high tide.', 
            keywords: 'Fernandez Perez Junction, AB Fernandez Perez Corner' 
        },
        { 
            name: 'Galvan & Fernandez Crossroad', 
            type: 'INTERSECTION', 
            barangay: 'Barangay I', 
            address: 'Dagupan City', 
            lat: 16.0400, lng: 120.3300, 
            desc: 'Commercial crossroad in downtown Dagupan.', 
            keywords: 'Galvan Fernandez, Galvan Crossroad' 
        }
    ];

    const locationIds = {};
    for (const loc of locationsData) {
        const res = await query.run(
            `INSERT INTO locations (name, type, barangay, address, latitude, longitude, description, search_keywords, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
            [loc.name, loc.type, loc.barangay || null, loc.address || null, loc.lat || null, loc.lng || null, loc.desc || null, loc.keywords || null]
        );
        locationIds[loc.name] = res.lastID;
    }
    console.log(`Locations seeded (${locationsData.length} entries with keywords & barangays).`);


    // 12. Seed Sample Boat Route (SAMPLE DATA)
    const boatRoute = await query.run(
        `INSERT INTO routes (route_name, transport_mode_id, origin, destination, estimated_time, minimum_fare, maximum_fare, status, description, geometry)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'Pantal River Crossing (SAMPLE)',
            boat.lastID,
            'Pantal River Dock (Downtown Side)',
            'Pantal River Dock (Bonuan Side)',
            15, 20.00, 20.00, 'CLEAR',
            'SAMPLE DATA — Hypothetical river crossing via Pantal River. No boat service is confirmed as currently operating. Admin must configure real boat routes.',
            JSON.stringify({ type: 'LineString', coordinates: [[120.3310, 16.0395], [120.3350, 16.0480], [120.3420, 16.0620]] })
        ]
    );
    const originStopId = locationIds['Pantal River Dock (Downtown Side)'];
    const destStopId = locationIds['Pantal River Dock (Bonuan Side)'];
    if (originStopId && destStopId) {
        await query.run(
            `INSERT INTO boat_route_details (route_id, waterway, origin_river_stop_id, destination_river_stop_id, operating_status, notes) VALUES (?, ?, ?, ?, ?, ?)`,
            [boatRoute.lastID, 'Pantal River', originStopId, destStopId, 'ACTIVE', 'SAMPLE DATA — Admin-controlled status. Suspend if no real service operates.']
        );
        await query.run(`INSERT INTO route_segments (route_id, segment_order, mode, start_location_id, end_location_id, fare, estimated_time, notes) VALUES (?, 1, 'Walk', NULL, ?, 0, 5, 'Walk to river dock')`, [boatRoute.lastID, originStopId]);
        await query.run(`INSERT INTO route_segments (route_id, segment_order, mode, start_location_id, end_location_id, fare, estimated_time, notes) VALUES (?, 2, 'Boat', ?, ?, 20, 10, 'River crossing via Pantal River (SAMPLE)')`, [boatRoute.lastID, originStopId, destStopId]);
        await query.run(`INSERT INTO route_segments (route_id, segment_order, mode, start_location_id, end_location_id, fare, estimated_time, notes) VALUES (?, 3, 'Walk', ?, NULL, 0, 3, 'Walk from river dock to destination')`, [boatRoute.lastID, destStopId]);
    }
    const boatFare = 20.00;
    await query.run(`INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare) VALUES (?, 'REGULAR', ?, 0, ?)`, [boatRoute.lastID, boatFare, boatFare]);
    await query.run(`INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare) VALUES (?, 'STUDENT', ?, 20, ?)`, [boatRoute.lastID, boatFare, Number((boatFare * 0.8).toFixed(2))]);
    await query.run(`INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare) VALUES (?, 'SENIOR_CITIZEN', ?, 20, ?)`, [boatRoute.lastID, boatFare, Number((boatFare * 0.8).toFixed(2))]);
    await query.run(`INSERT INTO fares (route_id, passenger_type, base_fare, discount_percentage, final_fare) VALUES (?, 'PWD', ?, 20, ?)`, [boatRoute.lastID, boatFare, Number((boatFare * 0.8).toFixed(2))]);

    // Also seed multi-modal segments for Route 1 (Dagupan – Bonuan Beach)
    const bonuanLocId = locationIds['Tondaligan Beach & People\'s Park'];
    const plazaLocId = locationIds['Dagupan City Plaza & St. John Cathedral'];
    await query.run(
        `INSERT INTO route_segments (route_id, segment_order, mode, start_location_id, end_location_id, fare, estimated_time, notes)
         VALUES (?, 1, 'Jeepney', ?, ?, 12.00, 15, 'Jeepney: Bonuan – Dagupan')`,
        [r1.lastID, bonuanLocId || null, plazaLocId || null]
    );
    await query.run(
        `INSERT INTO route_segments (route_id, segment_order, mode, start_location_id, end_location_id, fare, estimated_time, notes)
         VALUES (?, 2, 'Tricycle', ?, ?, 8.00, 5, 'Tricycle: Dagupan Plaza – Bonuan Beach')`,
        [r1.lastID, plazaLocId || null, bonuanLocId || null]
    );
    await query.run(
        `INSERT INTO route_segments (route_id, segment_order, mode, start_location_id, end_location_id, fare, estimated_time, notes)
         VALUES (?, 3, 'Walk', NULL, ?, 0, 3, 'Walk: Terminal to Stop')`,
        [r1.lastID, bonuanLocId || null]
    );

    console.log('Sample boat route and route segments seeded (SAMPLE DATA).');

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
