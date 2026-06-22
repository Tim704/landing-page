'use strict';
/* ============================================================================
   BucketFillers — landing page + TRUE status backend (zero dependencies).

   Why this exists: a browser cannot read a cross-origin site's real HTTP
   status (CORS makes the response opaque), so a client-side ping can only
   tell that *something* answered at the edge. That is misleading — a tunnel
   that is up while the app behind it has crashed still answers (HTTP 5xx)
   and would look "online".

   This server checks each service SERVER-SIDE, reads the real status code,
   and serves both the landing page and the result at /api/status (same
   origin, so the page needs no CORS). It treats a genuine response under
   500 as "up", and 5xx / timeout / connection error as "down".

   Run:   node server.js          (Node 18+; uses the built-in global fetch)
   Then:  open http://localhost:8787
   Env:   PORT, CHECK_INTERVAL_MS, CHECK_TIMEOUT_MS
   ============================================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');

/* ---- Services to monitor. Add/edit a line to add/remove a service. ----
   Optional per-service overrides:
     url          full URL to probe (defaults to https://<host>)
     healthPath   probe <origin><healthPath> instead of "/" (e.g. "/healthz")
     downAtOrAbove lowest status code considered "down" (default 500)        */
const SERVICES = [
  { name: 'BucketFillers', host: 'bucketfillers.timhufnagel.org', port: 3000 },
  { name: 'Notes',         host: 'notes.timhufnagel.org',         port: 3002 },
  { name: 'World Cup',     host: 'worldcup.timhufnagel.org',      port: 8081 },
  { name: 'Florence',      host: 'florence.timhufnagel.org',      port: 8080 },
  { name: 'Alpine',        host: 'alpine.timhufnagel.org',        port: 3005 },
  { name: 'CrisisLens',    host: 'crisislens.timhufnagel.org',    port: 3007 },
  { name: 'Hoard',         host: 'hoard.timhufnagel.org',         port: 3010 },
  { name: 'Todo',          host: 'todo.timhufnagel.org',          port: 3011 },
  { name: 'Eisenhower',    host: 'eisenhower.timhufnagel.org',    port: 3012 },
];

const PORT              = Number(process.env.PORT || 8787);
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 15000);
const CHECK_TIMEOUT_MS  = Number(process.env.CHECK_TIMEOUT_MS  || 8000);
const INDEX_FILE        = path.join(__dirname, 'index.html');

if (typeof fetch !== 'function') {
  console.error('This server needs Node 18+ (for the built-in global fetch).');
  process.exit(1);
}

function probeUrl(svc) {
  if (svc.url) return svc.url;
  return 'https://' + svc.host + (svc.healthPath || '');
}

// "up" = the origin answered with a real status below its down threshold.
// "down" = 5xx (e.g. a live tunnel with a dead app), or no response at all.
async function checkOne(svc) {
  const url = probeUrl(svc);
  const downAt = svc.downAtOrAbove || 500;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  const started = Date.now();
  const base = { name: svc.name, host: svc.host, port: svc.port, url };
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',           // follow redirects, then read the FINAL status
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'BucketFillers-StatusChecker/1.0', 'Accept': '*/*' },
    });
    try { await res.arrayBuffer(); } catch (_) {} // drain body, ignore content
    const ms = Date.now() - started;
    const state = res.status < downAt ? 'up' : 'down';
    return { ...base, state, code: res.status, ms, error: null };
  } catch (e) {
    const ms = Date.now() - started;
    const code = e && e.cause && e.cause.code;
    const error = e && e.name === 'AbortError' ? 'timeout' : (code || (e && e.message) || 'fetch failed');
    return { ...base, state: 'down', code: null, ms, error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

// Latest snapshot, served to the page. Starts "pending" until the first run.
let snapshot = {
  checkedAt: null,
  services: SERVICES.map(s => ({
    name: s.name, host: s.host, port: s.port, url: probeUrl(s),
    state: 'pending', code: null, ms: null, error: null,
  })),
};

async function runChecks() {
  const services = await Promise.all(SERVICES.map(checkOne));
  snapshot = { checkedAt: new Date().toISOString(), services };
  const line = services.map(s => `${s.name}=${s.state}${s.code ? '(' + s.code + ')' : s.error ? '(' + s.error + ')' : ''}`).join('  ');
  console.log(`[${snapshot.checkedAt}] ${line}`);
}

runChecks();
setInterval(runChecks, CHECK_INTERVAL_MS);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*', // harmless; lets the page work cross-origin too
    });
    res.end(JSON.stringify(snapshot));
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(INDEX_FILE, (err, buf) => {
      if (err) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('index.html not found next to server.js'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`BucketFillers landing + status API → http://localhost:${PORT}`);
  console.log(`Status JSON                        → http://localhost:${PORT}/api/status`);
});
