'use strict';
const mongoose = require('mongoose');

const FareRangeSchema = new mongoose.Schema({
    min: { type: Number, required: true, min: 0 },
    max: { type: Number, required: true, min: 0 }
}, { _id: false });

const TricycleFareSchema = new mongoose.Schema({
    zone: { type: String, required: true, trim: true, index: true },
    barangay: { type: String, required: true, trim: true, unique: true, index: true },
    landmarks: { type: String, default: '', trim: true },
    solo_fare: { type: FareRangeSchema, required: true },
    fare_per_2pax: { type: FareRangeSchema, required: true },
    fare_per_3pax_shared: { type: FareRangeSchema, required: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

TricycleFareSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.TricycleFare || mongoose.model('TricycleFare', TricycleFareSchema);
