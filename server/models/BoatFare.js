'use strict';
const mongoose = require('mongoose');

const BoatFareSchema = new mongoose.Schema({
    service_type: { type: String, required: true, unique: true, trim: true, index: true },
    dock_location: { type: String, required: true, trim: true },
    destinations: { type: String, required: true, trim: true },
    fare_rate_note: { type: String, required: true, trim: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

BoatFareSchema.set('toJSON', {
    transform: (doc, ret) => {
        if (ret._id) ret.id = ret._id.toString();
        return ret;
    }
});

module.exports = mongoose.models.BoatFare || mongoose.model('BoatFare', BoatFareSchema);
