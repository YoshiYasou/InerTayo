'use strict';
const mongoose = require('mongoose');

const RouteSegmentSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    route_id: { type: Number, required: true, index: true },
    segment_order: { type: Number, required: true },
    mode: { type: String, required: true },
    start_location_id: { type: Number, default: null },
    end_location_id: { type: Number, default: null },
    fare: { type: Number, default: 0 },
    estimated_time: { type: Number, default: 0 },
    notes: { type: String, default: null }
}, { versionKey: false });

RouteSegmentSchema.index({ route_id: 1, segment_order: 1 });

RouteSegmentSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.RouteSegment || mongoose.model('RouteSegment', RouteSegmentSchema);
