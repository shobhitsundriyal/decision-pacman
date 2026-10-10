// Minimal zero-dependency Node server for the Pac-Man game.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => resolve(data));
  });
}

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// Same-origin proxy for the Jev API — the browser can't call
// api.typesafe.ai directly (CORS), so we forward the request server-side.
function proxyJev(req, res) {
  readBody(req).then((body) => {
    const options = {
      hostname: 'api.typesafe.ai',
      path: '/v1/systemone',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(req.headers.authorization
          ? { Authorization: req.headers.authorization }
          : {}),
      },
    };
    const upstream = https.request(options, (ur) => {
      res.writeHead(ur.statusCode, {
        'Content-Type': ur.headers['content-type'] || 'application/json',
      });
      ur.pipe(res);
    });
    upstream.on('error', (err) =>
      sendJSON(res, 502, { error: 'upstream: ' + err.message }),
    );
    upstream.end(body);
  });
}

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Jev proxy (avoids browser CORS restrictions)
  if (urlPath === '/api/jev') {
    if (req.method !== 'POST') {
      sendJSON(res, 405, { error: 'POST only' });
      return;
    }
    proxyJev(req, res);
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, path.normalize(urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    // For index.html, stamp the URL of game.js with its current mtime so any
    // edit to game.js instantly busts the browser cache on the next reload.
    if (urlPath === '/index.html') {
      let version = '0';
      try {
        version = String(fs.statSync(path.join(ROOT, 'game.js')).mtimeMs);
      } catch (e) {}
      data = Buffer.from(
        data
          .toString()
          .replace(/game\.js\?v=\d+(?:\.\d+)?/g, 'game.js?v=' + version),
      );
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Pac-Man running at http://localhost:${PORT}`);
});
