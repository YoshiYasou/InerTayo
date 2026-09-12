const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Parsing Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount API endpoints
app.use('/api', apiRoutes);

// Serve static frontend in production / build mode
const clientDistPath = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Fallback all other routes to frontend SPA index.html
app.use((req, res) => {
    // If API route 404, return JSON error
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found.' });
    }
    const indexPath = path.join(clientDistPath, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            // If client has not been built yet, provide friendly status
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

// Centralized error handler
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
