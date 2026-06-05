# BucketFillers landing page

A single-file landing page (`index.html`) for a few self-hosted services, plus a tiny
zero-dependency status backend (`server.js`) that makes the online/offline indicators
reflect **true** status.

## Why there's a backend

A browser **cannot** read a cross-origin site's real HTTP status — CORS makes the
response opaque. So a purely client-side ping can only tell that *something answered
at the edge*, which is misleading: a tunnel/proxy that is up while the app behind it
has crashed still answers (HTTP `5xx`) and would show up as **"online"**.

`server.js` fixes this by checking each service **server-side** (where there is no CORS
restriction), reading the real status code, and serving the result at `/api/status`.
The page polls that endpoint. Because the page and the API are served from the **same
origin**, no CORS configuration is needed anywhere.

**up** = the origin answered with a real status below `500`.
**offline** = `5xx` (e.g. a live tunnel with a dead app), a timeout, or no response at all.

If the API is unreachable (e.g. you open `index.html` directly via `file://` without the
server), the page shows an honest **"status n/a"** instead of guessing.

## Run it

Requires **Node 18+** (uses the built-in global `fetch`; no `npm install`).

```bash
node server.js
# → http://localhost:8787        (the landing page)
# → http://localhost:8787/api/status   (the raw JSON it polls)
```

Open the page **through the server** (`http://localhost:8787`), not as a `file://` —
otherwise there's no `/api/status` to read and you'll see "status n/a".

### Environment variables

| Variable            | Default | Meaning                                         |
| ------------------- | ------- | ----------------------------------------------- |
| `PORT`              | `8787`  | Port to serve the page + API on                 |
| `CHECK_INTERVAL_MS` | `15000` | How often the server re-checks every service    |
| `CHECK_TIMEOUT_MS`  | `8000`  | Per-check timeout before a service counts down  |

## Configure services

Edit the `SERVICES` array near the top of `server.js`. Per-service options:

```js
{ name: 'BucketFillers', host: 'bucketfillers.timhufnagel.org', port: 3000,
  // optional:
  // url: 'https://bucketfillers.timhufnagel.org/healthz', // probe a specific URL
  // healthPath: '/healthz',        // probe <origin><healthPath> instead of "/"
  // downAtOrAbove: 500,            // lowest status code treated as "down" (default 500)
}
```

If a service serves a real health route, pointing `healthPath` at it (and tightening
`downAtOrAbove`) gives the most precise signal. By default the root `/` is probed and any
status `< 500` counts as up — which already flips the "dead app behind a live tunnel"
case (`502`/`521`/`523`/`530`) to **offline**.

> The page's hero card and list are also driven by `host`, so keep the `host` values in
> `server.js` and the `data-host` values in `index.html` in sync if you add/rename a service.

## Deploy

Run `server.js` wherever it can reach your services (a VPS, your home server, or behind
your existing tunnel/proxy), then point the landing-page hostname at it. Keep it alive
with whatever you already use, e.g.:

```bash
# systemd, pm2, or a container — for example:
pm2 start server.js --name bucketfillers-landing
```

Behind a reverse proxy or tunnel, just forward the landing hostname to this process'
`PORT`. Everything (page + `/api/status`) is same-origin, so no extra CORS or routing
rules are required.

## Notes & limits

- **TLS / certs:** a service with an invalid/self-signed cert will be reported offline
  (Node rejects the request). Use valid certs, or front them with your proxy.
- **Auth-protected services:** a `401`/`403` means the server *is* responding, so it's
  counted as **up** (it's alive, just protected). Add a `healthPath` to a public route if
  you want a stricter check.
- **On Cloudflare?** The same logic runs nicely as a Cloudflare Worker (origin checks at
  the edge, returns the same JSON). Ask and I'll generate the Worker version.
