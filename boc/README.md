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
- Dark/light mode, draggable and resizable window, minimize/restore control
- LocalStorage configuration; no credentials or tokens are stored by BOC
- Admin/server moderation is intentionally not implemented client-side. Local mute, watch, export, and review tools do not affect other pilots.

## Installation

1. Install Tampermonkey or a compatible User.js manager.
2. Open `boc.user.js` in the manager and install it.
3. Open GeoFS on `geo-fs.com` or `www.geo-fs.com`.
4. BOC appears in the upper-left area of the flight view. Drag or resize it as needed.
5. Use **Settings** to configure tags, local logging, filters, and optional relays.

The script matches only GeoFS pages. It does not require an account, API token, or server-side credential.

## Relay configuration

BOC is configured to relay activity to the BATS server endpoint, which delivers through the server-side Discord bot to channel `1497398101667745942`. The Discord token stays on the server and is never placed in the userscript or browser storage. BOC sends only to endpoints explicitly stored in `localStorage` and only accepts HTTPS URLs. Additional approved endpoints can be added from the browser console with:

```js
const config = JSON.parse(localStorage.getItem('boc.config.v1'));
config.relayEndpoints.push({ name: 'Approved BAF relay', url: 'https://relay.example.invalid/events', enabled: true });
config.relayEnabled = true;
localStorage.setItem('boc.config.v1', JSON.stringify(config));
```

Use an approved service that accepts the documented payload shape. BOC fails closed when an endpoint is unavailable and keeps the message in the local activity log. The server returns `503` until its Discord bot is logged in and ready.

## Data and privacy

BOC processes only data exposed to the logged-in GeoFS client. It stores messages and configuration in browser `localStorage` under `boc.activity.v1` and `boc.config.v1`. Clear those keys to remove local data. Do not put Discord, Padlet, or other service tokens in the userscript or browser storage.

## Testing

The smoke test checks syntax and the core message/tag/pilot behavior without opening GeoFS or sending network traffic:

```powershell
node --check .\boc\boc.user.js
node .\boc\test_boc.js
```

The browser-side adapters should then be tested in a GeoFS session by confirming that incoming chat appears in **Chat Monitor**, tagged messages appear in **Alert Console**, a `[BAF]` user appears in **Active BAF Pilots**, callsigns match visible `multiplayer.users` records when available, and **Export log** downloads JSON. BOC does not embed the external iframe used by older chat snippets; it keeps the panel and relay in the current GeoFS client.

The browser console also exposes the compatibility API:

```js
GeoFSChatLogger.getLogs();
GeoFSChatLogger.export();
GeoFSChatLogger.clear();
GeoFSChatLogger.scan();
```

## Limitations

GeoFS response shapes can change. BOC supports common `chat`, `messages`, `chatMessages`, and `chatLog` payload keys plus a conservative DOM fallback. It does not scrape private data, bypass permissions, moderate server-side chat, or claim delivery when a relay request fails.
