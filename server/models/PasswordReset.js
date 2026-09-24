'use strict';
const mongoose = require('mongoose');

const PasswordResetSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    email: { type: String, required: true },
    reset_code: { type: String, required: true },
    expires_at: { type: Date, required: true },
    used: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
}, { versionKey: false });

PasswordResetSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.PasswordReset || mongoose.model('PasswordReset', PasswordResetSchema);
