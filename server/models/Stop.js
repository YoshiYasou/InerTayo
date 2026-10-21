'use strict';
const mongoose = require('mongoose');

const StopSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    route_id: { type: Number, default: null, index: true },
    stop_name: { type: String, required: true, trim: true },
    stop_order: { type: Number, default: null },
    routes: [{
        _id: false,
        route_id: { type: Number, required: true },
        stop_order: { type: Number, required: true }
    }],
    description: { type: String, default: null },
    vehicle_type: { type: String, enum: ['', 'jeepney', 'modern_puv', 'bus', 'provincial_bus', 'tricycle', 'boat'], default: '' },
    stop_color: { type: String, default: null },
    is_transfer_point: { type: Number, default: 0 },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null }
}, { versionKey: false });

StopSchema.index({ route_id: 1, stop_order: 1 });
StopSchema.index({ 'routes.route_id': 1 });

StopSchema.set('toJSON', {
    transform: (doc, ret) => { delete ret._id; return ret; }
});

module.exports = mongoose.models.Stop || mongoose.model('Stop', StopSchema);
