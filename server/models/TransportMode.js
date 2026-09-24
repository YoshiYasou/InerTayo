'use strict';
const mongoose = require('mongoose');

const TransportModeSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: null },
    icon: { type: String, default: null },
    status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    created_at: { type: Date, default: Date.now }
}, { versionKey: false });

TransportModeSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.TransportMode || mongoose.model('TransportMode', TransportModeSchema);
