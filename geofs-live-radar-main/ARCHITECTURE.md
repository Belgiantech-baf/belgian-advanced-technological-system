# GeoFS Live Radar Architecture

## 1. Executive summary

GeoFS Live Radar is a small Python web application that presents a browser-based map of publicly returned GeoFS aircraft data. A Flask server serves an embedded HTML/CSS/JavaScript single-page interface and exposes `/api/map` as a server-side proxy for the public GeoFS map endpoint.

The browser polls the proxy every 2 seconds, keeps a short-lived in-memory aircraft state, filters callsigns using user-managed tags, and renders aircraft positions with Leaflet. User filter tags and the light/dark theme are stored in the browser's `localStorage`; there is no application database or login system.

For a deployment in Belgium, the interface uses the browser's locale for the displayed last-fetch time. The resulting clock will normally use Central European Time (CET, UTC+1) in winter and Central European Summer Time (CEST, UTC+2) in summer, subject to the user's browser and operating-system settings. Aircraft coordinates are global and are not restricted to Belgian airspace.

## 2. System components

### Server-side components

- `geofs_live_radar.py`: application entry point, Flask routes, configuration constants, and embedded frontend.
- Flask: serves the page and implements HTTP routes.
- Requests: sends a POST request to the upstream GeoFS map service.
- Gunicorn: listed as a production process server dependency.

### Browser-side components

- Leaflet 1.9.4 from `unpkg.com`: map, markers, popups, and map events.
- Carto basemap tiles: separate light and dark tile URLs, with OpenStreetMap and Carto attribution.
- Google Fonts Material Symbols: interface icons.
- Plausible Analytics: external script configured for `geofs-live-radar.onrender.com`.
- Embedded JavaScript: polling, validation, filtering, interpolation, popup rendering, and theme persistence.

### Runtime state

- Flask process state is limited to request handling; no server-side aircraft cache is maintained.
- The browser's `AC` object tracks visible aircraft between polls.
- `localStorage` keys `geofs_radar_tags` and `theme` persist filters and theme choice per browser origin.

## 3. Data flow explanation

1. A client requests `GET /`.
2. Flask returns the embedded HTML document.
3. The browser loads Leaflet, basemap tiles, Material Symbols, and the analytics script from external hosts.
4. The JavaScript initializes a world map at approximately latitude 20, longitude 0, with zoom level 2.
5. Every 2 seconds, the browser requests `GET /api/map` with cache disabled.
6. Flask sends `POST https://mps.geo-fs.com/map` with an empty form body and a 3-second timeout.
7. On success, Flask forwards the upstream response body as JSON. On failure, it returns HTTP 502 with an error object.
8. The browser reads `data.users` and uses `userCount` when available, otherwise the array length.
9. Records without a valid coordinate array, valid latitude/longitude, or a non-empty callsign are ignored. Two hard-coded callsigns are also ignored.
10. Coordinates are converted from altitude in meters to feet. Callsign tags are matched case-insensitively using substring matching.
11. Visible aircraft receive a directional marker, callsign label, and popup containing callsign, user ID, aircraft ID, aircraft type, altitude, speed, and heading.
12. Between polls, `requestAnimationFrame` interpolates marker positions. Aircraft not observed for 15 seconds are removed.
13. The map displays the current visible marker count and the reported upstream total. The last-fetch display uses `toLocaleTimeString()`.

### Inputs and outputs

| Area | Inputs | Outputs |
| --- | --- | --- |
| Server configuration | `PORT` environment variable | Listening HTTP port, default `5000` |
| Upstream integration | GeoFS public map response | JSON response through `/api/map` |
| Browser filter | Default tags and user-entered strings | Visible aircraft subset |
| Browser theme | Saved theme or toggle action | Light/dark CSS variables and basemap |
| Aircraft records | `co`, `cs`, `id`, `acid`, `ac`, `st.as` fields | Markers, labels, popups, counters |
| User interaction | Map click, marker hover/click, filter controls | Popup lock/unlock, filter changes, theme changes |

## 4. Configuration observations

### Server configuration

- `UPSTREAM_URL` is fixed to `https://mps.geo-fs.com/map`.
- `TIMEOUT` is fixed at 3 seconds for each upstream request.
- `PORT` reads the `PORT` environment variable and falls back to 5000.
- The development entry point binds to `0.0.0.0` with `debug=False`.
- `/api/map` accepts only `GET`; `/` accepts only `GET`.
- There is no authentication, authorization, rate limiting, request ID, structured logging, or configurable upstream URL.

### Client configuration

- Poll interval: 2 seconds.
- Stale aircraft retention: 15 seconds.
- Labels are enabled at all configured zoom levels because the minimum label zoom is 0 and the map minimum zoom is 1.
- Initial map view: `[20, 0]`, zoom `2`.
- Map bounds: latitude/longitude limits of `[-300, -300]` to `[300, 300]`.
- Default callsign filters are embedded in the JavaScript and can be replaced, appended to, or removed by the user.
- The theme is saved locally and defaults to light mode unless `theme` is `"dark"`.

### Publicly observable behavior

- The deployed page exposes its upstream polling cadence indirectly through visible marker movement and the last-fetch clock.
- The browser makes requests to `/api/map`, the GeoFS upstream service is contacted by the server, and external map, font, and analytics hosts are contacted by the browser.
- Aircraft details are shown on hover and click; a clicked popup can be locked until the marker or map is clicked again.
- Filter values are local to the browser profile and are not shared with other users or devices.
- No credentials, license checks, encryption bypasses, or access-control bypasses are present in the application code.

## 5. Potential improvements

1. **Validate and escape displayed data.** Callsigns and other upstream values are inserted into HTML templates. Escape text before placing it in popup or label HTML to reduce the risk of script injection if upstream data is compromised or unexpectedly formatted.
2. **Make external endpoints configurable.** Allow the upstream URL, timeout, poll interval, and stale timeout to be supplied through validated environment variables while retaining conservative defaults.
3. **Add operational controls.** Add structured logs, upstream latency/error metrics, a health endpoint, and a modest rate limit for `/api/map`, especially if deployed publicly from Belgium or elsewhere.
4. **Use a production server configuration.** Document the Gunicorn command, reverse-proxy/TLS expectations, trusted host policy, and any required Belgium/EU privacy notice for analytics.
5. **Review privacy and retention.** The page displays user identifiers and callsigns returned by the public service and loads Plausible analytics. Document the lawful basis, processor arrangements, retention, and consent requirements that apply to the Belgium/EU deployment.
6. **Improve resilience.** Add exponential backoff or jitter after repeated upstream failures, distinguish stale data from an empty result, and avoid overlapping refresh requests if a future timeout exceeds the polling interval.
7. **Add tests.** Cover proxy success/failure behavior, malformed upstream records, filtering, altitude conversion, stale removal, and theme/filter persistence.
8. **Keep aircraft data current.** The embedded aircraft ID table should be versioned or loaded from a maintained data source, with an explicit fallback for unknown IDs.

## 6. Discord notification payload

```json
{
  "content": "Analysis update: GeoFS Live Radar is a Flask app with an embedded Leaflet frontend. The browser polls /api/map every 2 seconds; Flask POSTs to the public GeoFS map endpoint with a 3-second timeout, then the client validates, case-insensitively filters, interpolates, and renders aircraft markers for up to 15 seconds. Filters and theme are stored in browser localStorage; no database or authentication is present. Key follow-ups are HTML escaping for upstream values, configurable operational settings, rate limiting, observability, and Belgium/EU privacy review for analytics and displayed user data."
}
```

## 7. Component inventory

| Component or service | Location | Role | Network behavior |
| --- | --- | --- | --- |
| Python standard library `os` | Server | Reads `PORT` | None |
| Python standard library `json` | Server | Serializes proxy errors | None |
| Flask | `requirements.txt`, server | HTTP application and response construction | Listens for inbound HTTP |
| Requests | `requirements.txt`, server | Calls the GeoFS map endpoint | Outbound HTTPS POST |
| Gunicorn | `requirements.txt` | Available production WSGI server dependency | Depends on deployment configuration; no invocation is present in the repository |
| GeoFS map service | `https://mps.geo-fs.com/map` | Source of aircraft map data | Receives server-side POST with an empty form body |
| Leaflet 1.9.4 CSS/JS | `unpkg.com` | Browser map and marker rendering | Browser GET requests |
| Carto basemap | `*.basemaps.cartocdn.com` | Light and dark map tiles | Browser GET requests as tiles are viewed |
| Google Fonts Material Symbols | `fonts.googleapis.com` | Icon font | Browser GET request for stylesheet and related font assets |
| Plausible script | `plausible.io` | Analytics script for the configured domain | Browser GET for script; subsequent analytics behavior is outside repository evidence |
| Discord/GitHub profile links | `discord.com`, `github.com` | User-invoked contact/navigation links | Browser requests only after a user follows a link |
| Email link | `mailto:massiv4515@gmail.com` | User-invoked contact action | Delegated to the local mail handler, not an application request |
| Discord webhook | `DISCORD_WEBHOOK_URL` environment variable | Entry/exit notification delivery | Server-side POST with a 5-second timeout when a state transition occurs |

No database driver, cloud SDK, authentication provider, cookie library, or server-side session store appears in the repository. The notification executor is an in-process thread pool rather than a durable message queue.

## 8. Network-flow diagram

```text
[User browser]
  |
  | GET /
  v
[Flask application]
  |
  | HTML response containing embedded CSS/JavaScript
  v
[Browser runtime]
  |       |             |                 |
  |       |             |                 +--> GET plausible.io analytics script
  |       |             +--------------------> GET fonts.googleapis.com stylesheet/font assets
  |       +----------------------------------> GET unpkg.com Leaflet CSS/JS
  +------------------------------------------> GET Carto light/dark map tiles
  |
  | every 2 seconds: GET /api/map, cache disabled
  v
[Flask proxy route]
  |
  | POST https://mps.geo-fs.com/map
  | empty form body, 3-second Requests timeout
  v
[GeoFS public map endpoint]
  |
  | JSON response or request failure
  v
[Flask monitoring step]
  |
  | Validate coordinates and stable ID; compare process-local zone state
  | On entry/exit: asynchronous POST to DISCORD_WEBHOOK_URL
  | 5-second webhook timeout; INFO/WARNING result logging
  v
[Flask proxy response]
  |
  | success: forwarded body as application/json
  | failure: HTTP 502 with serialized exception text
  v
[Browser validation/filtering/interpolation]
  |
  +--> Leaflet markers, callsign labels, popups, counters
  +--> localStorage: theme and callsign tags
  +--> console.error on fetch failure

[User click] --> Discord/GitHub navigation or mail handler (only when activated)
```

The Discord webhook request is server-side and only occurs when a tracked aircraft changes zone state. The milestone payload remains documentation output and is not sent by the application.

## 9. Trust-boundary analysis

### Boundary A: client to Flask

The browser is an untrusted client. The application exposes `GET /` and `GET /api/map`; neither route requires authentication. The `/api/map` route has no user-controlled query or body input, but any reachable client can trigger upstream requests through it.

### Boundary B: Flask to GeoFS

The Flask process trusts the response from the fixed HTTPS GeoFS endpoint enough to forward it and inspect it. It validates JSON shape and coordinate fields for monitoring, while additional schema validation is performed in the browser. Upstream content therefore crosses into both the Discord message path and browser DOM construction and should be treated as untrusted data.

### Boundary C: Flask to Discord

The optional webhook URL is a server configuration secret. The Flask process sends event content derived from public feed fields to Discord asynchronously. The webhook response is not returned to the browser, and failed delivery is logged without blocking the map response.

### Boundary D: browser to third-party services

The browser loads executable JavaScript from `unpkg.com`, styles/fonts from Google, map tiles from Carto, and analytics code from Plausible. These third parties are outside the repository's control. Their availability and content can affect page behavior, rendering, or privacy characteristics.

### Boundary E: user input to DOM

User-entered filter tags are stored locally and later inserted through `innerHTML`. Upstream callsigns are also inserted into label and popup HTML. Both paths cross from data into markup without repository-visible HTML escaping.

## 10. Security observations

### Input validation

- Server-side route methods are constrained to `GET`.
- The upstream request has a fixed URL and empty body.
- Monitoring records receive type and range checks for coordinates, array shape, and stable identifier presence; browser rendering additionally checks callsign presence.
- Altitude, speed, heading, IDs, and aircraft IDs are not comprehensively type-validated before display or state updates.
- `PORT` is converted directly with `int(...)`; a non-numeric environment value causes startup failure.
- Filter tags accept arbitrary length/content, duplicates, and markup characters.

### Output encoding

- `textContent` is used for counters and fetch status, which is appropriate for those fields.
- Callsigns and other aircraft fields are interpolated into `popupHTML` and `makeLabel` HTML.
- Filter tags are interpolated into `el.innerHTML`.
- The repository does not show an escaping helper, Content Security Policy, or Trusted Types policy. These are the highest-confidence security-sensitive paths in the code.

### Error handling

- Upstream request exceptions and non-success statuses become HTTP 502 responses.
- The 502 body includes `str(e)`, which may expose transport or upstream details to callers.
- Browser fetch/JSON/processing failures are caught, logged to the browser console, and displayed as `Fetch error`.
- There is no retry backoff; the browser schedules another attempt after every failure.
- There is no explicit server-side handling for malformed upstream JSON before forwarding it.

### Logging and monitoring

- Startup uses `print(...)`; monitoring and webhook delivery use the standard Python logger.
- Client failures use `console.error(...)`.
- No structured server logs, request correlation IDs, metrics, audit trail, health endpoint, or durable alert queue is present.

### Rate limiting and resource controls

- No application rate limiter is present.
- Each browser tab polls every 2 seconds and can induce one upstream request per interval.
- Each request has a 3-second upstream timeout, but there is no client/server concurrency cap or circuit breaker.
- Browser-side stale cleanup limits the displayed `AC` state to recently observed aircraft, but does not limit inbound request volume.

## 11. Client-side storage inventory

| Storage mechanism | Observed usage | Stored data | Scope and retention |
| --- | --- | --- | --- |
| `localStorage` | Yes | `geofs_radar_tags`: JSON array of filter strings | Persistent per browser origin until reset or manual clearing |
| `localStorage` | Yes | `theme`: `"dark"` or `"light"` | Persistent per browser origin until manual clearing |
| `sessionStorage` | No evidence | None observed | Not used |
| Cookies | No application code evidence | None set/read by this code | Third-party behavior is not inferable from repository code |
| IndexedDB | No evidence | None observed | Not used |

Aircraft state, popup locks, and current map data are held only in JavaScript memory and disappear on page reload. The application does not send the stored filter tags or theme to the Flask server in the observed code.

## 12. Threat-model summary

| Asset / property | Threat | Impact | Evidence-based assessment |
| --- | --- | --- | --- |
| Confidentiality of user/browser context | Third-party analytics, fonts, tiles, and CDN requests observe request metadata; displayed callsigns and IDs are visible in the page | Medium | External resources are embedded; exact third-party collection is outside repository evidence |
| Confidentiality of aircraft information | Public aircraft records are forwarded to every requesting client | Low to medium | No access control is implemented; the README describes live public radar data |
| Integrity of the UI | Unescaped filter or upstream aircraft values can become markup/script in the browser | High | Multiple dynamic values reach `innerHTML` |
| Integrity of configuration | Local users can modify `localStorage` and filters | Low | These settings are intentionally client-local and are not trusted by the backend |
| Availability of the proxy/upstream | Unauthenticated clients can generate repeated polling requests; no rate limit or circuit breaker exists | High | `/api/map` triggers an upstream request per call and browser polling is fixed at 2 seconds |
| Availability of the UI | CDN, tile, font, analytics, or GeoFS outages degrade portions of the page | Medium | Several rendering/runtime resources are external |
| Accountability | Errors and requests lack structured server telemetry | Medium | Only startup print and browser console logging are present |

This summary is a defensive review of observable code paths. It does not attempt to access protected resources or exploit any behavior.

## 13. Recommended improvements, prioritized

| Priority | Recommendation | Impact | Complexity |
| --- | --- | --- | --- |
| P0 | Replace dynamic `innerHTML` for callsigns, filter tags, and popup fields with DOM text nodes or a well-tested HTML escaping function; validate expected types before display | High integrity/security | Low to medium |
| P0 | Add a restrictive Content Security Policy and related security headers at the Flask/reverse-proxy layer, then explicitly allow only required external origins | High integrity/security | Medium |
| P1 | Add per-client/IP rate limiting, upstream concurrency limits, and a circuit breaker/backoff for `/api/map` | High availability | Medium |
| P1 | Stop returning raw exception strings to clients; return a stable public error message and log the detailed exception server-side | Medium confidentiality, medium integrity | Low |
| P1 | Pin or self-host critical Leaflet assets and define integrity/version policy for third-party resources | Medium integrity and availability | Medium |
| P1 | Add structured logs, request IDs, latency/error metrics, and a health/readiness endpoint | Medium availability and accountability | Medium |
| P2 | Validate `PORT` with a clear startup error and make timeout/poll/stale settings configurable with bounds | Medium operability | Low |
| P2 | Add tests for proxy failures, malformed records, DOM-safe rendering, filtering, persistence, and stale cleanup | Medium regression resistance | Medium |
| P2 | Publish a Belgium/EU privacy notice covering analytics, third-party resource requests, public user identifiers, retention, and operational roles | Medium confidentiality/compliance | Low to medium |
| P3 | Add graceful handling for unsupported aircraft IDs and distinguish empty data from stale data in the UI | Low user experience | Low |

## 14. Discord milestone update

```json
{
  "content": "Analysis milestone: Completed the dependency, network-flow, data-flow, trust-boundary, storage, validation, error-handling, logging, rate-limit, and CIA threat-model review for GeoFS Live Radar. The app has a server-side HTTPS POST to the public GeoFS map API, optional asynchronous Discord webhook POSTs on aircraft zone transitions, and browser requests to Leaflet/CDN, Google Fonts, Carto tiles, and Plausible analytics. Storage is limited to localStorage keys geofs_radar_tags and theme, with no cookies, sessionStorage, IndexedDB, database, or authentication. Highest-impact findings are unescaped dynamic HTML, unauthenticated upstream-triggering polling with no rate limit or circuit breaker, raw proxy exception text, and reliance on third-party runtime assets. Recommended priorities: safe DOM rendering and CSP, rate limiting/backoff, generic client errors with structured server logs, dependency controls, and Belgium/EU privacy documentation."
}
```

## 15. Belgium monitoring and Discord workflow

The Flask proxy inspects each successful GeoFS JSON response before forwarding the unchanged response body to the browser. For every dictionary in `users`, it validates the coordinate array, numeric latitude/longitude, finite values, and global coordinate ranges. It then uses `id`, or `acid` when `id` is absent, as the monitoring key. Records without either stable identifier are not eligible for transition alerts because they cannot be reliably tracked across polls.

The configurable Belgium bounding box is inclusive:

```text
min_latitude: 49.4
max_latitude: 51.6
min_longitude: 2.5
max_longitude: 6.4
```

The detector records the last inside/outside state for each stable aircraft ID. It sends an entry alert when an ID is first observed inside the zone, an exit alert when a previously-inside ID is observed outside, and no alert while its state is unchanged. An aircraft disappearing from a feed is not classified as exited because absence does not provide an observed position outside the box. State is process-local and is lost on restart; deployments with multiple worker processes can maintain separate state per worker.

Discord delivery is optional and enabled by setting `DISCORD_WEBHOOK_URL`. The server creates a plain-text `content` message containing callsign/username, aircraft type or ID, latitude, longitude, altitude in feet when available, and a UTC ISO-8601 timestamp. Delivery uses a separate two-worker executor and a 5-second HTTP timeout, so a slow or unavailable webhook does not block proxy response handling. Successes are logged at INFO and request failures at WARNING.

### Configuration example

PowerShell:

```powershell
$env:PORT = "5000"
$env:DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/<id>/<token>"
python .\geofs_live_radar.py
```

The geographic values are currently constants in the server configuration section so they can be changed without touching detection logic. The webhook URL is intentionally supplied through an environment variable rather than embedded in source code. Do not commit a real webhook URL.

### Monitoring data flow

```text
[GeoFS response: users[]]
          |
          v
[Validate coordinates and stable id/acid]
          |
          v
[Compare with process-local aircraft_zone_state]
       |                  |
       | no transition    | entry/exit transition
       |                  v
       |        [Queue Discord content on worker pool]
       |                  |
       |                  v
       |        [POST webhook, 5-second timeout]
       |                  |
       |        [Log success or failure]
       v
[Forward original GeoFS response]
          |
          v
[Existing browser polling, filtering, animation, and map rendering]
```

### Operational considerations

- Keep the webhook URL secret. Anyone with it can post to the configured Discord destination.
- The detector examines all valid feed records before the browser's callsign filters, so a filtered-out aircraft can still generate a zone alert.
- State transitions are in memory only. Restarting the process forgets previous states and can produce a new entry alert for an aircraft currently inside the zone.
- With multiple Gunicorn workers, each worker has independent state and can potentially emit duplicate transitions. A single worker or shared state store would be required for deployment-wide exactly-once behavior.
- Webhook failures are logged but not retried. This prevents delayed duplicate alerts, but an outage can lose a transition notification.
- The alert timestamp is generated when the transition is detected and is expressed in UTC, avoiding ambiguity between Belgian CET and CEST.

### Example Discord content

```json
{
  "content": "GeoFS aircraft entered Belgium monitoring zone\nCallsign/username: SAMPLE123\nAircraft type: 7\nLatitude: 50.8503\nLongitude: 4.3517\nAltitude: 12000 ft\nTimestamp: 2026-09-23T12:00:00Z"
}
```

### Testing recommendations

- Unit-test the inclusive boundary checks at all four edges and just outside each edge.
- Feed two consecutive inside records for one ID and verify only one entry notification is queued.
- Feed inside, outside, inside for one ID and verify exactly entry, exit, entry transitions.
- Verify records with missing IDs, malformed coordinates, NaN/infinite values, and non-dictionary entries are ignored safely.
- Mock the Discord request to cover 2xx success, timeout, connection failure, and non-2xx responses without delaying the proxy response.
- Verify callsign filtering does not prevent monitoring alerts for valid aircraft.
- Verify a missing `DISCORD_WEBHOOK_URL` disables delivery without affecting map proxying.
- Test one-worker and multi-worker deployment behavior explicitly if exact notification uniqueness is required.

## 16. Discord bot architecture

`discord_bot.py` contains the Discord command and delivery layer. It uses `discord.py`, reads `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID` from the environment, and never embeds credentials in source. The bot runs in a daemon thread with Discord's reconnecting client runner, while command callbacks and channel sends remain asynchronous on the bot event loop.

The Flask monitoring layer remains the owner of GeoFS polling, Belgium bounding-box evaluation, transition de-duplication, latest aircraft records, and daily counters. It passes read-only snapshot callbacks into `DiscordBotService`; the bot does not contact GeoFS directly. Entry and exit events are queued to the bot and rendered as embeds. If Discord is unavailable, monitoring and the browser map continue independently and the failure is logged.

### Bot commands

| Command | Behavior |
| --- | --- |
| `!status` | Reports active status and the number of tracked aircraft |
| `!belgium` | Lists aircraft whose latest observed position is inside the Belgium zone, up to 25 fields |
| `!aircraft <id>` | Shows the latest known position, altitude, callsign, type, and event/state data |
| `!stats` | Reports unique aircraft seen today, entries, exits, and currently-inside count |
| `!help` | Lists the available commands |

Commands are accepted only in the configured channel. The bot enables Discord Message Content Intent because prefix commands require message content access. Discord permissions must be configured outside this repository.

### Bot environment variables

```text
DISCORD_BOT_TOKEN=replace-with-secret-token
DISCORD_CHANNEL_ID=replace-with-numeric-channel-id
```

Existing `DISCORD_WEBHOOK_URL` remains supported as a fallback for automatic alerts when the bot is disabled. When the bot is enabled, the fallback webhook is skipped to avoid duplicate messages. The Belgium zone remains configured in `BELGIUM_ZONE` and is shared by alerts and commands.

### Deployment

Install dependencies and run the single-process entry point:

```powershell
pip install -r requirements.txt
$env:DISCORD_BOT_TOKEN = "<secret>"
$env:DISCORD_CHANNEL_ID = "<channel-id>"
python .\geofs_live_radar.py
```

The bot thread is started only by `python geofs_live_radar.py`. A deployment that starts Flask exclusively through Gunicorn needs a separate bot process/launcher or an explicit application startup strategy. Multiple Flask workers create separate in-memory monitoring states and can duplicate transitions; use one worker when exact notification uniqueness is required.

### Example bot message

Automatic alert embeds use the title `GeoFS Belgium Monitor` and fields such as:

```text
Event Type: entered
Callsign: SAMPLE123
Aircraft Type: 7
Latitude: 50.8503
Longitude: 4.3517
Altitude: 12000 ft
Timestamp: 2026-09-23T12:00:00Z
```

## 17. Validation and test mode

`python-dotenv` loads `.env` from the application directory or its parent directory. Configuration diagnostics log only `found`, `missing`, or `missing_or_invalid` states. `validate_discord.py` is an offline, fail-closed check: it validates required values, requires `TEST_MODE=true`, simulates one aircraft at Brussels-area coordinates, and generates the fields for an entry embed without making Discord or GeoFS requests.

When `TEST_MODE=true`, the Flask `/api/map` route returns a synthetic aircraft response and the monitoring layer processes it normally. Discord login, startup messages, bot event sends, and legacy webhook sends are suppressed. This permits testing the detector without modifying GeoFS or sending channel messages.

When `TEST_MODE=false`, startup first rejects missing or placeholder credentials, invalid channel IDs, malformed webhook URLs, and failed non-posting webhook reachability checks. A successful Discord connection logs the bot username, bot ID, guild count, resolved channel ID, and required permission status, then sends exactly one startup embed with `GeoFS Belgium Monitor is online.`. Missing tokens, invalid channel IDs, missing channel access, insufficient send permissions, and Discord API errors are logged without exposing secrets.

### Validation result for the supplied environment

The supplied environment could not pass live validation: the channel ID contains a non-numeric character, and the bot token was exposed in the working context. Revoke that token in Discord, create a replacement, set a valid numeric channel ID, and keep the replacement out of source control. No live Discord or GeoFS request was made during this validation pass.

## 18. Aircraft model and nearest-base context

Monitored aircraft records include a human-readable aircraft model and the nearest configured Belgian air base. Model names use feed-provided text when available, otherwise the server's known GeoFS aircraft-ID map; for example, aircraft ID 7 resolves to `F-16 Fighting Falcon`. The nearest base is selected locally from `BELGIAN_AIR_BASES` using a haversine great-circle distance calculation. No external geocoding or aircraft lookup service is contacted. Discord embeds and fallback alerts include the base name, approximate distance in kilometres, a standard `https://www.geo-fs.com/geofs.php?...` launch link, and a `flyto://latitude,longitude,0,0` deep link.

## 19. Scramble alert system

Scramble monitoring is persisted in `scramble_config.json`:

```json
{
  "enabled": false,
  "tags": []
}
```

The server loads this file at startup and writes it atomically when staff change settings. Callsigns are checked case-insensitively for every valid aircraft record before the browser's callsign filter is applied. A matching stable aircraft ID triggers at most one alert while that ID remains in the latest valid feed snapshot. Its alert state is cleared when the ID disappears, allowing a later appearance to trigger a new alert.

Scramble alerts are red Discord embeds titled `SCRAMBLE ALERT`, mention role `1552339958021226607`, and include the callsign, aircraft ID, resolved aircraft type, coordinates, altitude, matched tag, UTC detection time, and nearest-base links. Role mentions are explicitly enabled only for that configured role.

Commands are restricted to the configured Discord channel. `!tag add [TAG]`, `!tag remove [TAG]`, `!tag clear`, `!scramble on`, and `!scramble off` require Manage Guild or Administrator. `!tag list` and `!scramble status` are available to everyone in the channel. Startup logs scramble state, configured tag count, and role ID without secrets.

## 20. GeoFS chat logger

Chat logging is persisted in `chat_logger_config.json`:

```json
{
  "enabled": true,
  "log_channel_id": 1497398101667745942,
  "filters": []
}
```

The server inspects only chat-like lists explicitly present in the GeoFS response under `chat`, `messages`, or `chatMessages`; nested `chat.messages` is also supported. It extracts username, content, timestamp, and server/room fields when available. A stable message ID is preferred for de-duplication; otherwise a username/content/timestamp fingerprint is used. The parser does not invent messages or contact another service.

Chat log embeds are blue and titled `GeoFS Chat Log`, and are sent asynchronously to channel `1497398101667745942`. Matching configured filters generate a separate keyword notice embed. Discord outages are logged through the bot's asynchronous failure callback and do not stop GeoFS polling. The in-memory duplicate set is bounded to 10,000 IDs and daily processed count is process-local.

Commands are restricted to the configured command channel. `!chatlog on` and `!chatlog off` require Manage Guild or Administrator; `!chatlog status` is public. `!chatfilter add <word>` and `!chatfilter remove <word>` require Manage Guild or Administrator; `!chatfilter list` is public. Startup reports logger state, log channel, and filter count without secrets.

### BAF preset

The staff-only commands `!tag addbaf` and `!tag removebaf` manage the persisted `[BAF]` tag without requiring manual configuration. Matching remains case-insensitive and uses the existing one-alert-per-aircraft-session behavior. `!scramble status` and the startup report show `BAF Monitoring: ENABLED` when `[BAF]` is present, otherwise `DISABLED`.

When `[BAF]` matches a callsign, the alert mentions role `1552339958021226607` and uses the red embed title `✈️ BAF Aircraft Detected`. It includes the same aircraft identity, position, altitude, UTC detection time, and nearest-base context as other scramble alerts.