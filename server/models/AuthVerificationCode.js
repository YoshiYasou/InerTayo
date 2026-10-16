'use strict';
const mongoose = require('mongoose');

const AuthVerificationCodeSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    purpose: { type: String, required: true, enum: ['SIGNUP', 'ADMIN_LOGIN'], index: true },
    code_hash: { type: String, required: true },
    challenge_hash: { type: String },
    expires_at: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.models.AuthVerificationCode || mongoose.model('AuthVerificationCode', AuthVerificationCodeSchema);