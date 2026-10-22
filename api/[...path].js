const https = require('node:https');

const API_ORIGIN = 'https://inertayo.onrender.com';
const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
]);

function removeHopByHopHeaders(headers) {
    const connectionHeaders = String(headers.connection || '')
        .split(',')
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean);

    for (const header of [...HOP_BY_HOP_HEADERS, ...connectionHeaders]) {
        delete headers[header];
    }
}

module.exports = (req, res) => {
    const requestUrl = new URL(req.url || '/', API_ORIGIN);
    if (requestUrl.pathname !== '/api' && !requestUrl.pathname.startsWith('/api/')) {
        requestUrl.pathname = `/api${requestUrl.pathname}`;
    }

    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;
    removeHopByHopHeaders(headers);

    const upstreamRequest = https.request(requestUrl, {
        method: req.method,
        headers
    }, (upstreamResponse) => {
        const responseHeaders = { ...upstreamResponse.headers };
        removeHopByHopHeaders(responseHeaders);
        res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
        upstreamResponse.pipe(res);
    });

    upstreamRequest.on('error', (error) => {
        console.error('Render API proxy error:', error);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'The API service is temporarily unavailable.' }));
            return;
        }
        res.destroy(error);
    });

    req.on('aborted', () => upstreamRequest.destroy());
    req.pipe(upstreamRequest);
};
