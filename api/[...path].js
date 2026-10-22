'use strict';

const { connectDB } = require('../server/db/connection');
const app = require('../server/server');

async function handler(req, res) {
    try {
        await connectDB(undefined, {
            maxRetries: 1,
            serverSelectionTimeoutMS: 8000
        });
        return app(req, res);
    } catch (error) {
        console.error('Vercel API initialization failed:', error.message);
        if (!res.headersSent) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'The API service is temporarily unavailable.' }));
            return;
        }
        res.destroy(error);
    }
}

module.exports = handler;
