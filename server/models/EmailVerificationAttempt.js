'use strict';

const mongoose = require('mongoose');

const EmailVerificationAttemptSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    window_started_at: { type: Date, required: true },
    last_attempt_at: { type: Date, required: true },
    count: { type: Number, required: true, min: 1 },
    expires_at: { type: Date, required: true }
}, { versionKey: false });

EmailVerificationAttemptSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.EmailVerificationAttempt ||
    mongoose.model('EmailVerificationAttempt', EmailVerificationAttemptSchema);
