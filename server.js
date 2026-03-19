/**
 * 파트너 주문 프로그램 — 로컬 개발 서버 + API 프록시
 *
 * 실행: node server.js [port]
 * 기본 포트: 8090
 *
 * 브라우저 CORS 우회를 위해 /proxy/api/* → 실제 API 서버로 프록시합니다.
 * 예: /proxy/api/https://api.sweetbook.com/v1/orders
 *   → https://api.sweetbook.com/v1/orders
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.argv[2] || '8090', 10);
const ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Transaction-ID',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

/**
 * API 프록시: /proxy/api/{targetUrl}
 * 브라우저 → localhost:8090/proxy/api/https://api.sweetbook.com/v1/orders
 *          → https://api.sweetbook.com/v1/orders
 */
function proxyApi(req, res) {
    // /proxy/api/ 이후의 전체 URL 추출
    const prefix = '/proxy/api/';
    const rawTarget = req.url.substring(prefix.length);
    if (!rawTarget) {
        res.writeHead(400, { 'Content-Type': 'text/plain', ...CORS_HEADERS });
        res.end('Missing target URL');
        return;
    }

    let targetUrl;
    try {
        targetUrl = new URL(rawTarget);
    } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain', ...CORS_HEADERS });
        res.end('Invalid target URL: ' + rawTarget);
        return;
    }

    const headers = {
        'Host': targetUrl.hostname,
    };
    if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['x-transaction-id']) headers['X-Transaction-ID'] = req.headers['x-transaction-id'];

    console.log(`[proxy] ${req.method} ${targetUrl.href}`);
    console.log(`[proxy] Auth: ${headers['Authorization'] ? headers['Authorization'].substring(0, 20) + '...' : '(없음)'}`);

    const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || 443,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers,
    };

    const proxyReq = https.request(options, (proxyRes) => {
        const resHeaders = {
            'Content-Type': proxyRes.headers['content-type'] || 'application/json',
            ...CORS_HEADERS,
        };
        // 에러 응답 시 body 로그
        if (proxyRes.statusCode >= 400) {
            let body = '';
            proxyRes.on('data', chunk => body += chunk);
            proxyRes.on('end', () => {
                console.log(`[proxy] ${proxyRes.statusCode} ${body.substring(0, 500)}`);
                res.writeHead(proxyRes.statusCode, resHeaders);
                res.end(body);
            });
            return;
        }
        res.writeHead(proxyRes.statusCode, resHeaders);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        }
        res.end(JSON.stringify({ error: err.message }));
    });

    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
        req.pipe(proxyReq);
    } else {
        proxyReq.end();
    }
}

function serveStatic(req, res) {
    let filePath = path.join(ROOT, decodeURIComponent(url.parse(req.url).pathname));
    if (filePath.endsWith(path.sep) || filePath.endsWith('/')) filePath += 'index.html';

    try {
        if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch (e) { /* ignore */ }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    // API 프록시
    if (req.url.startsWith('/proxy/api/')) {
        proxyApi(req, res);
        return;
    }

    // 정적 파일
    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`파트너 주문 서버 시작: http://localhost:${PORT}`);
    console.log(`API 프록시: /proxy/api/{targetUrl}`);
    console.log(`종료: Ctrl+C`);
});
