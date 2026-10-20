'use strict';
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    user_id: { type: Number, required: true, index: true },
    username: { type: String, required: true },
    role: { type: String, required: true, enum: ['COMMUTER', 'ADMIN'] },
    action: {
        type: String,
        required: true,
        enum: [
            'ACCOUNT_CREATED',
            'LOGIN',
            'LOGOUT',
            'ROUTE_SAVED',
            'ROUTE_UNSAVED',
            'ADMIN_ROUTE_CREATED',
            'ADMIN_ROUTE_UPDATED',
            'ADMIN_ROUTE_DELETED',
            'ADMIN_STOP_CREATED',
            'ADMIN_STOP_UPDATED',
            'ADMIN_STOP_DELETED',
            'ADMIN_FARE_CREATED',
            'ADMIN_FARE_UPDATED',
            'ADMIN_FARE_DELETED'
        ],
        index: true
    },
    route_id: { type: Number, default: null },
    route_name: { type: String, default: null },
    details: { type: String, default: '' },
    created_at: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

AuditLogSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
