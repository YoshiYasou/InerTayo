const { Readable } = require('node:stream');

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

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

module.exports = async (req, res) => {
    const requestUrl = new URL(req.url || '/', API_ORIGIN);
    if (requestUrl.pathname !== '/api' && !requestUrl.pathname.startsWith('/api/')) {
        requestUrl.pathname = `/api${requestUrl.pathname}`;
    }

    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;
    delete headers['content-length'];
    removeHopByHopHeaders(headers);

    let body;
    if (req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
        body = await readRequestBody(req);
        if (body.length > 0) {
            headers['content-length'] = String(body.length);
        }
    }

    try {
        const upstreamResponse = await fetch(requestUrl, {
            method: req.method,
            headers,
            body: body && body.length > 0 ? body : undefined
        });

        const responseHeaders = {};
        upstreamResponse.headers.forEach((value, key) => {
            const normalized = key.toLowerCase();
            if (!HOP_BY_HOP_HEADERS.has(normalized) && normalized !== 'transfer-encoding') {
                responseHeaders[key] = value;
            }
        });

        res.writeHead(upstreamResponse.status, responseHeaders);
        if (upstreamResponse.body) {
            const stream = Readable.fromWeb(upstreamResponse.body);
            stream.pipe(res);
            return;
        }

        res.end();
    } catch (error) {
        console.error('Render API proxy error:', error);
        if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'The API service is temporarily unavailable.' }));
            return;
        }
        res.destroy(error);
    }
};
