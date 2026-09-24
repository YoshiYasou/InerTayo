'use strict';
const mongoose = require('mongoose');

const AdvisorySchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    affected_road: { type: String, required: true, trim: true },
    condition: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { versionKey: false });

AdvisorySchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.Advisory || mongoose.model('Advisory', AdvisorySchema);
