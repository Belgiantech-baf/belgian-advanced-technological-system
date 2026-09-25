# BOC (BAF Operations Client)

**Operational awareness and communications for BAF personnel directly inside GeoFS.**

BOC is a Tampermonkey/User.js add-on for the GeoFS browser session. It provides a local BAF operations overlay without requiring pilots to leave the active flight.

## Included capabilities

- GeoFS chat capture through JSON `fetch`/XHR responses plus the authenticated GeoFS chat DOM (`.geofs-chat-messages.geofs-authenticated`)
- Structured multiplayer capture from `multiplayer.lastRequest.chatMessages`, including callsign, message, GeoFS user ID, and aircraft ID
- Search-ready local session history and JSON export
- Green, blue, yellow, orange, and red message categories based on configurable tags
- Local BAF channel for notices, flight announcements, patrol coordination, and mission updates
- Active BAF pilot tracking from chat and visible aircraft payloads
- Local alerts, keyword highlighting, mute filters, watchlist-ready activity history, and event logging
- Explicitly configured HTTPS relay endpoint for the BATS Discord log channel
- Dark/light mode, compact layout, top-right draggable overlay, minimize control, hotkeys, and persisted geometry
- Native `.geofs-ui-bottom` toolbar button inserted between Camera and Options, with mobile overflow fallback
- Readiness-gated startup: waits up to 30 seconds for page-world `geofs` and `ui`, then detects optional `multiplayer`, `flight`, and `weather` globals
- Six startup stages with `[BOC]` logging, guarded recovery, diagnostics indicators, and automatic toolbar reattachment after GeoFS UI rebuilds
- LocalStorage configuration; no credentials or tokens are stored by BOC
- Admin/server moderation is intentionally not implemented client-side. Local mute, watch, export, and review tools do not affect other pilots.

## Installation

1. Install Tampermonkey or a compatible User.js manager.
2. Open `boc.user.js` in the manager and install it.
3. Open GeoFS on `geo-fs.com` or `www.geo-fs.com`.
4. BOC appears in the GeoFS rail and opens a top-right overlay. Use `Ctrl+Shift+B` for BOC, `Ctrl+Shift+C` for Chat Monitor, `Ctrl+Shift+O` for Operations, and `Ctrl+Shift+A` for Alerts.
5. Use **Settings** to configure tags, local logging, filters, and optional relays.

The script matches only GeoFS pages. It does not require an account, API token, or server-side credential.

## Relay configuration

BOC is configured to relay activity to the BATS server endpoint, which delivers through the server-side Discord bot to channel `1497398101667745942`. The Discord token stays on the server and is never placed in the userscript or browser storage. BOC sends only to endpoints explicitly stored in `localStorage` and only accepts HTTPS URLs. Additional approved endpoints can be added from the browser console with:

```js
const config = JSON.parse(localStorage.getItem('BOC_SETTINGS'));
config.relayEndpoints.push({ name: 'Approved BAF relay', url: 'https://relay.example.invalid/events', enabled: true });
config.relayEnabled = true;
localStorage.setItem('BOC_SETTINGS', JSON.stringify(config));
```

Use an approved service that accepts the documented payload shape. BOC fails closed when an endpoint is unavailable and keeps the message in the local activity log. The server returns `503` until its Discord bot is logged in and ready.

## Data and privacy

BOC processes only data exposed to the logged-in GeoFS client. It stores messages and configuration in browser `localStorage` under `boc.activity.v2` and `BOC_SETTINGS`. Clear those keys to remove local data. Do not put Discord, Padlet, or other service tokens in the userscript or browser storage.

The toolbar integration retries every two seconds while GeoFS is still building its UI and logs `[BOC] waiting for toolbar...` until `.geofs-ui-bottom` is available. Panel position, dimensions, theme, filters, alert settings, and the selected tab are restored from `BOC_SETTINGS`.

BOC does not touch GeoFS globals during initial script evaluation. It waits for `geofs` and `ui` in the page world using `unsafeWindow`, then initializes toolbar injection, multiplayer detection, chat monitoring, overlay creation, and event hooks in order. Missing optional globals are treated as unavailable status rather than startup errors.

BOC is passive: it reads GeoFS state and chat data for display, logging, filtering, and local notifications. It does not override GeoFS functions, modify flight or multiplayer behavior, replace handlers, alter preferences, or intercept/block simulator traffic. The only page-world export is `window.BOC`, which exposes the isolated module APIs and diagnostics.

## Testing

The smoke test checks syntax and the core message/tag/pilot behavior without opening GeoFS or sending network traffic:

```powershell
node --check .\boc\boc.user.js
node .\boc\test_boc.js
```

The browser-side adapters should then be tested in a GeoFS session by confirming that incoming chat appears in **Chat Monitor**, tagged messages appear in **Alert Console**, a `[BAF]` user appears in **Active BAF Pilots**, callsigns match visible `multiplayer.users` records when available, and **Export log** downloads JSON. BOC does not embed the external iframe used by older chat snippets; it keeps the panel and relay in the current GeoFS client.

The browser console exposes the isolated BOC API:

```js
BOC.Chat.getMessages();
BOC.Logging.getLogs();
BOC.Logging.clear();
BOC.Diagnostics.get();
BOC.waitForGeoFS();
```

## Limitations

GeoFS response shapes can change. BOC supports common `chat`, `messages`, `chatMessages`, and `chatLog` payload keys plus a conservative DOM fallback. It does not scrape private data, bypass permissions, moderate server-side chat, or claim delivery when a relay request fails.
