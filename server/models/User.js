'use strict';
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password_hash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ['COMMUTER', 'ADMIN'], default: 'COMMUTER' },
    email_verified: { type: Boolean, default: false },
    email_verified_at: { type: Date },
    email_verification_token_hash: { type: String, select: false, index: true },
    email_verification_expires_at: { type: Date, select: false },
    email_verification_sent_at: { type: Date, select: false },
    created_at: { type: Date, default: Date.now }
}, { versionKey: false });

UserSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret._id;
        delete ret.password_hash;
        return ret;
    }
});

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
