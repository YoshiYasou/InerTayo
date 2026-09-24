'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

let _conn = null;

async function connectDB(uri) {
    if (_conn && mongoose.connection.readyState === 1) return _conn;

    const mongoUri = uri || process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('[FATAL] MONGODB_URI environment variable is not set.');
    }

    _conn = await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000
    });

    mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
    });

    console.log(`MongoDB connected: ${mongoose.connection.host}`);
    return _conn;
}

async function disconnectDB() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        _conn = null;
    }
}

module.exports = { connectDB, disconnectDB };
