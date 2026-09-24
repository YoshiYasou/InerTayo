'use strict';
const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    barangay: { type: String, default: null, index: true },
    address: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    description: { type: String, default: null },
    search_keywords: { type: String, default: null },
    status: { type: String, required: true, default: 'ACTIVE' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

LocationSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.Location || mongoose.model('Location', LocationSchema);
