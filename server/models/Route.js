'use strict';
const mongoose = require('mongoose');

const RouteSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    route_name: { type: String, required: true, trim: true },
    transport_mode_id: { type: Number, required: true, index: true },
    origin: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    estimated_time: { type: Number, required: true, min: 1 },
    detour_time: { type: Number, default: null },
    minimum_fare: { type: Number, required: true, min: 0 },
    maximum_fare: { type: Number, required: true, min: 0 },
    status: { type: String, required: true, enum: ['CLEAR', 'DETOUR_ACTIVE', 'UNAVAILABLE', 'ADVISORY'], default: 'CLEAR', index: true },
    description: { type: String, default: null },
    geometry: { type: String, default: null },
    geometry_corrected: { type: String, default: null },
    use_corrected_geometry: { type: Number, default: 1 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

RouteSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.Route || mongoose.model('Route', RouteSchema);
