'use strict';
const mongoose = require('mongoose');

const AdvisoryRouteSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    advisory_id: { type: Number, required: true, index: true },
    route_id: { type: Number, required: true, index: true }
}, { versionKey: false });

AdvisoryRouteSchema.index({ advisory_id: 1, route_id: 1 }, { unique: true });

AdvisoryRouteSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.AdvisoryRoute || mongoose.model('AdvisoryRoute', AdvisoryRouteSchema);
