'use strict';
const mongoose = require('mongoose');

const FareRangeSchema = new mongoose.Schema({
    min: { type: Number, required: true, min: 0 },
    max: { type: Number, required: true, min: 0 }
}, { _id: false });

const RouteFareSchema = new mongoose.Schema({
    transport_mode: {
        type: String,
        required: true,
        enum: ['jeepney', 'modern_puv', 'uv_express', 'provincial_bus'],
        index: true
    },
    route_name: { type: String, required: true, trim: true },
    terminal: { type: String, required: true, trim: true },
    waypoints: { type: String, default: '', trim: true },
    distance_km: { type: String, default: null, trim: true },
    regular_fare: { type: FareRangeSchema, required: true },
    discounted_fare_20pct: { type: FareRangeSchema, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

RouteFareSchema.index({ transport_mode: 1, route_name: 1 }, { unique: true });

RouteFareSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.RouteFare || mongoose.model('RouteFare', RouteFareSchema);
