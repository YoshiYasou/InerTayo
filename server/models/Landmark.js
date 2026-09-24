'use strict';
const mongoose = require('mongoose');

const LandmarkSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true, unique: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    type: { type: String, required: true, index: true },
    created_at: { type: Date, default: Date.now }
}, { versionKey: false });

LandmarkSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.Landmark || mongoose.model('Landmark', LandmarkSchema);
