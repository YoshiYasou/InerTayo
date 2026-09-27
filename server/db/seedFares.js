'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { connectDB, disconnectDB } = require('./connection');
const TricycleFare = require('../models/TricycleFare');
const RouteFare = require('../models/RouteFare');
const BoatFare = require('../models/BoatFare');
const BoatRouteDetail = require('../models/BoatRouteDetail');
const Location = require('../models/Location');

async function seedFares() {
    await connectDB();
    console.log('Seeding authoritative structured fares into MongoDB...');

    const dataPath = path.resolve(__dirname, '../data/fare_matrix_structured.json');
    if (!fs.existsSync(dataPath)) {
        throw new Error(`Data file not found at: ${dataPath}`);
    }

    const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    // ── 1. Tricycles (Zone-based)
    let tricycleUpserts = 0;
    const tricyclesList = rawData.tricycles || [];
    for (const item of tricyclesList) {
        // Skip header row
        if (item.zone === 'Zone Category' || !item.barangay || !item.solo_fare?.min) continue;

        await TricycleFare.updateOne(
            { barangay: item.barangay },
            {
                $set: {
                    zone: item.zone,
                    barangay: item.barangay,
                    landmarks: item.landmarks || '',
                    solo_fare: { min: item.solo_fare.min, max: item.solo_fare.max },
                    fare_per_2pax: { min: item.fare_per_2pax.min, max: item.fare_per_2pax.max },
                    fare_per_3pax_shared: { min: item.fare_per_3pax_shared.min, max: item.fare_per_3pax_shared.max },
                    updated_at: new Date()
                },
                $setOnInsert: { created_at: new Date() }
            },
            { upsert: true }
        );
        tricycleUpserts++;
    }
    console.log(`✓ Tricycle fares upserted: ${tricycleUpserts}`);

    // Helper for Route fares
    async function upsertRouteFares(list, modeKey, waypointsKey = 'waypoints', distKey = 'distance_km') {
        let count = 0;
        for (const item of list) {
            // Skip header row
            if (item.route_name === 'Route Name' || !item.regular_fare?.min) continue;

            await RouteFare.updateOne(
                { transport_mode: modeKey, route_name: item.route_name },
                {
                    $set: {
                        transport_mode: modeKey,
                        route_name: item.route_name,
                        terminal: item.terminal || '',
                        waypoints: item[waypointsKey] || '',
                        distance_km: item[distKey] || null,
                        regular_fare: { min: item.regular_fare.min, max: item.regular_fare.max },
                        discounted_fare_20pct: { min: item.discounted_fare_20pct.min, max: item.discounted_fare_20pct.max },
                        updated_at: new Date()
                    },
                    $setOnInsert: { created_at: new Date() }
                },
                { upsert: true }
            );
            count++;
        }
        return count;
    }

    // ── 2. Jeepneys
    const jeepneyCount = await upsertRouteFares(rawData.jeepneys || [], 'jeepney');
    console.log(`✓ Traditional Jeepney fares upserted: ${jeepneyCount}`);

    // ── 3. Modern PUV
    const modernPuvCount = await upsertRouteFares(rawData.modern_puv || [], 'modern_puv');
    console.log(`✓ Modern Aircon PUV fares upserted: ${modernPuvCount}`);

    // ── 4. UV Express
    const uvCount = await upsertRouteFares(rawData.uv_express || [], 'uv_express', 'vehicle_or_service_type');
    console.log(`✓ UV Express fares upserted: ${uvCount}`);

    // ── 5. Provincial Buses
    const busCount = await upsertRouteFares(rawData.provincial_buses || [], 'provincial_bus', 'vehicle_or_service_type');
    console.log(`✓ Provincial Bus fares upserted: ${busCount}`);

    // ── 6. Water Boats
    let boatCount = 0;
    const boatsList = rawData.water_boats || [];
    for (const item of boatsList) {
        if (item.service_type === 'Service Type' || !item.fare_rate_note) continue;

        await BoatFare.updateOne(
            { service_type: item.service_type },
            {
                $set: {
                    service_type: item.service_type,
                    dock_location: item.dock_location || '',
                    destinations: item.destinations || '',
                    fare_rate_note: item.fare_rate_note,
                    updated_at: new Date()
                },
                $setOnInsert: { created_at: new Date() }
            },
            { upsert: true }
        );
        boatCount++;
    }
    console.log(`✓ Water Boat fares upserted: ${boatCount}`);

    // ── 7. Audit Data Fixes (Route 22 metadata & Location boundary alignments)
    const existingBoat22 = await BoatRouteDetail.findOne({ route_id: 22 });
    if (!existingBoat22) {
        await BoatRouteDetail.create({
            id: 2,
            route_id: 22,
            waterway: 'Pantal River',
            origin_river_stop_id: 80,
            destination_river_stop_id: 79,
            operating_status: 'UNAVAILABLE',
            notes: 'Proposed river crossing route; service pending verification.'
        });
        console.log('✓ Inserted missing BoatRouteDetail for Route #22');
    }

    // Align Bonuan Binloc Location (ID 36) near route transit center & inside boundary
    await Location.updateOne(
        { id: 36 },
        { $set: { latitude: 16.0755, longitude: 120.3510, updated_at: new Date() } }
    );
    console.log('✓ Reconciled Bonuan Binloc (Location ID 36) coordinates');

    // Align Mangin Location (ID 49) inside Dagupan boundary
    await Location.updateOne(
        { id: 49 },
        { $set: { latitude: 16.0580, longitude: 120.3650, updated_at: new Date() } }
    );
    console.log('✓ Reconciled Mangin (Location ID 49) coordinates');

    console.log('====================================================');
    console.log('  Fare matrix and data fixes seeded successfully!   ');
    console.log('====================================================');
}

if (require.main === module) {
    seedFares()
        .then(async () => {
            await disconnectDB();
            process.exit(0);
        })
        .catch(async (err) => {
            console.error('Failed to seed fares:', err);
            await disconnectDB();
            process.exit(1);
        });
}

module.exports = { seedFares };
