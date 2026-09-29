'use strict';
const mongoose = require('mongoose');

const ChangePasswordCodeSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    email: { type: String, required: true },
    code_hash: { type: String, required: true },
    expires_at: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    max_attempts: { type: Number, default: 5 },
    used: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
}, { versionKey: false });

ChangePasswordCodeSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.code_hash;
        return ret;
    }
});

module.exports = mongoose.models.ChangePasswordCode || mongoose.model('ChangePasswordCode', ChangePasswordCodeSchema);
