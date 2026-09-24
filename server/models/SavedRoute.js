'use strict';
const mongoose = require('mongoose');

const SavedRouteSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    route_id: { type: Number, required: true, index: true },
    created_at: { type: Date, default: Date.now }
}, { versionKey: false });

SavedRouteSchema.index({ user_id: 1, route_id: 1 }, { unique: true });

SavedRouteSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.SavedRoute || mongoose.model('SavedRoute', SavedRouteSchema);
