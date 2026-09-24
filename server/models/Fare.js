'use strict';
const mongoose = require('mongoose');

const FareSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    route_id: { type: Number, required: true, index: true },
    passenger_type: { type: String, required: true, enum: ['REGULAR', 'STUDENT', 'SENIOR_CITIZEN', 'PWD'] },
    base_fare: { type: Number, required: true, min: 0 },
    discount_percentage: { type: Number, default: 0, min: 0, max: 100 },
    final_fare: { type: Number, required: true, min: 0 },
    effective_date: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

FareSchema.index({ route_id: 1, passenger_type: 1 });

FareSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.Fare || mongoose.model('Fare', FareSchema);
