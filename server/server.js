require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('./db/connection');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            imgSrc: [
                "'self'", "data:", "blob:",
                "https://*.tile.openstreetmap.org",
                "https://tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com",
                "https://basemaps.cartocdn.com",
                "https://unpkg.com",
                "https://cdnjs.cloudflare.com"
            ],
            connectSrc: [
                "'self'",
                "https://*.tile.openstreetmap.org",
                "https://tile.openstreetmap.org",
                "https://*.basemaps.cartocdn.com",
                "https://nominatim.openstreetmap.org"
            ],
            fontSrc: ["'self'", "https:", "data:"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false
}));

// ── CORS
const allowedOrigin = process.env.ORIGIN || 'http://localhost:5173';
app.use(cors({
    origin: allowedOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// ── Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiter: auth writes only, skipped in test
const authRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'test' || req.method !== 'POST',
    message: {
        error: 'Too many authentication attempts. Please wait 60 seconds before trying again.'
    }
});
app.use('/api/auth', authRateLimiter);

// ── Mount API endpoints
app.use('/api', apiRoutes);

// ── Serve static frontend in production
const clientDistPath = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// ── SPA fallback
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found.' });
    }
    const indexPath = path.join(clientDistPath, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head><title>InerTayo — Transit System</title></head>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1>InerTayo Public Transportation Route Information System</h1>
                    <p>API Server is running on port ${PORT}.</p>
                    <p>Frontend client build is compiling or available on the development server.</p>
                </body>
                </html>
            `);
        }
    });
});

// ── Centralized error handler
app.use((err, req, res, next) => {
    console.error('Server Unhandled Error:', err);
    res.status(500).json({ error: 'An unexpected internal server error occurred.' });
});

if (require.main === module) {
    connectDB()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`====================================================`);
                console.log(`  InerTayo Server running on http://localhost:${PORT}`);
                console.log(`  Target Location: Dagupan City, Pangasinan`);
                console.log(`  Database: MongoDB (Mongoose)`);
                console.log(`====================================================`);
            });
        })
        .catch((err) => {
            console.error('[FATAL] Could not connect to MongoDB:', err.message);
            process.exit(1);
        });
}

module.exports = app;
