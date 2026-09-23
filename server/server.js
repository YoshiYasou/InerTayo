require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Secure HTTP headers (X-Content-Type-Options, X-Frame-Options, etc.)
// Configured with Content Security Policy & Referrer-Policy permitting OpenStreetMap tiles & Nominatim
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            imgSrc: [
                "'self'", 
                "data:", 
                "blob:", 
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

// ── CORS: restrict to configured ORIGIN in production; fall back to localhost for dev
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

// ── Rate limiter: authentication writes only (5 requests / 60 seconds → 429)
// Matches report template documented threshold exactly.
// Skipped entirely in test mode (NODE_ENV=test) so the automated suite can
// exercise auth endpoints without exhausting the window.
const authRateLimiter = rateLimit({
    windowMs: 60 * 1000,          // 60-second sliding window
    max: 5,                        // max 5 requests per window per IP
    standardHeaders: true,         // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,          // Disable deprecated X-RateLimit-* headers
    skip: (req) => process.env.NODE_ENV === 'test' || req.method !== 'POST',
    message: {
        error: 'Too many authentication attempts. Please wait 60 seconds before trying again.'
    }
});
app.use('/api/auth', authRateLimiter);

// ── Mount API endpoints
app.use('/api', apiRoutes);

// ── Serve static frontend in production / build mode
const clientDistPath = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// ── Fallback: all other routes serve the SPA index.html
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
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`  InerTayo Server running on http://localhost:${PORT}`);
        console.log(`  Target Location: Dagupan City, Pangasinan`);
        console.log(`====================================================`);
    });
}

module.exports = app;
