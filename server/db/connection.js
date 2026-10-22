'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('node:dns');

let _conn = null;
let _connectionPromise = null;

async function connectDB(uri, options = {}) {
    if (_conn && mongoose.connection.readyState === 1) return _conn;
    if (_connectionPromise) return _connectionPromise;

    const {
        maxRetries = 4,
        delayMs = 1000,
        serverSelectionTimeoutMS = 10000
    } = options;

    _connectionPromise = (async () => {
        const dnsServers = (process.env.MONGODB_DNS_SERVERS || '')
            .split(',')
            .map(server => server.trim())
            .filter(Boolean);
        if (dnsServers.length > 0) dns.setServers(dnsServers);

        let mongoUri = uri || process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('[FATAL] MONGODB_URI environment variable is not set.');
        }

        mongoUri = mongoUri.trim()
            .replace(/^MONGODB_URI\s*=\s*/i, '')
            .replace(/^(['"])(.*)\1$/, '$2')
            .trim();

        if (!/^mongodb(?:\+srv)?:\/\//.test(mongoUri)) {
            throw new Error('[FATAL] MONGODB_URI must be a raw MongoDB URI starting with mongodb:// or mongodb+srv://. Do not include the MONGODB_URI= label.');
        }

        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                _conn = await mongoose.connect(mongoUri, { serverSelectionTimeoutMS });
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
    })();

    try {
        return await _connectionPromise;
    } finally {
        _connectionPromise = null;
    }
}

async function disconnectDB() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        _conn = null;
    }
}

module.exports = { connectDB, disconnectDB };
