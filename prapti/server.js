'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, 'dist');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_PORT = 8080;

const BODY_LIMIT = 16384;
const SESSION_COOKIE = 'prapti_sid';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SID_PATTERN = /^[0-9a-f]{48}$/;

const SHELL_ROUTES = [
  /^\/$/,
  /^\/results\/?$/,
  /^\/scheme\/[^/]+\/?$/,
  /^\/mee-seva\/?$/,
  /^\/tracker\/?$/,
  /^\/about\/?$/,
  /^\/rules-check\/?$/,
  /^\/helper\/?$/,
  /^\/editor\/?$/,
  /^\/demo\/?$/,
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// In-memory sessions only. Nothing is written to disk.
const sessions = new Map();

function pruneSessions(now) {
  for (const [sid, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) sessions.delete(sid);
  }
}

function isLocalHost(hostHeader) {
  const host = String(hostHeader || '')
    .toLowerCase()
    .replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function readSessionId(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}

function ensureSession(req, res) {
  const now = Date.now();
  const sid = readSessionId(req);
  if (sid && SID_PATTERN.test(sid)) {
    const existing = sessions.get(sid);
    if (existing && now - existing.createdAt <= SESSION_TTL_MS) {
      req.session = existing;
      return existing;
    }
    if (existing) sessions.delete(sid);
  }

  pruneSessions(now);
  const freshSid = crypto.randomBytes(24).toString('hex');
  const session = { createdAt: now, data: {} };
  sessions.set(freshSid, session);
  req.session = session;

  const secure = isLocalHost(req.headers.host) ? '' : '; Secure';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${freshSid}; HttpOnly; SameSite=Strict; Path=/${secure}`
  );
  return session;
}

function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

// Reads the request body incrementally. Stops and reports tooLarge as soon as
// the total exceeds `limit`; the rest of the body is never buffered.
function readBody(req, limit) {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      resolve({ tooLarge: true, text: '' });
      return;
    }

    const chunks = [];
    let total = 0;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      resolve(result);
    };

    const onData = (chunk) => {
      total += chunk.length;
      if (total > limit) {
        req.pause();
        finish({ tooLarge: true, text: '' });
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      finish({ tooLarge: false, text: Buffer.concat(chunks).toString('utf8') });
    };

    const onError = () => {
      finish({ tooLarge: false, error: true, text: '' });
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/rules-check') {
    sendJson(res, 501, { status: 'not_implemented' });
    return;
  }

  if (pathname === '/api/editor/login' && req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (pathname === '/api/editor' || pathname.startsWith('/api/editor/')) {
    const body = await readBody(req, BODY_LIMIT);
    if (body.tooLarge) {
      res.setHeader('Connection', 'close');
      sendJson(res, 413, { error: 'payload_too_large' });
      return;
    }
    if (pathname === '/api/editor/login' && body.text.trim() !== '') {
      try {
        JSON.parse(body.text);
      } catch {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
      }
    }
    sendJson(res, 501, { status: 'not_implemented' });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

function resolveRoot() {
  try {
    if (fs.statSync(DIST_DIR).isDirectory()) return DIST_DIR;
  } catch {
    // dist/ does not exist; fall through to public/.
  }
  return PUBLIC_DIR;
}

function cacheControlFor(fileName) {
  if (fileName === 'sw.js' || path.extname(fileName) === '.html') {
    return 'no-cache';
  }
  if (/\.[0-9a-f]{8}\.[a-z0-9]+$/i.test(fileName)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'no-cache';
}

async function serveShell(res, root) {
  let html;
  try {
    html = await fsp.readFile(path.join(root, 'index.html'));
  } catch {
    sendText(res, 503, 'App shell is not available.');
    return;
  }
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES['.html'],
    'Content-Length': html.length,
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

// Returns the decoded pathname, or null if it is malformed or attempts traversal.
function decodeSafePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  if (decoded.split('/').some((segment) => segment === '..')) return null;
  return decoded;
}

async function serveStatic(res, root, pathname) {
  const decoded = decodeSafePath(pathname);
  if (decoded === null) {
    sendText(res, 400, 'Bad request');
    return;
  }

  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  const fullPath = path.resolve(root, '.' + decoded);
  if (!fullPath.startsWith(rootPrefix)) {
    sendText(res, 400, 'Bad request');
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(fullPath);
  } catch {
    sendText(res, 404, 'Not found');
    return;
  }
  if (!stat.isFile()) {
    sendText(res, 404, 'Not found');
    return;
  }

  const body = await fsp.readFile(fullPath);
  const contentType =
    CONTENT_TYPES[path.extname(fullPath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'Cache-Control': cacheControlFor(path.basename(fullPath)),
  });
  res.end(body);
}

async function handleRequest(req, res) {
  applySecurityHeaders(res);
  ensureSession(req, res);

  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    sendText(res, 400, 'Bad request');
    return;
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    await handleApi(req, res, pathname);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendText(res, 405, 'Method not allowed');
    return;
  }

  const root = resolveRoot();
  if (SHELL_ROUTES.some((route) => route.test(pathname))) {
    await serveShell(res, root);
    return;
  }

  await serveStatic(res, root, pathname);
}

function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        sendText(res, 500, 'Internal server error');
      } else {
        res.end();
      }
    });
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  createServer().listen(port, () => {
    console.log(`Prapti listening on http://localhost:${port}`);
  });
}
