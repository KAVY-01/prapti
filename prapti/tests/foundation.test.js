'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../server.js');

const server = createServer();
let port = 0;
const ready = new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    port = server.address().port;
    resolve();
  });
});

after(() => new Promise((resolve) => {
  server.closeAllConnections();
  server.close(() => resolve());
}));

// agent: false keeps each request on its own connection, so server.close() returns promptly.
function request({ method = 'GET', path: reqPath = '/', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: reqPath, headers, agent: false },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('GET / returns the app shell with CSP', async () => {
  await ready;
  const res = await request({ path: '/' });
  assert.equal(res.status, 200);
  assert.match(String(res.headers['content-type']), /text\/html/);
  assert.match(String(res.headers['content-security-policy']), /frame-ancestors 'none'/);
});

test('GET /missing-thing returns 404', async () => {
  await ready;
  const res = await request({ path: '/missing-thing' });
  assert.equal(res.status, 404);
});

test('encoded path traversal never serves server.js', async () => {
  await ready;
  for (const p of ['/..%2Fserver.js', '/%2e%2e/server.js']) {
    const res = await request({ path: p });
    assert.ok(res.status === 400 || res.status === 404, `${p} gave ${res.status}`);
    assert.ok(!res.body.includes('createServer'), `${p} leaked server.js`);
  }
});

test('POST /api/editor/login with a 20 KB body returns 413', async () => {
  await ready;
  const body = JSON.stringify({ password: 'x'.repeat(20 * 1024) });
  const res = await request({
    method: 'POST',
    path: '/api/editor/login',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
  assert.equal(res.status, 413);
});

test('POST /api/editor/login small body returns 501 and sets session cookie', async () => {
  await ready;
  const body = JSON.stringify({ password: 'test' });
  const res = await request({
    method: 'POST',
    path: '/api/editor/login',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
  assert.equal(res.status, 501);
  const cookies = [].concat(res.headers['set-cookie'] || []);
  const sid = cookies.find((c) => c.startsWith('prapti_sid='));
  assert.ok(sid, 'prapti_sid cookie missing');
  assert.match(sid, /HttpOnly/);
  assert.match(sid, /SameSite=Strict/);
  assert.match(sid, /Path=\//);
});
