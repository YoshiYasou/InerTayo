'use strict';
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password_hash: { type: String, required: true },
    role: { type: String, required: true, enum: ['COMMUTER', 'ADMIN'], default: 'COMMUTER' },
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
