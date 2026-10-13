'use strict';
const mongoose = require('mongoose');

const AdvisoryRouteSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    advisory_id: { type: Number, required: true, index: true },
    route_id: { type: Number, required: true, index: true },
    detour_enabled: { type: Boolean },
    flooded_geometry: { type: String, default: null },
    detour_geometry: { type: String, default: null },
    detour_steps: {
        type: [{
            mode: { type: String, default: 'Transit' },
            instruction: { type: String, default: '' },
            location_info: { type: String, default: '' }
        }],
        default: []
    },
    detour_instructions: { type: String, default: null },
    detour_time: { type: Number, default: null, min: 1 }
}, { versionKey: false });

AdvisoryRouteSchema.index({ advisory_id: 1, route_id: 1 }, { unique: true });

AdvisoryRouteSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.AdvisoryRoute || mongoose.model('AdvisoryRoute', AdvisoryRouteSchema);
