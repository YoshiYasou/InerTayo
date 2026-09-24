'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('./connection');
const { Counter } = require('./counter');
const User = require('../models/User');
const TransportMode = require('../models/TransportMode');
const Route = require('../models/Route');
const Stop = require('../models/Stop');
const RouteStep = require('../models/RouteStep');
const Fare = require('../models/Fare');
const Advisory = require('../models/Advisory');
const AdvisoryRoute = require('../models/AdvisoryRoute');
const Feedback = require('../models/Feedback');
const SavedRoute = require('../models/SavedRoute');
const Landmark = require('../models/Landmark');
const Location = require('../models/Location');
const BoatRouteDetail = require('../models/BoatRouteDetail');
const RouteSegment = require('../models/RouteSegment');
const School = require('../models/School');
const PasswordReset = require('../models/PasswordReset');
const seedData = require('./seedData.json');

async function seed() {
    console.log('Seeding InerTayo MongoDB database with Dagupan City transit data...');

    if (mongoose.connection.readyState === 0) {
        await connectDB();
    }

    // Clear existing data across all collections
    await Promise.all([
        User.deleteMany({}),
        TransportMode.deleteMany({}),
        Route.deleteMany({}),
        Stop.deleteMany({}),
        RouteStep.deleteMany({}),
        Fare.deleteMany({}),
        Advisory.deleteMany({}),
        AdvisoryRoute.deleteMany({}),
        Feedback.deleteMany({}),
        SavedRoute.deleteMany({}),
        Landmark.deleteMany({}),
        Location.deleteMany({}),
        BoatRouteDetail.deleteMany({}),
        RouteSegment.deleteMany({}),
        School.deleteMany({}),
        PasswordReset.deleteMany({}),
        Counter.deleteMany({})
    ]);

    // Insert all seed collections
    if (seedData.users && seedData.users.length > 0) {
        await User.insertMany(seedData.users);
        await Counter.findByIdAndUpdate('User', { seq: Math.max(...seedData.users.map(u => u.id)) }, { upsert: true });
    }

    if (seedData.transport_modes && seedData.transport_modes.length > 0) {
        await TransportMode.insertMany(seedData.transport_modes);
        await Counter.findByIdAndUpdate('TransportMode', { seq: Math.max(...seedData.transport_modes.map(m => m.id)) }, { upsert: true });
    }

    if (seedData.routes && seedData.routes.length > 0) {
        await Route.insertMany(seedData.routes);
        await Counter.findByIdAndUpdate('Route', { seq: Math.max(...seedData.routes.map(r => r.id)) }, { upsert: true });
    }

    if (seedData.stops && seedData.stops.length > 0) {
        await Stop.insertMany(seedData.stops);
        await Counter.findByIdAndUpdate('Stop', { seq: Math.max(...seedData.stops.map(s => s.id)) }, { upsert: true });
    }

    if (seedData.route_steps && seedData.route_steps.length > 0) {
        await RouteStep.insertMany(seedData.route_steps);
        await Counter.findByIdAndUpdate('RouteStep', { seq: Math.max(...seedData.route_steps.map(s => s.id)) }, { upsert: true });
    }

    if (seedData.fares && seedData.fares.length > 0) {
        await Fare.insertMany(seedData.fares);
        await Counter.findByIdAndUpdate('Fare', { seq: Math.max(...seedData.fares.map(f => f.id)) }, { upsert: true });
    }

    if (seedData.advisories && seedData.advisories.length > 0) {
        await Advisory.insertMany(seedData.advisories);
        await Counter.findByIdAndUpdate('Advisory', { seq: Math.max(...seedData.advisories.map(a => a.id)) }, { upsert: true });
    }

    if (seedData.advisory_routes && seedData.advisory_routes.length > 0) {
        await AdvisoryRoute.insertMany(seedData.advisory_routes);
        await Counter.findByIdAndUpdate('AdvisoryRoute', { seq: Math.max(...seedData.advisory_routes.map(ar => ar.id)) }, { upsert: true });
    }

    if (seedData.feedback && seedData.feedback.length > 0) {
        await Feedback.insertMany(seedData.feedback);
        await Counter.findByIdAndUpdate('Feedback', { seq: Math.max(...seedData.feedback.map(f => f.id)) }, { upsert: true });
    }

    if (seedData.saved_routes && seedData.saved_routes.length > 0) {
        await SavedRoute.insertMany(seedData.saved_routes);
        await Counter.findByIdAndUpdate('SavedRoute', { seq: Math.max(...seedData.saved_routes.map(sr => sr.id)) }, { upsert: true });
    }

    if (seedData.landmarks && seedData.landmarks.length > 0) {
        await Landmark.insertMany(seedData.landmarks);
        await Counter.findByIdAndUpdate('Landmark', { seq: Math.max(...seedData.landmarks.map(l => l.id)) }, { upsert: true });
    }

    if (seedData.locations && seedData.locations.length > 0) {
        await Location.insertMany(seedData.locations);
        await Counter.findByIdAndUpdate('Location', { seq: Math.max(...seedData.locations.map(loc => loc.id)) }, { upsert: true });
    }

    if (seedData.boat_route_details && seedData.boat_route_details.length > 0) {
        await BoatRouteDetail.insertMany(seedData.boat_route_details);
        await Counter.findByIdAndUpdate('BoatRouteDetail', { seq: Math.max(...seedData.boat_route_details.map(b => b.id)) }, { upsert: true });
    }

    if (seedData.route_segments && seedData.route_segments.length > 0) {
        await RouteSegment.insertMany(seedData.route_segments);
        await Counter.findByIdAndUpdate('RouteSegment', { seq: Math.max(...seedData.route_segments.map(rs => rs.id)) }, { upsert: true });
    }

    if (seedData.schools && seedData.schools.length > 0) {
        const parsedSchools = seedData.schools.map(sch => {
            let stops = [];
            try {
                stops = typeof sch.nearby_stops === 'string' ? JSON.parse(sch.nearby_stops) : (sch.nearby_stops || []);
            } catch (e) {
                stops = [];
            }
            return {
                ...sch,
                nearby_stops: stops
            };
        });
        await School.insertMany(parsedSchools);
        await Counter.findByIdAndUpdate('School', { seq: Math.max(...seedData.schools.map(s => s.id)) }, { upsert: true });
    }

    console.log('MongoDB transit data seeded successfully!');
}

if (require.main === module) {
    const { disconnectDB } = require('./connection');
    connectDB()
        .then(() => seed())
        .then(() => disconnectDB())
        .then(() => {
            console.log('Seeding finished.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('Seed error:', err);
            process.exit(1);
        });
}

module.exports = { seed };
