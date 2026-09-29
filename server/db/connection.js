'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

let _conn = null;

async function connectDB(uri, maxRetries = 4, delayMs = 1000) {
    if (_conn && mongoose.connection.readyState === 1) return _conn;

    const mongoUri = uri || process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('[FATAL] MONGODB_URI environment variable is not set.');
    }

    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            _conn = await mongoose.connect(mongoUri, {
                serverSelectionTimeoutMS: 10000
            });
            break;
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                console.warn(`[WARN] MongoDB connection attempt ${attempt}/${maxRetries} failed (${err.message}). Retrying in ${delayMs * attempt}ms...`);
                await new Promise(r => setTimeout(r, delayMs * attempt));
            }
        }
    }

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        throw lastError || new Error('[FATAL] Failed to connect to MongoDB after multiple attempts.');
    }

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
