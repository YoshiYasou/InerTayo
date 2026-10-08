'use strict';
const mongoose = require('mongoose');

const RouteDraftSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    draft_key: { type: String, required: true },
    route_id: { type: Number, default: null },
    form_data: { type: mongoose.Schema.Types.Mixed, required: true },
    route_steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

RouteDraftSchema.index({ user_id: 1, draft_key: 1 }, { unique: true });

RouteDraftSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.RouteDraft || mongoose.model('RouteDraft', RouteDraftSchema);