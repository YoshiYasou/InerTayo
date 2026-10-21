const jwt = require('jsonwebtoken');

// Refuse to start without a proper JWT secret in the environment.
// Never fall back to a hardcoded string — that would make tokens forgeable
// by anyone who reads the source code.
if (!process.env.JWT_SECRET) {
    console.error(
        '[FATAL] JWT_SECRET environment variable is not set. ' +
        'Set it in your .env file before starting the server.'
    );
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired session. Please log in again.' });
        }
        req.user = user;
        next();
    });
}

function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            req.user = null;
        } else {
            req.user = user;
        }
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Administrative privileges required for this action.' });
    }
    next();
}

function requireCommuter(req, res, next) {
    if (!req.user || req.user.role !== 'COMMUTER') {
        return res.status(403).json({ error: 'Commuter privileges required for this action.' });
    }
    next();
}

module.exports = {
    JWT_SECRET,
    authenticateToken,
    optionalAuth,
    requireAdmin,
    requireCommuter
};
