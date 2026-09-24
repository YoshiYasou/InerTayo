'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

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
const { nextId } = require('../db/counter');

const { authenticateToken, optionalAuth, requireAdmin, requireCommuter, JWT_SECRET } = require('../middleware/auth');
const ROUTING_CONFIG = require('../config/routingConfig');
const { getWalkingRoute } = require('../services/walkingRouter');
const { isInsideDagupanCity } = require('../utils/dagupanBoundary');
const { planJourney } = require('../services/journeyEngine');
const { haversineDistance } = require('../utils/geoUtils');

const router = express.Router();

// Helper: parse ID from request parameter
function parseId(param) {
    const num = parseInt(param, 10);
    return isNaN(num) ? null : num;
}

// Helper: sync route status based on active advisories and boat details
async function syncRouteAdvisoryStatus(routeId) {
    const advRoutes = await AdvisoryRoute.find({ route_id: routeId }).lean();
    const advIds = advRoutes.map(ar => ar.advisory_id);
    const activeAdvisories = await Advisory.find({ id: { $in: advIds }, status: 'ACTIVE' }).lean();

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

    const boatDetail = await BoatRouteDetail.findOne({ route_id: routeId }).lean();
    if (boatDetail && (boatDetail.operating_status === 'SUSPENDED' || boatDetail.operating_status === 'UNAVAILABLE')) {
        newStatus = 'UNAVAILABLE';
    }

    await Route.updateOne({ id: routeId }, { status: newStatus, updated_at: new Date() });
    return newStatus;
}

// ============================================================================
// 1. PUBLIC TRANSIT ENDPOINTS (Accessible to Commuters & Guests)
// ============================================================================

// Health check
router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: 'MongoDB',
        connected: mongoose.connection.readyState === 1
    });
});

// GET /api/transport-modes - List all transport modes
router.get('/transport-modes', async (req, res) => {
    try {
        const modes = await TransportMode.find().sort({ id: 1 }).lean();
        res.json(modes);
    } catch (err) {
        console.error('Error fetching transport modes:', err);
        res.status(500).json({ error: 'Failed to retrieve transport modes.' });
    }
});

// GET /api/search/suggestions - Unified search suggestions
router.get('/search/suggestions', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim() === '') {
            return res.json([]);
        }

        const queryTerm = q.trim();
        const regex = new RegExp(queryTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        // 1. Schools
        const matchingSchools = await School.find({
            active: 1,
            $or: [
                { name: regex },
                { aliases: regex },
                { address: regex },
                { barangay: regex }
            ]
        }).lean();

        // Sort schools
        matchingSchools.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const qLower = queryTerm.toLowerCase();
            const aRank = aName === qLower ? 1 : ((a.aliases && a.aliases.toLowerCase().includes(qLower)) ? 2 : (aName.startsWith(qLower) ? 3 : 4));
            const bRank = bName === qLower ? 1 : ((b.aliases && b.aliases.toLowerCase().includes(qLower)) ? 2 : (bName.startsWith(qLower) ? 3 : 4));
            if (aRank !== bRank) return aRank - bRank;
            return aName.localeCompare(bName);
        });

        const schoolSuggestions = matchingSchools.slice(0, 6).map(sch => {
            let stops = [];
            try {
                stops = typeof sch.nearby_stops === 'string' ? JSON.parse(sch.nearby_stops) : (sch.nearby_stops || []);
            } catch (e) {
                stops = [];
            }
            return {
                id: sch.id,
                name: sch.name,
                aliases: sch.aliases,
                type: sch.type,
                typeLabel: sch.type === 'UNIVERSITY' ? 'University' : (sch.type === 'COLLEGE' ? 'College' : 'School'),
                barangay: sch.barangay,
                address: sch.address,
                latitude: sch.entrance_latitude || sch.latitude,
                longitude: sch.entrance_longitude || sch.longitude,
                campusLatitude: sch.latitude,
                campusLongitude: sch.longitude,
                nearby_stops: stops,
                category: 'school'
            };
        });

        // 2. Locations
        const matchingLocations = await Location.find({
            status: 'ACTIVE',
            $or: [
                { name: regex },
                { barangay: regex },
                { search_keywords: regex },
                { address: regex }
            ]
        }).lean();

        matchingLocations.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const qLower = queryTerm.toLowerCase();
            const aRank = aName === qLower ? 1 : (aName.startsWith(qLower) ? 2 : ((a.search_keywords && a.search_keywords.toLowerCase().includes(qLower)) ? 3 : 4));
            const bRank = bName === qLower ? 1 : (bName.startsWith(qLower) ? 2 : ((b.search_keywords && b.search_keywords.toLowerCase().includes(qLower)) ? 3 : 4));
            if (aRank !== bRank) return aRank - bRank;
            return aName.localeCompare(bName);
        });

        const getTypeLabel = (type) => {
            const upper = (type || '').toUpperCase();
            switch (upper) {
                case 'STREET':
                case 'ROAD': return 'Street / Road';
                case 'BARANGAY': return 'Barangay';
                case 'LANDMARK':
                case 'ESTABLISHMENT': return 'Landmark';
                case 'TERMINAL': return 'Terminal';
                case 'RIVER_STOP': return 'River Stop';
                case 'DESTINATION': return 'Destination';
                case 'INTERSECTION': return 'Intersection';
                default: return 'Location';
            }
        };

        const locationSuggestions = matchingLocations.slice(0, 12).map(loc => ({
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

        // 3. Routes
        const matchingRoutes = await Route.find({
            $or: [
                { route_name: regex },
                { origin: regex },
                { destination: regex },
                { description: regex }
            ]
        }).sort({ route_name: 1 }).lean();

        const modes = await TransportMode.find().lean();
        const modeMap = new Map(modes.map(m => [m.id, m]));

        const routeSuggestions = matchingRoutes.slice(0, 6).map(r => {
            const m = modeMap.get(r.transport_mode_id) || {};
            return {
                id: r.id,
                name: r.route_name,
                type: 'ROUTE',
                typeLabel: 'Route',
                mode: m.name,
                modeIcon: m.icon,
                origin: r.origin,
                destination: r.destination,
                status: r.status,
                category: 'route'
            };
        });

        res.json([...schoolSuggestions, ...locationSuggestions, ...routeSuggestions]);
    } catch (err) {
        console.error('Error fetching search suggestions:', err);
        res.status(500).json({ error: 'Failed to retrieve search suggestions.' });
    }
});

// GET /api/locations - List and search locations
router.get('/locations', async (req, res) => {
    try {
        const { search, type, status } = req.query;
        const filter = {};

        if (status && status !== 'ALL') {
            filter.status = status.toUpperCase();
        } else if (!status) {
            filter.status = 'ACTIVE';
        }

        if (type && type !== 'ALL') {
            const upperType = type.toUpperCase();
            if (upperType === 'ROAD' || upperType === 'STREET') {
                filter.type = { $in: ['STREET', 'ROAD'] };
            } else {
                filter.type = upperType;
            }
        }

        if (search && search.trim() !== '') {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [
                { name: regex },
                { barangay: regex },
                { search_keywords: regex },
                { address: regex },
                { description: regex }
            ];
        }

        const locations = await Location.find(filter, {
            id: 1, name: 1, type: 1, barangay: 1, address: 1,
            latitude: 1, longitude: 1, description: 1, search_keywords: 1,
            status: 1, created_at: 1, updated_at: 1, _id: 0
        }).sort({ name: 1 }).lean();

        res.json(locations);
    } catch (err) {
        console.error('Error fetching locations:', err);
        res.status(500).json({ error: 'Failed to retrieve locations.' });
    }
});

// GET /api/locations/:id - Single location details with connected routes
router.get('/locations/:id', async (req, res) => {
    try {
        const locationId = parseId(req.params.id);
        if (locationId === null) {
            return res.status(400).json({ error: 'Invalid location ID.' });
        }

        const location = await Location.findOne({ id: locationId }, {
            id: 1, name: 1, type: 1, barangay: 1, address: 1,
            latitude: 1, longitude: 1, description: 1, search_keywords: 1,
            status: 1, created_at: 1, updated_at: 1, _id: 0
        }).lean();

        if (!location) {
            return res.status(404).json({ error: 'Location not found.' });
        }

        // Find segments connecting to this location
        const segments = await RouteSegment.find({
            $or: [{ start_location_id: locationId }, { end_location_id: locationId }]
        }).lean();
        const segmentRouteIds = segments.map(s => s.route_id);

        // Find stops with name matching location
        const locRegex = new RegExp(location.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const stops = await Stop.find({ stop_name: locRegex }).lean();
        const stopRouteIds = stops.map(s => s.route_id);

        const routeFilter = {
            $or: [
                { id: { $in: [...segmentRouteIds, ...stopRouteIds] } },
                { origin: locRegex },
                { destination: locRegex },
                { description: locRegex }
            ]
        };

        const matchingRoutes = await Route.find(routeFilter).lean();
        const modes = await TransportMode.find().lean();
        const modeMap = new Map(modes.map(m => [m.id, m]));

        const connectedRoutes = matchingRoutes.map(r => {
            const m = modeMap.get(r.transport_mode_id) || {};
            return {
                id: r.id,
                route_name: r.route_name,
                mode_name: m.name,
                mode_icon: m.icon,
                minimum_fare: r.minimum_fare,
                maximum_fare: r.maximum_fare,
                status: r.status
            };
        });

        res.json({
            ...location,
            available_routes: connectedRoutes
        });
    } catch (err) {
        console.error('Error fetching location detail:', err);
        res.status(500).json({ error: 'Failed to retrieve location.' });
    }
});

// GET /api/landmarks - List reference landmarks
router.get('/landmarks', async (req, res) => {
    try {
        const { search, type } = req.query;
        const filter = {};

        if (type && type !== 'ALL') {
            filter.type = type.toUpperCase();
        }

        if (search && search.trim() !== '') {
            filter.name = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }

        const landmarks = await Landmark.find(filter, {
            id: 1, name: 1, latitude: 1, longitude: 1, type: 1, _id: 0
        }).sort({ name: 1 }).lean();

        res.json(landmarks);
    } catch (err) {
        console.error('Error fetching landmarks:', err);
        res.status(500).json({ error: 'Failed to retrieve landmarks.' });
    }
});

// GET /api/schools - List verified schools inside Dagupan City
router.get('/schools', async (req, res) => {
    try {
        const { search, type } = req.query;
        const filter = { active: 1 };

        if (type && type !== 'ALL') {
            filter.type = type.toUpperCase();
        }

        if (search && search.trim() !== '') {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [
                { name: regex },
                { aliases: regex },
                { address: regex },
                { barangay: regex }
            ];
        }

        const schools = await School.find(filter).sort({ name: 1 }).lean();
        const formatted = schools.map(sch => {
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

        res.json(formatted);
    } catch (err) {
        console.error('Error fetching schools:', err);
        res.status(500).json({ error: 'Failed to retrieve schools.' });
    }
});

// GET /api/schools/search - Search schools by name or alias
router.get('/schools/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim() === '') {
            return res.json([]);
        }

        const queryTerm = q.trim();
        const regex = new RegExp(queryTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        const schools = await School.find({
            active: 1,
            $or: [
                { name: regex },
                { aliases: regex },
                { address: regex },
                { barangay: regex }
            ]
        }).lean();

        schools.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const qLower = queryTerm.toLowerCase();
            const aRank = aName === qLower ? 1 : ((a.aliases && a.aliases.toLowerCase().includes(qLower)) ? 2 : (aName.startsWith(qLower) ? 3 : 4));
            const bRank = bName === qLower ? 1 : ((b.aliases && b.aliases.toLowerCase().includes(qLower)) ? 2 : (bName.startsWith(qLower) ? 3 : 4));
            if (aRank !== bRank) return aRank - bRank;
            return aName.localeCompare(bName);
        });

        const formatted = schools.map(sch => {
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

        res.json(formatted);
    } catch (err) {
        console.error('Error searching schools:', err);
        res.status(500).json({ error: 'Failed to search schools.' });
    }
});

// GET /api/schools/:id - Single school details
router.get('/schools/:id', async (req, res) => {
    try {
        const schoolId = parseId(req.params.id);
        if (schoolId === null) {
            return res.status(400).json({ error: 'Invalid school ID format.' });
        }

        const sch = await School.findOne({ id: schoolId }).lean();
        if (!sch) {
            return res.status(404).json({ error: 'School not found.' });
        }

        let stops = [];
        try {
            stops = typeof sch.nearby_stops === 'string' ? JSON.parse(sch.nearby_stops) : (sch.nearby_stops || []);
        } catch (e) {
            stops = [];
        }

        res.json({
            ...sch,
            nearby_stops: stops
        });
    } catch (err) {
        console.error('Error fetching school details:', err);
        res.status(500).json({ error: 'Failed to retrieve school.' });
    }
});

// GET /api/directions/walk - Server-side pedestrian routing proxy
router.get('/directions/walk', async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({ error: 'Both start and end parameters are required in format "lon,lat".' });
        }

        const startCoords = start.split(',').map(Number);
        const endCoords = end.split(',').map(Number);

        if (startCoords.length < 2 || isNaN(startCoords[0]) || isNaN(startCoords[1]) ||
            endCoords.length < 2 || isNaN(endCoords[0]) || isNaN(endCoords[1])) {
            return res.status(400).json({ error: 'Coordinates must be valid numbers in format "lon,lat".' });
        }

        const route = await getWalkingRoute(startCoords, endCoords);
        res.json(route);
    } catch (err) {
        console.error('Walking route error:', err);
        res.status(500).json({ error: 'Failed to calculate walking route.' });
    }
});

// POST /api/journey/plan - Multi-modal journey planner for Dagupan City
router.post('/journey/plan', async (req, res) => {
    try {
        const { origin, destination, preferredModes, leaveNow } = req.body;
        if (!origin || !destination) {
            return res.status(400).json({ error: 'Both origin and destination are required.' });
        }

        const plan = await planJourney({ origin, destination, preferredModes, leaveNow });
        res.json(plan);
    } catch (err) {
        console.error('Journey planning error:', err);
        res.status(400).json({ error: err.message || 'Failed to plan journey.' });
    }
});

// GET /api/geocode - OSM Nominatim geocoding with database caching
router.get('/geocode', async (req, res) => {
    try {
        const { query: queryText } = req.query;
        if (!queryText || queryText.trim() === '') {
            return res.status(400).json({ error: 'Query parameter is required.' });
        }

        const cleanQuery = queryText.trim();
        const regex = new RegExp(cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

        // 0. Check unified locations
        const locMatch = await Location.findOne({
            $or: [{ name: regex }, { search_keywords: regex }, { barangay: regex }],
            latitude: { $ne: null },
            longitude: { $ne: null }
        }).lean();

        if (locMatch) {
            return res.json({
                name: locMatch.name,
                latitude: locMatch.latitude,
                longitude: locMatch.longitude,
                source: 'database_location'
            });
        }

        // 1. Check local landmarks
        const dbMatch = await Landmark.findOne({ name: regex }).lean();
        if (dbMatch) {
            return res.json({
                name: dbMatch.name,
                latitude: dbMatch.latitude,
                longitude: dbMatch.longitude,
                source: 'database_cache'
            });
        }

        // 2. Check local stops
        const stopMatch = await Stop.findOne({
            stop_name: regex,
            latitude: { $ne: null },
            longitude: { $ne: null }
        }).lean();

        if (stopMatch) {
            return res.json({
                name: stopMatch.stop_name,
                latitude: stopMatch.latitude,
                longitude: stopMatch.longitude,
                source: 'database_stop'
            });
        }

        // 3. Fallback: Query OSM Nominatim
        const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery + ', Dagupan, Pangasinan')}&limit=1`;
        try {
            const osmRes = await fetch(osmUrl, {
                headers: { 'User-Agent': 'InerTayo-Dagupan-Transit/1.0 (transit@inertayo.ph)' }
            });

            if (osmRes.ok) {
                const data = await osmRes.json();
                if (Array.isArray(data) && data.length > 0) {
                    const result = data[0];
                    const lat = parseFloat(result.lat);
                    const lon = parseFloat(result.lon);

                    try {
                        const existingLm = await Landmark.findOne({ name: cleanQuery });
                        if (!existingLm) {
                            const newLmId = await nextId('Landmark');
                            await Landmark.create({
                                id: newLmId,
                                name: cleanQuery,
                                latitude: lat,
                                longitude: lon,
                                type: 'GEOCODED'
                            });
                        }
                    } catch (e) {}

                    return res.json({
                        name: result.display_name,
                        latitude: lat,
                        longitude: lon,
                        source: 'nominatim_osm'
                    });
                }
            }
        } catch (e) {}

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

// GET /api/routes - Search, filter, and sort routes
router.get('/routes', async (req, res) => {
    try {
        const { search, mode, sort, from, to, use_corrected } = req.query;
        const useCorrected = (use_corrected !== 'false') && ROUTING_CONFIG.USE_CORRECTED_GEOMETRY;

        const allRoutes = await Route.find().lean();
        const allModes = await TransportMode.find().lean();
        const modeMap = new Map(allModes.map(m => [m.id, m]));
        const allStops = await Stop.find().lean();
        const stopsByRoute = new Map();
        for (const s of allStops) {
            if (!stopsByRoute.has(s.route_id)) stopsByRoute.set(s.route_id, []);
            stopsByRoute.get(s.route_id).push(s);
        }

        const allSegments = await RouteSegment.find().lean();
        const allLocations = await Location.find().lean();
        const locMap = new Map(allLocations.map(l => [l.id, l]));

        const boatDetails = await BoatRouteDetail.find().lean();
        const boatMap = new Map(boatDetails.map(b => [b.route_id, b]));

        // Mode filter
        let filteredRoutes = allRoutes;
        if (mode && mode !== 'All Modes' && mode !== 'ALL') {
            filteredRoutes = filteredRoutes.filter(r => {
                const m = modeMap.get(r.transport_mode_id);
                return m && m.name.toLowerCase() === mode.toLowerCase();
            });
        }

        // Search filter
        if (search && search.trim() !== '') {
            const term = search.trim().toLowerCase();
            const termRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

            // Find matching schools for proximity
            const matchingSchools = await School.find({
                active: 1,
                $or: [{ name: termRegex }, { aliases: termRegex }]
            }).lean();

            const schoolProximityRouteIds = new Set();
            for (const sch of matchingSchools) {
                const schLat = sch.entrance_latitude || sch.latitude;
                const schLng = sch.entrance_longitude || sch.longitude;
                if (schLat && schLng) {
                    for (const s of allStops) {
                        if (s.latitude && s.longitude) {
                            const dSq = (s.latitude - schLat) * (s.latitude - schLat) + (s.longitude - schLng) * (s.longitude - schLng);
                            if (dSq < 0.000054) {
                                schoolProximityRouteIds.add(s.route_id);
                            }
                        }
                    }
                }
            }

            filteredRoutes = filteredRoutes.filter(r => {
                if (r.route_name.toLowerCase().includes(term) ||
                    r.origin.toLowerCase().includes(term) ||
                    r.destination.toLowerCase().includes(term) ||
                    (r.description && r.description.toLowerCase().includes(term))) {
                    return true;
                }

                if (schoolProximityRouteIds.has(r.id)) return true;

                // Check stops
                const stops = stopsByRoute.get(r.id) || [];
                if (stops.some(s => s.stop_name.toLowerCase().includes(term))) return true;

                // Check segments
                const segs = allSegments.filter(seg => seg.route_id === r.id);
                for (const seg of segs) {
                    const startLoc = locMap.get(seg.start_location_id);
                    const endLoc = locMap.get(seg.end_location_id);
                    if (startLoc && (startLoc.name.toLowerCase().includes(term) || (startLoc.barangay && startLoc.barangay.toLowerCase().includes(term)) || (startLoc.search_keywords && startLoc.search_keywords.toLowerCase().includes(term)))) return true;
                    if (endLoc && (endLoc.name.toLowerCase().includes(term) || (endLoc.barangay && endLoc.barangay.toLowerCase().includes(term)) || (endLoc.search_keywords && endLoc.search_keywords.toLowerCase().includes(term)))) return true;
                }

                return false;
            });
        }

        // FROM filter
        if (from && from.trim() !== '') {
            const term = from.trim().toLowerCase();
            filteredRoutes = filteredRoutes.filter(r => {
                if (r.origin.toLowerCase().includes(term) || r.route_name.toLowerCase().includes(term) || (r.description && r.description.toLowerCase().includes(term))) return true;
                const stops = stopsByRoute.get(r.id) || [];
                if (stops.some(s => s.stop_name.toLowerCase().includes(term))) return true;
                const segs = allSegments.filter(seg => seg.route_id === r.id);
                for (const seg of segs) {
                    const startLoc = locMap.get(seg.start_location_id);
                    const endLoc = locMap.get(seg.end_location_id);
                    if (startLoc && (startLoc.name.toLowerCase().includes(term) || (startLoc.barangay && startLoc.barangay.toLowerCase().includes(term)) || (startLoc.search_keywords && startLoc.search_keywords.toLowerCase().includes(term)))) return true;
                    if (endLoc && (endLoc.name.toLowerCase().includes(term) || (endLoc.barangay && endLoc.barangay.toLowerCase().includes(term)) || (endLoc.search_keywords && endLoc.search_keywords.toLowerCase().includes(term)))) return true;
                }
                return false;
            });
        }

        // TO filter
        if (to && to.trim() !== '') {
            const term = to.trim().toLowerCase();
            filteredRoutes = filteredRoutes.filter(r => {
                if (r.destination.toLowerCase().includes(term) || r.route_name.toLowerCase().includes(term) || (r.description && r.description.toLowerCase().includes(term))) return true;
                const stops = stopsByRoute.get(r.id) || [];
                if (stops.some(s => s.stop_name.toLowerCase().includes(term))) return true;
                const segs = allSegments.filter(seg => seg.route_id === r.id);
                for (const seg of segs) {
                    const startLoc = locMap.get(seg.start_location_id);
                    const endLoc = locMap.get(seg.end_location_id);
                    if (startLoc && (startLoc.name.toLowerCase().includes(term) || (startLoc.barangay && startLoc.barangay.toLowerCase().includes(term)) || (startLoc.search_keywords && startLoc.search_keywords.toLowerCase().includes(term)))) return true;
                    if (endLoc && (endLoc.name.toLowerCase().includes(term) || (endLoc.barangay && endLoc.barangay.toLowerCase().includes(term)) || (endLoc.search_keywords && endLoc.search_keywords.toLowerCase().includes(term)))) return true;
                }
                return false;
            });
        }

        // Load active advisories
        const activeAdvisories = await Advisory.find({ status: 'ACTIVE' }).lean();
        const advMap = new Map(activeAdvisories.map(a => [a.id, a]));
        const advisoryRoutes = await AdvisoryRoute.find().lean();
        const advisoriesByRoute = new Map();
        for (const ar of advisoryRoutes) {
            if (advMap.has(ar.advisory_id)) {
                if (!advisoriesByRoute.has(ar.route_id)) advisoriesByRoute.set(ar.route_id, []);
                advisoriesByRoute.get(ar.route_id).push(advMap.get(ar.advisory_id));
            }
        }

        // Transform results
        const results = filteredRoutes.map(r => {
            const m = modeMap.get(r.transport_mode_id) || {};
            const boat = boatMap.get(r.id);
            const active_travel_time = (r.status === 'DETOUR_ACTIVE' && r.detour_time != null) ? r.detour_time : r.estimated_time;
            let status = r.status;
            if (boat && (boat.operating_status === 'SUSPENDED' || boat.operating_status === 'UNAVAILABLE')) {
                status = 'UNAVAILABLE';
            }
            const geometry = (useCorrected && r.use_corrected_geometry === 1 && r.geometry_corrected) ? r.geometry_corrected : r.geometry;

            return {
                id: r.id,
                route_name: r.route_name,
                transport_mode_id: r.transport_mode_id,
                mode_name: m.name,
                mode_icon: m.icon,
                origin: r.origin,
                destination: r.destination,
                estimated_time: r.estimated_time,
                detour_time: r.detour_time,
                active_travel_time,
                minimum_fare: r.minimum_fare,
                maximum_fare: r.maximum_fare,
                status,
                description: r.description,
                geometry_original: r.geometry,
                geometry_corrected: r.geometry_corrected,
                use_corrected_geometry: r.use_corrected_geometry,
                geometry,
                created_at: r.created_at,
                updated_at: r.updated_at,
                waterway: boat ? boat.waterway : null,
                boat_operating_status: boat ? boat.operating_status : null,
                advisories: advisoriesByRoute.get(r.id) || []
            };
        });

        // Sorting
        if (sort === 'cheapest' || sort === 'Cheapest Fare') {
            results.sort((a, b) => a.minimum_fare - b.minimum_fare || a.active_travel_time - b.active_travel_time);
        } else {
            results.sort((a, b) => a.active_travel_time - b.active_travel_time || a.minimum_fare - b.minimum_fare);
        }

        res.json(results);
    } catch (err) {
        console.error('Error fetching routes:', err);
        res.status(500).json({ error: 'Failed to retrieve routes.' });
    }
});

// GET /api/routes/nearby - Find existing routes serving a geographic point
router.get('/routes/nearby', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({ error: 'lat and lng are required numeric parameters.' });
        }

        const inDagupan = isInsideDagupanCity(lat, lng);
        if (!inDagupan) {
            return res.json({ routes: [], outsideDagupan: true });
        }

        const radius = parseFloat(req.query.radius) || ROUTING_CONFIG.walkingRadius;
        const { mode, sort, use_corrected } = req.query;
        const useCorrected = (use_corrected !== 'false') && ROUTING_CONFIG.USE_CORRECTED_GEOMETRY;

        let allRoutes = await Route.find().lean();
        const allModes = await TransportMode.find().lean();
        const modeMap = new Map(allModes.map(m => [m.id, m]));
        const boatDetails = await BoatRouteDetail.find().lean();
        const boatMap = new Map(boatDetails.map(b => [b.route_id, b]));

        if (mode && mode !== 'All Modes' && mode !== 'ALL') {
            allRoutes = allRoutes.filter(r => {
                const m = modeMap.get(r.transport_mode_id);
                return m && m.name.toLowerCase() === mode.toLowerCase();
            });
        }

        const allStops = await Stop.find({
            latitude: { $ne: null },
            longitude: { $ne: null }
        }).sort({ route_id: 1, stop_order: 1 }).lean();

        const stopsByRoute = {};
        for (const stop of allStops) {
            if (!stopsByRoute[stop.route_id]) stopsByRoute[stop.route_id] = [];
            stopsByRoute[stop.route_id].push(stop);
        }

        function distToGeometry(geomJson) {
            if (!geomJson) return Infinity;
            let geom;
            try { geom = typeof geomJson === 'string' ? JSON.parse(geomJson) : geomJson; } catch { return Infinity; }
            const coords = geom.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return Infinity;
            let minDist = Infinity;
            for (const coord of coords) {
                const d = haversineDistance(lat, lng, coord[1], coord[0]);
                if (d < minDist) minDist = d;
            }
            return minDist;
        }

        const activeAdvisories = await Advisory.find({ status: 'ACTIVE' }).lean();
        const advMap = new Map(activeAdvisories.map(a => [a.id, a]));
        const advisoryRoutes = await AdvisoryRoute.find().lean();
        const advisoriesByRoute = new Map();
        for (const ar of advisoryRoutes) {
            if (advMap.has(ar.advisory_id)) {
                if (!advisoriesByRoute.has(ar.route_id)) advisoriesByRoute.set(ar.route_id, []);
                advisoriesByRoute.get(ar.route_id).push(advMap.get(ar.advisory_id));
            }
        }

        const results = [];
        for (const route of allRoutes) {
            const stops = stopsByRoute[route.id] || [];
            let nearestStop = null;
            let minStopDist = Infinity;

            for (const stop of stops) {
                const d = haversineDistance(lat, lng, stop.latitude, stop.longitude);
                if (d < minStopDist) {
                    minStopDist = d;
                    nearestStop = stop;
                }
            }

            const geom = (useCorrected && route.use_corrected_geometry === 1 && route.geometry_corrected) ? route.geometry_corrected : route.geometry;
            const geomDist = distToGeometry(geom);
            const walkDistanceMeters = Math.min(minStopDist, geomDist);

            if (walkDistanceMeters <= radius) {
                const m = modeMap.get(route.transport_mode_id) || {};
                const boat = boatMap.get(route.id);
                let status = route.status;
                if (boat && (boat.operating_status === 'SUSPENDED' || boat.operating_status === 'UNAVAILABLE')) {
                    status = 'UNAVAILABLE';
                }
                const active_travel_time = (route.status === 'DETOUR_ACTIVE' && route.detour_time != null) ? route.detour_time : route.estimated_time;

                results.push({
                    id: route.id,
                    route_name: route.route_name,
                    transport_mode_id: route.transport_mode_id,
                    mode_name: m.name,
                    mode_icon: m.icon,
                    origin: route.origin,
                    destination: route.destination,
                    estimated_time: route.estimated_time,
                    detour_time: route.detour_time,
                    active_travel_time,
                    minimum_fare: route.minimum_fare,
                    maximum_fare: route.maximum_fare,
                    status,
                    description: route.description,
                    geometry: geom,
                    advisories: advisoriesByRoute.get(route.id) || [],
                    walkDistanceMeters: Math.round(walkDistanceMeters),
                    nearestStop: nearestStop ? {
                        id: nearestStop.id,
                        name: nearestStop.stop_name,
                        lat: nearestStop.latitude,
                        lng: nearestStop.longitude,
                        distanceMeters: Math.round(minStopDist)
                    } : null,
                    fromProximitySearch: true
                });
            }
        }

        if (sort === 'Cheapest Fare' || sort === 'cheapest') {
            results.sort((a, b) => a.minimum_fare - b.minimum_fare || a.walkDistanceMeters - b.walkDistanceMeters);
        } else {
            results.sort((a, b) => a.walkDistanceMeters - b.walkDistanceMeters || a.active_travel_time - b.active_travel_time);
        }

        res.json(results);
    } catch (err) {
        console.error('Error in /routes/nearby:', err);
        res.status(500).json({ error: 'Failed to find nearby routes.' });
    }
});

// GET /api/routes/:id - Single route with stops, steps, and fare breakdown
router.get('/routes/:id', async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        if (routeId === null) {
            return res.status(400).json({ error: 'Invalid route ID format.' });
        }

        const { use_corrected } = req.query;
        const useCorrected = (use_corrected !== 'false') && ROUTING_CONFIG.USE_CORRECTED_GEOMETRY;

        const route = await Route.findOne({ id: routeId }).lean();
        if (!route) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const mode = await TransportMode.findOne({ id: route.transport_mode_id }).lean();
        const boatDetail = await BoatRouteDetail.findOne({ route_id: routeId }).lean();

        let boatDetailsWithNames = null;
        if (boatDetail) {
            const origLoc = boatDetail.origin_river_stop_id ? await Location.findOne({ id: boatDetail.origin_river_stop_id }).lean() : null;
            const destLoc = boatDetail.destination_river_stop_id ? await Location.findOne({ id: boatDetail.destination_river_stop_id }).lean() : null;
            boatDetailsWithNames = {
                ...boatDetail,
                origin_stop_name: origLoc ? origLoc.name : null,
                destination_stop_name: destLoc ? destLoc.name : null
            };
        }

        let status = route.status;
        if (boatDetail && (boatDetail.operating_status === 'SUSPENDED' || boatDetail.operating_status === 'UNAVAILABLE')) {
            status = 'UNAVAILABLE';
        }

        const active_travel_time = (route.status === 'DETOUR_ACTIVE' && route.detour_time != null) ? route.detour_time : route.estimated_time;
        const geometry = (useCorrected && route.use_corrected_geometry === 1 && route.geometry_corrected) ? route.geometry_corrected : route.geometry;

        const stops = await Stop.find({ route_id: routeId }, {
            id: 1, stop_name: 1, stop_order: 1, description: 1, is_transfer_point: 1, latitude: 1, longitude: 1, _id: 0
        }).sort({ stop_order: 1 }).lean();

        const steps = await RouteStep.find({ route_id: routeId }, {
            id: 1, step_number: 1, mode: 1, instruction: 1, location_info: 1, _id: 0
        }).sort({ step_number: 1 }).lean();

        const fares = await Fare.find({ route_id: routeId }, {
            id: 1, passenger_type: 1, base_fare: 1, discount_percentage: 1, final_fare: 1, effective_date: 1, _id: 0
        }).sort({ id: 1 }).lean();

        const advRoutes = await AdvisoryRoute.find({ route_id: routeId }).lean();
        const advIds = advRoutes.map(ar => ar.advisory_id);
        const advisories = await Advisory.find({ id: { $in: advIds }, status: 'ACTIVE' }, {
            id: 1, title: 1, affected_road: 1, condition: 1, description: 1, status: 1, _id: 0
        }).lean();

        const rawSegments = await RouteSegment.find({ route_id: routeId }).sort({ segment_order: 1 }).lean();
        const locIds = [...new Set(rawSegments.flatMap(s => [s.start_location_id, s.end_location_id]).filter(Boolean))];
        const segLocs = await Location.find({ id: { $in: locIds } }).lean();
        const segLocMap = new Map(segLocs.map(l => [l.id, l]));

        const segments = rawSegments.map(rs => ({
            ...rs,
            start_location_name: segLocMap.get(rs.start_location_id) ? segLocMap.get(rs.start_location_id).name : null,
            end_location_name: segLocMap.get(rs.end_location_id) ? segLocMap.get(rs.end_location_id).name : null
        }));

        let alternativeRoutes = [];
        if (status === 'DETOUR_ACTIVE' || status === 'UNAVAILABLE') {
            const alts = await Route.find({ id: { $ne: routeId }, status: 'CLEAR' }).limit(2).lean();
            const altModes = await TransportMode.find().lean();
            const altModeMap = new Map(altModes.map(m => [m.id, m]));
            alternativeRoutes = alts.map(r => ({
                id: r.id,
                route_name: r.route_name,
                minimum_fare: r.minimum_fare,
                maximum_fare: r.maximum_fare,
                estimated_time: r.estimated_time,
                mode_name: altModeMap.get(r.transport_mode_id) ? altModeMap.get(r.transport_mode_id).name : null
            }));
        }

        res.json({
            id: route.id,
            route_name: route.route_name,
            transport_mode_id: route.transport_mode_id,
            mode_name: mode ? mode.name : null,
            mode_icon: mode ? mode.icon : null,
            origin: route.origin,
            destination: route.destination,
            estimated_time: route.estimated_time,
            detour_time: route.detour_time,
            active_travel_time,
            minimum_fare: route.minimum_fare,
            maximum_fare: route.maximum_fare,
            status,
            description: route.description,
            geometry_original: route.geometry,
            geometry_corrected: route.geometry_corrected,
            use_corrected_geometry: route.use_corrected_geometry,
            geometry,
            created_at: route.created_at,
            updated_at: route.updated_at,
            waterway: boatDetail ? boatDetail.waterway : null,
            boat_operating_status: boatDetail ? boatDetail.operating_status : null,
            stops,
            steps,
            fares,
            advisories,
            alternativeRoutes,
            boat_details: boatDetailsWithNames,
            segments
        });
    } catch (err) {
        console.error('Error fetching route details:', err);
        res.status(500).json({ error: 'Failed to retrieve route details.' });
    }
});

// GET /api/routes/:id/geojson - RFC 7946 GeoJSON Feature representation
router.get('/routes/:id/geojson', async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        if (routeId === null) {
            return res.status(400).json({ error: 'Invalid route ID format.' });
        }

        const route = await Route.findOne({ id: routeId }).lean();
        if (!route) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const mode = await TransportMode.findOne({ id: route.transport_mode_id }).lean();
        const stops = await Stop.find({ route_id: routeId }).sort({ stop_order: 1 }).lean();

        let geometryObj = null;
        if (route.geometry) {
            try {
                geometryObj = typeof route.geometry === 'string' ? JSON.parse(route.geometry) : route.geometry;
            } catch (e) {
                console.error('Failed to parse route geometry JSON:', e);
            }
        }

        if (!geometryObj && stops.length >= 2) {
            const coords = stops
                .filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number')
                .map(s => [s.longitude, s.latitude]);
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
                mode: mode ? mode.name : null,
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
        const advisories = await Advisory.find({ status: 'ACTIVE' }, {
            id: 1, title: 1, affected_road: 1, condition: 1, description: 1, status: 1, created_at: 1, updated_at: 1, _id: 0
        }).sort({ created_at: -1 }).lean();

        const allAdvisoryRoutes = await AdvisoryRoute.find().lean();
        const allRoutes = await Route.find().lean();
        const routeMap = new Map(allRoutes.map(r => [r.id, r]));
        const allModes = await TransportMode.find().lean();
        const modeMap = new Map(allModes.map(m => [m.id, m]));

        for (const adv of advisories) {
            const links = allAdvisoryRoutes.filter(ar => ar.advisory_id === adv.id);
            adv.affected_routes = links.map(ar => {
                const r = routeMap.get(ar.route_id);
                if (!r) return null;
                const m = modeMap.get(r.transport_mode_id);
                return {
                    id: r.id,
                    route_name: r.route_name,
                    mode_name: m ? m.name : null,
                    status: r.status
                };
            }).filter(Boolean);
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

        const discountRates = {
            'REGULAR': 0,
            'STUDENT': 20,
            'SENIOR_CITIZEN': 20,
            'PWD': 20
        };
        const discountPercentage = discountRates[normalizedType] || 0;

        let matchingRoute = null;
        if (from && to) {
            const fromTerm = from.trim().toLowerCase();
            const toTerm = to.trim().toLowerCase();

            const allRoutes = await Route.find().lean();
            const allStops = await Stop.find().lean();
            const stopsByRoute = new Map();
            for (const s of allStops) {
                if (!stopsByRoute.has(s.route_id)) stopsByRoute.set(s.route_id, []);
                stopsByRoute.get(s.route_id).push(s);
            }

            for (const r of allRoutes) {
                const stops = stopsByRoute.get(r.id) || [];
                const matchesOrigin = r.origin.toLowerCase().includes(fromTerm) || r.route_name.toLowerCase().includes(fromTerm) || stops.some(s => s.stop_name.toLowerCase().includes(fromTerm));
                const matchesDest = r.destination.toLowerCase().includes(toTerm) || r.route_name.toLowerCase().includes(toTerm) || stops.some(s => s.stop_name.toLowerCase().includes(toTerm));

                const reverseOrigin = r.destination.toLowerCase().includes(fromTerm) || r.route_name.toLowerCase().includes(fromTerm) || stops.some(s => s.stop_name.toLowerCase().includes(fromTerm));
                const reverseDest = r.origin.toLowerCase().includes(toTerm) || r.route_name.toLowerCase().includes(toTerm) || stops.some(s => s.stop_name.toLowerCase().includes(toTerm));

                if ((matchesOrigin && matchesDest) || (reverseOrigin && reverseDest)) {
                    matchingRoute = r;
                    break;
                }
            }
        }

        let legs = [];
        let totalEstimatedFare = 0;

        if (matchingRoute) {
            const mode = await TransportMode.findOne({ id: matchingRoute.transport_mode_id }).lean();
            matchingRoute.mode_name = mode ? mode.name : null;

            const segments = await RouteSegment.find({ route_id: matchingRoute.id }).sort({ segment_order: 1 }).lean();

            if (segments.length > 0) {
                const locIds = [...new Set(segments.flatMap(s => [s.start_location_id, s.end_location_id]).filter(Boolean))];
                const locs = await Location.find({ id: { $in: locIds } }).lean();
                const locMap = new Map(locs.map(l => [l.id, l]));

                for (const seg of segments) {
                    const isFree = (seg.mode.toLowerCase() === 'walk' || seg.fare === 0);
                    const baseFare = seg.fare;
                    const finalFare = isFree ? 0 : (discountPercentage > 0 ? Number((baseFare * (1 - discountPercentage / 100)).toFixed(2)) : baseFare);
                    const startLoc = locMap.get(seg.start_location_id);
                    const endLoc = locMap.get(seg.end_location_id);
                    const instruction = seg.notes || `${seg.mode}: ${startLoc ? startLoc.name : 'Origin'} – ${endLoc ? endLoc.name : 'Destination'}`;

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
                const dbFare = await Fare.findOne({ route_id: matchingRoute.id, passenger_type: normalizedType }).lean();
                const baseFare = dbFare ? dbFare.base_fare : matchingRoute.minimum_fare;
                const finalFare = dbFare ? dbFare.final_fare : Number((baseFare * (1 - discountPercentage / 100)).toFixed(2));

                legs = [{
                    mode: matchingRoute.mode_name,
                    instruction: `${matchingRoute.origin} – ${matchingRoute.destination}`,
                    baseFare,
                    discountPercent: discountPercentage,
                    finalFare,
                    isFree: false
                }];
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

// POST /api/feedback - Commuter feedback submission
router.post('/feedback', optionalAuth, async (req, res) => {
    try {
        const { name, email, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required fields.' });
        }

        const userId = req.user ? req.user.id : null;
        const feedbackId = await nextId('Feedback');

        await Feedback.create({
            id: feedbackId,
            user_id: userId,
            name: name.trim(),
            email: email.trim(),
            message: message.trim(),
            status: 'NEW'
        });

        res.status(201).json({
            message: 'Feedback submitted successfully. Thank you for helping improve Dagupan transit!',
            feedbackId
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

        const trimmedUsername = username.trim();
        const trimmedEmail = email.trim().toLowerCase();

        if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
            return res.status(400).json({ error: 'Username must be between 3 and 30 characters.' });
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
            return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }
        if (!/[A-Z]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one uppercase letter (A-Z).' });
        }
        if (!/[a-z]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one lowercase letter (a-z).' });
        }
        if (!/[0-9]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one number (0-9).' });
        }
        if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one special character (e.g. !@#$%).' });
        }

        const existing = await User.findOne({
            $or: [{ username: trimmedUsername }, { email: trimmedEmail }]
        });
        if (existing) {
            return res.status(409).json({ error: 'Username or email is already registered.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const userId = await nextId('User');

        await User.create({
            id: userId,
            username: trimmedUsername,
            email: trimmedEmail,
            password_hash: passwordHash,
            role: 'COMMUTER'
        });

        const userPayload = {
            id: userId,
            username: trimmedUsername,
            email: trimmedEmail,
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

        const cleanInput = username.trim();
        const user = await User.findOne({
            $or: [{ username: cleanInput }, { email: cleanInput.toLowerCase() }]
        });

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

// POST /api/auth/forgot-password - Request password reset code
router.post('/auth/forgot-password', async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier || !identifier.trim()) {
            return res.status(400).json({ error: 'Please enter your registered email address or username.' });
        }

        const cleanId = identifier.trim();
        const user = await User.findOne({
            $or: [{ username: cleanId }, { email: cleanId.toLowerCase() }]
        });

        if (!user) {
            return res.json({
                message: 'If an account matches that email or username, a 6-digit reset code has been generated.',
                sent: true
            });
        }

        const resetCode = crypto.randomInt(100000, 1000000).toString();

        await PasswordReset.updateMany(
            { user_id: user.id, used: 0 },
            { $set: { used: 1 } }
        );

        const resetId = await nextId('PasswordReset');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await PasswordReset.create({
            id: resetId,
            user_id: user.id,
            email: user.email,
            reset_code: resetCode,
            expires_at: expiresAt,
            used: 0
        });

        if (process.env.NODE_ENV !== 'test') {
            if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
                return res.status(503).json({
                    error: 'Password reset email is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.'
                });
            }

            const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_APP_PASSWORD
                }
            });

            await transporter.sendMail({
                from: `InerTayo <${process.env.GMAIL_USER}>`,
                to: user.email,
                subject: 'Your InerTayo password reset code',
                text: `Your InerTayo password reset code is ${resetCode}. It expires in 15 minutes. If you did not request this, you can ignore this email.`
            });
        }

        const response = {
            message: 'A 6-digit password reset code has been sent to your email.',
            email: user.email,
            sent: true
        };
        if (process.env.NODE_ENV === 'test') response.devCode = resetCode;
        res.json(response);
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Failed to process password reset request.' });
    }
});

// POST /api/auth/reset-password - Verify reset code and update password
router.post('/auth/reset-password', async (req, res) => {
    try {
        const { email, resetCode, newPassword } = req.body;

        if (!email || !resetCode || !newPassword) {
            return res.status(400).json({ error: 'Email, reset code, and new password are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanCode = resetCode.trim();

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }
        if (!/[A-Z]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password must contain at least one uppercase letter (A-Z).' });
        }
        if (!/[a-z]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password must contain at least one lowercase letter (a-z).' });
        }
        if (!/[0-9]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password must contain at least one number (0-9).' });
        }
        if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password must contain at least one special character (e.g. !@#$%).' });
        }

        const resetRecord = await PasswordReset.findOne({
            email: cleanEmail,
            reset_code: cleanCode,
            used: 0,
            expires_at: { $gt: new Date() }
        }).sort({ id: -1 });

        if (!resetRecord) {
            return res.status(400).json({ error: 'Invalid or expired reset code. Please request a new code.' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);
        await User.updateOne({ id: resetRecord.user_id }, { password_hash: passwordHash });
        await PasswordReset.updateOne({ id: resetRecord.id }, { used: 1 });

        res.json({
            message: 'Password has been reset successfully! You can now sign in with your new password.'
        });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
});

// GET /api/auth/me - Current profile & saved routes
router.get('/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ id: req.user.id }, {
            id: 1, username: 1, email: 1, role: 1, created_at: 1, _id: 0
        }).lean();

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const userSaved = await SavedRoute.find({ user_id: req.user.id }).sort({ created_at: -1 }).lean();
        const routeIds = userSaved.map(s => s.route_id);
        const routes = await Route.find({ id: { $in: routeIds } }).lean();
        const routeMap = new Map(routes.map(r => [r.id, r]));
        const modes = await TransportMode.find().lean();
        const modeMap = new Map(modes.map(m => [m.id, m]));

        const savedRoutes = userSaved.map(sr => {
            const r = routeMap.get(sr.route_id);
            if (!r) return null;
            const m = modeMap.get(r.transport_mode_id);
            return {
                id: r.id,
                route_name: r.route_name,
                mode_name: m ? m.name : null,
                minimum_fare: r.minimum_fare,
                maximum_fare: r.maximum_fare,
                status: r.status
            };
        }).filter(Boolean);

        res.json({ user, savedRoutes });
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ error: 'Failed to fetch user profile.' });
    }
});

// ============================================================================
// 3. COMMUTER SAVED ROUTES
// ============================================================================

// GET /api/saved-routes - Get saved routes for current user
router.get('/saved-routes', authenticateToken, requireCommuter, async (req, res) => {
    try {
        const userSaved = await SavedRoute.find({ user_id: req.user.id }).sort({ created_at: -1 }).lean();
        const routeIds = userSaved.map(s => s.route_id);
        const routes = await Route.find({ id: { $in: routeIds } }).lean();
        const routeMap = new Map(routes.map(r => [r.id, r]));
        const modes = await TransportMode.find().lean();
        const modeMap = new Map(modes.map(m => [m.id, m]));

        const saved = userSaved.map(sr => {
            const r = routeMap.get(sr.route_id);
            if (!r) return null;
            const m = modeMap.get(r.transport_mode_id);
            return {
                id: r.id,
                route_name: r.route_name,
                mode_name: m ? m.name : null,
                mode_icon: m ? m.icon : null,
                origin: r.origin,
                destination: r.destination,
                estimated_time: r.estimated_time,
                minimum_fare: r.minimum_fare,
                maximum_fare: r.maximum_fare,
                status: r.status,
                saved_at: sr.created_at
            };
        }).filter(Boolean);

        res.json(saved);
    } catch (err) {
        console.error('Error fetching saved routes:', err);
        res.status(500).json({ error: 'Failed to retrieve saved routes.' });
    }
});

// GET /api/users/:id/saved-routes — BOLA/IDOR-protected user-scoped saved routes
router.get('/users/:id/saved-routes', authenticateToken, requireCommuter, async (req, res) => {
    const requestedId = parseId(req.params.id);

    if (requestedId === null) {
        return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    if (requestedId !== req.user.id) {
        return res.status(403).json({
            error: 'Access denied. You may only retrieve your own saved routes.'
        });
    }

    try {
        const userSaved = await SavedRoute.find({ user_id: req.user.id }).sort({ created_at: -1 }).lean();
        const routeIds = userSaved.map(s => s.route_id);
        const routes = await Route.find({ id: { $in: routeIds } }).lean();
        const routeMap = new Map(routes.map(r => [r.id, r]));
        const modes = await TransportMode.find().lean();
        const modeMap = new Map(modes.map(m => [m.id, m]));

        const saved = userSaved.map(sr => {
            const r = routeMap.get(sr.route_id);
            if (!r) return null;
            const m = modeMap.get(r.transport_mode_id);
            return {
                id: r.id,
                route_name: r.route_name,
                mode_name: m ? m.name : null,
                mode_icon: m ? m.icon : null,
                origin: r.origin,
                destination: r.destination,
                estimated_time: r.estimated_time,
                minimum_fare: r.minimum_fare,
                maximum_fare: r.maximum_fare,
                status: r.status,
                saved_at: sr.created_at
            };
        }).filter(Boolean);

        res.json(saved);
    } catch (err) {
        console.error('Error fetching user saved routes:', err);
        res.status(500).json({ error: 'Failed to retrieve saved routes.' });
    }
});

// POST /api/saved-routes - Save a route for the authenticated commuter
router.post('/saved-routes', authenticateToken, requireCommuter, async (req, res) => {
    try {
        const routeId = parseId(req.body?.routeId);
        if (routeId === null) {
            return res.status(400).json({ error: 'Invalid route ID.' });
        }

        const route = await Route.findOne({ id: routeId }).lean();
        if (!route) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const existing = await SavedRoute.findOne({ user_id: req.user.id, route_id: routeId });
        if (!existing) {
            const id = await nextId('SavedRoute');
            await SavedRoute.create({ id, user_id: req.user.id, route_id: routeId });
        }

        return res.status(201).json({ saved: true, message: 'Route saved successfully!' });
    } catch (err) {
        console.error('Error saving route:', err);
        res.status(500).json({ error: 'Failed to save route.' });
    }
});

// DELETE /api/saved-routes/:routeId - Remove a bookmark owned by the authenticated commuter
router.delete('/saved-routes/:routeId', authenticateToken, requireCommuter, async (req, res) => {
    try {
        const routeId = parseId(req.params.routeId);
        if (routeId === null) {
            return res.status(400).json({ error: 'Invalid route ID.' });
        }

        await SavedRoute.deleteOne({ user_id: req.user.id, route_id: routeId });
        return res.json({ saved: false, message: 'Route removed from saved routes.' });
    } catch (err) {
        console.error('Error removing saved route:', err);
        res.status(500).json({ error: 'Failed to remove saved route.' });
    }
});

// Legacy toggle endpoint retained for existing clients
router.post('/routes/:id/save', authenticateToken, requireCommuter, async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        if (routeId === null) {
            return res.status(400).json({ error: 'Invalid route ID.' });
        }

        const route = await Route.findOne({ id: routeId }).lean();
        if (!route) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const existing = await SavedRoute.findOne({ user_id: req.user.id, route_id: routeId });
        if (existing) {
            await SavedRoute.deleteOne({ id: existing.id });
            return res.json({ saved: false, message: 'Route removed from saved routes.' });
        }

        const id = await nextId('SavedRoute');
        await SavedRoute.create({ id, user_id: req.user.id, route_id: routeId });
        return res.json({ saved: true, message: 'Route saved successfully!' });
    } catch (err) {
        console.error('Error toggling saved route:', err);
        res.status(500).json({ error: 'Failed to toggle saved route.' });
    }
});

// ============================================================================
// 4. ADMIN MANAGEMENT ENDPOINTS
// ============================================================================

// GET /api/admin/stats - Admin dashboard overview metrics
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const totalRoutes = await Route.countDocuments();
        const activeAdvisories = await Advisory.countDocuments({ status: 'ACTIVE' });
        const totalStops = await Stop.countDocuments();
        const pendingFeedback = await Feedback.countDocuments({ status: 'NEW' });
        const totalLocations = await Location.countDocuments();
        const totalModes = await TransportMode.countDocuments();

        res.json({
            totalRoutes,
            activeAdvisories,
            totalStops,
            pendingFeedback,
            totalLocations,
            totalModes
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
        const filter = {};

        if (status && status !== 'ALL') {
            filter.status = status.toUpperCase();
        }

        if (type && type !== 'ALL') {
            filter.type = type.toUpperCase();
        }

        if (search && search.trim() !== '') {
            const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [
                { name: regex },
                { barangay: regex },
                { search_keywords: regex },
                { address: regex },
                { description: regex }
            ];
        }

        const locations = await Location.find(filter).sort({ name: 1 }).lean();
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
        const locationId = await nextId('Location');

        await Location.create({
            id: locationId,
            name: name.trim(),
            type: type.toUpperCase(),
            barangay: barangay ? barangay.trim() : null,
            address: address ? address.trim() : null,
            latitude: lat,
            longitude: lng,
            description: description ? description.trim() : null,
            search_keywords: search_keywords ? search_keywords.trim() : null,
            status: validStatus
        });

        res.status(201).json({
            message: 'Location created successfully.',
            locationId
        });
    } catch (err) {
        console.error('Error creating location:', err);
        res.status(500).json({ error: 'Failed to create location.' });
    }
});

// PUT /api/admin/locations/:id - Update location
router.put('/admin/locations/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const locationId = parseId(req.params.id);
        if (locationId === null) {
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

        const existing = await Location.findOne({ id: locationId });
        if (!existing) {
            return res.status(404).json({ error: 'Location not found.' });
        }

        await Location.updateOne(
            { id: locationId },
            {
                name: name.trim(),
                type: type.toUpperCase(),
                barangay: barangay ? barangay.trim() : null,
                address: address ? address.trim() : null,
                latitude: lat,
                longitude: lng,
                description: description ? description.trim() : null,
                search_keywords: search_keywords ? search_keywords.trim() : null,
                status: validStatus,
                updated_at: new Date()
            }
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
        const locationId = parseId(req.params.id);
        if (locationId === null) {
            return res.status(400).json({ error: 'Invalid location ID format.' });
        }

        const existing = await Location.findOne({ id: locationId });
        if (!existing) {
            return res.status(404).json({ error: 'Location not found.' });
        }

        await Location.deleteOne({ id: locationId });
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
        const modes = await TransportMode.find().sort({ id: 1 }).lean();
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
        const modeId = await nextId('TransportMode');

        await TransportMode.create({
            id: modeId,
            name: name.trim(),
            description: description ? description.trim() : null,
            icon: icon ? icon.trim() : 'bus',
            status: validStatus
        });

        res.status(201).json({ message: 'Transport mode created.', modeId });
    } catch (err) {
        console.error('Error creating transport mode:', err);
        res.status(500).json({ error: 'Failed to create transport mode.' });
    }
});

// PUT /api/admin/transport-modes/:id - Update transport mode
router.put('/admin/transport-modes/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const modeId = parseId(req.params.id);
        if (modeId === null) {
            return res.status(400).json({ error: 'Invalid transport mode ID format.' });
        }

        const { name, description, icon, status } = req.body;
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Mode name is required.' });
        }

        const existing = await TransportMode.findOne({ id: modeId });
        if (!existing) {
            return res.status(404).json({ error: 'Transport mode not found.' });
        }

        await TransportMode.updateOne(
            { id: modeId },
            {
                name: name.trim(),
                description: description ? description.trim() : null,
                icon: icon ? icon.trim() : null,
                status: status || 'ACTIVE'
            }
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
        const details = await BoatRouteDetail.find().sort({ id: 1 }).lean();
        const routes = await Route.find().lean();
        const routeMap = new Map(routes.map(r => [r.id, r]));
        const locs = await Location.find().lean();
        const locMap = new Map(locs.map(l => [l.id, l]));

        const results = details.map(brd => {
            const r = routeMap.get(brd.route_id);
            const orig = locMap.get(brd.origin_river_stop_id);
            const dest = locMap.get(brd.destination_river_stop_id);
            return {
                ...brd,
                route_name: r ? r.route_name : null,
                origin_stop_name: orig ? orig.name : null,
                destination_stop_name: dest ? dest.name : null
            };
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve boat route details.' });
    }
});

// GET /api/admin/routes/:id/boat-details - Get boat details for a specific route
router.get('/admin/routes/:id/boat-details', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        const details = await BoatRouteDetail.findOne({ route_id: routeId }).lean();
        if (!details) {
            return res.json(null);
        }

        const r = await Route.findOne({ id: routeId }).lean();
        const orig = details.origin_river_stop_id ? await Location.findOne({ id: details.origin_river_stop_id }).lean() : null;
        const dest = details.destination_river_stop_id ? await Location.findOne({ id: details.destination_river_stop_id }).lean() : null;

        res.json({
            ...details,
            route_name: r ? r.route_name : null,
            origin_stop_name: orig ? orig.name : null,
            destination_stop_name: dest ? dest.name : null
        });
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

        const validStatuses = ['ACTIVE', 'SUSPENDED', 'UNAVAILABLE'];
        if (!validStatuses.includes(operating_status)) {
            return res.status(400).json({ error: 'operating_status must be ACTIVE, SUSPENDED, or UNAVAILABLE.' });
        }

        if (origin_river_stop_id) {
            const orig = await Location.findOne({ id: origin_river_stop_id });
            if (!orig || orig.type !== 'RIVER_STOP') {
                return res.status(400).json({ error: 'origin_river_stop_id must refer to a location of type RIVER_STOP.' });
            }
        }

        if (destination_river_stop_id) {
            const dest = await Location.findOne({ id: destination_river_stop_id });
            if (!dest || dest.type !== 'RIVER_STOP') {
                return res.status(400).json({ error: 'destination_river_stop_id must refer to a location of type RIVER_STOP.' });
            }
        }

        const existing = await BoatRouteDetail.findOne({ route_id });
        let id;
        if (existing) {
            await BoatRouteDetail.updateOne(
                { id: existing.id },
                {
                    waterway: waterway ? waterway.trim() : null,
                    origin_river_stop_id: origin_river_stop_id || null,
                    destination_river_stop_id: destination_river_stop_id || null,
                    operating_status,
                    notes: notes ? notes.trim() : null,
                    updated_at: new Date()
                }
            );
            id = existing.id;
        } else {
            id = await nextId('BoatRouteDetail');
            await BoatRouteDetail.create({
                id,
                route_id,
                waterway: waterway ? waterway.trim() : null,
                origin_river_stop_id: origin_river_stop_id || null,
                destination_river_stop_id: destination_river_stop_id || null,
                operating_status,
                notes: notes ? notes.trim() : null
            });
        }

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
        const id = parseId(req.params.id);
        const { waterway, origin_river_stop_id, destination_river_stop_id, operating_status, notes } = req.body;

        const current = await BoatRouteDetail.findOne({ id });
        if (!current) {
            return res.status(404).json({ error: 'Boat details not found.' });
        }

        const validStatuses = ['ACTIVE', 'SUSPENDED', 'UNAVAILABLE'];
        if (operating_status && !validStatuses.includes(operating_status)) {
            return res.status(400).json({ error: 'operating_status must be ACTIVE, SUSPENDED, or UNAVAILABLE.' });
        }

        if (origin_river_stop_id) {
            const orig = await Location.findOne({ id: origin_river_stop_id });
            if (!orig || orig.type !== 'RIVER_STOP') {
                return res.status(400).json({ error: 'origin_river_stop_id must refer to a location of type RIVER_STOP.' });
            }
        }

        if (destination_river_stop_id) {
            const dest = await Location.findOne({ id: destination_river_stop_id });
            if (!dest || dest.type !== 'RIVER_STOP') {
                return res.status(400).json({ error: 'destination_river_stop_id must refer to a location of type RIVER_STOP.' });
            }
        }

        await BoatRouteDetail.updateOne(
            { id },
            {
                waterway: waterway ? waterway.trim() : null,
                origin_river_stop_id: origin_river_stop_id || null,
                destination_river_stop_id: destination_river_stop_id || null,
                operating_status: operating_status || 'ACTIVE',
                notes: notes ? notes.trim() : null,
                updated_at: new Date()
            }
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
        const id = parseId(req.params.id);
        const current = await BoatRouteDetail.findOne({ id });
        await BoatRouteDetail.deleteOne({ id });
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
        const routeId = parseId(req.params.id);
        const segments = await RouteSegment.find({ route_id: routeId }).sort({ segment_order: 1 }).lean();
        const locIds = [...new Set(segments.flatMap(s => [s.start_location_id, s.end_location_id]).filter(Boolean))];
        const locs = await Location.find({ id: { $in: locIds } }).lean();
        const locMap = new Map(locs.map(l => [l.id, l]));

        const results = segments.map(rs => ({
            ...rs,
            start_location_name: locMap.get(rs.start_location_id) ? locMap.get(rs.start_location_id).name : null,
            end_location_name: locMap.get(rs.end_location_id) ? locMap.get(rs.end_location_id).name : null
        }));

        res.json(results);
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

        const segmentId = await nextId('RouteSegment');

        await RouteSegment.create({
            id: segmentId,
            route_id,
            segment_order: parseInt(segment_order, 10),
            mode: mode.trim(),
            start_location_id: start_location_id || null,
            end_location_id: end_location_id || null,
            fare: fareVal,
            estimated_time: timeVal,
            notes: notes ? notes.trim() : null
        });

        res.status(201).json({ message: 'Route segment created.', segmentId });
    } catch (err) {
        console.error('Error creating segment:', err);
        res.status(500).json({ error: 'Failed to create segment.' });
    }
});

// PUT /api/admin/segments/:id - Update route segment
router.put('/admin/segments/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segmentId = parseId(req.params.id);
        const { segment_order, mode, start_location_id, end_location_id, fare, estimated_time, notes } = req.body;

        const fareVal = parseFloat(fare);
        if (fare !== undefined && (isNaN(fareVal) || fareVal < 0)) {
            return res.status(400).json({ error: 'Fare must be non-negative.' });
        }

        const timeVal = parseInt(estimated_time, 10);
        if (estimated_time !== undefined && (isNaN(timeVal) || timeVal < 0)) {
            return res.status(400).json({ error: 'Estimated time must be non-negative.' });
        }

        await RouteSegment.updateOne(
            { id: segmentId },
            {
                segment_order: parseInt(segment_order, 10),
                mode: mode ? mode.trim() : 'Walk',
                start_location_id: start_location_id || null,
                end_location_id: end_location_id || null,
                fare: fareVal,
                estimated_time: timeVal,
                notes: notes ? notes.trim() : null
            }
        );

        res.json({ message: 'Segment updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update segment.' });
    }
});

// DELETE /api/admin/segments/:id - Delete route segment
router.delete('/admin/segments/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segmentId = parseId(req.params.id);
        await RouteSegment.deleteOne({ id: segmentId });
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
        const routeId = await nextId('Route');

        await Route.create({
            id: routeId,
            route_name: route_name.trim(),
            transport_mode_id,
            origin: origin.trim(),
            destination: destination.trim(),
            estimated_time: parsedEstimatedTime,
            detour_time: detour_time ? parseInt(detour_time, 10) : null,
            minimum_fare: parsedMinFare,
            maximum_fare: parsedMaxFare,
            status: routeStatus,
            description: description ? description.trim() : null,
            geometry: geomString
        });

        // Seed default fares for this new route
        const fareTypes = [
            { type: 'REGULAR', discount: 0, final: parsedMinFare },
            { type: 'STUDENT', discount: 20, final: Number((parsedMinFare * 0.8).toFixed(2)) },
            { type: 'SENIOR_CITIZEN', discount: 20, final: Number((parsedMinFare * 0.8).toFixed(2)) },
            { type: 'PWD', discount: 20, final: Number((parsedMinFare * 0.8).toFixed(2)) }
        ];

        for (const ft of fareTypes) {
            const fareId = await nextId('Fare');
            await Fare.create({
                id: fareId,
                route_id: routeId,
                passenger_type: ft.type,
                base_fare: parsedMinFare,
                discount_percentage: ft.discount,
                final_fare: ft.final
            });
        }

        res.status(201).json({
            message: 'Route created successfully.',
            routeId
        });
    } catch (err) {
        console.error('Error creating route:', err);
        res.status(500).json({ error: 'Failed to create route.' });
    }
});

// PUT /api/admin/routes/:id - Update route
router.put('/admin/routes/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        if (routeId === null) {
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

        const existing = await Route.findOne({ id: routeId });
        if (!existing) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        const updateData = {
            route_name: route_name.trim(),
            transport_mode_id,
            origin: origin.trim(),
            destination: destination.trim(),
            estimated_time: parsedEstimatedTime,
            detour_time: detour_time ? parseInt(detour_time, 10) : null,
            minimum_fare: parsedMinFare,
            maximum_fare: parsedMaxFare,
            status: routeStatus,
            description: description ? description.trim() : null,
            updated_at: new Date()
        };

        if (geometry !== undefined) {
            updateData.geometry = geometry ? (typeof geometry === 'object' ? JSON.stringify(geometry) : geometry) : null;
        }

        await Route.updateOne({ id: routeId }, updateData);
        res.json({ message: 'Route updated successfully.' });
    } catch (err) {
        console.error('Error updating route:', err);
        res.status(500).json({ error: 'Failed to update route.' });
    }
});

// DELETE /api/admin/routes/:id - Delete route and cascade related entities
router.delete('/api/admin/routes/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        if (routeId === null) {
            return res.status(400).json({ error: 'Invalid route ID format.' });
        }

        const existing = await Route.findOne({ id: routeId });
        if (!existing) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        await Route.deleteOne({ id: routeId });
        await Stop.deleteMany({ route_id: routeId });
        await RouteStep.deleteMany({ route_id: routeId });
        await Fare.deleteMany({ route_id: routeId });
        await RouteSegment.deleteMany({ route_id: routeId });
        await BoatRouteDetail.deleteMany({ route_id: routeId });
        await SavedRoute.deleteMany({ route_id: routeId });
        await AdvisoryRoute.deleteMany({ route_id: routeId });

        res.json({ message: 'Route deleted successfully.' });
    } catch (err) {
        console.error('Error deleting route:', err);
        res.status(500).json({ error: 'Failed to delete route.' });
    }
});

// Express route alias without extra /api prefix
router.delete('/admin/routes/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        if (routeId === null) {
            return res.status(400).json({ error: 'Invalid route ID format.' });
        }

        const existing = await Route.findOne({ id: routeId });
        if (!existing) {
            return res.status(404).json({ error: 'Route not found.' });
        }

        await Route.deleteOne({ id: routeId });
        await Stop.deleteMany({ route_id: routeId });
        await RouteStep.deleteMany({ route_id: routeId });
        await Fare.deleteMany({ route_id: routeId });
        await RouteSegment.deleteMany({ route_id: routeId });
        await BoatRouteDetail.deleteMany({ route_id: routeId });
        await SavedRoute.deleteMany({ route_id: routeId });
        await AdvisoryRoute.deleteMany({ route_id: routeId });

        res.json({ message: 'Route deleted successfully.' });
    } catch (err) {
        console.error('Error deleting route:', err);
        res.status(500).json({ error: 'Failed to delete route.' });
    }
});

// GET /api/admin/routes/:id/stops - Stops for a route
router.get('/admin/routes/:id/stops', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        const stops = await Stop.find({ route_id: routeId }).sort({ stop_order: 1 }).lean();
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

        const stopId = await nextId('Stop');

        await Stop.create({
            id: stopId,
            route_id,
            stop_name: stop_name.trim(),
            stop_order: parsedStopOrder,
            description: description || null,
            is_transfer_point: is_transfer_point ? 1 : 0,
            latitude: latitude || null,
            longitude: longitude || null
        });

        res.status(201).json({ message: 'Stop added.', stopId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create stop.' });
    }
});

// PUT /api/admin/stops/:id - Update stop
router.put('/admin/stops/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stopId = parseId(req.params.id);
        if (stopId === null) {
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

        const existing = await Stop.findOne({ id: stopId });
        if (!existing) {
            return res.status(404).json({ error: 'Stop not found.' });
        }

        await Stop.updateOne(
            { id: stopId },
            {
                stop_name: stop_name.trim(),
                stop_order: parsedStopOrder,
                description: description || null,
                is_transfer_point: is_transfer_point ? 1 : 0,
                latitude: latitude || null,
                longitude: longitude || null
            }
        );

        res.json({ message: 'Stop updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update stop.' });
    }
});

// DELETE /api/admin/stops/:id - Delete stop
router.delete('/admin/stops/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stopId = parseId(req.params.id);
        if (stopId === null) {
            return res.status(400).json({ error: 'Invalid stop ID format.' });
        }

        const existing = await Stop.findOne({ id: stopId });
        if (!existing) {
            return res.status(404).json({ error: 'Stop not found.' });
        }

        await Stop.deleteOne({ id: stopId });
        res.json({ message: 'Stop deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete stop.' });
    }
});

// GET /api/admin/routes/:id/steps - Steps for a route
router.get('/admin/routes/:id/steps', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        const steps = await RouteStep.find({ route_id: routeId }).sort({ step_number: 1 }).lean();
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

        const stepId = await nextId('RouteStep');

        await RouteStep.create({
            id: stepId,
            route_id,
            step_number: parsedStepNumber,
            mode,
            instruction: instruction.trim(),
            location_info: location_info || null
        });

        res.status(201).json({ message: 'Step added.', stepId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add step.' });
    }
});

// PUT /api/admin/steps/:id - Update step
router.put('/admin/steps/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stepId = parseId(req.params.id);
        if (stepId === null) {
            return res.status(400).json({ error: 'Invalid step ID format.' });
        }

        const { step_number, mode, instruction, location_info } = req.body;
        if (!instruction || typeof instruction !== 'string' || instruction.trim() === '') {
            return res.status(400).json({ error: 'instruction is required.' });
        }

        const parsedStepNumber = step_number !== undefined && step_number !== null ? parseInt(step_number, 10) : 1;

        const existing = await RouteStep.findOne({ id: stepId });
        if (!existing) {
            return res.status(404).json({ error: 'Step not found.' });
        }

        await RouteStep.updateOne(
            { id: stepId },
            {
                step_number: parsedStepNumber,
                mode: mode || 'Walk',
                instruction: instruction.trim(),
                location_info: location_info || null
            }
        );

        res.json({ message: 'Step updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update step.' });
    }
});

// DELETE /api/admin/steps/:id - Delete step
router.delete('/admin/steps/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const stepId = parseId(req.params.id);
        if (stepId === null) {
            return res.status(400).json({ error: 'Invalid step ID format.' });
        }

        const existing = await RouteStep.findOne({ id: stepId });
        if (!existing) {
            return res.status(404).json({ error: 'Step not found.' });
        }

        await RouteStep.deleteOne({ id: stepId });
        res.json({ message: 'Step deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete step.' });
    }
});

// GET /api/admin/routes/:id/fares - Fares for a route
router.get('/admin/routes/:id/fares', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const routeId = parseId(req.params.id);
        const fares = await Fare.find({ route_id: routeId }).sort({ id: 1 }).lean();
        res.json(fares);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch fares.' });
    }
});

// PUT /api/admin/fares/:id - Update fare record
router.put('/admin/fares/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const fareId = parseId(req.params.id);
        if (fareId === null) {
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

        const existing = await Fare.findOne({ id: fareId });
        if (!existing) {
            return res.status(404).json({ error: 'Fare record not found.' });
        }

        const finalFare = Number((base * (1 - disc / 100)).toFixed(2));

        await Fare.updateOne(
            { id: fareId },
            {
                base_fare: base,
                discount_percentage: disc,
                final_fare: finalFare,
                updated_at: new Date()
            }
        );

        res.json({ message: 'Fare updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update fare.' });
    }
});

// GET /api/admin/advisories - All advisories
router.get('/admin/advisories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const advisories = await Advisory.find().sort({ created_at: -1 }).lean();
        const allAdvisoryRoutes = await AdvisoryRoute.find().lean();
        const allRoutes = await Route.find().lean();
        const routeMap = new Map(allRoutes.map(r => [r.id, r]));

        for (const adv of advisories) {
            const links = allAdvisoryRoutes.filter(ar => ar.advisory_id === adv.id);
            adv.routes = links.map(ar => {
                const r = routeMap.get(ar.route_id);
                return r ? { id: r.id, route_name: r.route_name } : null;
            }).filter(Boolean);
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
        const advisoryId = await nextId('Advisory');

        await Advisory.create({
            id: advisoryId,
            title: title.trim(),
            affected_road: affected_road.trim(),
            condition: normalizedCondition,
            description: description.trim(),
            status: validStatus
        });

        for (const rId of route_ids) {
            const arId = await nextId('AdvisoryRoute');
            await AdvisoryRoute.create({ id: arId, advisory_id: advisoryId, route_id: rId });
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
        const advisoryId = parseId(req.params.id);
        if (advisoryId === null) {
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

        const existing = await Advisory.findOne({ id: advisoryId });
        if (!existing) {
            return res.status(404).json({ error: 'Advisory not found.' });
        }

        const validStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

        await Advisory.updateOne(
            { id: advisoryId },
            {
                title: title.trim(),
                affected_road: affected_road.trim(),
                condition: normalizedCondition,
                description: description.trim(),
                status: validStatus,
                updated_at: new Date()
            }
        );

        const previousLinks = await AdvisoryRoute.find({ advisory_id: advisoryId }).lean();
        await AdvisoryRoute.deleteMany({ advisory_id: advisoryId });

        for (const rId of route_ids) {
            const arId = await nextId('AdvisoryRoute');
            await AdvisoryRoute.create({ id: arId, advisory_id: advisoryId, route_id: rId });
        }

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
        const advisoryId = parseId(req.params.id);
        if (advisoryId === null) {
            return res.status(400).json({ error: 'Invalid advisory ID format.' });
        }

        const current = await Advisory.findOne({ id: advisoryId });
        if (!current) {
            return res.status(404).json({ error: 'Advisory not found.' });
        }

        const newStatus = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        await Advisory.updateOne({ id: advisoryId }, { status: newStatus, updated_at: new Date() });

        const linkedRoutes = await AdvisoryRoute.find({ advisory_id: advisoryId }).lean();
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
        const advisoryId = parseId(req.params.id);
        if (advisoryId === null) {
            return res.status(400).json({ error: 'Invalid advisory ID format.' });
        }

        const existing = await Advisory.findOne({ id: advisoryId });
        if (!existing) {
            return res.status(404).json({ error: 'Advisory not found.' });
        }

        const linkedRoutes = await AdvisoryRoute.find({ advisory_id: advisoryId }).lean();
        await Advisory.deleteOne({ id: advisoryId });
        await AdvisoryRoute.deleteMany({ advisory_id: advisoryId });

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
        const feedbackList = await Feedback.find().sort({ created_at: -1 }).lean();
        res.json(feedbackList);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve feedback.' });
    }
});

// PUT /api/admin/feedback/:id/status - Update feedback status
router.put('/admin/feedback/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const feedbackId = parseId(req.params.id);
        if (feedbackId === null) {
            return res.status(400).json({ error: 'Invalid feedback ID format.' });
        }

        const { status } = req.body;
        if (!['NEW', 'REVIEWED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid feedback status.' });
        }

        const existing = await Feedback.findOne({ id: feedbackId });
        if (!existing) {
            return res.status(404).json({ error: 'Feedback not found.' });
        }

        await Feedback.updateOne({ id: feedbackId }, { status });
        res.json({ message: 'Feedback status updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update feedback status.' });
    }
});

// DELETE /api/admin/feedback/:id - Delete feedback
router.delete('/admin/feedback/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const feedbackId = parseId(req.params.id);
        if (feedbackId === null) {
            return res.status(400).json({ error: 'Invalid feedback ID format.' });
        }

        const existing = await Feedback.findOne({ id: feedbackId });
        if (!existing) {
            return res.status(404).json({ error: 'Feedback not found.' });
        }

        await Feedback.deleteOne({ id: feedbackId });
        res.json({ message: 'Feedback deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete feedback.' });
    }
});

module.exports = router;
