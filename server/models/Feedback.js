'use strict';
const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    user_id: { type: Number, default: null, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, required: true, enum: ['NEW', 'REVIEWED'], default: 'NEW', index: true },
    created_at: { type: Date, default: Date.now }
}, { versionKey: false });

FeedbackSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.Feedback || mongoose.model('Feedback', FeedbackSchema);
