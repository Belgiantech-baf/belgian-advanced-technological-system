# BOC GeoFS Chat Logger

A Node.js 20 service that persistently stores structured GeoFS multiplayer chat for the Belgian Operational Chat system.

## Important GeoFS limitation

The documented/public GeoFS mechanism exposes chat in the multiplayer response received by an authorized GeoFS client:

```js
multiplayer.lastRequest.chatMessages
```

The documented response fields include `acid`, `cs`, `msg`, and `uid`. Public examples also show the client update request using the active GeoFS multiplayer session context. There is no documented public server-to-server chat stream that can be connected to without an authorized client session.

Therefore this service is always-on and independent of your personal computer for storage, search, moderation, and dashboard delivery, but it cannot discover new GeoFS chat while no authorized GeoFS client is connected. The BOC Tampermonkey client or another authorized client relays only the public chat data it legitimately receives. This implementation does not request, store, or expose passwords, cookies, session IDs, or private credentials.

The safe architecture is:

```text
GeoFS authorized client -> HTTPS ingest -> this VPS -> SQLite -> REST/SSE -> BOC dashboard
```

## Features

- SQLite persistence with WAL mode and indexes for timestamp, callsign, UID, message, and deduplication key
- Duplicate prevention using GeoFS message IDs when available and a SHA-256 identity fallback otherwise
- `GET /api/chat`, `/api/chat/recent`, `/api/chat/search`, and `/api/chat/:id`
- Parameterized search by `q`, `callsign`, `uid`, `from`, and `to`
- Server-Sent Events at `/api/events` for live dashboard updates
- `POST /api/ingest` for structured batches
- `POST /api/boc/log` compatibility route for the existing BOC userscript relay
- API-key-protected moderation updates at `PATCH /api/chat/:id/moderation`
- Health metrics at `/api/status`
- Ingest rate limiting, JSON size limits, CORS control, structured logs, graceful shutdown, and crash reporting
- Dashboard-independent operation: messages remain in SQLite when no dashboard is connected

The public ingest route is deliberately limited to public GeoFS chat-shaped records and is rate-limited. It cannot mutate moderation state or execute commands. Administrative moderation writes require `X-API-Key` and `BOC_API_KEY`.

## Local setup

```powershell
cd boc-geofs-logger
npm install
Copy-Item .env.example .env
# Set BOC_API_KEY to a long random value
npm test
npm start
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/status
```

## API examples

Ingest a documented GeoFS message:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3000/api/ingest `
  -ContentType 'application/json' `
  -Body '{"source":"GeoFS","messages":[{"id":42,"cs":"BAF001","uid":"123456","acid":7,"msg":"Requesting departure"}]}'
```

Recent messages:

```text
GET /api/chat/recent?limit=100
```

Search:

```text
GET /api/chat/search?q=departure&from=2026-09-24T00:00:00Z
```

Live feed:

```text
GET /api/events
```

Moderation update:

```powershell
Invoke-RestMethod -Method Patch http://127.0.0.1:3000/api/chat/42/moderation `
  -Headers @{ 'X-API-Key' = $env:BOC_API_KEY } `
  -ContentType 'application/json' `
  -Body '{"flagged":true,"reviewed":false,"reason":"Needs moderator review"}'
```

## WispByte deployment

1. Create a Node.js server using Node 20 or newer.
2. Upload this `boc-geofs-logger` directory or connect the Git repository.
3. Set the install command to `npm install --omit=dev`.
4. Set the startup command to `npm start`.
5. Configure these environment variables in WispByte:

```text
PORT=<WispByte-provided port>
DATABASE_PATH=/home/container/data/boc-chat.sqlite
BOC_API_KEY=<long random admin key>
LOG_LEVEL=info
CORS_ORIGIN=https://www.geo-fs.com
INGEST_REQUESTS_PER_MINUTE=240
```

6. Attach persistent storage for `/home/container/data`. SQLite data is lost if the hosting volume is ephemeral.
7. Deploy or restart the service. WispByte’s process manager should restart the process after a crash; do not run a second copy against the same SQLite file.
8. Verify `https://your-host/api/status` returns `status: online` and `database: connected`.
9. Configure the BOC userscript relay endpoint to `https://your-host/api/boc/log`. Do not put `BOC_API_KEY` in the userscript.
10. Watch WispByte logs for JSON records such as `BOC GeoFS logger online`, `Chat messages stored`, and database errors.

## Reliability and operations

The Node process uses SQLite WAL mode, parameterized statements, rate limiting, SSE heartbeats, and graceful SIGTERM/SIGINT handling. `uncaughtException` closes the server and exits with code 1 so the hosting process manager can restart it. `unhandledRejection` is logged. A dashboard disconnect does not affect ingestion or storage.

The service does not pretend to implement an impossible headless GeoFS connection. To collect continuously, keep an authorized BOC/GeoFS client session available on an approved always-on host, or obtain an official GeoFS server-side feed/API. Never copy personal cookies or session tokens to the VPS.
