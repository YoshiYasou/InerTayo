'use strict';
const mongoose = require('mongoose');

const BoatRouteDetailSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    route_id: { type: Number, required: true, unique: true, index: true },
    waterway: { type: String, default: null },
    origin_river_stop_id: { type: Number, default: null },
    destination_river_stop_id: { type: Number, default: null },
    operating_status: { type: String, required: true, enum: ['ACTIVE', 'SUSPENDED', 'UNAVAILABLE'], default: 'ACTIVE' },
    notes: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

BoatRouteDetailSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.BoatRouteDetail || mongoose.model('BoatRouteDetail', BoatRouteDetailSchema);
