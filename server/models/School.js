'use strict';
const mongoose = require('mongoose');

const SchoolSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true, index: true },
    aliases: { type: String, default: null },
    type: { type: String, required: true },
    address: { type: String, default: null },
    barangay: { type: String, default: null, index: true },
    city: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    entrance_latitude: { type: Number, default: null },
    entrance_longitude: { type: Number, default: null },
    nearby_stops: { type: mongoose.Schema.Types.Mixed, default: [] },
    verified: { type: Number, default: 0 },
    source: { type: String, default: null },
    active: { type: Number, default: 1 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

SchoolSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.School || mongoose.model('School', SchoolSchema);
