'use strict';
const mongoose = require('mongoose');

const RouteStepSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    route_id: { type: Number, required: true, index: true },
    step_number: { type: Number, required: true },
    mode: { type: String, required: true },
    instruction: { type: String, required: true },
    location_info: { type: String, default: null }
}, { versionKey: false });

RouteStepSchema.index({ route_id: 1, step_number: 1 });

RouteStepSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.RouteStep || mongoose.model('RouteStep', RouteStepSchema);
